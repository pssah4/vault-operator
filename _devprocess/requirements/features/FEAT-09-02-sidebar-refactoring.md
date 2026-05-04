# Feature: AgentSidebarView Refactoring

> **Feature ID**: FEAT-09-02
> **Epic**: Technische Schulden (Phase 3 aus CODEBASE-004)
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

`AgentSidebarView.ts` ist mit 3937 LOC der groesste Monolith in der Codebase.
Die Datei vermischt Chat-Rendering, Tool-Execution-UI, Onboarding, Approval-Cards,
Suggestion-Banner, Task-Extraction, Streaming-Logik und Agent-Orchestrierung.

Das Refactoring extrahiert klar abgegrenzte Verantwortlichkeiten in eigenstaendige
Module, ohne die bestehende Funktionalitaet zu veraendern.

## Benefits Hypothesis

**Wir glauben dass** die Aufteilung der SidebarView
**Folgende messbare Outcomes liefert:**
- Dateien unter 800 LOC (statt 3937)
- Aenderungen an einem Modul beruehren nicht die anderen
- Neue Features (z.B. Sidebar-Redesign) sind einfacher zu implementieren

**Wir wissen dass wir erfolgreich sind wenn:**
- AgentSidebarView.ts < 1000 LOC
- Alle extrahierten Module unabhaengig testbar
- Keine funktionale Regression

## Analyse: Ist-Zustand (3937 LOC)

### Methodengruppen nach Verantwortlichkeit

| Gruppe | LOC (ca.) | Methoden | Kandidat fuer Extraktion |
|--------|-----------|----------|--------------------------|
| **handleSendMessage** | ~1063 | Agent-Loop, Streaming, Tool-Rendering, Approval | ChatController |
| **Chat Rendering** | ~600 | renderMarkdown, addUserMessage, addAssistantMessage, citations, sources, followups | ChatRenderer |
| **Approval/Tool-UI** | ~600 | showQuestionCard, humanReadableExplanation, checkpointMarker, undoBar | ApprovalRenderer |
| **Onboarding** | ~200 | showWelcomeMessage, providerSelection, freeKeyInstructions, noModelSetup | OnboardingFlow |
| **Suggestion Banner** | ~120 | buildSuggestionBanner, refreshSuggestionBanner | SuggestionBanner |
| **UI Helpers** | ~200 | wireInternalLinks, clampPopup, popupCloseHandler, autoResize | (verbleiben in View) |
| **State/Lifecycle** | ~400 | onOpen, buildHeader, buildChatInput, buildChatContainer, context, modes | (verbleiben in View) |
| **Bereits extrahiert** | - | ToolPickerPopover, AutocompleteHandler, AttachmentHandler, HistoryPanel, VaultFilePicker | - |

### Kern-Problem: handleSendMessage (~1063 LOC)

Diese eine Methode enthaelt:
- System-Prompt-Aufbau (Mode, Memory, Skills, Recipes)
- API-Call mit Streaming
- Tool-Use-Block-Rendering (collapsible, grouped)
- Approval-Flow (Karten, Callbacks)
- Todo-Box-Rendering
- Checkpoint-Marker
- Error-Handling
- Context-Condensing-Trigger
- Task-Extraction
- Memory-Extraction

## Ziel-Struktur

```
src/ui/
+-- AgentSidebarView.ts         (~800 LOC, Koordination + Lifecycle)
+-- sidebar/
    +-- AttachmentHandler.ts     (existiert bereits)
    +-- AutocompleteHandler.ts   (existiert bereits)
    +-- ToolPickerPopover.ts     (existiert bereits)
    +-- HistoryPanel.ts          (existiert bereits)
    +-- VaultFilePicker.ts       (existiert bereits)
    +-- CondensationFeedback.ts  (existiert bereits)
    +-- ContextDisplay.ts        (existiert bereits)
    +-- ChatRenderer.ts          (NEU: Message-Rendering, Citations, Sources)
    +-- ApprovalRenderer.ts      (NEU: Approval-Cards, Tool-Details, Checkpoint, Undo)
    +-- OnboardingFlow.ts        (NEU: Welcome, Provider-Selection, Setup)
    +-- SuggestionBanner.ts      (NEU: Implicit Connection Suggestions)
```

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | AgentSidebarView.ts LOC | < 1000 | wc -l |
| SC-02 | Kein extrahiertes Modul > 800 LOC | Alle < 800 | wc -l |
| SC-03 | Keine funktionale Regression | 100% | Manueller Test aller Chat-Funktionen |
| SC-04 | Build + ESLint fehlerfrei | 0 Errors | npm run build + eslint |

## Implementierungsreihenfolge (niedrigstes Risiko zuerst)

1. **SuggestionBanner** -- eigenstaendig, klar abgegrenzt (~120 LOC)
2. **OnboardingFlow** -- eigenstaendig, wird nur einmal aufgerufen (~200 LOC)
3. **ChatRenderer** -- Message-Rendering, Citations, Sources (~600 LOC)
4. **ApprovalRenderer** -- Approval-Cards, Tool-Details, Checkpoint (~600 LOC)
5. **handleSendMessage aufbrechen** -- Extract Method auf Agent-Loop-Teilschritte

## Definition of Done

### Functional
- [ ] AgentSidebarView.ts < 1000 LOC
- [ ] 4 neue Module extrahiert (SuggestionBanner, OnboardingFlow, ChatRenderer, ApprovalRenderer)
- [ ] handleSendMessage in handhabbare Teilmethoden aufgeteilt
- [ ] Keine funktionale Regression (Chat, Approval, Onboarding, Suggestions)

### Quality
- [ ] Build + ESLint: 0 Errors
- [ ] Bestehende Tests bestehen weiterhin

### Documentation
- [ ] arc42 UI Layer aktualisiert
- [ ] CODEBASE-004 als erledigt markiert

## Dependencies
- Keine externen Dependencies
- Rein internes Refactoring

## Out of Scope
- Neue UI-Features
- AgentSettingsTab (bereits refactored)
- Funktionale Aenderungen an Chat/Approval/Onboarding
