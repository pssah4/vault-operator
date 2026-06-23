---
id: FEAT-33-08
title: Skills im Floating-Menu (User Skills und Plugin Skills als Inline-Actions)
epic: EPIC-33
subtype: user-facing
priority: P0
effort: M
asr-refs: [ASR-EPIC-33-05]
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# FEAT-33-08: Skills im Floating-Menu (User Skills und Plugin Skills als Inline-Actions)

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-33-08
> (status, phase, claim, last-change leben dort).

## Feature description

Das bestehende Skills-System (User Skills und Plugin Skills mit Manifest und Capabilities) wird als Quelle fuer Inline-Actions geoeffnet. Skills, deren Manifest die neue Capability `inline-action-eligible` traegt, tauchen automatisch im Floating-Menu auf, ohne dass FEAT-33-01 sie hartcodiert kennt. Selection-Text wird als Skill-Input uebergeben, das Ergebnis landet in einem skill-spezifischen Ziel (Preview-Block, Inline-Diff, Side-Panel oder Tooltip), gesteuert durch ein optionales Manifest-Feld `output_mode`.

Das ist der Architektur-Hebel des Vault Operator gegenueber Cursor und Continue (die nur Hotkeys haben) und Obsidian Copilot (das Custom Commands liefert, aber keine Capability-getriebene Plugin-API). Ohne diesen Mechanismus muesste jede neue Inline-Action ueber Code wandern; mit ihm reicht ein Skill-Manifest-Flag. Per-Skill-Toggle in den Settings entscheidet, ob ein eligible Skill tatsaechlich sichtbar ist. Wenn der User mehr als TOP-N Skills im Inline-Menu pinnt, sortiert eine Frequency-Heuristik die uebrigen unter ein "More skills..."-Submenu.

## Benefits hypothesis

**Wir glauben dass** ein Capability-Flag im Skill-Manifest, der automatisch im Floating-Menu erscheint, in Kombination mit per-Skill-Toggle und Frequency-basiertem TOP-N-Limit
**folgende messbare Wirkung erzielt:**

- User koennen eigene Workflows (User Skills) und Plugin-Workflows in unter 60 Sekunden ohne Code-Aenderung in die Inline-Action-Leiste haengen.
- Drittanbieter-Plugins liefern Inline-Actions ohne Vault Operator-Kontaktaufnahme, sobald sie einen Skill mit der Capability publizieren.
- Power-User mit 20+ Skills behalten Uebersicht, weil das Menu maximal 8 sichtbare Eintraege zeigt und der Rest im Submenu liegt.

**Wir wissen dass wir erfolgreich sind, wenn:**

- Ein neu hinzugefuegter User Skill mit `capability: inline-action-eligible` taucht ohne Plugin-Reload nach Skills-Refresh im Floating-Menu auf.
- Plugin Skills mit dem Flag tauchen ebenfalls auf, ohne dass FEAT-33-01-Code aktualisiert werden muss.
- Pro Skill kann der User in den Settings on/off und Reihenfolge setzen, die Reihenfolge ueberlebt Plugin-Restart.

## Jobs to be Done

> Aus BA-EPIC-33 Section 5.4

| Job-Typ | Job | Adressierung in der Story |
|---|---|---|
| Functional | Eigene Workflows ohne Plattform-Hilfe in die Inline-AI-Leiste haengen | Story 1 (User Skill anlegen, Capability setzen, im Menu sehen) |
| Functional | Plugin-Skills von Drittanbietern als Inline-Actions nutzen | Story 2 (Plugin liefert eligible Skill, taucht ohne VO-Update auf) |
| Emotional | Sich nicht eingesperrt fuehlen vom hartcodierten Action-Set | Story 1 + 2 (Open-System-Gefuehl, alles user-erweiterbar) |
| Social | Skills mit Team teilen, das Team bekommt dieselben Inline-Actions sobald sie den Skill importieren | Story 3 (Team-Skill-Share via Vault-Sync) |

## User stories

### Story 1: User Skill in der Inline-Leiste (Functional Job)

**Als** Power-User, der einen eigenen Workflow "Add citations" als User Skill gepflegt hat
**moechte ich** im Skill-Manifest `inline-action-eligible: true` setzen koennen
**damit** "Add citations" automatisch im Floating-Menu auf jeder Selection erscheint, ohne den Plugin-Code zu beruehren.

### Story 2: Plugin Skill als Inline-Action (Functional Job)

**Als** User, der ein Drittanbieter-Plugin mit einem "Generate-flashcard"-Skill installiert
**moechte ich**, dass dieser Skill sofort im Floating-Menu auftaucht, sobald das Plugin geladen ist und der Skill die Eligibility-Capability traegt
**damit** ich keine Plugin-Updates oder Vault Operator-Releases abwarten muss, um die Action zu nutzen.

### Story 3: Skill-Sichtbarkeit kontrollieren (Functional Job)

**Als** User mit 20+ Skills im Vault
**moechte ich** in den Plugin-Settings pro Skill on/off schalten und die ersten 8 Skills priorisieren
**damit** das Floating-Menu nicht ueberfuellt ist und nur meine Top-Workflows zeigt.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Skills mit Eligibility-Flag erscheinen ohne Plugin-Code-Aenderung im Floating-Menu | 100 Prozent eligible Skills sichtbar (oder im Overflow-Submenu) | Manueller Test: 3 User Skills mit/ohne Flag anlegen, Menu pruefen |
| SC-02 | Drittanbieter-Plugin-Skills mit Flag tauchen ohne Vault Operator-Update auf | Plugin liefert Skill, Vault Operator zeigt ihn nach naechstem Skills-Refresh | Manueller Test mit Dummy-Plugin |
| SC-03 | User kann pro Skill on/off und Reihenfolge persistent setzen | Reihenfolge ueberlebt Plugin-Restart und Vault-Wechsel | Manueller Test: 5 Skills sortieren, restart, Reihenfolge intakt |
| SC-04 | Maximal 8 Eintraege im sichtbaren Floating-Menu, Rest im "More skills..."-Submenu | <= 8 sichtbare Buttons bei 20+ eligible Skills | Manueller Test mit 20 Test-Skills |
| SC-05 | Selection-Text wird als Skill-Input uebergeben, Output landet im skill-deklarierten Ziel | 4 Output-Modi funktionieren (Preview-Block, Inline-Diff, Side-Panel, Tooltip) | Test je Output-Modus mit Dummy-Skill |

---

## Technical NFRs

### Performance

- Skills-Lookup beim Floating-Menu-Open: < 30 ms fuer bis zu 50 eligible Skills (in-memory Filter, kein Disk-IO).
- Skill-Trigger bis erstes Output-Token: Tier-Routing greift, Lookup/Translate-aehnliche Skills landen auf Haiku-Tier, Rewrite/Chat-aehnliche Skills auf Default-Tier (Tier-Hint im Manifest, Default per Skill-Typ).
- Frequency-Aggregation laeuft asynchron, nicht im Menu-Open-Pfad.

### Schema-Update

- Skill-Manifest erhaelt zwei neue optionale Felder: `inline_action_eligible: boolean` (Default false) und `output_mode: 'preview-block' | 'inline-diff' | 'side-panel' | 'tooltip'` (Default `preview-block`).
- Optionaler `tier_hint: 'haiku' | 'default'`-Wert in `inline_action`-Sub-Block des Manifests, fuer Cost-Routing.
- Schema-Migration: alte Skills ohne Flag bleiben `inline_action_eligible: false`, kein Breaking Change.

### Security

- Eligible Plugin Skills durchlaufen denselben Capability-Filter wie regulaer aufgerufene Plugin Skills (Permissions-Bridge unveraendert).
- Selection-Text wird nicht persistiert, wenn der Skill `transient: true` deklariert; Default ist `transient: true`.

### Scalability

- Test mit 50 eligible Skills im Vault: Menu-Open < 100 ms, kein UI-Freeze.
- Frequency-Storage als simple Map in den Plugin-Settings, kein Datenbank-Eintrag noetig.

### Availability

- Bei korruptem Skill-Manifest faellt der Skill aus dem Menu, andere Skills bleiben sichtbar (defensive Filter, keine Cascade).
- Console-Warnung pro fehlerhaftem Manifest, kein User-Modal.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR-EPIC-33-05 (Skill-Capability-Filter)**: Eligibility-Lookup muss im Floating-Menu-Open-Pfad synchron sein und darf keinen Disk-IO ausloesen.
- **Warum ASR**: Floating-Menu erscheint laut FEAT-33-01 unter 100 ms nach Selektion. Ein blockierender Manifest-Scan wuerde dieses Budget allein verbrauchen.
- **Impact**: Skills-Service muss eine in-memory Eligibility-Liste pflegen, die bei Skills-Refresh aktualisiert wird, nicht bei jedem Menu-Open.
- **Quality Attribute**: Performance, Reliability.

**MODERATE ASR (Plugin-Skill-Vertrauenskette)**: Drittanbieter-Plugin Skills mit `inline_action_eligible` muessen denselben Capability-Filter wie regulaere Skill-Aufrufe passieren.
- **Warum ASR**: Inline-Position macht Skills prominenter, der Angriffsvektor steigt. Ein Plugin koennte versuchen, ueber Selection-Text-Injection Vault-Operationen anzustossen.
- **Impact**: Capability-Filter aus dem bestehenden Skills-System wird unveraendert wiederverwendet, kein neuer Bypass-Pfad.
- **Quality Attribute**: Security.

### Constraints

- **Schema-Kompatibilitaet**: Alte Skill-Manifeste ohne neue Felder bleiben gueltig (`inline_action_eligible` defaultet auf false). Kein Forced-Migration.
- **Bot-Compliance**: Floating-Menu-Submenu nutzt Obsidian DOM API (`createDiv`, `createEl`), keine `innerHTML`, keine direkte Style-Mutation.
- **Settings-Integration**: Per-Skill-Toggle und Reihenfolge werden im FEAT-33-01-Settings-Surface gerendert, nicht in einem separaten Tab.

### Open Questions fuer Architekt

- Wo lebt die in-memory Eligibility-Liste? Im SkillsService (zentral) oder im InlineActionRegistry (FEAT-33-01)? Empfehlung: SkillsService liefert via Getter, InlineActionRegistry pollt bei Refresh.
- Wie wird die Reihenfolge persistiert? Pro Skill-ID als Array in Settings, oder pro Skill-Slug? Empfehlung: Skill-ID, weil stabil; Slug kann sich aendern wenn User umbenennt.
- Frequency-Aggregation: Sliding-Window (letzte 14 Tage) oder Lifetime? Empfehlung: Sliding-Window 30 Tage, sonst dominieren Initial-Tests die Rangfolge ewig.

---

## Definition of Done

### Activation Path (mandatory)

- **Type**: Skill-Capability + Floating-Menu-Eintrag (pro eligible Skill ein Eintrag, plus Submenu bei Overflow)
- **Identifier**: Manifest-Flag `inline_action_eligible: true`; im Menu sichtbarer Skill-Name aus Manifest-`name`
- **Where**: Floating-Menu nach Text-Selektion im Markdown-Editor (FEAT-33-01-Pfad); zusaetzlich Command-Palette-Eintrag `Vault Operator: Run skill {name} on selection`
- **How**: User aktiviert Skill in Settings (FEAT-33-01-Surface, per-Skill-Toggle). Bei nicht-eligible Skills ist der Toggle disabled mit Hover-Hint "Skill manifest does not declare inline-action-eligible".

### Functional

- [ ] SkillsService liest neue Manifest-Felder `inline_action_eligible`, `output_mode`, `tier_hint`, `transient`
- [ ] Eligibility-Liste wird beim Skills-Refresh aktualisiert, in-memory verfuegbar
- [ ] FEAT-33-01-Floating-Menu pollt die Liste beim Open, rendert pro Skill einen Button
- [ ] Bei mehr als 8 aktivierten Skills erscheint "More skills..." als letzter Eintrag, oeffnet Submenu
- [ ] Per-Skill-Toggle und Drag-and-Drop-Reihenfolge im Settings-Surface (FEAT-33-01)
- [ ] Skill-Trigger uebergibt Selection-Text als Input, Output wird in deklariertem `output_mode` gerendert
- [ ] Command-Palette-Eintrag pro eligible aktivierter Skill (Format `Vault Operator: Run skill {name} on selection`)
- [ ] Frequency-Tracker zaehlt Skill-Trigger, Sliding-Window 30 Tage
- [ ] **Sidebar-Independence verifiziert**: Skill-Trigger funktioniert bei geschlossener Chat-Sidebar, Output rendert im Editor oder Skill-deklarierten Ziel ohne Sidebar zu oeffnen

### Quality

- [ ] Unit-Tests Manifest-Parser: eligibility-Flag-Lesen, Default-Wert, korrupter Manifest-Fall
- [ ] Unit-Tests Eligibility-Filter: nur eligible Skills mit aktiviertem Toggle erscheinen
- [ ] Unit-Tests Overflow: bei 20 aktivierten Skills landen 12 im Submenu
- [ ] Integration-Test: Selection-Text als Input, 4 Output-Modi rendern korrekt
- [ ] Smoke-Test mit Dummy-Plugin, das eligible Skill exportiert
- [ ] Performance-Test: 50 eligible Skills, Menu-Open unter 100 ms
- [ ] Bot-Compliance-Check: keine innerHTML, keine Style-Mutation, FileManager.trashFile falls Skill Files anlegt
- [ ] tsc clean, ESLint clean

### Documentation

- [ ] Manifest-Schema-Doku im Public-Bereich (`docs/reference/skills-manifest.md`) erweitert um neue Felder
- [ ] Beispiel-Skill in `bundled-skills/` mit Eligibility-Flag (z.B. "Add citations")
- [ ] FEAT-33-08-Spec mit Status "Implemented" im BACKLOG
- [ ] arc42 Section 8.x (Skills-Service) ergaenzt um Inline-Action-Surface

---

## Hypothesis validation

Keine direkte BA-Hypothese aus BA-EPIC-33. Das Feature adressiert die Cross-Constraints "Open Skill-System als Plattform-Hebel" und N-08 "Skills im Floating-Menu". Validierungs-Proxy: nach 4 Wochen Live-Use prueft Sebastian, ob mindestens 3 eigene User Skills im Inline-Menu aktiv sind und ob die Frequency-Sortierung sinnvoll wirkt.

---

## Dependencies

- **FEAT-33-01 (Floating-Menu + Settings-Surface)**: ohne den Menu-Renderer und den Settings-Tab gibt es keinen Einhaengepunkt fuer die Skills-Eintraege. Wenn FEAT-33-01 sich verzoegert, blockiert FEAT-33-08 vollstaendig.

## Assumptions

- Skills-System (SkillsService, User Skills, Plugin Skills) ist bereits implementiert und lebt in `src/services/SkillsService.ts`.
- Skill-Manifest-Parser ist erweiterbar ohne Breaking Change.
- TaskRouter (`src/services/TaskRouter.ts`) kann via Skill-Manifest-Hint `tier_hint` direkt aufs Haiku- oder Default-Tier geroutet werden.
- Plugin-Capability-Filter aus dem regulaeren Skill-Aufruf-Pfad ist robust genug, um Inline-Trigger ohne Anpassung zu schuetzen.

## Out of scope

- Skill-Erstellungs-UX im Floating-Menu (User legt Skills weiter ueber das bestehende Skill-Authoring an).
- Marketplace fuer Inline-Action-Skills (kein Discovery-Mechanismus, Skills kommen aus dem Vault oder aus Plugins).
- Skill-Versionierung pro Inline-Action.
- Output-Modus-spezifische UI-Komponenten (Inline-Diff lebt in FEAT-33-02, Preview-Block in FEAT-33-03, Side-Panel als Nicht-Sidebar-Surface in FEAT-33-05). Dieses Feature ruft die Komponenten nur auf.
- Per-Skill-Tier-Override durch den User; das Tier kommt aus dem Manifest-Hint, der User entscheidet nicht im Menu.

---

## Code Pointer

- ARCHITECTURE.map concept: `skills-inline-actions`
- Referenz-Implementierungen im Code:
  - `src/services/SkillsService.ts` (Manifest-Parser, Capability-System)
  - `src/services/TaskRouter.ts` (Tier-Routing via Hint)
  - FEAT-33-01-Floating-Menu (Polling-Punkt fuer Eligibility-Liste)
