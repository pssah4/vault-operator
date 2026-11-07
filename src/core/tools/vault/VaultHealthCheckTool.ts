/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * VaultHealthCheckTool -- Run vault health checks and report findings.
 *
 * Executes SQL-based health checks (orphaned notes, missing backlinks,
 * broken links, weak clusters, inconsistent tags) and returns findings
 * formatted for the agent to suggest fixes.
 *
 * ADR-067: Lint Architecture
 * FEATURE-1901: Vault Health Check
 */

import { incomingRefreshFile } from '../../knowledge/incomingLinksRefresh';
import { TFile } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { BatchEditPreview } from '../editPreview';
import { t } from '../../../i18n';
import { buildHealthCheckOptions } from '../../knowledge/VaultHealthService';

export class VaultHealthCheckTool extends BaseTool<'vault_health_check'> {
    readonly name = 'vault_health_check' as const;
    // FIX-19-99-01: this tool's mutating actions (fix_backlinks, cleanup,
    // fix_categories, cleanup_edges) modify frontmatter across hundreds of
    // notes in one call. Pre-fix, isWriteOperation=false caused both
    // approval and checkpoint to be skipped -- mass-edits ran without a
    // restore point. The tool is in TOOL_GROUP_MAP.vault, which is
    // auto-approved by default for the user's own notes, so flipping to
    // true does not add UI friction. The Pipeline-level checkpoint still
    // looks for `input.path` (which this tool has no concept of), so the
    // tool builds an explicit multi-file snapshot itself before any
    // mutating action via takeRepairSnapshot().
    get isWriteOperation(): boolean { return true; }

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    /**
     * FEAT-44-02b: the motivating card-fatigue case. A repair action mutates
     * frontmatter across many notes INSIDE VaultHealthService -- the gate
     * used to see only the tool name. previewBatch surfaces the planned
     * target list (planRepairTargets shares the selection code with the
     * repair itself, pinned by parity tests) so the user approves a defined
     * scope in ONE card.
     *
     * scopeOnly: the exact per-note mutation is decided inside
     * processFrontMatter at write time; a simulated diff that can drift from
     * the write is worse than an honest path list. The scope card is
     * all-or-nothing, so no user-picked subsets arrive -- but since
     * FIX-44-56 the Pipeline passes the FULL planned set as
     * approvedBatchPaths, and execute threads it into the fix methods as
     * their targetFilter: the repair provably writes only what the card
     * showed, even when the vault drifted while the card was open.
     *
     * check / refresh / cleanup_edges return null: they write no vault
     * files, the plain card stays honest for them.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- interface contract is async; the plan itself is synchronous reads
    async previewBatch(input: Record<string, unknown>): Promise<BatchEditPreview | null> {
        const action = (input.action as string) || 'check';
        if (action === 'refresh_incoming_links') {
            const paths = this.incomingRefreshPaths(input);
            return paths.length === 0 ? null : {
                entries: paths.map(path => ({ path, before: '', after: '' })),
                summary: t('ui.approval.scope.vaultHealth', { action, count: String(paths.length) }),
                scopeOnly: true,
            };
        }
        if (action !== 'fix_backlinks' && action !== 'cleanup' && action !== 'fix_categories') {
            return null;
        }
        const healthService = this.plugin.vaultHealthService;
        if (!healthService) return null;
        try {
            // Same property arguments the execute branches pass to the fix
            // methods, so plan and repair select the same targets.
            const targets = healthService.planRepairTargets(
                action,
                this.plugin.settings.backlinksProperty ?? 'Notizen',
                this.plugin.settings.categoryProperty ?? 'Kategorie',
                this.plugin.settings.vaultHealth?.reciprocalProperties ?? [],
            );
            if (targets.length === 0) return null;
            return {
                entries: targets.map((path) => ({ path, before: '', after: '' })),
                summary: t('ui.approval.scope.vaultHealth', {
                    action,
                    count: String(targets.length),
                }),
                scopeOnly: true,
            };
        } catch (err) {
            console.warn('[VaultHealthCheck] previewBatch failed (card fallback):', err);
            return null;
        }
    }

    /** A missing/invalid list never means a full-vault refresh. */
    private incomingRefreshPaths(input: Record<string, unknown>): string[] {
        if (!Array.isArray(input.paths)) return [];
        const paths = [...new Set(input.paths.filter((path): path is string => typeof path === 'string'))];
        if (paths.length > 500) return [];
        return paths.filter(path => incomingRefreshFile(this.plugin, path) !== null);
    }

    /**
     * Multi-file snapshot guard: collects every markdown file that the
     * upcoming mass-repair could touch and commits one checkpoint before
     * the repair runs. Idempotent if the checkpoint service is missing
     * (returns null and lets the repair proceed, since vault data is also
     * undo-able via Obsidian native).
     */
    private async takeRepairSnapshot(action: string): Promise<void> {
        const cp = this.plugin.checkpointService;
        if (!cp) return;
        // FEAT-19-04-01 W2c: die .base-Automatik ist abgeschaltet, der Plan
        // enthaelt nur noch .md-Ziele (kein NEU angelegtes
        // `<name>-Backlinks.base` mehr). Der Plan bleibt trotzdem die
        // Snapshot-Quelle: er ist die autorisierte Aenderungsmenge, und die
        // Vereinigung mit getMarkdownFiles schadet nicht.
        // (Historie SEC M-3, Audit 2026-07-19: solange fixMissingBacklinks
        // ueber ensureBacklinksBase .base-Dateien anlegte, fehlten die in
        // checkpoint.newFiles und ueberlebten jedes Undo -- der Plan trug sie.)
        const svc = this.plugin.vaultHealthService;
        const planned = svc && (action === 'fix_backlinks' || action === 'cleanup' || action === 'fix_categories')
            ? svc.planRepairTargets(
                action,
                this.plugin.settings.backlinksProperty ?? 'Notizen',
                this.plugin.settings.categoryProperty ?? 'Kategorie',
                this.plugin.settings.vaultHealth?.reciprocalProperties ?? [],
            )
            : [];
        const all = [...new Set([
            ...this.plugin.app.vault.getMarkdownFiles().map((f) => f.path),
            ...planned,
        ])];
        if (all.length === 0) return;
        const taskId = `vault-health-${action}-${Date.now()}`;
        try {
            await cp.snapshot(taskId, all, `vault_health_check:${action}`);
        } catch (err) {
            console.warn('[VaultHealthCheck] pre-repair snapshot failed (proceeding anyway):', err);
        }
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'vault_health_check',
            description:
                'Run structural health checks on the vault: orphaned notes (no incoming links), missing backlinks (one-directional MOC links), broken links (target does not exist), weak clusters (semantically similar but not linked), inconsistent tags (spelling variants). Returns findings with suggested fixes. Use this proactively to maintain vault quality.',
            input_schema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        enum: ['check', 'fix_backlinks', 'cleanup', 'fix_categories', 'cleanup_edges', 'refresh', 'record_freshness', 'refresh_incoming_links'],
                        description: 'Action to perform. "check" (default): run health checks. "fix_backlinks": fix missing backlinks. "cleanup": remove invalid backlinks. "fix_categories": move values from wrong property to correct (e.g. Thema in Konzepte → Themen). "refresh": re-extract graph + ontology before checking. "refresh_incoming_links": regenerate incoming-links blocks only for the explicit paths (scope approval and checkpoint required). "record_freshness": persist content-level freshness verdicts (e.g. from the daily-briefing skill) into the knowledge review.',
                    },
                    paths: {
                        type: 'array',
                        items: { type: 'string' },
                        maxItems: 500,
                        description: 'refresh_incoming_links only: required explicit vault-relative Markdown paths. Empty means no files; maximum 500 per call.',
                    },
                    verdicts: {
                        type: 'array',
                        description: 'record_freshness only: one entry per judged note. verdict is one of matches, extends, contradicts, outdated.',
                        items: {
                            type: 'object',
                            properties: {
                                path: { type: 'string', description: 'Vault-relative note path.' },
                                verdict: { type: 'string', enum: ['matches', 'extends', 'contradicts', 'outdated'] },
                                summary: { type: 'string', description: 'One sentence: what the source changes for this note.' },
                                confidence: { type: 'number', description: '0..1, default 0.7.' },
                                source_url: { type: 'string', description: 'The read source backing the verdict.' },
                                published: { type: 'string', description: 'Source publication date, YYYY-MM-DD.' },
                            },
                            required: ['path', 'verdict', 'summary'],
                        },
                    },
                },
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;

        if (input.action === 'refresh_incoming_links') {
            try {
                const approved = context.approvedBatchPaths;
                if (!approved) throw new Error('Refresh aborted: no approved path list.');
                const paths = this.incomingRefreshPaths(input).filter(path => approved.has(path));
                if (paths.length === 0) {
                    callbacks.pushToolResult('No approved writable notes to refresh. Supply explicit paths (at most 500).');
                    return;
                }
                const checkpoint = this.plugin.checkpointService;
                if (!checkpoint) throw new Error('Refresh aborted: checkpoint service is unavailable. Enable checkpoints first.');
                const result = await this.plugin.regenerateIncomingLinksBlocks(paths, async planned => {
                    if (context.abortSignal?.aborted) throw new Error('Refresh cancelled.');
                    // The renderer holds its refresh mutex throughout this callback.
                    const saved = await checkpoint.snapshot(context.taskId, [...planned], 'vault_health_check:refresh_incoming_links');
                    if (saved.commitOid === 'empty' || saved.skipped?.length || planned.some(path => !saved.filesChanged.includes(path))) {
                        throw new Error('Refresh aborted: checkpoint does not cover every approved note.');
                    }
                    if (context.abortSignal?.aborted) throw new Error('Refresh cancelled.');
                }, context.abortSignal);
                callbacks.pushToolResult(`Incoming-links refresh: ${result.status}; ${result.written} note(s) updated, ${result.failed} failed, ${result.hubs} selected.`);
            } catch (error) {
                callbacks.pushToolResult(this.formatError(error));
            }
            return;
        }

        const healthService = this.plugin.vaultHealthService;
        if (!healthService) {
            callbacks.pushToolResult('Vault health check is not available. The semantic index must be built first (Settings > Embeddings > Build Index).');
            return;
        }

        const action = (input.action as string) || 'check';

        // FIX-44-56: the planned scope the user approved on the gate. The
        // fix methods re-run their selection at execute time; pinning them
        // to this set keeps the repair inside what the card showed even when
        // the vault changed while the card was open.
        const approvedScope = context.approvedBatchPaths;
        // SEC L-1 (Audit 2026-07-19): der Fallback "kein Scope -> frisch
        // berechneter Vollplan" war kein Schutz, sondern ein Freibrief: er
        // band den Repair an die VOLLE Live-Selektion, also genau an die
        // Menge, die ohne jede Approval entsteht. ADR-165 verlangt eine
        // approvte Liste; fehlt sie, wird nicht geschrieben.
        const boundScope = (): ReadonlySet<string> | null => approvedScope ?? null;

        try {
            if (action === 'refresh' || action === 'check') {
                // Refresh graph + ontology (always for refresh, before check to get fresh data)
                if (action === 'refresh') {
                    const vault = this.plugin.app.vault;
                    if (this.plugin.graphExtractor) {
                        // FEAT-19-04-01 W3: extractAll ist async; awaiten, damit
                        // Ontology-Bootstrap und Check frische Kanten lesen.
                        await this.plugin.graphExtractor.extractAll(vault);
                        callbacks.log('Graph re-extracted');
                    }
                    if (this.plugin.ontologyStore) {
                        const catProp = this.plugin.settings.categoryProperty ?? 'Kategorie';
                        const categoryMap = new Map<string, string>();
                        for (const file of vault.getMarkdownFiles()) {
                            const cache = this.plugin.app.metadataCache.getFileCache(file);
                            if (cache?.frontmatter?.[catProp]) {
                                const cat = Array.isArray(cache.frontmatter[catProp])
                                    ? (cache.frontmatter[catProp][0] ?? '').toString().trim()
                                    : cache.frontmatter[catProp].toString().trim();
                                if (cat) categoryMap.set(file.path, cat);
                            }
                        }
                        this.plugin.ontologyStore.bootstrapFromEdges(
                            this.plugin.settings.mocPropertyNames ?? [],
                            catProp,
                            categoryMap,
                        );
                        callbacks.log('Ontology rebuilt');
                    }
                }

                const findings = await healthService.runChecks(undefined, buildHealthCheckOptions(this.plugin.settings));
                const formatted = healthService.formatFindings(findings);
                callbacks.pushToolResult(formatted);
                callbacks.log(`Vault health check: ${findings.length} finding(s)`);

            } else if (action === 'fix_backlinks') {
                const scope = boundScope();
                if (!scope) {
                    callbacks.pushToolResult(
                        'Repair aborted: no approved path list. The approval gate must run first '
                        + '(vault_health_check surfaces the plan as a scope card); repairs never '
                        + 'fall back to the full live selection.',
                    );
                    return;
                }
                await this.takeRepairSnapshot('fix_backlinks');
                // Batch-fix all missing backlinks in pure code (0 LLM tokens).
                // FEAT-19-04-01 W2c: nur Frontmatter-Rueck-Links (max
                // MAX_FRONTMATTER_BACKLINKS). Overload-Hubs sind aus der
                // Finding-Menge ausgeschlossen (Praedikat-Filter 3); ihre
                // Rueckverweise zeigt der selbstbildende Block.
                // ADR-164: Settings-Properties statt Hardcode 'Notizen'; die
                // Reziprok-Paare gehen mit, damit Plan/Repair dieselbe Menge
                // sehen wie der Check.
                const result = await healthService.fixMissingBacklinks(
                    this.plugin.settings.backlinksProperty ?? 'Notizen',
                    this.plugin.settings.categoryProperty ?? 'Kategorie',
                    this.plugin.settings.vaultHealth?.reciprocalProperties ?? [],
                    scope,
                );
                callbacks.pushToolResult(
                    `Missing backlinks fixed: ${result.entitiesFixed} entities updated, ` +
                    `${result.linksAdded} frontmatter backlinks added.\n` +
                    `All changes are reversible via Undo. Run vault_health_check with action "refresh" to verify.`,
                );
                callbacks.log(`fix_backlinks: ${result.entitiesFixed} entities, ${result.linksAdded} links`);

            } else if (action === 'cleanup') {
                const scope = boundScope();
                if (!scope) {
                    callbacks.pushToolResult(
                        'Repair aborted: no approved path list. The approval gate must run first '
                        + '(vault_health_check surfaces the plan as a scope card); repairs never '
                        + 'fall back to the full live selection.',
                    );
                    return;
                }
                await this.takeRepairSnapshot('cleanup');
                // Remove invalid backlinks from frontmatter (non-.md, broken, duplicates)
                // Also clears Notizen for Thema/Konzept notes (Bases handle those)
                const result = await healthService.cleanupInvalidBacklinks(
                    this.plugin.settings.backlinksProperty ?? 'Notizen',
                    this.plugin.settings.categoryProperty ?? 'Kategorie',
                    scope,
                );
                callbacks.pushToolResult(
                    `Cleanup complete: ${result.notesProcessed} notes processed, ${result.linksRemoved} invalid links removed.\n` +
                    `Thema/Konzept notes: Notizen property cleared (Bases handle backlinks).\n` +
                    `Other notes: non-.md links and duplicates removed.\n` +
                    `All changes are reversible via Undo.`,
                );
                callbacks.log(`cleanup: ${result.notesProcessed} notes, ${result.linksRemoved} removed`);

            } else if (action === 'fix_categories') {
                const scope = boundScope();
                if (!scope) {
                    callbacks.pushToolResult(
                        'Repair aborted: no approved path list. The approval gate must run first '
                        + '(vault_health_check surfaces the plan as a scope card); repairs never '
                        + 'fall back to the full live selection.',
                    );
                    return;
                }
                await this.takeRepairSnapshot('fix_categories');
                try {
                    const result = await healthService.fixCategoryMismatches(this.plugin.settings.categoryProperty ?? 'Kategorie', scope);
                    callbacks.pushToolResult(
                        `Category mismatches fixed: ${result.notesFixed} notes updated, ${result.valuesMovied} values moved.\n` +
                        `Thema/Konzept values moved to correct property.\n` +
                        `All changes are reversible via Undo.`,
                    );
                    callbacks.log(`fix_categories: ${result.notesFixed} notes, ${result.valuesMovied} moved`);
                } catch (catErr) {
                    const msg = catErr instanceof Error ? catErr.message : String(catErr);
                    callbacks.pushToolResult(`fix_categories failed: ${msg}`);
                    console.warn('[VaultHealthCheck] fix_categories error:', catErr);
                }

            } else if (action === 'cleanup_edges') {
                // No pre-snapshot needed: cleanupOrphanedEdges only touches
                // the knowledge.db edges table, not vault files.
                const result = healthService.cleanupOrphanedEdges();
                callbacks.pushToolResult(
                    `Orphaned edges cleaned: ${result.edgesRemoved} edges removed from deleted/trashed notes.\n` +
                    `Run vault_health_check with action "check" to verify.`,
                );
                callbacks.log(`cleanup_edges: ${result.edgesRemoved} removed`);
            } else if (action === 'record_freshness') {
                // FEAT-19-16-11: the hand-over lane for content-level verdicts
                // from a skill (daily-briefing records per-note verdicts in its
                // day file). knowledge.db is a deny-zone for skills and sandbox
                // code (FIX-44-22/44-24), so this action is the only door.
                // Writes DB rows only, never vault files; no snapshot needed.
                this.recordFreshness(input, callbacks);
            }
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }

    /**
     * FEAT-19-16-11: validate and persist skill-provided verdicts. Unknown
     * paths and unknown verdict literals are rejected INDIVIDUALLY and named
     * in the result; the rest is written. Rejecting the whole call for one
     * bad row would teach the agent to retry blindly.
     */
    private recordFreshness(input: Record<string, unknown>, callbacks: ToolExecutionContext['callbacks']): void {
        const ALLOWED = ['matches', 'extends', 'contradicts', 'outdated'];
        const raw = Array.isArray(input.verdicts) ? input.verdicts : [];
        const kdb = this.plugin.knowledgeDB;
        if (!kdb?.isOpen?.()) {
            callbacks.pushToolResult(this.formatError('knowledge.db is not open; build the semantic index first.'));
            return;
        }
        if (raw.length === 0) {
            callbacks.pushToolResult(this.formatError('record_freshness needs verdicts: [{path, verdict, summary, confidence?, source_url?, published?}].'));
            return;
        }
        const db = kdb.getDB();
        const nowIso = new Date().toISOString();
        let recorded = 0;
        const rejected: string[] = [];
        for (const entry of raw as Array<Record<string, unknown>>) {
            const path = typeof entry?.path === 'string' ? entry.path : '';
            const verdict = typeof entry?.verdict === 'string' ? entry.verdict : '';
            const summary = typeof entry?.summary === 'string' ? entry.summary : '';
            const confidence = Math.min(1, Math.max(0, Number(entry?.confidence ?? 0.7)));
            const sourceUrl = typeof entry?.source_url === 'string' ? entry.source_url : '';
            if (!path || path.includes('..') || path.startsWith('/')) {
                rejected.push(`${path || '(empty path)'}: invalid path`);
                continue;
            }
            if (!ALLOWED.includes(verdict)) {
                rejected.push(`${path}: unknown verdict "${verdict}" (use ${ALLOWED.join(', ')})`);
                continue;
            }
            const file = this.plugin.app.vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                rejected.push(`${path}: not a note in this vault`);
                continue;
            }
            const sourcesJson = JSON.stringify(sourceUrl ? [sourceUrl] : []);
            // Verdict columns only; an existing classification (class +
            // classified_at) stays untouched -- the FIX-19-16-02 contract
            // from the other direction. An unclassified note gets a neutral
            // 'evolving' so the row satisfies NOT NULL without pretending a
            // vote happened.
            db.run(
                `INSERT INTO note_freshness (path, freshness_class, temporal_marker_count, classified_at,
                    last_verdict, last_confidence, last_summary, last_sources_json, last_checked_at, last_verifier_tier)
                 VALUES (?, 'evolving', 0, ?, ?, ?, ?, ?, ?, 'skill')
                 ON CONFLICT(path) DO UPDATE SET
                    last_verdict = excluded.last_verdict,
                    last_confidence = excluded.last_confidence,
                    last_summary = excluded.last_summary,
                    last_sources_json = excluded.last_sources_json,
                    last_checked_at = excluded.last_checked_at,
                    last_verifier_tier = excluded.last_verifier_tier`,
                [path, nowIso, verdict, confidence, summary, sourcesJson, nowIso],
            );
            db.run(
                `INSERT INTO note_freshness_history (path, run_at, verdict, confidence, summary, sources_json, verifier_tier, model_id, tokens_used)
                 VALUES (?, ?, ?, ?, ?, ?, 'skill', 'daily-briefing', 0)`,
                [path, nowIso, verdict, confidence, summary, sourcesJson],
            );
            recorded++;
        }
        kdb.markDirty?.();
        const lines = [`Recorded ${recorded} freshness verdict(s).`];
        if (rejected.length) {
            lines.push(`Rejected ${rejected.length}:`);
            for (const r of rejected) lines.push(`- ${r}`);
        }
        callbacks.pushToolResult(lines.join('\n'));
        callbacks.log(`record_freshness: ${recorded} recorded, ${rejected.length} rejected`);
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
