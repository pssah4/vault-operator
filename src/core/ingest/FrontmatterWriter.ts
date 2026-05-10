/**
 * FrontmatterWriter -- atomic Frontmatter-Update mit Conflict-Detection.
 *
 * Backs FEAT-19-09 (Auto-Summary-Write) und FEAT-19-10 (Backfill-Job).
 * Default-Pfad nutzt Obsidians `app.fileManager.processFrontMatter`
 * (atomic auf Single-Device). Im obsidian-sync-Storage-Mode wird
 * zusaetzlich der WriterLock-Pattern aus ADR-79 genutzt, um
 * Cross-Device-Race zu verhindern (ADR-95).
 *
 * Bestehende Frontmatter-Properties werden NIE ueberschrieben.
 * Der Caller liefert eine `FrontmatterPatch` mit "fields-to-add"
 * und "fields-to-replace-only-if-empty"-Semantik.
 */

import { TFile, type App } from 'obsidian';
import { WriterLock } from '../persistence/WriterLock';
import * as path from 'path';

/**
 * AUDIT-014 M-1: prototype-chain property names that must never be set
 * via Frontmatter-Patch (CWE-1321 Prototype Pollution).
 */
const FORBIDDEN_PROPERTY_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Patch-Anweisung:
 * - `fields`: pro Property-Name ein Wert. Default-Verhalten: nur
 *   ergaenzen wenn nicht vorhanden. `replace=true` ueberschreibt
 *   explizit (zum Beispiel fuer Auto-Summary-Refresh nach Source-
 *   Aenderung mit aktualisierter mtime).
 */
export interface FrontmatterPatchField {
    value: unknown;
    /** Default false: nur ergaenzen wenn fehlt. true: ueberschreiben. */
    replace?: boolean;
}

export interface FrontmatterPatch {
    [propertyName: string]: FrontmatterPatchField;
}

export interface WriteResult {
    written: boolean;
    skippedReason?: 'lock-held' | 'no-change' | 'error';
    fieldsAdded: string[];
    fieldsReplaced: string[];
    error?: string;
}

export interface FrontmatterWriterOptions {
    /**
     * Storage-Mode des Vault-Plugins. Bei 'obsidian-sync' wird
     * WriterLock acquired. Bei 'global'/'local' nicht.
     */
    storageMode: 'global' | 'local' | 'obsidian-sync';
    /**
     * Lock-Directory fuer obsidian-sync (typisch: pluginDir des Plugins).
     * Nur im obsidian-sync-Mode genutzt.
     */
    lockDir?: string;
}

export class FrontmatterWriter {
    constructor(
        private readonly app: App,
        private readonly options: FrontmatterWriterOptions,
    ) {}

    async write(file: TFile, patch: FrontmatterPatch): Promise<WriteResult> {
        const lock = this.options.storageMode === 'obsidian-sync' && this.options.lockDir
            ? new WriterLock(path.join(this.options.lockDir, '.frontmatter-lock'))
            : null;

        if (lock) {
            const result = await lock.acquire();
            if (!result.acquired) {
                return {
                    written: false,
                    skippedReason: 'lock-held',
                    fieldsAdded: [],
                    fieldsReplaced: [],
                };
            }
        }

        const fieldsAdded: string[] = [];
        const fieldsReplaced: string[] = [];
        let written = false;

        try {
            await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                for (const [name, field] of Object.entries(patch)) {
                    // AUDIT-014 M-1 (CWE-1321): reject prototype-chain property
                    // names from agent-generated patches. Frontmatter properties
                    // never legitimately use these reserved keys.
                    if (FORBIDDEN_PROPERTY_NAMES.has(name)) {
                        console.warn(`[FrontmatterWriter] Skipping forbidden property name: ${name}`);
                        continue;
                    }
                    const exists = name in fm && fm[name] !== null && fm[name] !== undefined;
                    if (!exists) {
                        fm[name] = field.value;
                        fieldsAdded.push(name);
                        written = true;
                    } else if (field.replace) {
                        fm[name] = field.value;
                        fieldsReplaced.push(name);
                        written = true;
                    }
                    // else: skip silently (User-Wert hat Vorrang).
                }
            });
        } catch (err) {
            return {
                written: false,
                skippedReason: 'error',
                fieldsAdded: [],
                fieldsReplaced: [],
                error: err instanceof Error ? err.message : String(err),
            };
        } finally {
            if (lock) await lock.release();
        }

        if (!written) {
            return { written: false, skippedReason: 'no-change', fieldsAdded, fieldsReplaced };
        }
        return { written: true, fieldsAdded, fieldsReplaced };
    }
}
