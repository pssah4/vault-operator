---
id: FIX-29-08-01
title: skill-translator scheitert bei ZIP-Quelle (Sandbox kann jszip nicht bundeln, readBinary verliert Bytes)
feature: FEAT-29-08
epic: EPIC-29
priority: P1
discovered: 2026-06-17
resolved: 2026-06-17
---

# FIX-29-08-01: skill-translator scheitert bei ZIP-Quelle

**Prioritaet:** P1 (blockiert ein offiziell beworbenes Source-Format des Builtin-Skills)
**Datei(en):** `src/core/tools/vault/ExtractZipTool.ts` (neu), `src/core/utils/extractZip.ts` (neu), `bundled-skills/skill-translator/SKILL.md` (Schritt 1 erweitert)
**Feature-Bezug:** FEAT-29-08 (skill-translator builtin), EPIC-29
**Entdeckt:** 2026-06-17 (Live-Test mit `Inbox/ki-briefing-deutsch.zip`)
**Geloest:** 2026-06-17

## Problem

Der skill-translator-Builtin (FEAT-29-08) bietet drei Source-Formate an: GitHub-URL, ZIP-Datei im Vault, ausgepackter Skill-Ordner. Schritt 1 der SKILL.md hatte aber nur konkrete Instruktionen fuer GitHub-URL und lokalen Ordner. Bei ZIP-Quellen improvisierte das Agent mit `evaluate_expression` und scheiterte mit drei verschiedenen Symptomen:

1. **jszip als `dependencies` warf `Cannot read properties of undefined (reading 'bind')`** -- der esbuild-Sandbox-Bundler kommt mit CommonJS-Internals von jszip nicht zurecht.
2. **fflate lieferte eine einzige leere Datei** -- der binaere Roundtrip ueber `vault.read()` (UTF-8 decoding) korrumpierte die Byte-Sequenz.
3. **`ctx.vault.readBinary` lieferte ein leeres Object** -- structured-clone-Drift ueber die postMessage-Bridge zwischen Iframe und Plugin verliert ArrayBuffer-Bytes in manchen Setups.

Reproduktion:
- `/skill-translator` triggern
- Source-Format auf "ZIP-Datei im Vault" setzen, beliebige `.zip` aus Inbox
- Agent versucht evaluate_expression, scheitert nach 5+ Tool-Calls

## Root Cause

Spec-Luecke. Die SKILL.md positionierte ZIP als gleichwertige Source, hatte aber keinen sandbox-tauglichen Extraktions-Pfad. Sandbox-Architektur (`@anthropic-ai/sandbox-runtime`-Iframe + `AstValidator`) blockiert `dynamic import()` (verhindert npm-CDN-Loader) und liefert binaere Daten nur eingeschraenkt durch die Bridge zurueck. jszip + fflate + readBinary sind aus dem Sandbox-Pfad heraus nicht zuverlaessig nutzbar.

## Fix

Neues built-in Tool `extract_zip` unter `src/core/tools/vault/ExtractZipTool.ts`, das den ZIP-Extract-Pfad direkt im Plugin-Kontext faehrt (ausserhalb der Sandbox). Pure Helper-Funktion in `src/core/utils/extractZip.ts` mit drei Guards:

1. **Path-Traversal-Guard** -- keine `..`-Segmente in Entry-Pfaden
2. **Zip-Bomb-Guard** -- Decompressed-Size-Limit (Default 100 MB, override per Argument)
3. **`strip_root_folder`-Option** -- entfernt den gemeinsamen Root-Folder fuer Anthropic-Style-ZIPs (`ki-briefing-deutsch/SKILL.md` -> `SKILL.md`)

Wiring:
- `ToolName` Union erweitert (`src/core/tools/types.ts`)
- ToolRegistry registriert (`src/core/tools/ToolRegistry.ts`)
- TOOL_GROUP_MAP `edit`-Gruppe (`src/core/modes/builtinModes.ts`)
- TOOL_METADATA mit description, parameters, example (`src/core/tools/toolMetadata.ts`)
- Coverage-Test pinnt die Reachability (`src/core/modes/__tests__/builtinModes.coverage.test.ts`)

SKILL.md Schritt 1 erweitert um den konkreten ZIP-Pfad mit `extract_zip`-Aufruf plus expliziter Warnung: **"never evaluate_expression for ZIP extraction -- the sandbox cannot bundle jszip and the binary roundtrip via vault.readBinary is lossy through the postMessage bridge"**.

## Tests

9 Helper-Tests in `src/core/utils/__tests__/extractZip.test.ts` decken: success-path, path-traversal-rejection, zip-bomb-rejection, strip-root-folder mit/ohne gemeinsamem Root, custom max-uncompressed-size, missing-input, target-folder-creation, nested-folder-creation.

## Verifikation

- Tests gruen
- Build clean (extract_zip in `main.js`)
- Live-Test: `/skill-translator` mit ZIP-Quelle erfolgreich durchgelaufen
