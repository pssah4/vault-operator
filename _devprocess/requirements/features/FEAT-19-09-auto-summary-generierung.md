# Feature: Auto-Summary-Generierung beim Indexing

> **Feature ID**: FEAT-19-09
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 7.2 Retrieval
> **Priority**: P0
> **Effort Estimate**: M

## Feature Description

Beim SemanticIndexService-Build pro Note: Frontmatter lesen. Wenn `Zusammenfassung`-Property existiert, in note_summaries (FEAT-15-09) uebernehmen. Wenn nicht: LLM-Call mit Standard-Prompt (FEAT-19-08), Summary plus Keywords plus Themen plus Konzepte generieren, in note_summaries und frontmatter_properties (FEAT-15-10) speichern.

Setting-gated via `vaultIngest.autoSummary.enabled` (Default off, kein Token-Verbrauch ohne User-Aktivierung). Bei Aktivierung kann der User wahlweise nur fuer neue Notes generieren oder einen Backfill auf bestehende Notes triggern (siehe FEAT-19-10).

## Benefits Hypothesis

Wir glauben, dass Auto-Generierung beim Indexing die manuelle Pflege fuer den User auf null reduziert. Folgende messbare Outcomes liefert: Token-Kosten pro Indexing-Lauf bleiben unter Budget (BA-25 KPI: < 1.50 USD bei Haiku fuer 1.500 Notes); existierende Frontmatter-Pflege wird nicht ueberschrieben (Bestehendes hat Vorrang).

Wir wissen, dass wir erfolgreich sind, wenn nach Aktivierung > 95% der Notes eine Summary in der DB tragen, ohne dass User aktiv triggern musste.

## User Stories

**Story 1:** Als Power-User moechte ich, dass neue Notes automatisch eine Summary erhalten, ohne dass ich manuell den Skill triggern muss, um Pflege-Last zu eliminieren.

**Story 2:** Als Power-User moechte ich, dass meine bisher manuell gepflegten Summaries unangetastet bleiben, um keine Pflege zu verlieren.

**Story 3:** Als Casual User moechte ich das Feature einfach in Settings aktivieren koennen, ohne Schema-Konfiguration vornehmen zu muessen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Existierende Frontmatter-Summary wird respektiert | 100% Bestehendes erhalten | Unit-Test |
| SC-02 | Auto-Generierung funktioniert beim Indexing | Generierung pro Note ohne Eingriff | Integration-Test |
| SC-03 | Token-Kosten sind kontrollierbar | < 0.001 USD pro Note bei Haiku | LLM-Call-Tracking |
| SC-04 | Setting kann jederzeit deaktiviert werden | Keine LLM-Calls bei OFF | Manueller Test |
| SC-05 | Generierung beeinflusst nicht die Indexing-Performance des Hot-Path | Asynchron, Index-Build laeuft normal weiter | Performance-Test |

## Technical NFRs

- **Performance:** Generierung asynchron, blockiert nicht UI.
- **Token-Kosten:** Default-Modell Haiku, konfigurierbar via FEAT-19-08.
- **Concurrency:** mehrere Note-Generierungen koennen parallel laufen (Rate-Limit beachten).
- **Failure-Mode:** wenn LLM-Call fehlschlaegt, kein Block des Indexings, Skip mit Log-Eintrag.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Idempotenz: erneutes Indexing einer unveraenderten Note darf nicht erneut LLM-Call ausloesen.
- **ASR-2 (Moderate):** Token-Budget-Cap pro Indexing-Lauf optional konfigurierbar (Schutz vor Auto-Reindex-Kosten-Spike).

## Definition of Done

- Indexing-Hook im SemanticIndexService.
- Frontmatter-Lese-Logik plus Fallback auf Generierung.
- Idempotenz via mtime-Vergleich (Source-Stand in note_summaries).
- Settings-Toggle plus UI-Beschreibung.
- Live-Test auf Sebastians Vault: Generierung von 10 ungepflegten Notes, Summary-Qualitaet bewerten.
