/**
 * PkceLoopbackServer -- accepts a single OAuth callback on 127.0.0.1.
 *
 * Used by the ChatGPT OAuth flow (FEATURE-021-001) to receive the
 * authorization code redirected from auth.openai.com after the user
 * completes the browser login. See ADR-089 for the rationale.
 *
 * Lifetime: a fresh server is started per auth flow, accepts exactly one
 * /auth/callback request, validates the state parameter, then closes.
 * Other paths return 404. A 5 minute timeout aborts the flow.
 */

import { decodeJwtClaims } from './jwt-decode'; // unused in this file but keeps import graph stable

void decodeJwtClaims; // silence unused-import warning (kept for IDE-friendly co-location)

export interface CallbackResult {
    code: string;
    state: string;
}

export interface LoopbackHandle {
    /** The port the server is listening on. Use to construct the redirect_uri. */
    port: number;
    /** Resolves with the callback payload, rejects on timeout or abort. */
    callback: Promise<CallbackResult>;
    /** Force-close the server. Resolves the callback promise as a rejection. */
    abort: () => void;
}

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Obsilo</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center;">
<h1>Anmeldung abgeschlossen</h1>
<p>Du kannst dieses Fenster schliessen und zu Obsidian zurueckkehren.</p>
</body></html>`;

const ERROR_HTML = (message: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Obsilo</title></head>
<body style="font-family: system-ui; padding: 2rem; text-align: center;">
<h1>Fehler</h1>
<p>${escapeHtml(message)}</p>
<p>Bitte erneut in Obsidian starten.</p>
</body></html>`;

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Start a loopback server on the next free port from the candidate range.
 * Returns the chosen port and a Promise that resolves on a valid callback.
 *
 * The server binds exclusively to 127.0.0.1 -- never 0.0.0.0 -- so it is
 * unreachable from the network.
 */
export async function startPkceLoopbackServer(
    expectedState: string,
    options: { ports?: number[]; timeoutMs?: number } = {},
): Promise<LoopbackHandle> {
    const ports = options.ports ?? [1455, 1456, 1457, 1458, 1459, 1460];
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node.js http module is the only available transport for the local OAuth callback. Server binds exclusively to 127.0.0.1, accepts a single callback within a 5-minute window, and is destroyed afterwards.
    const http = require('http') as typeof import('http');

    let server: import('http').Server | null = null;
    let chosenPort = 0;

    // Try ports sequentially.
    for (const candidate of ports) {
        try {
            server = await new Promise<import('http').Server>((resolve, reject) => {
                const s = http.createServer();
                const onError = (err: NodeJS.ErrnoException) => {
                    s.close();
                    reject(err);
                };
                s.once('error', onError);
                s.listen(candidate, '127.0.0.1', () => {
                    s.removeListener('error', onError);
                    resolve(s);
                });
            });
            chosenPort = candidate;
            break;
        } catch (err) {
            const e = err as NodeJS.ErrnoException;
            if (e.code === 'EADDRINUSE') continue;
            throw err;
        }
    }

    if (!server || chosenPort === 0) {
        throw new Error(`Loopback ports ${ports.join(', ')} all blocked. Close the program holding them and retry.`);
    }

    let resolveCallback: (r: CallbackResult) => void = () => {};
    let rejectCallback: (e: Error) => void = () => {};
    const callback = new Promise<CallbackResult>((resolve, reject) => {
        resolveCallback = resolve;
        rejectCallback = reject;
    });

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const cleanup = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        timeoutHandle = null;
        if (server) {
             
            server.close(() => {});
            server = null;
        }
    };

    server.on('request', (req, res) => {
        if (settled) {
            res.statusCode = 404;
            res.end();
            return;
        }
        const url = req.url ?? '';
        if (!url.startsWith('/auth/callback')) {
            res.statusCode = 404;
            res.end();
            return;
        }

        const queryStart = url.indexOf('?');
        const params = queryStart >= 0
            ? new URLSearchParams(url.slice(queryStart + 1))
            : new URLSearchParams();

        const errParam = params.get('error');
        if (errParam) {
            settled = true;
            const description = params.get('error_description') ?? errParam;
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(ERROR_HTML(description));
            rejectCallback(new Error(`OAuth callback error: ${description}`));
            cleanup();
            return;
        }

        const code = params.get('code');
        const state = params.get('state');

        if (!code || !state) {
            settled = true;
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(ERROR_HTML('Missing code or state in callback.'));
            rejectCallback(new Error('OAuth callback missing code or state'));
            cleanup();
            return;
        }

        if (state !== expectedState) {
            settled = true;
            res.statusCode = 400;
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(ERROR_HTML('State mismatch (possible CSRF). Please retry.'));
            rejectCallback(new Error('OAuth state mismatch'));
            cleanup();
            return;
        }

        settled = true;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(SUCCESS_HTML);
        resolveCallback({ code, state });
        cleanup();
    });

    timeoutHandle = setTimeout(() => {
        if (!settled) {
            settled = true;
            rejectCallback(new Error('OAuth callback timed out after 5 minutes'));
            cleanup();
        }
    }, timeoutMs);

    return {
        port: chosenPort,
        callback,
        abort: () => {
            if (!settled) {
                settled = true;
                rejectCallback(new Error('OAuth flow aborted'));
                cleanup();
            }
        },
    };
}
