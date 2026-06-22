---
id: FEAT-33-01
title: Trigger-Layer (Floating-Menu + Hotkey + Command-Palette)
epic: EPIC-33
subtype: user-facing
priority: P0
effort: M
asr-refs: [ASR-EPIC-33-01, ASR-EPIC-33-06]
adr-refs: []
depends-on: []
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# Feature: Trigger-Layer (Floating-Menu + Hotkey + Command-Palette)

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-33-01
> (status, phase, claim, last-change live there).

## Feature description

Der Power-User-Wissensarbeiter markiert taeglich Text im Editor und wechselt heute fuer jede AI-Aktion vier Mal den Kontext: Selection -> Sidebar oeffnen -> Selection erneut einfuegen -> Prompt formulieren. Der Trigger-Layer setzt diesen Bruch an der Wurzel an, indem er drei einheitliche Eintrittspunkte fuer alle Inline-Actions des EPIC-33 bereitstellt: ein Floating-Menu, das nach einer Text-Markierung direkt am Cursor erscheint, einen rebindbaren Hotkey (Default Cmd+K auf macOS, Ctrl+K auf Win/Linux) und einen Command-Palette-Eintrag "Vault Operator: Open inline AI menu". Alle drei Pfade muenden in denselben Trigger-Resolver, der ein triggerContext-Objekt fuer den nachgelagerten Action-Dispatcher erzeugt.

Das triggerContext-Objekt buendelt die fuer alle EPIC-33-Actions benoetigten Eingaben an genau einer Stelle: markierter Text, Editor-Mode (Source/Preview/Live), Cursor-Position, Note-Pfad und ein Settings-Snapshot, der Modell, Provider, Skills und Prompts zum Trigger-Zeitpunkt aus dem Main-Chat-State liest. Damit erfuellt der Layer den Cross-FEAT-Constraint "Settings-Snapshot zum Trigger-Zeitpunkt" (ASR-EPIC-33-06) zentral und liefert spaeteren Per-Action-Pins aus FEAT-33-10 eine definierte Overlay-Stelle. Der Layer selbst ist sidebar-unabhaengig: die Aktivierung haengt am CodeMirror-Selection-Event und am Obsidian-Hotkey-Bus, nicht an einem geoeffneten Chat-View. Settings-Surface deckt Floating-an/aus, Hotkey-Customization und die Reihenfolge der Floating-Menu-Eintraege ab.

## Benefits hypothesis

**We believe that** ein einheitlicher Trigger-Layer mit Floating-Menu als Default-UX, Hotkey-Konsens (Cmd+K) und Command-Palette-Eintrag

**delivers the following measurable outcomes:**

- Eliminiert die vier Context-Switches pro AI-Aktion auf dem ersten Reibungspunkt: vom markierten Text zum Trigger gibt es genau einen Schritt
- Reduziert die Time-to-First-Action (Selection bis sichtbares Action-Menu) auf <100ms, vergleichbar mit Cursor Cmd+K und InlineAI
- Stoert das normale Kopieren und Verschieben von Text nicht (BA-Need N-06): die Default-Settings unterdruecken das Floating-Menu nicht haerter als noetig, lassen es aber explizit abschaltbar

**We know we are successful when:**

- Im realen Tagesgebrauch eines Power-Users laeuft mindestens eine Inline-Action pro aktive Editor-Session ueber den Floating-Menu-Pfad (Telemetrie via OperationLogger, sofern Opt-in aktiviert)
- Kein User-Report aus der Beta-Phase nennt das Floating-Menu als hinderlich beim Copy-Workflow (Validierung H-01)
- Hotkey Cmd+K loest auf macOS und Ctrl+K auf Win/Linux das Action-Menu in <100ms ab gemessener Selection-Event-Zeit
- Der Command-Palette-Eintrag "Vault Operator: Open inline AI menu" ist mit Standard-Obsidian-Fuzzy-Search auffindbar und triggert dieselbe UI wie der Hotkey

## Jobs to be Done (from BA Section 5.4)

| Job type   | Job                                                                                                          | Addressed in story |
|------------|--------------------------------------------------------------------------------------------------------------|--------------------|
| Functional | Eine AI-Aktion auf markiertem Text starten, ohne den Editor zu verlassen oder die Sidebar zu oeffnen        | Story 1            |
| Emotional  | Im Schreibfluss bleiben, weil die AI-Aktion da erscheint, wo der Blick gerade ist                            | Story 2            |
| Social     | Den eigenen Workflow als modern und konkurrenzfaehig zu Cursor/Notion erleben, ohne Hotkey-Krieg im Editor   | Story 3            |

## User stories

### Story 1: Floating-Menu erscheint nach der Markierung (Functional Job)

**As a** Power-User-Wissensarbeiter
**I want to** nach dem Markieren eines Textabschnitts ein kompaktes Action-Menu direkt am Cursor sehen
**so that** I can accomplish die naechste AI-Aktion mit einem Klick, ohne die Sidebar zu oeffnen oder die Selection neu einzufuegen

### Story 2: Hotkey-Pfad fuer den Schreibfluss (Emotional Job)

**As a** Power-User mit hoher Tastatur-Affinitaet
**I want to** nach der Markierung Cmd+K druecken und das Action-Menu sofort an der Cursor-Position sehen
**so that** I experience den Editor als fluessig und kann den Floating-Menu-Default in den Settings deaktivieren, ohne den Trigger-Zugang zu verlieren

### Story 3: Command-Palette als dritter Pfad (Functional + Social Job)

**As a** Power-User der die Obsidian-Command-Palette als zentralen Aktions-Hub nutzt
**I want to** unter "Vault Operator: Open inline AI menu" denselben Trigger erreichen wie ueber Hotkey und Floating-Menu
**so that** I can accomplish die Aktion auch in Situationen, in denen Hotkey-Konflikte mit anderen Plugins bestehen, und der Plugin-Eintrag in der Palette als gleichwertig zu Notions Slash-Menu wirkt

---

## Success criteria (tech-agnostic)

> Keine Technologie-Begriffe. CodeMirror, Selection-Events, Obsidian-API-Klassen und konkrete ms-Werte stehen in den Technical NFRs.

| ID    | Criterion                                                                                                                   | Target                                                | Measurement |
|-------|-----------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------|-------------|
| SC-01 | Nach einer Text-Markierung erscheint das Action-Menu am Cursor, ohne dass der User die Sidebar oeffnet                      | 100% der Trigger-Versuche, sofern Floating aktiv      | Integration-Test mit simulierter Selection plus manueller Live-Test im User-Vault |
| SC-02 | Ein Hotkey loest dasselbe Action-Menu aus wie das Floating-Menu                                                              | Identisches triggerContext-Objekt, identische UI       | Unit-Test auf den Trigger-Resolver plus Snapshot-Vergleich der UI-Inputs |
| SC-03 | Der Command-Palette-Eintrag fuehrt zum gleichen Action-Menu wie Hotkey und Floating                                          | Identisches triggerContext-Objekt                      | Unit-Test plus manuelle Verifikation in Obsidian-Palette |
| SC-04 | Das Floating-Menu stoert Copy- und Verschiebe-Workflows nicht haerter als ein einzelner Klick es loesen kann                | Floating verschwindet bei Selection-Loss oder ESC      | UI-Test plus User-Feedback in Beta-Phase (H-01) |
| SC-05 | Der Trigger-Resolver liest einen Settings-Snapshot zum Trigger-Zeitpunkt, der Modell, Provider, Skills und Prompts enthaelt | Snapshot vollstaendig, immutable fuer die Aktion       | Unit-Test mit veraendertem Main-Chat-State zwischen Trigger und Action-Ausfuehrung |
| SC-06 | Das Action-Menu funktioniert mit geschlossener Chat-Sidebar                                                                  | 100% der drei Trigger-Pfade                            | Integration-Test bei explizit geschlossener Sidebar plus manueller Live-Test |
| SC-07 | Das Floating-Menu kollidiert nicht sichtbar mit der Obsidian-internen Format-Toolbar                                         | Keine Ueberlappung in Standard-Themes                  | UI-Test in mindestens drei populaeren Themes plus User-Sichtpruefung |

---

## Technical NFRs (for the architect): technology terms allowed

### Performance

- Trigger-Resolver-Overhead auf jedem Selection-Event: <5ms (Selection-Events feuern in Obsidian bei jeder Cursor-Bewegung in markiertem Text). Implementierung debounced, damit der CodeMirror-Event-Loop nicht spuerbar wird
- Time-to-First-Action: <100ms zwischen Hotkey-Druck oder Floating-Trigger und sichtbarer Menu-DOM-Insertion (gemessen ohne ein nachgelagertes AI-Tier, das ist FEAT-Sache der einzelnen Actions)
- triggerContext-Aufbau (inkl. Settings-Snapshot-Lesen) <10ms, weil der Snapshot nur Referenzen aus dem Main-Chat-State buendelt und keine LLM-Calls aktiviert

### Security

- Kein neuer Trust-Boundary-Crossing: Trigger-Layer ruft keinen externen Provider auf, er reicht nur den triggerContext weiter
- triggerContext darf keine Provider-Credentials enthalten; nur Modell-ID, Provider-ID und referenzierte Skill-IDs, die Credentials liegen weiterhin im Provider-Layer
- Bot-Compliance: Floating-Menu nutzt `createEl`/`createDiv` aus Obsidian-DOM-API, keine innerHTML-Mutation und keine direkten `element.style.X = Y`-Zuweisungen

### Scalability

- Floating-Menu-Eintraege sind durch Settings konfigurierbar (Reihenfolge plus an/aus). Die initiale Menge sind die EPIC-33-Actions; das Layer-Design erlaubt das Hinzufuegen weiterer Actions, ohne den Resolver zu aendern
- Hotkey-Customization laeuft ueber die Obsidian-Hotkey-Settings, der Plugin-Code registriert nur die Command-Definition mit Default-Binding

### Availability

- Selection-Event-Listener entkoppelt vom Sidebar-View: bei geschlossenem Chat-View existiert kein Workspace-Leaf-Dependency
- Trigger-Layer ist beim ersten Plugin-Load verfuegbar; keine asynchrone Indexierung haengt am Layer

### Compliance with Cross-FEAT-Constraints

- Sidebar-Independence (Constraint 1): erfuellt durch Selection-Event-Wiring auf den aktiven Markdown-View, unabhaengig von Workspace-Leaves
- Settings-Snapshot zum Trigger-Zeitpunkt (Constraint 2): triggerContext-Objekt erzeugt den Snapshot synchron beim Trigger-Event
- Cost-aware Tier-Routing (Constraint 4): Trigger-Layer fuehrt das Routing nicht selbst aus, reicht aber den Settings-Snapshot weiter, aus dem die Action-Dispatcher den Tier ableiten

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR-EPIC-33-01:** Sidebar-Independence der Trigger-Pfade

- Why ASR: Der gesamte EPIC-33 steht und faellt mit der Sidebar-Unabhaengigkeit. Ein Wiring an den ChatView oder ein Workspace-Leaf-Dependency wuerde den Hauptnutzen (kein Context-Switch) brechen. Der Trigger-Layer ist der erste Einstiegspunkt, an dem diese Trennung architektonisch erzwungen werden muss
- Impact: Selection-Listener registriert am aktiven Markdown-View, nicht am Sidebar-Workspace-Leaf. Hotkey-Command registriert via Obsidian-Plugin-Command-API ohne View-Constraint. Command-Palette-Eintrag ohne `checkCallback`-Constraint, der auf ein Sidebar-Leaf prueft
- Quality attribute: Availability + Usability

**CRITICAL ASR-EPIC-33-06:** Settings-Snapshot-Lifecycle

- Why ASR: Der User aendert seine Main-Chat-Settings (Modell, Skills, Prompts) waehrend des Tages. Eine Inline-Action darf nicht plotzlich mit einem anderen Modell laufen, weil die Trigger-Resolution mehrere Sekunden Verzoegerung zwischen Trigger und Action-Start hat. Der Snapshot muss exakt zum Trigger-Moment fixiert sein
- Impact: triggerContext-Objekt muss immutable sein und einen Deep-Copy der relevanten Settings-Felder halten, nicht eine Live-Referenz auf den Main-Chat-State. FEAT-33-10 (Per-Action-Pin) baut auf diesem Snapshot auf und ueberschreibt ihn pro Action
- Quality attribute: Correctness + Predictability

**MODERATE ASR-EPIC-33-01-A:** Format-Toolbar-Koordination

- Why ASR: Obsidian rendert seit der LiveSelection-Phase eine eigene Format-Toolbar bei Text-Markierung (Bold, Italic, Link). Ein Floating-Menu, das die gleiche Position einnimmt, ueberlappt sich entweder oder verdraengt die Format-Toolbar. Beide Faelle sind UX-Bugs
- Impact: Floating-Menu-Renderer muss die Format-Toolbar-Position erkennen und vertikal versetzt rendern (oberhalb oder unterhalb, je nach verfuegbarem Platz). ADR-Bedarf fuer die Erkennungs-Strategie (DOM-Query vs. Event-Subscription)
- Quality attribute: Usability

### Constraints

- Technology: Obsidian-Plugin-API (CodeMirror 6 als Editor-Engine), Plugin-Command-API fuer Hotkey-Registrierung, Workspace-API fuer aktiven Markdown-View
- Platform: Desktop-Default, Mobile-Support nicht in EPIC-33-Welle-1 (Mobile-Companion ist EPIC-27)
- Compliance: Bot-Compliance-Rules aus `memory/review-bot-compliance.md`

### Open questions for architect

- **Floating-Menu-Renderer:** als CodeMirror-Decoration (Inline-Widget) oder als HTMLElement-Overlay auf dem MarkdownView-Container? Decoration ist scroll-stabil und repositioniert sich automatisch, Overlay ist flexibler im Styling
- **Selection-Event-Quelle:** CodeMirror-`update`-Listener mit Selection-Diff oder Workspace-`active-leaf-change`-Listener plus interne Selection-Polling-Schicht? CodeMirror-Native ist die Bot-Compliance-konformere Variante
- **Hotkey-Default:** Cmd+K kollidiert auf macOS mit dem Standard-Obsidian-"Insert Link"-Hotkey. Pruefen, ob Cmd+K wirklich der richtige Default ist oder ob ein konfliktfreier Default (z.B. Cmd+Shift+I) besser passt, mit Empfehlung im Onboarding
- **Settings-Snapshot-Aufbau:** Deep-Copy von welchen Feldern? Modell-ID, Provider-ID, aktive Skills, System-Prompt-Text sind sicher; Mode-ID und Tool-Whitelist sind diskussionsbeduerftig
- **Format-Toolbar-Erkennung:** DOM-Query auf einen Obsidian-internen CSS-Selektor (fragil bei Updates) oder Subscription auf einen offiziellen Workspace-Event? Letzteres existiert moeglicherweise nicht in der oeffentlichen API
- **Settings-Surface:** wo verankern? Eigene Settings-Tab-Section "Inline Actions" oder Sub-Section unter "Editor"? Die Reihenfolge der Floating-Menu-Eintraege braucht eine Reorder-UI

---

## Definition of Done

### Activation Path (mandatory)

- **Type:** Compound (Floating-Menu plus Hotkey plus Command-Palette)
- **Identifier:** `vault-operator:open-inline-ai-menu` (Command-ID), Hotkey-Default `Cmd+K` (macOS) / `Ctrl+K` (Win/Linux), Floating-Menu auto-aktiviert bei Selection
- **Where:** Aktiver Markdown-View, sowohl Source- als auch Live-Mode; Command-Palette unter "Vault Operator: Open inline AI menu"
- **How:**
  1. User markiert Text im Editor
  2. Floating-Menu erscheint am Cursor (sofern Settings `floatingMenuEnabled = true`), ODER User drueckt Hotkey, ODER User oeffnet Command-Palette und sucht "Vault Operator: Open inline AI menu"
  3. Trigger-Resolver buendelt triggerContext-Objekt (Selection-Text, Editor-Mode, Cursor-Position, Note-Pfad, Settings-Snapshot)
  4. Action-Menu erscheint mit den konfigurierten EPIC-33-Actions; Auswahl einer Action dispatcht den triggerContext an den jeweiligen Action-Handler

### Functional

- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria SC-01 bis SC-07 erfuellt
- [ ] Floating-Menu, Hotkey und Command-Palette dispatchen denselben Trigger-Resolver
- [ ] Settings-Surface mit floatingMenuEnabled (bool, default true), Hotkey-Customization via Obsidian-Hotkey-Settings, Floating-Menu-Reihenfolge als Reorder-Liste
- [ ] **Sidebar-Independence-Check:** Alle drei Trigger-Pfade funktionieren mit explizit geschlossener Chat-Sidebar (verifiziert per Integration-Test plus manueller Live-Test)
- [ ] Floating-Menu verschwindet bei Selection-Loss oder ESC, ohne Workflow-Stoerung

### Quality

- [ ] Unit Tests: Trigger-Resolver liefert fuer alle drei Trigger-Pfade identisches triggerContext bei gleichem Editor-State
- [ ] Unit Tests: Settings-Snapshot ist immutable und veraendert sich nicht bei nachgelagertem Main-Chat-State-Change
- [ ] Integration Tests: Trigger-Pfade funktionieren in Source-Mode und Live-Mode, mit und ohne geoeffnete Sidebar
- [ ] UI Tests: Floating-Menu kollidiert nicht sichtbar mit Format-Toolbar in mindestens drei populaeren Themes (Default, Minimal, Things)
- [ ] Performance Tests: Trigger-Resolver-Overhead <5ms auf einem Selection-Event-Burst (10 Events innerhalb 100ms), Time-to-First-Action <100ms
- [ ] Bot-Compliance: kein innerHTML, kein direkter element.style.X, kein fetch, kein require ausserhalb der Allowlist (verifiziert per Review-Bot-Skill)

### Documentation

- [ ] Backlog row updated auf Status `Done`, Commit-SHA recorded
- [ ] ARCHITECTURE.map updated mit neuem Konzept `inline-trigger-layer`
- [ ] ADR fuer Floating-Menu-Renderer-Wahl (Decoration vs. Overlay) akzeptiert
- [ ] ADR fuer Format-Toolbar-Koordinations-Strategie akzeptiert
- [ ] User-Doku unter `docs/guides/` mit Hotkey-Default und Settings-Erklaerung

---

## Hypothesis validation

Dieses Feature validiert drei BA-Hypothesen aus EPIC-33:

- **H-01 (Floating-Menu stoert nicht beim Kopieren):** validiert durch SC-04 plus Beta-Phase-User-Feedback. Ein User-Report, der das Floating-Menu als hinderlich beim Copy-Workflow nennt, falsifiziert H-01 und triggert eine Default-Aenderung (Floating off by default)
- **H-05 (CodeMirror-API traegt Output-Modi):** teilvalidiert durch das Floating-Menu als CodeMirror-Decoration-Render-Pfad. Falls die Decoration-API in Edge-Cases (Scroll-Container-Wechsel, Themes mit Custom-Layout) bricht, kommt das hier zuerst zutage und definiert die Risikoschwelle fuer FEAT-33-02 (Inline-Diff-Renderer)
- **H-06 (Sidebar-Independence):** harter Test-Case. SC-06 plus der Sidebar-Independence-Check in der Functional-DoD validieren oder falsifizieren H-06 direkt. Falls hier ein Workspace-Leaf-Constraint auftaucht, ist EPIC-33 als Ganzes neu zu bewerten

---

## Dependencies

Keine harten FEAT-Abhaengigkeiten. Der Trigger-Layer ist das Substrat, auf dem FEAT-33-02 bis FEAT-33-11 aufbauen.

Weiche Abhaengigkeiten:

- Obsidian-Plugin-Command-API (vorhanden)
- CodeMirror 6 Selection-API (vorhanden via Obsidian-Editor)
- Settings-Service (Main-Chat-State als Snapshot-Quelle, vorhanden in `src/services/`)

## Assumptions

- Obsidian-CodeMirror-Decoration-API ist stabil genug fuer ein Inline-Widget; falls nicht, ist Overlay-Variante der Fallback (ADR entscheidet)
- Der Settings-Service exponiert die Main-Chat-State-Felder (Modell, Provider, Skills, Prompts) lesbar fuer den Trigger-Resolver
- Cmd+K bzw. Ctrl+K ist als Default akzeptabel; sollte ein Konflikt mit Standard-Obsidian-Hotkeys gravierender werden, ist die Default-Aenderung ein Settings-Default-Change, kein Architektur-Change
- Format-Toolbar-Erkennung ist mit DOM-Query oder Workspace-Event in vertretbarem Aufwand machbar

## Out of scope

- Action-Dispatcher und konkrete Inline-Actions (Rewrite, Translate, Summarize, Send-to-Chat usw.) sind FEAT-33-02 bis FEAT-33-09
- Per-Action-Pin von Modell und Skills ist FEAT-33-10
- Mobile-Support (Touch-Selection, kein Hotkey verfuegbar): nicht in EPIC-33-Welle-1, separate Mobile-Companion-Initiative (EPIC-27)
- Telemetrie-Auswertung der Trigger-Nutzung: nutzt bestehenden OperationLogger, kein eigenes Telemetrie-Subsystem
- Onboarding-Flow fuer den Hotkey-Default-Konflikt: separater FEAT-Vorschlag, nicht in dieser FEAT-Spec

---

## Code Pointer (optional, may go stale)

> Der Wayfinder (`src/ARCHITECTURE.map`) ist die Quelle fuer aktuelle Pfade.

ARCHITECTURE.map concept: `inline-trigger-layer` (neu).

Vorbild-Sites im VO-Code, an denen sich der Trigger-Layer orientiert:

- Plugin-Command-Registrierung: `src/main.ts` (bestehende `addCommand`-Aufrufe fuer Sidebar-Toggle und Chat-Open)
- Settings-Snapshot-Lesepfad: `src/services/SettingsService.ts` (Main-Chat-Settings exponiert ueber `getCurrentChatSettings()`)
- Markdown-View-Aktivierung: bestehende Workspace-Leaf-Listener in `src/ui/`
- CodeMirror-Decoration-Vorbild: keine bestehende Decoration im VO-Code, FEAT-33-01 schafft den ersten Anwendungsfall

Neue Code-Sites, die durch FEAT-33-01 entstehen:

- `src/inline/triggerLayer.ts` (Resolver plus triggerContext-Aufbau)
- `src/inline/floatingMenu.ts` (CodeMirror-Decoration-Renderer)
- `src/inline/inlineCommands.ts` (Command-Registrierung plus Command-Palette-Eintrag)
- `src/ui/settings/InlineActionsSettingsTab.ts` (Settings-Surface)
