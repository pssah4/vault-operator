---
id: FIX-19-19-01
epic: EPIC-19
feature: FEAT-19-19
adr-refs: []
plan-refs: []
depends-on: []
audit-refs: [STABILITY-AUDIT-v2.14.0-2026-06-21]
created: 2026-06-21
---

# FIX-19-19-01: Stufe2ActivityTrigger SQL crash + missing error guard

## Symptom

Stufe-2 Activity-Trigger (FEAT-19-19) feuert in der Praxis nie:

1. Bei Note-Open/Modify ruft das Vault-Event den Trigger ueber `void this.maybeHint(file)` auf. Wenn ein Cluster-Score errechnet werden muss, geht der Code in `computeAvgAge` und fuehrt dort ein invalides SQL aus:

   ```sql
   SELECT AVG(MAX(mtime)) FROM (SELECT path, MAX(mtime) AS mtime FROM vectors WHERE path IN (?) GROUP BY path)
   ```

   sql.js antwortet mit `SQLite error: misuse of aggregate function MAX()`. Aggregat (AVG) auf Aggregat (MAX) ohne weiteres GROUP BY ist nicht erlaubt -- das ist syntaktisch falsches SQL, kein Datenproblem.

2. Der Throw entfaltet sich als unhandled rejection aus `void this.maybeHint(file)`. Im Hot-Path eines schnellen Edit-Loops geht das in den Stack-Spam, ohne dass der User irgendetwas sieht. Stufe2 ist effektiv tot.

Verifikation: `node -e "const sqljs = require('sql.js'); ..."` reproduziert den Crash unmittelbar gegen ein einfaches `vectors`-Table.

## Root Cause

`src/core/health/Stufe2ActivityTrigger.ts:151`:
```ts
const r = db.exec(`SELECT AVG(MAX(mtime)) FROM (SELECT path, MAX(mtime) AS mtime FROM vectors WHERE path IN (...) GROUP BY path)`, paths);
```

Die innere Sub-Query liefert per `GROUP BY path` schon eine Zeile pro Pfad mit der MAX-mtime in der Spalte `mtime`. Die aeussere Aggregation soll nur den Durchschnitt ueber diese Werte bilden -> `AVG(mtime)`, nicht `AVG(MAX(mtime))`.

Zusaetzlich fehlt in `maybeHint` ein top-level try/catch. Ein DB-Fehler in einer der drei `db.exec`-Stellen (Cluster-Lookup, fetchClusterMembers, computeAvgAge) bricht den ganzen Hint-Pfad ab und produziert eine unhandled rejection.

## Fix

1. **SQL-Korrektur** in `computeAvgAge`:
   ```ts
   SELECT AVG(mtime) FROM (SELECT path, MAX(mtime) AS mtime FROM vectors WHERE path IN (...) GROUP BY path)
   ```

2. **Top-Level try/catch** in `maybeHint`: alle DB-Calls und Score-Berechnungen umschliessen. Bei Fehlern: `console.warn` + `return false`. Verhindert unhandled rejection und blockiert nie den Editor.

## Tests

`src/core/health/__tests__/Stufe2ActivityTrigger.test.ts` (neu):

1. `computeAvgAge does NOT crash against a real sql.js vectors table` -- pinnt das SQL-Verhalten gegen eine echte in-memory sql.js DB mit drei Datenpunkten. Pre-fix crasht, post-fix liefert positiven endlichen Tage-Wert.
2. `maybeHint returns false (not throws) when the underlying DB call fails` -- pinnt das try/catch-Verhalten mit einer DB, deren `exec` immer wirft. Pre-fix unhandled rejection, post-fix `Promise<false>`.

Beide Tests pre-fix RED, post-fix GREEN.

## Out of Scope

- Cross-Property-Reciprocity im `checkMissingBacklinks`-Predicate. Audit-Live-Verifikation hat 1 high finding identifiziert: `Notes/Zettelkasten-Workflow.md` wird via `Notizen:` aus einer Quelle referenziert, hat aber nur `Quellen:` als Reverse-Link. Semantisch korrekt, aber das aktuelle SQL erwartet identische Property auf beiden Seiten. Eigener Spec.
