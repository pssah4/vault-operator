/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * VaultHealthRepairModal -- Findings view with selective repair, discuss, and skip.
 *
 * Shows each finding with checkboxes (repairable), discuss (all), and skip (all).
 * Discuss opens a new agent chat. Skip persists the dismissal in KnowledgeDB.
 *
 * FEATURE-1901: Vault Health Check
 * FIX-15: Detailed findings + selective repair
 */

import { Modal, Notice, setIcon, Platform, TFile } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { VIEW_TYPE_AGENT_SIDEBAR } from '../AgentSidebarView';
import type { HealthFinding, HealthCheckType } from '../../core/knowledge/VaultHealthService';
import type { CheckpointInfo } from '../../core/checkpoints/GitCheckpointService';
import { KnowledgeReviewReader, type ReviewRow } from '../../core/health/KnowledgeReviewReader';
import type { VerdictLiteral } from '../../core/health/types';
import { ResolveConflictModal } from './ResolveConflictModal';
import { BatchResolveModal } from './BatchResolveModal';

/**
 * Display-only labels for the verdict literals. Storage and code
 * still use the canonical English literal (matches, extends, ...);
 * this map is the user-facing surface only.
 */
const VERDICT_LABELS: Record<VerdictLiteral, string> = {
    matches: 'Matches sources',
    extends: 'Could extend',
    contradicts: 'Contradicted by sources',
    outdated: 'Outdated',
    no_external_source: 'No external evidence yet',
};

/**
 * Cluster-level finding types that belong in the Knowledge review
 * tab (not Findings). Cluster freshness is the Karpathy-Lint score
 * over note groups; it is semantically the same family as the
 * note-level verifier flags.
 */
const KNOWLEDGE_REVIEW_CHECKS = new Set<HealthCheckType>(['cluster_freshness']);

/**
 * Map the verifier's `ReviewSeverity` (critical/moderate/info/ok)
 * onto the `HealthFinding` severity scale (high/medium/low) so the
 * Knowledge review tab shares the same severity-pill UI and CSS
 * classes as the Findings tab.
 */
function reviewSeverityToFindingSeverity(
    s: import('../../core/health/KnowledgeReviewReader').ReviewSeverity,
): 'high' | 'medium' | 'low' {
    switch (s) {
        case 'critical':
            return 'high';
        case 'moderate':
            return 'medium';
        case 'info':
            return 'low';
        case 'ok':
            return 'low';
        default:
            return 'low';
    }
}

// IMP-19-01-02 + FIX-19-01-04: auto-fix scope.
// - missing_backlinks, category_mismatch, weak_clusters: deterministic fixes.
// - orphans: only the `metadata.orphanKind === 'isolated'` finding is
//   repairable (move to Inbox/Orphans/). `with_context` orphans have
//   outgoing edges or cluster membership and need a manual "add
//   incoming backlink" decision; `isRepairableFinding` enforces this
//   per-finding rather than per-check.
// - inconsistent_tags: NO fixInconsistentTags method exists; the
//   finding is a manual-review hint ("consider unifying"). Removed
//   from the auto-fix scope until a real implementation lands.
// - broken_links + god_nodes: manual decisions.
const REPAIRABLE_CHECKS = new Set<HealthCheckType>([
    'missing_backlinks', 'category_mismatch',
    'orphans', 'weak_clusters',
]);

/**
 * FIX-19-01-04: per-finding repairable filter that respects the
 * orphan-kind split. Use this instead of `REPAIRABLE_CHECKS.has(f.check)`
 * whenever the auto-fix selects findings; the legacy check-type set
 * is still useful for "could this category produce repairable
 * findings" decisions.
 */
function isRepairableFinding(f: HealthFinding): boolean {
    if (!REPAIRABLE_CHECKS.has(f.check)) return false;
    if (f.check === 'orphans') {
        return f.metadata?.orphanKind === 'isolated';
    }
    return true;
}

const CHECK_LABELS: Record<string, string> = {
    orphans: 'Orphaned notes',
    missing_backlinks: 'Missing backlinks',
    broken_links: 'Broken links',
    weak_clusters: 'Semantically similar but unlinked',
    inconsistent_tags: 'Inconsistent tags',
    category_mismatch: 'Category mismatches',
    god_nodes: 'Overloaded hub notes',
    cluster_freshness: 'Cluster freshness (Karpathy-Lint)',
    source_concentration: 'Source concentration (Bias)',
};

type SeverityFilter = 'all' | 'high' | 'medium' | 'low';
type TopTab = 'findings' | 'review';

export class VaultHealthRepairModal extends Modal {
    private plugin: ObsidianAgentPlugin;
    private findings: HealthFinding[];
    private selectedFindings = new Set<number>();
    private onDiscuss?: (prompt: string) => void;
    /** FEAT-19-18: severity filter pill (all/high/medium/low). Default 'all'. */
    private severityFilter: SeverityFilter = 'all';
    /** IMP-20-06-01 Wave 3: top-level view switch between findings and the Knowledge-review tab. */
    private topTab: TopTab = 'findings';

    constructor(
        plugin: ObsidianAgentPlugin,
        findings: HealthFinding[],
        onDiscuss?: (prompt: string) => void,
    ) {
        super(plugin.app);
        this.plugin = plugin;
        this.findings = findings;
        this.onDiscuss = onDiscuss;
    }

    onOpen(): void {
        // IMP-19-01-01 AC-06: when the sidebar set the auto-apply
        // flag, skip the findings render and drive the existing
        // runRepair() path over the REPAIRABLE subset. The results
        // screen surfaces with the same Undo/Done shape as a manual
        // run. Findings tab stays reachable via the Done button.
        if (this.autoApplyOnOpen) {
            this.autoApplyOnOpen = false;
            this.selectAllRepairable();
            if (this.selectedFindings.size > 0) {
                void this.runRepair();
                return;
            }
        }
        this.render();
    }

    private render(): void {
        if (this.topTab === 'findings') this.showFindings();
        else this.showKnowledgeReview();
    }

    private renderTopTabs(parent: HTMLElement): void {
        const row = parent.createDiv('vault-health-top-tabs');
        const findingsBtn = row.createEl('button', {
            text: 'Findings',
            cls: 'vault-health-top-tab' + (this.topTab === 'findings' ? ' is-active' : ''),
        });
        const reviewBtn = row.createEl('button', {
            text: 'Knowledge review',
            cls: 'vault-health-top-tab' + (this.topTab === 'review' ? ' is-active' : ''),
        });
        findingsBtn.addEventListener('click', () => {
            this.topTab = 'findings';
            this.render();
        });
        reviewBtn.addEventListener('click', () => {
            this.topTab = 'review';
            this.render();
        });
    }

    private showKnowledgeReview(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('vault-health-modal');
        this.renderTopTabs(contentEl);

        // IMP-20-06-01 W3-T4: mobile guard.
        if (Platform.isMobile) {
            contentEl.createEl('h3', { text: 'Knowledge review' });
            contentEl.createEl('p', {
                text: 'Knowledge review needs the desktop client. Open the same vault on desktop to resolve flagged notes.',
            });
            return;
        }

        // Source 1: cluster_freshness HealthFindings live in this.findings.
        const clusterFindings = this.findings.filter((f) =>
            KNOWLEDGE_REVIEW_CHECKS.has(f.check),
        );

        // Source 2: per-note verdicts persisted by the verifier.
        const db = this.plugin.knowledgeDB?.getDB();
        const noteRows: ReviewRow[] = db
            ? new KnowledgeReviewReader(db).listAll(false)
            : [];

        // Mapped severity (critical/moderate/info -> high/medium/low) drives
        // the same severity-pill UI the Findings tab uses; the underlying
        // ReviewSeverity stays untouched in storage and data layer.
        const noteRowsWithSev = noteRows.map((r) => ({
            row: r,
            severity: reviewSeverityToFindingSeverity(r.severity),
        }));
        const clusterFindingsWithSev = clusterFindings.map((f) => ({
            finding: f,
            severity: f.severity,
        }));

        const totalCount = clusterFindings.length + noteRows.length;
        const counts: Record<SeverityFilter, number> = {
            all: totalCount,
            high:
                clusterFindingsWithSev.filter((c) => c.severity === 'high').length +
                noteRowsWithSev.filter((n) => n.severity === 'high').length,
            medium:
                clusterFindingsWithSev.filter((c) => c.severity === 'medium').length +
                noteRowsWithSev.filter((n) => n.severity === 'medium').length,
            low:
                clusterFindingsWithSev.filter((c) => c.severity === 'low').length +
                noteRowsWithSev.filter((n) => n.severity === 'low').length,
        };

        contentEl.createEl('h3', { text: `Knowledge review (${totalCount} items)` });

        const filterRow = contentEl.createDiv('vault-health-filter-row');
        const tabs: Array<{ key: SeverityFilter; label: string }> = [
            { key: 'all', label: `All (${counts.all})` },
            { key: 'high', label: `High (${counts.high})` },
            { key: 'medium', label: `Medium (${counts.medium})` },
            { key: 'low', label: `Low (${counts.low})` },
        ];
        for (const tab of tabs) {
            const btn = filterRow.createEl('button', {
                text: tab.label,
                cls: 'vault-health-filter-tab' + (this.severityFilter === tab.key ? ' is-active' : ''),
            });
            btn.addEventListener('click', () => {
                this.severityFilter = tab.key;
                this.render();
            });
        }

        if (totalCount === 0) {
            contentEl.createEl('p', {
                text: 'No knowledge-review items right now. Cluster-freshness flags and per-note verdicts appear here once the freshness verifier and the periodic lint produce them.',
            });
            return;
        }

        // Top toolbar: Batch resolve action over the per-note verdicts.
        if (noteRows.length) {
            const batchRow = contentEl.createDiv('vault-health-knowledge-review-toolbar');
            const batchBtn = batchRow.createEl('button', { text: 'Batch resolve' });
            batchBtn.addEventListener('click', () => {
                new BatchResolveModal(this.plugin, noteRows, { onChange: () => this.render() }).open();
            });
        }

        const visibleCluster = this.severityFilter === 'all'
            ? clusterFindingsWithSev
            : clusterFindingsWithSev.filter((c) => c.severity === this.severityFilter);
        const visibleNotes = this.severityFilter === 'all'
            ? noteRowsWithSev
            : noteRowsWithSev.filter((n) => n.severity === this.severityFilter);

        // Cluster freshness section (single bucket, same shape as a
        // Findings section).
        if (visibleCluster.length) {
            this.renderClusterFreshnessSection(contentEl, visibleCluster);
        }

        // Per-verdict sections. The order is the natural severity
        // gradient so the most urgent verdict bucket sits at the top.
        const verdictOrder: VerdictLiteral[] = [
            'contradicts',
            'outdated',
            'extends',
            'no_external_source',
        ];
        const groupedByVerdict = new Map<VerdictLiteral, Array<{ row: ReviewRow; severity: 'high' | 'medium' | 'low' }>>();
        for (const v of visibleNotes) {
            const entry = groupedByVerdict.get(v.row.verdict) ?? [];
            entry.push(v);
            groupedByVerdict.set(v.row.verdict, entry);
        }
        for (const verdict of verdictOrder) {
            const rows = groupedByVerdict.get(verdict);
            if (!rows?.length) continue;
            this.renderVerdictSection(contentEl, verdict, rows);
        }

        // The `matches` bucket only appears if some row carried it
        // (the reader hides matches by default; defensive render).
        const matchesRows = groupedByVerdict.get('matches');
        if (matchesRows?.length) {
            this.renderVerdictSection(contentEl, 'matches', matchesRows);
        }
    }

    private renderClusterFreshnessSection(
        parent: HTMLElement,
        entries: Array<{ finding: HealthFinding; severity: 'high' | 'medium' | 'low' }>,
    ): void {
        const sectionSeverity = entries[0].severity;
        const details = parent.createEl('details', { cls: 'vault-health-section' });
        details.setAttribute('open', '');

        const summary = details.createEl('summary', { cls: 'vault-health-section-header' });
        summary.createSpan({ cls: `vault-health-severity severity-${sectionSeverity}`, text: sectionSeverity });
        summary.createSpan({
            cls: 'vault-health-section-count',
            text: ` Cluster freshness (${entries.length})`,
        });
        summary.createSpan({ cls: 'vault-health-tag-info', text: ' (review recommended)' });

        const content = details.createDiv('vault-health-section-content');
        for (const { finding, severity } of entries) {
            const row = content.createDiv('vault-health-finding-row');

            const label = row.createSpan({ cls: 'vault-health-note-link' });
            label.setText(finding.cluster ?? 'Cluster');

            const actions = row.createDiv('vault-health-finding-actions');
            const discussBtn = actions.createEl('button', {
                cls: 'vault-health-icon-btn',
                attr: { 'aria-label': 'Discuss freshness update for this cluster' },
            });
            setIcon(discussBtn, 'refresh-cw');
            discussBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const prompt = `Cluster "${finding.cluster ?? ''}" is past its half-life. Suggest a web-search update pass and the source notes that should go through deep-ingest. ${finding.description ?? ''}`.trim();
                this.close();
                this.onDiscuss?.(prompt);
            });

            const dismissBtn = actions.createEl('button', {
                cls: 'vault-health-icon-btn',
                attr: { 'aria-label': 'Dismiss this cluster freshness flag' },
            });
            setIcon(dismissBtn, 'eye-off');
            dismissBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                this.dismissClusterFreshness(finding, row, content, details, entries.length);
            });

            // severity passed through `cls` matches the row-side variation
            // the Findings tab uses; no extra info text needed since the
            // description already lives below.
            void severity;

            const preview = content.createDiv('vault-health-fix-preview');
            preview.setText(finding.description ?? `Cluster "${finding.cluster ?? ''}"`);
        }
    }

    private renderVerdictSection(
        parent: HTMLElement,
        verdict: VerdictLiteral,
        entries: Array<{ row: ReviewRow; severity: 'high' | 'medium' | 'low' }>,
    ): void {
        // Section severity = worst-wins over the rows in the bucket.
        const sectionSeverity: 'high' | 'medium' | 'low' = entries.some((e) => e.severity === 'high')
            ? 'high'
            : entries.some((e) => e.severity === 'medium')
                ? 'medium'
                : 'low';
        const label = VERDICT_LABELS[verdict] ?? verdict;

        const details = parent.createEl('details', { cls: 'vault-health-section' });
        details.setAttribute('open', '');

        const summary = details.createEl('summary', { cls: 'vault-health-section-header' });
        summary.createSpan({ cls: `vault-health-severity severity-${sectionSeverity}`, text: sectionSeverity });
        summary.createSpan({
            cls: 'vault-health-section-count',
            text: ` ${label} (${entries.length})`,
        });

        const content = details.createDiv('vault-health-section-content');
        for (const { row } of entries) {
            const noteRow = content.createDiv('vault-health-finding-row');

            const noteLink = noteRow.createSpan({ cls: 'vault-health-note-link' });
            noteLink.setText(this.formatPath(row.path));
            noteLink.addEventListener('click', () => {
                this.close();
                void this.app.workspace.openLinkText(row.path, '');
            });

            const meta = noteRow.createSpan({ cls: 'vault-health-path-count' });
            meta.setText(` confidence ${row.confidence.toFixed(2)} · ${row.verifierTier} tier`);

            const actions = noteRow.createDiv('vault-health-finding-actions');

            const discussBtn = actions.createEl('button', {
                cls: 'vault-health-icon-btn',
                attr: { 'aria-label': 'Discuss with agent' },
            });
            setIcon(discussBtn, 'message-square');
            discussBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const prompt = this.buildVerdictPrompt(row);
                this.close();
                this.onDiscuss?.(prompt);
            });

            const resolveBtn = actions.createEl('button', {
                cls: 'vault-health-icon-btn',
                attr: { 'aria-label': 'Open resolve dialog' },
            });
            setIcon(resolveBtn, 'check-circle');
            resolveBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                new ResolveConflictModal(this.plugin, row, { onChange: () => this.render() }).open();
            });

            const dismissBtn = actions.createEl('button', {
                cls: 'vault-health-icon-btn',
                attr: { 'aria-label': 'Dismiss this verdict' },
            });
            setIcon(dismissBtn, 'eye-off');
            dismissBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                this.dismissVerdict(row, noteRow, content, details, entries.length);
            });

            const preview = content.createDiv('vault-health-fix-preview');
            preview.setText(row.summary || '(no summary returned by the verifier)');
        }
    }

    private buildVerdictPrompt(row: ReviewRow): string {
        const label = VERDICT_LABELS[row.verdict] ?? row.verdict;
        const sources = row.sources.length ? `\n\nSources:\n${row.sources.map((s) => `- ${s}`).join('\n')}` : '';
        return `Help me review the note **${row.path}**. The freshness verifier flagged it as **${label}** with confidence ${row.confidence.toFixed(2)}.\n\nSummary: ${row.summary || '(none)'}${sources}`;
    }

    private dismissVerdict(
        row: ReviewRow,
        rowEl: HTMLElement,
        content: HTMLElement,
        details: HTMLDetailsElement,
        sectionCount: number,
    ): void {
        const db = this.plugin.knowledgeDB?.getDB();
        if (db) {
            db.run(
                `INSERT OR REPLACE INTO dismissed_freshness (note_path, hint_type, dismissed_at)
                 VALUES (?, 'verdict', ?)`,
                [row.path, new Date().toISOString()],
            );
            this.plugin.knowledgeDB?.markDirty();
        }
        new Notice(`Dismissed ${row.path}`);
        rowEl.remove();
        // Strip the matching preview block that lives as the next sibling.
        const nextPreview = rowEl.nextElementSibling;
        if (nextPreview?.classList.contains('vault-health-fix-preview')) {
            nextPreview.remove();
        }
        if (sectionCount === 1) {
            details.remove();
        } else {
            const header = details.querySelector<HTMLElement>('.vault-health-section-count');
            if (header) {
                header.setText(header.getText().replace(/\((\d+)\)/, (_m, n: string) => `(${Math.max(0, parseInt(n, 10) - 1)})`));
            }
        }
        void content;
    }

    private dismissClusterFreshness(
        finding: HealthFinding,
        rowEl: HTMLElement,
        content: HTMLElement,
        details: HTMLDetailsElement,
        sectionCount: number,
    ): void {
        const db = this.plugin.knowledgeDB?.getDB();
        if (db && finding.cluster) {
            db.run(
                `INSERT OR REPLACE INTO dismissed_health_findings (check_type, path, dismissed_at)
                 VALUES (?, ?, ?)`,
                ['cluster_freshness', finding.cluster, new Date().toISOString()],
            );
            this.plugin.knowledgeDB?.markDirty();
        }
        new Notice(`Dismissed cluster ${finding.cluster ?? ''}`);
        rowEl.remove();
        const nextPreview = rowEl.nextElementSibling;
        if (nextPreview?.classList.contains('vault-health-fix-preview')) {
            nextPreview.remove();
        }
        if (sectionCount === 1) {
            details.remove();
        } else {
            const header = details.querySelector<HTMLElement>('.vault-health-section-count');
            if (header) {
                header.setText(header.getText().replace(/\((\d+)\)/, (_m, n: string) => `(${Math.max(0, parseInt(n, 10) - 1)})`));
            }
        }
        void content;
    }

    onClose(): void {
        this.contentEl.empty();
    }

    // -----------------------------------------------------------------------
    // Phase 1: Detailed findings view
    // -----------------------------------------------------------------------

    private showFindings(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('vault-health-modal');
        this.renderTopTabs(contentEl);

        // IMP-20-06-01 W3-T1: cluster_freshness moved into the
        // Knowledge-review tab. Filter it out of the Findings view so
        // the same finding does not surface in both places.
        const findingsForView = this.findings.filter((f) => !KNOWLEDGE_REVIEW_CHECKS.has(f.check));
        const repairableCount = findingsForView.filter(isRepairableFinding).length;
        const totalCount = findingsForView.length;

        contentEl.createEl('h3', { text: `Vault health (${totalCount} findings)` });

        // IMP-19-01-01 AC-01..04: Auto-fix CTA banner for deterministic
        // rule findings. Renders only when at least one repairable
        // finding exists. The button selects every REPAIRABLE finding
        // (across severities and sections) and routes through the
        // existing runRepair() path so the safety net (Checkpoint,
        // Undo, per-row error handling) is shared.
        if (repairableCount > 0) {
            this.renderAutoFixBanner(contentEl, repairableCount);
            this.renderStickyApplyBar(contentEl);
        }

        // FEAT-19-18: Severity filter tabs.
        const counts = {
            high: findingsForView.filter(f => f.severity === 'high').length,
            medium: findingsForView.filter(f => f.severity === 'medium').length,
            low: findingsForView.filter(f => f.severity === 'low').length,
        };
        const filterRow = contentEl.createDiv('vault-health-filter-row');
        const tabs: Array<{ key: SeverityFilter; label: string }> = [
            { key: 'all', label: `All (${totalCount})` },
            { key: 'high', label: `High (${counts.high})` },
            { key: 'medium', label: `Medium (${counts.medium})` },
            { key: 'low', label: `Low (${counts.low})` },
        ];
        for (const tab of tabs) {
            const btn = filterRow.createEl('button', {
                text: tab.label,
                cls: 'vault-health-filter-tab' + (this.severityFilter === tab.key ? ' is-active' : ''),
            });
            btn.addEventListener('click', () => {
                this.severityFilter = tab.key;
                this.selectedFindings.clear();
                this.showFindings();
            });
        }

        // Apply filter
        const visibleFindings = this.severityFilter === 'all'
            ? findingsForView
            : findingsForView.filter(f => f.severity === this.severityFilter);

        // Group findings by check type
        const grouped = new Map<HealthCheckType, { findings: HealthFinding[]; indices: number[] }>();
        visibleFindings.forEach((f) => {
            const idx = this.findings.indexOf(f);
            const entry = grouped.get(f.check) ?? { findings: [], indices: [] };
            entry.findings.push(f);
            entry.indices.push(idx);
            grouped.set(f.check, entry);
        });

        // Render each check type as a collapsible section
        for (const [check, { findings: checkFindings, indices }] of grouped) {
            const isRepairable = REPAIRABLE_CHECKS.has(check);
            const label = CHECK_LABELS[check] ?? check;
            const severity = checkFindings[0].severity;

            const details = contentEl.createEl('details', { cls: 'vault-health-section' });
            if (isRepairable) details.setAttribute('open', '');

            const summary = details.createEl('summary', { cls: 'vault-health-section-header' });
            summary.createSpan({ cls: `vault-health-severity severity-${severity}`, text: severity });
            summary.createSpan({ text: ` ${label} (${checkFindings.length})` });
            if (!isRepairable) {
                summary.createSpan({ cls: 'vault-health-tag-info', text: ' (review recommended)' });
            }

            const content = details.createDiv('vault-health-section-content');

            for (let i = 0; i < checkFindings.length; i++) {
                const finding = checkFindings[i];
                const globalIdx = indices[i];

                const row = content.createDiv('vault-health-finding-row');

                // Checkbox (per-finding repairable check; FIX-19-01-04
                // splits orphans by kind so with_context findings get
                // no checkbox even though the section type is repairable).
                if (isRepairableFinding(finding)) {
                    const checkbox = row.createEl('input', { type: 'checkbox' });
                    checkbox.checked = true;
                    this.selectedFindings.add(globalIdx);
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) {
                            this.selectedFindings.add(globalIdx);
                        } else {
                            this.selectedFindings.delete(globalIdx);
                        }
                        this.updateRepairButton();
                    });
                }

                // Primary note (first path)
                const primaryPath = finding.paths[0];
                if (primaryPath) {
                    const noteLink = row.createSpan({ cls: 'vault-health-note-link' });
                    noteLink.setText(this.formatPath(primaryPath));
                    noteLink.addEventListener('click', () => {
                        this.close();
                        void this.app.workspace.openLinkText(primaryPath, '');
                    });
                }

                // Additional paths count
                if (finding.paths.length > 1) {
                    row.createSpan({
                        cls: 'vault-health-path-count',
                        text: ` + ${finding.paths.length - 1} related`,
                    });
                }

                // Action buttons (right side of row)
                const actions = row.createDiv('vault-health-finding-actions');

                // Discuss with agent (all finding types)
                const discussBtn = actions.createEl('button', {
                    cls: 'vault-health-icon-btn',
                    attr: { 'aria-label': 'Discuss with agent' },
                });
                setIcon(discussBtn, 'message-square');
                discussBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const prompt = this.buildFindingPrompt(finding);
                    this.close();
                    if (this.onDiscuss) {
                        this.onDiscuss(prompt);
                    }
                });

                // FEAT-19-18: BA-25 Action-Buttons fuer Lint-Findings.
                if (finding.check === 'source_concentration' && finding.cluster) {
                    const antiEchoBtn = actions.createEl('button', {
                        cls: 'vault-health-icon-btn',
                        attr: { 'aria-label': 'Run anti-echo search' },
                    });
                    setIcon(antiEchoBtn, 'search');
                    antiEchoBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const prompt = `Run anti_echo_search for cluster "${finding.cluster}" to surface alternative sources beyond the dominant domain.`;
                        this.close();
                        this.onDiscuss?.(prompt);
                    });
                }
                if (finding.check === 'cluster_freshness' && finding.cluster) {
                    const refreshBtn = actions.createEl('button', {
                        cls: 'vault-health-icon-btn',
                        attr: { 'aria-label': 'Discuss freshness update for this cluster' },
                    });
                    setIcon(refreshBtn, 'refresh-cw');
                    refreshBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const prompt = `Cluster "${finding.cluster}" ist ueber Halbwertszeit. Schlage einen Web-Search-Update-Pass und passende Source-Notes zum Deep-Ingest vor.`;
                        this.close();
                        this.onDiscuss?.(prompt);
                    });
                }

                // Skip/dismiss (all finding types)
                const skipBtn = actions.createEl('button', {
                    cls: 'vault-health-icon-btn',
                    attr: { 'aria-label': 'Dismiss this finding' },
                });
                setIcon(skipBtn, 'eye-off');
                skipBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    console.debug('[VaultHealth] Dismiss clicked:', finding.check, finding.paths[0]);
                    this.dismissFinding(finding, globalIdx, row, content, details, check, checkFindings.length);
                });

                // Fix preview or description
                const preview = content.createDiv('vault-health-fix-preview');
                if (isRepairable) {
                    preview.setText(this.getFixPreview(finding));
                } else {
                    preview.setText(this.getInfoText(finding));
                }
            }
        }

        // Bottom buttons
        const btnRow = contentEl.createDiv('vault-health-btn-row');

        if (repairableCount > 0) {
            const repairBtn = btnRow.createEl('button', {
                cls: 'mod-cta vault-health-repair-btn',
                text: `Repair selected (${this.selectedFindings.size})`,
            });
            repairBtn.addEventListener('click', () => {
                if (this.selectedFindings.size === 0) {
                    new Notice('No findings selected for repair.');
                    return;
                }
                repairBtn.disabled = true;
                repairBtn.setText('Repairing...');
                void this.runRepair();
            });
        }

        // Show dismissed findings button
        const dismissedCount = this.plugin.vaultHealthService?.getDismissedCount() ?? 0;
        if (dismissedCount > 0) {
            const dismissedBtn = btnRow.createEl('button', {
                text: `${dismissedCount} dismissed`,
                cls: 'vault-health-reset-btn',
            });
            dismissedBtn.addEventListener('click', () => {
                this.showDismissedList(contentEl);
            });
        }

        const closeBtn = btnRow.createEl('button', { text: 'Close' });
        closeBtn.addEventListener('click', () => this.close());
    }

    private updateRepairButton(): void {
        const btn = this.contentEl.querySelector('.vault-health-repair-btn');
        if (btn instanceof HTMLButtonElement) {
            btn.setText(`Repair selected (${this.selectedFindings.size})`);
        }
        // IMP-19-01-02: sticky top button shares the same counter.
        const stickyBtn = this.contentEl.querySelector('.vault-health-apply-sticky-btn');
        if (stickyBtn instanceof HTMLButtonElement) {
            stickyBtn.setText(`Apply selected fixes (${this.selectedFindings.size})`);
        }
    }

    /**
     * IMP-19-01-01 AC-01..03: render the prominent Auto-fix CTA at
     * the top of the Findings tab. The button selects every
     * REPAIRABLE finding (across severity filters) and immediately
     * invokes `runRepair()`. The existing "Repair selected (N)"
     * button at the bottom of the list stays untouched for selective
     * repairs.
     */
    /**
     * IMP-19-01-02: sticky apply-bar at the top of the Findings tab.
     * Mirrors the bottom "Repair selected (N)" button so the user
     * never has to scroll to the end of a long list to apply the
     * selected fixes. Live-updates via .vault-health-apply-sticky-btn
     * lookup in updateRepairButton.
     */
    private renderStickyApplyBar(parent: HTMLElement): void {
        const bar = parent.createDiv('vault-health-apply-sticky');
        const btn = bar.createEl('button', {
            cls: 'mod-cta vault-health-apply-sticky-btn',
            text: `Apply selected fixes (${this.selectedFindings.size})`,
        });
        btn.addEventListener('click', () => {
            if (this.selectedFindings.size === 0) {
                new Notice('No findings selected for repair.');
                return;
            }
            btn.disabled = true;
            btn.setText('Repairing...');
            void this.runRepair();
        });
    }

    private renderAutoFixBanner(parent: HTMLElement, repairableCount: number): void {
        const banner = parent.createDiv('vault-health-autofix-banner');
        const desc = banner.createDiv('vault-health-autofix-desc');
        desc.setText(`${repairableCount} trivial ${repairableCount === 1 ? 'issue' : 'issues'} can be auto-fixed (missing backlinks, category mismatches, inconsistent tags). Checkpoint runs first; undo stays on the next screen.`);

        const btn = banner.createEl('button', {
            text: `Auto-fix ${repairableCount} ${repairableCount === 1 ? 'issue' : 'issues'}`,
            cls: 'mod-cta vault-health-autofix-btn',
        });
        btn.addEventListener('click', () => {
            this.selectAllRepairable();
            void this.runRepair();
        });
    }

    /**
     * IMP-19-01-01 AC-03: select every REPAIRABLE finding regardless
     * of the active severity filter. Used by the Auto-fix banner and
     * by the pre-modal auto-apply path in AgentSidebarView.
     */
    selectAllRepairable(): void {
        this.selectedFindings.clear();
        this.findings.forEach((f, idx) => {
            if (isRepairableFinding(f)) {
                this.selectedFindings.add(idx);
            }
        });
    }

    /**
     * IMP-19-01-01 AC-06..09: convenience flag the AgentSidebarView
     * sets before calling `open()`. When true, `onOpen()` skips the
     * findings render and immediately drives `runRepair()` over the
     * REPAIRABLE subset; the results screen surfaces as if the user
     * had clicked the Auto-fix banner manually. `runRepair()` already
     * handles the "no non-repairable findings left" case by showing
     * a clean results summary with a Done button.
     */
    autoApplyOnOpen = false;

    // -----------------------------------------------------------------------
    // Dismiss a finding
    // -----------------------------------------------------------------------

    private dismissFinding(
        finding: HealthFinding,
        globalIdx: number,
        row: HTMLElement,
        content: HTMLElement,
        details: HTMLElement,
        check: HealthCheckType,
        originalCount: number,
    ): void {
        // Persist dismissal
        const path = finding.paths[0] ?? '';
        this.plugin.vaultHealthService?.dismissFinding(finding.check, path);

        // Remove from selected
        this.selectedFindings.delete(globalIdx);
        this.updateRepairButton();

        // Remove the row and its fix-preview
        const nextSibling = row.nextElementSibling;
        row.remove();
        if (nextSibling?.classList.contains('vault-health-fix-preview')) {
            nextSibling.remove();
        }

        // Update section header count
        const remaining = content.querySelectorAll('.vault-health-finding-row').length;
        if (remaining === 0) {
            details.remove();
        } else {
            const headerText = details.querySelector('.vault-health-section-header');
            if (headerText) {
                const label = CHECK_LABELS[check] ?? check;
                const spans = headerText.querySelectorAll('span');
                if (spans.length >= 2) {
                    spans[1].setText(` ${label} (${remaining})`);
                }
            }
        }

        // Update badge
        const allFindings = this.plugin.vaultHealthService?.getFindings() ?? [];
        this.updateBadge(allFindings);
    }

    /** Re-run health checks and refresh the findings view. */
    private async refreshAndShowFindings(): Promise<void> {
        const healthService = this.plugin.vaultHealthService;
        if (healthService) {
            await healthService.runChecks();
            this.findings = healthService.getFindings();
            this.selectedFindings.clear();
            this.updateBadge(this.findings);
        }
        this.showFindings();
    }

    // -----------------------------------------------------------------------
    // Dismissed findings list
    // -----------------------------------------------------------------------

    private showDismissedList(containerEl: HTMLElement): void {
        containerEl.empty();
        containerEl.createEl('h3', { text: 'Dismissed findings' });

        const dismissed = this.plugin.vaultHealthService?.getDismissedFindings() ?? [];
        if (dismissed.length === 0) {
            containerEl.createEl('p', { text: 'No dismissed findings.' });
            const backBtn = containerEl.createEl('button', { text: 'Back', cls: 'mod-cta' });
            backBtn.addEventListener('click', () => this.showFindings());
            return;
        }

        // Search input
        const searchRow = containerEl.createDiv('vault-health-search-row');
        const searchInput = searchRow.createEl('input', {
            type: 'text',
            placeholder: 'Filter...',
            cls: 'vault-health-search-input',
        });

        const listEl = containerEl.createDiv('vault-health-dismissed-list');

        const renderList = (filter: string) => {
            listEl.empty();
            const lowerFilter = filter.toLowerCase();
            const filtered = filter
                ? dismissed.filter(d => d.path.toLowerCase().includes(lowerFilter) || d.checkType.toLowerCase().includes(lowerFilter))
                : dismissed;

            for (const d of filtered) {
                const row = listEl.createDiv('vault-health-finding-row');

                const label = CHECK_LABELS[d.checkType] ?? d.checkType;
                row.createSpan({ cls: `vault-health-severity severity-medium`, text: label });
                row.createSpan({ cls: 'vault-health-note-link', text: ` ${this.formatPath(d.path)}` });

                const restoreBtn = row.createEl('button', {
                    cls: 'vault-health-icon-btn',
                    attr: { 'aria-label': 'Restore this finding' },
                });
                setIcon(restoreBtn, 'eye');
                restoreBtn.addClass('vault-health-icon-btn-visible');
                restoreBtn.addEventListener('click', () => {
                    this.plugin.vaultHealthService?.restoreDismissedFinding(d.checkType, d.path);
                    row.remove();
                    const remaining = listEl.querySelectorAll('.vault-health-finding-row').length;
                    if (remaining === 0) {
                        void this.refreshAndShowFindings();
                    }
                });
            }

            if (filtered.length === 0) {
                listEl.createEl('p', { cls: 'vault-health-empty', text: 'No matches.' });
            }
        };

        renderList('');
        searchInput.addEventListener('input', () => renderList(searchInput.value));

        // Bottom buttons
        const btnRow = containerEl.createDiv('vault-health-btn-row');

        const restoreAllBtn = btnRow.createEl('button', {
            text: 'Restore all',
        });
        restoreAllBtn.addEventListener('click', () => {
            this.plugin.vaultHealthService?.restoreDismissed();
            void this.refreshAndShowFindings();
        });

        const backBtn = btnRow.createEl('button', { text: 'Back', cls: 'mod-cta' });
        backBtn.addEventListener('click', () => {
            void this.refreshAndShowFindings();
        });
    }

    // -----------------------------------------------------------------------
    // Prompt builder for discuss
    // -----------------------------------------------------------------------

    private buildFindingPrompt(finding: HealthFinding): string {
        const label = CHECK_LABELS[finding.check] ?? finding.check;
        const paths = finding.paths.map(p => `[[${this.formatPath(p)}]]`).join(', ');

        // If finding has multiple paths (e.g. orphans with many notes), guide interactive walkthrough
        if (finding.paths.length > 3) {
            return (
                `Vault health: ${label}\n` +
                `${finding.description}\n\n` +
                `Affected: ${paths}\n\n` +
                `Walk me through these one by one. For each item:\n` +
                `1. Explain what it is and where it lives (vault note, database entry, or system artifact)\n` +
                `2. Show me the item and suggest what to do with it\n` +
                `3. Give me concrete options as followup suggestions (e.g. "delete", "link to X", "keep as is", "skip")\n` +
                `4. Wait for my choice before moving to the next item\n\n` +
                `Also offer "apply same action to all remaining" as a batch option.\n` +
                `No emojis. Be specific about file locations and what each item actually is.`
            );
        }

        return (
            `Vault health: ${label}\n` +
            `${finding.description}\n\n` +
            `Affected: ${paths}\n\n` +
            `Explain what this is (vault note, database entry, or system artifact), ` +
            `where it lives, and suggest a concrete fix with options as followup suggestions. ` +
            `After I pick one, implement it. No emojis.`
        );
    }

    // -----------------------------------------------------------------------
    // Fix preview text generators
    // -----------------------------------------------------------------------

    private getFixPreview(finding: HealthFinding): string {
        switch (finding.check) {
            case 'missing_backlinks': {
                const target = finding.paths[0];
                const sources = finding.paths.slice(1);
                if (sources.length > 10) {
                    return `Fix: Create backlinks base file for ${this.formatPath(target)} (${sources.length} notes)`;
                }
                return `Fix: Add backlink properties to ${this.formatPath(target)} from ${sources.slice(0, 3).map(s => this.formatPath(s)).join(', ')}${sources.length > 3 ? ` +${sources.length - 3} more` : ''}`;
            }
            case 'category_mismatch':
                return `Fix: Move ${this.formatPath(finding.paths[0])} to correct category property`;
            case 'inconsistent_tags':
                return `Fix: Unify tag spelling`;
            case 'orphans': {
                if (finding.metadata?.orphanKind === 'isolated') {
                    const target = this.plugin.settings.vaultHealth?.orphansTargetFolder ?? 'Inbox/Orphans';
                    return `Fix: Move ${finding.paths.length} truly orphan note(s) to ${target}/`;
                }
                return 'Manual review: add backlinks from the cluster hub (no auto-fix)';
            }
            case 'weak_clusters':
                if (finding.paths.length >= 2) {
                    return `Fix: Link ${this.formatPath(finding.paths[0])} <-> ${this.formatPath(finding.paths[1])} mutually`;
                }
                return 'Fix: Add mutual link';
            default:
                return finding.description.slice(0, 120);
        }
    }

    private getInfoText(finding: HealthFinding): string {
        switch (finding.check) {
            case 'orphans':
                return finding.description.split('\n')[0];
            case 'weak_clusters':
                return finding.description;
            case 'god_nodes':
                return finding.description;
            case 'broken_links':
                return `${this.formatPath(finding.paths[0])} is referenced but does not exist`;
            default:
                return finding.description.slice(0, 150);
        }
    }

    private formatPath(path: string): string {
        return path.replace(/\.md$/, '').split('/').pop() ?? path;
    }

    // -----------------------------------------------------------------------
    // Phase 2: Run repair (selected findings only)
    // -----------------------------------------------------------------------

    private async runRepair(): Promise<void> {
        const { contentEl } = this;
        const healthService = this.plugin.vaultHealthService;
        if (!healthService) return;

        contentEl.empty();
        contentEl.createEl('h3', { text: 'Repair in progress...' });
        const progress = contentEl.createEl('p', { cls: 'vault-health-progress' });

        // FIX-19-01-03: suspend the global vault.on('modify')
        // extractFile call for the duration of the repair. Every
        // processFrontMatter the repair runs fires that listener,
        // which then reads STALE metadataCache and overwrites the
        // fresh reverse edges we are about to insert. The repair
        // owns its own settle + extractAll sequence at the end.
        this.plugin.vaultHealthRepairInProgress = true;
        try {
            await this.doRepair(progress);
        } finally {
            this.plugin.vaultHealthRepairInProgress = false;
        }
    }

    private async doRepair(progress: HTMLElement): Promise<void> {
        const healthService = this.plugin.vaultHealthService;
        if (!healthService) return;

        // FIX-19-01-06: defensive reset of the cancelled flag. The
        // service shares this flag across all runChecks calls; if a
        // prior runChecks early-returned before the reset at line 92
        // (e.g. the running-guard fired), the flag could be stuck at
        // true and every fix loop would short-circuit on iteration 0.
        healthService.cancelled = false;

        // Checkpoint
        progress.setText('Creating checkpoint...');
        const taskId = `health-repair-${Date.now()}`;
        const affectedPaths = this.collectAffectedPaths();

        let checkpoint: CheckpointInfo | undefined;
        if (this.plugin.checkpointService && affectedPaths.length > 0) {
            try {
                const cp = await this.plugin.checkpointService.snapshot(
                    taskId, affectedPaths, 'vault_health_repair',
                );
                if (cp && cp.commitOid !== 'empty') checkpoint = cp;
            } catch (e) {
                console.warn('[VaultHealthRepair] Checkpoint failed (non-fatal):', e);
            }
        }

        // Determine which repair types are selected
        const selectedTypes = new Set<HealthCheckType>();
        for (const idx of this.selectedFindings) {
            selectedTypes.add(this.findings[idx].check);
        }

        let edgesResult = { edgesRemoved: 0 };
        let backlinksResult = { entitiesFixed: 0, linksAdded: 0, basesCreated: 0, entitiesWithExistingBase: 0, yamlErrorPaths: [] as string[] };
        let categoriesResult = { notesFixed: 0, valuesMovied: 0 };
        let cleanupResult = { notesProcessed: 0, linksRemoved: 0 };
        let orphansResult = { notesMoved: 0, notesSkipped: 0, notesSkippedWithContext: 0 };
        let weakLinkResult = { pairsLinked: 0, linksAdded: 0 };

        if (selectedTypes.has('missing_backlinks') || selectedTypes.has('category_mismatch')) {
            progress.setText('Cleaning up orphaned edges...');
            edgesResult = healthService.cleanupOrphanedEdges();
        }

        // FIX-19-01-01: backlinksProperty came from settings, not
        // hardcoded 'Notizen'. The original hardcoded value caused
        // repairs to land on a different property than the user's
        // existing edges, so the reverse-edge predicate kept firing.
        const backlinksProperty = this.plugin.settings.backlinksProperty ?? 'Notizen';
        const categoryProperty = this.plugin.settings.categoryProperty ?? 'Kategorie';

        if (selectedTypes.has('missing_backlinks')) {
            progress.setText('Inserting missing backlinks...');
            backlinksResult = await healthService.fixMissingBacklinks(
                backlinksProperty,
                categoryProperty,
            );
        }

        if (selectedTypes.has('category_mismatch')) {
            progress.setText('Correcting category assignments...');
            categoriesResult = await healthService.fixCategoryMismatches();
        }

        if (selectedTypes.has('missing_backlinks')) {
            progress.setText('Cleaning up invalid links...');
            cleanupResult = await healthService.cleanupInvalidBacklinks(
                backlinksProperty,
                categoryProperty,
            );
        }

        // IMP-19-01-02: orphans -> move to configured folder.
        if (selectedTypes.has('orphans')) {
            progress.setText('Moving orphan notes to inbox folder...');
            const targetFolder = this.plugin.settings.vaultHealth?.orphansTargetFolder ?? 'Inbox/Orphans';
            const orphanPaths: string[] = [];
            for (const idx of this.selectedFindings) {
                const f = this.findings[idx];
                if (f.check === 'orphans') {
                    for (const p of f.paths) {
                        if (p.endsWith('.md')) orphanPaths.push(p);
                    }
                }
            }
            orphansResult = await healthService.moveOrphansToFolder(orphanPaths, targetFolder);
        }

        // IMP-19-01-02: weak_clusters -> mutual frontmatter link.
        if (selectedTypes.has('weak_clusters')) {
            progress.setText('Linking semantically similar notes...');
            const pairs: Array<{ a: string; b: string }> = [];
            for (const idx of this.selectedFindings) {
                const f = this.findings[idx];
                if (f.check === 'weak_clusters' && f.paths.length >= 2) {
                    pairs.push({ a: f.paths[0], b: f.paths[1] });
                }
            }
            weakLinkResult = await healthService.linkWeakClusters(pairs, backlinksProperty);
        }

        // FIX-19-01-01: wait for Obsidian's metadataCache to settle
        // after the frontmatter writes. processFrontMatter resolves
        // after the disk write but BEFORE the metadataCache reparse
        // (which runs on its own async tick). A synchronous
        // extractAll() right after would otherwise re-read the
        // STALE cache and write the OLD edge set back into the DB,
        // leaving the reverse-edge predicate firing again.
        progress.setText('Waiting for vault index to settle...');
        await this.waitForMetadataCacheSettle(affectedPaths);

        // Re-extract graph data before re-checking (FIX-13)
        progress.setText('Verifying...');
        if (this.plugin.graphExtractor) {
            const extractor = this.plugin.graphExtractor;
            // FIX-19-01-03: per-file extraction was meant to be cheap
            // (touched files only), BUT fixMissingBacklinks and
            // cleanupInvalidBacklinks mutate a SUPERSET of the
            // selectedFindings paths (their SQL iterates every
            // one-sided edge in the DB, not just selected ones).
            // Files outside affectedPaths never got refreshed,
            // leaving stale edges in the DB and re-detection on the
            // next runChecks. Always run extractAll to catch every
            // mutated file regardless of which paths the selection
            // tracked; per-file pass stays as a fast first pass.
            let perFileSucceeded = 0;
            for (const path of affectedPaths) {
                const file = this.app.vault.getAbstractFileByPath(path);
                if (file instanceof TFile) {
                    try {
                        extractor.extractFile(file);
                        perFileSucceeded++;
                    } catch (e) {
                        console.warn('[VaultHealthRepair] extractFile failed for', path, e);
                    }
                }
            }
            void perFileSucceeded;
            extractor.extractAll(this.app.vault);

            // FIX-19-01-04: drain Obsidian's vault.on('modify') queue
            // before runChecks AND before the flag clears in the
            // finally block. Otherwise late modify events fire on
            // the touched files after the flag is false; the global
            // extractFile listener then reads STALE metadataCache
            // (which may still lag the disk write) and overwrites
            // the just-extracted edges.
            await this.waitForVaultModifyDrain(affectedPaths);
            // One more extractAll after the drain catches any edges
            // a late modify-listener call might have clobbered while
            // the queue was unwinding.
            extractor.extractAll(this.app.vault);
            if (this.plugin.ontologyStore) {
                const categoryMap = new Map<string, string>();
                for (const file of this.app.vault.getMarkdownFiles()) {
                    const cache = this.app.metadataCache.getFileCache(file);
                    if (cache?.frontmatter?.[categoryProperty]) {
                        const cat = Array.isArray(cache.frontmatter[categoryProperty])
                            ? (cache.frontmatter[categoryProperty][0] ?? '').toString().trim()
                            : cache.frontmatter[categoryProperty].toString().trim();
                        if (cat) categoryMap.set(file.path, cat);
                    }
                }
                this.plugin.ontologyStore.bootstrapFromEdges(
                    this.plugin.settings.mocPropertyNames ?? [],
                    categoryProperty,
                    categoryMap,
                );
            }
        }

        const newFindings = await healthService.runChecks(undefined, {
            backlinksProperty,
            silenceWithContextOrphans: this.plugin.settings.vaultHealth?.silenceWithContextOrphans ?? true,
            orphanExcludePathPrefixes: this.plugin.settings.vaultHealth?.orphanExcludePathPrefixes ?? [],
        });
        // FIX-19-01-06: refresh the modal's internal copy of findings
        // so any subsequent render in the same lifecycle sees the
        // post-repair set (not the constructor-time snapshot).
        this.findings = newFindings;
        this.showResult(edgesResult, backlinksResult, categoriesResult, cleanupResult, orphansResult, weakLinkResult, newFindings, checkpoint);
    }

    /**
     * FIX-19-01-04: drain Obsidian's `vault.on('modify')` event
     * queue for every touched file. processFrontMatter resolves on
     * disk write, but Obsidian dispatches the modify event on its
     * own microtask tick; the queue can leak modify events AFTER
     * we have already finished extractAll. If the
     * `vaultHealthRepairInProgress` flag is cleared before that
     * queue is empty, the global modify listener in main.ts runs
     * `graphExtractor.extractFile(file)` with STALE metadataCache
     * and overwrites the freshly-correct edges.
     *
     * We register a one-shot modify listener for the affected
     * paths and resolve when every path has fired at least once,
     * OR a 2-second hard timeout passes. The flag stays true for
     * the whole drain window.
     */
    private async waitForVaultModifyDrain(paths: string[]): Promise<void> {
        if (!paths.length) return;
        const pending = new Set(paths);
        const TIMEOUT_MS = 2000;
        await new Promise<void>((resolve) => {
            const cleanup = () => {
                this.app.vault.off('modify', onModify);
                window.clearTimeout(timer);
            };
            const onModify = (file: TFile) => {
                if (pending.delete(file.path) && pending.size === 0) {
                    cleanup();
                    resolve();
                }
            };
            this.app.vault.on('modify', onModify);
            const timer = window.setTimeout(() => {
                cleanup();
                resolve();
            }, TIMEOUT_MS);
        });
    }

    /**
     * FIX-19-01-01: poll Obsidian's metadataCache until every touched
     * file shows a frontmatter shape consistent with the post-repair
     * state, OR up to a hard timeout. Obsidian fires
     * `metadataCache.on('changed', file)` once it has re-parsed a
     * mutated file; we listen for that event per-path and resolve
     * the promise when all paths have either changed or timed out.
     */
    private async waitForMetadataCacheSettle(paths: string[]): Promise<void> {
        if (!paths.length) return;
        const pending = new Set(paths);
        const TIMEOUT_MS = 3000;

        await new Promise<void>((resolve) => {
            const cleanup = () => {
                this.app.metadataCache.off('changed', onChanged);
                window.clearTimeout(timer);
            };
            const onChanged = (file: TFile) => {
                if (pending.delete(file.path) && pending.size === 0) {
                    cleanup();
                    resolve();
                }
            };
            this.app.metadataCache.on('changed', onChanged);
            const timer = window.setTimeout(() => {
                cleanup();
                resolve();
            }, TIMEOUT_MS);
        });
    }

    // -----------------------------------------------------------------------
    // Phase 3: Show result + undo
    // -----------------------------------------------------------------------

    private showResult(
        edges: { edgesRemoved: number },
        backlinks: { entitiesFixed: number; linksAdded: number; basesCreated: number; entitiesWithExistingBase: number; yamlErrorPaths: string[] },
        categories: { notesFixed: number; valuesMovied: number },
        cleanup: { notesProcessed: number; linksRemoved: number },
        orphans: { notesMoved: number; notesSkipped: number; notesSkippedWithContext: number },
        weakLinks: { pairsLinked: number; linksAdded: number },
        newFindings: HealthFinding[],
        checkpoint: CheckpointInfo | undefined,
    ): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h3', { text: 'Repair complete' });

        const results = contentEl.createEl('ul', { cls: 'vault-health-results' });

        if (edges.edgesRemoved > 0) {
            results.createEl('li', { text: `${edges.edgesRemoved} orphaned edges removed` });
        }
        if (backlinks.linksAdded > 0 || backlinks.basesCreated > 0) {
            results.createEl('li', {
                text: `${backlinks.entitiesFixed} entities: ${backlinks.linksAdded} backlinks, ${backlinks.basesCreated} bases created`,
            });
        }
        // FIX-19-01-06: explicit transparency. The "0 links added" case
        // typically means the entity already had a Base (no-op) or
        // its YAML is broken. Show both numbers so the user knows
        // WHY a finding does not disappear.
        if (backlinks.entitiesWithExistingBase > 0) {
            results.createEl('li', {
                text: `${backlinks.entitiesWithExistingBase} entities already had a Base (no frontmatter change needed)`,
            });
        }
        if (backlinks.yamlErrorPaths.length > 0) {
            const li = results.createEl('li');
            li.appendText(`${backlinks.yamlErrorPaths.length} entities have broken YAML and were skipped (manual fix required):`);
            const sub = li.createEl('ul', { cls: 'vault-health-yaml-errors' });
            for (const p of backlinks.yamlErrorPaths.slice(0, 20)) {
                const item = sub.createEl('li');
                const link = item.createSpan({ cls: 'vault-health-note-link', text: this.formatPath(p) });
                link.addEventListener('click', () => {
                    this.close();
                    void this.app.workspace.openLinkText(p, '');
                });
            }
            if (backlinks.yamlErrorPaths.length > 20) {
                sub.createEl('li', { text: `+${backlinks.yamlErrorPaths.length - 20} more (see console)` });
            }
            li.createEl('p', {
                text: 'These notes are auto-dismissed for missing_backlinks until you fix the YAML.',
                cls: 'vault-health-result-note',
            });
        }
        if (categories.notesFixed > 0) {
            results.createEl('li', { text: `${categories.notesFixed} notes: category assignment corrected` });
        }
        if (cleanup.linksRemoved > 0) {
            results.createEl('li', { text: `${cleanup.linksRemoved} invalid links removed` });
        }
        if (orphans.notesMoved > 0) {
            results.createEl('li', { text: `${orphans.notesMoved} orphan note(s) moved to inbox folder` });
        }
        if (orphans.notesSkippedWithContext > 0) {
            results.createEl('li', {
                text: `${orphans.notesSkippedWithContext} orphan(s) kept in place: they have outgoing edges or cluster membership and need a manual backlink, not a move`,
            });
        }
        if (weakLinks.pairsLinked > 0) {
            results.createEl('li', { text: `${weakLinks.pairsLinked} weak cluster pair(s) linked (${weakLinks.linksAdded} backlinks added)` });
        }

        const totalFixes = edges.edgesRemoved + backlinks.linksAdded + backlinks.basesCreated +
            categories.valuesMovied + cleanup.linksRemoved + orphans.notesMoved + weakLinks.linksAdded;

        if (totalFixes === 0) {
            contentEl.createEl('p', { text: 'No repairs needed. All clean.' });
        }

        // Remaining findings
        const remainingRepairable = newFindings.filter(isRepairableFinding).length;
        const totalRemaining = newFindings.length;
        contentEl.createEl('p', {
            cls: 'vault-health-remaining',
            text: `Remaining: ${totalRemaining} finding(s), ${remainingRepairable} repairable.`,
        });

        // Buttons
        const btnRow = contentEl.createDiv('vault-health-btn-row');

        if (checkpoint && totalFixes > 0) {
            const undoBtn = btnRow.createEl('button', {
                text: 'Undo',
                cls: 'mod-warning',
            });
            undoBtn.addEventListener('click', () => {
                void this.runUndo(checkpoint);
            });
        }

        const doneBtn = btnRow.createEl('button', { text: 'Done', cls: 'mod-cta' });
        doneBtn.addEventListener('click', () => {
            this.updateBadge(newFindings);
            this.close();
        });
    }

    // -----------------------------------------------------------------------
    // Undo
    // -----------------------------------------------------------------------

    private async runUndo(checkpoint: CheckpointInfo): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Restoring checkpoint...' });

        try {
            const result = await this.plugin.checkpointService.restore(checkpoint);

            contentEl.empty();
            contentEl.createEl('h3', { text: 'Restored' });
            contentEl.createEl('p', {
                text: `${result.restored.length} file(s) restored.`,
            });

            if (result.errors.length > 0) {
                contentEl.createEl('p', {
                    cls: 'vault-health-error',
                    text: `${result.errors.length} error(s): ${result.errors.join(', ')}`,
                });
            }

            // Re-extract graph after restore
            if (this.plugin.graphExtractor) {
                this.plugin.graphExtractor.extractAll(this.app.vault);
            }
            if (this.plugin.ontologyStore) {
                const catProp = this.plugin.settings.categoryProperty ?? 'Kategorie';
                const categoryMap = new Map<string, string>();
                for (const file of this.app.vault.getMarkdownFiles()) {
                    const cache = this.app.metadataCache.getFileCache(file);
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
            }

            const findings = await this.plugin.vaultHealthService?.runChecks() ?? [];
            this.updateBadge(findings);

            const doneBtn = contentEl.createEl('button', { text: 'Done', cls: 'mod-cta' });
            doneBtn.addEventListener('click', () => this.close());
        } catch (e) {
            contentEl.empty();
            contentEl.createEl('h3', { text: 'Restore failed' });
            contentEl.createEl('p', {
                cls: 'vault-health-error',
                text: e instanceof Error ? e.message : String(e),
            });
            const closeBtn = contentEl.createEl('button', { text: 'Close' });
            closeBtn.addEventListener('click', () => this.close());
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private collectAffectedPaths(): string[] {
        const paths = new Set<string>();
        for (const idx of this.selectedFindings) {
            const f = this.findings[idx];
            for (const p of f.paths) {
                if (p.endsWith('.md')) paths.add(p);
            }
        }
        // FIX-19-01-03: cap raised from 100 to 500. The cap exists
        // only so the checkpoint snapshot does not balloon on huge
        // batches; the re-extract path no longer depends on this set
        // (extractAll always runs after the per-file pass).
        return [...paths].slice(0, 500);
    }

    private updateBadge(findings: HealthFinding[]): void {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR);
        if (leaves.length > 0) {
            const view = leaves[0].view as unknown as { updateHealthBadge(count: number, severity: string | null): void };
            const highCount = findings.filter(f => f.severity === 'high').length;
            const count = findings.length;
            view.updateHealthBadge(count, highCount > 0 ? 'high' : (count > 0 ? 'medium' : null));
        }
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
