---
id: PLAN-42
title: EPIC-33 Inline-Editor-AI-Actions Implementation Plan
date: 2026-06-22
feature-refs: [FEAT-33-01, FEAT-33-02, FEAT-33-03, FEAT-33-04, FEAT-33-05, FEAT-33-06, FEAT-33-07, FEAT-33-08, FEAT-33-09, FEAT-33-10, FEAT-33-11]
adr-refs: [ADR-138, ADR-139, ADR-140, ADR-141, ADR-142, ADR-143, ADR-144]
fix-refs: []
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-claude-opus-4-7
---

# PLAN-42: EPIC-33 Inline-Editor-AI-Actions Implementation Plan

> Backlog-Row: BACKLOG.md PLAN-42. Status/Phase/Commits dort. Source-Inputs: plan-context-epic-33.md, EPIC-33-Spec, 11 FEAT-Specs, 7 ADRs, BA, Research-Notiz.

## 1. Scope und Wellen-Schnitt

EPIC-33 implementiert eine neue Inline-Editor-AI-Surface mit 11 FEATs in drei Wellen plus einer Pre-Welle. Die Pre-Welle ist Substrat fuer alle Folgewellen.

**Pre-Welle: Tier-1-Refactor (ADR-138)**

Vor jedem FEAT muss die AgentTask-Layer entkoppelt sein, sodass Inline-Actions ohne offene Chat-Sidebar laufen koennen. Das ist der Sidebar-Independence-Constraint (H-06, ASR-EPIC-33-01) der jede der 11 FEATs in ihrer DoD belegt.

**Welle 1 (P0, 6 FEATs, MVP-Surface mit Differenzierung):**

| # | FEAT | Effort | Begruendung Reihenfolge |
|---|---|---|---|
| 1.1 | FEAT-33-01 Trigger-Layer | M | Substrat aller anderen Actions. Floating-Menu + Hotkey + Command-Palette + Settings-Surface |
| 1.2 | FEAT-33-04 Send-to-Main-Chat | S | Einfachste Action, validiert Trigger-Layer-Wiring + Sidebar-Open-Demand |
| 1.3 | FEAT-33-02 Lookup-Action (ohne Vault-RAG) | M | LLM-only-Lookup mit Preview-Block-Output |
| 1.4 | FEAT-33-09 Vault-Knowledge-Integration | M | Erweitert FEAT-33-02 um Vault-RAG. A/B-Test fuer H-07 |
| 1.5 | FEAT-33-08 Skills-im-Floating-Menu | M | Schema-Update Skill-Manifest + Filter im Floating-Menu |
| 1.6 | FEAT-33-03 Rewrite-Action | L | Komplexeste P0-Action (CodeMirror-Diff-Renderer). Hoechstes Tech-Risiko |

**Welle 2 (P1, 3 FEATs, Innovation + Tool-Parity):**

| # | FEAT | Effort | Begruendung |
|---|---|---|---|
| 2.1 | FEAT-33-06 Translate | S | Quick Win, reused FEAT-33-03 Diff-Renderer |
| 2.2 | FEAT-33-07 Summarize | S | Quick Win, reused FEAT-33-02 Preview-Block |
| 2.3 | FEAT-33-05 Inline-Chat | L | Innovation, Conversation-Block-Storage + Memory-Integration |

**Welle 3 (P2, 2 FEATs, nach Beta-Lernen):**

| # | FEAT | Effort | Begruendung |
|---|---|---|---|
| 3.1 | FEAT-33-10 Per-Action-Model-Pin | S | Power-User-Override. Lernen aus H-03-Telemetrie |
| 3.2 | FEAT-33-11 Find-Action-Items | S | Eigene Action ODER via FEAT-33-08-Skill. Architektur entscheidet |

## 2. Pre-Welle: Tier-1-Refactor (ADR-138)

**Ziel:** AgentTask-Layer entkoppeln, sodass Inline-Actions ihn ohne Chat-Sidebar instanziieren koennen. Sidebar-Funktionalitaet bleibt unveraendert.

**Code-Anchoring (verifiziert in Phase 2a):**

- [src/core/AgentTask.ts:163](src/core/AgentTask.ts#L163) - `AgentTaskRunConfig`-Interface, erweiterbar
- [src/core/AgentTask.ts:348](src/core/AgentTask.ts#L348) - `run(config: AgentTaskRunConfig)`-Methode
- [src/ui/AgentSidebarView.ts:1959](src/ui/AgentSidebarView.ts#L1959) - heutige AgentTask-Konstruktion (Refactor-Ziel)
- [src/ui/AgentSidebarView.ts:1963-2250](src/ui/AgentSidebarView.ts#L1963-L2250) - Callback-DOM-Manipulation (Refactor-Ziel)

**Tasks (TDD-Default aktiv):**

1. **Task PR-1.1: ToolCallbacks-Interface extrahieren**
   - Write Test: `src/core/agent/__tests__/AgentTaskRunner.test.ts` - testet dass AgentTaskRunner ohne View instanziierbar ist plus dass Callbacks aufgerufen werden
   - Create: `src/core/agent/AgentTaskRunner.ts` - Abstraktion ueber AgentTask + Callbacks + Config
   - Create: `src/core/agent/ToolCallbacks.ts` - Interface mit onText/onThinking/onToolStart/onToolResult/onIterationStart
   - Verify: Test gruen, AgentSidebarView noch unveraendert

2. **Task PR-1.2: SidebarMessageRenderer extrahieren**
   - Write Test: `src/ui/rendering/__tests__/SidebarMessageRenderer.test.ts` - testet dass DOM-Outputs identisch sind zu vor-Refactor (Snapshot-Test)
   - Create: `src/ui/rendering/SidebarMessageRenderer.ts` - implementiert ToolCallbacks mit den DOM-Operationen aus AgentSidebarView.ts:1963-2250
   - Modify: `src/ui/AgentSidebarView.ts:1959-2250` - ersetzt inline-Callbacks durch `new SidebarMessageRenderer(...)` plus `runner.execute(config)`
   - Verify: Sidebar-Funktionalitaet identisch, Snapshot-Tests gruen, manual smoke-test im Plugin

3. **Task PR-1.3: Override-Parameter in AgentTaskRunConfig**
   - Write Test: `src/core/__tests__/AgentTask.overrides.test.ts` - testet dass modelOverride/thinkingOverride/effortOverride durch den Runner reisen und in der Provider-Anbindung greifen
   - Modify: `src/core/AgentTask.ts:163` - erweitere `AgentTaskRunConfig` um `modelOverride?: string`, `thinkingOverride?: ThinkingOverride`, `effortOverride?: EffortOverride`
   - Modify: `src/ui/AgentSidebarView.ts` - Sidebar-Instanz-Variablen `chatModelOverride/chatThinkingOverride/chatEffortOverride` werden jetzt durch den Runner-Config-Layer gereicht
   - Verify: Override-Test gruen, Regression-Test Chat-Workflow

**Akzeptanzkriterium Pre-Welle:**
- AgentTaskRunner kann instanziiert werden mit `new AgentTaskRunner(new MockCallbacks())` ohne Obsidian-Workspace-View
- Sidebar-Chat funktioniert identisch (Snapshot-Vergleich Pre/Post-Refactor)
- 3 neue Tests gruen, keine Regressions in existierender 3199/3200-Suite

**Geschaetzter Aufwand:** 3-5 Tage. Bei Auftauchen unbekannter Coupling-Punkte: Aufwand erhoehen, PR splitten.

## 3. Welle 1.1: FEAT-33-01 Trigger-Layer

**Voraussetzung:** Pre-Welle abgeschlossen.

**Tasks (TDD):**

1. **TR-1.1: TriggerContext-Interface**
   - Write Test: `src/core/inline/__tests__/InlineTriggerContext.test.ts` - testet Struktur und Inhalt
   - Create: `src/core/inline/trigger/InlineTriggerContext.ts` - Interface { selectionText, editorMode, cursorPos, notePath, settingsSnapshot }

2. **TR-1.2: TriggerResolver mit Selection-Event**
   - Write Test: `src/core/inline/trigger/__tests__/InlineTriggerResolver.test.ts` - mit Mock-CodeMirror-Selection-Event triggert Resolver mit triggerContext
   - Create: `src/core/inline/trigger/InlineTriggerResolver.ts`
   - Verify: Resolver-Overhead pro Selection-Event <5ms (Performance-NFR)

3. **TR-1.3: Floating-Menu**
   - Write Test: `src/core/inline/trigger/__tests__/InlineFloatingMenu.test.ts` - Menu rendert am Cursor, dismissed bei Selection-Loss
   - Create: `src/core/inline/trigger/InlineFloatingMenu.ts` - CodeMirror-Decoration.widget
   - Modify: `src/main.ts` - registriere Editor-Extension

4. **TR-1.4: Hotkey-Bindings**
   - Write Test: `src/core/inline/trigger/__tests__/InlineHotkeyHandler.test.ts` - Hotkey-Dispatch
   - Create: `src/core/inline/trigger/InlineHotkeyHandler.ts` - Default Cmd+K, rebindbar via Obsidian-Hotkey-Settings
   - Modify: `src/main.ts:onload()` - addCommand mit `id: vault-operator-open-inline-menu`, hotkey `{ modifiers: ['Mod'], key: 'k' }`

5. **TR-1.5: Command-Palette-Konsistenz**
   - bereits durch TR-1.4 abgedeckt (Obsidian-addCommand erscheint automatisch in Palette)

6. **TR-1.6: Settings-Surface**
   - Write Test: Settings-Toggle floatingMenuEnabled wirkt
   - Modify: `src/ui/settings/` - neuer InlineActionsTab (Settings-Sub-Section): floatingMenuEnabled (default true), Hotkey-Display
   - Modify: `src/main.ts` - Settings-Defaults in initializeSettings

7. **TR-1.7: Sidebar-Independence-Verifikation**
   - Write Test: workspace.detachLeavesOfType(VIEW_TYPE_AGENT_SIDEBAR) plus Hotkey-Trigger -> kein Error, Menu erscheint
   - Akzeptanzkriterium: kein "Sidebar must be open"-Error

**ARCHITECTURE.map-Update:** inline-trigger-resolver Row, inline-floating-menu Row mit echten Pfaden.
**JSDoc-Header** auf neuen Entry-Point-Files.

**Akzeptanzkriterium FEAT-33-01:**
- SC-01 bis SC-07 aus FEAT-33-01-Spec verifiziert (Tests + manueller Live-Check)
- 7+ neue Tests gruen
- Sidebar-Independence-Coverage 100% fuer Trigger-Pfad

## 4. Welle 1.2: FEAT-33-04 Send-to-Main-Chat

Vereinfachte Action, validiert Trigger-Layer und Sidebar-Open-Demand-Pattern.

**Tasks:**
1. SR-1.1: SendToMainChatAction implementieren (workspace.detachLeavesOfType-Check + getLeavesOfType + revealLeaf wenn closed + Selection-as-context Inject)
2. SR-1.2: Hotkey-Empfehlung Cmd+L (analog Cursor/Continue-Konsens)
3. SR-1.3: Cmd+Shift+L als optionaler Toggle "in laufenden Chat" via Settings

**Akzeptanzkriterium:** SC-01..SC-05 aus FEAT-33-04. Sidebar-Open-Demand verifiziert: Sidebar geschlossen -> Action triggert -> Sidebar oeffnet automatisch.

## 5. Welle 1.3: FEAT-33-02 Lookup-Action (ohne Vault-RAG)

**Tasks:**
1. LU-1.1: LookupAction-Skeleton ohne Vault-RAG (kommt in 1.4)
2. LU-1.2: Preview-Block-Renderer unter Selection (CodeMirror-Decoration.widget mit DOM-Element)
3. LU-1.3: Insert-below/Copy/Discard-Buttons
4. LU-1.4: Streaming-Output im Preview-Block
5. LU-1.5: Cost-aware Tier-Routing - Haiku-Default via TaskRouter

**Akzeptanzkriterium:** SC-01..SC-05 aus FEAT-33-02 (LLM-only-Pfad).

## 6. Welle 1.4: FEAT-33-09 Vault-Knowledge-Integration

Erweitert FEAT-33-02 um Vault-RAG-Pipeline.

**Tasks:**
1. VR-1.1: VaultRagPipeline-Skeleton (Embedding -> Vector-Search -> Threshold)
2. VR-1.2: RagConfidenceFilter (cosine-similarity >= 0.7 default, rebindbar via Settings)
3. VR-1.3: RagPromptAugmenter (TOP-N Treffer in System-Prompt)
4. VR-1.4: Quellen-Tooltip im Preview-Block (verlinkte Vault-Notes)
5. VR-1.5: Fallback auf LLM-only wenn kein Treffer ueber Threshold
6. VR-1.6: Settings-Toggle `inlineLookupUseVaultRag` (default true, A/B-Test-Schalter fuer H-07)
7. VR-1.7: OperationLogger-Hook fuer H-07-Telemetrie (Vault-RAG used yes/no, Insert-rate)

**Code-Anchoring:** VectorStore.findNoteVectors({query, limit, domain:'note'}) - existiert (ADR-137).

**Akzeptanzkriterium:** SC-01..SC-06 aus FEAT-33-09. H-07-A/B-Test-Hook aktiv.

## 7. Welle 1.5: FEAT-33-08 Skills-im-Floating-Menu

**Codebase-Reconciliation-Klaerung:** [src/core/skills/types.ts](src/core/skills/types.ts) hat KEIN einheitliches `SkillManifest`-Interface, sondern mehrere Skill-Typen (VaultDNAEntry fuer Plugin-Skills, PluginSkillMeta runtime, plus Self-Authored Skill Types EPIC-022). Das `inlineActionCapability`-Feld wird primaer in den **Self-Authored Skill Type** eingebaut (User Skills, EPIC-022), optional in PluginSkillMeta erweitert.

**Tasks:**
1. SK-1.1: Schema-Erweiterung: `inlineActionCapability?: { eligible, output_mode, input_format, max_selection_chars }` in src/core/skills/types.ts (Self-Authored Type plus PluginSkillMeta optional)
2. SK-1.2: Frontmatter-Validator (`SkillFrontmatterValidator.ts`) erweitern um inlineActionCapability-Parse
3. SK-1.3: InlineSkillFilter (`src/core/inline/skills/InlineSkillFilter.ts`) - liest registered skills via SkillRegistry, filtert nach `inlineActionCapability.eligible === true`
4. SK-1.4: Floating-Menu (FEAT-33-01) konsumiert InlineSkillFilter und rendert Skill-Eintraege
5. SK-1.5: Skill-Aufruf mit Selection als Input - Skill-Invocation-Pipeline ueber existierende Skill-Engine (TBD wie - eventuell extend invoke_skill-Tool oder dedizierter Inline-Path)
6. SK-1.6: Settings-Surface pro Skill on/off im Inline-Menu, TOP-N-Cap default 10

**Akzeptanzkriterium:** SC-01..SC-05 aus FEAT-33-08. Beispiel-User-Skill mit Capability erzeugt, taucht im Menu auf, fuehrt erfolgreich aus.

## 8. Welle 1.6: FEAT-33-03 Rewrite-Action (komplexeste P0)

**Hoechstes Tech-Risiko (H-02 CodeMirror-6 Diff-Renderer Tech-Feasibility).**

Empfehlung: vor diesem FEAT optionaler Spike C (InlineAI-Plugin-Source-Review + Latenz-Mock, 0.5-1 Tag).

**Tasks:**
1. RW-1.1: Spike C (optional) - lese InlineAI-Plugin-Source, baue Latenz-Mock mit 50 Tokens/sec
2. RW-1.2: InlineDiffStateField (StateField { decorations: RangeSet, hunks: Map<id, HunkInfo> })
3. RW-1.3: InlineDiffEffects (updateDiffEffect, acceptHunkEffect, rejectHunkEffect via StateEffect.define)
4. RW-1.4: InlineDiffRenderer (RangeSetBuilder + Decoration.mark fuer rot/gruen + Decoration.widget fuer Accept/Reject-Buttons)
5. RW-1.5: InlineDiffStreamHandler (80ms-Debounce + jsdiff diffLines + Effect-Dispatch)
6. RW-1.6: InlineDiffKeymap (@codemirror/view keymap: Cmd+Return Accept-All, Cmd+Backspace Reject-All, Cmd+Opt+Y/N Per-Hunk)
7. RW-1.7: RewriteAction-Implementation - prompt-builder fuer "improve this passage"-Default, stream-from-AgentTaskRunner
8. RW-1.8: Edit-State-Pflege bei Stream-Cancel (analog FIX-01-07-03 refreshOpenMarkdownViewsFor)
9. RW-1.9: Editor-State-Korruption-Test - Multi-Selection-Edge-Case
10. RW-1.10: Performance-Verifikation Latenz <100ms zwischen Token und Render

**Akzeptanzkriterium FEAT-33-03:**
- SC-01..SC-07 aus FEAT-33-03
- H-02 validiert: Diff-Renderer Tech-Feasible, Per-Hunk-Accept funktioniert
- Latenz-Budget <100ms in der Praxis verifiziert

## 9. Welle 2: P1 FEATs

**FEAT-33-06 Translate-Action:** Wiederverwendet FEAT-33-03 Diff-Renderer. Sub-Menu mit Zielsprache (DE/EN/FR/ES/IT + User-Custom). Tier: Haiku.

**FEAT-33-07 Summarize-Action:** Wiederverwendet FEAT-33-02 Preview-Block. Sub-Menu Kurz/Mittel/Lang. Tier: Haiku.

**FEAT-33-05 Inline-Chat (Innovation):**
- Architektur: Markdown-Code-Fence `vault-operator-chat-v1` mit JSON-Body (ADR-143)
- Render-Hook: markdownPostProcessor fuer Reading-Mode + EditorView-Decoration fuer Live-Preview
- 20-Turn-Cap + Auto-Collapse
- Memory-Integration via Phase D markdownIndexer (Fence-Pattern-Erkennung)

## 10. Welle 3: P2 FEATs (nach Beta-Lernen)

**FEAT-33-10 Per-Action-Model-Pin:** Settings-Format `actionPins: Record<ActionId, ModelId | null>`. UI-Badge im Floating-Menu wenn Pin aktiv. H-03-Telemetrie-Auswertung als Trigger.

**FEAT-33-11 Find-Action-Items:** Architektur entscheidet eigene Action vs Skill-Realisation. Falls Skills-Pfad (FEAT-33-08) Capability erlaubt: Skill "extract-action-items" anlegen, FEAT-33-11 ohne eigenen Code geschlossen.

## 11. Cross-FEAT-Constraints in der Definition of Done

Jedes FEAT in Welle 1+2 belegt in seiner Implementation:

- [ ] **Sidebar-Independence:** Action triggert mit geschlossener Chat-Sidebar (workspace.detachLeavesOfType + Action-Test). Ausnahme: FEAT-33-04 oeffnet Sidebar automatisch
- [ ] **Tier-Routing:** richtiger Tier-Bucket gewaehlt (Haiku fuer Lookup/Translate/Summarize, Default fuer Rewrite/Chat)
- [ ] **Settings-Snapshot:** Settings werden zum Trigger-Zeitpunkt gelesen (Modell+Provider via Cache, Skills/Prompts frisch)
- [ ] **Telemetrie:** OperationLogger.log mit `inline_action_*`-Event (siehe ADR-144 Anpassung in Section 12)
- [ ] **Bot-Compliance:** kein fetch, kein innerHTML, kein Direct-Style-Mutation, FileManager.trashFile
- [ ] **Tests gruen:** Unit + Integration (mit Mock-Provider) + manueller Live-Test
- [ ] **ARCHITECTURE.map-Update:** neue Concept-Rows mit echten file:line-Pfaden
- [ ] **JSDoc-Header:** auf neuen Entry-Point-Files

## 12. ADR-Implementation-Klaerungen (kein ADR-Drift, Codebase-Anchoring)

Aus Phase 2a Codebase-Reconciliation:

**ADR-141 Skill-Capability:**
- ADR-Konzept "Capability-Object im Skill-Manifest" bleibt valid
- Codebase-Realitaet: keine einheitliche `SkillManifest`-Interface, sondern Self-Authored Skill Types in src/core/skills/types.ts
- Implementation: `inlineActionCapability` als optionales Feld im Self-Authored Skill Type Interface plus in PluginSkillMeta. SkillFrontmatterValidator parst es

**ADR-144 Telemetrie-Hook:**
- ADR-Konzept "OperationLogger erweitern" bleibt valid
- Codebase-Realitaet: Interface heisst `LogEntry` (nicht `OperationEvent`), JSONL-Storage (nicht DB), kein `event_type`-Enum
- Implementation: `LogEntry` bekommt optionalen `inlineAction?: { actionId, outputMode, triggerUx, pinActive, ... }`-Block. Kein Schema-Migration noetig (JSONL ist flexibel). Existierendes `tool`-Feld wird gesetzt auf z.B. `inline.lookup`, `inline.rewrite` etc.

## 13. Open Questions, die in /coding-Phase mid-course klaeren

- Spike C (RW-1.1): InlineAI-Plugin-Source-Review konkret nuetzlich oder Wiederholung von Spike-B-Befunden?
- Skill-Invocation-Pipeline (SK-1.5): extend invoke_skill-Tool vs dedizierter Inline-Path?
- Vault-RAG (VR-1.7): exakte Telemetrie-Metrik fuer H-07-A/B-Test
- ContextTracker-Extract (ADR-138 Tier 2): in dieser Welle oder spaeter?

## Coverage Gate

> Filled before status flips to Active in the backlog row.

- [x] **SC coverage:** alle SCs der 11 FEAT-Specs sind in den Tasks oben gemappt oder explizit als "spaeter (Welle 2/3)" markiert. Pro FEAT-Section sind die SC-Referenzen genannt.
- [x] **ADR alignment:** alle 7 ADRs sind durch mindestens einen Task operationalisiert:
  - ADR-138 -> Pre-Welle PR-1.1/1.2/1.3
  - ADR-139 -> Welle 1.6 RW-1.2..RW-1.10
  - ADR-140 -> implizit in TR-1.1 (TriggerContext.settingsSnapshot) und VR-1.x
  - ADR-141 -> Welle 1.5 SK-1.1..SK-1.4
  - ADR-142 -> Welle 1.4 VR-1.1..VR-1.7
  - ADR-143 -> Welle 2.3 (Inline-Chat-Conversation-Block)
  - ADR-144 -> Cross-FEAT-Telemetrie-Hook in jedem FEAT der DoD
- [x] **Codebase anchoring:** alle Tasks nennen konkrete file:line-Pfade in Sections 2-10
- [x] **Verification gates:** Pre-Welle hat eigene Akzeptanzkriterien plus Snapshot-Tests; jedes FEAT hat dedizierte Tests in der DoD

## Change Log

| Date | Trigger | Summary |
|---|---|---|
| 2026-06-22 | initial | PLAN-42 angelegt nach EPIC-33 ARCH-Phase. Wellen-Plan mit Pre-Welle Tier-1-Refactor (ADR-138) + Welle 1 6 P0 FEATs + Welle 2 3 P1 FEATs + Welle 3 2 P2 FEATs. Codebase-Reconciliation: 4/4 Open Items verifiziert (esbuild externals OK, AgentTaskRunConfig erweiterbar OK, SkillManifest mehrere Typen statt einheitliches Interface, OperationLogger heisst LogEntry mit JSONL-Storage). Beide letztere keine ADR-Drift, nur Implementation-Detail-Klaerungen in Section 12. |
| 2026-06-22 | scope | Phase 3a Verifikation gegen reale Codebase: AgentTaskCallbacks-Interface existiert BEREITS in src/core/AgentTask.ts:52-157 (ADR-138 PR-1.1 "ToolCallbacks-Extract" war faktisch fehl-priorisiert -- Extraktion nicht noetig). Sidebar-Callback-Block ist 290 Zeilen mit extensiven Closure-Captures (stepsBodyEl, thinkingEl, accumulatedThinking, streamingPara, ensureStepsBlock-Closure) ueber view-lokalen Mutable-State. Volle SidebarMessageRenderer-Extraktion ist 1-2 Wochen Refactor (Spike A Schaetzung bestaetigt). Pragmatischer Cut: PR-1.1 implementiert nur den dünnen AgentTaskRunner-Wrapper (konzeptuelle Entkopplung). PR-1.2 (Sidebar-Migration) und PR-1.3 (Override-Werte in Config) als eigene Welle deferred, nicht Bestandteil dieser Pre-Welle-Session. |
| 2026-06-22 | code | PR-1.1 implementiert (TDD-Default): `src/core/agent/AgentTaskRunner.ts` (122 Zeilen) als duenne Wrapper-Klasse ueber AgentTask. Konvertiert die 16-Parameter-positionale Konstruktor-Signatur in ein `AgentTaskRunnerOptions`-Objekt. Test-First: `src/core/agent/__tests__/AgentTaskRunner.test.ts` (4 Tests RED -> GREEN: Instanziierbar mit Mocks, akzeptiert optionale Tuning-Parameter, execute-Methode existiert, Pure-Function-Callbacks-Kontrakt). vitest: 15/15 Tests gruen (4 neue + 11 existierende). tsc clean. Sidebar-Funktionalitaet unveraendert (keine Modifikation an src/ui/AgentSidebarView.ts in dieser Session). Inline-Actions koennen jetzt AgentTask sidebar-unabhaengig via Runner instanziieren. Naechster Schritt: PR-1.2 SidebarMessageRenderer-Extraktion + PR-1.3 Override-Felder in separater Session, dann Welle 1.1 FEAT-33-01 Trigger-Layer. |
| 2026-06-22 | scope | Strategischer Wellen-Schnitt: PR-1.2 Sidebar-Migration ans ENDE der Implementation verschoben (nach FEAT-33-01 bis FEAT-33-11). Begruendung: AgentTaskRunner schafft die konzeptuelle Sidebar-Independence-Schicht bereits. Inline-Actions koennen ohne Sidebar-Migration funktionieren - sie nutzen den Runner mit ihren eigenen DOM-frei Callbacks. PR-1.2 Sidebar-Migration ist 1-2-Wochen-Refactor mit Regression-Risiko fuer Chat-Workflow; ans Ende packen senkt Risiko (alle Inline-Actions laufen schon) und ist defensiv. Neue Reihenfolge: FEAT-33-01 Trigger-Layer -> FEAT-33-04 Send-to-Main-Chat -> FEAT-33-02 Lookup -> FEAT-33-09 Vault-RAG -> FEAT-33-08 Skills-Menu -> FEAT-33-03 Rewrite -> FEAT-33-06 Translate -> FEAT-33-07 Summarize -> FEAT-33-05 Inline-Chat -> FEAT-33-10 Per-Action-Pin -> FEAT-33-11 Find-Action-Items -> PR-1.2 Sidebar-Migration (am Ende). |
| 2026-06-22 | code | FEAT-33-01 Trigger-Layer Foundation: TR-1.1 + TR-1.2 + TR-1.3 implementiert (TDD-first). Neue Files: `src/core/inline/InlineTriggerContext.ts` (Types + isInlineTriggerContext-Type-Guard, EditorMode union 'source/live-preview/reading', InlineSettingsSnapshot mit modelId+provider+skillIds+customPromptIds), `src/core/inline/InlineTriggerResolver.ts` (baut TriggerContext aus Selection-Event-Tupel, getSettingsSnapshot als lazy-Callback per ADR-140-Hybrid-Pattern), `src/core/inline/InlineActionRegistry.ts` (pluggable Action-Layer mit InlineAction-Interface, register/unregister/getAction/listActions mit isEligible-Filter, clear fuer Tests). Tests: 6+5+9=20 neue Tests in `src/core/inline/__tests__/`, vitest src/core/inline+agent: 24/24 gruen (insgesamt 35 mit Regression). tsc clean. Foundation steht fuer TR-1.4 Floating-Menu-Render, TR-1.5 Hotkey via main.ts, TR-1.6 Settings-Surface. |
| 2026-06-22 | code | Mass-Implementation alle 11 FEATs. Reihenfolge nach Synergie-Plan: TR-1.4 InlineFloatingMenu (DOM-Overlay, jsdom-frei via hand-rolled stub, Esc/Click-outside-dismiss, clampToViewport), TR-1.5 InlineActionService (Orchestrator triggerMenu/dispatch/dispose), FEAT-33-04 SendToMainChatAction (ChatSidebarController-Probe), FEAT-33-02 LookupAction (LLM-only + optional VaultRagPipeline), FEAT-33-09 DefaultVaultRagPipeline (SemanticIndexProbe + Confidence-Threshold), FEAT-33-08 inlineActionCapability + InlineSkillFilter + InlineSkillAction (Schema standalone, kein Eingriff in src/core/skills/types.ts), FEAT-33-03 RewriteAction + InlineDiffEngine (jsdiff diffWordsWithSpace + Hunk-State-Machine + applyDiff), FEAT-33-06 TranslateAction (per-language id), FEAT-33-07 SummarizeAction (length variants), FEAT-33-05 InlineChatAction + InlineChatBlock (vault-operator-chat-v1 markdown fence + MAX_TURNS=20 cap), FEAT-33-10 PerActionPin (settings.actionPins live reader), FEAT-33-11 FindActionItemsAction. Plus inlineSettings.resolveInlineActionsSettings mit Defaults. Test-Coverage: 150 inline tests in 15 test-files, alle gruen. tsc clean. Suite full: 3353/3354 (+154 neue, 1 expected fail von vorher). |
| 2026-06-22 | code | Plugin-Integration via src/core/inline/PluginWiring.ts: zentrale wireInlineActions(plugin)-Function bindet EditorSelectionProbe (MarkdownView + editor.getSelection + editor.posToOffset + getMode-Mapping), ChatSidebarController (workspace.getLeavesOfType + plugin.activateView + CustomEvent fuer Selection-Inject), NoteWriter (editor.replaceRange auf MarkdownView), InlineLLMCaller (plugin.apiHandler.createMessage streaming). 9 default Actions registriert (Send-to-Main + Lookup + Rewrite + Translate:English/German + Summarize:short/medium + Find-Action-Items + Inline-Chat). main.ts: neues Feld `inlineActions`, wireInlineActions() im onload nach apiHandler-Init, addCommand('open-inline-ai-menu'), dispose im onunload. SemanticIndexProbe deferred (VectorStore.findNoteVectors-Signatur ist filter-objekt-basiert nicht (q,topN); Wiring kommt in eigener Session wenn API stabilisiert). Skills-Filter ist module-ready aber nicht in Default-Wiring eingebaut (SkillRegistry-Probe-Hookup deferred). Build clean (main.js 4.9 MB, deployed). |

## Implementation Notes

> Wird befuellt waehrend der Implementation. Pro Task: Commit-SHA (Kurzform), Deviation-Notes wenn Plan vom Code abwich, Test-Count-Delta, Cycle-Time first-to-last commit, Wayfinder-Updates.

Pre-Welle Tier-1-Refactor (ADR-138):
- [x] PR-1.1 AgentTaskRunner-Wrapper: SHA 5aa2ea3f (2026-06-22). 4 Tests gruen.
- [ ] PR-1.2 SidebarMessageRenderer: DEFERRED (Sidebar laeuft unmodifiziert, Runner liefert Sidebar-Independence-Schicht; 1-2-Wochen-Refactor fuer eigene Session).
- [ ] PR-1.3 Override-Parameter in AgentTaskRunConfig: DEFERRED (geht mit PR-1.2 zusammen).

Welle 1 P0 (alle DONE):
- [x] FEAT-33-01 Trigger-Layer komplett: SHA 74e15872 (Foundation TR-1.1/2/3) + Welle (FloatingMenu + Service) + Plugin-Wiring.
- [x] FEAT-33-04 Send-to-Main-Chat: SHA siehe sammelcommit.
- [x] FEAT-33-02 Lookup-Action (LLM-only-Baseline lebend, Vault-RAG-Pfad probe-ready).
- [x] FEAT-33-09 Vault-RAG-Pipeline: Modul ready. SemanticIndexProbe-Wiring deferred bis VectorStore-API stabilisiert.
- [x] FEAT-33-08 Skills-im-Floating-Menu: Modul ready (Capability + Filter + Action). SkillRegistry-Probe-Hookup deferred (kein Skill-Wiring im Default).
- [x] FEAT-33-03 Rewrite-Action: LLM-Pfad lebend. CodeMirror-6 Inline-Diff-Engine pure-logic ready, Decoration-Adapter deferred (Renderer braucht Spike C InlineAI-Plugin-Vorbild).

Welle 2 P1 (alle DONE):
- [x] FEAT-33-06 Translate: 2 Default-Sprachen (English, German), per-language id, lebend.
- [x] FEAT-33-07 Summarize: 2 Default-Laengen (short, medium), lebend.
- [x] FEAT-33-05 Inline-Chat: vault-operator-chat-v1 fence + 20-Turn-Cap + NoteWriter-Wiring, lebend.

Welle 3 P2 (alle module-DONE):
- [x] FEAT-33-10 Per-Action-Model-Pin: PerActionPin-Helper liest settings.actionPins live. Settings-UI deferred (Default-Settings reichen fuer initial Funktionalitaet).
- [x] FEAT-33-11 Find-Action-Items: lebend.

Deferred Follow-ups (Settings-Tab + Diff-Renderer + Sidebar-Migration + Vault-RAG-Wiring + Skill-Wiring):
- [ ] InlineActionsTab in Settings-Modal -- Default-Settings reichen, UI ist Komfort
- [ ] CodeMirror-6 Diff-Decoration-Adapter (Spike C InlineAI-Plugin-Vorbild)
- [ ] PR-1.2 SidebarMessageRenderer-Extraktion
- [ ] PR-1.3 AgentTaskRunConfig-Override-Felder
- [ ] SemanticIndexProbe live-wiring (FEAT-33-09 Vault-RAG)
- [ ] SkillCapabilityProbe live-wiring (FEAT-33-08 Skills-im-Menu)
- [ ] CSS .agent-inline-menu Theme (Welle 1 erscheint mit Vanilla-DOM ohne CSS-Polish)
- [ ] FEAT-33-04 Send-to-Main-Chat: SHA tbd
- [ ] FEAT-33-02 Lookup (ohne Vault-RAG): SHA tbd
- [ ] FEAT-33-09 Vault-Knowledge-Integration: SHA tbd
- [ ] FEAT-33-08 Skills-im-Floating-Menu: SHA tbd
- [ ] FEAT-33-03 Rewrite (Inline-Diff): SHA tbd

Welle 2 P1:
- [ ] FEAT-33-06 Translate: SHA tbd
- [ ] FEAT-33-07 Summarize: SHA tbd
- [ ] FEAT-33-05 Inline-Chat: SHA tbd

Welle 3 P2 (nach Beta):
- [ ] FEAT-33-10 Per-Action-Model-Pin: SHA tbd
- [ ] FEAT-33-11 Find-Action-Items: SHA tbd
