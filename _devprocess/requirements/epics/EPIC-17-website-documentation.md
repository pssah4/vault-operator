# Epic: Website-Dokumentation & Roadmap

> **Epic ID**: EPIC-17
> **Business Alignment**: _devprocess/analysis/BA-10-website-documentation.md
> **Scope**: MVP

## Epic Hypothesis Statement

FUER Obsidian-Nutzer die Obsilo einsetzen wollen und Entwickler die verstehen wollen wie es funktioniert
DIE eine intuitive, praxisnahe Anleitung bzw. einen technischen Deep-Dive benoetigen
IST DIE ueberarbeitete Website-Dokumentation
EIN Persona-basiertes Informationssystem mit drei Streams (User Guide, Dev Docs, Roadmap)
DAS Non-Tech-User vom ersten Start bis zu fortgeschrittenen Workflows begleitet, Engineers Architektur-Einblicke gibt, und die Projekt-Vision transparent kommuniziert
IM GEGENSATZ ZU der aktuellen feature-orientierten Seiten-Sammlung mit ~40% Content-Luecken
UNSERE LOESUNG strukturiert Wissen nach Nutzer-Beduerfnissen statt nach technischen Modulen, ist in Markdown geschrieben und dient gleichzeitig als Obsilo-Skill fuer In-App-Hilfe

## Business Outcomes (messbar)

1. **Feature-Abdeckung**: Dokumentierte Features steigen von ~60% auf 100%
2. **Self-Service-Rate**: Obsilo beantwortet >80% der gaengigen Bedienungsfragen direkt im Chat
3. **Wartungsaufwand**: Markdown-basiert statt raw HTML -- Aenderungen in Minuten statt Stunden

## Leading Indicators (Fruehindikatoren)

- User Guide umfasst alle implementierten Capabilities (pruefbar gegen Backlog)
- Dev Docs decken alle Subsysteme ab (pruefbar gegen Architektur-Ueberblick)
- Doku-Skill antwortet korrekt auf 10 vordefinierte Test-Fragen

## MVP Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEAT-17-00 | SSG-Migration & Grundgeruest | P0 | M | Geplant |
| FEAT-17-01 | User Guide -- Informationsarchitektur & Content | P0 | L | Geplant |
| FEAT-17-02 | Obsilo Doku-Skill | P0 | S | Geplant |
| FEAT-17-03 | Developer Docs -- Update & Erweiterung | P1 | M | Geplant |
| FEAT-17-04 | Homepage -- Roadmap & Versions-Log | P1 | S | Geplant |
| FEAT-17-05 | Homepage -- Hero & Messaging Update | P1 | S | Geplant |
| FEAT-17-06 | Design-Ueberarbeitung (Best-in-Class) | P2 | M | Geplant |
| FEAT-17-07 | DE Uebersetzung | P2 | M | Geplant |

**Priority:** P0-Critical (ohne geht MVP nicht), P1-High (wichtig), P2-Medium (wertsteigernd)
**Effort:** S (1-2 Tage), M (3-5 Tage), L (1-2 Wochen)

## Explizit Out-of-Scope

- **Video-Tutorials**: Evtl. spaeter ergaenzend
- **Community-Forum / Discord**: Erst bei Community-Plugin-Freigabe
- **Website-Chatbot**: Token-Kosten ohne Nutzen
- **Commit-Level Changelog**: Zu granular, stattdessen Versions-Log
- **Mehr als 2 Sprachen**: EN + DE reichen fuer MVP
- **API-Dokumentation**: Obsilo hat keine externe API

## Dependencies & Risks

### Dependencies
- **Backlog (BACKLOG.md)**: Muss aktuell sein als Content-Quelle fuer Roadmap und Feature-Abdeckung (erledigt)
- **Feature-Specs**: Muessen als Referenz fuer Content-Erstellung vorliegen (erledigt)

### Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SSG-Migration laeuft aus dem Ruder | M | M | Inkrementell migrieren, bestehende HTML als Fallback |
| Content veraltet nach naechstem Feature-Release | H | H | Doku-Update als Pflicht-Deliverable bei jeder Feature-Implementierung |
| User Guide wird zu technisch | M | H | Alex-Persona als Schreib-Leitfigur, kein Jargon ohne Erklaerung |
| Zwei Sprachen verdoppeln Aufwand | M | M | EN first, DE priorisiert (nicht 1:1) |
