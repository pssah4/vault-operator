---
id: FIX-24-09-01
feature: FEAT-24-09
epic: EPIC-24
adr-refs: [ADR-116]
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# FIX-24-09-01: skill-directory wird durch ueberlappenden Onboarding-Guard versteckt

## Symptom

Im Live-Messlauf MESSLAUF-EPIC-24-2026-05-13 Test 1c antwortet das Modell:

> "Ich habe aktuell keine Skills in meinem SKILLS-Verzeichnis geladen --
> das bedeutet, es wurden noch keine persistenten Skills angelegt oder
> sie sind nicht im System-Prompt sichtbar."

Trotzdem loggt das Plugin beim Start:

```
[SelfAuthoredSkillLoader] Loaded 16 skill(s)
```

Das `[SystemPrompt]`-Section-Char-Breakdown-Log zeigt `skill-directory`
nicht in den Top-8-Sections.

Folgen:
- SC-2.3 aus FEAT-24-09 (Modell laedt eine Skill bei passender Aufgabe)
  kann nicht greifen.
- Test 1 Teil A: bei "Erstelle eine Praesentation" wird kein
  `read_skill({ name: "office-workflow" })` gerufen.
- Plugin-Skills via VaultDNA (Section 9) sind ebenfalls betroffen
  (`pluginSkillsSection` nutzt denselben Guard).

## Root cause (kausale Kette)

1. `data.json`: `onboarding.completed = false`, `onboarding.currentStep = "backup"`.
   Sebastian hat den Onboarding-Wizard 2026-02-27 bei "backup"-Step
   verlassen und das Plugin seither produktiv genutzt (Models
   konfiguriert, Chats, Memory aufgebaut).
2. `AgentSidebarView.ts:2198`:
   `const isOnboarding = !this.plugin.settings.onboarding.completed;`
   ist `true`.
3. `AgentSidebarView.ts:2200`:
   `if (!isOnboarding) { skillDirectorySection = await this.buildSkillDirectory(allowedSkillNames); }`
   ueberspringt den Aufbau. `skillDirectorySection` bleibt `undefined`.
4. `AgentSidebarView.ts:2225`:
   `const pluginSkillsSection = isOnboarding ? undefined : ...;`
   bleibt analog `undefined`.
5. `task.run({ ..., skillDirectorySection: undefined ... })`.
6. In `systemPrompt.ts:216` `getSkillDirectorySection(undefined)` returnt
   leeren String. Section 8b (skill-directory) erscheint nicht im Prompt.

Semantisches Problem: `onboarding.completed === false` bedeutet streng
genommen "der User hat den Wizard nie zu Ende gemacht". Das ist NICHT
identisch mit "der User ist gerade im Wizard-Flow". Sebastian's Fall
zeigt beide Bedeutungen entkoppelt: Wizard wurde nie completet, aber
Plugin wird produktiv genutzt.

## Fix

Neue pure-Helper-Funktion `isActiveOnboardingFlow(settings)` in
`src/core/onboarding-status.ts`. Heuristik:

```
isActiveOnboardingFlow = !settings.onboarding.completed
                        && settings.activeModels.length === 0
```

Begruendung: ein User, der das Plugin produktiv nutzt, hat mindestens
ein Modell konfiguriert. Wer `completed=false` UND keine activeModels
hat, ist tatsaechlich noch im First-Time-Wizard.

`AgentSidebarView.ts:2198` + `:2225` nutzen die neue Funktion statt
direkter Settings-Inspektion. Andere Aufrufer von `onboarding.completed`
(OnboardingService.needsOnboarding, OnboardingFlow.ts, UpdateSettingsTool)
bleiben unangetastet -- die haben einen anderen Use-Case (z.B. "muessen
wir Onboarding noch anbieten?", was eine andere Frage ist).

## Regression test

Pure-Function-Test in `src/core/__tests__/onboarding-status.test.ts`:

- `completed=true` -> `false` (offensichtlich)
- `completed=false`, `activeModels=[]` -> `true` (first-time)
- `completed=false`, `activeModels=[X]` -> `false` (Wizard abgebrochen,
  Plugin produktiv) -- das ist Sebastian's Fall
- `completed=true`, `activeModels=[]` -> `false` (User hat Wizard
  completet aber alle Models entfernt -- Edge-Case, aber konsistent)

Manuelle Verifikation: Sebastian fuehrt MESSLAUF Test 1c nochmal aus
nach dem Fix. Erwartung: Modell listet jetzt die 16 Skills.

## Status

Done 2026-05-13 (commit folgt im phase-end auf
`fix/fix-24-09-01-skills-onboarding-guard`).

**Verifikation:** `npm test` 1472 gruen (+5 vs 1467: 5 neue
`onboarding-status.test.ts`-Tests, davon einer der explizit Sebastian's
Fall pruft -- `completed=false` UND `activeModels=[X]` -> `false`).
`npx tsc -noEmit -skipLibCheck` clean. `npm run lint` 0 errors.
`npm run build` gruen (Bundle in NexusOS-Vault aktualisiert).

**Manuelle Live-Verifikation noch ausstehend:** Sebastian fuehrt
MESSLAUF Test 1c nach Plugin-Reload nochmal aus. Erwartung: Modell
listet die 16 geladenen Skills statt "keine Skills im SKILLS-Verzeichnis"
zu antworten.
