# Feature: Stufe-1 Composite-Freshness-Score als VaultHealth-Check

> **Feature ID**: FEAT-19-16
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 12.1
> **Priority**: P0
> **Effort Estimate**: M

## Feature Description

Erweiterung des bestehenden VaultHealthService um einen neuen Check-Type `cluster_freshness`. Pro Cluster wird ein Composite-Freshness-Score lokal berechnet (kein LLM-Call):

```
Score = w1 * (1 - Content-Age / Halbwertszeit)
      + w2 * (1 - Coverage-Drift)
      + w3 * (1 - Stale-Reference-Rate)
```

w1=0.6, w2=0.3, w3=0.1 (Default, konfigurierbar). Schwellwerte: Score < 70 = Hint, < 50 = Warning, < 30 = Critical.

Trigger: beim Vault-Open (existing VaultHealthService-Pass). SQL-only, null Token-Kosten. Findings landen im Vault-Health-Modal mit Action-Button "Update-Check starten" (triggert FEAT-19-19 Stufe 2).

## Benefits Hypothesis

Wir glauben, dass Stufe-1 lokal "stale" Notes mit > 70% Precision identifiziert (BA-25 H-11). Folgende messbare Outcomes liefert: User sieht beim Vault-Open sofort welche Cluster reif sind; null Token-Kosten fuer Default-Lint.

Wir wissen, dass wir erfolgreich sind, wenn Sample-Eval > 70% Precision zeigt und User die Findings als nuetzlich bewertet.

## User Stories

**Story 1:** Als Power-User moechte ich beim Vault-Open sofort sehen, welche Cluster nach meinem Halbwertszeit-Modell reif sind, ohne aktiv triggern zu muessen.

**Story 2:** Als Token-bewusster User moechte ich diese passive Lint-Stufe ohne Mehrkosten nutzen koennen.

**Story 3:** Als User moechte ich Findings dismissen koennen, wenn ein Cluster bewusst alt bleiben soll.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Score-Berechnung lokal, ohne LLM | 0 Token-Kosten | Unit-Test |
| SC-02 | Score korrekt nach Formel | Math-Verification | Unit-Test |
| SC-03 | Findings landen im Health-Modal | Konsistente UI | Manueller Test |
| SC-04 | Schwellwerte konfigurierbar | Settings-Lookup | Unit-Test |
| SC-05 | Dismissed Findings re-erscheinen nicht | dismissed_health_findings reused | Unit-Test |

## Technical NFRs

- **Performance:** Score-Berechnung pro Cluster < 50ms, gesamter Check < 500ms fuer 50 Cluster.
- **Token-Kosten:** 0 (rein SQL-basiert).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Coverage-Drift-Berechnung benoetigt Cluster-Membership (verlinkte Notes), Performance-Optimierung via Index noetig.

## Definition of Done

- Score-Berechnungs-Logik in VaultHealthService.
- Neuer Check-Type `cluster_freshness`.
- Health-Modal-UI-Erweiterung (FEAT-19-18) mit Action-Button.
- Schwellwert-Settings.
- Sample-Eval auf Sebastians Vault (10 Cluster, Precision-Bewertung).
