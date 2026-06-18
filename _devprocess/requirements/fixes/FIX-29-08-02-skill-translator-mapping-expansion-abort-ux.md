---
id: FIX-29-08-02
title: skill-translator Mapping-Tabelle erweitert, Abbruch-UX an skill-creator vervollstaendigt
feature: FEAT-29-08
epic: EPIC-29
priority: P2
discovered: 2026-06-17
resolved: 2026-06-17
---

# FIX-29-08-02: skill-translator Mapping-Tabelle + Abbruch-Hand-off

**Prioritaet:** P2 (Folge-Welle nach FIX-29-08-01, kein Blocker, aber UX-relevant)
**Datei(en):** `bundled-skills/skill-translator/references/mapping.json` (erweitert), `bundled-skills/skill-translator/SKILL.md` (Schritt 3 Abbruch-UX), `bundled-skills/skill-translator/scripts/__tests__/dry-run.test.js` (Coverage-Test)
**Feature-Bezug:** FEAT-29-08, EPIC-29, depends-on FIX-29-08-01
**Entdeckt:** 2026-06-17 (Live-Test direkt nach FIX-29-08-01)
**Geloest:** 2026-06-17

## Problem

Live-Test mit `Inbox/ki-briefing-deutsch.zip` (nach FIX-29-08-01 ZIP-Pfad funktioniert) zeigte zwei separate Schwaechen:

1. **Mapping-Tabelle zu eng:** Der Dry-Run klassifizierte `importlib` als `unmappable`, obwohl der ueberwiegende Teil real existierender Anthropic-Skills `importlib.import_module('konstanter-name')` als statisches Plugin-Discovery-Pattern nutzt, das auf JS-Seite mit statischen `import`-Statements + Dispatch-Object machbar ist. Mapping hatte 28 Module, zu wenig.
2. **Abbruch-Hand-off an `skill-creator` war duenn:** Bei `unmappable` rief Schritt 3 nur `invoke_skill skill-creator` ohne Kontext. Der skill-creator bekam keinen Hinweis auf Quell-Pfad, auf welche Module unmappable waren, oder welche Limitations zu respektieren sind.

## Root Cause

Mapping-Tabelle war erste Iteration mit grossen Bibliotheken (NumPy, Pandas, SciPy) aber ohne stdlib-Vollabdeckung. Schritt 3 hatte die Hand-off-Signatur ohne content -- `args.context` war ein generischer String, kein verarbeitbarer Kontext fuer skill-creator.

Konkret: 4 von 10 typischen Python-Standardbibliotheks-Modulen die in Anthropic-Skills auftauchen (z.B. `dataclasses`, `enum`, `pprint`, `glob`, `importlib`) fehlten komplett in der Mapping-Tabelle und gingen automatisch in den `unmappable`-Pfad.

## Fix

### Mapping-Tabelle von 28 auf 94 Module erweitert

- **stdlib (27 Eintraege):** dataclasses, enum, math, random, time, string, pprint, glob, fnmatch, importlib (mit klarer limitation), ...
- **npm (15 Eintraege):** tomllib, toml, configparser, pydantic, jsonschema, markdown, bs4, lxml, xml, html, dateutil, markdown-it, ...
- **partial (17 Eintraege):** asyncio, concurrent, queue, time, aiohttp, httpx, openai, anthropic, google, tqdm, humanize, babel, ...
- **built-in-tool (13 Eintraege):** HTTP-Familie (requests, urllib, aiohttp via ctx.requestUrl), Office-Docs unveraendert
- **unmappable (22 Eintraege):** flask, fastapi, starlette, uvicorn, socket, ssl, dotenv, PIL, Pillow, cv2, torch, tensorflow, transformers, boto3, threading, multiprocessing, pkgutil, ...

`importlib` ist jetzt `partial` mit Limitation: *"constant module-name -> static import + dispatch object; runtime-computed name unmappable because sandbox blocks dynamic `import()`"*.

### Coverage-Test (`dry-run.test.js` Erweiterung)

62 neue Test-Cases pinnen:
- 53 must-have Module mit ihrer via-Klassifikation
- 3 Invarianten: jedes Mapping hat `notes`, jeder `partial` hat eine `limitations`-Liste, jedes `unmappable` hat `jsEquivalent: null`

### SKILL.md Schritt 3 Abbruch-UX

Bei `unmappable`:
1. Hand-off-Kontext enthaelt jetzt konkret den Source-Pfad (so dass skill-creator die Quell-Files lesen kann)
2. Liste der unmappable Module mit ihren `notes` aus der Mapping-Tabelle
3. Liste der partial Module mit deren Limitations
4. Expliziter Auftrag an skill-creator: *"scripts/*.py sind Pseudocode-Vorlage, nicht 1:1-Uebersetzungsbasis"*

Bei `Partial annehmen` + unmappable-Modulen:
- Schritt 4 muss `// TRANSLATOR: <modul> -- <grund>` Kommentare an den Code-Stellen einfuegen
- Sandbox-Validator (FEAT-29-08 vorhandener Mechanismus) faengt diese Kommentare nicht ab

## Verifikation

- 62 neue Coverage-Tests gruen
- Live-Re-Test mit `ki-briefing-deutsch.zip`: Dry-Run liefert jetzt 4 `partial` (statt 1 `unmappable`), Abbruch-Hand-off mit vollem Kontext durchgelaufen
- `tableVersion` in mapping.json von 2026-05-21 auf 2026-06-17 gebumpt
