---
id: FIX-23-01-01
feature: FEAT-23-01
epic: EPIC-23
adr-refs: [ADR-110, ADR-107, ADR-108]
plan-refs: []
depends-on: []
created: 2026-05-03
priority: P0
---

# FIX-23-01-01: save_conversation Living-Document-Semantik + Cross-Interface-Thread-Klammer

## Symptom

Heutige `save_conversation`-Implementierung legt bei jedem MCP-Aufruf
eine **neue** Conversation an. Wenn Sebastian in Claude.ai weiter
chattet und Claude `save_conversation` erneut aufruft (oder ein
folgendes turn-pair speichert), entstehen mehrere getrennte
Conversations in Obsilo statt einer wachsenden.

Das verletzt die in BA-24 verankerte Living-Document-Semantik:

- BA-24:186 As-Is/To-Be Gap: "Living Documents: Konversation bleibt
  memory-eligible, **waechst mit**"
- BA-24:275 Selling-Point #5: "Conversations bleiben memory-eligible
  nach Mark, neue Messages fliessen via incremental Re-Extraction.
  Re-Extract ist linear in Delta, nicht in Conversation-Laenge"
- BA-24:371 Loesungsbild: "Konversation wird per Flag memory-eligible
  markiert, **spaetere Ergaenzungen werden automatisch einbezogen,
  auch ueber Interface-Grenzen hinweg**"
- BA-24:544 Glossar: "Living Document: Konversation, die nach 'save
  to memory' Trigger nicht geschlossen wird, sondern bei Ergaenzung
  **automatisch die Memory aktualisiert**"

Memory-v2 (FEAT-03-18, FEAT-03-19) hat den intern noetigen Mechanismus
bereits umgesetzt (`ConversationMeta.lastExtractedMessageIndex`,
SingleCallExtractor mit Delta-Window, idempotente Episodes). Die
Bruecke fehlt nur in der Cross-Surface-MCP-Schicht (FEAT-23-01).

## Root Cause

`saveConversation.ts:75` ruft immer `store.create(...)` und legt eine
neue Conversation an. Es gibt keine Auto-Continuation und keine
explizite Thread-Klammer ueber MCP-Sessions hinweg. FEAT-23-01-Spec
hat das Idempotenz-NFR auf "Hash-basierter Replay-Dedup" begrenzt
und damit die BA-24-Living-Document-Erwartung vergessen.

## Decisions (User-Bestaetigung 2026-05-03)

- **D1 Globaler Default + Per-Call-Override**: Settings-Default
  `crossSurface.livingDocumentByDefault = true`. Jede MCP-
  `save_conversation` wird Living Document, ausser per-Call-Override
  `living_document=false` ueberschreibt es.
- **D2 Active-Session-Timeout = 30 Minuten**. Eine MCP-Session
  (sessionKey = mcpToken + source_interface) haelt eine "aktive"
  Conversation 30 Minuten nach letztem Touch lebendig. Danach
  schliesst sie automatisch, naechster Call beginnt eine neue.
- **D3 Cross-Interface-Thread-Klammer (kleine Variante, ADR-110)**:
  Plugin generiert beim ersten Living-Document-Save einen
  `cross_interface_thread_id`. Externes LLM kann ihn in zukuenftigen
  `save_conversation`-Calls mitsenden, auch beim Wechsel von
  source_interface. Plugin verbindet alle Conversations ueber das
  Thread-ID, History-Sidebar zeigt Thread-Pill plus Cross-Surface-
  Gruppierung. **Auto-Detection NICHT** in Scope (UCM).

## Loesung

### MCP-Tool-Aenderungen

`save_conversation`-Argument-Schema erweitert:

| Field | Type | Default | Effect |
|-------|------|---------|--------|
| `living_document` | boolean? | settings-default `true` | Aktiviert Auto-Continuation fuer diese Session |
| `conversation_id` | string? | -- | Wenn gesetzt + matched aktive Session: append statt create |
| `cross_interface_thread_id` | string? | auto-generated | Verbindet ueber source_interface-Grenzen |

`save_conversation`-Result-Format erweitert: enthaelt jetzt sowohl
`conversation_id` als auch `cross_interface_thread_id` plus klaren
Hinweis, dass beide in folgenden Calls mitgesendet werden koennen.

Neues MCP-Tool `close_conversation(conversation_id)` als expliziter
Reset (User entscheidet manuell, dass die Conversation-Episode endet).

### Plugin-Internal-State

`activeMcpSessions: Map<sessionKey, ActiveSession>` in-memory beim
`McpBridge`. Eviction bei Timeout 30min, plus Plugin-Reload (in-mem).
Auto-Cleanup alle 5min via setInterval.

```ts
type SessionKey = `${string}:${SourceInterface}`;
interface ActiveSession {
    conversationId: string;
    crossInterfaceThreadId: string;
    lastTouchAt: number;
    isLivingDocument: boolean;
    initialMessagesHash: string; // erste 5 Messages, fuer Hash-Match-Fallback
}
```

### Append vs Create-Logik

Bei `save_conversation`-Aufruf:

1. Resolved sessionKey = `${mcpToken}:${source_interface}`
2. Wenn `conversation_id` mitgegeben + matched activeSession.conversationId: append
3. Sonst wenn livingDocument=true (per-call oder Settings-Default) UND
   activeSession existiert UND lastTouchAt < 30min UND initial-hash
   matched: append
4. Sonst: create + ggf. neuen Eintrag in activeMcpSessions

Append-Pfad: `ConversationStore.appendMessages(id, newMessages)` —
neue Methode, schreibt nur die Delta-Messages, updated meta.updated +
messageCount, indexiert die Delta-Messages in HistoryDB.

### Cross-Interface-Thread

Thread-ID-Format: `thread-${YYYY-MM-DD}-${6-hex}`. Beim ersten Save
wird ID generiert; bei nachfolgenden Saves mit derselben ID werden
ALLE Conversations (auch ueber source_interface-Grenzen hinweg) als
Mitglieder dieses Threads markiert. ConversationMeta bekommt Feld
`crossInterfaceThreadId`.

History-Sidebar: Thread-Pill am Listeneintrag bei Conversations mit
Thread-ID. Klick auf Thread-Pill filtert auf alle Conversations
desselben Threads (ueber alle source-Tabs hinweg).

### ExtractionQueue-Trigger

Bei jedem Append-Call (auto-sync mode) wird `enqueueImmediate` mit
den **kompletten** Messages aufgerufen — der bereits existierende
`SingleCallProcessor` mit `lastExtractedMessageIndex`-Logik
verarbeitet nur die Delta-Messages, der Living-Document-Memory-
Fluss aus FEAT-03-18 wirkt automatisch.

## Akzeptanzkriterien

- AK-01: Erster `save_conversation`-Call legt Conversation an,
  Result enthaelt `conversation_id` + `cross_interface_thread_id`.
- AK-02: Zweiter `save_conversation`-Call vom selben Token + selber
  source_interface innerhalb 30min mit identischem oder erweitertem
  Message-Anfang appendet die neuen Messages an dieselbe Conversation.
- AK-03: Per-Call-Override `living_document=false` erzwingt eine neue
  Conversation, auch innerhalb der 30-min-Session.
- AK-04: Nach 30min Timeout wird die Active-Session evictet, naechster
  Call beginnt eine neue Conversation.
- AK-05: `save_conversation`-Call mit `cross_interface_thread_id` aus
  dem ersten Result, aber anderem source_interface, legt eine neue
  Conversation an, die durch das Thread-ID mit der ersten verbunden
  ist.
- AK-06: `close_conversation(conversation_id)`-Tool entfernt die
  Active-Session aus der Map (folgt explizit User-Trigger).
- AK-07: HistoryPanel zeigt Thread-Pill an Listeneintraegen mit
  Thread-ID; Klick filtert auf alle Thread-Mitglieder.
- AK-08: Settings-Toggle `Living-Document by default` in
  Cross-Surface-Sync-Block, default true.
- AK-09: ExtractionQueue-Memory-Pfad nutzt bereits existierende
  `lastExtractedMessageIndex`-Logik aus FEAT-03-18 — neue Append-
  Calls extrahieren nur Delta-Messages.

## Definition of Done

- [ ] ADR-110 final
- [ ] FEAT-23-01-Spec aktualisiert (Living-Document-NFR)
- [ ] FEAT-23-03-Spec aktualisiert (Thread-Pill in History-UI)
- [ ] ConversationMeta + ConversationStore.appendMessages
- [ ] activeMcpSessions Map + Eviction-Tick
- [ ] save_conversation-Append-Logik
- [ ] cross_interface_thread_id Generierung + Persistenz
- [ ] close_conversation-MCP-Tool
- [ ] HistoryPanel Thread-Pill + Thread-Filter
- [ ] Settings-Default in CrossSurfaceSettings
- [ ] Tests fuer alle 9 AK
- [ ] Build gruen, alle Tests gruen
- [ ] Backlog Done

## Out of Scope (Bestaetigt)

- Auto-Detection von Cross-Interface-Threads (UCM-Material)
- Continue-Pfad (in Obsilo neue Antworten in einen externen Thread
  schreiben, die im externen Tool weiterleben) -- UCM
- Thread-Memory-Profile-Bindung -- UCM
- Persistente activeMcpSessions ueber Plugin-Reloads -- in-memory
  reicht; Plugin-Reload schliesst alle Sessions.
