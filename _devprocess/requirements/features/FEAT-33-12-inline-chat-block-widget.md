---
id: FEAT-33-12
title: Inline-Chat als CodeMirror-Block-Widget (Default) oder Popover (Opt-in) mit Sidebar-Parity und Live-Handoff
epic: EPIC-33
subtype: ux-refactor
priority: P1
effort: M
asr-refs: []
adr-refs: [ADR-139]
depends-on: [FEAT-33-01, FEAT-33-05]
created: 2026-06-24
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# Feature: Inline-Chat als CodeMirror-Block-Widget (Default) oder Popover (Opt-in) mit Sidebar-Parity und Live-Handoff

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-33-12.

## Feature description

Das Feature deckt drei Aenderungen ab, die als ein Refactor gehoeren:

**1. Zwei Darstellungs-Varianten, User waehlt in den Settings.**
Der Inline-Chat hat ab FEAT-33-12 zwei Darstellungs-Optionen, technisch und inhaltlich identisch -- nur der Mount-Mechanismus unterscheidet sich:

| Variante | Setting-Wert | Verhalten | Modus-Verfuegbarkeit |
|---|---|---|---|
| Block-Widget (Default) | `inlineChatDisplay = 'cm-block-widget'` | Echter CodeMirror-6 block widget unterhalb der Selektion. Editor reserviert eine Layout-Zeile zwischen Zeile N (Selektions-Ende) und Zeile N+1, Folgezeilen ruecken nach unten. Beim Close rastet der Text zurueck. (VS-Code-Style) | Source + Live-Preview |
| Popover (Opt-in) | `inlineChatDisplay = 'popover-overlay'` | Absolut positioniertes Overlay innerhalb `view.contentEl`, identisch zur bestehenden Implementierung aus FEAT-33-05 (`InlineChatPanel`). Wird NICHT geloescht, bleibt fuer User die das bevorzugen oder die in Reading-View arbeiten. | Source + Live-Preview + Reading |

Beide Varianten mounten dasselbe `buildPanelSurface(plugin, panelRoot, chipBar)` -- die einzige Aenderung gegenueber heute ist, dass der bestehende `InlineChatPanel`-Mount hinter einem Adapter sitzt, neben dem das neue Block-Widget-Adapter parallel existiert.

Settings-Default: `cm-block-widget`. Begruendung: kein Inhalts-Overlap mit dem Editor-Text, integraler Bestandteil des Editor-Flows.

Modus-Reading-View-Verhalten:
- Im Block-Widget-Modus: Trigger in Reading-View loest eine Obsidian-Notice "Switch to editor view, or change inline chat display to Popover in settings" aus. Kein Mount.
- Im Popover-Modus: Mount funktioniert in allen drei Modi (incl. Reading), weil das Overlay nicht von CM6 abhaengt.

**2. Strikte Sidebar-Parity der Chat-Funktionalitaet.**
Der Inline-Chat MUSS in Funktion und Darstellung exakt dem Sidebar-Chat entsprechen. Selber `AgentTaskRunner` (heute schon der Fall via `PanelChatController`, eingefuehrt 2026-06-22), selbe Skills, Prompts, Workflows, MCP-Server, dasselbe Model-Picker-Verhalten, dasselbe Streaming, dieselbe Tool-Call-Anzeige, dieselbe Approval-Logik, dieselben Bubble-Stile, dieselbe Markdown-Rendering-Pipeline (incl. Wikilink-Wiring). Die Parity-Anforderung ist explizit, damit zukuenftige Refactors am Sidebar-Chat nicht in einen Drift-Zustand laufen. Konkrete Konsequenz: der Inline-Chat darf KEINEN reduzierten Feature-Modus haben -- jede Capability die im Sidebar erscheint, erscheint auch inline.

**3. Live-Handoff Inline-Chat -> Sidebar-Chat ("Send to sidebar chat").**
Neue Action im Inline-Chat-Composer (Button + Hotkey Cmd+Shift+S, konfigurierbar). Aktion uebertraegt die laufende Conversation in den Sidebar-Chat ohne Memory-Umweg:
- Sidebar-View oeffnen (falls geschlossen).
- Conversation-State (alle Bubbles, Settings-Snapshot, Skills-/Prompt-/Workflow-Auswahl, Attachment-Liste, Model-Override) in die Sidebar-Surface importieren -- in derselben Reihenfolge und mit denselben Render-Pfaden, damit die Sidebar-Anzeige nach dem Handoff identisch zum vorherigen Inline-Stand aussieht.
- Inline-Widget schliesst sich automatisch nach erfolgreichem Handoff.
- Sidebar zeigt den Composer fokussiert, User kann sofort weitertippen.
- Memory-Bridge bleibt zusaetzlich aktiv: die Conversation wird wie bisher in History persistiert, NUR der Umweg "Inline schliessen, Memory oeffnen, Konversation im Sidebar resumen" entfaellt fuer den haeufigen Fall.

Handoff-Voraussetzungen (User-Entscheidung 2026-06-24):
- Handoff ist nur moeglich, wenn der Inline-Chat-AgentTask **idle** ist -- also weder ein LLM-Stream laeuft, noch ein Tool-Use aktiv ist, noch eine Tool-Approval auf Antwort wartet, noch ein Sub-Task laeuft.
- Solange irgendeine Activity laeuft, ist der "Send to sidebar chat"-Button disabled mit Tooltip "Waiting for the current response to finish".
- "Activity" wird konkret als `AgentTaskRunner.isIdle() === true` definiert. Dies muss als Live-Probe verfuegbar sein.

## Benefits hypothesis

We believe that ein im Editor-Layout verankertes Chat-Widget den Inline-Chat als integralen Bestandteil des Schreibflusses etabliert (statt als losgeloestes Overlay).

This delivers verbesserte Lesbarkeit langer Antworten ohne Inhaltsueberdeckung, klarere visuelle Verankerung an der Selektion und Konsistenz mit etablierten Inline-AI-Patterns (VS Code, Cursor).

We know we are successful when ueber 60 Prozent der Beta-Nutzer die neue Mount-Variante in der ersten Woche nicht deaktivieren (kein Rollback-Toggle noetig), und qualitative Feedback-Signale "ueberdeckt Inhalt" / "Position springt" verschwinden.

## User stories

- **US-33-12-01 (P1 Power-User):** Als Power-User moechte ich den Inline-Chat als echten Block zwischen meinem Markup sehen, damit ich Antwort und Kontext gleichzeitig lese ohne dass das Panel meinen Text verdeckt.
- **US-33-12-02 (P1 Power-User):** Als Power-User moechte ich, dass nach `Esc` oder Close das Editor-Layout zurueckspringt und der Cursor an seiner alten Stelle bleibt, damit der Inline-Chat ein leichtgewichtiger Modus statt ein Kontext-Wechsel ist.
- **US-33-12-03 (P0 alle Nutzer):** Als Nutzer in der Reading-View im Block-Widget-Modus moechte ich eine klare Notice statt eines kaputten Mounts sehen, wenn ich den Hotkey versehentlich drueke, damit ich verstehe, dass ich entweder den Editor-Modus oeffnen oder in den Settings auf Popover wechseln muss.
- **US-33-12-04 (P0 alle Nutzer):** Als Nutzer moechte ich, dass der Inline-Chat funktional und visuell identisch zum Sidebar-Chat ist, damit ich nicht zwei Mental-Models lernen muss und jede neue Sidebar-Capability automatisch inline funktioniert (Skills, Prompts, Workflows, MCP, Model-Picker, Tool-Approval, Markdown-Render mit Wikilinks).
- **US-33-12-05 (P1 Power-User):** Als Power-User moechte ich eine laufende Inline-Conversation per "Send to sidebar chat"-Button direkt in den Sidebar-Chat uebertragen und dort weiterfuehren koennen, ohne den Umweg ueber Memory + Reopen, damit ich die Konversation bei wachsendem Umfang im breiteren Sidebar-Bereich fortsetzen kann.
- **US-33-12-06 (P1 alle Nutzer):** Als Nutzer moechte ich in den Settings zwischen "Block widget in editor" (Default) und "Floating popover" als Inline-Chat-Darstellung waehlen koennen, damit ich die Variante nutze, die zu meinem Workflow passt -- der Inhalt und die Funktionalitaet sind in beiden Varianten gleich.

## Success criteria

| ID | Criterion | Target | Measurement |
|---|---|---|---|
| SC-01 | In Source-Mode oeffnet der Hotkey das Chat-Widget als block decoration nach dem Selektions-Ende | 100 Prozent der Trigger | Manual + Unit-Test gegen CM6-State-Snapshot |
| SC-02 | In Live-Preview oeffnet der Hotkey das Chat-Widget identisch zu Source-Mode | 100 Prozent der Trigger | Manual |
| SC-03 | Im Block-Widget-Modus loest der Hotkey in Reading-View eine Obsidian-Notice ("Switch to editor view, or change inline chat display to Popover in settings") aus -- kein Mount. Im Popover-Modus mountet das Overlay auch in Reading-View. | 100 Prozent der Trigger | Manual + Unit-Test gegen Orchestrator (mode-Probe + display-setting) |
| SC-04 | Streaming-Antworten lassen das Widget vertikal wachsen ohne Layout-Stocker (max 1 Frame Verzoegerung) | 60fps gehalten | Manueller Profile-Run, Visual-Check |
| SC-05 | Beim Close verschwindet die Decoration vollstaendig, Folgezeilen springen zurueck, Cursor-Position unveraendert | Kein Resttext, kein Sprung | Manual + Unit-Test gegen CM6-State |
| SC-06 | Apply/Reject ueber den bestehenden Diff-Flow funktioniert weiter (FEAT-33-03), das Block-Widget veraendert keine Dokument-Positionen | Diff-Hunks bleiben referenz-stabil | Unit-Test gegen InlineDiffEngine |
| SC-07 | Sidebar-Parity: jede Capability die im Sidebar-Chat-Composer erscheint (Skills, Prompts, Workflows, MCP-Picker, Model-Picker, Attachments, Tool-Approval, Markdown-Render mit Wikilinks), ist auch im Inline-Chat verfuegbar und verhaelt sich gleich | 100 Prozent Capability-Deckung | Capability-Matrix-Test gegen `buildPanelSurface` vs. AgentSidebarView |
| SC-08 | "Send to sidebar chat"-Button uebertraegt die Conversation (alle Bubbles, Settings-Snapshot, Attachments) in den Sidebar; nach Klick ist die Sidebar offen, zeigt die Conversation identisch, der Composer ist fokussiert | Nach Klick max 500 ms bis Sidebar-Anzeige steht | Manual + Integration-Test gegen TransferService |
| SC-09 | Settings-Toggle "Inline chat display" mit Optionen "Block widget in editor" (Default) und "Floating popover" persistiert in `data.json`. Bestaetigung wirkt ab dem naechsten Inline-Chat-Trigger ohne Plugin-Reload. | Settings-Aenderung greift ohne Reload | Manual + Unit-Test gegen `resolveInlineActionsSettings` |
| SC-10 | Sowohl Block-Widget- als auch Popover-Variante zeigen exakt dieselben Capabilities (Composer, Skills, Prompts, Workflows, MCP, Model-Picker, Send-to-Sidebar, Markdown-Rendering, Tool-Approval). Switch zwischen Varianten aendert nur die Mount-Position, nicht den Funktionsumfang. | 100 Prozent Capability-Identitaet | Capability-Matrix-Test gegen beide Adapter |

## Technical NFRs

- **Performance:** Block-Widget-Mount + Initial-Render unter 50 ms gemessen ab `triggerPanel`-Aufruf. Streaming-Updates ohne `requestMeasure`-Storm (max 1 measure pro Bubble-Append, debounced).
- **Memory:** Kein Leak nach Close -- alle DOM-Listener im Widget-`destroy()` abgeraeumt; PanelChatController.dispose() greift weiter wie heute.
- **Mobile / kleine Viewports:** Widget rendert full-width im Editor-Container, scrollt intern statt den Editor wegzuschieben.
- **A11y:** Widget ist focusable, Esc schliesst, Tab navigiert in den Composer.

## Architecture considerations

### Aktueller Mount-Pfad (Stand 2026-06-24)

`InlineChatOrchestrator.triggerPanel()` (`src/core/inline/chat/InlineChatOrchestrator.ts:148`) liest `editorProbe.getPanelContainer()` + `getPanelPosition()` und instanziiert `new InlineChatPanel({ container, position })`. Container ist `MarkdownView.contentEl`, Position ist absolut.

### Neuer Mount-Pfad (FEAT-33-12)

Mount-Strategie wird hinter einem Adapter abstrahiert:

```
interface InlineChatMountAdapter {
  canMount(view: MarkdownView): { ok: true } | { ok: false; reason: 'reading-view' | 'no-cm' };
  mount(view: MarkdownView, content: HTMLElement, onClose: () => void): InlineChatMountHandle;
}

interface InlineChatMountHandle {
  setHeight(): void;   // request a CM measure after content size changes
  destroy(): void;     // remove decoration + DOM
}
```

Implementierungen:

- `CodeMirrorBlockMount` (Default) -- nutzt `Decoration.widget({ widget, block: true, side: 1 })` an Offset `selectionTo`. Mount via `StateField<DecorationSet>` + `StateEffect` `addInlineChat` / `removeInlineChat`. `setHeight()` ruft `view.requestMeasure()`. `canMount` liefert `{ ok: false, reason: 'reading-view' }` in Reading-View.
- `OverlayPopoverMount` -- duenne Wrapper-Klasse, die das bestehende `InlineChatPanel` aus FEAT-33-05 instanziiert. `canMount` ist in allen Modi `ok: true`. Existierender Code (`src/core/inline/chat/InlineChatPanel.ts`) bleibt unveraendert und wird NICHT durch den Refactor geloescht.

Der aktive Adapter wird vom Wiring (`PluginWiring.ts`) pro Trigger aus dem User-Setting `inlineActions.inlineChatDisplay` ausgewaehlt und in den Orchestrator injiziert. Dynamische Auswahl pro Trigger (statt einmal beim Plugin-Load), damit Setting-Aenderungen ohne Reload greifen.

Settings-Type-Erweiterung in `InlineActionsSettings`:

```
inlineChatDisplay?: 'cm-block-widget' | 'popover-overlay';  // Default 'cm-block-widget'
```

Settings-UI-Erweiterung in `InlineActionsTab`: neue Dropdown "Inline chat display" mit den zwei Optionen, Default Hinweis "Block widget is recommended for source/live-preview editors. Switch to Popover if you frequently work in reading view or prefer a floating panel."

### ADR-Bezug

- **ADR-139 (CodeMirror-6 Inline-Diff-Renderer):** existierende StateField+StateEffect-Pattern wird wiederverwendet. Neues StateField fuer das Block-Widget ist additiv und kollidiert nicht mit dem Diff-Decoration-Pattern (Diff = mark/widget inline, Inline-Chat = widget block).
- **ADR-138 (Sidebar-Independence):** unberuehrt -- `PanelChatController` + `AgentTaskRunner` bleiben identisch.

### Sidebar-Parity (US-33-12-04)

Heutiger Stand: `PanelChatController` (Inline) und `AgentSidebarView` (Sidebar) nutzen seit 2026-06-22 denselben `AgentTaskRunner` aus `src/core/agent/AgentTaskRunner.ts`. `buildPanelSurface` in `PluginWiring.ts` bauet eine Panel-Surface mit denselben Pickern (Skills, Prompts, Workflows, MCP, Model) wie `AgentSidebarView.wireXxx`-Methoden. Identitaet ist also bereits implementiert.

Anforderung FEAT-33-12: dieser Stand wird im Refactor NICHT auseinanderlaufen. Konkret:
- Beim Block-Widget-Mount wird derselbe `buildPanelSurface(plugin, panelRoot, chipBar)` aufgerufen wie heute -- der Funktions-Vertrag bleibt unveraendert, nur `panelRoot` zeigt jetzt in den CM6-Widget-Wrapper.
- Ein neuer Test (`SidebarParity.test.ts`) verifiziert per Capability-Matrix, dass die Inline-Surface und die Sidebar-Surface dieselben Menue-Eintraege, Picker-Slots und Streaming-Pfade haben. Drift wird durch Test-Failure sichtbar.

### Live-Handoff Inline -> Sidebar (US-33-12-05)

Neuer Service `InlineToSidebarTransferService` mit:

```
interface InlineToSidebarTransferService {
  canTransfer(panelState: PanelChatState): { ok: true } | { ok: false; reason: 'stream-active' | 'sidebar-busy' };
  transfer(panelState: PanelChatState): Promise<void>;
}
```

`PanelChatState` enthaelt die laufende Conversation (alle Messages mit Bubble-Metadaten), den Settings-Snapshot, aktive Skill-/Prompt-/Workflow-Wahl, Attachments, Model-Override, Thinking-Override.

`transfer()` orchestriert:
1. Sidebar-View oeffnen (`plugin.activateView()`).
2. Sidebar-Belegungs-Check + Handoff (siehe naechster Absatz).
3. Sidebar bietet eine neue Methode `importConversation(state: PanelChatState): void` an. Sidebar mountet die Bubbles in der Reihenfolge der `state.messages`, setzt Model/Thinking-Overrides, restored Skill/Prompt/Workflow-Pins, restored Attachment-Liste.
4. Sidebar-Composer fokussieren.
5. Inline-Widget schliessen (Orchestrator.dispose des aktiven Widgets).
6. Memory-Save wie heute (kein Doppel-Save, kein Datenverlust).

Subtlety: die Inline-Conversation existiert bereits als History-Eintrag (via Memory-System). Der Transfer ist also kein "neuen History-Eintrag anlegen" sondern "Sidebar lebt jetzt auf demselben Conversation-ID-Slot weiter". Im Sidebar-Composer ist nach Transfer der naechste User-Turn die Fortsetzung der Inline-Konversation, nicht ein neuer Thread.

### Sidebar-Belegt-Behavior (User-Entscheidung 2026-06-24)

Der Handoff hat zwei Fallunterscheidungen am Ziel-Slot:

| Sidebar-Zustand | Verhalten beim Handoff |
|---|---|
| leer / kein aktiver Chat | Importierter Chat oeffnet sich direkt im Vordergrund. |
| aktiver Chat idle (kein laufender Stream/Tool) | Aktiver Chat wird in History persistiert (existierende Memory-Mechanik), importierter Chat oeffnet sich im Vordergrund. Der gespeicherte Chat bleibt ueber History wiederherstellbar. |
| aktiver Chat busy (Stream/Tool aktiv) | **Beide Chats laufen parallel weiter.** Der busy Chat darf NICHT abgebrochen werden -- der Handoff oeffnet einen NEUEN Chat-Slot im Sidebar (eigener AgentTaskRunner, eigener Loop, eigene Model-Calls). Der importierte Chat ist im Vordergrund, der vorherige laeuft im Hintergrund weiter und ist umschaltbar. |

Der dritte Fall (parallele Chats) braucht eine Multi-Chat-Faehigkeit in der Sidebar, die heute NICHT existiert. Diese Faehigkeit ist als eigenes Feature ausgegliedert:

- **FEAT-33-13 (Multi-Chat-Sessions in Sidebar)** -- Voraussetzung fuer den parallel-Fall. FEAT-33-12 ist mit FEAT-33-13 voll funktional; ohne FEAT-33-13 faellt der parallel-Fall auf ein Warning-Modal zurueck ("Sidebar chat is busy. Wait for it to finish or cancel it to receive the inline chat.").

FEAT-33-12 implementiert den Handoff zunaechst mit Fallback-Warning-Modal fuer den busy-Fall. Sobald FEAT-33-13 fertig ist, wird das Modal durch das parallele Oeffnen ersetzt -- der Eingriff ist auf den TransferService isoliert.

UI-Affordance (User-Entscheidung 2026-06-24):
- Button "Send to sidebar chat" mit `arrow-right-to-line` Icon (Lucide), platziert **direkt neben dem Send-Button im Composer** (nicht im Header).
- Hotkey: Cmd+Shift+S (Mac), Ctrl+Shift+S (Win/Linux), konfigurierbar via Obsidian-Hotkey-Settings.
- Tooltip: "Continue this chat in the sidebar".
- Button-State: enabled wenn `canTransfer()` -> `ok: true` (= AgentTaskRunner idle); sonst greyed-out mit Tooltip "Waiting for the current response to finish" oder "Sidebar chat is busy" (siehe Sidebar-Belegt-Behavior).

### ADR-Bezug

- **ADR-139 (CodeMirror-6 Inline-Diff-Renderer):** existierende StateField+StateEffect-Pattern wird wiederverwendet. Neues StateField fuer das Block-Widget ist additiv und kollidiert nicht mit dem Diff-Decoration-Pattern (Diff = mark/widget inline, Inline-Chat = widget block).
- **ADR-138 (Sidebar-Independence):** unberuehrt -- `PanelChatController` + `AgentTaskRunner` bleiben identisch. Im Gegenteil: der Transfer-Service nutzt die Sidebar-Independence aus (Conversation laeuft im selben AgentTaskRunner-Vertrag in beiden Surfaces).

### Open questions for architect

1. Soll der Block-Widget-Mount waehrend des Streamings nach jedem Bubble-Update CM measuren, oder rAF-coalesced einmal pro Frame? (Letzteres empfohlen.)
2. Bei `editor.replaceRange()` durch die Rewrite-Action: bleibt das Block-Widget stabil, oder muss die Decoration neu positioniert werden? (Test mit InlineDiffEngine noetig.)
3. Wo lebt der "active widget"-State, damit nur ein Widget pro Editor offen ist? Orchestrator-private Map oder CM6-StateField mit Single-Item-Guarantee?
4. Mid-Stream-Handoff: **entschieden** -- Handoff nur wenn AgentTaskRunner idle. Button disabled solange Activity laeuft.
5. Sidebar bereits belegt: **entschieden** -- idle = save-and-foreground; busy = parallel-Chat (via FEAT-33-13) bzw. uebergangsweise Warning-Modal.
6. `AgentTaskRunner.isIdle()`: existiert die Methode schon, oder muss sie als duenne Probe eingefuehrt werden? (Vermutlich neu, klein, additiv.)

## Definition of Done

### Activation Path (mandatory)

- **Type:** UX-Refactor, kein neuer User-Flow.
- **Identifier:** Bestehender Inline-Chat-Hotkey + Command-Palette-Eintrag.
- **Where:** Aktives MarkdownView im Source- oder Live-Preview-Modus.
- **How:** User markiert Text, drueckt Hotkey, Chat-Widget oeffnet sich unterhalb der Selektion und schiebt Folgezeilen nach unten. In Reading-View erscheint stattdessen die Notice.

### Functional checklist

- [ ] `InlineChatMountAdapter` Interface + zwei Implementierungen (`CodeMirrorBlockMount`, `OverlayPopoverMount`) liegen unter `src/core/inline/chat/mount/`
- [ ] `InlineChatOrchestrator.triggerPanel()` ruft den ueber Settings ausgewaehlten Adapter, statt direkt `new InlineChatPanel({position})`
- [ ] Settings-Feld `inlineChatDisplay` mit Default `'cm-block-widget'` in `InlineActionsSettings`
- [ ] Settings-UI in `InlineActionsTab` zeigt Dropdown "Inline chat display" mit zwei Optionen
- [ ] Setting-Aenderung greift ohne Plugin-Reload (Adapter-Auswahl pro Trigger)
- [ ] Im Block-Widget-Modus: Reading-View-Trigger erzeugt Notice "Switch to editor view, or change inline chat display to Popover in settings" und kehrt zurueck (kein Mount)
- [ ] Im Popover-Modus: Mount funktioniert in allen Modi (incl. Reading)
- [ ] Block-Widget verschwindet vollstaendig bei Close (Esc, Composer-Close-Button)
- [ ] Cursor und Selektion bleiben unveraendert beim Open + Close
- [ ] Streaming-Updates passen die Widget-Hoehe stabil an (kein Layout-Stocker)
- [ ] Bestehender Apply/Reject-Diff-Flow funktioniert unveraendert weiter
- [ ] **Bestehende `InlineChatPanel`-Klasse bleibt erhalten** und wird vom `OverlayPopoverMount` weitergenutzt -- KEIN Loeschen, KEINE Markierung als deprecated
- [ ] "Send to sidebar chat"-Button direkt neben dem Send-Button im Composer + Hotkey (Cmd+Shift+S); identisch in beiden Mount-Varianten
- [ ] Button enabled-State haengt an `AgentTaskRunner.isIdle()` (Live-Probe). Tooltip-Texte beim Disable: "Waiting for the current response to finish" bzw. "Sidebar chat is busy".
- [ ] `InlineToSidebarTransferService` implementiert: Sidebar oeffnen, Conversation-State importieren, Inline-Widget schliessen, Composer fokussieren
- [ ] Sidebar-View bietet `importConversation(state)`-Methode
- [ ] Sidebar-leer + Sidebar-idle Faelle: aktiver Chat wird in History persistiert, importierter Chat im Vordergrund
- [ ] Sidebar-busy Fall: zunaechst Warning-Modal-Fallback ("Sidebar chat is busy. Wait for it to finish or cancel it to receive the inline chat."). Wird durch FEAT-33-13 (parallele Chats) abgeloest.
- [ ] Sidebar-Parity-Test `SidebarParity.test.ts` verifiziert identische Capability-Matrix Inline vs. Sidebar (Skills, Prompts, Workflows, MCP, Model-Picker, Tool-Approval, Markdown-Render)

### Quality checklist

- [ ] **Sidebar-Independence-Check:** Inline-Chat-Block-Widget funktioniert mit geschlossener Chat-Sidebar.
- [ ] Unit-Tests fuer `CodeMirrorBlockMount`: Mount fuegt Decoration ein, Destroy entfernt sie, `setHeight` triggert kein zusaetzliches Mount.
- [ ] Unit-Tests fuer `NoOpReadingMount`: `canMount` liefert reason `reading-view`, Orchestrator handhabt das ohne Notice-Loop.
- [ ] Manueller Test in Source, Live-Preview, Reading.
- [ ] Manueller Test mit langer Antwort (>50 Zeilen), Streaming.
- [ ] Bot-Compliance: kein innerHTML, keine direkte Style-Mutation, kein fetch, kein require.
- [ ] UI in Englisch, Notice-Text "Switch to editor view to use inline chat".
- [ ] tsc + ESLint clean fuer geaenderte Dateien.

### Documentation checklist

- [ ] arc42 Section 9 ergaenzt um Mount-Adapter-Pattern, falls noch nicht durch ADR-139 abgedeckt
- [ ] Release-Notes-Eintrag "Inline chat now opens as an in-editor block widget"
- [ ] docs/guides/inline-chat.md (falls existent) aktualisiert um Reading-View-Hinweis

## Hypothesis validation

Validiert keine eigene Hypothese -- ist Foldback zu H-02 (Floating-Menu-Visibility) und H-06 (Sidebar-Independence). Konkret: das Overlay-Mount-Verhalten war ein UX-Kompromiss in Welle 1, der durch CM6-Decorations sauberer loesbar ist.

## Dependencies

- **FEAT-33-01 Trigger-Layer:** Orchestrator + Editor-Probe.
- **FEAT-33-05 Inline-Chat:** Panel-Surface bleibt der zu mountende Inhalt; `InlineChatPanel`-Klasse wird vom `OverlayPopoverMount` weitergenutzt.
- **FEAT-33-13 (soft):** Multi-Chat-Sessions in Sidebar fuer den vollen parallel-Handoff-Fall. FEAT-33-12 ist mit Warning-Modal-Fallback eigenstaendig fertigstellbar.

## Assumptions

- CM6 ist in der aktuellen Obsidian-Version Standard (gilt seit 1.0). Source + Live-Preview garantieren beide CM6-Instanzen.
- `view.editor.cm` (Inoffiziell) liefert die EditorView. Falls Obsidian das in einer kuenftigen Version blockiert, weichen wir auf `(view as any).editMode.editor.cm` aus -- bekannte Workarounds existieren.

## Out of scope

- Loeschung der bestehenden `InlineChatPanel`-Klasse -- bleibt erhalten als Popover-Backend.
- Reading-View-Fallback via DOM-Inject im Block-Widget-Modus (User wechselt stattdessen ins Setting auf Popover, der dort funktioniert).
- Mobile-spezifische Anpassungen ueber "scrollt intern statt Editor wegzuschieben" hinaus.
- Mehrere parallele Block-Widgets im selben Editor (Single-Widget-per-Editor-Guarantee).
- Persistenz des Widget-Inhalts ueber Tab-Switch hinweg (Close-on-blur bleibt wie heute).
- Mid-Stream-Handoff in den Sidebar (default: Stream im Inline fertig machen, dann transferierbar; siehe Open Question 4).

## Code Pointer

- Mount-Adapter neu: `src/core/inline/chat/mount/InlineChatMountAdapter.ts`, `CodeMirrorBlockMount.ts`, `OverlayPopoverMount.ts`
- Transfer-Service neu: `src/core/inline/chat/InlineToSidebarTransferService.ts`
- Anpassung: `src/core/inline/chat/InlineChatOrchestrator.ts` (Adapter-Auswahl pro Trigger via Settings)
- Anpassung: `src/core/inline/PluginWiring.ts` (Adapter-Wiring + TransferService-Wiring)
- Anpassung: `src/ui/AgentSidebarView.ts` (neue `importConversation(state)`-Methode)
- Anpassung: `src/ui/settings/InlineActionsTab.ts` (neues "Inline chat display"-Dropdown)
- Anpassung: `src/types/settings.ts` (neues Feld `inlineChatDisplay`)
- Anpassung: `src/core/inline/inlineSettings.ts` (Default `cm-block-widget`)
- Referenz: `src/core/inline/diff/CodeMirrorDiffAdapter.ts` (existierendes StateField+StateEffect-Pattern, ADR-139)
- Referenz: `src/core/inline/chat/InlineChatPanel.ts` (Inhalts-Bauer, bleibt unveraendert -- vom `OverlayPopoverMount` weitergenutzt)
