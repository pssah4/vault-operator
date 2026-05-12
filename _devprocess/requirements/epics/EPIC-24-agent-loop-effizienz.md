---
id: EPIC-24
title: Agent-Loop Effizienz
date: 2026-05-12
related: RESEARCH-36, BA-12
predecessor: EPIC-18
---

# EPIC-24: Agent-Loop Effizienz

## Hypothesis Statement

FUER Obsilo-Nutzer die taeglich dialogische Notiz- und Recherche-Arbeit an den
AI-Agenten delegieren
DIE unter weiter ueberlinear wachsenden Input-Token-Kosten und Provider-
Inkompatibilitaet (168k-Limit) leiden, weil EPIC-18 nur den Fast-Path-Fall
abdeckt
IST DIE Agent-Loop-Effizienz
EIN Loop-/Harness-Refactoring (kein Neubau, kein SDK-Umstieg)
DAS den Input-Token-Verbrauch dialogischer Multi-Turn-Sessions strukturell
deckelt -- durch History-Komprimierung an Turn-Grenzen, Tool-Output-Disziplin,
korrektes Prompt-Caching und delegierte Subagent-Teilaufgaben
IM GEGENSATZ ZU dem aktuellen Ansatz (Tool-Results akkumulieren ungekuerzt in
der History; `cache_control` sitzt auf dem Anthropic-Pfad an der falschen Stelle;
Recherche laeuft im Hauptkontext)
UNSERE LOESUNG uebernimmt die *Disziplinen* aus Claude Code und EnBW Cowork
(stabiler gecachter Praefix, Threshold-Compaction mit Recent-Keep, gebudgetete
Subagent-Handoffs, eingebaute Cache-/Token-Telemetrie), ohne den bewaehrten
ReAct-Loop-Kern anzutasten.

## How might we

Wie kann eine lange dialogische Session (Recherche + Editieren ueber 10+ Turns)
unter dem 168k-Token-Limit bleiben und nur einen Bruchteil der heutigen Kosten
verursachen, ohne dass die Ergebnisqualitaet leidet und ohne dass der Nutzer
manuell Kontext-Hygiene betreiben muss?

## Business Outcomes (messbar)

- **OUT-01**: Ein 4-Datei-Read-Turn endet bei ~48k Input-Tokens, der unmittelbar
  folgende Turn startet unter ~20k (statt mit den ~48k im Volltext-Schlepptau).
- **OUT-02**: Ein 10-Turn-Chat (Mix aus Recherche + Edit) bleibt im History-Anteil
  deutlich unter linearem Wachstum -- gemessen via `[InputBreakdown]`.
- **OUT-03**: Auf dem Anthropic-direkt-Pfad ist `cacheRead` ab dem 2. API-Call
  > 0 (statt erneutem `cacheCreate`); die Sidebar-Kostenanzeige zeigt auf allen
  Providern den realen Wert (Cache-Reads abgezogen).
- **OUT-04**: Eine einfache Frage, die der Agent durch eine Recherche-Teilaufgabe
  beantwortet, laesst den Hauptkontext nur um die verdichtete Antwort wachsen,
  nicht um die N Such-/Lese-Zwischenstaende.

## Features (priorisiert)

### P0 (Welle 1 -- "History-Wachstum stoppen + Caching/Anzeige geradeziehen")

| ID | Title | Wert |
|----|-------|------|
| FEAT-24-01 | Caching-Architektur-Fix (Anthropic/Bedrock) + Kostenanzeige | Stabiler gecachter Praefix; Anzeige stimmt |
| FEAT-24-02 | History-Komprimierung: Microcompaction der Tool-Results an Turn-Grenzen | Stoppt den dominanten Wachstumstreiber |
| FEAT-24-03 | Tool-Output- & Kontext-Disziplin: Externalizer im Hauptloop, Re-Read-Cap, grosse User-Messages kappen | Deckelt Spitzen (Web/Paste/Multi-Read) |

### P1 (Welle 2 -- "Loop strukturell verschlanken")

| ID | Title | Wert | ADR |
|----|-------|------|-----|
| FEAT-24-04 | Subagent-Delegation fuer context-heavy Teilaufgaben (mit Per-Call-Token-Budget) | Recherche/Exploration bleibt aus dem Hauptkontext | ADR-113 |
| FEAT-24-05 | Sichtbarkeit: Sidebar-Kosten-/Token-/Cache-Hit-Anzeige | Verhaltenseffekt + Diagnose | (UI, kein ADR) |
| FEAT-24-09 | Active Skills: model-getriebenes On-demand-Laden statt Klassifikator-Inject | spart den Klassifikator-Roundtrip, macht den System-Prompt cache-stabil | ADR-116 |
| FEAT-24-06 | Lazy-Loading der Tool-Schemas: Built-in (FEATURE-1600 erweitern) + **MCP-Tools deferred** (per-Server-Katalog im stabilen Prompt statt voller Schemas, Schema on-demand via find_tool) | der MCP-Anteil ist der eigentliche Hebel -- volle MCP-Tool-Schemas heute bei jedem Call, kein Deferral; mit verbundenen Servern potenziell der groesste, am wenigsten cachebare `tools`-Feld-Posten | ADR-117 |

### P2 (Welle 3 -- "Governance + Routing")

| ID | Title | ADR / Hinweis |
|----|-------|---------------|
| FEAT-24-07 | Internes Hilfs-Modell-Routing fuer Agent-interne LLM-Calls (Condensing, Fast-Path-Planner/Presenter, plan_presentation, Recipe-Planner, ggf. Skill-Klassifikator) | ADR-115 |
| FEAT-24-08 | Autonomie-Governance: Token-/Kosten-Budget pro Task mit Pause+Rueckfrage, Steering-Hook zwischen Iterationen, Exploration-Limit | ADR-114 (das Subtask-Per-Call-Budget bleibt in ADR-113) |

## Out-of-Scope (Epic)

- Neuer Agent-Loop / Umstieg auf ein Coding-Agent-SDK (Claude Agent SDK,
  `pi-coding-agent`) -- bewusst verworfen, s. RESEARCH-36 §7.
- User-konfigurierbares Hook-System a la Claude Code (Aufwand >> Nutzen fuer ein
  Obsidian-Plugin).
- Multi-Agent-`coordinator`/`Team`-Subsystem (Overkill).
- Retrieval-Tuning (semantisches Chunking / Top-k / Reranker) -- beruehrt
  SemanticIndexService/KnowledgeDB, gehoert zur Knowledge-Layer-/Memory-v2-
  Roadmap, nicht hierher (s. RESEARCH-36 §9 Frage 9).
- Caveman-/Output-Knappheits-Modus -- Output ist nicht das Problem (RESEARCH-36
  Befund G).
- Expliziter Plan-Modus (read-only Exploration -> reviewter Plan -> Kontext-Reset
  -> Implementierung, a la Claude Code) -- bewusst verworfen (Entscheidung Sebastian
  2026-05-12): Obsilos typischer Workload (Q&A, Notiz-Edit, leichte Recherche)
  triggert einen Plan-Modus selten; der Hebel waere fuer Coding-Agenten gross, fuer
  Obsilo klein. Falls sich das mit der Nutzung aendert: Wiedervorlage.

## Critical Hypotheses (Leading Indicators)

- H1: Microcompaction der Tool-Results an Turn-Grenzen kostet keine relevante
  Ergebnisqualitaet (Shadow-Mode / A-B noetig, s. §9 Frage 4).
- H2: Der gecachte stabile System-Praefix bleibt turn- und sessionuebergreifend
  konstant, wenn DateTime/Memory/Active-Skills/Recipe/Vault-Context aus dem
  gecachten Bereich raus sind (Beleg: EnBW Cowork macht es genauso, RESEARCH-36 §3).
- H3: Model-getriebene Subagent-Delegation (prominentes `new_task` + Profile +
  Prompt-Leitplanke) reicht ohne harten Router (Beleg: Claude Code, RESEARCH-36 §8 E).

## Definition of Done (Epic)

- Alle P0-Features (FEAT-24-01..03) auf Done und released.
- OUT-01 bis OUT-03 messbar erfuellt (via `[InputBreakdown]`/`[CacheStat]`/`[Cost]`).
- ADRs vorhanden und referenziert: ADR-62-Amendment (Cache-Praefix-Stabilisierung),
  ADR-12-Amendment (Microcompaction + Rolling-Summary), ADR-63-Amendment
  (Externalization-im-Hauptloop + Re-Read-Cap + Per-Tool-Caps), ADR-113
  (Subagent-Delegation+Budget), ADR-114 (Autonomie-Governance), ADR-115
  (Hilfs-Modell-Routing), ADR-116 (Active-Skills on-demand), ADR-117 (Lazy-Loading
  Tool-Schemas, Built-in + MCP). Plus IMP-18-01-02 (Bedrock cachePoint + OpenAI
  cached_tokens-Wiring, vorbestehend, Status Active).
- Diagnose-Logging (`src/api/logCacheStat.ts`) committed bzw. in den Welle-1-Code
  ueberfuehrt.
- `/testing` + `/security-audit` nach jedem `/coding`-Durchlauf durchlaufen.
- Wiedervorlage FEAT-24-06 (Lazy-Loading) als Backlog-Row mit Spike-Trigger.
