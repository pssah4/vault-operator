/**
 * McpBridge -- Hosts an MCP Server as a local HTTP endpoint.
 *
 * Runs an HTTP server on localhost (default port 27182) that speaks
 * MCP Streamable HTTP protocol. Claude Desktop connects via URL.
 * All tool calls are dispatched directly to Vault Operator services (no IPC needed).
 *
 * Requires Obsidian to be running (the services live in the Renderer process).
 *
 * ADR-053: MCP Server Prozess-Architektur (revised: HTTP instead of stdio+IPC)
 * FEATURE-1400: MCP Server Core
 */

import type ObsidianAgentPlugin from '../main';
import type { McpToolDefinition } from './types';
import { handleToolCall } from './tools/index';
import { RelayClient } from './RelayClient';
import { buildPrompts } from './prompts/systemContext';
import { validateMcpVaultPath } from './tools/mcpPathValidation';
import * as safeFs from '../core/security/safeFs';
import { spawnAllowed, spawnAllowedSync } from '../core/security/spawnAllowlist';

const DEFAULT_PORT = 27182;

/** Callback for tunnel URL changes (displayed in Settings UI). */
type TunnelUrlCallback = (url: string | null) => void;

// Tool definitions exposed to Claude
// Agent-internal tools that don't make sense for external MCP clients.
// FIX-23-09-02: extended with polymorphic / arbitrary-code-execution tools
// (execute_command, use_mcp_tool, invoke_mcp_server, invoke_skill,
// run_skill_script, evaluate_expression) and identity-mutating tools
// (update_soul) that GitHub issue #46 correctly flagged as too broad for
// the catch-all execute_vault_op surface.
export const AGENT_INTERNAL_TOOLS = new Set([
    'ask_followup_question', 'attempt_completion', 'switch_agent', 'new_task',
    'update_todo_list', 'execute_recipe', 'manage_mcp_server',
    'manage_source', 'resolve_capability_gap', 'configure_model', 'read_agent_logs',
    'update_settings', 'enable_plugin', 'call_plugin_api',
    // FIX-23-09-02: polymorphic dispatch / arbitrary-code surfaces
    'execute_command', 'use_mcp_tool', 'invoke_mcp_server', 'invoke_skill',
    'run_skill_script', 'evaluate_expression',
    // FIX-23-09-02: identity / soul mutation
    'update_soul',
]);

export const TOOLS: McpToolDefinition[] = [
    {
        name: 'get_context',
        description: 'Returns vault statistics, available skills, and rules. When strictSourceIsolation is off and the caller is the plugin itself, also returns user profile and memory context. Recommended as the first call of a session.',
        inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
        name: 'search_vault',
        description: 'Intelligent vault search: combines semantic similarity, keyword matching, tag-match, weighted RRF fusion, graph expansion (Wikilinks + MOC + implicit), and cross-encoder reranking in one call. Returns rich results with excerpts, scores, and connection context.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Natural-language search query' },
                top_k: { type: 'number', description: 'Max results (default: 8, max: 20)' },
                folder: { type: 'string', description: 'Restrict to folder (prefix match)' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (any match)' },
                since: { type: 'string', description: 'Only notes modified on or after this date (ISO: "2026-01-01")' },
            },
            required: ['query'],
        },
    },
    {
        name: 'read_notes',
        description: 'Read one or more vault files. Returns content with frontmatter, tags, and linked notes for each file.',
        inputSchema: {
            type: 'object',
            properties: {
                paths: { type: 'array', items: { type: 'string' }, description: 'File paths relative to vault root' },
            },
            required: ['paths'],
        },
    },
    {
        name: 'write_vault',
        description: 'Create, edit, or delete vault files. Supports batch operations.',
        inputSchema: {
            type: 'object',
            properties: {
                operations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            type: { type: 'string', enum: ['create', 'edit', 'append', 'delete'] },
                            path: { type: 'string' },
                            content: { type: 'string' },
                        },
                        required: ['type', 'path'],
                    },
                },
            },
            required: ['operations'],
        },
    },
    {
        name: 'execute_vault_op',
        description: 'Execute any vault operation by name. Available operations are listed dynamically at runtime.',
        inputSchema: {
            type: 'object',
            properties: {
                operation: { type: 'string', description: 'Operation name' },
                params: { type: 'object', description: 'Operation-specific parameters' },
            },
            required: ['operation'],
        },
    },
    {
        name: 'sync_session',
        description:
            'Legacy auto-tracking tool: replicates the current MCP-session conversation into Obsidian\'s chat history. ' +
            'For cross-surface use cases, save_conversation is the preferred entry point: it provides Living-Document ' +
            'semantics (the conversation grows over multiple turns, no duplication) and Cross-Interface-Threads. ' +
            'sync_session is intended as a one-shot session-end snapshot when no structured messages array is available. ' +
            'Passing source_interface lets the conversation appear in the matching History tab.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Short title (2-5 words)' },
                transcript: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant'] },
                            text: { type: 'string', description: 'The exact message text' },
                        },
                        required: ['role', 'text'],
                    },
                    description: 'Copy every message from this conversation. User messages verbatim. Your responses as you wrote them. Simply replicate the chat.',
                },
                learnings: { type: 'string', description: 'Optional: anything to remember for next time' },
                source_interface: {
                    type: 'string',
                    enum: ['claude-ai', 'claude-code', 'chatgpt', 'perplexity', 'unknown'],
                    description: 'Source tag. Defaults to "unknown" -- always pass the right value (e.g. "claude-ai") so the conversation lands in the matching History-Sidebar tab.',
                },
            },
            required: ['title', 'transcript'],
        },
    },
    {
        name: 'update_memory',
        description:
            '[deprecated, use save_to_memory] Update persistent memory: user profile, behavioral patterns, known errors, or active projects. ' +
            'This call is now routed to save_to_memory (Memory v2); the legacy memory/{category}.md V1 files are no longer written.',
        inputSchema: {
            type: 'object',
            properties: {
                category: { type: 'string', enum: ['profile', 'patterns', 'errors', 'projects'] },
                content: { type: 'string', description: 'Content to append' },
                source_interface: {
                    type: 'string',
                    enum: ['obsilo', 'claude-ai', 'claude-code', 'chatgpt', 'perplexity', 'unknown'],
                    description: 'Optional source tag (BA-26). Default: unknown.',
                },
            },
            required: ['category', 'content'],
        },
    },
    // BA-26 / EPIC-23 -- Cross-Surface MCP Tools (FEAT-23-01, -02, -05)
    {
        name: 'save_to_memory',
        description:
            'Persist a single fact or insight in Vault Operator Memory v2. Each call produces one fact entry. ' +
            'Use this when the user explicitly asks to remember something across their chat tools ' +
            '(Vault Operator, Claude Desktop, Claude.ai, ChatGPT, Claude Code, Perplexity). Tags are optional. ' +
            'The configured source_interface tag (per connector config) labels the entry so it stays filterable later.',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The fact text. Single statement, max 4000 chars.' },
                tags: {
                    type: 'array', items: { type: 'string' },
                    description: 'Optional 1-5 short lowercase tags (e.g. ["coding", "preferences"]).',
                },
                kind: {
                    type: 'string',
                    enum: ['fact', 'preference', 'identity', 'event'],
                    description: 'Default "fact".',
                },
                importance: {
                    type: 'number',
                    description: '0..1 (default 0.5). 0.9 = identity-level, 0.7 = stable preference.',
                },
                source_interface: {
                    type: 'string',
                    enum: ['obsilo', 'claude-ai', 'claude-code', 'chatgpt', 'perplexity', 'unknown'],
                    description: 'Source tag. Configure as a connector constant. Default "unknown".',
                },
                source_uri: {
                    type: 'string',
                    description: 'Optional URI of origin (chat link, vault path, web URL).',
                },
            },
            required: ['content'],
        },
    },
    {
        name: 'save_conversation',
        description:
            'Copy a conversation from an external chat tool into Vault Operator\'s shared History sidebar. ' +
            'Conversations appear in the matching source-tab.\n\n' +
            'Living-document behaviour (default on): when the user asks to save the current ' +
            'conversation again later in the same session, call save_conversation again with ' +
            'the new turns. The plugin auto-detects the active conversation (within 30 minutes ' +
            'from the same source_interface) and appends. Tracking the conversation_id yourself ' +
            'is optional. Either the full transcript (plugin computes the delta) or only the new ' +
            'turns (plugin appends them as-is) can be sent. For explicit control, pass the ' +
            'conversation_id from the previous result.\n\n' +
            'CROSS-INTERFACE THREADS: the first save_conversation result returns a ' +
            'cross_interface_thread_id. When the user continues the same topic in a different ' +
            'tool (e.g. claude-ai -> claude-code), pass that thread_id to link both conversations.\n\n' +
            'SYNC-MODE: per-provider Auto vs Manual is user-configured. Auto triggers memory-' +
            'extraction immediately with the same thresholds as Vault Operator-internal conversations; ' +
            'Manual parks the conversation as pending until the user confirms. ChatGPT and ' +
            'Perplexity default to Manual to keep family-shared accounts out of personal memory.',
        inputSchema: {
            type: 'object',
            properties: {
                messages: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            role: { type: 'string', enum: ['user', 'assistant'] },
                            text: { type: 'string' },
                            ts: { type: 'string', description: 'Optional ISO timestamp.' },
                        },
                        required: ['role', 'text'],
                    },
                    description: 'Up to 500 messages.',
                },
                title: { type: 'string', description: 'Optional title (max 200 chars).' },
                source_interface: {
                    type: 'string',
                    enum: ['claude-ai', 'claude-code', 'chatgpt', 'perplexity', 'unknown'],
                    description: 'Source tag (required, "obsilo" reserved for the plugin).',
                },
                living_document: {
                    type: 'boolean',
                    description: 'Default: true (Settings). Set false to force a new standalone conversation.',
                },
                conversation_id: {
                    type: 'string',
                    description: 'Optional: conversation_id returned by a previous save_conversation. Forces append into the same conversation.',
                },
                cross_interface_thread_id: {
                    type: 'string',
                    description: 'Optional: thread-YYYY-MM-DD-{6-hex} ID. Links the new conversation to an existing cross-interface thread.',
                },
            },
            required: ['messages', 'source_interface'],
        },
    },
    {
        name: 'close_conversation',
        description:
            'Explicitly end the Living-Document Active-Session for a given conversation. After this ' +
            'call, the next save_conversation from the same MCP-Session creates a new conversation ' +
            'instead of appending. Use when the user signals end-of-topic.',
        inputSchema: {
            type: 'object',
            properties: {
                conversation_id: { type: 'string', description: 'The conversation_id returned by save_conversation.' },
            },
            required: ['conversation_id'],
        },
    },
    {
        name: 'recall_memory',
        description:
            'Search Vault Operator Memory v2 facts by meaning. Returns top-K hits ranked by cosine over ' +
            'fact_embeddings (with token-overlap fallback). Optional source_interface filter to ' +
            'restrict to facts from a specific tool.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Natural-language search query.' },
                top_k: { type: 'number', description: '1-30, default 10.' },
                kind: {
                    type: 'string',
                    enum: ['fact', 'preference', 'identity', 'event'],
                    description: 'Optional kind filter.',
                },
                source_interface: {
                    type: 'string',
                    enum: ['obsilo', 'claude-ai', 'claude-code', 'chatgpt', 'perplexity', 'unknown'],
                    description: 'Optional: restrict to facts from this surface only.',
                },
            },
            required: ['query'],
        },
    },
    {
        name: 'search_history',
        description:
            'Keyword-search across past conversations from any source (Vault Operator, ChatGPT, Claude.ai, ' +
            'Claude Code, Perplexity). Returns matching messages with clickable obsidian://vault-operator-chat ' +
            'links to the source conversation. Optional source_interface filter.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Keyword or short phrase, case-insensitive.' },
                top_k: { type: 'number', description: '1-30, default 10.' },
                role: {
                    type: 'string',
                    enum: ['user', 'assistant', 'system', 'tool'],
                    description: 'Optional role filter.',
                },
                source_interface: {
                    type: 'string',
                    enum: ['obsilo', 'claude-ai', 'claude-code', 'chatgpt', 'perplexity', 'unknown'],
                    description: 'Optional: restrict to one chat surface.',
                },
            },
            required: ['query'],
        },
    },
    // Memory v2 Phase 3 (FEATURE-0317 / PLAN-006 task 10): expose
    // implicit-edge + note-metadata reads so a Setup-C standalone engine
    // (McpKnowledgeAdapter) can route Vault-graph queries through the
    // Plugin-MCP. Read-only.
    {
        name: 'get_vault_implicit_edges',
        description:
            'Return implicit (cosine-based) neighbours of a vault note. Used by Memory v2 ' +
            'cross-DB walks when the engine runs as a standalone service.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Vault-relative note path.' },
                hops: { type: 'number', description: 'BFS depth (1-3, default 1).' },
                limit: { type: 'number', description: 'Max neighbours (default 20).' },
            },
            required: ['path'],
        },
    },
    {
        name: 'get_vault_note_metadata',
        description:
            'Return tags + last-indexed timestamp for a vault note. Used by Memory v2 ' +
            'edge-resolution to detect stale references.',
        inputSchema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Vault-relative note path.' },
            },
            required: ['path'],
        },
    },
];

// ---------------------------------------------------------------------------
// McpBridge -- HTTP-based MCP Server
// ---------------------------------------------------------------------------

export class McpBridge {
    private server: import('http').Server | null = null;
    private tunnelProcess: import('child_process').ChildProcess | null = null;
    private relayClient: RelayClient | null = null;
    private _running = false;
    private _tunnelUrl: string | null = null;
    private port = DEFAULT_PORT;
    private onTunnelUrl: TunnelUrlCallback | null = null;

    constructor(private plugin: ObsidianAgentPlugin) {}

    get tunnelUrl(): string | null { return this._tunnelUrl; }
    get remoteConnected(): boolean { return this.relayClient?.connected ?? false; }
    get remoteConnecting(): boolean { return this.relayClient?.connecting ?? false; }

    get running(): boolean { return this._running; }

    async start(): Promise<void> {
        if (this.server) return;

        // AUDIT-006 H-1: Ensure MCP server token exists (auto-generate on first run)
        if (!this.plugin.settings.mcpServerToken) {
            this.plugin.settings.mcpServerToken = crypto.randomUUID();
            await this.plugin.saveSettings();
        }
        this.writeMcpTokenFile();

        // eslint-disable-next-line @typescript-eslint/no-require-imports -- http only via dynamic require in Electron
        const http = require('http') as typeof import('http');

        this.server = http.createServer((req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
            void this.handleRequest(req, res);
        });

        const server = this.server;
        await new Promise<void>((resolve, reject) => {
            server.listen(this.port, '127.0.0.1', () => {
                this._running = true;
                console.debug(`[McpBridge] MCP Server listening on http://127.0.0.1:${this.port}`);
                resolve();
            });
            server.on('error', (e: Error) => {
                console.warn(`[McpBridge] Failed to start HTTP server:`, e);
                reject(e);
            });
        });
    }

    /**
     * Write MCP server token to well-known file for mcp-server-worker (AUDIT-006 H-1).
     * The worker reads this file to authenticate HTTP requests to the local server.
     */
    private writeMcpTokenFile(): void {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- path/os are pure helpers; fs surface is via safeFs
            const nodePath = require('path') as typeof import('path');
            // eslint-disable-next-line @typescript-eslint/no-require-imports -- path/os are pure helpers
            const os = require('os') as typeof import('os');
            const tokenDir = nodePath.join(os.homedir(), '.obsidian-agent');
            if (!safeFs.existsSync(tokenDir)) safeFs.mkdirSync(tokenDir, { recursive: true });
            // mode 0o600: owner-only read/write on Unix; silently ignored on Windows
            // (Windows relies on user-profile directory ACLs for protection)
            safeFs.writeFileSync(
                nodePath.join(tokenDir, 'mcp-token'),
                this.plugin.settings.mcpServerToken,
                { mode: 0o600 },
            );
        } catch (e) {
            console.warn('[McpBridge] Failed to write MCP token file:', e);
        }
    }

    /** Connect to remote relay (if configured). */
    connectRelay(): void {
        // Stop any existing polling loop first
        this.disconnectRelay();

        const url = this.plugin.settings.relayUrl;
        const token = this.plugin.settings.relayToken;
        if (!url || !token) return;

        this.relayClient = new RelayClient(this.plugin);
        this.relayClient.connect(url, token);
    }

    /** Disconnect from remote relay. */
    disconnectRelay(): void {
        this.relayClient?.disconnect();
        this.relayClient = null;
    }

    stop(): void {
        this.disconnectRelay();
        this.stopTunnel();
        if (this.server) {
            this.server.close();
            this.server = null;
            this._running = false;
            console.debug('[McpBridge] MCP Server stopped');
        }
    }

    /**
     * Start a Cloudflare Tunnel to make the MCP server publicly accessible.
     * The tunnel URL (e.g. https://xxx.trycloudflare.com) is available via tunnelUrl getter.
     */
    startTunnel(onUrl?: TunnelUrlCallback): void {
        if (this.tunnelProcess) return;
        this.onTunnelUrl = onUrl ?? null;

        // Check if cloudflared is available. All child_process access goes through
        // spawnAllowlist (FEAT-28-02), which enforces shell: false and rejects
        // any binary outside the seven-entry allowlist.
        const which = process.platform === 'win32' ? 'where' : 'which';
        const probe = spawnAllowedSync(which, ['cloudflared'], { encoding: 'utf-8', timeout: 3000 });
        if (probe.status !== 0) {
            console.warn('[McpBridge] cloudflared not found. Install via: brew install cloudflared');
            return;
        }

        console.debug('[McpBridge] Starting Cloudflare Tunnel...');
        this.tunnelProcess = spawnAllowed('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${this.port}`], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        // Parse tunnel URL from cloudflared stderr output
        this.tunnelProcess.stderr?.on('data', (data: Buffer) => {
            const line = data.toString();
            const urlMatch = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (urlMatch && !this._tunnelUrl) {
                this._tunnelUrl = urlMatch[0];
                console.debug(`[McpBridge] Tunnel URL: ${this._tunnelUrl}`);
                this.onTunnelUrl?.(this._tunnelUrl);
            }
        });

        this.tunnelProcess.on('exit', (code: number | null) => {
            console.debug(`[McpBridge] Tunnel exited with code ${code ?? 'null'}`);
            this.tunnelProcess = null;
            this._tunnelUrl = null;
            this.onTunnelUrl?.(null);
        });
    }

    stopTunnel(): void {
        if (this.tunnelProcess) {
            try { this.tunnelProcess.kill('SIGTERM'); } catch { /* already dead */ }
            this.tunnelProcess = null;
            this._tunnelUrl = null;
            console.debug('[McpBridge] Tunnel stopped');
        }
    }

    // -----------------------------------------------------------------------
    // HTTP Request Handler (Streamable HTTP MCP)
    // -----------------------------------------------------------------------

    private async handleRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
        // AUDIT-006 H-1: Restrict CORS (block browser cross-origin requests)
        res.setHeader('Access-Control-Allow-Origin', 'app://obsidian.md');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // AUDIT-006 H-1 + AUDIT-013 H-5: Bearer token authentication with
        // timing-safe comparison. The previous `!==` comparison short-
        // circuited on first mismatch, leaking the token byte-by-byte over
        // many requests. Token is high-entropy (UUID v4) so the practical
        // attack window is small, but the standard fix is one stdlib call.
        const expectedToken = this.plugin.settings.mcpServerToken;
        if (expectedToken) {
            const authHeader = req.headers['authorization'] ?? '';
            const presentedRaw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
            if (!timingSafeStringEqual(presentedRaw, expectedToken)) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Unauthorized' } }));
                return;
            }
        }

        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }

        // AUDIT-006 M-4: Read body with size limit (matches relay worker 1 MB limit)
        const MAX_BODY = 1_048_576;
        const body = await new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', (chunk: Buffer) => {
                data += chunk.toString();
                if (data.length > MAX_BODY) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Payload too large' } }));
                    req.destroy();
                    reject(new Error('Payload too large'));
                }
            });
            req.on('end', () => resolve(data));
        });

        try {
            const request = JSON.parse(body) as { jsonrpc: string; method: string; id?: number | string; params?: Record<string, unknown> };

            // JSON-RPC Notifications have no 'id' -- they don't expect a response
            if (request.id === undefined || request.id === null) {
                // Still process it (side effects like notifications/initialized) but don't respond
                void this.handleJsonRpc(request).catch(() => { /* notification errors are silent */ });
                res.writeHead(204);
                res.end();
                return;
            }

            const result = await this.handleJsonRpc(request);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: request.id,
                result,
            }));
        } catch (e) {
            // CodeQL #63: Sanitize error -- do not expose stack traces or internal paths
            const safeMessage = e instanceof Error ? e.message.split('\n')[0] : 'Internal server error';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: 0,
                error: { code: -32603, message: safeMessage },
            }));
        }
    }

    // -----------------------------------------------------------------------
    // JSON-RPC Method Dispatch
    // -----------------------------------------------------------------------

    private async handleJsonRpc(request: { method: string; params?: Record<string, unknown> }): Promise<unknown> {
        switch (request.method) {
            case 'initialize': {
                const requested = typeof request.params?.protocolVersion === 'string'
                    ? request.params.protocolVersion
                    : undefined;
                return this.buildInitializeResponse(requested);
            }

            case 'tools/list':
                return {
                    tools: this.getToolsWithContext(),
                };

            case 'tools/call': {
                const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
                if (!params?.name) throw new Error('Missing tool name');
                const result = await handleToolCall(this.plugin, params.name, params.arguments ?? {});
                return { content: result.content, isError: result.isError };
            }

            case 'prompts/list':
                return this.listPrompts();

            case 'prompts/get': {
                const promptName = (request.params as { name?: string })?.name;
                return this.getPrompt(promptName);
            }

            case 'resources/list':
                return { resources: this.buildResourceList() };

            case 'resources/read': {
                const uri = (request.params as { uri?: string })?.uri;
                return { contents: await this.readResource(uri ?? '') };
            }

            case 'resources/templates/list':
                return {
                    resourceTemplates: [{
                        uriTemplate: 'vault://{path}',
                        name: 'Vault note',
                        description: 'Read any note from your Obsidian vault by path',
                        mimeType: 'text/markdown',
                    }],
                };

            case 'notifications/initialized':
            case 'ping':
                return {};

            default:
                throw new Error(`Unknown method: ${request.method}`);
        }
    }

    // -----------------------------------------------------------------------
    // Dynamic Tool Definitions (with vault context)
    // -----------------------------------------------------------------------

    getToolsWithContext() {
        const vault = this.plugin.app.vault;

        // Get top-level folders for write_vault description
        const folders = vault.getAllFolders()
            .map(f => f.path)
            .filter(p => !p.startsWith('.') && p.split('/').length <= 2)
            .sort()
            .slice(0, 30);

        const folderList = folders.length > 0
            ? `\n\nExisting vault folders: ${folders.join(', ')}. Prefer existing folders when creating files.`
            : '';

        // Rules hint
        const rulesHint = '\n\nCall get_context to see user rules and preferences before writing.';

        // Get default new note folder from Obsidian settings
        let defaultFolder = '';
        try {
            const obsidianConfig = (this.plugin.app.vault as unknown as { config?: { newFileFolderPath?: string } }).config;
            if (obsidianConfig?.newFileFolderPath) {
                defaultFolder = `\n\nObsidian default folder for new notes: "${obsidianConfig.newFileFolderPath}". Use this when no specific folder is requested.`;
            }
        } catch { /* non-fatal */ }

        return TOOLS.map(t => {
            let description = t.description;
            if (t.name === 'write_vault') {
                description += folderList + defaultFolder + rulesHint;
            }
            if (t.name === 'execute_vault_op') {
                const available = this.plugin.toolRegistry.getAllTools()
                    .map(tool => tool.name)
                    .filter(name => !AGENT_INTERNAL_TOOLS.has(name))
                    .sort()
                    .join(', ');
                description = `Execute any vault operation by name. Available: ${available}.`;
            }
            if (t.name === 'search_vault') {
                description += `\n\nVault has ${vault.getMarkdownFiles().length} notes. Semantic index: ${this.plugin.semanticIndex?.isIndexed ? 'built' : 'not built'}.`;
            }
            return {
                name: t.name,
                description,
                inputSchema: t.inputSchema,
            };
        });
    }

    // -----------------------------------------------------------------------
    // Initialize -- protocol-version negotiation + serverInfo
    // -----------------------------------------------------------------------

    /**
     * FIX-23-09-03: exposed as a public method so RelayClient delegates to
     * the same negotiation logic the local HTTP path uses. Echoes the
     * client's requested protocol version when we recognise it
     * (Perplexity strict-checks this); otherwise returns our highest
     * stable version.
     */
    buildInitializeResponse(requestedProtocolVersion?: string): {
        protocolVersion: string;
        capabilities: { tools: Record<string, never>; prompts: Record<string, never>; resources: Record<string, never> };
        serverInfo: { name: string; version: string };
        instructions: string;
    } {
        const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
        const negotiated = requestedProtocolVersion && SUPPORTED_VERSIONS.includes(requestedProtocolVersion)
            ? requestedProtocolVersion
            : '2025-03-26';
        return {
            protocolVersion: negotiated,
            capabilities: { tools: {}, prompts: {}, resources: {} },
            serverInfo: { name: 'Vault Operator', version: '1.0.0' },
            instructions: 'Vault Operator is an Obsidian plugin that exposes vault search, read, write, and memory tools over MCP. '
                + 'A descriptive context prompt is available via prompts/list as "vault-operator-context" and can be selected by the user. '
                + 'Typical flow: call get_context for vault stats, use search_vault / read_notes / write_vault as needed, '
                + 'and call sync_session at the end of a session to save the transcript to Obsidian.',
        };
    }

    // -----------------------------------------------------------------------
    // Prompts -- selectable system-context for MCP clients
    // -----------------------------------------------------------------------

    /**
     * FIX-23-09-03: exposed as a public method so RelayClient (the remote
     * connector path) can delegate prompts/list to the same implementation
     * the local HTTP path uses, instead of re-implementing it.
     */
    listPrompts(): { prompts: Array<{ name: string; description: string }> } {
        return {
            prompts: [{
                name: 'vault-operator-context',
                description: 'Recommended tool use, user rules, and available skills for this vault. Select to pin as conversation context.',
            }, {
                name: 'vault-operator-skills',
                description: 'Skill-based workflows for complex tasks (presentations, research, document creation).',
            }],
        };
    }

    /**
     * FIX-23-09-03: exposed for the relay path. Mirrors the prompts/get
     * dispatch from handleJsonRpc.
     */
    async getPrompt(promptName: string | undefined): Promise<{ messages: unknown[] }> {
        const allPrompts = await buildPrompts(this.plugin);
        if (promptName === 'vault-operator-skills') {
            const skillsText = allPrompts.find(p =>
                typeof p.content === 'object' && p.content.text?.includes('Available Skills')
            );
            return { messages: skillsText ? [skillsText] : allPrompts };
        }
        return { messages: allPrompts };
    }

    // -----------------------------------------------------------------------
    // Resources -- Vault notes as attachable context
    // -----------------------------------------------------------------------

    buildResourceList() {
        // AUDIT-013 H-3: never expose ignored notes via the MCP resource list.
        // Without this filter, the user's ignored notes show up in Claude
        // Desktop's "Add from Vault Operator" picker.
        const vault = this.plugin.app.vault;
        const ignoreService = this.plugin.ignoreService;
        const files = vault.getMarkdownFiles();
        return files
            .filter((f) => !ignoreService.isIgnored(f.path))
            .map((f) => {
                const name = f.path.split('/').pop()?.replace(/\.md$/, '') ?? f.path;
                return {
                    uri: `vault://${f.path}`,
                    name,
                    description: f.path,
                    mimeType: 'text/markdown',
                };
            });
    }

    private async readResource(uri: string) {
        // AUDIT-013 H-3 + H-4: validate path through the standard MCP gate
        // (traversal, ignore, protected) and wrap the returned content in a
        // trust-boundary tag so a downstream agent treats it as data, not as
        // instructions.
        const MAX_URI_LEN = 2048;
        if (uri.length > MAX_URI_LEN) return [];
        const rawPath = decodeURIComponent(uri.replace(/^vault:\/\//, ''));
        const validation = validateMcpVaultPath(this.plugin, rawPath, false);
        if (!validation.allowed) return [];

        const vault = this.plugin.app.vault;
        const file = vault.getFileByPath(rawPath);
        if (!file) return [];
        // Restrict to markdown files; binary or sidecar files are out of
        // scope for the resource picker.
        if (!('extension' in file) || (file as { extension?: string }).extension !== 'md') return [];

        try {
            const content = await vault.cachedRead(file);
            return [{
                uri,
                mimeType: 'text/markdown',
                text: wrapVaultContentForMcp(rawPath, content),
            }];
        } catch {
            return [];
        }
    }
}

/**
 * AUDIT-013 H-5: timing-safe string comparison for Bearer tokens.
 * Wraps Node's `crypto.timingSafeEqual` with the length-equality guard it
 * requires. Returns false for any length mismatch in constant-ish time
 * (length comparison itself is fast and non-secret).
 *
 * Exported for testability.
 */
export function timingSafeStringEqual(presented: string, expected: string): boolean {
    if (presented.length !== expected.length) return false;
    if (expected.length === 0) return false; // empty expected = misconfig, deny
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- node:crypto in plugin runtime
    const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto');
    const a = Buffer.from(presented, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
}

/**
 * AUDIT-013 H-4: wrap untrusted vault content in a boundary tag the
 * downstream agent recognises as user data rather than as instructions.
 * Mitigates indirect prompt injection through note bodies or frontmatter
 * (e.g. "Ignore previous instructions" planted in a markdown file).
 *
 * Path is XML-escaped to prevent attribute injection.
 */
export function wrapVaultContentForMcp(path: string, content: string): string {
    const safePath = path
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<vault-content path="${safePath}" trust="user-data">\n${content}\n</vault-content>`;
}
