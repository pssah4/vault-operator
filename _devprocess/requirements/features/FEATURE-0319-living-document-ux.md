---
id: FEATURE-0319
title: Living Document UX
epic: EPIC-003-context-memory-scaling
phase: Building
status: Planned
priority: P1
effort: M
depends-on: [FEATURE-0318]
related:
  - PLAN-001-memory-v2-master.md (Phase 5)
  - FEATURE-1411-memory-transparency.md (cross-reference, integriert)
---

# Feature: Living Document UX

> **Feature ID:** FEATURE-0319
> **Epic:** [EPIC-003 Context, Memory & Scaling](../epics/EPIC-003-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 5
> **Priority:** P1-High
> **Effort:** M (1 Woche)

## Feature Description

Conversations werden zu lebenden Dokumenten: per User-Trigger als memory-eligible markiert, anschliessend werden alle aktuellen UND zukuenftigen Messages in der Conversation in die Memory einbezogen (Re-Extraction throttled). Save-to-Memory-Trigger via Star-Button im Chat-Header (Cmd+Shift+M Hotkey) plus Voice-/Text-Trigger via neues `mark_conversation_for_memory`-Tool, das in beliebiger Sprache aktivierbar ist (System-Prompt-Hint: "save this to memory", "Chat dem Memory hinzufuegen").

`thread:{id}`-URI-Type wird eingefuehrt, vorbereitet auf UCM-Cross-Interface-Threads. Bei UCM kann eine Conversation in Claude Code fortgesetzt werden, die in Claude Desktop begann, mit gleicher thread_id und entsprechenden Edges (`cross_interface_continuation`).

Auto-Suggestion-Service: nach idle-Phase (60s ohne neue Message), wenn userMessageCount >= 5 und memoryEligible == false, wird ein lightweight LLM-Call (Haiku-Klasse) mit Conversation-Summary getriggert. Bei positiver Bewertung erscheint ein inline-Suggestion-Card ("Diese Konversation enthaelt vielleicht speicherwuerdige Inhalte: [Save] [Not now] [Don't ask]").

ConversationMeta-Struktur wird neu eingefuehrt (existiert heute nicht), traegt `memoryEligible`, `memoryEligibleAt`, `memoryEligibleBy`, `threadId`, `lastExtractedAt`, `lastExtractedMessageIndex`, `lastExtractedTopicLock`, `extractionVersion`. Visual-Indicator: gold-border auf der Conversation-Thread-Sidebar wenn memoryEligible.

**Bypass-Pfad fuer Sofort-Speichern:** Star-Button erweitert um "Save now"-Variante (Long-Press oder Kontext-Menue), `mark_conversation_for_memory`-Tool akzeptiert optionalen `immediate: true`-Parameter, `/save now`-Slash-Command. Bypass setzt `bypassThrottle: true` im ExtractionQueue-Item, das den 60s-Throttle in FEATURE-0318 ueberspringt.

**Source-Interface-Werte erweitert:** `source_interface`-Spalte (in Engine seit FEATURE-0315) traegt nicht nur `obsilo` sondern auch `claude-desktop`, `claude-code`, `chatgpt-dev-mcp`, `file-system`, `cloud-provider`, `web` (UCM-relevant). Bei Memory-Eintraegen, die aus erwaehnten externen Quellen abgeleitet wurden (z.B. ein Fact aus einer per `file://...` referenzierten PDF), wird der `source_interface` der Quelle zugeordnet, nicht der hostenden Conversation.

**Persistenz-Service-Settings:** zwei Settings, plus eine Konstante (knowledge.db bleibt immer beim Plugin, Plugin-MCP exposiert Vault-Tools).

**Setting `persistenceService`** mit zwei Werten:

- `local` (Default): Dieses Plugin ist Persistenz-Service. memory.db + history.db liegen lokal (siehe `dbLocation`). Memory-Tool-Calls werden von der lokalen Engine beantwortet.
- `remote`: Ein anderer Worker (Plugin auf Always-On-Geraet ODER Standalone-Service) ist Persistenz-Service. Plugin-MCP proxied Memory-Tool-Calls via HTTP/JSON-RPC. Workers sind gleichwertig (Multi-Writer), Service serialisiert Writes.

**Setting `persistenceServiceUrl`** (nur sichtbar wenn `persistenceService='remote'`): URL + Bearer-Token des Persistenz-Service.

**Setting `dbLocation`** (nur sichtbar wenn `persistenceService='local'`):

- `plugin-local` (Default): `.obsidian-agent/{memory,history}.db`
- `vault-resident`: `vault/.obsilo-data/{memory,history}.db` (Obsidian-Sync-faehig, Single-Writer-Lock per PID erforderlich)

**knowledge.db** ist nicht Teil der hier neu definierten Settings, sondern weiterhin via FEATURE-0301-Setting `semanticIndexLocation: 'plugin-local' | 'obsidian-sync'` konfigurierbar (heutiger Stand). knowledge.db wird in jedem Setup vom Plugin bedient (Vault-Indexer ist Plugin-Pflichtfunktion), kann aber physisch Plugin-lokal **oder** Vault-resident liegen. Bei `persistenceService='remote'` greift der Persistenz-Service via Plugin-MCP-Tools (`semantic_search`, `get_vault_implicit_edges`, `get_vault_note_metadata`) auf Knowledge zu, nicht direkt auf die DB. Damit ist knowledge.db-Lokalitaet orthogonal zur Persistenz-Service-Wahl.

### Drei Setup-Klassen

| Klasse | persistenceService | dbLocation (memory + history) | knowledge.db (orthogonal, FEATURE-0301-Setting) | Use-Case |
|---|---|---|---|---|
| **A. Single-Device** (Default) | `local` | `plugin-local` | `plugin-local` ODER `obsidian-sync` | Single-Device, simpelster Pfad |
| **B. Vault-Sync** | `local` | `vault-resident` | typisch `obsidian-sync` fuer Multi-Device-Konsistenz, aber `plugin-local` zulaessig | Multi-Device ohne Server, Obsidian-Sync repliziert. Single-Writer-Lock per PID. |
| **C. Central-Service** | `remote` | (nicht anwendbar -- Service haelt sie) | Plugin-bedient, `plugin-local` ODER `obsidian-sync`, via McpKnowledgeAdapter | Multi-Device + dedizierte Engine-Instanz als Persistenz-Service. Workers gleichwertig. |

### Migration und Default

Migration: bestehende Conversations mit `source = 'mcp'` werden retroaktiv mit detailliertem `source_interface` markiert (z.B. `claude-desktop` wenn rekonstruierbar via UA-String, sonst `mcp-legacy`). Setting-Default fuer Bestand: Klasse A (`local` + `plugin-local`), heutiges Verhalten plus Memory-v2-Veredelung.

**Wichtig:** Keine Konfiguration ist "Fallback ohne UCM". Memory v2 IST UCM. Die Frage ist nur, wer Persistenz-Service ist und wo die DBs liegen.

## Benefits Hypothesis

**We believe that** explizite User-Kuratierung mit niedrigschwelligem Trigger (Star, Hotkey, Voice) die Friction senkt und gleichzeitig User-Souveraenitaet bewahrt.

**Delivers the following measurable outcomes:**

- Anteil memory-eligibler Conversations: > 20% nach 1 Monat (heute 0%)
- Auto-Suggestion-Acceptance-Rate: > 30% (sonst Anti-Pattern)
- Re-Extraction-Throttle haelt Cost im Griff: max 1 Re-Extract pro 60s pro Conversation

**We know we are successful when:**

- Sebastian nutzt den Star-Button taeglich
- Voice-Trigger funktioniert in DE und EN ohne Tool-Mapping-Fehler
- Auto-Suggestion-Cards werden nicht ueberreizt (User dismissed nicht > 80% sofort)
- thread:{id}-URI ist im Memory-System verankert, vorbereitet fuer UCM

## User Stories

### Story 1: Wichtige Konversation explizit speichern (Functional Job)

**As a** Obsilo-Nutzer
**I want to** mit einem Klick eine Konversation als memory-eligible markieren
**so that** ich klare Kontrolle ueber meine Memory habe

### Story 2: Sprach-Trigger statt UI (Emotional Job)

**As a** Obsilo-Nutzer mitten im Chat
**I want to** "speichere das ins Memory" sagen koennen, statt zur Maus zu greifen
**so that** der Flow nicht unterbrochen wird

### Story 3: Vorschlag fuer speicherwuerdige Konversationen (Social Job)

**As a** Obsilo-Nutzer
**I want to** dass das Plugin mich auf moeglicherweise wertvolle Konversationen aufmerksam macht
**so that** ich nicht alle bewusst tracken muss und trotzdem nichts wichtiges verpasse

### Story 4: Cross-Interface-Continuity vorbereitet (Functional Job, UCM-relevant)

**As a** UCM-Builder
**I want to** dass Conversations einer Thread-ID zugeordnet werden koennen
**so that** spaeter eine Conversation in Claude Code als Fortsetzung einer in Claude Desktop verlinkt werden kann

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Star-Button toggelt Eligibility zuverlaessig | 100% State-Korrektheit nach Click | UAT + Test |
| SC-02 | Hotkey funktioniert plattformuebergreifend | macOS Cmd+Shift+M, sonst Ctrl+Shift+M | Test |
| SC-03 | Voice-Trigger erkennt Save-Intent in DE und EN | 90% True-Positive in Test-Set | Eval |
| SC-04 | Re-Extraction throttled korrekt | max 1 Re-Extract pro 60s | Test mit schnellen Messages |
| SC-05 | Auto-Suggestion ist nicht nervig | Dismissal-Rate < 80% | Telemetrie |
| SC-06 | thread:{id}-URI ist persistiert und retrievable | URI-Resolver kennt thread:-Schema | Test |

---

## Technical NFRs

### Performance

- **Star-Button-Toggle:** synchron < 50ms
- **Auto-Suggestion-Latenz:** Haiku-Call < 2 Sekunden, async (blockiert nicht Conversation)
- **Re-Extraction-Trigger-Latenz:** debounced, Worker laeuft async

### Security

- **Voice-Trigger-Validation:** kein injection vector durch User-Speech (Tool-Description macht Confirmation-Free klar)
- **Memory-Eligible-Status:** persistiert in ConversationMeta, nicht im LLM-Context (LLM kann es nicht setzen ohne explicit Tool)

### Scalability

- **ConversationMeta-Storage:** linear bis 10k Conversations
- **Throttle-Tracking:** in-memory Map, gepruned nach 1h Inaktivitaet

### Availability

- **Auto-Suggestion-Service:** opt-out ueber Settings, Telemetrie nur lokal

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1:** ConversationMeta-Struktur muss in bestehendes Conversation-JSON-Format ergaenzt werden (heute in `history/{id}.json`).

- **Why ASR:** Schema-Migration der bestehenden Conversations noetig (Default-Werte)
- **Impact:** ConversationStore-Read/Write-Anpassung
- **Quality Attribute:** Backward-Compatibility

**MODERATE ASR #2:** thread:{id}-URI-Type muss vorhanden sein, auch wenn Phase 5 noch keinen Cross-Interface-Use-Case hat.

- **Why ASR:** UCM-Vorbedingung, retroaktive Migration vermeiden
- **Impact:** ConversationMeta.threadId, fact_edges-Edge-Type
- **Quality Attribute:** Forward-Compatibility

### Constraints

- Hotkey-Konflikte mit Obsidian/anderen Plugins muessen geprueft werden
- Auto-Suggestion-LLM-Modell konfigurierbar (Default Haiku-Klasse)

### Open Questions for Architect

- Star-Button-Position: Chat-Header oder neben jeder User-Message?
- Auto-Suggestion-Card-Persistenz: dismiss = nie wieder fuer diese Conversation, oder nur dieser Trigger?
- thread:{id}-Generation: per Conversation Auto-Generate oder explicit User-Action?

---

## Definition of Done

### Functional

- [ ] ConversationMeta-Struktur erweitert (memoryEligible, memoryEligibleAt, memoryEligibleBy, threadId, lastExtractedAt, lastExtractedMessageIndex, lastExtractedTopicLock, extractionVersion)
- [ ] Migration der bestehenden Conversations (Default memoryEligible=false, lastExtractedMessageIndex=0)
- [ ] Star-Button im Chat-Header
- [ ] **Long-Press / Kontext-Menue auf Star-Button: "Save now" (bypass throttle)**
- [ ] Hotkey Cmd+Shift+M / Ctrl+Shift+M (Toggle), Cmd+Alt+Shift+M (Save now)
- [ ] mark_conversation_for_memory-Tool registriert mit optionalem `immediate: true`-Parameter
- [ ] **/save now Slash-Command** als zusaetzlicher Bypass-Trigger
- [ ] System-Prompt-Hint fuer Save-Intent (inkl. immediate-Variante)
- [ ] Re-Extraction-Throttle (60s/Conversation), respektiert `bypassThrottle`-Flag
- [ ] SaveSuggestionService mit idle-Detection und LLM-Evaluation
- [ ] Inline-Suggestion-Card mit Save/Not-now/Don't-ask
- [ ] Settings: Auto-Suggestion enable/disable, Modell-Wahl
- [ ] thread:{id}-URI-Type in URI-Resolver
- [ ] **Source-Interface-Erweiterung:** `source_interface`-Werte include `claude-desktop`, `claude-code`, `chatgpt-dev-mcp`, `file-system`, `cloud-provider`, `web`
- [ ] **Setting `memory.routingMode`** mit drei Werten (`plugin | delegate | external`), Default `plugin`
- [ ] **Setting `db.location`** mit drei Werten (`plugin-local | vault-resident | standalone-only`), Default `plugin-local`
- [ ] **Setting `memory.standaloneWorkerUrl`** (URL + Auth-Token, nur sichtbar wenn routingMode != 'plugin')
- [ ] **Validation-Logik:** ungueltige Kombinationen werden in Settings-UI abgelehnt mit Vorschlag fuer naechste valide Kombi
- [ ] **Plugin-MCP-Tool-Routing:** Vault-Tools immer Plugin, Memory-Tools je nach routingMode (Plugin-Engine, Proxy-an-Standalone, oder rejected)
- [ ] **Plugin-Standalone-RPC** (HTTP/JSON-RPC) fuer routingMode='delegate' mit Auth-Token
- [ ] **Single-Writer-Lock mit PID** fuer K2/K4 (vault-resident DB)
- [ ] **Migration der bestehenden `source = 'mcp'`-Eintraege:** retroaktive `source_interface`-Markierung
- [ ] Plugin-Worker-Funktion in User-Doku als gleichwertige UCM-Worker-Variante dokumentiert (nicht "Fallback")
- [ ] User-Doku: Vier MVP-Setup-Kombinationen K1-K4 mit Use-Cases erklaert
- [ ] **Migrations-Wizard-UI** in Settings-Modal "Memory & UCM" mit Schritten: Pre-Validation, Backup-Empfehlung, Migration-Plan-Vorschau, Konflikt-Resolution-Wahl (Merge / Standalone-Master / Plugin-Master), Progress-Indicator, Post-Migration-Smoke-Test, Revert-Hinweis
- [ ] **Migration-Lock-Modus** (Plugin in Read-only waehrend Migration, blockiert neue Conversations)
- [ ] **Multi-Device-Migration-Marker** im Vault-File fuer K2/K4 (andere Plugin-Instanzen erkennen Schema-Wechsel)
- [ ] **Backup-Retention** (.bak fuer 7 Tage, dann auto-cleanup wenn nicht reverted)
- [ ] **Crash-Recovery** fuer mid-migration (Migration-Journal aus ADR-079 erweitert)
- [ ] **Pipeline-States visible** (E6): ConversationMeta traegt `extractionState: queued | extracting | embedding | integrating | done | failed`, kleines Status-Badge neben Star-Button. Konsistent mit Supermemory's 6-Stage-Pipeline-Visibility, aber Memory-v2-spezifische Stages.
- [ ] Gold-Border-Visual-Indicator
- [ ] Lokale Telemetrie (Suggestions shown/accepted/dismissed, Bypass-Triggers)

### Quality

- [ ] Voice-Trigger Eval-Set (DE + EN, 20 Phrasen)
- [ ] Throttle-Test
- [ ] Suggestion-Acceptance-Rate-Telemetrie
- [ ] Coverage > 80%

### Documentation

- [ ] FEATURE-0319 Status: Implemented
- [ ] User-Doku: Save-to-Memory-Workflow
- [ ] FEATURE-1411-memory-transparency Cross-Reference (Living Document Indicator)

---

## Dependencies

- **FEATURE-0318** (Single-Call Update Pipeline): Re-Extraction nutzt FactExtractor + FactIntegrator
- **ConversationStore** (existierend): Schema-Erweiterung

## Assumptions

- Hotkey Cmd+Shift+M ist in Obsidian frei (zu pruefen)
- User akzeptiert Auto-Suggestion-Pattern (Dismiss < 80%)

## Out of Scope

- Cross-Interface-Thread-Auto-Detection (UCM-spezifisch, separates Projekt)
- Save-Suggestion-Fine-Tuning (LLM-driven Improvement)
- Multi-Save-Mehrere-Conversations-zugleich (Bulk-Operation, spaeter)
