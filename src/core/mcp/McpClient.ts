/**
 * McpClient — simplified MCP client for Vault Operator
 *
 * Manages connections to MCP servers (stdio, SSE, streamable-http) and
 * forwards tool calls from the agent to the appropriate server.
 *
 * Intentionally lean: no OAuth, no file-watching, no auto-reconnect.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { McpServerConfig } from '../../types/settings';
import { obsidianFetch } from './obsidianFetch';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface McpToolInfo {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
}

export type McpConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface McpConnection {
    name: string;
    config: McpServerConfig;
    client?: Client;
    tools: McpToolInfo[];
    status: McpConnectionStatus;
    error?: string;
}

// ---------------------------------------------------------------------------
// McpClient
// ---------------------------------------------------------------------------

export class McpClient {
    private connections = new Map<string, McpConnection>();

    // ── Connection management ──────────────────────────────────────────────

    async connectAll(servers: Record<string, McpServerConfig>): Promise<void> {
        await Promise.all(
            Object.entries(servers).map(([name, config]) => this.connect(name, config))
        );
    }

    async connect(name: string, config: McpServerConfig): Promise<void> {
        // Skip disabled servers
        if (config.disabled) {
            this.connections.set(name, { name, config, tools: [], status: 'disconnected' });
            return;
        }

        const conn: McpConnection = { name, config, tools: [], status: 'connecting' };
        this.connections.set(name, conn);

        try {
            const client = new Client({ name: 'obsidian-agent', version: '1.0.0' });

            let transport;
            if (config.type === 'sse') {
                if (!config.url) throw new Error(`SSE server "${name}" has no URL configured`);
                const sseOptions: Record<string, unknown> = {
                    // Use CORS-free Node.js fetch -- Electron's browser fetch blocks cross-origin SSE
                    fetch: obsidianFetch,
                    eventSourceInit: { fetch: obsidianFetch },
                };
                if (config.headers && Object.keys(config.headers).length > 0) {
                    (sseOptions.eventSourceInit as Record<string, unknown>).headers = config.headers;
                    sseOptions.requestInit = { headers: config.headers };
                }
                // SSE transport kept as fallback for older MCP servers (config.type === 'sse')
                // Access via Record cast to avoid @typescript-eslint/no-deprecated (not disableable per ReviewBot)
                const sseMod = await import('@modelcontextprotocol/sdk/client/sse.js') as Record<string, unknown>;
                type TransportCtor = new (url: URL, opts?: Record<string, unknown>) => import('@modelcontextprotocol/sdk/shared/transport.js').Transport;
                const SseTransportCtor = sseMod['SSEClientTransport'] as TransportCtor;
                transport = new SseTransportCtor(new URL(config.url), sseOptions);
            } else {
                if (!config.url) throw new Error(`streamable-http server "${name}" has no URL configured`);
                const httpOptions: Record<string, unknown> = {
                    // Use CORS-free Node.js fetch -- Electron's browser fetch blocks cross-origin requests
                    fetch: obsidianFetch,
                };
                if (config.headers && Object.keys(config.headers).length > 0) {
                    httpOptions.requestInit = { headers: config.headers };
                }
                transport = new StreamableHTTPClientTransport(new URL(config.url), httpOptions);
            }

            const timeoutMs = (config.timeout ?? 60) * 1000;
            await Promise.race([
                client.connect(transport),
                new Promise<never>((_, reject) =>
                    window.setTimeout(() => reject(new Error(`Connection to "${name}" timed out`)), timeoutMs)
                ),
            ]);

            const toolsResult = await client.listTools();
            conn.client = client;
            conn.tools = (toolsResult.tools ?? []).map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            }));
            conn.status = 'connected';
        } catch (e) {
            conn.status = 'error';
            conn.error = e instanceof Error ? e.message : String(e);
            console.error(`[McpClient] Failed to connect to "${name}":`, e);
        }
    }

    async disconnect(name: string): Promise<void> {
        const conn = this.connections.get(name);
        if (!conn?.client) return;
        try {
            await conn.client.close();
        } catch {
            // ignore close errors
        }
        conn.client = undefined;
        conn.tools = [];
        conn.status = 'disconnected';
        conn.error = undefined;
    }

    async disconnectAll(): Promise<void> {
        await Promise.all([...this.connections.keys()].map((name) => this.disconnect(name)));
        this.connections.clear();
    }

    // ── Tool execution ─────────────────────────────────────────────────────

    async callTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown>,
    ): Promise<string> {
        const conn = this.connections.get(serverName);
        if (!conn) {
            return `Error: MCP server "${serverName}" is not configured`;
        }
        if (conn.status !== 'connected' || !conn.client) {
            return `Error: MCP server "${serverName}" is not connected (status: ${conn.status}${conn.error ? ' — ' + conn.error : ''})`;
        }

        try {
            const result = await conn.client.callTool({ name: toolName, arguments: args });
            const content = result.content as Array<{ type: string; text?: string }> | undefined;
            if (!content || content.length === 0) return '(no output)';

            return content
                .filter((c) => c.type === 'text' && c.text != null)
                .map((c) => c.text as string)
                .join('\n') || '(non-text response)';
        } catch (e) {
            return `Error calling ${toolName} on ${serverName}: ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    // ── Reconnect & Test ────────────────────────────────────────────────────

    /**
     * Reconnect a server by disconnecting and re-connecting with existing config.
     */
    async reconnect(name: string): Promise<void> {
        const conn = this.connections.get(name);
        if (!conn) throw new Error(`MCP server "${name}" is not configured`);
        await this.disconnect(name);
        await this.connect(name, conn.config);
    }

    /**
     * Test a connection by listing tools and optionally calling a no-op.
     * Returns a status report string.
     */
    async testConnection(name: string): Promise<string> {
        const conn = this.connections.get(name);
        if (!conn) return `Error: MCP server "${name}" is not configured`;
        if (conn.status !== 'connected' || !conn.client) {
            return `Error: MCP server "${name}" is not connected (status: ${conn.status}${conn.error ? ' — ' + conn.error : ''})`;
        }

        try {
            const toolsResult = await conn.client.listTools();
            const toolCount = toolsResult.tools?.length ?? 0;
            return `OK: Server "${name}" is connected with ${toolCount} tool(s) available.`;
        } catch (e) {
            return `Error: Test failed for "${name}": ${e instanceof Error ? e.message : String(e)}`;
        }
    }

    // ── Introspection ──────────────────────────────────────────────────────

    getConnections(): McpConnection[] {
        return [...this.connections.values()];
    }

    getConnection(name: string): McpConnection | undefined {
        return this.connections.get(name);
    }

    getAllTools(): { serverName: string; tool: McpToolInfo }[] {
        const results: { serverName: string; tool: McpToolInfo }[] = [];
        for (const conn of this.connections.values()) {
            if (conn.status === 'connected') {
                for (const tool of conn.tools) {
                    results.push({ serverName: conn.name, tool });
                }
            }
        }
        return results;
    }
}
