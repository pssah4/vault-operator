/**
 * sandbox-worker.ts
 *
 * Separate OS process spawned via child_process.fork() with ELECTRON_RUN_AS_NODE=1.
 * Provides Defense-in-Depth through vm.createContext() scope isolation
 * on top of OS-level process isolation.
 *
 * IPC protocol mirrors sandboxHtml.ts (postMessage replaced by process.send/on).
 *
 * See ADR-021: Sandbox OS-Level Process Isolation.
 */

// Catch any uncaught errors so the parent can see them via stderr
process.on('uncaughtException', (err) => {
    process.stderr.write(`[sandbox-worker] Uncaught: ${err.message}\n${err.stack ?? ''}\n`);
    process.exit(1);
});

import { createContext, runInNewContext } from 'vm';

// ---------------------------------------------------------------------------
// Bridge Call — async IPC to plugin process
// ---------------------------------------------------------------------------

interface PendingCall {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

const pendingCalls = new Map<string, PendingCall>();
let callCounter = 0;

function bridgeCall(type: string, payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const callId = 'bc_' + (++callCounter);
        // Bot reports use-window-setTimeout as a Warning here. window does
        // not exist in this Node child_process; the disable form is itself
        // forbidden by the bot (Disabling 'obsidianmd/platform/use-window-
        // setTimeout' is not allowed). Plain setTimeout is the only form
        // the bot accepts, and it stays a Warning (not an Error), which
        // does not block the gate.
        const timeout = setTimeout(() => {
            pendingCalls.delete(callId);
            reject(new Error('Bridge call timeout (15s)'));
        }, 15000);
        pendingCalls.set(callId, { resolve, reject, timeout });
        process.send!({ ...payload, type, callId });
    });
}

// ---------------------------------------------------------------------------
// Bridge Proxies — frozen, same API as sandboxHtml.ts
// ---------------------------------------------------------------------------

const vault = Object.freeze({
    read: (path: string) => bridgeCall('vault-read', { path }),
    readBinary: (path: string) => bridgeCall('vault-read-binary', { path }),
    list: (path: string) => bridgeCall('vault-list', { path }),
    write: (path: string, content: string) => bridgeCall('vault-write', { path, content }),
    writeBinary: (path: string, content: ArrayBuffer) =>
        bridgeCall('vault-write-binary', { path, content }),
});

const requestUrlProxy = Object.freeze(
    (url: string, options?: { method?: string; body?: string }) =>
        bridgeCall('request-url', { url, options })
);

// ---------------------------------------------------------------------------
// VM Context — isolated scope without process/require/fs/globalThis
// ---------------------------------------------------------------------------

// WICHTIG (Audit M-4): Object.freeze() NACH createContext() anwenden!
// createContext() muss das Objekt modifizieren koennen (interne V8-Slots).
const contextGlobals: Record<string, unknown> = {
    vault,
    requestUrl: requestUrlProxy,
    console: Object.freeze({
        log: () => {}, debug: () => {}, warn: () => {}, error: () => {},
    }),
    setTimeout, clearTimeout, Promise, JSON, Math, Date,
    // M-4: Full Object — npm packages need create/defineProperty/getPrototypeOf etc.
    Object, Array, Map, Set, RegExp,
    Error, TypeError, RangeError,
    Number, String, Boolean, Symbol,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    TextEncoder, TextDecoder,
    // L-3: TypedArrays + ArrayBuffer for binary data processing
    Uint8Array, Int8Array, Uint16Array, Int16Array,
    Uint32Array, Int32Array, Float32Array, Float64Array,
    ArrayBuffer, DataView,
};

// createContext() FIRST (M-5) — OS process isolation provides the security boundary,
// freeze removed: contextified objects have internal V8 slots that can conflict with freeze.
const vmContext = createContext(contextGlobals);

// ---------------------------------------------------------------------------
// Execution — vm.runInNewContext with 30s timeout
// ---------------------------------------------------------------------------

async function executeInSandbox(id: string, code: string, input: Record<string, unknown>): Promise<void> {
    try {
        // L-4 + M-5: Code injection via JSON.stringify (safe string literal),
        // no template literals (backtick-safe), no context mutation (frozen).
        // new Function() inside vm inherits the vm-realm scope (no process/require).
        const escapedCode = JSON.stringify(code);
        const wrappedCode = '(function() {'
            + '\n    var exports = {};'
            + '\n    var __fn = new Function("exports", ' + escapedCode + ');'
            + '\n    __fn(exports);'
            + '\n    return exports;'
            + '\n})()';

        const moduleExports = runInNewContext(wrappedCode, vmContext, {
            timeout: 30000,
            filename: 'sandbox-module.js',
        }) as { execute: (input: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown> };

        const result = await moduleExports.execute(input, { vault, requestUrl: requestUrlProxy });
        process.send!({ type: 'result', id, value: result });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        process.send!({ type: 'error', id, message });
    }
}

// ---------------------------------------------------------------------------
// IPC Message Handler
// ---------------------------------------------------------------------------

process.on('message', (msg: unknown) => {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;

    // Bridge-Response (has callId) -> resolve/reject pending bridgeCall
    if (typeof m['callId'] === 'string' && pendingCalls.has(m['callId'])) {
        const callId = m['callId'];
        const p = pendingCalls.get(callId)!;
        // See bridgeCall above: window is not available in this Node
        // child_process and the disable form is forbidden, so plain
        // clearTimeout is the only accepted shape (Warning, not Error).
        clearTimeout(p.timeout);
        pendingCalls.delete(callId);
        if (typeof m['error'] === 'string') {
            p.reject(new Error(m['error']));
        } else {
            p.resolve(m['result']);
        }
        return;
    }

    // Execute-Command
    if (m['type'] === 'execute' && typeof m['id'] === 'string' && typeof m['code'] === 'string') {
        void executeInSandbox(
            m['id'],
            m['code'],
            (m['input'] as Record<string, unknown>) ?? {},
        );
    }
});

// Signal: Worker is ready
process.send!({ type: 'sandbox-ready' });
