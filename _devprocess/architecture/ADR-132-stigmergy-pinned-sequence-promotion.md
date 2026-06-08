---
id: ADR-132
title: Stigmergy-Pinned-Sequence Direct Recipe Promotion
date: 2026-06-07
deciders: [Sebastian, Architekt-Agent]
asr-refs: []
feature-refs: [FEAT-32-02]
related-adrs: [ADR-130, ADR-131, ADR-058, ADR-018]
supersedes: null
superseded-by: null
---

# ADR-132: Stigmergy-Pinned-Sequence Direct Recipe Promotion

## Context

ADR-058 etabliert die semantische Recipe-Promotion: nach jeder erfolgreichen Episode wird via `EpisodicExtractor.findSimilarEpisodes` geprueft, ob >= 3 semantisch aehnliche erfolgreiche Episoden vorliegen. Falls ja, wird via einem internen LLM-Call ein Recipe generiert. In der Praxis braucht das Pattern Wochen, bis genug organische Wiederholungen auflaufen.

Stigmergy hat im Modus `sequence` eine pinned Capability-Sequenz, die das Substrate aus historischen Reinforcement-Daten gelernt hat. Wenn ein Turn dieser Sequenz erfolgreich folgt (clean `attempt_completion`), ist das genauso starkes Evidence wie drei organische Wiederholungen. Statt darauf zu warten, dass das gleiche Pattern noch zweimal organisch auftritt, kann VO direkt promoten.

Heute fehlt der Pfad in `RecipePromotionService` voellig. Selbst wenn die Stigmergy-Decision verfuegbar waere (sie ist es nicht, siehe ADR-133), gibt es kein Code-Pfad fuer die direkte Promotion.

**Triggering ASR:** EPIC-32 Contract 3 (Stigmergy-Pinned-Sequenzen werden Recipe-Kandidaten ohne 3-Wiederholungen-Schwelle).

## Decision drivers

- **Recipe-Volumen schneller wachsen lassen**: Lerne von Stigmergy-Substrate, ohne ADR-058 zu invalidieren.
- **VO-Selektor-Vorrang (ADR-131) bleibt**: Wenn ein bestehender Recipe matched, kein Promote.
- **NOOP-Sicherheit**: Daemon-down-Pfad faellt auf ADR-058-Fallback zurueck.
- **Idempotenz**: Identische Pfade duerfen nicht mehrfach promoted werden.
- **Provenance-Tracking**: Promoted-Recipes muessen als `stigmergy-shortcut` markiert sein fuer Telemetrie und potenzielle Re-Evaluation.
- **Dedup gegen Near-Duplicates**: Identische Tool-Sequence im RecipeStore -> `incrementSuccess` statt promote.

## Considered options

### Option 1: ADR-058 ersetzen durch Stigmergy-Shortcut

Stigmergy-Pinned-Sequence ist die einzige Promotion-Quelle; ADR-058 entfaellt.

- **Pro:** Eine Quelle, weniger Komplexitaet.
- **Con:** Bei Daemon-down gibt es keinen Promotion-Pfad mehr. ADR-058 deckt auch Faelle ab, in denen Stigmergy keine `sequence`-Entscheidung trifft.

### Option 2: Stigmergy-Shortcut additiv zu ADR-058 (gewaehlt)

`RecipePromotionService.checkForPromotion(episode, stigmergyEvidence?)` bekommt drei Gates in Reihenfolge:
1. **Gate 1 Recipe-wins**: `evidence?.recipeWinner` gesetzt -> `incrementSuccess(recipeWinner)`, kein Promote.
2. **Gate 2 Stigmergy-Shortcut**: `mode === 'sequence' && pinnedPath.length >= 2 && success && pathFollowed && lastTool === 'attempt_completion'` -> `promoteFromStigmergyPath`.
3. **Gate 3 Fallback**: ADR-058-Pfad (3 organische similar).

- **Pro:** Stigmergy-Shortcut zusaetzlicher Pfad ohne ADR-058 zu invalidieren. NOOP-Pfad faellt auf Gate 3. Recipe-wins-Gate (1) verhindert doppelte Promotion bei FastPath-Treffer.
- **Con:** Drei Pfade statt einer; mehr Tests.

### Option 3: Stigmergy-Shortcut hinter Feature-Flag

Promotion nur wenn User explizit aktiviert.

- **Pro:** Volle Kontrolle.
- **Con:** Der bestehende `mastery.learnedEnabled`-Toggle deckt das schon ab. Zusaetzlicher Flag verkompliziert die Settings.

## Decision outcome

Option 2 ist gewaehlt. Die Implementierung in `RecipePromotionService.ts`:

```typescript
async checkForPromotion(
    episode: TaskEpisode,
    stigmergyEvidence?: StigmergyEvidence,
): Promise<void> {
    if (!this.getLearnedEnabled()) return;

    // Gate 1: Recipe wins (FastPath fired)
    if (stigmergyEvidence?.recipeWinner) {
        await this.store.incrementSuccess(stigmergyEvidence.recipeWinner);
        return;
    }

    // Gate 2: Stigmergy shortcut
    const e = stigmergyEvidence;
    if (
        e?.enabled
        && e.mode === 'sequence'
        && e.pinnedPath.length >= 2
        && episode.success
        && containsContiguousSubsequence(episode.toolSequence, e.pinnedPath)
        && episode.toolSequence[episode.toolSequence.length - 1] === 'attempt_completion'
    ) {
        await this.promoteFromStigmergyPath(episode, e.pinnedPath);
        return;
    }

    // Gate 3: ADR-058 fallback (3 organic similar)
    if (episode.success && episode.toolSequence.length >= 2 && this.episodicExtractor) {
        // existing logic
    }
}
```

`promoteFromStigmergyPath` durchlaeuft DIESELBEN Gates wie `checkForPromotion`:
- `getLearnedEnabled()` (oben bereits geprueft)
- `MAX_LEARNED_RECIPES = 50` Cap
- `dedupAgainstLearned(triggerText)` (Trigger-Token-Overlap, refaktoriert aus heutiger Inline-Logik)
- Neue `dedupBySequence(plannedSteps)` gegen Near-Duplicate-Pollution
- **VO-Selektor-Vorrang**: wenn `recipeMatchingService.match(episode.userMessage)?.[0]?.recipe.source === 'learned'` mit score >= 0.5 -> `incrementSuccess(existing.id)` und SKIP promote (ADR-131 Konsistenz)

LLM-Prompt-Variante:
```
Trigger user message: ${userMessage}
Stigmergy pinned this capability path: ${pinnedPath.join(' -> ')}
Generate a recipe whose steps mirror this path.
Resolve skill:<slug> -> invoke_skill, mcp:<server>:<name> -> use_mcp_tool.
```

Persistierte Felder:
- `successCount: 1`
- `lastUsed: now`
- `provenance: 'stigmergy-shortcut'`
- `id: 'learned-stigmergy-<sha1(pinnedPath).slice(0,8)>-<ts>'` (kollisionsfrei)

`capability-id-Resolver` mappt `skill:slug -> invoke_skill`, `mcp:server:name -> use_mcp_tool` ueber die Helper aus `StigmergyAdapter.ts:319-331`.

## Consequences

- Recipe-Volumen waechst schneller, wenn Stigmergy-Studio aktiv ist und sequence-Decisions liefert.
- ADR-058 bleibt aktiv. Bei Daemon-down ist nur Gate 3 wirksam.
- Recipe-wins-Gate verhindert, dass ein FastPath-Treffer doppelt promoted (einmal als Recipe-Inkrement, einmal als Stigmergy-Shortcut). `incrementSuccess` ist der korrekte Reinforcement-Pfad bei Recipe-Treffer.
- Provenance-Flag `stigmergy-shortcut` erlaubt spaetere Re-Evaluation: wenn ein Shortcut-Recipe nach N Verwendungen nicht mehr erfolgreich ist, kann er deprecated werden.
- `pathFollowed`-Pruefung (`containsContiguousSubsequence`) verhindert, dass partial-runs promoted werden. Test-pflichtig fuer Praefix, Subsequence, Side-Effects-Between-Pins.
- `syncSession.ts:151` MCP-Promotion-Pfad ruft `checkForPromotion` weiterhin ohne `stigmergyEvidence` -> nur Gate 3 ADR-058 feuert.

## Related

- Code: `src/core/mastery/RecipePromotionService.ts:55-185`, `src/core/mastery/RecipeStore.ts`, `src/core/mastery/EpisodicExtractor.ts:findSimilarEpisodes`
- ADR-130 (Stigmergy als Recall-Layer)
- ADR-131 (VO-Selektor-Vorrang)
- ADR-058 (Semantic Recipe Promotion)
- ADR-018 (Episodic Task Memory)
- FEAT-32-02 (Implementation)
