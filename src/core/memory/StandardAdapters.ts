/**
 * Standard SourceAdapter implementations for the Memory v2 engine.
 *
 *   LocalFileAdapter   `file://` -- read-only fs (Setup A/B desktop)
 *   WebUrlAdapter      `https://` / `http://` -- fetch via host transport
 *   CloudAdapter       `cloud://` -- stub (Phase 7+ once UCM lands)
 *
 * Vault adapter (`vault://`) is intentionally not in this file; it is
 * Plugin-specific and lives next to the Obsidian wiring in
 * src/main.ts. ADR-080 insists the engine knows only the interface.
 *
 * FEATURE-0317 / PLAN-006 task 11.
 */

import type { SourceAdapter, ResolvedSource } from './SourceAdapter';

// ----- ThreadAdapter ---------------------------------------------------------

/**
 * Reads a conversation thread by its id. The host wires the transport;
 * the engine only knows the interface, so a future UCM host can wire
 * cross-provider conversations under the same scheme.
 */
export interface ThreadTransport {
    /** Returns title + a short summary for the thread, or null when missing. */
    read(threadId: string): Promise<{ title: string; summary: string } | null>;
}

export class ThreadAdapter implements SourceAdapter {
    public readonly scheme = 'thread';

    constructor(private readonly transport: ThreadTransport) {}

    canHandle(uri: string): boolean {
        return uri.startsWith('thread://');
    }

    async resolve(uri: string): Promise<ResolvedSource | null> {
        const id = uri.slice('thread://'.length);
        if (!id) return null;
        const data = await this.transport.read(id);
        if (!data) return null;
        return {
            uri,
            scheme: 'thread',
            content: data.summary,
            title: data.title || `Conversation ${id}`,
        };
    }
}

// ----- LocalFileAdapter ------------------------------------------------------

export interface LocalFileTransport {
    /** Returns the file content as UTF-8 string, or null when missing. */
    read(absolutePath: string): Promise<string | null>;
}

export class LocalFileAdapter implements SourceAdapter {
    public readonly scheme = 'file';

    constructor(private readonly fs: LocalFileTransport) {}

    canHandle(uri: string): boolean {
        return uri.startsWith('file://');
    }

    async resolve(uri: string): Promise<ResolvedSource | null> {
        const path = uri.slice('file://'.length);
        if (!path) return null;
        const content = await this.fs.read(path);
        if (content === null) return null;
        return {
            uri,
            scheme: 'file',
            content,
            title: path.split('/').pop() ?? path,
        };
    }
}

// ----- WebUrlAdapter ---------------------------------------------------------

export interface WebFetchTransport {
    /** Returns response body string + status, or null on network/HTTP error. */
    fetchText(url: string): Promise<{ body: string; status: number } | null>;
}

export class WebUrlAdapter implements SourceAdapter {
    public readonly scheme: 'https' | 'http';

    constructor(
        private readonly fetcher: WebFetchTransport,
        scheme: 'https' | 'http' = 'https',
    ) {
        this.scheme = scheme;
    }

    canHandle(uri: string): boolean {
        return uri.startsWith(`${this.scheme}://`);
    }

    async resolve(uri: string): Promise<ResolvedSource | null> {
        const result = await this.fetcher.fetchText(uri);
        if (!result || result.status >= 400) return null;
        return {
            uri,
            scheme: this.scheme,
            content: result.body,
            title: uri,
            metadata: { status: result.status },
        };
    }
}

// ----- CloudAdapter (Phase-7 stub) -------------------------------------------

export class CloudAdapterStub implements SourceAdapter {
    public readonly scheme = 'cloud';
    canHandle(uri: string): boolean { return uri.startsWith('cloud://'); }
    /** Phase 7 / UCM connects this. Phase 3 returns null so the URI
     *  survives as a reference token but doesn't render. */
    // eslint-disable-next-line @typescript-eslint/require-await -- SourceAdapter interface contract; Phase 7 wires the network call
    async resolve(_uri: string): Promise<ResolvedSource | null> { return null; }
}
