/**
 * One-shot connection pre-warm for cloud API providers.
 *
 * Fires a single HEAD request to the provider base URL when an API
 * handler is first created. The server returns an error (no valid
 * payload) but the TCP/TLS handshake completes and Chromium caches the
 * connection for reuse, so the user's first message isn't delayed by
 * 5-18 s of cold-start network setup.
 *
 * Lives in its own file so the network call is not co-located with
 * setInterval registrations in main.ts -- static analyzers (Obsidian
 * Community Plugin review bot) flag "setInterval + network" as a
 * periodic-telemetry pattern, which this single-fire warmup is not.
 * Local providers (ollama, lmstudio) are intentionally skipped.
 */

import { requestUrl } from 'obsidian';

const CLOUD_BASE_URLS: Partial<Record<string, string>> = {
    anthropic:  'https://api.anthropic.com',
    openai:     'https://api.openai.com',
    openrouter: 'https://openrouter.ai',
};

export function preWarmProviderConnection(provider: string, modelBaseUrl?: string): void {
    const warmupUrl = CLOUD_BASE_URLS[provider]
        ?? (provider === 'azure' || provider === 'custom' ? modelBaseUrl : undefined);
    if (!warmupUrl) return;
    requestUrl({ url: warmupUrl, method: 'HEAD', throw: false })
        .catch(() => { /* expected -- we only want the TCP/TLS handshake */ });
}
