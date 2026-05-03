# Feature: Note-Summary Storage

> **Feature ID**: FEAT-15-09
> **Epic**: EPIC-15 - Knowledge Layer
> **Source**: BA-25 Section 7.2 Retrieval
> **Priority**: P0
> **Effort Estimate**: S

## Feature Description

Eine neue Tabelle `note_summaries` in der knowledge.db speichert pro Vault-Note eine Note-Level-Summary plus Generierungs-Metadaten (Modell, Zeitpunkt, Source-mtime). Die Summary ist die fehlende Verbindungsschicht zwischen Per-Chunk-Vektoren und Vault-Inhalt: Retrieval-Output wird angereichert, Taxonomie-Lookups arbeiten gegen eine konsolidierte Note-Sicht.

Die Tabelle wird beim Indexing-Lauf (SemanticIndexService) befuellt, entweder durch Uebernahme einer existierenden Frontmatter-`Zusammenfassung`-Property (siehe FEAT-19-09) oder durch leere Vorbelegung fuer spaetere Generierung.

## Benefits Hypothesis

Wir glauben, dass eine Note-Level-Summary in der DB die Voraussetzung fuer alle weiteren Sub-Initiativen ist (SQL-Taxonomie, Top-Hub-Block, Cluster-Pflege). Folgende messbare Outcomes liefert: Retrieval-Hits enthalten Note-Level-Kontext (statt nur Chunk-Snippets); SQL-Lookups gegen Notes funktionieren in 1ms statt mehreren Sekunden LLM-Suche.

Wir wissen, dass wir erfolgreich sind, wenn nach Backfill > 95% aller Notes eine Summary in der DB tragen.

## User Stories

**Story 1:** Als Power-User moechte ich, dass Retrieval-Antworten pro Hit eine Note-Level-Summary enthalten, um den Kontext schneller zu verstehen ohne jedes Mal die ganze Note oeffnen zu muessen.

**Story 2:** Als System (nicht User-facing) moechte ich SQL-Queries gegen Note-Summaries ausfuehren koennen, um Cluster-Operationen und Taxonomie-Lookups in Millisekunden statt Sekunden zu beantworten.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Note-Summary kann pro Note gelesen und geschrieben werden | 100% der Notes adressierbar | Manueller Test |
| SC-02 | Storage erlaubt Bulk-Operationen | < 100ms fuer 1.500 Note-Lookup | Performance-Test |
| SC-03 | Generierungs-Metadaten erhalten | Modell + Zeitpunkt + Source-Stand | DB-Inspect |
| SC-04 | Re-Generation triggert nur wenn Source veraendert | Kein unnoetiges Re-Generate | Unit-Test |
| SC-05 | Storage ueberlebt Plugin-Restart | 100% Persistenz | Integration-Test |

## Technical NFRs

- **Performance:** SQL-Lookup pro Note-Path < 1ms, Bulk-Lookup 1.500 Notes < 100ms.
- **Storage:** Schema-Migration knowledge.db v9 -> v10 additiv, kein Datenverlust.
- **Token-Kosten:** keine LLM-Calls in dieser Storage-Schicht.
- **Atomicity:** Reuse der bestehenden atomic-write-Pipeline (ADR-79).

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** Schema-Migration v9 -> v10 darf bestehende Tabellen nicht beruehren (additive only).
- **ASR-2 (Moderate):** note_summaries-Tabelle muss Source-mtime tragen, damit Re-Generation nur bei tatsaechlicher Note-Aenderung erfolgt.

## Definition of Done

- Migration v9 -> v10 implementiert und getestet.
- Read/Write-API in KnowledgeDB-Wrapper.
- Unit-Tests fuer Insert, Update, Bulk-Read.
- Migration auf Sebastians realer DB getestet (1.500 Notes).
- Bestehende Tests laufen weiter durch.
