# Feature: Tension-Detection beim Deep-Ingest

> **Feature ID**: FEAT-19-13
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.2.1
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

Beim Deep-Ingest werden Key-Claims der neuen Source pro-Claim gegen vorhandene Notes im Match-Cluster verglichen. Pro Claim klassifiziert das System: stuetzt-Note-X / widerspricht-Note-Y / neutral / orthogonal. Widersprechende Claims werden als Inline-Callout `> [!tension]` mit Wikilink zur betroffenen Note in die generierte Sense-Making-Note geschrieben.

Macht Karpathys Wiki-Lint-Idee live: Widersprueche werden im Moment der Aufnahme markiert statt spaeter im Lint-Pass entdeckt.

## Benefits Hypothesis

Wir glauben, dass Tension-Marker mit > 60% Precision widersprechende Aussagen identifizieren (BA-25 H-09). Folgende messbare Outcomes liefert: > 5% der ingestierten Notes haben mindestens einen Tension-Marker (BA-25 KPI); User findet Marker wertvoll (NPS > 7 in Befragung).

Wir wissen, dass wir erfolgreich sind, wenn Sample-Eval > 60% korrekte Tension-Markierungen zeigt.

## User Stories

**Story 1:** Als Power-User moechte ich beim Ingest sofort sehen, welche neuen Aussagen meinen bestehenden Notes widersprechen, um nicht spaeter unbemerkt mit veraltetem Wissen zu argumentieren.

**Story 2:** Als Power-User moechte ich Tension-Marker dismissen koennen, wenn die Klassifikation falsch ist, um false-positives zu unterdruecken.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Tension-Marker werden im Sense-Making-Note geschrieben | Inline-Callout-Format | Manueller Test |
| SC-02 | Marker hat Wikilink zur betroffenen Note | Klickbar | Manueller Test |
| SC-03 | Tension-Detection-Precision > 60% | Sample-Eval | Manuelle Bewertung |
| SC-04 | User kann Marker dismissen | Property-Toggle pro Marker | Unit-Test |
| SC-05 | Confidence-Label am Marker | hoch / mittel / niedrig | UI-Test |

## Technical NFRs

- **Performance:** Tension-Check pro Claim < 200ms (LLM-Call-Batched).
- **Token-Kosten:** ~0.10-0.30 USD pro Source mit 5-10 Claims.
- **Failure-Mode:** Wenn Vault-Vergleich fehlschlaegt, Note wird trotzdem geschrieben, kein Tension-Marker.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Tension-Detection-Algorithmus ist Open Question: Cosine-Schwellwert vs LLM-Klassifikation vs Hybrid. ADR-Bedarf.
- **ASR-2 (Moderate):** Confidence-Threshold fuer Marker-Display konfigurierbar.

## Definition of Done

- Detection-Pipeline (LLM-basiert, Hybrid mit Cosine-Pre-Filter empfohlen).
- Marker-Render-Logik fuer Sense-Making-Notes (Modus 2 und 3).
- Dismiss-Action im UI.
- Sample-Eval mit 10 Sources zur Precision-Validierung.
- Live-Test auf Sebastians Vault.
