# Feature: Vault Health Check (Lint)

> **Feature ID**: FEAT-19-01
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Automatischer Vault-Check der bei jedem Vault-Open strukturelle Inkonsistenzen erkennt
und dem User als Badge praesentiert. Der Scan basiert auf reinen Datenbank-Queries
(0 Token-Kosten). Erst wenn der User auf Findings klickt, formuliert der Agent
Vorschlaege und bietet Fixes an.

Nutzt die bestehende Infrastruktur: GraphStore (Wikilinks, MOC-Properties),
ImplicitConnectionService (semantische Aehnlichkeit), KnowledgeDB (Tags, Edges).

## Benefits Hypothesis

**Wir glauben dass** ein automatischer Vault-Check die strukturelle Qualitaet des Vault
systematisch verbessert ohne manuellen Aufwand.

**Folgende messbare Outcomes liefert:**
- Verwaiste Notes sinken um 50% innerhalb 4 Wochen
- Fehlende MOC-Eintraege werden aktiv erkannt und behoben

**Wir wissen dass wir erfolgreich sind wenn:**
- User behebt mindestens 3 Findings pro Woche
- False-Positive-Rate liegt unter 20%

## User Stories

### Story 1: Taeglicher Check
**Als** Wissensarbeiter
**moechte ich** beim Oeffnen meines Vault automatisch ueber strukturelle Probleme informiert werden
**um** mein Wissensnetz konsistent zu halten ohne manuell suchen zu muessen

### Story 2: Findings bearbeiten
**Als** Wissensarbeiter
**moechte ich** Findings einzeln oder gesammelt bestaetigem koennen
**um** effizient Fixes durchzufuehren ohne jeden einzeln abnicken zu muessen

### Story 3: Manueller Trigger
**Als** Wissensarbeiter
**moechte ich** den Check auch manuell per Shortcut ausloesen koennen
**um** nach groesseren Aenderungen sofort pruefen zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Scan laeuft automatisch bei Vault-Open | 100% der Vault-Opens | Manueller Test |
| SC-02 | Scan ist fuer den User nicht spuerbar | <5 Sekunden fuer 1000 Notes | Zeitmessung |
| SC-03 | Findings sind korrekt und relevant | <20% False Positives | Stichproben-Analyse |
| SC-04 | User kann Feature abschalten | Toggle in Settings | Manueller Test |
| SC-05 | Fixes veraendern nichts ohne Bestaetigung | 100% benoetigen User-Aktion | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Scan-Dauer**: <5s fuer 1000 Notes (reine DB-Queries, kein LLM)
- **Token-Kosten Scan**: 0 (keine LLM-Calls)
- **Token-Kosten Fixes**: ~2-5k pro Fix-Session (LLM formuliert Vorschlaege)

### Availability
- **Graceful Degradation**: Wenn KnowledgeDB nicht gebaut ist, zeigt Badge "Index nicht verfuegbar"
- **Non-blocking**: Scan darf UI nicht blockieren (async)

---

## Architecture Considerations

### Lint-Checks (priorisiert)

| Check | Datenquelle | Severity |
|-------|-------------|----------|
| Verwaiste Notes (keine eingehenden Links) | GraphStore `edges` | High |
| Fehlende MOC-Eintraege | GraphStore `edges` + Frontmatter | High |
| Broken Links (Ziel existiert nicht) | GraphStore `edges` | High |
| Schwache Cluster (semantisch verwandt, unverlinkt) | `implicit_edges` | Medium |
| Inkonsistente Tags/Properties | `tags` Tabelle | Low |

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Neues Tool vs. bestehende Tools
- **Warum ASR**: Ein dediziertes `vault_health_check` Tool ist effizienter als mehrere Einzel-Queries, aber erhoet die Tool-Anzahl
- **Impact**: Bestimmt ob der Lint-Scan ein eigenes Tool braucht oder ob der Skill mit bestehenden Tools arbeitet
- **Quality Attribute**: Performance, Maintainability

**CRITICAL ASR #2**: Badge-UI und Event-Listener
- **Warum ASR**: Der Lint braucht einen vault.on('layout-ready') Listener und ein Badge im UI -- das ist ein Feature, kein reiner Skill
- **Impact**: Erfordert UI-Komponente + Settings-Toggle + Event-Registration in main.ts
- **Quality Attribute**: Usability

### Constraints
- **Toggle**: `enableVaultHealthCheck` in Settings
- **Non-blocking**: Scan muss async laufen, darf UI nicht blockieren
- **Kein LLM fuer Scan**: Nur DB-Queries fuer die Erkennung

### Open Questions fuer Architekt
- Badge: Wo im UI? Sidebar-Header? Status-Bar? Notification?
- Soll der Scan auch bei vault.on('modify') inkrementell laufen oder nur bei Open/Reload?
- Werden Findings persistent gespeichert (DB) oder nur im Memory gehalten (pro Session)?

---

## Definition of Done

### Functional
- [ ] Mindestens 3 der 5 Checks implementiert (Orphans, Missing MOC, Broken Links)
- [ ] Badge zeigt Findings-Anzahl bei Vault-Open
- [ ] User kann Findings anklicken und Vorschlaege sehen
- [ ] User kann Fixes einzeln oder gesammelt bestaetigen
- [ ] Toggle `enableVaultHealthCheck` in Settings
- [ ] Manueller Trigger per Command/Shortcut

### Quality
- [ ] Scan <5s fuer 1000 Notes
- [ ] Non-blocking (async)
- [ ] Obsidian Review-Bot Compliance

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] Backlog aktualisiert

---

## Dependencies
- **EPIC-15 (Knowledge Layer)**: GraphStore, ImplicitConnections, KnowledgeDB muessen gebaut sein
- **FEAT-19-02 (Ontologie)**: Fuer den "Schwache Cluster" Check (kann ohne starten)

## Out of Scope
- Automatisches Fixen ohne User-Bestaetigung
- Lint-Regeln konfigurierbar machen (spaeter)
