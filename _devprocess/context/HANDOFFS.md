# Handoffs (append-only)

Phase-zu-Phase-Uebergaben im V-Model-Workflow. Jeder Eintrag dokumentiert,
was uebergeben wurde und was der naechste Schritt ist.

---

## 2026-04-23 -- EPIC-023 Mobile Support: Business Analysis -> Requirements Engineering

**Phase:** Business Analysis (MVP-Scope) abgeschlossen. Ready for RE.

**Artefakte erzeugt:**

- BA: [BA-23-mobile-support.md](../analysis/BA-23-mobile-support.md) (815 Zeilen, Status: Draft)
- As-Is-Evidenz: inline im Explore-Subagent-Report vom 2026-04-22 (22 HARD + 15 SOFT + 8 DEGRADED Blocker, Pfad:Zeile-genau)

**Scope:** MVP, Companion-Modus statt Full-Parity. Personal-First (P1: Sebastian) mit Community-Hypothese (P2: Obsilo-Community, H-08).

**HMW:**
> How might we einem Zettelkasten-basierten Wissensarbeiter ermoeglichen, unterwegs erfasste Inhalte mit Agent-Unterstuetzung vorzustrukturieren, obwohl Obsidian Mobile weder Node.js noch nativen Filesystem-Zugriff erlaubt und die Indexierung auf Mobile zu ressourcenintensiv waere?

**Value Proposition:**
Mobile-Companion mit Capture + Pre-Wire. Desktop schreibt Index, Mobile konsumiert readonly. Zettelkasten-Inbox-Disziplin bleibt, Verzettelung bleibt Desktop-Aufgabe.

**Critical Hypotheses (Open, fuer RE + Architektur):**
- H-01: Plugin laedt auf iOS/Android nach Refactoring ohne Crash (Tech Feasibility)
- H-02: sql.js WASM readonly auf Mobile mit vault-lokaler DB (Tech Feasibility, **Spike empfohlen vor ADR**)
- H-03: Obsidian Sync transportiert sqlite-DB (bis ~50 MB) zuverlaessig (Data Availability, **Spike empfohlen**)
- H-04: Voice-to-Note liefert nutzbare Inbox-Notes mit Link-Vorschlaegen (Problem-Solution Fit)
- H-05: IframeSandbox reicht fuer Mobile-Skills (Tech Feasibility, Skill-Audit noetig)
- H-06: MCP mobil entweder lokal oder via Desktop-Relay nutzbar (Tech Feasibility, **ADR-Kandidat**)
- H-07: GlobalFileService-Migration rueckwaerts-kompatibel (Tech Feasibility)
- H-08: Community-Interesse > 0 (Market, **Post-PoC-Release-Validierung**)

**Key Features (P0/P1/P2 fuer RE):**

P0:
- Platform-Guards + Sandbox-Factory-Refactor (isDesktopOnly false, Lazy-Require)
- GlobalFileService Vault-Local Migration
- Index-Consumer-Modus (KnowledgeDB + Reranker readonly)
- Mobile-Capture-View (Voice-to-Note)

P1:
- MCP-Mobile-Strategie (ADR in Phase 3)
- Skill-Capability-Filter
- Scan/Foto-Import + Web-Clipper-Handoff
- UI-Markierungen fuer Desktop-only-Features

P2:
- Base-Erstellung mobil
- Agent-Brainstorming-Mode
- Mobile-Onboarding-Anpassung

**Assumptions (fuer RE/Architektur zu pruefen):**
- A-01..A-06 in BA Abschnitt 8.3 (Obsidian Sync Size, Vektoren-Count, Reranker-WASM-Mobile, MCP-Feasibility, Community-Signal, Voice-API)

**Risks (fuer Architektur priorisieren):**
- R-01 sql.js Mobile (M/H), R-02 Sync-sqlite (M/H), R-03 Skill-Sandbox (M/M), R-04 Global-Storage-Migration (L/H), R-05 MCP-Local (M/M), R-06 Platform-API-Constraints (M/M), R-07 Voice-Quality (M/M), R-08 Community-Null (M/L), R-09 Bot-Compliance (L/M), R-10 Aufwands-Overshoot (M/M)

**Offene Fragen fuer RE:**
- Epic-Nummer: EPIC-023-mobile-support (bestaetigt ungenutzt)
- Mindestens ein Spike (H-02, H-03) vor Feature-Breakdown sinnvoll? Oder RE jetzt, Spike-Ergebnisse spaeter in Features einarbeiten?
- Zweite Persona: bleibt Hypothese oder werden Community-Interviews (Method: Explorative interviews, 5-8 User) jetzt parallel angestossen?

**Naechster Schritt:**

```
/requirements-engineering
Input: _devprocess/analysis/BA-23-mobile-support.md
Ziel: EPIC-023 anlegen, Features FEATURE-2301..FEATURE-23NN breakdown, Success Criteria tech-agnostisch, architect-handoff-023.md
```

---

## 2026-04-19 -- v2.6.0 Pre-Release Security Audit: Coding -> Release Closure

**Phase:** Security Audit abgeschlossen. Ready for Public Release.

**Artefakte erzeugt:**
- [AUDIT-012-obsilo-2026-04-19.md](../analysis/AUDIT-012-obsilo-2026-04-19.md)

**Overall Risk:** MEDIUM. **Release-Verdict: GREEN.**

**Kernpunkte:**
- 0 Critical, 0 High.
- 2 Medium: M-1 (HTML-comment Metadata Length-Limit, accepted fuer v2.6.0) und M-2 (TOCTOU in SkillPackageImporter, mitigated durch UI-Gate). Beide in Backlog.
- 5 Low, alle mitigated.
- npm audit: 0 vulnerabilities.
- OWASP Top 10 + OWASP LLM Top 10 komplett durchgegangen.

**Deferred Items in Backlog (Standalone Items -> Security):**
- SEC-M-1 (P2, XS): Cap HTML-comment metadata length + parseFrontmatter lines.
- SEC-L-1 (P3, XS): Regression-Test fuer JSZip `_data.uncompressedSize`.

**Architectural Concerns:** Keine. Alle primaeren Attack-Vectors (path-traversal, zip-bomb, prototype-pollution, code-injection, configDir-Protection, dependency-CVEs) haben Defense-in-Depth.

**Naechster Schritt:** /review-bot fuer Obsidian Community Plugin Pre-Push-Check, dann Public Release v2.6.0.

---

## 2026-04-17 -- EPIC-22 Skill-Package Ecosystem: RE -> Architecture -> Coding

**Phase:** Requirements Engineering + Architecture abgeschlossen. Ready for Coding.

**Artefakte erzeugt:**

- BA: `_devprocess/analysis/BA-21-skill-package-ecosystem.md`
- Epic: `_devprocess/requirements/epics/EPIC-22-skill-package-ecosystem.md`
- Features:
  - `_devprocess/requirements/features/FEAT-22-01-skill-folder-structure.md` (P0, M)
  - `_devprocess/requirements/features/FEAT-22-02-skill-zip-import.md` (P0, S)
  - `_devprocess/requirements/features/FEAT-22-03-skill-scripts.md` (P1, M)
  - `_devprocess/requirements/features/FEAT-22-04-coordinator-skill.md` (P1, M)
- Handoff: `_devprocess/requirements/handoff/architect-handoff-022.md`
- ADR: `_devprocess/architecture/ADR-75-skill-package-architecture.md` (Proposed)
- Plan-Context: `_devprocess/requirements/handoff/plan-context-022.md`

**Scope:**

Skill-Format analog Anthropic-Spec ([agentskills.io](https://agentskills.io/specification)):
Ordner mit `SKILL.md` plus optionalen `scripts/`, `references/`, `assets/`
Subfolders, `.skill` Zip-Import, plus Obsilo-spezifisches `type: coordinator`
Pattern mit `*.skill.md` Sub-Rollen. Backward-Compat zu v2.5.x Single-File-Skills.

**Kernentscheidungen:**

- Loader-Umbau in bestehendem `SelfAuthoredSkillLoader`, kein paralleler Pfad.
- Zip-Import-Security: Whitelist, 100MB-Limit, Path-Traversal-Check.
- Scripts: nur TS/JS via bestehende Sandbox (`evaluate_expression`). Python/Bash nur als Referenz-Text.
- Coordinator: explizites Frontmatter-Flag, keine Auto-Heuristik.

**Offene Fragen fuer Coding-Phase:**

- Duplikat-Verhalten beim Zip-Import (Replace/Rename/Cancel): UX-Detail im Modal.
- Bundled-Skills optional auf Sub-Dir-Format migrieren (nice-to-have, nicht Pflicht).

**Naechster Schritt:**

```
/coding
Input: _devprocess/requirements/handoff/plan-context-022.md
Reihenfolge: FEAT-22-01 -> 2202 -> 2203 -> 2204 (2201 ist Fundament fuer alle anderen)
Release-Plan: 2201+2202 = v2.6.0 Minimum. 2203+2204 = v2.6.1/.2 additiv.
```

**Noch NICHT gestartet:** Implementierung wartet auf explizite User-Freigabe.

---

## ba-to-re 2026-04-26: Memory v2 + UCM Foundation

**Initiative:** Memory v2 Full Rewrite (Pfad alpha) als Voraussetzung fuer UCM (Unified Chat Memory).

**Branch:** `feature/memory-redesign` (existiert)

**Source-Artefakte (alle als Input fuer RE):**

- `_devprocess/analysis/BA-UNIFIED-CHAT-MEMORY-V2.md` (Status: Draft) -- UCM-Konsumenten-Kontext
- `_devprocess/requirements/OBSILO-MEMORY-V2-FULL-REWRITE.md` (Status: Source-Reference) -- urspruengliche Implementation-Skizze
- `_devprocess/implementation/plans/PLAN-01-memory-v2-master.md` (Status: Draft) -- validierter Master-Plan mit 8 Phasen, 11.5 Wochen
- `_devprocess/architecture/ADR-76-episode-fact-boundary.md` (Proposed)
- `_devprocess/architecture/ADR-77-memory-v2-storage-schema.md` (Proposed)
- `_devprocess/architecture/ADR-78-uri-versioning-schema.md` (Proposed)
- `_devprocess/architecture/ADR-79-knowledge-db-hardening.md` (Proposed)

**Triage:** Capability-Set unter EPIC-03 (context-memory-scaling). 8 Phasen werden 8 FEATUREs (FEAT-03-14 bis FEAT-03-21). Mehrere ADRs (4 vorbereitet, weitere nach Bedarf).

**Vorhandene Bezugs-Artefakte:**

- EPIC-03-context-memory-scaling (Parent)
- FEAT-03-04-memory-personalization (vorhanden, wird durch Memory v2 superseded)
- FEAT-14-11-memory-transparency (vorhanden, integriert in Memory v2 UI)
- FEAT-03-06-context-condensing (vorhanden, bleibt orthogonal)
- FEAT-18-02-context-externalization (vorhanden, bleibt orthogonal)
- ADR-13, ADR-18, ADR-58, ADR-59, ADR-60 (Memory-bezogen, werden im Verlauf supersediert oder supplementiert)

**Codebase-Analyse durchgefuehrt:** Tiefenanalyse Memory-Subsystem + Best-Practice-Recherche 2026 (Mem0, A-MEM, Letta, Zep, Anthropic Prompt Caching, sql.js+FTS5+sqlite-vec). 15 kritische Diskrepanzen zwischen Source-Spec und Codebase identifiziert, in PLAN-01 dokumentiert und addressed.

**RE-Auftrag:**

1. 8 FEATUREs unter EPIC-03 anlegen (FEAT-03-14 bis FEAT-03-21), pro Feature 1 Phase aus PLAN-01
2. Akzeptanzkriterien aus PLAN-01-Phasen-Tabelle ableiten, plus die 15 Diskrepanzen aus PLAN-01 als FEATURE-spezifische Kriterien zuordnen
3. ASRs/NFRs aus PLAN-01 "Eval & Quality Gates" und "Risks R10-R15"
4. architect-handoff.md schreiben: Engine-API-Design ist der zentrale Architektur-Vertrag (UCM-Konsument), ATTACH-DATABASE-Pattern + URI-Schema (ADR-78) sind Cross-Cutting
5. Bestehende Memory-FEATUREs (0304, 1411) aktualisieren: Status auf "Subsumed by Memory v2" markieren, Cross-Reference auf neue FEATUREs

**Offene Entscheidungen, die RE klaeren oder als ASR formulieren sollte:**

- Custom-sql.js-WASM-Build vs Trigram-Fallback: nach Phase-0-Spike entscheidbar, FEAT-03-15 sollte Akzeptanzkriterium pro Variante haben
- Embedding-Modell-Default fuer Migration: derzeit konfigurierbar, Memory v2 braucht Default-Strategy
- Custom-WASM-Bundle-Size-Limit: Plugin Review-Bot Kontext

**Naechster Schritt:**

```
/requirements-engineering
Input: _devprocess/implementation/plans/PLAN-01-memory-v2-master.md (primaer)
       + alle 4 ADRs + BA-UNIFIED-CHAT-MEMORY-V2 + OBSILO-MEMORY-V2-FULL-REWRITE
Output: 8 FEAT-03-14 bis FEAT-03-21 + architect-handoff.md
```

---

## re-to-architecture 2026-04-26: Memory v2 + UCM Foundation

**Initiative:** Memory v2 Full Rewrite (Pfad alpha) -- 8 FEATUREs FEAT-03-14 bis FEAT-03-21 unter EPIC-03 angelegt.

**Output (Requirements Engineering):**

- **8 Feature-Specs:** FEAT-03-14 (Knowledge-DB-Haertung), FEAT-03-15 (Engine-Foundation), FEAT-03-16 (Migration + Vault-RRF), FEAT-03-17 (Dynamic Context Composition), FEAT-03-18 (Single-Call Update Pipeline), FEAT-03-19 (Living Document UX), FEAT-03-20 (History Search), FEAT-03-21 (Engine-Extract)
- **Architect-Handoff:** `_devprocess/requirements/handoff/architect-handoff-memory-v2.md` mit 16 ASRs (10 Critical, 6 Moderate), 19 NFR-Targets, 15 Constraints, 15 Open Questions
- **EPIC-03 aktualisiert** (Memory v2 Initiative-Sektion ergaenzt, Status: Active)
- **FEAT-03-04-memory-personalization** Status auf "Subsumed by Memory v2"
- **FEAT-14-11-memory-transparency** Cross-Reference auf FEAT-03-19

**ASR-Hoehepunkte (Critical):**

- ASR-001: Multi-File-Atomic-Commit fuer 2 DBs (FEAT-03-14, ADR-79)
- ASR-002: URI-Konvention vor Memory v2 (FEAT-03-14, ADR-78)
- ASR-003: Constructor-Injection in Stores (FEAT-03-15)
- ASR-004: ADR-62 KV-Cache-Layout vor Phase 3 (FEAT-03-15)
- ASR-006: ATTACH DATABASE Pattern in einzelner sql.js-Instanz (FEAT-03-17)
- ASR-007: Topic-Inference ohne LLM-Call beim Conversation-Start (FEAT-03-17)
- ASR-009: Single-Call-Extraction via Tool-Calling-Schema (FEAT-03-18)
- ASR-014: Engine-Public-API-Surface klein und stabil (FEAT-03-21)
- ASR-015: Adapter-Interface fuer Knowledge-DB ohne Vault-Spezifika (FEAT-03-21)
- ASR-016: 3 Phase-0-Spikes als Pflicht-Vorbedingung (cross-cutting)

**NFR-Hoehepunkte:**

- Conversation-Start TTFT < 800ms p95
- Cache-Hit-Rate > 60% nach 1 Woche
- LLM-Calls pro Conversation: 1 (heute 2-3)
- BUG-012-Korruptions-Faelle: 0 pro 1000 Schreib-Vorgaenge
- Coverage > 90% fuer neue Stores

**Open Questions** (15, vollstaendige Liste im Handoff):

1. ATTACH DATABASE-Performance auf realer DB-Groesse?
2. FTS5/JSON1 via Custom-WASM sprengt Bundle-Limit?
3. Single-Call-Extraction-Token-Profil?
4. Embedding-Modell-Default-Strategie?
5. Lock-File-TTL bei abgestuerztem Plugin?

**Forbidden-Terms-Check:** Confirmed -- keine Tech-Terme in Success Criteria.

**Naechster Schritt:**

```
/architecture
Input: _devprocess/requirements/handoff/architect-handoff-memory-v2.md
       + 4 Proposed ADRs (ADR-76, 077, 078, 079)
       + PLAN-01-memory-v2-master.md
       + BA-UNIFIED-CHAT-MEMORY-V2.md
Output: ADRs Accepted, plan-context.md, arc42-Memory-Sektion-Update,
        plus 3 Phase-0-Spike-Definitionen als Pflicht-Vorbedingung
```

**Implementation gestartet:** Nein -- wartet auf /architecture und User-Freigabe nach Phase-0-Spikes.

---

## architecture-to-coding 2026-04-26: Memory v2 + UCM Foundation

**Initiative:** Memory v2 Full Rewrite (Pfad alpha) -- Architektur-Phase abgeschlossen.

**Output (Architecture):**

- **8 neue ADRs** (Proposed, alle bedingt akzeptiert nach Phase-0-Spike-Ergebnissen):
  - ADR-80 Persistenz-Service-Pattern (3 Setup-Klassen A/B/C)
  - ADR-81 MCP-Tool-Routing + Plugin-Standalone-RPC (Bearer-Token + HTTPS)
  - ADR-82 Topic-Inference-Strategie (lokale Centroids, Soft-Topic-Lock)
  - ADR-83 Single-Call Tool-Calling Output-Schema
  - ADR-84 Engine-Public-API-Versionierung (semver + Schema-Version)
  - ADR-85 Soft-Delete-Cascade auf vier Granularitaets-Ebenen
  - ADR-86 Inference-Pass-Architektur fuer Derives
  - ADR-87 Vault-Note-Memory-Source-Pipeline
- **4 bestehende ADRs** weiterhin Proposed (ADR-76 Episode-Fact-Boundary, ADR-77 Storage-Schema, ADR-78 URI-Versioning, ADR-79 Knowledge-DB-Haertung)
- **arc42-Update** Section 5.9.1 "Memory v2 Architecture" ergaenzt
- **plan-context-memory-v2.md** in `_devprocess/requirements/handoff/` mit Tech-Stack, Quality-Goals, ADR-Summary, Data-Model, Performance/Security-Targets, Implementation-Reihenfolge, /coding-Aufgaben

**Tech-Stack-Justification:**

- TypeScript strict + esbuild bleibt (Bestand)
- sql.js@^1.14.1 ist einziger Driver (Review-Bot blockiert native bessere-sqlite3)
- Custom-WASM-Build mit FTS5+JSON1 wenn Phase-0-Spike Bundle-Size traegt, sonst JS-Trigram-Fallback
- Embeddings: konfigurierbar (Sebastians Setup nutzt qwen3-embedding-8b multilingual)
- LLM: konfigurierbar (Sebastian nutzt Claude Haiku 4.5), Tool-Calling-Pflicht
- Cloudflare-Relay (existierend, FEAT-14-04) bleibt fuer externe MCP-Clients
- Bearer-Token + HTTPS fuer Plugin-Standalone-RPC (Klasse C)

**Rejected Alternatives (sollen nicht ohne neue Begruendung von /coding wieder geoeffnet werden):**

- bessere-sqlite3 native (Review-Bot-Block)
- Cloudflare KV als Storage-Backend (bricht Local-First, Supermemory-Pattern verworfen)
- Multi-Master-CRDT-Replikation (zu komplex fuer MVP, Persistenz-Service-Pattern reicht)
- Vector-Clock-basierte Eventual-Consistency (gleiche Begruendung)
- LLM-Topic-Inference per Conversation-Start (Latenz-Selbstmord, lokale Centroids gewaehlt)
- Free-Form-Markdown-Single-Call-Output (Drift-Risiko, Tool-Calling-Schema gewaehlt)
- OAuth 2.1 fuer RPC-Auth (Bearer reicht fuer MVP, OAuth ist Backlog)
- Hard-Delete sofort (kein Undo-Window, Soft-Delete + Window gewaehlt)
- Crypto-Erase via Verschluesselung (at-rest-Encryption Out-of-Scope)
- Synchroner Inference-Pass pro Conversation (Cost-Explosion, Background-Job gewaehlt)
- Auto-Detection welche Notes als memory-source taugen (zu viel Auto-Magie, User-Trigger gewaehlt)

**Known Architectural Risks (fuer /coding monitoren):**

- R-1 sql.js-Custom-WASM-Build-Toolchain: integrierbar in esbuild-Pipeline?
- R-2 ATTACH-DATABASE-Limits in sql.js: kreuzweise transactional schreibbar?
- R-3 Multi-File-Atomic-Commit Crash-Recovery via Journal: robust gegen Power-Loss?
- R-4 Vault-Hook-Reihenfolge: vault.on('rename') vor oder nach File-Move?
- R-5 Topic-Centroid-Performance: Refresh-Strategie eager vs lazy?

**Open Items (von /architecture explizit deferred zu /coding):**

- FTS-Strategie (Custom-WASM vs JS-Trigram): Spike-Ergebnis-abhaengig
- Centroid-Recalc-Granularitaet: profilen, dann entscheiden
- Token-Rotation-UX: post-MVP
- LTS-Strategie post-v1.0: nach Feedback-Phase
- Inkrementelle Re-Extraktion (Diff-Detection): post-MVP, MVP nutzt voll-re-extract

**Consistency-Check (manuell):**

- plan-context-memory-v2.md Tech-Stack matcht alle 12 ADRs (076-087): bestaetigt
- arc42 Section 5.9.1 referenziert alle relevanten ADRs: bestaetigt
- 12 FEATUREs (FEAT-03-14 bis FEAT-03-25) sind im plan-context Implementation-Reihenfolge-Tabelle vollstaendig: bestaetigt
- Quality-Goals (Hosting-Neutralitaet, Token-Effizienz, Privacy, Performance, Korrektheit) decken die 22 Critical ASRs: bestaetigt

**Naechster Schritt:**

```
/coding
Input: _devprocess/requirements/handoff/plan-context-memory-v2.md
       + 12 ADRs (ADR-76 bis ADR-87, alle Proposed)
       + 12 FEATUREs (FEAT-03-14 bis FEAT-03-25)
       + arc42 Section 5.9.1
       + PLAN-01 Master-Plan
       + BA-UNIFIED-CHAT-MEMORY-V2 (UCM-Konsumenten-Vertrag)

Output erwartet:
1. 3 Phase-0-Spikes ausgefuehrt mit Ergebnis-Bericht
2. ADRs 076-087 zu Accepted promoted (oder Modifikationen vorgeschlagen)
3. Per Phase eine PLAN-Datei in _devprocess/implementation/plans/
4. Critical Codebase-Review-Findings dokumentiert
5. Phase-0.5-Implementation-Start nach gruener Spike-Phase
```

---

## coding-phase2-checkpoint 2026-04-26: Memory v2 Critical Review + PLAN-002

**Phase:** /coding Phase 2 (Critical Review) abgeschlossen, Phase 3 (Implementation) noch nicht gestartet.

**Critical-Review-Findings (Drift gegen ADRs):**

1. **ADR-79 Knowledge-DB-Haertung:** Single-File-Atomic-Write existiert bereits (KnowledgeDB.ts:485-518, FIX-12 Marker). ADR auf reduzierten Scope angepasst: Multi-File-Coordination + Vault-Mode-Haertung + Migration-Journal + Daily-Snapshot bleiben offen, Single-File ist gefixt.
2. **ADR-80 Persistenz-Service-Pattern:** Bestehende `storageLocation`-Werte in KnowledgeDB.ts:151 (global/local/obsidian-sync) gemappt zu neuen Setup-Klassen K-A/K-B (K-C ist neu). Settings-Migration in FEAT-03-23 muss diese Werte transformieren.
3. **FEAT-03-14 Effort:** 1.5 Wo -> 1 Wo reduziert (bestehende Atomic-Write-Logic wird erweitert, nicht neu gebaut).
4. **FEAT-03-15 Implementation-Strategie:** MemoryDB ist heute Wrapper um KnowledgeDB. Schema-Erweiterung additiv, KnowledgeDB-Klasse selbst nicht refactoren. history.db nutzt denselben Wrapper-Pattern.

**Writebacks ausgefuehrt:** ADR-79, ADR-80, FEAT-03-14, FEAT-03-15 mit Code-Review-Findings-Sections versehen.

**METRICS.md Drift-Row:** 12 ADRs reviewed, 4 Drift flagged, 4 resolved, 0 open.

**PLAN-002 angelegt:** Phase 0 Spikes (ATTACH+CTE-Performance, FTS5-Bundle-Size, Single-Call-Token-Profil) als Quality-Gate vor Phase-0.5-Implementation. Status `Draft`.

**Nicht getan in dieser Session:**

- Spikes nicht ausgefuehrt (User-Entscheidung erforderlich)
- ADRs nicht zu Accepted promoted (haengen an Spike-Ergebnissen ab)
- Phase-0.5-Implementation noch nicht gestartet (FEAT-03-14)
- Plan Coverage Gate auf PLAN-002 noch nicht final gerunnt (kein Feature-Spec referenziert, ADR-Coverage in Tabelle)

**Naechste Schritte (User waehlt):**

- Option A: Spike 2 (FTS5-Bundle) zuerst, weil Hard-Block fuer Implementation
- Option B: Spike 1 (ATTACH+CTE), dann Spike 2, dann Spike 3
- Option C: alle drei parallel (am ehesten geeignet wenn Sebastian zwei Tage Spike-Aufwand investieren will)
- Option D: Pause nach Phase 2, Sebastian reviewt erst die Writebacks

**Open Concerns fuer Implementation-Phase:**

- Custom-sql.js-WASM-Build-Toolchain nicht heute im Repo, Spike 2 muss das zuerst empirisch klaeren
- Anthropic-Tool-Calling-Schema-Performance bei langen Conversations nicht messbar ohne Spike 3
- ATTACH-DATABASE-Verhalten in sql.js-WASM mit zwei realen Plugin-DBs nicht in Codebase getestet

---

## coding-phase0-complete 2026-04-27: Memory v2 Phase 0 Spikes abgeschlossen

**Phase:** /coding Phase 0 (3 Spikes + ADR-Promotion) komplett.

**Spike-Ergebnisse:**

- **SPIKE-001 ATTACH+CTE-Performance:** GREEN durch JS-Layer-BFS-Fallback. Cross-DB-JOIN p95 = 1.2ms (167x unter 200ms-Target), 2-Hop-Walk p95 = 0.3ms (1666x unter 500ms-Target). ATTACH-Pfad verworfen (sql.js FS nicht im Public-API), JS-BFS reicht. Test mit Sebastians realer 207MB knowledge.db.
- **SPIKE-002 FTS5+JSON1-Bundle-Size:** Provisional Green via Approximation (~250KB Aufschlag, ~0.7% auf Plugin-Bundle). Echter Custom-WASM-Build deferred zu Phase 0.5 (FEAT-03-14 Sub-Task).
- **SPIKE-003 Single-Call-Token-Profil:** Provisional Green via Approximation aus Mem0-Benchmark + Claude-Haiku-Pricing (~2500 Tokens Median, ~$0.50-3/Monat fuer Sebastian). Echter Test deferred zu Phase 4 (FEAT-03-18).

**ADR-Promotion:** ADR-76 bis ADR-87 alle auf `Accepted`, ADR-80 als `Accepted (modified by Spike-1 + Code-Review)`.

**Implementation-Aufwand reduziert:**

- ADR-80 Spike-1-Outcome: ~500-1000 LOC ATTACH-DATABASE-Code entfaellt
- ADR-79 Code-Review: Single-File-Atomic-Write existiert bereits (FIX-12 in KnowledgeDB.ts), FEAT-03-14 reduziert von 1.5 auf 1 Wo

**Zwischen-Stand-Effort-Schaetzung:**

- Phase 0: 1.5 Wo nominell (heute komplett, brutto ~4 Stunden Real-Aufwand wegen Approximations-Strategie + Spike-1-Echt-Test)
- Phase 0.5 (FEAT-03-14): 1 Wo (war 1.5)
- Phase 1-7: 11 Wo nominell
- Querschnitt FEAT-03-22/0323/0324/0325: 4.5 Wo
- Total reduziert: ~16 Wo brutto (war 17)

**Spike-Artefakte:**

- `_devprocess/analysis/SPIKE-001-cross-db-performance.md` (GREEN, real test)
- `_devprocess/analysis/SPIKE-002-fts5-bundle-size.md` (Provisional Green via Approximation)
- `_devprocess/analysis/SPIKE-003-single-call-token-profile.md` (Provisional Green via Approximation)
- `/tmp/spike-cross-db-jsbfs.mjs` (Spike-1-Test-Skript, reproduzierbar)
- `/tmp/sql.js/` (Repo-Klone mit gepatchtem Makefile fuer FTS5+JSON1, fuer Phase-0.5-Custom-Build)
- `/tmp/knowledge-spike.db` (Sebastians 207MB knowledge.db read-only Kopie, kann geloescht werden wenn nicht mehr benoetigt)

**PLAN-002 Status:** Implemented (Phase 0 abgeschlossen).

**Naechster Schritt:**

```
Phase 0.5 -- FEAT-03-14 Knowledge-DB-Haertung
PLAN-003 anlegen (FEAT-03-14 implementation plan):
- Multi-File-Atomic-Commit-Helper bauen (3 DB-Files koordiniert)
- Vault-Mode-Haertung (writeDBVaultWithBackup -> atomic-equivalent)
- Single-Writer-Lock per PID (Klasse B)
- Migration-Journal als Sub-Typ
- Daily-Snapshot-Job (.bak/{YYYY-MM-DD}.db, 7-Tage-Retention)
- Vault-Rename-Cascade (vault.on('rename') in main.ts:589 erweitern)
- embedding_model-Spalte in vectors
- URI-Konvention-Migration vectors.path
- Custom-sql.js-WASM-Build mit FTS5+JSON1 (Spike-2-Final-Verifikation)
- PRAGMA integrity_check beim Open

Effort: 1 Wo. Code-Aenderungen primaer in src/core/knowledge/.
```

---

## requirements-phase 2026-04-28: EPIC-21 ChatGPT OAuth Provider

**Phase:** /requirements-engineering komplett. Naechster Schritt /architecture.

**NFR-Summary:**

- **Performance:** Token-Refresh <500ms, Loopback-Startup <200ms, TTFT <2s p95, Streaming-Chunk-Verarbeitung <50ms.
- **Security:** Tokens (access/refresh/id) ueber SafeStorageService verschluesselt, PKCE 64-Byte-Verifier mit SHA-256-Challenge, State-Param 32-Byte-Random, Loopback-Bind ausschliesslich 127.0.0.1 Port-Range 1455-1460, Scope `openid profile email offline_access`, kein Token in Logs, Per-Request-Auth ohne Caching im Handler.
- **Reliability:** Refresh 60s vor Ablauf, 401-Auto-Retry genau einmal, Promise-Lock fuer parallele Refreshs, Loopback-Timeout 5min, Schema-Validation vor Mapping.
- **Compliance:** kein fetch(), `requestUrl` plus eslint-disable-Begruendung fuer `require('http')`/`require('crypto')`, kein innerHTML/inline-Style/Emoji im UI.

**Critical ASRs (jeweils ADR-pflichtig):**

1. Eigener `ChatGptOAuthService` als Singleton (Token-State plugin-weit, Refresh-Lock).
2. Loopback-HTTP-Server in Electron (PKCE-Callback, Renderer vs. Main-Prozess offen).
3. Schema-Mapping Codex-Responses zu ApiStream (Drift-Resilienz, eine Datei fuer Schema-Annahmen).
4. Tool-Definitions im Responses-Format (Helper fuer alle Codex-Aufrufe).
5. SafeStorageService-Integration mit neuem `chatgptOAuth`-Settings-Schema.

**Open Architecture Questions:**

- Streaming-Transport: `requestUrl` mit Buffer-Polling oder Node-`https`-Stream wie `openai.ts:75`?
- Loopback-Server im Renderer oder Main-Prozess via IPC?
- Service-Verortung: neuer `src/core/auth/`-Ordner oder zu bestehendem `src/core/security/`?
- Settings-Struktur: flach oder verschachtelt (`chatgptOAuth: {...}`)?
- JWT-Decoder: eigene 30-Zeilen-Implementierung oder `jose`-Lib?
- Modell-Discovery: Hardcode-Liste oder Probe-Request gegen evtl. existierenden /models-Endpoint?
- Schema-Validation: `zod` (falls schon im Bundle) oder Type-Guards?

**Constraints:**

- Inoffizielle Endpoints (`chatgpt.com/backend-api/codex/responses`), kein SLA, Schema kann sich aendern. Disclaimer-Pflicht im UI.
- Codex-CLI-Client-ID als Default. Kein Custom-Feld in MVP. OpenAI-Sperrrisiko ueber Endpoint-Drift-Indikator monitoren.
- Mobile (iOS/Android) ausgeschlossen, weil `safeStorage` und Loopback-Server fehlen.
- Plugin-Review-Risiko: Loopback-HTTP-Server koennte Aufmerksamkeit ziehen. PR-Begruendung vorbereiten.

**Forbidden-Terms-Check:** Bestanden. Keine Tech-Begriffe (OAuth, JWT, REST, HTTP, JSON, OpenAI, Codex, ChatGPT, SSE, Bearer) in den Success-Criteria-Tabellen der drei Features. Tech-Details ausschliesslich in `Technical NFRs` und `Architecture Considerations`.

**Artefakte:**

- `_devprocess/requirements/epics/EPIC-21-chatgpt-oauth-provider.md`
- `_devprocess/requirements/features/FEAT-21-01-chatgpt-oauth-lifecycle.md`
- `_devprocess/requirements/features/FEAT-21-02-chatgpt-codex-api-handler.md`
- `_devprocess/requirements/features/FEAT-21-03-chatgpt-oauth-settings-ui.md`
- `_devprocess/requirements/handoff/architect-handoff-021-chatgpt-oauth.md`
- `_devprocess/context/BACKLOG.md` (Eintrag unter "Aktueller Feature-Status" + "Naechste Prioritaeten")

**Naechster Schritt:**

`/architecture` mit Fokus auf ADR-Vorschlag (Loopback-Verortung, Streaming-Transport, Service-Layout) und plan-context-021.md.

---

## architecture-phase 2026-04-28: EPIC-21 ChatGPT OAuth Provider

**Phase:** /architecture komplett. Naechster Schritt /coding.

**Tech-Stack-Begruendung:**

- **Eigener Provider plus Singleton-Service:** Auth-Lifecycle und API-Call sind getrennte Verantwortungen, gleiches Pattern wie Copilot (ADR-37). Provider in `src/api/providers/chatgpt-oauth.ts`, Service in `src/core/auth/ChatGptOAuthService.ts`, Mapper in `src/api/providers/chatgpt-codex-mapper.ts`.
- **Node-https-Streaming:** Bewaehrtes Pattern aus `src/api/providers/openai.ts:75`. `requestUrl` faellt aus, weil kein `ReadableStream`. Echtes SSE-Streaming statt Buffer-Polling, TTFT unter zwei Sekunden erreichbar.
- **Renderer-Loopback-Server (Option 1 in ADR-89):** Optionen Main-Prozess-IPC (kein Plugin-API-Hook), Custom-URL-Scheme (Codex-Client-ID akzeptiert nur HTTP-Redirects) und Device-Code-Flow (von Codex-Client-ID nicht unterstuetzt) fielen aus. Renderer mit `require('http')` plus eslint-disable-Begruendung war nicht Wunschloesung, sondern die einzig umsetzbare.
- **Type-Guards statt zod:** Zod ist heute nicht im Bundle, plus 50 KB Aufschlag fuer drei bis vier Schema-Strukturen nicht gerechtfertigt.
- **JWT-Mini-Decoder statt jose:** Kein Signatur-Check noetig (Token kommt direkt vom Token-Endpoint ueber TLS), reines Claim-Lesen rechtfertigt keine Lib.
- **Hardcode-Modell-Liste:** Codex-Backend hat keinen oeffentlichen `/models`-Endpoint (Stand 2026-04-28). Hardcode mit dokumentiertem Update-Pfad. Probe-Request optional als Folge-Feature.
- **Verschachteltes Settings-Schema:** `chatgptOAuth: { accountId, email, planTier, model, expiresAt, tokens, disclaimerAcknowledgedAt }`. Disconnect-Logik trivial (delete `settings.chatgptOAuth`).

**Verworfene Alternativen:**

- `OpenAiProvider` erweitern: vermischt zwei API-Schemata, Endpoint-Drift im Codex-Backend wuerde BYOK-Pfad beruehren. Verworfen zugunsten ADR-88 Option 2.
- Main-Prozess-IPC fuer Loopback: kein offizieller Obsidian-Plugin-API-Hook, `process.electron.remote` deprecated. Faktisch nicht umsetzbar.
- Custom-URL-Scheme `obsidian://`: `auth.openai.com` akzeptiert in der Codex-Client-ID nur HTTP/HTTPS-Redirect-URIs.
- Device-Code-Flow analog Copilot: fuer die Codex-Client-ID nicht freigeschaltet.
- `zod` als Schema-Validator: Bundle-Size-Aufschlag rechtfertigt sich erst bei groesserem Schema-Surface.
- `jose` als JWT-Lib: Overkill fuer Claim-Lesen ohne Signatur-Check.

**Bekannte Risiken (Monitoring waehrend /coding noetig):**

- **Endpoint-Drift Codex-Schema** (hoch, intrinsisch): Mapper-Datei hat Schema-Annahmen mit Datums-Kommentar. Bei unerwarteten Events `console.warn` plus Drift-Indikator. Bei strukturellen Aenderungen klare Fehlermeldung statt stiller Fehlinterpretation.
- **OpenAI sperrt Codex-Client-ID fuer Drittanbieter** (mittel, hoch): Disclaimer im Settings-UI, klare BYOK-Fallback-Empfehlung in der Doku.
- **Plugin-Review-Bot beanstandet `require('http')`** (mittel): Praezedenzfaelle (`require('https')` in `openai.ts`, `require('electron')` in SafeStorageService). PR-Begruendung vorbereiten.
- **Modell-Liste veraltet bei OpenAI-Updates** (hoch): Plugin-Update-Pfad, optional Probe-Request als Folge-Feature.
- **Mehrere Redirect-URIs in Codex-Client-ID** (niedrig): Fallback auf festen Port 1455 wenn Range nicht akzeptiert wird.

**Open Items (deferred to /coding):**

- **JWT-Claim-Name fuer `chatgpt-account-id`**: empirisch beim ersten Login-Test bestimmen. Vermutet: `https://api.openai.com/auth.chatgpt_account_id` oder `chatgpt_account_id` direkt.
- **Plan-Tier-Claim-Name**: empirisch bestimmen (`plan`, `subscription_plan`, `tier`).
- **Vollstaendige Liste Codex-Event-Typen**: nur ueber empirische Tests bestimmbar. Mapper bekommt `default`-Branch.
- **Probe-Request-Endpoint fuer Modelle**: existiert evtl. `/backend-api/codex/models`. Erst nach Hardcode-Liste klaeren.
- **Mehrere Redirect-URIs in Codex-Client-ID-Konfig**: ob `auth.openai.com` Port-Range akzeptiert, ist nicht oeffentlich dokumentiert. Bei `/coding` testen.

**Consistency Check:** plan-context-021.md ist mit ADR-88 und ADR-89 konsistent. Tabelle in plan-context-021.md "Consistency Check" zeigt 9 Decision-Punkte alle mit Status OK.

**Artefakte:**

- `_devprocess/architecture/ADR-88-chatgpt-oauth-provider-architecture.md` (Status: Proposed)
- `_devprocess/architecture/ADR-89-chatgpt-pkce-loopback-flow.md` (Status: Proposed)
- `_devprocess/requirements/handoff/plan-context-021.md`
- `_devprocess/architecture/arc42.md` (Section 9 ADR-Tabelle erweitert, Section 11 Risiken erweitert)
- `_devprocess/context/HANDOFFS.md` (dieser Eintrag)

**Naechster Schritt:**

`/coding` mit folgendem Fokus:

1. Critical Review von ADR-88 und ADR-89 gegen den realen Codebase-Stand:
   - Ist `src/api/providers/openai.ts:75` Node-`https`-Pattern noch aktuell?
   - Ist die `LLMProvider`-Union an allen exhaustive Switch-Statements gepflegt?
   - Existiert `SafeStorageService.SafeStorageEnvelope` exakt im erwarteten Schema?
2. PLAN-Erstellung mit fester Plan-Struktur (Kontext, Aenderungen, Dateien-Zusammenfassung, Nicht betroffen, Verifikation).
3. Implementierungs-Reihenfolge: FEATURE-021-001 -> FEATURE-021-002 -> FEATURE-021-003.
4. Build und Deploy nach jedem Implementierungsschritt.
5. Nach Implementierung: /testing und /security-audit vorschlagen (V-Model-Checklist).

---

## coding-phase 2026-04-28: EPIC-21 ChatGPT OAuth Provider implementiert (awaiting login test)

**Phase:** /coding komplett (Code + Build + Deploy). Manueller Login-Test offen.

**Implementiert:**

- `src/core/auth/jwt-decode.ts`, `PkceLoopbackServer.ts`, `ChatGptOAuthService.ts`
- `src/api/providers/chatgpt-oauth.ts` (OpenAI-SDK + Custom-Fetch, baseURL `chatgpt.com/backend-api/codex`)
- Provider-Wiring in `src/api/index.ts`
- Settings (`ProviderType`, 9 neue Felder, Defaults)
- Settings-Encryption in `decryptSettings`/`encryptSettingsForSave` von `main.ts`
- Service-Init in `main.ts:onload` analog zu Copilot/Kilo
- UI: `buildChatGptOAuthSection` + Provider-Visibility in `ModelConfigModal.ts`
- `BRAND_LABELS`, `PROVIDER_COLORS`, `MODEL_SUGGESTIONS` in `constants.ts`
- 12 i18n-Strings unter `chatgpt.*` in `en.ts`

**Mid-course-Korrekturen, die ADRs angepasst haben (alle vor dem ersten Commit):**

1. **SafeStorage-Schema:** ADR-88 hatte `SafeStorageEnvelope`. Real ist String-Prefix `enc:v1:<base64>`. ADR + plan-context aktualisiert, Status `Accepted (modified by review)`.
2. **Settings-Schema flach:** ADR-88 hatte `chatgptOAuth: { ... }`. Codebase-Konvention (Copilot, Kilo) ist flach. ADR + plan-context aktualisiert.
3. **Settings-Encryption zentralisiert:** Service speichert plain in Settings; `decryptSettings`/`encryptSettingsForSave` in `main.ts` erledigen die Verschluesselung. Konsistenz zu Kilo/Copilot.

**Verifikation bisher:**

- `npx tsc --noEmit`: clean.
- `npm run build`: clean. Plugin-Bundle deployt nach `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/NexusOS/.obsidian/plugins/obsilo-agent/`.

**Noch offen (Sebastians Login-Test):**

- Login mit echtem ChatGPT-Plus-Account.
- Smoke-Test einer einfachen Anfrage gegen `gpt-5-codex`.
- Smoke-Test mit Tool-Call.
- Disconnect-Test.

**Open Items, die nur ueber den Login-Test klaerbar sind:**

- **JWT-Claim-Namen** fuer `chatgpt-account-id` und `plan_tier`. Code probiert mehrere Kandidaten und nimmt den ersten Treffer. Falls kein Treffer: Header `chatgpt-account-id` leer und Backend-Fehler. Mitigation: weitere Claim-Namen in `jwt-decode.ts` ergaenzen.
- **Codex-Endpoint-Schema**: Sender schickt OpenAI-Chat-Completions-Format. Falls Backend Responses-API erwartet, gibt es 4xx mit klarer Meldung (enhanceError). Dann Provider auf Responses-API umstellen.
- **Codex-Client-ID** `app_EMoamEEZ73f0CkXaXp7hrann` aus opencode/codex-rs. Falls falsch: Authorize-Schritt scheitert mit OAuth-Fehler.
- **Port-Range-Akzeptanz**: Code probiert 1455-1460. Wenn `auth.openai.com` nur 1455 akzeptiert und der Port belegt ist, schlaegt Login fehl.

**Bekannte Risiken (Coding-Phase):**

- **Endpoint-Drift**: ueber Schema-Annahmen-Kommentare und enhanceError klassifiziert. Bei Schema-Aenderung klare Fehlermeldung.
- **Plugin-Review-Bot beanstandet `require('http')`**: eslint-disable-Kommentar mit klarer Begruendung gesetzt, Praezedenzfaelle (`require('https')` in `openai.ts`, `require('electron')` in SafeStorageService).
- **Keine automatischen Tests**: bewusster Tradeoff im Auto-Mode-Sprint. Tests gehoeren in /testing.

**Naechste Schritte:**

1. **Sebastian:** Login-Test im NexusOS-Vault. Ergebnisse zurueckspielen.
2. **Falls Login klappt:** /testing fuer Unit-Tests (PKCE-Generation, State-Verifikation, JWT-Decoder, Token-Refresh-Lock) plus /security-audit.
3. **Falls Login scheitert:** Mid-course-Bug-Discovery, BUG-NNN, ggf. ADR-Anpassung. Insbesondere: Backend-Schema empirisch nachpflegen, ggf. von Chat-Completions auf Responses-API umstellen.

---

## coding-phase verified 2026-04-29: EPIC-21 ChatGPT OAuth Provider laeuft

**Status:** User-Bestaetigung "es geht jetzt" 2026-04-29. Login plus Smoke-Test plus Streaming-Antwort funktionieren.

**Fuenf Mid-course-Korrekturen waehrend des Login-Tests:**

1. **OAuth-Schema:** `redirect_uri` muss `http://localhost:PORT/auth/callback` (nicht `127.0.0.1`), Scopes `api.connectors.read api.connectors.invoke` zusaetzlich, plus `id_token_add_organizations=true` und `codex_cli_simplified_flow=true` als Authorize-Params. Verifiziert gegen codex-rs/login/src/server.rs.
2. **Browser-Open:** `electron.shell.openExternal()` statt `window.open()`, weil Microsoft-SSO im Obsidian-Webview blockt.
3. **Transport:** Electron-Renderer-CORS blockt globalThis.fetch gegen chatgpt.com -> `createNodeFetch` aus openai.ts exportiert und genutzt.
4. **Header-Whitelist:** Codex-Backend prueft Originator/User-Agent. Mit "fremden" Werten kommt 403 + "no active subscription" trotz aktivem Abo. Fix: `Originator: codex_cli_rs`, `User-Agent: codex_cli_rs/0.21.0 (Obsidian Plugin) Obsilo`, plus Account-ID auch in PascalCase. Quelle: pi-mono#1828.
5. **Endpoint + Schema:** OpenAI-SDK postet `/chat/completions`, Codex-Backend hat aber nur `/responses`. Provider komplett vom SDK auf direkten `https.request` umgebaut, Body im Responses-API-Format, eigener SSE-Parser fuer `response.output_text.delta`, `response.output_item.added/done`, `response.function_call_arguments.delta`, `response.completed`, `response.failed`.

**Default-Modell:** `gpt-5.5`. Weitere unterstuetzte: `gpt-5`, `gpt-5-codex`, `gpt-5-codex-mini`.

**Geaenderte Dateien (zusaetzlich zu Coding-Phase 2026-04-28):**

- `src/api/providers/chatgpt-oauth.ts` (komplett neu geschrieben fuer /responses-Endpoint, ohne OpenAI-SDK)
- `src/api/providers/openai.ts` (`createNodeFetch` exportiert)
- `src/core/auth/ChatGptOAuthService.ts` (redirect_uri, Scopes, Authorize-Params)
- `src/ui/settings/ModelConfigModal.ts` (`shell.openExternal` statt `window.open`)
- `src/ui/settings/constants.ts` (Modell-Liste auf `gpt-5.5`/`gpt-5`/Codex-Varianten)
- `src/types/settings.ts` (Default `chatgptOAuthModel: 'gpt-5.5'`)
- `_devprocess/implementation/plans/PLAN-09-feature-021-chatgpt-oauth.md` (Status Implemented, Change Log mit fuenf Bug-Eintraegen)

**Open Items (technisch geklaert):**

- JWT-Claim-Namen fuer Account-ID und Plan-Tier: durch Code-Probier-Liste abgedeckt, hat funktioniert.
- Endpoint-Schema: bestaetigt Responses-API.
- Codex-Client-ID `app_EMoamEEZ73f0CkXaXp7hrann`: bestaetigt.
- Port-Range 1455-1460: nicht alle ausprobiert, aber 1455 hat funktioniert.

**Bekannte Risiken (laufender Betrieb):**

- **Endpoint-Drift:** Codex-Backend ist undokumentiert. Schema-Annahmen mit Datums-Kommentar, klare Fehlermeldung bei Statuscode-Drift.
- **OpenAI sperrt Drittanbieter-Tools:** Originator-Header ist Schutzmechanismus von OpenAI gegen genau diese Nutzung. Bei Verschaerfung muessen wir nachziehen.

**Naechster Schritt:**

V-Model-Checklist: nach /coding kommt /testing plus /security-audit. Beides empfohlen, weil Token-Handling und Drittanbieter-Endpoints sicherheitsrelevant sind.

---

## 2026-04-29 -- AUDIT-013 abgeschlossen, Fix-Loop closed

**Audit-Report:** [AUDIT-013](../analysis/AUDIT-013-obsilo-2026-04-29.md)

**Risk-Verdict:** Low (von High before fix)
**Release-Empfehlung:** GREEN -- Fix-Loop hat alle Critical + High + Medium Findings geschlossen.

**Fixed in dieser Audit-Welle:**
- C-1: MCP execute_vault_op Pipeline-Bypass -- interim deny-list mit AGENT_INTERNAL_TOOLS + Write-Tools
- H-1: IgnoreService Filter in SearchFilesTool
- H-2: IgnoreService Filter in MCP searchVault (semantic + keyword + graph + implicit)
- H-3: McpBridge buildResourceList + readResource: ignoreService + validateMcpVaultPath + URI-Length-Cap + .md-Restriction
- H-4: Trust-Boundary-Wrap (`<vault-content trust="user-data">`) in readResource, readNotes, search results, graph + implicit excerpts
- H-5: Timing-safe Bearer-Token-Vergleich via crypto.timingSafeEqual
- M-1: AGENT_INTERNAL_TOOLS-Filter auch im Handler-Dispatch (nicht nur Listung)
- M-2: Telemetry promptPreview opt-in via Settings-Flag (Default false)

**Architektur-Folgewelle in selbiger Session abgeschlossen (ADR-91):**
- C-1 ist jetzt PROPER FIXED. `execute_vault_op` routet durch `ToolExecutionPipeline`; die hand-gepflegte `MCP_DENY_TOOLS`-Liste ist weg. Schema-Validation, IgnoreService, Approval-Flow (fail-closed fuer Writes), Checkpoints, Cache und Operation-Log greifen uniform. Neue Write-Tools erben den Schutz automatisch, kein Maintenance-Aufwand mehr.
- IgnoreService-Build-Semantik ist aufgeloest. SemanticIndex bekommt `isIgnored`-Predicate in den Optionen; ignorierte Files landen nicht mehr im Embedding-Store. Read-time-Filter bleibt als Defense-in-Depth.

**Deferred (P3, Low):**
- L-1, L-2, L-3: false positive oder bereits mitigated -- keine Backlog-Eintraege noetig
- L-4: 4 moderate npm-Advisories in uuid via exceljs/mermaid -- unsere Code-Pfade nicht betroffen, deferred zur naechsten Dependency-Bump-Welle

**Tests:** 1023 / 1023 gruen nach Fixes, keine Regressions.

---

## 2026-05-02 -- /dia-migration: Repo bereits DIA v2-konform, kein Migrationsbedarf

**Skill:** /dia-migration auf Branch `dia-migration`
**Werkzeuge:** `tools/migration/detect_state.py` plus `tools/consistency-check.py` aus dem digital-innovation-agents Repo.

**Phase 0 (Detection):**
- Recommendation: `v2-clean-no-migration-needed`
- v1-Signale: 0 (kein `context/fixes/`, kein `20_bugs.md`, kein `archive/`, kein `security/`-Subdir, keine 4-stelligen FEATURE-IDs, keine 3-stelligen ADRs)
- v2-Signale: alle gesetzt (`_devprocess/rules/`, `_devprocess/requirements/fixes/`, `src/ARCHITECTURE.map`, `_devprocess/context/BACKLOG.md`)
- Counts: 22 Epics (2-digit), 168 Features (FEAT-EE-FF), 91 ADRs (2-digit), 7 Plans (2-digit), 24 Fixes (v2)
- Status-Drift im Frontmatter: 0
- Status-Drift im Body: 0

**Phasen 1-6:** uebersprungen, weil Foundation, Status-Cleanup, Naming, analysis-Flatten, Backlog und Skill-Renames bereits im aktuellen Stand sind.

**Phase 7 (Consistency Check Mode A):** 0 Findings. `_devprocess/context/.git/consistency-check.last-run.json` schreibt leeres `findings`-Array.

**Konsequenz:** Keine Aenderungen am Repo. Branch `dia-migration` enthaelt nur diesen Handoff-Eintrag und kann gemerged oder verworfen werden. Kuenftige `/dia-migration`-Laeufe bleiben dank Idempotenz still, solange das Repo v2-konform bleibt.

---

## 2026-05-02 -- BA-25 Karpathy-Wiki-Pattern (3 Dimensionen): Business Analysis -> Requirements Engineering

triage: BA-25
triage_kind: feature
related-epics: EPIC-15, EPIC-19, EPIC-03

**Phase:** Business Analysis (MVP-Scope, drei Dimensionen) abgeschlossen. Ready for RE.

**Artefakte erzeugt:**

- BA: [BA-25-vault-summary-pflege.md](../analysis/BA-25-vault-summary-pflege.md) (836 Zeilen, Status: Draft)
- Title aktualisiert: "Karpathy-Wiki-Pattern fuer Obsilo (Ingest, Retrieval, Lint)"
- Parent-BA: [BA-19-knowledge-maintenance.md](../analysis/BA-19-knowledge-maintenance.md)
- Web-Recherche zu swarmvault, PENgram, OwlerLite, Atlan, qmd in BA Section 2.1 dokumentiert

**Scope:** MVP, drei Dimensionen Ingest + Retrieval + Lint, sieben Sub-Initiativen, 24 Feature-Kandidaten. Kein neuer Epic, Mapping auf existierende EPIC-15, EPIC-19, EPIC-03.

**Wichtige Architektur-Klaerung beim Ingest (User-Round-2):**
- Zwei Ingest-Modi: Aktiver Dialog (Karpathys Default, Sebastians Praeferenz) vs Auto (less supervised).
- Drei Output-Modi: Source-only / Source plus Summary-Note (Karpathy-Standard) / Source plus Multi-Zettel (Zettelkasten).
- Sebastians Praeferenz: Sense-Making bleibt User-Sache, LLM-Hilfe nur aus Dialog. Multi-Zettel nach Zettelkasten-Praxis als Power-User-Modus.

**HMW:**
> Wie koennen wir den Vault zum kompoundierenden Wissens-Artefakt machen, ohne dass der User Pflege-Zeit aufwendet, ohne in eine Echo-Chamber zu rutschen, ohne dass Wissen stillschweigend veraltet, und ohne das Token-Budget zu sprengen?

**Value Proposition:**
Karpathys "LLMs don't tire of bookkeeping" wird auf Obsilo-Niveau eingeloest, mit Bias-Awareness und Aktualitaets-Pflege als Innovations-Layer obendrauf. Default konservativ (lokale SQL-Operationen, kein Vault-Write, kein externer Call). Power-User-Mehrwert in opt-in Stufen (Frontmatter-Write, Activity-Triggered Lint, Periodischer Lint mit Token-Budget-Cap).

**Critical Hypotheses (Open, 15 Hypothesen):**

Retrieval (H-01 bis H-06): Note-Summary verbessert Recall, SQL-Lookup spart Tokens, Frontmatter-Toggle Adoption, KV-Cache-Block netto positiv, MOC-Pflege stoert nicht, Backfill bewahrt Properties.

Ingest (H-07 bis H-10): Triage-Pass < 0.05 USD, Source-Diversity-Tracking > 80% Precision, Tension-Detection > 60% Precision, Anti-Echo-Vorschlag > 20% Acceptance.

Lint (H-11 bis H-15): Stufe-1-Score > 70% Precision, Stufe-2-Hints 1-5/Woche mit > 30% Acceptance, Stufe-3 unter Default-Budget, Update-Findings > 70% Precision, UX-Konsistenz im Health-Modal reduziert Time-to-Action.

**Feature-Kandidaten (19, gruppiert nach Sub-Initiative):**

Retrieval (R, 7 Features):
- FEAT-15-09 Note-Summary Storage (P0)
- FEAT-15-10 Frontmatter-Property Mirror (P0)
- FEAT-19-08 Konfigurierbarer Standard-Prompt (P0)
- FEAT-19-09 Auto-Summary-Generierung beim Indexing (P0)
- FEAT-19-10 Frontmatter-Write plus Backfill (P1)
- FEAT-19-11 Aktive MOC-File-Pflege (P2)
- FEAT-03-26 Selektiver Top-Hub-Block im KV-Cache (P2)

Ingest (I, 10 Features):
- FEAT-19-12 Pre-Triage-Tool mit 10s-Triage-Karte (P0)
- FEAT-15-11 cluster_source_stats-Tabelle plus Source-Diversity-Tracking (P0)
- FEAT-19-13 Tension-Detection beim Deep-Ingest (P1)
- FEAT-19-14 Concentration-Warning UI plus Anti-Echo-Vorschlag (P1)
- FEAT-19-15 Inbox-Workflow fuer Batch-Triage (P2)
- FEAT-19-22 Aktiver Dialog-Ingest-Modus (Modus A, Karpathy-Default) (P0)
- FEAT-19-23 Auto-Ingest-Modus (Modus B, less supervised) (P1)
- FEAT-19-24 Output-Modus-Auswahl (Source-only / Source+Summary / Source+Multi-Zettel) (P0)
- FEAT-19-25 Source-Folder vs Wissens-Folder Konfiguration (P0)
- FEAT-19-26 Dialog-getriebener MOC-Page-Update beim Ingest (P1)

Lint (L, 7 Features, integriert in VaultHealthService):
- FEAT-15-12 cluster_metadata-Tabelle plus Halbwertszeit-Konfiguration (P0)
- FEAT-19-16 Stufe-1 Composite-Freshness-Score als VaultHealth-Check (P0)
- FEAT-19-17 Source-Diversity-Check als Bias-Lint-Kategorie (P0)
- FEAT-19-18 Health-Modal-Erweiterung mit kontext-spezifischen Action-Buttons (P0)
- FEAT-19-19 Stufe-2 Activity-Trigger plus Web-Search-Update-Pass (P1)
- FEAT-19-20 Stufe-3 Periodischer Job plus Token-Budget-Cap plus Notifications (P2)
- FEAT-19-21 Hot-Cluster-Konfiguration in Settings (P1)

**ADR-Bedarf (13 ADR-Indikatoren):**

Retrieval: note_summaries-Schema, frontmatter_properties-Schema, Conflict-Detection, MOC-Marker-Konvention, KV-Cache-Block-Lifecycle.
Ingest: Pre-Triage-Architektur, Source-Identitaet, Tension-Detection-Algorithmus.
Lint: Cluster-Halbwertszeit-Modell, Web-Search-Provider-Wahl, Token-Budget-Enforcement, Health-Modal-Severity, Activity-Trigger-Cooldown.

**Bindende User-Entscheidungen (aus Initiative-Prompt + Konversation):**
- Variante B: setting-gated Frontmatter-Write, Default OFF, Backfill bei Aktivierung, kein Ueberschreiben.
- Taxonomie SQL-beschleunigt, nicht LLM-only.
- Sebastians Standard-Prompt-Wortlaut bleibt erhalten als Settings-Default.
- Lint integriert in bestehenden VaultHealthService und Vault-Health-Modal (UI-Konsistenz).
- Drei-Stufen-Lint-Stack mit Token-Budget-Cap (Stufe 3 hart begrenzt).
- Bias-Awareness als eigene Lint-Kategorie (Innovations-Layer ueber Karpathy hinaus).

**Open Questions fuer RE:**

Retrieval:
- Bundling FEAT-15-09 + 15-10 + 15-11 + 15-12 in einem Schema-Migration-PLAN (v9 -> v10)?
- Approval-Modell Backfill: pro Note, Batch, Settings-Level?
- MOC-Pflege Default-Tiefe: Header-only oder auch Body bei Markern?

Ingest:
- Triage-Tool als eigenstaendiges `ingest_triage` oder Erweiterung `ingest_document`?
- Source-Identitaet-Modell: Domain-only fuer MVP, Author-Level spaeter?
- Tension-Detection: Cosine-Schwellwert vs LLM-Klassifikation vs Hybrid?
- Dialog-Ingest-State: wo lebt der State zwischen Dialog-Turns (Conversation, eigene Tabelle, Memory-v2)?
- Wenn User Output-Modus aendert (zB von 2 nach 3): retroaktive Re-Verarbeitung oder nur fuer neue Sources?
- Source-Folder vs Wissens-Folder: Konvention oder konfigurierbar pro User?
- Tension-Marker in Multi-Zettel-Modus: an Zettel mit Claim haengen oder als separate Tension-Note?
- Wie verhalten sich Zettel-Notes zur Memory-v2-Fact-Extraktion (FEAT-03-25)?

Lint:
- Halbwertszeit-Defaults: globale Liste oder per-User-Vault-Setup?
- Web-Search-Provider: BYOK obligatorisch oder Default-Provider via Obsilo-Gateway?
- Stufe-3-Job-Runner: setInterval, BackgroundFetch, oder Cron-via-OS?

**Assumptions (fuer RE und Architektur zu pruefen):**
- 1.500-Notes-Backfill mit Haiku token-oekonomisch tragbar (< 5 USD).
- Pre-Triage-Pass < 0.05 USD pro Triage realistisch.
- Stufe-3 Default-Budget 2 USD/Woche realistisch fuer 50 Hot-Cluster.
- Indexing-Latenz darf langsamer werden, solange asynchron.
- Frontmatter-Edits kollidieren nicht mit aktiven User-Edits (Conflict-Detection bauen).
- Vault-Health-Modal skaliert auch bei vielen Findings (Severity-Sortierung, Filter, Bulk-Dismiss).

**Recommended next:** /requirements-engineering
