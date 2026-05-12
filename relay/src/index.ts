/**
 * Vault Operator Relay -- Cloudflare Worker + Durable Object
 *
 * Proxies MCP JSON-RPC requests from AI assistants (claude.ai, ChatGPT, etc.)
 * to a local Vault Operator plugin via WebSocket.
 *
 * Architecture:
 *   MCP Client → HTTPS POST → Worker (auth + route) → Durable Object → WebSocket → Vault Operator Plugin
 *
 * ADR-055: Remote MCP Relay
 * FEATURE-1403: Remote Transport
 */

export interface Env {
    RELAY_DO: DurableObjectNamespace;
    RELAY_TOKEN: string;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        // CORS
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                },
            });
        }

        // Auth check (skip for health endpoint)
        const url = new URL(request.url);
        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', relay: 'obsilo' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token || token !== env.RELAY_TOKEN) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Route to Durable Object
        const id = env.RELAY_DO.idFromName('default');
        const relay = env.RELAY_DO.get(id);

        // Forward the request with CORS headers on response
        const response = await relay.fetch(request);
        const newResponse = new Response(response.body, response);
        newResponse.headers.set('Access-Control-Allow-Origin', '*');
        return newResponse;
    },
};

// ---------------------------------------------------------------------------
// Durable Object: Manages WebSocket to plugin + HTTP proxy
// ---------------------------------------------------------------------------

interface PendingRequest {
    resolve: (response: string) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export class RelayDO {
    private state: DurableObjectState;
    private pending = new Map<string, PendingRequest>();

    constructor(state: DurableObjectState) {
        this.state = state;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // WebSocket upgrade (plugin connects here)
        if (url.pathname.endsWith('/ws')) {
            const upgradeHeader = request.headers.get('Upgrade');
            if (upgradeHeader !== 'websocket') {
                return new Response('Expected WebSocket', { status: 426 });
            }

            const pair = new WebSocketPair();
            this.state.acceptWebSocket(pair[1]);

            return new Response(null, { status: 101, webSocket: pair[0] });
        }

        // MCP JSON-RPC request (from claude.ai, ChatGPT, etc.)
        if (request.method === 'POST') {
            const websockets = this.state.getWebSockets();
            if (websockets.length === 0) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0',
                    id: null,
                    error: { code: -32603, message: 'Vault Operator plugin not connected. Make sure Obsidian is running with remote access enabled.' },
                }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }

            const body = await request.text();
            const parsed = JSON.parse(body);

            // Notifications (no id) -- fire and forget
            if (parsed.id === undefined || parsed.id === null) {
                websockets[0].send(body);
                return new Response(null, { status: 204 });
            }

            // Request with id -- wait for response
            const correlationId = String(parsed.id);

            const responsePromise = new Promise<string>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.pending.delete(correlationId);
                    reject(new Error('Plugin response timeout (30s)'));
                }, 30000);

                this.pending.set(correlationId, { resolve, reject, timeout });
            });

            // Forward to plugin
            websockets[0].send(body);

            try {
                const response = await responsePromise;
                return new Response(response, { headers: { 'Content-Type': 'application/json' } });
            } catch (e) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.id,
                    error: { code: -32603, message: e instanceof Error ? e.message : 'Timeout' },
                }), { status: 504, headers: { 'Content-Type': 'application/json' } });
            }
        }

        return new Response('Method not allowed', { status: 405 });
    }

    // Hibernation API: called when WebSocket message arrives
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
        const data = typeof message === 'string' ? message : new TextDecoder().decode(message);

        try {
            const parsed = JSON.parse(data);
            const id = String(parsed.id ?? '');

            const pending = this.pending.get(id);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pending.delete(id);
                pending.resolve(data);
            }
        } catch {
            // Invalid JSON -- ignore
        }
    }

    webSocketClose(): void {
        // Plugin disconnected -- reject all pending requests
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('Plugin disconnected'));
            this.pending.delete(id);
        }
    }

    webSocketError(): void {
        this.webSocketClose();
    }
}
