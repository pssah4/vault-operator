/**
 * skill-translator translate / validate / write -- FEAT-29-08 Task C.
 *
 * The actual Python-to-JavaScript LLM call is done at the agent layer
 * (SKILL.md body orchestrates one call per source file via the
 * Frontier-routed main loop). This script:
 *
 *   1. validates the produced JS for sandbox-unsafe patterns
 *   2. builds the TRANSLATION.json audit manifest
 *   3. writes both atomically into the target skill folder via ctx.vault
 *
 * Smoke-test of the produced JS is done at the SKILL.md body level
 * via a follow-up run_skill_script call on the new file with minimal
 * args; surfaces a clear error to the user when the import fails.
 */

const FORBIDDEN_PATTERNS = [
    { pattern: /\beval\s*\(/, label: 'eval() call' },
    { pattern: /\bnew\s+Function\s*\(/, label: 'new Function()' },
    { pattern: /\bFunction\s*\(\s*["'`]/, label: 'Function() constructor with code string' },
    { pattern: /\b__proto__\s*[:=]/, label: '__proto__ assignment' },
    { pattern: /\brequire\s*\(/, label: 'CommonJS require() (sandbox uses ESM imports)' },
    { pattern: /\bprocess\.(env|exit|kill)\b/, label: 'process.env / process.exit / process.kill' },
    { pattern: /\bchild_process\b/, label: 'child_process (subprocess in sandbox)' },
    { pattern: /\bfs\.(write|read|unlink|readdir)/, label: 'direct fs access (use ctx.vault)' },
    { pattern: /\bglobalThis\s*\.\s*[a-zA-Z_$][\w$]*\s*=/, label: 'globalThis property assignment' },
];

/**
 * Scan a JavaScript source string for sandbox-unsafe patterns. Returns
 * `{ ok, issues }` where `issues` is a list of `{ pattern, line }` hits.
 *
 * AUDIT-EPIC-29 M-1 + L-5: this is a HEURISTIC, not a security boundary.
 * The actual safety guarantee comes from the sandbox itself (esbuild-
 * bundled ESM, isolated execution context). The scanner can be bypassed
 * via Unicode escapes in identifiers (eval), indirect access
 * (globalThis['e'+'val']), and string-array construction. A passing
 * validation does NOT mean the code is safe; treat it as a foot-gun
 * trap that catches obvious mistakes. The regex now runs against the
 * full source with the multiline flag so split forbidden patterns
 * (e.g. `eval\n  (...)`) are also caught.
 *
 * Comments are not stripped before scanning. Hidden patterns in
 * comments fire too, which is intentional defense-in-depth.
 */
export function validateJs(source) {
    if (!source || typeof source !== 'string') {
        return { ok: false, issues: [{ pattern: 'empty source', line: 0 }] };
    }
    const issues = [];
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
        const re = new RegExp(pattern.source, 'gm');
        let m;
        while ((m = re.exec(source)) !== null) {
            const line = source.slice(0, m.index).split('\n').length;
            issues.push({ pattern: label, line });
        }
    }
    return { ok: issues.length === 0, issues };
}

/**
 * AUDIT-EPIC-29 M-2: reject path-traversal segments and absolute paths.
 * Inline because translate.js is a bundled .js script and cannot
 * import the TypeScript helper from src/core/backup/BackupExportService.
 */
export function isUnsafePath(path) {
    if (!path) return false;
    if (path.startsWith('/') || path.startsWith('\\')) return true;
    if (/^[a-zA-Z]:[\\/]/.test(path)) return true;
    const segments = path.split(/[\\/]/);
    return segments.some((s) => s === '..');
}

/**
 * AUDIT-EPIC-29 L-3: strip embedded credentials from a source-repo URL
 * before persisting it in the TRANSLATION.json manifest. Falls back to
 * the input string for non-URL values (e.g. the literal "local").
 */
export function sanitizeRepoUrl(url) {
    if (!url || typeof url !== 'string') return url;
    try {
        const u = new URL(url);
        u.username = '';
        u.password = '';
        return u.toString();
    } catch {
        return url;
    }
}

/**
 * Build the audit manifest for a translation. Pure shape function so
 * tests pin the schema.
 *
 * Inputs:
 *   sourceRepo    -- string, e.g. "https://github.com/anthropics/skills"
 *   sourcePath    -- string, vault-relative path of the source skill
 *   sourceVersion -- string | null, the commit SHA or git tag if known
 *   targetPath    -- string, vault-relative path of the translated skill
 *   files         -- [{ source: "...py", target: "...js", lines: number }]
 *   dryRunSummary -- { mappableCount, partialCount, unmappableCount }
 *   partialMarkers-- string[]; module names that were translated with
 *                    limitations or rerouted to built-in tools
 *   translator    -- string, identifier of the agent/model that did it
 */
export function buildManifest(inputs) {
    if (!inputs || typeof inputs !== 'object') {
        throw new Error('buildManifest requires an inputs object');
    }
    const now = inputs.now ?? new Date().toISOString();
    return {
        schemaVersion: 1,
        translationDate: now,
        translator: inputs.translator ?? 'unknown',
        source: {
            // AUDIT-EPIC-29 L-3: scrub URL-embedded credentials before persisting.
            repo: inputs.sourceRepo ? sanitizeRepoUrl(inputs.sourceRepo) : null,
            path: inputs.sourcePath ?? null,
            version: inputs.sourceVersion ?? null,
        },
        target: {
            path: inputs.targetPath ?? null,
        },
        files: (inputs.files ?? []).map((f) => ({
            source: f.source,
            target: f.target,
            lines: f.lines ?? null,
        })),
        dryRun: {
            mappableCount: inputs.dryRunSummary?.mappableCount ?? 0,
            partialCount: inputs.dryRunSummary?.partialCount ?? 0,
            unmappableCount: inputs.dryRunSummary?.unmappableCount ?? 0,
        },
        partialMarkers: inputs.partialMarkers ?? [],
    };
}

/**
 * Write the translated skill into the target folder. Each file is
 * validated before being written; the manifest is written last so that
 * a partial validation failure does not leave a half-written skill
 * advertising itself as complete.
 *
 *   args.sourceRepo, args.sourcePath, args.sourceVersion -- audit info
 *   args.targetPath        -- vault-relative target folder
 *   args.files             -- [{ source, target, content }] with translated JS
 *   args.dryRunSummary     -- pass-through from the dry-run pass
 *   args.partialMarkers    -- pass-through from the dry-run pass
 *   args.translator        -- agent identifier
 *   args.skillMd           -- the rewritten SKILL.md body (already Python-free)
 *
 * Returns { ok, written: [], failed: [], manifestPath, validationIssues: [] }.
 */
export async function writeTranslation(args, ctx) {
    if (!args || typeof args !== 'object') throw new Error('args required');
    if (!ctx || !ctx.vault) throw new Error('ctx.vault required');
    const targetPath = args.targetPath;
    if (!targetPath || typeof targetPath !== 'string') {
        throw new Error('args.targetPath required');
    }
    // AUDIT-EPIC-29 M-2: path-traversal guard on targetPath.
    if (isUnsafePath(targetPath)) {
        throw new Error(`Refusing to write to unsafe targetPath: ${JSON.stringify(targetPath)}`);
    }
    const files = Array.isArray(args.files) ? args.files : [];
    const written = [];
    const failed = [];
    const validationIssues = [];

    // AUDIT-EPIC-29 L-6: two-pass. First validate everything; only enter
    // the write phase if every single file passed. Prevents orphan
    // partial writes when a later script fails validation.
    for (const f of files) {
        // AUDIT-EPIC-29 M-2: path-traversal guard on each f.target.
        if (isUnsafePath(f.target)) {
            validationIssues.push({ file: f.target, issues: [{ pattern: 'unsafe path (M-2)', line: 0 }] });
            failed.push(f.target);
            continue;
        }
        const { ok, issues } = validateJs(f.content);
        if (!ok) {
            validationIssues.push({ file: f.target, issues });
            failed.push(f.target);
        }
    }
    if (failed.length > 0) {
        return {
            ok: false,
            written: [],
            failed,
            manifestPath: null,
            validationIssues,
        };
    }

    // Second pass: write. All files validated; any write error is from
    // the adapter (disk full, permission, etc.) not the agent's input.
    for (const f of files) {
        try {
            const out = `${targetPath}/${f.target}`;
            await ctx.vault.write(out, f.content);
            written.push(out);
        } catch (e) {
            failed.push(`${f.target} (write failed: ${e instanceof Error ? e.message : String(e)})`);
        }
    }

    // Rewrite SKILL.md only after all script writes succeeded.
    if (args.skillMd && failed.length === 0) {
        try {
            await ctx.vault.write(`${targetPath}/SKILL.md`, args.skillMd);
            written.push(`${targetPath}/SKILL.md`);
        } catch (e) {
            failed.push(`SKILL.md (write failed: ${e instanceof Error ? e.message : String(e)})`);
        }
    }

    const manifest = buildManifest({
        sourceRepo: args.sourceRepo,
        sourcePath: args.sourcePath,
        sourceVersion: args.sourceVersion,
        targetPath,
        files: files.map((f) => ({ source: f.source, target: f.target, lines: countLines(f.content) })),
        dryRunSummary: args.dryRunSummary,
        partialMarkers: args.partialMarkers,
        translator: args.translator,
    });
    const manifestPath = `${targetPath}/TRANSLATION.json`;
    let manifestWritten = false;
    if (failed.length === 0) {
        try {
            await ctx.vault.write(manifestPath, JSON.stringify(manifest, null, 2));
            manifestWritten = true;
            written.push(manifestPath);
        } catch (e) {
            failed.push(`TRANSLATION.json (write failed: ${e instanceof Error ? e.message : String(e)})`);
        }
    }

    return {
        ok: failed.length === 0,
        written,
        failed,
        manifestPath: manifestWritten ? manifestPath : null,
        validationIssues,
    };
}

function countLines(content) {
    if (!content || typeof content !== 'string') return 0;
    return content.split('\n').length;
}

/**
 * Runtime entry for run_skill_script. Thin wrapper around
 * writeTranslation so the agent can call this directly with the
 * structured payload.
 */
export async function execute(args, ctx) {
    return writeTranslation(args, ctx);
}
