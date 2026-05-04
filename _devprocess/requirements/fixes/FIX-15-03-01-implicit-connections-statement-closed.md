# FIX-08: ImplicitConnections "Statement closed" Race Condition

**Prioritaet:** P2 (Mittelfristig)
**Dateien:** `src/core/knowledge/ImplicitConnectionService.ts`, `src/main.ts:417-429`
**Feature:** FEAT-15-03 (Implicit Connections)
**Entdeckt:** 2026-04-03, beim Memory/Self-Learning-Systemtest

---

## Problem

Beim Obsidian-Startup erscheint in der Developer Console:

```
[ImplicitConnections] Computation failed: Statement closed
```

## Root Cause Analyse

**Race Condition** zwischen DB-Initialisierung und `onLayoutReady`-Callback:

1. `main.ts:418-429`: ImplicitConnectionService wird erstellt und `computeAll()`
   wird ueber `this.app.workspace.onLayoutReady()` aufgerufen.

2. `onLayoutReady` feuert sobald Obsidians Layout bereit ist -- das kann VOR oder
   WAEHREND der vollstaendigen KnowledgeDB-Initialisierung passieren.

3. `computeAll()` greift auf vorbereitete SQL-Statements in KnowledgeDB zu.
   Wenn die DB noch nicht vollstaendig initialisiert ist oder ein vorheriger
   `close()`-Aufruf die Statements bereits geschlossen hat, tritt der Fehler auf.

**Konkrete Kette:**
```
onLayoutReady fires
  -> implicitConnectionService.computeAll(threshold)
    -> vectorStore.getNoteVectors()    [oder aehnlich]
      -> knowledgeDB prepared statement
        -> "Statement closed" Error (DB nicht bereit oder bereits geschlossen)
```

## Auswirkung

- **Funktional:** Niedrig. ImplicitConnections ist ein Nice-to-Have-Feature
  (zeigt semantisch aehnliche Notes ohne explizite Links). Per-File-Recompute
  bei spaeterem File-Events (`vault.on('modify')`) funktioniert wahrscheinlich
  korrekt, da die DB zu dem Zeitpunkt initialisiert ist.
- **Startup:** Einmalige Warn-Meldung in Console, kein User-sichtbarer Effekt.
- **Daten:** Implicit Connections werden beim Startup nicht berechnet, erst bei
  spaeteren File-Aenderungen.

## Moegliche Loesungen

### Option A: Guard-Check in computeAll()
```typescript
async computeAll(threshold: number): Promise<Result> {
    if (!this.knowledgeDB?.isOpen()) {
        console.debug('[ImplicitConnections] DB not ready, skipping startup computation');
        return { computed: 0, stored: 0 };
    }
    // ... rest
}
```
Einfachster Fix, verhindert den Fehler. Implicit Connections werden dann nur bei
File-Events berechnet (spaeter, wenn DB sicher offen ist).

### Option B: await DB-Readiness vor computeAll
In `main.ts`: `computeAll()` erst aufrufen nachdem alle DB-Initialisierungen
abgeschlossen sind. Erfordert Refactoring des Startup-Flows.

### Option C: Retry mit Backoff
`computeAll()` faengt den Fehler und versucht es nach 5s erneut (max 2 Retries).
Ueberbrueckt die Race Condition.

## Empfehlung

Option A als Quick Fix (15min). Kein nennenswerter Funktionsverlust, da File-Events
die Berechnung spaeter nachholen.

## Betroffene Dateien

- `src/core/knowledge/ImplicitConnectionService.ts` (computeAll)
- `src/main.ts:417-429` (Startup-Trigger)
- `src/core/knowledge/KnowledgeDB.ts` (Statement Lifecycle)
