# FIX-32-03-01: ContextComposer Pause-Notice mit dayKey-Cache

**Prioritaet:** P3 (Cache-Drift an Tagesgrenze; UX-relevant in langer Pause-Phase)
**Datei:** ContextComposer + Plumbing zum Pause-Callback in main.ts
**Feature-Bezug:** EPIC-32, FEAT-32-03 (Welle 3 Robustheit)
**Entdeckt:** Hardening-Audit 2026-06-07 (Audit-Finding 16)
**Status:** Deferred (Phase: Candidates)

---

## Problem

Wenn Memory-Writes im Plugin pausiert sind (z.B. via daily budget cap), enthielt der composed Memory-Section keinen Hinweis darauf. Der naechste Turn schrieb still ins Void. Wenn doch ein Hinweis rendered wird, kann er ueber die Tagesgrenze hinweg im cached System-Prompt-Prefix flippen und ADR-062 verletzen.

## Vorgeschlagene Loesung

1. `ContextComposer.constructor` bekommt ein optionales Callback `getMemoryWritesPaused?: () => { reason: string; dayKey: string } | null`.
2. `renderMarkdown` haengt bei pause-Status NACH dem Topical-Block (byte-stabiler Trailer-Anchor) eine einzelne Zeile `_Memory writes paused today: ${reason}._` an.
3. Cold-Start-Hint wird unterdrueckt waehrend pause.
4. Cache per `dayKey`, nur recompute bei Tagesgrenze.

## Akzeptanzkriterien

- Snapshot des System-Prompts ist byte-identisch ueber zwei aufeinanderfolgende Turns am selben `dayKey`, auch bei toggle pause on/off.
- Tagesgrenze loescht den Cache.
- NOOP-Pfad (kein Callback) rendert wie heute.

## Out-of-Scope

- Aenderung am Pause-Trigger-Mechanismus selbst (separates Feature).
- Aenderung an Token-Budget-Berechnung.
