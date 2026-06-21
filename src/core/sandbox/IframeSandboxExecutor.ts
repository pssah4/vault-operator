/**
 * IframeSandboxExecutor
 *
 * Plugin-side manager for the sandboxed iframe. Creates the iframe lazily,
 * sends code for execution via postMessage, and routes bridge requests
 * (vault access, URL requests) through SandboxBridge.
 *
 * The iframe uses sandbox="allow-scripts" which provides V8 origin
 * isolation (logical boundary, not OS-level in Electron's renderer).
 * The SandboxBridge validates all cross-boundary operations and is
 * the primary security boundary. See also: CSP meta tag in sandboxHtml.
 *
 * Mobile fallback -- on Desktop, use ProcessSandboxExecutor instead.
 * See ADR-021: Sandbox OS-Level Process Isolation.
 */

import type ObsidianAgentPlugin from '../../main';
import type { ISandboxExecutor } from './ISandboxExecutor';
import { SandboxBridge } from './SandboxBridge';
import { SANDBOX_HTML } from './sandboxHtml';

// ---------------------------------------------------------------------------
// Types — Typed bridge message protocol
// ---------------------------------------------------------------------------

interface PendingExecution {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeout: number;
}

/** Messages FROM the sandbox iframe TO the plugin */
type SandboxToPluginMessage =
    | { type: 'sandbox-ready' }
    | { type: 'result'; id: string; value: unknown }
    | { type: 'error'; id: string; message: string }
    | { type: 'vault-read'; callId: string; path: string }
    | { type: 'vault-read-binary'; callId: string; path: string }
    | { type: 'vault-list'; callId: string; path: string }
    // FIX-29-99-03: mkdir was missing from the iframe bridge but the
    // SandboxBridge implementation existed since the desktop sandbox.
    | { type: 'vault-mkdir'; callId: string; path: string }
    | { type: 'vault-write'; callId: string; path: string; content: string }
    | { type: 'vault-write-binary'; callId: string; path: string; content: ArrayBuffer }
    | { type: 'request-url'; callId: string; url: string; options?: { method?: string; body?: string } };

/** Messages FROM the plugin TO the sandbox iframe */
type PluginToSandboxMessage =
    | { type: 'execute'; id: string; code: string; input: Record<string, unknown> }
    | { callId: string; result: unknown }
    | { callId: string; error: string };

// ---------------------------------------------------------------------------
// IframeSandboxExecutor
// ---------------------------------------------------------------------------

export class IframeSandboxExecutor implements ISandboxExecutor {
    private iframe: HTMLIFrameElement | null = null;
    private ready = false;
    private readyPromise: Promise<void> | null = null;
    private pending = new Map<string, PendingExecution>();
    private bridge: SandboxBridge;
    private messageHandler: ((event: MessageEvent) => void) | null = null;

    constructor(private plugin: ObsidianAgentPlugin) {
        this.bridge = new SandboxBridge(plugin);
    }

    /**
     * Lazy initialization — iframe is created only when first needed (~50ms).
     */
    async ensureReady(): Promise<void> {
        if (this.ready) return;
        if (!this.readyPromise) {
            this.readyPromise = this.initialize();
        }
        return this.readyPromise;
    }

    /**
     * Execute compiled JavaScript in the sandbox.
     * Returns the result from the module's execute() function.
     */
    async execute(compiledJs: string, input: Record<string, unknown>): Promise<unknown> {
        await this.ensureReady();
        const id = this.generateId();

        return new Promise<unknown>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                if (this.heapSampler !== null) {
                    window.clearInterval(this.heapSampler);
                    this.heapSampler = null;
                }
                this.pending.delete(id);
                reject(new Error('Sandbox execution timeout (30s)'));
            }, 30000);

            this.pending.set(id, { resolve, reject, timeout });

            // AUDIT-037 L-2: the desktop ProcessSandboxExecutor caps the worker
            // heap at 128 MB via --max-old-space-size. The iframe path has no
            // equivalent V8 lever, so we sample performance.memory every 500 ms
            // and tear the iframe down once usedJSHeapSize crosses
            // HEAP_LIMIT_BYTES. performance.memory is Chromium-only (which
            // Obsidian uses on every platform that has the iframe path), so
            // the sampler is gated on its presence.
            this.startHeapSampler();

            const execMsg: PluginToSandboxMessage = { type: 'execute', id, code: compiledJs, input };
            // L-2 Known Limitation: targetOrigin '*' required for srcdoc iframes (no own origin).
            // Security: event.source check in handleMessage() prevents spoofing in receive direction.
            this.iframe?.contentWindow?.postMessage(execMsg, '*');
        });
    }

    /**
     * AUDIT-037 L-2: heap sampling for the iframe sandbox. Stops itself when
     * pending is empty (every execution finished). On limit breach destroys
     * the iframe and rejects all pending executions so a memory bomb cannot
     * starve the host renderer indefinitely.
     */
    private heapSampler: number | null = null;
    private static readonly HEAP_SAMPLE_INTERVAL_MS = 500;
    private static readonly HEAP_LIMIT_BYTES = 128 * 1024 * 1024;
    private startHeapSampler(): void {
        if (this.heapSampler !== null) return;
        const perf = (window as unknown as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance;
        if (!perf?.memory || typeof perf.memory.usedJSHeapSize !== 'number') return;
        this.heapSampler = window.setInterval(() => {
            if (this.pending.size === 0) {
                if (this.heapSampler !== null) window.clearInterval(this.heapSampler);
                this.heapSampler = null;
                return;
            }
            const used = perf.memory?.usedJSHeapSize ?? 0;
            if (used > IframeSandboxExecutor.HEAP_LIMIT_BYTES) {
                console.warn(`[IframeSandbox] heap cap exceeded (${used} > ${IframeSandboxExecutor.HEAP_LIMIT_BYTES}); terminating sandbox`);
                for (const [, p] of this.pending) {
                    window.clearTimeout(p.timeout);
                    p.reject(new Error('Sandbox terminated: heap limit exceeded (128 MB)'));
                }
                this.pending.clear();
                if (this.heapSampler !== null) window.clearInterval(this.heapSampler);
                this.heapSampler = null;
                this.destroy();
            }
        }, IframeSandboxExecutor.HEAP_SAMPLE_INTERVAL_MS);
    }

    /**
     * Clean up the iframe and pending executions.
     */
    destroy(): void {
        if (this.messageHandler) {
            window.removeEventListener('message', this.messageHandler);
            this.messageHandler = null;
        }
        this.iframe?.remove();
        this.iframe = null;
        this.ready = false;
        this.readyPromise = null;

        for (const p of this.pending.values()) {
            window.clearTimeout(p.timeout);
            p.reject(new Error('Sandbox destroyed'));
        }
        this.pending.clear();
        // AUDIT-037 L-2: clear the heap sampler if destroy() runs while a
        // sandbox call is still in flight (host shutdown, manual teardown).
        if (this.heapSampler !== null) {
            window.clearInterval(this.heapSampler);
            this.heapSampler = null;
        }
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private async initialize(): Promise<void> {
        this.iframe = activeDocument.createElement('iframe');
        this.iframe.sandbox.add('allow-scripts');
        // Review-Bot: CSS class instead of inline style
        this.iframe.addClass('agent-sandbox-iframe');
        this.iframe.srcdoc = SANDBOX_HTML;
        activeDocument.body.appendChild(this.iframe);

        // Wait for 'sandbox-ready' message with timeout (10s)
        await new Promise<void>((resolve, reject) => {
            const INIT_TIMEOUT_MS = 10000;
            const timeout = window.setTimeout(() => {
                window.removeEventListener('message', handler);
                reject(new Error(`Sandbox initialization timeout (${INIT_TIMEOUT_MS}ms). The iframe did not signal readiness.`));
            }, INIT_TIMEOUT_MS);

            const handler = (e: MessageEvent) => {
                const data = e.data as { type?: string } | undefined;
                if (data?.type === 'sandbox-ready') {
                    window.clearTimeout(timeout);
                    window.removeEventListener('message', handler);
                    this.ready = true;
                    resolve();
                }
            };
            window.addEventListener('message', handler);
        });

        // Global message handler for all sandbox communication
        this.messageHandler = (e: MessageEvent) => {
            void this.handleMessage(e);
        };
        window.addEventListener('message', this.messageHandler);
    }

    private async handleMessage(event: MessageEvent): Promise<void> {
        // H-2/M-10: Only accept messages from our sandbox iframe — prevents
        // other plugins in the same Electron renderer from spoofing messages.
        if (event.source !== this.iframe?.contentWindow) return;

        const msg = event.data as SandboxToPluginMessage | undefined;
        if (!msg || !('type' in msg)) return;

        // Execution result/error
        if (msg.type === 'result' || msg.type === 'error') {
            const id = msg.type === 'result' ? msg.id : msg.id;
            const p = this.pending.get(id);
            if (!p) return;
            window.clearTimeout(p.timeout);
            this.pending.delete(id);
            if (msg.type === 'error') {
                p.reject(new Error(msg.message));
            } else {
                p.resolve(msg.value);
            }
            return;
        }

        // Lifecycle message (no bridge action needed)
        if (msg.type === 'sandbox-ready') return;

        // Bridge requests from the iframe — all have callId
        const bridgeMsg = msg;

        try {
            let result: unknown;
            if (bridgeMsg.type === 'vault-read') {
                result = await this.bridge.vaultRead(bridgeMsg.path);
            } else if (bridgeMsg.type === 'vault-read-binary') {
                result = await this.bridge.vaultReadBinary(bridgeMsg.path);
            } else if (bridgeMsg.type === 'vault-list') {
                // FIX-29-99-03: pre-fix `result = this.bridge.vaultList(...)`
                // left the un-resolved Promise as the message payload, which
                // postMessage cannot structured-clone -- the iframe sandbox
                // silently got an empty result back. SandboxBridge.vaultList
                // is async (returns Promise<string[]>); awaiting it here
                // mirrors the other bridge calls in this switch.
                result = await this.bridge.vaultList(bridgeMsg.path);
            } else if (bridgeMsg.type === 'vault-mkdir') {
                // FIX-29-99-03: skill-creator on mobile needs to create
                // folders. SandboxBridge.vaultMkdir was implemented but the
                // iframe message router never reached it -- new branch here
                // plus the corresponding `vault.mkdir(...)` proxy in
                // sandboxHtml.ts.
                await this.bridge.vaultMkdir(bridgeMsg.path);
                result = true;
            } else if (bridgeMsg.type === 'vault-write') {
                await this.bridge.vaultWrite(bridgeMsg.path, bridgeMsg.content);
                result = true;
            } else if (bridgeMsg.type === 'vault-write-binary') {
                await this.bridge.vaultWriteBinary(bridgeMsg.path, bridgeMsg.content);
                result = true;
            } else if (bridgeMsg.type === 'request-url') {
                result = await this.bridge.requestUrlBridge(bridgeMsg.url, bridgeMsg.options);
            } else {
                return;
            }

            const response: PluginToSandboxMessage = { callId: bridgeMsg.callId, result };
            // L-2: targetOrigin '*' -- see execute() comment for rationale
            this.iframe?.contentWindow?.postMessage(response, '*');
        } catch (e) {
            // M-8: Record error for circuit breaker
            this.bridge.recordError();
            const errorResponse: PluginToSandboxMessage = {
                callId: bridgeMsg.callId,
                error: e instanceof Error ? e.message : String(e),
            };
            this.iframe?.contentWindow?.postMessage(errorResponse, '*');
        }
    }

    private generateId(): string {
        return 'sx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
}
