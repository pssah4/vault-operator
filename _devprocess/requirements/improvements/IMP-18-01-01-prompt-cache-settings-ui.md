---
id: IMP-18-01-01
feature: FEAT-18-01
epic: EPIC-18
adr-refs: [ADR-62, ADR-111]
plan-refs: []
depends-on: []
created: 2026-05-09
---

# IMP-18-01-01: Prompt Cache Settings UI -- Default-on und provider-agnostische Toggle-Visibility

**Prioritaet:** P1 (User-Erwartung aus Issue #313, kein akuter Bug, aber Default-Verhalten widerspricht ADR-62-Praemisse)
**Feature-Bezug:** FEAT-18-01 (Prompt Caching, Provider-agnostisch), EPIC-18 (Token-Kostenreduktion)
**Quelle:** [Issue #313](https://github.com/pssah4/obsilo-dev/issues/313), BA-12 Section 11
**Hypothesen aus BA:** H-313-1 (Default-on ist sicher), H-313-2 (ein Boolean-Capability-Flag genuegt)

## Problem

FEAT-18-01 hat Prompt Caching im Anthropic-Provider implementiert
(siehe [src/api/providers/anthropic.ts:60-90](../../../src/api/providers/anthropic.ts#L60-L90)),
aber das Settings-UI macht den Toggle nur fuer zwei spezifische
Provider-Strings sichtbar und der Default-Wert ist `false`. Konkret:

- **Default off:** Modal-Init in
  [src/ui/settings/ModelConfigModal.ts:152](../../../src/ui/settings/ModelConfigModal.ts#L152)
  setzt `formPromptCachingEnabled = false`. Bei Save wird `false` als
  `undefined` persistiert. User muss aktiv klicken, sonst ist auch bei
  Anthropic kein Caching aktiv. Das verletzt FEAT-18-01 SC-03 (Zero-
  Config, automatische Aktivierung bei kompatiblem Provider).
- **Hardcoded Provider-Visibility:** Die Visibility-Bedingung in
  [src/ui/settings/ModelConfigModal.ts:561](../../../src/ui/settings/ModelConfigModal.ts#L561)
  lautet `p !== 'anthropic' && !isCopilotClaude`. Andere
  cache-faehige Provider (Bedrock-Anthropic-Modelle, OpenAI, Kilo
  Gateway, OpenRouter) sehen den Toggle nie, obwohl Phase 2
  (IMP-18-01-02) sie bedienen wird.

Wirtschaftlicher Effekt: Anthropic-User profitieren erst nach
manuellem Klick. Bedrock-User koennen den Toggle gar nicht setzen,
sobald Phase 2 implementiert ist.

## Loesung

### 1. Default-Switch ohne Daten-Migration

`undefined` in `CustomModel.promptCachingEnabled` wird zur Laufzeit
als `true` interpretiert, sobald das Feld nicht explizit auf `false`
gesetzt ist. Konkret:

- `modelToLLMProvider()` in
  [src/types/settings.ts:261](../../../src/types/settings.ts#L261)
  liefert `model.promptCachingEnabled !== false` statt
  `model.promptCachingEnabled`.
- Der Anthropic-Provider liest `this.config.promptCachingEnabled`
  unveraendert (siehe Z. 60-90), bekommt also den effektiven Wert.
- Bestehende `data.json`-Configs ohne das Feld lesen sich automatisch
  als enabled. Keine Migration noetig.

User, die explizit `false` gespeichert haben (z. B. zum Sparen von
Cache-Write-Aufpreis), behalten ihren Wert.

### 2. Capability-Flag `supportsPromptCache` pro Modell

Neues Feld in der pro-Modell-Metadaten-Struktur (`ModelInfo` oder
aequivalent, je nachdem wo Provider-Capabilities heute liegen).
Default `false`. Pro Provider/Modell explizit gepflegt:

- **Anthropic:** alle Claude-3+ Modelle: `true`
- **GitHub Copilot (Claude-Modelle):** `true` (heute schon im UI sichtbar)
- **GitHub Copilot (Nicht-Claude-Modelle):** `false`
- **Bedrock (Anthropic-Modelle):** `true` (Vorbereitung fuer Phase 2)
- **OpenAI:** `true` fuer gpt-4o, gpt-4o-mini, gpt-4.1, o1-Familie (impliziter Cache, Tracking via cached_tokens in Phase 2)
- **Kilo Gateway / OpenRouter (Anthropic-Modelle):** `true` (Passthrough in Phase 2)
- **ChatGPT-OAuth, Gemini, Ollama, LM Studio, andere:** `false`

### 3. Toggle-Visibility an Capability-Flag knuepfen

`ModelConfigModal.ts:561` aendern: Visibility-Bedingung pruef
`supportsPromptCache` des aktuell ausgewaehlten Providers/Modells,
nicht mehr provider-spezifische Strings. Wenn `true`: Toggle sichtbar
und mit Default `true` initialisiert. Wenn `false`: Toggle bleibt
versteckt.

### 4. Tooltip mit Cost-Hinweis

Kurzer Tooltip-Text neben der Checkbox, in Englisch (UI-Standard
des Plugins):

> Prompt caching reduces input cost on repeated requests. Anthropic
> charges +25% on the first cache write, then -90% on every cache
> read. Net win after 2 iterations. Recommended on for typical agent
> sessions.

Der Text geht in `src/ui/settings/constants.ts` oder `i18n/locales/`,
wo Settings-Labels heute liegen.

## Akzeptanzkriterien

### AC-1 Default-Verhalten

- Frische Modell-Config (kein `promptCachingEnabled`-Feld in `data.json`)
  fuehrt bei Anthropic-Modell zu aktivem Caching im API-Call.
  Verifikation: Mock von `createMessage()`, Pruefung dass System
  Prompt mit `cache_control: { type: 'ephemeral' }` markiert ist.
- Bestehende Config mit explizitem `promptCachingEnabled: false`
  bleibt unveraendert (Cache aus). Verifikation: gleicher Test, Flag
  explizit auf `false`, kein cache_control im Request.

### AC-2 Capability-Flag

- `ModelInfo.supportsPromptCache` (oder aequivalentes Feld) existiert
  fuer alle in Section 2 genannten Provider/Modelle mit den
  spezifizierten Werten.
- Default `false` gilt fuer Provider/Modelle, die in Section 2 nicht
  explizit aufgefuehrt sind.

### AC-3 UI-Visibility

- Toggle in `ModelConfigModal` ist sichtbar genau dann, wenn der
  ausgewaehlte Provider/Modell `supportsPromptCache: true` hat.
- Bei verstecktem Toggle wird `promptCachingEnabled` weder gesetzt
  noch beim Save persistiert.
- Bei sichtbarem Toggle ist der initiale Checkbox-Zustand `true` fuer
  neue Modelle, fuer bestehende der gespeicherte Wert.

### AC-4 Tooltip

- Tooltip-Text erscheint per Hover oder per `aria-describedby` neben
  der Checkbox.
- Text deckt drei Punkte ab: was es tut, warum +25% Cache-Write,
  Default-Empfehlung.

### AC-5 Keine Regression bei nicht-cache-faehigen Providern

- Bei Provider mit `supportsPromptCache: false` (z. B.
  Ollama, LM Studio) ist kein Toggle sichtbar, kein
  `promptCachingEnabled`-Feld in der gespeicherten Config, und der
  API-Call enthaelt keinerlei cache_control-Marker.

## Definition of Done

- Code geliefert: Settings-UI, `modelToLLMProvider`, `ModelInfo`-Erweiterung.
- Unit-Tests fuer AC-1, AC-2, AC-5 (Mock-basiert).
- Manueller UI-Test (sichtbar/versteckt pro Provider, Tooltip-Anzeige).
- Build gruen (tsc + esbuild), Deploy in iCloud-Vault, kurze Live-
  Verifikation gegen Anthropic-Direct.
- Backlog-Row auf Done, Last-Change aktualisiert.
- Release Notes Entry: "Prompt Caching ist jetzt standardmaessig an
  bei allen Providern, die es unterstuetzen. Bestehende Konfiguration
  bleibt erhalten."

## Out-of-Scope

- Cache-TTL-Konfiguration via UI (z. B. OpenAI `prompt_cache_retention: "24h"`).
  Bleibt deferred (Phase 3, nicht Teil dieser Iteration).
- Globaler Plugin-Settings-Default (statt pro Modell). Verworfen in
  BA-12 Section 11.8 Alternative C.
- Migration der `data.json`-Configs auf explizites `true`. Verworfen
  in BA-12 Section 11.8 Alternative A.
- Anpassung des Anthropic-Providers selbst. Bleibt unveraendert.
- Provider-Implementierungen fuer Bedrock, OpenAI, Kilo Gateway,
  OpenRouter. Sind Scope von IMP-18-01-02.

## Risiken und Mitigation

- **Risiko:** User mit kostensensitivem Setup wird vom Default-on
  ueberrascht. **Mitigation:** Tooltip + Release Notes + Toggle bleibt
  pro Modell explizit setzbar.
- **Risiko:** Capability-Flag bei einem Modell falsch gepflegt
  (z. B. Bedrock-Llama markiert als `true`). **Mitigation:**
  Default-Wert konservativ `false`; nur explizit gelistete Modelle
  bekommen `true`.
