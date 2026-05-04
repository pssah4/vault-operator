# Feature: Developer Docs -- Update & Erweiterung

> **Feature ID**: FEAT-17-03
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Aktualisierung und Erweiterung der Developer/Architect-Dokumentation. Die bestehenden 11 Seiten werden ueberarbeitet und um die fehlenden Subsysteme ergaenzt (Knowledge Layer, Office Pipeline, Copilot/Kilo Auth, MCP Server, Task Extraction, Self-Development). Die Doku hat Portfolio-Charakter: sie erklaert nicht nur WAS implementiert ist, sondern WARUM bestimmte Entscheidungen getroffen wurden (ADR-Kontext). Fuer Menschen geschrieben, nicht als generierte API-Referenz. Contributor-onboarding-faehig.

## Benefits Hypothesis

**Wir glauben dass** vollstaendige Dev Docs mit Portfolio-Charakter
**Folgende messbare Outcomes liefert:**
- Engineers verstehen die Architektur gut genug um eine Contribution zu planen
- Die Doku dient als technisches Portfolio und Showcase

**Wir wissen dass wir erfolgreich sind wenn:**
- Alle Subsysteme dokumentiert sind (Abgleich mit Architecture Overview)
- Jeder Deep-Dive erklaert die "Warum"-Entscheidungen, nicht nur die Struktur

## User Stories

### Story 1: Architektur verstehen
**Als** Software-Entwickler
**moechte ich** den Architektur-Ueberblick lesen und verstehen wie die Subsysteme zusammenhaengen
**um** einschaetzen zu koennen wie komplex und durchdacht das System ist

### Story 2: Entscheidungen nachvollziehen
**Als** Architekt
**moechte ich** verstehen warum bestimmte technische Entscheidungen getroffen wurden (z.B. SQLite statt Cloud-DB, iframe Sandbox statt Web Worker)
**um** die Trade-Offs bewerten und fuer eigene Projekte lernen zu koennen

### Story 3: Contribution planen
**Als** potenzieller Contributor
**moechte ich** Key Files und Einstiegspunkte fuer ein Subsystem finden
**um** einschaetzen zu koennen wo meine Aenderung ansetzt

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Alle Subsysteme sind dokumentiert | 100% Abdeckung | Abgleich gegen Architecture-Overview-Diagramm |
| SC-02 | Jeder Deep-Dive enthaelt Entscheidungs-Kontext | Mindestens 1 "Why" pro Seite | Content-Review |
| SC-03 | Key-File-Referenzen sind korrekt | Referenzierte Dateien existieren | Automatisierter Link-Check |
| SC-04 | Architektur-Ueberblick zeigt alle Subsysteme und ihre Beziehungen | Vollstaendiges Diagramm | Visueller Review |

---

## Technical NFRs (fuer Architekt)

### Content-Struktur (Vorschlag)

**Bestehend (aktualisieren):**
- Architecture Overview (+ Knowledge Layer, MCP Server, Office Pipeline ins Diagramm)
- Agent Loop, System Prompt, Tool System, API Providers
- Governance, MCP Client, Memory System, Mode System, Semantic Search, UI Architecture, VaultDNA

**Neu hinzufuegen:**
- Knowledge Layer (KnowledgeDB, VectorStore, GraphExtractor, ImplicitConnections, Reranker)
- Office Pipeline (PPTX Template Engine, plan_presentation, TemplateCatalog)
- Provider Auth (Copilot OAuth Flow, Kilo Device Auth, SafeStorage)
- MCP Server (McpBridge, Tool-Tier-Mapping, Remote Relay)
- Task Extraction (TaskExtractor, TaskNoteCreator, Pipeline-Hook)
- Self-Development (5 Stufen, Sandbox, Dynamic Tools, Plugin Builder)

### Ton
- Technisch praezise aber lesbar (kein akademischer Stil)
- ADR-Referenzen wo relevant
- Key-File-Pfade als Code-Links

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Architektur-Diagramme
- **Warum ASR**: Ein Architektur-Ueberblick ohne Diagramm ist schwer verstaendlich
- **Impact**: Entscheidung ob ASCII-Art, Mermaid, SVG oder externe Tools
- **Quality Attribute**: Usability

### Open Questions fuer Architekt
- Mermaid-Diagramme (SSG-nativ) vs. statische SVGs?
- Wie tief gehen die Deep-Dives? (Modul-Ebene vs. Klassen-Ebene)

---

## Definition of Done

### Functional
- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria erfuellt (verifiziert)

### Quality
- [ ] Alle Key-File-Referenzen existieren
- [ ] Keine veralteten Informationen (gegen Codebase geprueft)

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-17-00 (SSG-Migration)**: Grundgeruest muss stehen

## Assumptions
- _devprocess/ Dokumente (ADRs, TECH-Docs) dienen als Primaerquelle
- Bestehende Dev-Doc-Seiten werden ueberarbeitet, nicht von Null geschrieben

## Out of Scope
- User-facing Doku (macht FEAT-17-01)
- API-Dokumentation (Obsilo hat keine externe API)
