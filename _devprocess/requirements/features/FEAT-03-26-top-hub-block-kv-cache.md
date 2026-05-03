# Feature: Selektiver Top-Hub-Block im KV-Cache

> **Feature ID**: FEAT-03-26
> **Epic**: EPIC-03 - Context, Memory & Scaling
> **Source**: BA-25 Section 7.2 Retrieval
> **Priority**: P2
> **Effort Estimate**: M

## Feature Description

Optionaler Token-budgetierter (~3k) Block im stabilen System-Prompt-Prefix mit Top-30 Hub-Notes aus der Ontologie plus 1-Zeiler-Summary plus Cluster-Header. ContextComposer haengt den Block an, wenn Setting aktiv. Block wird nur regeneriert bei Hub-Membership-Aenderung oder Hub-Note-Re-Summarization (max 1x pro Tag), um KV-Cache-Stabilitaet zu schuetzen.

Default OFF. Nur aktivieren wenn Telemetrie zeigt, dass Vault-Awareness messbar Tool-Roundtrips reduziert.

## Benefits Hypothesis

Wir glauben, dass Top-Hub-Block search_vault-Aufrufe um > 20% reduziert (BA-25 H-04) und netto positiv im Token-Saldo bleibt (eingesparte Tool-Roundtrips > Block-Mehrkosten). Folgende messbare Outcomes liefert: Agent hat ambient awareness ueber Top-Hubs des Vault, ohne explizit search_vault aufrufen zu muessen.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen mit Block ON die Telemetrie netto positives Verhaeltnis tokens_added vs search_vault_calls_avoided zeigt.

## User Stories

**Story 1:** Als Power-User mit grossem Vault moechte ich, dass der Agent ohne Tool-Call wissen kann was in meinem Vault steht, um Recherche-Antworten schneller zu bekommen.

**Story 2:** Als Token-bewusster User moechte ich das Feature deaktivieren koennen, wenn der Token-Mehrwert nicht ueberzeugt.

**Story 3:** Als System moechte ich den Block KV-Cache-stabil rendern, sodass er bei jedem Call gecached wird, nicht jedes Mal neu berechnet.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Block landet im stabilen Prompt-Prefix | KV-Cache-Hit-Rate > 95% | Telemetrie |
| SC-02 | Token-Budget pro Block respektiert | < 3.000 Token | Token-Counter |
| SC-03 | Regenerierung max 1x pro Tag | Cooldown enforced | Unit-Test |
| SC-04 | Setting-Toggle wirkt sofort | UI-Toggle aendert Verhalten | Manueller Test |
| SC-05 | Telemetrie zeigt netto positiven Saldo (oder negativ -> dann Toggle off-Hint) | Saldo > 0 nach 4 Wochen | A/B-Telemetrie |

## Technical NFRs

- **Performance:** Block-Generierung asynchron beim Hub-Aenderung-Event.
- **Token-Budget:** hartes Cap 3.000 Token, sortiert nach Hub-Score (incoming-edges).
- **Cache:** Block muss vor DateTime-Section im Prefix landen (ADR-62 KV-Cache-Layout).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Block-Lifecycle-Trigger (was loest Regenerierung aus): Hub-Membership-Aenderung, Hub-Note-Re-Summarization, max-Cooldown. ADR-Bedarf.
- **ASR-2 (Moderate):** Block-Format muss KV-Cache-tauglich sein (stabile Reihenfolge, keine flackernden IDs).

## Definition of Done

- Generierung-Pipeline plus Cooldown-Logik.
- ContextComposer-Integration (vor DateTime-Block).
- Telemetrie-Counter (tokens_added, search_vault_calls_avoided).
- Settings-Toggle plus UI-Beschreibung.
- 4-Wochen-Telemetrie-Phase nach Aktivierung.
