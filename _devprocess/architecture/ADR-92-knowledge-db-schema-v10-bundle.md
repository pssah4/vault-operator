---
id: ADR-92
title: Schema-Migration knowledge.db v9 -> v10 (4-Tabellen-Bundle)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-15-09
  - FEAT-15-10
  - FEAT-15-11
  - FEAT-15-12
  - ADR-50
  - ADR-79
---

# ADR-92: Schema-Migration knowledge.db v9 -> v10 (4-Tabellen-Bundle)

## Context

BA-25 erfordert mehrere neue Tabellen plus eine Tabelle fuer Workflow-State in knowledge.db, die alle drei Sub-Initiativen (Retrieval, Ingest, Lint) tragen:

- `note_summaries` fuer Note-Level-Summaries (FEAT-15-09)
- `frontmatter_properties` fuer SQL-beschleunigte Taxonomie (FEAT-15-10)
- `cluster_source_stats` fuer Source-Diversity-Tracking (FEAT-15-11)
- `cluster_metadata` fuer konfigurierbare Halbwertszeit plus Hot-Cluster-Flag plus last_hint_at-Spalte (FEAT-15-12, ergaenzt durch ADR-106)
- `ingest_session` fuer Dialog-Ingest-Workflow-State (ADR-100, FEAT-19-22)
- `ingest_triage_log` fuer Triage-Decisions plus Doppel-Trigger-Schutz (ADR-98 plus ADR-102, FEAT-19-12, FEAT-19-27)

Eine zweite Migration auf dieselbe Schema-Version waere mit hohem Risiko verbunden (siehe ADR-79 BUG-012-Lehre: "spalten-mutierende Migrationen muessen den WriterLock VORHER acquiren"). Die Frage ist, ob alle vier Tabellen in einer Migration v9 -> v10 oder in zwei Schritten (v9 -> v10 fuer Retrieval-Tabellen, v10 -> v11 fuer Ingest/Lint-Tabellen) gehen.

## Decision Drivers

- Migration-Risiko (additive vs spalten-mutierend)
- Implementierungsgeschwindigkeit der Phase 1
- Rollback-Faehigkeit bei Migration-Fehlschlag
- Konsistenz mit bisheriger Schema-Praxis

## Considered Options

### Option A: Vier Tabellen in einer Migration v9 -> v10

Pros:
- Eine atomare Schema-Aenderung.
- Spaetere Migrations bleiben frei fuer nicht-bundle Aenderungen.
- Test einmal, deployt einmal.

Cons:
- Bei Fehler im vierten Tabellen-Create muss alles zurueckgerollt werden.
- Migration-Code wird groesser.

### Option B: Zwei Schritte (v9 -> v10 plus v10 -> v11)

Pros:
- Granulare Rollback-Faehigkeit pro Schritt.
- Migration-Code je Schritt kleiner.

Cons:
- Doppelter Migration-Aufwand bei jeder DB-Open.
- Zwei Schema-Versionen-Spruenge in einer Initiative wirken hektisch.
- Risiko bei Mid-State (v10 erfolgreich, v11 schlaegt fehl).

### Option C: Vier separate Migrations v9 -> v13

Pros:
- Maximale Granularitaet.

Cons:
- Vier Schema-Versions-Spruenge fuer eine Initiative ist Overkill.
- Performance-Overhead beim Open.

## Decision

**Option A**: Eine Migration v9 -> v10, vier Tabellen additiv erstellt.

Begruendung:
- Alle vier Tabellen sind rein additiv (kein ALTER auf bestehende Tabellen, keine Spalten-Mutation). Das Risiko aus BUG-012 trifft hier nicht zu.
- Fehler-Rollback per Transaction wrap moeglich. Bei sql.js wird die DB nicht persistiert wenn der Migration-Block scheitert (export() laeuft nur am Ende).
- Bestehende Migration-Praxis (siehe ADR-50/79 Migrations-Chain v0 bis v9) hat alle Schritte additiv und in einem Block gehalten.
- Implementierungsgeschwindigkeit: ein Migration-Test, ein Rollback-Pfad.

## Consequences

### Positive
- Phase 1 (PLAN-10) liefert in einem Migrations-Schritt die Foundation fuer alle drei Sub-Initiativen.
- Schema-Versions-Spruenge bleiben uebersichtlich (knowledge.db v10 ist die Karpathy-Wiki-Foundation).

### Negative
- Migration-Test muss alle vier Tabellen abdecken.
- Bei Bug in einem Tabellen-Create bleibt die DB auf v9 (Mid-State-Problem ausgeschlossen, weil sql.js export erst am Ende).

### Risks
- Wenn spaeter eine fuenfte Tabelle vor Release dazu kommt, sollte sie ebenfalls in v10 landen (kein Mehrfach-Migration-Sprung im selben Release).

## Implementation Notes

Migration-Block kommt in den bestehenden Migration-Chain-Pfad. Sechs `CREATE TABLE IF NOT EXISTS`-Statements plus zugehoerige Indexes. Tabellen-Schemas werden in den jeweiligen Feature-ADRs konkretisiert:

- ADR-93 fuer cluster_source_stats Source-Identitaet
- ADR-94 fuer cluster_metadata Halbwertszeit-Modell
- ADR-100 fuer ingest_session State-Schema
- ADR-98 / ADR-102 fuer ingest_triage_log
- ADR-106 fuer cluster_metadata.last_hint_at-Erweiterung

note_summaries und frontmatter_properties haben keinen eigenen ADR, weil ihre Schemas direkt aus den FEATURE-Specs ableitbar sind (siehe FEAT-15-09 und FEAT-15-10).

Migration-Test muss alle sechs Tabellen abdecken plus Schema-Version v10-Marker setzen.
