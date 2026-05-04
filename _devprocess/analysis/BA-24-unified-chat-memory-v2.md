---
id: BA-UNIFIED-CHAT-MEMORY-V2
title: Business Analysis -- Unified Chat Memory (v2)
status: Draft
version: 2.0
created: 2026-04-25
owner: Sebastian Hanke
supersedes: BA-UNIFIED-CHAT-MEMORY (v1)
related:
  - _devprocess/requirements/OBSILO-MEMORY-V2-FULL-REWRITE.md
  - _devprocess/implementation/plans/PLAN-01-memory-v2-master.md
---

# Business Analysis: Unified Chat Memory (v2)

> Aktualisiert nach Pfad-2-Entscheidung fuer Obsilo Memory.
> UCM ist nachgelagert: Bauphase startet erst nach Engine-Extraction in Obsilo Memory v2 Phase 7.

## Hauptaenderungen gegenueber v1

- UCM-Engine basiert auf Obsilo Memory v2 (kompletter Rewrite, nicht aktuelle Engine)
- Memory-Profile als zentrales UCM-Konzept neu eingefuehrt
- Sidecar-Architektur fuer Obsilo-als-Persistence (UCM behaelt eigene DB)
- ChatGPT via Developer-Mode-MCP zurueck in Scope
- Realistischer Startzeitpunkt verschoben (Abhaengigkeit zu Obsilo v2)

---

## 1. Executive Summary

### 1.1 Problem Statement

Wissensarbeiter nutzen heute mehrere AI-Interfaces parallel: Claude Desktop, Claude Code, ChatGPT (Developer-Mode), Obsilo, und optional Agent-Systeme wie OpenClaw via Telegram. Jedes Interface hat seine eigene, isolierte Memory-Schicht. Erkenntnisse, Entscheidungen und Ideen aus Konversationen bleiben dort gefangen, wo sie entstanden sind. Eine Idee, die walking-the-dog per Telegram diktiert wurde, findet nie den Weg in die abendliche Coding-Session in Claude Code.

### 1.2 Proposed Solution

Ein standalone Service namens **Unified Chat Memory** (UCM), der als MCP-Server auf einem beliebigen always-on Rechner laeuft. UCM **wiederverwendet die Obsilo Memory v2 Engine** (siehe `OBSILO-MEMORY-V2-FULL-REWRITE.md`) als Library, ein faktisches `facts`-Schema mit Topics, Importance, Aging, Konflikt-Resolution und dynamischer Context-Composition.

UCM erweitert diese Engine um Multi-Interface-spezifische Konzepte:

- **Memory Profiles** fuer client-spezifische Hot-Memory-Views (coding, personal, work, quick-capture)
- **Cross-Interface Threads** fuer Konversationen, die ueber mehrere Tools hinweg fortgefuehrt werden
- **Source-Interface Provenance** zur Nachvollziehbarkeit der Herkunft

UCM ingestiert Konversationen aus allen angebundenen Interfaces via explizitem User-Trigger ("save to memory") und persistiert sie in einer **pluggable persistence layer**: entweder standalone in einer eigenen SQLite-DB, oder im Obsilo-Vault als Speicherort, mit UCM-spezifischen Erweiterungen in einer Sidecar-DB.

### 1.3 Expected Outcomes

- Interface-unabhaengige Konvergenz: Konversationen aus beliebigem AI-Tool landen in einem durchsuchbaren Speicher
- User-kontrollierte Kuratierung: Nur explizit markierte Konversationen werden persistiert, kein automatisches Scraping
- Client-spezifische Memory-Views: Coding-Tools sehen Coding-Kontext, persoenliche Tools sehen persoenlichen Kontext
- Souveraenitaet ueber Persistence-Location: User waehlt zwischen UCM-eigener DB und Obsilo-Vault als Backend
- Offline-Resilienz: Always-on Persistence Layer funktioniert auch wenn einzelne Clients offline sind

### 1.4 Strategische Einordnung

UCM ist die **logische Erweiterung von Obsilo Memory v2** auf den Multi-Interface-Fall. Beide Systeme teilen sich die Engine. Der Aufwand fuer UCM ist daher signifikant geringer als ein Greenfield-Projekt, weil die schwierige Memory-Logik (Konflikt-Resolution, Aging, dynamische Composition) bereits in Obsilo gebaut wurde.

### 1.5 Setup-Varianten (Persistenz-Service-Pattern, drei Klassen)

UCM ist **kein** separates System neben Obsilo. UCM ist die Engine + die MCP-API. Das Obsilo-Plugin **ist eine vollwertige UCM-Worker-Implementierung** mit Plugin-internem MCP-Server. Ein externer Standalone-Worker ist die zweite Worker-Variante. Beide sprechen dieselbe MCP-API gegen dieselbe Engine.

**Konstante:** Plugin-MCP laeuft immer fuer Vault-Tools (`read_file`, `semantic_search`, `get_vault_implicit_edges`, `get_vault_note_metadata`), weil nur das Plugin Vault-Zugriff hat. knowledge.db bleibt immer beim Plugin.

**Architektur-Prinzip:** Trennung von Worker und Persistenz-Service.

- **Workers** sind Capture- + Query-Frontends. Beliebig viele, alle gleichwertig (lesen UND schreiben).
- **Persistenz-Service** ist die einzige Stelle, die physisch in memory.db + history.db schreibt. Er serialisiert Writes von allen Workers.
- **Workers** schreiben via RPC zum Persistenz-Service. Jeder Worker kann Conversations capturen, Facts schreiben, Memory abfragen.
- **Persistenz-Service** ist eine **logische Rolle**, nicht ein eigenes Programm. Eine beliebige Engine-Instanz (Plugin oder Standalone) kann sie uebernehmen.

```
Worker A (Plugin Notebook 1) ----RPC----+
Worker B (Plugin Notebook 2) ----RPC----+
Worker C (Standalone Server) ----RPC----+----> Persistenz-Service ----> {memory,history}.db
Worker D (OpenClaw mobile)   ----RPC----+

Knowledge-Hops (alle Setups):
Workers ----RPC zur Plugin-MCP-URL----> Plugin liest knowledge.db lokal
```

### 1.5.1 Drei Setup-Klassen (MVP-Scope)

| Klasse | Persistenz-Service | memory.db + history.db | knowledge.db | Workers (Multi-Writer) |
|---|---|---|---|---|
| **A. Single-Device** | im Plugin selbst | Plugin-lokal in `.obsidian-agent/` | Plugin-lokal **oder** Vault-resident (heute schon konfigurierbar via `obsidian-sync`-Mode in FEAT-03-01) | nur dieses Plugin (1 Worker) |
| **B. Vault-Sync** | im Vault-File (jedes Plugin schreibt direkt) | Vault-resident in `vault/.obsilo-data/` | Plugin-lokal **oder** Vault-resident (typisch Vault-resident fuer Multi-Device-Konsistenz) | mehrere Plugins auf User-Geraeten, Single-Writer-Lock per PID weil kein zentraler Service serialisiert |
| **C. Central-Service** | dedizierte Engine-Instanz (Plugin auf Always-On-Geraet ODER Standalone-Service) | beim Persistenz-Service | bleibt Plugin-bedient -- physisch Plugin-lokal **oder** Vault-resident, via McpVaultAdapter vom Persistenz-Service abgefragt | Plugins auf Notebooks, Standalone, mobile -- alle gleichwertig schreibend via RPC |

**knowledge.db-Lokalitaet ist orthogonal zur Persistenz-Service-Wahl:** Sie wird vom Plugin gehalten (weil nur das Plugin Vault-Zugriff hat), kann aber physisch entweder im Plugin-Datenverzeichnis oder im Vault liegen. Das ist heutige Konfigurationsfreiheit (FEAT-03-01 `obsidian-sync`-Mode) und bleibt unangetastet.

### 1.5.2 Settings-Schema

- `persistenceService`: `'local'` (dieses Plugin hostet selbst -> Klasse A oder B) oder `'remote'` (Klasse C, RPC zum Persistenz-Service)
- `persistenceServiceUrl`: URL + Bearer-Token wenn `'remote'`
- `dbLocation`: nur sichtbar wenn `persistenceService='local'` -- `'plugin-local'` (Klasse A) oder `'vault-resident'` (Klasse B)

### 1.5.3 MCP-Tool-Routing in Plugin-MCP

Externer Client (Claude Desktop, ChatGPT etc.) sieht **eine** MCP-URL (Plugin-Cloudflare-Tunnel). Plugin-MCP entscheidet pro Tool-Call, wer antwortet:

```
Plugin-MCP empfaengt Tool-Call
|-- Vault-Tool (read_file, semantic_search, get_vault_implicit_edges, ...) -> Plugin antwortet selbst (knowledge.db beim Plugin)
`-- Memory-Tool (save_conversation, search_history, recall_memory, ...)
    |-- persistenceService='local'   -> Plugin antwortet via lokaler Engine
    `-- persistenceService='remote'  -> Plugin proxied an Persistenz-Service (RPC)
```

Damit ist Plugin-MCP **ein Endpoint** und kein Konflikt zwischen Vault- und Memory-Pfad. Externe Clients muessen ihre URL nicht wechseln, wenn Sebastian zwischen den Setup-Klassen wechselt.

**McpVaultAdapter im Standalone-Service:** Wenn Standalone als Persistenz-Service laeuft (Klasse C), registriert er einen `McpVaultAdapter`, der Plugin-MCP-Tools aufruft fuer Knowledge-Hops. Damit funktionieren `mentions_vault_note`-Edge-Resolution und Hybrid-Retrieval auch im verteilten Setup -- mit LAN-RTT-Aufschlag (~20-50ms), aber konsistent in der Engine-API.

**Cloudflare-Relay (heute schon im Code: `src/mcp/relayWorkerCode.ts`, `src/mcp/McpBridge.ts`):** Long-Polling-Bridge, kein Storage. Plugin-Worker bleibt always-on, solange Obsidian-Desktop offen ist. Standalone-Worker hat eigene Always-On-Mechanik (Server-Daemon).

**Engine-Hosting-Neutralitaet:** Engine kennt keinen Host. Sie laeuft identisch in Obsidian-Plugin (Plugin-Worker) und in einem standalone-Node-Service (Standalone-Worker). Gleiche Stores, gleiche API. Source-Interface-Tagging entscheidet ueber Provenance.

### 1.5.3 Setup-Wechsel-Migration

User koennen zwischen den vier Setups K1-K4 wechseln. Migration ist first-class Konzept, nicht nachgelagerter Spezialfall. Drei Klassen von Wechseln:

**Innerhalb derselben Achse (einfach):** K1↔K2, K3↔K4. Nur ein Setting aendert sich, Daten werden physisch verschoben (File-Move oder File-Pfad-Update).

**Worker-Wechsel (komplex):** K1↔K3, K1↔K4, K2↔K3. Daten muessen zwischen Stores transferiert werden (Dump+Restore via Engine-Public-API). Plus Konflikt-Resolution bei Reverse-Wechsel.

**Hybrid-Wechsel (mittel):** K2↔K4. routingMode wechselt, db.location bleibt vault-resident. Daten bleiben am Platz, nur Worker-Owner wechselt.

**Migration-Phasen (universell):**

1. Pre-Validation: Ziel-Setup erreichbar (Standalone laeuft, Vault-Pfad schreibbar), Disk-Space, Backup-Empfehlung
2. Migration-Lock: Plugin in Read-only-Modus, Migration-Journal geschrieben
3. Daten-Transfer: File-Move oder Dump+Restore. Schema-Version-Check.
4. Settings-Update
5. Post-Migration-Smoke-Test
6. Quelle als `.bak` fuer 7 Tage behalten
7. User-Notice mit Revert-Option

**Konflikt-Resolution bei Reverse-Wechsel:** Wenn ein User von K3 zurueck zu K1 wechselt, hat das Plugin-DB einen alten Stand und Standalone hat aktuelle Daten. Drei Optionen:

- **Merge** (Default): FactIntegrator (FEAT-03-18) fuehrt Conflict-Resolution wie bei normalem Insert
- **Standalone als Master** (sichere Alternative): Plugin-Daten werden ersetzt
- **Plugin als Master**: Standalone-Daten werden verworfen (Warnung: Datenverlust wahrscheinlich)

**Migration-Lock fuer Multi-Device-Setups (K2/K4):** Migrations-Marker im Vault-File signalisiert anderen Plugin-Instanzen "Setup migrated to X". Andere Instanzen lehnen Operationen ab bis Schema-Version uebereinstimmt.

**Crash-Resilienz:** Multi-File-Atomic-Commit-Journal aus ADR-79 wird um Migration-Status erweitert. Bei Plugin-Restart: Recovery-Replay oder Rollback. Quelle bleibt als `.bak` erhalten.

---

## 2. Business Context

### 2.1 Background

Sebastian arbeitet parallel mit mehreren AI-Systemen: Claude Desktop und Claude in Chrome fuer konversationelle Arbeit, Claude Code fuer Entwicklung, ChatGPT im Developer-Mode mit MCP-Support, Obsilo als Obsidian-Plugin fuer Vault-native Workflows, und plant OpenClaw auf einem Server als Automation-Backend mit Telegram-Interface fuer mobile Capture.

Jedes dieser Systeme hat eigene Memory-Mechaniken. Obsilo bekommt im Rahmen des Memory-v2-Rewrites ein modernes Memory-System mit `facts`-Tabelle, Topics, Importance-Decay und Konflikt-Resolution. Andere Tools haben ihre eigenen Mechanismen oder gar keine.

Das Ergebnis bisher: Memory-Fragmentierung ueber alle Interfaces hinweg. Der mentale Aufwand, sich zu erinnern *wo* ein Gedanke gefuehrt wurde, bevor man ihn wiederfindet, ist hoch.

### 2.2 Current State (As-Is)

- Jedes AI-Interface persistiert Memory isoliert
- Kein gemeinsamer Suchindex ueber alle Konversationen
- Konversations-Retrieval erfordert explizites Wechseln zum richtigen Tool
- Obsilo Memory v2 (in Bau) wird ein vorbildliches Memory-System, aber nur fuer Konversationen, die in Obsilo selbst stattfanden
- Mobile Capture (Voice Memos) lebt in Apple Notes/OneNote, entkoppelt vom AI-Workflow
- ChatGPT-Konversationen mit relevanten Erkenntnissen sind toter Speicher

### 2.3 Desired State (To-Be)

- Eine explizite "save to memory" Geste in jedem Interface triggert Persistenz in ein gemeinsames Memory-System
- Das gesamte Gespraech wird als *living document* gespeichert: spaetere Ergaenzungen fliessen automatisch in die Memory ein
- Retrieval funktioniert interface-unabhaengig: "Was habe ich letzten Monat ueber X diskutiert?" liefert Treffer, egal in welchem Tool das Gespraech stattfand
- Client-spezifischer Hot-Memory-Kontext: Claude Code bekommt Coding-Kontext, Claude Desktop bekommt persoenlichen Kontext, OpenClaw-Worker bekommt minimalen Identifikations-Kontext
- User entscheidet, wo die Memory lebt (UCM-DB oder Obsilo-Vault als Backend)
- Mobile Capture via Telegram-Voice zu OpenClaw wird zum ersten Schritt in den Memory-Lifecycle, nicht zu einem separaten Silo

### 2.4 Gap Analysis

| Gap | Current | Target |
|---|---|---|
| Interface-Konvergenz | Fragmentiert, pro Tool isoliert | Ein Memory-Store, viele Clients |
| Kuratierung | Implizit / automatisch je Tool | Explizit via User-Trigger |
| Memory-Profile | Inexistent | Pro Client/Use-Case konfigurierbar |
| Persistence-Flexibilitaet | Hardcoded pro Tool | UCM-DB oder Obsilo-Backend waehlbar |
| Living Documents | Konversation = finales Artefakt | Konversation bleibt memory-eligible, waechst mit |
| Cross-Interface Threads | Inexistent | Konversation ueber mehrere Tools hinweg verfolgbar |
| Mobile Capture Integration | Separates Inbox-System | Integraler Teil des AI-Memory-Flows |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|---|---|---|---|---|
| Sebastian (Builder & Primary User) | Owner, Developer, erster User | H | H | Funktioniert zuverlaessig in seinem Setup, integriert sauber mit Obsilo Memory v2 |
| Bestehende Obsilo-Nutzer | Potential Early Adopters | M | M | Opt-in moeglich, Obsilo-Memory-Verhalten nicht durch UCM-Integration brechen |
| Open-Source Community | Potential Contributors / User | M | L | Klares Value Proposition, gute Dokumentation, pluggable Backends |
| Anthropic / Claude Platform | Ecosystem-Kontext | L | L | MCP-konforme Implementation |
| OpenAI / ChatGPT Platform | Ecosystem-Kontext fuer Developer-Mode | L | L | MCP-konforme Implementation |

### 3.2 Key Stakeholders

**Primary:** Sebastian: baut zuerst fuer sich selbst. Alle Design-Entscheidungen muessen seinen Workflow bedienen, bevor Verallgemeinerung diskutiert wird.

**Secondary:** Obsilo-Nutzer, die UCM als Ergaenzung adoptieren koennten. Fuer sie muss klar sein: UCM ist eine **separate Anwendung**, die Obsilo's Memory v2 Engine wiederverwendet. Standalone-Obsilo bleibt unveraendert nutzbar.

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: Sebastian (Primary User)**

- **Rolle:** Senior Manager Digital Transformation, Builder von Obsilo
- **Ziele:** Gedanken und Entscheidungen aus beliebigem AI-Tool spaeter wiederfinden, ohne vorher zu wissen wo sie entstanden sind. Mobile Capture soll sich in den Knowledge-Workflow integrieren, nicht danebenstehen. Client-spezifischer Kontext: Claude Code soll wissen, wie ich code, ohne dass es persoenliche Gespraechsthemen kennt.
- **Pain Points:** Context-Switches zwischen Tools, wichtige Erkenntnisse aus Claude Desktop bleiben dort, Voice Memos in Apple Notes landen in einem toten Inbox-Silo, jeder Client kennt mich entweder nicht (kein Kontext) oder zu allgemein (alles oder nichts)
- **Nutzungshaeufigkeit:** Daily

**Persona 2: Obsilo Power User**

- **Rolle:** Wissensarbeiter, der Obsidian als Second Brain nutzt und Obsilo bereits im Einsatz hat
- **Ziele:** Memory bleibt im eigenen Vault (Souveraenitaet), aber auch Konversationen aus Claude Desktop oder ChatGPT sollen dort auffindbar sein
- **Pain Points:** Bisherige AI-Tools schreiben nicht zurueck in den Vault, doppelte Buchfuehrung zwischen AI-Memory und Second Brain
- **Nutzungshaeufigkeit:** Weekly, wenn wichtige Entscheidungen/Gedanken festgehalten werden sollen

### 4.2 User Journey (High-Level)

1. User fuehrt Konversation in beliebigem Interface (Claude, Claude Code, ChatGPT-Developer-Mode, Obsilo, OpenClaw via Telegram)
2. Beim Konversationsstart hat das Interface Zugriff auf das passende **Memory Profile** via UCM-MCP-Endpoint (z.B. Claude Code -> Profile `coding`)
3. User erkennt Mehrwert der Konversation, triggert "save to memory" Skill/Command
4. Konversation wird als *memory-eligible* markiert, kein sofortiger Cutoff
5. User kann die Konversation spaeter fortsetzen, auch in einem anderen Interface (Cross-Interface Thread); neue Beitraege fliessen automatisch in die Memory ein
6. Asynchrone Extraction-Pipeline (Obsilo Memory v2 Engine) verarbeitet die Konversation: Atomic Facts, Topics, Importance, Konflikt-Resolution
7. Spaeter, in beliebigem Interface: User fragt "Was habe ich zu X diskutiert?", Retrieval via MCP liefert Treffer aus allen gespeicherten Konversationen, optional gefiltert nach Source-Interface

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Die zunehmende Parallelnutzung spezialisierter AI-Interfaces erzeugt einen fundamentalen Widerspruch: Jedes Tool wird fuer seine Spezialisierung gewaehlt, aber die resultierende Memory-Fragmentierung untergraebt den eigentlichen Zweck von Memory, naemlich Kontinuitaet ueber die Zeit. Der User kann sich nicht erinnern, *wo* er einen Gedanken gefuehrt hat, bevor er ihn wiederfinden will.

Verstaerkend kommt hinzu: Die meisten existierenden Memory-Systeme behandeln den User als **monolithisches Subjekt**, entweder kennt das Tool den User vollstaendig oder gar nicht. Tatsaechlich aber unterscheiden sich die relevanten Kontexte je nach Use-Case stark. Ein Coding-Assistent braucht andere Hot-Memory-Inhalte als ein persoenlicher Begleiter.

Existierende Loesungen (Mem0, MemoryPlugin, OpenMemory, Memoir, Supermemory) adressieren Teile des Problems, aber keine loest die spezifische Kombination aus: explizite User-Kuratierung, pluggable Persistence, Memory-Profile pro Use-Case, Living-Document-Modell, Obsidian-als-Source-of-Truth Option.

### 5.1.1 Selling-Point-Profil (Differenzierung)

**Konkurrenz-Landschaft 2026 (Stand April 2026):**

| Loesung | Lizenz / Hosting | Benchmark-Position | Differenzierung |
|---|---|---|---|
| **Supermemory** | Closed-Cloud, Self-Host nur Enterprise | LongMemEval 85.4%, LoCoMo #1 | Reifste, ontology-aware Graph-Engine, proprietaer |
| **Mem0** | OSS-SDK + Cloud-Pro-Tier | LongMemEval 93.4% (April 2026), LoCoMo 85% | Token-effizienteste, hierarchische Extraction |
| **Zep** | OSS + Cloud | LongMemEval temporal 63.8% | Temporal Knowledge Graph als Spezialitaet |
| **Letta (MemGPT)** | OSS, Self-Host | nicht ranked | Self-Editing-Memory via Tool-Calls aus Agent-Loop |
| **MemoryPlugin** | OSS, ChatGPT-fokussiert | nicht ranked | nur ChatGPT, kein Multi-Source |
| **Memoir** | SaaS | nicht ranked | E2E-Encrypted, Privacy-Premium |
| **OpenMemory** | OSS, Self-Host-Konzept | nicht ranked | Local-First-Konzept, kein UI |
| **UCM (geplant)** | OSS Apache 2.0, Self-Host (Plugin oder Standalone) | MVP-Ziel 70-80%, post-Iteration 80-85% | MCP-Native + Multi-Worker + Obsidian-Bridge |

Sieben Differenzierungsmerkmale zu existierenden Loesungen, geordnet nach Wichtigkeit:

| # | Selling-Point | UCM-Implementierung | Existierende Loesungen schaffen das nicht so |
|---|---|---|---|
| 1 | **Local-First, kein Cloud-Zwang** | Engine laeuft im Plugin-Worker oder auf User-eigenem Server. Keine Telemetrie, keine Cloud-Abhaengigkeit ausser konfigurierten LLM-Providern | Mem0 SaaS, Memoir SaaS sind Cloud-zentriert. OpenMemory ist Self-Hosted-Konzept aber ohne UI |
| 2 | **Multi-Source via MCP-Standard** | Claude Desktop / Claude Code / ChatGPT-Developer-Mode / Obsilo / OpenClaw via einer einheitlichen MCP-API | MemoryPlugin: nur OpenAI ChatGPT. Mem0: SDK-Pflicht pro Sprache. Supermemory: Vendor-spezifisch |
| 3 | **Token-effiziente Engine** | Single-Call-Extraction (~1500 Tokens/Op, Mem0-Benchmark-Ziel), KV-Cache-aware Composition (>60% Cache-Hit-Rate), Lazy Conflict-Resolution (<10% LLM-Calls) | A-MEM, Mem0 sind Forschungs-Vorbild aber proprietaer; UCM nutzt Best-Practices openly |
| 4 | **Pluggable Persistence (3 Setup-Klassen)** | A Single-Device, B Vault-Sync (via Obsidian-Sync), C Central-Service (User-eigener Server), wechselbar via Settings + Migrations-Wizard | Andere Loesungen haben fest-verdrahtete Persistenz |
| 5 | **Living-Document-Modell** | Conversations bleiben memory-eligible nach Mark, neue Messages fliessen via incremental Re-Extraction. Re-Extract ist linear in Delta, nicht in Conversation-Laenge | Andere Loesungen behandeln Conversation als finales Artefakt |
| 6 | **Souveraenitaet ueber Persistenz-Standort** | DBs koennen im Plugin-Datenverzeichnis, im Vault (Obsidian-Sync-faehig) oder beim User-eigenen Server liegen. Keine Vendor-Lock-in | SaaS-Loesungen haben User-Daten im Vendor-Cloud |
| 7 | **Obsidian-Vault-Integration als optionales Premium** | Plugin-Worker liefert Cross-Source-Search (Global-Tab), `mentions_vault_note`-Edges verbinden Memory mit Vault-Knowledge | Bisherige Plugins (MemoryPlugin etc.) haben keine Vault-Integration in beide Richtungen |

**Direkte Differenzierung gegen Supermemory** (closed-cloud, state-of-the-art Benchmark): UCM hat NICHT Supermemorys Reife oder Benchmark-Score zum Launch. Die Botschaft ist nicht "schneller", sondern "souveraener". Konkrete Achsen:

- **Lizenz-Souveraenitaet:** UCM Apache 2.0, jeder kann self-hosten ohne Vertrag. Supermemorys Self-Hosting nur Enterprise mit Lizenzgespraech.
- **Vendor-Neutrale MCP-Integration:** UCM nutzt MCP-Standard, jeder MCP-Client funktioniert ohne Sondercode. Supermemory hat proprietaere SDKs pro Framework.
- **Plugin-Worker-Modell:** UCM braucht keinen separaten Server fuer Single-Device. Supermemory ist Cloud-only oder Enterprise-VPC.
- **Pluggable Persistence (3 Klassen):** User entscheidet wo die DBs liegen. Supermemory ist Cloud-zentriert.
- **Obsidian-Vault-Bridge:** einzigartig im Markt, weder Supermemory noch Mem0/Zep haben das.

### 5.1.2 Benchmark-Strategie

UCM-Engine wird **gegen [MemoryBench](https://github.com/supermemoryai/memorybench)** getestet (MIT-lizenziert, "interoperabel: mix and match any provider with any benchmark"). Das ist die offene Vergleichsbasis fuer LoCoMo, LongMemEval und ConvoMem.

**Realistische MVP-Zielwerte** (basierend auf Konkurrenz-Stand April 2026):

| Metrik | Supermemory | Mem0 (April 2026) | Zep | UCM-MVP-Ziel | UCM-Iteration-Ziel (6-12 Monate) |
|---|---|---|---|---|---|
| LongMemEval gesamt | 85.4% | 93.4% | n.a. | 70-80% | 80-85% |
| LongMemEval temporal | 82.0% | n.a. | 63.8% | 65-75% | 75-80% |
| LongMemEval multi-session | 76.7% | n.a. | n.a. | 65-75% | 75-80% |
| LoCoMo | #1-Ranking | 85.0% | n.a. | 65-75% | 75-80% |
| Retrieval-Latenz p95 | < 300ms | 7-8s | ~4s | < 200ms (Single-Device) | < 200ms |

**Veroeffentlichungs-Strategie:** Bench-Run intern als Quality-Gate vor Public-Release. Score wird nur veroeffentlicht, wenn UCM > 70% LongMemEval erreicht. Sonst: Bench-Adapter im Repo lassen (User kann selbst messen), aber kein Marketing-Claim machen.

**MemoryBench-Adapter** wird als Engine-Public-Artefakt in FEAT-03-21 (Engine-Extract) aufgenommen. Provider-Adapter-Spec aus dem MemoryBench-Repo (`src/providers/README.md`) erfordert: Ingest-API, Search-API, Reset-API. Alle drei sind in unserer Engine-API ohnehin vorhanden (`historyStore.ingestConversation`, `factStore.semanticSearch`/`searchHistoryService.search`, plus Reset via `MigrationService.dumpAll()` und Test-DB-Setup).

**Anti-Selling-Points (bewusst out-of-scope, weil Trade-offs):**

- **Kein eigenes Cloud-Hosting v1** -- User muss selbst entweder Plugin oder Server hosten. Akzeptierter Reibungspunkt fuer Local-First-Versprechen.
- **Kein eigenes Web-Dashboard v1** -- Standalone-Worker hat MCP-Tool-API, fuer Inspection nutzt der User Obsidian (Plugin-Worker) oder direkt Claude Desktop / ChatGPT als UI. Web-Dashboard kommt post-MVP.
- **Kein Multi-User v1** -- UCM ist Single-User, kein Team-Sharing oder Workspace-Konzept. Akzeptierter Cut.

**Reihenfolge der Selling-Points fuer Marketing:** Bei UCM-Public-Release entweder "Local-First + Multi-Source" (technische User) oder "Souveraenitaet ueber deine AI-Memory" (Privacy-bewusste User) als Top-Botschaft. Profile-Routing pro Client-Use-Case (Coding vs. Personal) ist Differenzierung gegen flat-Memory-Konkurrenten.

### 5.2 Root Causes

- Jeder AI-Anbieter optimiert Memory fuer seinen eigenen Walled Garden
- MCP als Standard ist noch jung, interface-uebergreifende Memory-Patterns sind nicht etabliert
- Automatische Memory-Systeme erzeugen Noise (alles wird gespeichert), rein manuelle Systeme erzeugen Reibung (nichts passiert ohne Aufwand)
- Die Persistence-Frage ("wo lebt meine Memory?") wird von jedem Tool einseitig beantwortet, ohne dem User Wahl zu lassen
- Memory wird flach modelliert: keine Topics, kein Aging, keine Profile

### 5.3 Impact

- **Business Impact:** Zeitverlust beim Wiederfinden von Entscheidungen und Erkenntnissen, doppelte Arbeit durch redundante Kontextaufbau-Gespraeche, Werterosion von Gespraechsartefakten, die nie wiedergefunden werden
- **User Impact:** Kognitive Last beim Tool-Switch, Frustration durch "ich weiss, dass ich das schon mal besprochen habe, aber wo?", mobile Capture fuehlt sich disconnected vom eigentlichen Knowledge-Work an, Tools sind entweder zu uninformiert oder zu generisch informiert

---

## 6. Goals & Objectives

### 6.1 Business Goals

- Sebastian baut ein Tool, das sein eigenes Workflow-Problem loest
- Potentiell: Open-Source-Projekt, das analog zu Obsilo eine Nische besetzt (Unified AI Memory mit pluggable Backend und Memory-Profilen)
- Oekosystem-Kompatibilitaet: Baut auf MCP-Standard auf, funktioniert mit Claude, ChatGPT (Developer-Mode), Obsilo, beliebigen MCP-Clients

### 6.2 User Goals

- Ein konsistentes mentales Modell: "Wichtige Gespraeche markiere ich, danach sind sie auffindbar, egal in welchem Tool ich sie gefuehrt habe"
- Kein manueller Sync, keine Exports, keine Kopierarbeit
- Souveraenitaet ueber die eigene Memory: Persistence-Location ist eine bewusste User-Entscheidung
- Client-passender Kontext: Jedes Tool sieht das, was es sehen sollte, nicht mehr und nicht weniger

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|---|---|---|---|
| Anzahl Interfaces mit "save to memory" Integration | 0 | Min. 4 (Claude Desktop, Claude Code, ChatGPT-Developer-Mode, Obsilo) | MVP |
| Memory-Profile unterstuetzt | 0 | Min. 4 (default, coding, personal, quick-capture) | MVP |
| Retrieval-Latenz (lokales Setup, LAN) | N/A | < 500ms p95 | MVP |
| Persistence-Backends unterstuetzt | 0 | 2 (UCM-eigene SQLite, Obsilo-Vault mit Sidecar) | MVP |
| Offline-Resilienz: UCM-Writes funktionieren wenn Obsilo offline | N/A | 100% (always-on Persistence Layer) | MVP |
| Reuse von Obsilo Memory v2 Engine | N/A | > 80% der Memory-Logik wiederverwendet, nicht reimplementiert | MVP |
| MemoryBench LongMemEval gesamt | N/A | > 70% (Quality-Gate vor Public-Release) | MVP |
| MemoryBench LoCoMo | N/A | > 65% (Quality-Gate vor Public-Release) | MVP |
| MemoryBench Score post-Iteration | N/A | > 80% (Konkurrenzfaehigkeit zu Supermemory) | 6-12 Monate post-MVP |

---

## 7. Scope Definition

### 7.1 In Scope (MVP)

- Standalone MCP-Server "Unified Chat Memory" als Node/TypeScript-Service
- **Wiederverwendung der Obsilo Memory v2 Engine** als Library (`@obsilo/memory-engine` Package, extrahiert in Phase 7 von Obsilo Memory v2)
- UCM-spezifische Erweiterungen on top: Memory-Profile, Cross-Interface Threads, Source-Interface Provenance
- Always-on Persistence Layer: SQLite (UCM's eigene DB) als primaerer Store
- Pluggable Persistence-Abstraktion mit zwei initialen Backends:
  - **UCM-Native:** Eigene SQLite-DB, vollstaendig UCM-kontrolliert
  - **Obsilo-Backend:** Inhalte (Konversationen, Memory-Files) liegen im Obsilo-Vault, UCM-spezifische Metadaten in Sidecar-DB neben Obsilo's `memory.db`
- "Save to memory" Skill/Command fuer: Claude Desktop (via MCP), Claude Code (via MCP), ChatGPT (via Developer-Mode-MCP), Obsilo (via nativer Skill in Phase 5 von Obsilo Memory v2)
- Living-Document-Modell: Konversation wird per Flag memory-eligible markiert, spaetere Ergaenzungen werden automatisch einbezogen, auch ueber Interface-Grenzen hinweg
- Cross-Interface Thread-Konzept: Konversation kann von Claude Desktop in Claude Code fortgesetzt werden
- MCP-Tools fuer Clients:
  - `get_essential_memory(profile)`: Hot-Memory fuer gegebenes Profil
  - `recall_memory(query, profile?)`: Cold-Memory-Suche
  - `search_history(query, ...)`: Volltextsuche ueber alle Konversationen
  - `mark_for_memory(conversation_id, reason?)`: Memory-eligible markieren
  - `save_conversation(conv)`: Konversation persistieren
- Settings-Entscheidung "Retrieval Source" pro Client: UCM-Service vs. Obsilo-Twin (lokal, stale-tolerant)
- Konfiguration ueber einfache JSON/YAML-Datei

### 7.2 Out of Scope (MVP)

- Deduplication ueber Interface-Grenzen hinweg (erst Iteration 2, Engine hat aber bereits Konflikt-Resolution intra-source)
- Team-Sharing / Multi-User-Szenarien
- Cloud-Backup des Persistence Layer
- End-to-End-Verschluesselung (Memoir-Style)
- Automatisches Profil-Routing (LLM erkennt: "diese Konversation ist Coding"), initial pro Client fest konfiguriert
- Voice-Capture-Pipeline (OpenClaw + Telegram als Ingestion-Quelle), separater Workstream nach UCM-MVP
- GUI / Dashboard fuer Memory-Browsing **wird in Standalone-Worker P1 erforderlich**: Da die meisten UCM-User kein Obsilo haben (Obsilo ist Nischenprodukt), braucht der Standalone-Worker zwingend ein eigenes UI (Web-Dashboard oder Electron-Wrapper). Plugin-Worker-User nutzen Obsilos History-Sidebar mit Global-Tab. Konkretes UI-Detail: Out-of-Scope fuer Memory-v2-Initiative, im Scope fuer separates UCM-Repo.

### 7.3 Assumptions

- **Obsilo Memory v2 ist abgeschlossen und die Engine ist als Library extrahiert** (Phase 7 von Obsilo Memory v2 Plan). Dies ist die kritischste Vorbedingung.
- Ein always-on Rechner ist verfuegbar (Ubuntu-Notebook fuer MVP, spaeter migrierbar)
- Lokale LLM-Inferenz ist im UCM-MVP **nicht erforderlich**, alle Extraction-Calls gehen via Cloud-API
- MCP bleibt der relevante Standard fuer Interface-Integration (Claude, ChatGPT-Developer-Mode beide unterstuetzen MCP)
- Migration auf leistungsfaehigere Hardware ist spaeter moeglich, Architektur muss diese Migration unterstuetzen
- Sebastian ist Primary User und Contributor fuer die ersten Monate

### 7.4 Constraints

- **Engine-Reuse zwingend:** UCM darf Obsilo's Memory-Logik nicht reimplementieren. Wenn Funktionalitaet fehlt, wird Obsilo's Engine erweitert, nicht UCM-spezifisch dupliziert.
- **Sidecar-Prinzip fuer Obsilo-Backend:** UCM veraendert Obsilo's Schema NICHT. UCM-spezifische Daten (Memory-Profile, Source-Interface-Tagging, Cross-Interface-Threads) leben in einer separaten `ucm-sidecar.db` neben Obsilo's `memory.db`.
- **Hardware-Budget:** MVP muss auf vorhandener Hardware (Ubuntu-Notebook) laufen
- **Privacy:** Alles lokal, keine Cloud-Abhaengigkeit ausser fuer LLM-Calls, keine Telemetrie
- **Lizenz:** Apache 2.0 (konsistent mit Obsilo-Core)
- **Personelle Ressourcen:** Sebastian als Einzel-Entwickler
- **Kompatibilitaet:** Standalone-Obsilo darf von UCM-Existenz nichts mitbekommen, wenn der User UCM nicht nutzt

### 7.5 Zeitliche Abhaengigkeit zu Obsilo Memory v2

UCM-Bau startet **fruehestens nach Phase 7 von Obsilo Memory v2** (Engine-Extraction als Library).

| Meilenstein | Voraussetzung | Realistischer Zeitpunkt |
|---|---|---|
| Obsilo Memory v2 Phase 0-3 (Storage, Migration, Retrieval) | Aktueller Stand | Bis ~Q2 2026 |
| Obsilo Memory v2 Phase 4-6 (Updates, Living Document, History-Search) | Phase 0-3 abgeschlossen | Bis ~Q3 2026 |
| Obsilo Memory v2 Phase 7 (Engine-Extraction) | Phase 4-6 abgeschlossen | Bis ~Q3/Q4 2026 |
| **UCM-MVP Start** | Engine-Extraction abgeschlossen | **fruehestens Q3/Q4 2026** |
| UCM-MVP Release | ca. 6-8 Wochen Entwicklung | **Q4 2026 / Q1 2027** |

Diese Zeitplanung beruecksichtigt Sebastian's part-time Arbeitsweise und sein bekanntes Immersion-then-Abandonment-Pattern. Sie ist bewusst konservativ.

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Obsilo Memory v2 wird nicht abgeschlossen, UCM-Foundation fehlt | M | H | Pfad-2-Plan hat Stop-Punkte nach Phase 3, selbst bei Stopp ist die Engine teilweise nutzbar. UCM kann notfalls auf der teilweise extrahierten Engine bauen, akzeptiert aber dann einige fehlende Features. |
| Latenz-Degradation beim Retrieval (MCP-Roundtrip zum UCM-Server) | M | H | Hybrid-Modell: Obsilo nutzt lokalen Twin fuer Reads, UCM-Service fuer Writes, Retrieval-Source pro Client in Settings waehlbar |
| Sync-Inkonsistenzen zwischen UCM-DB und Obsilo-Vault (im Backend-Modus) | H | M | Sidecar-Prinzip macht Konflikte unwahrscheinlich (UCM-Daten und Obsilo-Daten ueberlappen nicht), klare Schreibrichtung definiert |
| ChatGPT-Developer-Mode aendert MCP-Implementation, bricht Integration | M | M | Vendor-Risiko, Mitigation durch MCP-konforme Standard-Implementation, kein OpenAI-spezifischer Code |
| Memory-Profile zu starr definiert, User braucht andere Profile | M | M | Profile sind Config-getrieben, nicht hardcoded, User kann eigene Profile anlegen |
| Obsilo-User wollen UCM nicht, Entwicklung laeuft ins Leere | M | M | Sebastian ist Primary User, Produkt wird primaer fuer ihn gebaut, Community-Adoption ist Bonus |
| Cross-Interface Thread-Continuity ist unzuverlaessig (User vergisst zu verlinken) | H | L | Auto-Detection als Default mit User-Confirmation, manuelle Verlinkung moeglich aber nicht erforderlich |
| Scope Creep: "Unified Memory" verlockt zu Feature-Vollstaendigkeit | H | H | Strikt auf MVP-Scope bleiben, Iteration 2 erst nach Dogfooding |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

- Ingestion via "save to memory" Trigger aus mindestens vier Interfaces (Claude Desktop, Claude Code, ChatGPT-Developer-Mode, Obsilo)
- Memory-Profile-System mit mindestens vier Profilen (default, coding, personal, quick-capture)
- Living-Document-Modell fuer markierte Konversationen, cross-interface
- Cross-Interface Thread-Konzept mit User-bestaetigter oder Auto-Detection
- Wiederverwendung der Obsilo Memory v2 Engine fuer Storage, Extraction, Konflikt-Resolution
- Pluggable Persistence Layer mit zwei initialen Backends (UCM-Native, Obsilo-Sidecar)
- MCP-basierter Service mit fuenf Kern-Tools (get_essential_memory, recall_memory, search_history, mark_for_memory, save_conversation)
- Konfigurierbare Retrieval-Source pro Client

### 9.2 Non-Functional Requirements (Summary)

- **Performance:** Retrieval p95 < 500ms im lokalen LAN, Write-Operation < 200ms (Extraction laeuft async im Hintergrund)
- **Security:** Local-first, keine Cloud-Calls ausser zu konfigurierten LLM-Providern, keine Telemetrie
- **Scalability:** Single-User MVP, SQLite-Limits akzeptiert (hunderttausende Konversationen realistisch)
- **Availability:** Persistence Layer ist always-on, Clients koennen offline sein ohne Datenverlust
- **Portability:** Laeuft auf jeder Plattform mit Node.js
- **Compatibility:** MCP-konform, funktioniert mit jedem MCP-Client ohne Anpassung

### 9.3 Key Features (fuer RE)

| Priority | Feature | Description |
|---|---|---|
| P0 | MCP Server mit 5 Kern-Tools | Kern-Endpunkte fuer alle Clients |
| P0 | Obsilo Memory Engine Integration | Engine als Library importiert, konfiguriert, betrieben |
| P0 | UCM-Native Persistence Backend | SQLite-DB fuer UCM-spezifische Daten |
| P0 | Memory-Profile-System | Pro Client konfiguriertes Profile-Routing |
| P0 | Save-to-Memory Trigger Integration | Pro Interface dokumentierte Integration |
| P0 | Source-Interface Provenance | Jede gespeicherte Konversation/Fact traegt Herkunfts-Tag |
| P1 | Obsilo-Backend-Modus mit Sidecar | Obsilo als Persistence Layer mit klarer Trennung |
| P1 | Cross-Interface Thread-Detection | Auto-Detection mit User-Confirmation |
| P1 | Retrieval-Source Setting pro Client | UCM-DB direkt vs. lokaler Twin |
| P2 | Auto-Profile-Routing (LLM-basiert) | LLM erkennt Konversations-Typ und routed Profil |
| P2 | Voice-Capture Ingestion via OpenClaw | Telegram-Voice -> Transcription -> UCM-Save |

---

## 10. Architektur-Skizze (informativ, Detail folgt in Architecture-Phase)

```
                    +----------------------------------+
                    |         UCM Service              |
                    |  +----------------------------+  |
                    |  |  MCP Server (5 Kern-Tools) |  |
                    |  +-------------+--------------+  |
                    |                |                 |
                    |  +-------------+--------------+  |
                    |  |  UCM Domain Logic          |  |
                    |  |  - Memory-Profile-Routing  |  |
                    |  |  - Cross-Interface Threads |  |
                    |  |  - Source-Interface Tagging|  |
                    |  +-------------+--------------+  |
                    |                |                 |
                    |  +-------------+--------------+  |
                    |  |  @obsilo/memory-engine     |  |
                    |  |  (FactStore, Extractor,    |  |
                    |  |   Integrator, Composer)    |  |
                    |  +-------------+--------------+  |
                    |                |                 |
                    |  +-------------+--------------+  |
                    |  |  Persistence Adapter       |  |
                    |  +------+--------------+------+  |
                    +---------+--------------+---------+
                              |              |
                  +-----------+--+        +--+--------------------+
                  | UCM-Native   |        | Obsilo-Backend Mode   |
                  |              |        |                       |
                  | ucm.db       |        | Obsilo Vault          |
                  | (alles in    |        | + ucm-sidecar.db      |
                  |  einer DB)   |        |   (UCM-Erweiterungen) |
                  +--------------+        +-----------------------+

Clients (Konfiguration pro Client):
- Claude Desktop:           profile=default,    retrieval=ucm-direct
- Claude Code:              profile=coding,     retrieval=ucm-direct
- ChatGPT Developer-Mode:   profile=default,    retrieval=ucm-direct
- Obsilo (Sebastian):       profile=default,    retrieval=local-twin
- OpenClaw (Telegram):      profile=quick-cap,  retrieval=ucm-direct
```

---

## 11. Next Steps

- [ ] BA-Review durch Sebastian, offene Fragen klaeren (siehe Appendix B)
- [ ] Entscheidung: Bevorzugtes Persistence-Backend fuer eigenen Workflow (UCM-Native vs. Obsilo-Sidecar)
- [ ] Entscheidung: Memory-Profile-Liste finalisieren (default, coding, personal, quick-capture sind Vorschlaege)
- [ ] Entscheidung: Projektname final ("Unified Chat Memory" als Arbeitstitel)
- [ ] **Erst nach Abschluss von Obsilo Memory v2:** Uebergabe an Requirements Engineering (`/requirements-engineering`)
- [ ] Waehrend Obsilo Memory v2 laeuft: parallele BA-Verfeinerung moeglich, aber kein UCM-Code

---

## Appendix

### A. Glossar

- **UCM:** Unified Chat Memory (Arbeitstitel dieses Services)
- **Memory-eligible:** Eine Konversation ist als speicherwuerdig markiert, alle aktuellen und zukuenftigen Messages in ihr fliessen in die Memory ein
- **Living Document:** Konversation, die nach "save to memory" Trigger nicht geschlossen wird, sondern bei Ergaenzung automatisch die Memory aktualisiert
- **Memory Profile:** Vordefinierte Auswahl von Memory-Inhalten und Topics, abgestimmt auf einen Use-Case (z.B. coding, personal)
- **Cross-Interface Thread:** Konversation, die ueber mehrere Interfaces fortgefuehrt wird, geteilte Thread-ID
- **Source-Interface:** Tag, das angibt, aus welchem Tool eine Konversation/ein Fakt stammt (obsilo, claude-desktop, claude-code, chatgpt-dev-mcp, telegram-voice-via-openclaw, ...)
- **Persistence Layer:** Die technische Schicht, die Memory persistiert (UCM-Native SQLite oder Obsilo-Backend mit Sidecar)
- **Sidecar-DB:** Separate SQLite-Datei (`ucm-sidecar.db`) neben Obsilo's `memory.db`, enthaelt UCM-spezifische Metadaten ohne Obsilo's Schema zu modifizieren
- **Twin:** Lokale Read-Replica der Service-DB fuer niedrige Retrieval-Latenz
- **Source of Truth:** Das Backend, das autoritativ ueber den aktuellen Memory-Stand entscheidet (immer UCM-Native DB, auch im Obsilo-Backend-Modus)
- **MCP:** Model Context Protocol (Anthropic-Standard fuer Tool-Integration, auch von ChatGPT Developer-Mode unterstuetzt)
- **Engine:** `@obsilo/memory-engine`, die aus Obsilo extrahierte Memory-Library, die UCM wiederverwendet

### B. Offene Fragen fuer Architecture-Phase

1. **Memory-Profile-Persistenz:** Sind Profile statisch in Config-File definiert, oder dynamisch per CRUD-API verwaltbar?
2. **Profile-Uebergaenge:** Was passiert, wenn ein Fakt eigentlich zu Profile A gehoert, aber in einer Profile-B-Konversation entstanden ist?
3. **Obsilo-Backend Sync-Latenz:** Ist die Obsilo-Datei-Schreibung im Hintergrund-Sync OK, oder muessen Schreiboperationen synchron mit MCP-Save sein?
4. **Konflikt-Resolution cross-Interface:** Wenn zwei Interfaces (Claude Desktop und Claude Code) gleichzeitig zu derselben Konversation Fakten extrahieren wollen, wie wird Race-Condition gehandhabt?
5. **Auth zwischen Clients und UCM-Service:** Im LAN ohne Auth OK, aber bei Cloudflare-Tunnel fuer ChatGPT-Developer-Mode? Token-basiert?
6. **Rate Limiting:** Soll UCM Rate-Limiting pro Client haben, um runaway-Loops zu verhindern?
7. **Backup-Strategie:** UCM-DB regelmaessig automatisch backuppen? Wo? Wie oft?

### C. References

- **Obsilo Memory v2 Plan:** `_devprocess/requirements/OBSILO-MEMORY-V2-FULL-REWRITE.md` (KRITISCHE Vorbedingung)
- **Vorgaengerversion dieser BA:** keine validierte v1 in `_devprocess/analysis/` (im Doc als `BA-UNIFIED-CHAT-MEMORY.md` referenziert, war Pre-Repo-Sketch)
- **Obsilo Repo:** github.com/pssah4/obsilo
- **Obsilo Memory-Architektur Diskussion:** ConversationStore (`src/core/history/`), MemoryService + ExtractionQueue (`src/core/memory/`), SemanticIndexService (`src/core/semantic/`)
- **Anthropic Contextual Retrieval Pattern:** Obsilo ADR-51
- **Vergleichsanalyse existierender Loesungen:** Mem0, MemoryPlugin, OpenMemory (CaviraOSS), Memoir (camgitt), MemPalace, Supermemory
- **OpenClaw Architecture:** Pugh-Meeting Notes, Telegram-Integration (fuer spaeter relevanten Workstream)
- **User-Profile:** `Notes/Sebastian Hanke.md` im Obsidian-Vault
