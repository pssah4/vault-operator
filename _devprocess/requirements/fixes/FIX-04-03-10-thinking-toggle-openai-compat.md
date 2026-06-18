# FIX-04-03-10: Thinking-Toggle wirkt nicht auf OpenAI-kompatible lokale Backends (custom/ollama/lmstudio)

**Prioritaet:** P1 (User-Sichtbar, Issue [#44](https://github.com/pssah4/vault-operator/issues/44), Toggle ohne Wirkung)
**Datei:** `src/api/providers/openai.ts`
**Feature-Bezug:** EPIC-04 (Providers), FEAT-04-03 (OpenAI-kompatible Provider-Familie)
**Entdeckt:** 2026-06-18 (Issue #44, arkham000; gemeldet mit Qwen3 + Gemma3 ueber oMLX-Server)

---

## Problem

In v2.14.0 wurde der per-Conversation "Thinking on/off"-Toggle im Chat-Model-Picker eingefuehrt. Er funktioniert sauber fuer Anthropic, Bedrock, GitHub-Copilot und OpenRouter. Fuer die **OpenAI-kompatiblen lokalen Backends** (`config.type` in `{custom, ollama, lmstudio}`, also oMLX, vLLM, LM Studio, Ollama) hat der OFF-Toggle **keinen Effekt**: Qwen3 / Gemma3 / DeepSeek-R1 denken weiter, weil dem Server kein Disable-Mechanismus geschickt wird.

Reproduktion (aus Issue):
- Provider: Custom OpenAI-kompatibel, baseUrl auf oMLX (lokal).
- Model: `qwen3-*` oder `gemma3-*`.
- Im Chat-Picker Thinking auf OFF schalten.
- Beobachtet: Antwort enthaelt weiter `<think>...</think>`-Bloecke.
- Erwartet: keine Thinking-Bloecke.

## Root Cause Analyse

In [src/api/providers/openai.ts:283-284](../../../src/api/providers/openai.ts#L283-L284) ist der gesamte Thinking-Pfad auf OpenRouter gegated:

```ts
const openRouterThinking = this.config.type === 'openrouter'
    && (this.config.thinkingEnabled ?? false);
```

`this.config.thinkingEnabled === false` (aus dem Toggle) wird damit fuer `custom`/`ollama`/`lmstudio` nie ausgewertet. Im Request-Body landet **kein einziges Feld**, das dem Server sagt "denk nicht". Die Modelle benutzen ihren Default (Qwen3 und Gemma3 denken per Default).

## Auswirkung

- **Funktional:** Mittel. Antworten kommen zwar, aber mit unnoetigen Thinking-Tokens (Latenz + Token-Kosten bei kostenpflichtigen Backends).
- **UX:** Hoch. Der sichtbare Toggle suggeriert Kontrolle, die nicht existiert. User-Vertrauen sinkt.
- **Reichweite:** Alle lokalen Deployments (oMLX, Ollama, LM Studio, vLLM) und externe OpenAI-kompatible Server (DeepSeek, Fireworks, Together via custom-Typ).

## Loesungsansatz

### Kern-Design

Im OpenAI-Provider den Thinking-Toggle fuer den OpenAI-kompatiblen Local-Cluster (`custom`/`ollama`/`lmstudio`) honorieren, ueber zwei abgestufte Mechanismen, beide nur aktiv wenn `thinkingEnabled` **explizit** gesetzt ist (`true` oder `false`, nicht `undefined` — Default bleibt byte-identisch zu heute):

1. **Primaer: `chat_template_kwargs: { enable_thinking: <bool> }` als Extra-Body anhaengen.** Das ist die Qwen3-Konvention, die vLLM und MLX-LM (oMLX-Substrat) als Pass-Through respektieren. Server, die das Feld nicht kennen, ignorieren es als unknown property (OpenAI-Spec erlaubt extra fields).

2. **Fallback fuer Qwen-Modelle: `/no_think` (bei `false`) bzw. `/think` (bei `true`) wird an den System-Prompt geprefixt.** Das ist die offiziell dokumentierte Qwen-Methode fuer Server, die `chat_template_kwargs` **nicht** weiterreichen (z.B. Ollama bis heute, einige LM-Studio-Versionen). Detection per Model-Name-Regex `/qwen3?/i`. Erweiterbar wenn weitere Modell-Familien Inline-Tokens unterstuetzen.

3. **Bei `undefined`:** Nichts senden. Das schuetzt den heutigen Default und vermeidet Regressionen auf Backends, die strikt validieren.

Gemma3 lasst sich nicht zuverlaessig stillstellen; das gehoert in die Docs zum Toggle (siehe Out-of-Scope).

### Wire-Format Beispiele

**OFF + Qwen3:**
```json
{
  "model": "qwen3-32b",
  "messages": [{"role": "system", "content": "/no_think You are a helpful assistant."}, ...],
  "chat_template_kwargs": {"enable_thinking": false}
}
```

**OFF + DeepSeek-R1 (kein Qwen):**
```json
{
  "model": "deepseek-r1",
  "messages": [{"role": "system", "content": "You are a helpful assistant."}, ...],
  "chat_template_kwargs": {"enable_thinking": false}
}
```

**Toggle = follow (undefined):** Request byte-identisch zu heute, keine `chat_template_kwargs`, kein `/no_think`-Prefix.

### Was NICHT geaendert wird

- OpenRouter-Pfad (`openRouterThinking`) bleibt unberuehrt; OpenRouter hat seinen eigenen `reasoning`-Wrapper.
- Anthropic / Bedrock / GitHub-Copilot bleiben unberuehrt; die honorieren den Toggle bereits korrekt.
- `reasoning_effort`-Pfad fuer GPT-5 / o-Series bleibt unberuehrt; das ist die Effort-Steuerung, nicht das On/Off.
- Default-Verhalten bei `thinkingEnabled === undefined`: byte-identisch.

## Akzeptanzkriterien

1. Custom-Provider + Qwen3-Modell + `thinkingEnabled: false` → Request enthaelt `chat_template_kwargs.enable_thinking === false` UND System-Prompt beginnt mit `/no_think `.
2. Custom-Provider + Qwen3-Modell + `thinkingEnabled: true` → Request enthaelt `chat_template_kwargs.enable_thinking === true` UND System-Prompt beginnt mit `/think `.
3. Custom-Provider + Nicht-Qwen-Modell + `thinkingEnabled: false` → `chat_template_kwargs.enable_thinking === false`, System-Prompt **unveraendert**.
4. Custom-Provider + `thinkingEnabled` unset → kein `chat_template_kwargs`, System-Prompt unveraendert (byte-identisch zu heute).
5. Ollama / LM Studio analog zu Custom (gleiche Gate-Liste).
6. OpenAI / Azure / OpenRouter / Gemini → kein `chat_template_kwargs` (nicht in der Gate-Liste).
7. Bestehende Tests in `reasoning-effort.test.ts` bleiben gruen.

## Out-of-Scope

- Gemma3 hat keinen sauberen Disable-Mechanismus. Das wird im Toggle-Tooltip oder den User-Docs erwaehnt, aber nicht ueber einen weiteren Backend-Patch erzwungen.
- `/v1/responses`-Modelle (gpt-5 etc.) bleiben ueber `reasoning_effort` gesteuert.
- DeepSeek-R1 ohne Custom-Wrapper kann nicht zuverlaessig disabled werden (Modell denkt strukturell); die `chat_template_kwargs` werden trotzdem gesendet, der Server entscheidet.

## Tests

Neue Datei: `src/api/providers/__tests__/thinking-toggle-openai-compat.test.ts`. Sechs Tests entlang der Akzeptanzkriterien 1-6. Bestehende `reasoning-effort.test.ts` wird nicht modifiziert.

## Risiko

Niedrig. Aenderung ist additiv (extra Body-Feld + optional System-Prompt-Prefix), tritt nur bei explizit gesetztem `thinkingEnabled` auf, und nur fuer drei Provider-Typen. Strikte Backends, die unknown fields ablehnen, sind eine theoretische Restkategorie — gewichtet niedriger als der gemeldete Bug.
