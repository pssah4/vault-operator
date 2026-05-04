# ADR-59: Memory Decay Prevention (Aktive Qualitaetssicherung)

**Date:** 2026-04-03
**Deciders:** Sebastian Hanke

## Context

Die Long-Term-Memory-Dateien (`user-profile.md`, `patterns.md`, `projects.md`)
wachsen durch den LongTermExtractor kontinuierlich. Der LLM soll "mergen"
(konsolidieren, Duplikate entfernen), aber in der Praxis fuegt er eher hinzu
als zu loeschen.

Das Problem: Der System Prompt injiziert nur die **ersten 800 Zeichen** pro Datei
(`MAX_CHARS_PER_FILE` in `MemoryService.ts:89`). Aeltere Eintraege stehen oben
und bleiben sichtbar. Neuere, relevantere Eintraege rutschen nach unten und
werden mit `[...truncated]` abgeschnitten.

**Prognose ueber Jahre:**
- Heute: `patterns.md` hat 400 Zeichen (alles sichtbar)
- 6 Monate: ~2000 Zeichen (60% unsichtbar)
- 1 Jahr: ~4000 Zeichen (80% unsichtbar)
- Die sichtbaren 800 Zeichen enthalten dann veraltete Informationen

**Triggering ASR:**
- ASR-2: Memory-Dateien brauchen aktive Qualitaetssicherung
- Quality Attribute: Relevance Decay, Long-term Usability

## Decision Drivers

- **Relevanz ueber Zeit**: Neuere Erkenntnisse muessen wichtiger sein als alte
- **Kein manueller Aufwand**: User soll Memory nicht selbst pflegen muessen
- **Kontrollierbare Kosten**: Garbage Collection darf nicht zu viele LLM-Calls kosten
- **Transparenz**: User muss sehen koennen was sich aendert

## Considered Options

### Option 1: LLM-basierte periodische Konsolidierung ("Compaction")

Regelmaessig (z.B. alle 10 Sessions oder 1x pro Woche) laeuft ein LLM-Call
der die gesamte Memory-Datei liest und konsolidiert:
- Veraltete Eintraege entfernen
- Redundanzen zusammenfassen
- Nach Relevanz sortieren (wichtigstes zuerst)

- Pro: LLM kann semantisch urteilen was veraltet ist
- Pro: Kann Duplikate und Widersprueche erkennen
- Con: 1 zusaetzlicher LLM-Call pro Compaction
- Con: LLM koennte versehentlich wichtige Eintraege loeschen
- Con: Schwer zu debuggen wenn Memory sich "falsch" veraendert

### Option 2: Timestamp-basiertes Ranking + Truncation

Jeder Eintrag bekommt einen Timestamp. Beim Aufbau des Memory-Contexts
werden Eintraege nach Recency sortiert. Eintraege aelter als N Tage
ruecken nach unten (und werden ggf. truncated).

- Pro: Kein LLM-Call noetig
- Pro: Deterministisch und nachvollziehbar
- Pro: Einfache Implementierung
- Con: Recency != Relevanz (ein alter Pattern kann immer noch wichtig sein)
- Con: Erfordert strukturiertes Format (aktuell Freeform Markdown)

### Option 3: Budget-Aware LongTermExtractor + Recency Header

Der LongTermExtractor bekommt das Budget als Constraint: "Die Datei darf
maximal 800 Zeichen haben. Wenn du neue Information hinzufuegst, entferne
oder kuerze die am wenigsten relevante bestehende Information."
Zusaetzlich wird bei jedem Eintrag ein `[YYYY-MM]`-Prefix gesetzt.

- Pro: Datei bleibt immer innerhalb des Budgets
- Pro: LLM entscheidet was relevant ist (mit Datums-Kontext)
- Pro: Kein separater Compaction-Job noetig
- Pro: Bestehender LLM-Call (LongTermExtractor) wird nur umformuliert
- Con: LLM muss bei jedem Extract die gesamte Datei neu bewerten
- Con: Risiko dass der LLM "zu aggressiv" kuerzt

## Decision

**Vorgeschlagene Option:** Option 3 -- Budget-Aware LongTermExtractor + Recency Header

**Begruendung:**

Das Problem entsteht, weil der LongTermExtractor aktuell "append-only" arbeitet,
ohne das Prompt-Budget zu kennen. Wenn der Extractor das Budget als harte Grenze
bekommt, loest sich das Problem an der Quelle:

1. Die Datei waechst nie ueber 800 Zeichen (= immer vollstaendig sichtbar im Prompt)
2. Der LLM muss bei jedem Update entscheiden: "Was ist am wichtigsten?"
3. Veraltete Eintraege werden natuerlich verdraengt
4. Kein separater Cron-Job oder Compaction-Mechanismus noetig

Die Recency-Header (`[2026-04]`) geben dem LLM den zeitlichen Kontext,
um informiert zu entscheiden was veraltet ist.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final
basierend auf dem realen Zustand der Codebase.

## Implementation Sketch

### LongTermExtractor Prompt-Aenderung

```
Bisherig:
  "Extract durable facts from this session summary and merge them
   into the existing memory files."

Neu:
  "Extract durable facts from this session summary. Each memory file
   has a HARD BUDGET of {MAX_CHARS} characters. If adding new information
   would exceed the budget, remove or condense the LEAST relevant
   existing entries. Prefix each entry with [YYYY-MM].

   Current file ({filename}, {currentChars}/{MAX_CHARS} chars):
   ---
   {current content}
   ---

   New session summary:
   {session summary}

   Output the COMPLETE updated file content (not a diff)."
```

### Aenderungen

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `LongTermExtractor.ts` | Prompt erweitern mit Budget-Constraint und Recency-Header | Medium |
| `MemoryService.ts` | `MAX_CHARS_PER_FILE` exportieren fuer LongTermExtractor | Low |
| Keine neuen Dateien | Bestehender Mechanismus wird nur umkonfiguriert | -- |

### Nicht betroffen

| Datei | Grund |
|-------|-------|
| `SessionExtractor.ts` | Liefert nur Input, aendert sich nicht |
| `MemoryRetriever.ts` | Liest Dateien, aendert sich nicht |
| `ExtractionQueue.ts` | Transport-Mechanismus, aendert sich nicht |

## Consequences

### Positive
- Memory-Dateien bleiben dauerhaft innerhalb des sichtbaren Budgets
- Natuerliche Verdraengung veralteter Informationen
- Keine neuen Infrastruktur-Komponenten noetig
- Transparenter Zeitstempel pro Eintrag

### Negative
- LLM muss bei jedem Extract die gesamte Datei neu bewerten (mehr Tokens im Extract-Call)
- Risiko von Informationsverlust wenn LLM zu aggressiv kuerzt
- Uebergangsphase: Bestehende zu lange Dateien muessen einmalig gekuerzt werden

### Risks
- **Aggressives Kuerzen**: Mitigation durch explizite Instruktion "only remove entries
  that are clearly outdated or superseded by newer information"
- **Daten-Format-Bruch**: Bestehende Dateien haben keine Timestamps. Mitigation:
  Einmalige Migration oder "undated entries are treated as oldest"

## Implementation Notes (Coding Review 2026-04-03)

**Umgesetzt wie vorgeschlagen:**

1. `MAX_CHARS_PER_FILE` exportiert aus MemoryService (war vorher `const`)
2. LongTermExtractor-Prompt erweitert mit:
   - `{MAX_CHARS}` Budget-Constraint (global ersetzt via Regex)
   - `chars="{X}/{MAX_CHARS}"` pro Memory-Datei (zeigt LLM den aktuellen Fuellstand)
   - Recency-Header-Instruktion `[YYYY-MM]`
   - Explizite Anweisung: "Remove or condense LEAST relevant entries when over budget"
3. Bestehende `append`/`replace` Logik bleibt unveraendert -- der LLM entscheidet was zu kuerzen ist

**Key Files:**
- `src/core/memory/LongTermExtractor.ts` (Prompt + replace-Logik)
- `src/core/memory/MemoryService.ts` (Export)

## Related Decisions

- ADR-13: 3-Tier Memory (Grundarchitektur, wird verfeinert)

## References

- Systemtest 2026-04-03: Memory-Dateien waren leer trotz 10+ Sessions (erst Test A befuellte sie)
- CrewAI Memory: Composite Scoring mit Recency als Faktor
- Langchain Memory: ConversationSummaryBufferMemory mit Token-Limit
