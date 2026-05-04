# Feature: Source-Diversity-Check als Bias-Lint-Kategorie

> **Feature ID**: FEAT-19-17
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 12.4
> **Priority**: P0
> **Effort Estimate**: S

## Feature Description

Erweiterung VaultHealthService um neuen Check-Type `source_concentration`. SQL-Query auf cluster_source_stats (FEAT-15-11): alle Cluster wo Concentration-Score > 0.7 plus min 5 Notes.

Output im Health-Modal:
```
Cluster "Knowledge Management": 9 von 12 Notes (75%) aus medium.com.
Empfehlung: Suche aktiv Gegenpositionen.
[Anti-Echo-Suche starten]  [Cluster-Status anzeigen]  [Dismiss]
```

Anti-Echo-Suche-Action triggert Light-Web-Search analog Stufe 2 mit Source-Filter (block dominante Domain).

## Benefits Hypothesis

Wir glauben, dass Bias-Awareness als eigene Lint-Kategorie das Echo-Chamber-Risiko aktiv adressiert, was keine Karpathy-Adoption tut. Folgende messbare Outcomes liefert: erste Concentration-Warning innerhalb 4 Wochen Real-Use (BA-25 KPI); Source-Diversity steigt messbar.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen mindestens eine Warning durch User-Aktion aufgeloest wurde.

## User Stories

**Story 1:** Als Power-User moechte ich aktiv darauf hingewiesen werden, wenn ein Cluster einseitig wird, um meine Sicht nicht enger werden zu lassen.

**Story 2:** Als Casual-User moechte ich Bias-Awareness ohne Aufwand bekommen, weil ich es selbst nicht im Blick haette.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Check feuert bei Concentration > 0.7 + min 5 Notes | Threshold konfigurierbar | Unit-Test |
| SC-02 | Output zeigt Cluster, dominante Domain, Score | UI-Test | Manueller Test |
| SC-03 | Anti-Echo-Suche-Action verfuegbar | Klickbar | Integration-Test |
| SC-04 | Findings dismissable | dismissed_health_findings | Unit-Test |
| SC-05 | Check ist Token-frei (SQL-only) | 0 LLM-Calls beim Check | Unit-Test |

## Technical NFRs

- **Performance:** SQL-Query < 50ms.
- **Token-Kosten:** 0 fuer Detection. Anti-Echo-Suche optional klick-getriggert.

## Definition of Done

- Neuer Check-Type `source_concentration`.
- Detection-Logik (SQL).
- Health-Modal-UI mit Action-Buttons (Integration FEAT-19-18).
- Anti-Echo-Suche-Trigger (Reuse Web-Search-Provider FEAT-19-19).
- Live-Test mit Mock-Cluster-Daten plus Sebastians realer Vault.
