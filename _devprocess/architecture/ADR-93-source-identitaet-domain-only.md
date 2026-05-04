---
id: ADR-93
title: Source-Identitaet-Modell (Domain-only fuer MVP)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-15-11
  - FEAT-19-14
  - FEAT-19-17
---

# ADR-93: Source-Identitaet-Modell (Domain-only fuer MVP)

## Context

cluster_source_stats (FEAT-15-11) zaehlt pro Cluster den Anteil pro Source. Das Identitaets-Modell der Source bestimmt, wie Bias-Analyse (FEAT-19-17) und Anti-Echo-Vorschlag (FEAT-19-14) wirken. Drei Granularitaets-Stufen sind moeglich: Domain-only, Domain+Author, Domain+Author+Section. Hoehere Granularitaet liefert praezisere Diversity-Score, kostet aber Implementations-Aufwand und Daten-Robustheit (Author-Extraktion aus HTML/PDF ist fehleranfaellig).

## Decision Drivers

- Implementierungsgeschwindigkeit MVP
- Korrektheit der Diversity-Bewertung
- Robustheit gegen Daten-Variationen
- Spaetere Erweiterbarkeit ohne Schema-Bruch

## Considered Options

### Option A: Domain-only

Pros:
- Domain ist trivial extrahierbar (URL-parse).
- Kein Author-Extraction-Pflege-Aufwand.
- Schema sehr klein (cluster, source_domain, note_count).

Cons:
- Aggregator-Sites (medium.com, substack.com) sammeln viele verschiedene Autoren unter einer Domain.
- Reddit/HN als eigene Source-Klasse waeren wuenschenswert.

### Option B: Domain + Author

Pros:
- Praeziser bei Aggregator-Sites.
- Diversity-Score wird inhaltlich besser.

Cons:
- Author-Extraction aus HTML ist fehleranfaellig (verschiedene Schemas).
- PDF-Author oft im Metadata-Feld leer.
- Implementations-Aufwand hoeher.

### Option C: Domain + Author + Section

Pros:
- Maximale Granularitaet.

Cons:
- Section-Extraktion komplex und Site-spezifisch.
- Overengineering fuer MVP.

## Decision

**Option A**: Domain-only fuer MVP. Author-Level-Tracking als spaeterer additiver Schritt deferred (kein Schema-Bruch, weil Spalte ergaenzbar).

Begruendung:
- BA-25 R-9 listet Domain-only als Mitigation explizit ("spaetere Iteration: Author-Level-Tracking, Reddit/HN als eigene Source-Klasse").
- 80/20-Regel: Domain-Konzentration ist der haeufigste Echo-Chamber-Indikator. Aggregator-Sites bleiben Edge-Case.
- Robustheit: URL-Parse hat null Failure-Modes, Author-Extract hat viele.

## Consequences

### Positive
- MVP-Implementierung in S-Effort (FEAT-15-11).
- Schema bleibt klein und schnell.

### Negative
- Bei medium.com-lastigen Clustern unterschaetzt das System die tatsaechliche Source-Diversity.
- Concentration-Warning kann false-positive sein wenn Aggregator-Site mehrere Autoren hat.

### Risks
- User koennte sich an niedrige Concentration-Scores gewoehnen, weil Aggregator-Sites unterschaetzt werden. Mitigation: Author-Level-Tracking als FEAT-19-31 in Backlog vormerken (deferred).

## Implementation Notes

Schema cluster_source_stats: `(cluster TEXT NOT NULL, source_domain TEXT NOT NULL, note_count INTEGER NOT NULL DEFAULT 0, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, PRIMARY KEY (cluster, source_domain))`.

Domain-Normalisierung: lowercase, strip www., strip http/https-Protokoll, strip Trailing-Slash. Vault-URL-zu-Domain-Helper als reine Util-Funktion.
