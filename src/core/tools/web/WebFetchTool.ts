/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * WebFetchTool - Fetch a URL and return readable content.
 *
 * Uses node:http / node:https directly so we can re-run the SSRF guard on every
 * redirect hop (Obsidian's requestUrl follows redirects internally without an
 * exposed cap, which would defeat per-hop validation). Converts HTML to Markdown
 * for clean LLM consumption. Adapted from Kilo Code's UrlContentFetcher pattern.
 */

import dns from 'dns';
import net from 'net';
import http from 'http';
import https from 'https';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';

/**
 * Strict IPv4 dotted-quad regex: exactly four 0-255 octets, no leading zeros beyond a single 0.
 * `net.isIPv4` is the source of truth where available; this is the fallback shape check.
 */
const IPV4_OCTET_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * Strip surrounding IPv6 brackets and an optional zone-id suffix (fe80::1%eth0).
 * Returns the bare address text suitable for net.isIP and pattern checks.
 */
function normalizeHostForIpCheck(host: string): string {
    let h = host.trim().toLowerCase();
    if (h.startsWith('[') && h.endsWith(']')) {
        h = h.slice(1, -1);
    }
    // Strip IPv6 zone-id (RFC 6874) so fe80::1%eth0 still matches the link-local pattern.
    const pct = h.indexOf('%');
    if (pct >= 0) {
        h = h.slice(0, pct);
    }
    return h;
}

/**
 * Check whether an IP literal belongs to a private/internal network range.
 * Covers RFC 1918, loopback, CGNAT (RFC 6598), link-local + APIPA, multicast, broadcast,
 * unspecified, and IPv6 equivalents (loopback, link-local, ULA, IPv4-mapped wrappers).
 * Accepts both bracketed and unbracketed IPv6 input.
 */
export function isPrivateIP(ip: string): boolean {
    const bare = normalizeHostForIpCheck(ip);

    // IPv4
    if (net.isIPv4(bare)) {
        const parts = bare.split('.');
        // Each octet must be a strict integer in 0-255; reject anything else.
        if (parts.length !== 4 || !parts.every((p) => IPV4_OCTET_RE.test(p))) return false;
        const [a, b] = parts.map((p) => parseInt(p, 10));
        return (
            a === 0 ||                                   // 0.0.0.0/8     "this" network / unspecified
            a === 10 ||                                  // 10.0.0.0/8    RFC 1918
            a === 127 ||                                 // 127.0.0.0/8   loopback
            (a === 100 && b >= 64 && b <= 127) ||        // 100.64.0.0/10 CGNAT (RFC 6598)
            (a === 169 && b === 254) ||                  // 169.254.0.0/16 link-local / APIPA / cloud metadata
            (a === 172 && b >= 16 && b <= 31) ||         // 172.16.0.0/12 RFC 1918
            (a === 192 && b === 168) ||                  // 192.168.0.0/16 RFC 1918
            (a >= 224 && a <= 239) ||                    // 224.0.0.0/4   multicast
            (a >= 240 && a <= 255)                       // 240.0.0.0/4   reserved + 255.255.255.255 broadcast
        );
    }

    // IPv6
    if (net.isIPv6(bare)) {
        const norm = bare;

        // Unspecified ::
        if (norm === '::' || norm === '::0') return true;
        // Loopback ::1
        if (norm === '::1') return true;
        // Link-local fe80::/10 (covers fe80, fe90, fea0, feb0 prefixes; first nibble after fe is 8-b)
        if (/^fe[89ab][0-9a-f]?:/i.test(norm)) return true;
        // Unique-local fc00::/7 (fc.. or fd..)
        if (/^f[cd][0-9a-f]{2}:/.test(norm)) return true;
        // Multicast ff00::/8
        if (/^ff[0-9a-f]{2}:/.test(norm)) return true;

        // IPv4-mapped IPv6 ::ffff:0:0/96 and IPv4-compatible ::a.b.c.d.
        // Two shapes: ::ffff:127.0.0.1 (dotted) and ::ffff:7f00:1 (hex compressed).
        const dottedMatch = /:((?:\d{1,3}\.){3}\d{1,3})$/.exec(norm);
        if (dottedMatch) {
            return isPrivateIP(dottedMatch[1]);
        }
        // Hex form: ::ffff:HHHH:HHHH or ::HHHH:HHHH (IPv4-compatible legacy).
        const hexMatch = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(norm);
        if (hexMatch) {
            const hi = parseInt(hexMatch[1], 16);
            const lo = parseInt(hexMatch[2], 16);
            const a = (hi >> 8) & 0xff;
            const b = hi & 0xff;
            const c = (lo >> 8) & 0xff;
            const d = lo & 0xff;
            return isPrivateIP(`${a}.${b}.${c}.${d}`);
        }
        return false;
    }

    // Not a recognized IP literal.
    return false;
}

/**
 * Hostname suffix denylist: split-horizon corporate networks and common
 * internal-only TLDs that should never be reachable from an agent fetch.
 * Matched case-insensitively against the trimmed bracket-stripped hostname.
 */
const INTERNAL_HOSTNAME_SUFFIXES: ReadonlyArray<string> = [
    '.localhost',
    '.local',
    '.internal',
    '.intranet',
    '.intra',
    '.corp',
    '.lan',
    '.home',
    '.home.arpa',
];

export function hasInternalSuffix(host: string): boolean {
    const h = host.trim().toLowerCase();
    if (h === 'localhost') return true;
    return INTERNAL_HOSTNAME_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

interface WebFetchInput {
    url: string;
    maxLength?: number;
    startIndex?: number;
}

export class WebFetchTool extends BaseTool<'web_fetch'> {
    readonly name = 'web_fetch' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'web_fetch',
            description:
                'Fetch a URL and return its content as readable text. Use for reading documentation, articles, APIs, or any public webpage. HTML is automatically converted to Markdown.',
            input_schema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to fetch (must start with http:// or https://).',
                    },
                    maxLength: {
                        type: 'number',
                        description:
                            'Maximum characters to return (default: 20000). Large pages are truncated.',
                    },
                    startIndex: {
                        type: 'number',
                        description:
                            'Start reading from this character offset (default: 0). Use with maxLength to paginate large pages.',
                    },
                },
                required: ['url'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { url, maxLength = 20000, startIndex = 0 } = input as unknown as WebFetchInput;
        const { callbacks } = context;

        if (!url) {
            callbacks.pushToolResult(this.formatError(new Error('url parameter is required')));
            return;
        }

        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            callbacks.pushToolResult(
                this.formatError(new Error('URL must start with http:// or https://'))
            );
            return;
        }

        // H-3 + M-2 + M-3 + L-5 + L-13 + L-14: Two-phase SSRF check, re-run on every redirect hop.
        // Phase 1: Reject obviously private hostnames and split-horizon suffixes (fast, no DNS).
        // Phase 2: Resolve DNS via the OS resolver (same path the network stack uses) and reject
        //   any resolved private IP. Fail closed when lookup fails for non-IP hostnames so a
        //   silently-swallowed DNS error cannot let the request slip through.
        // TOCTOU note: a fast rebinding between our check and connect remains theoretically
        // possible but requires sub-second TTL manipulation. The manual redirect loop ensures
        // each hop in a redirect chain is re-validated, closing the L-14 redirect bypass.
        const guardResult = await this.guardUrl(url);
        if (!guardResult.ok) {
            callbacks.pushToolResult(this.formatError(new Error(guardResult.reason)));
            return;
        }

        try {
            callbacks.log(`Fetching: ${url}`);

            const TIMEOUT_MS = 15_000;
            const response = await this.fetchWithRedirectGuard(url, TIMEOUT_MS);

            const statusCode = response.status;

            if (statusCode >= 400) {
                callbacks.pushToolResult(
                    this.formatError(
                        new Error(`HTTP ${statusCode} error fetching ${url}`)
                    )
                );
                return;
            }

            const contentType = (response.headers['content-type'] ?? '').toLowerCase();
            let content: string;

            // M-4: Limit raw response size before HTML parsing to prevent ReDoS on
            // giant pages with complex regex patterns in htmlToMarkdown().
            const MAX_PARSE_BYTES = 2_000_000; // 2 MB
            const rawText = response.text ?? '';
            const safeText = rawText.length > MAX_PARSE_BYTES ? rawText.slice(0, MAX_PARSE_BYTES) : rawText;

            if (contentType.includes('text/html') || contentType === '') {
                content = this.htmlToMarkdown(safeText);
            } else {
                // Plain text, JSON, etc.
                content = safeText;
            }

            // Apply pagination
            const totalLength = content.length;
            const slice = content.slice(startIndex, startIndex + maxLength);
            const truncated = startIndex + maxLength < totalLength;

            // AUDIT-034 L-15: wrap web body in the untrusted-content boundary
            // tag so the model treats fetched markup as data, not instructions.
            let body = slice;
            if (truncated) {
                body += `\n\n[Content truncated. Use startIndex=${startIndex + maxLength} to read more.]`;
            }
            const result = this.formatUntrustedContent('web', body, {
                url,
                status: String(statusCode),
                chars: String(totalLength),
            });

            callbacks.pushToolResult(result);
            callbacks.log(
                `Fetched ${url} — ${statusCode}, ${slice.length} chars returned${truncated ? ' (truncated)' : ''}`
            );
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }

    // ---------------------------------------------------------------------------
    // SSRF guard + redirect-safe fetcher (M-3, L-5, L-13, L-14)
    // ---------------------------------------------------------------------------

    /**
     * Validate a URL against the SSRF policy.
     * Phase 1: scheme allowlist, bracket-stripped hostname checked against IP private ranges
     *          and the internal-suffix denylist.
     * Phase 2: OS-resolver lookup for non-IP hostnames; any private resolved IP rejects.
     *          Lookup failures for non-IP hostnames fail closed (return reason), since a
     *          silently-swallowed split-horizon NXDOMAIN previously let public-DNS misses
     *          fall through to the network stack that DID resolve the internal name.
     */
    private async guardUrl(url: string): Promise<{ ok: true } | { ok: false; reason: string }> {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            return { ok: false, reason: 'Invalid URL' };
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { ok: false, reason: 'URL must start with http:// or https://' };
        }
        const rawHost = parsed.hostname.toLowerCase();
        const bareHost = normalizeHostForIpCheck(rawHost);

        if (hasInternalSuffix(bareHost)) {
            return {
                ok: false,
                reason: 'Access to private/internal network addresses is not allowed',
            };
        }
        if (isPrivateIP(bareHost)) {
            return {
                ok: false,
                reason: 'Access to private/internal network addresses is not allowed',
            };
        }

        // IP literals do not need a DNS lookup.
        if (net.isIP(bareHost)) {
            return { ok: true };
        }

        // Phase 2: OS resolver. Use dns.promises.lookup so the same resolver the network
        // stack uses on connect drives the decision. Split-horizon corporate DNS now
        // returns the same answer to both our guard and the actual request.
        try {
            const addrs = await dns.promises.lookup(bareHost, { all: true, verbatim: true });
            if (addrs.length === 0) {
                return {
                    ok: false,
                    reason: `Hostname "${bareHost}" could not be resolved`,
                };
            }
            for (const addr of addrs) {
                if (isPrivateIP(addr.address)) {
                    return {
                        ok: false,
                        reason: `Hostname "${bareHost}" resolves to private address ${addr.address}; access denied (SSRF protection)`,
                    };
                }
            }
            return { ok: true };
        } catch {
            // Fail closed for hostnames we cannot resolve. IP literals are already accepted above.
            return {
                ok: false,
                reason: `Hostname "${bareHost}" could not be resolved; refusing fetch (SSRF protection)`,
            };
        }
    }

    /**
     * Fetch a URL with manual redirect handling. Each redirect hop is re-validated
     * through guardUrl before it is followed, which closes the L-14 redirect-bypass gap
     * (Obsidian's requestUrl follows redirects internally without re-running the guard).
     * The actual transport is node:http / node:https; we never delegate to requestUrl
     * because that would re-introduce the uncapped redirect chain.
     */
    private async fetchWithRedirectGuard(
        initialUrl: string,
        timeoutMs: number,
    ): Promise<{ status: number; headers: Record<string, string>; text: string }> {
        const MAX_REDIRECTS = 3;
        let currentUrl = initialUrl;

        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const response = await this.requestOnce(currentUrl, timeoutMs);

            // Not a redirect: return the response payload.
            if (response.status < 300 || response.status >= 400) {
                return response;
            }

            // Redirect: resolve Location relative to current URL, validate, then continue.
            const location = response.headers['location'] ?? response.headers['Location'];
            if (!location) {
                // Redirect status without a Location header: nothing safe to do, return as-is.
                return response;
            }
            if (hop === MAX_REDIRECTS) {
                throw new Error(
                    `Redirect limit (${MAX_REDIRECTS}) exceeded while fetching ${initialUrl}`,
                );
            }
            let nextUrl: string;
            try {
                nextUrl = new URL(location, currentUrl).toString();
            } catch {
                throw new Error(`Invalid redirect target "${location}" from ${currentUrl}`);
            }
            const guardResult = await this.guardUrl(nextUrl);
            if (!guardResult.ok) {
                throw new Error(
                    `Redirect to "${nextUrl}" blocked: ${guardResult.reason}`,
                );
            }
            currentUrl = nextUrl;
        }
        // Unreachable; the loop returns or throws.
        throw new Error(`Redirect handling exited unexpectedly for ${initialUrl}`);
    }

    /**
     * Single HTTP request via node:http / node:https that does NOT follow redirects.
     * Returns the raw status, headers, and decoded body text. Times out after timeoutMs.
     * We intentionally bypass Obsidian's requestUrl here because it follows redirects
     * internally with no exposed cap, which would defeat the per-hop guard.
     */
    private requestOnce(
        url: string,
        timeoutMs: number,
    ): Promise<{ status: number; headers: Record<string, string>; text: string }> {
        return new Promise((resolve, reject) => {
            let parsed: URL;
            try {
                parsed = new URL(url);
            } catch {
                reject(new Error(`Invalid URL: ${url}`));
                return;
            }
            const isHttps = parsed.protocol === 'https:';
            const lib = isHttps ? https : http;

            const req = lib.request(
                {
                    protocol: parsed.protocol,
                    hostname: parsed.hostname,
                    port: parsed.port || (isHttps ? 443 : 80),
                    path: `${parsed.pathname}${parsed.search}`,
                    method: 'GET',
                    headers: {
                        'User-Agent':
                            'Mozilla/5.0 (compatible; ObsidianAgent/1.0; +https://obsidian.md)',
                        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        // Explicit identity: we do not decompress in this transport path.
                        'Accept-Encoding': 'identity',
                        Host: parsed.host,
                    },
                },
                (res) => {
                    // Socket-level rebinding defense: inspect the actual remoteAddress now
                    // that the connection is established. Catches TOCTOU between guard and
                    // connect even when the OS resolver agreed with our pre-check.
                    const remote = res.socket && (res.socket as { remoteAddress?: string }).remoteAddress;
                    if (remote && isPrivateIP(remote)) {
                        req.destroy();
                        reject(
                            new Error(
                                `Connection to "${parsed.hostname}" landed on private address ${remote}; access denied (SSRF protection)`,
                            ),
                        );
                        return;
                    }
                    const chunks: Buffer[] = [];
                    res.on('data', (chunk: Buffer) => chunks.push(chunk));
                    res.on('end', () => {
                        const body = Buffer.concat(chunks).toString('utf8');
                        const headers: Record<string, string> = {};
                        for (const [k, v] of Object.entries(res.headers)) {
                            if (typeof v === 'string') headers[k] = v;
                            else if (Array.isArray(v)) headers[k] = v.join(', ');
                        }
                        resolve({
                            status: res.statusCode ?? 0,
                            headers,
                            text: body,
                        });
                    });
                    res.on('error', (err) => reject(err));
                },
            );
            req.on('error', (err) => reject(err));
            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`Request timed out after ${timeoutMs / 1000}s`));
            });
            req.end();
        });
    }

    // ---------------------------------------------------------------------------
    // HTML → Markdown converter (no external dependencies)
    // ---------------------------------------------------------------------------

    private htmlToMarkdown(html: string): string {
        let md = html;

        // Remove DOCTYPE, comments (loop to handle nested/reconstructed sequences)
        md = md.replace(/<!DOCTYPE[^>]*>/gi, '');
        while (/<!--[\s\S]*?-->/g.test(md)) {
            md = md.replace(/<!--[\s\S]*?-->/g, '');
        }

        // Remove <head> entirely (scripts, styles, meta)
        md = md.replace(/<head[\s\S]*?<\/head[^>]*>/gi, '');

        // Remove script and style blocks (loop to handle nested/reconstructed tags,
        // [^>]* in closing tag handles malformed end tags like </script \n bar>)
        while (/<script[\s\S]*?<\/script[^>]*>/gi.test(md)) {
            md = md.replace(/<script[\s\S]*?<\/script[^>]*>/gi, '');
        }
        while (/<style[\s\S]*?<\/style[^>]*>/gi.test(md)) {
            md = md.replace(/<style[\s\S]*?<\/style[^>]*>/gi, '');
        }
        md = md.replace(/<noscript[\s\S]*?<\/noscript[^>]*>/gi, '');

        // Remove nav, footer, aside, header — usually not main content
        md = md.replace(/<nav[\s\S]*?<\/nav>/gi, '');
        md = md.replace(/<footer[\s\S]*?<\/footer>/gi, '');
        md = md.replace(/<aside[\s\S]*?<\/aside>/gi, '');

        // Block-level: headings
        md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
        md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
        md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
        md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
        md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
        md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

        // Block-level: paragraphs, divs, sections
        md = md.replace(/<\/p>/gi, '\n\n');
        md = md.replace(/<p[^>]*>/gi, '\n');
        md = md.replace(/<\/div>/gi, '\n');
        md = md.replace(/<div[^>]*>/gi, '\n');
        md = md.replace(/<\/section>/gi, '\n');
        md = md.replace(/<section[^>]*>/gi, '\n');
        md = md.replace(/<article[^>]*>/gi, '\n');
        md = md.replace(/<\/article>/gi, '\n');
        md = md.replace(/<main[^>]*>/gi, '\n');
        md = md.replace(/<\/main>/gi, '\n');

        // Lists
        md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
        md = md.replace(/<\/?[uo]l[^>]*>/gi, '\n');

        // Inline: links
        md = md.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
        md = md.replace(/<a[^>]+href='([^']*)'[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
        // Links without href
        md = md.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1');

        // Inline: emphasis
        md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, '**$2**');
        md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, '*$2*');

        // Inline: code
        md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');
        md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');

        // Line breaks
        md = md.replace(/<br\s*\/?>/gi, '\n');
        md = md.replace(/<hr\s*\/?>/gi, '\n---\n');

        // Tables (simplified)
        md = md.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, '| $1 ');
        md = md.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, '| $1 ');
        md = md.replace(/<\/tr>/gi, '|\n');
        md = md.replace(/<[^>]*(tr|table|thead|tbody|tfoot)[^>]*>/gi, '\n');

        // Final safety pass: remove any script/style fragments that survived conversion
        // Use while-loops to handle nested/reconstructed fragments like <scr<script>ipt> (CWE-116)
        while (/<\/?script[^>]*>/gi.test(md)) {
            md = md.replace(/<\/?script[^>]*>/gi, '');
        }
        while (/<\/?style[^>]*>/gi.test(md)) {
            md = md.replace(/<\/?style[^>]*>/gi, '');
        }

        // Strip ALL remaining HTML tags in a loop until stable (CWE-116 / CodeQL #50)
        // A single pass can miss tags reconstructed from nested fragments.
        {
            let prev: string;
            do {
                prev = md;
                md = md.replace(/<[^>]+>/g, '');
            } while (md !== prev);
        }

        // Decode common HTML entities (&amp; last to prevent double-unescaping)
        md = md.replace(/&lt;/g, '<');
        md = md.replace(/&gt;/g, '>');
        md = md.replace(/&quot;/g, '"');
        md = md.replace(/&#39;/g, "'");
        md = md.replace(/&nbsp;/g, ' ');
        md = md.replace(/&mdash;/g, '—');
        md = md.replace(/&ndash;/g, '–');
        md = md.replace(/&hellip;/g, '...');
        md = md.replace(/&amp;/g, '&');
        md = md.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
        md = md.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
            String.fromCharCode(parseInt(code, 16))
        );

        // Post-decode safety: entity decoding may reconstruct HTML tags (CodeQL #53)
        // Remove dangerous tags first, then strip all remaining tags until stable.
        while (/<\/?script[^>]*>/gi.test(md)) {
            md = md.replace(/<\/?script[^>]*>/gi, '');
        }
        while (/<\/?style[^>]*>/gi.test(md)) {
            md = md.replace(/<\/?style[^>]*>/gi, '');
        }
        {
            let prev: string;
            do {
                prev = md;
                md = md.replace(/<[^>]+>/g, '');
            } while (md !== prev);
        }

        // Collapse excessive blank lines (max 2 in a row)
        md = md.replace(/\n{3,}/g, '\n\n');

        // Trim leading/trailing whitespace on each line
        md = md
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n');

        return md.trim();
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
