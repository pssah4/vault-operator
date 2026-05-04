# ADR-58: Semantic Recipe Promotion (Intent-basiert statt Sequenz-basiert)

**Date:** 2026-04-03
**Deciders:** Sebastian Hanke

## Context

Das bestehende Recipe-Promotion-System (ADR-18) erkennt wiederkehrende Aufgaben
anhand exakter Tool-Sequenzen. Ein Pattern-Key wie
`search_files-semantic_search-read_file-read_file-write_file-open_note` muss 3x
identisch auftreten, bevor ein Recipe promoted wird.

**Systemtest 2026-04-03 (Test B) bewies:** Das funktioniert in der Praxis nicht.
Drei funktional identische Aufgaben ("suche Notizen zu X und fasse zusammen")
erzeugten drei verschiedene Tool-Sequenzen, weil:
- Der LLM nicht-deterministisch Tools waehlt (mal `search_files`, mal `semantic_search`)
- Utility-Tools wie `update_todo_list` den Key "verschmutzen"
- Unterschiedliche `read_file`-Anzahlen je nach Vault-Inhalt

Ergebnis: 3 verschiedene Patterns mit je successCount=1. Promotion-Threshold nie erreicht.

**Triggering ASR:**
- ASR-1: Recipe Promotion muss auf Intent-Similarity basieren
- Quality Attribute: Effectiveness (Lernsystem muss tatsaechlich lernen)

## Decision Drivers

- **Matching-Genauigkeit**: Funktional aehnliche Aufgaben muessen als "gleich" erkannt werden
- **Kein zusaetzlicher LLM-Call**: Matching darf keine Token-Kosten verursachen
- **Bestehende Infrastruktur nutzen**: Embedding-Modell (qwen3-embedding-8b) und
  knowledge.db (10.782 Vektoren) sind bereits aktiv
- **Abwaertskompatibilitaet**: Bestehende Episoden und Recipes bleiben nutzbar

## Considered Options

### Option 1: Tool-Gruppen-Abstraktion

Pattern-Key abstrahieren: `search_files`/`semantic_search`/`search_by_tag` werden
zu `search`, `read_file`/`read_document` zu `read`, etc. Utility-Tools
(`update_todo_list`, `open_note`, `attempt_completion`) werden herausgefiltert.

- Pro: Einfachste Code-Aenderung (~30 Zeilen in RecipePromotionService)
- Pro: Kein zusaetzlicher API-Call oder Embedding noetig
- Pro: Haette in Test B sofort funktioniert (alle 3 = `search-read-write`)
- Con: Verliert Spezifitaet -- `search-read-write` matcht sehr viele verschiedene Tasks
- Con: Keine semantische Unterscheidung der User-Intention
- Con: Erzeugt moeglicherweise zu generische Recipes

### Option 2: Embedding-basiertes Intent-Matching

User-Messages der Episoden werden als Embeddings verglichen (Cosine Similarity).
Episoden mit aehnlicher User-Message (>= Threshold) werden als gleiches Pattern
gezaehlt, unabhaengig von der Tool-Sequenz.

- Pro: Trifft den tatsaechlichen Intent, nicht die Implementierung
- Pro: Embedding-Modell ist bereits aktiv (qwen3-embedding-8b via OpenRouter)
- Pro: Episoden sind bereits im VectorStore indiziert (`episode:ep-...`)
- Pro: `EpisodicExtractor.findSimilarEpisodes()` existiert bereits als Methode
- Con: Erfordert Embedding-Call pro Episode-Vergleich (existiert aber schon)
- Con: Threshold-Tuning noetig (zu niedrig = Over-Matching, zu hoch = Under-Matching)
- Con: Etwas komplexere Aenderung als Option 1

### Option 3: Hybrid (Gruppen + Embedding)

Zwei Stufen: (1) Tool-Gruppen-Abstraktion als Vorfilter, (2) Embedding-Similarity
als Bestaetigung. Nur wenn BEIDE matchen, zaehlt es als gleiches Pattern.

- Pro: Hoechste Praezision (Tool-Muster UND Intent muessen passen)
- Pro: Nutzt beide Signale komplementaer
- Con: Hoechste Komplexitaet
- Con: Kann zu restriktiv sein (beide Bedingungen muessen erfuellt sein)

## Decision

**Vorgeschlagene Option:** Option 2 -- Embedding-basiertes Intent-Matching

**Begruendung:**

Das Kernproblem ist die Erkennung, ob zwei Aufgaben "die gleiche Art von Aufgabe" sind.
Die Tool-Sequenz ist dafuer der falsche Indikator -- der User-Intent ist der richtige.

Die gesamte Infrastruktur existiert bereits:
1. Embedding-Modell aktiv (qwen3-embedding-8b)
2. Episoden werden bereits embedded und im VectorStore indiziert
3. `findSimilarEpisodes(query, topK)` existiert als Methode
4. RecipePromotionService braucht nur die Matching-Logik auszutauschen

Option 1 (Tool-Gruppen) ist simpler, loest aber das Problem nicht fundamental:
`search-read-write` wuerde auch fuer voellig unterschiedliche Aufgaben matchen
(z.B. "suche Meetings" vs. "suche Philosophie-Notizen"). Das wuerde zu generischen
Recipes fuehren die mehr schaden als nutzen.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final
basierend auf dem realen Zustand der Codebase.

## Implementation Sketch

```
Bisherig (ADR-18):
  Episode recorded -> makePatternKey(toolSequence) -> "search-read-write-open"
  -> loadPattern(key) -> successCount++ -> if >= 3: promoteToRecipe()

Neu:
  Episode recorded -> findSimilarEpisodes(episode.userMessage, topK=10)
  -> Filter: nur erfolgreiche Episoden (success=true)
  -> Filter: Cosine Similarity >= INTENT_THRESHOLD (z.B. 0.75)
  -> similarCount = Anzahl aehnlicher Episoden
  -> if similarCount >= PROMOTION_THRESHOLD (3):
       -> Sammle die aehnlichen Episoden als Beispiele
       -> promoteToRecipe(examples) [bestehendes LLM-Call Pattern]
```

### Aenderungen an bestehenden Dateien

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `RecipePromotionService.ts` | `checkForPromotion()`: Sequenz-Matching durch Embedding-Similarity ersetzen | Medium |
| `EpisodicExtractor.ts` | `findSimilarEpisodes()` oeffentlich machen (ist bereits public) | Low |
| `RecipePromotionService.ts` | Pattern-Persistence (patterns table) wird obsolet | Low |
| `RecipeMatchingService.ts` | Phase 2 (Semantic Fallback) implementieren | Medium |

### Nicht betroffen

| Datei | Grund |
|-------|-------|
| `RecipeStore.ts` | Recipe-Format bleibt identisch |
| `RecipeMatchingService.ts` (Phase 1) | Keyword-Matching bleibt als Primary |
| `staticRecipes.ts` | Static Recipes sind unabhaengig |
| `AgentTask.ts` | Episoden-Recording unveraendert |

## Consequences

### Positive
- Recipe Promotion funktioniert erstmals in der Praxis
- Nutzt bestehende Embedding-Infrastruktur (kein neues Modell)
- Semantisch praezisere Recipes (basiert auf Intent, nicht Implementierung)
- `patterns` Table in MemoryDB wird obsolet (Vereinfachung)

### Negative
- Abhaengigkeit vom Embedding-Modell (wenn deaktiviert, kein Learning)
- Threshold-Tuning noetig (INTENT_THRESHOLD)
- Embedding-Call pro Episode-Vergleich (aber minimal, da bereits indiziert)

### Risks
- **Over-Matching bei niedrigem Threshold**: Mitigation durch konservativem Start (0.75)
  und Monitoring der generierten Recipes
- **Embedding-Modell-Wechsel**: Alte Episoden-Embeddings werden inkompatibel.
  Mitigation: Re-Index bei Modell-Wechsel (bestehender Mechanismus)

## Related Decisions

- ADR-18: Episodic Task Memory (wird erweitert, nicht ersetzt)
- ADR-17: Procedural Recipes (Format bleibt)
- ADR-13: 3-Tier Memory (unveraendert)
- ADR-50: SQLite Knowledge DB (VectorStore wird genutzt)

## Implementation Notes (Coding Review 2026-04-03)

**Umgesetzt wie vorgeschlagen** mit folgenden Anpassungen:

1. RecipePromotionService komplett umgeschrieben: `findSimilarEpisodes()` statt Pattern-Keys
2. Constructor vereinfacht: `EpisodicExtractor` als Dependency statt `FileAdapter`/`MemoryDB`
3. `patterns` Table in MemoryDB wird nicht mehr beschrieben (Legacy-Daten bleiben lesbar)
4. Duplicate-Guard: Prueffe ob ein bestehendes Recipe den Intent bereits abdeckt
5. `MAX_LEARNED_RECIPES = 50` als Cap gegen unbegrenztes Wachstum

**Phase 4 (Semantic Matching Fallback):** `searchRecipes()` existiert nicht im
SemanticIndexService. Stattdessen: Description-Keyword-Matching als Phase 2
in RecipeMatchingService. Kein API-Call, reicht fuer den Hauptfall.

**Key Files:**
- `src/core/mastery/RecipePromotionService.ts` (komplett neu)
- `src/core/mastery/RecipeMatchingService.ts` (Phase 2 Fallback hinzugefuegt)
- `src/main.ts` (Constructor-Aenderung)

## References

- Systemtest 2026-04-03: Test B bewies Unwirksamkeit des Sequenz-Matchings
- Agent Workflow Memory (ICML 2025): +24-51% Success Rate mit Intent-Matching
- Mem^p: Duale Repraesentation (Trajektorien + abstrahierte Skripte)
