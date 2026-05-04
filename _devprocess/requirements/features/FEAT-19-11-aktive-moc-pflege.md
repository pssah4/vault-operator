# Feature: Aktive MOC-File-Pflege mit Marker-Konvention

> **Feature ID**: FEAT-19-11
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 7.2 Retrieval, Section 11.6
> **Priority**: P2
> **Effort Estimate**: M

## Feature Description

MOC-Files (Maps of Content) existieren bereits pro Cluster (Thema, Konzept) und enthalten heute eine Base mit verlinkten Notizen. Neue Erweiterung: Header-Section mit auto-generierten Hub-Status, Implicit-Connection-Vorschlaegen, Cluster-Statistik plus Freshness-Status (siehe FEAT-19-16).

Strikte Trennung zwischen User-edited Body und auto-generiertem Block durch Marker-Konvention (zB HTML-Comment-Markers `<!-- obsilo:auto-start -->` ... `<!-- obsilo:auto-end -->` oder Dataview-style Block, Architektur-Entscheidung offen).

Setting-gated, Default off.

## Benefits Hypothesis

Wir glauben, dass aktive MOC-Pflege MOC-Pages als zentrale Anlaufstelle pro Cluster aufwertet, ohne User-edited Content zu zerstoeren. Folgende messbare Outcomes liefert: User sieht in der MOC-Page sofort Hub-Status, Implicit-Verbindungen, Cluster-Health; auto-generierter Block bleibt klar getrennt vom User-Inhalt (BA-25 H-05).

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen User-Befragung keinen User-Inhalts-Verlust meldet, plus Power-User MOC-Pages aktiver nutzen.

## User Stories

**Story 1:** Als Power-User mit MOC-Praxis moechte ich, dass mein MOC-File aktuelle Cluster-Statistiken plus Implicit-Connection-Vorschlaege zeigt, ohne dass ich es selbst pflegen muss.

**Story 2:** Als Power-User moechte ich sicher sein, dass mein User-edited Inhalt im MOC-File niemals durch Auto-Pflege ueberschrieben wird, um Trust zu wahren.

**Story 3:** Als User moechte ich Marker-Block jederzeit deaktivieren oder loeschen koennen, ohne dass die Auto-Pflege ihn re-injectet.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Auto-Block ist klar von User-Content getrennt | Marker-Konvention sichtbar | Manueller Test |
| SC-02 | User-Content wird nie ueberschrieben | 100% Erhaltung | Diff-Audit |
| SC-03 | Auto-Block aktualisiert sich bei Cluster-Aenderung | Update innerhalb 1 Indexing-Cycle | Integration-Test |
| SC-04 | User kann Marker loeschen, Auto-Pflege pausiert | Re-Inject nur nach explizitem User-Trigger | Unit-Test |
| SC-05 | Auto-Block ist visuell unterscheidbar | UI-Test mit Sebastians MOC-Page | Manueller Test |

## Technical NFRs

- **Performance:** Auto-Pflege im Hintergrund, max 1x pro Cluster pro Tag.
- **Atomicity:** Pro-MOC-Write atomisch.
- **Marker-Robustness:** Marker-Detection muss tolerant sein (Whitespace-Variationen, Encoding).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Marker-Konvention ist ADR-Bedarf (HTML-Comment vs Dataview-Block vs eigene Syntax). Muss Obsidian-rendering-vertraeglich sein.
- **ASR-2 (Moderate):** Falls User Marker loescht, definiertes Verhalten (Re-Inject vs Skip vs Notification).

## Definition of Done

- Marker-Konvention via ADR festgelegt.
- Marker-Detection-Logik plus Auto-Block-Generierung.
- Atomic MOC-Page-Write.
- Settings-Toggle.
- Live-Test auf Sebastians MOCs (10 MOC-Pages, 4 Wochen Beobachtung).
