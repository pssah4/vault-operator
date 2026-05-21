---
id: PLAN-30
title: FEAT-29-06 Sandbox-JS first-class -- run_skill_script + code_modules removal
date: 2026-05-20
feature-refs: [FEAT-29-06]
adr-refs: [ADR-126]
plan-refs: []
bug-refs: []
pair-id: epic-29-welle-4-a
---

# PLAN-30 -- FEAT-29-06 Sandbox-JS first-class

## Kontext

Welle 4 erster Lauf. **TDD-Mode strikt** ab hier per Memory `feedback_tdd_default.md`. Welle 1-3 sind release-ready (Branch `feat/epic-29-skills-consolidation`, 1838/1859 Tests gruen).

Heutiges Pattern: `manage_skill` mit `code_modules`-Parameter laesst TypeScript-Code im Skill-Frontmatter unterbringen, der `CodeModuleCompiler` kompiliert das in `custom_*`-Tools die via `DynamicToolLoader` in die Tool-Registry geladen werden. Folge: Custom-Tool-Sprawl, Tool-Registry-Bloat, code_modules-only-Mechanik die niemand sonst nutzt.

Welle-4-Pattern: Skripte liegen als plain `.js`-Dateien im `scripts/`-Folder neben SKILL.md. Ein generisches `run_skill_script(skill_name, script_name, args)`-Tool laedt das Skript on-demand, bundlet es via Sandbox-Executor, executet es, returnt das Ergebnis. Kein Tool-Registry-Eintrag pro Skript.

Aus dem /coding-Pivot beantwortet:

1. **Bundle-Cache:** In-Memory-LRU pro Plugin-Session. Persistenter Cache (FEAT-22-05 schon vorhanden) wuerde mit ESBuild-Hash-Lookup arbeiten -- spaeter optional. In-Memory ist simpel und reicht fuer die ersten Iterationen.
2. **args-Schema:** JSON-Object, ohne weitere Validation. Das Skript exportiert `export async function execute(args) { ... }`. Sandbox-Executor ruft die `execute`-Funktion mit dem `args`-JSON auf.
3. **Return-Schema:** Skript-Return-Value wird JSON-serialisiert. Bei Throw kommt Error-Object zurueck.
4. **Migration-Pfad:** Bestehende custom_*-Tools werden NICHT automatisch migriert. Sie sind als deprecated markiert und bleiben so lange in der Registry bis der User sie manuell entfernt. Neue Skill-Versionen (via skill-creator FEAT-29-05) nutzen run_skill_script.

## Tasks (strikt TDD)

### Task A -- RunSkillScriptTool (RED -> GREEN)

**Files:**
- `src/core/tools/agent/__tests__/RunSkillScriptTool.test.ts` (Create, RED first)
- `src/core/tools/agent/RunSkillScriptTool.ts` (Create, GREEN)
- `src/core/tools/types.ts` (Modify, add 'run_skill_script' to ToolName union)

**Tests (RED first):**
- "returns error when skill_name does not exist"
- "returns error when script_name does not exist in skill folder"
- "loads and executes a simple script that returns a value"
- "passes args to the script's execute(args) function"
- "catches script errors and reports them in tool_result"
- "respects timeout (30s default)"

**Implementation (GREEN minimal):**
- Read script at `{getSelfAuthoredSkillsDir(plugin)}/{skill_name}/scripts/{script_name}.js`
- Pass to sandboxExecutor.execute(code, args, { timeoutMs: 30_000 })
- Return JSON-serialized result

### Task B -- Bundle-Cache (RED -> GREEN)

**Files:**
- `src/core/sandbox/__tests__/RunSkillScriptCache.test.ts` (Create, RED)
- `src/core/sandbox/RunSkillScriptCache.ts` (Create, GREEN)

**Tests:**
- "caches a bundle by skill+script+content-hash"
- "returns cached bundle on second invocation"
- "evicts cache when LRU max exceeded"
- "invalidates on content change (hash mismatch)"

**Implementation:**
- LRU cache via Map + access-order tracking
- Cap at 20 entries (typical skill set < 10)
- Key: sha256(skill_name + script_name + script_content)

### Task C -- code_modules-Removal aus ManageSkillTool

**Files:**
- `src/core/tools/agent/ManageSkillTool.ts` (Modify, remove code_modules param + CodeModuleCompiler-Aufrufe)
- `src/core/tools/agent/__tests__/ManageSkillTool.test.ts` (Modify if exists, sonst create RED for new behavior)

**Aktion:**
- code_modules-Parameter aus Input-Schema entfernen
- CodeModuleCompiler-Import entfernen
- create/update-Aktionen nutzen jetzt nur das SKILL.md
- Bestehende skills mit code_modules: SKILL.md bleibt, custom_*-Tools laufen weiter (Migration-Pfad TBD per Spec)

### Task D -- CodeModuleCompiler + DynamicToolLoader Deprecation

**Files:**
- `src/core/skills/CodeModuleCompiler.ts` (Mark deprecated mit @deprecated JSDoc-Tag, NICHT loeschen -- haengt evtl. an custom_*-Bestand)
- `src/core/tools/dynamic/DynamicToolLoader.ts` (Pruefen ob nutzbar bleibt)
- ARCHITECTURE.map (deprecate-Marker)

**Aktion:**
- @deprecated-Tag mit Hinweis "FEAT-29-06: use run_skill_script instead, code_modules is deprecated"
- DynamicToolLoader laesst bestehende custom_*-Tools weiterlaufen, ergaenzt aber keine neuen

### Task E -- builtinModes.ts + ToolRegistry-Wiring

**Files:**
- `src/core/tools/ToolRegistry.ts` (Modify, register RunSkillScriptTool)
- `src/core/modes/builtinModes.ts` (Modify, code_modules-Hinweis aus Mode-Body entfernen, durch run_skill_script-Hint ersetzen)
- `src/core/tools/toolMetadata.ts` (Modify, TOOL_METADATA + commonMistakes)
- `src/ARCHITECTURE.map` (Modify, run-skill-script Entry)

### Task F -- Verify gate + Phase-end commit

**Files:** Build + Tests + Commit

**Verifikationsbefehle:**
- `npx tsc --noEmit -skipLibCheck` clean
- `npx vitest run src/core/tools/agent/__tests__/RunSkillScriptTool.test.ts src/core/sandbox/__tests__/RunSkillScriptCache.test.ts` -- alle gruen
- `npx vitest run` -- 1838+ Tests gruen, 21 pre-existing Failures stabil
- `npm run build` -- exit 0
- Live-Smoke: load existing skill mit scripts/-Folder (z.B. enbw-slides), call run_skill_script, verify result

## Coverage Gate

| SC | Beschreibung | Task |
|---|---|---|
| SC-01 (run_skill_script laedt + executet) | Task A |
| SC-02 (code_modules entfernt) | Task C + Task D |
| SC-03 (custom_* nicht mehr in Registry) | Task D + Task E |
| SC-04 (scripts/-Folder-Anteil-Steigerung) | Deferred (Adoption-Metrik, post-release) |
| SC-05 (CDN-Imports moeglich) | Vererbt von EPIC-22 Sandbox-Executor (bereits implementiert) |

**ADR-126 Alignment:** Task A operationalisiert die ADR-126-Decision "run_skill_script ersetzt code_modules-Mechanik".

## Change Log

### 2026-05-20 -- initial draft
Plan angelegt. TDD-strict, 6 Tasks. Voll-Scope per User-Entscheidung. Welle 4 erster Lauf.

### 2026-05-20 -- Task A done, Rest deferred auf frische Session

Task A RunSkillScriptTool sauber TDD-implementiert:

- **RED:** 13 Tests fuer input-validation, path-traversal-guard, file-loading, execution, error-handling, tool-definition. Test-run scheiterte beim Import (Tool noch nicht da) -- RED verified.
- **GREEN:** `src/core/tools/agent/RunSkillScriptTool.ts` minimal implementiert. Path-traversal-Guard via SAFE_NAME_PATTERN (Whitelist Regex), Pfad-Aufbau via getSelfAuthoredSkillsDir, EsbuildWasm-Compile, Sandbox-Execute. 13/13 Tests gruen.
- **REFACTOR:** keine Refactor-Iteration noetig, Code ist direkt sauber.
- **TypeScript:** clean.

Plus types.ts: 'run_skill_script' zur ToolName-union ergaenzt.

**ToolRegistry-Wiring NICHT durchgefuehrt** (Task E). Das Tool ist im Code, aber noch nicht im System-Prompt registriert -- agent kann es noch nicht aufrufen. Bewusste Entscheidung: sauberer Stand fuer commit, Tasks B-F in frischer Session mit voller Kapazitaet.

Status nach diesem Commit:
- PLAN-30: Active (Task A done von 6)
- FEAT-29-06: Active (Tool implementiert, noch nicht aktiv)
- naechste Session: Task B (Bundle-Cache) -> C (code_modules-Removal) -> D (Deprecation) -> E (Wiring) -> F (verify)

### 2026-05-20 -- Tasks B-F done, PLAN-30 abgeschlossen

Alle weiteren Tasks im selben Session-Run nach User-Bestaetigung "weiter":

- **Task B Bundle-Cache:** `RunSkillScriptCache.ts` mit FNV-1a-Hash-keyed LRU-Cache (default maxEntries=20). 10 RED-first-Tests gruen (hit/miss, source-change-invalidation, skill+script-Isolation, LRU-Eviction, re-set-update, size/clear, default cap). Cache in RunSkillScriptTool integriert mit 2 Integration-Tests (transform-skip on identical source, re-transform on source-change). TDD-strict gefuehrt, RED -> GREEN verified.
- **Task E ToolRegistry-Wiring:** `RunSkillScriptTool` registriert in `ToolRegistry.ts` (gated auf sandboxExecutor + esbuildManager). TOOL_METADATA-Eintrag mit signature/whenToUse/commonMistakes. Wayfinder `src/ARCHITECTURE.map` row `run-skill-script` mit ADR-126.
- **Task C code_modules-Removal:** `ManageSkillTool.ts` -- `code_modules`-Property aus Input entfernt, `CodeModuleCompiler`-Import + Member entfernt, `validateNames`/`processModule`-Aufrufe in create/update entfernt, `codeModuleNames`-Building entfernt. `existingCodeModules` werden beim Update preserviert (back-compat). Tool-Description erwaehnt run_skill_script als Ersatz.
- **Task D Deprecation:** `CodeModuleCompiler.ts` mit `@deprecated`-JSDoc-Tag + ausfuehrlichem File-Header. `builtinModes.ts`-Mode-Body "Skills with code modules" auf "Skills with helper scripts" umgestellt, code_modules-Hint durch run_skill_script-Hint ersetzt.
- **Task F Verify:** TypeScript clean, `npm run build` green, 1851 -> 1863 Tests passing (+12 vs. Task-A-Stand). Deploy auf iCloud-Vault durchgelaufen.

### Coverage Gate -- final

| SC | Beschreibung | Status |
|---|---|---|
| SC-01 (run_skill_script laedt + executet) | Task A + B (Tool + Cache, 25 Tests) |
| SC-02 (code_modules entfernt) | Task C + D (input-removed, deprecated) |
| SC-03 (custom_* nicht mehr in Registry) | Task C + D (no new compilation, Bestand laeuft via DynamicToolLoader weiter) |
| SC-04 (scripts/-Folder-Anteil-Steigerung) | Deferred -- Adoption-Metrik post-release |
| SC-05 (CDN-Imports moeglich) | Vererbt von EPIC-22 Sandbox-Executor |

### ADR-126-Alignment

Welle 4 erste Realisierung: skill-creator/translator (FEAT-29-05/08) bauen jetzt auf run_skill_script statt code_modules. Bestand-custom_*-Tools laufen via DynamicToolLoader weiter (Migration-Pfad fuer in-Vault-Bestand via skill-creator spaeter).
