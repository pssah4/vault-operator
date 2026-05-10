---
id: ADR-112
title: Attachment-Lifecycle im Sidebar (Snapshot vs API-Split, Push-Sync zum Tool-Layer)
date: 2026-05-10
deciders: Sebastian + Architekt-Agent
related-features: FEAT-19-28, FEAT-19-31
related-fixes: FIX-19-28-05, FIX-19-28-02, FIX-19-28
related-epics: EPIC-19
---

# ADR-112: Attachment-Lifecycle im Sidebar

## Status

Proposed (Architecture-Pass 2026-05-10, ausgeloest durch FIX-19-28-05).

## Kontext

Das Sidebar verwaltet zwei parallele Attachment-Listen: eine Liste fuer die UI-Chip-Bar (kurzlebig, pro Compose-Turn) und eine Liste mit den vollstaendig geparsten Dokumenten-Texten (fuer den Tool-Layer, der Datei-Inhalte ueber `attachment_index` liest). Beide Listen wurden bisher in einer einzigen `clear()`-Methode zusammen geleert.

Der Send-Flow snapshottet die Chip-Bar-Liste (fuer den Render der User-Bubble), ruft dann `clear()` auf, faehrt 270 Zeilen Setup-Code durch und uebergibt erst danach die voll-Texte an den Tool-Layer. In dieser Spanne sind die voll-Texte bereits geleert. Konsequenz: der Tool-Layer arbeitet pro Turn auf einem leeren Array, jeder Aufruf von `read_document` oder `ingest_document` mit `attachment_index=0` schlaegt fehl.

Der Bug existiert seit dem Refactoring vom 2026-04-11 und wurde 4 Wochen lang von Symptom-Behandlungen verdeckt:

- FIX-19-28 (Issue #312): klarere Errormsg, `file://`-URI-Rejection im Triage-Tool, Stale-Mirror-Verbot in der Skill-Anleitung. Behandelt das Failure-Mode, nicht die Ursache.
- FIX-19-28-02: Skill-Disziplin (Source-Type-Detection, STOP-on-Error, Kosten-Disziplin). Beruhte auf der falschen Annahme "Turn 1 funktioniert, Turn 2 nicht".

FIX-19-28-05 hat den eigentlichen Lifecycle-Bug aufgedeckt. Diese ADR adressiert die Architektur-Frage hinter dem Bug: wie das Sidebar die zwei Lebenszyklen sauber trennt, damit das Pattern nicht erneut entsteht.

**Triggering ASRs (aus FIX-19-28-05 Architect-Handoff):**

- ASR-01 (Moderate): Snapshot-vor-Clear oder API-Split.
- ASR-02 (Moderate): Tool-State wird pro Send synchronisiert (kein State-Leak).

**Quality Attributes:** Maintainability, Testability, Drift-Resistance.

## Decision Drivers

- **Explizite Lebenszyklen.** Die UI-Bar lebt einen Compose-Turn, die voll-Texte leben so lange wie der laufende Tool-Run sie braucht. Beide in einer Methode zu mischen ist die Wurzel des Bugs.
- **Drift-Resistenz.** Eine reine Snapshot-Disziplin im Caller verhindert den heutigen Bug, aber nicht die naechste Variante davon. Jede zukuenftige Stelle die `clear()` aufruft, ist erneut anfaellig.
- **Minimaler Footprint.** Der Fix soll im Sidebar-Layer bleiben. Keine Aenderung an der Tool-API, keine neuen Dependencies, keine Refactorings ausserhalb des Hot-Pfads.
- **Atomic Snapshot+Clear.** Der Tool-Handoff muss garantiert die letzten Texte aus dem aktuellen Turn sehen UND sie danach im Sidebar-Speicher leeren. Race-frei, ohne explizite Aufruf-Reihenfolge.
- **Tool-State-Synchronisierung.** Der Tool-Layer haelt eine Referenz auf die Texte des aktiven Turns. Wenn der naechste Turn ohne Attachment kommt, muss diese Referenz aktiv geleert werden, sonst sieht das Tool das Attachment des vorherigen Turns.
- **Kein Persistent-State-Refactor.** Die Frage "Attachment ueber mehrere Turns lebendig halten" ist ein eigenes Konzept und gehoert in einen separaten IMP. Diese ADR loest nur den Lifecycle-Bug innerhalb eines Turns.

## Considered Options

### Option A -- Snapshot-Pattern im Caller

`AttachmentHandler.clear()` bleibt unveraendert (leert beide Listen). Der Caller (`AgentSidebarView.handleSendMessage`) wird so geaendert, dass er die voll-Texte in derselben Sequenz wie die Chip-Bar-Liste snapshottet, BEVOR er `clear()` aufruft. Der Snapshot wandert dann ueber die 270 Setup-Zeilen mit, bis er an den Tool-Layer uebergeben wird. Der Guard `if (length > 0)` wird entfernt, sodass der Tool-Layer in jedem Turn synchronisiert wird (auch mit leerem Snapshot).

- Pro: Kleinster Diff. Eine zusaetzliche Snapshot-Zeile, eine entfernte Bedingung.
- Pro: Keine API-Aenderung an `AttachmentHandler`.
- Con: Disziplin-Pflicht im Caller. Jede zukuenftige Stelle, die `clear()` aufruft (und zwischen Aufruf und Tool-Handoff Setup-Code hat), kann denselben Bug erneut produzieren.
- Con: `clear()` mischt weiterhin zwei Verantwortungen, die zwei Lebenszyklen entsprechen.

### Option B -- API-Split LIGHT mit atomarem Consume

`AttachmentHandler.clear()` wird so umgebaut, dass es nur die UI-naehe Verantwortung uebernimmt: die Chip-Bar leeren, Object-URLs revoken, die Pending-Liste leeren. Die voll-Texte werden NICHT mehr in `clear()` angefasst.

Eine neue Methode `consumeFullDocTexts(): string[]` wird hinzugefuegt: sie gibt eine Kopie der voll-Texte zurueck UND leert die interne Liste in einem Aufruf (atomar). Der Caller muss nur noch eine Methode aufrufen, um beides zu erledigen.

Im Send-Flow nutzt der Caller `clear()` direkt nach dem Pending-Snapshot (UI-Reset) und ruft `consumeFullDocTexts()` weiter unten beim Tool-Handoff (atomarer Snapshot+Clear). Der Guard `if (length > 0)` entfaellt; `setAttachmentTexts` wird in jedem Turn aufgerufen, bei leerem Turn mit leerem Array.

- Pro: Lifecycle ist explizit in der API codiert. `clear()` heisst "Bar leeren", `consumeFullDocTexts` heisst "Texte abholen und vergessen".
- Pro: Drift-Resistent. Eine zukuenftige Stelle, die `clear()` aufruft, kann den Bug nicht erneut produzieren, weil `clear()` die voll-Texte gar nicht mehr beruehrt.
- Pro: Atomarer Consume verhindert Time-of-Check / Time-of-Use Probleme bei der Snapshot-Disziplin.
- Pro: Tests koennen die zwei Lebenszyklen unabhaengig pruefen.
- Con: Eine neue Methode in der oeffentlichen API von `AttachmentHandler` (nur intern verwendet, aber dennoch additiv).
- Con: Marginal mehr Lines-of-Code (~10 Zeilen Methode plus Aufruf-Anpassung).

### Option C -- Tool-Side-Pull statt Push

Der Tool-Layer (`ReadDocumentTool`, `IngestDocumentTool`) verzichtet auf den `setAttachmentTexts`-Setter. Stattdessen halten die Tools eine schwache Referenz auf den `AttachmentHandler` und holen die Texte beim Tool-Aufruf direkt aus dem Sidebar-State. Das Sidebar haelt EINEN State, den Tool-Layer befragt ihn bei Bedarf.

- Pro: Eine einzige Source of Truth, keine Push-Synchronisierung noetig.
- Con: Tool-Layer wird hart an die Sidebar-Klasse gekoppelt. Bisher kennen die Tools nur ihre Plugin-Instanz, das Pull-Pattern wuerde eine direkte Sidebar-Referenz brauchen.
- Con: Tool ist ohne aktiven Sidebar nicht testbar (z.B. bei Headless-Tool-Aufrufen aus Workflows oder MCP).
- Con: Aenderung an mehr Stellen als der Bug verlangt. Hoeheres Regressionsrisiko.

## Decision

**Option B (API-Split LIGHT mit atomarem Consume).** Plus: `setAttachmentTexts` wird unconditional pro Send aufgerufen (Push-Pattern beibehalten, Guard entfernt).

### Begruendung

Option A loest den heutigen Bug, kodiert aber den Lifecycle nur in der Aufruf-Reihenfolge des Callers. Die naechste Code-Aenderung in der Naehe von `handleSendMessage` kann genau denselben Drift erneut produzieren. Der Bug-History (4 Wochen unentdeckt, zwei vorherige Symptom-Fixes) zeigt, dass implizite Disziplin in diesem Pfad nicht traegt.

Option C waere semantisch sauberer (single source of truth), kostet aber Aenderungen am Tool-Layer und an seinem Test-Setup. Der Bug ist klein, das Refactoring waere ueberproportional, und das Pull-Pattern wuerde die Sidebar-Tool-Kopplung verstaerken.

Option B kodiert den Lifecycle in der API selbst: `clear()` heisst "UI-Reset", `consumeFullDocTexts()` heisst "Tool-Handoff". Eine zukuenftige Stelle, die nur `clear()` aufruft, kann den Bug nicht erneut produzieren, weil sie die voll-Texte nicht mehr ungewollt loescht. Der atomarer Consume verhindert zusaetzlich, dass spaeterer Setup-Code zwischen Snapshot und Clear einen Race produziert.

Push-Pattern bleibt: `setAttachmentTexts` wird in jedem Turn aufgerufen. Der Guard `if (length > 0)` aus der heutigen Implementierung wird entfernt, weil er das Symptom des Bugs unsichtbar gemacht hat. Pull-Pattern (Option C) verschiebt das Problem in den Tool-Layer und macht ihn ohne Sidebar-Instanz nicht mehr testbar.

### Konkrete Form

Die API von `AttachmentHandler` wird wie folgt aussehen:

```
clear(): void
  // leert ausschliesslich die UI-nahen Strukturen
  // (pending, chipBar.empty(), revoke object URLs)
  // beruehrt fullDocTexts NICHT

consumeFullDocTexts(): string[]
  // gibt eine Kopie der voll-Texte zurueck
  // setzt die interne Liste atomar auf []
  // returns immer ein Array, ggf. leer
```

`setAttachmentTexts(...)` wird im Send-Flow IMMER aufgerufen, mit dem Ergebnis von `consumeFullDocTexts()`. Auch ein leeres Array wird durchgereicht und ueberschreibt den Tool-State des vorherigen Turns.

Konkrete File-Pfade und Line-Hints stehen im plan-context, nicht in dieser ADR.

## Consequences

### Positive

- Lifecycle ist explizit in der API. Der Drift-Pfad, der den heutigen Bug erzeugt hat, ist konstruktiv unmoeglich.
- State-Leak zwischen Turns ist konstruktiv unmoeglich (Push-Sync immer + atomarer Consume).
- `clear()` heisst jetzt was es tut, ohne unsichtbare Seiteneffekte.
- Unit-Tests koennen den UI-Reset und den Tool-Handoff separat pruefen, ohne den ganzen Send-Flow nachzubauen.
- Regression-Test fuer den heutigen Bug bekommt eine klare Schnittstelle.

### Negative

- Marginal groesseres API-Surface von `AttachmentHandler` (eine neue Methode).
- Aufruf-Sites, die heute `clear()` benutzen, muessen auf "leert nur Pending" geprueft werden. Suche nach `attachments.clear()` in der Codebase, jeder Aufruf wird begutachtet.

### Risks

- Falls eine andere Stelle als `handleSendMessage` (heute oder spaeter) erwartet, dass `clear()` auch die voll-Texte loescht, kann nach dem Umbau ein subtiler Memory-Leak entstehen (voll-Texte bleiben liegen, bis der naechste Send sie konsumiert). Mitigation: `MAX_TOTAL_DOC_TEXT_SIZE`-Schutz greift weiterhin auf `pushFullDocText`. Audit aller `attachments.clear()`-Aufrufe ist Pflicht im Coding-Pass.
- Falls der naechste Turn schnell startet, BEVOR der Tool-Run des vorherigen Turns die Texte konsumiert hat, ueberschreibt der zweite Send die Texte des ersten. Heute ist das genauso (Push-Pattern, gleicher Tool-State). Mitigation: keine -- der existierende Lifecycle ("ein aktiver Tool-Run pro Sidebar") bleibt.

## Implementation Notes

- Hot-Pfad ist `src/ui/sidebar/AttachmentHandler.ts` (heute Zeilen 263 bis 289 fuer `clear()` und `pushFullDocText`).
- Der Caller `AgentSidebarView.handleSendMessage` (heute Zeilen 1442 bis 1722) bekommt zwei Aenderungen: `clear()` bleibt fruehe Pending-Reset-Stelle, `consumeFullDocTexts()` wandert an die Tool-Handoff-Stelle.
- `setAttachmentTexts` ist heute auf `IngestDocumentTool` und `ReadDocumentTool` definiert. Das bleibt so. Der Loop in der Tool-Handoff-Stelle bleibt strukturell gleich, der `if`-Guard wird entfernt.
- Ein Unit-Test reproduziert den Bug auf der Schnittstelle: `getFullDocTexts()` zeigt Inhalt, dann `clear()` aufrufen (sollte fullDocTexts NICHT leeren), dann `consumeFullDocTexts()` zeigt Inhalt UND leert.
- Ein zweiter Unit-Test pruft den State-Leak: zwei Sequenzen `pushFullDocText` -> `consumeFullDocTexts`, das zweite Consume gibt einen leeren Array zurueck.
- Konkrete Files, Line-Ranges und Akzeptanztests stehen im plan-context, nicht hier.

## Alternativen-Verlauf

Diese ADR ist eine NEUE Entscheidung, sie ersetzt oder erweitert keine bestehende ADR. Sie ist tematisch unter EPIC-19 (Knowledge Maintenance / Ingest) verankert, weil der Trigger der Ingest-Workflow ist, betrifft aber das Sidebar-Layer technisch unabhaengig.
