/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
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
}

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
                'Schnell-Triage fuer eine Source (Artikel, PDF, vault-Note). ' +
                'Sammelt Cluster-Match aus der Ontologie, prueft Source-Domain-Diversity, ' +
                'erfasst die Decision (ingest/spaeter/verwerfen) im Triage-Log gegen Doppel-Trigger. ' +
                'Wird vom Auto-Trigger-Listener (Frontmatter-Property-Match) oder manuell aufgerufen. ' +
                'Liefert kompakten Markdown-Report mit Empfehlung. Token-Budget < 0.05 USD pro Triage-Pass.',
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
                },
                required: ['source_uri'],
            },
        };
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- ToolExecution interface contract: async signature shared with tools that do LLM calls
    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        const { source_uri, cluster_hint, decision = 'pending' } = input as unknown as IngestTriageInput;
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

        lines.push(
            '',
            '_Naechste Schritte:_',
            '- Bei Decision "ingest": ggf separat ingest_document oder Dialog-Ingest-Modus aufrufen.',
            '- Bei Decision "spaeter": Note bleibt in Inbox, Triage-Log persistiert die Vormerkung.',
            '- Bei Decision "verwerfen": Source ist als nicht-relevant markiert.',
        );

        ctx.callbacks.pushToolResult(this.formatSuccess(lines.join('\n')));
    }
}

function lookupPrimaryCluster(db: ReturnType<NonNullable<ObsidianAgentPlugin['knowledgeDB']>['getDB']>, path: string): string | null {
    const r = db.exec(
        `SELECT cluster FROM ontology WHERE entity_path = ? ORDER BY confidence DESC LIMIT 1`,
        [path],
    );
    if (!r.length || !r[0].values.length) return null;
    return r[0].values[0][0] as string;
}
