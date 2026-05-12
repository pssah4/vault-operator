---
id: FEAT-24-01
title: Cache-Praefix-Stabilisierung (Anthropic/Bedrock) + Kostenanzeige
epic: EPIC-24
priority: P0
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-62, ADR-111]
plan-refs: []
depends-on: []
---

# FEAT-24-01: Cache-Praefix-Stabilisierung

## Description

Provider-seitiger Split des System-Prompts am dokumentierten "CACHE BREAKPOINT" (stabiler Block mit `cache_control`/`cachePoint`, volatiler Tail ohne), DateTime tagesgranular, eigener Cache-Marker auf dem `tools`-API-Feld, rollende Cache-Marker in der Message-History; plus `cached_tokens` der openai-Familie in `usage`-Chunk + Kostenrechnung verdrahten (Teil von IMP-18-01-02). Setzt um, was ADR-62-Amendment entscheidet -- die Section-Reihenfolge allein reichte nicht (5-Provider-Messlauf 2026-05-12).

Quelle: RESEARCH-36 Befund A/B/D. Architektur: ADR-62 (Amendment 2026-05-12), ADR-111. Bug-Detail: FIX-24-01-01.

## Success Criteria

`[AWAITING RE]` -- Richtwert: auf dem Anthropic-direkt-Pfad ist `cacheRead` ab Call 2 > 0 statt erneutem `cacheCreate`; `[Cost] cacheR` ist auf allen Providern korrekt; angezeigte Kosten sinken auf den realen Wert (Cache-Reads abgezogen).
