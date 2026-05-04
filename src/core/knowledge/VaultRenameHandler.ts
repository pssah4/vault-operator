/**
 * VaultRenameHandler -- update-cascade for Vault note + folder renames.
 *
 * Before this handler, vault.on('rename') performed delete-then-reinsert
 * (semanticIndex.removeFile + scheduleFileIndex). That works for the vector
 * blob but loses every other reference: edges, implicit_edges, tags,
 * note_freshness, ontology rows pointing to the old path became orphans
 * because no UPDATE was issued. The user noticed later as stale search hits
 * and broken graph edges.
 *
 * This handler issues UPDATEs across the path-bearing tables. Paths are
 * stored as raw vault-relative strings (URIs are deferred to Memory v2's
 * new tables, see KnowledgeDB.repairUriRollback for context). Folder renames
 * use a single LIKE-prefix UPDATE per table so 100 notes can be renamed in
 * one pass instead of N individual rename events. FEATURE-0314.
 */

import type { KnowledgeDB } from './KnowledgeDB';

export interface CascadeResult {
    table: string;
    column: string;
    rowsAffected: number;
}

/** All `(table, column)` pairs that store a vault-relative path for a note. */
const VAULT_PATH_TABLES: ReadonlyArray<{ table: string; column: string }> = [
    { table: 'vectors', column: 'path' },
    { table: 'edges', column: 'source_path' },
    { table: 'edges', column: 'target_path' },
    { table: 'tags', column: 'path' },
    { table: 'implicit_edges', column: 'source_path' },
    { table: 'implicit_edges', column: 'target_path' },
    { table: 'ontology', column: 'entity_path' },
    { table: 'note_freshness', column: 'path' },
];

export class VaultRenameHandler {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}

    /** Cascade a single-file rename. `oldPath`/`newPath` are vault-relative. */
    cascadeFileRename(oldPath: string, newPath: string): CascadeResult[] {
        if (!this.knowledgeDB.isOpen()) return [];
        if (oldPath === newPath) return [];
        const db = this.knowledgeDB.getDB();

        const results: CascadeResult[] = [];
        for (const { table, column } of VAULT_PATH_TABLES) {
            try {
                db.run(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, [newPath, oldPath]);
                const changed = (db.exec('SELECT changes()')[0]?.values?.[0]?.[0] as number) ?? 0;
                if (changed > 0) results.push({ table, column, rowsAffected: changed });
            } catch (e) {
                console.warn(`[VaultRenameHandler] file-rename UPDATE failed for ${table}.${column}:`, e);
            }
        }

        if (results.length > 0) this.knowledgeDB.markDirty();
        return results;
    }

    /** Cascade a folder rename via LIKE-prefix UPDATE. */
    cascadeFolderRename(oldFolder: string, newFolder: string): CascadeResult[] {
        if (!this.knowledgeDB.isOpen()) return [];
        if (oldFolder === newFolder) return [];

        const oldPrefix = stripTrailingSlash(oldFolder) + '/';
        const newPrefix = stripTrailingSlash(newFolder) + '/';
        const oldPrefixLen = oldPrefix.length;
        const db = this.knowledgeDB.getDB();

        const results: CascadeResult[] = [];
        for (const { table, column } of VAULT_PATH_TABLES) {
            try {
                db.run(
                    `UPDATE ${table} SET ${column} = ? || substr(${column}, ?) ` +
                    `WHERE ${column} LIKE ? || '%'`,
                    [newPrefix, oldPrefixLen + 1, oldPrefix],
                );
                const changed = (db.exec('SELECT changes()')[0]?.values?.[0]?.[0] as number) ?? 0;
                if (changed > 0) results.push({ table, column, rowsAffected: changed });
            } catch (e) {
                console.warn(`[VaultRenameHandler] folder-rename UPDATE failed for ${table}.${column}:`, e);
            }
        }

        if (results.length > 0) this.knowledgeDB.markDirty();
        return results;
    }
}

function stripTrailingSlash(p: string): string {
    return p.endsWith('/') ? p.slice(0, -1) : p;
}
