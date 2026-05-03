# Feature: Stufe-3 Periodischer Job plus Token-Budget-Cap plus Notifications

> **Feature ID**: FEAT-19-20
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 12.3
> **Priority**: P2
> **Effort Estimate**: L

## Feature Description

Wochentlicher Background-Job, opt-in via Settings:

1. Iteration ueber Hot-Clusters (FEAT-19-21) sortiert nach Freshness-Score (niedrig zuerst).
2. **Semantic-Pre-Filter** (cheap LLM-Call): "Hat sich zu diesem Topic seit Datum X wahrscheinlich was Wesentliches geaendert?". yes/no/unsure.
3. Bei "yes" oder "unsure": Light-Web-Search wie Stufe 2.
4. **Strong-Signal-Filter** pro Befund: min 3 unabhaengige Sources melden vergleichbare Aenderung. Nur strong signals werden Notification.
5. Notifications gesammelt am Wochenende dem User in Vault-Health-Modal angezeigt.

**Token-Budget-Cap:** Default 2 USD/Woche, konfigurierbar. Hartes Stop-Limit. Notification bei 80% Verbrauch.

## Benefits Hypothesis

Wir glauben, dass Stufe-3 unter Default-Budget bleibt bei realer Nutzung (BA-25 H-13). Folgende messbare Outcomes liefert: User wird aktiv informiert ohne Token-Falle; Update-Findings haben > 70% Precision (BA-25 H-14).

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen Budget eingehalten und User-Befragung Findings als wertvoll bewertet.

## User Stories

**Story 1:** Als Power-User moechte ich periodisch ueber neue Entwicklungen in meinen Hot-Clusters informiert werden, ohne aktiv suchen zu muessen.

**Story 2:** Als Token-bewusster User moechte ich ein hartes Wochen-Budget setzen, das niemals ueberschritten wird.

**Story 3:** Als User moechte ich Notifications am Wochenende gesammelt bekommen, statt verstreut waehrend der Woche.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Job laeuft wochentlich, opt-in | Default off | Settings-Test |
| SC-02 | Token-Budget-Cap hart enforced | Job stoppt bei Limit | Integration-Test |
| SC-03 | Notification bei 80% Verbrauch | Counter-basiert | Unit-Test |
| SC-04 | Strong-Signal-Filter (min 3 unabhaengige Sources) | Logik korrekt | Unit-Test |
| SC-05 | Notifications gesammelt im Modal | Wochenend-Bundle | UI-Test |

## Technical NFRs

- **Performance:** Job laeuft asynchron im Hintergrund.
- **Token-Kosten:** Default-Budget 2 USD/Woche.
- **Reliability:** Job-Runner ueberlebt Plugin-Restart, retry-faehig.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Stufe-3-Job-Runner-Mechanik (setInterval, BackgroundFetch, Cron-via-OS) ist Open Question. ADR-Bedarf.
- **ASR-2 (Critical):** Token-Budget-Enforcement-Mechanik (soft cap vs hard cap, Reset-Strategie) ist ADR-Bedarf.

## Definition of Done

- Job-Runner-Implementation (Architektur-Wahl per ADR).
- Token-Budget-Counter mit Hard-Stop.
- Semantic-Pre-Filter LLM-Call.
- Strong-Signal-Filter-Logik.
- Notification-Sammelung plus Wochenend-Display.
- Settings-UI fuer Opt-In, Budget, Hot-Cluster-Hinweis.
