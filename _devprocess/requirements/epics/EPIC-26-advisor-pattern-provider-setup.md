---
id: EPIC-26
title: Advisor-Pattern + Provider-only Setup + Auto-Discovery
date: 2026-05-15
related: BA-27, RESEARCH-36
predecessor: EPIC-24
absorbed: EPIC-27 (am 2026-05-15 absorbiert)
github-issue: 319
---

# EPIC-26: Advisor-Pattern + Provider-only Setup + Auto-Discovery

## Hypothesis Statement

Vault-Operator-Nutzer betreiben dialogische Strategie-, Recherche- und Note-Writing-Sessions, die heute strukturell auf dem teuersten verfügbaren Modell laufen (Opus 4.6 als Hauptloop). Ein 8-Turn-Strategie-Chat kostet 15 bis 25 EUR, obwohl die meisten Turns reine Text-Generierung sind und kein Reasoning auf Flagship-Niveau brauchen. Der TaskRouter aus v2.10 ist binär (simple, complex) und kennt keine Zwischenstufe. Parallel pflegt der User pro Modell ~20 Felder manuell und muss bei jedem Provider-Release nachpflegen.

EPIC-26 stellt den Hauptloop auf das mid-Tier-Modell um (typisch Sonnet oder Enstsprechung der anderen Provider), das Plugin ruft auf Modell-Initiative ein `consult_flagship`-Tool wenn schwierige Synthese nötig wird. Pair und Tier-Mapping kommen aus einem Auto-Discovery-Service, der die `/v1/models`-Endpunkte der Provider abruft und Modelle per Pattern + Capability in fast/mid/flagship klassifiziert. Das Settings-UI wechselt von Modell-zentriert auf Provider-zentriert, der User wählt nur Provider plus Auth, der Klassifikator füllt die Tier-Slots. Im Chat erscheint ein "Auto"-Default mit den Provider-Modellen als Override-Optionen pro Turn.

Damit reduzieren wir die Kosten pro chat-style Session um 70 bis 75 %, das Setup auf ≤1 Min pro Provider und schliessen den Pflege-Drift bei neuen Modell-Releases. Der ReAct-Loop-Kern bleibt unverändert, EPIC-24-Mechaniken (Cache-Marker, Microcompaction, MCP-Listing-Cap) werden nicht angetastet.

## How might we

Wie können wir den Hauptloop des Plugins auf einem schlankeren Modell betreiben, ohne Qualitätsverlust für Strategie- und Recherche-Text, mit on-demand-Eskalation auf das stärkere Modell wenn der Agent steckt, und gleichzeitig das Setup so vereinfachen, dass User nur Provider plus Auth wählen statt 20 Felder pro Modell pflegen?

## Business Outcomes

- **OUT-01:** Durchschnittliche Kosten pro chat-style Session (Strategie, Recherche, Argumentation) sinken von ~20 EUR auf ≤5 EUR (75 % Reduktion). Gemessen via `[Cost]`-Log-Aggregation, gefiltert auf "Auto"-Modus.
- **OUT-02:** Setup-Time pro neuem Provider sinkt von 5-10 Min auf ≤1 Min. Gemessen Time-from-Add-Provider-Click-to-First-Successful-Send.
- **OUT-03:** Modell-Drift-Latenz sinkt von 1-3 Monaten auf ≤24h (Cache-TTL). Gemessen Vergleich Refresh-Timestamp mit Provider-Release-Datum.
- **OUT-04:** Anteil "Auto"-Modus an allen Chats erreicht ≥70 %. Gemessen Dropdown-Value-Telemetrie.
- **OUT-05:** Advisor-Eskalations-Rate liegt zwischen 5-15 % der Auto-Chats. Telemetrie-Counter pro Session.
- **OUT-06:** Keine spürbare Qualitäts-Regression bei Strategie-/Recherche-Chats. User-Feedback in Beta-Phase.

## Features

### Welle 1: Core Mechanik (P0)

| ID | Title | Wert |
|----|-------|------|
| FEAT-26-01 | Advisor-Pattern Engine (`consult_flagship`-Tool, Eskalations-Mechanik, Per-Task-Limit) | Kern des Kosten-Hebels |
| FEAT-26-02 | Tier-Klassifikator + Discovery-Service (Pattern + Capability, 24h-Cache) | Voraussetzung für Pair-Resolution und UI-Vereinfachung |

### Welle 2: User-Facing (P0)

| ID | Title | Wert |
|----|-------|------|
| FEAT-26-03 | Provider-only Settings UI | Setup-Vereinfachung auf Provider-Auth statt 20 Felder pro Modell |
| FEAT-26-04 | Migration und Backwards-Compat | Auto-Migrate bestehender `activeModels[]` mit Notification-Modal |
| FEAT-26-05 | Chat-Model-Dropdown-Refactor (Auto + Provider-Modelle als Override pro Turn) plus Mode-Switcher-Removal aus Chat-Header | User-Kontrolle bei intelligentem Default, plus Entfernung des nie genutzten Mode-UIs |

### Welle 3: Nice-to-have (P2)

| ID | Title | Wert |
|----|-------|------|
| FEAT-26-06 | Prompt-Slim (`cost-heuristics`, `plugin-skills`, `tool-routing` konditional rendern) | Zusätzliche Token-Einsparung, unabhängig vom Routing |

## Critical Hypotheses (Leading Indicators)

Übernommen aus BA-27 Sektion 11. Diese Hypothesen werden in der Coding- und Beta-Phase live geprüft:

- **H-01:** Sonnet 4.6 liefert für Strategie-/Argumentations-Chats subjektiv vergleichbare Qualität wie Opus 4.6. Validation: Beta-Phase (kein Vorab-Test). Rollback-Plan: Default-Tier-Setting flipbar von mid auf flagship.
- **H-02:** Pattern-basierter Tier-Klassifikator deckt >90 % der aktuell verfügbaren Provider-Modelle ab. Validation: Klassifikations-Test gegen `fetchProviderModels()`-Output.
- **H-03:** `consult_flagship`-Tool wird modell-getrieben gerufen mit Eskalations-Rate 5-15 %. Validation: Telemetrie-Counter über 2 Wochen Live-Use.
- **H-04:** Setup pro neuem Provider auf ≤1 Min senkbar. Validation: Stoppuhr-Test mit Sebastian.
- **H-05:** Auto-Migration alter `activeModels[]`-Configs läuft für >95 % der User-Setups fehlerfrei. Validation: Test gegen Sebastians eigenes Multi-Provider-Setup und 2-3 Standard-Varianten.
- **H-06:** User akzeptiert Single-Active-Provider als Standard-Modus, Override-Dropdown reicht für situative Modell-Wahl. Validation: User-Feedback in Beta.

## Idea Potential (aus BA-27)

- **Value/Urgency:** 9/10 (Kosten-Hebel direkt sichtbar, Pflege-Schmerz akut)
- **Transferability:** 8/10 (alle Multi-Provider-User profitieren, lokale Modelle bleiben funktional)
- **Feasibility:** 7/10 (Architektur-Refactor, aber `fetchProviderModels()` existiert bereits)

## Out-of-Scope

- 3-Klassen-TaskRouter mit Loop-Side-Effekten
- Lean-Tool-Mode (irrelevant bei Sonnet-Hauptloop)
- Tool-Konsolidierung (Read-Pair, Discovery-Tools, Search-Trio)
- Multi-Provider parallel aktiv (Cross-Provider-Tier-Mapping)
- Auto-Pricing-Lookup über OpenRouter als Fallback für unbekannte Modelle
- Hard-Cost-Budget mit User-Pause (FEAT-24-08 bleibt separat planned)
- Streamable-HTTP-MCP (nach EPIC-14 verschoben)
- **Komplettes Entfernen des Mode-Backend-Systems** (ModeService, currentMode-Setting, modeModelKeys, switch_mode-Tool, Plugin-Skill-Mode-Filter). FEAT-26-05 entfernt nur den UI-Switcher aus dem Chat-Header. Backend-Cleanup als separate Tech-Debt-Initiative, wenn überhaupt nötig.

## Constraints

- ReAct-Loop-Kern bleibt unverändert
- EPIC-24-Mechaniken (Cache-Marker, Microcompaction, Externalizer, MCP-Listing-Cap) bleiben unverändert
- Backwards-Compat: Plugin-Update darf bestehende `activeModels[]`-Configs nicht zerstören
- Multi-Provider-Support für Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot, ChatGPT-OAuth, Azure, Ollama, LMStudio, Custom muss erhalten bleiben
- 24h-Cache für Provider-Discovery (kein Background-Refresh)

## Quellen

- BA-27 (`_devprocess/analysis/BA-27-advisor-pattern-provider-setup.md`)
- BA-12 (Vorgänger-BA zur Token-Kostenreduktion)
- RESEARCH-36 (Agent-Loop Cost-Refactoring)
- EnBW Cowork (Architektur-Analyse 2026-05-15)
- ADR-115 (Helper Model Routing, 2026-05-13)
- GitHub Issue #319 (10 QA-Decisions)
