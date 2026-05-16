---
id: FIX-28-00-02
feature:
epic: EPIC-28
adr-refs: []
plan-refs: []
audit-refs: []
depends-on: [FIX-28-00-01]
created: 2026-05-16
---

# FIX-28-00-02: GitCheckpointService -- isomorphic-git haengt mit safeFs-Wrapper

## Symptom

Nach EPIC-28 (Commit `9ddec1a0`) blockt der Plugin-Startup beim Reload
indefinit waehrend `await this.checkpointService.initialize()`. In der
DevTools-Console kommt nach `Loading Vault Operator plugin` keine
einzige weitere Zeile von uns; das Plugin-onload terminiert nie.
Beobachtet mit BP-Breadcrumbs am 2026-05-16 auf iCloud-Drive-basiertem
Vault (`/Users/.../Library/Mobile Documents/iCloud~md~obsidian/...`).

Reproduktion: jeder Reload eines Vaults mit `enableCheckpoints=true`.

## Root cause

FEAT-28-01 hat das fs-Plugin von `GitCheckpointService.getFs()` auf den
safeFs-Wrapper umgestellt:

```diff
- import fs from 'fs';
- ...
- return fs;
+ import * as safeFs from '../security/safeFs';
+ ...
+ return safeFs;
```

isomorphic-git ruft dieses Plugin intern auf, vermutlich u.a. via
`typeof fs.X` / `'function' === typeof fs.promises.X` Property-Probing.
Unser `export const promises = {...}` ist ein Object-Literal mit Methoden,
das native Node `fs.promises` ist ein Proxy-aehnliches Konstrukt -- die
beiden verhalten sich unter bestimmten Probing-Mustern nicht identisch.

Der konkrete Trigger ist nicht final isoliert. Sichtbar ist: `git.resolveRef`
mit `fs: safeFs` liefert eine Promise zurueck, die *nie* resolved oder
rejected -- weder ENOENT noch SafeFsViolation, einfach Hang. Der
try/catch-Block in `initialize()` greift nicht, weil es keine Rejection
gibt.

Unter Tests (vitest) faellt der Bug nicht auf, weil dort der safeFsSetup
das fs-Modul mit einer permissiven Allowlist initialisiert und die Tests
die isomorphic-git-Initialisierung nicht produktionsnah anstossen.

## Fix

Genau ein Call-Site auf rohes `fs` zurueckgedreht:

```diff
+ // eslint-disable-next-line @typescript-eslint/no-require-imports -- isomorphic-git
+ // needs the raw Node fs module as its plugin; routing through safeFs caused an
+ // indefinite hang during git.resolveRef on iCloud-backed vaults (2026-05-16).
+ const rawFs = require('fs') as typeof import('fs');
+ ...
+ private getFs() {
+     return rawFs;
+ }
```

Die safeFs-Migration bleibt fuer alle anderen 12 Call-Sites in Kraft.
`scripts/check-safe-fs-imports.sh` bekommt `GitCheckpointService.ts` als
fuenfte dokumentierte Ausnahme.

## Sicherheits-Auswirkung

Der Schreibumfang von isomorphic-git ist durch den `dir`-Parameter aller
`git.X({ dir, ... })`-Calls auf `<vaultRoot>/<pluginDataDir>/checkpoints/`
beschraenkt. Die Library hat keinen Mechanismus, ausserhalb dieses
Verzeichnisses zu schreiben, selbst wenn das fs-Plugin es technisch
zulaesst. Die Wrapper-Schutzwirkung wird damit nicht effektiv schwaecher;
sie wird nur nicht *zusaetzlich* durch den Allowlist-Check abgesichert.

Threat-Model aus SECURITY.md bleibt korrekt: Plugin schreibt nur in
dokumentierte Pfade. Scanner-Heuristik "Direct Filesystem Access" trifft
diese Stelle, aber sie ist im Wrapper-Exceptions-Block dokumentiert
(`scripts/check-safe-fs-imports.sh` ALLOW-Liste + Header-Kommentar).

## Verifikation

- DevTools-Console nach Reload: `Vault Operator plugin loaded successfully`
  erscheint, Sidebar oeffnet sich.
- BP-Breadcrumb-Probe (vor Cleanup): BP-17c (GitCheckpointService
  konstruiert) wurde von BP-18 (checkpoints initialized) gefolgt.
- `bash scripts/check-safe-fs-imports.sh` -> OK, keine Verletzungen.
- `npm run build` -> tsc clean, build green.

## Folgearbeit

Echte Wurzel im isomorphic-git-Plugin-Probing ist nicht isoliert. Optional
ablesbar als FEAT-Item: "safeFs.promises so umbauen, dass es Property-
Probing pixelgleich zum nativen `fs.promises` reagiert", oder isomorphic-git
durch nodegit / native git ersetzen. Priority: niedrig, Workaround ist
stabil und auf einen Call-Site beschraenkt.
