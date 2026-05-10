---
fix: FIX-19-28-05
re-completed: 2026-05-10
related-features: [FEAT-19-28, FEAT-19-31]
related-epics: [EPIC-19]
predecessor-fixes: [FIX-19-28-02, FIX-19-28]
branch: fix/19-28-05-attachment-clear-lifecycle
---

# Architect-Handoff FIX-19-28-05: AttachmentHandler Lifecycle

**Status:** Ready for Architect
**Last update:** 2026-05-10
**Author:** /requirements-engineering

---

## 1. Scope

- **Scope:** P0-Bugfix unter EPIC-19. Kein Feature, kein Refactor des Skill-Layers. Engste Korrektur des Bugs in [src/ui/AgentSidebarView.ts](../../../src/ui/AgentSidebarView.ts) plus Regression-Tests.
- **Main goal:** `/ingest-deep` und alle anderen Skills, die Chat-Attachments via `read_document` oder `ingest_document` lesen, funktionieren in Turn 1.
- **Target release:** kommende Version 2.5.x (auf den Live-Test mit EnBW-PDF reagierend).

## 2. Architecturally Significant Requirements (ASRs)

| ID | Source | Classification | Constraint | Notes |
|---|---|---|---|---|
| ASR-01 | FIX-19-28-05 NFR-T01 | Moderate | Snapshot-vor-Clear oder API-Split. Architekt waehlt das Pattern. | Beide Optionen sind klein, aber API-Split ist langlebiger gegen Drift. |
| ASR-02 | FIX-19-28-05 NFR-T02 | Moderate | Tool-State wird pro Send-Pass synchronisiert (auch mit leerem Array). | Verhindert silent State-Leaks zwischen Turns. |

Keine Critical ASRs. Der Fix ist klein genug, dass er in einem ADR-Anhang oder einem schlanken neuen ADR erschlagen werden kann.

## 3. Non-Functional Requirements summary

| Category | Target | Source |
|---|---|---|
| Performance | Keine Regression. Snapshot ist O(N) auf bis zu 4 MB Text-Buffer (Worst-Case bei MAX_TOTAL_DOC_TEXT_SIZE). | NFR-T03 |
| Memory | `MAX_TOTAL_DOC_TEXT_SIZE`-Schutz bleibt aktiv. Snapshot-Kopie fuegt einen weiteren Array-Reference hinzu, kein zusaetzlicher Memory-Footprint solange beide auf dieselben Strings zeigen. | NFR-T03 |
| Backward compatibility | Keine Aenderung an `ReadDocumentTool` / `IngestDocumentTool` Public-API. Bestehende Tool-Aufrufe in Skills laufen weiter ohne Anpassung. | NFR-T04 |
| Observability | Console-Log bleibt unveraendert (existierende STOP-Errormsg aus FIX-19-28 ist weiterhin der Failure-Pfad fuer `attachmentTexts.length === 0`). | n/a |

## 4. Constraints

- **Stack-Constraint:** TypeScript strict, Obsidian Plugin API. Keine neuen Dependencies.
- **Review-Bot:** Keine `console.log`/`fetch`/`require`/`element.style.X = Y`/`innerHTML`/`any`-Hits in den geaenderten Files.
- **Out-of-Scope (binding):**
  - Persistent attachment state ueber den AgentTask-Lifecycle. Ein User der in Turn 2 ohne neues Attachment fragt, kann das Attachment aus Turn 1 weiterhin nicht abrufen. Eigenes IMP unter EPIC-19, bewusst getrennt.
  - Skill-Architektur-Vereinfachung in `/ingest-deep`. Step 0a ("erst in Vault speichern") wurde nur als Workaround eingebaut und kann spaeter zurueckgebaut werden, sobald der Fix wirkt. FEAT-19-31-Folgearbeit, nicht dieser FIX.
- **Test-Constraint:** Es gibt keinen automatisierten UI-Driver fuer den Sidebar (Live-Tests sind manuell). Der Regression-Test arbeitet auf der `AttachmentHandler` + `setAttachmentTexts`-Schnittstelle, nicht ueber den UI-Pfad.

## 5. Open Questions (an den Architekten)

Diese Fragen sind Architektur-Entscheidungen, die `/architecture` adressieren soll. Keine ist Blocker fuer den Fix selbst, aber sie pruegen das spaetere Drift-Risiko.

### Q-01: Snapshot-Pattern oder API-Split fuer `AttachmentHandler.clear()`?

Zwei Optionen, beide loesen den Bug:

**Option A (Snapshot-Pattern, minimal-invasiv):**
- In [src/ui/AgentSidebarView.ts:1442](../../../src/ui/AgentSidebarView.ts#L1442) zusaetzlich `const docTexts = [...this.attachments.getFullDocTexts()];` snapshotten.
- `setAttachmentTexts(docTexts)` direkt nach dem Snapshot aufrufen, vor `clear()`. Oder Snapshot-Variable bis zur bestehenden Stelle in Z.1713 ueberleben.
- Keine Aenderung an `AttachmentHandler.ts`.
- Risiko: jeder zukuenftige Aufrufer von `attachments.clear()` muss die Snapshot-Disziplin selbst halten.

**Option B (API-Split, semantisch klarer):**
- `AttachmentHandler.clear()` aufteilen in `clearPending()` (UI-Bar leeren, ohne fullDocTexts anzufassen) und `clearAll()` (vollstaendiger Reset).
- Im `handleSendMessage` nur `clearPending()` aufrufen. `fullDocTexts` werden weiter unten an die Tools uebergeben und dann explizit auf `[]` gesetzt nach erfolgreichem Send (oder bei `onStop` / Abort).
- Aenderung an `AttachmentHandler.ts` (kleine API-Erweiterung).
- Risiko: zwei Methoden statt einer, leicht erhoehte Komplexitaet.

**RE-Empfehlung:** Option B. Der Bug zeigt, dass `clear()` zwei Verantwortungen hat (Pending + DocTexts), die in zwei verschiedene Phasen des Send-Flows gehoeren. Ein API-Split macht das explizit und verhindert eine erneute Drift, wenn `handleSendMessage` weiter waechst.

### Q-02: setAttachmentTexts immer aufrufen oder Tool-Side-Reset?

NFR-T02 verlangt, dass alter State nicht leakt. Zwei Wege:

**Option A (Push):** `setAttachmentTexts` wird auf JEDEM Send-Pass aufgerufen, mit aktueller Liste oder explizit `[]`. Der `if (docTexts.length > 0)`-Guard in `AgentSidebarView.ts:1714` wird entfernt.

**Option B (Pull):** Tool-Layer pflegt eine schwache Referenz auf `AgentSidebarView.attachments` und holt sich die Texte beim Tool-Aufruf. Sidebar pflegt nur einen einzigen State.

**RE-Empfehlung:** Option A. Push-Pattern existiert schon, Aenderung ist eine entfernte Bedingung. Pull-Pattern wuerde die Tool-Sidebar-Kopplung ungesund verstaerken.

### Q-03: ADR oder ADR-Notiz?

Der Fix ist klein. Frage an den Architekten:
- Reicht eine Notiz in einem bestehenden ADR (z.B. ADR-103 zur Ingest-Pipeline)?
- Oder ist ein eigener ADR (z.B. ADR-112 "Attachment-Lifecycle im Sidebar") angebracht, weil die Wahl Snapshot vs. API-Split eine wiederverwendbare Konvention etabliert?

**RE-Empfehlung:** Eigener ADR, klein gehalten. Begruendung: das Snapshot-vs-Split-Muster ist hier einmal aufgetaucht, wird aber bei jedem zukuenftigen "vor send leere ich..."-Refactor wiederkehren. Eine dokumentierte Entscheidung schuetzt vor erneuten Drift-Bugs.

## 6. Dialog

### Questions from Architect to RE

| ID | Date | Question | Addressed by | Status |
|---|---|---|---|---|

### Answers from RE

| ID | Date | Answer | Affected artifacts | Status |
|---|---|---|---|---|

### Dialog rules

Wie im Standard-Template (siehe `skills/requirements-engineering/templates/ARCHITECT-HANDOFF-TEMPLATE.md`).

## 7. Ready-to-design checklist

- [x] Alle Critical ASRs haben quantifizierte Constraints (keine Critical ASRs, beide Moderate)
- [x] NFR-Tabelle hat Zahlen oder klare Boundaries (Memory-Bound, Tool-API-Stabilitaet)
- [x] Quelle FIX-Detail ist verlinkt
- [x] Open Questions sind kategorisiert (Q-01 Architektur-Pattern, Q-02 State-Sync, Q-03 ADR-Granularitaet)
- [x] Out-of-Scope explizit (Persistent State, Skill-Vereinfachung)
- [x] Handoff im Projekt-Style geschrieben (keine Em-Dashes, keine AI-Vokabeln)
