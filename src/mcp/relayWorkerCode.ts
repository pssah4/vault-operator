/**
 * Embedded Cloudflare Worker code for the Vault Operator Relay.
 * This is uploaded to Cloudflare via REST API when the user clicks "Deploy".
 *
 * Architecture: HTTP long-polling (NOT WebSocket) for Obsidian compatibility.
 * Obsidian's renderer CSP blocks WebSocket to external servers,
 * so we use requestUrl-based polling instead.
 *
 * Flow:
 *   1. AI assistant (claude.ai) sends POST /{token}/mcp with JSON-RPC
 *   2. Relay stores the request in the DO
 *   3. Plugin polls POST /poll with Authorization: Bearer header
 *   4. Plugin processes request, sends result via POST /respond with Bearer header
 *   5. DO resolves the original HTTP response to the AI assistant
 *
 * URL structure:
 *   /health                  -- health check (no auth)
 *   /poll                    -- plugin polls for pending requests (Bearer auth)
 *   /respond                 -- plugin sends tool results back (Bearer auth)
 *   /{token}/mcp             -- MCP endpoint for AI assistants (token in URL)
 *   POST with Bearer header  -- MCP endpoint (Bearer auth)
 *
 * Security (AUDIT-005):
 *   - Constant-time token comparison (SHA-256 digest)
 *   - No debug/diagnostic endpoints
 *   - Queue size limits (DoS protection)
 *   - Request body size limit (1 MB)
 *   - CORS restricted per endpoint
 *   - Random correlation IDs
 *
 * FEATURE-1403: Remote Transport
 */

export const RELAY_WORKER_CODE = `
// Vault Operator Relay Worker -- deployed via Vault Operator Plugin

// Constant-time token comparison via SHA-256 digest (H-1)
async function safeTokenCompare(a, b) {
    if (!a || !b) return false;
    const enc = new TextEncoder();
    const [da, db] = await Promise.all([
        crypto.subtle.digest('SHA-256', enc.encode(a)),
        crypto.subtle.digest('SHA-256', enc.encode(b)),
    ]);
    const ba = new Uint8Array(da);
    const bb = new Uint8Array(db);
    if (ba.length !== bb.length) return false;
    let result = 0;
    for (let i = 0; i < ba.length; i++) result |= ba[i] ^ bb[i];
    return result === 0;
}

export default {
    async fetch(request, env) {
        // CORS only for MCP endpoint (AI assistants need it) -- not for plugin endpoints (H-6).
        // FIX-23-04-01: erweitert um GET (Streamable-HTTP SSE-Subscribe) und DELETE
        // (Session-Termination), plus Mcp-Session-Id im Allow-Headers damit
        // Spec-strikte Clients wie Perplexity nicht im Preflight haengen bleiben.
        const mcpCorsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID',
            'Access-Control-Expose-Headers': 'Mcp-Session-Id',
        };

        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: mcpCorsHeaders });
        }

        if (url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', relay: 'obsilo' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Plugin endpoints: auth via Authorization Bearer header (H-4)
        if (url.pathname === '/poll' || url.pathname === '/respond') {
            const bearer = (request.headers.get('Authorization') || '').replace('Bearer ', '');
            const valid = await safeTokenCompare(bearer, env.RELAY_TOKEN);
            if (!valid) {
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401, headers: { 'Content-Type': 'application/json' },
                });
            }
            const id = env.RELAY_DO.idFromName('default');
            const relay = env.RELAY_DO.get(id);
            const resp = await relay.fetch(request);
            return new Response(resp.body, resp);
        }

        // MCP endpoint: auth via URL path (/{token}/mcp) or Bearer header
        let authenticated = false;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length === 2 && parts[1] === 'mcp') {
            authenticated = await safeTokenCompare(parts[0], env.RELAY_TOKEN);
        }
        if (!authenticated) {
            const bearer = (request.headers.get('Authorization') || '').replace('Bearer ', '');
            if (bearer) {
                authenticated = await safeTokenCompare(bearer, env.RELAY_TOKEN);
            }
        }
        if (!authenticated) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { 'Content-Type': 'application/json', ...mcpCorsHeaders },
            });
        }

        // FIX-23-04-01: Streamable-HTTP-Spec-Methoden vor dem
        // POST-Forward abfangen, damit jede Antwort einen korrekten
        // Content-Type-Header traegt. Perplexity (und neuere
        // Streamable-HTTP-Clients) erwarten das streng -- ohne
        // Content-Type werfen sie "Unexpected content type:" (leer).
        if (request.method === 'GET') {
            // Optional SSE-Subscribe-Endpunkt. Wir halten heute keinen
            // server-initiated Stream, antworten aber Spec-konform mit
            // einer leeren text/event-stream-Response statt 405 plain.
            // Client kann nichts streamen, aber der Connect-Handshake
            // bleibt sauber und der Client faellt auf den POST-Pfad zurueck.
            return new Response(': sse keep-alive\\n\\n', {
                status: 200,
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-store',
                    'Connection': 'keep-alive',
                    ...mcpCorsHeaders,
                },
            });
        }

        if (request.method === 'DELETE') {
            // Spec: DELETE auf MCP-Endpunkt terminiert Session.
            // Wir halten keine persistenten Sessions auf Worker-Ebene
            // (state liegt im DO + Plugin), daher Acknowledge mit 204.
            return new Response(null, {
                status: 204,
                headers: mcpCorsHeaders,
            });
        }

        if (request.method !== 'POST') {
            return new Response(JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32601, message: 'Method not allowed: ' + request.method },
            }), {
                status: 405,
                headers: { 'Content-Type': 'application/json', 'Allow': 'POST, GET, DELETE, OPTIONS', ...mcpCorsHeaders },
            });
        }

        // FIX-23-04-01 Pass 3: Body MUSS vor DO-fetch geparst werden,
        // sonst hat der DO den Stream konsumiert und unser clone() ist
        // leer. Wir parsen einmal, leiten den Body als String an die
        // DO weiter und nutzen das parsed Object fuer Method-Detection.
        const acceptHeader = (request.headers.get('Accept') || '').toLowerCase();
        const wantsSSE = acceptHeader.includes('text/event-stream');
        const wantsJSON = acceptHeader.includes('application/json') || acceptHeader.includes('*/*');
        const sseOnly = wantsSSE && !wantsJSON;

        let bodyText = '';
        let isInitialize = false;
        try {
            bodyText = await request.text();
            const parsed = JSON.parse(bodyText);
            isInitialize = parsed?.method === 'initialize';
        } catch { /* not JSON or no body */ }

        // Forward to DO with the already-read body (rebuild request).
        const id = env.RELAY_DO.idFromName('default');
        const relay = env.RELAY_DO.get(id);
        const forwardReq = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body: bodyText.length > 0 ? bodyText : undefined,
        });
        const resp = await relay.fetch(forwardReq);

        // Read the upstream response body.
        const upstreamBody = await resp.text();

        const finalHeaders = new Headers();
        for (const [k, v] of Object.entries(mcpCorsHeaders)) finalHeaders.set(k, v);

        // Content-Type-Handling: passthrough was upstream lieferte.
        // FIX-23-04-01 Pass 5: kein Default-CT mehr aufzwingen --
        // Notifications kommen jetzt mit 202 + leerem Body + kein CT
        // (Spec-konform "no body to parse"); 200/JSON-Responses tragen
        // den CT bereits selbst. Default 'application/json' nur dann,
        // wenn der Status weder 202 noch 204 ist UND ein nicht-leerer
        // Body vorhanden ist (defensiv).
        const upstreamCT = resp.headers.get('content-type');
        if (upstreamCT) {
            finalHeaders.set('Content-Type', upstreamCT);
        } else if (resp.status !== 202 && resp.status !== 204 && upstreamBody.length > 0) {
            finalHeaders.set('Content-Type', 'application/json');
        }

        // Set Mcp-Session-Id on initialize response.
        if (isInitialize) {
            finalHeaders.set('Mcp-Session-Id', crypto.randomUUID());
        }

        if (sseOnly && upstreamBody && upstreamBody.trim().startsWith('{')) {
            // Wrap JSON-RPC body as a single SSE event.
            finalHeaders.set('Content-Type', 'text/event-stream');
            finalHeaders.set('Cache-Control', 'no-store');
            const sseFrame = \`data: \${upstreamBody.trim()}\\n\\n\`;
            return new Response(sseFrame, { status: resp.status, headers: finalHeaders });
        }

        return new Response(upstreamBody.length > 0 ? upstreamBody : null, {
            status: resp.status,
            headers: finalHeaders,
        });
    },
};

const MAX_QUEUE = 100;     // H-5: max pending requests in queue
const MAX_PENDING = 50;    // H-5: max concurrent pending responses
const MAX_BODY = 1048576;  // M-5: 1 MB max request body

export class RelayDO {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.pending = new Map();
        this.requestQueue = [];
        this.pluginConnected = false;
    }

    async fetch(request) {
        const url = new URL(request.url);

        // Plugin polls for pending MCP requests
        if (url.pathname === '/poll') {
            this.pluginConnected = true;
            const requests = this.requestQueue.splice(0);
            return new Response(JSON.stringify({ requests }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Plugin sends response to an MCP request
        if (url.pathname === '/respond' && request.method === 'POST') {
            const body = await request.json();
            const id = String(body.id ?? '');
            const pending = this.pending.get(id);
            if (pending) {
                clearTimeout(pending.timeout);
                this.pending.delete(id);
                pending.resolve(JSON.stringify(body));
            }
            return new Response(JSON.stringify({ ok: true }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // MCP request from AI assistant (POST)
        if (request.method === 'POST') {
            if (!this.pluginConnected) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0', id: null,
                    error: { code: -32603, message: 'Vault Operator not connected. Make sure Obsidian is running with remote access enabled.' },
                }), { status: 502, headers: { 'Content-Type': 'application/json' } });
            }

            // M-5: Request size limit
            const contentLength = parseInt(request.headers.get('Content-Length') || '0');
            if (contentLength > MAX_BODY) {
                return new Response(JSON.stringify({ error: 'Request too large' }), {
                    status: 413, headers: { 'Content-Type': 'application/json' },
                });
            }

            // H-5: Queue overflow protection
            if (this.requestQueue.length >= MAX_QUEUE || this.pending.size >= MAX_PENDING) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0', id: null,
                    error: { code: -32603, message: 'Too many pending requests. Try again later.' },
                }), { status: 429, headers: { 'Content-Type': 'application/json' } });
            }

            const body = await request.text();
            if (body.length > MAX_BODY) {
                return new Response(JSON.stringify({ error: 'Request too large' }), {
                    status: 413, headers: { 'Content-Type': 'application/json' },
                });
            }

            let parsed;
            try { parsed = JSON.parse(body); } catch { return new Response('Invalid JSON', { status: 400 }); }

            // Notification (no id) -- fire and forget. FIX-23-04-01 Pass 5:
            // MCP Streamable HTTP Spec verlangt: "Server MUST respond with
            // HTTP status code 202 Accepted with no body". Pydantic von
            // Perplexity lehnt 'null' als Body ab, weil JSON-RPC schemas
            // einen Object erwarten. 202 + leer + kein Content-Type ist
            // spec-konform: Status 202 signalisiert "no body to parse".
            if (parsed.id === undefined || parsed.id === null) {
                this.enqueueForPlugin(body);
                return new Response(null, {
                    status: 202,
                    headers: { 'Content-Length': '0' },
                });
            }

            // M-7: Use random correlation ID instead of client-provided sequential ID
            const correlationId = crypto.randomUUID();
            const originalId = parsed.id;

            const responsePromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.pending.delete(correlationId);
                    reject(new Error('Plugin response timeout (30s)'));
                }, 30000);
                this.pending.set(correlationId, { resolve, reject, timeout });
            });

            // Rewrite request with correlation ID for internal routing
            parsed.__correlationId = correlationId;
            this.enqueueForPlugin(JSON.stringify(parsed));

            try {
                const response = await responsePromise;
                // Restore original JSON-RPC ID in the response
                const respParsed = JSON.parse(response);
                respParsed.id = originalId;
                return new Response(JSON.stringify(respParsed), {
                    headers: { 'Content-Type': 'application/json' },
                });
            } catch (e) {
                return new Response(JSON.stringify({
                    jsonrpc: '2.0', id: originalId,
                    error: { code: -32603, message: 'Request timeout' },
                }), { status: 504, headers: { 'Content-Type': 'application/json' } });
            }
        }

        // FIX-23-04-01: Spec-strikte Clients erwarten Content-Type
        // auf jeder Antwort. Kein plain-text 405 mehr.
        return new Response(JSON.stringify({
            jsonrpc: '2.0', id: null,
            error: { code: -32601, message: 'Method not allowed: ' + request.method },
        }), {
            status: 405,
            headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
        });
    }

    enqueueForPlugin(body) {
        this.requestQueue.push(body);
    }
}
`;

/** Metadata for the Cloudflare Worker upload (Durable Object bindings + migrations). */
export const RELAY_WORKER_METADATA = {
    main_module: 'worker.js',
    bindings: [
        { type: 'durable_object_namespace', name: 'RELAY_DO', class_name: 'RelayDO' },
    ],
    compatibility_date: '2024-09-01',
    migrations: {
        tag: 'v1',
        new_sqlite_classes: ['RelayDO'],
    },
};
