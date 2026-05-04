---
id: ADR-110
title: Living-Document-Semantik plus Cross-Interface-Thread-Klammer fuer Cross-Surface MCP
date: 2026-05-03
deciders: Sebastian + Architekt-Agent
related-features: FEAT-23-01, FEAT-23-03, FEAT-03-18, FEAT-03-19
related-adrs: ADR-107, ADR-108
---

# ADR-110: Living-Document-Semantik + Cross-Interface-Thread-Klammer

## Status

Proposed (RE-Pass FIX-23-01-01, 2026-05-03).

## Kontext

BA-24 hat Living-Document-Semantik (Selling-Point #5) als
Differenzierungsmerkmal verankert. FEAT-03-18 (Memory v2 Phase 4)
hat den Memory-Layer-Mechanismus dafuer bereits implementiert
(`ConversationMeta.lastExtractedMessageIndex`, Delta-Window,
idempotente Episodes). FEAT-23-01 (BA-26 Cross-Surface MCP) hat
die Bruecke nicht erfasst und `save_conversation` als one-shot
Snapshot gebaut.

Folge: externe Chat-UIs (Claude.ai, Claude Code, ChatGPT,
Perplexity) koennen jeden Save in eine **neue** Obsilo-Conversation
schreiben, aber nicht in eine wachsende. Sebastian muesste manuell
nachhalten, welche Conversation noch aktiv ist, oder externe LLMs
muessten eine `conversation_id` zwischen Turns festhalten -- beides
fragil.

Zusaetzlich: Sebastian wechselt in seinem Workflow zwischen Claude.ai
und Claude Code. Heute landen das in zwei voellig getrennten
Conversations. BA-24 hat Cross-Interface-Threads als Selling-Point #6
verankert.

## Decision Drivers

- **BA-Erfuellung**: Selling-Point #5 (Living Documents) muss in der
  MCP-Schicht sichtbar werden, sonst ist BA-26 nicht spec-konform.
- **Reuse Memory v2**: die ganze Delta-Window-Mechanik existiert
  bereits in `SingleCallProcessor` -- die Loesung darf nichts
  duplizieren.
- **Externer LLM-Disziplin nicht ueberfordern**: das LLM muss nicht
  pro Turn an `conversation_id` denken, sonst bricht das System bei
  jedem LLM-Vergessensfall.
- **Cross-Interface-Thread heute moeglich**, ohne UCM-Auto-Detection
  zu bauen.
- **In-Memory-State ist genug**: Plugin-Reload als impliziter Reset
  ist akzeptabel, kein Persistenz-Bedarf fuer activeMcpSessions.

## Considered Options

### Option A: append_to_conversation als separates MCP-Tool

**Pro**: klare Trennung create vs append, einfaches Schema.
**Con**: externer LLM muss conversation_id pro Turn merken; haellt
das Tool nicht zuverlaessig. Saubere Spec, schwache Realitaet.

### Option B: save_conversation Auto-Continuation im Plugin

**Pro**: Plugin haelt State, externer LLM ruft einfach weiter
`save_conversation` mit den aktuellen Messages. Plugin entscheidet
append vs create per Settings + Hash-Match + Timeout.
**Con**: implizite Logik, schwerer zu debuggen. Aber: deutlich
robuster gegen LLM-Vergesslichkeit.

### Option C: Cloudflare-Worker-State

**Pro**: Worker haelt activeMcpSessions zentral.
**Con**: Cloudflare-Durable-Object-State, wenig wartbar, neue
Test-Surface, komplette Worker-Architektur-Aenderung.

## Decision

**Option B**, mit drei Verfeinerungen aus User-Decisions:

1. **D1 Globaler Default + Per-Call-Override**:
   `crossSurface.livingDocumentByDefault = true`. Externer LLM
   ruft `save_conversation` ohne expliziten Flag, Plugin behandelt
   automatisch als Living Document. Per-Call `living_document=false`
   ueberschreibt fuer Edge-Cases (z.B. "speichere diese Conversation
   getrennt von der vorherigen").

2. **D2 30-Minuten-Timeout**: matched den natuerlichen Bursty-Use
   externer Chats. Laenger riskiert Cross-Topic-Verschmierung.

3. **D3 Cross-Interface-Thread-Klammer (kleine Variante)**:
   Plugin generiert `cross_interface_thread_id` beim ersten
   Living-Document-Save. Externer LLM kann diese ID in folgenden
   Calls (auch mit anderem source_interface) mitsenden. Keine
   Auto-Detection; das bleibt UCM.

### Plugin-Internal-State-Modell

```ts
type SessionKey = `${string}:${SourceInterface}`;
interface ActiveSession {
    conversationId: string;
    crossInterfaceThreadId: string;
    lastTouchAt: number;          // ms timestamp
    isLivingDocument: boolean;
    initialMessagesHash: string;  // Hash der ersten 5 Messages
}
const activeMcpSessions: Map<SessionKey, ActiveSession>;
```

State liegt **in-memory am McpBridge**. Plugin-Reload schliesst alle
Sessions (akzeptabel, Sebastian merkt es nicht im Workflow). Eviction
alle 5min via setInterval, Cleanup-Tick prueft lastTouchAt + 30min.

### Append vs Create-Logik

Bei `save_conversation`-Call:

1. resolved sessionKey = `${mcpToken}:${source_interface}`
2. Wenn `conversation_id` mitgegeben + matched activeSession.conversationId: APPEND
3. Sonst wenn `living_document=true` (per-call oder Settings-Default)
   UND activeSession existiert UND lastTouchAt < 30min UND
   initialMessagesHash matched: APPEND
4. Sonst: CREATE + Eintrag in activeMcpSessions

Append-Pfad ruft `ConversationStore.appendMessages(id, newMessages)`,
welches nur die Delta-Messages speichert. ExtractionQueue-Trigger
nutzt den bereits existierenden `SingleCallProcessor` mit
`lastExtractedMessageIndex` -- keine Memory-v2-Duplizierung.

### Cross-Interface-Thread-ID

Format: `thread-${YYYY-MM-DD}-${6-hex}`. Beim ersten Save wird die
ID generiert und in der Conversation-Meta (`crossInterfaceThreadId`)
persistiert. Bei nachfolgenden Calls mit derselben ID werden ALLE
betroffenen Conversations als Mitglieder markiert. UI gruppiert sie
in der HistoryPanel ueber alle source-Tabs hinweg.

### `close_conversation(conversation_id)`-Tool

Optionales explizites User-Triggering: entfernt die Active-Session
aus der Map. Beispiel: User sagt "schliess die Obsilo-Conversation
ab, neuer Thread fuer das naechste Thema".

## Konsequenzen

### Positive

- BA-24 Selling-Point #5 wird in der MCP-Schicht sichtbar.
- Memory-v2-Code bleibt unveraendert, keine Duplizierung.
- Cross-Interface-Thread-Klammer als UCM-Brueckenkopf vorhanden.
- Externer LLM bleibt einfach zu programmieren ("ruf einfach
  save_conversation mit den aktuellen Messages, Plugin entscheidet").
- Settings-Toggle gibt Sebastian Kontrolle ueber Default-Verhalten.

### Negative

- Implizite Logik im Plugin (append vs create) braucht klare
  Tool-Description, sonst ist das Verhalten fuer das LLM
  ueberraschend. Mitigation: Tool-Description ist explizit.
- in-memory state geht bei Plugin-Reload verloren -- akzeptabel.
- Hash-basierter initial-Messages-Match kann false negatives haben
  bei Edge-Cases (z.B. LLM editiert die ersten Messages). Mitigation:
  per-call `conversation_id` als expliziter Override.

### Risiken

- **R-1**: LLM sendet falsche `cross_interface_thread_id`
  (Halluzination). Mitigation: Plugin validiert, dass ID format
  matcht; unbekannte IDs werden ignoriert + neue ID generiert.
- **R-2**: Bursty-Use-Pattern mit zwei aktiven Themen parallel im
  selben source_interface -> beide landen in derselben Conversation.
  Mitigation: per-call `living_document=false` ueberschreibt;
  Topic-Drift via DriftEventBus (FEAT-03-18) kann spaeter optional
  einen Auto-Close ausloesen.
- **R-3**: 30min-Timeout zu kurz fuer lange Pausen mitten im selben
  Chat. Mitigation: User kann per-Call eine `conversation_id` aus
  dem ersten Result mitsenden -- explizit beats timeout.

## Implementation Notes

(allowed-to-stale)

- ConversationStore: [src/core/history/ConversationStore.ts](../../src/core/history/ConversationStore.ts) -- neue `appendMessages`-Methode
- ConversationMeta: erweitert um `crossInterfaceThreadId?`
- McpBridge: [src/mcp/McpBridge.ts](../../src/mcp/McpBridge.ts) -- traegt activeMcpSessions Map + Eviction-Tick
- save_conversation Handler: [src/mcp/tools/saveConversation.ts](../../src/mcp/tools/saveConversation.ts) -- Append vs Create
- Neues Tool `close_conversation`: src/mcp/tools/closeConversation.ts
- HistoryPanel: [src/ui/sidebar/HistoryPanel.ts](../../src/ui/sidebar/HistoryPanel.ts) -- Thread-Pill + Filter
- Settings: [src/types/settings.ts](../../src/types/settings.ts) `crossSurface.livingDocumentByDefault`
