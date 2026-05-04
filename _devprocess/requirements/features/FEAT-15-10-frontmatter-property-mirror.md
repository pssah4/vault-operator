# Feature: Frontmatter-Property Mirror

> **Feature ID**: FEAT-15-10
> **Epic**: EPIC-15 - Knowledge Layer
> **Source**: BA-25 Section 7.2 Retrieval
> **Priority**: P0
> **Effort Estimate**: M

## Feature Description

Eine neue Tabelle `frontmatter_properties` spiegelt beim Indexing-Lauf alle Frontmatter-Properties pro Vault-Note in die DB. Dies ermoeglicht SQL-Lookups gegen Themen, Konzepte, Tags und beliebige andere Properties in Millisekunden. Heute muss der Agent fuer Themen-Disambiguierung jedes Mal einen LLM-Volltext-Search machen.

Die Tabelle ergaenzt die bestehende `tags`-Tabelle, ohne sie zu ersetzen. Existierende Tag-Logik bleibt rueckwaertskompatibel.

## Benefits Hypothesis

Wir glauben, dass SQL-beschleunigte Taxonomie-Suche LLM-Tokens pro neuer Note um > 50% reduziert (BA-25 H-02). Folgende messbare Outcomes liefert: Themen-Vorschlaege beim Ingest kommen aus existierender Vault-Taxonomie statt LLM-frei erfunden, was Schreibvarianten ("AI-Agent" vs "KI-Agent") aktiv verhindert.

Wir wissen, dass wir erfolgreich sind, wenn Themen-Synonym-Cluster im Vault um > 50% reduziert werden (Audit nach 4 Wochen Use).

## User Stories

**Story 1:** Als Power-User moechte ich, dass Auto-Pflege fuer neue Notes existierende Themen aus meinem Vault verwendet statt aehnliche Synonyme einzufuehren, um meine Taxonomie-Konsistenz ueber Jahre zu wahren.

**Story 2:** Als System moechte ich pro Note alle Frontmatter-Properties als SQL-queryable Daten verfuegbar haben, um Cluster- und Bias-Operationen in DB-Geschwindigkeit zu betreiben.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Properties werden bei Indexing automatisch gespiegelt | 100% der Notes mit Frontmatter | Manueller Test |
| SC-02 | Property-Lookups sind schnell | < 1ms pro Property-Wert-Suche | Performance-Test |
| SC-03 | Multi-Wert-Properties (Listen) werden korrekt gespeichert | 100% der Listen-Properties | Unit-Test |
| SC-04 | Mirror bleibt aktuell bei Note-Aenderung | Update innerhalb 1 Indexing-Cycle | Integration-Test |
| SC-05 | Bestehende `tags`-Tabelle bleibt funktional | 0 Regression in Tag-Lookups | Regression-Test |

## Technical NFRs

- **Performance:** Property-Wert-Suche < 1ms, Bulk-Property-Listing < 50ms.
- **Storage:** Schema-Migration v9 -> v10 (gemeinsam mit FEAT-15-09).
- **Token-Kosten:** keine LLM-Calls in dieser Schicht.
- **Sync:** Indexing-Hook ergaenzt Mirror, keine separaten Trigger noetig.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Schema-Erweiterung muss klaeren, ob `tags` migriert oder parallel betrieben wird (offene Architektur-Frage, ADR-Bedarf).
- **ASR-2 (Moderate):** Property-Wert-Normalisierung (case-sensitive, whitespace, accents) muss konsistent sein.

## Definition of Done

- Migration v9 -> v10 (gebuendelt mit FEAT-15-09).
- Read/Write-API plus Bulk-Lookup-Helpers.
- Indexing-Hook im SemanticIndexService liest Frontmatter und schreibt Mirror.
- Unit-Tests fuer Single-, Multi-, und List-Properties.
- Live-Validierung: existierende Themen aus Sebastians Vault (~50-200 distinct Themen) sind als Liste abrufbar.
