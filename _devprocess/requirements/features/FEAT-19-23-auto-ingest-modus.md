# Feature: Auto-Ingest-Modus (Modus B)

> **Feature ID**: FEAT-19-23
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.2.2
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

Karpathys "less supervised" Pattern: nach Triage-Decision "Ingest" generiert das System ohne Dialog Sense-Making-Notes plus Vault-Updates auf Basis von Default-Annahmen. User wird ueber Notification ("Source X ingestiert, Y Notes erstellt, Z Notes beruehrt") informiert, kann nachtraeglich im Health-Modal-Tab "Recent Ingests" reviewen.

Token-Kosten: 0.10-0.30 USD pro Source. User-Time: 30 Sekunden Review. Default-Modus fuer Casual-User, Optional-Modus bei Inbox-Bulk-Verarbeitung (FEAT-19-15).

## Benefits Hypothesis

Wir glauben, dass Auto-Modus Skalierung fuer Batch-Inbox ermoeglicht. Folgende messbare Outcomes liefert: Casual-User ohne Pflege-Praxis bekommt strukturierte Notes ohne Lernkurve; Power-User kann unwichtige Sources auto-ingesten und nur wichtige im Dialog bearbeiten.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen ein gesundes Verhaeltnis Auto:Dialog (zB 70:30 fuer Power-User) entsteht.

## User Stories

**Story 1:** Als Casual-User moechte ich Sources auto-ingesten lassen, ohne mich auf jeden Sense-Making-Dialog einlassen zu muessen.

**Story 2:** Als Power-User moechte ich beim Bulk-Ingest aus Inbox die unwichtigen Sources auto-verarbeiten und nur die wichtigen im Dialog vertiefen.

**Story 3:** Als User moechte ich Auto-Ingest-Resultate spaeter im Health-Modal reviewen und ggf nachpflegen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Auto-Ingest laeuft ohne User-Interaktion | End-to-End ohne Dialog | Integration-Test |
| SC-02 | Notification informiert ueber Resultat | Token-Count, Note-Count | UI-Test |
| SC-03 | Recent-Ingests-Tab zeigt Liste fuer Review | Letzte 50 Ingests | UI-Test |
| SC-04 | Token-Kosten < 0.30 USD pro Source | LLM-Call-Tracking | Telemetrie |
| SC-05 | User kann nachtraeglich auf Dialog-Modus eskalieren | Re-Ingest-Action | Manueller Test |

## Technical NFRs

- **Performance:** Auto-Ingest asynchron, blockiert UI nicht.
- **Token-Kosten:** 0.10-0.30 USD pro Source bei Haiku.
- **Failure-Mode:** Wenn LLM-Call scheitert, Source bleibt im Triaged-Status, Re-Versuch moeglich.

## Definition of Done

- Auto-Pipeline ohne Dialog-Steps.
- Notification-System fuer Ingest-Completion.
- Recent-Ingests-Tab im Vault-Health-Modal.
- Re-Ingest-Action (Eskalation auf Dialog).
- Live-Test mit Bulk-Inbox.
