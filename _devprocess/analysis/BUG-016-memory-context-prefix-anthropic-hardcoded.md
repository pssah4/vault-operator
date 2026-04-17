# BUG-016: Memory-Extractor und Context-Prefix-Generator retry-spammen bei permanenten Provider-Errors

**Prioritaet:** P2 (war Kandidat fuer Wave 1, verschoben; Wave 2 resolved)
**Datei:** `src/core/memory/ExtractionQueue.ts`, `src/core/semantic/SemanticIndexService.ts`
**Feature-Bezug:** EPIC-003 (Memory & Context), EPIC-015 (Knowledge Layer)
**Entdeckt:** 2026-04-17 in Wave-1 Smoke-Tests (Plugin-Reload-Logs auf einem Vault mit Copilot als Default-Provider)
**Status:** Resolved in Wave 2 (branch `feature/community-wave-2`)
**Korrektur zur ersten Analyse:** Es gibt kein Anthropic-Hardcoding im Code. Die Memory-Extraktion und Contextual-Retrieval nutzen jeweils ein konfigurierbares Modell (`memoryModelKey`, `contextualModelKey`) via `buildApiHandlerForModel`. Der beobachtete Fehler kam daher, dass der User ein Anthropic-Modell konfiguriert hatte OHNE Credits -- das Plugin hat jedes pending Queue-Item einzeln retried und jedes Mal den 400-Fehler geloggt.

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

## Fix (Wave 2)

Defensive error handling statt Architektur-Refactor:

1. **`src/core/memory/ExtractionQueue.ts`**: Helper `isPermanentProviderError(e)`
   erkennt HTTP 401/402/403 sowie bekannte 400-Muster (`credit balance is too low`,
   `insufficient quota`, `authentication failed`, `invalid api key`). Beim ersten
   permanent-error wird die Queue fuer die Session disabled (`sessionDisabledReason`),
   eine einzige Warnung geloggt, die Queue bleibt intakt fuer den naechsten
   Plugin-Reload.
2. **`src/core/semantic/SemanticIndexService.ts`**: Gleiche Logik inline im
   `generateContextPrefix`-catch-Block, setzt `contextualApiDisabledReason`.
   Folge-Aufrufe short-circuiten auf null.

Ergebnis: Ein einziger Warn-Log pro Session statt mehrerer 400er bei jedem
Plugin-Reload. User bekommt klare Handlungsanweisung
("Fix the configured memory model in Settings, reload Obsidian").

## Verifikation

- 4 neue Unit-Tests in `ExtractionQueue.test.ts`:
  - 401 stoppt die Queue nach dem ersten Versuch
  - "credit balance is too low" (Anthropic-Muster, status 400) wird als permanent erkannt
  - Transient errors (timeout, network) setzen disable NICHT
  - Re-Entry-Guard: zweiter `processQueue` nach disable ruft den Processor nicht auf
- Full suite: 333/333 pass
- Live-Verifikation pending: Plugin reload, Console sollte maximal 1 Warn-Line zeigen
