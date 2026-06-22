/**
 * RelayClient -- HTTP long-polling client connecting to the remote Vault Operator Relay.
 *
 * Uses Obsidian's requestUrl (not WebSocket) to communicate with the relay.
 * This works within Obsidian's renderer CSP which blocks WebSocket to external servers.
 *
 * Flow:
 * 1. Poll POST /poll with Authorization: Bearer header
 * 2. Receive pending MCP requests from AI assistants
 * 3. Process each request via handleToolCall()
 * 4. Send results back via POST /respond with Authorization: Bearer header
 * 5. Repeat
 *
 * Security (AUDIT-005):
 * - Token sent via Authorization header, never in URL (H-4)
 * - No token material in logs (H-2, H-3)
 * - Runtime validation of relay responses (M-1)
 * - URL validation: HTTPS enforced (M-3)
 * - Error messages sanitized before sending to relay (L-1)
 *
 * ADR-055: Remote MCP Relay
 * FEATURE-1403: Remote Transport
 */

import { Notice, requestUrl } from 'obsidian';
import type ObsidianAgentPlugin from '../main';
import { handleToolCall } from './tools/index';

// FIX-14-03-01: 10s default. Workers Free Plan has 100k requests/day per
// account. At 2s the plugin alone burns 43.200/day per open Obsidian instance,
// independent of actual MCP usage. 10s drops that to ~8.640/day, leaving
// headroom for external clients and multi-device setups.
const POLL_INTERVAL_MS = 10_000;
const INITIAL_RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

// FIX-14-03-02: Diagnostic notice after this many consecutive poll failures.
// Plugin reload would reset the counter; the goal is to surface persistent
// outages (Worker quota, expired token, network) without spamming every retry.
const POLL_FAILURE_NOTICE_THRESHOLD = 3;
const ERROR_BODY_MAX_CHARS = 200;

/**
 * FIX-14-03-02: Build a one-line diagnostic from a thrown requestUrl error.
 * Obsidian's requestUrl rejects with `{ status, headers, text? }`-shaped
 * objects on non-2xx responses, but network failures throw plain Errors.
 * We extract status and a short body slice, then run the result through
 * redactToken() so AUDIT-005 H-2/H-3 (no token material in logs) holds.
 */
export function describeRequestError(err: unknown, token: string): string {
    const e = err as { status?: number; text?: string; message?: string; name?: string };
    const status = typeof e?.status === 'number' ? `HTTP ${e.status}` : null;
    const body = typeof e?.text === 'string' ? e.text : (e?.message ?? '');
    const trimmed = body.length > ERROR_BODY_MAX_CHARS
        ? `${body.slice(0, ERROR_BODY_MAX_CHARS)}...`
        : body;
    const sanitized = redactToken(trimmed.replace(/\s+/g, ' ').trim(), token);
    if (status && sanitized) return `${status}: ${sanitized}`;
    if (status) return status;
    if (sanitized) return sanitized;
    return e?.name ?? 'unknown error';
}

export function redactToken(text: string, token: string): string {
    if (!text) return text;
    let out = text;
    if (token && token.length > 0) {
        out = out.split(token).join('<redacted>');
    }
    // Generic Bearer header pattern, in case some other path leaked the token.
    return out.replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer <redacted>');
}

/**
 * FIX-23-09-03: shared JSON-RPC dispatch for the relay path.
 *
 * Routes the small set of MCP methods the relay needs to forward to the
 * Vault Operator backend. Extracted so RelayClient.handleRequest stays a
 * thin IO wrapper and the routing is unit-testable without spinning up
 * the polling loop. Unknown methods return an empty object, matching the
 * prior behaviour.
 */
export async function dispatchRelayMethod(
    plugin: ObsidianAgentPlugin,
    method: string,
    params: Record<string, unknown> | undefined,
): Promise<unknown> {
    const bridge = plugin.mcpBridge as unknown as {
        buildInitializeResponse?: (requested?: string) => unknown;
        getToolsWithContext?: () => unknown[];
        buildResourceList?: () => unknown[];
        listPrompts?: () => unknown;
        getPrompt?: (name: string | undefined) => unknown;
    } | undefined;

    if (method === 'initialize') {
        const requested = typeof (params as { protocolVersion?: unknown } | undefined)?.protocolVersion === 'string'
            ? (params as { protocolVersion: string }).protocolVersion
            : undefined;
        return bridge?.buildInitializeResponse?.(requested) ?? {
            protocolVersion: '2025-03-26',
            capabilities: { tools: {}, prompts: {}, resources: {} },
            serverInfo: { name: 'Vault Operator', version: '1.0.0' },
        };
    }
    if (method === 'tools/list') {
        return { tools: bridge?.getToolsWithContext?.() ?? [] };
    }
    if (method === 'tools/call') {
        const p = params as { name?: unknown; arguments?: Record<string, unknown> } | undefined;
        if (p && typeof p.name === 'string') {
            const toolResult = await handleToolCall(plugin, p.name, p.arguments ?? {});
            return { content: toolResult.content, isError: toolResult.isError };
        }
        return { content: [{ type: 'text', text: 'Missing tool name' }], isError: true };
    }
    if (method === 'resources/list') {
        return { resources: bridge?.buildResourceList?.() ?? [] };
    }
    if (method === 'prompts/list') {
        return bridge?.listPrompts?.() ?? {};
    }
    if (method === 'prompts/get') {
        if (!bridge?.getPrompt) return {};
        const rawName = (params as { name?: unknown } | undefined)?.name;
        const name = typeof rawName === 'string' ? rawName : undefined;
        return await bridge.getPrompt(name);
    }
    return {};
}

export class RelayClient {
    private polling = false;
    private _connected = false;
    private _connecting = false;
    private shouldReconnect = true;
    private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    private maxReconnectDelay = MAX_RECONNECT_DELAY_MS;
    private relayUrl = '';
    private token = '';
    private consecutivePollFailures = 0;
    private noticeShownForCurrentOutage = false;

    constructor(private plugin: ObsidianAgentPlugin) {}

    get connected(): boolean { return this._connected; }
    get connecting(): boolean { return this._connecting; }

    connect(relayUrl: string, token: string): void {
        const cleanUrl = relayUrl.replace(/\/$/, '');

        // M-3: Validate relay URL
        if (!cleanUrl.startsWith('https://')) {
            console.error('[RelayClient] Relay URL must use HTTPS');
            return;
        }

        this.relayUrl = cleanUrl;
        this.token = token;
        this.shouldReconnect = true;
        this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        this.startPolling();
    }

    disconnect(): void {
        this.shouldReconnect = false;
        this.polling = false;
        this._connected = false;
        this._connecting = false;
    }

    private startPolling(): void {
        if (this.polling) return;
        this.polling = true;
        this._connecting = true;
        void this.pollLoop();
    }

    private async pollLoop(): Promise<void> {
        while (this.polling && this.shouldReconnect) {
            try {
                // H-4: Token in Authorization header, not URL
                const response = await requestUrl({
                    url: `${this.relayUrl}/poll`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${this.token}` },
                });

                // First successful poll means we're connected
                if (!this._connected) {
                    this._connected = true;
                    this._connecting = false;
                    this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
                    console.debug('[RelayClient] Connected to relay');
                }
                this.consecutivePollFailures = 0;
                this.noticeShownForCurrentOutage = false;

                // M-1: Runtime validation of relay response
                const data = response.json as { requests?: unknown[] };
                if (data.requests && Array.isArray(data.requests) && data.requests.length > 0) {
                    for (const reqBody of data.requests) {
                        if (typeof reqBody === 'string') {
                            void this.handleRequest(reqBody);
                        }
                    }
                }

                // Short-poll interval: see POLL_INTERVAL_MS (FIX-14-03-01)
                await new Promise(resolve => window.setTimeout(resolve, POLL_INTERVAL_MS));
            } catch (err) {
                if (!this.shouldReconnect) break;

                this._connected = false;
                this._connecting = true;
                this.consecutivePollFailures += 1;

                // FIX-14-03-02: Log status + sanitized body so an outage is
                // diagnosable without devtools. H-2 / H-3 (AUDIT-005) still
                // require zero token material in logs, so the message is
                // run through redactToken() before printing.
                const detail = describeRequestError(err, this.token);
                console.warn(
                    `[RelayClient] Poll failed (${detail}), retrying in ${this.reconnectDelay} ms`,
                );

                if (
                    this.consecutivePollFailures >= POLL_FAILURE_NOTICE_THRESHOLD &&
                    !this.noticeShownForCurrentOutage
                ) {
                    new Notice(
                        `Vault Operator MCP relay nicht erreichbar (${detail}). Details in der Konsole.`,
                        8000,
                    );
                    this.noticeShownForCurrentOutage = true;
                }

                await new Promise(resolve => window.setTimeout(resolve, this.reconnectDelay));
                this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
            }
        }

        this.polling = false;
        this._connected = false;
        this._connecting = false;
    }

    private async handleRequest(reqBody: string): Promise<void> {
        try {
            const request = JSON.parse(reqBody) as {
                jsonrpc?: string;
                method?: string;
                id?: number | string;
                params?: Record<string, unknown>;
                __correlationId?: string;
            };

            // M-1: Validate required fields
            if (typeof request.method !== 'string') return;

            // Notification (no id) -- process but don't respond
            if (request.id === undefined || request.id === null) {
                return;
            }

            // M-7: Use correlation ID for internal routing, keep original ID for response
            const correlationId = request.__correlationId ?? String(request.id);

            const result: unknown = await dispatchRelayMethod(
                this.plugin,
                request.method,
                request.params,
            );

            // Send response back to relay using correlation ID
            const responseBody = { jsonrpc: '2.0', id: correlationId, result };
            await requestUrl({
                url: `${this.relayUrl}/respond`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                body: JSON.stringify(responseBody),
            });
        } catch {
            // L-1: Sanitize error messages -- don't leak internal details
            console.warn('[RelayClient] Error handling request');
            try {
                const parsed = JSON.parse(reqBody) as { id?: unknown; __correlationId?: string };
                if (parsed.id !== undefined && parsed.id !== null) {
                    const rawId = parsed.__correlationId ?? parsed.id;
                    const correlationId = typeof rawId === 'string' ? rawId : JSON.stringify(rawId ?? '');
                    await requestUrl({
                        url: `${this.relayUrl}/respond`,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.token}` },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: correlationId,
                            error: { code: -32603, message: 'Tool execution failed' },
                        }),
                    });
                }
            } catch { /* give up */ }
        }
    }
}
