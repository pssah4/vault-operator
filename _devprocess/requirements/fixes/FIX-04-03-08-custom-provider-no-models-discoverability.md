# FIX-04-03-08: Custom-Provider ohne /v1/models -- manuelle Model-ID-Eingabe nicht entdeckbar

**Prioritaet:** P3 (UX-Polish, Issue #40, Plugin funktional voll bedienbar, nur Discoverability fehlt)
**Datei:** `src/i18n/locales/en.ts` (drei i18n-Strings im ModelConfigModal-Pfad)
**Feature-Bezug:** EPIC-04 (Providers), FEAT-04-03 (OpenAI-kompatible Provider-Familie)
**Entdeckt:** 2026-05-29 (Issue [#40](https://github.com/pssah4/vault-operator/issues/40))
**Geloest:** 2026-05-29 (Commit `3051f823`, in dev gemerged als `9b5b8ada`)

---

## Problem

Custom-Provider, deren OpenAI-kompatibles Backend keinen `/v1/models`-Katalog-Endpoint implementiert (eigene Hosts, manche chinesische LLM-Gateways, Self-hosted vLLM/TGI ohne Discovery-Plugin), liefen im Add-Model-Modal in eine Sackgasse:

- Refresh-Button (`fetchProviderModels`) feuert ein HTTP-GET auf `${baseUrl}/v1/models`, bekommt 404/501/HTML, Notice zeigt: *"Failed to fetch models: HTTP 404"*.
- Browse-Available-Button (`buildCustomBrowser`) zeigt im Fehlerfall: *"Cannot reach server: ... Check base URL and try again."*

Beide Texte impliziieren, der Provider sei nicht nutzbar. Das **Model ID**-Input-Feld dazwischen ist aber free-text und nimmt jeden String an — der Save-Pfad braucht keinen Katalog. Der manuelle Workaround existierte also schon, war aber aus der UI nicht ableitbar. User schliessen daraus, dass das Plugin den Provider nicht unterstuetzt, und oeffnen Issues statt die ID manuell einzutippen.

Reproduktion (aus Issue):
- Add Provider Type "Custom (OpenAI-compatible)", baseUrl irgendein Endpoint ohne `/v1/models`-Implementation, API-Key, Save.
- Add Model -> Refresh-Button -> Notice "Failed to fetch models".
- User-Konklusion: "kein Weg vorwaerts, ich muss ein Issue oeffnen".

## Root Cause Analyse

Reines UX-Problem im i18n-Layer. Code-Pfade waren bereits korrekt:

1. **Manueller Pfad existierte:** [`src/ui/settings/ModelConfigModal.ts:324-340`](../../../src/ui/settings/ModelConfigModal.ts#L324-L340) — Model-ID-Input ist free-text, `recommendedMaxTokens` wird bei Eingabe live aktualisiert, Save akzeptiert beliebige ID.

2. **Fehlermeldungen verschwiegen das:** [`src/i18n/locales/en.ts:1214, 1258, 1260`](../../../src/i18n/locales/en.ts#L1214) — `fetchFailed`, `noModelsUrl`, `serverUnreachable` enthielten keinen Hinweis auf das Model-ID-Feld direkt darueber.

3. **Fetch ist Convenience, nicht Pflicht:** `/v1/models` ist eine OpenAI-Konvention, kein Standard. vLLM, TGI, eigene Reverse-Proxies und mehrere chinesische LLM-APIs implementieren den Endpoint nicht oder schuetzen ihn separat. Plugin-seitig nicht behebbar.

## Auswirkung

- **Funktional:** Keine. Plugin ist voll bedienbar, sobald die ID manuell eingegeben wird.
- **UX:** Niedrig bis Mittel. Issue-Reporter (sichtbar via #40) gehen davon aus, der Provider sei nicht supported. Vermutete Dunkelziffer: User die einfach abbrechen.
- **Wirtschaftlich:** Niedrig. Betrifft nur die Power-User-Subgruppe, die selbst-hostet oder exotische Endpoints nutzt — die regulaeren Provider (Anthropic, OpenAI, OpenRouter, DeepSeek-direct, Ollama, LM Studio) liefern `/v1/models`.

## Loesungsansatz

Drei i18n-Strings angepasst, sodass jede Fehlermeldung explizit auf die manuelle Eingabe verweist.

| Key | Vorher | Nachher |
|---|---|---|
| `modal.modelConfig.fetchFailed` | "Failed to fetch models: {{error}}" | "... {{error}}. You can still enter the model ID manually in the field below." |
| `modal.modelConfig.noModelsUrl` | "No models found at this base URL." | "... If this endpoint does not implement /v1/models, just type the model ID into the Model ID field above and save." |
| `modal.modelConfig.serverUnreachable` | "Cannot reach server: {{error}}. Check base URL and try again." | "... If the endpoint does not implement /v1/models, type the model ID manually above and save." |

Bewusst nicht gemacht:
- **Kein neuer UI-Hint-Block.** Die Fehlermeldungen liegen exakt am Punkt der User-Verwirrung; ein zusaetzlicher Helper-Text unter dem Model-ID-Input wuerde fuer alle User Permanent-Noise erzeugen.
- **Keine Code-Aenderung an `fetchProviderModels`.** Throw-Verhalten bleibt; Fehler ist die richtige Antwort auf 404.
- **Keine DE-Locale-Aenderung.** Repo hat aktuell nur `en.ts`, andere Locales nicht vorhanden.

## Akzeptanzkriterien

### Code

- [x] `modal.modelConfig.fetchFailed` haengt manuellen Workaround-Hinweis an.
- [x] `modal.modelConfig.noModelsUrl` haengt manuellen Workaround-Hinweis an.
- [x] `modal.modelConfig.serverUnreachable` haengt manuellen Workaround-Hinweis an.
- [x] Keine anderen i18n-Strings angefasst (Translations-Drift vermeiden).
- [x] Build (tsc + esbuild) sauber.

### Tests

- Kein neuer Unit-Test geschrieben — Substring-Asserts auf i18n-Literals sind Anti-Pattern (triviale Tests, brechen bei jedem Wording-Refactor). Stattdessen Regression-Suite (volle vitest) ohne Delta-Failures gegen pre-fix-State verifiziert.

### Live-Verifikation

- [ ] Manueller UI-Check (User-seitig nach Plugin-Reload):
  - Add Custom Provider mit nicht antwortendem Base-URL -> Refresh -> Notice zeigt erweiterten Text.
  - Add Custom Provider mit nicht antwortendem Base-URL -> Browse-Available -> Inline-Box zeigt erweiterten Text.

## Out of Scope

- **DE-Locale.** Kein de-Strang im Repo, kein Bedarf in diesem Fix.
- **Andere Provider-Typen** (anthropic, openai, openrouter, gemini etc.). Die haben dokumentierte `/v1/models`-Endpoints; das Discoverability-Problem existiert nicht.
- **Auto-Detection: `/v1/models` nicht implementiert -> Refresh-Button verstecken.** Praeziseres Verhalten, aber 1-Request-Probe vor jedem Open des Modals ist Overkill. Erkannt-an-Fehler ist okay.

## Quellen

- Issue #40: https://github.com/pssah4/vault-operator/issues/40
- Branch: `fix/04-03-40-custom-provider-no-models-discoverability` (commit `3051f823`)
- Safe-merge auf dev: `9b5b8ada` (Backup-Tag `dev-backup` auf `85d72aa8`)
