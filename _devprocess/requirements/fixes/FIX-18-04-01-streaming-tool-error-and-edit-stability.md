# BUG-032: Streaming Tool-Error verschluckt + edit_file-Schleife bei grossen Diffs

**Prioritaet:** P1 (Kurzfristig, blockiert Meeting-Summary-artige Aufgaben)
**Dateien:**
- `src/api/providers/github-copilot.ts` (Streaming-Loop)
- `src/api/providers/openai.ts` (Streaming-Loop)
- `src/api/providers/kilo-gateway.ts` (Streaming-Loop)
- `src/api/providers/chatgpt-oauth.ts` (Streaming-Loop)
- `src/core/tools/vault/EditFileTool.ts` (Error-Message)
- `src/core/tools/vault/ReadFileTool.ts` (MAX_CONTENT_CHARS + Truncation-Hint)

**Feature-Bezug:** FEAT-18-04 (Cost-Aware Agent Heuristics, EPIC-18) -- Stabilisierungs-Vorbedingung
**Entdeckt:** 2026-04-29 (Meeting-Summary-Regression, 25min/675k Tokens)

---

## Problem

Drei zusammenhaengende Defekte fuehrten in einer 50min-Meeting-Summary-Aufgabe
zu einem 25-minuetigen Loop mit 675k Input-Tokens und keinem Ergebnis:

1. **read_file-Externalization-Sackgasse** -- ADR-63 hat eine Implementation-
   Note hinzugefuegt, die read_file-Results auch externalisiert. Der Agent sah
   nur eine 400-Char-Vorschau. Der Hint *"Use read_file to re-read"* fuehrte
   ihn in den Cache zurueck (gleiche Vorschau).

2. **Streaming-Tool-Error verschluckt** -- 4 Provider (github-copilot, openai,
   chatgpt-oauth, kilo-gateway) emittieren bei JSON-Parse-Fehler im
   Tool-Argument-Stream einen `text`-Chunk mit `[Tool input parse error...]`.
   AgentTask wertet diesen Chunk NICHT als Tool-Failure -- der Mistake-Counter
   wird nicht inkrementiert, der Loop laeuft endlos. Anthropic + Bedrock
   machten es korrekt mit `tool_error`.

3. **edit_file-Schleife bei grossen Diffs** -- ein 6KB-`new_str` (komplette
   Synthese als JSON-Argument) bricht beim Streaming. Der Agent versucht es
   wiederholt, bekommt jeweils Parse-Fehler, ohne dass das Tool-System
   reagiert.

## Root Cause Analyse

### read_file-Externalization
ADR-63 schrieb urspruenglich *"read_file results NOT externalized"*. Die
Implementation-Note vom 2026-04-05 hat das ohne dokumentierte Begruendung
umgekehrt. Bei Files >2KB sah der Agent nur die Vorschau, der Re-Read landete
im Cache. Catastrophic loop fuer summarisierende Aufgaben.

### Provider-Streaming
Alle vier Provider hatten dieses Pattern:
```typescript
} catch (e) {
    yield {
        type: 'text',
        text: `[Tool input parse error for "${acc.name}": ${(e as Error).message}]`,
    } satisfies ApiStreamChunk;
    continue;
}
```

Anthropic + Bedrock benutzten korrekt:
```typescript
} catch (e) {
    yield {
        type: 'tool_error',
        id: tool.id,
        name: tool.name,
        error: `Tool input parse error: ${(e as Error).message}`,
    } satisfies ApiStreamChunk;
}
```

Der `tool_error`-Chunk wird in AgentTask.ts:588 als `is_error` registriert,
inkrementiert den Mistake-Counter, und beendet den Loop nach
`consecutiveMistakeLimit`.

### edit_file
Bei `old_str not found` lieferte die Fehlermeldung keinen Hint, wie bei grossen
Inserts vorzugehen. Der Agent versuchte denselben fragilen Ansatz wieder.

## Fix

**1. read_file aus Externalization rausgenommen** (`SKIP_EXTERNALIZATION` in
`ResultExternalizer.ts`). Auch `read_document` (gleiche Semantik). ADR-63 mit
Revision-Note vom 2026-04-29 versehen.

**2. MAX_CONTENT_CHARS in ReadFileTool** von 20k auf 50k erhoeht (Claude-Code-
parity, deckt typische 60-90 min Transcripts). Truncation-Hint *"Use search_files"*
nur bei >10% Overflow.

**3. Provider-Streaming auf tool_error umgestellt** -- alle vier Provider
emittieren jetzt einen `tool_error`-Chunk mit `id`, `name`, `error`. Der
AgentTask-Mistake-Counter greift, der Loop bricht nach
`consecutiveMistakeLimit`.

**4. edit_file-Fehlermeldung mit Tool-Routing-Hint** -- bei `new_str > 2000`
chars wird in der Fehlermeldung empfohlen, auf `write_file` oder `append_to_file`
umzuschwenken.

## Verifikation

- 949 Tests gruen nach Fix
- Re-Lauf der Meeting-Summary-Aufgabe: 25min/675k Tokens -> <60s/<30k Tokens
- `[HallucinationBrake]`-Console-Log greift bei Frontmatter-Halluzinationen
- Provider-Streaming-Loop terminiert sauber bei JSON-Parse-Fehlern

## Lessons Learned

- **ADR-Revisions muessen mit Begruendung dokumentiert werden.** Die
  Implementation-Note vom 2026-04-05 hat eine konzeptionell richtige
  Design-Entscheidung umgekehrt, ohne den Trade-off zu nennen.
- **Provider-Streaming-Code muss die gleichen Chunk-Types verwenden.** Vier
  Provider hatten denselben Bug, weil das Pattern aus dem ersten OpenAI-Provider
  ohne kritische Pruefung kopiert wurde.
- **Tool-Routing-Hints in Fehlermeldungen verhindern Schleifen.** Statt nur
  *"old_str not found"* sagt edit_file jetzt aktiv *"try write_file fuer grosse
  Inserts"*.
