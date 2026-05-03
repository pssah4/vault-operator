/**
 * FrontmatterPropertyStore -- SQL mirror of Vault-Note frontmatter.
 *
 * Backs FEAT-15-10. Allows fast taxonomy lookups (Themen, Konzepte,
 * tags, beliebige Properties) ohne LLM-Volltext-Suche.
 *
 * Reads from and writes to `frontmatter_properties` (knowledge.db v10,
 * ADR-92). Multi-Wert-Properties (lists) werden via list_index in
 * stabiler Reihenfolge gespeichert.
 */

import type { KnowledgeDB } from './KnowledgeDB';

export type PropertyValue = string | string[];

export class FrontmatterPropertyStore {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}

    /**
     * Replace alle Properties einer Note in einer Operation.
     * Loescht bestehende Eintraege fuer notePath, fuegt neue ein.
     * Atomic via Transaction.
     */
    replaceForNote(notePath: string, properties: Record<string, PropertyValue>): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        db.run('BEGIN TRANSACTION');
        try {
            db.run(`DELETE FROM frontmatter_properties WHERE note_path = ?`, [notePath]);
            for (const [propName, value] of Object.entries(properties)) {
                const values = Array.isArray(value) ? value : [value];
                values.forEach((v, idx) => {
                    db.run(
                        `INSERT INTO frontmatter_properties (note_path, property_name, property_value, list_index)
                         VALUES (?, ?, ?, ?)`,
                        [notePath, propName, String(v), idx],
                    );
                });
            }
            db.run('COMMIT');
        } catch (err) {
            db.run('ROLLBACK');
            throw err;
        }
        this.knowledgeDB.markDirty();
    }

    /** Get alle Properties einer Note als Record (Lists werden als Arrays zurueckgegeben). */
    getForNote(notePath: string): Record<string, string[]> {
        const out: Record<string, string[]> = {};
        if (!this.knowledgeDB.isOpen()) return out;
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT property_name, property_value, list_index
             FROM frontmatter_properties
             WHERE note_path = ?
             ORDER BY property_name, list_index`,
            [notePath],
        );
        if (!result.length) return out;
        for (const row of result[0].values) {
            const name = row[0] as string;
            const value = row[1] as string;
            if (!out[name]) out[name] = [];
            out[name].push(value);
        }
        return out;
    }

    /** Alle distinct Werte fuer eine Property im Vault (z.B. alle "Themen"). */
    lookupValues(propertyName: string): string[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT DISTINCT property_value FROM frontmatter_properties
             WHERE property_name = ? ORDER BY property_value`,
            [propertyName],
        );
        if (!result.length) return [];
        return result[0].values.map((row) => row[0] as string);
    }

    /** Alle Notes mit einem konkreten Property-Wert. */
    findNotesWithValue(propertyName: string, propertyValue: string): string[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT DISTINCT note_path FROM frontmatter_properties
             WHERE property_name = ? AND property_value = ?
             ORDER BY note_path`,
            [propertyName, propertyValue],
        );
        if (!result.length) return [];
        return result[0].values.map((row) => row[0] as string);
    }

    deleteForNote(notePath: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.knowledgeDB.getDB();
        db.run(`DELETE FROM frontmatter_properties WHERE note_path = ?`, [notePath]);
        this.knowledgeDB.markDirty();
    }
}
