---
fix: FIX-19-28-05
arch-completed: 2026-05-10
related-features: [FEAT-19-28, FEAT-19-31]
related-adrs: [ADR-112]
related-epics: [EPIC-19]
predecessor-fixes: [FIX-19-28-02, FIX-19-28]
branch: fix/19-28-05-attachment-clear-lifecycle
---

# plan-context FIX-19-28-05: Attachment-Lifecycle im Sidebar

## Tech-Stack (Stand 2026-05-10)

Bestehender Stack, **keine neuen Dependencies**:

- **Sprache:** TypeScript strict
- **Plugin-Framework:** Obsidian Plugin API
- **UI-Layer:** [src/ui/AgentSidebarView.ts](../../../src/ui/AgentSidebarView.ts), [src/ui/sidebar/AttachmentHandler.ts](../../../src/ui/sidebar/AttachmentHandler.ts)
- **Tool-Layer:** [src/core/tools/vault/ReadDocumentTool.ts](../../../src/core/tools/vault/ReadDocumentTool.ts), [src/core/tools/vault/IngestDocumentTool.ts](../../../src/core/tools/vault/IngestDocumentTool.ts)
- **Document-Parser:** [src/core/document-parsers/parseDocument.ts](../../../src/core/document-parsers/parseDocument.ts) (PDF/Office, unveraendert)
- **Test-Setup:** Jest, vorhandene Tests unter `__tests__/`-Unterordnern

## Architektur-Stil und Quality-Goals

**Stil:** Push-Pattern Sidebar -> Tool-Layer (`setAttachmentTexts`), explizite Lifecycle-Methoden in `AttachmentHandler` (eine fuer UI-Reset, eine fuer Tool-Handoff).

**Quality-Goals (Reihenfolge nach Wichtigkeit):**

1. **Bug-Fix in Turn 1.** `read_document` und `ingest_document` mit `attachment_index=0` funktionieren in dem Turn, in dem der User die Datei anhaengt.
2. **Drift-Resistenz.** Der API-Vertrag von `AttachmentHandler` macht den Lifecycle explizit, sodass zukuenftige Aufruf-Stellen den Bug nicht erneut produzieren koennen.
3. **Backward Compatibility.** Keine Aenderung an `ReadDocumentTool`/`IngestDocumentTool`-Public-API. Bestehende Skills und Workflows arbeiten unveraendert.
4. **Review-Bot-Compliance.** Keine `console.log`/`fetch`/`require`/`element.style.X = Y`/`innerHTML`/`any` neu einfuehren. Keine Em-Dashes, deutsche Umlaute korrekt.
5. **Testbarkeit.** Lifecycle-Aenderungen sind ohne UI reproducible (Unit-Test auf der `AttachmentHandler`-API).

## ADR-Summary-Tabelle

| ADR | Titel | Status | Verbindet FIX |
|-----|-------|--------|----------------|
| ADR-112 | Attachment-Lifecycle im Sidebar (Snapshot vs API-Split, Push-Sync zum Tool-Layer) | Proposed | FIX-19-28-05 |

## Kern-Entscheidungen aus ADR-112

### 1. API-Split LIGHT in `AttachmentHandler`

`AttachmentHandler.clear()` wird so umgebaut, dass es ausschliesslich die UI-nahe Verantwortung uebernimmt:

- pending-Liste leeren
- chipBar leeren
- Object-URLs revoken

`fullDocTexts` wird in `clear()` NICHT mehr angefasst.

Neue Methode `consumeFullDocTexts(): string[]`:

- gibt eine Kopie der voll-Texte zurueck
- setzt die interne Liste atomar auf `[]`
- returns immer ein Array (ggf. leer)

### 2. Push-Sync zum Tool-Layer ohne Guard

Im Send-Flow wird `setAttachmentTexts` IMMER aufgerufen, mit dem Ergebnis von `consumeFullDocTexts()`. Auch ein leeres Array wird durchgereicht. Der heutige Guard `if (docTexts.length > 0)` wird entfernt.

Effekt: alter State aus vorherigen Turns wird konstruktiv ueberschrieben, kein State-Leak.

### 3. Aufruf-Reihenfolge in `handleSendMessage`

Heute (gebrochen):

```
const attachments = [...this.attachments.pending];
this.attachments.clear();           // <- leert auch fullDocTexts (Bug)
... 270 Zeilen Setup ...
const docTexts = this.attachments.getFullDocTexts();  // <- immer []
if (docTexts.length > 0) { ... setAttachmentTexts(docTexts) }  // <- nie aufgerufen
```

Nach dem Fix:

```
const attachments = [...this.attachments.pending];
this.attachments.clear();           // <- leert nur Pending + chipBar
... 270 Zeilen Setup ...
const docTexts = this.attachments.consumeFullDocTexts();  // <- atomic snapshot+clear
for (const toolName of ['ingest_document', 'read_document'] as const) {
    ... setAttachmentTexts(docTexts) // <- immer, auch mit []
}
```

## Konkrete Implementations-Anleitung pro File

### File 1: `src/ui/sidebar/AttachmentHandler.ts`

**Aktuelle Struktur (Zeile 263-289):**

```typescript
clear(): void {
    for (const att of this.pending) {
        if (att.objectUrl) URL.revokeObjectURL(att.objectUrl);
    }
    this.pending.length = 0;
    this.fullDocTexts.length = 0;     // <- ENTFERNEN
    this.chipBar.empty();
}

getFullDocTexts(): string[] {
    return this.fullDocTexts;
}
```

**Aenderungen:**

1. In `clear()`: die Zeile `this.fullDocTexts.length = 0;` ENTFERNEN. JSDoc-Comment ueber der Methode anpassen, sodass dort steht, dass `clear()` jetzt ausschliesslich Pending + chipBar betrifft, nicht mehr fullDocTexts.

2. Neue Methode `consumeFullDocTexts()` hinzufuegen, direkt nach `getFullDocTexts()`:

```typescript
/**
 * Atomically returns and clears the full document texts.
 * Used by AgentSidebarView at tool-handoff to pass texts to
 * IngestDocumentTool/ReadDocumentTool while resetting the internal
 * buffer for the next turn.
 */
consumeFullDocTexts(): string[] {
    const snapshot = [...this.fullDocTexts];
    this.fullDocTexts.length = 0;
    return snapshot;
}
```

3. `getFullDocTexts()` bleibt erhalten (read-only Getter, ohne Side-Effekt). Die Tests duerfen den Getter weiterhin nutzen, der Send-Flow nutzt aber `consumeFullDocTexts()`.

### File 2: `src/ui/AgentSidebarView.ts`

**Aktuelle Struktur (Zeile 1442 und Zeile 1710-1722):**

```typescript
// Line 1442-1443
const attachments = [...this.attachments.pending];
this.attachments.clear();
... 270 Zeilen weiter ...

// Line 1710-1722
try {
    const docTexts = this.attachments.getFullDocTexts();
    if (docTexts.length > 0) {
        for (const toolName of ['ingest_document', 'read_document'] as const) {
            const tool = this.plugin.toolRegistry.getTool(toolName);
            if (tool && typeof (tool as ...).setAttachmentTexts === 'function') {
                (tool as ...).setAttachmentTexts(docTexts);
            }
        }
    }
} catch { /* non-critical -- tools will fall back to source_path */ }
```

**Aenderungen:**

1. Zeile 1442-1443: bleibt strukturell gleich. `clear()` leert jetzt nur Pending. Kein zusaetzlicher Snapshot von fullDocTexts noetig hier (kommt unten).

2. Zeile 1710-1722: zwei Aenderungen:
   - `getFullDocTexts()` durch `consumeFullDocTexts()` ersetzen.
   - Den `if (docTexts.length > 0)`-Guard ENTFERNEN. Der innere `for`-Loop wird unconditional ausgefuehrt; `setAttachmentTexts(docTexts)` wird auch mit leerem Array aufgerufen, sodass der Tool-Layer pro Turn synchronisiert wird.
   - Der `try { ... } catch` bleibt erhalten (Defensive-Layer).

Vor / nach:

```typescript
// vor
const docTexts = this.attachments.getFullDocTexts();
if (docTexts.length > 0) {
    for (const toolName of ['ingest_document', 'read_document'] as const) {
        const tool = this.plugin.toolRegistry.getTool(toolName);
        if (tool && typeof (tool as ...).setAttachmentTexts === 'function') {
            (tool as ...).setAttachmentTexts(docTexts);
        }
    }
}

// nach
const docTexts = this.attachments.consumeFullDocTexts();
for (const toolName of ['ingest_document', 'read_document'] as const) {
    const tool = this.plugin.toolRegistry.getTool(toolName);
    if (tool && typeof (tool as unknown as Record<string, unknown>).setAttachmentTexts === 'function') {
        (tool as unknown as { setAttachmentTexts(t: string[]): void }).setAttachmentTexts(docTexts);
    }
}
```

3. Audit aller anderen `attachments.clear()`-Aufrufe in der Datei. Stand 2026-05-10 sind drei Stellen relevant: Z.1443 (Send-Flow, hier diskutiert), Z.2587, Z.2917. Pruefen, ob diese Stellen die fullDocTexts-Loeschung weiterhin erwarten oder ob sie damals ungewollt mit-geleert haben. Wenn fullDocTexts dort weiterhin mit geloescht werden sollen, muss dort jetzt expliziert ein zusaetzlicher Aufruf `consumeFullDocTexts()` (Wert ignorieren) oder ein neuer Helper folgen. Im Coding-Pass: jede der drei Stellen kommentieren mit Auswertung.

### File 3: `src/core/tools/vault/ReadDocumentTool.ts` und `IngestDocumentTool.ts`

**Keine Aenderung der Public-API.** Die `setAttachmentTexts(texts: string[])`-Setter bleiben unveraendert (siehe ReadDocumentTool.ts Zeile 39-41 und IngestDocumentTool.ts Zeile 42-44).

**Optional (nice-to-have, kein Blocker):** Die JSDoc-Kommentare ueber `setAttachmentTexts` koennen aktualisiert werden, sodass dort steht: "Gets called on every send pass; an empty array explicitly resets the tool state to no-attachments." Verbessert die Lesbarkeit, aendert nichts am Verhalten.

## Test-Strategie

### Unit-Test 1: AttachmentHandler-Lifecycle

Pfad: `src/ui/sidebar/__tests__/AttachmentHandler.test.ts` (neu, falls noch nicht vorhanden) oder Erweiterung eines bestehenden Tests.

Szenario 1 (clear-Verantwortung):

```
gegeben: AttachmentHandler mit zwei pending-Items + zwei fullDocTexts
wenn:    clear() wird aufgerufen
dann:    pending.length === 0
und:     fullDocTexts ist UNVERAENDERT (zwei Eintraege)
```

Szenario 2 (consume-Atomicity):

```
gegeben: AttachmentHandler mit drei fullDocTexts
wenn:    consumeFullDocTexts() wird aufgerufen
dann:    Rueckgabe hat drei Eintraege (Kopie)
und:     fullDocTexts ist intern leer
```

Szenario 3 (consume-bei-leerem-State):

```
gegeben: AttachmentHandler ohne fullDocTexts
wenn:    consumeFullDocTexts() wird aufgerufen
dann:    Rueckgabe ist []
und:     fullDocTexts ist weiterhin []
```

### Unit-Test 2: State-Leak zwischen Turns

Pfad: gleicher Test-File wie oben.

Szenario:

```
gegeben: AttachmentHandler mit zwei pending + zwei fullDocTexts
wenn:    consumeFullDocTexts() wird aufgerufen
dann:    Rueckgabe hat zwei Eintraege

dann:    pushFullDocText("nichts neues") wird NICHT aufgerufen (zweiter Turn ohne Attachment)
wenn:    consumeFullDocTexts() wird erneut aufgerufen
dann:    Rueckgabe ist [] (kein Leak)
```

### Integration-Test (optional): Tool-Sync

Wenn ein leichter Test moeglich ist:

```
gegeben: ReadDocumentTool, gemockter Plugin
wenn:    setAttachmentTexts(["text-A"]) und dann execute({attachment_index: 0})
dann:    pushToolResult bekommt "text-A"

wenn:    setAttachmentTexts([]) und dann execute({attachment_index: 0})
dann:    pushToolResult bekommt die "No chat attachments available"-Errormsg
```

### Live-Test (manuell)

Sebastian fuehrt aus:

1. Plugin-Build laden (Obsidian-Session aktiv).
2. PDF in den Chat ziehen (z.B. EnBW-Geschaeftsbericht).
3. Eingabe `/ingest-deep <freier Text>` und Senden.
4. Erwartet:
   - Plan wird erstellt, ingest_triage laeuft durch (wie heute).
   - read_document oder ingest_document mit attachment_index=0 funktioniert (NICHT mehr "0 attachments available").
   - Note in Notes/ enthaelt echten Inhalt aus der PDF, mit echten Block-Refs.
5. Console-Log: keine "No chat attachments available"-Errors waehrend des `/ingest-deep`-Runs.
6. Folgetest fuer State-Leak: zweiter Send ohne neues Attachment, Tool-Aufruf scheitert weiterhin sauber (kein silentes Auflesen alter Texte).

## Constraints fuer den Coder

- **Reihenfolge:** Erst Unit-Test schreiben (RED), dann `AttachmentHandler.ts` aendern, dann `AgentSidebarView.ts` aendern, dann Test gruen pruefen (GREEN), dann Live-Test.
- **Audit:** Alle `attachments.clear()`-Aufrufe in `AgentSidebarView.ts` pruefen (heute drei Stellen). Jede Stelle kommentieren mit Auswertung "fullDocTexts-Loeschung benoetigt? Ja/Nein/Unklar".
- **Build + Deploy:** Nach jedem Implementierungsschritt `npm run dev` (oder `npm run build` + `npm run deploy`) ausfuehren, ueber den Watch-Loop in iCloud-Vault deployen.
- **Review-Bot:** Keine neuen Verstoesse einfuehren. Beim Audit der drei `attachments.clear()`-Stellen ggf. JSDoc ergaenzen, aber kein neuer `console.log`, kein `any`, kein `innerHTML`.
- **Out-of-Scope:** Persistent-State-IMP NICHT in diesem PR. Skill-Vereinfachung in `/ingest-deep` (Step 0a "erst in Vault speichern") NICHT in diesem PR. Diese kommen separat unter EPIC-19.

## Performance & Memory

Keine Performance-Regression erwartet:

- `consumeFullDocTexts()` ist O(N) auf der Anzahl Attachments (typisch <= 5). Spread-Operator macht eine flache Kopie, keine Tiefenkopie.
- `MAX_TOTAL_DOC_TEXT_SIZE`-Schutz aus `pushFullDocText` bleibt unveraendert.
- Tool-Layer-Tests laufen weiter wie heute, keine Aenderung der Datentypen.

## External Integrations

Keine.

---

## Kontext-Dokumente fuer Claude Code

Claude Code sollte folgende Dokumente als Kontext lesen:

1. [_devprocess/architecture/ADR-112-attachment-lifecycle-im-sidebar.md](../architecture/ADR-112-attachment-lifecycle-im-sidebar.md) (Decision)
2. [_devprocess/requirements/fixes/FIX-19-28-05-attachment-clear-lifecycle.md](../requirements/fixes/FIX-19-28-05-attachment-clear-lifecycle.md) (FIX-Detail mit AC + Test-Strategie)
3. [_devprocess/requirements/handoff/architect-handoff-fix-19-28-05.md](architect-handoff-fix-19-28-05.md) (RE-Output, fuer Q-Antworten und Out-of-Scope-Begruendung)

---

## Dialog

### Questions from Coder to Architect

| ID | Date | Question | Addressed by | Status |
|---|---|---|---|---|

### Answers from Architect

| ID | Date | Answer | Affected artifacts | Status |
|---|---|---|---|---|

### Dialog rules

Wie im Standard-Template (siehe `skills/architecture/templates/plan-context-TEMPLATE.md`).
