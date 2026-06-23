---
id: ADR-143
title: Conversation-Block-Storage-Strategie fuer Inline-Chat
date: 2026-06-22
deciders: [Sebastian Hanke, Architecture Agent (Claude Opus 4.7)]
asr-refs: [ASR-EPIC-33-03]
feature-refs: [FEAT-33-05]
related-adrs: [ADR-77]
supersedes: null
superseded-by: null
---

# ADR-143: Conversation-Block-Storage-Strategie fuer Inline-Chat

## Context

FEAT-33-05 fuehrt einen persistenten Multi-Turn-Inline-Chat ein. Der User markiert eine Stelle in der Note, oeffnet einen Chat-Dialog und fuehrt mehrere Turns mit dem Agent. Das Ergebnis ist eine Konversation, die an der markierten Stelle persistent bleiben soll. Sie wird spaeter wieder aufgerufen, fortgesetzt oder durchsucht.

Die Speicherentscheidung wirkt in vier Dimensionen: Markdown-Konformitaet der Note (laesst sie sich ohne Plugin lesen?), Discoverability ueber Memory- und History-Pipelines, Note-Auf-Blaehung bei vielen Inline-Chats und Cross-Vault-Sync-Verhalten. Eine falsche Wahl macht entweder die Note unlesbar, blaeht den Vault auf oder verliert Conversations bei Reload.

Die Vault-Operator-Vision ordnet Inhalte primaer der Note zu (Note als Container fuer Wissen, Plugin als Layer). Persistierte Conversations sollten dieser Linie folgen, ohne die Markdown-Lesbarkeit zu opfern.

**Triggering ASR:** ASR-EPIC-33-03 verlangt persistente Multi-Turn-Conversations an markierten Note-Stellen mit Discoverability ueber Memory- und Search-Pipelines.

**Quality attribute:** Persistence und Discoverability. Persistierte Inhalte muessen Plugin-Reload, Note-Wechsel und Cross-Vault-Sync ueberleben und ueber search_history und recall_memory auffindbar sein.

## Decision drivers

- **Markdown-Konformitaet:** Die Note soll ohne installiertes Plugin lesbar bleiben. Vault-Operator versteht sich als Layer ueber Obsidian, nicht als Lock-In. Andere Markdown-Tools muessen die Note oeffnen und sinnvoll anzeigen koennen.
- **Discoverability:** Inline-Chats muessen ueber bestehende Pipelines (search_history, recall_memory, Vault-Search) gefunden werden. Eine Conversation, die nur im Plugin sichtbar ist, geht im Wissensgraphen verloren.
- **Note-Aufblaehung:** Inline-Chats koennen lang werden (10+ Turns). Eine Note mit fuenf Inline-Chats darf nicht unlesbar werden. Begrenzung und Collapse-Strategien sind notwendig.
- **Cross-Plugin-Vertraeglichkeit:** Andere Plugins (Excalidraw, Tasks, Banners) lesen die Note ebenfalls. Das gewaehlte Format darf keine False-Positive-Treffer in fremden Parsern erzeugen.
- **Versions-History:** Git-basierte Vault-Backups sollen Inline-Chat-Verlauf natuerlich abbilden. Externe DB-Stores umgehen die Git-Historie.

## Considered options

### Option 1: Ephemer im Memory (Plugin-Cache, kein Persist)

Die Conversation lebt nur in der laufenden Session im Plugin-Cache. Bei Note-Wechsel oder Plugin-Reload verschwindet sie.

**Pros:**
- Triviale Implementation, keine Persistenz-Logik notwendig.
- Keine Note-Aufblaehung, da nichts geschrieben wird.

**Cons:**
- Conversation geht im Plugin-Reload verloren, was den Use-Case komplett untergraebt.
- Weder ueber search_history noch ueber recall_memory findbar.
- Die Markt-Innovation Inline-Chat-Block ohne Persistenz waere schwach gegenueber Cursor- und Continue-Patterns.
- Vault-Operator-Vision Cross-Vault-discoverable wird verfehlt.

### Option 2: Inline im Note-Markdown als Code-Fence-Block

Der Conversation-Block wird als Markdown-Code-Fence mit Language-Tag vault-operator-chat-v1 in die Note geschrieben. Das Plugin parst beim Render-Hook den Fence und zeigt eine reichere UI (Avatare, Turns, Aktionen). Im Edit-Mode bleibt der reine Markdown-Text sichtbar.

**Pros:**
- Markdown-konform, die Note bleibt ohne Plugin lesbar.
- Persistiert direkt in der Note und ist ueber Vault-Search findbar.
- Cross-Plugin-vertraeglich, andere Tools sehen den Block als opaken Code-Fence-Text.
- Versions-History laeuft automatisch ueber Git und Obsidian-Sync.
- Render-Hook macht die UI reich, die unterliegende Markdown-Datei bleibt sauber.

**Cons:**
- Conversation-Bloecke blaehen die Note auf, bei vielen Inline-Chats kann das stoerend werden.
- Markdown-Editoren ohne Plugin zeigen rohen JSON-Inhalt im Fence, was mittel-elegant ist.
- Code-Fence mit speziellem Tag ist eine Plugin-spezifische Konvention.

### Option 3: Sub-Conversation in History-Pipeline mit Anker-Linktext

Die Conversation lebt in der bestehenden HistoryDB aus EPIC-07. In der Note steht nur ein Anker-Linktext wie [Inline-Chat 2026-06-22T14:32]. Das Plugin resolviert beim Render den Link in die Conversation-UI.

**Pros:**
- Die Note bleibt schlank, sie traegt nur den Anker.
- Vollstaendige Memory- und History-Integration via search_history und recall_memory ist out of the box.
- Conversations koennen beliebig lang werden, ohne die Note zu belasten.
- Nutzt die bewaehrte HistoryDB-Architektur aus EPIC-07.

**Cons:**
- Die Note ohne Plugin zeigt nur Linktext, Markdown-Konformitaet leidet.
- Cross-Vault-Sync ohne HistoryDB-Sync wird schwierig, da der Conversation-Inhalt nicht im Vault-Tree liegt.
- Bei DB-Korruption gehen Conversations verloren, auch wenn die HistoryDB robust ist.
- Der User kann die Conversation nicht direkt im Editor lesen, ohne das Plugin zu starten.

### Option 4: Eigene Sub-Datei .inline-chats.md je Note mit Anker

Pro Note wird optional eine Sidecar-Datei `<note>.inline-chats.md` angelegt. Conversation-Bloecke landen dort, der Note-Inhalt enthaelt Anker wie [Inline-Chat #1].

**Pros:**
- Die Note bleibt schlank, weil Inhalte ausgelagert sind.
- Sidecar ist Markdown und damit ohne Plugin lesbar.
- Cross-Vault-Sync laeuft via Vault-Sync ueber den gleichen File-Tree.

**Cons:**
- Sidecar-Files-Proliferation, pro Note mit Inline-Chats entsteht eine zusaetzliche Datei.
- Der User-Vault wird unuebersichtlich.
- Move- oder Rename-Operationen muessen die Sidecar mitfuehren, Konsistenz wird zur Pflichtaufgabe.
- Convention-heavy und abweichend von der Obsidian-Norm einer Note pro Inhalt.

## Decision

**Inline im Note-Markdown als Code-Fence-Block (Option 2).**

Markdown-Konformitaet ist der hoechste Wert in der Vault-Operator-Vision. Die Note muss ohne Plugin lesbar bleiben, Git-Versions-History muss natuerlich funktionieren, andere Plugins muessen den Block ignorieren koennen ohne Konflikt. Diese drei Eigenschaften gewinnt nur Option 2.

Die Note-Aufblaehung wird durch zwei Mechanismen mitigiert: eine Begrenzung pro Block (maximal 20 Turns) und Auto-Collapse-Render im Default-View, der nur den ersten Turn plus eine Zusammenfassung zeigt.

Bei spaeterer Mass-Adoption durch den User wird Option 3 (Sub-Conversation in HistoryDB) als hybrides Add-on nachgezogen: kurze Chats bleiben inline, lange Chats wandern in die HistoryDB mit Anker in der Note. Dieser Pfad ist explizit reserviert und nicht Teil dieser Entscheidung.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Die Note bleibt ohne Plugin vollstaendig lesbar, Markdown-Konformitaet ist gewahrt.
- Git-Versions-History fuer Inline-Chats funktioniert ohne zusaetzliche Logik.
- Cross-Plugin-Vertraeglichkeit ist hoch, andere Obsidian-Plugins wie Excalidraw, Tasks oder Banners sehen den Code-Fence als opaken Text und ignorieren ihn sauber.
- Der Render-Hook in Live-Preview und Reading-Mode kann den Fence in eine reiche UI verwandeln (Avatare, Turns, Action-Buttons), ohne den Markdown-Quelltext anzuruehren.
- Memory- und History-Integration laeuft direkt ueber den bestehenden Markdown-Indexer aus Phase D und F, ohne neue Pipeline.

### Negative

- Conversation-Bloecke blaehen die Note auf, bei vielen Inline-Chats kann das stoerend wirken. Mitigation laeuft ueber das 20-Turn-Cap, Auto-Collapse-Render im Default-View und eine optionale Move-to-History-Action.
- Die Markdown-Konvention vault-operator-chat-v1 ist plugin-spezifisch, andere Tools ignorieren den reichen Inhalt und zeigen rohes JSON.
- Bei Note-Wechsel verschwindet die UI-Reichheit, weil der Render-Hook nur auf der aktuell geoeffneten Note arbeitet.

### Risks

- **Note-Aufblaehung bei Power-Usern:** Wenn ein User viele Inline-Chats fuehrt, kann die Note unuebersichtlich werden. Mitigation laeuft ueber das 20-Turn-Cap, Auto-Collapse plus die optionale Move-to-History-Action.
- **Format-Drift zwischen Plugin-Versionen:** Wenn das Plugin sein Fence-Format aendert, werden alte Bloecke falsch gerendert. Mitigation laeuft ueber den expliziten Version-Tag im Language-Identifier (vault-operator-chat-v1) und eine Migration-Logic, die alte Versionen erkennt und upgradet.
- **Cross-Plugin-Konflikte:** Wenn ein anderes Plugin den Fence falsch interpretiert, kann es zu Render-Doppelungen kommen. Mitigation laeuft ueber den speziell praefigierten Language-Tag vault-operator-chat-v1, der False-Positive-Treffer in fremden Parsern minimiert.

## Implementation Notes

**Fence-Format (Markdown im Note-Body):**

```vault-operator-chat-v1
{
  "id": "ic-2026-06-22T14:32:00Z",
  "selection_anchor": "...selected text snippet...",
  "turns": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ],
  "model": "claude-haiku-4-5",
  "created": "2026-06-22T14:32:00Z"
}
```

**Render-Hook (neu):**
- `src/ui/inline/InlineChatBlockRenderer.ts` (NEU): markdownPostProcessor fuer Reading-Mode plus EditorView-Decoration fuer Live-Preview.
- Begrenzung auf 20 Turns pro Block, danach Auto-Collapse mit "Move to history"-Action.
- Render zeigt Avatare, Turn-Header (User/Assistant), Action-Buttons (Continue, Branch, Move-to-history).

**Memory-Integration:**
- Der bestehende markdownIndexer aus EPIC-03 Memory v2 muss den Fence-Tag vault-operator-chat-v1 erkennen und Selection-Anchor plus Turn-Content als separates Fact-Atom indexieren.
- search_history.searchVault findet Inline-Chats via Fence-Pattern-Match auf dem indexierten Markdown.

**Optionaler Hybrid-Pfad (deferred, nicht Teil dieses ADRs):**
- Lange Conversations (mehr als 20 Turns) wandern via Move-to-history-Action in die HistoryDB aus EPIC-07.
- In der Note bleibt dann nur ein Anker-Block `vault-operator-chat-ref-v1` mit Conversation-ID und Zusammenfassung.
- Diese Erweiterung wird als separates Feature spezifiziert, wenn User-Telemetrie zeigt, dass das 20-Turn-Cap regelmaessig getroffen wird.
