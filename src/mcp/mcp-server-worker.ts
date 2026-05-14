/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * MCP Server Worker -- Thin stdio-to-HTTP proxy for Claude Desktop.
 *
 * Claude Desktop starts this process and communicates via stdio using
 * newline-delimited JSON (one JSON object per line, terminated with \n).
 *
 * This worker forwards all requests to Vault Operator's HTTP endpoint (localhost:27182)
 * where the real MCP server runs inside Obsidian.
 *
 * Architecture:
 *   Claude Desktop  ←stdio (JSON lines)→  this worker  ←HTTP→  Vault Operator (:27182)
 */

const VAULT_OPERATOR_URL = 'http://127.0.0.1:27182';

// AUDIT-006 H-1: Read auth token from well-known file
let mcpToken = '';
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- standalone Node.js worker process, not bundled by esbuild
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- standalone Node.js worker process, not bundled by esbuild
    const path = require('path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- standalone Node.js worker process, not bundled by esbuild
    const os = require('os');
    mcpToken = fs.readFileSync(path.join(os.homedir(), '.obsidian-agent', 'mcp-token'), 'utf-8').trim();
} catch { /* token file not found -- requests will be rejected by server */ }

// ---------------------------------------------------------------------------
// Read newline-delimited JSON from stdin
// ---------------------------------------------------------------------------

let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
    buffer += chunk;

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, '');
        buffer = buffer.slice(newlineIdx + 1);
        if (!line.trim()) continue;

        try {
            const request = JSON.parse(line) as { id?: unknown; method?: string };
            // Notifications (no id) still forward but we suppress empty HTTP responses
            void forwardToVaultOperator(request, request.id !== undefined && request.id !== null);
        } catch {
            process.stderr.write(`[mcp-proxy] Invalid JSON: ${line.slice(0, 100)}\n`);
        }
    }
});

// ---------------------------------------------------------------------------
// Forward to Vault Operator HTTP and write response as JSON line to stdout
// ---------------------------------------------------------------------------

async function forwardToVaultOperator(request: unknown, expectResponse = true): Promise<void> {
    try {
        const http = await import('http');
        const body = JSON.stringify(request);

        const response = await new Promise<string>((resolve, reject) => {
            const req = http.request(VAULT_OPERATOR_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    ...(mcpToken ? { 'Authorization': `Bearer ${mcpToken}` } : {}),
                },
                timeout: 30000,
            }, (res) => {
                let data = '';
                res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
                res.on('end', () => resolve(data));
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.write(body);
            req.end();
        });

        // Write response as newline-delimited JSON (skip for notifications)
        if (expectResponse && response.trim()) {
            process.stdout.write(response + '\n');
        }
    } catch (e) {
        const errorResponse = JSON.stringify({
            jsonrpc: '2.0',
            id: (request as { id?: number })?.id ?? null,
            error: {
                code: -32603,
                message: `Vault Operator not reachable. Is Obsidian running with the connector enabled? (${e instanceof Error ? e.message : String(e)})`,
            },
        });
        process.stdout.write(errorResponse + '\n');
    }
}

// Keep alive
process.stdin.resume();
process.stderr.write('[mcp-proxy] Vault Operator MCP proxy started\n');

/* eslint-enable */
