# Feature: Cluster-Metadata mit Halbwertszeit-Konfiguration

> **Feature ID**: FEAT-15-12
> **Epic**: EPIC-15 - Knowledge Layer
> **Source**: BA-25 Section 12.1
> **Priority**: P0
> **Effort Estimate**: S

## Feature Description

Eine neue Tabelle `cluster_metadata` (Schema: cluster, half_life_days, custom_weights, last_external_check, hot_cluster) speichert pro Cluster konfigurierbare Halbwertszeit (Default-Liste pro Kategorie) sowie Hot-Cluster-Markierung (FEAT-19-21).

Default-Halbwertszeiten:

| Cluster-Kategorie | Halbwertszeit |
|-------------------|---------------|
| Tech / Software / AI | 6 Monate |
| Wissenschaft / Forschung | 12 Monate |
| Politik / Wirtschaft | 1 Monat |
| Geschichte / Philosophie | 24 Monate |
| Personal / Self / Reflection | nie (statisch) |

User kann pro Cluster ueberschreiben.

## Benefits Hypothesis

Wir glauben, dass themen-spezifische Halbwertszeit ein realistisches Veraltungs-Modell liefert. Folgende messbare Outcomes liefert: Stufe-1-Composite-Score (FEAT-19-16) hat differenzierten Input pro Cluster; User-spezifische Sicht auf Aktualitaet wird moeglich.

Wir wissen, dass wir erfolgreich sind, wenn Stufe-1-Lint > 70% Precision auf Sebastians Vault zeigt (BA-25 H-11).

## User Stories

**Story 1:** Als Power-User moechte ich pro Cluster festlegen, wie schnell Wissen veraltet, weil Tech-Themen kuerzere Halbwertszeit haben als Geschichte-Themen.

**Story 2:** Als Casual-User moechte ich sinnvolle Default-Halbwertszeiten bekommen, ohne dass ich pro Cluster konfigurieren muss.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Default-Halbwertszeiten als System-Liste | 5 Kategorien minimum | Manueller Test |
| SC-02 | Pro Cluster ueberschreibbar | Settings-UI | Manueller Test |
| SC-03 | Halbwertszeit-Lookup < 1ms | SQL-Query | Performance-Test |
| SC-04 | Hot-Cluster-Markierung persistiert | Flag in DB | Unit-Test |
| SC-05 | Custom-Weights konfigurierbar (optional) | JSON-Property | Unit-Test |

## Technical NFRs

- **Performance:** Cluster-Lookup-Operations < 1ms.
- **Storage:** Schema-Migration v9 -> v10 (Bundle).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Halbwertszeit-Defaults (statische Liste vs adaptive Heuristik) ist Open Question. ADR-Bedarf.

## Definition of Done

- Migration v9 -> v10 (Bundle).
- Tabelle plus Read/Write-API.
- Default-Liste hardcoded mit ueberschreibbaren Werten.
- Settings-UI fuer Cluster-Halbwertszeit-Edit.
- Unit-Tests fuer Lookup und Override.
