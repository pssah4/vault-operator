# Feature: PDF-Strategie (Page-Refs Default vs Markdown-Mirror opt-in)

> **Feature ID**: FEAT-19-29
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.2.4
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

PDF bleibt **immer** im Attachments-Folder (Grafiken, Bilder, Layout-Information bleiben erhalten). Zwei-spurige Strategie:

- **Variante 1 Default `page-refs`:** Keine Konvertierung. Source-Position-Marker via Page-Refs `[[source.pdf#page=N]]`. parsePdf laeuft im Hintergrund fuer Embedding (existing).
- **Variante 2 opt-in `markdown-mirror`:** PDF wird zusaetzlich zu Markdown konvertiert (existing parseDocument-Pipeline EPIC-06). Markdown-Mirror als Sibling-Note im Sources-Folder, mit Wikilink zur PDF. Block-Level-Granularitaet, bessere Retrieval-Granularitaet.

Setting: `vaultIngest.pdfStrategy: 'page-refs' | 'markdown-mirror'`. Default `page-refs` (konservativ).

## Benefits Hypothesis

Wir glauben, dass Page-Refs als Default fuer > 70% der Sebastians-Quellen ausreicht (BA-25 H-22). Folgende messbare Outcomes liefert: Power-User mit text-lastigen Forschungs-PDFs aktivieren Markdown-Mirror gezielt; default-Pfad belastet nicht mit Konvertierungs-Overhead.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen User-Befragung Markdown-Mirror-Aktivierung bei < 30% liegt und beide Varianten ohne Beschwerden funktionieren.

## User Stories

**Story 1:** Als Power-User mit grafik-lastigen PDFs moechte ich Page-Refs als Default, weil Markdown-Konvertierung Bilder verliert.

**Story 2:** Als Forscher mit text-lastigen Papers moechte ich Markdown-Mirror aktivieren, um bessere Block-Level-Retrieval zu haben.

**Story 3:** Als User moechte ich pro PDF entscheiden koennen, welche Strategie passt.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | PDF bleibt immer im Vault | Original niemals geloescht | Integration-Test |
| SC-02 | Page-Refs sind klickbar | Desktop + Mobile | Manueller Test |
| SC-03 | Markdown-Mirror wird bei Aktivierung erstellt | Sibling-Note mit Wikilink zur PDF | Integration-Test |
| SC-04 | Pro PDF kann Strategie ueberschrieben werden | Per-Note-Override | UI-Test |
| SC-05 | parsePdf-Pipeline reused, kein Duplikat | Code-Review | Manueller Check |

## Technical NFRs

- **Performance:** Page-Refs ohne Konvertierungs-Overhead. Markdown-Mirror einmalig pro PDF, asynchron.
- **Storage:** Markdown-Mirror als Sibling-Note (kein Duplikat in DB).
- **Sync:** Mirror und PDF muessen Vault-Sync-konform sein.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Critical):** PDF-Page-Reference-Format-Kompatibilitaet auf allen Obsidian-Plattformen ist Open Question. ADR-Bedarf.
- **ASR-2 (Moderate):** Sync-Modell zwischen PDF (read-only) und Markdown-Mirror (User-editierbar?). Open Question.
- **ASR-3 (Moderate):** Embedding-Quality-Vergleich PDF-Text vs Markdown-Mirror als Telemetrie.

## Definition of Done

- Settings-Schema fuer pdfStrategy.
- Page-Refs-Pfad funktional (existing parsePdf-Embedding).
- Markdown-Mirror-Pipeline (reuse parseDocument).
- Per-PDF-Override-UI.
- Cross-Platform-Test.
