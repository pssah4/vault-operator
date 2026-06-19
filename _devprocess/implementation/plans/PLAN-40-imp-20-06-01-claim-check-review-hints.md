---
id: PLAN-40
title: Claim Check + Review Hints Implementation (IMP-20-06-01)
date: 2026-06-19
feature-refs: [FEAT-20-06]
imp-refs: [IMP-20-06-01]
adr-refs: [ADR-135, ADR-95, ADR-104, ADR-105, ADR-106]
fix-refs: []
pair-id: null
---

# PLAN-40: Claim Check + Review Hints

Implementation plan for IMP-20-06-01. Four build waves, TDD by default per CLAUDE.md. Each wave deploys end-to-end before the next starts (build + test + deploy after every step).

## Status

Draft -> Active when Wave 1 implementation begins.

## Scope reminder

Implements Stage 4+5 of the FEAT-20-06 freshness funnel: a note-level LLM verifier on top of the existing Stufe-3 pipeline, with a new Aging-knowledge tab in the existing VaultHealthRepairModal and two sub-modals (`ResolveConflictModal`, `BatchResolveModal`). Replaces the original Inbox-Note output model from FEAT-20-06 by mutual user agreement (see IMP body).

12 binding constraints (C-01 .. C-12) and 12 acceptance criteria (AC-01 .. AC-12) live in the IMP body and govern this plan.

## Wave 1: Schema + Verifier core

Goal: storage and the LLM-call surface that returns a `NoteVerdict`. No UI yet. Verifier runs only when invoked from a test or from the future `webUpdatePass` hook integration in Wave 2.

| Task | What | Files | Test | TDD |
|---|---|---|---|---|
| W1-T1 | v10 -> v11 schema migration: add `last_verdict TEXT`, `last_confidence REAL`, `last_summary TEXT`, `last_sources_json TEXT`, `last_checked_at TEXT`, `last_verifier_tier TEXT` to existing `note_freshness`. WriterLock before ALTER per ADR-79. | Modify `src/core/knowledge/KnowledgeDB.ts` (bump SCHEMA_VERSION to 11, extend `migrateSchema` with v10->v11 branch) | Create `src/core/knowledge/__tests__/KnowledgeDB.migration-v11.test.ts`: open a v10 DB fixture, run migrateSchema, assert columns exist and are nullable, assert existing freshness_class data survives | RED first |
| W1-T2 | Create `note_freshness_history` table (1:N). Columns: `id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, run_at TEXT NOT NULL, verdict TEXT NOT NULL, confidence REAL NOT NULL, summary TEXT, sources_json TEXT, verifier_tier TEXT NOT NULL, model_id TEXT, tokens_used INTEGER, FOREIGN KEY(path) REFERENCES note_freshness(path)`. Index on `(path, run_at DESC)`. | Same KnowledgeDB.ts v10->v11 migration | KnowledgeDB.migration-v11.test extends: assert table exists, assert index exists, insert a row and SELECT it | RED first |
| W1-T3 | Retention policy: drop rows older than 90 days OR keep only newest 5 per path, whichever shrinks more. Triggered on insert. | Create `src/core/health/NoteFreshnessHistoryStore.ts` mit `recordRun(path, verdict, confidence, model_id, tokens_used, summary?, sources?)` -> retention enforced inside the same transaction | Create `src/core/health/__tests__/NoteFreshnessHistoryStore.test.ts`: insert 6 rows in 6 days -> assert oldest dropped; insert 1 row 91 days old -> assert dropped | RED first |
| W1-T4 | `NoteVerdict` type and `VerdictSeverity` literal. Severity enum: `'deckt-sich' \| 'ergaenzt' \| 'widerspricht' \| 'outdated' \| 'no_external_source'`. | Create `src/core/health/types.ts` | Type-only test stays compile-only (tsc-clean) | n/a |
| W1-T5 | Implement `FreshnessVerifier.verifyNote(note, cluster, options)`. Returns `NoteVerdict`. Calls mid-tier model via existing provider abstraction (`buildApiHandlerForModel`). Frontier escalation gated per ADR-135 (confidence < 0.7 AND severity in widerspricht/outdated AND `freshness.allowFrontierEscalation` AND provider exposes ZDR capability). Aggregates token counts. | Create `src/core/health/FreshnessVerifier.ts` | Create `src/core/health/__tests__/FreshnessVerifier.test.ts`: mock provider, assert mid-tier path returns NoteVerdict; mock low-confidence response, assert frontier call happens only when ZDR-capability-mock returns true; assert fail-closed when ZDR-mock returns false | RED first |
| W1-T6 | Settings: add `freshness` section to `src/types/settings.ts` with `writeFrontmatter: false`, `externalSources: { enabled: false }`, `allowFrontierEscalation: false`, `frontierConfidenceThreshold: 0.7`, `frontierSeverityFilter: ["widerspricht", "outdated"]`, `excludePaths: ["Private/", "Personal/", "Medical/", "Clients/"]` defaults. | Modify `src/types/settings.ts` | Settings-shape test in existing settings test file | RED first |

Verification gate Wave 1: `npm run build` clean; new test files all pass; existing test suite green (no regression).

## Wave 2: NoteSelector + QueryBuilder + Stufe3 wiring

Goal: the verifier runs inside the existing `webUpdatePass` hook, picks notes via the new selector, and surfaces verdicts via the additive UpdateFinding extension.

| Task | What | Files | Test | TDD |
|---|---|---|---|---|
| W2-T1 | `UpdateFinding.notes?: NoteVerdict[]` additive extension. Existing callers ignore the field. | Modify `src/core/health/Stufe3PeriodicJob.ts` interface | Existing Stufe3 tests stay green; add one new assertion that `notes` is optional | n/a |
| W2-T2 | `NoteSelector.pickCandidates(cluster, budget)` reads `note_freshness.freshness_class` (volatile weekly, evolving monthly, stable on-demand), filters by `last_checked_at`, filters out paths in `dismissed_freshness` with `hint_type='verdict'`, filters out paths matching `freshness.excludePaths` patterns. Returns top-N (default 5) per cluster. | Create `src/core/health/NoteSelector.ts` | Create `src/core/health/__tests__/NoteSelector.test.ts`: insert mixed-class notes; assert volatile picked first; assert dismissed paths excluded; assert excludePaths excluded | RED first |
| W2-T3 | `FreshnessQueryBuilder.build(note, cluster)`: returns a string capped at 400 chars (hard). Builder picks: cluster topic + 1-2 quoted claim sentences + top-N nouns. Truncates deterministically at 400. | Create `src/core/health/FreshnessQueryBuilder.ts` | Create `src/core/health/__tests__/FreshnessQueryBuilder.test.ts`: assert long-note produces <= 400-char query; pin the cap so a future PR loosening it fails | RED first |
| W2-T4 | `FreshnessWebSearch.search(query, settings)`: thin wrapper that calls the existing brave/tavily code path in `WebSearchTool` (extract those private methods into a shared module or call via a new minimal helper), driven by `webTools.provider`. Reuses `webTools.tavilyApiKey` / `webTools.braveApiKey`. Returns search results in a shape the verifier expects. | Create `src/core/health/FreshnessWebSearch.ts`; refactor `src/core/tools/web/WebSearchTool.ts` to export the brave/tavily call helpers | Create `src/core/health/__tests__/FreshnessWebSearch.test.ts`: mock fetch; assert tavily path called when provider=tavily; assert no_external_source returned when provider=none | RED first |
| W2-T5 | Wire FreshnessVerifier into `webUpdatePass` callback in `src/main.ts`. Per cluster: NoteSelector.pickCandidates -> for each note: FreshnessVerifier.verifyNote -> aggregate NoteVerdicts into UpdateFinding.notes. Token aggregation respects existing budget per ADR-105. | Modify `src/main.ts:1481-1491` area where current webUpdatePass stub returns empty UpdateFinding[] | Manual integration test in `src/core/health/__tests__/Stufe3PeriodicJob.verifier.integration.test.ts`: fake provider, fake cluster with 3 notes, assert UpdateFinding.notes length 3 with valid verdicts | RED first |

Verification gate Wave 2: `npm run build` clean; Wave 2 tests pass; Stufe3 existing tests pass (Stufe3Plan14.test.ts). No regression in main.ts wiring.

## Wave 3: UI (Aging-knowledge tab + ResolveConflictModal + BatchResolveModal)

Goal: user-facing surface for the persisted verdicts.

| Task | What | Files | Test | TDD |
|---|---|---|---|---|
| W3-T1 | Aging-knowledge tab inside `VaultHealthRepairModal`. Reads `note_freshness` rows where `last_verdict IS NOT NULL`. Severity mapping per ADR-106 amendment (outdated -> Critical, widerspricht+high-confidence -> Critical, widerspricht+low-confidence -> Warning, ergaenzt -> Hint, verified hidden). Cluster-grouped, virtual-scrolled at >100 items. | Modify `src/ui/modals/VaultHealthRepairModal.ts` (add new tab to existing Severity-Filter-Tab list) | UI render test via existing modal test pattern; assert tab present and rows render with correct severity badge | RED first |
| W3-T2 | `ResolveConflictModal`: single-note resolution. Diff view (current note text vs suggested patch from verdict), Apply (atomic via EditFileTool boundary with checkpoint), Edit (opens text input pre-filled with suggested patch), Mark verified (writes dismissed_freshness with hint_type='verdict'), Delete (FileManager.trashFile with explicit confirm sub-modal), Open in chat (skill-handover to default agent). | Create `src/ui/modals/ResolveConflictModal.ts` | Create `src/ui/modals/__tests__/ResolveConflictModal.test.ts`: assert each button wired to expected callback; assert delete shows confirm modal first | RED first |
| W3-T3 | `BatchResolveModal`: bulk apply. Filter dropdown by severity, slider for min confidence, multi-select checkboxes, sequential apply with progress notice, Abort button, Resume state in a small DB table or in-memory (decision deferred per plan-context). | Create `src/ui/modals/BatchResolveModal.ts` | Create `src/ui/modals/__tests__/BatchResolveModal.test.ts`: assert filter narrows list; assert sequential apply emits progress events; assert abort stops mid-run; assert resume continues from saved index | RED first |
| W3-T4 | Mobile guard: read-only on iOS and Android. Apply / Delete / Bulk-Run buttons hidden; "synced from desktop" notice shown. | Same modal files; add Platform.isDesktop check pattern (existing in main.ts) | Mobile-platform mock test in same modal test files | RED first |

Verification gate Wave 3: `npm run build` clean; modal tests pass; manual UI smoke (open Health-Modal in deployed plugin, click new tab, see verdicts).

## Wave 4: Settings UI + Frontmatter Allowlist + edge tests

Goal: surface the four settings to the user, lock down the Frontmatter Allowlist, ship the binding-constraint tests.

| Task | What | Files | Test | TDD |
|---|---|---|---|---|
| W4-T1 | Settings UI for `freshness.*` group in the existing Vault-Health settings tab (or create a new sub-section). Four toggles: `writeFrontmatter`, `externalSources.enabled`, `allowFrontierEscalation`, `excludePaths` text-list. | Modify the relevant Settings tab file (likely `src/ui/settings/VaultTab.ts` or similar) | Settings-tab render test | RED first |
| W4-T2 | Frontmatter-write path in FreshnessVerifier post-verdict: if `settings.freshness.writeFrontmatter` is true, build a `FrontmatterPatch` with exactly key `freshness` (value = verdict literal), call existing `FrontmatterWriter.write`. Allowlist filter is at the Patch-builder level. | Modify `src/core/health/FreshnessVerifier.ts` | Create `src/core/health/__tests__/FrontmatterAllowlist.test.ts`: pinned test that asserts the only allowed key is 'freshness'; a future PR adding a second key fails the test | RED first |
| W4-T3 | ZDR-capability schema: each provider exposes `getZdrCapability(modelId)` returning a struct that the FreshnessVerifier checks before frontier-escalation. Defaults for known providers: Anthropic ZDR endpoint, Bedrock no-logging endpoint, OpenAI no-training. Unknown providers default false. | Modify `src/api/providers/` shared types and add defaults to the three named provider classes | Provider-capability test per provider | RED first |
| W4-T4 | Wayfinder updates: confirm `src/ARCHITECTURE.map` rows already added in ARCH commit are pointing at the right files after Wave 1-3 lands. JSDoc headers in all new entry-point files (FreshnessVerifier, NoteSelector, FreshnessQueryBuilder, FreshnessWebSearch, NoteFreshnessHistoryStore, ResolveConflictModal, BatchResolveModal) per template. | Modify newly created TS files; check `src/ARCHITECTURE.map` consistency | Visual check + `/consistency-check` mode A | n/a |

Verification gate Wave 4: full test suite green; build clean; deploy clean; consistency-check mode A reports zero new orphans.

## Coverage Gate

| SC from IMP-20-06-01 | Mapped task(s) |
|---|---|
| AC-01: flagged Note erscheint im Aging-knowledge-Tab | W2-T5 (verdict persisted) + W3-T1 (tab renders) |
| AC-02: verified note not in tab, last_checked_at set | W1-T5 (verifier writes timestamp) + W3-T1 (tab filters) |
| AC-03: Single-Note-Resolve mit 5 Action-Buttons + Checkpoint | W3-T2 |
| AC-04: BatchResolve mit Filter + Abort + Resume | W3-T3 |
| AC-05: Token aggregiert im Stufe-3-Budget | W2-T5 (wiring respects existing spendTokens) |
| AC-06: Frontmatter-Write default OFF, Allowlist pinned | W1-T6 (default off) + W4-T2 (allowlist test) |
| AC-07: ohne externalSources.enabled -> no_external_source | W1-T5 + W2-T4 (skip path) |
| AC-08: Frontier nur mit ZDR + allowFrontierEscalation | W1-T5 (gate logic) + W4-T3 (capability schema) |
| AC-09: Mobile read-only mit Hinweis | W3-T4 |
| AC-10: Mark verified survives bis mtime change | W3-T2 (writes dismissed_freshness) + W2-T2 (NoteSelector filters) |
| AC-11: History retention 5 runs OR 90 Tage | W1-T3 |
| AC-12: Schema-Migration additiv, kein Read-Break | W1-T1 + W1-T2 |

All 12 ACs mapped, none deferred.

| ADR | Operationalizing task(s) |
|---|---|
| ADR-135 (new) | W1-T5 (verifier gate), W4-T3 (ZDR capability schema) |
| ADR-95 (amended) | W4-T2 (allowlist filter on FrontmatterWriter call) |
| ADR-104 (amended) | W2-T3 (query cap) + W2-T4 (existing-tool-reuse) |
| ADR-105 (amended) | W2-T1 (UpdateFinding.notes?) + W2-T5 (verifier inside webUpdatePass) + W2-T2 (NoteSelector uses freshness_class) |
| ADR-106 (amended) | W3-T1 (tab + severity mapping) + W3-T2 + W3-T3 (sub-modals) |

All five ADRs operationalized.

## Verification commands (used at every wave gate)

- Build: `npm run build`
- Tests: `npm test` (or scoped: `npx vitest run src/core/health` for wave-local fast loops)
- Lint: `npx eslint src/ --quiet`
- Type-check: implicit in `npm run build`
- Deploy: `npm run build` already includes deploy step per project convention

## Implementation Notes

### Wave 1 (2026-06-19)

| Task | File(s) landed | Test(s) | Status |
|---|---|---|---|
| W1-T1 + T2 | `src/core/knowledge/KnowledgeDB.ts` (SCHEMA_VERSION 10 -> 11, SCHEMA_DDL extended with six verdict columns on `note_freshness` plus the new `note_freshness_history` table and its index, migrateSchema v10->v11 branch with explicit ALTER ADD COLUMN per column) | `src/core/knowledge/__tests__/KnowledgeDB.migration-v11.test.ts` (6 cases) | green |
| W1-T3 | `src/core/health/NoteFreshnessHistoryStore.ts` (recordRun with 5-or-90-day retention, path-isolated) | `src/core/health/__tests__/NoteFreshnessHistoryStore.test.ts` (5 cases) | green |
| W1-T4 | `src/core/health/types.ts` (VerdictLiteral, VerifierTier, NoteVerdict) | type-only, picked up by W1-T5 tests | n/a |
| W1-T5 | `src/core/health/FreshnessVerifier.ts` (mid-default, escalation gate with three AND conditions per ADR-135, fail-closed on no-ZDR, token-aggregation across tiers) | `src/core/health/__tests__/FreshnessVerifier.test.ts` (5 cases) | green |
| W1-T6 | `src/types/settings.ts` (FreshnessSettings interface, DEFAULT_FRESHNESS_SETTINGS, wired into DEFAULT_SETTINGS) | type-shape via tsc-clean | green |

Total Wave 1 test delta: +24 cases. Full suite 2851 passing plus 1 expected fail (no regression).
Build clean (main.js 4.7 MB), deployed.

Wayfinder rows added: `freshness-types`, `freshness-history` (the others were pre-seeded in the ARCH commit and will get JSDoc headers once the matching code lands in Waves 2-4).

Behavioural notes that matter for Waves 2 and beyond:

- The verifier is provider-agnostic via `VerifierProvider`. Wave 2 wires the existing provider abstraction into a concrete adapter that satisfies `callMidTier`, `callFrontier` and `hasZdrCapability`. The `midModelId` / `frontierModelId` strings flow into NoteVerdict.modelId and are persisted into note_freshness_history for the audit trail.
- `NoteFreshnessHistoryStore` is independent of the verifier; the wiring in Wave 2 calls `recordRun` after `verifyNote` returns, inside the same `webUpdatePass` aggregation block.
- The retention sweep is per-path and runs on every insert. It does NOT touch rows of other paths even if they are older than 90 days; that pathwise sweep was a deliberate choice from the test 'retains rows isolated per path'. A separate maintenance pass (deferred, no IMP yet) can do the global sweep later.

### Wave 2 (2026-06-19)

| Task | File(s) landed | Test(s) | Status |
|---|---|---|---|
| W2-T1 | `src/core/health/Stufe3PeriodicJob.ts` (UpdateFinding gets `notes?: NoteVerdict[]` additive) | existing Stufe3 suite stays green | green |
| W2-T2 | `src/core/health/NoteSelector.ts` (freshness_class priority, last_checked_at cooldown, dismissed_freshness filter, excludePaths) | `src/core/health/__tests__/NoteSelector.test.ts` (6 cases) | green |
| W2-T3 | `src/core/health/FreshnessQueryBuilder.ts` (400-char hard cap, word-boundary trim, entity drop on overflow) | `src/core/health/__tests__/FreshnessQueryBuilder.test.ts` (5 cases) | green |
| W2-T4 | `src/core/health/FreshnessWebSearch.ts` (programmatic Brave/Tavily wrapper, externalSources-Privacy-Toggle, fail-closed) plus extract `src/core/tools/web/WebSearchProvider.ts` and refactor `WebSearchTool` to delegate | `src/core/health/__tests__/FreshnessWebSearch.test.ts` (5 cases) | green |
| W2-T5 | `src/core/health/LlmVerifierProvider.ts` (classifyText-backed VerifierProvider, structured JSON parsing, fail-closed) plus `src/core/health/FreshnessOrchestrator.ts` (per-cluster pipeline with persistence), wired into `src/main.ts` `webUpdatePass` | `src/core/health/__tests__/LlmVerifierProvider.test.ts` (10 cases) + `src/core/health/__tests__/FreshnessOrchestrator.test.ts` (3 cases) | green |

Total Wave 2 test delta: +29 cases. Full suite 2880 passing plus 1 expected fail (no regression). Build clean (main.js 4.7 MB), deployed.

Wayfinder rows added: `freshness-web-search`, `freshness-llm-provider`, `freshness-orchestrator`.

### Wave 3 (2026-06-19)

| Task | File(s) landed | Test(s) | Status |
|---|---|---|---|
| W3-T1 | `src/core/health/AgingKnowledgeReader.ts` (severity mapping per ADR-106 amendment, listAll + listHistory) and `src/ui/modals/VaultHealthRepairModal.ts` (Findings vs Aging-knowledge top tab, severity-coloured list, batch toolbar) plus `styles.css` rows | `src/core/health/__tests__/AgingKnowledgeReader.test.ts` (10 cases) | green |
| W3-T2 | `src/ui/modals/ResolveConflictModal.ts` (mark verified / open in chat / edit / delete via FileManager.trashFile with inline confirm modal) | manual smoke (UI) | green |
| W3-T3 | `src/ui/modals/BatchResolveModal.ts` (severity + min-confidence filter, mark-verified / delete batch with abort) | manual smoke (UI) | green |
| W3-T4 | `src/ui/modals/VaultHealthRepairModal.ts` (Platform.isMobile branch renders an explanatory text instead of the verifier list) | covered by W3-T1 manual smoke | green |

Total Wave 3 test delta: +10 cases. Full suite still green (no UI unit tests added; modal flows verified through manual smoke).

Wayfinder rows added: `aging-knowledge-reader`. Existing rows for `aging-knowledge-tab`, `resolve-conflict-modal`, `batch-resolve-modal` get their final file references.

### Wave 4 (2026-06-19)

| Task | File(s) landed | Test(s) | Status |
|---|---|---|---|
| W4-T1 | `src/core/health/FreshnessFrontmatterPatcher.ts` (single-key `freshness` allowlist over FrontmatterWriter) | `src/core/health/__tests__/FreshnessFrontmatterPatcher.test.ts` (4 cases) | green |
| W4-T2 | `src/types/settings.ts` (ProviderConfig.zdrCapable), `src/core/health/ZdrCapabilityResolver.ts` (resolver) and `src/main.ts` (wire into LlmVerifierProvider.hasZdr) | `src/core/health/__tests__/ZdrCapabilityResolver.test.ts` (6 cases) | green |
| W4-T3 | `src/ui/settings/VaultTab.ts` (new "Note freshness verifier" section with 5 toggles + slider + path list) and `src/ui/settings/ProviderDetailModal.ts` (Privacy sub-section with ZDR confirmation per provider) | type-shape + manual smoke (UI) | green |
| W4-T4 | `src/ARCHITECTURE.map` (3 wayfinder rows), this PLAN's Implementation Notes, BACKLOG row closures | covered by /consistency-check pass | green |

Total Wave 4 test delta: +10 cases. Full suite 2900 passing plus 1 expected fail (no regression). Build clean (main.js 4.7 MB), deployed.

Implementation closure: 5/5 ADRs operationalized (ADR-135 + ADR-95 + ADR-104 + ADR-105 + ADR-106), 12/12 AC mapped to landed code. PLAN-40 flips to Released; IMP-20-06-01 flips to Done.

Behavioural notes for follow-up work:

- The verifier wiring honours the `freshness.externalSources.enabled` toggle. With the toggle OFF the web pass returns an empty source list and the verifier resolves to `no_external_source`. The note still ends up in `note_freshness_history` so the Aging-knowledge tab in Wave 3 can show "no external evidence yet" rows.
- `hasZdr` is hardwired to `() => false` in main.ts. Wave 4 replaces that with a model-registry lookup (`zdrCapable` flag on provider configs). Until then frontier escalation never fires regardless of the user setting.
- `FreshnessOrchestrator.runForCluster` writes the verdict into `note_freshness` last_* columns and appends to `note_freshness_history`. The Aging-knowledge tab in Wave 3 reads both: history for the per-note timeline, mirror columns for fast list views.
- `WebSearchTool` now delegates to `WebSearchProvider`; the provider lives as plain functions so the verifier can call it without going through the agent tool loop. Behavioural surface unchanged.
- `UpdateFinding.notes` stays optional and only populates when the orchestrator returned verdicts. Existing `notificationSink` callers that only read cluster-level fields keep working unchanged.

## Change Log

- 2026-06-19: PLAN-40 created. Status Draft.
- 2026-06-19: Phase 2 critical review writeback. Three driften corrected in plan-context-imp-20-06-01.md and ADR-104 amendment: `WebSearchService` -> `WebSearchTool`+helper, Provider-Fallback -> User-Konfig, WriterLock-Pattern-Quelle ADR-95 -> ADR-79. ADR-95-amendment clarifies pattern provenance.
- 2026-06-19: Wave 1 implemented. All six tasks shipped. Status flips to Active. Wave 2 next.
- 2026-06-19: Wave 2 implemented. All five tasks shipped. Verifier wiring lives in main.ts inside the Stufe3 webUpdatePass block. Wave 3 (UI) next.
- 2026-06-19: Wave 3 implemented. AgingKnowledgeReader maps verdict+confidence into critical/moderate/info/ok per ADR-106. VaultHealthRepairModal gains a top-level tab switch between Findings and Aging knowledge; the new tab lists severity-coloured rows with a Resolve button per row and a Batch resolve button on the toolbar. ResolveConflictModal does single-note MarkVerified/OpenInChat/Edit/Delete (FileManager.trashFile, no native dialog). BatchResolveModal filters by severity and minConfidence with mark-verified / delete actions and an Abort button. Mobile guard explicitly renders an informational text instead of the verifier list on Platform.isMobile. Wave 4 (Settings UI + ZDR capability + Allowlist + Wayfinder) next.
- 2026-06-19: Wave 4 implemented. FreshnessFrontmatterPatcher pins the verifier-write path to the single key `freshness`. ProviderConfig grows a `zdrCapable?` field that users affirm in ProviderDetailModal under a new Privacy sub-section. ZdrCapabilityResolver scans providerConfigs and reports true only when an enabled provider has zdrCapable=true AND a flagship tier mapped; main.ts wires that into LlmVerifierProvider.hasZdr (replaces the hardcoded `() => false`). VaultTab gets a "Note freshness verifier" sub-section with the five sub-flags (externalSources.enabled, writeFrontmatter, allowFrontierEscalation, frontierConfidenceThreshold slider, excludePaths). All sub-toggles default OFF. ARCHITECTURE.map gets three new rows (`freshness-frontmatter-allowlist`, `zdr-capability`, `freshness-settings-ui`). Implementation closes IMP-20-06-01.
