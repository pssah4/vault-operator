# Feature: Stufe-2 Activity-Trigger plus Web-Search-Update-Pass

> **Feature ID**: FEAT-19-19
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 12.2
> **Priority**: P1
> **Effort Estimate**: L

## Feature Description

Vault-Event-Listener registriert auf vault.on('open') und vault.on('modify'). Bei Note-Open/Modify in Cluster X:

1. SQL-Query: Cluster-Freshness-Score plus letzter externer Check.
2. Wenn Score < 70 UND letzter Check > 30 Tage UND kein Cooldown aktiv: dezenter Hint im UI ("Cluster X letzter externer Check vor 92 Tagen. Update-Recherche starten?").
3. Bei Klick "Ja, pruefen": Light-Web-Search (3-5 Queries) plus LLM-Synthese, Befunde als Update-Vorschlag im Vault-Health-Modal.
4. Cooldown: gleicher Cluster max 1x pro Woche, max 5 Hints pro Tag.

Token-Kosten: 0.10-0.50 USD pro Pass (klick-getriggert, selbst-limitierend).

## Benefits Hypothesis

Wir glauben, dass Activity-Trigger 1-5 Hints pro Woche bei P1 generiert mit > 30% Acceptance-Rate (BA-25 H-12). Folgende messbare Outcomes liefert: Sebastians "ideal aber teuer"-Spannungsfeld wird aufgeloest, weil Token-Kosten nur bei aktiver User-Interaktion entstehen.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen Real-Use die Hint-Acceptance-Rate die Zielwerte erfuellt.

## User Stories

**Story 1:** Als Power-User moechte ich beim Beruehren eines reifen Clusters dezent darauf hingewiesen werden, statt selbst daran denken zu muessen.

**Story 2:** Als User moechte ich Update-Recherche per Klick starten, ohne meinen Workflow zu verlassen.

**Story 3:** Als Token-bewusster User moechte ich Cooldown und max-Hints-pro-Tag konfigurieren koennen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Hint feuert nur bei Score < 70 + letzter Check > 30d + kein Cooldown | Triple-Bedingung | Unit-Test |
| SC-02 | Cooldown enforced (1x/Woche pro Cluster, max 5/Tag) | Counter-Logik | Unit-Test |
| SC-03 | Hint dismissable | Settings: pro Cluster, pro Session, dauerhaft | UI-Test |
| SC-04 | Klick triggert Web-Search-Pipeline | 3-5 Queries plus Synthese | Integration-Test |
| SC-05 | Update-Findings landen im Health-Modal | Konsistente UI | Manueller Test |

## Technical NFRs

- **Performance:** Hint-Detection beim Vault-Event < 10ms.
- **Token-Kosten:** 0.10-0.50 USD pro getriggerter Pass.
- **Dependency:** benoetigt konfigurierten Web-Search-Provider (existing FEAT-04-02).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Web-Search-Provider-Strategie (BYOK obligatorisch vs Default-Provider via Vault Operator-Gateway) ist Open Question. ADR-Bedarf.
- **ASR-2 (Moderate):** Activity-Trigger-Cooldown-Strategie (pro Cluster, pro Tag, hybrid) ist ADR-Bedarf.

## Definition of Done

- Vault-Event-Listener.
- Hint-Detection-Logik mit Cooldown.
- Web-Search-Pipeline (Reuse FEAT-04-02 Provider-Stack).
- Update-Findings-Renderer im Health-Modal.
- Cross-Setting fuer Cooldown und max-Hints.
- Live-Test auf Sebastians Vault.
