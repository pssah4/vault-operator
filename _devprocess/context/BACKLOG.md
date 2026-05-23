# Backlog obsidian-agent

> Single source of truth for state and the artifact relation graph.
> Status fields live HERE, not in artifact frontmatter.

Last update: 2026-05-22 by coding (FIX-01-07-03 bug captured: Checkpoint-Restore meldet "Restored", aber Datei behaelt geaenderten Inhalt. Live-Repro auf NexusOS-Vault (Note `Notes/Backpropagation (Fehlerrückführung).md`) waehrend Frontmatter-Reparatur. Console zeigt sauberen vault.modify-Pfad, Effekt schlaegt nicht durch. Snapshot vor Restore (28192 chars) und Restore-Inhalt (28192 chars) sind identisch lang -- entweder falscher Pre-Change-Oid oder externes Plugin/Editor-Cache ueberschreibt nach vault.modify. Fix offen, Branch fix/fix-01-07-03-checkpoint-restore-no-effect angelegt. Naechster Schritt: Post-Write-Read-back-Logging im GitCheckpointService.restore() vor echter Fix-Iteration. Spec: `_devprocess/requirements/fixes/FIX-01-07-03-checkpoint-restore-no-effect.md`.)

[Previous]: Last update: 2026-05-21 by security-audit (AUDIT-024 full-codebase delta-audit since AUDIT-016 vom 2026-05-03. Scope: SAST + OWASP Top 10 + OWASP LLM Top 10 + SCA + Zero Trust. 0 Critical, 0 High, 2 Medium, 4 Low, 2 Info. SCA clean (0 npm vulnerabilities ueber 1007 deps). Alle 8 Findings im Fix-Loop am 2026-05-21 resolved: M-1 LLM-translation Consent-Banner + 4 KB Cap + JSDoc-Contract in `translateTemplate.ts`, M-2 Path-Segment-Validation in `TemplateMaterializer.ts` (test pin), L-1 TOCTOU-JSDoc-Note (single-instance-Annahme dokumentiert), L-2 `DEFAULT_INGEST_TEMPLATES`-Helper aus 4 duplizierten onChange-Inits extrahiert, L-3 translator-Fallback-JSDoc, L-4 Frontmatter-Fence-Guard (> 2 `---` rejected), I-1 ingest + ingest-deep Step 5 Source-Verification-Schritt ergaenzt, I-2 neuer CI-Workflow `.github/workflows/security-audit.yml` fuer automatisches npm audit auf jedem dev-push. Build clean, 26/26 Templates-Tests gruen. Report: `_devprocess/analysis/AUDIT-024-vault-operator-full-2026-05-21.md`. Release-readiness: GREEN.)

[Previous]: Last update: 2026-05-21 by coding (FEAT-29-13/14/15 alle drei Phasen auf dev gemerged. (1) FEAT-29-13 Skill-Source-Labels: drei klar getrennte Labels im SkillsTab (Built-in/Agent/User), neuer `source: agent`-Discriminator via skill-creator init_skill, `getSourceLabel` + `SOURCE_TOOLTIP` extrahiert nach `userSkillSource.ts`, Tooltip am Header, BuiltinSkillMaterializer schuetzt agent + learned vor Wipe. 10 neue Tests. (2) FEAT-29-14 Templates-Setup: Bundled-Templates auf `bundled-templates/notes/{de,en}/` segmentiert, `resolveCoreTemplatesFolder`-Helper (liest Obsidian-Core-Templates folder), `TemplateMaterializer` (skip-existing/force + LLM-Translator-Callback fuer beliebige Sprachen mit EN-Fallback), FirstRunWizardModal um 'templates'-Step erweitert (Sprach-Picker DE/EN/Other), VaultTab Re-materialize-Button. Settings: `quellenNotizTemplate` + `templatesLanguage`. 15 neue Tests. (3) FEAT-29-15 Ingest-Sense-Making: Kategorie auf YAML-Listen-Element (Auto-Trigger-Fix), Skill bevorzugt User-Template, Sense-Making-Step (A/B/C-Frage) in /ingest, Pflicht-Backlink-Step in beiden Skills (`update_frontmatter` ergaenzt `Notizen:` in der Quelle). Plan: `~/.claude/plans/radiant-snacking-piglet.md`.)

---

## Dashboard

| Status | Count | | Phase | Count | | Type | Count |
|---|---|-|---|---|-|---|---|
| Planned | 40 | Released | 358 | Epic | 27 |
| Active | 32 | Building | 76 | Feature | 225 |
| Done | 257 | Planned | 36 | Fix | 61 |
| Accepted | 110 | Candidates | 2 | Improvement | 19 |
| Draft | 14 |  |  | ADR | 124 |
| Open | 5 |  |  | Plan | 17 |
| Proposed | 14 |  |  |  |  |

Total artifacts: 472

---

## Graph-Health (letzter Check: 2026-05-17, Modus: A nach voller Hygiene-Welle)

Verlauf: 101 -> 88 -> 70 -> **0 Findings** (gemessen mit `.git/hooks-data/consistency-check.py`, gepatchte Regex `\d{2,3}` fuer ADR/EPIC/PLAN). Pre-Commit-Hook nutzt diese Kopie. Der zentrale Plugin-Cache `$DIA_PLUGIN_ROOT/tools/consistency-check.py` hat die Regex-Drift noch (`\d{2}`) und liefert deshalb 23 ADR-100..123 als false-positive Orphans -- daher nur fuer manuelle Lauefe relevant; nicht im normalen Workflow.

| Invariante | Status | Count | Anmerkung |
|---|---|---|---|
| Dead links / Broken Refs / ADR abstraction | ok | 0 | |
| orphan-backlog-row | ok | 0 | Lokal sauber. Plugin-Cache-Lauf zeigt 23 false-positives wegen `\d{2}`-Regex; Upstream-Fix beim DIA-Plugin offen. |
| duplicate-backlog-id | ok | 0 | Behoben 2026-05-17. |
| status-drift detail-vs-backlog | ok | 0 | Behoben 2026-05-17. |

- **DEBT-CC-2026-05-12** (Source: CONSISTENCY-CHECK, P3, Status: resolved 2026-05-17): Backlog-Graph-Hygiene-Pass abgeschlossen -- (a) Office-Renumbering FEAT-04 -> FEAT-10 vollzogen (Detail-Files, BACKLOG, EPIC-10, ADR-29/-31, RESEARCH-09); (b) Status-Drift in EPIC-Tabellen behoben (Status-Spalten entfernt, `## Features`-Header zu `## Feature Scope` umbenannt damit die Heuristik nicht die Priority-Spalte mit-stuckt); (c) DIA `consistency-check.py`-Regex `^(ADR-\\d{2})` lokal auf `\\d{2,3}` gepatcht -- Upstream-Meldung beim DIA-Plugin offen. Run-Datei: `.git/consistency-check.last-run.json`.
- **DEBT-SCA-2026-05-12** (Typ: Security, Source: SEC, P2): `npm audit` meldet 1 Moderate fuer `mermaid` (transitiv): GHSA-6m6c-36f7-fhxh (Gantt Infinite-Loop-DoS) + drei classDef/Config CSS-/HTML-Injection-Advisories. Vorbestehend (nach AUDIT-017 publiziert), NICHT durch EPIC-24 verursacht. Fix: `npm audit fix` bzw. Overrides-Bump im naechsten Dependency-Housekeeping-Pass. Reale Exponierung niedrig (lokales Plugin, Nutzer rendert eigene Diagramme). Evidence: `node_modules/mermaid`. Ref: AUDIT-018 SCA-M-1.

---

## Active Epics

### EPIC-01: Core Foundation

Source: `_devprocess/requirements/epics/EPIC-01-core-foundation.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-01-01 | Feature | Agent Core Loop | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/137 |
| FEAT-01-02 | Feature | Core Agent Interaction & Modes | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/138 |
| FEAT-01-03 | Feature | Vault Operations (Full CRUD) | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/139 |
| FEAT-01-04 | Feature | Vault Tools (Read, Write, Intelligence) | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/140 |
| FEAT-01-05 | Feature | Controlled Content Editing | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/141 |
| FEAT-01-06 | Feature | Permissions & Approval | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/142 |
| FEAT-01-07 | Feature | Checkpoints (Undo / Restore) | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/143 |
| FEAT-01-08 | Feature | Operation Logging & Audit Trail | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/144 |
| FEAT-01-09 | Feature | Tool Execution Pipeline | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/145 |
| FEAT-01-10 | Feature | Parallel Tool Execution | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/146 |
| FEAT-01-11 | Feature | Diff Stats Badge | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/147 |
| FEAT-01-12 | Feature | Attachments, Clipboard, and Images | Done | Released | EPIC-01 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/148 |
| FIX-01-01-01 | Fix | Anthropic API rejects history with orphaned tool_use blocks | Done | Released | FEAT-01-01, EPIC-01 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/vault-operator-dev/issues/68 |
| FIX-01-12-01 | Fix | Drag-and-drop from Obsidian file explorer opens tab instead of attaching | Done | Released | FEAT-01-12, EPIC-01 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/69 |
| FIX-01-05-01 | Fix | edit_file laesst Agent grosse Rewrites mehrfach retryen statt write_file zu nutzen | Active | Building | FEAT-01-05, EPIC-01 | BUG |  | sebastian-claude-opus-4-7 | 2026-05-21 | P2 Live-Test 2026-05-21 zeigte 5+ edit_file-Retries mit `old_str not found` bei new_str=2397 chars im meeting-summary-Subskill. sizeHint-Schwelle steht auf 2000 chars und Wording war zu weich. Fix: Schwelle auf 1000 chars, Wording von "prefer" auf "Use write_file instead", optional longest-common-prefix-Hinweis. Spec: `_devprocess/requirements/fixes/FIX-01-05-01-edit-file-large-rewrite-steering.md` |
| FIX-01-07-01 | Fix | 07-01: Checkpoint-Snapshot legt neue Dateien nicht ab -- 'No files staged' trotz newFiles=1 | Open | Building | FEAT-01-07, EPIC-01 | BUG |  |  | 2026-05-08 | P2 Live-Test 2026-05-08 (Logging vs. echter Snapshot-Bug zu validieren)  Issue: https://github.com/pssah4/vault-operator-dev/issues/63 |
| FIX-01-07-02 | Fix | 07-02: Checkpoint-UI fehlt beim Wieder-Oeffnen einer alten Chat-History -- Markers + Undo-Bar rendern nur im taskCompleted-Pfad, in-memory taskCheckpoints leer nach Reload | Done | Building | FEAT-01-07, EPIC-01, IMP-01-07-01 | USER | 7112c049 | 2026-05-19 | 2026-05-19 | P1 Implementiert 2026-05-19. UiMessage += optional taskId (ConversationStore), beide assistant-push-Stellen stempeln taskId, neuer Helper rehydrateCheckpointMarkers ruft loadCheckpointsForTask + showUndoBar pro unique taskId beim loadConversation-Render. Auto-poppendes DiffReviewModal beim Reload bewusst weggelassen (sonst N Modals beim Oeffnen). Geteilte Service-Erweiterung mit IMP-01-07-01 (59edeb8c). Spec: `_devprocess/requirements/fixes/FIX-01-07-02-checkpoint-ui-missing-on-history-reload.md` |
| FIX-01-07-03 | Fix | 07-03: Checkpoint-Restore meldet "Restored", aber Datei behaelt geaenderten Inhalt -- vault.modify-Call laueft durch (Log "restored via vault.modify"), Frontmatter-Aenderung trotzdem sichtbar | Active | Building | FEAT-01-07, EPIC-01, PLAN-38 | BUG | | sebastian-claude-opus-4-7 | 2026-05-23 | P1 Live-Repro 2026-05-22 auf NexusOS-Vault, Note `Notes/Backpropagation (Fehlerrückführung).md`. Logs: snapshot(restore-...) liest 28192 chars, restore(commitOid=34dd329d) schreibt 28192 chars, kein Effekt. Critical Review hat Hypothese 1 (falscher Pre-Change-Oid) entkraeftet -- Pipeline.ts:361 schiesst snapshot vor tool.execute (Z.425). Hypothese 2 (pretty-properties/TaskNotes ueberschreiben nach vault.modify) wahrscheinlichste Ursache. Fix-Strategie 2-Phasen: Phase 1 Diagnose-Logging (read-back + Content-Snippet), Phase 2 echter Fix nach Repro-Logs. Spec: `_devprocess/requirements/fixes/FIX-01-07-03-checkpoint-restore-no-effect.md`. Plan: `_devprocess/implementation/plans/PLAN-38-fix-01-07-03-checkpoint-restore-no-effect.md`. |
| IMP-01-07-01 | Improvement | 07-01: Checkpoints als Agent-Tools (list_checkpoints + read_checkpoint + diff_checkpoint + restore_checkpoint) -- Agent kann selbst alte Versionen finden und zurueckspielen | Done | Building | FEAT-01-07, EPIC-01, FIX-01-07-02 | USER | 1c0f256c | 2026-05-19 | 2026-05-19 | P1 Implementiert 2026-05-19. 4 Tools in src/core/tools/vault/ + Registry + TOOL_GROUP_META (read: list/read/diff_checkpoint, edit: restore_checkpoint) + i18n-Labels. Service-Layer: loadCheckpointsForTask + getCheckpointByOid (59edeb8c) + listAllCheckpoints (1c0f256c). restore_checkpoint nimmt eigenen Pre-Restore-Snapshot via service.snapshot('restore-<ts>', files) damit Restore selbst rueckgaengig gemacht werden kann. 36 Tests gruen (10 service-rehydration + 26 tools). Spec: `_devprocess/requirements/improvements/IMP-01-07-01-agent-tools-for-checkpoints.md` |

### EPIC-02: Rules, Workflows & Intelligence

Source: `_devprocess/requirements/epics/EPIC-02-rules-workflows-intelligence.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-02-01 | Feature | Rules | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/149 |
| FEAT-02-02 | Feature | Workflows & Slash Commands | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/150 |
| FEAT-02-03 | Feature | Skills | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/151 |
| FEAT-02-04 | Feature | PAS-1 – Local Skills | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/152 |
| FEAT-02-05 | Feature | VaultDNA — Automatic Plugin Discovery | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/153 |
| FEAT-02-06 | Feature | Autocomplete | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/154 |
| FEAT-02-07 | Feature | Custom Prompts (Slash Command Templates) | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/155 |
| FEAT-02-08 | Feature | Chat History | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/156 |
| FEAT-02-09 | Feature | Modes | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/157 |
| FEAT-02-10 | Feature | Custom Instructions, Custom Modes, and Rules | Done | Released | EPIC-02 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/158 |
| FIX-02-04-01 | Fix | Agent nutzt built-in `create_excalidraw` statt Excalidraw-Plugin (Plugin-Routing | Done | Released | FEAT-02-04, EPIC-02 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/vault-operator-dev/issues/70 |

### EPIC-03: Context, Memory & Scaling

Source: `_devprocess/requirements/epics/EPIC-03-context-memory-scaling.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-03-01 | Feature | Semantic Search & Index | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/159 |
| FEAT-03-02 | Feature | Keyword Search Upgrade — Stemming + TF-IDF + Word Boundaries | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/160 |
| FEAT-03-03 | Feature | Context Management (Active Files & Tabs) | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/161 |
| FEAT-03-04 | Feature | Memory, Chat History & Personalization | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/162 |
| FEAT-03-05 | Feature | Multi-Agent (new_task) | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/163 |
| FEAT-03-06 | Feature | Context Condensing & Power Steering | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/164 |
| FEAT-03-07 | Feature | Power Steering | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/165 |
| FEAT-03-08 | Feature | Tool Repetition Detection | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/166 |
| FEAT-03-09 | Feature | Canvas & Bases Tools | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/167 |
| FEAT-03-10 | Feature | Global Storage Architecture | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/168 |
| FEAT-03-11 | Feature | Safe Storage (Encrypted API Keys) | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/169 |
| FEAT-03-12 | Feature | Modular System Prompt Architecture | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/170 |
| FEAT-03-13 | Feature | Import Models from Code Snippet | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/171 |
| FEAT-03-14 | Feature | Knowledge-DB-Haertung | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/172 |
| FEAT-03-15 | Feature | Memory-Engine-Foundation | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/173 |
| FEAT-03-16 | Feature | Memory-Migration und Vault-RRF-Quick-Win | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/174 |
| FEAT-03-17 | Feature | Dynamic Context Composition | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/175 |
| FEAT-03-18 | Feature | Single-Call Update Pipeline und Combined Note-Index-Pass | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/176 |
| FEAT-03-19 | Feature | Living Document UX | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/177 |
| FEAT-03-19b | Feature | Agent-Self Layer (Soul, Capabilities, Self-Awareness) | Done | Released | EPIC-03 | BA |  |  |  |  |
| FEAT-03-20 | Feature | History Search ueber alle Konversationen | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/178 |
| FEAT-03-21 | Feature | Engine-Extract zu @obsilo/memory-engine | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/179 |
| FEAT-03-22 | Feature | Privacy und Forget-Right | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/180 |
| FEAT-03-23 | Feature | Memory-UX, Onboarding und Settings-Migration | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/181 |
| FEAT-03-24 | Feature | Inference-Pass fuer Derives | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/182 |
| FEAT-03-25 | Feature | Vault-Note-zu-Fact-Extraction | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/183 |
| FEAT-03-26 | Feature | Selektiver Top-Hub-Block im KV-Cache | Done | Released | EPIC-03 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/184 |
| FIX-03-06-01 | Fix | Session-Summary .md-Dateien werden nicht geschrieben | Done | Released | FEAT-03-06, EPIC-03 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/71 |
| FIX-03-06-02 | Fix | Memory-Extractor und Context-Prefix-Generator retry-spammen bei permanenten Prov | Done | Released | FEAT-03-06, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/72 |
| FIX-03-14-01 | Fix | - WriterLock nicht verdrahtet | Done | Released | FEAT-03-14, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/73 |
| FIX-03-14-02 | Fix | - iCloud-Vault Rename nicht cascadiert | Done | Released | FEAT-03-14, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/74 |
| FIX-03-18-01 | Fix | 18-01: SingleCallProcessor budget-exhausted Test schlaegt fehl wegen Mock-Setup | Done | Released | FEAT-03-18, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/75 |
| FIX-03-23-01 | Fix | 23-01: FEAT-03-23 falsch auf Done -- Onboarding-Memory-Step + Coach-Marks fehlen | Done | Released | FEAT-03-23, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/76 |
| FIX-03-25-01 | Fix | 25-01: FEAT-03-25 falsch auf Done -- VaultMemorySourceService fehlt komplett | Done | Released | FEAT-03-25, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/77 |
| FIX-03-26-01 | Fix | 26-01: Settings-UI-Hinweis fuer Top-Hub-Block Privacy-Trade-Off | Done | Released | FEAT-03-26, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/78 |
| FIX-03-26-02 | Fix | 26-02: Top-Hub-Block + andere Settings-Toggles reagieren nach Privacy-Ack nicht  | Done | Released | FEAT-03-26, EPIC-03 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/79 |
| IMP-03-17-01 | Improvement | IMP-03-17-01: recall_memory queryFacts auf Cosine ueber fact_embeddings | Planned | Building | FEAT-03-17, EPIC-03 | USER |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/185 |
| IMP-03-18-01 | Improvement | IMP-03-18-01: AgingService Daily-Scheduler | Planned | Building | FEAT-03-18, EPIC-03 | USER |  |  |  |  |
| IMP-03-18-02 | Improvement | IMP-03-18-02: DriftEventBus Subscriber in ExtractionQueue | Planned | Building | FEAT-03-18, EPIC-03 | USER |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/186 |

### EPIC-04: Providers, Web & Localization

Source: `_devprocess/requirements/epics/EPIC-04-providers-web-localization.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-10-00 | Feature | create_pptx Tool | Done | Released | EPIC-10 | BA |  |  |  | Renumbered 2026-05-17 (former FEAT-id under EPIC-04, DEBT-CC-2026-05-12).  Issue: https://github.com/pssah4/vault-operator-dev/issues/187 |
| FEAT-10-01 | Feature | create_docx Tool | Done | Released | EPIC-10 | BA |  |  |  | Renumbered 2026-05-17 (war FEAT-04-01, DEBT-CC-2026-05-12).  Issue: https://github.com/pssah4/vault-operator-dev/issues/188  Issue: https://github.com/pssah4/vault-operator-dev/issues/189 |
| FEAT-04-01 | Feature | MCP Client & Tools | Done | Released | EPIC-04 | BA |  |  |  |  |
| FEAT-10-02 | Feature | create_xlsx Tool | Done | Released | EPIC-10 | BA |  |  |  | Renumbered 2026-05-17 (war FEAT-04-02, DEBT-CC-2026-05-12).  Issue: https://github.com/pssah4/vault-operator-dev/issues/190  Issue: https://github.com/pssah4/vault-operator-dev/issues/191 |
| FEAT-04-02 | Feature | Web Tools | Done | Released | EPIC-04 | BA |  |  |  |  |
| FEAT-04-03 | Feature | Providers & Models | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/192 |
| FEAT-10-04 | Feature | Agent Prompt & Skill Update | Done | Released | EPIC-10 | BA |  |  |  | Renumbered 2026-05-17 (war FEAT-04-04 office, DEBT-CC-2026-05-12).  Issue: https://github.com/pssah4/vault-operator-dev/issues/193  Issue: https://github.com/pssah4/vault-operator-dev/issues/194 |
| FEAT-04-04 | Feature | Localization (i18n) | Done | Released | EPIC-04 | BA |  |  |  |  |
| FEAT-04-05 | Feature | Conversational Onboarding & Settings-Skill | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/195 |
| FEAT-04-06 | Feature | Notifications | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/196 |
| FEAT-04-07 | Feature | Agent Skill Mastery | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/197 |
| FEAT-04-08 | Feature | Ollama Provider Management | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/198 |
| FEAT-04-09 | Feature | OpenAI-kompatible Streaming Tool-Call Robustheit | Done | Released | EPIC-04 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/199 |
| FIX-04-09-01 | Fix | OpenAI Provider verschluckt Tool-Calls bei finish_reason="stop" | Done | Released | FEAT-04-09, EPIC-04 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/80 |
| FIX-04-03-01 | Fix | 03-01: SummaryGenerator umgeht konfigurierten Provider, Anthropic 400 trotz OpenRouter-Setup | Done | Released | FEAT-04-03, EPIC-04, IMP-04-03-01 | BUG | sebastian-claude-opus-4-7 | 2026-05-17 | 2026-05-17 | P1 Effektiv resolved durch EPIC-26 + FEAT-24-08 Welle A (2026-05-17). Code-Audit 2026-05-17: `grep new Anthropic` zeigt 1 Instanziierung im legitimen Provider-Adapter (`src/api/providers/anthropic.ts`), KEIN Bypass im Hilfs-Konsumer-Pfad. SummaryGenerator geht ueber `this.getMemoryModel()` -> `buildApiHandlerForModel(model)` -> provider-korrekter Adapter. Die 400er vom 2026-05-08 waren eine stille Mis-Configuration (`memoryModelKey` zeigte auf einen `provider:anthropic`-Entry mit leerem Key bei aktivem OpenRouter-Setup); EPIC-26 hat das UI entfernt das diesen Mismatch ueberhaupt konfigurierbar machte; Welle A garantiert dass `getMemoryModel()` jetzt immer das aktive Provider-Tier returnt (mit gueltiger Auth). Shipped v2.11.5-beta.5. Issue: https://github.com/pssah4/vault-operator-dev/issues/60 |
| FIX-04-03-02 | Fix | 03-02: Temperature-Parameter-Inkompatibilitaet mit Claude Opus 4.7 + GPT-5.5 -- 400 weil Modelle den Parameter nicht mehr akzeptieren | Done | Released | FEAT-04-03, EPIC-04 | BUG |  |  | 2026-05-13 | P0 Erledigt 2026-05-13. Issue [#34](https://github.com/pssah4/vault-operator/issues/34). Root cause: 5 Provider (anthropic, openai, bedrock, kilo-gateway, chatgpt-oauth) senden temperature unbedingt; nur o-Series wurde skippt. **Fix:** neuer Helper `modelSupportsTemperature(modelId)` in model-registry.ts (false fuer claude-opus-4-7* + gpt-5*, normalisiert OpenRouter/Bedrock-Aliase). Alle 5 Provider lassen temperature jetzt weg wenn der Helper false sagt. 5 neue Unit-Tests in model-registry.test.ts. 1490 Tests gruen (+5), tsc clean, build+deploy gruen, lint clean. |
| FIX-04-03-03 | Fix | 03-03: CORS-Fehler bei Custom OpenAI-kompatiblen Providern (opencode go, lokale Server) -- createNodeFetch wird nur fuer Gemini aktiviert, Custom-Type bleibt CORS-anfaellig | Done | Released | FEAT-04-03, EPIC-04 | BUG |  |  | 2026-05-13 | P0 Erledigt 2026-05-13. Issue [#33](https://github.com/pssah4/vault-operator/issues/33). Root cause: src/api/providers/openai.ts:172 aktiviert createNodeFetch() nur fuer config.type==='gemini'; bei 'custom' bleibt globalThis.fetch mit Electron-CORS aktiv. Plus: createNodeFetch hardcodet https-Modul + Port 443 -- HTTP-only-Server (http://localhost:xxx) waeren auch gebrochen. **Fix:** (1) createNodeFetch protokoll-bewusst (http vs https Modul + Port 80 vs 443); (2) Bypass aktiv fuer 'gemini', 'custom', 'ollama', 'lmstudio'. 1490 Tests gruen, tsc clean, build+deploy gruen. Live-Verifikation mit opencode go ausstehend. |
| FIX-04-03-04 | Fix | 03-04: AUDIT-023 fix-loop bundle -- mermaid dev-dep CVE bump 11.15.0, createNodeFetch socket-Timeout 120s, ListPinnedConversationsTool generic-error, FactExporter backslash-escape, code-comment U+2014 cleanup | Done | Released | FEAT-04-03, EPIC-04, AUDIT-023 | SEC |  |  | 2026-05-13 | P2 Erledigt 2026-05-13 (Fix-Loop von AUDIT-023). 5 Findings resolved in einem Bundle: M-1 (mermaid Dependabot #47/48/49 + npm-audit CVE-2026-41150) per dev-dep-Bump zu `^11.15.0` (npm audit jetzt 0); L-1 createNodeFetch socket-Timeout 120s; L-2 list_pinned_conversations: generischer Tool-Result, raw error nur in console.warn; L-4 (code-scanning #66) FactExporter.escapeMarkdown escapes Backslashes; L-5 zwei U+2014 in model-registry.ts ersetzt. 1490 Tests gruen, lint 0 errors auf touched files, tsc clean, build+deploy gruen. |
| IMP-04-03-05 | Improvement | 03-05: Custom-Provider Warning bei non-loopback http:// baseUrl -- AUDIT-023 L-3 deferred follow-up | Deferred | Candidates | FEAT-04-03, EPIC-04, AUDIT-023, FIX-04-03-03 | SEC |  |  | 2026-05-13 | P3 Polish-Item aus AUDIT-023 L-3 (SSRF-Shape Low). Helper isPlainTextRemoteUrl + ModelConfigModal-Confirm + Models-Tab-Hint. Spec in IMP-04-03-05-custom-provider-non-loopback-http-warning.md. Kein Blocker fuer v2.7.4 Release. |
| FIX-04-03-06 | Fix | 03-06: Bedrock hard-limit-recovery 400 -- toolConfig missing when tools=[] but history has toolUse/toolResult | Active | Building | FEAT-04-03, EPIC-04 | BUG |  | sebastian-claude-opus-4-7 | 2026-05-21 | P2 Live-Test 2026-05-21 (FEAT-29-10 meeting-summary Subskill) zeigte `ValidationException: The toolConfig field must be defined when using toolUse and toolResult content blocks` im hard-limit-recovery-Pfad. AgentTask passt `tools=[]` an createMessage, Bedrock akzeptiert das nicht wenn die History tool_use/tool_result-Bloecke enthaelt. Fix: Bedrock-Provider strippt tool-Bloecke in messages (-> text-Marker) wenn tools=[]. Spec: `_devprocess/requirements/fixes/FIX-04-03-06-bedrock-hard-limit-recovery-toolconfig.md` |
| IMP-04-03-01 | Improvement | 03-01: Provider-Bypass-Audit -- alle direkten LLM-Client-Instanziierungen auf ProviderResolver umstellen | Done | Released | FEAT-04-03, EPIC-04, FIX-04-03-01 | AUDIT | sebastian-claude-opus-4-7 | 2026-05-17 | 2026-05-17 | P2 Audit durchgefuehrt 2026-05-17: `grep -rn "new Anthropic\|@anthropic-ai/sdk" src/` zeigt 1 Treffer (`src/api/providers/anthropic.ts`) -- der legitime Provider-Adapter. KEINE direkten Hilfs-Konsumer-Instanziierungen im Code. BUG-016 (Memory + ContextPrefixBuilder) ist historisch bereits gefixt; das Pattern wiederholt sich nicht. Audit-Result clean; kein Code-Pass noetig. Issue: https://github.com/pssah4/vault-operator-dev/issues/65 |

### EPIC-05: Self-Development & Sandbox

Source: `_devprocess/requirements/epics/EPIC-05-self-development-sandbox.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-05-01 | Feature | Spezifikation: Agent Self-Development (Meta-Agent) | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/200 |
| FEAT-05-02 | Feature | Spezifikation: Sandbox OS-Level Process Isolation | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/201 |
| FEAT-05-03 | Feature | Agent Control Tools | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/202 |
| FEAT-05-04 | Feature | Agent Self-Configuration Tools | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/203 |
| FEAT-05-05 | Feature | Plugin API Bridge & Recipe System | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/204 |
| FEAT-05-06 | Feature | Tool Metadata Registry | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/205 |
| FEAT-05-07 | Feature | Konfigurierbarer Agent-Folder | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/206 |
| FEAT-05-08 | Feature | Agent Folder Change Handling (P0/P1/P2) | Done | Released | EPIC-05 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/207 |
| FIX-05-02-01 | Fix | Sandbox esbuild integrity hashes stale + vaultList('/') throws | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/81 |
| FIX-05-02-02 | Fix | SandboxBridge circuit-breaker stays open, permanently blocks evaluate_expression | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/82 |
| FIX-05-02-03 | Fix | SandboxBridge vault paths with trailing slash return null | Done | Released | FEAT-05-02, EPIC-05 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/83 |

### EPIC-06: Files-to-Chat (Office-Format-Support)

Source: `_devprocess/requirements/epics/EPIC-06-files-to-chat.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-06-01 | Feature | Document Parsing Pipeline | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/208 |
| FEAT-06-02 | Feature | File Picker Erweiterung | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/209 |
| FEAT-06-03 | Feature | Token-Budget-Management | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/210 |
| FEAT-06-04 | Feature | On-Demand Bild-Extraktion | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/211 |
| FEAT-06-05 | Feature | Modell-Kompatibilitäts-Check | Done | Released | EPIC-06 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/212 |

### EPIC-07: Chat-Linking (Provenienz & Nachvollziehbarkeit)

Source: `_devprocess/requirements/epics/EPIC-07-chat-linking.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-07-01 | Feature | Chat-Linking | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/213 |
| FEAT-07-02 | Feature | Protocol Handler (Deep-Links) | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/214 |
| FEAT-07-03 | Feature | Auto-Frontmatter-Linking | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/215 |
| FEAT-07-04 | Feature | Semantisches Chat-Titling | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/216 |
| FEAT-07-05 | Feature | Chat-Linking Setting | Done | Released | EPIC-07 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/217 |
| FIX-07-03-01 | Fix | ChatLink stampt ungueltiges Frontmatter (YAMLParseError) | Done | Released | FEAT-07-03, EPIC-07 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/84 |

### EPIC-08: Task Management

Source: `_devprocess/requirements/epics/EPIC-08-task-management.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-08-01 | Feature | Task Extraction & Management | Done | Released | EPIC-08 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/218 |

### EPIC-09: Monetarisierung

Source: `_devprocess/requirements/epics/EPIC-09-monetarisierung.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-09-01 | Feature | Vault Operator Gateway | Done | Released | EPIC-09 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/219 |
| FEAT-09-02 | Feature | AgentSidebarView Refactoring | Done | Released | EPIC-09 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/220 |

### EPIC-10: Office Document Creation

Source: `_devprocess/requirements/epics/EPIC-10-office-document-creation.md`
Phase: Released | Status: Done

(Container epic. Office creation tools `create_pptx`, `create_docx`, `create_xlsx`,
`create_pdf` und Agent-Prompt-Update tracken unter FEAT-10-00..04. Quality-
Verbesserungen leben unter EPIC-11.)

### EPIC-11: Office Document Quality -- Template Design Intelligence

Source: `_devprocess/requirements/epics/EPIC-11-office-document-quality.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-11-00 | Feature | PPTX Template-Engine (JSZip + OOXML) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/221 |
| FEAT-11-01 | Feature | Default PPTX Templates | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/222 |
| FEAT-11-02 | Feature | Pre-Creation Dialog & Template-Upload | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/223 |
| FEAT-11-03 | Feature | Theme-Extraktion (vereinfacht) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/224 |
| FEAT-11-05 | Feature | Universelle Design-Prinzipien (Skill-Erweiterung) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/225 |
| FEAT-11-08 | Feature | In-Plugin Template-Analyzer (Spatial Analysis + Skill-Generierung) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/226 |
| FEAT-11-10 | Feature | Shape-Name-Matching (Strategy S0) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/227 |
| FEAT-11-11 | Feature | Visual Design Language Document (Skill-Format) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/228 |
| FEAT-11-12 | Feature | Multimodaler Template-Analyzer (Cloud Run Backend) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/229 |
| FEAT-11-13 | Feature | Template-Analyzer Web-Frontend (pssah4.github.io/vault-operator) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/230 |
| FEAT-11-14 | Feature | Template Gallery (Community) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/231 |
| FEAT-11-15 | Feature | Visual Intelligence | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/232 |
| FEAT-11-16 | Feature | Schema-Constrained Slide Generation | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/233 |
| FEAT-11-17 | Feature | plan_presentation Tool | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/234 |
| FEAT-11-18 | Feature | Catalog-Enrichment (special_role, group_id, vollstaendige Beispiele) | Done | Released | EPIC-11 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/235 |

### EPIC-12: GitHub Copilot LLM Provider Integration

Source: `_devprocess/requirements/epics/EPIC-12-github-copilot-provider.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-12-01 | Feature | GitHub Copilot Auth & Token Management | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/236 |
| FEAT-12-02 | Feature | Copilot Chat Completions Provider | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/237 |
| FEAT-12-03 | Feature | Copilot Settings UI Integration | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/238 |
| FEAT-12-04 | Feature | Copilot Embedding Support | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/239 |
| FEAT-12-05 | Feature | Dynamic Copilot Model Listing | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/240 |
| FEAT-12-06 | Feature | GitHub Copilot Modern Model Compatibility (max_completion_tokens) | Done | Released | EPIC-12 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/241 |
| FIX-12-06-01 | Fix | GitHub Copilot Provider lehnt max_tokens fuer neuere Modelle ab | Done | Released | FEAT-12-06, EPIC-12 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/85 |

### EPIC-13: Kilo Gateway LLM Provider Integration

Source: `_devprocess/requirements/epics/EPIC-13-kilo-gateway-provider.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-13-01 | Feature | Kilo Auth & Session Management | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/242 |
| FEAT-13-02 | Feature | Kilo Gateway Chat Provider | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/243 |
| FEAT-13-03 | Feature | Kilo Settings UI Integration | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/244 |
| FEAT-13-04 | Feature | Kilo Dynamic Model Listing | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/245 |
| FEAT-13-05 | Feature | Kilo Organization Context | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/246 |
| FEAT-13-06 | Feature | Kilo Embedding Support | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/247 |
| FEAT-13-07 | Feature | Kilo Manual Token Mode | Done | Released | EPIC-13 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/248 |

### EPIC-14: MCP Connector

Source: `_devprocess/requirements/epics/EPIC-14-mcp-connector.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-14-00 | Feature | MCP Server Core (stdio) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/249 |
| FEAT-14-01 | Feature | Tool-Tier-Mapping | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/250 |
| FEAT-14-02 | Feature | MCP Server Settings UI | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/251 |
| FEAT-14-03 | Feature | Remote Transport (Cloudflare Relay) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/252 |
| FEAT-14-04 | Feature | Remote Authentication | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/253 |
| FEAT-14-05 | Feature | MCP Resources | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/254 |
| FEAT-14-06 | Feature | MCP Prompts (System-Prompt-Ersatz) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/255 |
| FEAT-14-07 | Feature | Plugin Skill Discovery | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/256 |
| FEAT-14-08 | Feature | Remote Approval Pipeline | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/257 |
| FEAT-14-09 | Feature | Connectors Directory Submission | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/258 |
| FEAT-14-10 | Feature | Sandbox Exposure via MCP | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/259 |
| FEAT-14-11 | Feature | Memory Transparency (Agent vs. Human) | Done | Released | EPIC-14 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/260 |
| FIX-14-03-01 | Fix | 03-01: Relay-Poll laeuft endlos in Backoff weil Cloudflare Worker mit HTTP 429 + | Done | Released | FEAT-14-03, EPIC-14 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/86 |
| FIX-14-03-02 | Fix | 03-02: RelayClient verschluckt Poll-Fehler komplett, Diagnose nur ueber Browser- | Done | Released | FEAT-14-03, EPIC-14 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/87 |
| FIX-14-03-03 | Fix | 03-03: MCP Cloudflare-Worker-Connect schlaegt aus Settings UI fehl | Open | Building | FEAT-14-03, EPIC-14 | BUG |  |  | 2026-05-08 | P1 Live-Test 2026-05-08, Fehlermeldung wird im Issue nachgereicht  Issue: https://github.com/pssah4/vault-operator-dev/issues/64 |

### EPIC-15: Unified Knowledge Layer

Source: `_devprocess/requirements/epics/EPIC-15-knowledge-layer.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-15-00 | Feature | SQLite Knowledge DB | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/261 |
| FEAT-15-01 | Feature | Enhanced Vector Retrieval | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/262 |
| FEAT-15-02 | Feature | Graph Data Extraction & Expansion | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/263 |
| FEAT-15-03 | Feature | Implicit Connection Discovery | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/264 |
| FEAT-15-04 | Feature | Local Reranking | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/265 |
| FEAT-15-05 | Feature | Knowledge Data Consolidation | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/266 |
| FEAT-15-06 | Feature | Implicit Connection UI | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/267 |
| FEAT-15-08 | Feature | Storage Consolidation | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/268 |
| FEAT-15-09 | Feature | Note-Summary Storage | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/269 |
| FEAT-15-10 | Feature | Frontmatter-Property Mirror | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/270 |
| FEAT-15-11 | Feature | Cluster-Source-Stats fuer Source-Diversity-Tracking | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/271 |
| FEAT-15-12 | Feature | Cluster-Metadata mit Halbwertszeit-Konfiguration | Done | Released | EPIC-15 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/272 |
| FIX-15-00-01 | Fix | KnowledgeDB Korruption durch nicht-atomare Writes + Cloud Sync | Done | Released | FEAT-15-00, EPIC-15 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/88 |
| FIX-15-03-01 | Fix | ImplicitConnections "Statement closed" Race Condition | Done | Released | FEAT-15-03, EPIC-15 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/89 |
| FIX-15-04-01 | Fix | Reranker ONNX-Runtime Fehler in Electron | Done | Released | FEAT-15-04, EPIC-15 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/90 |
| FIX-15-01-01 | Fix | 01-01: SemanticIndex sendet pro Chunk einen texts=1 Embedding-Call statt Batches | Done | Building | FEAT-15-01, EPIC-15 | BUG | sebastian-claude-opus-4-7 | 2026-05-17 | 2026-05-17 | P1 Root cause bestaetigt im Code 2026-05-17: Pass-1-Indexing (line 371/461) war bereits gebatched; Pass-2-Background-Enrichment (line 964-980) machte per-chunk single embeds. Fix: Zwei-Phasen-Refactor pro File -- Phase A sammelt LLM-enriched-Texts in einer Schleife (LLM-Call ist kontext-abhaengig per chunk, nicht batchbar), Phase B macht eine einzige embedBatch(allEnrichedTexts) pro File und schreibt alle Vektoren atomar zurueck. Effekt: ~500 HTTP-Roundtrips/Reindex -> ~10-25 (je nach Files-Anzahl), Wall-Time ~50s -> ~1-3s pro 500 Chunks, Rate-Limit-Risiko entfernt. Shipped v2.11.5-beta.4. Issue: https://github.com/pssah4/vault-operator-dev/issues/61 |

### EPIC-16: Claude Code Pattern Adoption

Source: `_devprocess/requirements/epics/EPIC-16-claude-code-pattern-adoption.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-16-00 | Feature | Deferred Tool Loading | Done | Released | EPIC-16 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/273 |

### EPIC-17: Website-Dokumentation & Roadmap

Source: `_devprocess/requirements/epics/EPIC-17-website-documentation.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-17-00 | Feature | SSG-Migration & Grundgeruest | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/274 |
| FEAT-17-01 | Feature | User Guide -- Informationsarchitektur & Content | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/275 |
| FEAT-17-02 | Feature | Vault Operator Doku-Skill | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/276 |
| FEAT-17-03 | Feature | Developer Docs -- Update & Erweiterung | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/277 |
| FEAT-17-04 | Feature | Homepage -- Roadmap & Versions-Log | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/278 |
| FEAT-17-05 | Feature | Homepage -- Hero & Messaging Update | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/279 |
| FEAT-17-06 | Feature | Design-Ueberarbeitung (Best-in-Class) | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/280 |
| FEAT-17-07 | Feature | DE Uebersetzung | Done | Released | EPIC-17 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/281 |

### EPIC-18: Token-Kostenreduktion

Source: `_devprocess/requirements/epics/EPIC-18-token-cost-reduction.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-18-00 | Feature | Fast Path Execution | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/282 |
| FEAT-18-01 | Feature | Prompt Caching (Provider-agnostisch) | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/283 |
| FEAT-18-02 | Feature | Context Externalization (Dateisystem als Kontext) | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/284 |
| FEAT-18-03 | Feature | Cross-Platform TMP-Pfade fuer Context Externalization | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/285 |
| FEAT-18-04 | Feature | Cost-Aware Agent Heuristics | Done | Released | EPIC-18 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/286 |
| IMP-18-01-01 | Improvement | Prompt Cache Settings UI: Default-on + provider-agnostische Toggle-Visibility | Done | Released | FEAT-18-01, EPIC-18, ADR-62, ADR-111, PLAN-16 | BA-12 |  |  | 2026-05-10 | P1 Released v2.7.2. Issue #313 Phase 1 (Capability-Tabelle src/api/capabilities.ts, Default-on in modelToLLMProvider, datengetriebene UI-Visibility, Tooltip)  Issue: https://github.com/pssah4/vault-operator-dev/issues/313 |
| IMP-18-01-02 | Improvement | Prompt Caching Provider-Coverage: Bedrock cachePoints + OpenAI cached_tokens + Kilo Gateway/OpenRouter Passthrough | Done | Released | FEAT-18-01, EPIC-18, ADR-62, ADR-111, PLAN-18 | BA-12 |  | 2026-05-09 | 2026-05-12 | P1 Issue #313 Phase 2. Codiert in PLAN-18 Task 5: bedrock.ts setzt cachePoint nach stabilem System-Prefix + nach tools + nach letzter User-Message (gated durch capabilities cacheStyle); openai/github-copilot/kilo-gateway reichen prompt_tokens_details.cached_tokens als cacheReadTokens in den usage-Chunk (inputTokens = non-cached, Anthropic-Konvention) -> Cost-Calc bucht den gecachten Prefix zum Read-Tarif. Live-Verifikation (cacheReadInputTokens > 0 auf Bedrock) steht aus -> Teil von /testing. Issue: https://github.com/pssah4/vault-operator-dev/issues/313 |
| FIX-18-03-01 | Fix | TMP-Files nicht lesbar auf Windows (Pfad-Trennzeichen) | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/91 |
| FIX-18-03-02 | Fix | read_file cannot open externalised tool results under tmp/ | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/92 |
| FIX-18-03-03 | Fix | Externalise cleanup fails with EPERM on iCloud-synced vaults | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/93 |
| FIX-18-03-04 | Fix | FastPath planner JSON parse fails -- recipe aborts mid-task | Done | Released | FEAT-18-03, EPIC-18 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/94 |
| FIX-18-04-01 | Fix | Streaming Tool-Error verschluckt + edit_file-Schleife bei grossen Diffs | Done | Released | FEAT-18-04, EPIC-18 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/95 |
| FIX-18-02-01 | Fix | 02-01: PDF tool_result mehrfach im Hauptkontext, Context Externalization (ADR-63) greift bei PDF-Attachments nicht | Superseded | Building | FEAT-18-02, EPIC-18, ADR-63, FIX-24-03-01 | BUG |  |  | 2026-05-12 | P1 Live-Test 2026-05-08, ~114k Tokens fuer ein PDF in 3 Messages parallel. SUPERSEDED 2026-05-12 von FIX-24-03-01 (Externalizer im Hauptloop + Re-Read-Cap, allgemeiner) -- dort mitloesen.  Issue: https://github.com/pssah4/vault-operator-dev/issues/62 |

### EPIC-19: Knowledge Maintenance

Source: `_devprocess/requirements/epics/EPIC-19-knowledge-maintenance.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-19-00 | Feature | Knowledge Ingest Skill | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/66 |
| FEAT-19-01 | Feature | Vault Health Check (Lint) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/13 |
| FEAT-19-02 | Feature | Knowledge Ontologie | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/14 |
| FEAT-19-03 | Feature | Template-Onboarding | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/15 |
| FEAT-19-04 | Feature | Synthese → Zettel | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/16 |
| FEAT-19-05 | Feature | OCR-Integration | Planned | Planned | EPIC-19 | BA |  |  | | Spec ohne Code (Audit 2026-05-07) Issue: https://github.com/pssah4/vault-operator-dev/issues/17 |
| FEAT-19-06 | Feature | Attachment-Batch-Umbenennung | Planned | Planned | EPIC-19 | BA |  |  | | Spec ohne Code (Audit 2026-05-07) Issue: https://github.com/pssah4/vault-operator-dev/issues/18 |
| FEAT-19-07 | Feature | Chat UI Polish | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/19 |
| FEAT-19-08 | Feature | Konfigurierbarer Standard-Prompt fuer Note-Summary-Generierung | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/20 |
| FEAT-19-09 | Feature | Auto-Summary-Generierung beim Indexing | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/21 |
| FEAT-19-10 | Feature | Frontmatter-Write Toggle plus Backfill-Job | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/22 |
| FEAT-19-11 | Feature | Aktive MOC-File-Pflege mit Marker-Konvention | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/23 |
| FEAT-19-12 | Feature | Pre-Triage-Tool mit 10s-Triage-Karte | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/24 |
| FEAT-19-13 | Feature | Tension-Detection beim Deep-Ingest | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/25 |
| FEAT-19-14 | Feature | Concentration-Warning UI plus Anti-Echo-Vorschlag | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/26 |
| FEAT-19-15 | Feature | Inbox-Workflow fuer Batch-Triage | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/27 |
| FEAT-19-16 | Feature | Stufe-1 Composite-Freshness-Score als VaultHealth-Check | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/28 |
| FEAT-19-17 | Feature | Source-Diversity-Check als Bias-Lint-Kategorie | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/29 |
| FEAT-19-18 | Feature | Health-Modal-Erweiterung mit kontext-spezifischen Action-Buttons | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/30 |
| FEAT-19-19 | Feature | Stufe-2 Activity-Trigger plus Web-Search-Update-Pass | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/31  Issue: https://github.com/pssah4/vault-operator-dev/issues/67 |
| FEAT-19-20 | Feature | Stufe-3 Periodischer Job plus Token-Budget-Cap plus Notifications | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/32 |
| FEAT-19-21 | Feature | Hot-Cluster-Konfiguration in Settings | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/33 |
| FEAT-19-22 | Feature | Aktiver Dialog-Ingest-Modus (Modus A) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/34 |
| FEAT-19-23 | Feature | Auto-Ingest-Modus (Modus B) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/35 |
| FEAT-19-24 | Feature | Output-Modus-Auswahl | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/36 |
| FEAT-19-25 | Feature | Source-Folder vs Wissens-Folder Konfiguration | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/37 |
| FEAT-19-26 | Feature | Dialog-getriebener MOC-Page-Update beim Ingest | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/38 |
| FEAT-19-27 | Feature | Konfigurierbarer Auto-Trigger via Frontmatter-Property | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/39 |
| FEAT-19-28 | Feature | Source-Position-Marker (Block-Refs MD, Page-Refs PDF, Anchor URL) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/40 |
| FEAT-19-29 | Feature | PDF-Strategie (Page-Refs Default vs Markdown-Mirror opt-in) | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/41 |
| FEAT-19-30 | Feature | Bibliographische Summary-Note mit Base-Block fuer Multi-Zettel-Modus | Done | Released | EPIC-19 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/42 |
| FIX-19-01-01 | Fix | vault_health_check and ingest_document missing from builtin mode tool groups | Done | Released | FEAT-19-01, EPIC-19 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/43 |
| FIX-19-01-02 | Fix | Vault-health badge disappeared + redesign to heart-pulse icon | Done | Released | FEAT-19-01, EPIC-19 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/44 |
| FIX-19-12-02 | Fix | 12-02: URL-Sanitizer in IngestTriageLogStore (Query-Params strippen) | Done | Released | FEAT-19-12, EPIC-19 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/45 |
| FIX-19-27-01 | Fix | 27-01: Rate-Limit fuer AutoTriggerObserver gegen vault.on-Storm | Done | Released | FEAT-19-27, EPIC-19 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/46 |
| FIX-19-28-01 | Fix | 28-01: Sense-Making-Note enthaelt keine Source-Position-Marker (Page-Refs / Block-Refs fehlen im Default-Pfad) | Done | Released | FEAT-19-28, EPIC-19 | BUG |  |  | 2026-05-10 | P0 Released v2.7.2. PLAN-15 + Tool-Group-Drift-Fix gemerged. Skill v2 deployed. Live-Test ausstehend. Issue#11  Issue: https://github.com/pssah4/vault-operator-dev/issues/47 |
| FIX-19-28-03 | Fix | 28-03: Mirror-Markdown ist UTF-8-Mojibake (Geschaeftsbericht statt Geschaeftsbericht, Euro-Zeichen kaputt) | Done | Released | FEAT-19-28, EPIC-19, ADR-103, FIX-19-28-01 | BUG |  |  | 2026-05-17 | P1 Effektiv resolved via FIX-19-28-01 (v2.7.2). Code-Validierung 2026-05-17: `PdfMarkdownMirror.ts` ist string-basiert (`parseDocument` -> JS string -> `vault.create`), kein Buffer/Latin-1-Roundtrip; durch den Tool-Group-Fix entfaellt der LLM-Roundtrip-Pfad, der das Mojibake verursachte. Smoke-Test-Bestaetigung in der Praxis ausstehend, aber strukturell unmoeglich.  Issue: https://github.com/pssah4/vault-operator-dev/issues/96 |
| FIX-19-28-04 | Fix | 28-04: PdfMarkdownMirror deckt nur 1-135 von 410 Seiten ab (User erwartet vollen Mirror, kein selektiver Filter dokumentiert) | Done | Released | FEAT-19-28, EPIC-19, ADR-103, FIX-19-28-01 | BUG |  |  | 2026-05-17 | P1 Effektiv resolved via FIX-19-28-01 (v2.7.2). Code-Validierung 2026-05-17: gleiche Wurzel wie FIX-19-28-03 -- ohne `ingest_deep` im TOOL_GROUP_MAP fiel der LLM auf `read_document` mit selektivem Lesen zurueck und hat "1-135 strategisch relevant" halluziniert. Mit `ingest_deep` schreibt `PdfMarkdownMirror.ts` deterministisch den vollen PDF-Text via `parseDocument` -> `vault.create`. Praxis-Re-Run ausstehend.  Issue: https://github.com/pssah4/vault-operator-dev/issues/97 |
| FIX-19-31-02 | Fix | 31-02: Tool-Result-Doubles im Chat-Transkript bei /ingest-deep (jedes content-Block erscheint zweimal) | Done | Released | FEAT-19-31, EPIC-19 | BUG |  | 2026-05-17 | 2026-05-17 | P2 Root cause lokalisiert + behoben 2026-05-17. Render-Double in `AgentSidebarView.ts`: `onToolProgress` schreibt das Live-Output via `outputEl.empty(); createEl('pre')` (line 2002-2003), `onToolResult` haengte danach ein zweites `<pre>` mit identischem Content an (line 1975, kein `empty()`). Fix: `outputEl.empty()` vor dem finalen `createEl('pre')`. Hypothese 1 aus der FIX-Spec (Render-Doppel) bestaetigt; Provider-Stream-Concat-Bug ausgeschlossen. Naechste Release-Welle.  Issue: https://github.com/pssah4/vault-operator-dev/issues/98 |
| FIX-19-28-06 | Fix | 28-06: Tote Page-Refs in Sense-Making-Note werden nicht erkannt (Regex matched nicht bei Block-Anchor-Suffix, keine Page-Range-Validation) | Done | Released | FEAT-19-28, EPIC-19, ADR-103 | BUG |  |  | 2026-05-10 | P1 Released v2.7.2. checkPositionMarkers Regex erweitert + findDeadPageRefs neue Funktion. 9 neue Unit-Tests. |
| FIX-19-28-02 | Fix | 28-02: Chat-Attachments leben nur 1 Turn -- ingest_document attachment_index schlaegt ab Turn 2 fehl, Skill rutscht in Retry-Loop (~12 EUR Token-Cost) | Done | Released | FEAT-19-28, FEAT-19-31, EPIC-19 | BUG |  |  | 2026-05-10 | P1 Released v2.7.2. Skill v2 + Tool-Errormsg landed. Persistent-attachment-state als IMP separat  Issue: https://github.com/pssah4/vault-operator-dev/issues/57 |
| FIX-19-28-05 | Fix | 28-05: AttachmentHandler.clear() laeuft VOR setAttachmentTexts -- ReadDocumentTool sieht nie die fullDocTexts (Lifecycle-Bug, Skill-Design unerfuellbar in Turn 1) | Done | Released | FEAT-19-28, FEAT-19-31, EPIC-19, FIX-19-28-02, ADR-112, PLAN-17 | BUG |  |  | 2026-05-10 | P0 Released v2.7.2. clear() verengt, consumeFullDocTexts() atomic, Push immer. 5 neue Tests. |
| IMP-19-31-01 | Improvement | 31-01: User-konfigurierbare Note-Templates fuer /ingest, /ingest-deep, /meeting-summary (Settings-UI + bundled defaults) | Done | Released | FEAT-19-31, EPIC-19 | AUDIT |  |  | 2026-05-07 | P1 Live-Test 2026-05-07  Issue: https://github.com/pssah4/vault-operator-dev/issues/58 |
| FEAT-19-31 | Feature | Ingest- und Synthese-Skill-Suite (/ingest-deep, /ingest, /meeting-summary) | Done | Released | EPIC-19, ADR-103, FIX-19-28-01 | BA |  |  | | Issue#11 (3 SKILL.md in bundled-skills/, embed-assets 9->12, vault-deploy ok)  Issue: https://github.com/pssah4/vault-operator-dev/issues/49 |
| IMP-19-08-01 | Improvement | 08-01: Strukturierter Output-Parser fuer Summary-Prompt (Keywords/Themen/Konzepte) | Planned | Planned | FEAT-19-08, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/vault-operator-dev/issues/50 |
| IMP-19-13-01 | Improvement | 13-01: TensionDetector default-instanziiert im IngestDeepTool-Produktpfad | Planned | Planned | FEAT-19-13, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/vault-operator-dev/issues/51 |
| IMP-19-15-01 | Improvement | 15-01: Bulk-UI fuer Triage-Inbox-Tab im Vault-Health-Modal | Planned | Planned | FEAT-19-15, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/vault-operator-dev/issues/52 |
| IMP-19-19-01 | Improvement | 19-01: Stufe-2-Klick startet Web-Pass direkt (statt nur @anti_echo_search-Hint) | Planned | Planned | FEAT-19-19, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/vault-operator-dev/issues/53 |
| IMP-19-20-01 | Improvement | IMP-19-20-01: Stufe3PeriodicJob state-Persistierung in DB | Planned | Building | FEAT-19-20, EPIC-19 | USER |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/48 |
| IMP-19-22-01 | Improvement | 22-01: planGenerator LLM-Hook + Multi-Turn-Dialog im IngestDeepTool | Planned | Planned | FEAT-19-22, ADR-100, EPIC-19 | AUDIT |  |  | 2026-05-07 | P1 Audit2026-05-07  Issue: https://github.com/pssah4/vault-operator-dev/issues/54 |
| IMP-19-23-01 | Improvement | 23-01: Auto-Modus mit echtem LLM-Plan (nicht Stub-Default) | Planned | Planned | FEAT-19-23, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 abh.IMP-19-22-01  Issue: https://github.com/pssah4/vault-operator-dev/issues/55 |
| IMP-19-25-01 | Improvement | 25-01: Settings-UI fuer Sources- und Knowledge-Folder | Planned | Planned | FEAT-19-25, EPIC-19 | AUDIT |  |  | 2026-05-07 | P2 Audit2026-05-07  Issue: https://github.com/pssah4/vault-operator-dev/issues/56 |

### EPIC-20: Graph Intelligence

Source: `_devprocess/requirements/epics/EPIC-20-graph-intelligence.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-20-01 | Feature | Confidence Scoring | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/287 |
| FEAT-20-02 | Feature | Community Detection (Louvain) | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/288 |
| FEAT-20-03 | Feature | God-Node Analysis | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/289 |
| FEAT-20-04 | Feature | Retrieval Quality Improvements | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/290 |
| FEAT-20-05 | Feature | Batch Ingest | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/291 |
| FEAT-20-06 | Feature | Knowledge Freshness | Done | Released | EPIC-20 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/292 |

### EPIC-21: ChatGPT OAuth Provider

Source: `_devprocess/requirements/epics/EPIC-21-chatgpt-oauth-provider.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-21-01 | Feature | ChatGPT OAuth Lifecycle (PKCE, Loopback, Refresh) | Done | Released | EPIC-21 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/293 |
| FEAT-21-02 | Feature | Codex Responses-API Handler | Done | Released | EPIC-21 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/294 |
| FEAT-21-03 | Feature | Settings-UI mit "Mit ChatGPT anmelden" | Done | Released | EPIC-21 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/295 |

### EPIC-22: Skill-Package Ecosystem (Anthropic-kompatibel)

Source: `_devprocess/requirements/epics/EPIC-22-skill-package-ecosystem.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-22-01 | Feature | Skill-Folder-Struktur (SKILL.md + Subfolders) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/296 |
| FEAT-22-02 | Feature | Universal Skill-Import (.md / Folder / .skill-Zip) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/297 |
| FEAT-22-03 | Feature | Scripts-im-Skill (Sandbox-Aufruf) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/298 |
| FEAT-22-04 | Feature | Coordinator-Skill (Multi-Rolle in einem Ordner) | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/299 |
| FEAT-22-05 | Feature | Slash Skill Autocomplete | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/300 |
| FEAT-22-06 | Feature | Inline @-Reference | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/301 |
| FEAT-22-07 | Feature | Prefix Split + `+` Menu Integration | Done | Released | EPIC-22 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/302 |
| FIX-22-07-01 | Fix | Sidebar view crashes during BRAT hot-reload (opens before doLoad) | Done | Released | FEAT-22-07, EPIC-22 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/vault-operator-dev/issues/99 |

### EPIC-23: Cross-Surface AI Workflow

Source: `_devprocess/requirements/epics/EPIC-23-cross-surface-ai-workflow.md`
Phase: Building | Status: Active

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-23-01 | Feature | save_to_memory + save_conversation MCP-Tools | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/303 |
| FEAT-23-02 | Feature | recall_memory + search_history MCP-Tools | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/304 |
| FEAT-23-03 | Feature | History-Sidebar Source-Tabs + Read-Only-View | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/305 |
| FEAT-23-04 | Feature | Source-Interface-Tagging + Settings Cross-Surface-Sync | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/306 |
| FEAT-23-05 | Feature | update_memory V1-Deprecation + Migrations-Helper | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/307 |
| FEAT-23-06 | Feature | Memory-Profile-System (Wiedervorlage) | Done | Released | EPIC-23 | BA |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/308 |
| FIX-23-01-01 | Fix | 01-01: save_conversation Living-Document-Semantik + Cross-Interface-Thread-Klamm | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P0  Issue: https://github.com/pssah4/vault-operator-dev/issues/100 |
| FIX-23-01-02 | Fix | 01-02: sync_session ohne source_interface landet im falschen Tab | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/101 |
| FIX-23-01-03 | Fix | 01-03: Auto-Session-Tracking erzeugt Duplikat-Eintrag bei EPIC-23 Tools | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/102  Issue: https://github.com/pssah4/vault-operator-dev/issues/311 |
| FIX-23-01-04 | Fix | 01-04: ensureSession erzeugt leere ConversationStore-Row bei jedem MCP-Call -> l | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/103 |
| FIX-23-01-05 | Fix | 01-05: save_conversation per-message-size-cap (DoS-Vektor, AUDIT-015 H-1) | Done | Released | FEAT-23-01, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/104 |
| FIX-23-04-01 | Fix | 04-01: Perplexity MCP-Connect schlaegt mit "Unexpected content type" fehl | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P1  Issue: https://github.com/pssah4/vault-operator-dev/issues/105 |
| FIX-23-04-02 | Fix | 04-02: MCP Rate-Limiter (sliding window, AUDIT-015 M-1) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/106 |
| FIX-23-04-03 | Fix | 04-03: sanitizeVaultContentForLLM gegen Prompt-Injection im memorySourceHook (AU | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/107 |
| FIX-23-04-04 | Fix | 04-04: strictSourceIsolation Setting fuer recall_memory + search_history (AUDIT- | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/108 |
| FIX-23-04-05 | Fix | 04-05: sync_session per-message-cap + transcript-length-limit (AUDIT-016 H-1) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/109 |
| FIX-23-04-06 | Fix | 04-06: write_vault content-length cap (AUDIT-016 M-1) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/110 |
| FIX-23-04-07 | Fix | 04-07: search_history LIKE-wildcard escape (AUDIT-016 M-2) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/111 |
| FIX-23-04-08 | Fix | 04-08: get_context strictSourceIsolation gating (AUDIT-016 M-3) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/112 |
| FIX-23-04-09 | Fix | 04-09: ConversationStore.generateId crypto.randomUUID (AUDIT-016 M-4) | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/113 |
| FIX-23-04-10 | Fix | 04-10: ActiveMcpSessions ohne Hash + cosine NaN-Guard + OutputModeGenerator inst | Done | Released | FEAT-23-04, EPIC-23 | BUG |  |  |  | P2  Issue: https://github.com/pssah4/vault-operator-dev/issues/114 |
| IMP-23-01-01 | Improvement | IMP-23-01-01: Eval-Coverage Pass: MCP-Tool-Handlers + Vault-Tools + FrontmatterI | Planned | Building | FEAT-23-01, EPIC-23 | USER |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/309 |
| IMP-23-04-05 | Improvement | IMP-23-04-05: relay /poll partitioniert pro Plugin-Session (AUDIT-016 L-4, defer | Planned | Building | FEAT-23-04, EPIC-23 | USER |  |  |  |   Issue: https://github.com/pssah4/vault-operator-dev/issues/310 |

### EPIC-24: Agent-Loop Effizienz

Source: `_devprocess/requirements/epics/EPIC-24-agent-loop-effizienz.md`
Issue: https://github.com/pssah4/vault-operator-dev/issues/318
Phase: Architecture | Status: Active
Verwandt: RESEARCH-36 (Diagnose + 3-Wege-Vergleich Claude Code / EnBW Cowork), Nachfolger von EPIC-18 (Token-Kostenreduktion). UEBERLAPPUNG: Bedrock-cachePoint + OpenAI-cached_tokens decken bereits ADR-111 + IMP-18-01-02 (Active) ab -- NICHT hier duplizieren, IMP-18-01-02 aktivieren/zu Ende bringen. Caching-Praefix-Stabilisierung ist ein Amendment zu ADR-62. Externalizer-fuer-PDF-Attachments ist bereits FIX-18-02-01 (Open) -- FIX-24-03-01 ist die allgemeinere Variante (alle Tool-Results im Hauptloop + Re-Read-Cap).

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-24-01 | Feature | Cache-Praefix-Stabilisierung (Anthropic): System-Prompt-Block-Array, DateTime tagesgranular, Memory/Active-Skills aus gecachtem Bereich, rollende History-Breakpoints | Done | Released | EPIC-24, ADR-62, ADR-111, PLAN-18 | RESEARCH-36 |  |  | 2026-05-12 | P0 Welle 1; systemPrompt.CACHE_BREAKPOINT_MARKER + splitSystemPromptAtCacheBreakpoint; anthropic.ts: 2-Block-System-Param + cache_control auf letztem tools-Eintrag + 2 rollende History-Marker; dateTime tagesgranular (includeCurrentTimeInContext default false, steuert nur noch Time-of-Day). Bedrock-cachePoint + cached_tokens -> IMP-18-01-02 (Task 5). +5 Tests. |
| FEAT-24-02 | Feature | History-Komprimierung: Microcompaction der Tool-Results an Turn-Grenzen | Done | Released | EPIC-24, ADR-12, PLAN-18 | RESEARCH-36 |  |  | 2026-05-12 | P0 Welle 1; src/core/context/MicroCompactor.ts + AgentTask.microcompact()/maybeRollingSummary(); settings microcompactionEnabled/rollingSummaryThreshold; ADR-12-Amendment. 6 neue Tests. |
| FEAT-24-03 | Feature | Tool-Output- & Kontext-Disziplin: ADR-63-Externalizer im allgemeinen Hauptloop, Re-Read-Cap externalisierter tmp-Dateien, grosse Paste-/@-Mention-User-Messages kappen | Done | Released | EPIC-24, ADR-63, PLAN-18 | RESEARCH-36 |  |  | 2026-05-12 | P0 Welle 1; ResultExternalizer Re-Read-Cap + reichere Refs, ToolExecutionPipeline HARD_OUTPUT_CAP (60k), AttachmentHandler TOTAL_ATTACHMENT_CHAR_BUDGET (64k), toolDecisionGuidelines-Leitplanke. ADR-63-Amendment; verallgemeinert FIX-18-02-01. +6 Tests. |
| FEAT-24-04 | Feature | Subagent-Delegation: profile='research' + Per-Call-Token-Budget | Done | Released | EPIC-24, ADR-113, ADR-90, PLAN-22 | RESEARCH-36 |  |  | 2026-05-13 | P1 Welle 2 implementiert 2026-05-13. `new_task` um optionalen `profile`-Parameter erweitert (research): schlanker subagentRoleOverride + read-only subagentAllowedTools, Tier-4-Justification entfaellt; ohne profile bleibt ADR-90-Pfad. Per-Call-Token-Budget (Default 8000, Setting `subtaskTokenBudget` in AdvancedApiSettings) fuer beide Pfade. Profile-Registry in `src/core/agent/subagent-profiles.ts`, getModeDefinitionSection-Override, buildToolPromptSection-Filter. Tests: **1460 gruen** (+21 vs 1439 dev: 5 subagent-profiles, 5 newTaskValidation-Profile, 8 NewTaskTool, 3 modeDefinition). lint 0 errors, tsc clean, build+deploy gruen. Live-Messlauf-SC-6 bleibt offen fuer manuelle Abnahme. |
| FEAT-24-05 | Feature | Sichtbarkeit: Sidebar-Kosten-/Token-/Cache-Hit-Anzeige | Done | Released | EPIC-24, PLAN-19 | RESEARCH-36 |  |  | 2026-05-13 | P1 Welle 2. Footer zeigt jetzt Cache-Hit-Rate (cacheHitRate() = reads/(input+reads+writes), wie logCacheStat); costWarnThresholdEur-Setting (default 0.5) -> .agent-cost-warn-Klasse auf dem Footer; cacheCreationTokens an formatTelemetryFooter durchgereicht. +6 Tests. Reine UI, kein ADR. |
| FEAT-24-06 | Feature | MCP-Listing-Cap + read_mcp_tool + Built-in deferred-Review | Done | Released | EPIC-24, ADR-118, FEATURE-1600, PLAN-21 | RESEARCH-36 |  |  | 2026-05-13 | P1 Welle 2 implementiert 2026-05-13 nach /coding-Pivot (ADR-117 -> ADR-118). Tasks: (1) MCP-Description-Cap 200 chars in `prompts/sections/tools.ts` (`MCP_DESCRIPTION_CAP` + `capMcpDescription`) inkl. Em-Dash -> `--`; (2) `ReadMcpToolTool` neu in `tools/mcp/` (NICHT-deferred, Gruppe `mcp`, voller Description + kompaktes InputSchema-Summary; analog `read_skill`); (3) zweiter Built-in-deferred-Pass: `inspect_self` + `update_settings` mit `TOOL_METADATA`-Eintraegen + in `DEFERRED_TOOL_NAMES`. Tests: **1439 gruen** (+15 vs 1424 dev: 7 ReadMcpToolTool, 4 tools.test, 4 deferredToolLoading-Erweiterung). lint 0 errors, tsc clean, npm run build + deploy gruen. Live-Messlauf-SC-6 bleibt offen fuer manuelle Abnahme. |
| FEAT-24-07 | Feature | Internes Hilfs-Modell-Routing fuer 4 Agent-interne LLM-Calls (helperModelKey) | Done | Released | EPIC-24, ADR-115, ADR-11, PLAN-23 | RESEARCH-36 |  |  | 2026-05-13 | P2 Welle 3, letztes EPIC-24-Item implementiert 2026-05-13. `helperModelKey: string` Top-Level-Setting (Default ''); `plugin.getHelperModel()` analog `getMemoryModel`; `src/core/helper-api.ts` neu mit `getHelperApi(plugin, fallback)` fail-closed. 4 Call-Sites geroutet: condenseHistory (AgentTask), FastPathExecutor planner/presenter (neuer pipeline.getPlugin-accessor), plan_presentation (PlanPresentationTool), RecipePromotion-callback (helper-first-memory-fallback chained). Tests: **1464 gruen** (+4 vs 1460 dev: helper-api.test.ts no-config-fallback + helper-built + build-throws-fallback + getHelperModel-contract). lint 0 errors, tsc clean, build+deploy gruen. Live-Messlauf-SC-8 bleibt offen. |
| FEAT-24-08 | Feature | Autonomie-Governance: Token-/Kosten-Budget pro Task mit Pause+Rueckfrage, Steering-Hook zwischen Iterationen, weiches Exploration-Limit | Partial | Building | EPIC-24, ADR-114, ADR-113 | RESEARCH-36 | sebastian-claude-opus-4-7 |  | 2026-05-17 | P2 Welle 3. **Steering-Hook implementiert** in v2.11.5-beta.2 (Sidebar Chat-Input bleibt mid-run aktiv, Stop-Button morpht zu Send sobald getippt, Enter queued als User-Message vor naechster Iteration ueber `consumeSteeringMessages`-Callback). Token-/Kosten-Budget mit Pause+Rueckfrage UND Exploration-Limit **NICHT in v2.11.5** -- als IMP-24-08-01 + IMP-24-08-02 zurueckgestellt (User-Entscheidung 2026-05-17: Budget-Frage noch zu frueh). |
| FEAT-24-09 | Feature | Active Skills: model-getriebenes On-demand-Laden statt Klassifikator-Inject | Done | Released | EPIC-24, ADR-116, ADR-62, ADR-12, ADR-09, PLAN-20 | RESEARCH-36 |  |  | 2026-05-13 | P1 Welle 2; PLAN-20. Klassifikator-Pfad raus (classifySkillsWithLlm + matchSkillsByKeywordAndTrigger entfernt); neues NICHT-deferred Tool `read_skill` (Gruppe `read`) laedt Skill-Body als Tool-Result; vereinigtes Skill-Verzeichnis (self-authored mit Inventory + User-Skills) als letzte stabile Section vor `CACHE_BREAKPOINT_MARKER`; ersetzt Section 10 (ACTIVE SKILLS) und Section 13 (SELF-AUTHORED SKILLS); `activeSkillNames` Power-Steering entfernt. ADR-116 Amendment 2026-05-13. /testing 2026-05-13 abgenommen: 1424 grün (+13 vs 1411 dev-Baseline: 6 ReadSkillTool, 4 skillDirectory, 1 systemPrompt-Cache-Praefix, 2 SC-5-Assertion read_skill NOT deferred + group=read in deferredToolLoading.test.ts). lint 0 errors, tsc clean. Live-Messlauf-SC (1, 3, 4) bleibt offen fuer manuelle Abnahme. |
| FIX-24-01-01 | Fix | 01-01: anthropic.ts cache_control sitzt auf dem ganzen System-Prompt-String (inkl. volatilem DateTime/Memory/ActiveSkills/Recipe/VaultContext-Tail) -> Cache-Miss + 25% Write-Aufschlag, teurer als ohne Caching | Done | Released | FEAT-24-01, EPIC-24, ADR-62, PLAN-18 | BUG |  |  | 2026-05-12 | P0 Gefixt via FEAT-24-01: System-Prompt am CACHE_BREAKPOINT_MARKER gesplittet, cache_control nur auf dem stabilen Prefix; DateTime tagesgranular. |
| FIX-24-03-01 | Fix | 03-01: ResultExternalizer schliesst read_file aus + Agent liest die externalisierte tmp-Datei sofort zurueck -> No-Op (4/5 Messlauf-Tests); kompakte Referenz zu duenn + kein Re-Read-Cap; verallgemeinert FIX-18-02-01 | Done | Released | FEAT-24-03, EPIC-24, ADR-63, PLAN-18 | BUG |  |  | 2026-05-12 | P1 ResultExternalizer.isExternalizedPath + formatReReadCap (Re-Read einer eigenen tmp-Datei -> 2k-Head-Cap); reichere format*Ref (mehr Headings/Preview/Title). |
| FIX-24-03-02 | Fix | 03-02: tmp-Cleanup des ResultExternalizers schlaegt auf iCloud-Pfad mit EPERM fehl (non-fatal, tmp-Files bleiben liegen) | Done | Released | FEAT-24-03, EPIC-24, PLAN-18 | BUG |  |  | 2026-05-12 | P2 Bereits durch BUG-023 (removeWithRetry + cleanupOrphaned) abgedeckt; Kommentar-Referenz ergaenzt. Kein Verhaltenswechsel noetig. |
| FIX-24-03-03 | Fix | 03-03: EPERM-Warning-Flood beim tmp-Cleanup auf iCloud -- erwartetes Verhalten erzeugt Console-Noise | Active | Building | FEAT-24-03, EPIC-24 | BUG |  | sebastian-claude-opus-4-7 | 2026-05-21 | P3 Live-Test 2026-05-21 (FEAT-29-10 meeting-summary Subskill) zeigte 2x `[Externalize] Cleanup failed after retries (non-fatal, will retry on next plugin start): Error: EPERM`. Retry-Schedule [0,150,500] zu kurz fuer iCloud-Sync-Windows; Warning nicht actionable (Orphan-Sweeper raeumt auf). Fix: Schedule auf [0,150,500,1500] erweitern + Warn auf Debug demoten wenn alle Retries EPERM/EBUSY zurueckgeben. Spec: `_devprocess/requirements/fixes/FIX-24-03-03-externalize-cleanup-warn-noise.md` |
| IMP-24-05-01 | Improvement | 05-01: Per-API-Call Cache-Stat-Diagnose-Log (src/api/logCacheStat.ts) in alle Provider verdrahtet (ausser chatgpt-oauth) | Done | Released | FEAT-24-05, EPIC-24, IMP-18-01-02, PLAN-18 | USER |  |  | 2026-05-12 | Committed 4a5023a (PLAN-18 Task 1, zusammen mit dem 2026-05-11 max_tokens-Auto/Truncation-Recovery-Bugfix als chore-Baseline). Deckt nur das Log, NICHT das cached_tokens-Wiring in usage-Chunk + Cost-Calc -- das ist IMP-18-01-02 (PLAN-18 Task 5). |
| IMP-24-09-01 | Improvement | 09-01: Dead Code entfernen -- `SkillsManager.getRelevantSkills` wird nach FEAT-24-09 (Klassifikator-Entfernung) aus src/ nicht mehr aufgerufen; bei versehentlicher Re-Aktivierung waere die ADR-62/116-Cache-Stabilitaet wieder kompromittiert | Done | Released | FEAT-24-09, EPIC-24, AUDIT-019 | SEC |  |  | 2026-05-13 | P3 Erledigt 2026-05-13. `getRelevantSkills` + `xmlEscape` aus `src/core/context/SkillsManager.ts` entfernt (-63 LOC); `safeRegex`-Import dort entfernt (nur dort genutzt); File-Doc-Comment angepasst (Verweis auf FEAT-24-09 / ADR-116). 1464 Tests gruen (keine Aenderung, kein Caller in src/). lint 0 errors, tsc clean. |
| IMP-24-06-02 | Improvement | 06-02: Tool list_pinned_conversations adden -- gepinnte Chats (Star-Button im HistoryPanel) sind aktuell ueber kein Tool listbar | Done | Released | FEAT-24-06, EPIC-24, FIX-24-06-02 | USER |  |  | 2026-05-13 | P3 Erledigt 2026-05-13. Neues Tool `ListPinnedConversationsTool` registriert + in vault-Gruppe + TOOL_METADATA + ToolExecutionPipeline-Group-Map + ToolName-Union. Datenquelle: facts.source_session_id GROUP BY + conversationStore.list() fuer Titel. 6 Unit-Tests (empty, render-with-meta, orphan-conv, DB-unavailable, query-error, limit-respect). Coverage-Test in builtinModes.coverage.test.ts ergaenzt. 1485 Tests gruen (+7), lint 0 errors, tsc clean, build+deploy gruen. |
| IMP-24-04-01 | Improvement | 04-01: research-Profile Completion-Disziplin -- Subagent gibt Meta-Acknowledgement ("X Notizen identifiziert") statt der konkreten vom Parent geforderten Liste; Parent fuehrt Recherche doppelt aus | Done | Released | FEAT-24-04, EPIC-24, ADR-113 | USER |  |  | 2026-05-13 | P2 Erledigt 2026-05-13. RESEARCH_PROFILE.roleDefinition umformuliert: "compact summary" -> "MUST contain the actual answer the parent asked for" + Anti-Pattern-Beispiel ('do NOT write "Found 5 relevant notes"') + Klarstellung "compact means concise wording, NOT abbreviated content". 1 Regression-Test in subagent-profiles.test.ts pinnt die drei Eigenschaften. Live entdeckt in MESSLAUF Test 3 Aktion A ($1.59 statt erwarteter ~$0.50 wegen Parent-Doppel-Recherche). Manuelle Live-Verifikation via Re-Run ausstehend. |
| IMP-24-06-01 | Improvement | 06-01: TOOL_METADATA-Drift schliessen -- 16 Tools in der `ToolName`-Union haben keinen `TOOL_METADATA`-Eintrag; 1 Tool in `TOOL_METADATA` ohne Union-Eintrag | Done | Released | FEAT-24-06, EPIC-24, AUDIT-020 | SEC |  |  | 2026-05-13 | P3 Erledigt 2026-05-13. **Legacy entfernt:** `create_canvas` aus ToolName-Union; `check_presentation_quality` aus TOOL_METADATA + DEFERRED_TOOL_NAMES + TOOL_GROUPS (ToolExecutionPipeline). **13 TOOL_METADATA-Eintraege ergaenzt** (anti_echo_search, configure_model, ingest_deep, ingest_triage, list_memory_source_notes, mark_for_memory, mark_note_as_memory_source, read_agent_logs, recall_memory, search_history, switch_mode, unmark_note_as_memory_source, update_soul). `_memory_atomize`/`_memory_single_call` bleiben in der Union (LLM-internal constraint-tools, kein BaseTool); Konvention "_"-Prefix dokumentiert. **Drift-Wiederkehr-Schutz:** neuer Vitest-Test `toolMetadataConsistency.test.ts` (+3 Tests) checkt drei Invarianten: Union-Member -> TOOL_METADATA-Entry (mit Underscore-Allowlist), TOOL_METADATA-Key -> Union-Member (kein orphan), DEFERRED_TOOL_NAMES -> TOOL_METADATA (find_tool ranking). 1467 Tests gruen (+3 vs 1464). lint 0 errors, tsc clean, build+deploy gruen. |
| FIX-24-07-01 | Fix | 07-01: update_settings WRITABLE_PATHS-Drift -- 5 EPIC-24-Settings (helperModelKey, subtaskTokenBudget, microcompactionEnabled, rollingSummaryThreshold, costWarnThresholdEur) sind nicht in der Allowlist; Agent kann sie nicht via update_settings setzen | Done | Released | FEAT-24-07, FEAT-24-04, FEAT-24-05, FEAT-24-02, EPIC-24 | BUG |  |  | 2026-05-13 | P1 Erledigt 2026-05-13. Live-Test MESSLAUF Test 4 offenbarte: `update_settings(path: "helperModelKey", ...)` antwortet "not writable via this tool". Root cause: WRITABLE_PATHS in UpdateSettingsTool.ts:17 wurde beim Hinzufuegen der EPIC-24-Settings nie aktualisiert. **Fix:** 5 Pfade ergaenzt + WRITABLE_PATHS exportiert + Regression-Test (UpdateSettingsTool.test.ts mit 5 Asserts pro EPIC-24-Setting + Smoke-Check dass activeModels NICHT writable). 1477 Tests gruen (+5 vs 1472). lint 0 errors, tsc clean. |
| FIX-24-09-01 | Fix | 09-01: `skill-directory` wird im SystemPrompt nicht injiziert wenn `onboarding.completed=false`, auch wenn der User das Plugin produktiv nutzt und Models konfiguriert hat | Done | Released | FEAT-24-09, EPIC-24 | BUG |  |  | 2026-05-13 | P1 Erledigt 2026-05-13. **Root cause:** `AgentSidebarView.ts:2198` `isOnboarding = !onboarding.completed` ist zweideutig (true sowohl bei "Wizard gerade aktiv" als auch bei "Wizard nie zu Ende gemacht"). Folge: skillDirectorySection + pluginSkillsSection bleiben undefined fuer User die das Plugin produktiv nutzen aber den Wizard nie completet haben. **Fix:** neue pure-Helper `src/core/onboarding-status.ts` `isActiveOnboardingFlow(settings)` (true nur wenn `completed=false` UND `activeModels.length===0`); AgentSidebarView nutzt die statt direkter Settings-Inspektion. **Test:** `src/core/__tests__/onboarding-status.test.ts` mit 5 Tests (completed=true happy-path, fresh-install, abandoned-wizard-with-models = Sebastians Fall, edge-case completed-but-no-models, disabled-model-counts). Andere Aufrufer von `onboarding.completed` (OnboardingService.needsOnboarding, OnboardingFlow, UpdateSettingsTool) unangetastet -- die haben einen anderen Use-Case. 1472 Tests gruen (+5 vs 1467 dev-Baseline). lint 0 errors, tsc clean, build+deploy gruen. Manuelle Live-Verifikation via MESSLAUF Test 1c ausstehend. |
| FIX-24-07-02 | Fix | 07-02: helperModelKey-UI-Luecke -- Setting ist nicht im Settings-UI sichtbar, nur via update_settings-Tool oder data.json setzbar | Done | Released | FEAT-24-07, EPIC-24, FIX-24-07-01 | BUG |  |  | 2026-05-13 | P1 Erledigt 2026-05-13. Live entdeckt waehrend MESSLAUF Test 4 Setup: Sebastian fragte wie das fuer normale User setzbar ist. Root cause: beim FEAT-24-07 /coding wurde die analoge UI-Sektion zu memoryModelKey (in MemoryTab.ts) vergessen. **Fix:** Neue Sektion "Helper model" am Ende von LoopTab.ts mit Dropdown ueber alle enabled `activeModels` + Default-Option "Use main model". 4 neue i18n-Keys in en.ts. 1477 Tests gruen (kein Delta -- reine UI-Ergaenzung). lint 0 errors, tsc clean, build+deploy gruen. |
| FIX-24-06-01 | Fix | 06-01: Deferred-Tool-Execution-Guard fehlt -- Modell halluziniert update_settings/inspect_self ohne find_tool, Tool laeuft trotz fehlendem Schema, Agent rate Pfade und verbrennt Cost | Done | Released | FEAT-24-06, EPIC-24, ADR-118 | BUG |  |  | 2026-05-13 | P1 Erledigt 2026-05-13. Live entdeckt in MESSLAUF Test 2 Teil C: Agent rief 5x update_settings mit falschen Pfaden (permissions.autoApproveNoteEdits, approvals.noteEdits, ...) statt erst find_tool zu rufen. **Root cause:** Schema-Filter in AgentTask.ts:548 funktioniert (33 Schemas), aber Execution-Pipeline hatte keinen Aktivierungs-Guard -- LLM kann Namen aus Training/Recipe hallucinieren und Tool laeuft ohne Schema-Guidance. **Fix:** Guard in `runTool` direkt nach RepetitionDetector -- if isDeferredTool && !activatedDeferredTools.has -> tool_error mit `Call find_tool(...) first to discover and activate it.`. 1477 Tests gruen, lint 0 errors, tsc clean, build+deploy gruen. |
| FIX-24-06-02 | Fix | 06-02: MemorySourceStore wird nie initialisiert -- Init-Order-Bug in main.ts (Check bei Z.600 prueft memoryDB, das erst bei Z.1100 geoffnet wird) | Done | Released | FEAT-24-06, EPIC-24 | BUG |  |  | 2026-05-13 | P1 Erledigt 2026-05-13 + live verifiziert via MESSLAUF Test 2 Teil D Re-Verify: `list_memory_source_notes({})` antwortet jetzt "No notes registered as memory-source yet." statt Fehler. **Root cause:** memorySourceStore-Init in main.ts:600 prueft `this.memoryDB?.isOpen()`, aber memoryDB wird erst in main.ts:1101 erzeugt -- 500 Zeilen spaeter. Folge: Conditional immer false, Store fuer immer null, alle 3 Memory-Source-Tools (list/mark/unmark) tot. Wahrscheinlich Refactoring-Artefakt. **Fix:** Second-Pass-Init direkt nach memoryDB.open() in main.ts:1110 -- if memoryDB.isOpen() && !memorySourceStore -> init now. **Bewusst out-of-scope:** memorySourceHook (Bridge zur ExtractionQueue) bleibt unbenutzt -- separater Plumbing-Bug. List/Mark/Unmark-Tools sind unblocked. 1477 Tests gruen, lint 0 errors, tsc clean, build+deploy gruen. |
| FIX-24-06-03 | Fix | 06-03: read_mcp_tool fehlt in TOOL_GROUP_MAP -- Tool registriert aber nicht im Schema; Modell routet Calls faelschlich via use_mcp_tool an den MCP-Server | Done | Released | FEAT-24-06, EPIC-24, ADR-118 | BUG |  |  | 2026-05-13 | P1 Erledigt 2026-05-13. Live entdeckt in MESSLAUF Test 2 Teil B Re-Verify: Modell rief `use_mcp_tool({tool_name:"read_mcp_tool", ...})` statt direkt `read_mcp_tool` -> icons8-Server antwortet "Unknown tool: read_mcp_tool". **Root cause:** wie BUG-021 / FIX-19-28 -- bei FEAT-24-06 /coding wurde ReadMcpToolTool in ToolRegistry registriert aber Eintrag in `TOOL_GROUP_MAP.mcp` (builtinModes.ts:31) vergessen. Memory zum Pattern existiert (feedback_tool_group_drift.md), wurde beim /coding nicht geprueft. **Fix:** read_mcp_tool zur mcp-Gruppe + Coverage-Test-Eintrag in builtinModes.coverage.test.ts. **Followup:** find_tool/read_skill sind im gleichen Zustand aber klappen per Hallucination (fragil) -- eigenes FIX-Item, nicht hier. 1478 Tests gruen (+1), tsc clean, build+deploy gruen. |
| IMP-24-08-01 | Improvement | FEAT-24-08 Mechanik A: Kumulatives Token-/Kosten-Budget pro Task mit Pause+Rueckfrage (zurueckgestellt aus v2.11.5-beta.2) | Deferred | Candidates | FEAT-24-08, EPIC-24, ADR-114, ADR-113 | UX |  | 2026-05-17 | 2026-05-17 | needs refinement: User-Entscheidung 2026-05-17 "Budgetfrage ist jetzt noch zu frueh" -- Schwellwerte und Mess-Strategie offen. P2 Welle 3 Folge-Item zu FEAT-24-08 Steering-Hook. Setting `taskTokenBudget` / `taskCostBudgetEur` / `taskBudgetWarnRatio`, Boundary-Check in AgentTask.ts auf Basis von `totalInputTokens` + `totalOutputTokens`, Rueckfrage via `onApprovalRequired`. |
| IMP-24-08-02 | Improvement | FEAT-24-08 Mechanik C: Weiches Exploration-Limit nach N read/search-Calls ohne produktiven Schritt (zurueckgestellt aus v2.11.5-beta.2) | Deferred | Candidates | FEAT-24-08, EPIC-24, ADR-114, ADR-113 | UX |  | 2026-05-17 | 2026-05-17 | needs refinement: zurueckgestellt zusammen mit IMP-24-08-01 -- Schwellwert-Default und Tool-Klassifikations-Liste brauchen einen separaten Refinement-Pass mit Live-Daten aus Beta-Use. P2 Welle 3 Folge-Item zu FEAT-24-08 Steering-Hook. Counter in AgentTask-Loop, Reset bei Edit/Subtask/attempt_completion, bei Schwellwert User-Message-Hinweis "fokussiere oder spawne research-Subtask". Setting `explorationLimit` (Default 8). |

### EPIC-26: Advisor-Pattern + Provider-only Setup + Auto-Discovery

Source: `_devprocess/requirements/epics/EPIC-26-advisor-pattern-provider-setup.md`
BA: `_devprocess/analysis/BA-27-advisor-pattern-provider-setup.md`
Handoff: `_devprocess/requirements/handoff/architect-handoff-epic26.md`
Issue: https://github.com/pssah4/vault-operator-dev/issues/319
Phase: RE | Status: Active
Absorbiert: EPIC-27 (Provider-only Setup) am 2026-05-15 in EPIC-26 absorbiert. EPIC-27-Issue #320 geschlossen mit Merge-Hinweis.
Verwandt: Nachfolger von EPIC-24 (Agent-Loop Effizienz, v2.7.3..v2.10.x). Adressiert das in BA-12 nicht gedeckte "complex-text"-Plateau plus Provider-Setup-Vereinfachung. Cowork-Architektur-Analyse als Referenz.

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-26-01 | Feature | Advisor-Pattern Engine (`consult_flagship`-Tool, Eskalations-Mechanik, Per-Task-Limit 3) | Done | Released | EPIC-26, BA-27, PLAN-24 | BA-27 | sebastian-claude-opus-4-7 |  | 2026-05-17 | P0 Welle 1. Shipped v2.11.0. ConsultFlagshipTool in ToolRegistry, Per-Task-Limit 3 in ToolExecutionPipeline. AUDIT-027 Green. H-03 (Eskalations-Rate 5-15%) bleibt als Telemetrie-Observation in der Beta-Nutzung; kein Code-Risiko offen. |
| FEAT-26-02 | Feature | Tier-Klassifikator + Discovery-Service (Pattern + Capability, 24h-Cache, OpenRouter-Pricing-Sonderpfad) | Done | Released | EPIC-26, BA-27, PLAN-24 | BA-27 | sebastian-claude-opus-4-7 |  | 2026-05-17 | P0 Welle 1. Shipped v2.11.0. ModelTierClassifier + ModelDiscoveryService aktiv, Production-Wiring an ProvidersTab via PLAN-25 erledigt. H-02 (Klassifikator-Coverage >=90%) verifiziert per ModelTierClassifier.coverage.test.ts (9 Tests gruen, formale H-02 Assertion). |
| FEAT-26-03 | Feature | Provider-only Settings UI (Provider-zentrierte Pflege, Tier-Mapping mit Auto+Override) | Done | Released | EPIC-26, BA-27, PLAN-25 | BA-27 | sebastian-claude-opus-4-7 | 2026-05-15 | 2026-05-17 | P0 Welle 2. Shipped v2.11.0. ProvidersTab + Active-Provider-Selector + Tier-Slot-UI + Refresh-Button. OAuth-Sign-In-Inline-UI bleibt als IMP-26-03-01 (Stub: Redirect zum legacy ModelsTab funktioniert weiterhin). H-04 (Setup ≤1 Min) per Sebastians Daily-Use implizit verifiziert. |
| FEAT-26-04 | Feature | Migration und Backwards-Compat (Auto-Migrate activeModels[] zu providers[], Notification-Modal, 30-Tage-Backup) | Done | Released | EPIC-26, BA-27, PLAN-25 | BA-27 | sebastian-claude-opus-4-7 | 2026-05-15 | 2026-05-17 | P0 Welle 2. Shipped v2.11.0. migrateActiveModelsToProviders + MigrationNotificationModal aktiv, legacy_active_models_backup als Recovery-Pfad in data.json. H-05 (>=95% Migration-Erfolg) verifiziert per activeModelsToProviders.test.ts (17 Tests inkl. expliziter H-05-Block fuer Standard-Setup-Varianten + AUDIT-027-H-1-Regression). |
| FEAT-26-05 | Feature | Chat-Model-Dropdown-Refactor (Auto + Provider-Modelle als Override pro Turn) plus Mode-Switcher-Removal aus Chat-Header | Done | Released | EPIC-26, BA-27, PLAN-26 | BA-27 | sebastian-claude-opus-4-7 | 2026-05-15 | 2026-05-17 | P0 Welle 3. Shipped v2.11.0. ChatModelPickerPopover in AgentSidebarView + Per-Turn-Override + consult_flagship-Filter aktiv. 10 Dropdown- + 6 systemPrompt-Tests gruen. H-06 (Single-Active-Provider-Akzeptanz) per Daily-Use implizit verifiziert. |
| FEAT-26-06 | Feature | Prompt-Slim (cost-heuristics konditional, plugin-skills konditional, tool-routing schlanker) | Done | Released | EPIC-26, BA-27, PLAN-26 | BA-27 | sebastian-claude-opus-4-7 | 2026-05-15 | 2026-05-17 | P2 Welle 3. Shipped v2.11.0. Lean-Varianten von cost-heuristics + plugin-skills aktiv in AgentTask, `pluginSkillsLean` + `recentPluginSkillUsage`-Tracking. tool-routing-Slim als IMP-26-06-01 deferred (separater Pass). Erwartete ~32% Prompt-Reduktion bei Standard-Auto-Sessions. |
| FIX-26-04-01 | Fix | AUDIT-027 H-1: providerConfigs[] + legacy_active_models_backup credentials wurden im Klartext in data.json persistiert (CWE-312) | Done | Released | FEAT-26-04, EPIC-26, AUDIT-027 | SEC | sebastian-claude-opus-4-7 | 2026-05-16 | 2026-05-16 | P1 resolved in /security-audit-Pass. Walker `encryptProviderCredentialsInPlace` / `decryptProviderCredentialsInPlace` in `src/core/security/providerCredentialCrypto.ts` extrahiert + 11 Regression-Tests inkl. Contract-Test gegen Drift bei neuen Credential-Feldern. main.ts encryptSettingsForSave + decryptSettings delegieren jetzt. |
| IMP-26-04-01 | Improvement | AUDIT-027 L-1: Multi-Auth Provider-Instance-ID nutzt erste 8 Zeichen des API-Keys als Discriminator -- defensiv ersetzen durch Counter-Suffix | Deferred | Candidates | FEAT-26-04, EPIC-26, AUDIT-027 | SEC |  | 2026-05-16 | 2026-05-16 | P3 deferred -- Cosmetic, kein Exploit-Pfad. Sebastians Setup ist single-auth pro Provider; Finding ist defensive Hygiene. Fix: ${type}-2/${type}-3 Counter statt apiKey-Prefix. |
| IMP-26-03-01 | Improvement | OAuth-Sign-In-Inline-UI in ProvidersTab (statt Stub-Redirect zum legacy ModelsTab) | Backlog | Planned | FEAT-26-03, EPIC-26 | UX |  | 2026-05-17 | 2026-05-17 | P2 Welle-2-Stub-Aufloesung. Heute oeffnet die Provider-Card fuer ChatGPT-OAuth den legacy ModelsTab im OAuth-Modus. Ziel: PKCE-Flow direkt in ProvidersTab (Authorize-Button + Callback-Handling). Funktional aequivalent, aber Setup-Friction-niedriger. |
| IMP-26-06-01 | Improvement | Prompt-Slim Welle 2: tool-routing-Section schlanker (konditional rendern bei wenigen aktiven Tools) | Backlog | Planned | FEAT-26-06, EPIC-26 | COST |  | 2026-05-17 | 2026-05-17 | P3 Folge-Slim aus FEAT-26-06. cost-heuristics + plugin-skills sind lean, tool-routing-Section bleibt vollumfaenglich gerendert -- Potenzial: ~3-5% zusaetzliche Prompt-Reduktion. Niedrige Prioritaet. |
| IMP-26-00-01 | Improvement | EPIC-26 Hypothesen-Telemetrie: H-03 (Eskalations-Rate 5-15%), H-01 (Sonnet-Qualitaet), H-04 (Setup-Zeit), H-06 (User-Akzeptanz) ueber 2-4 Wochen Beta-Use beobachten | Deferred | Candidates | EPIC-26, BA-27 | OBS |  | 2026-05-17 | 2026-05-17 | P3 Observation-Item. Keine Code-Aenderung noetig; consult_flagship-Calls werden bereits via Cost-Log mit `mode`-Tag protokolliert. Auswertung als Reverse-Engineering-Lauf gegen die Logs nach 2-4 Wochen. Bei Drift (>15% Eskalation): defaultMainModelTier-Flip oder Tier-Override-Tuning. |

### EPIC-28: Plugin Hardening and Listing Compliance

Source: `_devprocess/requirements/epics/EPIC-28-plugin-hardening-listing-compliance.md`
Analyse Companion (Weg B als Alternative): `_devprocess/analysis/companion-architecture-analysis.md`
Public Threat-Model: `SECURITY.md`
Phase: RE+Coding | Status: Active
Verwandt: Reaktion auf Obsidian-Plugin-Scanner-Findings auf v2.11.0 (5 Behavior-Warnings, alle Capability-Klassifikation). Weg C aus der Strategie vom 2026-05-16: Disclosure-Maximierung statt Capability-Reduktion. EPIC-Slot-Hinweis: ID 27 wurde am 2026-05-15 fuer Provider-only Setup geplant und dann in EPIC-26 absorbiert; deshalb ist die naechste freie ID die 28.

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-28-01 | Feature | safeFs Wrapper mit Path-Allowlist (vault, plugin-data, agent-config, system-temp, desktop-config) | Done | Released | EPIC-28, AUDIT-027 | SEC | 9ddec1a0 |  | 2026-05-17 | P0 Welle 1. Wrapper + 18 Tests + Call-Site-Migration (alle Stellen ausser GitCheckpointService aus FIX-28-00-02) in einem Bundle. Shipped v2.11.0. Verifiziert via `scripts/check-safe-fs-imports.sh` (Gate gruen) und AUDIT-028/029 (beide Green). |
| FEAT-28-02 | Feature | spawn-Allowlist mit fester Binary-Liste (node, which/where, git, soffice, libreoffice, cloudflared) | Done | Released | EPIC-28, AUDIT-027 | SEC | 9ddec1a0 |  | 2026-05-17 | P0 Welle 1. Wrapper + 15 Tests + Call-Site-Migration in einem Bundle mit FEAT-28-01. Shipped v2.11.0. Verifiziert via `scripts/check-safe-fs-imports.sh` (Gate gruen) und AUDIT-028/029 (beide Green). |
| FEAT-28-03 | Feature | SECURITY.md Threat-Model im Repo-Root | Done | Releasing | EPIC-28, FEAT-28-01, FEAT-28-02 | SEC |  |  | 2026-05-16 | P0 Welle 2. SECURITY.md im Repo-Root, public-sync-tauglich. Capability-Disclosure (alle 5 Scanner-Findings einzeln), Sandbox-Architektur mit ASCII-Diagramm, Audit-History inline (keine privaten _devprocess-Links), Reporting-Section, Compliance-Mapping. Wird mit naechstem Release v2.11.2 ausgespielt. |
| FIX-28-00-01 | Fix | execSync mit Template-Literal -> spawnSync mit shell:false (ProcessSandboxExecutor.findNodeBinary + McpBridge.startTunnel) | Done | Released | EPIC-28, AUDIT-027 | SEC |  |  | 2026-05-16 | P2 Defensive Hygiene. Beide Stellen verwendeten `${which}` als Template-Literal in execSync. Heute nicht exploitierbar (which/where sind plattform-konstant), aber Anti-Pattern. Wird mit v2.11.2 ausgespielt; redundant zu FEAT-28-02 sobald die Call-Site-Migration durch ist. |
| FIX-28-00-02 | Fix | GitCheckpointService -- isomorphic-git haengt indefinit mit safeFs-Wrapper als fs-Plugin (Reload-Hang auf iCloud-Vault) | Done | Released | EPIC-28, FIX-28-00-01 | BUG |  |  | 2026-05-16 | P0 Live-Hang. EPIC-28 hatte `getFs()` von `import fs from 'fs'` auf `safeFs` umgestellt; isomorphic-git `git.resolveRef` mit `fs: safeFs` liefert eine Promise, die nie resolved (kein Throw, kein Reject). DevTools-Console blieb nach `Loading Vault Operator plugin` stumm, Plugin-onload terminierte nie. Genauer Trigger im Library-internen Property-Probing nicht final isoliert (vermutlich `typeof fs.X` Verhalten anders zwischen Object-Literal `export const promises` und nativem `fs.promises` Proxy). Fix: Genau ein Call-Site (`GitCheckpointService.getFs()`) auf `require('fs')` zurueck, scripts/check-safe-fs-imports.sh um 5. Ausnahme erweitert. Schreibumfang von isomorphic-git ist durch `dir`-Parameter aller `git.X()`-Calls auf `<vault>/.obsidian/plugins/<id>/checkpoints/` beschraenkt -- Threat-Model bleibt korrekt. Detailfile: `_devprocess/requirements/fixes/FIX-28-00-02-isomorphic-git-safefs-hang.md`. |
| FIX-28-00-03 | Fix | iCloud-Sync stalls Obsidian Mobile beim Vault-Open: 196 MB / 3632 Dateien in `<vault>/.obsidian/plugins/<id>/checkpoints/` + 11 MB in `dev-env/` werden auf alle Geraete syncen, Mobile haengt im "restart in safe mode"-Dialog | Done | Released | EPIC-28, FIX-28-00-02 | BUG |  | e01f71dd |  | 2026-05-19 | P0 Live-Stall auf iPhone gemeldet 2026-05-19. Beide Caches nach `{vault-parent}/obsilo-shared/checkpoints/` bzw. `.../dev-env/` verschoben (analog zum GlobalFileService-Root). One-shot Migration auf plugin-onload via `migratePluginDataDirs.ts`: `fs.rename` (atomar), copy+delete-Fallback fuer EXDEV / EPERM / EBUSY. Idempotent ueber `_pluginDataDirsMigrated` Settings-Flag. `GitCheckpointService` Constructor nimmt jetzt `repoAbsPath: string`, alle `vault.adapter.mkdir`-Calls in `initialize()` auf `rawFs.promises.mkdir` migriert. `EsbuildWasmManager` Constructor nimmt `cacheAbsDir: string`, fuenf `vault.adapter`-I/O-Sites auf `rawFs` migriert. Plugin bleibt `isDesktopOnly: true` -- Mobile-Plugin-Loading ist BA-23 / EPIC-23. Detailfile: `_devprocess/requirements/fixes/FIX-28-00-03-icloud-sync-stall-mobile.md`. |

### EPIC-29: Skills-Konsolidierung und Plugin-as-Skill Reliability

Source: `_devprocess/requirements/epics/EPIC-29-skills-consolidation-and-plugin-as-skill-reliability.md`
Handoff: `_devprocess/requirements/handoff/architect-handoff-epic-29.md`
Phase: RE | Status: Active
Verwandt: Schliesst EPIC-22-Luecke (Plugin-Skill-Migration auf Anthropic-Folder-Format) und addressiert Plugin-as-Skill-Reliability sowie Skill-Authoring-Toolkit. 11 Features in 4 Wellen: Welle 1 Cleanup-Foundation, Welle 2 Reliability, Welle 3 Authoring, Welle 4 Polish + Bridge.

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| FEAT-29-01 | Feature | Folder-Konsolidierung (Option 1: alles vault-local plus Backup-Tool) | Released | Building | EPIC-29, PLAN-27, ADR-119, ADR-72, FEAT-29-12 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | P0 Welle 1. /coding 2026-05-20: Alle 11 PLAN-27-Tasks gruen, Live-Test auf 288 MB knowledge.db erfolgreich. Alles Plugin-State vault-local in .vault-operator/data/ und cache/. /testing inline: 51 Tests gruen. /security-audit 2026-05-20: 1M + 4L + 1I, alle 6 actionable resolved. Audit: _devprocess/analysis/AUDIT-FEAT-29-01-2026-05-20.md. Release-readiness: GREEN. |
| FEAT-29-02 | Feature | Plugin-Skill-Format-Migration (File zu Folder/SKILL.md) | Released | Building | EPIC-29, FEAT-29-01, PLAN-28 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | P0 Welle 2. /coding 2026-05-20: VaultDNAScanner schreibt Anthropic-Folder-Layout, Frontmatter strikt name+description, Top-5 references/commands.md eager-generate, Cleanup alter data/plugin-skills/. /testing inline: VaultDNAScanner-writeSkillFile.test.ts (22 Tests). /security-audit 2026-05-20: 2L + 1I, alle 3 actionable resolved (Markdown-Escape-Helper + pluginId-Whitelist-Guard). Release-readiness: GREEN. Audit: _devprocess/analysis/AUDIT-FEAT-29-02-2026-05-20.md |
| FEAT-29-03 | Feature | Unified Discovery und probe_plugin-Tool | Released | Building | EPIC-29, FEAT-29-02, PLAN-29 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | P0 Welle 3. /coding 2026-05-20: Polling 30s->2s, workspace.layout-change-Hook (200ms debounce), Reclassify-Passes 1s+10s. Neuer probe_plugin-Tool fuer Live-Commands+API. SkillRegistry-Prompt-Hint ergaenzt. /testing inline: ProbePluginTool.test.ts (9 Tests). /security-audit 2026-05-20 zusammen mit FEAT-29-04 (probe_plugin = reine read-only Reflection). Audit: _devprocess/analysis/AUDIT-FEAT-29-03-FEAT-29-04-2026-05-20.md. Release-readiness: GREEN. |
| FEAT-29-04 | Feature | Execution Visibility (Notice-Capture) | Released | Building | EPIC-29, PLAN-29 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | P0 Welle 3. /coding 2026-05-20: NoticeCapture-Utility monkey-patcht window.Notice waehrend executeCommandById, 250ms async-Tail, Severity-Heuristik, sensitive-Filter, Truncation. ExecuteCommandTool tool_result strukturiert mit notices-Array. /testing inline: NoticeCapture.test.ts (11 Tests) + ExecuteCommandTool.test.ts (9 Tests). /security-audit 2026-05-20 (M-1 Singleton-Race-Guard, L-1 Getter-Error, L-2 JSON-Bloat, I-1 Sensitive-Heuristik). Audit: _devprocess/analysis/AUDIT-FEAT-29-03-FEAT-29-04-2026-05-20.md. Release-readiness: GREEN. |
| FEAT-29-05 | Feature | Skill-Creator-Builtin-Skill | Released | Building | EPIC-29, FEAT-29-02, FEAT-29-06, ADR-126 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | P1 Welle 3-4. /coding (3f8fcc69) + /testing (113cc0da, +19 Tests) + /security-audit 2026-05-21. Bundle skill-creator builtin (SKILL.md + 2 JS-Scripts + 2 References). manage_skill-Tool entfernt komplett. SkillFrontmatterValidator als discovery-gate. TaskRouter Flagship-Eskalation. Sandbox-Bridge: vault.mkdir + hidden-path support. EditFileTool adapter-fallback. VaultDNAScanner toKebabCase. UI: user-message-bubble color-mix, customize toolbox icon. Reranker ONNX root-cause fix via globalThis-Symbol.for-prepop. Audit: 3L resolved (alle Tool-Removal-Cleanup), 3I by-design. 1936/1957 Tests gruen, SCA 0 vulns. Audit-Report: _devprocess/analysis/AUDIT-FEAT-29-05-2026-05-21.md. Live-Test bestaetigt: weekly-meeting-summary 100% durch skill-creator-Workflow erstellt. Release-readiness: GREEN. |
| FEAT-29-06 | Feature | Sandbox-JS als First-Class-Skill-Pattern | Released | Building | EPIC-29, PLAN-30 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | P1 Welle 4. /coding 2026-05-20: run_skill_script-Tool + RunSkillScriptCache (LRU+sha256 nach AUDIT-L-2) + Bundler-Skip-on-Hit. ManageSkillTool ohne code_modules-Input. CodeModuleCompiler @deprecated. builtinModes-Mode-Body auf helper-scripts. /testing 2026-05-20: RunSkillScriptTool.test.ts (25 Tests). /security-audit 2026-05-20: 2L + 2I, 3 actionable resolved (safePathName-Extraction, sha256-Replace, Cache-Doc). Audit: _devprocess/analysis/AUDIT-FEAT-29-06-2026-05-20.md. Release-readiness: GREEN. |
| FEAT-29-11 | Feature | Skill-Layout-Konsolidierung + Edit-Folder + Builtin-Materialisierung + Readme-Drop + Export-ZIP | Released | Building | EPIC-29, PLAN-31 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | Welle 4 zweites Feature. /coding (6685a896) + /testing (0960d8e3) + /security-audit (4dedc5ca) 2026-05-21. Alle Steps durch plus 3 Live-Fixes (User-Skills-Filter beide Loops, Auto-Rescan via scanner.hasScanned, Customize-Tab toolbox-Icon addIcon-Polyfill). 16 neue Tests (10 BuiltinSkillMaterializer, 5 userSkillSource, 3 hasScanned, 4 references-cleanup, 4 path-traversal-guard). Audit: 2L resolved (L-1 BuiltinSkillMaterializer relPath traversal, L-2 SkillsTab zip-slip), 2I by-design. 1904/1925 Tests gruen, SCA 0 vulns. Audit-Report: _devprocess/analysis/AUDIT-FEAT-29-11-2026-05-21.md. Release-readiness: GREEN. |
| FEAT-29-07 | Feature | Permission und Latency Polish | Released | Building | EPIC-29, FEAT-29-03, PLAN-36, AUDIT-EPIC-29 | USER | 4fef6875 | sebastian-claude-opus-4-7 | 2026-05-21 | P2 Welle 4. /coding 2026-05-21 (4fef6875): Adaptive Timeouts pro Plugin + Auto-Promotion (3 Approvals -> safeMethodOverrides) + isWrite-Heuristik (get/list/find/query). AUDIT-EPIC-29: A04-Approval-Key-Kollision via `isSafePathSegment`-Guard gefixt. 20 Tests gruen. Spec: `_devprocess/requirements/features/FEAT-29-07-permission-and-latency-polish.md`. Release-readiness: GREEN (waiting for v2.11.7 dispatch). |
| FEAT-29-08 | Feature | Skill-Translator-Builtin-Skill | Released | Building | EPIC-29, FEAT-29-02, FEAT-29-05, FEAT-29-06, ADR-127, PLAN-34, AUDIT-EPIC-29 | USER | 3ce349b1 | sebastian-claude-opus-4-7 | 2026-05-21 | P1 Welle 4. /coding 2026-05-21 (3ce349b1) + follow-up workflow-hardening (77e13ba0) + allowedTools frontmatter fix (e09489be). Voller Scope: skill-translator-Builtin mit Dry-Run + Mapping + Translation + PartialTranslationModal + TaskRouter-Flagship-Routing. AUDIT-EPIC-29 M-1/M-2 resolved: validateJs-Heuristik dokumentiert als defense-in-depth, writeTranslation path-traversal-Guard via inline `isUnsafePath`. 48 Tests gruen. **Offen**: IMP-29-08-01 (AST-based validateJs scanner statt Regex-Heuristik) -- NICHT im BACKLOG erfasst, P3. Spec: `_devprocess/requirements/features/FEAT-29-08-skill-translator-builtin.md`. Release-readiness: GREEN (waiting for v2.11.7 dispatch). |
| FEAT-29-09 | Feature | Skill-Versionierung mit Snapshot und Restore | Released | Building | EPIC-29, FEAT-29-02, FEAT-29-05, PLAN-32 | USER |  | sebastian-claude-opus-4-7 | 2026-05-21 | P1 Welle 4. /coding + /testing + /security-audit 2026-05-21. SkillSnapshotService (snapshot/list/restore/tag/untag/prune) + SkillWriteInterceptor (Adapter Pre-Hook, 5s debounce). UI: SkillVersionsModal mit Restore + Tag pro snapshot. Settings: skillVersioning.retentionCount (default 20). Audit: 1L resolved (snapshotId path-traversal), 2I by-design (recursion-guard tested, concurrent-snapshot by-design). 32 neue Tests (21 SnapshotService + 11 WriteInterceptor). 1968/1989 Tests gruen. Audit: _devprocess/analysis/AUDIT-FEAT-29-09-2026-05-21.md. Release-readiness: GREEN. |
| FEAT-29-10 | Feature | Composability (Skill-zu-Skill und Skill-zu-MCP) | Released | Tested | EPIC-29, FEAT-29-03, FEAT-29-06, ADR-129, PLAN-33, AUDIT-EPIC-29 | USER | 47e35fee | sebastian-claude-opus-4-7 | 2026-05-21 | P1 Welle 4. /coding 2026-05-21 (47e35fee), /testing 2026-05-21 (525f4284). Voller Scope: invoke_skill + invoke_mcp_server Tools mit Context-Frame-Isolation via spawnSubtask, CompositionStackService fuer Cycle-Detection + Max-Depth. AUDIT-EPIC-29 A01: MCP-Server-Whitelist-Guard war bypassbar bei leerer Liste -> fail-closed (`activeMcpServers`-Whitelist in InvokeMcpServerTool.ts). 14 neue Tests (9 CompositionStackService SC-01/SC-02/SC-04 + 5 InvokeMcpServerTool SC-03). 2034/2054 gruen, 20 pre-existing dev-baseline-failures (NICHT FEAT-29-10). Coverage-Tooling fehlt (`@vitest/coverage-v8`). Spec: `_devprocess/requirements/features/FEAT-29-10-composability-skill-to-skill-and-mcp.md`. Release-readiness: GREEN (waiting for v2.11.7 dispatch). |
| FEAT-29-12 | Feature | Backup- und Export-Tool fuer Plugin-State (selektiv, ZIP, Auto-Daily) | Released | Building | EPIC-29, FEAT-29-01, PLAN-35, AUDIT-EPIC-29 | USER | 24ce2c2f | sebastian-claude-opus-4-7 | 2026-05-21 | P1 Welle 4. /coding 2026-05-21 (24ce2c2f): Selektives ZIP-Backup mit Skills/Memory/History/Rules/Workflows-Auswahl + Konflikt-Modal + optional Auto-Daily. AUDIT-EPIC-29 H-1 resolved: `KNOWN_SECRET_KEYS` um 8 Token-Felder erweitert (webTools.brave/tavilyApiKey, githubCopilotAccessToken/Token, kiloToken, cloudflareApiToken, relayToken, mcpServerToken) -- manueller + Auto-Daily-Backup-Filter jetzt einheitlich. 53 Tests gruen. Spec: `_devprocess/requirements/features/FEAT-29-12-backup-export-tool.md`. Release-readiness: GREEN (waiting for v2.11.7 dispatch). |
| FEAT-29-13 | Feature | Skill-Source-Labels (Built-in, Agent, User) mit Tooltip | Released | Building | EPIC-29, FEAT-29-05, FEAT-29-11, AUDIT-024 | USER | 82d4c169 | sebastian-claude-opus-4-7 | 2026-05-21 | P2 Welle 4. /coding 2026-05-21: Source-Label `Template` -> `User`, neuer `agent`-Wert via skill-creator `init_skill`, drei Buckets im SkillsTab (Built-in/Agent/User), Tooltip am Header. `getSourceLabel` + `SOURCE_TOOLTIP` extrahiert nach `userSkillSource.ts` (testbar). BuiltinSkillMaterializer-Override-Check schliesst `agent` + `learned` ein. CSS-Klassen fuer alle Source-Werte. 10/10 userSkillSource-Tests gruen. AUDIT-024 full-codebase Audit am 2026-05-21 abgedeckt (0 Findings). Spec: `_devprocess/requirements/features/FEAT-29-13-skill-source-labels.md`. Release-readiness: GREEN (waiting for v2.11.7 dispatch). |
| FEAT-29-14 | Feature | Templates-Setup, Materialisierung und Sprach-Wahl im First-Run | Released | Building | EPIC-29, FEAT-29-13, AUDIT-024 | USER | 39fa55f1 | sebastian-claude-opus-4-7 | 2026-05-21 | P2 Welle 4. /coding 2026-05-21: Bundled-Templates auf `bundled-templates/notes/{de,en}/` segmentiert, esbuild-Generator emittiert `BUNDLED_NOTE_TEMPLATES: Record<lang, Record<filename, content>>`. Neuer `resolveCoreTemplatesFolder`-Helper liest `<configDir>/templates.json` (Obsidian-Core-Templates). Neuer `TemplateMaterializer` schreibt das Default-Set skip-existing/force-overwrite, LLM-Translator-Callback fuer Sprachen != DE/EN (ohne Modell EN-Fallback). FirstRunWizardModal um 'templates'-Step erweitert (Sprach-Picker, Folder-Anzeige, Toggle), advance-Hook materialisiert und setzt `vaultIngest.templates.*`-Pfade. VaultTab: neues `quellenNotizTemplate`-Feld + Re-materialize-Button mit Confirm-Dialog (skip/overwrite). 15/15 Tests gruen (7 templatesFolder + 8 TemplateMaterializer). Settings erweitert um `quellenNotizTemplate` + `templatesLanguage`. Depends-on FEAT-29-13. AUDIT-024: M-1 (LLM-Translation Consent + 4KB Cap + JSDoc), M-2 (Path-Segment-Validation + Test-Pin), L-1/L-2/L-3/L-4 alle resolved im Fix-Loop. Spec: `_devprocess/requirements/features/FEAT-29-14-templates-setup-and-materialization.md`. Release-readiness: GREEN (waiting for v2.11.7 dispatch). |
| FEAT-29-15 | Feature | /ingest und /ingest-deep Sense-Making-Notes mit Backlinks | Released | Building | EPIC-29, FEAT-29-14, AUDIT-024 | USER | 1b52cd4b | sebastian-claude-opus-4-7 | 2026-05-21 | P2 Welle 4. /coding 2026-05-21: ingest + ingest-deep SKILL.md updates. Inline-Default `Kategorie:` jetzt YAML-Listen-Element (`- Quelle`/`- Source` statt `[Quelle]`) damit der Auto-Trigger (FEAT-19-27) matcht. Skill-Body bevorzugt explizit `vaultIngest.templates.*`-User-Template ueber Inline-Default. Neuer Step 4 in /ingest: User-Frage "Sense-Making-Note (A) / Multi-Zettel (B) / Nichts (C, Default)"; bei A/B Output-Note via `quellenNotizTemplate` (aus FEAT-29-14) mit Kategorie `- Quellen-Notiz`/`- Source note` und `Quellen: [[<basename>]]` Backref. Neuer Step 5 (Pflicht): nach Output-Notes `read_file` der Quelle + `update_frontmatter` mit `Notizen: [[note1]], ...` (append). Beide Skills um `update_frontmatter` in requiredTools erweitert, ingest-deep zusaetzlich `write_file`. 16/16 SkillFrontmatterValidator-Tests gruen. Depends-on FEAT-29-14. AUDIT-024 I-1: Step 5 verlangt jetzt Kategorie-Verifikation der Quelle vor `update_frontmatter`. Spec: `_devprocess/requirements/features/FEAT-29-15-ingest-sense-making-and-backlinks.md`. Release-readiness: GREEN (waiting for v2.11.7 dispatch). |

### EPIC-30: Workflow-Builder und Settings-Vereinfachung

Source: `_devprocess/requirements/epics/EPIC-30-workflow-builder-and-settings-simplification.md`
Phase: Candidates | Status: Draft
Verwandt: Skeleton-Epic. Volle Specs nach Abschluss EPIC-29 Welle 3. Workflow-Builder (n8n-aehnlich), Rules-zu-Additional-Instructions Migration, Modes endgueltig entfernen.

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|

### EPIC-31: Skills-Marketplace (GitHub-basiert)

Source: `_devprocess/requirements/epics/EPIC-31-skills-marketplace.md`
Phase: Candidates | Status: Draft
Verwandt: Skeleton-Epic. Volle Specs nach Abschluss EPIC-29 (Skills-Konsolidierung) und EPIC-30 (Workflow-Builder). GitHub-Repo als Marketplace, MIT-Lizenz-Pflicht, PR-Workflow fuer Submissions, Anthropic-Bridge. Mit EPIC-30 zuerst hat der Marketplace beide Asset-Typen (Skills und Workflows) zum Anbieten.

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|

## Cross-cutting (ADRs, Plans, no Epic)

| ID | Type | Title | Status | Phase | Refs | Source | Commit | Claim | Last change | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| ADR-01 | ADR | Zentrale ToolExecutionPipeline für alle Tool-Aufrufe | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-02 | ADR | isomorphic-git für Checkpoints (Shadow Repository) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-03 | ADR | vectra + Xenova Transformers für lokalen Semantic Index | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-04 | ADR | Mode-basierte Tool-Filterung via Tool-Gruppen | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-05 | ADR | Fail-Closed Approval (kein Callback = Ablehnung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-06 | ADR | Sliding Window für Tool-Repetition-Erkennung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-07 | ADR | Event Separation — Completion Signals vs. Text Output | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-08 | ADR | Modular Prompt Sections & Central Tool Metadata | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-09 | ADR | PAS-1 – Local Skills | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-10 | ADR | Permissions Audit — Auto-Approval Wiring | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-100 | ADR | Dialog-Ingest-State-Storage (ingest_session-Tabelle) | Accepted | Released | FEAT-19-22 | ARCH |  |  |  |  |
| ADR-101 | ADR | Output-Modus-Architektur | Accepted | Released | FEAT-19-24, FEAT-19-25, FEAT-19-30 | ARCH |  |  |  |  |
| ADR-102 | ADR | Auto-Trigger-Detection-Mechanik (vault.on-Listener) | Accepted | Released | FEAT-19-27 | ARCH |  |  |  |  |
| ADR-103 | ADR | Source-Position-Marker und PDF-Strategie | Accepted | Released | FEAT-19-28, FEAT-19-29 | ARCH |  |  |  |  |
| ADR-104 | ADR | Web-Search-Provider-Strategie (BYOK obligatorisch) | Accepted | Released | FEAT-19-14, FEAT-19-19, FEAT-19-20, FEAT-04-02 | ARCH |  |  |  |  |
| ADR-105 | ADR | Stufe-3 Job-Runner und Token-Budget-Enforcement | Accepted | Released | FEAT-19-20, FEAT-19-21 | ARCH |  |  |  |  |
| ADR-106 | ADR | Health-Modal-Severity-Modell und Activity-Trigger-Cooldown | Accepted | Released | FEAT-19-18, FEAT-19-19 | ARCH |  |  |  |  |
| ADR-107 | ADR | MCP-Memory-Tools Versionierung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-108 | ADR | Source-Interface-Tagging | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-109 | ADR | Vault-zu-Memory-Bruecke via Single-Listener-Pattern | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-11 | ADR | Multi-Provider API Architecture (Adapter Pattern) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-110 | ADR | Living-Document-Semantik + Cross-Interface-Thread-Klammer | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-111 | ADR | Provider Capability-Flag und Bedrock cachePoint (Erweiterung zu ADR-62) | Accepted | Released | IMP-18-01-01, IMP-18-01-02, FEAT-18-01, ADR-62, FEAT-24-01, PLAN-18 | ARCH |  | 2026-05-12 | 2026-05-12 | supportsPromptCache-Flag (IMP-18-01-01, released v2.7.2). Bedrock-cachePoint + cached_tokens-Wiring codiert in PLAN-18 Task 5 (IMP-18-01-02). Praefix-Split in FEAT-24-01 (ADR-62-Amendment). Live-Verifikation (R-1 Bedrock-Region/Modell) -> /testing. |
| ADR-112 | ADR | Attachment-Lifecycle im Sidebar (Snapshot vs API-Split, Push-Sync zum Tool-Layer) | Accepted | Released | FIX-19-28-05, FEAT-19-28, FEAT-19-31, EPIC-19 | ARCH |  | 2026-05-10 | 2026-05-10 |  |
| ADR-113 | ADR | Subagent-Delegation fuer context-heavy Teilaufgaben (model-getrieben, Per-Call-Token-Budget) | Accepted | Released | FEAT-24-04, EPIC-24, ADR-90, ADR-01, ADR-12, ADR-62, ADR-63, PLAN-22 | ARCH |  | 2026-05-12 | 2026-05-13 | EPIC-24 Welle 2; RESEARCH-36 §8 Hebel E. Amendment 2026-05-13 (PLAN-22): additiv zu ADR-90 -- neuer optionaler `profile`-Parameter in new_task; bei gesetztem Profile entfaellt die Tier-4-Justification (Profile-Wahl IST die Entscheidung); ohne Profile bleibt ADR-90-Pfad voll aktiv. Per-Call-Token-Budget fuer beide Pfade (Setting subtaskTokenBudget, Default 8000). |
| ADR-114 | ADR | Autonomie-Governance -- Token-/Kosten-Budget pro Task, Steering-Hook, Exploration-Limits | Partial | Building | FEAT-24-08, EPIC-24, ADR-01, ADR-06, ADR-12, ADR-113 | ARCH | sebastian-claude-opus-4-7 | 2026-05-12 | 2026-05-17 | EPIC-24 Welle 3; RESEARCH-36 §8 Hebel G. Mechanik B (Steering-Hook) in v2.11.5-beta.2 implementiert ueber bestehenden Power-Steering-Reminder-Pattern in AgentTask + neuer Sidebar-Queue. Mechanik A (Task-Budget) und Mechanik C (Exploration-Limit) zurueckgestellt -- siehe IMP-24-08-01 / IMP-24-08-02. |
| ADR-115 | ADR | Internes Hilfs-Modell-Routing fuer Agent-interne LLM-Calls | Accepted | Released | FEAT-24-07, EPIC-24, ADR-11, ADR-12, ADR-17, ADR-61, PLAN-23 | ARCH |  | 2026-05-12 | 2026-05-13 | EPIC-24 Welle 3; RESEARCH-36 §8 Hebel H. Amendment 2026-05-13 (PLAN-23): konkrete Call-Site-Liste (4 nicht 5; Recipe-Migration helper-first-memory-fallback); classifyText + ChatLinking + Memory-Atomizer + hard-limit-recovery explizit out-of-scope (eigene Keys oder user-facing). Settings-Eintrag als Top-Level helperModelKey analog activeModelKey. |
| ADR-116 | ADR | Active Skills -- model-getriebenes On-demand-Laden statt Klassifikator-Inject | Accepted | Released | FEAT-24-09, EPIC-24, ADR-09, ADR-62, ADR-12, ADR-08, PLAN-20 | ARCH |  | 2026-05-12 | 2026-05-13 | EPIC-24 Welle 2; RESEARCH-36 §8 Hebel B-Teil + §3. Amendment 2026-05-13 (PLAN-20 Umsetzung): neues NICHT-deferred read_skill-Tool statt manage_skill-Erweiterung; vereinigtes Skill-Verzeichnis ersetzt Section 10 + 13; activeSkillNames-Power-Steering entfaellt. |
| ADR-117 | ADR | Lazy-Loading von Tool-Schemas -- Built-in und MCP (per-Server-Katalog, Schema on-demand via find_tool, FEATURE-1600-Pattern auf MCP ausgeweitet) | Superseded | Building | FEAT-24-06, EPIC-24, ADR-08, ADR-11, ADR-53, ADR-62, ADR-116, ADR-118 | ARCH |  | 2026-05-12 | 2026-05-13 | **Superseded by ADR-118** (2026-05-13). Codebase-Reconciliation im /coding-Pivot zeigte: zentrale Praemisse falsch -- MCP-Tools landen nicht im tools-Feld (registerMcpTool ist TODO-Stub), MCP-Listung liegt schon im stabilen Praefix-Block. Begruendung in _devprocess/analysis/ADR-117-review.md. Historischer Eintrag bleibt erhalten. |
| ADR-118 | ADR | MCP-Tool-Listing-Cap, read_mcp_tool, und Built-in deferred-Review | Accepted | Released | FEAT-24-06, EPIC-24, ADR-08, ADR-53, ADR-62, ADR-116, ADR-117 | ARCH |  | 2026-05-13 | 2026-05-13 | EPIC-24 Welle 2; supersediert ADR-117 nach Codebase-Reconciliation. Drei additive Aenderungen: MCP-Description-Cap 200 chars, neues read_mcp_tool (mcp-Gruppe, NICHT deferred, voller Description + InputSchema-Summary), zweiter Built-in-deferred-Pass. PLAN-21 schreibt die Umsetzung. |
| ADR-120 | ADR | Advisor-Pattern als Loop-Default statt Multi-Tier-Routing (consult_flagship-Tool, mid-Tier-Hauptloop, Per-Task-Limit 3, Prompt-Reminder bei mistakes) | Accepted | Released | FEAT-26-01, EPIC-26, ADR-11, ADR-113, ADR-115, PLAN-24 | ARCH | sebastian-claude-opus-4-7 | 2026-05-15 | 2026-05-16 | EPIC-26 Welle 1; Backend in PLAN-24 implementiert (Tool + Profile + Tier-Resolver + Prompt-Reminder + Cost-Log mode-Tag). Beta-Validation H-03 ausstehend. Rollback-Plan ueber defaultMainModelTier-Flip wirkt jetzt im Code. |
| ADR-121 | ADR | Tier-Klassifikator-Strategie (Pattern-First + Capability-Fallback + OpenRouter-Pricing-Sonderpfad) | Accepted | Released | FEAT-26-02, EPIC-26, ADR-11, ADR-120, ADR-122, PLAN-24 | ARCH | sebastian-claude-opus-4-7 | 2026-05-15 | 2026-05-16 | EPIC-26 Welle 1; Classifier in `src/core/routing/ModelTierClassifier.ts` implementiert (49 Tests). Pattern-Pflege via Code-Update, Outlier-Log aktiv. |
| ADR-122 | ADR | Provider-only Settings-Schema (providers[]-Liste mit tierMapping/tierOverrides, activeProviderId, schemaVersion 2026.5.15) | Accepted | Released | FEAT-26-03, FEAT-26-04, EPIC-26, ADR-11, ADR-121, ADR-123 | ARCH |  | 2026-05-15 | 2026-05-15 | EPIC-26 Welle 2; Schemas parallel, legacy_active_models_backup als Recovery; Plugin liest ab schemaVersion 2026.5.15 nur aus providers[]. |
| ADR-123 | ADR | Settings-Schema-Migration und Recovery-Pfad (Auto-Migrate + Notification-Modal + 30/90-Tage-Backup, Idempotenz via schemaVersion) | Accepted | Released | FEAT-26-04, EPIC-26, ADR-122 | ARCH |  | 2026-05-15 | 2026-05-15 | EPIC-26 Welle 2; atomic Settings-Save analog FEATURE-0314 KnowledgeDB-Pattern; Anomalien-Liste im Modal (Multi-Auth, fehlende Tiers, Custom-Endpoints); Restore-Action via Settings-Reset. |
| ADR-119 | ADR | Plugin-Daten-Ordner-Konsolidierung auf einen kanonischen Pfad | Accepted | Released | FEAT-29-01, EPIC-29, ADR-72 | ARCH |  |  | 2026-05-21 | EPIC-29 Welle 1; amends ADR-72; Default-Pfad auf .vault-operator/ konvergiert, Doppel-Lesen-Fenster waehrend Migration, Backup-Snapshot vor Schreiben. Implementiert via migrateAgentLayout.ts + FEAT-29-01. |
| ADR-124 | ADR | Plugin-as-Skill Live-Probe Discovery statt periodischem Polling | Accepted | Released | FEAT-29-02, FEAT-29-03, EPIC-29, ADR-14, ADR-75, ADR-116 | ARCH |  |  | 2026-05-21 | EPIC-29 Welle 1+2; Plugin-Skill-Format-Migration auf Folder/SKILL.md + event-driven Discovery + probe_plugin-Tool, VaultDNAScanner-Polling entfaellt. Implementiert via VaultDNAScanner.writeSkillFile + ProbePluginTool. |
| ADR-125 | ADR | Execution Visibility fuer Plugin-Commands via Notice-Capture | Accepted | Released | FEAT-29-04, EPIC-29, ADR-01 | ARCH |  |  | 2026-05-21 | EPIC-29 Welle 2; Notice-API-Patch waehrend execute_command-Window mit fail-soft Fallback und Sensitive-Daten-Heuristik. Implementiert via core/utils/NoticeCapture.ts + ExecuteCommandTool integration. |
| ADR-126 | ADR | Skill-Authoring als Builtin-Skill statt CRUD-Tool | Accepted | Released | FEAT-29-05, FEAT-29-06, EPIC-29, ADR-75, ADR-115, ADR-116 | ARCH |  |  | 2026-05-21 | EPIC-29 Welle 3; manage_skill-Tool entfaellt, skill-creator als Builtin-Skill nach Anthropic-Vorbild, run_skill_script ersetzt code_modules-Mechanik, Validator als Discovery-Layer, Flagship-Routing fuer Skill-Trigger. Implementiert via bundled-skills/skill-creator + RunSkillScriptTool. |
| ADR-127 | ADR | Python-zu-JavaScript Skill-Translation mit Dry-Run-Pass | Accepted | Released | FEAT-29-08, EPIC-29, ADR-75, ADR-126 | ARCH |  |  | 2026-05-21 | EPIC-29 Welle 4; Mapping-Tabelle als versionierter Datenbestand, User-Modal vor Schreiben bei partial translation, Verweis auf skill-creator als Fallback. Implementiert via bundled-skills/skill-translator + PartialTranslationModal. |
| ADR-128 | ADR | Skill-Versionierung mit Diff-basiertem Snapshot und Restore | Accepted | Released | FEAT-29-09, EPIC-29, ADR-02, ADR-75 | ARCH |  |  | 2026-05-21 | EPIC-29 Welle 4; .versions/-Subfolder pro Skill, Diff-basierte Snapshots, periodische volle Snapshots alle 10 Versionen, Tagging fuer Retention-Schutz. Implementiert via SkillSnapshotService + SkillVersionsModal. |
| ADR-129 | ADR | Skill-Composability mit Skill-zu-Skill und Skill-zu-MCP-Aufrufen | Accepted | Released | FEAT-29-10, EPIC-29, ADR-75, ADR-113, ADR-116 | ARCH |  |  | 2026-05-21 | EPIC-29 Welle 4; neue Tools invoke_skill und invoke_mcp_server mit Aufruf-Stack-Tracking, Max-Depth-Limit Default 5, MCP-Approval-Kette nicht umgehbar, Subtask-Eskalation optional. Implementiert via InvokeSkillTool + InvokeMcpServerTool + CompositionStackService. |
| PLAN-24 | Plan | EPIC-26 Welle 1 -- Advisor-Pattern Engine + Tier-Klassifikator + Discovery (12 Tasks, FEAT-26-01 + FEAT-26-02 Backend) | Done | Released | FEAT-26-01, FEAT-26-02, EPIC-26, ADR-120, ADR-121, ADR-115 | CODE | sebastian-claude-opus-4-7 | 2026-05-15 | 2026-05-16 | Welle 1 Backend abgeschlossen. Alle 12 Tasks implementiert, 110 EPIC-26-Tests grün, tsc + build clean. F-1/F-2/F-3/F-4 alle aufgelöst. UI/Migration/Chat-Dropdown bleiben planmäßig für PLAN-25/PLAN-26 (Welle 2). |
| PLAN-25 | Plan | EPIC-26 Welle 2 -- Provider-only Settings UI + Migration (7 Tasks, FEAT-26-03 + FEAT-26-04) | Done | Released | FEAT-26-03, FEAT-26-04, EPIC-26, ADR-122, ADR-123 | CODE | sebastian-claude-opus-4-7 | 2026-05-16 | 2026-05-16 | Welle 2 Implementation komplett. Migration + Modal + ProvidersTab + Production-Fetcher + i18n. 12 Migration-Tests grün; insgesamt 125 EPIC-26-Tests. Build clean, deployed. |
| PLAN-26 | Plan | EPIC-26 Welle 3 -- Chat-Model-Dropdown + Mode-Switcher-Removal + Prompt-Slim (8 Tasks, FEAT-26-05 + FEAT-26-06) | Done | Released | FEAT-26-05, FEAT-26-06, EPIC-26, ADR-120, ADR-122 | CODE | sebastian-claude-opus-4-7 | 2026-05-16 | 2026-05-16 | Welle 3 Implementation komplett. Chat-Dropdown + Override + Tool-Filter + Mode-Switcher-Removal + lean Cost-Heuristics + lean Plugin-Skills. 1604/1632 Tests grün (+28 vs. /testing). Build clean, deployed. |
| PLAN-27 | Plan | FEAT-29-01 Folder-Konsolidierung Variante B (data/ + cache/ + Legacy-Cleanup, 11 Tasks) | Done | Building | FEAT-29-01, EPIC-29, ADR-119, ADR-72 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-20 | Implementation abgeschlossen 2026-05-20. Alle 11 Tasks gruen (agentFolder-Helper, migrateAgentLayout 10-Phasen, GlobalFileService.useVaultLocalRoot, Doppel-Lesen-Fenster, onload-Trigger mit safeBackupDir, ChatHistoryFolderRemovedModal, Wayfinder, Custom-Pfad-Schutz, 51 Tests, Reset-Buttons mit echtem migrate-Trigger, Restore-from-Backup-Service inkl isDirEmptyIgnoringConsolidated-Helper fuer .vault-operator-Target). Coverage Gate gruen. |
| PLAN-32 | Plan | FEAT-29-09 Skill-Versionierung (5 Tasks, TDD-strict) | Done | Building | FEAT-29-09, EPIC-29 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-21 | Welle 4 drittes Feature. Alle 5 Tasks durch (SnapshotService 21 Tests, WriteInterceptor 11 Tests, Modal, Settings + Wiring, Audit). 1968/1989 gruen. |
| PLAN-33 | Plan | FEAT-29-10 Composability invoke_skill + invoke_mcp_server (5 Tasks, TDD-strict) | Active | Building | FEAT-29-10, EPIC-29 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-21 | Welle 4 viertes Feature. Tasks A-E durch: CompositionStackService (10 Tests), InvokeSkillTool (11 Tests), InvokeMcpServerTool (11 Tests), ToolRegistry + Pipeline + AgentTask-Wiring, skill-creator composability.md. 32 neue Tests gruen, Build clean. /testing + /audit nach Live-Smoke offen. |
| PLAN-34 | Plan | FEAT-29-08 Skill-Translator (7 Tasks A-G, TDD-strict) | Active | Building | FEAT-29-08, EPIC-29, ADR-127 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-21 | Welle 4 fuenftes Feature. Tasks: A mapping.json + Schema, B dry-run.js + Tests, C translate.js + Smoke + Manifest, D PartialTranslationModal, E TaskRouter Flagship-Trigger, F SKILL.md Body, G ARCHITECTURE.map + Live-Smoke gegen Anthropic-Skill. |
| PLAN-35 | Plan | FEAT-29-12 Backup/Export-Tool (6 Tasks A-F, TDD-strict) | Active | Building | FEAT-29-12, EPIC-29 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-21 | Welle 4 sechstes Feature. Tasks: A BackupExportService (collect/build/unpack/validate), B BackupSecretFilter, C ImportConflictResolver, D Settings + AutoBackupScheduler, E UI Modals + Settings-Tab, F ARCHITECTURE.map + Live-Smoke Round-Trip. |
| PLAN-36 | Plan | FEAT-29-07 Permission + Latency Polish (6 Tasks A-F, TDD-strict) | Active | Building | FEAT-29-07, EPIC-29 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-21 | Welle 4 letztes Feature. Tasks: A settings.pluginApi schema, B pure helpers (classifyMethodIsWrite, resolveTimeoutMs, recordApprovalAndMaybePromote) + Tests, C CallPluginApiTool wires resolveTimeoutMs, D ToolExecutionPipeline wires auto-promotion-Hook, E ShellTab UI extension, F ARCHITECTURE.map + build + merge. |
| PLAN-38 | Plan | FIX-01-07-03 Checkpoint-Restore no-effect (2 Phasen: Diagnose-Logging + Fix) | Active | Building | FIX-01-07-03, FEAT-01-07, EPIC-01 | BUG | | sebastian-claude-opus-4-7 | 2026-05-23 | Phase 1 Diagnose-Logging in GitCheckpointService.snapshot/restore (Read-Back + Content-Snippet). Phase 2 echter Fix nach Repro-Logs (vermutete Hypothese 2: pretty-properties/TaskNotes-Hook ueberschreibt nach vault.modify). Phase-1-Risiko niedrig (nur Logs). |
| PLAN-31 | Plan | FEAT-29-11 Skill-Layout-Konsolidierung + Edit-Folder + Builtin + Readme + Export (8 Tasks, TDD-strict) | Done | Building | FEAT-29-11, EPIC-29 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-21 | Welle 4 zweites Feature. Alle 5 Steps + 2 Live-Fixes durch, Live-Test 2026-05-21 bestaetigt. 1888/1909 Tests gruen. Build green 4.4 MB. |
| PLAN-30 | Plan | FEAT-29-06 Sandbox-JS first-class (run_skill_script, code_modules removal, 6 Tasks) | Done | Building | FEAT-29-06, EPIC-29 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-20 | Welle 4 erster Lauf. Strikt TDD (RED-GREEN-REFACTOR). 6 Tasks: A run_skill_script-Tool + Tests, B Bundle-Cache, C code_modules-Removal ManageSkillTool, D CodeModuleCompiler+DynamicToolLoader Deprecation, E builtinModes+ToolRegistry-Wiring, F verify+commit. |
| PLAN-29 | Plan | FEAT-29-03 + FEAT-29-04 Welle 3 (Discovery + Notice-Capture, 8 Tasks) | Done | Building | FEAT-29-03, FEAT-29-04, EPIC-29, ADR-124, ADR-125 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-20 | Welle 3. Bundled Plan fuer Discovery (Polling-Intervall down, workspace.layout-change-event, probe_plugin Tool) und Notice-Capture (monkey-patch window.Notice waehrend executeCommandById, sensitive-Daten-Heuristik). |
| PLAN-28 | Plan | FEAT-29-02 Plugin-Skill-Format-Migration (Generator-Refactor + Pfad-Wechsel, 7 Tasks) | Done | Building | FEAT-29-02, EPIC-29, ADR-124, FEAT-29-01 | CODE | sebastian-claude-opus-4-7 |  | 2026-05-20 | Welle 2. Plugin-Skills von .skill.md File-Format auf Folder/SKILL.md migrieren. 7 Tasks: agentFolder-Helper-Erweiterung, VaultDNAScanner Generator-Refactor (Frontmatter strikt nur name+description, Body uebernimmt entfernte Metadata-Felder), Top-5 references/commands.md eager-generate, SkillRegistry Prompt-Hint umstellen, EnablePluginTool NEXT-STEP-hint, SkillsTab/BackupTab Wiring, Tests + Idempotenz-Check. Welle-1-abhaengig: Pre-Welle-1-User behalten Legacy-Layout. |
| ADR-12 | ADR | Context Condensing Strategy (Keep-First-Last) + Microcompaction & Rolling-Summary (Amendment 2026-05-12) | Accepted | Released | FEAT-24-02, EPIC-24 | ARCH |  |  | 2026-05-12 | Amendment 2026-05-12 (EPIC-24/FEAT-24-02): Microcompaction der Tool-Results an Turn-Grenzen + Rolling-Summary alter Turn-Bloecke, additiv zur Keep-First-Last-Voll-Compaction |
| ADR-13 | ADR | 3-Tier Memory Architecture (Chat -> Session -> Long-Term) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-14 | ADR | VaultDNA — Automatische Plugin-Erkennung als Skills | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-15 | ADR | Hybrid Search mit Semantic + BM25 + RRF Fusion | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-16 | ADR | Rich Tool Descriptions in ToolMeta | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-17 | ADR | Procedural Skill Recipes | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-18 | ADR | Episodic Task Memory | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-19 | ADR | Electron safeStorage fuer API-Key-Verschluesselung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-20 | ADR | Global Storage Architecture mit Sync Bridge | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-21 | ADR | OS-Level Sandbox via child_process.fork() | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-22 | ADR | Chat-Linking via Pipeline Post-Write Hook | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-23 | ADR | Document Parser als wiederverwendbare Tools | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-24 | ADR | Parsing-Library-Auswahl fuer Office-Formate | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-25 | ADR | On-Demand Bild-Nachlade-Strategie | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-26 | ADR | Post-Processing Hook fuer Task Extraction | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-27 | ADR | Task-Note Frontmatter Schema | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-28 | ADR | Base-Erstellung und optionale Plugin-Integration fuer Task Extraction | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-29 | ADR | Input-Schema-Design fuer Office-Creation-Tools | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-30 | ADR | Library-Selection fuer Office-Format-Erzeugung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-31 | ADR | Binary-Write-Pattern fuer Office-Format-Dateien | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-32 | ADR | Template-basierte PPTX-Erzeugung (JSZip + OOXML) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-33 | ADR | Multimodaler Template-Analyzer (Cloud Run + BYOK) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-34 | ADR | Visual Design Language Document als Skill-Format | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-35 | ADR | Visual Intelligence -- Lokale Qualitaetskontrolle und Agent-basierte Template-An | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-36 | ADR | GitHub Copilot Streaming Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-37 | ADR | GitHub Copilot Provider Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-38 | ADR | Copilot Token Storage in Settings | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-39 | ADR | Copilot Content Normalization Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-40 | ADR | Kilo Gateway Provider Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-41 | ADR | Kilo Auth and Session Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-42 | ADR | Kilo Metadata Discovery Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-43 | ADR | Kilo Embedding Gating Strategy | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-44 | ADR | CSS-SVG Slide Engine (Ablösung PPTX Template Analyzer) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-45 | ADR | pptx-automizer Template Pipeline (Abloesung CSS-SVG Engine) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-46 | ADR | Direct Template Mode (Abloesung Composition-Abstraktion) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-47 | ADR | Schema-Constrained Slide Generation | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-48 | ADR | plan_presentation Pipeline -- Content-Transformation auf Tool-Ebene | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-49 | ADR | Raw XML Clear + Generate (Abloesung modifyElement fuer Content) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-50 | ADR | SQLite Knowledge DB (sql.js WASM) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-51 | ADR | 4-Stufen Retrieval-Pipeline | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-52 | ADR | Local Reranker Integration | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-53 | ADR | MCP Server Prozess-Architektur | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-54 | ADR | MCP Tool-Mapping & System-Prompt-Uebertragung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-55 | ADR | Remote MCP Relay via Cloudflare Workers + Durable Objects | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-56 | ADR | Static Site Generator fuer Website-Dokumentation | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-57 | ADR | Informationsarchitektur & Seitenstruktur | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-58 | ADR | Semantic Recipe Promotion (Intent-basiert statt Sequenz-basiert) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-59 | ADR | Memory Decay Prevention (Aktive Qualitaetssicherung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-60 | ADR | Session-Summary Zuverlaessigkeit und Observability | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-61 | ADR | Fast Path Execution -- Recipe-gesteuertes Batching | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-62 | ADR | KV-Cache-Optimized Prompt Structure & Provider-Agnostic Caching + Cache-Praefix-Stabilisierung (Amendment 2026-05-12) | Accepted | Released | FEAT-24-01, EPIC-24, ADR-111 | ARCH |  |  | 2026-05-12 | Amendment 2026-05-12 (EPIC-24/FEAT-24-01): Provider-seitiger Split am "CACHE BREAKPOINT", DateTime tagesgranular, tools-Feld-Marker, rollende History-Marker -- die Section-Reihenfolge allein reichte nicht (5-Provider-Messlauf) |
| ADR-63 | ADR | Context Externalization -- Dateisystem als erweiterter Kontext + Externalizer im Hauptloop/Re-Read-Cap (Amendment 2026-05-12) | Accepted | Released | FEAT-24-03, FIX-24-03-01, EPIC-24 | ARCH |  |  | 2026-05-12 | Amendment 2026-05-12 (EPIC-24/FEAT-24-03): Externalizer auch im allgemeinen Hauptloop, Re-Read-Cap externalisierter tmp-Dateien, grosse Paste-/@-Mention-User-Messages kappen; superseded FIX-18-02-01 |
| ADR-64 | ADR | Google Gemini als eigenstaendiger Provider | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-65 | ADR | Ontologie-Schema und Befuellung | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-66 | ADR | Ingest-Strategie (Schema-Erkennung und Entitaets-Zuordnung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-67 | ADR | Lint-Architektur (Tool, UI und Trigger) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-68 | ADR | OCR-Provider-Auswahl | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-69 | ADR | Confidence Storage Model | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-70 | ADR | Community Detection Library Selection | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-71 | ADR | Retrieval Integration Pattern | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-72 | ADR | Konfigurierbarer Agent-Storage-Root | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-73 | ADR | MCP-Tool-Argument Type-Safety | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-74 | ADR | Dependency-Override-Strategie fuer transitive Vulnerabilities | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-75 | ADR | Skill-Package-Architektur (Anthropic-kompatibel + Coordinator-Erweiterung) | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-76 | ADR | - Episode-Fact-Boundary | Accepted | Released | ADR-13, ADR-18, ADR-58, PLAN-01 | ARCH |  |  |  |  |
| ADR-77 | ADR | - Memory v2 Storage Schema | Accepted | Released | ADR-13, ADR-76, ADR-78, ADR-79 | ARCH |  |  |  |  |
| ADR-78 | ADR | - URI-Schema fuer Memory-Knoten | Accepted | Released | ADR-77, ADR-79, PLAN-01 | ARCH |  |  |  |  |
| ADR-79 | ADR | - Knowledge-DB-Haertung | Accepted | Released | ADR-77, ADR-78, PLAN-01 | ARCH |  |  |  |  |
| ADR-80 | ADR | - Persistenz-Service-Pattern fuer Memory-v2-Setup-Klassen | Accepted | Released | ADR-77, ADR-79, FEAT-03-19, PLAN-01 | ARCH |  |  |  |  |
| ADR-81 | ADR | - MCP-Tool-Routing + Plugin-Standalone-RPC | Accepted | Released | ADR-80, FEAT-14-04, FEAT-03-19 | ARCH |  |  |  |  |
| ADR-82 | ADR | - Topic-Inference-Strategie | Accepted | Released | ADR-77, FEAT-03-17, FEAT-03-18 | ARCH |  |  |  |  |
| ADR-83 | ADR | - Single-Call Tool-Calling Output-Schema | Accepted | Released | ADR-76, ADR-77, FEAT-03-18, FEAT-03-24 | ARCH |  |  |  |  |
| ADR-84 | ADR | - Engine-Public-API-Versionierung | Accepted | Released | FEAT-03-21, ADR-77, ADR-80 | ARCH |  |  |  |  |
| ADR-85 | ADR | - Soft-Delete-Cascade | Accepted | Released | FEAT-03-22, ADR-77, ADR-79 | ARCH |  |  |  |  |
| ADR-86 | ADR | - Inference-Pass-Architektur | Accepted | Released | FEAT-03-24, ADR-77, ADR-83 | ARCH |  |  |  |  |
| ADR-87 | ADR | - Vault-Note-Memory-Source-Pipeline | Accepted | Released | FEAT-03-25, ADR-77, ADR-78, ADR-85 | ARCH |  |  |  |  |
| ADR-88 | ADR | ChatGPT OAuth Provider Architecture | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-89 | ADR | ChatGPT PKCE Loopback OAuth Flow | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-90 | ADR | Cost-Aware Agent Heuristics | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-91 | ADR | MCP Pipeline Routing and IgnoreService at Index Build | Accepted | Released |  | ARCH |  |  |  |  |
| ADR-92 | ADR | Schema-Migration knowledge.db v9 -> v10 (4-Tabellen-Bundle) | Accepted | Released | FEAT-15-09, FEAT-15-10, FEAT-15-11, FEAT-15-12 | ARCH |  |  |  |  |
| ADR-93 | ADR | Source-Identitaet-Modell (Domain-only fuer MVP) | Accepted | Released | FEAT-15-11, FEAT-19-14, FEAT-19-17 | ARCH |  |  |  |  |
| ADR-94 | ADR | Cluster-Halbwertszeit-Modell (statische Defaults editierbar) | Accepted | Released | FEAT-15-12, FEAT-19-16 | ARCH |  |  |  |  |
| ADR-95 | ADR | Frontmatter-Write Conflict-Detection | Accepted | Released | FEAT-19-09, FEAT-19-10 | ARCH |  |  |  |  |
| ADR-96 | ADR | MOC-Marker-Konvention (HTML-Comment-Marker) | Accepted | Released | FEAT-19-11, FEAT-19-26 | ARCH |  |  |  |  |
| ADR-97 | ADR | KV-Cache-Block-Lifecycle fuer Top-Hub-Block | Accepted | Released | FEAT-03-26, ADR-62 | ARCH |  |  |  |  |
| ADR-98 | ADR | Pre-Triage-Tool-Architektur (eigenes ingest_triage-Tool) | Accepted | Released | FEAT-19-12, ADR-66 | ARCH |  |  |  |  |
| ADR-99 | ADR | Tension-Detection-Algorithmus (Hybrid Cosine plus LLM) | Accepted | Released | FEAT-19-13 | ARCH |  |  |  |  |
| PLAN-01 | Plan | - Memory v2 Master Plan (Pfad alpha) | Draft | Building | ADR-76, ADR-77, ADR-78, ADR-79 | ARCH |  |  |  |  |
| PLAN-04 | Plan | - Memory v2 Phase 1 Engine Foundation | Draft | Building | FEAT-03-15, ADR-76, ADR-77, ADR-80 | ARCH |  |  |  |  |
| PLAN-05 | Plan | - Memory v2 Phase 2 Migration + Vault-RRF | Draft | Building | FEAT-03-16, ADR-77, ADR-78, ADR-80 | ARCH |  |  |  |  |
| PLAN-06 | Plan | - Memory v2 Phase 3 Dynamic Context Composition | Draft | Building | FEAT-03-17, ADR-77, ADR-78, ADR-80 | ARCH |  |  |  |  |
| PLAN-07 | Plan | - Memory v2 Phase 4 Single-Call Update | Draft | Building | FEAT-03-18, ADR-76, ADR-77, ADR-83 | ARCH |  |  |  |  |
| PLAN-08 | Plan | - Memory v2 Phase 4.5 Agent-Self Layer | Draft | Building | FEAT-03-19, ADR-77, ADR-85 | ARCH |  |  |  |  |
| PLAN-09 | Plan | - ChatGPT OAuth Provider (EPIC-21) | Draft | Building | FEAT-21-01, FEAT-21-02, FEAT-21-03, ADR-88, ADR-89 | ARCH |  |  |  |  |
| PLAN-10 | Plan | BA-25 Phase 1 Foundation | Draft | Building | FEAT-15-09, FEAT-15-10, FEAT-15-11, FEAT-15-12 | ARCH |  |  |  |  |
| PLAN-11 | Plan | BA-25 Phase 2 Lint-Foundation | Draft | Building | FEAT-19-16, FEAT-19-17, FEAT-19-18, ADR-94 | ARCH |  |  |  |  |
| PLAN-12 | Plan | BA-25 Phase 3 Ingest-Foundation | Draft | Building | FEAT-19-12, FEAT-19-22, FEAT-19-24, FEAT-19-25 | ARCH |  |  |  |  |
| PLAN-13 | Plan | BA-25 Phase 4 Power-User-Erweiterungen | Draft | Building | FEAT-19-10, FEAT-19-11, FEAT-19-13, FEAT-19-14 | ARCH |  |  |  |  |
| PLAN-14 | Plan | BA-25 Phase 5 Erweiterte Schichten | Draft | Building | FEAT-19-11, FEAT-19-15, FEAT-19-20, FEAT-03-26 | ARCH |  |  |  |  |
| PLAN-15 | Plan | FIX-19-28-01 Source-Position-Marker im Ingest-Output | Done | Released | FIX-19-28-01, FEAT-19-28, FEAT-19-29, ADR-103 | ARCH |  |  | 2026-05-07 | Issue#11 Implemented |
| PLAN-16 | Plan | IMP-18-01-01 Prompt Cache Settings UI | Done | Released | IMP-18-01-01, FEAT-18-01, ADR-62, ADR-111 | ARCH |  |  | 2026-05-10 | Implemented 2026-05-10. 33 Tests, 1341 total green |
| PLAN-17 | Plan | FIX-19-28-05 Attachment-Lifecycle im Sidebar | Done | Released | FIX-19-28-05, FEAT-19-28, FEAT-19-31, ADR-112, EPIC-19 | ARCH |  |  | 2026-05-10 | Implemented 2026-05-10. 5 neue Tests, 1346 total green, build + deploy ok |
| PLAN-18 | Plan | EPIC-24 Welle 1: Cache-Praefix-Stabilisierung, Microcompaction, Tool-Output-Disziplin, Bedrock cachePoint | Done | Released | EPIC-24, FEAT-24-01, FEAT-24-02, FEAT-24-03, FIX-24-01-01, FIX-24-03-01, FIX-24-03-02, IMP-24-05-01, IMP-18-01-02, ADR-62, ADR-63, ADR-12, ADR-111 | ARCH |  |  | 2026-05-12 | P0 Welle 1 von EPIC-24; 5 Tasks (IMP-24-05-01 Diagnose-Commit, FEAT-24-02 Microcompaction, FEAT-24-03 Externalizer-im-Hauptloop, FEAT-24-01 Cache-Split, IMP-18-01-02 Bedrock cachePoint). Coverage-Gate vor Status=Active. |
| PLAN-19 | Plan | FEAT-24-05 Sidebar-Kosten-/Cache-Hit-Anzeige | Done | Released | FEAT-24-05, EPIC-24 | ARCH |  |  | 2026-05-13 | Implemented 2026-05-13. cacheHitRate + formatTelemetryFooter erweitert, TaskMonitor warn-class, costWarnThresholdEur-Setting, .agent-cost-warn CSS. 1411 Tests gruen. |
| PLAN-20 | Plan | FEAT-24-09 Active Skills model-driven on-demand (read_skill tool, stable SKILLS directory) | Done | Released | FEAT-24-09, EPIC-24, ADR-116, ADR-62, ADR-12, ADR-09, ADR-08 | ARCH |  |  | 2026-05-13 | Implemented 2026-05-13. Klassifikator-Pfad in AgentSidebarView raus; neues NICHT-deferred read_skill-Tool (Gruppe `read`) laedt SKILL.md-Body als Tool-Result; vereinigtes Skill-Verzeichnis (self-authored mit Inventory + User-Skills) als letzte stabile Section vor CACHE_BREAKPOINT_MARKER (ersetzt Section 10 ACTIVE SKILLS + Section 13 SELF-AUTHORED SKILLS); pluginSkillsSection (VaultDNA Section 9) unangetastet; activeSkillNames Power-Steering entfernt. ADR-116 Amendment 2026-05-13 (drei Implementierungs-Entscheidungen). /testing 2026-05-13: 1424 Tests gruen (+13 vs. 1411 dev-Baseline: 6 ReadSkillTool, 4 skillDirectory, 1 systemPrompt-Cache-Praefix, 2 SC-5-Assertion read_skill NOT deferred + group=read). lint 0 errors, tsc clean. Live-Messlauf-SC (1, 3, 4) bleibt offen fuer manuelle Abnahme. |
| PLAN-21 | Plan | FEAT-24-06 MCP-Listing-Cap + read_mcp_tool + Built-in deferred-Review | Done | Released | FEAT-24-06, EPIC-24, ADR-118, ADR-117 (superseded), ADR-08, ADR-53, ADR-62, ADR-116 | ARCH |  |  | 2026-05-13 | Implemented 2026-05-13. Coverage Gate erfuellt: SC-1..5 mapped (SC-6 Live-Messlauf bleibt manuell). Befund waehrend Implementation: `manage_mcp_server` war schon in `DEFERRED_TOOL_NAMES`; `inspect_self`/`update_settings` hatten keine `TOOL_METADATA`-Eintraege und wurden ergaenzt + deferred. 1439 Tests gruen (+15 vs dev-Baseline 1424). |
| PLAN-22 | Plan | FEAT-24-04 Subagent-Delegation (Profile + Per-Call-Token-Budget) | Done | Released | FEAT-24-04, EPIC-24, ADR-113, ADR-90, ADR-01, ADR-12, ADR-62, ADR-63 | ARCH |  |  | 2026-05-13 | Implemented 2026-05-13. Additiver Pivot zu ADR-90: Profile-Spawn ohne Tier-4-Justification, non-profile-Pfad unveraendert. Per-Call-Token-Budget Default 8000 (Setting subtaskTokenBudget). Coverage Gate erfuellt: SC-1..SC-5 mapped (SC-6 Live-Messlauf bleibt manuell). 1460 Tests gruen (+21 vs dev). |
| PLAN-23 | Plan | FEAT-24-07 Internes Hilfs-Modell-Routing (helperModelKey + getHelperApi + 4 Call-Sites) | Done | Released | FEAT-24-07, EPIC-24, ADR-115, ADR-11, ADR-12, ADR-17, ADR-61 | ARCH |  |  | 2026-05-13 | Implemented 2026-05-13. Coverage Gate erfuellt: SC-1..SC-7 mapped (SC-8 Live-Messlauf manuell). Befund waehrend Implementation: FastPathExecutor-Konstruktor wurde NICHT erweitert (Plugin via neuem `ToolExecutionPipeline.getPlugin()`-accessor on-demand statt Konstruktor-Param). Mock-isolation via vi.mock fuer buildApiHandlerForModel. 1464 Tests gruen (+4 vs dev). |

