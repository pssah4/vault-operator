/**
 * obsidianFetch -- CORS-free fetch adapter for MCP transports in Obsidian/Electron.
 *
 * Obsidian runs in Electron's renderer process. The browser-native `fetch()` enforces
 * CORS, which blocks SSE connections to MCP servers that don't set Access-Control-Allow-Origin.
 * Obsidian's `requestUrl` bypasses CORS but doesn't support streaming (needed for SSE).
 *
 * This adapter uses Node.js http/https modules (available in Electron with nodeIntegration)
 * which have no CORS restrictions and support streaming responses.
 *
 * Signature matches MCP SDK's FetchLike: (url, init?) => Promise<Response>
 *
 * AUDIT-034 M-14: SSRF guard applied at every call site. The same allow/deny
 * rules as providerUrlGuard reject the AWS / GCP metadata hosts and the
 * 0.0.0.0 wildcard, and reject loopback or RFC 1918 hosts unless the caller
 * explicitly opted in via the `x-obsilo-allow-local` request header. The
 * header is set by McpClient when (and only when) the user enabled the
 * "allow local MCP URLs" toggle in settings.
 */

import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isLocalHostname, isPrivateIpHostname } from '../../api/providers/providerUrlGuard';

/** Mirrors providerUrlGuard.BLOCKED_HOSTNAMES; kept in sync intentionally. */
const BLOCKED_MCP_HOSTNAMES = new Set([
    '0.0.0.0',
    '::',
    '[::]',
    '169.254.169.254',
    '[fd00:ec2::254]',
    'fd00:ec2::254',
    'metadata.google.internal',
    '169.254.169.253',
]);

/** Internal opt-in header. Stripped from the outbound request before send. */
export const MCP_ALLOW_LOCAL_HEADER = 'x-obsilo-allow-local';
const ALLOW_LOCAL_HEADER = MCP_ALLOW_LOCAL_HEADER;

/**
 * CORS-free fetch using Node.js http/https. Returns a standard Web Response
 * with a streaming body (ReadableStream), compatible with the MCP SDK's
 * SSEClientTransport and StreamableHTTPClientTransport.
 */
export function obsidianFetch(url: string | URL, init?: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url.toString());
        } catch {
            reject(new Error('MCP fetch rejected: invalid URL'));
            return;
        }

        // Convert RequestInit headers to plain object up-front so we can read
        // the opt-in flag before running the SSRF guard.
        const headers: Record<string, string> = {};
        if (init?.headers) {
            if (init.headers instanceof Headers) {
                init.headers.forEach((value, key) => { headers[key] = value; });
            } else if (Array.isArray(init.headers)) {
                for (const [key, value] of init.headers) {
                    headers[key] = value;
                }
            } else {
                Object.assign(headers, init.headers);
            }
        }

        // Per-request opt-in to allow loopback / RFC 1918 MCP servers. The
        // McpClient sets this when the user enabled the "allow local MCP
        // URLs" setting. The header is stripped before the wire request so
        // it never leaks to the remote server.
        const allowLocal = (() => {
            for (const k of Object.keys(headers)) {
                if (k.toLowerCase() === ALLOW_LOCAL_HEADER) {
                    const v = headers[k];
                    delete headers[k];
                    return v === '1' || v === 'true';
                }
            }
            return false;
        })();

        // SSRF guard (AUDIT-034 M-14).
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            reject(new Error(`MCP fetch rejected: unsupported protocol "${parsedUrl.protocol}"`));
            return;
        }
        // AUDIT-034 M-29: single normalised hostname form. parsedUrl.hostname
        // already strips IPv6 brackets per WHATWG, but be defensive (some
        // Node URL implementations leave them in for ::1/loopback). Strip
        // here too and use ONLY the cleaned value for the blocklist check
        // so an IPv6 literal like "[::ffff:127.0.0.1]" cannot slip through
        // the redundant double-check that used the un-normalised hostname.
        const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, '');
        if (BLOCKED_MCP_HOSTNAMES.has(hostname)) {
            reject(new Error(`MCP fetch rejected: blocked host "${parsedUrl.host}"`));
            return;
        }
        if (!allowLocal && (isLocalHostname(hostname) || isPrivateIpHostname(hostname))) {
            reject(new Error(
                `MCP fetch rejected: host "${parsedUrl.host}" resolves to a local or private network. `
                + 'Enable "allow local MCP URLs" in settings to permit loopback or RFC 1918 hosts.',
            ));
            return;
        }

        const isHttps = parsedUrl.protocol === 'https:';
        const reqFn = isHttps ? httpsRequest : httpRequest;

        const req = reqFn(
            {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: init?.method ?? 'GET',
                headers,
            },
            (res) => {
                // Convert Node.js IncomingMessage stream to Web ReadableStream
                const body = new ReadableStream<Uint8Array>({
                    start(controller) {
                        res.on('data', (chunk: Buffer) => {
                            controller.enqueue(new Uint8Array(chunk));
                        });
                        res.on('end', () => {
                            try { controller.close(); } catch { /* already closed */ }
                        });
                        res.on('error', (err) => {
                            try { controller.error(err); } catch { /* already errored */ }
                        });
                    },
                    cancel() {
                        res.destroy();
                    },
                });

                // Convert Node.js headers to Web Headers
                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value != null) {
                        if (Array.isArray(value)) {
                            for (const v of value) responseHeaders.append(key, v);
                        } else {
                            responseHeaders.set(key, value);
                        }
                    }
                }

                const response = new Response(body, {
                    status: res.statusCode ?? 200,
                    statusText: res.statusMessage ?? '',
                    headers: responseHeaders,
                });

                resolve(response);
            },
        );

        req.on('error', reject);

        // AbortSignal support
        if (init?.signal) {
            if (init.signal.aborted) {
                req.destroy();
                reject(new DOMException('The operation was aborted.', 'AbortError'));
                return;
            }
            init.signal.addEventListener('abort', () => {
                req.destroy();
            }, { once: true });
        }

        // Write request body
        if (init?.body != null) {
            if (typeof init.body === 'string') {
                req.write(init.body);
            } else if (init.body instanceof ArrayBuffer) {
                req.write(Buffer.from(init.body));
            } else if (init.body instanceof Uint8Array) {
                req.write(Buffer.from(init.body.buffer, init.body.byteOffset, init.body.byteLength));
            } else if (init.body instanceof URLSearchParams) {
                req.write(init.body.toString());
            }
        }

        req.end();
    });
}
