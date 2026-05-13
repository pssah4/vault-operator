---
id: FIX-04-03-02
feature: FEAT-04-03
epic: EPIC-04
adr-refs: []
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# FIX-04-03-02: Temperature-Parameter-Inkompatibilitaet mit Claude Opus 4.7 + GPT-5.5

## Symptom

Issue [#34](https://github.com/pssah4/vault-operator/issues/34) (gemeldet von
@edding333). User waehlt eines dieser Modelle und bekommt direkt eine
400-Antwort:

- `claude-opus-4-7` (Anthropic): `'temperature' is deprecated for this model`
- `gpt-5.5` (OpenAI): `Unsupported value: 'temperature' does not support
  0.2 with this model. Only the default (1) value is supported.`

"Custom temperature" in den Settings auf 1.0 zu setzen behebt es nicht --
intern wird trotzdem ein Wert geschickt.

## Root cause

Drei Provider senden `temperature` unbedingt:

1. **`src/api/providers/anthropic.ts:148`** -- `Math.min(this.config.temperature
   ?? 0.2, 1.0)`. Bei Opus 4.7 reicht jeder Wert fuer den 400.
2. **`src/api/providers/openai.ts:204-212`** -- nur `^o[1-9]` matcht den
   o-Series Skip. GPT-5.x faellt durch -> 0.2-Default gesendet.
3. **`src/api/providers/bedrock.ts:186`** -- `temperature = this.config.temperature
   ?? 0.2`. Wenn Bedrock Opus 4.7 (eu.anthropic.claude-opus-4-7-v1) anbietet,
   wuerde derselbe 400 zurueck kommen.

Auch `kilo-gateway.ts` und `chatgpt-oauth.ts` senden temperature wenn config
gesetzt -- bei GPT-5.x am Codex/Kilo-Gateway ebenfalls Bruch.

## Fix

Neuer zentraler Helper in `src/types/model-registry.ts`:

```ts
export function modelSupportsTemperature(modelId: string): boolean {
    const normalized = normalizeModelId(modelId).toLowerCase();
    if (/^claude-opus-4-7\b/.test(normalized)) return false;
    if (/^gpt-5(\b|[.-])/.test(normalized)) return false;
    return true;
}
```

Normalisiert zuerst (OpenRouter `anthropic/claude-opus-4-7` und Bedrock
`eu.anthropic.claude-opus-4-7-v1` matchen die gleiche Regel). Liefert
`false` fuer Opus 4.7 und GPT-5.x.

Alle 5 Provider checken jetzt den Helper und lassen `temperature` weg
wenn `false`:

- `anthropic.ts`: `effectiveTemperature = undefined`, Spread `...(temp !==
  undefined ? { temperature } : {})`.
- `openai.ts`: existing `isOSeries`-Check um `|| !supportsTemperature`
  erweitert.
- `bedrock.ts`: `temperature = supportsTemperature ? ... : undefined`,
  conditional spread.
- `kilo-gateway.ts`: `(isOSeries || !supportsTemperature)`.
- `chatgpt-oauth.ts`: nur senden wenn `temperature !== undefined &&
  modelSupportsTemperature(...)`.

## Regression test

`src/types/__tests__/model-registry.test.ts` neuer describe-Block mit
5 Tests:

- Opus 4.7 direkt + mit Snapshot-Suffix `-20260415`
- Opus 4.7 ueber OpenRouter / Bedrock-Aliase
- GPT-5 family (5, 5.5, 5-turbo, openai/gpt-5.5)
- Older models (4.6, sonnet, haiku, gpt-4o, gpt-4.1) bleiben true
- Unknown local models (llama, qwen) bleiben true (sicherer Default)

## Status

Done 2026-05-13. 1490 Tests gruen (+5), tsc clean, build+deploy gruen,
lint clean fuer touched files (nur pre-existing warnings in
expandToolGroups + unsafe-regex unbeeinflusst). Live-Verifikation: User
mit Opus 4.7 oder GPT-5.5 startet eine Anfrage und bekommt jetzt eine
normale Antwort statt 400.
