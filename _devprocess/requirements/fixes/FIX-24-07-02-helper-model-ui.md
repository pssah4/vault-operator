---
id: FIX-24-07-02
feature: FEAT-24-07
epic: EPIC-24
adr-refs: [ADR-115]
plan-refs: []
audit-refs: []
depends-on: [FIX-24-07-01]
created: 2026-05-13
---

# FIX-24-07-02: helperModelKey UI-Lücke -- nicht via Settings setzbar

## Symptom

FEAT-24-07 fuehrte `helperModelKey` als Top-Level-Setting ein, damit User
ein guenstiges Helper-Modell (z.B. Haiku) fuer interne Calls
(Condensing, Fast-Path, plan_presentation, RecipePromotion) konfigurieren
koennen. Aber: das Setting tauchte nirgends im Settings-UI auf. Setzbar
nur via:

- `update_settings`-Tool durch den Agent (ging erst seit FIX-24-07-01)
- `data.json` direkt editieren

Fuer normale User unzumutbar. Live entdeckt waehrend MESSLAUF Test 4 Setup:
Sebastian fragte "Wie wird das bei allen anderen Usern gesetzt?".

## Root cause

`memoryModelKey` hat seine eigene UI-Sektion in `MemoryTab.ts:141-163`
(Pattern: Dropdown mit `activeModels.filter(m => m.enabled)`). Beim
Einbau von `helperModelKey` (FEAT-24-07 /coding) wurde die analoge
UI-Sektion vergessen. Es gibt nur die Setting-Definition in
`types/settings.ts`, den Getter in `main.ts` und den Consumer in
`helper-api.ts`. Keine Editor-Surface.

## Fix

Neue Sektion `Helper model` am Ende von `LoopTab.ts` (nach Power
Steering / Max Sub-Agent Depth):

- Heading `settings.loop.headingHelperModel`
- Dropdown mit allen enabled `activeModels`, plus Default-Option
  "Use main model" (leerer String).
- `setName`: "Model for internal calls"
- `setDesc`: erklaert die vier Consumer (condensing / fast-path /
  presentation planning / recipe promotion) + Default-Verhalten.

Begruendung fuer LoopTab als Ort: condensing ist der prominenteste
Consumer (passt zu `settings.loop.headingCondensing` daneben). Fast-Path
und RecipePromotion sind ebenfalls Loop-naehe Themen. `MemoryTab` waere
zwar konsistent mit `memoryModelKey`, aber Helper hat nichts mit Memory
zu tun -- nur die Audience ist die gleiche ("cheap fast helper model").

i18n: 4 neue Keys in `en.ts`:

- `settings.loop.headingHelperModel`
- `settings.loop.helperModelSelect`
- `settings.loop.helperModelSelectDesc`
- `settings.loop.helperModelDefault`
- `settings.loop.noModels` (Fallback wenn `activeModels` leer)

## Regression test

Manueller Live-Check:

1. Open Vault Operator settings -> Agent behaviour / Loop tab.
2. Scroll nach unten zu "Helper model" -> Dropdown sichtbar mit allen
   enabled Models + "Use main model"-Default.
3. Auswahl -> `data.json.helperModelKey` aktualisiert.

Kein automatischer Test, weil die UI-Pflichten in diesem Repo bisher
nicht testabgedeckt sind (kein jsdom-Setup fuer Obsidian-Settings).

## Status

Done 2026-05-13. 1477 Tests gruen (kein Delta -- reine UI-Ergaenzung).
lint 0 errors, tsc clean, build erfolgreich, deployed.
