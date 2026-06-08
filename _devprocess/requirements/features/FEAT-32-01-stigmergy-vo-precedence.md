---
id: FEAT-32-01
title: Stigmergy<->VO Precedence Resolver
epic: EPIC-32
priority: P0
date: 2026-06-07
related: ADR-130, ADR-131
adr-refs: [ADR-130, ADR-131, ADR-061, ADR-062]
plan-refs: []
depends-on: []
---

# FEAT-32-01: Stigmergy<->VO Precedence Resolver

## Description

Phase 1 des Stigmergy-Vertrags. Drei zusammengehoerige Aenderungen, die den `StigmergyAdapter` zur reinen Beratungsschicht degradieren und VO-eigene Selektoren (Recipe-Match, FastPath) zur harten Praezedenz erheben.

1. **`StigmergyTurn.decisionMode` Surface**: Neue readonly Eigenschaft `decisionMode: 'sequence' | 'enforce' | 'ranked' | 'none'` auf der `StigmergyTurn`-Schnittstelle. Liest die bereits in der Closure liegende `decision.mode`. `NOOP_TURN` liefert `'none'`. Keine neue Daemon-RPC. Reine Read-only-Exposition fuer den Resolver in (3).

2. **`ToolExecutionPipeline` source-Tag**: `executeTool(..., opts?: { source?: 'model' | 'fastpath' | 'planner' })`. Default `'model'`. `capability_invoked` und `capability_returned` feuern nur bei `source === 'model'`. FastPath uebergibt `'fastpath'`, sodass der Stigmergy-Substrate keine FastPath-Tools sieht (Stigmergy beobachtet nur Model-Decisions, by design).

3. **Precedence-Resolver in `AgentTask.run()`**: Recipe-Match wird HOCHGEZOGEN auf einen einzigen frueher Resolution-Punkt unmittelbar nach `pathGuidance()`. Wenn ein Recipe matched UND FastPath erfolgreich ausgefuehrt wird, wird `guidance.text` unterdrueckt (kein Doppel-Hint). `guidance.path` bleibt fuer ADR-26 Pre-Activation IMMER aktiv. Der `history.push({role:'user'})` wandert NACH den FastPath-Branch. Ein neuer Snapshot `stigmergyDecisionSnapshot { enabled, mode, pinnedPath, guidanceTextSuppressed, recipeWinner }` wird in den `finally`-Block fuer Phase 2 durchgereicht.

Stigmergy-Substrate sieht ab dieser Aenderung nur noch Model-getriebene Tool-Calls. FastPath-Recipe-Schritte werden im Episode-Recording-Pfad gefuehrt (Phase 2), nicht im Substrate-Reinforcement.

Quelle: Hardening-Audit 2026-06-07, Findings 1, 6, 7, 8, 12, 13, 21, 22, 24, 25, 28, 29.

## Benefits Hypothesis

Heute fluten Recipe-Hint (System-Prompt-Prefix) und Stigmergy-`guidance.text` (User-Message-Tail) das Modell mit zwei sich potenziell ueberschneidenden Anleitungen. Token-Waste plus Konkurrenz um die Tool-Auswahl, beides ohne klaren Sieger. Sobald die Praezedenz im Code abgebildet ist, sieht das Modell pro Turn entweder Recipe oder Stigmergy-Hint, nicht beide. Bei FastPath-Treffer verschwindet die Konkurrenz vollstaendig. Erwartung: 0 Doppel-Hint-Turns + leicht reduzierte Output-Token bei FastPath-Treffern + klarere Stigmergy-Telemetrie (Substrate sieht nur Modell-Entscheidungen, nicht FastPath-Mechanik).

## User Stories

- **US-32-01-01 (P1 Sebastian):** Als Plugin-Maintainer moechte ich, dass das Modell bei FastPath-Treffer keinen zusaetzlichen Stigmergy-Hint sieht, damit keine konkurrierende Tool-Empfehlung den Recipe-Pfad sabotiert.
- **US-32-01-02 (P1 Sebastian):** Als Plugin-Maintainer moechte ich, dass Stigmergy nur die Tool-Calls beobachtet, die das Modell selbst getroffen hat, damit das Substrate-Lernen nicht durch FastPath-Mechanik verzerrt wird.
- **US-32-01-03 (P2 Stigmergy-Studio-Nutzer):** Als Studio-Nutzer moechte ich `decisionMode` als stabile API-Surface, damit Telemetrie und spaetere Phasen den Mode konsistent lesen koennen.

## Success Criteria

1. `StigmergyTurn.decisionMode` ist eine readonly Eigenschaft mit den vier moeglichen Werten `'sequence'`, `'enforce'`, `'ranked'`, `'none'`. `NOOP_TURN.decisionMode === 'none'`.
2. `ToolExecutionPipeline.executeTool` akzeptiert einen `opts.source`-Parameter mit Default `'model'`. Bei `source === 'fastpath'` werden `capability_invoked` und `capability_returned` nicht emittiert.
3. Die innere Dispatcher-Tools (`use_mcp_tool`, `invoke_skill`, `read_skill`) propagieren `source` aus dem `ToolExecutionContext`, sodass auch deren inner emits unter `'fastpath'` ausbleiben.
4. Bei Recipe-Match + FastPath-Erfolg ist `guidance.text` NICHT in der History; `guidance.path` ist trotzdem fuer Pre-Activation deferred Tools aktiv.
5. Bei Recipe-Match ohne FastPath (z.B. `targetsChatHistory` schaltet FastPath aus) bleibt `guidance.text` aktiv -- es gibt keine doppelte Praezedenz-Logik fuer alle Recipe-Treffer, nur fuer die FastPath-Erfolge.
6. `stigmergyDecisionSnapshot` wird in `AgentTask.run()` als closure-lokales Objekt gepflegt und steht im `finally`-Block fuer das spaetere Episode-Recording (FEAT-32-02) bereit.
7. NOOP_TURN-Pfad bleibt unveraendert: bei abwesendem Daemon ist `enabled === false`, `decisionMode === 'none'`, kein FastPath-Suppression-Branch feuert.
8. Cache-Prefix bleibt stabil. `recipesSection` bleibt im System-Prompt; `guidance.text` bleibt am User-Message-Tail.

## Technical NFRs

- **Cache-Stabilitaet:** Alle Aenderungen am `guidance.text`-Push wandern an den User-Message-Tail (post-cache). `recipesSection` im System-Prompt bleibt unveraendert. ADR-062 invariant.
- **Performance:** Recipe-Match wird HOCHGEZOGEN; `recipeMatches` wandert in den `AgentTaskRunConfig`, sodass Sidebar und AgentTask denselben Match nutzen (kein doppeltes Embedding-Lookup).
- **Robustness:** Bei `recipeMatchingService` Absenz oder Match-Throw faellt der Resolver auf `bestMatch = undefined` zurueck. FastPath-Branch laeuft nicht. Loop laeuft ungestoert weiter.
- **Substrate-Hygiene:** FastPath-Tools tauchen nicht im Stigmergy-Substrate auf. Dies ist by design (Stigmergy lernt Model-Entscheidungen, nicht Plugin-Mechanik). Doku in ADR-131.
- **Telemetry:** Pro Turn eine `console.debug`-Zeile am Resolution-Punkt: `[Precedence] Recipe '<name>' wins; Stigmergy guidance.text suppressed (mode=<mode>, pathLen=<n>)` bzw. `[Precedence] no recipe match, guidance.text shown`. Keine User-faehigen Daten geleakt.

## ASRs

- **ASR-CRIT-01:** `decisionMode`-Exposition darf keine neue Daemon-RPC ausloesen. Reine Closure-Auslese.
- **ASR-CRIT-02:** Pipeline `source`-Param muss in allen drei Dispatcher-Pfaden (use_mcp_tool, invoke_skill, read_skill) propagieren, sonst leaken inner emits trotzdem ins Substrate.
- **ASR-MOD-01:** Resolver muss innerhalb eines AgentTask-Subagent-Re-Entry-Pfades closure-lokal bleiben. Kein `this.*`, sonst vererbt der Parent Snapshot.

## Definition of Done

- [ ] `StigmergyAdapter.ts`: `decisionMode` in `StigmergyTurn` Interface + `NOOP_TURN` + `beginStigmergyTurn`-Return
- [ ] `ToolExecutionPipeline.ts`: `executeTool` Signatur + Source-Gate auf emits
- [ ] `UseMcpToolTool`, `InvokeSkillTool`, `ReadSkillTool`: `source` aus `ToolExecutionContext` lesen und an inner emits weiterreichen
- [ ] `AgentTask.ts`: Precedence-Resolver nach `pathGuidance()`, `history.push` nach FastPath-Branch verschoben, `stigmergyDecisionSnapshot` im Scope
- [ ] `AgentTaskRunConfig`: optional `recipeMatches?: RecipeMatchResult[]`, `originatingUserText?: string`
- [ ] `AgentSidebarView`: `recipeMatches` durch Config plumben
- [ ] Tests Adapter: 5 Tests (disabled/sequence/enforce/ranked/throw)
- [ ] Tests Pipeline: 3 Tests (default model, fastpath, dispatcher inner)
- [ ] Tests AgentTask: 4 Tests Precedence (Recipe+sequence, Recipe+FastPath, no-Recipe+sequence, NOOP)
- [ ] Build + Deploy, Smoke gegen bekannten Recipe-Match: kein Doppel-Hint, kein NOOP-Regression
- [ ] tsc clean, ESLint clean
- [ ] Doku-Update in arc42 Sektion 8.x (Stigmergy-Recall-Layer)

## Validation

H-01 aus EPIC-32. Unit-Tests decken den Code-Pfad ab; Smoke-Test ueber Sebastians Sebastian-bekannten "Knowledge Search & Synthesis"-Recipe-Match validiert das Live-Verhalten. Telemetrie-Schwelle: 0 Doppel-Hint-Turns ueber 1 Woche Live-Use.

## Out-of-Scope

- Stigmergy-Pinned-Sequenz -> Recipe Promotion (siehe FEAT-32-02)
- Episode-Recording im finally (siehe FEAT-32-02)
- FastPath-`recordForEpisodeOnly` (siehe FEAT-32-02)
- Memory v2 Robustness (siehe FEAT-32-03)
- Aenderung der Recipe-Match-Schwellen (0.5 score, 3 successCount bleiben)
