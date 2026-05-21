---
name: skill-translator
description: Translate an Anthropic-style skill (with Python scripts) into a native Vault Operator skill (with JavaScript scripts that run in the sandbox). Use when the user asks to translate, convert, port, or import an Anthropic skill, e.g. "Hol mir den pdf-Skill von Anthropic" or "translate this python skill". A dry-run pass classifies every Python import against the mapping table; partial or unmappable cases trigger a user-confirmation modal before any file is written.
trigger: translate.*skill|convert.*python.*skill|port.*skill|uebersetze.*skill|konvertiere.*skill|import.*anthropic.*skill|hole.*anthropic.*skill
source: bundled
requiredTools: [read_file, write_file, run_skill_script]
allowedTools: [read_file, write_file, edit_file, list_files, run_skill_script, ask_followup_question, invoke_skill, web_fetch, attempt_completion]
---

# /skill-translator -- Anthropic-Skill in Sandbox-JavaScript portieren

## Ziel

Einen Anthropic-Skill (Python-basiert) so ueberfuehren dass er als nativer Vault-Operator-Skill laeuft. Drei harte Anforderungen:

1. **Dry-Run-First**: vor jedem Schreiben pruefen, welche Python-Imports mappbar sind. Nichts ungeprueft schreiben.
2. **User-Entscheidung bei partial**: wenn die Translation nicht 100% sauber laeuft, zeigt die Skill das User-Modal und wartet auf eine Entscheidung. Kein silent partial.
3. **Built-in-Tool-Routing**: binaere Formate (PDF, PPTX, DOCX, XLSX) werden NICHT in der Sandbox uebersetzt. Sie laufen ueber die Plugin-built-in-Tools `create_pptx`, `create_docx`, `create_xlsx`, `read_document`.

## Workflow

### Schritt 1: Quelle klaeren und LOKAL klonen (Pflicht)

Wenn der User keine konkrete Quelle nennt: `ask_followup_question` stellen:

> "Welcher Anthropic-Skill soll uebersetzt werden? Optionen: (a) GitHub-URL eines Skill-Folders, (b) ZIP-Datei im Vault, (c) bereits ausgepackter Skill-Ordner im Vault."

**MUSS-Schritt vor dem Dry-Run: alle Quell-Files in einen lokalen tmp-Folder schreiben.** Dry-Run ohne lokale Files liefert `no-source` und bricht ab. Konkretes Vorgehen pro Source-Typ:

- **GitHub-URL** (z.B. `https://github.com/anthropics/skills/tree/main/skills/pdf`):
  1. `web_fetch` der GitHub-Contents-API um die Datei-Liste zu kriegen: `https://api.github.com/repos/{owner}/{repo}/contents/{path}`.
  2. Pro Datei in der Liste: `web_fetch` auf die `raw.githubusercontent.com`-URL, dann `write_file` nach `.vault-operator/cache/tmp/translator-input/{name}/{filename}`. Pflicht-Folder-Anteile: `SKILL.md`, `scripts/*.py`, `references/*.md`.
  3. Pruefe nach jedem write: war es erfolgreich? Bei Fehler stoppen und User informieren.
- **Lokaler Ordner**: nimm den Pfad wie angegeben, kein Klonen noetig.

Zielname ist standardmaessig der `name`-Eintrag der Quell-Frontmatter. Wenn ein Skill mit dem Namen schon im Vault existiert, frage nach: ueberschreiben oder umbenennen.

### Schritt 2: Dry-Run-Pass

```
run_skill_script({
  "skill_name": "skill-translator",
  "script_name": "dry-run",
  "args": { "skillPath": ".vault-operator/cache/tmp/translator-input/<name>" }
})
```

Resultat hat die Form `{ status: "full" | "partial" | "unmappable" | "no-source", mappable[], partial[], unmappable[], bashCommands[], summary }`.

### Schritt 3: Entscheidung basierend auf Verdict

**Wenn `status === "no-source"`**: STOPPEN. Das heisst Schritt 1 wurde nicht ausgefuehrt oder ist fehlgeschlagen. Zurueck zu Schritt 1, lokale Quelle bereitstellen, dann erneut Schritt 2. NICHT raten und translatieren ohne Quelle.

**Wenn `status === "full"`**: weiter mit Schritt 4 ohne User-Modal.

**Wenn `status === "partial"` oder `status === "unmappable"`**: User-Modal zeigen. Das Plugin hat `PartialTranslationModal.ts`, das vom Agent NICHT direkt aufgerufen werden kann. Stattdessen die Entscheidung als `ask_followup_question` formulieren:

> "Translation-Status: {status}. Mappable: {N}, Partial: {M} (mit Limitations: {liste}), Unmappable: {K} (Gruende: {liste}). Optionen: 1) Partial annehmen (Limitations werden in TRANSLATION.json dokumentiert), 2) Abbrechen und stattdessen skill-creator nutzen."

Bei Antwort `1) Partial annehmen`: weiter mit Schritt 4.

Bei Antwort `2) Abbrechen`: rufe `invoke_skill` mit `skill_name: "skill-creator"` auf, args:
```json
{
  "skill_name": "<target-name>",
  "description": "<from source frontmatter, plus 'translated from anthropic'>",
  "context": "User wanted to translate an Anthropic skill but the translation was {status}. Build an equivalent skill from scratch."
}
```
Danach `attempt_completion` mit der Info dass skill-creator uebernommen hat.

### Schritt 4: Per-File Translation (Frontier-Modell)

Pro Python-Datei aus der Quelle:

1. Quelle lesen via `read_file`.
2. JavaScript-Aequivalent produzieren (das ist die LLM-Arbeit, kein Tool). Halte dich strikt an die Mapping-Tabelle (`references/mapping.json`):
   - `via: "built-in-tool"` -> erzeuge KEIN Sandbox-JS. Stattdessen ein kurzes JS-Wrapper-Snippet das eine `attempt_completion` mit Hinweis macht: "use the built-in tool X". Der Skill-Body (SKILL.md) ruft dann den built-in tool ohnehin auf statt das Script.
   - `via: "npm"` -> nutze ESM-`import`. Der Sandbox-esbuild bundelt npm-Module zur Laufzeit.
   - `via: "stdlib"` -> nutze JS-stdlib (JSON, Date, etc.).
   - `via: "partial"` -> halte dich an die `limitations`-Hinweise im Mapping.
3. Das produzierte JS muss eine Funktion `async function execute(args, ctx)` exportieren. `ctx.vault.{read,write,list,readBinary,writeBinary}` ist verfuegbar. `ctx.requestUrl` fuer HTTP.
4. **Forbidden**: `eval`, `new Function`, `require()`, `process.env`, `process.exit`, `child_process`, `fs.*`-direct, `globalThis.X = ...`. Diese werden von `translate.js`s Validierung zurueckgewiesen.

### Schritt 5: SKILL.md-Body neu komponieren

Quell-Body kopieren, dann anpassen:

- Frontmatter: `name`, `description`, `trigger` uebernehmen. `source: user`. `requiredTools` und `allowedTools` aus der Quelle uebernehmen, falls nicht vorhanden: leer lassen oder aus den genutzten ctx-Calls ableiten.
- Body-Inhalt: alle Verweise auf `python ...`, `pip install`, `import X` raus. Stattdessen Verweise auf `run_skill_script({skill_name, script_name, args})` mit den neuen JS-Datei-Namen.
- Wenn ein Quell-Script auf ein built-in-tool umgeleitet wurde: Body so anpassen dass der Agent den built-in tool direkt aufruft, nicht das (leere) JS-Wrapper-Script.

### Schritt 6: Write via translate.js (Pflicht-Pfad, KEIN write_file-Bypass)

**Hart-Regel**: Files NICHT direkt mit `write_file` oder `create_folder` schreiben. Der einzige zulaessige Schreibpfad ist `run_skill_script(translate)`. Grund: nur dieser Pfad schreibt TRANSLATION.json (Audit-Manifest, Success-Criterion SC-05) UND validiert die JS-Outputs gegen Sandbox-Forbidden-Patterns (eval / require / fs.* etc.). Direktes Schreiben umgeht beides.

```
run_skill_script({
  "skill_name": "skill-translator",
  "script_name": "translate",
  "args": {
    "sourceRepo": "<url or 'local'>",
    "sourcePath": "<source-folder>",
    "sourceVersion": "<commit sha or null>",
    "targetPath": ".vault-operator/data/skills/<target-name>",
    "files": [
      { "source": "scripts/extract.py", "target": "scripts/extract.js", "content": "<translated JS>" },
      ...
    ],
    "skillMd": "<rewritten SKILL.md content>",
    "dryRunSummary": { "mappableCount": N, "partialCount": M, "unmappableCount": K },
    "partialMarkers": ["pandas", ...],
    "translator": "claude-opus-4-7"
  }
})
```

Resultat: `{ ok, written, failed, manifestPath, validationIssues }`. `manifestPath` MUSS am Ende auf einen geschriebenen `TRANSLATION.json`-Pfad zeigen, sonst ist die Translation NICHT vollstaendig (Schritt 8 darf in dem Fall NICHT `attempt_completion` mit Erfolgsmeldung aufrufen). Bei `ok: false` -> User informieren und die Issues konkret nennen (welche Datei, welches Pattern war forbidden).

### Schritt 7: Smoke-Test

Fuer jedes geschriebene Script:

```
run_skill_script({
  "skill_name": "<target-name>",
  "script_name": "<script-without-.js>",
  "args": { /* minimale Test-Args */ }
})
```

Erwartung: kein Throw, ein JSON-Return-Wert. Wenn der Smoke-Test scheitert, dem User mitteilen und die Translation als "smoke-failed" markieren (aber NICHT zurueckschreiben -- die Translation steht, der User entscheidet ueber Folge).

### Schritt 8: attempt_completion

Strukturierte Zusammenfassung:

- Quell-Skill (URL + Version)
- Ziel-Skill (Pfad)
- Translation-Status (full / partial)
- Liste der konvertierten Scripts
- Liste der partial-Markers (welche Limitations dokumentiert sind)
- Liste der built-in-tool-Reroutes
- Smoke-Test-Resultat pro Script
- Pfad zur TRANSLATION.json fuer den Audit-Trail

## Pflicht

- Quell-Files lokal klonen (Schritt 1), BEVOR der Dry-Run laeuft. Ohne lokale Quelle gibt der Dry-Run `no-source` zurueck und der Workflow muss zurueck zu Schritt 1.
- Nichts schreiben ohne Dry-Run-Pass.
- Bei partial oder unmappable: User-Entscheidung einholen, nicht silent durchziehen.
- Binaere Formate ueber built-in-Tools, nicht in der Sandbox.
- **Einziger Schreib-Pfad ist `run_skill_script(translate)`** (Schritt 6). Kein direktes `write_file` / `create_folder` fuer den Ziel-Skill -- das umgeht die Validierung und das TRANSLATION.json-Audit-Manifest.
- TRANSLATION.json MUSS am Ende existieren (Schritt 6 manifestPath ist truthy). Sonst keine Erfolgsmeldung in Schritt 8.
- Bei Smoke-Failure: User informieren, Translation steht aber bleiben.

## Verboten

- Direkt-Konversion ohne Dry-Run.
- Translation mit `eval`, `new Function`, `require`, `process.env`, `fs.*`-direct.
- Stilles Schreiben bei partial-Verdict.
- Skill mit existierendem Namen ueberschreiben ohne User-Bestaetigung.
- Direktes `write_file` oder `create_folder` fuer den Ziel-Skill-Folder. Schreiben laeuft ueber `translate.js`.
- Erfolgsmeldung in `attempt_completion` ohne dass TRANSLATION.json geschrieben wurde.
