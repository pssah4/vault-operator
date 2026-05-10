---
id: PLAN-17
title: FIX-19-28-05 Attachment-Lifecycle im Sidebar
date: 2026-05-10
feature-refs: [FEAT-19-28, FEAT-19-31]
adr-refs: [ADR-112]
fix-refs: [FIX-19-28-05]
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-claude-opus-4-7
---

# PLAN-17: FIX-19-28-05 Attachment-Lifecycle im Sidebar

Dieser Plan setzt ADR-112 um. Reihenfolge: Tests RED -> Tool aendern -> Caller aendern -> Tests GREEN -> Build/Deploy -> Live-Test (Sebastian).

## Tasks

### Task 1: Unit-Tests fuer AttachmentHandler-Lifecycle (RED)

- Create: `src/ui/sidebar/__tests__/AttachmentHandler.test.ts`
- Drei Szenarien fuer Lifecycle:
  1. `clear()` leert pending, beruehrt fullDocTexts NICHT
  2. `consumeFullDocTexts()` gibt Kopie zurueck und leert intern
  3. `consumeFullDocTexts()` auf leerem State gibt `[]` zurueck und State bleibt leer
- Plus State-Leak-Szenario:
  4. Nach erstem `consumeFullDocTexts()` ohne neues `pushFullDocText()` gibt der zweite `consumeFullDocTexts()` `[]` zurueck
- Test wird zunaechst RED laufen, weil `consumeFullDocTexts` noch nicht existiert und `clear()` heute auch fullDocTexts leert.
- `pushFullDocText` ist private; Test muss ueber den oeffentlichen Pfad (`processFile`) gehen ODER: TestHelper-Subklasse mit Reflection auf das Array. Loesung: Test-File greift via `as unknown as { fullDocTexts: string[] }` direkt auf das interne Array zu (analog zu bestehenden Test-Patterns im Projekt).

### Task 2: AttachmentHandler.ts aendern

- Modify: `src/ui/sidebar/AttachmentHandler.ts:263-289`
- In `clear()`: Zeile `this.fullDocTexts.length = 0;` entfernen. JSDoc anpassen: `clear()` clears the chip-bar UI only (pending list + chipBar.empty()); `fullDocTexts` are managed separately via `consumeFullDocTexts()`.
- Neue Methode `consumeFullDocTexts(): string[]` einfuegen direkt nach `getFullDocTexts()`:
  ```ts
  consumeFullDocTexts(): string[] {
      const snapshot = [...this.fullDocTexts];
      this.fullDocTexts.length = 0;
      return snapshot;
  }
  ```

### Task 3: AgentSidebarView.ts aendern (Send-Flow)

- Modify: `src/ui/AgentSidebarView.ts:1710-1722`
- `getFullDocTexts()` -> `consumeFullDocTexts()`
- if-Guard `if (docTexts.length > 0)` entfernen, Loop unconditional ausfuehren
- Vorher/Nachher gemaess plan-context-fix-19-28-05 Sektion "File 2"

### Task 4: AgentSidebarView.ts Audit der weiteren clear()-Aufrufe

- Modify: `src/ui/AgentSidebarView.ts:2587` (newConversation-Reset)
- Modify: `src/ui/AgentSidebarView.ts:2917` (loadConversation)
- Beide Stellen: nach `this.attachments.clear();` ergaenzen `void this.attachments.consumeFullDocTexts();`. Conversation-Wechsel und neuer Chat sollen den Tool-State explizit leeren, damit alte Texte nicht in das neue Gespraech leaken.
- Comment in derselben Zeile: `// drop full doc texts on conversation switch`

### Task 5: Tests laufen (GREEN)

- Run: `npx jest src/ui/sidebar/__tests__/AttachmentHandler.test.ts`
- Erwartung: 4 Tests gruen.
- Run: `npx jest` (gesamte Suite) -- erwartet keine neuen Failures.

### Task 6: Build + Deploy

- Run: `npm run build`
- Erwartung: tsc + esbuild exit 0.
- Run: `npm run deploy`
- Erwartung: Auto-Deploy in iCloud-Vault.

### Task 7: Regression-Test-Cycle

Skill-vorgeschriebener 6-Step-Cycle (siehe coding-Skill Phase 4b):
1. Tests laufen GREEN (after Fix).
2. Stash der Code-Aenderungen via `git stash`.
3. Tests laufen ROT (Bug ist wieder da).
4. `git stash pop`.
5. Tests laufen GREEN (Fix restauriert).
6. FIX-Detail `## Regression test`-Section befuellen mit Vermerk "verified via red-green cycle on 2026-05-10".

### Task 8: Live-Test (Sebastian)

Anleitung steht in plan-context-fix-19-28-05.md Sektion "Live-Test (manuell)". Sebastian macht das nach Coding-Phase-Ende.

## Coverage Gate

| AC | Task |
|---|---|
| AC-01 (Datei lesbar im selben Turn) | Task 3 (consumeFullDocTexts vor Tool-Handoff) |
| AC-02 (`/ingest-deep` ohne Errormsg in Turn 1) | Task 3 + Task 8 (Live-Test) |
| AC-03 (kein State-Leak) | Task 4 (consumeFullDocTexts auf Conversation-Reset) + Task 1 Szenario 4 |
| AC-04 (Live-Test ohne Retry-Loop) | Task 8 |
| AC-05 (Regression-Test) | Task 1 + Task 7 (red-green cycle) |

ADR-112 Decision (API-Split LIGHT, Push immer, atomarer Consume) wird durch Tasks 2 + 3 + 4 vollstaendig operationalisiert.

## Change Log

(append-only; jeder Mid-course-Trigger ergaenzt hier eine Zeile)

## Implementation Notes

Implementiert 2026-05-10 in einem Coding-Pass. Alle 8 Tasks ausgefuehrt, keine Deviations vom Plan. Phase-end-Commit folgt nach diesem Block.

| Task | Outcome |
|---|---|
| 1. Tests RED | `src/ui/sidebar/__tests__/AttachmentHandler.test.ts` neu, 5 Szenarien (clear-Verantwortung, consume-Atomicity, snapshot-Isolation, leerer-State, cross-turn-Leak). Erst-Lauf 5/5 RED wie erwartet. |
| 2. AttachmentHandler.ts | `clear()` verengt auf pending+chipBar, JSDoc aktualisiert. `consumeFullDocTexts()` neu mit atomarem Snapshot+Clear, JSDoc verweist auf ADR-112. |
| 3. AgentSidebarView Send-Flow | Z.1710-1722: `getFullDocTexts()` -> `consumeFullDocTexts()`, if-Guard entfernt, Loop unconditional. Kommentar erweitert um ADR-112 / FIX-19-28-05. |
| 4. Audit weitere clear()-Sites | Z.2587 (newConversation-Reset) und Z.2917 (loadConversation): nach `clear()` jeweils `void this.attachments.consumeFullDocTexts();` ergaenzt mit Inline-Comment. |
| 5. Test-Suite gruen | Lauf nach Implementierung: 5/5 neue Tests gruen, gesamte Suite 1346/1346 (vorher 1341, +5). |
| 6. Build + Deploy | `npm run build` exit 0 (tsc + esbuild), Auto-Deploy in iCloud-Vault erfolgreich. |
| 7. Regression-Cycle | Git-stash der Code-Aenderungen, Test-Lauf 5/5 RED (4x consumeFullDocTexts is not a function, 1x clear() leakage). Stash pop, Test-Lauf 5/5 GREEN. Cycle vollstaendig. |
| 8. Live-Test (Sebastian) | Anleitung steht in plan-context-fix-19-28-05.md. Sebastian fuehrt manuell aus. |

### Coverage-Gate-Ergebnis

Alle 5 AC aus FIX-19-28-05 sind operationalisiert:

- AC-01 (Datei lesbar im selben Turn): Task 3 ueberfuehrt fullDocTexts atomar an die Tools. Verifiziert via Test-Szenario 2.
- AC-02 (`/ingest-deep` ohne Errormsg): Task 3 + Task 8 (Live-Test fuer End-to-End-Bestaetigung).
- AC-03 (kein State-Leak): Task 4 (Conversation-Reset leert auch fullDocTexts) + Task 1 Szenario 5 (Push-immer-Synchronisation).
- AC-04 (Live-Test ohne Retry-Loop): Task 8.
- AC-05 (Regression-Test): Task 1 + Task 7 (red-green-Cycle bestaetigt, dass Test den Bug einfaengt).

ADR-112 vollstaendig operationalisiert: API-Split LIGHT (Tasks 2+3+4), Push-Pattern unconditional (Task 3), atomarer Consume (Task 2 + Test-Szenario 3).

### Verbleibend (Out-of-Scope dieses PLANs)

- Persistent attachment state ueber den AgentTask-Lifecycle. Eigenes IMP unter EPIC-19.
- Skill-Vereinfachung in `/ingest-deep` (Step 0a "erst in Vault speichern" laesst sich nach diesem Fix vereinfachen, gehoert aber zu FEAT-19-31-Folgearbeit).
