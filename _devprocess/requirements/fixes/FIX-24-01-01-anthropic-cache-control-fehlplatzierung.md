---
id: FIX-24-01-01
feature: FEAT-24-01
epic: EPIC-24
adr-refs: [ADR-62]
plan-refs: []
depends-on: []
created: 2026-05-12
---

# FIX-24-01-01: anthropic.ts cache_control sitzt auf dem ganzen System-Prompt-String

## Symptom

`anthropic.ts` setzt genau einen `cache_control: ephemeral`-Marker auf den kompletten System-Prompt-String, der den volatilen Tail (DateTime, Memory-Block, Active Skills, Recipes, Vault Context) enthaelt. Da der Cache-Key der ganze Block ist und der DateTime-Abschnitt pro Call wechselt, gibt es bei jeder Iteration einen Cache-Miss + Re-Write; Anthropic schlaegt +25 % auf Cache-Writes auf -> Caching ist auf diesem Pfad in der Summe teurer als ohne. Belegt: 5-Provider-Messlauf 2026-05-12 (`[CacheStat:anthropic]` Call 2: `cacheRead=0, cacheCreate=21479`). Implementierungs-Bug von ADR-62 -- "DateTime an Position letzte" allein reicht nicht, weil es nur einen Marker gibt.

## Fix

Siehe ADR-62-Amendment / FEAT-24-01: System-Prompt provider-seitig am dokumentierten "CACHE BREAKPOINT" splitten, nur der stabile Block bekommt `cache_control`; DateTime tagesgranular; eigener Marker auf dem `tools`-Feld; rollende History-Marker. Diagnose: `src/api/logCacheStat.ts`.
