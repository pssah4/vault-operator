/**
 * spawnAllowlist -- centralised child_process wrapper with a hard binary allowlist.
 *
 * Every `child_process.spawn` and `spawnSync` call in the plugin must go through
 * this module. Direct `cp.spawn(...)`, `cp.spawnSync(...)`, and especially
 * `cp.exec(...)`, `cp.execSync(...)` are forbidden outside this file and its tests.
 *
 * The allowlist lists the basenames of all binaries the plugin is allowed to
 * launch. Resolved full paths (`/usr/local/bin/node`) are accepted as long as
 * their `path.basename` matches the allowlist.
 *
 * `shell: true` is rejected. `cp.exec`/`cp.execSync` are not re-exported -- they
 * accept a shell string and have no place in a sandboxed agent plugin.
 *
 * See SECURITY.md and FEAT-27-02-spawn-allowlist.md for the threat model.
 */

/* eslint-disable @typescript-eslint/no-require-imports, security/detect-child-process -- this is the *one* file that owns the child_process module wrapper; all other call sites go through this wrapper */

import type * as CpModule from 'child_process';
import * as path from 'path';

let cpImpl: typeof CpModule | null = null;
function cp(): typeof CpModule {
    if (!cpImpl) {
        cpImpl = require('child_process') as typeof CpModule;
    }
    return cpImpl;
}

/**
 * Binaries the plugin is allowed to spawn. Adding a new entry is a deliberate
 * decision and must be reviewed.
 */
export const ALLOWED_BINARIES: Readonly<Record<string, { reason: string }>> = Object.freeze({
    node: { reason: 'Sandbox worker process (ProcessSandboxExecutor)' },
    'node.exe': { reason: 'Sandbox worker process on Windows' },
    which: { reason: 'Binary discovery on Unix' },
    where: { reason: 'Binary discovery on Windows' },
    'where.exe': { reason: 'Binary discovery on Windows' },
    git: { reason: 'Shadow git for vault checkpoints (GitCheckpointService)' },
    'git.exe': { reason: 'Shadow git on Windows' },
    soffice: { reason: 'LibreOffice headless conversion (pptxRenderer)' },
    'soffice.exe': { reason: 'LibreOffice headless conversion on Windows' },
    'soffice.bin': { reason: 'LibreOffice headless conversion (Linux variant)' },
    libreoffice: { reason: 'LibreOffice headless conversion alias' },
    'libreoffice.exe': { reason: 'LibreOffice headless conversion alias on Windows' },
    cloudflared: { reason: 'Remote MCP tunnel (McpBridge.startTunnel)' },
    'cloudflared.exe': { reason: 'Remote MCP tunnel on Windows' },
    pandoc: { reason: 'Pandoc document conversion (ExecuteRecipeTool built-in recipes)' },
    'pandoc.exe': { reason: 'Pandoc on Windows' },
});

const SHELL_METACHARS = /[;&|`$<>(){}\\\n\r]/;

export class SpawnNotAllowed extends Error {
    constructor(
        public readonly attemptedBinary: string,
        public readonly allowedBinaries: string[],
    ) {
        super(
            `spawnAllowlist: binary "${attemptedBinary}" is not allowed. ` +
            `Allowed: ${allowedBinaries.join(', ')}`,
        );
        this.name = 'SpawnNotAllowed';
    }
}

function checkCommand(command: string): string {
    if (typeof command !== 'string' || command.length === 0) {
        throw new SpawnNotAllowed(String(command), Object.keys(ALLOWED_BINARIES));
    }
    if (SHELL_METACHARS.test(command)) {
        throw new SpawnNotAllowed(command, Object.keys(ALLOWED_BINARIES));
    }
    const base = path.basename(command);
    if (!(base in ALLOWED_BINARIES)) {
        throw new SpawnNotAllowed(command, Object.keys(ALLOWED_BINARIES));
    }
    return command;
}

function forceNoShell<T extends CpModule.SpawnOptions | CpModule.SpawnSyncOptions>(options: T | undefined): T {
    const opts = { ...(options ?? ({} as T)) } as T & { shell?: boolean | string };
    if (opts.shell) {
        throw new SpawnNotAllowed('<shell:true forbidden>', Object.keys(ALLOWED_BINARIES));
    }
    opts.shell = false;
    return opts;
}

/**
 * Allowed wrapper around `child_process.spawn`. Throws SpawnNotAllowed if the
 * binary is not in the allowlist, the command contains shell metacharacters,
 * or `shell: true` is requested.
 */
export function spawnAllowed(command: string, args: readonly string[] = [], options?: CpModule.SpawnOptions): CpModule.ChildProcess {
    return cp().spawn(checkCommand(command), [...args], forceNoShell(options));
}

/**
 * Allowed wrapper around `child_process.spawnSync`. Same restrictions as
 * spawnAllowed.
 */
export function spawnAllowedSync(command: string, args: readonly string[] = [], options?: CpModule.SpawnSyncOptions): CpModule.SpawnSyncReturns<Buffer | string> {
    return cp().spawnSync(checkCommand(command), [...args], forceNoShell(options));
}

/** Test-only: list current allowlist. */
export function _allowedForTest(): string[] {
    return Object.keys(ALLOWED_BINARIES);
}

/* eslint-enable @typescript-eslint/no-require-imports -- end of spawnAllowlist file scope */
