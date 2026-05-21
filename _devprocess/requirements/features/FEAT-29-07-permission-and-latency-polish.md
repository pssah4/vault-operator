---
id: FEAT-29-07
title: Permission und Latency Polish fuer Plugin-API-Calls
epic: EPIC-29
priority: P2
effort: S
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-03]
created: 2026-05-20
---

# Feature: Permission und Latency Polish fuer Plugin-API-Calls

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-07
> (status, phase, claim, last-change leben dort).

## Feature description

Heute hat `call_plugin_api` einen fixen 10-Sekunden-Timeout und einen konservativen Allowlist-Mechanismus: Tier-1-Methoden sind kuratiert mit `isWrite: false`, Tier-2-Methoden werden dynamisch entdeckt aber default mit `isWrite: true` markiert. Das fuehrt zu Erstkontakt-Friktion (jeder neue Plugin-API-Aufruf braucht Approval, auch bei lesenden Calls) und Timeout-Probleme bei langsamen Plugins (grosse Dataview-Queries, Omnisearch-Reindex). Dieses Feature poliert beide Achsen. Erstens: adaptive Timeouts, konfigurierbar per Plugin-ID (Default 10 Sekunden, prominente Plugins koennen laenger). Zweitens: Auto-Promotion-Mechanik: wenn eine Tier-2-Methode 3 Mal erfolgreich approved wurde, wird sie automatisch in die kuratierte Allowlist befoerdert mit isWrite-Heuristik basierend auf Methodennamen-Pattern ("get*", "list*", "find*", "query*" -> isWrite=false; alle anderen bleiben isWrite=true).

## Benefits hypothesis

**Wir glauben dass** adaptive Timeouts und Auto-Promotion
**folgende messbare Wirkung erzielt:**

- Anteil Approval-Prompts bei lesenden Plugin-API-Calls sinkt drastisch
- Anteil Timeout-Fehler bei grossen Queries sinkt drastisch

**Wir wissen dass wir erfolgreich sind, wenn:**

- Approval-Prompts pro Session sinken um mindestens 30% bei aktivem Dataview/Omnisearch
- Timeout-Fehler bei Dataview-Queries auf grossen Vaults sinken um mindestens 80%
- Auto-Promotion-Liste enthaelt nach einer Woche Nutzung mindestens 20 sinnvoll klassifizierte Methoden

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will dass Plugin-Queries Zeit bekommen wenn das Plugin sie braucht | Story 1 |
| Emotional | User will keine staendige Approval-Friktion bei lesenden Calls | Story 2 |
| Social | User will dem Agent vertrauen koennen, dass er gelernte Methoden nicht jedes Mal neu fragen muss | Story 3 |

## User stories

### Story 1: Lange Queries mit Geduld ausfuehren (Functional Job)

**Als** User mit einem grossen Vault (5000+ Dateien) der Dataview-Queries durch den Agent laufen laesst
**moechte ich** dass langsame Queries mehr Zeit bekommen als der fixe 10-Sekunden-Default,
**damit** legitime Operationen nicht in einen Timeout-Fehler laufen.

### Story 2: Approval nur bei echten Schreib-Operationen (Emotional Job)

**Als** User der haeufig lesende Plugin-API-Calls durch den Agent macht
**moechte ich** nicht bei jedem `getTasks()`, `pages()` oder `query()` einen Approval-Modal sehen,
**damit** der Workflow nicht von Klick-Friktion unterbrochen wird.

### Story 3: Agent lernt mit (Social Job)

**Als** User der Vault Operator regelmaessig nutzt
**moechte ich** dass der Agent gelernte API-Methoden automatisch als safe markiert wenn ich sie mehrfach approved habe,
**damit** ich nicht das Gefuehl habe einem Agent zu helfen der jedes Mal wieder von null anfaengt.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Timeout ist pro Plugin konfigurierbar | Dataview kann z.B. 30 Sekunden bekommen | Settings-Test |
| SC-02 | Lesende API-Methoden werden nach 3 erfolgreichen Approvals automatisch promoted | mindestens 5 Methoden auto-promoted in einer Woche Test | Allowlist-Inspection |
| SC-03 | Approval-Prompts bei lesenden Calls sinken nach einer Woche Nutzung | mindestens 30% weniger Prompts | Telemetrie-Messung |
| SC-04 | Timeout-Fehler bei langsamen Queries sinken | mindestens 80% weniger Timeouts | Error-Log-Analyse |
| SC-05 | Heuristik fuer isWrite (get/list/find/query -> false, andere true) ist nachvollziehbar im Code | Klare Funktion mit Tests | Code-Inspection |

---

## Technical NFRs

### Performance

- Auto-Promotion-Check pro API-Call unter 5 ms Overhead.
- Settings-Lookup pro API-Call unter 1 ms.

### Security

- Auto-Promotion betrifft nur Methoden die nachgewiesen lesend sind (User-Approvals nicht missbrauchbar).
- User kann jederzeit auto-promotion fuer einzelne Methoden oder Plugins deaktivieren.
- Timeout-Override ist auf maximal 5 Minuten begrenzt (kein Endlos-Hang).

### Scalability

- Auto-Promotion-Liste skaliert auf 1000 Methoden ohne Performance-Verlust.

### Availability

- Bei Korruption der Allowlist Fallback auf Default-Tier-2 (isWrite=true), kein Crash.

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1:** Persistente Allowlist mit Auto-Promotion

- Begruendung: Liste muss Plugin-Reloads ueberleben, sonst kein Lern-Effekt.
- Impact: settings.pluginApi.safeMethodOverrides erweitert sich um auto-promoted Eintraege.
- Qualitaetsattribut: Persistence, User-Memory.

**MODERATE ASR #2:** Heuristik fuer isWrite

- Begruendung: Fail-safe-Default ist isWrite=true, aber wenn 90% der Methoden mit "get*" lesend sind, ist der Default unnoetig restriktiv.
- Impact: Allowlist-Klassifikator-Logik.
- Qualitaetsattribut: User-Experience, Approval-Friktion.

### Constraints

- Auto-Promotion darf nur basierend auf User-Approvals erfolgen (kein Self-Approval durch Agent).
- isWrite-Heuristik darf nicht override-en wenn User die Methode explizit als isWrite=true markiert hat.

### Open questions for architect

- Wo persistiert die Auto-Promotion-Liste? In `settings.pluginApi.safeMethodOverrides` (existing) oder separater Speicher?
- Ab welcher Anzahl Approvals greift die Auto-Promotion? 3 (mein Vorschlag) oder konfigurierbar?
- Wie wird der User informiert wenn eine Methode auto-promoted wurde? Notice, Settings-UI-Anzeige, oder still?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer adaptive Timeout-Logik
- [ ] Unit-Tests fuer Auto-Promotion (3 Approvals -> promotion, isWrite-Heuristik)
- [ ] Integrations-Test mit echtem Dataview-Plugin und langer Query

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] Settings-UI erlaeutert Auto-Promotion und Disable-Option

---

## Hypothesis validation

Nicht anwendbar.

---

## Dependencies

- **FEAT-29-03 Unified Discovery**: probe_plugin liefert Methoden-Metadaten als Basis fuer Auto-Promotion.

## Assumptions

- User akzeptiert Auto-Promotion als Lern-Mechanik (kann konfigurierbar deaktiviert werden).
- Methodennamen folgen halbwegs konsistenter Konvention (get/list/find/query als gaengige Lese-Praefixe).

## Out of scope

- UI-Editor fuer manuelle Allowlist-Anpassung (existiert teilweise schon).
- Differenzierte Permission-Levels jenseits isWrite-true/false.

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `call-plugin-api-tool` und `plugin-api-allowlist` (run `grep "CallPluginApi" src/ARCHITECTURE.map` fuer Entry-Point).
