---
id: EPIC-32
title: Stigmergy-VO Vertrag und Episodes/Recipes/Memory Haertung
date: 2026-06-07
related: ADR-018, ADR-058, ADR-061, ADR-062
predecessor: EPIC-24
---

# EPIC-32: Stigmergy-VO Vertrag und Episodes/Recipes/Memory Haertung

## Hypothesis Statement

Vault Operator integriert seit Mai 2026 den externen Stigmergy-Daemon ueber den `StigmergyAdapter`. Der Adapter beobachtet pro Turn welche Capabilities betrachtet und genutzt werden und liefert per `pathGuidance` einen optionalen Tail-Hint plus eine Pre-Activation deferred Tools. Die VO-eigenen Selektoren (Recipes inkl. FastPath, ADR-058 Promotion via Episodes, Memory v2 Composer, `find_tool` Progressive Disclosure) laufen parallel und greifen auf dieselben Tool-Sequenzen zu.

Die Integration ist heute funktional, hat aber drei strukturelle Luecken: (a) wenn ein Recipe matched und Stigmergy gleichzeitig eine pinned sequence hat, feuern beide unabhaengig (Doppel-Hint, Konkurrenz um Tool-Auswahl, Token-Waste), (b) die Stigmergy-Decision (mode, pinnedPath) ist im AgentTask zwar in Scope, wird aber nirgends in das Episode-Recording durchgereicht, sodass die `RecipePromotionService` eine Stigmergy-gefuehrte Sequenz nicht von einer organischen unterscheiden kann (Contract-3-Beweiskette fehlt), (c) FastPath-Runs erzeugen hohle Episoden (`toolSequence.length < 2`) weil `ToolRepetitionDetector.record()` nur im Hauptloop laeuft, nicht im FastPath-Batch -- diese Runs verschwinden still aus den Promotion-Statistiken.

EPIC-32 schliesst die drei Luecken in einer einzigen kohaerenten Welle und etabliert den expliziten Vertrag: Stigmergy bleibt eine Beratungsschicht ohne Konkurrenz zu VO-Selektoren, VO-Methoden haben harte Praezedenz, und erfolgreiche Stigmergy-gefuehrte Sequenzen werden direkt als Recipe-Kandidaten promoted (statt auf drei organische Wiederholungen zu warten). NOOP_TURN bleibt der Sicherheitsmechanismus fuer Daemon-Down und Studio-Off.

Quelle: Stigmergy-Integration in `src/core/stigmergy/StigmergyAdapter.ts` (Commits c9451e87 + 6621fbc4 vom 2026-06-03), Hardening-Audit-Workflow vom 2026-06-07 (56 Findings, 29 ueberlebt adversarial Verify).

## How might we

Wie koennen wir die Stigmergy-Integration als reine Beratungsschicht so absichern, dass VO-eigene Selektoren (Recipes, FastPath, Memory Composer) stets Vorrang behalten, dass erfolgreiche Stigmergy-Pinned-Sequenzen ohne Datenverlust in den Recipe-Promotion-Pfad einfliessen, und dass jede neue Code-Bahn auch bei abwesendem Daemon (NOOP_TURN) korrekt funktioniert?

## Business Outcomes

- **OUT-01:** Kein Doppel-Hint pro Turn mehr. Wenn Recipe matched und Stigmergy eine pinned sequence hat, wird `guidance.text` unterdrueckt; `guidance.path` bleibt fuer Pre-Activation aktiv. Telemetrie zeigt 0 % Doppel-Hint-Turns nach Phase 1.
- **OUT-02:** Stigmergy-Pinned-Sequenzen werden nach einem einzigen erfolgreichen Run als Recipe-Kandidaten persistiert (provenance `stigmergy-shortcut`, successCount 1). Vorher: Wartezeit auf 3 organische Wiederholungen (ADR-058). Messbar via `learned-stigmergy-`-Praefix im RecipeStore.
- **OUT-03:** FastPath-Runs erzeugen vollstaendige Episoden mit chronologischer `toolSequence` (search -> read -> write -> attempt_completion). Messbar: keine Episoden mit Laenge < 2 mehr fuer FastPath-Turns.
- **OUT-04:** NOOP_TURN bleibt unveraendert. Daemon-Down-Pfade fuer alle drei Subsysteme bleiben no-op. Verifiziert via Test-Suite.
- **OUT-05:** Memory v2 Robustheits-Findings (Pause-Notice-Cache-Drift, Topic-Slug-Drift, Extraction-Queue-Reload-Race, fehlender Skill-Discovery-Timeout) sind behoben. Reload mid-Extraction wirft keine console-Errors.

## Feature Scope

### Welle 1: Praezedenz (P0)

| ID | Title | Wert |
|----|-------|------|
| FEAT-32-01 | Stigmergy<->VO Precedence Resolver (decisionMode Surface + recipeMatches Plumbing + Pipeline source-Tag) | Schliesst Contract 1+2; eigenstaendig deploybar |

### Welle 2: Promotion-Pfad (P0)

| ID | Title | Wert |
|----|-------|------|
| FEAT-32-02 | Stigmergy-Pinned-Sequence Direct Promotion (Episode-Schema-Erweiterung + checkForPromotion Gates + Sidebar-Wiring) | Schliesst Contract 3+5; baut auf Welle 1 auf |

### Welle 3: Robustness-Sweep (P1)

| ID | Title | Wert |
|----|-------|------|
| FEAT-32-03 | Memory v2 Robustheit + Skill-Discovery Timeout + Cache-Anchor-Doc | Schliesst Contract 4 fuer Memory; parallel zu Welle 2 lauffaehig |

## Critical Hypotheses (Leading Indicators)

- **H-01:** Praezedenz-Regel im Resolver verhindert Doppel-Hint ohne FastPath-Performance-Regression. Validation: Unit-Tests + Smoke gegen einen bekannten Recipe-Match.
- **H-02:** Stigmergy-Pinned-Sequenzen treten in der Praxis haeufig genug auf, dass `promoteFromStigmergyPath` einen messbaren Recipe-Volumen-Anstieg liefert. Validation: Telemetrie ueber 4 Wochen Live-Use; Schwelle >=10 `learned-stigmergy-`-Recipes nach 4 Wochen.
- **H-03:** FastPath-`recordForEpisodeOnly` produziert chronologisch korrekte Sequenzen ohne Race-Conditions gegen den Hauptloop-Detector. Validation: Unit-Test mit kuenstlich verschachtelter FastPath+Loop-Sequenz.
- **H-04:** `ALTER TABLE episodes ADD COLUMN stigmergy_json TEXT` laeuft idempotent gegen bestehende v9-DBs ohne WriterLock-Konflikt. Validation: Migration-Test gegen Snapshot der Sebastian-DB.
- **H-05:** Memory-Pause-Notice landet im stabilen Trailer-Block und flippt den Cache-Prefix nicht bei Tagesgrenze. Validation: Snapshot-Test des System-Prompts ueber zwei Tage.

## Idea Potential

- **Value/Urgency:** 7/10 (Vertrag noetig bevor Stigmergy in Production laeuft, sonst riskante Konkurrenz mit VO-Selektoren).
- **Transferability:** 8/10 (alle User mit aktivem Stigmergy-Studio profitieren; Daemon-Down-User bleiben unberuehrt).
- **Feasibility:** 8/10 (Aenderungen sind lokal, Schema-Migration ist additiv, Cache-Prefix bleibt unangetastet).

## Out-of-Scope

- Redesign von Memory v2 (Phase 7 Engine-Extract bleibt verschoben gemaess `project_memory_v2_status`).
- Neue Stigmergy-Modes; das Set `sequence/enforce/ranked/none` bleibt fix.
- Aenderung an `StigmergyAdapter` NOOP_TURN-Semantik oder am Capability-Hash-Gate.
- Refaktorierung des EPIC-26 Advisor-Patterns oder Provider-Routing (TaskRouter, Helper-API).
- Aenderung an PPTX/Office-Pipelines oder Sandbox.
- Aenderung am ThinkingBlock-Passback (FIX-04-03-07).
- Aenderung an EPIC-24 Praefix-Split/cachePoint; alle Aenderungen sind cache-key-stabil per Konstruktion.
- Neue User-Settings im UI; Promotion-Shortcut wird ausschliesslich ueber bestehendes `mastery.learnedEnabled`-Toggle gated.
- Migration der bestehenden 500 Episoden auf das neue Schema (additiv, `stigmergy` NULL fuer alte Rows).
- Aenderung am `syncSession.ts`/MCP-Promotion-Pfad (laeuft weiter ueber ADR-058-Fallback).
- Aenderung am Recipe-Match-Score-Algorithmus oder am 0.5/3-Threshold.

## Constraints

- ReAct-Loop-Kern bleibt unveraendert.
- EPIC-24-Mechaniken (Cache-Marker, Microcompaction, Externalizer, MCP-Listing-Cap) bleiben unveraendert.
- Cache-Prefix-Stabilitaet: `recipesSection` bleibt im System-Prompt-Prefix (cached), `guidance.text` bleibt am User-Message-Tail (uncached). Beide Schichten werden nicht vermischt.
- NOOP_TURN bleibt der Sicherheitsmechanismus fuer Daemon-Down. Jede neue Code-Bahn muss daemon-down-safe sein.
- Schema-Migration auf `episodes`-Tabelle muss WriterLock VOR `ALTER TABLE` acquiren (FIX-12-Lehre).
- ThinkingBlock-Passback (FIX-04-03-07) bleibt unangetastet.

## Quellen

- Stigmergy-Integration Code-Stand 2026-06-03 (`src/core/stigmergy/StigmergyAdapter.ts`)
- Hardening-Audit-Workflow 2026-06-07 (56 Findings, 29 ueberlebt Verify)
- ADR-018 (Episodic Task Memory)
- ADR-058 (Semantic Recipe Promotion)
- ADR-061 (FastPath Execution)
- ADR-062 (KV-Cache-Optimierte Prompt-Reihenfolge)
- MEMORY.md (Recipe-Promotion-Schwellen, Memory v2 Status)
