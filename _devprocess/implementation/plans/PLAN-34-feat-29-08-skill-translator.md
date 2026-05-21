---
id: PLAN-34
title: FEAT-29-08 Skill-Translator-Builtin (Dry-Run + Mapping + Translation + Modal + TaskRouter)
date: 2026-05-21
feature-refs: [FEAT-29-08]
adr-refs: [ADR-127, ADR-75, ADR-126]
fix-refs: []
imp-refs: []
pair-id: 34
---

# PLAN-34 -- FEAT-29-08 Skill-Translator-Builtin

> Backlog row: `_devprocess/context/BACKLOG.md` -> PLAN-34
> (status, phase, last-change, claim leben dort).

## Context

Vault Operator hat keine Python-Runtime, aber Anthropic veroeffentlicht Skills mit Python-Skripten (pdf, pptx, docx, xlsx, json). Damit der User diese Skills in seinem Vault nutzen kann, brauchen wir einen Translator-Builtin-Skill der Python-Skripte gegen eine versionierte Mapping-Tabelle prueft, das Frontier-Modell zur Code-Konversion nutzt, ein User-Modal vor Schreiben zeigt wenn die Translation partial ist, und das Ergebnis als nativer Skill speichert.

Vor Schreiben laeuft ein Dry-Run-Pass: Imports werden analysiert und gegen Mapping geprueft. Nur wenn alles mappbar ist ODER der User explizit partial-translation akzeptiert, wird die Translation durchgefuehrt. Cancel-Pfad verweist auf skill-creator als from-scratch-Alternative.

## Tasks

### Task A: mapping.json + Schema

Versionierte Python-zu-JS-Mapping-Tabelle als references/mapping.json im Translator-Skill-Folder.

Files:
- Create `bundled-skills/skill-translator/references/mapping.json`
- Schema: `{ version, updated, modules: { "python_import": { "js_equivalent", "via", "notes", "limitations[] } } }`
- Initial-Eintraege: stdlib (json, os, sys, re, datetime), Office-Libs (pdfplumber, python-pptx, python-docx, openpyxl), util (numpy basics, pandas basics)
- "via" Werte: `npm`, `built-in-tool`, `unmappable`

### Task B: dry-run.js + Tests (RED-First)

Script unter scripts/dry-run.js, ueber run_skill_script aufrufbar.

Files:
- Create `bundled-skills/skill-translator/scripts/dry-run.js`
  - `execute({ skillPath })` reads SKILL.md + alle scripts/*.py
  - extract imports via regex (`import X`, `from X import Y`)
  - lookup gegen mapping.json
  - Returns `{ status: "full" | "partial" | "unmappable", mappable[], partial[], unmappable[] }`
- Create `bundled-skills/skill-translator/scripts/__tests__/dry-run.test.js` (vitest unit-tests for the analysis logic)

### Task C: translate.js + Tests

Script unter scripts/translate.js, fuer pro-Skript LLM-Call + sandbox-smoke-test.

Files:
- Create `bundled-skills/skill-translator/scripts/translate.js`
  - `execute({ skillPath, targetPath, dryRunReport })` orchestriert pro-Skript-Konversion
  - LLM-Call mit Frontier-Modell-Prompt (Python-Source + Mapping-Hints -> JS-Output)
  - Sandbox-Smoke-Test pro konvertiertem Script (probe-call mit minimal args)
  - Schreibt JS-File + TRANSLATION.json-Manifest
  - Reject auf eval, Filesystem-Bypass-Patterns (security validation)
- Tests fuer die Validation-Logik + Manifest-Schreiben (mit mock LLM call)

### Task D: PartialTranslationModal

UI-Modal vor Schreiben bei partial-translation-Verdict.

Files:
- Create `src/ui/modals/PartialTranslationModal.ts`
  - Constructor: `(app, dryRunReport, onAccept, onCancel)`
  - Render: tabelle der mappable/partial/unmappable mit Counts und Listen
  - Buttons: "Accept partial translation" / "Cancel + open skill-creator instead"
  - Pattern wie SkillVersionsModal (existing reference)
- Test: nicht direkt unit-bar (UI), live-test via Sandbox-Smoke

### Task E: TaskRouter-Trigger + Flagship-Route

TaskRouter erkennt Translation-Phrasen, eskaliert auf Flagship.

Files:
- Modify `src/core/agent/TaskRouter.ts` (oder wo die Klassifikation lebt)
  - Add patterns: "translate skill", "convert anthropic skill", "port skill", "uebersetze diesen skill"
  - Classification: `skill-translation` -> route to Flagship-Tier
- Tests: TaskRouter-Tests um neue Trigger erweitern

### Task F: SKILL.md Body

Composer der den ganzen Workflow steuert.

Files:
- Create `bundled-skills/skill-translator/SKILL.md`
  - Frontmatter: name, description, trigger, source: bundled, allowedTools (read_file, write_file, edit_file, run_skill_script, attempt_completion, ask_followup_question)
  - Body: Workflow
    1. read source skill path from user
    2. run_skill_script dry-run -> get verdict
    3. if "full": skip modal, go to translate
    4. if "partial" or "unmappable": present modal via ask_followup_question, branch on user choice
    5. on accept: run_skill_script translate -> write target + TRANSLATION.json
    6. on cancel: invoke_skill skill-creator with similar-skill brief
  - Body-Konvention: nutzt invoke_skill fuer skill-creator-Verweis

### Task G: ARCHITECTURE.map + Wiring + Live-Test

Wayfinder-Eintrag, Bundle-Registration, Live-Smoke gegen Anthropic-Repo.

Files:
- Update `src/ARCHITECTURE.map` (add concept: `skill-translator`)
- Verify bundle inclusion (bundled-skills/skill-translator/ is auto-picked-up by esbuild bundling)
- Live-Smoke: clone https://github.com/anthropics/skills/tree/main/document-skills/pdf into temp, run skill-translator, verify TRANSLATION.json + functional translation

## Coverage Gate

SC-01: Top-5-Anthropic-Skills konvertieren -> Task G Live-Smoke (mindestens pdf + pptx)
SC-02: Modal bei nicht-mappbaren Imports -> Task B Dry-Run-Verdict + Task D Modal
SC-03: Modal-Buttons "Partial annehmen" + "Cancel + skill-creator" -> Task D Modal Buttons + Task F Body-Branch
SC-04: Konvertierter Skill funktioniert ohne manuellen Edit -> Task C Smoke-Test + Task G Live-Test
SC-05: TRANSLATION.json-Manifest -> Task C Output-Schreiben

Build commands:
- `npm run build` (esbuild bundling, deploy to vault)
- `npx tsc --noEmit` (type check)

Test commands:
- `npx vitest run` (full suite)
- Live-Smoke per Hand mit Anthropic-Skill als Source

## Change Log

(Append-only; new dated entries on every mid-course discovery.)
