/**
 * FEAT-29-14: TemplateMaterializer.
 *
 * Writes the plugin-shipped note templates (DE/EN, plus any LLM-
 * translated variants) into the user's Obsidian-Core-Templates folder
 * so they show up in the native "Insert template" command and the
 * vault ingest skills can reference them via the `vaultIngest.templates.*`
 * settings.
 *
 * Materialization rules:
 *
 * - Skip files that already exist (User-Edits gewinnen). `force: true`
 *   overrides for the explicit "Re-materialize templates" button.
 * - Unknown languages: if a `translator` callback is supplied, every
 *   EN template is sent through it and the result is written under the
 *   EN filename. Without a translator we fall back to writing the EN
 *   set unchanged and report `fallbackLanguage: 'en'`.
 * - Write failures are captured in `failed` rather than thrown so a
 *   partial materialization still reports what landed.
 *
 * AUDIT-024 L-1 (TOCTOU, accepted by design).
 * The `exists()` + `write()` sequence has a small race window. The
 * materializer assumes single-user / single-Obsidian-instance per
 * vault (the common case). Multi-instance vaults could see a second
 * writer slip in between the check and the write; the resulting
 * worst case is a redundant overwrite of a freshly created file,
 * not data corruption. Add an explicit per-folder lock only if we
 * see multi-instance reports.
 *
 * AUDIT-024 M-2 (path-segment validation).
 * Every bundle filename is checked for traversal segments before
 * write. The bundle is generated at build time from a controlled
 * directory tree, but the check stays for defense-in-depth in case
 * a future generator or supply-chain compromise lands unsafe keys.
 */

import type { App } from 'obsidian';

export interface MaterializationResult {
    /** Vault-relative paths of files newly written. */
    written: string[];
    /** Vault-relative paths skipped because the file already existed and `force` was false. */
    skipped: string[];
    /** Per-path write failure reasons. */
    failed: Array<{ path: string; reason: string }>;
    /** Set when the requested language was unknown and EN was used instead. */
    fallbackLanguage?: string;
}

export interface MaterializeOptions {
    /** Overwrite existing files instead of skipping them. Default false. */
    force?: boolean;
    /**
     * Optional translator. Invoked once per template when the requested
     * language is not present in the bundle. Receives the target lang,
     * the template filename, and the EN source content; returns the
     * translated content. If absent, EN content is written as-is.
     */
    translator?: (lang: string, name: string, sourceContent: string) => Promise<string>;
}

export class TemplateMaterializer {
    constructor(
        private readonly app: App,
        private readonly bundle: Record<string, Record<string, string>>,
    ) {}

    async materialize(
        targetFolder: string,
        lang: string,
        opts: MaterializeOptions,
    ): Promise<MaterializationResult> {
        if (!targetFolder || targetFolder.trim().length === 0) {
            throw new Error('TemplateMaterializer.materialize: targetFolder must not be empty');
        }

        const adapter = this.app.vault.adapter;

        const result: MaterializationResult = {
            written: [],
            skipped: [],
            failed: [],
        };

        const { templates, fallbackLanguage } = this.resolveBundleForLang(lang);
        if (fallbackLanguage) result.fallbackLanguage = fallbackLanguage;

        if (!await adapter.exists(targetFolder)) {
            try {
                await adapter.mkdir(targetFolder);
            } catch (e) {
                result.failed.push({ path: targetFolder, reason: (e as Error).message ?? String(e) });
                return result;
            }
        }

        for (const [filename, sourceContent] of Object.entries(templates)) {
            // AUDIT-024 M-2: defense-in-depth path-segment check. The
            // bundle is generated at build time from a controlled tree
            // and is trusted, but symmetric to BuiltinSkillMaterializer
            // we refuse any filename that would escape the target folder
            // (segments, leading slash, null byte, nested separator).
            if (
                filename.length === 0
                || filename.includes('..')
                || filename.startsWith('/')
                || filename.startsWith('\\')
                || filename.includes('\0')
                || filename.includes('/')
                || filename.includes('\\')
            ) {
                result.failed.push({ path: filename, reason: `unsafe path segment rejected: ${JSON.stringify(filename)}` });
                continue;
            }
            const path = `${targetFolder}/${filename}`;
            try {
                if (!opts.force && await adapter.exists(path)) {
                    result.skipped.push(path);
                    continue;
                }
                let content = sourceContent;
                if (opts.translator && fallbackLanguage === undefined && lang !== 'en' && lang !== 'de') {
                    // Defensive: this branch only triggers when callers
                    // pass a translator AND the resolved lang did not
                    // exist in the bundle. resolveBundleForLang already
                    // chose EN as the source, so we still translate.
                    content = await opts.translator(lang, filename, sourceContent);
                } else if (opts.translator && fallbackLanguage !== undefined) {
                    // Bundle gave us EN as fallback, but the caller
                    // wants `lang` -- translate the EN source.
                    content = await opts.translator(lang, filename, sourceContent);
                    // Translator path: clear the fallback flag because
                    // we are now serving the requested language.
                    delete result.fallbackLanguage;
                }
                await adapter.write(path, content);
                result.written.push(path);
            } catch (e) {
                result.failed.push({ path, reason: (e as Error).message ?? String(e) });
            }
        }

        return result;
    }

    private resolveBundleForLang(lang: string): { templates: Record<string, string>; fallbackLanguage?: string } {
        const direct = this.bundle[lang];
        if (direct) return { templates: direct };
        const en = this.bundle.en;
        if (!en) {
            throw new Error(`TemplateMaterializer: no templates for lang=${lang} and no EN fallback present`);
        }
        return { templates: en, fallbackLanguage: 'en' };
    }
}
