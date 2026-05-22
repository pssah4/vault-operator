/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * IngestTriageTool (FEAT-19-12, ADR-98) — 10-Sekunden Pre-Triage-Pass.
 *
 * Erzeugt eine Triage-Karte fuer eine Source (URL, vault-Path, attachment-Index):
 * Cluster-Match aus Ontologie + Source-Diversity-Hint + Decision-Log.
 *
 * Output ist ein strukturierter Markdown-Report den der Agent oder
 * der User direkt zur Decision (ingest/spaeter/verwerfen) nutzen kann.
 *
 * Tool selbst macht keinen tiefen LLM-Vault-Vergleich — das gehoert in den
 * Deep-Ingest-Pfad (FEAT-19-22 Dialog-Modus). Triage soll < 0.05 USD bleiben.
 */

import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { TriageDecision } from '../../ingest/IngestTriageLogStore';
import { normalizeDomain } from '../../knowledge/ClusterSourceStatsStore';

/**
 * AUDIT-014 H-1 (CWE-22 Path Traversal):
 * Validate vault-relative paths from Tool-Input. Reject any string with
 * `..` segments, NUL chars, or absolute-path markers. Returns null when
 * path is unsafe, the caller must abort the operation.
 *
 * Note: this guards against agent-supplied input. Obsidian's
 * getAbstractFileByPath is vault-rooted, but raw `..`-strings persist in
 * triage-log entries and downstream UI; rejecting at the boundary is
 * the right place.
 */
// AUDIT-016 L-5: Re-export shared helper -- single source of truth.
import { validateVaultRelativePath as _validateVaultPath } from './pathValidation';
const validateVaultPath = _validateVaultPath;

interface IngestTriageInput {
    /** Source URI: 'vault://path', 'https://...', or 'file://...'. */
    source_uri: string;
    /** Optional cluster hint (sonst wird aus Ontologie ermittelt). */
    cluster_hint?: string;
    /** Optional decision falls direkt vom User triggered ('pending' wenn unklar). */
    decision?: TriageDecision;
    /**
     * Optional explicit search query for the related-context pass (Vault /
     * Memory / History). When omitted, the tool derives one from the
     * source: vault-file basename + frontmatter topics/themes/summary, or
     * the URL path segment for http sources. Passing an explicit query is
     * preferred when the agent has already extracted the source's main
     * themes -- it produces a much sharper recall.
     */
    query?: string;
    /** Optional top_k per search source (default 5). Capped at 10. */
    search_top_k?: number;
    /**
     * If true, skip the Vault/Memory/History pass entirely. Used by the
     * fast Auto-Trigger path (FEAT-19-27) where only cluster classification
     * and decision logging are wanted. Defaults to false: full triage.
     */
    skip_search?: boolean;
}

interface RelatedNote { path: string; excerpt: string; score: number; }
interface RelatedFact { id: number; text: string; topics: string[]; score: number; }
interface RelatedChat { sessionId: string; role: string; text: string; createdAt: string; }

export class IngestTriageTool extends BaseTool<'ingest_triage'> {
    readonly name = 'ingest_triage' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'ingest_triage',
            description:
                'Triage fuer eine Source (Artikel, PDF, vault-Note). Sammelt Cluster-Match aus der ' +
                'Ontologie, prueft Source-Domain-Diversity, und durchsucht zusaetzlich Vault, Memory ' +
                '(Facts) und History (Chats) nach verwandtem Kontext, damit die Decision (ingest / ' +
                'spaeter / verwerfen) auf existierendem Wissen aufbaut. Decision wird im Triage-Log ' +
                'gegen Doppel-Trigger persistiert. Auto-Trigger-Pfade koennen die Recherche per ' +
                '"skip_search: true" abschalten, dann bleibt es bei der billigen Klassifikation.',
            input_schema: {
                type: 'object',
                properties: {
                    source_uri: {
                        type: 'string',
                        description:
                            'Source-URI. Beispiele: "vault://Inbox/Article.md" fuer Vault-Notes, ' +
                            '"https://example.com/article" fuer URLs, "file:///path/to.pdf" fuer lokale Files.',
                    },
                    cluster_hint: {
                        type: 'string',
                        description:
                            'Optional: Cluster-Name als Hint. Wenn weggelassen, wird aus Ontologie ermittelt.',
                    },
                    decision: {
                        type: 'string',
                        enum: ['ingest', 'spaeter', 'verwerfen', 'pending'],
                        description:
                            'Optional: User-Decision, falls schon klar. Default "pending" -> Triage-Karte ' +
                            'als Vorschlag, Decision wird spaeter gesetzt.',
                    },
                    query: {
                        type: 'string',
                        description:
                            'Optional: explizite Suchquery fuer die Vault/Memory/History-Recherche. ' +
                            'Wenn weggelassen, wird sie aus der Source abgeleitet (Basename + Frontmatter-' +
                            'Themen bei Vault-Files, URL-Pfad bei https-Quellen). Eine handverlesene ' +
                            'Query produziert deutlich schaerfere Treffer.',
                    },
                    search_top_k: {
                        type: 'number',
                        description: 'Optional: Top-K pro Such-Quelle (Default 5, max 10).',
                    },
                    skip_search: {
                        type: 'boolean',
                        description:
                            'Optional: wenn true, wird die Vault/Memory/History-Recherche uebersprungen. ' +
                            'Default false. Sinnvoll fuer Auto-Trigger-Pfade die nur klassifizieren wollen.',
                    },
                },
                required: ['source_uri'],
            },
        };
    }

    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        const {
            source_uri,
            cluster_hint,
            decision = 'pending',
            query: explicitQuery,
            search_top_k,
            skip_search = false,
        } = input as unknown as IngestTriageInput;
        const triageStore = this.plugin.ingestTriageLogStore;
        const sourceStats = this.plugin.clusterSourceStatsStore;
        const knowledgeDB = this.plugin.knowledgeDB;

        if (!triageStore || !knowledgeDB?.isOpen()) {
            ctx.callbacks.pushToolResult(
                this.formatError('IngestTriage benoetigt knowledge.db. Plugin nicht vollstaendig initialisiert.'),
            );
            return;
        }

        // BUG-029 (Issue #312): file:// URIs sind nicht triagebar.
        // Chat-Attachments leben nur einen Turn -- jeder nachgelagerte
        // read_document/ingest_deep-Call schlaegt zwingend fehl. Wenn die
        // Triage hier "Erfolg" zurueckgibt, baut der Agent darauf auf und
        // weicht bei Read-Fehlern auf gleichnamige Vault-Files aus
        // (Stale-Mirror-Workaround). Wir blocken den Loop am Ursprung und
        // verweisen auf den Skill-Workflow (Step 0a: erst in Vault speichern).
        if (source_uri.startsWith('file://')) {
            ctx.callbacks.pushToolResult(
                this.formatError(
                    `IngestTriage akzeptiert keine file://-URIs (erhalten: "${source_uri}"). ` +
                    'Chat-Attachments leben nur einen Turn und sind ab dem naechsten Tool-Call nicht mehr erreichbar. ' +
                    'Aktion: Speichere die Datei zuerst in den Vault (z.B. via ingest_document mit attachment_index=0 ' +
                    'auf Turn 1, Ziel "Attachements/<dateiname>"), dann ingest_triage erneut mit ' +
                    '"vault://Attachements/<dateiname>" aufrufen. Nicht auf gleichnamige Vault-Files ausweichen ' +
                    'oder Inhalt aus dem Kontext rekonstruieren -- STOP und User informieren wenn unklar wo die Datei liegt.',
                ),
            );
            return;
        }

        // Cluster-Match: bei vault://-URI aus ontology lookup, sonst nur cluster_hint nutzen
        let clusterMatch = cluster_hint ?? null;
        let domain: string | null = null;
        if (source_uri.startsWith('vault://')) {
            const rawPath = source_uri.slice('vault://'.length);
            // AUDIT-014 H-1: validate before any FS / DB lookup
            const path = validateVaultPath(rawPath);
            if (!path) {
                ctx.callbacks.pushToolResult(
                    this.formatError(`IngestTriage: ungueltiger vault-path "${rawPath}". Path-Traversal-Marker oder NUL-Char enthalten.`),
                );
                return;
            }
            if (!clusterMatch) {
                clusterMatch = lookupPrimaryCluster(knowledgeDB.getDB(), path);
            }
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const cache = this.plugin.app.metadataCache.getFileCache(file);
                const fmSource = cache?.frontmatter?.source ?? cache?.frontmatter?.url ?? '';
                domain = typeof fmSource === 'string' ? normalizeDomain(fmSource) : null;
            }
        } else if (source_uri.startsWith('http://') || source_uri.startsWith('https://')) {
            domain = normalizeDomain(source_uri);
        }

        // Concentration-Check fuer Source-Diversity-Hint
        let concentrationHint = '';
        if (clusterMatch && domain && sourceStats) {
            const stats = sourceStats.getStatsForCluster(clusterMatch);
            const total = stats.reduce((s, x) => s + x.noteCount, 0);
            const thisDomain = stats.find((s) => s.sourceDomain === domain);
            const cnt = thisDomain?.noteCount ?? 0;
            if (total >= 5) {
                const ratio = cnt / total;
                if (ratio >= 0.7) {
                    concentrationHint = `**Source-Diversity-Warnung**: ${cnt}/${total} Notes im Cluster "${clusterMatch}" stammen bereits aus ${domain} (${Math.round(ratio * 100)}%). Eine weitere Aufnahme verstaerkt Echo-Chamber. Suche aktiv Gegenpositionen.`;
                }
            }
        }

        // Triage-Log: Decision festhalten (idempotent gegen Doppel-Trigger)
        const wasNew = triageStore.record(source_uri, decision);
        if (!wasNew && decision !== 'pending') {
            triageStore.updateDecision(source_uri, decision);
        }

        // Markdown-Triage-Karte rendern
        const lines: string[] = [
            '## Triage-Karte',
            '',
            `- **Source**: ${source_uri}`,
            clusterMatch ? `- **Cluster-Match**: ${clusterMatch}` : '- **Cluster-Match**: (kein Match in Ontologie)',
            domain ? `- **Source-Domain**: ${domain}` : '',
            `- **Decision (aktuell)**: ${decision}`,
            wasNew ? '- **Status**: erstmals triaged' : '- **Status**: bereits triaged (Decision aktualisiert)',
        ].filter(Boolean);

        if (concentrationHint) {
            lines.push('', concentrationHint);
        }

        // Vault/Memory/History-Recherche fuer verwandten Kontext. Default an;
        // Auto-Trigger-Pfade koennen mit skip_search=true abschalten.
        if (!skip_search) {
            const query = this.deriveSearchQuery(explicitQuery, source_uri);
            if (query) {
                const topK = Math.min(Math.max(Number(search_top_k) || 5, 1), 10);
                const sourcePath = source_uri.startsWith('vault://')
                    ? source_uri.slice('vault://'.length)
                    : undefined;
                const [vaultHits, memoryHits, historyHits] = await Promise.all([
                    this.searchVault(query, topK, sourcePath),
                    this.searchMemory(query, topK),
                    this.searchHistory(query, topK),
                ]);
                const searchSection = this.renderSearchSection(query, vaultHits, memoryHits, historyHits);
                if (searchSection) lines.push('', searchSection);
            }
        }

        lines.push(
            '',
            '_Naechste Schritte:_',
            '- Bei Decision "ingest": ggf separat ingest_document oder Dialog-Ingest-Modus aufrufen.',
            '- Bei Decision "spaeter": Note bleibt in Inbox, Triage-Log persistiert die Vormerkung.',
            '- Bei Decision "verwerfen": Source ist als nicht-relevant markiert.',
        );

        ctx.callbacks.pushToolResult(this.formatSuccess(lines.join('\n')));
    }

    /**
     * Build a search query from explicit input, or derive one from the
     * source URI. For vault://-paths, use basename plus frontmatter topics
     * / themes / summary fields. For URLs, use the path segment. Returns
     * an empty string when nothing usable can be extracted -- the caller
     * then skips the search pass instead of running on a noise query.
     */
    private deriveSearchQuery(explicit: string | undefined, sourceUri: string): string {
        if (explicit && explicit.trim()) return explicit.trim();
        if (sourceUri.startsWith('vault://')) {
            const path = sourceUri.slice('vault://'.length);
            const parts: string[] = [];
            const basename = path.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
            if (basename) parts.push(basename.replace(/[_\-]+/g, ' '));
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter;
                if (fm) {
                    const scoop = (key: string): string[] => {
                        const v = fm[key];
                        if (!v) return [];
                        if (Array.isArray(v)) return v.filter((s): s is string => typeof s === 'string');
                        return typeof v === 'string' ? [v] : [];
                    };
                    parts.push(...scoop('topics'), ...scoop('Themen'), ...scoop('themes'));
                    const summary = fm.Zusammenfassung ?? fm.summary ?? fm.zusammenfassung;
                    if (typeof summary === 'string') parts.push(summary);
                }
            }
            return parts.join(' ').trim();
        }
        if (sourceUri.startsWith('http://') || sourceUri.startsWith('https://')) {
            try {
                const u = new URL(sourceUri);
                const pathQuery = `${u.pathname} ${u.search}`
                    .replace(/[/?&=_\-]+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                return pathQuery;
            } catch {
                return '';
            }
        }
        return '';
    }

    private async searchVault(query: string, topK: number, excludePath: string | undefined): Promise<RelatedNote[]> {
        const idx = this.plugin.semanticIndex;
        if (!idx?.isIndexed) return [];
        try {
            const hits = await idx.search(query, topK + (excludePath ? 1 : 0));
            const filtered = excludePath ? hits.filter((h: { path: string }) => h.path !== excludePath) : hits;
            return filtered.slice(0, topK).map((h: { path: string; excerpt: string; score: number }) => ({
                path: h.path,
                excerpt: h.excerpt,
                score: h.score,
            }));
        } catch (e) {
            console.debug('[ingest_triage] vault search failed:', e);
            return [];
        }
    }

    private searchMemory(query: string, topK: number): RelatedFact[] {
        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) return [];
        try {
            const tokens = tokeniseQuery(query);
            if (tokens.length === 0) return [];
            // LIMIT 5000 covers any realistic personal fact store. The
            // RecallMemoryTool 500-default exists because that tool runs
            // on every agent turn (latency-sensitive); the triage runs
            // once per ingest and can afford a wider sweep.
            const res = memDB.getDB().exec(
                `SELECT id, text, topics FROM facts
                   WHERE is_latest = 1 AND deprecated_at IS NULL
                   ORDER BY importance DESC LIMIT 5000`,
            );
            const rows = res.length > 0 ? res[0].values : [];
            const scored: Array<RelatedFact> = [];
            for (const row of rows) {
                const id = row[0] as number;
                const text = (row[1] as string) ?? '';
                let topicsArr: string[] = [];
                try {
                    const raw = row[2] as string | null;
                    const parsed = raw ? JSON.parse(raw) as unknown : [];
                    if (Array.isArray(parsed)) {
                        topicsArr = parsed.filter((t): t is string => typeof t === 'string');
                    }
                } catch { /* malformed topics column -- ignore */ }
                const haystack = `${text.toLowerCase()} ${topicsArr.join(' ').toLowerCase()}`;
                let score = 0;
                for (const t of tokens) {
                    if (haystack.includes(t)) score += 1;
                }
                if (score > 0) scored.push({ id, text, topics: topicsArr, score });
            }
            scored.sort((a, b) => b.score - a.score);
            return scored.slice(0, topK);
        } catch (e) {
            console.debug('[ingest_triage] memory search failed:', e);
            return [];
        }
    }

    private searchHistory(query: string, topK: number): RelatedChat[] {
        const histDB = this.plugin.historyDB;
        if (!histDB?.isOpen()) return [];
        try {
            // Pick the longest token from the derived query for the LIKE
            // probe -- short tokens (<3 chars) blow up recall and produce
            // noise. If the query is short, fall back to the full string.
            const tokens = tokeniseQuery(query);
            const probe = tokens.length > 0
                ? tokens.reduce((a, b) => (b.length > a.length ? b : a))
                : query.trim().slice(0, 60);
            if (!probe) return [];
            const res = histDB.getDB().exec(
                `SELECT session_id, role, text, created_at FROM history_chunks
                   WHERE text LIKE ? ORDER BY created_at DESC LIMIT ?`,
                [`%${probe}%`, topK],
            );
            const rows = res.length > 0 ? res[0].values : [];
            return rows.map((row) => ({
                sessionId: row[0] as string,
                role: row[1] as string,
                text: (row[2] as string) ?? '',
                createdAt: (row[3] as string) ?? '',
            }));
        } catch (e) {
            console.debug('[ingest_triage] history search failed:', e);
            return [];
        }
    }

    private renderSearchSection(
        query: string,
        notes: RelatedNote[],
        facts: RelatedFact[],
        chats: RelatedChat[],
    ): string {
        const blocks: string[] = [];
        if (notes.length > 0) {
            const items = notes.map((n) => `- [[${n.path}]] -- ${truncate(n.excerpt, 160)}`);
            blocks.push(['**Verwandte Notes (Vault)**', ...items].join('\n'));
        }
        if (facts.length > 0) {
            const items = facts.map((f) => {
                const topics = f.topics.length > 0 ? ` _(${f.topics.join(', ')})_` : '';
                return `- ${truncate(f.text, 160)}${topics}`;
            });
            blocks.push(['**Verwandte Facts (Memory)**', ...items].join('\n'));
        }
        if (chats.length > 0) {
            const items = chats.map((c) => {
                const date = (c.createdAt ?? '').slice(0, 10);
                return `- _${c.role} @ ${date}_ -- ${truncate(c.text, 160)}`;
            });
            blocks.push(['**Verwandte Chats (History)**', ...items].join('\n'));
        }
        if (blocks.length === 0) return '';
        return [`_Recherche fuer Query: "${truncate(query, 80)}"_`, '', ...blocks].join('\n\n');
    }
}

function tokeniseQuery(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[\s_/,.;:!?()[\]{}"'`|@#=+*<>~^-]+/)
        .filter((t) => t.length >= 3);
}

function truncate(s: string, max: number): string {
    if (!s) return '';
    return s.length > max ? `${s.slice(0, max)}...` : s;
}

function lookupPrimaryCluster(db: ReturnType<NonNullable<ObsidianAgentPlugin['knowledgeDB']>['getDB']>, path: string): string | null {
    const r = db.exec(
        `SELECT cluster FROM ontology WHERE entity_path = ? ORDER BY confidence DESC LIMIT 1`,
        [path],
    );
    if (!r.length || !r[0].values.length) return null;
    return r[0].values[0][0] as string;
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
