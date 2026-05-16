---
id: FEAT-26-06
title: Prompt-Slim
epic: EPIC-26
priority: P2
date: 2026-05-15
related: BA-27
adr-refs: []
plan-refs: []
depends-on: []
---

# FEAT-26-06: Prompt-Slim

## Description

Der System-Prompt von Vault Operator hat heute ~17.300 Tokens. Aufschlüsselung (gemessen 2026-05-15):
- `cost-heuristics`: 1.435 Tokens
- `plugin-skills`: 5.066 Tokens
- `tools-section`: 3.403 Tokens
- `skill-directory`: 1.176 Tokens
- `mode`: 1.160 Tokens
- `memory`: 1.039 Tokens
- `objective`: 962 Tokens
- `response-format`: 806 Tokens
- weitere kleinere Sections

Mit dem Sonnet-Hauptloop (aus FEAT-26-01) sind die absoluten Kosten der Tool-Schemas und des Prompts vergleichsweise gering (~5 ct pro 8-Turn-Session bei vollem Cache-Hit). Trotzdem lohnt sich eine Slim-Pass aus drei Gründen:
1. Cache-Write-Kosten beim ersten Turn skalieren mit Prompt-Größe
2. Bei einem expliziten Override auf flagship (Opus) im Chat sind die Cache-Write-Kosten relevanter
3. Übersichtlicher Prompt erleichtert Maintenance und Debugging

Konkret werden drei Sections konditional gerendert oder gekürzt:

**1. `cost-heuristics` (1.435 Tokens):**
- Lean-Variante (≤500 Tokens) wird gerendert, wenn die Klasse "auto" aktiv ist
- Voll-Variante bleibt für expliziten Flagship-Override (wo der User sowieso Kosten in Kauf nimmt und der Reminder wichtig ist)

**2. `plugin-skills` (5.066 Tokens):**
- Section wird nur gerendert, wenn das Modell in den letzten 3 Turns mindestens ein Plugin-Skill-Tool gerufen hat ODER der User in der aktuellen Message ein Plugin via `@`-Mention erwähnt hat
- Sonst: kompakter 1-Satz-Hinweis "Plugin skills are available, ask the user if you need them"
- Spar-Potenzial: ~4.500 Tokens bei vielen Sessions

**3. `tool-routing` (Teil von `tools-section`):**
- Auf relevante Routing-Hinweise verschlanken (heute ~3.400 Tokens für die ganze tools-section)
- Detail-Reduktion in `commonMistakes`-Feldern bei seltenen Tools

Geschätztes Gesamt-Einsparpotenzial: 5.000-6.000 Tokens (~35 % System-Prompt-Reduktion). Cache-Write-Kosten beim Auto-Modus mit Sonnet sinken auf <2 ct (statt 3 ct), bei explizitem Opus-Override auf <10 ct (statt 15 ct).

Quelle: BA-27 Sektion 7.1 Welle 6.

## Benefits Hypothesis

Die System-Prompt-Größe ist die zweitgrößte Cost-Determinante nach dem Loop-Modell selbst. Durch konditionales Rendering reduzieren wir Cache-Write-Kosten beim Cold-Start jeder Session sowie beim Override-auf-Opus-Turn. Bei Sebastians täglichem Setup mit ~10 Sessions = ~10 Cache-Misses pro Tag spart das ~30-50 ct/Tag im Opus-Override-Pfad und ~10 ct/Tag im Sonnet-Auto-Pfad.

## User Stories

- **US-06-01 (P1 Sebastian):** Als Power-User möchte ich, dass das Plugin den System-Prompt nur dort vollständig rendert, wo es nötig ist, damit ich nicht für nicht-genutzte Skills oder Cost-Heuristics zahle.
- **US-06-02 (P1 Sebastian):** Als Plugin-Maintainer möchte ich, dass die Token-Aufschlüsselung im Debug-Log nach EPIC-26 sichtbar weniger Tokens zeigt als vorher.

## Success Criteria

1. Wenn ich im Auto-Modus einen Chat führe ohne Plugin-Skills zu nutzen, ist die `plugin-skills`-Section auf einen kompakten 1-Satz-Hinweis reduziert.
2. Wenn ich ein Plugin-Skill-Tool rufe oder ein Plugin per `@`-Mention erwähne, wird die volle `plugin-skills`-Section ab dem nächsten Turn injiziert.
3. Wenn ich im Auto-Modus laufe, sehe ich eine Lean-Variante der `cost-heuristics`-Section (~500 Tokens statt 1.435).
4. Wenn ich auf Flagship-Override umstelle, wird die volle `cost-heuristics`-Section gerendert.
5. Die System-Prompt-Größe im Debug-Log (`[SystemPrompt] N chars (~M tokens)`) ist nach EPIC-26 für Standard-Auto-Sessions um mindestens 30 % kleiner als vor EPIC-26.
6. Cache-Hit-Rate für den stabilen Prefix bleibt ≥95 % bei wiederkehrenden Session-Patterns (kein Cache-Thrashing durch konditionale Sections).

## Technical NFRs

- **Cache-Stabilität:** Konditionale Sections dürfen nicht inmitten des stabilen Prefix-Bereichs liegen. Empfehlung: konditionale Sections nach `CACHE_BREAKPOINT_MARKER` einsortieren, sodass der stabile Block unverändert bleibt.
- **Plugin-Skill-Tracking:** Plugin hält ein Per-Task-State-Feld `recent_plugin_skill_usage`, das geupdated wird wenn ein Plugin-Tool gerufen wird oder `@`-Mention erkannt wird. Wird zur Render-Entscheidung herangezogen.
- **Lean-Variante:** `cost-heuristics`-Lean ist eine separate Konstante in `src/core/prompts/sections/costHeuristics.ts`, nicht zur Laufzeit generiert.
- **Fallback-Robustheit:** wenn die Render-Entscheidung fehlschlägt (z.B. bei Plugin-State-Initialisierungs-Fehler), wird die Voll-Variante gerendert (fail-safe).

## ASRs

- **ASR-MOD-01:** Konditionale Sections müssen die ADR-62-Cache-Strategie respektieren (CACHE_BREAKPOINT_MARKER ist die Grenze).
- **ASR-MOD-02:** Plugin-Skill-Usage-Tracking ist Per-Task isoliert, nicht global.

## Definition of Done

- [ ] Lean-Variante von `cost-heuristics` (≤500 Tokens) als zweite Konstante
- [ ] Konditionales Rendering von `plugin-skills` basierend auf Per-Task-State
- [ ] `recent_plugin_skill_usage`-Tracking in AgentTask (Updates bei Plugin-Tool-Call und @-Mention)
- [ ] `tool-routing`-Section verschlankt (Detail-Reduktion in seltenen `commonMistakes`)
- [ ] Tests: Render-Logik im Auto-Modus, Render-Logik bei Plugin-Skill-Usage, Cache-Stabilität-Test (Hit-Rate vs vor EPIC-26)
- [ ] Live-Messlauf [AWAITING RE]: Debug-Log zeigt ~10k Tokens System-Prompt im Standard-Auto-Modus

## Out-of-Scope

- Komplettes Prompt-Refactoring (nur konditionales Rendering der drei genannten Sections)
- Lean-Variante von `tools-section` (separates EPIC oder IMP, wenn Bedarf)
- Per-User-Anpassung der Lean-Schwellen (alle User nutzen dieselbe Logik)
- Dynamic Section-Reordering (Reihenfolge bleibt wie ADR-62 definiert)
