---
id: FIX-19-28-05
feature: FEAT-19-28
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FIX-19-28-02]
created: 2026-05-10
---

# FIX-19-28-05: AttachmentHandler.clear() laeuft vor setAttachmentTexts (Lifecycle-Bug)

**Prioritaet:** P0 (Skill-Design `/ingest-deep` ist solange unerfuellbar wie der Bug existiert; jeder Live-Test mit PDF-Attachment scheitert in Turn 1)
**Feature-Bezug:** FEAT-19-28 (Source-Position-Marker), FEAT-19-31 (Skill-Suite), EPIC-19
**Verwandt:** FIX-19-28-02 (gleiche Beobachtung, falsche Diagnose: ging von "Turn 2+" aus, real ist es Turn 1)
**Entdeckt:** 2026-05-10 (Live-Test EnBW-Geschaeftsbericht 2025 PDF mit `/ingest-deep`)
**Existiert seit:** Commit 67d5b1cd (2026-04-11), 4 Wochen unentdeckt

---

## Problem

Live-Test `/ingest-deep enbw-geschaeftsbericht-2025.pdf` (PDF als Chat-Attachment in Turn 1) zeigt:

1. `ingest_triage` laeuft erfolgreich durch (Tool nutzt nur `<attached_document>`-Block aus Kontext, nicht `attachmentTexts`).
2. Drei `read_document(attachment_index=0, start_page=..., end_page=...)`-Aufrufe scheitern alle mit der STOP-Errormsg aus FIX-19-28 (Issue #312).
3. Agent ignoriert das `Kein Stale-Mirror-Workaround`-Verbot aus dem Skill und schreibt eine fabrizierte "Deep Ingest"-Note mit dead Block-Refs zu einer nicht existierenden Quelldatei `Sources/EnBW-Geschaeftsbericht-2025-Mirror`.

Der Bug ist also doppelt sichtbar: (a) Tool-Aufrufe scheitern obwohl der User in derselben Message ein Attachment gesendet hat, (b) Skill-Compliance reicht nicht, der Agent wirkt sich um den Error herum.

### Failure-Trace (aus dem Chat-Transkript 2026-05-10)

```
Plan: 10 action(s)
- Triage: Scan document structure ... -> ok
- read_document attachment_index=0, start_page=32, end_page=50  -> "0 attachments available. STOP. ..."
- (retry, dieselbe Errormsg)
- read_document attachment_index=0, start_page=84, end_page=115 -> dieselbe Errormsg
- (retry, dieselbe Errormsg)
- read_document attachment_index=0, start_page=136, end_page=155 -> dieselbe Errormsg
- (retry, dieselbe Errormsg)
- write_file Notes/EnBW Annual Report 2025 -- Deep Ingest.md (mit Block-Refs zu nicht existierendem Mirror)
- Verification-Warning weil quantifier-todo "all" mit nur 1 file claim
- AskUserQuestion "Source-mirror erstellen oder skip?"
```

### Console-Output

```
plugin:obsilo-agent:301886 [AgentTask] Tool error in read_document: Error: No chat attachments available on this turn. The chat-attachment lifetime is one turn ...
    at ReadDocumentTool.execute (plugin:obsilo-agent:250431:19)
    at _ToolExecutionPipeline.executeTool (plugin:obsilo-agent:1425:22)
    at async runTool (plugin:obsilo-agent:233019:28)
    at async _AgentTask.run (plugin:obsilo-agent:233080:30)
    at async _AgentSidebarView.handleSendMessage (plugin:obsilo-agent:239084:5)
```

## Root Cause

[src/ui/AgentSidebarView.ts:1442-1443](src/ui/AgentSidebarView.ts#L1442-L1443) snapshottet `pending` und ruft dann `clear()`. [src/ui/sidebar/AttachmentHandler.ts:263-270](src/ui/sidebar/AttachmentHandler.ts#L263-L270) `clear()` leert sowohl `pending.length = 0` als auch `fullDocTexts.length = 0`.

270 Zeilen weiter unten in derselben `handleSendMessage`-Methode liest [src/ui/AgentSidebarView.ts:1713](src/ui/AgentSidebarView.ts#L1713) `getFullDocTexts()` und uebergibt das Ergebnis an `setAttachmentTexts()` ([src/ui/AgentSidebarView.ts:1714-1721](src/ui/AgentSidebarView.ts#L1714-L1721)). Weil `clear()` davor lief, ist `docTexts` immer `[]`, der `if (docTexts.length > 0)`-Guard greift, und `setAttachmentTexts` wird nie aufgerufen.

`ReadDocumentTool.attachmentTexts` (initialisiert auf `[]`) bleibt damit fuer den ganzen Turn leer, obwohl der User gerade ein PDF angehaengt hat.

### Kette

```
handleSendMessage(text)
  Z.1442  attachments := pending-snapshot           (nur pending, nicht fullDocTexts)
  Z.1443  this.attachments.clear()
            -> pending.length      = 0
            -> fullDocTexts.length = 0              (DAS ist der Killer)
  ... 270 Zeilen Code (UI-Setup, ApiHandler-Resolve, AbortController, etc.) ...
  Z.1713  docTexts := getFullDocTexts()             -> []  (clear war oben)
  Z.1714  if (docTexts.length > 0)                  -> FALSE
  Z.1715  // setAttachmentTexts(...) wird nie aufgerufen
  ... AgentTask.run() startet ...
  Tool-Aufruf: read_document(attachment_index=0)
    -> ReadDocumentTool.attachmentTexts == []
    -> wirft "No chat attachments available on this turn ..."

Sekundaerer State-Leak: Wenn ein VORHERIGER Turn Attachments hatte, bleibt
attachmentTexts vom alten Turn stehen, weil setAttachmentTexts() niemals
mit [] aufgerufen wird (der >0-Guard verhindert das auch).
```

## Warum FIX-19-28-02 das nicht erfasst hat

FIX-19-28-02 (2026-05-07) ging von folgendem Modell aus:

> "Auf Turn 1 (User uploadet PDF): `getFullDocTexts()` gibt `[parsedPdfText]` zurueck -> `attachmentTexts.length === 1` -> Tool funktioniert.
> Auf Turn 2+ ... `getFullDocTexts()` gibt `[]` zurueck."

Die Annahme "Turn 1 funktioniert" ist falsch. Schon in Turn 1 ist `attachmentTexts` leer, weil `clear()` zwischen Snapshot und `getFullDocTexts()` laeuft. FIX-19-28-02 hat dadurch nur Symptome adressiert (besseres Errormsg, Skill-Disziplin), aber nicht den Bug.

FIX-19-28 (Issue #312, gemerged) hat ebenfalls nur Symptome adressiert: `file://`-URI-Rejection in `ingest_triage`, STOP-Guidance im `ReadDocumentTool`-Errormsg, "Kein Stale-Mirror"-Verbot im Skill. Alle drei greifen erst, wenn der Bug zugeschlagen hat.

## Scope dieses FIX

In-Scope:

1. **Code-Fix in `AgentSidebarView.handleSendMessage`:** Snapshot `fullDocTexts` BEVOR `clear()` laeuft, analog zum bestehenden `pending`-Snapshot. Dann den gesnapshotten Array an `setAttachmentTexts()` uebergeben.
2. **State-Leak schliessen:** `setAttachmentTexts()` IMMER aufrufen (auch mit `[]`), damit alter State aus vorherigen Turns nicht leakt. Den `if (docTexts.length > 0)`-Guard entfernen.
3. **Regression-Test:** Unit-Test (`AttachmentHandler` + `ReadDocumentTool`-Integration) der den Lifecycle reproduziert.

Out-of-Scope (separates Folge-Issue):

- **Persistent attachment state ueber den Task-Lifecycle.** Wenn der User in Turn 2 eine Folge-Message ohne neues Attachment schickt, sollte das Attachment aus Turn 1 fuer den laufenden AgentTask weiterhin abrufbar sein (fuer "echte" Multi-Turn-Skills). Das ist ein separates Architektur-Thema (eigener IMP unter EPIC-19).
- **Skill-Architektur-Vereinfachung.** Solange der Bug existiert, hat sich `/ingest-deep` so entwickelt, dass es Chat-Attachments umschiffen muss (Step 0a "erst in Vault speichern"). Nach dem Fix kann dieser Step vereinfacht werden.

## User-Outcome (was sich nach dem Fix sichtbar aendert)

- `/ingest-deep` mit Datei-Chat-Attachment liefert eine Notiz, deren Inhalt aus der tatsaechlich angehaengten Datei stammt.
- Keine fabrizierten Block-Refs zu nicht existierenden Mirror-Dateien.
- Keine Errormsg-Storms im Console-Log waehrend `/ingest-deep` auf Chat-Attachments.
- Tool-Aufrufe in spaeteren Turns ohne neues Attachment scheitern weiterhin (Persistent-State ist out-of-scope dieses FIX), aber mit klarer Errormsg statt mit silentem Fall-Through auf alten Attachment-State.

## Akzeptanzkriterien

| ID | Criterion | Verifikationsart |
|---|---|---|
| AC-01 | In dem Turn in dem der User eine Datei anhaengt, kann der Agent ueber das Attachment-Tooling den vollstaendigen Inhalt der Datei lesen, ohne "0 attachments available"-Error zu bekommen. | Live-Test + Unit-Test |
| AC-02 | `/ingest-deep` mit PDF-Chat-Attachment in Turn 1 produziert eine Notiz, deren Quelltext mit dem geparsten Inhalt der Datei uebereinstimmt (kein Stale-Mirror-Fallback, keine dead Block-Refs). | Live-Test |
| AC-03 | Beginnt ein neuer Turn ohne Attachment, sieht der Agent keine Reste aus vorherigen Turns. Der Attachment-State des Tool-Layers ist explizit leer. | Unit-Test |
| AC-04 | Live-Test `/ingest-deep` mit PDF-Chat-Attachment laeuft ohne Retry-Loop und ohne fabrizierte Notiz durch (Plan -> Triage -> ingest_document/ingest_deep -> Note mit echten Block-Refs). | Live-Test |
| AC-05 | Automatisierter Regression-Test reproduziert den Lifecycle-Bug (clear-vor-handoff im selben Turn) und faengt eine zukuenftige Regression vor dem Build ab. | Unit-Test |

## Technical NFRs

Die folgenden Punkte sind nicht user-sichtbar, aber binding fuer den Fix:

- NFR-T01: Der Snapshot der Attachment-Texte erfolgt VOR jedem `clear()`-Aufruf im selben Lifecycle-Schritt. Alternative: `clear()` wird in zwei Methoden aufgeteilt, die explizit benannt sind (z.B. `clearPending` vs. `clearAll`).
- NFR-T02: Der Tool-State (`ReadDocumentTool.attachmentTexts`, `IngestDocumentTool.attachmentTexts`) wird auf JEDEM Send-Pass synchronisiert (auch mit `[]`), damit alter State aus vorherigen Turns nicht silent leakt.
- NFR-T03: `MAX_TOTAL_DOC_TEXT_SIZE`-Schutz aus `AttachmentHandler` bleibt erhalten (kein OOM bei grossen PDFs).
- NFR-T04: Keine neuen Public-API-Aenderungen an `ReadDocumentTool` / `IngestDocumentTool`. Der Fix bleibt im Sidebar-Layer.

## Test-Strategie

1. **Unit-Test fuer den Lifecycle.** Reproduziert den Bug: Erst `getFullDocTexts()` mit befuelltem State pruefen, dann `clear()` aufrufen, dann erneut `getFullDocTexts()` und sicherstellen dass die Reihenfolge korrekt ist. Plus: Pruefe dass `setAttachmentTexts` nach Send aufgerufen wurde.
2. **Integration-Test fuer State-Leak.** Zwei Sequential-Sends: erster mit Attachment, zweiter ohne. Pruefe dass `ReadDocumentTool.attachmentTexts` zu Beginn des zweiten Sends `[]` ist.
3. **Live-Test (manuell).** PDF in Chat ziehen, `/ingest-deep <text>` senden, Console + UI beobachten. Erfolg: Note hat echten Inhalt, keine Errors im Log, keine Retry-Loop.

## Files (vorraussichtlich)

- `src/ui/AgentSidebarView.ts`: snapshot `fullDocTexts` vor `clear()`, `setAttachmentTexts` immer aufrufen.
- `src/ui/AgentSidebarView.test.ts` oder neuer Test im `__tests__`-Ordner: Regression-Test fuer Lifecycle.
- ggf. `src/ui/sidebar/AttachmentHandler.ts`: Klare Trennung zwischen `clearPending()` und `clearAll()` (zur Diskussion in der ARCH-Phase).

## Repro

1. Plugin-Build laden (Obsidian-Session aktiv).
2. PDF in den Chat ziehen (z.B. EnBW-Geschaeftsbericht).
3. Eingabe `/ingest-deep <freier Text>` und Senden.
4. Console oeffnen: `plugin:obsilo-agent:* Tool error in read_document: Error: No chat attachments available on this turn` erscheint.
5. UI: Plan mit ~10 Aktionen, mehrere `read_document`-Aufrufe alle mit Errormsg, am Ende fabrizierte Note in `Notes/`.

## Fix

Implementiert via PLAN-17 / ADR-112 am 2026-05-10.

- `src/ui/sidebar/AttachmentHandler.ts`: `clear()` verengt auf UI-Reset (pending + chipBar); `consumeFullDocTexts()` neu hinzugefuegt mit atomarem Snapshot+Clear (gibt eine flache Kopie zurueck und leert intern).
- `src/ui/AgentSidebarView.ts:1710-1722` (Send-Flow Tool-Handoff): `getFullDocTexts()` durch `consumeFullDocTexts()` ersetzt; `if (docTexts.length > 0)`-Guard entfernt; `setAttachmentTexts` wird jetzt unconditional pro Turn aufgerufen.
- `src/ui/AgentSidebarView.ts:2587` (newConversation-Reset) und `:2917` (loadConversation): nach `clear()` wird `void this.attachments.consumeFullDocTexts()` ergaenzt, damit Conversation-Wechsel die fullDocTexts explizit leert.

## Regression test

`src/ui/sidebar/__tests__/AttachmentHandler.test.ts` mit 5 Szenarien:

1. `clear()` laesst `fullDocTexts` unveraendert.
2. `consumeFullDocTexts()` gibt Snapshot zurueck und leert atomar.
3. Snapshot ist eine flache Kopie (Mutationen am Returnwert leaken nicht in den State).
4. `consumeFullDocTexts()` auf leerem State gibt `[]` zurueck.
5. State-Leak-Schutz: zweiter `consumeFullDocTexts()` ohne dazwischen geschobenes `pushFullDocText()` gibt `[]` zurueck.

Regression test verified via red-green cycle on 2026-05-10:
- GREEN with fix: 5/5 passing.
- RED with fix stashed: 5/5 failing (4x `consumeFullDocTexts is not a function`, 1x clear() leakage).
- GREEN after stash pop: 5/5 passing.

Volle Test-Suite: 1346/1346 gruen (vorher 1341, +5 neue Tests). Build (tsc + esbuild) exit 0, Auto-Deploy in iCloud-Vault erfolgreich.
