---
id: FEAT-28-01
title: safeFs Wrapper with path allowlist
epic: EPIC-28
priority: P0
date: 2026-05-16
related: AUDIT-027
adr-refs: []
plan-refs: []
depends-on: []
---

# FEAT-28-01: safeFs Wrapper with path allowlist

## Description

Heute ist jeder direkte `fs.*`-Aufruf im Plugin verstreut auf 15+ Stellen (KnowledgeDB, SemanticIndex, WriterLock, SnapshotJob, MultiFileAtomicCommit, GitCheckpointService, Office-Renderer, GlobalFileService, MCP-Token, OAuth-Storage, Migrate-Folder, runtimeWorker, McpTab, McpBridge, ProcessSandboxExecutor). Die Pfade sind ueberall plugin-internal hart vorgegeben, aber es gibt keine zentrale Stelle, an der ein Maintainer das verifizieren kann. Ein Reviewer muesste jede der 15+ Call-Sites einzeln nachvollziehen.

FEAT-28-01 fuehrt einen zentralen Wrapper in `src/core/security/safeFs.ts` ein, der die gesamte verwendete Untermenge der Node-`fs`-API anbietet (readFile, writeFile, readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync, renameSync, watch, watchFile, etc.) und jeden Pfad gegen eine harte Allowlist prueft:

1. **Vault Root** (vom Plugin-Konstruktor uebergeben, `app.vault.adapter.getBasePath()`)
2. **Plugin Data Directory** (`<vault>/.obsidian/plugins/vault-operator/`)
3. **Plugin Config Directory** (`<vault>/.obsidian-agent/`)
4. **System Temp Directory** (`os.tmpdir()` plus dedicated subfolder `vault-operator-XXXX`)
5. **User-Home Config Directories** fuer MCP-Setup (`~/.config/Claude/`, `~/Library/Application Support/Claude/`, `%APPDATA%\Claude\`) -- nur fuer User-Trigger UI-Klicks, dokumentiert

Jeder Pfad wird VOR der Operation:
- Mit `path.resolve()` normalisiert (loest `..`-Sequenzen auf)
- Mit `path.relative()` gegen jede Allowlist-Wurzel geprueft
- Akzeptiert wenn die relative Form weder `..` enthaelt noch absolut ist (also: tatsaechlich UNTERHALB einer Wurzel)
- Wirft `SafeFsViolation` mit Pfad und Wurzel-Kontext sonst

Die Allowlist ist beim Plugin-Init aufgebaut und immutable danach. Tests pruefen Pfad-Traversal-Angriffe (`../../../etc/passwd`, symlinks, Windows-Backslash, Mixed-Case auf macOS), Edge-Cases (leerer String, root, relative-Pfade), und alle Allowlist-Wurzeln auf alle 3 Plattformen.

Alle bestehenden Call-Sites werden migriert auf den Wrapper. Direct `import * as fs from 'fs'` wird durch `import { safeFs } from '@/core/security/safeFs'` ersetzt. Eine ESLint-Regel oder mindestens ein grep-basierter pre-push-Check sichert, dass kein neuer direkter fs-Import einfliesst.

## Benefits Hypothesis

Das Plugin-Bundle bleibt funktional identisch (gleicher Funktionsumfang), aber jeder fs-Aufruf hat ein einziges Verifikationspoint. Ein Maintainer-Review kann auf "lies safeFs.ts, das Allowlist-Setup beim Plugin-Init, und die Tests" reduziert werden. Path-Traversal-Bugs (auch bei zukuenftigen neuen Features) sind by-default verhindert.

## User Stories

- **US-28-01-01 (P0 Maintainer):** Als Obsidian-Community-Reviewer moechte ich an einer Stelle sehen, welche Pfade das Plugin schreiben darf, damit ich nicht 15 Call-Sites einzeln pruefen muss.
- **US-28-01-02 (P0 Plugin-Author):** Als Plugin-Author moechte ich, dass ein versehentlicher fs-Aufruf auf einen vom Agent kontrollierten Pfad sofort wirft, damit ich keine Pfad-Traversal-Bugs introduziere.
- **US-28-01-03 (P1 Power-User):** Als Power-User moechte ich, dass das Plugin niemals ausserhalb meines Vaults oder Plugin-Daten-Bereichs schreibt, auch nicht aus Versehen.

## Success Criteria

1. Jeder direkte `import ... from 'fs'` oder `require('fs')` im Bundle (ausserhalb von `safeFs.ts` und Tests) ist entfernt.
2. Pfad-Traversal-Versuche (`safeFs.writeFileSync('../../../tmp/evil', ...)`) werfen `SafeFsViolation` mit dem versuchten Pfad und der Liste der zulaessigen Wurzeln.
3. Absolute Pfade ausserhalb der Allowlist werfen `SafeFsViolation`.
4. Die Allowlist umfasst exakt die 5 Kategorien aus der Beschreibung, alle anderen werfen.
5. Bestehende Funktionalitaet (KnowledgeDB schreibt, SemanticIndex schreibt, Checkpoints schreiben, Office-Pipeline schreibt in temp, MCP-Token wird gelesen, OAuth-Tokens werden gelesen) ist nach der Migration vollstaendig funktional.
6. Performance-Regression weniger als 1% (gemessen an einer Benchmark-Suite mit 1000 read/write-Calls).
7. Test-Coverage fuer `safeFs.ts` mindestens 95% (Line + Branch).

## Technical NFRs

- **Single-Source-of-Truth:** alle fs-Aufrufe gehen ueber `safeFs`. Keine Bypass-Eskapaden.
- **Fail-loud:** jede Allowlist-Verletzung wirft sofort, keine silent log + continue.
- **Cross-platform:** Tests laufen auf darwin/win32/linux mit deren jeweiligen Pfad-Konventionen.
- **Plugin-Init-Dependency:** `safeFs.initialize(allowlist)` ist der erste Plugin-Lifecycle-Step. Vor `initialize` werfen alle Operationen.
- **Maintainer-readable:** die Allowlist-Definition steht in **einer** Funktion mit Kommentar, max 60 Zeilen.

## ASRs

- **ASR-01:** Pfad-Allowlist-Pruefung verwendet ausschliesslich `path.resolve` + `path.relative`, keine String-Substring-Checks.
- **ASR-02:** Symlinks werden NICHT aufgeloest. `path.resolve` arbeitet rein lexikalisch, das ist Absicht. Eine Aufloesung wuerde die Allowlist auf das echte Filesystem ausdehnen.
- **ASR-03:** Der Wrapper exportiert nur die tatsaechlich im Plugin verwendete Untermenge der fs-API. Keine "fuer-die-Zukunft"-Funktionen.

## Definition of Done

- [ ] `src/core/security/safeFs.ts` implementiert mit allen heute verwendeten fs-APIs
- [ ] `SafeFsViolation` Error-Klasse mit `attemptedPath` und `allowedRoots` Properties
- [ ] `safeFs.initialize(allowlist)` als Lifecycle-Hook im Plugin-Main
- [ ] Alle 15+ bestehenden fs-Call-Sites migriert
- [ ] grep-pre-push-Check oder ESLint-Regel gegen neue direkte fs-Imports
- [ ] Tests: Allowlist-Wurzeln (positiv), Path-Traversal (negativ), Absolute-Pfade (negativ), Symlinks (lexikalisch), 3-Plattformen-Pfad-Konventionen
- [ ] Live-Smoke-Test: KnowledgeDB, SemanticIndex, Checkpoints, Office-Pipeline, MCP-Token funktionieren wie vor der Migration
- [ ] SECURITY.md Eintrag fuer safeFs (kommt aus FEAT-28-03)

## Out-of-Scope

- ESLint-Regel-Implementation als Custom-Rule (grep-Check reicht)
- Runtime-Konfigurierbarkeit der Allowlist (User-Settings koennen Wurzeln NICHT hinzufuegen)
- Auto-Migration bestehender Pfade ausserhalb der Allowlist
- Telemetry/Counter fuer Allowlist-Verstoesse
