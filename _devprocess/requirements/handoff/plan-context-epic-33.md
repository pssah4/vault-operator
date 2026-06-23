# Plan Context: EPIC-33 Inline-Editor-AI-Actions

> **Purpose:** Technische Zusammenfassung fuer Claude Code (`/coding`-Skill)
> **Created by:** Architecture-Phase 2026-06-22
> **Branch:** `feature/epic-33-inline-editor-ai-actions`
> **Source-Artefakte:** EPIC-33-Spec, 11 FEAT-Specs FEAT-33-01..11, 7 ADRs ADR-138..144, BA, Marktrecherche

---

## 1. Technical Stack (existierend, keine neuen Tech-Schichten)

**Plugin-Runtime:**
- Sprache: TypeScript strict
- Framework: Obsidian Plugin API
- Build: esbuild (mit @codemirror/* als external)
- Runtime: Electron via Obsidian

**Editor-Layer:**
- CodeMirror 6 (von Obsidian bereitgestellt, NIE selbst importieren)
- Decoration-API: Decoration.mark() plus Decoration.widget()
- State-Pattern: StateField plus StateEffect
- Zugriff via `MarkdownView.editor.cm`

**AI-Layer (bereits sidebar-unabhaengig):**
- API-Provider: src/api/*.ts (anthropic.ts, openai.ts, bedrock.ts, github-copilot.ts, kilo-gateway.ts)
- Factory: `buildApiHandlerForModel(model)`
- Agent-Loop: AgentTask (abstrakt auf Callback-Ebene)
- Tier-Routing: TaskRouter mit Haiku-Fallback (EPIC-24 / Phase D)

**Knowledge-Layer (existierend, fuer FEAT-33-09 wiederverwendet):**
- SemanticIndexService mit Embedding-Modell (qwen3-embedding-8b via OpenRouter)
- VectorStore mit KnowledgeDB (sql.js WASM)
- Schema: vectors.domain (ADR-136/137) - Filter `domain='note'` fuer Lookup-RAG
- Existierende Methode: `VectorStore.findNoteVectors({query, limit, domain})`

**Memory + History (existierend, fuer FEAT-33-05 Conversation-Block-Indexing):**
- Memory v2 mit FactStore, ContextComposer, SingleCallProcessor
- HistoryDB plus HistoryIndexer (Phase 6 Memory v2)
- markdownIndexer (Phase D) - erkennt vault-operator-chat-v1-Fences und indexiert sie

**Skills-System (existierend, fuer FEAT-33-08 erweitert):**
- SkillsService mit Skill-Manifest und Capabilities
- User Skills + Plugin Skills + Skill-Mastery
- Schema-Erweiterung: neues Manifest-Feld `inlineActionCapability` (ADR-141)

**Telemetrie:**
- OperationLogger (existierend, erweitert um 4 Event-Typen in ADR-144)

**Diff-Library:**
- jsdiff (transitive Dep in node_modules) - `diffLines()` plus `diffWordsWithSpace()`

## 2. Architecture Style

- **Pattern:** Modular Plugin auf Obsidian-API. Inline-Layer wird ein neues Modul-Cluster unter `src/core/inline/`
- **Key Quality Goals:**
  1. **Sidebar-Independence (kritisch):** Alle Actions ausser Send-to-Main-Chat laufen ohne offene Chat-Sidebar (H-06, ASR-EPIC-33-01, ADR-138)
  2. **Streaming-Performance:** Inline-Diff-Render-Latenz <100ms zwischen Token und Render (H-02, ADR-139)
  3. **Vault-Native-Differenzierung:** Vault-Knowledge-RAG im Lookup + Skills-System im Floating-Menu schlagen LLM-only-Wettbewerber (H-07, ADR-141, ADR-142)
  4. **Markdown-Konformitaet:** Conversation-Bloecke bleiben ohne Plugin lesbar, Git-versioniert (ADR-143)
  5. **Cost-aware Tier-Routing:** Lookup/Translate/Summarize -> Haiku, Rewrite/Chat -> Default-Tier (TaskRouter, ADR-144)

## 3. Key Architecture Decisions (ADR Summary)

| ADR | Title | Vorgeschlagene Entscheidung | Impact |
|---|---|---|---|
| ADR-138 | Sidebar-Independence-Architektur | Stufenweiser Refactor: Tier 1 (ToolCallbacks-Extract + AgentTaskRunner + Override-Parameter) in Welle 1, Tier 2 (Settings-Source + ContextTracker) spaeter | High |
| ADR-139 | CodeMirror-6 Inline-Diff-Renderer | Custom mark+widget mit StateField+StateEffect, jsdiff, 80ms-Debounce, Per-Hunk Cmd+Opt+Y/N | High |
| ADR-140 | Settings-Snapshot-Lifecycle | Hybrid: Modell+Provider gecached mit Invalidation-Event, Skills/Prompts pro Trigger frisch, Per-Action-Pin (FEAT-33-10) overridet Modell | Medium |
| ADR-141 | Skill-Capability inline-action-eligible | Capability-Object im Skill-Manifest: { eligible, output_mode, input_format, max_selection_chars } | Medium |
| ADR-142 | Vault-RAG-Pipeline fuer Lookup | Synchrone Pipeline: Selection-Embedding -> findNoteVectors -> Confidence-Threshold 0.7 -> LLM-Augmentation -> Quellen-Tooltip; Fallback LLM-only | Medium |
| ADR-143 | Conversation-Block-Storage | Markdown-Code-Fence mit Language-Tag `vault-operator-chat-v1`, Begrenzung 20 Turns + Auto-Collapse | High |
| ADR-144 | Telemetrie-Hook fuer Inline-Actions | OperationLogger-Extension um 4 Event-Typen, Privacy-Sanitization automatisch | Medium |

**Detail pro Critical-ADR:**

1. **ADR-138 Sidebar-Independence:**
   - Refactoring-Tier 1 (Welle 1): ToolCallbacks-Interface in `src/ui/rendering/SidebarMessageRenderer.ts` extrahieren, AgentTaskRunner in `src/core/agent/AgentTaskRunner.ts` als zentraler Einstiegspunkt, Override-Felder in `AgentTaskRunConfig`
   - Sidebar-View nutzt weiterhin denselben Runner mit ihrer eigenen Callback-Implementierung
   - Inline-Actions konsumieren denselben Runner mit headless-Callbacks (DOM-frei)
   - Rationale: Pattern-Vorbild PlanPresentationTool zeigt dass interne LLM-Calls bereits sidebar-unabhaengig moeglich sind; Tier-Schnitt minimiert Regressionsrisiko fuer Chat-Workflow

2. **ADR-139 Inline-Diff-Renderer:**
   - Architektur: `src/core/inline/diff/InlineDiffStateField.ts` (StateField), `InlineDiffEffects.ts` (StateEffects), `InlineDiffRenderer.ts` (Decoration-Logik), `InlineDiffStreamHandler.ts` (80ms-Debounce + jsdiff)
   - Hotkey-Bindings via @codemirror/view keymap: Cmd+Return Accept-All, Cmd+Backspace Reject-All, Cmd+Opt+Y/N Per-Hunk
   - esbuild: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `obsidian` MUESSEN external sein (verifizieren in esbuild.config.mjs)
   - Rationale: Streaming-Realtime-Anforderung schliesst @codemirror/merge aus; InlineAI-Plugin (github.com/FBarrca/obsidian-inlineAI) als Best-Practice-Referenz

3. **ADR-143 Conversation-Block-Storage:**
   - Fence-Format: `\`\`\`vault-operator-chat-v1` mit JSON-Body (id, selection_anchor, turns[], model, created)
   - Begrenzung 20 Turns pro Block + Auto-Collapse in Render-Hook
   - `markdownPostProcessor` fuer Reading-Mode + EditorView-Decoration fuer Live-Preview
   - Memory-Integration via Phase D markdownIndexer (Fence-Pattern-Erkennung)
   - Rationale: Markdown-Konformitaet hoechster Wert (Note bleibt lesbar ohne Plugin, Git-Versions-History natuerlich), Cross-Plugin-Compatible

## 4. Module-Layout (geplant)

Neue Module unter `src/core/inline/`:

```
src/core/inline/
  trigger/
    InlineTriggerResolver.ts         # FEAT-33-01: Selection-Event -> Floating-Menu/Hotkey/Command-Palette
    InlineFloatingMenu.ts             # Floating-Menu-Render mit Skill-Listing
    InlineHotkeyHandler.ts            # Hotkey-Bindings via Obsidian-Hotkey-Bus
    InlineTriggerContext.ts           # { selectionText, editorMode, cursorPos, notePath, settingsSnapshot }
  diff/
    InlineDiffStateField.ts           # FEAT-33-03: StateField { decorations, hunks }
    InlineDiffEffects.ts              # StateEffects updateDiffEffect, acceptHunkEffect, rejectHunkEffect
    InlineDiffRenderer.ts             # RangeSetBuilder + Decoration.mark/widget
    InlineDiffStreamHandler.ts        # 80ms-Debounce + jsdiff
    InlineDiffKeymap.ts               # Cmd+Return / Cmd+Backspace / Cmd+Opt+Y/N
  lookup/
    VaultRagPipeline.ts               # FEAT-33-09: Embedding -> findNoteVectors -> Threshold -> Augmentation
    RagConfidenceFilter.ts            # Threshold-Logik
    RagPromptAugmenter.ts             # Augmented-Prompt-Construction mit Source-Snippets
    LookupPreviewBlock.ts             # FEAT-33-02: Preview-Block-Renderer mit Insert-below
  chat/
    InlineChatBlockRenderer.ts        # FEAT-33-05: vault-operator-chat-v1 Fence Render-Hook
    InlineChatBlockParser.ts          # Fence-JSON-Parser mit Version-Tag
    InlineChatStorage.ts              # Read/Write Conversation-Block in Note
  settings/
    InlineActionSettingsCache.ts      # ADR-140: Modell+Provider Cache mit Invalidation
    InlineActionSettingsSnapshot.ts   # Snapshot-Builder mit Pin-Override
  skills/
    InlineSkillFilter.ts              # ADR-141: Liest Skill-Manifest, filtert nach inlineActionCapability
  send/
    SendToMainChatAction.ts           # FEAT-33-04: Sidebar oeffnen + Selection einfuegen
  actions/
    LookupAction.ts                   # FEAT-33-02 Implementation
    RewriteAction.ts                  # FEAT-33-03 Implementation
    InlineChatAction.ts               # FEAT-33-05 Implementation
    SendToMainChatAction.ts           # FEAT-33-04 Implementation (s. send/)
    TranslateAction.ts                # FEAT-33-06 Implementation
    SummarizeAction.ts                # FEAT-33-07 Implementation
    FindActionItemsAction.ts          # FEAT-33-11 Implementation (optional via Skill)

src/core/agent/
  AgentTaskRunner.ts                  # NEU (ADR-138): Abstraktion ueber AgentTask + Callbacks + Config

src/ui/
  rendering/
    SidebarMessageRenderer.ts         # NEU (ADR-138): DOM-Adapter aus AgentSidebarView extrahiert
  inline/
    InlineActionsTab.ts               # NEU: Settings-Surface in Settings-Modal fuer Inline-Hotkey, Floating-Toggle, Action-Pins
```

Erweiterte existierende Module:

```
src/core/AgentTask.ts                 # AgentTaskRunConfig um modelOverride, thinkingOverride, effortOverride erweitern (ADR-138)
src/services/SkillsService.ts         # Liest neues inlineActionCapability-Manifest-Feld (ADR-141)
src/services/OperationLogger.ts       # Event-Typen erweitern (ADR-144)
src/types/skill-manifest.ts           # SkillManifest-Schema erweitert (ADR-141)
main.ts                                # plugin.saveSettings-Hook emittet inline-cache-invalidation (ADR-140)
```

## 5. External Integrations

| System | Type | Protocol | Purpose |
|---|---|---|---|
| AI-Provider | Outbound | HTTPS (via existierende src/api/*) | LLM-Calls fuer Lookup/Rewrite/Chat/Translate/Summarize. Bestehende Provider-Auswahl wiederverwendet, kein neuer Provider |
| Knowledge-Layer | Internal | SQL via sql.js | Vault-RAG-Pipeline (FEAT-33-09). VectorStore.findNoteVectors({domain:'note'}) |
| OperationLogger DB | Internal | SQL via sql.js | Telemetrie-Events fuer H-Validierung |
| Obsidian-Workspace-API | Inbound | Plugin-API | Sidebar-State-Detection (FEAT-33-04), Editor-Access (alle Actions) |
| CodeMirror-6 Editor | Internal | Plugin-API + Extension | Selection-Events, Decoration-Render, Hotkey-Bindings |

## 6. Performance + Security

**Performance:**
- Trigger-Resolver-Overhead pro Selection-Event: <5ms (debounced)
- Time-to-First-Token-Output (Median): <=3s ueber alle Actions
- Inline-Diff-Render-Latenz zwischen Token-Arrival und Render: <100ms (Spike B Latenz-Budget 80-150ms muss in der Praxis verifiziert werden, Mitigation: nur Viewport-Decorations + Partial-Diffing)
- Floating-Menu-Render nach Selection: <100ms
- Vault-RAG-Pipeline Embedding-Roundtrip: ~200-500ms (im Time-to-First-Token-Budget enthalten via Tier-Routing)
- Settings-Snapshot pro Trigger: <5ms (Modell gecached, Skills/Prompts frisch)

**Security:**
- Selection-Inhalt: gleiche Prompt-Injection-Hardening wie Chat-Input (bestehende sanitizers wiederverwendet)
- Provider-Credentials: gleiches Schluessel-Material wie Main-Chat, keine erneute Kapselung
- Path-Traversal-Protection: bestehend (ADR-29) gilt fuer FEAT-33-03 Rewrite und FEAT-33-05 Inline-Chat (Note-Write-Aufrufe via existierender writeBinaryToVault-Pipeline)
- Vault-RAG-Quellen-Tooltip: Settings-Toggle `inlineLookupShowSourcesInTooltip` (default an) ermoeglicht User-Opt-out bei sensiblen Vault-Forks
- Telemetrie: kein Selection-Inhalt persistiert, nur Counts und Categories (ADR-144 Sanitization)

**Scalability:**
- Note-Groesse-Cap: analog CONTEXT_DOCUMENT_CHAR_LIMIT (80k chars) fuer Selection
- Skills-im-Menu: TOP-N-Cap (Default 10), Reihenfolge ueber Haeufigkeit
- Inline-Diff bei sehr grossem Document: Viewport-only Decorations, Partial-Diffing fuer Token-Streams
- Vault-RAG: Skaliert mit Index-Groesse, Confidence-Threshold kalibriert

**Availability:**
- Sidebar-Independence-Coverage: 100% der Actions ausser Send-to-Main-Chat
- Bot-Compliance: alle FEAT-Implementierungen folgen Obsidian Community Plugin Review-Bot Rules

## 7. Welle-Plan (Implementation-Reihenfolge)

**Welle 1 (P0 - voll funktionsfaehige MVP-Surface mit Differenzierungs-Ankern):**

Vorbedingung: ADR-138 Tier-1-Refactor (kann als Pre-Welle implementiert werden falls Code-Inventory mehr Aufwand als geschaetzt).

| Reihenfolge | FEAT | Begruendung |
|---|---|---|
| 1.0 | Pre-Welle: Tier-1-Refactor (ADR-138) | Substrat fuer alle Actions. ToolCallbacks-Extract + AgentTaskRunner + Override-Parameter. Sidebar-Funktionalitaet bleibt unveraendert. |
| 1.1 | FEAT-33-01 Trigger-Layer | Substrat fuer alle Actions. Floating-Menu + Hotkey + Command-Palette + Settings-Surface. |
| 1.2 | FEAT-33-04 Send-to-Main-Chat | Einfachste Action, validiert Trigger-Layer-Wiring und Sidebar-Open-on-Demand. |
| 1.3 | FEAT-33-02 Lookup-Action (ohne Vault-RAG) | LLM-only-Lookup mit Preview-Block-Output. |
| 1.4 | FEAT-33-09 Vault-Knowledge-Integration | Erweitert FEAT-33-02 um RAG-Pipeline. A/B-Test-Schalter fuer H-07. |
| 1.5 | FEAT-33-08 Skills-im-Floating-Menu | Schema-Update Skill-Manifest + Filter im Floating-Menu. Validiert Skills-Integration. |
| 1.6 | FEAT-33-03 Rewrite-Action | Komplexeste P0-Action (CodeMirror-Diff-Renderer). Tier-Risiko hier am hoechsten. |

**Welle 2 (P1 - Innovation + Tool-Parity):**

| Reihenfolge | FEAT | Begruendung |
|---|---|---|
| 2.1 | FEAT-33-06 Translate-Action | Quick Win, reused FEAT-33-03 Diff-Renderer. |
| 2.2 | FEAT-33-07 Summarize-Action | Quick Win, reused FEAT-33-02 Preview-Block. |
| 2.3 | FEAT-33-05 Inline-Chat-Action | Innovation, anspruchsvollster Output (Conversation-Block-Storage + Memory-Integration). |

**Welle 3 (P2 - Nach Beta-Lernen):**

| Reihenfolge | FEAT | Begruendung |
|---|---|---|
| 3.1 | FEAT-33-10 Per-Action-Model-Pin | Power-User-Override. Lernen aus H-03-Telemetrie. |
| 3.2 | FEAT-33-11 Find-Action-Items | Eigene Action ODER via FEAT-33-08-Skill `extract-action-items`. Architektur entscheidet basierend auf Skill-Reife. |

## 8. Test-Plan

**Spike-Plan (vor Welle 1):**
- Spike A bereits ausgefuehrt (Sidebar-Independence-Inventory). Output: ADR-138.
- Spike B bereits ausgefuehrt (CodeMirror-6 Inline-Diff-Recherche). Output: ADR-139.
- Optional Spike C (vor FEAT-33-03): InlineAI-Plugin-Source-Code-Review, konkretes Latenz-Messen mit Token-Mock. Aufwand 0.5-1 Tag.

**Pro FEAT erwartete Tests:**

| FEAT | Unit-Tests | Integration-Tests | Manueller Test |
|---|---|---|---|
| FEAT-33-01 Trigger-Layer | Trigger-Resolver mit Mock-Selection, Floating-Menu-Position-Logic, Hotkey-Dispatch | Sidebar-closed plus Selection plus Hotkey -> Action-Dispatch | Editor-Live-Test in Source-Mode + Live-Preview + Reading-Mode |
| FEAT-33-02 Lookup | Preview-Block-Render mit Mock-LLM-Response, Insert-below-Action | Vollstaendiger Lookup-Flow mit Mock-Provider | Live-Test mit echtem LLM-Aufruf, Sidebar-closed verifizieren |
| FEAT-33-03 Rewrite | Diff-Renderer Streaming-Tests, Per-Hunk-Accept/Reject, Edge-Cases (Empty-Diff, Single-Hunk, Many-Hunks) | Vollstaendiger Rewrite-Flow mit Mock-Provider, Editor-State-Korruptions-Test bei Stream-Cancel | Live-Test mit echtem LLM, Per-Hunk-Hotkeys, Sidebar-closed |
| FEAT-33-04 Send-to-Main-Chat | Sidebar-Open-on-Demand, Selection-as-Context-Inject | Sidebar-closed plus Action -> Sidebar-open mit Selection im Input | Live-Test |
| FEAT-33-05 Inline-Chat | Conversation-Block Parser + Renderer, Fence-Format-Roundtrip, Auto-Collapse bei 20+ Turns | Multi-Turn-Flow mit Persistierung in Note | Live-Test, Vault-Search findet Inline-Chats |
| FEAT-33-06 Translate | Sub-Menu-Picker, Sprach-Settings | Translate-Flow mit Mock-Provider | Live-Test |
| FEAT-33-07 Summarize | Sub-Menu-Picker (Kurz/Mittel/Lang) | Summarize-Flow | Live-Test |
| FEAT-33-08 Skills-im-Menu | inlineActionCapability-Parser, Filter-Logic, Skill-Input-Format | Skill-Aufruf mit Selection-Input | Live-Test mit echtem User-Skill |
| FEAT-33-09 Vault-RAG | Confidence-Threshold-Filter, Augmented-Prompt-Builder, Fallback-Logic | Vollstaendiger Pipeline-Run gegen Test-Vault-Index | Live-Test in Sebastian's Vault, A/B-Schalter |
| FEAT-33-10 Pin | Settings-Persistence, Snapshot-Override-Logic | Pin-aktiv-Trigger plus Action verifiziert Modell-Wechsel | Live-Test |
| FEAT-33-11 Find-Action-Items | Checklist-Format-Output | Action-Items-Flow | Live-Test |

**Cross-FEAT-Test (Sidebar-Independence, H-06):**

Pro FEAT in Welle 1+2: dediziert ein Test-Case "Action laeuft mit Sidebar geschlossen" (workspace.detachLeavesOfType + Action-Trigger + verifizieren dass kein Error im Logger). Akzeptanzkriterium: 100% Coverage in der Definition of Done.

## 9. Risks (Architektur-Sicht)

| Risk | Mitigation |
|---|---|
| Tier-1-Refactor (ADR-138) groesser als geschaetzt | Pre-Welle als eigene Phase aufmachen, Sidebar-Funktionalitaet als Snapshot-Test pinnen vor Refactor |
| CodeMirror-6 Diff-Renderer Latenz >100ms in der Praxis | Viewport-only Decorations, Partial-Diffing, Settings-Toggle "low-power-mode" als Fallback auf Modal-Preview |
| Vault-RAG-Confidence-Threshold falsch kalibriert | Default 0.7, User-rebindbar, Telemetrie sammelt empirische Verteilung in Beta |
| Conversation-Block-Aufblaehung bei vielen Inline-Chats | 20-Turn-Cap, Auto-Collapse, optionale "move to history"-Action in Welle 3 |
| Skill-Manifest-Migration konfliktet mit existierenden Skills | Capability default null = nicht im Inline-Menu, kein Forced-Migration, opt-in nur fuer neue Skills |

## 10. Open Items fuer /coding

**Vor /coding-Start:**
- esbuild.config.mjs verifizieren dass `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `obsidian` als external markiert sind. Falls nicht: kleiner Build-Config-PR vor FEAT-33-03-Start.

**Codebase-Reconciliation (Phase 2a von /coding):**
- `AgentTaskRunConfig` (src/core/AgentTask.ts:163-210): kann ohne Bruch um `modelOverride/thinkingOverride/effortOverride` erweitert werden? Existing-callers durchcheck.
- `SkillsService.ts` Schema-Position: existierender Pfad fuer SkillManifest-Definition lokalisieren, Capability-Feld additiv hinzufuegen.
- `OperationLogger.ts` Event-Typ-Enum erweitern, Schema-Migration falls die DB Event-Type strict pruefen.

**Deferred to /coding-Decision:**
- ContextTracker-Extract (ADR-138 Tier 2) - Zeitpunkt: nach Welle 1 Beta-Verifikation oder mit Welle 2
- Mobile-Tap-and-hold-Menu konkretes UX (FEAT-33-01 Mobile-Pattern) - in Coordination mit FEAT-27-01

## 11. Consistency Check

plan-context.md ist konsistent mit allen 7 ADRs:

- ADR-138 Sidebar-Independence -> Section 2 Quality Goal 1, Section 4 src/core/agent/AgentTaskRunner.ts, Section 7 Pre-Welle, Section 9 Risk #1
- ADR-139 Inline-Diff-Renderer -> Section 1 esbuild external, Section 4 src/core/inline/diff/, Section 6 Performance Latenz, Section 7 Welle 1.6, Section 8 Spike C, Section 9 Risk #2
- ADR-140 Settings-Snapshot -> Section 1 main.ts saveSettings-Hook, Section 4 src/core/inline/settings/, Section 6 Performance Snapshot-Latenz
- ADR-141 Skill-Capability -> Section 1 SkillsService-Erweiterung, Section 4 src/core/inline/skills/, Section 9 Risk #5
- ADR-142 Vault-RAG -> Section 1 Knowledge-Layer-Stack, Section 4 src/core/inline/lookup/, Section 6 Performance Embedding-Roundtrip, Section 9 Risk #3
- ADR-143 Conversation-Block -> Section 1 Markdown-Indexer Phase D, Section 4 src/core/inline/chat/, Section 9 Risk #4
- ADR-144 Telemetrie -> Section 1 OperationLogger-Erweiterung, Section 4 OperationLogger.ts, Section 6 Security Sanitization

Tech-Stack in plan-context entspricht den Decisions in den ADRs. Keine Inkonsistenzen.

## 12. Naechster Schritt

`/coding` startet mit:

1. Phase 2a Codebase-Reconciliation der ADR-138-Pre-Welle-Annahmen (AgentTaskRunConfig erweiterbar? SkillsService-Schema?)
2. Pre-Welle: Tier-1-Refactor (ADR-138) wenn Inventory das traegt
3. Welle 1.1 FEAT-33-01 Trigger-Layer (Substrat)
4. Welle 1.2-1.6 sequentiell oder verschachtelt je nach Test-Risiko-Profil
5. Pro FEAT: Definition-of-Done-Check mit Sidebar-Independence-Verifikation (Cross-FEAT-Constraint)

Spike C (InlineAI-Source-Review + Latenz-Mock) optional vor FEAT-33-03 wenn Welle 1.5 abgeschlossen ist.
