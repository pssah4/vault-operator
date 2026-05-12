# BUG-015: GitHub Copilot Provider lehnt max_tokens fuer neuere Modelle ab

**Prioritaet:** P1 (Kurzfristig, blockiert Copilot-Modelle wie gpt-5, gpt-5-codex, o4-mini)
**Datei:** `src/api/providers/github-copilot.ts`
**Feature-Bezug:** FEAT-12-06 (Copilot Modern Model Compatibility) in EPIC-12
**Entdeckt:** 2026-04-15 (Community Issue #28)
**Issue:** https://github.com/pssah4/vault-operator/issues/28

---

## Problem

Beim Aufruf eines GitHub-Copilot-Modells aus dem Sidebar-Chat wirft der Server:

```
Copilot request error: 400 Unsupported parameter: 'max_tokens' is not supported with this model.
Use 'max_completion_tokens' instead. The model may require policy acceptance at github.com.
```

OpenRouter-Modelle funktionieren fuer denselben User. Das Issue ist Copilot-spezifisch.

## Root Cause Analyse

`src/api/providers/github-copilot.ts:170` setzt `max_tokens: effectiveMaxTokens` im Request-Body:

```typescript
const requestBody: Record<string, unknown> = {
    model: this.config.model,
    messages: openAiMessages,
    tools: openAiTools,
    temperature: ...,
    max_tokens: effectiveMaxTokens,
    stream: true,
    ...
};
```

`src/api/providers/openai.ts:227-251` hat die Loesung bereits implementiert:

```typescript
max_tokens: (this.config.type !== 'azure' && this.config.type !== 'openai')
    ? maxTokens
    : undefined,
max_completion_tokens: (this.config.type === 'openai' || this.config.type === 'azure')
    ? maxTokens
    : undefined,
```

Der Copilot-Provider wurde aber als eigene Klasse implementiert (vor der OpenAI-Refaktorierung) und hat das Branching nicht uebernommen. Da Copilot Modelle wie gpt-5, o3 und o4-mini transparent durchroutet, gilt fuer Copilot-Requests dieselbe Regel: `max_completion_tokens` fuer neuere Modelle.

## Kausale Kette

1. User waehlt Copilot-Modell (z.B. gpt-5) im Modell-Dropdown.
2. AgentTask ruft `CopilotProvider.createMessage(...)`.
3. Request-Body enthaelt `max_tokens`.
4. Copilot-Gateway routet zum OpenAI-Backend.
5. OpenAI-Backend lehnt `max_tokens` ab (HTTP 400).
6. CopilotProvider's enhanceError gibt die Fehlermeldung an den User zurueck.
7. User sieht "Use max_completion_tokens instead" und kann nichts dagegen tun.

## Auswirkung

- **Funktional:** Hoch fuer Copilot-User. Nahezu alle Modelle, die ueber Copilot interessant sind (gpt-5-Familie, o4-mini, claude-3-5-sonnet), sind betroffen.
- **Vertrauen:** Hoch. EPIC-12 wurde als P0 aufgesetzt um GitHub-Copilot als Erstklass-Provider anzubieten. Der Bug widerspricht dem Werteversprechen.

## Fix-Richtung

Das Branching aus `openai.ts` in `github-copilot.ts` uebernehmen. Sauberer waere, beide Provider auf eine gemeinsame Basis-Klasse oder Helper-Funktion zu konsolidieren, aber das ist Wave 2.

Variante A (kurzfristig, wenig Risiko):
```typescript
const usesNewParam = isModernCopilotModel(this.config.model);
const requestBody: Record<string, unknown> = {
    model: this.config.model,
    messages: openAiMessages,
    tools: openAiTools,
    temperature: ...,
    ...(usesNewParam
        ? { max_completion_tokens: effectiveMaxTokens }
        : { max_tokens: effectiveMaxTokens }),
    stream: true,
    ...
};
```

Da Copilot keine stabile Liste der "neuen Modelle" exposed, ist die robusteste Heuristik: immer `max_completion_tokens` senden. Die alten Modelle (gpt-3.5-turbo, gpt-4-turbo) akzeptieren beide Parameter, die neuen Modelle nur den neuen. Wir muessen pruefen, ob das Copilot-Gateway `max_completion_tokens` fuer alle Modelle akzeptiert.

Variante B (defensiv): On-Error-Retry. Wenn HTTP 400 mit "Use max_completion_tokens" zurueckkommt, einmal mit umgebenanntem Parameter retryen. Das ist robust, aber braucht eine Round-Trip Latenz im Fehlerfall.

Empfehlung: Variante A (immer `max_completion_tokens`), mit Smoke-Test gegen alle in der Modell-Liste enthaltenen Copilot-Modelle.

## Verifikation

- Smoke-Test gegen Copilot mit gpt-5, gpt-5-codex, o4-mini, claude-sonnet (live, in `runTest()`).
- Manueller Chat-Test in der Sidebar mit dem Default-Copilot-Modell.
- Regression: gpt-3.5-turbo (ueber Copilot, falls noch supported) muss weiter funktionieren.
