---
id: ADR-083
title: Single-Call Tool-Calling Output-Schema
status: Accepted
phase: Building
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - ADR-076-episode-fact-boundary.md
  - ADR-077-memory-v2-storage-schema.md
  - FEATURE-0318-single-call-update-pipeline.md
  - FEATURE-0324-inference-pass-derives.md
triggers:
  - ASR-009 (Tool-Calling-Schema, kein Free-Form-Markdown)
  - ASR-021 (Mention-Detection Schema-agnostisch via Source-Adapter-Registry)
  - ASR-040 (wachsende Episode pro Conversation)
  - ASR-052 (Edge-Konzept-Layer update/extend/derive, E1)
  - ASR-053 (Memory-Typ kind-Spalte, E2/E8)
  - ASR-054 (Noise-Filter, E3)
---

# ADR-083 -- Single-Call Tool-Calling Output-Schema

## Status

Proposed.

## Context

FEATURE-0318 konsolidiert die heutige 2-3-LLM-Call-Pipeline in einen einzigen Single-Call. Das Output-Schema ist der zentrale Vertrag zwischen LLM und FactIntegrator: zu locker -> Parse-Fehler, Drift bei LLM-Provider-Wechsel. Zu strikt -> LLM-Fehlleistungen werden hart abgewiesen.

Triggernde ASRs: ASR-009 (Tool-Calling, kein Free-Form), ASR-021 (Mentions Schema-agnostisch), ASR-040 (eine wachsende Episode pro Conversation), ASR-052 (Edge-Konzept-Layer), ASR-053 (kind-Spalte), ASR-054 (Noise-Filter).

Plus Supermemory-Differenzierung: Edge-Konzept-Layer `update`/`extend`/`derive` (E1), Memory-Typ `kind` (E2), Noise-Filter (E3).

## Decision Drivers

- **DD-1 Robustheit gegen LLM-Output-Drift:** Schema muss strict-validierbar sein
- **DD-2 Provider-Kompatibilitaet:** Anthropic, OpenAI, Gemini -- alle unterstuetzen Tool-Calling. Ollama u.U. nicht.
- **DD-3 Vollstaendigkeit:** Single-Call ersetzt 2-3 separate Calls, Output muss alle Daten tragen
- **DD-4 Engine-Public-API-Stabilitaet:** Schema ist Teil der Engine-Public-API (siehe ADR-084 semver)

## Considered Options

### Option 1: Free-Form-Markdown-Output (heutiges Verhalten, verworfen)

LongTermExtractor parsed Free-Form-Markdown-Output. Heute funktioniert es, aber ist Drift-anfaellig.

- + Pro: Keine Tool-Calling-Constraint
- - Con: Bricht DD-1 (Drift-Risiko bei LLM-Wechsel)
- - Con: Bricht ASR-009

### Option 2: Strikter Tool-Calling-Schema mit allen Feldern als Required (verworfen)

Alle Felder pflichtig, Validation Strict.

- + Pro: Maximale DD-1-Erfuellung
- - Con: LLM kann nicht differenzieren zwischen "kein Update noetig" und "fehlerhafter Output"

### Option 3: Tool-Calling-Schema mit Required + Optional Felder (Empfohlen)

Strict-validierbares Schema, aber Optionalitaet wo sinnvoll.

- + Pro: DD-1 erfuellt, robust
- + Pro: DD-3 erfuellt, traegt alle Daten
- + Pro: LLM kann "leere Conversation -> keine Facts" sauber ausdruecken

## Decision

**Option 3 -- Tool-Calling-Schema mit klar definierten Required und Optional-Feldern.**

Schema-Definition:

```typescript
{
  // Session-Summary (heute SessionExtractor.process)
  session_summary: {
    text: string,                        // 200-400 Worte, deutsche/englische Zusammenfassung
    key_decisions: string[]              // optional, Liste der wichtigsten Entscheidungen
  },

  // Episode-Outcome (heute EpisodicExtractor + B2 wachsende Episode)
  episode: {
    mode: string,                        // 'plan' | 'code' | 'discuss' | ...
    tool_sequence: string[],             // Liste der ausgefuehrten Tools (Reihenfolge)
    success: boolean,
    result_summary: string
  } | null,                              // null wenn keine Tool-Outcomes

  // Fact-Candidates (E1+E2+E3)
  facts: Array<{
    text: string,                        // Atomare Statement-Form
    relation: 'new' | 'update' | 'extend' | 'derive',  // E1: Edge-Konzept-Layer
    related_fact_ids?: number[],         // bei update/extend/derive: zu welchen existierenden Facts
    kind: 'fact' | 'preference' | 'identity' | 'event',  // E2: Memory-Typ
    topics: string[],                    // 1-3 Topics, prefer existing known_topics
    importance: number,                  // 0.0-1.0, vom LLM mit Rationale
    importance_rationale: string,        // Kurz-Begruendung warum diese Importance
    source_message_index?: number,       // optional, fuer Provenance
    confidence: number                   // 0.0-1.0, wie sicher ist der LLM
  }>,                                    // E3: Noise-Filter via leeres Array bei reinem Smalltalk

  // Mentions (Schema-agnostisch, ASR-021)
  mentions: Array<{
    uri: string,                         // 'vault://...', 'file://...', 'https://...', 'entity:...'
    label?: string,                      // optional, menschen-lesbares Label
    kind?: string,                       // optional, frei: 'project', 'person', 'concept'
    in_fact_ids: number[]                // welche Fact-Indizes (im Output) erwaehnen das
  }>,

  // Conversation-Topic-Hint fuer Composer (optional, hilft Topic-Centroid-Inference)
  conversation_topics?: string[],

  // Pre-Insert-Filter-Hint (E3)
  noise_filtered_count?: number          // wie viele Statements wurden als Noise verworfen
}
```

**Validation-Logik in FactIntegrator:**

1. JSON-Schema-Validation strict (alle Required-Felder vorhanden, Types korrekt)
2. Kind-Werte-Whitelist-Check
3. Relation-Werte-Whitelist-Check
4. Importance-Range-Check (0.0-1.0)
5. Pre-Insert-Filter (E3): Facts mit `importance < 0.2` werden nicht persistiert
6. Bei Validation-Fehler: Audit-Log + Notice "Single-Call-Output malformed, Raw-Response in Logs"

**Aging-Konstanten pro `kind` (E2):**

- `identity`: 180-Tage-Halbwertzeit, multiplikativer Decay 0.95 alle 180d
- `preference`: persistent (kein Decay), use-count-Boost +0.05 pro Confirmation
- `fact`: 90-Tage-Halbwertzeit (bisheriger Default), multiplikativer Decay 0.95 alle 90d
- `event`: 14-Tage-Halbwertzeit, multiplikativer Decay 0.95 alle 14d

Wenn `importance < 0.1` post-Aging: deprecate via Soft-Delete.

**Edge-Erzeugung aus `relation`-Feld:**

- `new`: Insert + co_occurrence-Edges zu anderen Facts derselben Conversation
- `update`: alter Fact (related_fact_ids[0]) bekommt `is_latest=0` + `superseded_by={neue_id}`. Edge `supersedes` automatisch
- `extend`: Edge `refines` zwischen neuer und related_fact_ids[0]. Beide bleiben `is_latest=1`
- `derive`: Edge `derived_from_pattern` zu allen related_fact_ids. Confidence-Banding (siehe ADR-086 fuer Inference-Pass)

## Consequences

**Positiv:**

- Robustes Schema mit strict Validation
- Engine-Public-API-Vertrag stabil (semver-relevant)
- Single-Call ersetzt 2-3 Calls wie vorgesehen
- Edge-Erzeugung aus relation-Feld eliminiert FactIntegrator-Heuristik

**Negativ:**

- Schema ist umfangreich (~30 Felder), LLM-Output-Tokens steigen ~50-100 Tokens vs Free-Form
- Validation-Logic ist Code-aufwand
- LLM-Fehlleistungen (z.B. Kind-Wert ausserhalb Whitelist) erzwingen Re-Run oder Fallback

**Risks:**

- **R-1:** Ollama unterstuetzt Tool-Calling nicht zuverlaessig. **Mitigation:** Free-Form-Fallback-Pfad als Optional-Feature, in MVP nur Anthropic/OpenAI/Gemini supported.
- **R-2:** Schema-Drift zwischen Engine-Versionen. **Mitigation:** Schema-Version im Output (`schema_version: 1`), Engine-Public-API-Vertrag (ADR-084).
- **R-3:** Importance-Inflation -- LLM gibt allen Facts hohe Importance. **Mitigation:** Eval-Test-Set kalibriert das, plus Pre-Insert-Filter `< 0.2` als Floor.

## Alternatives Considered

- Free-Form-Markdown verworfen wegen Drift-Risiko
- Streng-Required-Schema verworfen wegen Inflexibilitaet

## Implementation-Bezug

- FEATURE-0318 implementiert Schema + Validation in FactIntegrator
- FEATURE-0324 (Inference-Pass) nutzt dasselbe Schema mit `relation: 'derive'`
- FEATURE-0325 (Vault-Note-Source) nutzt dasselbe Schema mit `source_uri`-Feld
- ADR-077 facts-Schema enthaelt `kind`-Spalte und `is_latest`-Spalte

## Open Questions

- Schema-Versioning-Mechanik bei Engine-Major-Bump (ADR-084 deckt das)
- Ollama-Free-Form-Fallback-Schema -- post-MVP
- Cross-Lingual-Importance-Kalibrierung -- Eval-Test-Set Phase 4
