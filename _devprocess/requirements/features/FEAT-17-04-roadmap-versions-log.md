# Feature: Homepage -- Roadmap & Versions-Log

> **Feature ID**: FEAT-17-04
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Neue Sektion auf der Homepage die transparent zeigt was bereits implementiert wurde, was aktuell in Arbeit ist, und was geplant ist. Grobe Kategorien (keine Feature-IDs), mit einem Versions-Log das Meilensteine pro Release dokumentiert. Ziel: Lieferfaehigkeit demonstrieren und Zukunftsvision kommunizieren.

## Benefits Hypothesis

**Wir glauben dass** eine oeffentliche Roadmap mit Versions-Log
**Folgende messbare Outcomes liefert:**
- Besucher erkennen sofort dass Vault Operator aktiv weiterentwickelt wird
- Die Roadmap vermittelt eine klare Vision und Richtung

**Wir wissen dass wir erfolgreich sind wenn:**
- Roadmap zeigt mindestens 3 Kategorien pro Status (Done, In Progress, Planned)
- Versions-Log deckt alle bisherigen Major-Releases ab

## User Stories

### Story 1: Projekt-Aktivitaet einschaetzen
**Als** potenzieller Vault Operator-Nutzer
**moechte ich** auf der Homepage sehen wie aktiv das Projekt ist
**um** zu entscheiden ob ich einem aktiv gepflegten Projekt vertrauen kann

### Story 2: Zukunftsplaene sehen
**Als** bestehender Vault Operator-Nutzer
**moechte ich** sehen was als naechstes geplant ist
**um** einschaetzen zu koennen ob Features die ich mir wuensche auf der Roadmap stehen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Roadmap zeigt implementierte, aktuelle und geplante Kategorien | Mindestens 3 pro Status | Content-Review |
| SC-02 | Versions-Log dokumentiert alle Major-Releases | Lueckenloses Log | Abgleich mit Git-History |
| SC-03 | Roadmap ist ohne Scrollen erkennbar (oberhalb der Faltkante oder prominent verlinkt) | Sichtbar beim ersten Seitenbesuch | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Content-Struktur

**Roadmap-Kategorien (Vorschlag):**

Done:
- Core Agent & Chat (49+ Tools, Multi-Agent, Context Condensing)
- Knowledge Layer (Semantic Search, Graph, Implicit Connections, Reranking)
- Office Pipeline (PPTX/DOCX/XLSX Erstellung, Template Engine)
- Multi-Provider (Anthropic, OpenAI, Copilot, Kilo, Ollama, Azure, ...)
- MCP Connector (Vault Operator als MCP Server fuer Claude Desktop)
- Memory & Personalization (3-Tier Memory, Onboarding, Chat-Linking)
- Safety & Governance (Permissions, Checkpoints, Audit Log)
- Self-Development (Skills, Sandbox, Dynamic Tools, Plugin API)

In Progress:
- Remote Access (Cloudflare Relay fuer MCP Server)

Planned:
- Claude Code Pattern Adoption (Deferred Tools, Memory Side-Query, Parallel SubTasks)
- Template Gallery & Default Templates
- Token Budget Management

**Versions-Log (Vorschlag):**
- v2.2 (Maerz 2026): MCP Connector, Knowledge Layer, Copilot & Kilo Provider
- v2.1 (Maerz 2026): Office Pipeline, Chat-Linking, Task Extraction
- v2.0 (Februar 2026): Self-Development, Sandbox, Agent Skill Mastery
- v1.x (Januar 2026): Core Foundation, Semantic Search, Memory, Multi-Agent

---

## Architecture Considerations

Keine architektur-relevanten ASRs -- rein Content-getrieben.

### Open Questions fuer Architekt
- Roadmap als Teil der Homepage oder als eigene Seite?
- Daten-Pflege: manuell in Markdown oder aus Backlog generiert?

---

## Definition of Done

### Functional
- [ ] Roadmap-Sektion auf Homepage sichtbar
- [ ] Versions-Log vollstaendig
- [ ] Alle Success Criteria erfuellt

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-17-00 (SSG-Migration)**: Homepage muss im SSG sein

## Out of Scope
- Feature-Level-Details (nur grobe Kategorien)
- Commit-Level Changelog
