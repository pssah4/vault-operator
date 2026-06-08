---
id: ADR-130
title: Stigmergy als externer Recall-Layer in VO
date: 2026-06-07
deciders: [Sebastian, Architekt-Agent]
asr-refs: []
feature-refs: [FEAT-32-01, FEAT-32-02, FEAT-32-03]
related-adrs: [ADR-061, ADR-062, ADR-018, ADR-058]
supersedes: null
superseded-by: null
---

# ADR-130: Stigmergy als externer Recall-Layer in VO

## Context

Seit Anfang Juni 2026 integriert Vault Operator den externen `@agentic-stigmergy/*`-Daemon ueber einen Adapter. Der Daemon laeuft ausserhalb des Plugins als separater Prozess und kommuniziert via Unix-Socket-RPC. Er beobachtet pro AgentTask-Turn welche Capabilities (Tools, Skills, MCP-Tools, Subagent-Profiles) als Kandidaten zur Verfuegung stehen und welche tatsaechlich aufgerufen werden, und liefert eine optionale per-Turn-Empfehlung in einer von vier Modi: `ranked` (observe-only Reordering-Vorschlag), `sequence` (eine pinned Capability-Sequence), `enforce` (eine pinned Capability-Menge) oder `none` (keine Empfehlung).

Die Integration ist heute funktional, aber nirgends in der VO-V-Model-Doku verankert. Vor allem ist der Vertrag zwischen Stigmergy und den VO-eigenen Selektoren (Recipes, FastPath, Memory Composer, `find_tool` Progressive Disclosure) nicht explizit dokumentiert. Ohne Vertrag drohen drei Probleme: (a) Stigmergy konkurriert mit VO-Selektoren um die Tool-Auswahl statt sie zu ergaenzen, (b) Doppelte Hinweise im Kontext (recipesSection + guidance.text), (c) Daemon-Down-Verhalten ist nicht spezifiziert.

**Triggering ASR:** keine direkte ASR; reaktiv zur Stigmergy-Integration in Code.

## Decision drivers

- **Recall, kein Selektor**: Stigmergy soll nur Wissen aus historischen Capability-Sequenzen zurueckspielen, nicht selbst entscheiden welches Tool laeuft.
- **VO-Selektor-Vorrang**: Recipes, FastPath, Memory Composer und Progressive Disclosure sind die etablierten VO-Selektoren. Stigmergy darf sie nicht ueberschreiben.
- **Cache-Stabilitaet**: ADR-062 fordert einen stabilen System-Prompt-Prefix. Stigmergy-Hinweise muessen am User-Message-Tail landen, nicht im Prefix.
- **Daemon-Down-Sicherheit**: Plugin muss bei abwesendem Daemon oder Studio-Off normal funktionieren.
- **Substrate-Hygiene**: Substrate-Lernen darf nur Model-Entscheidungen erfassen, nicht Plugin-Mechanik wie FastPath-Batches.

## Considered options

### Option 1: Stigmergy als zweiter Selektor parallel zu VO-Selektoren

Stigmergy wirkt als unabhaengige Tool-Ranking-Schicht. Bei Recipe-Treffer UND Stigmergy-Pin sieht das Modell beide Hinweise und entscheidet selbst.

- **Pro:** Maximales Informationsangebot ans Modell.
- **Con:** Doppel-Hint, Token-Waste, Konkurrenz zweier Empfehlungen ohne klaren Sieger. Recipes verlieren ihre etablierte Praezedenz (3 Wiederholungen + LLM-Curation). Substrate-Reinforcement wird mit FastPath-Batches verzerrt.

### Option 2: Stigmergy als Recall-Layer mit VO-Praezedenz (gewaehlt)

Stigmergy wirkt nur als Beratungsschicht. VO-Selektoren haben harte Praezedenz: bei Recipe-Match + FastPath-Erfolg wird `guidance.text` unterdrueckt. `guidance.path` (Pre-Activation deferred Tools) bleibt aktiv, weil sie keine Konkurrenz zu VO-Selektoren ist sondern reine `find_tool`-Substitution. Substrate sieht nur Model-getriebene Tool-Calls; FastPath-Batches werden ueber `source: 'fastpath'` aus der Substrate-Beobachtung ausgeschlossen. Erfolgreiche Stigmergy-Pinned-Sequenzen werden direkt als Recipe-Kandidaten promoted (ADR-132).

- **Pro:** Klare Praezedenz-Regel; VO-Selektoren behalten ihre etablierte Rolle; Stigmergy ergaenzt statt zu konkurrieren; Substrate-Hygiene ist sauber.
- **Con:** Mehr Code-Komplexitaet im Resolver (FEAT-32-01); Substrate sieht nicht alle Tool-Calls (by design, aber Telemetrie muss das beruecksichtigen).

### Option 3: Stigmergy via Feature-Toggle deaktivieren

Adapter bleibt code-seitig, aber per User-Setting wird der Daemon nie kontaktiert.

- **Pro:** Minimaler Eingriff. Volle Kontrolle.
- **Con:** Stigmergy-Investment wird nicht genutzt. Sebastian hat den Daemon explizit als unabhaengige Suggestion-Layer eingerichtet. Verschiebt die Vertragsfrage nur in die Zukunft.

## Decision outcome

Option 2 ist gewaehlt. Stigmergy ist im VO-Stack ein **externer Recall-Layer**:

1. **Recall, nicht Selektor**: `pathGuidance()` ist die einzige Beeinflussung der Modell-Sicht; `orderTools` wurde im Commit 6621fbc4 bereits entfernt. Substrate-Beobachtung via `capability_invoked` / `capability_returned` ist passive Telemetrie.
2. **NOOP_TURN als Sicherheitsmechanismus**: `StigmergyAdapter` ist lazy-loadbar (`@agentic-stigmergy/*` Optional Dependency). Bei Daemon-down, Package-fehlt oder Studio-off liefert `beginStigmergyTurn` ein NOOP_TURN mit `enabled: false`, `decisionMode: 'none'`. Jede neue Code-Bahn in VO muss diesen Pfad als no-op behandeln.
3. **VO-Selektor-Vorrang**: ADR-131 etabliert die Resolver-Regel.
4. **Promotion-Pfad**: ADR-132 etabliert die direkte Stigmergy-zu-Recipe-Promotion fuer sequence-mode erfolgreiche Runs.
5. **Episode-Recording umfasst Stigmergy-Decision**: ADR-133 etabliert die Erweiterung des Episode-Schemas und das Recording im finally-Block.

## Consequences

- StigmergyAdapter bleibt single-source-of-truth fuer Daemon-Kommunikation. `initStigmergy` ist idempotent; alle public Funktionen sind degrade-dichten Wrappers ueber lazy-loaded Module.
- Capability-Registration umspannt alle vier Surfaces (tools, skills, MCP-Tools, subagent profiles) mit namespaced IDs (`skill:*`, `mcp:server:*`, `subagent:*`). Substrate kennt sie distinct.
- Substrate sieht nur Model-Entscheidungen (FastPath-Batches sind durch `source: 'fastpath'` ausgeschlossen). Telemetrie-Auswertung im Studio muss diese Konvention kennen.
- Cache-Prefix bleibt stabil. `pathGuidance` text geht an den User-Message-Tail.
- Bei Daemon-down laeuft VO ohne Stigmergy-Funktionalitaet weiter, ohne Code-Pfade zu aendern.

## Related

- Code: `src/core/stigmergy/StigmergyAdapter.ts` (Adapter), `src/core/AgentTask.ts:340-720` (per-Turn-Wiring), `src/core/tool-execution/ToolExecutionPipeline.ts:230-480` (Substrate-Emit)
- ADR-131 (Precedence-Regel)
- ADR-132 (Stigmergy-Pinned-Sequence Direct Promotion)
- ADR-133 (Episode-Recording im finally)
- ADR-062 (KV-Cache-Optimierte Prompt-Reihenfolge)
- arc42 Sektion 8.x (Stigmergy als Recall-Layer)
