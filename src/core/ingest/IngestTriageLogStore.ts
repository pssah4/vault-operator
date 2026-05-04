/**
 * IngestTriageLogStore -- Triage-Decision-Log plus Doppel-Trigger-Schutz.
 *
 * Backs FEAT-19-12 (Pre-Triage-Tool, ADR-98) und FEAT-19-27 (Auto-Trigger,
 * ADR-102). UNIQUE-Constraint auf source_uri verhindert Doppel-Trigger,
 * Cooldown-Check ueber triaged_at.
 *
 * Reads from and writes to `ingest_triage_log` (knowledge.db v10).
 */

import type { KnowledgeDB } from '../knowledge/KnowledgeDB';

export type TriageDecision = 'ingest' | 'spaeter' | 'verwerfen' | 'pending';

/**
 * AUDIT-014 L-1 (FIX-19-12-02, CWE-532):
 * Strip sensitive query-params from URLs before persisting in the
 * triage-log. Backups, sync-shares, and DB-Inspect would otherwise
 * expose Auth-Tokens/API-Keys/Session-IDs that the agent passed in.
 *
 * Strategy: parse URL, drop blacklisted params, keep everything else.
 * Non-URL strings (vault://, file://) pass through unchanged.
 */
const SENSITIVE_QUERY_PARAMS = new Set([
    'token', 'access_token', 'refresh_token', 'id_token', 'auth_token',
    'api_key', 'apikey', 'api-key', 'key',
    'code', 'state', 'nonce',
    'session', 'sessionid', 'session_id', 'sid',
    'password', 'passwd', 'secret', 'client_secret',
    'authorization', 'auth',
    'sig', 'signature',
]);

export function sanitizeSourceUri(rawUri: string): string {
    if (!rawUri || typeof rawUri !== 'string') return rawUri;
    const trimmed = rawUri.trim();
    // Only sanitize HTTP/HTTPS URLs
    if (!/^https?:\/\//i.test(trimmed)) return trimmed;
    try {
        const url = new URL(trimmed);
        let stripped = false;
        for (const key of [...url.searchParams.keys()]) {
            if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
                url.searchParams.delete(key);
                stripped = true;
            }
        }
        if (stripped) {
            // Append a marker so the user knows the URL was sanitized
            const stub = '[REDACTED]';
            const newUrl = url.toString();
            return newUrl.includes('?')
                ? `${newUrl}&_sanitized=${stub}`
                : `${newUrl}?_sanitized=${stub}`;
        }
        return url.toString();
    } catch {
        // Invalid URL: pass through unchanged (caller validation handles it)
        return trimmed;
    }
}

export interface TriageLogRecord {
    id: number;
    sourceUri: string;
    triagedAt: string;
    decision: TriageDecision;
    decisionReason?: string;
}

export class IngestTriageLogStore {
    constructor(private readonly knowledgeDB: KnowledgeDB) {}

    /** Idempotent: liefert true wenn ein neuer Eintrag entstanden ist, false wenn bereits triaged. */
    record(sourceUri: string, decision: TriageDecision, decisionReason?: string): boolean {
        if (!this.knowledgeDB.isOpen()) return false;
        const safeUri = sanitizeSourceUri(sourceUri);
        if (this.exists(safeUri)) return false;
        const db = this.knowledgeDB.getDB();
        const now = new Date().toISOString();
        db.run(
            `INSERT INTO ingest_triage_log (source_uri, triaged_at, decision, decision_reason) VALUES (?, ?, ?, ?)`,
            [safeUri, now, decision, decisionReason ?? null],
        );
        this.knowledgeDB.markDirty();
        return true;
    }

    /** Update decision fuer existierenden Eintrag (zB pending -> ingest). */
    updateDecision(sourceUri: string, decision: TriageDecision, decisionReason?: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const safeUri = sanitizeSourceUri(sourceUri);
        const db = this.knowledgeDB.getDB();
        db.run(
            `UPDATE ingest_triage_log SET decision = ?, decision_reason = ?, triaged_at = ? WHERE source_uri = ?`,
            [decision, decisionReason ?? null, new Date().toISOString(), safeUri],
        );
        this.knowledgeDB.markDirty();
    }

    exists(sourceUri: string): boolean {
        if (!this.knowledgeDB.isOpen()) return false;
        const safeUri = sanitizeSourceUri(sourceUri);
        const db = this.knowledgeDB.getDB();
        const result = db.exec(`SELECT id FROM ingest_triage_log WHERE source_uri = ?`, [safeUri]);
        return result.length > 0 && result[0].values.length > 0;
    }

    /**
     * Cooldown-Check fuer Auto-Trigger: ist der letzte Triage-Eintrag
     * fuer diese Source juenger als cooldownMs?
     */
    isInCooldown(sourceUri: string, cooldownMs = 3_600_000): boolean {
        const rec = this.get(sourceUri);
        if (!rec) return false;
        const ageMs = Date.now() - new Date(rec.triagedAt).getTime();
        return ageMs < cooldownMs;
    }

    get(sourceUri: string): TriageLogRecord | null {
        if (!this.knowledgeDB.isOpen()) return null;
        const safeUri = sanitizeSourceUri(sourceUri);
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT id, source_uri, triaged_at, decision, decision_reason FROM ingest_triage_log WHERE source_uri = ?`,
            [safeUri],
        );
        if (!result.length || !result[0].values.length) return null;
        const row = result[0].values[0];
        return {
            id: row[0] as number,
            sourceUri: row[1] as string,
            triagedAt: row[2] as string,
            decision: row[3] as TriageDecision,
            decisionReason: (row[4] as string | null) ?? undefined,
        };
    }

    listPending(): TriageLogRecord[] {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.knowledgeDB.getDB();
        const result = db.exec(
            `SELECT id, source_uri, triaged_at, decision, decision_reason FROM ingest_triage_log WHERE decision = 'pending' ORDER BY triaged_at DESC`,
        );
        if (!result.length) return [];
        return result[0].values.map((row) => ({
            id: row[0] as number,
            sourceUri: row[1] as string,
            triagedAt: row[2] as string,
            decision: row[3] as TriageDecision,
            decisionReason: (row[4] as string | null) ?? undefined,
        }));
    }
}
