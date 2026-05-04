# ADR-39: Copilot Content Normalization Strategy

**Date:** 2026-03-18
**Deciders:** Sebastian Hanke

## Context

GitHub Copilot agiert als Proxy fuer verschiedene Modellfamilien (Claude, GPT, Gemini etc.). Wenn Claude-Modelle ueber Copilot angesprochen werden, zeigen die Streaming-Responses zwei Abweichungen vom Standard-OpenAI-Format:

1. **`delta.content` als Array:** Claude sendet Content als `[{type: "text", text: "..."}]` statt als Plain String. Ohne Normalisierung wird der Text verworfen.
2. **Fehlende `delta.role`:** Claude-Proxy laesst `delta.role` in Streaming-Chunks weg. Ohne Default wird der Chunk falsch klassifiziert.

**Triggering ASR:**
- Content-Normalisierung im Stream-Handler (Correctness/Interoperability, FEAT-12-02)

**Problem:** Wo und wie soll die Normalisierung geschehen?

## Decision Drivers

- **Korrektheit:** Alle Modelle muessen korrekt gestreamt werden (Claude, GPT, Gemini via Copilot)
- **Isolation:** Normalisierung darf andere Provider nicht beeinflussen
- **Einfachheit:** Minimale Abstraktion, kein Over-Engineering
- **Wartbarkeit:** Wenn Copilot sein Format aendert, muss nur eine Stelle geaendert werden

## Considered Options

### Option 1: Normalisierung im GitHubCopilotProvider
- Im `createMessage()` Stream-Generator: nach dem SDK-Parsing, vor dem Yield
- Pro: Isoliert im Copilot-Provider, beruehrt keine anderen Provider
- Pro: Einfach zu implementieren (5-10 Zeilen Code)
- Pro: Klar wo die Logik lebt
- Con: Wenn andere Provider das gleiche Problem bekommen → Duplizierung

### Option 2: Generischer Stream-Transformer
- `normalizeOpenAiStream(stream)` Utility-Funktion die jeder Provider nutzen kann
- Pro: Wiederverwendbar
- Con: Over-Engineering -- aktuell nur fuer Copilot relevant
- Con: Zusaetzliche Abstraktion fuer einen Edge Case

### Option 3: Normalisierung im Custom-Fetch-Wrapper
- Vor dem SDK-Parsing: Response-Body modifizieren
- Pro: SDK sieht "normales" Format
- Con: Response-Body-Manipulation ist fragil (Streaming-Chunks, Encoding)
- Con: Schwer zu debuggen

## Decision

**Vorgeschlagene Option:** Option 1 -- Normalisierung im Provider

**Begruendung:**
1. Das Problem ist Copilot-spezifisch (Claude-via-Proxy). Es gehoert in den Copilot-Provider.
2. Minimaler Code-Aufwand: Eine Hilfsfunktion `normalizeDeltaContent(content)` die Array → String konvertiert.
3. Wenn andere Provider das Problem spaeter auch haben, kann die Funktion in ein Utility extrahiert werden (YAGNI jetzt).
4. `delta.role` Default auf "assistant" ist eine einzeilige Anpassung im Stream-Generator.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Keine Aenderung an bestehenden Providern
- Isolierte, testbare Logik
- Einfach zu entfernen wenn Copilot sein Format anpasst

### Negative
- Potential fuer Code-Duplizierung wenn andere Provider gleiche Quirks entwickeln
- Muss manuell getestet werden mit verschiedenen Copilot-Modellen (Claude vs. GPT)

### Risks
- **Copilot aendert Format:** Niedrig. Normalisierung ist defensiv (if Array → join, else passthrough). Aenderungen brechen nichts.

## Implementation Notes

```typescript
function normalizeDeltaContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (content == null) return '';
    if (Array.isArray(content)) {
        return content
            .map((part: unknown) => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object' && 'text' in part
                    && typeof (part as Record<string, unknown>).text === 'string') {
                    return (part as Record<string, unknown>).text;
                }
                return '';
            })
            .join('');
    }
    return '';
}
```

Nutzung im Stream-Generator:
```typescript
// Nach SDK chunk parsing:
if (delta?.content) {
    const normalizedContent = normalizeDeltaContent(delta.content);
    if (normalizedContent) {
        yield { type: 'text', text: normalizedContent };
    }
}
```

## Related Decisions

- ADR-37: Copilot Provider Architecture -- Provider-Struktur
- ADR-36: Copilot Streaming Strategy -- SDK-basiertes Streaming

## References

- FEAT-12-02: Copilot Chat Completions Provider
- Referenz: obsidian-copilot `normalizeDeltaContent()` (LangChain-Version)
