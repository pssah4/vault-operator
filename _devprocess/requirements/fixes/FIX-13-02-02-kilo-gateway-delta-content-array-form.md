---
id: FIX-13-02-02
feature: FEAT-13-02
epic: EPIC-13
adr-refs: []
plan-refs: []
depends-on: [FIX-13-02-01]
created: 2026-05-31
---

# FIX-13-02-02: Kilo Gateway droppt Claude-via-Gateway delta.content im Array-Form

## Symptom

Code-Review 2026-05-31 (xhigh focused, PLAUSIBLE): KiloGateway liest delta.content strikt als String. Falls der Gateway -- aehnlich wie Copilot fuer Claude-Tier -- delta.content als `[{type:'text', text:'Hello'}]`-Array durchreicht, wird Text gedroppt und der User sieht eine leere Antwort, obwohl der Gateway Completion-Tokens billed.

Trigger nicht live verifiziert, aber: Github Copilot zeigt das Verhalten dokumentiert fuer Claude-via-OpenAI-Shim ([github-copilot.ts:97-109](src/api/providers/github-copilot.ts#L97-L109)). Kilo Gateway ist OpenAI-kompatibel und routet auf Claude-Tiers. Verhalten ist Upstream-abhaengig, also defensiv normalisieren ist guenstiger als die Fehlersuche live nachzuholen.

## Cause

[src/api/providers/kilo-gateway.ts:169](src/api/providers/kilo-gateway.ts#L169):

```ts
const text = typeof delta?.content === 'string' ? delta.content : null;
```

Strict typecheck, kein Fallback fuer Array-Form. Im Gegensatz dazu Copilot:

```ts
// github-copilot.ts:97-109
function normalizeDeltaContent(content: unknown): string | null {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .filter((c) => c && typeof c === 'object' && (c as { type?: string }).type === 'text')
            .map((c) => (c as { text?: string }).text || '')
            .join('');
    }
    return null;
}
```

## Fix

1. `normalizeDeltaContent` aus github-copilot.ts in ein shared Utility verschieben (z.B. `src/api/providers/utils/openAiContent.ts`).
2. Beide Provider (github-copilot, kilo-gateway) nutzen den shared Helper.
3. Verhalten: String -> as-is, Array of text-blocks -> joined string, sonst -> null (gedroppt wie bisher).

## Regression test

In `src/api/providers/__tests__/openAiContent.test.ts` (neu):

- **string passthrough:** `normalizeDeltaContent('Hello')` -> `'Hello'`.
- **array of text blocks:** `[{type:'text',text:'A'},{type:'text',text:'B'}]` -> `'AB'`.
- **array mixed types:** `[{type:'text',text:'A'},{type:'image',...}]` -> `'A'` (text only).
- **non-string non-array:** `{}` / `null` / `undefined` -> `null`.

In `kilo-gateway.test.ts`: Stream-Test mit `delta.content` im Array-Form -> Provider emittiert text chunk.

## How tested

1. Vitest gruen.
2. Live-Verifikation bei Bedarf via raw chunk capture auf Claude-Tier des Kilo Gateways.
