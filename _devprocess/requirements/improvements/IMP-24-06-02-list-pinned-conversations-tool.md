---
id: IMP-24-06-02
feature: FEAT-24-06
epic: EPIC-24
adr-refs: []
plan-refs: []
audit-refs: []
depends-on: [FIX-24-06-02]
created: 2026-05-13
---

# IMP-24-06-02: Tool list_pinned_conversations adden -- gepinnte Chats listbar

## Motivation

Aktuell gibt es zwei Mechanismen, die User unter "Memory-Source" verstehen:

1. **MemorySourceStore (Vault-Notes)** -- markiert via Frontmatter oder
   `mark_note_as_memory_source`. Auto-Extraktion. Tool: `list_memory_source_notes`.
2. **Pinned Chats (via Star-Button im HistoryPanel)** -- manuelles
   "Save to memory". Triggert `mark_for_memory`, speichert Facts mit
   `source_conversation_id` in der FactStore-DB. KEIN Listing-Tool.

Im MESSLAUF Test 2 Teil D fragte Sebastian "Welche meiner Chats sind
als Memory-Source registriert?" Antwort vom Agent: "keine Notizen
oder Chats registriert", obwohl Sebastian mehrere Chats gestarred
hat. UX-Verwechslung: Mechanismus 2 ist konzeptionell vorhanden, aber
kein Tool deckt ihn ab.

## Scope

Neues Tool `list_pinned_conversations`:

- **Eingabe:** keine Parameter (oder optional `limit`)
- **Output:** Liste der Conversations die mindestens einen
  nicht-deprecated Fact mit `source_conversation_id == convId` haben.
  Pro Entry: `id`, `title`, `factCount`, `lastFactExtractedAt`.

## Implementierungs-Skizze

- Datenquelle: `plugin.memoryDB.getDB().exec("SELECT
  source_conversation_id, COUNT(*) FROM facts WHERE
  deprecated=0 GROUP BY source_conversation_id")` plus
  `ConversationStore.get(convId)` fuer die Titel.
- Bestehender Helper: `plugin.countMemoryFactsForConversation(id)` --
  pruefen ob es eine Bulk-Variante gibt oder eine adden.
- TOOL_GROUP_MAP: `vault`-Gruppe (neben recall_memory) oder eigene
  Memory-Gruppe.
- Coverage-Test in `builtinModes.coverage.test.ts` ergaenzen.

## Success Criteria

- SC-1: Tool registriert, in `vault`-Gruppe, im Schema sichtbar.
- SC-2: Bei n>=1 gestarred-Chats: Liste mit Titel+Fact-Count zurueck.
- SC-3: Bei 0 gestarred-Chats: leere Liste / freundliche Meldung.
- SC-4: TOOL_GROUP_MAP-Drift-Test pinnt das neue Tool (Memory-Spec).

## Bewusst Out-of-Scope

- UI-Lupe fuer gepinnte Chats (Sidebar HistoryPanel hat schon den
  Filter via `isInMemory`-Predicate).
- Konsolidierung mit `list_memory_source_notes` -- beide Mechanismen
  bleiben separat, weil Notes-Auto-Extraktion und Chat-Pin verschiedene
  Lifecycles haben.

## Status

Done 2026-05-13. Neues Tool `ListPinnedConversationsTool` registriert
+ in vault-Gruppe + TOOL_METADATA-Eintrag + ToolExecutionPipeline-
Group-Map + ToolName-Union ergaenzt. 6 Unit-Tests in
`ListPinnedConversationsTool.test.ts` (empty, render-with-meta,
orphan-conv, DB-unavailable, query-error, limit-respect). Coverage-
Test in builtinModes.coverage.test.ts ergaenzt. SC-1..SC-4 unit-
verifiziert. 1485 Tests gruen (+7 vs 1478), lint 0 errors, tsc
clean, build+deploy gruen. Manuelle Live-Verifikation nach Reload
ausstehend.
