# BUG-017: Anthropic API rejects history with orphaned tool_use blocks

**Prioritaet:** P0 (Blocker fuer v2.5.0 Public-Release, User-Sichtbar)
**Datei:** `src/core/AgentTask.ts` (history wird ohne Pre-Send Sanitization an `createMessage` uebergeben)
**Feature-Bezug:** EPIC-001 (Core Foundation), Querschnitt fuer alle Anthropic-basierten Provider
**Status:** Resolved in v2.5.0-beta.2 (commit pending)
**Entdeckt:** 2026-04-17 (User-Repro mit Excalidraw-Erstellung)

---

## Problem

Anthropic API meldet HTTP 400:

```
The model returned the following errors: messages.4: `tool_use` ids were
found without `tool_result` blocks immediately after: tooluse_eInqZMVPOvM0jwFbxYoUbn.
Each `tool_use` block must have a corresponding `tool_result` block in the
next message.
```

Tritt sichtbar bei Anthropic-Provider und Claude-via-Copilot auf. OpenAI ist
wegen lockerer Validierung weniger strikt, aber dieselbe Inkonsistenz fuehrt
auch dort frueher oder spaeter zu Folge-Problemen.

## Root Cause Analyse

Die Anthropic-API verlangt, dass jede `assistant`-Message mit einem `tool_use`
Block direkt von einer `user`-Message gefolgt wird, die einen `tool_result`
Block mit derselben `tool_use_id` enthaelt. Wenn diese Pairing-Regel verletzt
wird, lehnt der Server den gesamten Request ab.

In der bisherigen Implementierung wird `history` ohne Pre-Send-Validierung an
`this.api.createMessage(systemPrompt, history, tools, abortSignal)` uebergeben.
Es existiert nur eine sehr lokale Sanitization (Zeile 902-917 im error
handler), die orphan-assistant-Nachrichten **nach einem geworfenen Error**
entfernt. Das deckt aber nicht alle Quellen ab.

## Wahrscheinliche Quellen fuer Orphans

1. **Stream-Abbruch zwischen assistant-push und tool-execution.** AgentTask
   pusht die assistant-message mit allen toolUses BEVOR die Tools ausgefuehrt
   werden. Wenn ein abort/network-error mittendrin kommt, sind tool_uses
   ohne tool_results in der history. Catch-Block raeumt auf, aber nicht
   immer (Zeile 902-917 trifft nur auf die letzte Nachricht).
2. **Mid-Conversation Crash + Resume.** ConversationStore speichert die
   history ohne Pairing-Validierung. Beim Reload ist sie inkonsistent und der
   erste API-Call wird abgelehnt.
3. **Concurrent abort waehrend Tool-Execution.** abortSignal kann mitten in
   der validToolUses-Schleife greifen und den Loop unterbrechen, sodass
   Folge-tool_uses ohne tool_results bleiben.
4. **Edge-Cases im FastPath / Fast-Path-Disable Wechsel.** ResultExternalizer
   wird in Fast-Path Stage 2 deaktiviert und re-enabled. Wenn ein Fehler
   dazwischen geworfen wird, koennten history-States divergieren.

## Auswirkung

- **Funktional:** Hoch. Sobald ein Orphan in der history ist, ist die gesamte
  weitere Konversation tot. User muessen die Session loeschen / neue
  Konversation starten.
- **UX:** Sehr hoch. Fehlermeldung ist technisch und gibt dem User keinen
  Handlungsweg.
- **Vertrauen:** Sehr hoch. Wirkt wie ein Random-Crash mitten in der
  produktiven Arbeit.

## Fix

Defensive Pre-Send Sanitization. Neuer Helper
`src/core/utils/sanitizeHistoryForApi.ts` entfernt vor jedem API-Call:

- assistant `tool_use` Blocks ohne irgendwo spaeteres `tool_result`
- user `tool_result` Blocks ohne irgendwo davor liegendes `tool_use`
- nach-bereinigung leer gewordene Messages

`AgentTask.ts` ruft den Helper an allen drei `createMessage`-Stellen auf
(main loop, hard-limit recovery, condensing). Loggt eine Warnung wenn etwas
gedroppt wurde, damit wir in der Console sehen koennen ob die Quellen
weiterleben.

Die bestehende Condensing-Pairing-Logik (Zeile 1082-1143) bleibt erhalten —
der neue Helper ist orthogonal.

## Verifikation

1. Unit-Test `src/core/utils/__tests__/sanitizeHistoryForApi.test.ts`:
   7 Faelle, alle gruen.
2. Build und 326/326 Tests gruen.
3. Live-Repro nicht reproduzierbar ohne kompletten Ablauf-Trace.
4. Smoke-Test: Konversation starten, Tool aufrufen, mid-execution
   abbrechen (X-Button), neue Nachricht senden -> Konversation laeuft
   weiter ohne 400.
