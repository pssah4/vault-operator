# BUG-016: Memory-Extractor und Context-Prefix-Generator nutzen Anthropic SDK direkt statt konfigurierten Provider

**Prioritaet:** P2 (Mittelfristig, nicht in Wave 1)
**Datei:** Wahrscheinlich `src/core/memory/ExtractionQueue.ts` (oder MemoryService) und `src/core/semantic/SemanticIndexService.ts`
**Feature-Bezug:** EPIC-003 (Memory & Context), EPIC-015 (Knowledge Layer)
**Entdeckt:** 2026-04-17 in Wave-1 Smoke-Tests (Plugin-Reload-Logs auf einem Vault mit Copilot als Default-Provider)

---

## Problem

Beim Plugin-Load wirft die Console wiederholt:

```
[Memory] Extraction failed for 2026-04-16-f45212 (type=session), will retry on next startup:
  BadRequestError: 400 ... Your credit balance is too low to access the Anthropic API ...

[SemanticIndex] Context prefix generation failed:
  BadRequestError: 400 ... Your credit balance is too low to access the Anthropic API ...
```

Der User hat aber GitHub Copilot (Sonnet 4.6) als Default-Provider eingestellt
(`[Plugin] API handler initialized: GitHub Sonnet 4.6 (github-copilot)`).
Es gibt keinen Anthropic-Key, der Anthropic-Pfad scheitert daher
deterministisch.

## Vermutete Root Cause

Die Memory-Extraction-Pipeline und der Semantic-Index Context-Prefix-Generator
instanziieren `Anthropic` direkt statt den vom User konfigurierten ApiHandler
zu verwenden. Das ist vermutlich ein Erbe aus der Phase, in der Anthropic
der einzige Provider war.

## Auswirkung

- Funktional: Niedrig (Memory-Extraktion und Contextual-Retrieval-Prefix
  werden uebersprungen, der Hauptloop laeuft weiter).
- UX: Mittel (jeder Reload spammt 4-6 Error-Logs, wirkt wie ein kaputter Plugin).
- Vertrauen: Hoch (jeder neue User mit einem Nicht-Anthropic-Provider sieht
  die Fehler beim ersten Start).

## Fix-Richtung

1. Identifizieren wo Anthropic SDK direkt instanziiert wird (Memory-Pipeline + SemanticIndex).
2. Ersetzen durch Aufruf via `plugin.apiHandler` (oder einen leichtgewichtigen Helper
   `getCompletionProvider(plugin)`).
3. Wenn der Provider nicht antwortet (z.B. embedding-only Provider), graceful
   Skip statt Stack-Trace.

## Wave-Zuordnung

NICHT Wave 1 (Community-Feedback). Kommt in Wave 2 oder spaeter, wenn jemand
die Memory-Pipeline ohnehin anfasst. Bis dahin: das Verhalten ist nervig aber
nicht funktional kritisch.

## Verifikation

- Memory-Extraction laeuft mit Copilot, OpenAI, OpenRouter und Gemini erfolgreich.
- Context-Prefix-Generator laeuft mit jeder Provider-Wahl.
- Console beim Plugin-Load: 0 Anthropic-bezogene Errors fuer User ohne Anthropic-Key.
