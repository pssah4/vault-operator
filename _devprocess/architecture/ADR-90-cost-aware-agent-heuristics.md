# ADR-90: Cost-Aware Agent Heuristics

**Date:** 2026-04-29
**Deciders:** Sebastian Hanke
**Feature:** EPIC-18 (Token-Kostenreduktion), Welle 2

## Context

Eine simple Aufgabe wie "Meeting-Summary fuer eine 20k-Note" hat in der Praxis
675k Input-Tokens und 25 Minuten gekostet, statt der theoretisch erwarteten
6k Tokens und 30-60 Sekunden. Faktor 100 in Kosten und Zeit.

Die Symptome wurden bereits einzeln behoben (Externalization, Provider-Parse-Errors,
Edit-File-Fehlermeldungen). Die Ursache liegt aber tiefer: **Der Agent hat keine
Anreize, den einfachsten Weg zuerst zu versuchen.** Er behandelt jede Aufgabe wie
eine offene Recherche, anstatt Trivialitaet zu erkennen und entsprechend zu handeln.

Konkrete strukturelle Maengel:

1. **Keine Selbsteinschaetzung der Komplexitaet** vor der Tool-Wahl
2. **System-Prompt belohnt Gruendlichkeit** statt Sparsamkeit (16k Tokens, 55 Tools)
3. **Tools wirken kostenneutral** (semantic_search mit Reranker neben read_file)
4. **Keine Stop-Condition** ("habe ich genug Information?")
5. **Fehler-Eskalation** statt Fehler-Vereinfachung
6. **Sub-Agent-Spawning unbeschraenkt** (jeder Sub-Agent verdoppelt System-Prompt)
7. **Kein Budget-Bewusstsein** (Tokens und Kosten unsichtbar fuer den Agent)
8. **Plan-Mode wurde abgeschafft**, ohne Ersatz: Agent macht keinen sichtbaren Plan mehr

## Decision

**Cost-Aware Agent Heuristics** als 10-Hebel-Programm. Keine pro-Task-Skill-Templates,
keine hardcoded Fast-Paths. Alle Hebel wirken via Prompt-Engineering, Loop-Logik
und sichtbare Telemetrie -- der Agent **lernt** Sparsamkeit, statt dass wir sie
ihm pro Aufgabe vorschreiben.

### Die 10 Hebel

| # | Hebel | Wo | Wirkungsweise |
|---|-------|----|----|
| 1 | Plan-First | systemPrompt + UI | Vor erstem Tool-Use schreibt Agent expliziten Plan im Chat |
| 2 | Tool-Tiers | systemPrompt | Tools nach Kosten gruppiert: T1 (read/write) vor T2 (search) vor T3 (sub-agent) |
| 3 | Anti-Overthinking | systemPrompt | Triviale Aufgaben (lies X, schreib Y) gehen direkt, ohne Recherche |
| 4 | Sub-Agent-Gating | systemPrompt + Tool-Schema | Spawn nur fuer (a) echte Parallelitaet, (b) Spezialisten-Sub-Aufgabe, (c) Notbremse |
| 5 | Budget sichtbar | UI Footer | Live-Anzeige: Tokens + EUR-Kosten |
| 6 | Error-Recovery-Reframe | systemPrompt | Bei Fehler: einfacheres Tool waehlen, nicht eskalieren |
| 7 | Eskalations-Begruendung | systemPrompt | Vor T3-Tools: explizite Begruendung verlangt |
| 8 | Prompt-Schrumpfung | systemPrompt-Sections | Tools/Skills/Memory von 16k auf <=4k Tokens |
| 9 | Stop-Condition | systemPrompt | "Habe ich genug?" als Pflicht-Reflektion vor weiterer Eskalation |
| 10 | Telemetrie | TaskTelemetry-Service | Pro Task: Tokens/Cost/Tool-Sequenz/Outcome persistent loggen |

### Hebel 4 -- Sub-Agent-Gating per Aufgabentyp

Iterations-basiertes Gating ist falsch (verbietet legitime Parallelisierung).
Stattdessen muss der Agent vor jedem `new_task` einen der folgenden Faelle
explizit benennen:

```
Begruendung muss EINER dieser Kategorien zugeordnet sein:
  - PARALLEL: 3+ unabhaengige Recherchen, die gleichzeitig laufen koennen
  - SPECIALIST: Sub-Aufgabe braucht anderen Mode/Toolset (z.B. ask -> agent fuer Schreibvorgang)
  - ESCALATION: Hauptloop ist seit 3+ Iterationen festgefahren
NICHT erlaubt: "ich bin verwirrt und brauche frische Augen"
```

### Hebel 5 + 10 -- EUR-Kosten

Modell-Pricing-Registry pro Modell + statischer USD->EUR Kurs (0.93). Anzeige
in der Sidebar im Format `1.250 in · 380 out · 4.2¢` (Cent statt EUR fuer
typische Cent-Beträge). Telemetrie persistiert pro Task in
`taskTelemetry.json` fuer Vorher/Nachher-Vergleiche.

### Hebel 8 -- Prompt-Schrumpfung

Statt 55 Tools voll dokumentiert: Kompakte 1-Zeiler-Liste. Volldoku via
`find_tool` on-demand (existiert bereits). Skills: Liste statt Volltext.
Memory: Top-3-Hits statt alles. Vault-Context: nur wenn relevant.

Ziel: <= 4k Tokens System-Prompt (vorher 16k). Vorher/Nachher gemessen via
Hebel 10.

## Considered Options

### Option A: Skill-Templates pro Aufgabentyp (Single-Shot-Skills)

Fuer haeufige Aufgaben (Meeting-Summary etc.) deterministische Skill-Direct-
Execution ohne ReAct-Loop. Kein System-Prompt, kein Tool-Schema, ein einziger
LLM-Call.

- Pro: 100x Kostenersparnis sofort, deterministisch
- Pro: Vorhersagbar, einfach zu testen
- Con: **Symptom-Behandlung** -- Agent wird nicht generell sparsamer
- Con: Skill-Template pro Use-Case pflegen
- Con: Aufgaben ausserhalb des Templates bleiben teuer

### Option B: Cost-Aware Heuristics im Agent-Loop (DIESE)

Agent **lernt** den einfachen Weg zuerst zu waehlen. Universelles Pattern,
funktioniert fuer jede Aufgabe.

- Pro: Keine pro-Aufgabe-Pflege
- Pro: Agent wird auch bei neuen Aufgaben effizient
- Pro: Telemetrie als Mess-Grundlage fuer kontinuierliche Verbesserung
- Con: Hoeheres initiales Aufwand-Risiko (Prompt-Engineering)
- Con: Wirkt langsamer als hardcoded Fast-Path

### Option C: Dual-Track (Skills + Heuristics)

Beides parallel. Heuristics fuer den allgemeinen Fall, Skills wo benoetigt.

- Pro: Best of both
- Con: Mehr Code-Pfade, mehr zu pflegen
- Con: Risiko von Inkonsistenzen

## Decision Drivers

- **Kein Pattern-Pflege**: Sebastian will nicht pro Use-Case ein Skill bauen
- **Generelle Kostenkontrolle**: Auch ad-hoc Aufgaben sollen guenstig sein
- **Mess-Grundlage**: Wir wollen wissen, ob unsere Heuristiken wirken
- **Sichtbarkeit**: Plan im Chat + Kosten im Footer = User sieht was passiert

## Decision Outcome

**Option B**. Skill-Templates werden NICHT eingefuehrt. Der Agent muss
selbst lernen, den einfachsten Weg zu waehlen.

## Implementation Sketch

### Geaenderte Dateien

| Datei | Aenderung | Hebel |
|-------|-----------|-------|
| `src/core/pricing/ModelPricing.ts` (neu) | Pricing-Registry, USD/EUR-Berechnung | 5, 10 |
| `src/core/telemetry/TaskTelemetry.ts` (neu) | Pro-Task-Logger fuer Tokens/Cost/Tools | 10 |
| `src/core/prompts/sections/planFirst.ts` (neu) | Plan-First Section | 1 |
| `src/core/prompts/sections/toolTiers.ts` (neu) | Tool-Tiers Section | 2 |
| `src/core/prompts/sections/antiOverthinking.ts` (neu) | Anti-Overthinking | 3 |
| `src/core/prompts/sections/escalationPolicy.ts` (neu) | Sub-Agent + Eskalations-Regeln | 4, 7 |
| `src/core/prompts/sections/errorRecovery.ts` (neu) | Error-Recovery-Reframe | 6 |
| `src/core/prompts/sections/stopCondition.ts` (neu) | Stop-Condition | 9 |
| `src/core/prompts/sections/tools.ts` | Kompakter Tool-Output | 8 |
| `src/core/prompts/sections/memory.ts` | Top-3 statt Vollausgabe | 8 |
| `src/core/prompts/systemPrompt.ts` | Sektionen einbinden | alle |
| `src/ui/AgentSidebarView.ts` | EUR-Anzeige im Footer | 5 |
| `src/core/AgentTask.ts` | Telemetrie-Hook integrieren | 10 |

### Nicht geaendert
- AgentTask Loop-Architektur (bleibt ReAct)
- Tool-Implementierungen
- ModeService, Mode-Definitionen
- Externalization (ADR-63)

## Consequences

### Positive
- Meeting-Summary unter 30k Tokens (von 675k) und unter 60 Sekunden (von 25min)
- Agent wird auch bei neuen Aufgaben effizient (kein Pattern-Catalog)
- Telemetrie erlaubt Mess-getriebene Verbesserung
- User sieht Plan und Kosten live im Chat
- KV-Cache-stabil (Sektionen bleiben statisch zwischen Iterationen)

### Negative
- Prompt-Refactor riskiert Regressionen bei komplexen Aufgaben
- Hebel 8 (Schrumpfung) entfernt Tool-Doku, die der Agent erst on-demand laden muss
- Telemetrie-Persistenz ist neuer State

### Risks
- **Tool-Tier-Hierarchie zu strikt**: Manche Aufgaben brauchen frueh semantic_search.
  Mitigation: Tier-Regel ist Heuristik, nicht Hard-Gate.
- **Plan-Pflicht fuehrt zu unnoetigen Plans bei Trivialitaet**: Mitigation:
  Anti-Overthinking-Section sagt "trivialer Pfad = direkt handeln, kein Plan noetig".
- **Sub-Agent-Gating verhindert legitime Spezialisten**: Mitigation: SPECIALIST-
  Kategorie als gleichberechtigte Begruendung.

## Validation

Drei Test-Cases vor und nach jeder Welle:
1. **Trivial:** Meeting-Summary 20k-Note → erwarten: ≤3 Tool-Calls, ≤30k Input, ≤60s, ≤5¢
2. **Medium:** "Welche Notes erwaehnen Asset Radar?" → ≤2 Calls, ≤20k Input, ≤30s, ≤3¢
3. **Komplex:** "Erstelle Praesentation aus 5 Meeting-Notes" → mehrstufig, ≤200k, ≤5min, ≤30¢

Telemetrie-Logs zeigen die Werte vor/nach Implementierung.

## Related Decisions

- ADR-61: Fast Path (orthogonal -- bleibt fuer haeufige Recipe-Patterns)
- ADR-62: KV-Cache-Optimized Prompt (Hebel 8 baut darauf auf)
- ADR-63: Context Externalization (revidiert 2026-04-29, ergaenzt durch Hebel 8)

## References

- EPIC-18: Token-Kostenreduktion
- BUG-031: Meeting-Summary 25min/675k Tokens (2026-04-29)
- Manus Context Engineering: Selektive Aufnahme, sparsame Defaults
