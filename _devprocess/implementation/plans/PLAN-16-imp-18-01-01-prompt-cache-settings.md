---
plan-id: PLAN-16
title: IMP-18-01-01 Prompt Cache Settings UI -- Capability-Tabelle, Default-on, datengetriebene Visibility
refs:
  - IMP-18-01-01
  - FEAT-18-01
  - ADR-62 (Update 2026-05-09)
  - ADR-111
  - EPIC-18
  - GitHub Issue #313 pssah4/vault-operator-dev
created: 2026-05-10
branch: chore/imp-18-01-prompt-cache-settings
pair-id: sebastian-opus-4.7
---

# PLAN-16: IMP-18-01-01 Prompt Cache Settings UI

## 1. Kontext

ADR-111 (Proposed) entscheidet eine statische Capability-Tabelle als
Single Source of Truth fuer UI-Visibility und Provider-Code. Diese
Phase 1 implementiert die Tabelle plus den UI-seitigen Konsumenten und
den Default-Switch in der Settings-Konvertierung. Phase 2 (IMP-18-01-02)
folgt mit den Provider-Implementierungen (Bedrock cachePoint,
OpenAI cached_tokens, Kilo Gateway Passthrough).

Code-Audit 2026-05-10 hat zwei Annahmen bestaetigt und eine korrigiert:
- `ModelInfo` in `src/api/types.ts:26-30` bleibt unangetastet.
- `modelToLLMProvider()` in `src/types/settings.ts:261` ist die Default-Switch-Stelle.
- **Korrektur:** Bedrock-Modell-IDs in `MODEL_SUGGESTIONS` (constants.ts:110-127)
  haben Region-Prefix (`eu.anthropic.claude-*`, `us.anthropic.claude-*`),
  nicht das in plan-context vorgeschlagene `anthropic.claude-3-*`.

## 2. Tasks

### Task 1: Capability-Modul anlegen

**Create:** `src/api/capabilities.ts`
**Test:** `src/api/__tests__/capabilities.test.ts`

Inhalt:
- `CacheStyle` Type Union: `'anthropic-ephemeral' | 'bedrock-cachepoint' | 'openai-implicit' | 'passthrough' | 'none'`
- `CacheCapabilityEntry` Interface: `providerType`, `modelPattern` (string mit Wildcard), `supportsPromptCache`, `cacheStyle`, optional `notes`
- `CACHE_CAPABILITY_TABLE: ReadonlyArray<CacheCapabilityEntry>` mit ~17 Eintraegen
- `getCacheCapability(providerType, modelId): CacheCapabilityEntry` (pure function)
- Wildcard-Match: einfache Implementierung mit `*` als Glob (~10 Zeilen, keine Dependency)
- Conservative Default: `{ providerType, modelPattern: '*', supportsPromptCache: false, cacheStyle: 'none' }`

Initialbestand:
- anthropic: `claude-3-*`, `claude-haiku-*`, `claude-opus-*`, `claude-sonnet-*` -> ephemeral
- github-copilot: `claude-*` -> ephemeral, andere -> none
- bedrock: `eu.anthropic.claude-*`, `us.anthropic.claude-*`, `anthropic.claude-*` -> bedrock-cachepoint
- openai: `gpt-4o*`, `gpt-4.1*`, `o1*` -> openai-implicit, andere -> none
- kilo-gateway: `kilo/*` -> passthrough (Anthropic-Format), Wildcard-Default ebenfalls passthrough wegen `kilo/auto`-Routing
- chatgpt-oauth, ollama, lmstudio, gemini, openrouter, azure, custom: keine spezifischen Eintraege -> Default none

Tests (vitest):
- Pattern-Match: exakter Treffer, Wildcard-Treffer, kein Treffer
- Pattern-Reihenfolge: spezifischer vor generischer
- Lookup pro Provider: Anthropic Claude -> ephemeral, OpenAI gpt-3.5 -> none, Bedrock EU Claude -> cachepoint, Ollama -> none

### Task 2: Default-Switch in modelToLLMProvider()

**Modify:** `src/types/settings.ts:261`
**Test:** `src/types/__tests__/settings-prompt-cache.test.ts` (neu)

Aenderung Z. 261:
```typescript
// alt:
promptCachingEnabled: model.promptCachingEnabled,
// neu:
promptCachingEnabled: model.promptCachingEnabled !== false,
```

Effekt: undefined -> true, true -> true, false -> false.

Tests:
- `model.promptCachingEnabled === undefined` -> Provider liefert `true`
- `model.promptCachingEnabled === true` -> Provider liefert `true`
- `model.promptCachingEnabled === false` -> Provider liefert `false`

### Task 3: UI-Visibility datengetrieben

**Modify:**
- `src/ui/settings/ModelConfigModal.ts:152` (Init)
- `src/ui/settings/ModelConfigModal.ts:561` (Visibility)
- `src/ui/settings/ModelConfigModal.ts` Modell-Eingabefeld: bei Aenderung `updateFieldVisibility()` triggern

Aenderungen:

Z. 152: `formPromptCachingEnabled` Init: wenn `model.promptCachingEnabled === undefined`, dann an Capability-Tabelle koppeln (`supportsPromptCache ? true : false`); sonst gespeicherten Wert.

Z. 561: `getCacheCapability(p, this.formName).supportsPromptCache === false` als Visibility-Bedingung statt provider-spezifischer Strings. `isCopilotClaude`-Variable kann entfallen, weil das durch die Tabelle abgedeckt ist.

Modell-Eingabefeld (Quick-Pick + manueller Input): `addEventListener('change', () => updateFieldVisibility())`, damit Visibility bei Bedrock-Claude-vs-Bedrock-Nova korrekt umschaltet. Das Feld wird in der bestehenden buildForm() identifiziert und der Listener ergaenzt.

Manueller UI-Test nach Build+Deploy:
- Provider Anthropic -> Toggle sichtbar, Default an
- Provider OpenAI -> Toggle sichtbar (Modell gpt-4o), Default an
- Provider OpenAI mit gpt-3.5 -> Toggle versteckt
- Provider Bedrock + eu.anthropic.claude-* -> Toggle sichtbar, Default an
- Provider Bedrock + amazon.nova -> Toggle versteckt
- Provider Ollama -> Toggle versteckt

### Task 4: Tooltip + i18n

**Modify:**
- `src/i18n/locales/en.ts` (neuer Key nach Z. 1163)
- `src/ui/settings/ModelConfigModal.ts:458-466` (Tooltip an die Checkbox)

i18n-Key: `modal.modelConfig.promptCachingTooltip`
Text: "Prompt caching reduces input cost on repeated requests. Anthropic charges +25% on the first cache write, then -90% on every cache read. Net win after 2 iterations. Recommended on for typical agent sessions."

UI-Aenderung: `cacheChk` bekommt `attr: { type: 'checkbox', title: t('modal.modelConfig.promptCachingTooltip') }`.

### Task 5: Build, Deploy, Verifikation

- `npm run build` (tsc + esbuild) -> exit code 0
- `npm test` -> alle Tests gruen, neue Tests bestaetigt
- `npm run dev` (Watch mit Auto-Deploy)
- Manueller UI-Test (siehe Task 3)
- Live-Verifikation gegen Anthropic-Direct: Toggle sichtbar, Default an, Request enthaelt cache_control (mocked oder real)

## 3. Coverage Gate

| Akzeptanzkriterium | Task | Status |
|---|---|---|
| AC-1 Default-Verhalten (frische Config -> on, false -> off) | Task 2 | wird in Test 2 geprueft |
| AC-2 Capability-Flag fuer alle relevanten Provider/Modell-Patterns | Task 1 | Tabelle in capabilities.ts |
| AC-3 UI-Visibility datengetrieben | Task 3 | Capability-Lookup statt Provider-Strings |
| AC-4 Tooltip mit Cost-Hinweis sichtbar | Task 4 | i18n-Key + DOM-Attribut title |
| AC-5 Keine Regression bei nicht-cache-faehigen Providern | Task 3 | Toggle versteckt + nicht persistiert |

ADR-Alignment: ADR-111 Decision-Section (Option C statische Tabelle) wird durch Task 1 operationalisiert. ADR-62 bleibt durch keine Task beruehrt.

Code-Pfad-Verankerung: jeder Task nennt konkrete Files mit Pfad und Zeile.

Verifikations-Gates: Build (tsc + esbuild) und Test (vitest) sind in Task 5.

## Change Log

(append-only, jede mid-course Aenderung)

- 2026-05-10: Initial implementation, alle 5 Tasks am Stueck, keine Deviations vom Plan.

## Implementation Notes

**Cycle-Time:** 2026-05-10 (Plan + Implementation in einer Session, ca. 15 Minuten Coding nach 30 Minuten Architektur).

**Per-Task-Status:**

- Task 1 (Capability-Modul): `src/api/capabilities.ts` (neu, 105 Zeilen), `src/api/__tests__/capabilities.test.ts` (29 Tests gruen). Keine Deviations.
- Task 2 (Default-Switch): `src/types/settings.ts:265` (`promptCachingEnabled: model.promptCachingEnabled !== false`), `src/types/__tests__/settings-prompt-cache.test.ts` (4 Tests gruen). Frontmatter-Kommentar ueber dem Feld auf Default-on-Logik aktualisiert.
- Task 3 (UI-Visibility): `src/ui/settings/ModelConfigModal.ts`. 5 Stellen geaendert:
  - Z. 4 Import `getCacheCapability`
  - Z. 152-154 `formPromptCachingEnabled`-Init mit Capability-Default
  - Z. 320-323 `nameInputEl.input`-Listener immer triggert (statt nur fuer Copilot)
  - Z. 564-566 Visibility per `getCacheCapability(p, this.formName).supportsPromptCache`
  - Z. 856-861 Ollama-Browser triggert Visibility
  - Z. 902-907 Custom-Browser triggert Visibility
- Task 4 (Tooltip): `src/i18n/locales/en.ts:1164` neuer Key `promptCachingTooltip`. ModelConfigModal Z. 462-471 Checkbox bekommt `attr.title` mit i18n-Text.
- Task 5 (Build + Verify): `npm run build` exit 0 (tsc + esbuild), Auto-Deploy in iCloud-Vault. `npx vitest run` 1341/1341 gruen.

**Deviations:** keine.

**Wayfinder-Status:** `src/ARCHITECTURE.map` `cache-capability`-Zeile war bereits in der ARCH-Phase angelegt. Datei `src/api/capabilities.ts` existiert nun real, der bisherige orphan-Verdacht ist aufgehoben.

**Open Concern fuer /testing:** AC-3 (UI-Visibility) und AC-4 (Tooltip) wurden nur durch Build + Code-Inspektion bestaetigt, nicht durch Live-UI-Test im Obsidian. Empfohlener Test-Plan:
1. Settings -> Providers > Models -> "Add new model".
2. Provider durchklicken: Anthropic, OpenAI, Bedrock, Kilo Gateway, GitHub Copilot, Ollama, ChatGPT-OAuth.
3. Pro Provider Modell-IDs aus `MODEL_SUGGESTIONS` (constants.ts:48-134) und ein eigenes Modell-ID via Quick-Pick wechseln.
4. Erwartung: Toggle nur sichtbar wenn `getCacheCapability` true meldet, Default an, Tooltip beim Hover anzeigt Cost-Hinweis.
5. Live-Anthropic-Call: bestehender Mechanismus mit cache_control bleibt unveraendert (Anthropic-Provider-Code wurde nicht angefasst).

**Phase 2 Vorbereitung (IMP-18-01-02, nicht in dieser Session implementiert):**
- Token-Display fuer cached_tokens: nicht im Code recherchiert (nicht im Scope dieser Phase). Wird in IMP-18-01-02 ermittelt.
- Cost-Calc-Modul: nicht im Code recherchiert.
- Bedrock cachePoint-Implementation: erfordert AWS-SDK ContentBlock-Format, nicht im Scope.

