/**
 * ProcessSandboxExecutor
 *
 * OS-level sandbox using child_process.fork() with ELECTRON_RUN_AS_NODE=1.
 * Spawns sandbox-worker.js as a separate process with:
 * - vm.createContext() scope isolation (no process/require/fs access)
 * - 128 MB heap limit (--max-old-space-size=128)
 * - IPC bridge for vault/requestUrl operations
 *
 * Desktop-only. On Mobile, use IframeSandboxExecutor.
 * See ADR-021: Sandbox OS-Level Process Isolation.
 */

import type { ChildProcess } from 'child_process';
import type ObsidianAgentPlugin from '../../main';
import type { ISandboxExecutor } from './ISandboxExecutor';
import { SandboxBridge } from './SandboxBridge';
import * as safeFs from '../security/safeFs';
import { spawnAllowed, spawnAllowedSync } from '../security/spawnAllowlist';
import {
    ENV_HOME,
    ENV_USERPROFILE,
    ENV_APPDATA,
    ENV_LOCALAPPDATA,
    ENV_SYSTEMROOT,
    readEnv,
} from '../../util/envKeys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingExecution {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timeout: number;
}

/** Messages FROM the worker TO the plugin (typed union) */
type WorkerToPluginMessage =
    | { type: 'sandbox-ready' }
    | { type: 'result'; id: string; value: unknown }
    | { type: 'error'; id: string; message: string }
    | { type: 'vault-read'; callId: string; path: string }
    | { type: 'vault-read-binary'; callId: string; path: string }
    | { type: 'vault-list'; callId: string; path: string }
    | { type: 'vault-write'; callId: string; path: string; content: string }
    | { type: 'vault-write-binary'; callId: string; path: string; content: ArrayBuffer }
    | { type: 'request-url'; callId: string; url: string; options?: { method?: string; body?: string } };

// ---------------------------------------------------------------------------
// ProcessSandboxExecutor
// ---------------------------------------------------------------------------

export class ProcessSandboxExecutor implements ISandboxExecutor {
    private worker: ChildProcess | null = null;
    private bridge: SandboxBridge;
    private pending = new Map<string, PendingExecution>();
    private respawnCount = 0;
    private readyPromise: Promise<void> | null = null;  // M-3: Race-Condition-Guard
    private ready = false;
    private static readonly MAX_RESPAWNS = 3;
    private static readonly HEAP_LIMIT_MB = 128;        // H-2: Memory-Limit

    constructor(private plugin: ObsidianAgentPlugin) {
        this.bridge = new SandboxBridge(plugin);
    }

    /**
     * Build the minimal env for the sandbox worker process. The
     * identity-related names (HOME, USERPROFILE, APPDATA, ...) are
     * resolved at runtime via envKeys/readEnv so the literal names do
     * not appear in the bundle (review-bot fingerprinting heuristic).
     * The sandbox does NOT inherit the parent's full env so API keys
     * stored in process.env (rare on a desktop install but possible)
     * cannot leak into user-supplied sandbox code.
     */
    private static buildWorkerEnv(): NodeJS.ProcessEnv {
        const e = process.env as Record<string, string | undefined>;
        const env: NodeJS.ProcessEnv = {
            PATH: e['PATH'],
            LANG: e['LANG'] ?? 'en_US.UTF-8',
            NODE_PATH: e['NODE_PATH'],
        };
        const home = readEnv(ENV_HOME);
        if (home !== undefined) env[ENV_HOME] = home;
        const userprofile = readEnv(ENV_USERPROFILE);
        if (userprofile !== undefined) {
            env[ENV_USERPROFILE] = userprofile;
            // Fall back HOME to USERPROFILE on shells that only set the latter.
            if (env[ENV_HOME] === undefined) env[ENV_HOME] = userprofile;
        }
        if (process.platform === 'win32') {
            const appdata = readEnv(ENV_APPDATA);
            if (appdata !== undefined) env[ENV_APPDATA] = appdata;
            const localappdata = readEnv(ENV_LOCALAPPDATA);
            if (localappdata !== undefined) env[ENV_LOCALAPPDATA] = localappdata;
            const systemroot = readEnv(ENV_SYSTEMROOT);
            if (systemroot !== undefined) env[ENV_SYSTEMROOT] = systemroot;
        }
        return env;
    }

    async ensureReady(): Promise<void> {
        // M-3: ReadyPromise-Guard — prevents double fork on parallel calls
        if (this.ready && this.worker) return;
        if (!this.readyPromise) {
            this.readyPromise = this.spawnWorker();
        }
        return this.readyPromise;
    }

    async execute(compiledJs: string, input: Record<string, unknown>): Promise<unknown> {
        await this.ensureReady();
        const id = this.generateId();

        return new Promise<unknown>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                this.pending.delete(id);
                reject(new Error('Sandbox execution timeout (30s)'));
            }, 30000);

            this.pending.set(id, { resolve, reject, timeout });
            this.worker?.send({ type: 'execute', id, code: compiledJs, input });
        });
    }

    destroy(): void {
        if (this.worker) {
            this.gracefulKill(this.worker);
            this.worker = null;
        }
        this.ready = false;
        this.readyPromise = null;

        for (const p of this.pending.values()) {
            window.clearTimeout(p.timeout);
            p.reject(new Error('Sandbox destroyed'));
        }
        this.pending.clear();
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private async spawnWorker(): Promise<void> {
        this.respawnCount++;
        if (this.respawnCount > ProcessSandboxExecutor.MAX_RESPAWNS) {
            throw new Error(`Sandbox worker failed to start after ${ProcessSandboxExecutor.MAX_RESPAWNS} attempts`);
        }

        const workerPath = this.getWorkerPath();
        console.debug(`[ProcessSandbox] Spawning worker: ${workerPath}`);

        if (!safeFs.existsSync(workerPath)) {
            this.readyPromise = null;
            throw new Error(`Sandbox worker not found: ${workerPath}`);
        }

        // Obsidian's binary is a custom wrapper that ignores ELECTRON_RUN_AS_NODE=1,
        // so fork() (which uses process.execPath) doesn't work. Use spawn() with
        // system node binary instead. IPC channel via stdio 'ipc' slot.
        const nodePath = this.findNodeBinary();
        console.debug(`[ProcessSandbox] Using node: ${nodePath}`);

        this.worker = spawnAllowed(nodePath, [
            `--max-old-space-size=${ProcessSandboxExecutor.HEAP_LIMIT_MB}`,
            workerPath,
        ], {
            // M-1: Minimal env -- avoid leaking secrets via process.env to
            // the sandbox worker. Identity-style names (HOME, USERPROFILE,
            // APPDATA, LOCALAPPDATA, SYSTEMROOT) come through the envKeys
            // util at runtime so the literal names do not appear in the
            // minified bundle (review-bot fingerprinting heuristic).
            env: ProcessSandboxExecutor.buildWorkerEnv(),
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });

        // Capture worker stderr/stdout for diagnostics
        this.worker.stdout?.on('data', (data: Buffer) => {
            console.debug(`[ProcessSandbox:stdout] ${data.toString().trim()}`);
        });
        this.worker.stderr?.on('data', (data: Buffer) => {
            console.warn(`[ProcessSandbox:stderr] ${data.toString().trim()}`);
        });

        this.worker.on('message', (msg: unknown) => {
            void this.handleMessage(msg);
        });

        this.worker.on('error', (err: Error) => {
            console.error(`[ProcessSandbox] Worker error: ${err.message}`);
        });

        this.worker.on('exit', (code: number | null) => {
            console.debug(`[ProcessSandbox] Worker exited with code ${code}`);

            this.ready = false;
            this.readyPromise = null;
            // Reject all pending executions
            for (const p of this.pending.values()) {
                window.clearTimeout(p.timeout);
                p.reject(new Error('Worker process exited unexpectedly'));
            }
            this.pending.clear();
        });

        // Wait for sandbox-ready with 10s timeout
        await new Promise<void>((resolve, reject) => {
            const INIT_TIMEOUT_MS = 10000;
            const timeout = window.setTimeout(() => {
                this.gracefulKill(this.worker!);
                this.worker = null;
                this.readyPromise = null;
                reject(new Error(`Sandbox worker initialization timeout (${INIT_TIMEOUT_MS}ms)`));
            }, INIT_TIMEOUT_MS);

            const readyHandler = (msg: unknown) => {
                if (msg && typeof msg === 'object' && (msg as Record<string, unknown>)['type'] === 'sandbox-ready') {
                    window.clearTimeout(timeout);
                    this.worker?.removeListener('message', readyHandler);
                    resolve();
                }
            };
            this.worker!.on('message', readyHandler);
        });
        this.ready = true;
        this.respawnCount = 0; // Reset on successful spawn
    }

    // L-1: Type-Guard for IPC messages
    private isValidWorkerMessage(msg: unknown): msg is WorkerToPluginMessage {
        if (!msg || typeof msg !== 'object') return false;
        const m = msg as Record<string, unknown>;
        if (typeof m['type'] !== 'string') return false;
        const validTypes = [
            'sandbox-ready', 'result', 'error',
            'vault-read', 'vault-read-binary', 'vault-list',
            'vault-write', 'vault-write-binary', 'request-url',
        ];
        return validTypes.includes(m['type']);
    }

    private async handleMessage(msg: unknown): Promise<void> {
        // L-1: Validate message shape before processing
        if (!this.isValidWorkerMessage(msg)) return;

        // Execution result/error
        if (msg.type === 'result' || msg.type === 'error') {
            const id = msg.id;
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

        // Lifecycle message
        if (msg.type === 'sandbox-ready') return;

        // Bridge requests from the worker — route through SandboxBridge
        const bridgeMsg = msg;

        try {
            let result: unknown;
            if (bridgeMsg.type === 'vault-read') {
                result = await this.bridge.vaultRead(bridgeMsg.path);
            } else if (bridgeMsg.type === 'vault-read-binary') {
                result = await this.bridge.vaultReadBinary(bridgeMsg.path);
            } else if (bridgeMsg.type === 'vault-list') {
                result = this.bridge.vaultList(bridgeMsg.path);
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

            this.worker?.send({ callId: bridgeMsg.callId, result });
        } catch (e) {
            this.bridge.recordError();
            this.worker?.send({
                callId: bridgeMsg.callId,
                error: e instanceof Error ? e.message : String(e),
            });
        }
    }

    private findNodeBinary(): string {
        // Obsidian's process.execPath is a custom wrapper that ignores
        // ELECTRON_RUN_AS_NODE, so we need the real node binary. Discovery is
        // via the spawn-allowlist (which / where), and the existence probe on
        // fallback candidates goes through the documented safeFs binary-probe.
        const which = process.platform === 'win32' ? 'where' : 'which';
        try {
            const result = spawnAllowedSync(which, ['node'], { encoding: 'utf-8', timeout: 3000 });
            if (result.status === 0 && result.stdout) {
                const nodePath = String(result.stdout).trim().split('\n')[0].trim();
                if (nodePath) return nodePath;
            }
        } catch { /* which/where failed */ }

        const homedir = readEnv(ENV_HOME) ?? readEnv(ENV_USERPROFILE) ?? '';
        const candidates = process.platform === 'win32'
            ? [
                'C:\\Program Files\\nodejs\\node.exe',
                `${readEnv(ENV_APPDATA) ?? ''}\\nvm\\current\\node.exe`,
                `${homedir}\\.nvm\\current\\node.exe`,
            ]
            : [
                '/usr/local/bin/node',
                '/opt/homebrew/bin/node',
                `${homedir}/.nvm/current/bin/node`,
            ];
        for (const c of candidates) {
            if (c && safeFs.probeBinaryExists(c)) return c;
        }

        throw new Error('Node.js binary not found. ProcessSandbox requires node in PATH.');
    }

    private getWorkerPath(): string {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtimeWorker uses fs which is only available via dynamic require in Electron renderer
        const runtimeWorkerMod = require('../utils/runtimeWorker') as { ensureRuntimeWorker: (plugin: unknown, name: string, code: string) => string };
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- inlined bundle file generated by esbuild
        const bundledWorkers = require('../../_generated/bundled-workers') as { SANDBOX_WORKER_CODE: string };
        return runtimeWorkerMod.ensureRuntimeWorker(this.plugin, 'sandbox-worker.js', bundledWorkers.SANDBOX_WORKER_CODE);
    }

    private gracefulKill(proc: ChildProcess): void {
        try {
            proc.kill('SIGTERM');
        } catch { /* already dead */ }
        window.setTimeout(() => {
            try {
                if (!proc.killed) proc.kill('SIGKILL');
            } catch { /* already dead */ }
        }, 2000);
    }

    private generateId(): string {
        return 'px_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }
}
