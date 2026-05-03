# Feature: Hot-Cluster-Konfiguration in Settings

> **Feature ID**: FEAT-19-21
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 12.3
> **Priority**: P1
> **Effort Estimate**: S

## Feature Description

User-Interface zum Markieren von Clustern als "Hot". Nur Hot-Clusters werden von Stufe-3-Job (FEAT-19-20) periodisch geprueft. Default: Top-10 Cluster nach Note-Count automatisch als Hot markiert. User kann manuell ergaenzen oder ausschliessen.

Settings-UI zeigt Liste aller Cluster mit Note-Count, Hot-Markierung als Toggle, Letzter-Check-Datum (aus cluster_metadata).

## Benefits Hypothesis

Wir glauben, dass User-definierte Hot-List Token-Kosten der Stufe-3 begrenzt (OwlerLite-Pattern). Folgende messbare Outcomes liefert: Stufe-3 belastet nur User-relevante Cluster; Token-Budget bleibt einhaltbar (BA-25 H-13).

Wir wissen, dass wir erfolgreich sind, wenn User die Hot-List nach 4 Wochen aktiv pflegt (mindestens eine Aenderung).

## User Stories

**Story 1:** Als Power-User moechte ich entscheiden, welche meiner Cluster periodisch extern recherchiert werden, weil mein Vault breit ist aber nur 10-20 Themen aktuell relevant sind.

**Story 2:** Als Casual-User moechte ich einen sinnvollen Default bekommen (Top-10 nach Note-Count), ohne mich manuell durch alle Cluster zu klicken.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Settings-UI zeigt alle Cluster mit Note-Count | Sortierbar | UI-Test |
| SC-02 | Hot-Markierung als Toggle pro Cluster | Persistiert in DB | Unit-Test |
| SC-03 | Default Top-10 Cluster auto-markiert | Bei erstem Settings-Open | Integration-Test |
| SC-04 | Letzter-Check-Datum sichtbar pro Cluster | Aus cluster_metadata | UI-Test |
| SC-05 | Stufe-3-Job iteriert nur ueber Hot-Clusters | SQL-Filter | Integration-Test |

## Technical NFRs

- **Performance:** Settings-UI lazy-loaded bei vielen Clustern.
- **Storage:** Hot-Flag in cluster_metadata (FEAT-15-12).

## Definition of Done

- Settings-UI mit Cluster-Liste und Hot-Toggle.
- Default-Auto-Markierung Logik (Top-10).
- Read-Integration in FEAT-19-20 (Stufe-3-Job).
- UI-Test mit Sebastians Cluster-Stand.
