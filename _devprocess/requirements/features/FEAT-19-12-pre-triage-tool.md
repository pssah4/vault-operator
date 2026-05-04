# Feature: Pre-Triage-Tool mit 10s-Triage-Karte

> **Feature ID**: FEAT-19-12
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.1
> **Priority**: P0
> **Effort Estimate**: M

## Feature Description

Ein neues Tool (oder Tool-Action), das in unter 15 Sekunden eine Triage-Karte fuer eine Source erzeugt: Relevanz-Score, Cluster-Match, Vault-Vergleich (deckt sich / ergaenzt / widerspricht), Source-Diversity-Hint. User entscheidet dann ja/nein/spaeter.

Pipeline: Source extrahieren -> Compact-Embed -> Cluster-Match (SQL-Lookup) -> Single-LLM-Call mit Cluster-Context -> Triage-Karte rendern.

Token-Kosten Ziel: < 0.05 USD pro Triage. Triage-Karte landet im Vault-Health-Modal-Tab "Pending Triage".

## Benefits Hypothesis

Wir glauben, dass eine 10-Sekunden-Triage-Karte den Ingest-Backlog reduziert, weil User nicht jedes Mal den ganzen Artikel lesen muss um zu entscheiden. Folgende messbare Outcomes liefert: 30-60% Ingest-Rate (echte Selektion findet statt, BA-25 KPI); Token-Kosten < 0.05 USD pro Triage (BA-25 H-07).

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen User-Befragung die Triage-Karte als hilfreich bewertet wird (NPS > 7).

## User Stories

**Story 1:** Als Power-User moechte ich beim Stossen auf einen Artikel in 10 Sekunden wissen, ob er meinem Wissen widerspricht oder es bestaetigt, um nicht den gesamten Artikel lesen zu muessen.

**Story 2:** Als Power-User moechte ich Sources verwerfen koennen, ohne dass das System sie weiter in der Inbox haelt, um Backlog-Disziplin zu wahren.

**Story 3:** Als User moechte ich Triage manuell ueber ein Tool oder per Auto-Trigger (FEAT-19-27) starten koennen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Triage-Pass dauert < 15 Sekunden | End-to-End | Telemetrie |
| SC-02 | Triage-Token-Kosten < 0.05 USD | Pro Triage | LLM-Call-Tracking |
| SC-03 | Triage-Karte zeigt 4 Kern-Felder | Relevanz, Cluster-Match, Verhaeltnis, Source-Diversity | UI-Test |
| SC-04 | User-Decision wird gespeichert | Triage-Status in DB persistiert | Unit-Test |
| SC-05 | Verworfene Sources verschwinden aus Pending-Tab | UI-Test | Manueller Test |

## Technical NFRs

- **Performance:** Single LLM-Call mit ~3k Token Input, ~500 Token Output.
- **Token-Kosten:** Default-Modell Haiku, konfigurierbar.
- **Storage:** Triage-Decisions in DB (zB neue `ingest_triage_log`-Tabelle).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Tool-Architektur ist Open Question: eigenes `ingest_triage`-Tool vs Erweiterung `ingest_document`. ADR-Bedarf.
- **ASR-2 (Moderate):** Source-Extraction-Pipeline muss alle gaengigen Source-Typen abdecken (URL, PDF, Markdown, MD-Note in Vault).

## Definition of Done

- Tool-Definition plus Execute-Logik.
- Cluster-Match-Pipeline via SQL.
- LLM-Call mit Triage-Karten-Schema.
- UI-Komponente fuer Triage-Karte (Vault-Health-Modal-Tab).
- Telemetrie pro Triage.
- Live-Test mit 5 Sebastians-typischen Sources.
