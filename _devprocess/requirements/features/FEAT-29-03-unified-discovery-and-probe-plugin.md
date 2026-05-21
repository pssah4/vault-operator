---
id: FEAT-29-03
title: Unified Skill Discovery und probe_plugin-Tool
epic: EPIC-29
priority: P0
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-02]
created: 2026-05-20
---

# Feature: Unified Skill Discovery und probe_plugin-Tool

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-03
> (status, phase, claim, last-change leben dort).

## Feature description

Heute laeuft der VaultDNAScanner periodisch im 5-Sekunden-Intervall, plus einmaliger Reclassify-Pass nach 3 Sekunden Plugin-Boot, um Plugin-Commands zu erfassen. Plugins die ihre Commands lazy registrieren (Dataview, Templater) verpassen das 3-Sekunden-Fenster und landen in der NONE-Kategorie. Der Scanner schreibt zudem statische `.skill.md`-Files, die mit der Zeit veralten. Dieses Feature ersetzt das Polling-Modell durch eine event-driven Discovery: SkillRegistry hoert auf Plugin-Enable/Disable-Events und auf File-Watcher in `.vault-operator/skills/`. Zusaetzlich kommt ein neues Tool `probe_plugin(plugin_id)`, das zur Laufzeit die aktuellen Commands und API-Methoden eines Plugins direkt aus `app.plugins.plugins[id]` und `app.commands.commands` zurueckgibt. Damit hat der Agent immer den Live-Stand und das statische `.skill.md` ist nur noch Description-Anker, nicht Single-Source-of-Truth.

## Benefits hypothesis

**Wir glauben dass** eine event-driven Discovery plus Live-Probe
**folgende messbare Wirkung erzielt:**

- Skill-Discovery-Latenz unter 100ms nach Plugin-Enable
- Keine NONE-Klassifizierung mehr fuer lazy-loading-Plugins
- Stets aktuelle Command- und API-Listen ohne Polling-Overhead

**Wir wissen dass wir erfolgreich sind, wenn:**

- Dataview, Templater und andere lazy-Plugins sind direkt nach Plugin-Enable als aktive Skills sichtbar
- 5-Sekunden-Polling-Job ist vollstaendig entfernt
- probe_plugin wird vom Modell als Pflicht-Schritt vor jedem ersten Plugin-Use pro Session aufgerufen

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will dass installierte Plugins sofort als Skills nutzbar sind | Story 1 |
| Emotional | User will sich darauf verlassen koennen, dass die Skill-Liste den echten Plugin-Stand zeigt | Story 2 |
| Social | User will einem Kollegen das Plugin demonstrieren ohne mit "warte mal 5 Sekunden" pausieren zu muessen | Story 3 |

## User stories

### Story 1: Sofortige Skill-Verfuegbarkeit (Functional Job)

**Als** User der ein Plugin im Obsidian-Settings aktiviert
**moechte ich** dass der Vault Operator das Plugin sofort als Skill anbietet, ohne dass ich auf Polling-Refresh warten muss,
**damit** ich das Plugin im naechsten User-Prompt direkt nutzen kann.

### Story 2: Aktuelle Command-Liste vertrauen (Emotional Job)

**Als** User der ein Plugin nach einem Update neu konfiguriert
**moechte ich** dass der Agent die neuen oder umbenannten Commands sofort sieht,
**damit** ich nicht versuchen muss zu raten, ob er den alten oder neuen Command-Namen kennt.

### Story 3: Demonstration ohne Wartezeit (Social Job)

**Als** User der einem Kollegen Vault Operator zeigt
**moechte ich** dass die Plugin-Integration sich responsiv anfuehlt,
**damit** der Eindruck einer professionellen Loesung entsteht und nicht der eines hakelnden Tools.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Zeit von Plugin-Enable bis Skill-Sichtbarkeit | unter 100 ms | Telemetrie-Messung |
| SC-02 | NONE-klassifizierte Plugins nach 30 Sekunden Boot | 0 falsch klassifizierte | Manueller Test mit Dataview, Templater, Tasks |
| SC-03 | probe_plugin liefert Commands und API-Methoden direkt aus laufender Plugin-Instanz | Live-Daten, kein Snapshot | Test gegen heutiges VaultDNAScanner-Snapshot |
| SC-04 | Modell ruft probe_plugin vor erstem Plugin-Use pro Session auf | mindestens 90% Adoption | Tool-Call-Telemetry |
| SC-05 | Periodisches Polling ist vollstaendig entfernt | 0 setInterval-Aufrufe im Discovery-Code-Pfad | Code-Inspection |

---

## Technical NFRs

### Performance

- probe_plugin-Latenz unter 50 ms fuer ein Plugin mit bis zu 100 Commands.
- Event-Handler-Refresh unter 50 ms bei Plugin-Enable/Disable.
- File-Watcher-Refresh unter 100 ms bei SKILL.md-Aenderung.

### Security

- probe_plugin liest nur, schreibt nichts.
- API-Methoden-Reflection respektiert die bestehende Allowlist-Logik (Tier 1 kuratiert + Tier 2 dynamisch entdeckt mit isWrite-Default).
- Kein bypass der Approval-Kette fuer ungetestete API-Aufrufe.

### Scalability

- Discovery skaliert auf 500 installierte Plugins mit linearer Memory- und CPU-Last.

### Availability

- Bei Crash des Event-Handlers fallback auf On-Demand-Refresh beim naechsten probe_plugin-Aufruf.
- Kein Hard-Lock zwischen Plugin-Reload und Discovery.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Live-Probe-Modell statt Snapshot

- Begruendung: Plugin-State ist dynamisch (Commands, API-Methoden, Settings). Snapshots veralten und sind die Wurzel der heutigen Drift-Probleme.
- Impact: VaultDNAScanner muss umgebaut, probe_plugin als neues Tool registriert.
- Qualitaetsattribut: Data Freshness, Reliability.

**CRITICAL ASR #2:** Event-driven Discovery ohne Polling

- Begruendung: Polling skaliert nicht und ist die Quelle der Latenz-Probleme.
- Impact: SkillRegistry-Lifecycle, Event-Handler-Registration auf app.plugins-Events.
- Qualitaetsattribut: Performance, Resource Efficiency.

**MODERATE ASR #3:** SKILL.md-Inhalte als Description-Anker statt Command-Liste

- Begruendung: Wenn Commands live geholt werden, sollte das SKILL.md die "Wofuer und wann"-Description tragen, nicht die volatile Command-Liste.
- Impact: SkillRegistry-Prompt-Section-Format, FEAT-29-02-Migrations-Output.
- Qualitaetsattribut: Token-Effizienz, Klarheit.

### Constraints

- Obsidian-Plugin-API muss Events fuer Plugin-Enable/Disable bereitstellen. Falls nicht direkt verfuegbar, ueber polling-with-debounce-Fallback (intern, nicht extern).
- File-Watcher muss vault.adapter.watch oder vergleichbares nutzen (was die Plattform anbietet).

### Open questions for architect

- Bietet `app.plugins.on("enabled" | "disabled")` ein stabiles Event-Interface, oder muss man auf `app.plugins.manifests`-Aenderungen ueber Reflection lauschen?
- Wie soll der File-Watcher fuer Skill-Verzeichnisse implementiert sein? `app.vault.on("create"/"modify"/"delete")` filtern auf skills/-Pfad?
- Soll probe_plugin ein eigenes Caching haben (z.B. 30s TTL pro plugin_id) oder pro Aufruf live abfragen?
- Wie wird der Hard-Guard in execute_command implementiert ("probe_plugin first" Hinweis bei not-found)? Per Error-Wrapper oder per System-Prompt-Protokoll?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer probe_plugin (Commands-Reflection, API-Methoden-Reflection)
- [ ] Unit-Tests fuer Event-Handler (Plugin-Enable, Plugin-Disable, File-Modify)
- [ ] Integrations-Test mit Dataview, Templater, Tasks (drei lazy-loading-Plugins)
- [ ] Performance-Test: 100-Plugin-Vault, Skill-Discovery-Latenz gemessen

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] ARCHITECTURE.map updated mit probe_plugin Entry-Point
- [ ] Tool-Description fuer probe_plugin im System-Prompt enthaelt klare Anweisung

---

## Hypothesis validation

| Hypothese | Test-Methode | Erfolgs-Kriterium | Resultat |
|---|---|---|---|
| H-02: Live-Probe statt Polling reduziert Discovery-Latenz auf unter 100ms | Telemetrie-Messung vor/nach Refactor an 20 Plugin-Enable-Events | 90% der Events unter 100 ms | Open |

---

## Dependencies

- **FEAT-29-02 Plugin-Skill-Format-Migration**: Discovery liest das neue Folder-Format.
- **FEAT-29-01 Folder-Konsolidierung**: Discovery sucht im neuen kanonischen Pfad.

## Assumptions

- Obsidian-API ermoeglicht Plugin-Enable/Disable-Events oder zumindest beobachtbare State-Aenderungen.
- App.commands.commands ist zur Laufzeit immer aktuell.

## Out of scope

- Migration der heutigen Stati (FEAT-29-02).
- UI-Anzeige der Live-State-Aenderungen in den Settings (kann nachtraeglich kommen).

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `skill-registry` und `plugin-discovery` (run `grep "skill-registry" src/ARCHITECTURE.map` fuer Entry-Point).
