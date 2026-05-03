---
id: BA-26
title: Cross-Surface AI Workflow via Obsilo Remote MCP
date: 2026-05-03
scope: PoC
status: Validated (skipped formal validation -- direct user need)
related-bas: BA-24 (Unified Chat Memory v2)
related-epics: EPIC-23 (Cross-Surface AI Workflow)
---

# BA-26: Cross-Surface AI Workflow via Obsilo Remote MCP

## 1. Executive Summary

Sebastian arbeitet taeglich mit mehreren Chat-UIs neben Obsilo:
ChatGPT, Claude.ai, Claude Code, Perplexity. Heute leben Memory
und History in jedem dieser Tools getrennt. Ein Insight aus einem
ChatGPT-Gespraech ist nicht in der naechsten Claude-Session
verfuegbar; eine ChatGPT-Conversation laesst sich nicht in der
Obsilo-Sidebar nachlesen.

**Goal**: Obsilo wird zur **einheitlichen Memory- und History-
Schicht** ueber alle Chat-Surfaces hinweg, via Obsilo Remote MCP
(Cloudflare-DO-relayed). Das bestehende `update_memory`-MCP-Tool
schreibt heute in V1-Legacy-MD-Files und wird ersetzt durch einen
v2-Pfad mit vier Kern-Tools. UI-seitig bekommt die History-Sidebar
**Tabs pro Provider** (All / Obsilo / ChatGPT / Claude.ai /
Claude Code / Perplexity); ein Tab zeigt nur die Conversations
seines Providers, keine Vermischung.

## 1.1 How might we

Wie kann Sebastian aus jedem Chat-Tool, das er nutzt, gezielt
Erkenntnisse und Conversations in Obsilo's Memory + History
festschreiben und beim naechsten Tool-Wechsel sofort darauf
zugreifen, ohne den Tool-Stack zu wechseln und ohne dass das
Lifecycle-Management des Memory-Layers extra Arbeit fuer ihn
erzeugt?

## 1.2 Value Proposition

Obsilo wird zum **persistenten Memory-Hub** fuer Sebastians
gesamten AI-Workflow. Jedes Tool wird zum dummen Frontend ueber
demselben Memory-Layer. Wechselkosten zwischen Chat-Tools sinken
gegen Null, weil Kontext immer mitwandert. Provider-Lock-In
sinkt -- Sebastian kann jederzeit zu einem anderen Chat-UI
wechseln ohne Memory-Verlust.

## 2. Persona + Need

**Persona**: Sebastian (Power-User), parallele Sessions in 4+
Tools, Tool-Wahl meist nach Task (Coding -> Claude Code, schnelle
Recherche -> Perplexity, Brainstorming -> Claude.ai, Schreiben ->
ChatGPT). Aktuell: Insights aus Tool A werden in Tool B nicht
gefunden, weil jedes Tool seine eigene Memory hat.

**Functional Need**: aus jedem Tool heraus "save to memory" oder
"save to history" auslosen koennen, optional mit Tag-Hinweis fuer
spaeteres Filtering.

**Emotional Need**: Vertrauen, dass kein wertvoller Insight
verloren geht, weil er gerade im falschen Tool entstanden ist.

**Social Need**: nicht erklaeren muessen, warum dieselbe Antwort
in verschiedenen Tools immer wieder neu erarbeitet wird.

## 3. Jobs to be Done

**Functional Job**: "Wenn ich im UI X einen wichtigen Insight
generiert habe, will ich ihn in Obsilo's Memory festhalten, damit
er beim naechsten Mal in UI Y wieder verfuegbar ist."

**Emotional Job**: "Ich will sicher sein, dass Obsilo der
Single Source of Truth fuer mein AI-Wissen ist, unabhaengig vom
gerade benutzten Chat-Tool."

**Social Job**: "Ich will spaeter rekonstruieren koennen, in
welchem Tool eine Erkenntnis entstanden ist, ohne durch
Browser-History scrollen zu muessen."

## 4. Critical Hypotheses

- **H1**: Externe Chat-Tools (ChatGPT, Claude.ai etc.) koennen ueber
  ihren MCP-Client das Remote-MCP von Obsilo zuverlaessig erreichen.
  (Bestaetigt durch FEATURE-1403 Remote-Transport, live seit 2026-04-01.)
- **H2**: Die vier Kern-Tools (`save_to_memory`, `save_conversation`,
  `recall_memory`, `search_history`) decken 80% der Cross-Surface-
  Use-Cases ab. (Zu validieren in Live-Test.)
- **H3**: Source-Interface-Tagging reicht in P0 als Differenzierung,
  ohne dass ein volles Profil-System (4 Profiles) gebaut werden
  muss. (Zu validieren in Live-Test, Wiedervorlage-Feature
  FEAT-23-06 vorgesehen.)
- **H4**: Sebastian akzeptiert read-only Sichten externer
  Conversations in der Obsilo-History-Sidebar (ohne Continue-Pfad).
  (Zu validieren in Live-Test; Continue-Pfad waere UCM-Thema.)

## 5. Loesungsbild

### 5.1 Vier MCP-Tools (P0)

1. **`save_to_memory(content, tags?, source_interface?)`**
   - Schreibt einen Fact ueber den v2-Pfad: FactStore + Atomizer
     extrahiert atomic facts via LLM.
   - `source_interface` (default 'unknown') wird in jedem Fact-Row
     als Differenzierung gespeichert.
   - Ersetzt das alte `update_memory`-Tool.

2. **`save_conversation(messages[], title?, source_interface)`**
   - Speichert die uebergebene Conversation in `ConversationStore`
     (Obsilo-internes History-Format) plus indexiert sie in
     `HistoryDB.history_chunks` fuer Search.
   - `source_interface` als Pflichtfeld.
   - Optional: triggert Memory-Extraction (siehe Setting Sync-Mode
     unten).

3. **`recall_memory(query, top_k?, source_interface?)`**
   - Liefert Top-K Facts via Cosine ueber `fact_embeddings` (siehe
     IMP-03-17-01, deshalb Vorbedingung).
   - Optional Filter auf `source_interface`.

4. **`search_history(query, source_interface?, role?, top_k?)`**
   - Wrappt das bestehende interne `search_history`-Tool (FEAT-03-20)
     plus exposed es als MCP-Tool.
   - Optional Filter auf `source_interface`.

### 5.2 Source-Interface-Tagging

Enum: `'chatgpt' | 'claude-ai' | 'claude-code' | 'perplexity' |
'obsilo' | 'unknown'`. Jeder MCP-Call gibt explizit ein
`source_interface`-Argument mit. Plugin nimmt unbekannte Werte als
'unknown' an. Tag wird in:
- `facts.source_interface` (existiert in v2-Schema)
- `conversations.source_interface` (NEU, Migration noetig -- siehe FEAT-23-04)
- `history_chunks` indirekt via Conversation-Join

### 5.3 UI -- Obsilo Sidebar History-Tabs

History-Panel bekommt **Tabs am oberen Rand** zum Filtern nach
Source-Interface. Tabs:
- **All** (Default, alle Conversations)
- **Obsilo** (interne Chats, source_interface='obsilo')
- **ChatGPT** (source_interface='chatgpt')
- **Claude.ai** (source_interface='claude-ai')
- **Claude Code** (source_interface='claude-code')
- **Perplexity** (source_interface='perplexity')

Tab erscheint nur wenn min. eine Conversation mit der jeweiligen
Source existiert (kein leerer Tab).

Klick auf eine externe Conversation oeffnet die bestehende
Obsilo-Chat-View **read-only** (Banner oben: "Imported from
{source} -- read only"). Kein Continue-Pfad in P0 -- UCM-Thema.

### 5.4 Sync-Mode-Setting

Externe UIs koennen Obsilo nicht von sich aus pushen -- sie haben
keinen Filesystem- oder DB-Zugriff. Der Trigger laeuft IMMER ueber
einen MCP-Tool-Call vom externen Client. Die Frage "wie kommt ein
Chat in die Shared History und Memory?" hat drei Pfade:

#### Pfad A -- User triggert explizit per Prompt

Sebastian sagt im externen Chat sinngemaess "speicher das in mein
Obsilo-Memory" oder "speicher diese Conversation in Obsilo". Das
externe LLM ruft `save_to_memory(content, source_interface=...)`
oder `save_conversation(messages[], title?, source_interface=...)`.
Funktioniert in jedem MCP-fähigen Client.

#### Pfad B -- Auto-Sync-Mode (default)

`Settings -> Memory -> Cross-Surface Sync = Auto-Sync` aktiviert.
Wenn dann `save_conversation` ueber MCP eintrifft (entweder weil
das LLM es proaktiv ruft oder weil eine Custom Instruction es
triggert), schreibt das Plugin sofort in `ConversationStore` plus
`HistoryDB`. Memory-Extraction laeuft ueber dieselbe
`ExtractionQueue` wie interne Conversations -- gleiche Thresholds
(`extractionThreshold` ~3 Messages, `reExtractThrottleMs` 60s,
Star-Override).

**Wichtig**: Auto-Sync triggert NICHT von alleine ohne MCP-Call.
Es sagt nur "wenn ein Aufruf kommt, speichere ohne weitere
Bedingung". Es macht keinen Polling-Mechanismus auf, weil das mit
externen Tools technisch nicht moeglich ist.

#### Pfad C -- Manual-Sync-Mode

`Cross-Surface Sync = Manual-Sync`. `save_conversation` schreibt
in einen `pending`-Bucket der `ConversationStore`-Tabelle. Der
Eintrag erscheint im History-Tab des jeweiligen Providers mit
sichtbarem `pending`-Marker. Memory-Extraction laeuft NICHT
automatisch. Erst wenn:
- Sebastian den Pending-Eintrag in Obsilo bestaetigt (Star-Click
  oder Save-Button), oder
- externes UI explizit `mark_for_memory(conversation_id)` ruft, oder
- externes UI `save_to_memory(...)` parallel ruft (geht direkt in
  Facts).

Konsequenz: nichts landet ungewollt im Memory; volle Kontrolle
pro Eintrag.

#### Source-Interface-Wertquelle

Pro MCP-Client wird `source_interface` als Konstante in der
Connector-Konfiguration empfohlen (zB `'claude-ai'` im
Claude-Desktop-Connector, `'chatgpt'` im ChatGPT-MCP-Connector).
Der Tool-Handler nimmt diesen Wert als Default. Ohne expliziten
Wert: Whitelist-Fallback `'unknown'` (sichtbar als eigener Tab,
manuell re-tagbar).

#### Globale Setting vs Per-Provider

Sync-Mode ist global, nicht pro Provider. Begruendung: weniger
Konfigurations-Aufwand. Falls Live-Use zeigt dass ein
Per-Provider-Override gebraucht wird (zB ChatGPT auf Auto,
Perplexity auf Manual), wird das als Folge-IMP nachgezogen.

Setting-Pfad: `Settings -> Memory -> Cross-Surface Sync`.

### 5.5 Memory-Threshold-Sharing

Externe Conversations (Auto-Sync-Mode) durchlaufen denselben
ExtractionQueue-Pfad wie interne Conversations. Damit:
- Throttle (60s default), Star-Override, Drift-Bypass: identisch.
- Threshold (`extractionThreshold` default ~3 Messages):
  identisch.

Konsequenz: Sebastian muss Settings nur an einer Stelle pflegen.

### 5.6 V1-Legacy-Tool-Deprecation

`update_memory`-MCP-Tool wird:
1. Auf den v2-Pfad gemappt: intern faehrt es jetzt
   `save_to_memory(content, tags=[category], source_interface='unknown')`.
2. Im Tool-Description als `[deprecated, use save_to_memory]`
   markiert.
3. Eintrag in MCP-Tool-Manifest mit `deprecated: true`-Flag.

So bleiben bestehende Claude-Desktop-Konfigurationen funktional,
landen aber im v2-Speicher. Nach 2 Wochen Live-Use (Telemetrie-
Eintrag bei jeder `update_memory`-Nutzung) entscheidet Sebastian
ueber komplette Entfernung.

## 6. KPI

- **K1**: 100% der `update_memory`-MCP-Aufrufe landen in
  FactStore, nicht in V1-MD-Files. (Code-Audit nach Cut-over.)
- **K2**: Sebastian sieht in der Obsilo-History-Sidebar
  Conversations aus min. 2 externen Tools binnen 7 Tagen Live-Use.
  (Manuelles UAT.)
- **K3**: Mindestens eine `recall_memory`-Suche in einem externen
  Tool liefert ein in einem anderen Tool gespeichertes Fact-Result.
  (Cross-Tool-Validierung.)
- **K4**: Token-Cost pro `save_conversation`-Auto-Sync bleibt im
  Threshold-Rahmen von FEAT-03-18 C5.

## 7. Out-of-Scope (P0)

Bewusst deferred:

- **Profil-System mit min. 4 Profilen** (`default/coding/personal/
  quick-capture`) -- als FEAT-23-06 als Wiedervorlage geplant.
- **Continue-Conversation-from-external**: oeffnet UCM-Thema
  (Cross-Provider conversation-id-mapping).
- **Push-Sync**: keine Live-Updates externer Chats; jeder Sync
  geht ueber `save_conversation`-MCP-Call.
- **Voice-Capture-Pipeline** (BA-24 Section 7.1 P2): bleibt
  out-of-scope.
- **GUI/Dashboard fuer Standalone-Worker** (UCM-Thema).
- **UCM-Native Persistence Layer**: bleibt UCM-Initiative.

## 8. Akzeptanzkriterien

- AK-01: Vier MCP-Tools registriert und ueber Obsilo Remote
  erreichbar.
- AK-02: `update_memory` Legacy-Tool routet auf v2 + zeigt
  Deprecation-Notice.
- AK-03: History-Sidebar hat funktionale Source-Tabs.
- AK-04: Read-only Sicht auf externe Conversations.
- AK-05: Settings "Cross-Surface Sync" mit zwei Modi sichtbar
  und persistent.
- AK-06: Auto-Sync-Mode nutzt dieselben Memory-Thresholds wie
  interne Conversations.
- AK-07: Source-Interface-Tag wird durchgaengig (DB + UI + Search-
  Filter) sichtbar.
- AK-08: Mindestens eine echte Cross-Tool-Round-Trip-Test
  (ChatGPT save -> Claude recall) als manuelles UAT.

## 9. Roadmap

- **Phase 1 (RE + Architecture, ~1 Tag)**: BA-26 + EPIC-23 + 5
  Feature-Specs + ADR-107/108 + plan-context.
- **Phase 2 (Coding, ~6h)**: 4 P0 MCP-Tools + V1-Deprecation +
  Source-Tag-Migration + History-Tabs + Settings.
- **Phase 3 (Cloudflare-Worker-Update, ~1h)**: keine Aenderung
  noetig wenn Worker reines Relay ist (zu verifizieren in
  Architecture-Phase).
- **Phase 4 (Testing, ~3h)**: Eval-Fixtures fuer 4 Tools + UAT.
- **Phase 5 (Security-Audit, ~1h)**: MCP-Surface-Audit (Privilegien
  externer Clients).
- **Phase 6 (Wiedervorlage, ~2 Wochen Live-Use)**: Profil-System
  Bedarf evaluieren -> FEAT-23-06.

## 10. Risiken

- **R-Cost**: Auto-Sync-Mode mit hoher Frequenz = hohe LLM-Cost.
  Mitigation: Threshold-Sharing mit interner Pipeline + sichtbares
  Cost-Pannel im Settings-Tab.
- **R-Privacy**: Externe Tools senden potenziell sensible Inhalte
  via MCP. Mitigation: Source-Interface-Tag erlaubt selektiven
  Filter / Loeschung; Hard-Delete-Pfad (FEAT-03-22 Folge-IMP).
- **R-Schema-Drift**: Externe Clients koennen unbekannte
  source_interface-Werte schicken. Mitigation: Whitelist-Validation
  + 'unknown'-Fallback.
- **R-V1-Legacy-Files**: bestehende V1-MD-Files in der Vault
  bleiben liegen. Mitigation: One-Shot-Migration-Helper im
  Settings-Tab (siehe FEAT-23-05).

## 11. Stakeholder

Sebastian (Solo-User), spaeter UCM-Initiative-User.
