# Business Analysis: Unified Knowledge Layer

> **Scope:** MVP
> **Erstellt:** 2026-03-29
> **Status:** Draft

---

## 1. Executive Summary

### 1.1 Problem Statement

Obsilos semantische Suche ist durch einen kritischen Skalierungsbug nicht nutzbar: Die vectra-Bibliothek speichert alle Vektoren in einer einzigen JSON-Datei (aktuell 507MB), die V8's String-Limit bei `JSON.stringify()` sprengt. Der Index wird bei jedem Neustart komplett neu aufgebaut und scheitert erneut -- eine Endlosschleife. Darueber hinaus liefert die bestehende Vektorsuche nur isolierte Text-Chunks ohne strukturelle Vernetzung: implizite Zusammenhaenge zwischen Notes bleiben unsichtbar.

### 1.2 Proposed Solution

Ein Unified Knowledge Layer basierend auf SQLite (sql.js WASM) ersetzt vectra und konsolidiert alle maschinenlesbaren Wissensdaten (Embeddings, Sessions, Episodes, Recipes) in einer Datenbank. Vier Retrieval-Stufen -- Vector Search, Graph Expansion, Implicit Connections und Reranking -- ermoeglichen vernetztes Denken: Obsilo erkennt und zeigt Verbindungen zwischen Notes, die der User nicht explizit modelliert hat.

### 1.3 Expected Outcomes

- Semantische Suche funktioniert zuverlaessig auf Vaults jeder Groesse (kein 507MB JSON-Limit mehr)
- Suchergebnisse enthalten strukturellen Kontext (verlinkte Notes, Tags, MOC-Zugehoerigkeit)
- Implizite Verbindungen werden aktiv aufgedeckt ("Diese Notes koennten zusammenhaengen")
- Praezisere Ergebnisse durch Reranking (33-47% Verbesserung gegenueber reiner Cosine-Similarity)
- Mobile-Kompatibilitaet (sql.js WASM + vault.adapter statt Node.js fs)
- Konsolidierte Datenhaltung (eine .db statt hunderte lose JSON/MD-Dateien)

---

## 2. Business Context

### 2.1 Background

Obsilo ist ein AI-Agent als Obsidian-Plugin mit Hybrid-Gateway-Strategie: Standalone in Obsidian und via MCP-Connector fuer externe LLM-Clients (Claude Code etc.). Die semantische Suche (`semantic_search` Tool) ist ein Kern-Differenzierungsmerkmal -- kein externer Client kann einen Embedding-Index ueber den Vault aufbauen.

Der Vault des Users enthaelt 826 Markdown-Dateien (~12MB Text) mit reichhaltiger Frontmatter-Vernetzung ueber MOC-Properties (Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen). Diese explizite Struktur wird aktuell nicht fuer die Suche genutzt.

### 2.2 Current State ("As-Is")

- **Vektorsuche:** vectra LocalIndex, speichert alle Vektoren in einer JSON-Datei
- **Embedding-Modell:** Qwen3-Embedding-8b (4096 Dimensionen) via OpenRouter
- **Index-Groesse:** 507MB JSON, 5.980 Vektoren, nur 477 von 826 Dateien indexiert (Build bricht ab)
- **Bug:** `RangeError: Invalid string length` bei `endUpdate()` -- Index wird nie vollstaendig gespeichert
- **Chunk-Strategie:** Heading-aware Chunking (2000 Zeichen), 10% Overlap
- **Suche:** Nur Cosine-Similarity auf isolierten Chunks, ein Chunk pro Datei zurueckgegeben
- **Vernetzung:** Keine -- Wikilinks, Tags und MOC-Properties werden nicht fuer Retrieval genutzt
- **Persistenz:** Checkpoint + Index auf Dateisystem via Node.js `fs` (nicht Mobile-kompatibel)
- **Maschinenlesbare Daten:** Verstreut in Sessions (.md), Episodes (.json), Patterns (.json), Recipes (.json)

### 2.3 Desired State ("To-Be")

- **Vektorsuche:** SQLite (sql.js WASM), Vektoren als Float32Array BLOBs, inkrementelle Updates
- **Retrieval:** 4-Stufen-Pipeline (Vector -> Graph -> Implicit -> Rerank) statt reiner Cosine-Similarity
- **Vernetzung:** Wikilinks, Tags und MOC-Properties (Themen, Konzepte, Personen etc.) als Graph-Schicht in der DB
- **Implizite Verbindungen:** Aktiv erkennen und dem User vorschlagen ("Note A und B reden ueber dasselbe Thema")
- **Praezision:** Lokaler Reranker (BGE-Reranker-v2-m3, ONNX) auf Desktop, Cosine-Fallback auf Mobile
- **Konsolidierung:** Eine Knowledge DB fuer Embeddings, Sessions, Episodes, Recipes
- **Persistenz:** vault.adapter (plattformuebergreifend: Desktop + Mobile)
- **learnings.md entfaellt:** Redundant mit Recipes + patterns.md + errors.md

### 2.4 Gap Analysis

| Aspekt | As-Is | To-Be | Gap |
|--------|-------|-------|-----|
| Storage-Backend | vectra (JSON, 507MB Limit) | SQLite (BLOB, multi-GB) | Komplett-Migration |
| Persistenz | Node.js `fs` (nur Desktop) | vault.adapter (Desktop + Mobile) | Storage-Layer abstrahieren |
| Retrieval-Stufen | 1 (Cosine-Similarity) | 4 (Vector + Graph + Implicit + Rerank) | 3 neue Stufen implementieren |
| Graph-Daten | Nicht genutzt | Wikilinks, Tags, MOC-Properties in DB | Extraktion + DB-Schema |
| Implizite Verbindungen | Nicht vorhanden | Vorberechnet + aktive Vorschlaege | Neuer Service + UI |
| Reranking | Nicht vorhanden | Lokal (ONNX, Desktop) / Cosine (Mobile) | Neuer Service + Modell-Integration |
| Session/Episode Storage | Lose Dateien | In Knowledge DB konsolidiert | Migration |
| learnings.md | Existiert (redundant) | Entfaellt | LongTermExtractor umrouten |
| Chunks pro Datei | 1 (best match) | N + adjacent Chunks | Retrieval-Logik erweitern |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|-------------|------|----------|-----------|-------|
| Sebastian (User/Developer) | Primaerer User + Entwickler | H | H | Vernetztes Denken, zuverlaessige Suche, Showcase fuer Agentic AI Kompetenz |
| Obsilo Agent (LLM) | Konsument der Suche | H | M | Praezise, kontextreiche Suchergebnisse fuer bessere Antworten |
| Externer LLM-Client (Claude Code) | MCP-Konsument | H | M | semantic_search via MCP muss funktionieren und relevante Ergebnisse liefern |
| Obsidian Community | Potenzielle User | M | L | Stabiles Plugin, keine Performance-Einbussen |

### 3.2 Key Stakeholders

**Primary:** Sebastian -- einziger Entscheider, Primaernutzer, Entwickler
**Secondary:** Externer LLM-Client (Claude Code via MCP-Connector) -- konsumiert semantic_search

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: Sebastian (Power User)**
- **Rolle:** Knowledge Worker, AI-Entwickler
- **Ziele:** Implizite Verbindungen in seinem Vault erkennen; Wissen vernetzen; nahtlos zwischen Obsidian und Claude wechseln
- **Pain Points:** Semantische Suche funktioniert nicht (vectra-Bug); kein vernetztes Denken ueber Cosine-Similarity hinaus; MOC-Struktur (Themen, Konzepte) wird nicht fuer Suche genutzt
- **Nutzungshaeufigkeit:** Daily
- **Vault-Struktur:** 826 Notes, reichhaltiges Frontmatter (Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen als MOC-Backlinks)

**Persona 2: Claude Code (Agent-User via MCP)**
- **Rolle:** Externer LLM-Client der Obsilo-Tools ueber MCP aufruft
- **Ziele:** semantic_search aufrufen und kontextreiche Ergebnisse erhalten; Vault-Wissen in eigene Antworten einbeziehen
- **Pain Points:** Aktuell keine funktionierende semantische Suche; nur isolierte Chunks ohne Kontext
- **Nutzungshaeufigkeit:** On-Demand (bei jeder MCP-Session)

### 4.2 User Journey (High-Level)

**Standalone (Sebastian in Obsidian):**
1. Stellt Frage: "Was weiss ich ueber Agent-Architekturen im Kontext von EAM?"
2. Obsilo durchsucht Vault semantisch (Stufe 1)
3. Folgt Wikilinks der Treffer zu verwandten Notes (Stufe 2)
4. Findet implizit verwandte Notes die nicht verlinkt sind (Stufe 3)
5. Rankt alle Ergebnisse nach Relevanz (Stufe 4)
6. Praesentiert vernetzte Antwort mit Quellen und Verbindungen

**Aktive Vorschlaege (Obsilo proaktiv):**
1. Obsilo erkennt: "EAM-Hypothesen.md" und "Digitalisierungsgrad.md" teilen Thema [[Kuenstliche Intelligenz]] und sind semantisch nah, aber nicht direkt verlinkt
2. Schlaegt Verbindung vor: "Diese Notes koennten zusammenhaengen"

**Connector (Claude Code via MCP):**
1. Claude Code ruft `semantic_search("Agent-Architekturen EAM")` via MCP
2. Obsilo fuehrt 4-Stufen-Retrieval lokal aus
3. Gibt kontextreiche Ergebnisse zurueck (Text + Pfade + Scores + Verbindungskontext)
4. Claude Code nutzt die Ergebnisse in seiner Antwort

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Drei zusammenhaengende Probleme:

**P1 (Kritischer Bug):** vectra speichert alle Vektoren in einer JSON-Datei. Bei 5.980 Vektoren mit 4096 Dimensionen erreicht die Datei 507MB. `JSON.stringify()` in `endUpdate()` ueberschreitet V8's String-Limit (~512MB) und wirft `RangeError: Invalid string length`. Der Index wird nie vollstaendig gespeichert. Beim naechsten Start: kein/korrupter Checkpoint -> Full Rebuild -> gleicher Fehler -> Endlosschleife.

**P2 (Fehlende Vernetzung):** Die aktuelle Suche liefert isolierte Text-Chunks basierend auf Cosine-Similarity. Obwohl der Vault eine reiche Struktur hat (Wikilinks, Tags, MOC-Properties wie Themen/Konzepte/Personen), wird diese fuer die Suche nicht genutzt. Implizite Verbindungen zwischen Notes sind unsichtbar.

**P3 (Fragmentierte Datenhaltung):** Sessions, Episodes, Patterns und Recipes werden als einzelne Dateien gespeichert. Cross-Referenzen (z.B. "Welche Sessions nutzten semantic_search erfolgreich?") sind nicht moeglich ohne alle Dateien zu laden und zu parsen.

### 5.2 Root Causes

- **P1:** vectra's Architektur-Entscheidung: ein monolithisches JSON-File fuer den gesamten Index. Keine Streaming-Serialisierung, keine Sharding, kein binaeres Format.
- **P1 verschaerft:** 4096-dimensionale Vektoren (Qwen3) statt 1536 (OpenAI) verdreifachen die Dateigrösse.
- **P2:** Retrieval wurde als isoliertes Chunk-Matching implementiert ohne den Obsidian-Graph einzubeziehen.
- **P3:** Historisch gewachsen -- jedes Subsystem (Memory, Mastery, Semantic) hat eigene Persistenz entwickelt.

### 5.3 Impact

- **User Impact:** Semantische Suche nicht nutzbar. Vernetztes Denken nicht moeglich. Jeder Plugin-Reload triggert minutenlangen, gescheiterten Index-Rebuild.
- **Connector Impact:** `semantic_search` via MCP liefert keine Ergebnisse -- Kern-Differenzierungsmerkmal faellt weg.
- **Showcase Impact:** Skalierungsproblem untermauert nicht die Kompetenz in Agentic AI.

---

## 6. Goals & Objectives

### 6.1 Business Goals

- Obsilos Kern-Differenzierung (semantische Suche + vernetztes Denken) zuverlaessig und skalierbar machen
- Knowledge Layer als Showcase fuer fortgeschrittene RAG-Architektur (4-Stufen Hybrid-Retrieval)
- Mobile-Readiness als Grundlage fuer breitere Nutzbarkeit

### 6.2 User Goals

- "Ich will implizite Verbindungen in meinem Vault erkennen, die ich nicht manuell modelliert habe"
- "Die Suche soll meine MOC-Struktur (Themen, Konzepte, Personen) beruecksichtigen"
- "Semantic Search muss zuverlaessig funktionieren, auch wenn mein Vault waechst"
- "Obsilo soll mir aktiv Verbindungen vorschlagen die ich uebersehen habe"

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|-----|----------|--------|-----------|
| Index-Build Erfolgsrate | 0% (RangeError) | 100% | Sofort nach Migration |
| Index-Groesse auf Disk | 507MB (JSON) | <120MB (SQLite BLOB) | Sofort nach Migration |
| Startup-Zeit (inkrementell) | Endlos-Rebuild | <5s fuer Delta-Update | Sofort nach Migration |
| Suche: Chunks pro Ergebnis | 1 (best match only) | 3-5 (adjacent + multi-chunk) | Nach Stufe 1 |
| Suche: Kontext-Tiefe | 0 Hops (isoliert) | 2 Hops (Graph Expansion) | Nach Stufe 2 |
| Implizite Verbindungen | 0 | Aktive Vorschlaege bei >0.7 Similarity ohne Link | Nach Stufe 3 |
| Retrieval-Precision (subjektiv) | Niedrig | +33-47% durch Reranking | Nach Stufe 4 |
| Mobile-Kompatibilitaet | Nein (Node.js fs) | Ja (vault.adapter) | Nach Migration |

---

## 7. Scope Definition

### 7.1 In Scope

**Stufe 1 -- SQLite Migration (P0, loest den Bug):**
- vectra durch sql.js (WASM SQLite) ersetzen
- Vektoren als Float32Array BLOBs speichern
- Inkrementelle Updates (INSERT/DELETE statt Full-Rewrite)
- Persistenz ueber vault.adapter (Desktop + Mobile)
- Adjacent-Chunk-Retrieval (chunk-1, chunk, chunk+1)
- Multi-Chunk pro Datei (Top-N statt Top-1)
- Sessions, Episodes, Recipes in dieselbe DB konsolidieren
- learnings.md entfernen, LongTermExtractor umrouten

**Stufe 2 -- Graph Expansion (P0):**
- Wikilinks aus Vault extrahieren und in DB speichern (wikilinks-Tabelle)
- Tags und MOC-Properties (Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen) extrahieren
- Bei jedem Suchtreffer: 1-2 Hops ueber Wikilinks/MOC folgen
- Ergebnisse mit Verbindungskontext anreichern ("gefunden via [[Kuenstliche Intelligenz]]")

**Stufe 3 -- Implicit Connections (P1):**
- Vorberechnung semantischer Naehe zwischen Notes (Batch-Job)
- implicit_edges Tabelle: Note-Paare mit hoher Similarity aber ohne direkten Link
- Aktive Vorschlaege: "Note A und B koennten zusammenhaengen" (UI-Integration)
- Frontmatter-basierte Gruppierung: Notes die gleiche Themen/Konzepte teilen

**Stufe 4 -- Reranking (P1):**
- BGE-Reranker-v2-m3 via ONNX Runtime (lokal, Desktop)
- Fallback auf Cosine-Only auf Mobile (kein ONNX)
- Reranking der Top-20 Kandidaten nach Stufe 1-3 auf Top-5

### 7.2 Out of Scope

- **Full GraphRAG (Microsoft):** Zu teuer fuer Indexierung (100-1000x). Obsidian hat bereits einen expliziten Graph.
- **PageIndex / Vectorless RAG:** Fuer kurze Notes ungeeignet, designed fuer lange hierarchische Dokumente
- **ColBERT / Late Interaction:** Multi-Vektor-Ansatz wuerde Storage vervielfachen, uebersteigt aktuellen Bedarf
- **Embedding-Modell-Wechsel:** Bleibt konfigurierbar, kein Zwang zu bestimmtem Modell
- **Cloud-basierte Vektor-DB:** Alles bleibt lokal
- **Natural Language Graph Queries:** Keine natuerlichsprachlichen Graph-Abfragen (z.B. "Wer kennt wen ueber welches Thema")
- **Automatisches Link-Erstellen:** Obsilo schlaegt vor, aber erstellt keine Links automatisch

### 7.3 Assumptions

- sql.js WASM laeuft stabil in Electron (Obsidian Desktop) und Mobile WebViews
- 826 Dateien mit ~6.000 Chunks und 4096-dim Vektoren passen in ~100MB SQLite DB
- Brute-Force Cosine-Similarity ueber 6.000 Vektoren ist <15ms (kein ANN-Index noetig)
- BGE-Reranker ONNX-Modell (~500MB) ist akzeptabel als Download fuer Desktop-User
- Frontmatter-Properties Themen/Konzepte/Personen/Notizen/Meeting-Notes/Quellen sind konsistent gepflegt

### 7.4 Constraints

- **Obsidian Plugin Review-Bot:** Kein `require()`, kein `fetch()`, kein `innerHTML` etc. -- sql.js muss als ES-Import oder WASM-Load funktionieren
- **Mobile:** Kein ONNX Runtime verfuegbar -> Reranking nur auf Desktop
- **Bundle-Groesse:** sql.js WASM (~1.5MB) erhoecht das Plugin-Bundle. ONNX-Modell (~500MB) muss separat heruntergeladen werden.
- **Vault-Performance:** Graph-Extraktion und Implicit-Connections-Berechnung duerfen Obsidian nicht blockieren (async, batch, yield)
- **Lokalisierung:** MOC-Properties sind auf Deutsch (Themen, Konzepte, Personen etc.) im User-Vault, muessen konfigurierbar sein fuer englische Vaults

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| sql.js WASM laeuft nicht auf Obsidian Mobile | L | H | Fruehe PoC-Validierung auf iOS/Android. Fallback: Desktop-only fuer Index, Mobile liest read-only. |
| BGE-Reranker ONNX ist zu gross/langsam | M | M | Kleineres Modell evaluieren (TinyBERT ~60MB). Reranking ist optional (Stufe 4). |
| Plugin Review-Bot lehnt sql.js ab | L | H | sql.js ist reines WASM, kein Native Addon. Bestehende Obsidian-Plugins nutzen sql.js bereits. |
| Graph-Extraktion bei grossem Vault blockiert UI | M | M | Async mit requestAnimationFrame/setTimeout Yields. Batch-Verarbeitung. |
| Implicit Connections erzeugen zu viel Noise | M | M | Similarity-Threshold konfigurierbar (default 0.7). User kann Feature deaktivieren. |
| Frontmatter-Properties nicht konsistent gepflegt | M | L | Graceful Degradation: fehlende Properties werden ignoriert, Graph hat weniger Kanten. |
| Migration von vectra bricht bestehende Checkpoints | L | L | Einmalige Migration: altes Checkpoint-Format erkennen, einmal neu indexieren, dann SQLite. |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

1. SQLite-basierte Vektor-DB mit inkrementellen Updates (kein Full-Rewrite)
2. 4-Stufen Retrieval-Pipeline (Vector -> Graph -> Implicit -> Rerank)
3. Graph-Daten (Wikilinks, Tags, MOC-Properties) in der Knowledge DB
4. Implicit Connections: vorberechnet + aktive Vorschlaege an den User
5. Adjacent-Chunk-Retrieval (Kontext an Chunk-Grenzen bewahren)
6. Multi-Chunk pro Datei (nicht nur best match)
7. Konsolidierung von Sessions, Episodes, Recipes in einer DB
8. learnings.md entfernen, LongTermExtractor umrouten
9. Lokaler Reranker auf Desktop (ONNX), Cosine-Fallback auf Mobile
10. MOC-Property-Namen konfigurierbar (DE/EN)

### 9.2 Non-Functional Requirements (Summary)

- **Performance:** Inkrementelles Index-Update <5s. Suche <100ms. Reranking <200ms.
- **Skalierbarkeit:** Bis 10.000 Dateien / 100.000 Chunks ohne Performance-Einbruch
- **Storage:** Index-DB <150MB fuer aktuellen Vault (vs. 507MB vectra)
- **Mobile:** Alle Stufen ausser Reranking muessen auf Mobile funktionieren
- **Robustheit:** Kein Datenverlust bei Plugin-Crash waehrend Index-Update (SQLite Transactions)

### 9.3 Key Features (fuer RE)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | SQLite Vector Storage | vectra durch sql.js ersetzen, BLOBs, vault.adapter |
| P0 | Incremental Index Updates | INSERT/DELETE einzelner Chunks, kein Full-Rewrite |
| P0 | Graph Data Extraction | Wikilinks, Tags, MOC-Properties in DB |
| P0 | Graph Expansion Retrieval | Bei Treffern Wikilinks/MOC 1-2 Hops folgen |
| P0 | Adjacent Chunk Retrieval | chunk-1 und chunk+1 bei jedem Treffer mitliefern |
| P1 | Implicit Connections | Vorberechnung semantischer Naehe, aktive Vorschlaege |
| P1 | Local Reranking (Desktop) | BGE-Reranker via ONNX, Cosine-Fallback auf Mobile |
| P1 | Unified Knowledge DB | Sessions, Episodes, Recipes konsolidieren |
| P1 | learnings.md Elimination | LongTermExtractor an richtige Ziele routen |
| P2 | MOC-Property Configuration | Konfigurierbare Property-Namen (DE/EN) |
| P2 | Implicit Connection UI | Notification/Dashboard fuer Verbindungsvorschlaege |

---

## 10. Next Steps

- [ ] Review durch Stakeholder (Sebastian)
- [ ] Uebergabe an Requirements Engineer: `/requirements-engineering`
- [ ] Input: Dieses Dokument + `_devprocess/planning/ROADMAP-phases-2-3-4.md` (Phase 2.5)

---

## Appendix

### A. Glossar

- **vectra:** Aktuelle Vektor-DB Bibliothek (LocalIndex), speichert alles in einer JSON-Datei
- **sql.js:** SQLite kompiliert zu WASM, laeuft in Browser/Electron ohne Native Addon
- **vault.adapter:** Obsidians plattformuebergreifende Storage-Abstraktion (Desktop + Mobile)
- **MOC (Map of Content):** Markdown-Dateien die als Hub fuer ein Thema dienen, verlinkt ueber Frontmatter
- **Implicit Connection:** Semantische Naehe zwischen Notes ohne expliziten Wikilink
- **Reranking:** Zweite Bewertungsstufe die Query+Chunk gemeinsam betrachtet (Cross-Encoder)
- **BGE-Reranker:** BAAI's Open-Weight Reranking-Modell (278M Params)
- **ONNX:** Open Neural Network Exchange -- Format fuer portable ML-Modelle
- **Adjacent Chunks:** Die Chunks direkt vor und nach einem Treffer-Chunk

### B. Interview Notes

Erkenntnisse aus dem Feature-Review und der strategischen Diskussion (2026-03-29):
- vectra-Bug identifiziert durch Console-Log-Analyse: `RangeError: Invalid string length` in `LocalIndex.endUpdate()`
- Index-Datei: 507MB, 5.980 Vektoren, 4096 Dimensionen (Qwen3-Embedding-8b)
- Nur 477/826 Dateien indexiert (Build bricht bei ~60% ab)
- User hat reichhaltiges Frontmatter-System: Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen -- alle als MOC-Backlinks
- Ziel: Vernetztes Denken, implizite Verbindungen, Graph-aehnliche Semantik ohne die Kosten von Full GraphRAG
- Reranking lokal bevorzugt (Showcase-Wert + Datenschutz)
- PageIndex/Vectorless RAG evaluiert und fuer Obsidian-Vaults als ungeeignet befunden (designed fuer lange Dokumente)
- Hybrid-Ansatz liefert ~80% des GraphRAG-Nutzens zu <5% der Kosten

### C. References

- `_devprocess/planning/ROADMAP-phases-2-3-4.md` -- Phase 2.5 Abschnitt mit technischen Details
- `src/core/semantic/SemanticIndexService.ts` -- Aktueller vectra-basierter Service (1.088 LOC)
- Microsoft GraphRAG: https://microsoft.github.io/graphrag/
- sql.js: https://sql.js.org/
- BGE-Reranker: https://huggingface.co/BAAI/bge-reranker-v2-m3
- PageIndex: https://github.com/VectifyAI/PageIndex (evaluiert, nicht gewaehlt)
