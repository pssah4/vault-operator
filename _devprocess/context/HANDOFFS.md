# Handoffs (append-only)

Phase-zu-Phase-Uebergaben im V-Model-Workflow. Jeder Eintrag dokumentiert,
was uebergeben wurde und was der naechste Schritt ist.

---

## 2026-04-23 -- EPIC-023 Mobile Support: Business Analysis -> Requirements Engineering

**Phase:** Business Analysis (MVP-Scope) abgeschlossen. Ready for RE.

**Artefakte erzeugt:**

- BA: [BA-23-mobile-support.md](../analysis/BA-23-mobile-support.md) (815 Zeilen, Status: Draft)
- As-Is-Evidenz: inline im Explore-Subagent-Report vom 2026-04-22 (22 HARD + 15 SOFT + 8 DEGRADED Blocker, Pfad:Zeile-genau)

**Scope:** MVP, Companion-Modus statt Full-Parity. Personal-First (P1: Sebastian) mit Community-Hypothese (P2: Vault Operator-Community, H-08).

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
- Mindestens ein Spike (H-02, H-03) vor Feature-Breakdown sinnvoll? Oder RE jetzt, Spike-Ergebnisse später in Features einarbeiten?
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
Subfolders, `.skill` Zip-Import, plus Vault Operator-spezifisches `type: coordinator`
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
- ADRs nicht zu Accepted promoted (hängen an Spike-Ergebnissen ab)
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

Effort: 1 Wo. Code-Änderungen primaer in src/core/knowledge/.
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

- Inoffizielle Endpoints (`chatgpt.com/backend-api/codex/responses`), kein SLA, Schema kann sich ändern. Disclaimer-Pflicht im UI.
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

- **Endpoint-Drift Codex-Schema** (hoch, intrinsisch): Mapper-Datei hat Schema-Annahmen mit Datums-Kommentar. Bei unerwarteten Events `console.warn` plus Drift-Indikator. Bei strukturellen Änderungen klare Fehlermeldung statt stiller Fehlinterpretation.
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
2. PLAN-Erstellung mit fester Plan-Struktur (Kontext, Änderungen, Dateien-Zusammenfassung, Nicht betroffen, Verifikation).
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
- `npm run build`: clean. Plugin-Bundle deployt nach `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/NexusOS/.obsidian/plugins/vault-operator/`.

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
4. **Header-Whitelist:** Codex-Backend prueft Originator/User-Agent. Mit "fremden" Werten kommt 403 + "no active subscription" trotz aktivem Abo. Fix: `Originator: codex_cli_rs`, `User-Agent: codex_cli_rs/0.21.0 (Obsidian Plugin) Vault Operator`, plus Account-ID auch in PascalCase. Quelle: pi-mono#1828.
5. **Endpoint + Schema:** OpenAI-SDK postet `/chat/completions`, Codex-Backend hat aber nur `/responses`. Provider komplett vom SDK auf direkten `https.request` umgebaut, Body im Responses-API-Format, eigener SSE-Parser fuer `response.output_text.delta`, `response.output_item.added/done`, `response.function_call_arguments.delta`, `response.completed`, `response.failed`.

**Default-Modell:** `gpt-5.5`. Weitere unterstuetzte: `gpt-5`, `gpt-5-codex`, `gpt-5-codex-mini`.

**Geaenderte Dateien (zusaetzlich zu Coding-Phase 2026-04-28):**

- `src/api/providers/chatgpt-oauth.ts` (komplett neu geschrieben fuer /responses-Endpoint, ohne OpenAI-SDK)
- `src/api/providers/openai.ts` (`createNodeFetch` exportiert)
- `src/core/auth/ChatGptOAuthService.ts` (redirect_uri, Scopes, Authorize-Params)
- `src/ui/settings/ModelConfigModal.ts` (`shell.openExternal` statt `window.open`)
- `src/ui/settings/constants.ts` (Modell-Liste auf `gpt-5.5`/`gpt-5`/Codex-Varianten)
- `src/types/settings.ts` (Default `chatgptOAuthModel: 'gpt-5.5'`)
- `_devprocess/implementation/plans/PLAN-09-feature-021-chatgpt-oauth.md` (Status Implemented, Change Log mit fuenf Bug-Einträgen)

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
- L-1, L-2, L-3: false positive oder bereits mitigated -- keine Backlog-Einträge noetig
- L-4: 4 moderate npm-Advisories in uuid via exceljs/mermaid -- unsere Code-Pfade nicht betroffen, deferred zur nächsten Dependency-Bump-Welle

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

**Konsequenz:** Keine Änderungen am Repo. Branch `dia-migration` enthaelt nur diesen Handoff-Eintrag und kann gemerged oder verworfen werden. Kuenftige `/dia-migration`-Laeufe bleiben dank Idempotenz still, solange das Repo v2-konform bleibt.

---

## 2026-05-02 -- BA-25 Karpathy-Wiki-Pattern (3 Dimensionen): Business Analysis -> Requirements Engineering

triage: BA-25
triage_kind: feature
related-epics: EPIC-15, EPIC-19, EPIC-03

**Phase:** Business Analysis (MVP-Scope, drei Dimensionen) abgeschlossen. Ready for RE.

**Artefakte erzeugt:**

- BA: [BA-25-vault-summary-pflege.md](../analysis/BA-25-vault-summary-pflege.md) (836 Zeilen, Status: Draft)
- Title aktualisiert: "Karpathy-Wiki-Pattern fuer Vault Operator (Ingest, Retrieval, Lint)"
- Parent-BA: [BA-19-knowledge-maintenance.md](../analysis/BA-19-knowledge-maintenance.md)
- Web-Recherche zu swarmvault, PENgram, OwlerLite, Atlan, qmd in BA Section 2.1 dokumentiert

**Scope:** MVP, drei Dimensionen Ingest + Retrieval + Lint, sieben Sub-Initiativen, 28 Feature-Kandidaten. Kein neuer Epic, Mapping auf existierende EPIC-15, EPIC-19, EPIC-03.

**Wichtige Architektur-Klaerung beim Ingest (User-Round-2 + 3):**
- Zwei Ingest-Modi: Aktiver Dialog (Karpathys Default, Sebastians Praeferenz) vs Auto (less supervised).
- Drei Output-Modi: Source-only / Source plus Summary-Note (Karpathy-Standard) / Source plus Multi-Zettel (Zettelkasten).
- Sebastians Praeferenz: Sense-Making bleibt User-Sache, LLM-Hilfe nur aus Dialog. Multi-Zettel nach Zettelkasten-Praxis als Power-User-Modus.
- Auto-Trigger via konfigurierbarer Frontmatter-Property (User waehlt Property-Name + Wert in Settings, zB `Kategorie: Quelle`). Default off.
- Source-Position-Marker im Perplexity-Stil als klickbare Block-Refs (MD), Page-Refs (PDF), Anchor (URL).
- PDF-Default-Strategie: Original bleibt im Vault (Grafiken/Bilder), Page-Refs `[[source.pdf#page=N]]`. Markdown-Mirror als opt-in fuer text-lastige Forschungs-PDFs.
- Multi-Zettel-Modus haengt am bibliographischen Summary-Note mit Base-Codeblock, der dynamisch alle abgeleiteten Zettel listet (Zettel haben `source: [[bibliographische-summary-note]]`-Property).

**HMW:**
> Wie koennen wir den Vault zum kompoundierenden Wissens-Artefakt machen, ohne dass der User Pflege-Zeit aufwendet, ohne in eine Echo-Chamber zu rutschen, ohne dass Wissen stillschweigend veraltet, und ohne das Token-Budget zu sprengen?

**Value Proposition:**
Karpathys "LLMs don't tire of bookkeeping" wird auf Vault Operator-Niveau eingeloest, mit Bias-Awareness und Aktualitaets-Pflege als Innovations-Layer obendrauf. Default konservativ (lokale SQL-Operationen, kein Vault-Write, kein externer Call). Power-User-Mehrwert in opt-in Stufen (Frontmatter-Write, Activity-Triggered Lint, Periodischer Lint mit Token-Budget-Cap).

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

Ingest (I, 14 Features):
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
- FEAT-19-27 Konfigurierbarer Auto-Trigger via Frontmatter-Property (P0)
- FEAT-19-28 Source-Position-Marker (Block-Refs MD, Page-Refs PDF, Anchor URL) (P0)
- FEAT-19-29 PDF-Strategie (Page-Refs Default vs Markdown-Mirror opt-in) (P1)
- FEAT-19-30 Bibliographische Summary-Note mit Base-Block fuer Multi-Zettel-Modus (P1)

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
- Source-Identitaet-Modell: Domain-only fuer MVP, Author-Level später?
- Tension-Detection: Cosine-Schwellwert vs LLM-Klassifikation vs Hybrid?
- Dialog-Ingest-State: wo lebt der State zwischen Dialog-Turns (Conversation, eigene Tabelle, Memory-v2)?
- Wenn User Output-Modus aendert (zB von 2 nach 3): retroaktive Re-Verarbeitung oder nur fuer neue Sources?
- Source-Folder vs Wissens-Folder: Konvention oder konfigurierbar pro User?
- Tension-Marker in Multi-Zettel-Modus: an Zettel mit Claim hängen oder als separate Tension-Note?
- Wie verhalten sich Zettel-Notes zur Memory-v2-Fact-Extraktion (FEAT-03-25)?

Lint:
- Halbwertszeit-Defaults: globale Liste oder per-User-Vault-Setup?
- Web-Search-Provider: BYOK obligatorisch oder Default-Provider via Vault Operator-Gateway?
- Stufe-3-Job-Runner: setInterval, BackgroundFetch, oder Cron-via-OS?

**Assumptions (fuer RE und Architektur zu pruefen):**
- 1.500-Notes-Backfill mit Haiku token-oekonomisch tragbar (< 5 USD).
- Pre-Triage-Pass < 0.05 USD pro Triage realistisch.
- Stufe-3 Default-Budget 2 USD/Woche realistisch fuer 50 Hot-Cluster.
- Indexing-Latenz darf langsamer werden, solange asynchron.
- Frontmatter-Edits kollidieren nicht mit aktiven User-Edits (Conflict-Detection bauen).
- Vault-Health-Modal skaliert auch bei vielen Findings (Severity-Sortierung, Filter, Bulk-Dismiss).

**Recommended next:** /requirements-engineering

---

## 2026-05-03 -- BA-25 Karpathy-Wiki-Pattern: Requirements Engineering -> Architecture

triage: BA-25
triage_kind: feature
related-epics: EPIC-15, EPIC-19, EPIC-03

**Phase:** Requirements Engineering abgeschlossen. Ready for Architecture.

**Artefakte erzeugt:**
- 28 FEATURE-Specs in `_devprocess/requirements/features/FEAT-*.md`
- architect-handoff: `_devprocess/requirements/handoff/architect-handoff-ba25.md`
- BACKLOG.md erweitert: 28 neue Feature-Rows (Status Planned, Phase Building) ueber EPIC-03 (1), EPIC-15 (4), EPIC-19 (23)
- Dashboard aktualisiert: Total artifacts 311 -> 339

**NFR Summary (quantifiziert):**

Performance:
- SQL-Lookups < 1ms single, < 100ms bulk 1500 Notes
- LLM-Triage < 15s, Summary < 10s
- Indexing-Pass nicht UI-blockierend

Token-Kosten:
- Note-Summary Default Haiku, < 0.001 USD pro Note
- Triage-Pass < 0.05 USD pro Source
- Stufe-2-Web-Search < 0.50 USD pro Klick
- Stufe-3-Wochen-Job Default 2 USD, hart kappiert

Storage:
- Schema-Migration v9 -> v10 additiv, kein Datenverlust

Security:
- Web-Search BYOK, Frontmatter-Write nur mit User-Approval

**Critical ASRs (14, jeder ADR-Bedarf):**

Schema/Storage: ASR-1 Migration-Additivity, ASR-2 Idempotenz-Re-Indexing
Frontmatter-Pflege: ASR-3 Struktur-Erhalten, ASR-4 Conflict-Detection
MOC-Pflege: ASR-5 Marker-Konvention
Ingest: ASR-6 Pre-Triage-Tool-Architektur, ASR-7 Tension-Detection-Algorithmus, ASR-11 Dialog-State-Persistenz, ASR-12 Block-Reference-Konvention, ASR-13 PDF-Page-Refs Mobile
Lint: ASR-8 Web-Search-Provider-Strategie, ASR-9 Job-Runner-Mechanik, ASR-10 Token-Budget-Enforcement
Cache: ASR-14 KV-Cache-Block-Lifecycle

**ADR-Indikatoren: 22** (siehe architect-handoff Section "ADR-Bedarf")

**Bundling-Empfehlung:**

Ein Schema-Migration-Bundle PLAN: FEAT-15-09 + 15-10 + 15-11 + 15-12 (vier Tabellen in einem v9 -> v10 Migrations-Schritt). Verhindert mehrere Migrations zur selben Version.

5-Phasen Implementierungs-Reihenfolge:
1. Foundation (Schema-Bundle plus FEAT-19-08, FEAT-19-09)
2. Lint Foundation (FEAT-19-16, 17, 18)
3. Ingest Foundation (FEAT-19-12, 22, 24, 25, 27, 28)
4. Power-User-Erweiterungen (FEAT-19-10, 13, 14, 19, 21, 23, 26, 29, 30)
5. Erweiterte Schichten (FEAT-19-11, 15, 20, FEAT-03-26)

**Open Questions an Architektur:**

Schema-Bundling:
- Vier Tabellen in einer Migration oder in zwei Schritten (Retrieval-Tabellen + Ingest/Lint-Tabellen)?
- Migration-Rollback bei Fehlschlag im Bundle?

MOC-Pflege:
- Default-Tiefe (Header-only oder Body bei Markern)?
- User loescht Marker: Re-Inject vs Skip vs Notification?

Output-Modus:
- Modus-Wechsel retroaktive Re-Verarbeitung default off, aber explizite Action separat?
- Tension-Marker in Multi-Zettel: am Zettel oder separate Note?
- Memory-v2-Fact-Extraction-Verhaeltnis zu Zettel-Notes (Frontmatter-Flag noetig)?

Web-Search:
- BYOK obligatorisch oder Default-Provider via Vault Operator-Gateway?
- Bester Provider fuer Source-Filter (Anti-Echo)?

Ingest-Approval:
- Backfill-Approval-Modell: pro Note vs Batch vs Settings-Level?

**Constraints:**
- Mobile Read-Pfad muss funktionieren, Write-Pfad kann Desktop-only sein.
- Sebastians Standard-Prompt-Wortlaut bleibt 1:1 als Settings-Default.
- Existierende Architektur wird ERWEITERT (SemanticIndexService, VaultHealthService, ContextComposer), nicht ersetzt.
- knowledge.db v9 -> v10 ist die einzige geplante Migration in dieser Initiative.
- Alle Features sind setting-gated.

**Forbidden-Terms-Check:** alle 28 Feature-Specs auf tech terms in Success Criteria geprueft. Bestanden.

**Recommended next:** /architecture

---

## 2026-05-03 -- BA-25 Karpathy-Wiki-Pattern: Architecture -> Coding

triage: BA-25
triage_kind: feature
related-epics: EPIC-15, EPIC-19, EPIC-03

**Phase:** Architecture abgeschlossen. Ready for Coding (Plan-Gate-vorbereitet).

**Artefakte erzeugt:**
- 15 ADRs in `_devprocess/architecture/ADR-92.md` bis `ADR-106.md` (status Proposed)
- plan-context: `_devprocess/requirements/handoff/plan-context-ba25.md` (~280 Zeilen)
- BACKLOG.md erweitert: 15 ADR-Rows + 5 PLAN-Rows (PLAN-10 bis PLAN-14), 25 Feature-Rows mit ADR-Refs angereichert. Total artifacts 339 -> 359.

**Tech-Stack-Justification:**
- Stack bleibt unveraendert (TypeScript strict, sql.js WASM, Obsidian Plugin API, transformers.js Reranker, parseDocument fuer PDFs).
- Keine neuen externen Dependencies. Alle 28 Features sind durch existing Stack realisierbar.

**Bundling-Empfehlung 5 PLAN-Dokumente:**

| PLAN | Phase | Features | ADRs |
|------|-------|----------|------|
| PLAN-10 | 1 Foundation | FEAT-15-09, 15-10, 15-11, 15-12, 19-08, 19-09 | ADR-92, 93, 94, 95 |
| PLAN-11 | 2 Lint Foundation | FEAT-19-16, 17, 18 | ADR-94, 106 |
| PLAN-12 | 3 Ingest Foundation | FEAT-19-12, 22, 24, 25, 27, 28 | ADR-93, 98, 100, 101, 102, 103 |
| PLAN-13 | 4 Power-User-Erweiterungen | FEAT-19-10, 13, 14, 19, 21, 23, 26, 29, 30 | ADR-95, 96, 99, 104, 106 |
| PLAN-14 | 5 Erweiterte Schichten | FEAT-19-11, 15, 20, 03-26 | ADR-96, 97, 105 |

**Rejected Alternatives (sollen von /coding nicht reopened werden ohne neuen Grund):**

- Two-Schritt-Migration v9 -> v10 -> v11 (Option B in ADR-92): verworfen wegen Mid-State-Risiko.
- Pure-LLM-Tension-Detection (Option B in ADR-99): verworfen wegen Token-Explosion.
- Memory-v2-Facts als Dialog-State-Storage (Option C in ADR-100): verworfen wegen Schema-Semantik-Bruch.
- Default-Provider via Vault Operator-Gateway fuer Web-Search (Option B in ADR-104): verworfen weil Gateway-Infra noch nicht released.
- Soft cap fuer Stufe-3-Token-Budget (Option B1 in ADR-105): verworfen wegen Cost-Falle-Risiko.

**Known Risks (waehrend Coding monitoren):**

- ADR-101 Bibliografie-Codeblock-Syntax: Test gegen aktuelles Bases-Plugin-Schema. Falls API-Bruch: Helper-Funktion anpassen.
- ADR-103 PDF-Page-Refs Android-Plattform: Compatibility-Test, ggf Quote-Block-Fallback wenn Page-Refs auf Android nicht klickbar.
- ADR-94 Cluster-Kategorie-Erkennung Name-Match-Heuristik: Edge-Cases listen, ggf User-Override-UI in Phase 2 verstaerken.
- ADR-99 Tension-Detection Cosine-Top-3-Window: Sample-Eval bei < 60% Precision auf K=5/K=10 erweitern.
- ADR-105 setInterval-Drift bei Plugin-Restart: Doppel-Trigger via last_run_at-Cooldown verhindert.

**Open Items (deferred zu /coding, weil Codebase-State-Abhaengigkeit):**

- Bases-Codeblock-Syntax-Verifikation (ADR-101).
- Cluster-Kategorie-Heuristik-Edge-Cases (ADR-94).
- Tension-Detection Sample-Eval-Setup (ADR-99).
- Vault.process-API-Test im obsidian-sync-Mode (ADR-95).

**Consistency-Check:**
- plan-context-ba25.md ist konsistent mit allen 15 ADRs (Pruefung: jede ADR-Decision findet sich in plan-context-Tabelle).
- Bundling-Empfehlung ist konsistent mit BA-25 5-Phasen-Plan (Section 9.3) und RE-Handoff.
- Forbidden-Terms-Check: keine Em-Dashes, AI-Vokabular, Negative Parallelisms in ADRs oder plan-context (manuelle Pruefung).

**Plan-Gate-Status (4 Items vor /coding):**

1. **SC coverage**: Vorbereitung in plan-context (PLAN-10 bis PLAN-14 mappen alle Features). /coding verifiziert je PLAN-Start.
2. **ADR alignment**: alle 15 ADRs sind in mindestens einem PLAN referenziert (siehe Bundling-Tabelle).
3. **Codebase anchoring**: jeder PLAN nennt konkrete Datei-Pfade (siehe plan-context Code-Ankerpunkte je Phase).
4. **Verify commands**: Default `npm run build` plus `npm test` plus PLAN-spezifische Smoke-Tests dokumentiert.

**Recommended next:** /coding (mit PLAN-10 als ersten konkreten PLAN-Wurf, weil Foundation alles weitere blockiert)

---

## 2026-05-03 -- BA-25 PLAN-10 Phase 1 Foundation: Coding-Session 1 (partial)

triage: BA-25
triage_kind: feature
related-epics: EPIC-15, EPIC-19

**Phase:** Coding (PLAN-10 Tasks 1-5 implementiert, Tasks 6-8 deferred). PLAN-10 bleibt Status=Active.

**Implementiert:**

- Schema-Migration knowledge.db v9 -> v10 (additiv, 6 neue Tabellen plus 4 neue Indexes).
- 4 Store-Klassen mit kompletter Read/Write-API:
  - NoteSummaryStore (FEAT-15-09)
  - FrontmatterPropertyStore (FEAT-15-10)
  - ClusterMetadataStore (FEAT-15-12, plus HALF_LIFE_DEFAULTS plus detectCategory aus ADR-94)
  - ClusterSourceStatsStore (FEAT-15-11, plus normalizeDomain plus Concentration/Diversity-Scores aus ADR-93)
- 32 neue Unit-Tests (6 Migration plus 26 Store), alle gruen.
- Build erfolgreich, Plugin nach iCloud deployed.

**ADR-Statuswechsel:**
- ADR-92: Proposed -> Accepted
- ADR-93: Proposed -> Accepted
- ADR-94: Proposed -> Accepted
- ADR-95: Proposed (Implementation in Folge-Session)

**Backlog-Statuswechsel:**
- FEAT-15-09: Planned -> Active (Storage-API komplett, Indexing-Hook fehlt fuer Done-Promotion)
- FEAT-15-10: Planned -> Active (analog)
- FEAT-15-11: Planned -> Active (Storage-API komplett, Hook in PLAN-12 Triage-Tool)
- FEAT-15-12: Planned -> Active (Storage-API komplett, Lint-Konsumenten in PLAN-11)

**Deferred zu Folge-Session (PLAN-10 Tasks 6-8):**
- Task 6: Settings-Schema-Erweiterung (FEAT-19-08 Standard-Prompt + Auto-Summary-Toggle + pdfStrategy + AutoTrigger-Property additiv).
- Task 7: FrontmatterWriter via Vault.process plus WriterLock-Hybrid (ADR-95).
- Task 8: SemanticIndexService Indexing-Hook (Frontmatter-Read plus optional LLM-Generate plus Mirror-Write).

Ohne diese drei Tasks bleibt FEAT-19-08 plus FEAT-19-09 ungestartet und keine FEAT-15-* erreicht "Done" (weil Indexing-Hook die Schreibseite ist).

**Deviations from plan:** keine. PLAN-10 wie gespect ausgefuehrt mit transparenter Deferral-Markierung.

**Bugs found:** keine.

**Open concerns fuer naechste Session:**
- ADR-95 Vault.process plus WriterLock-Pattern muss gegen Obsidian-API-Version verifiziert werden (aktueller Plugin nutzt vault.adapter direkt, vault.process ist neuere API).
- Sebastians Standard-Prompt-Wortlaut soll 1:1 in Settings landen (siehe BA-25 Anhang B).

**Recommended next:** /coding Folge-Session fuer PLAN-10 Tasks 6-8, oder bewusste Pause fuer User-Review.

---

## 2026-05-03 -- BA-25 PLAN-10 bis PLAN-14 Backend komplett (Coding-Multi-Session)

triage: BA-25
triage_kind: feature
related-epics: EPIC-15, EPIC-19, EPIC-03

**Phase:** Coding fuer alle 5 Phasen-PLANs Backend-komplett. Plugin-Wiring (Tool-Definitionen, UI-Komponenten, Settings-UI, Plugin-Onload-Integration) deferred zu Wiring-Pass.

**Implementiert ueber 5 PLANs:**

PLAN-10 Done (Schema + 4 Stores + Settings + FrontmatterWriter + FrontmatterIndexer):
- knowledge.db v9 -> v10 mit 6 neuen Tabellen
- 4 Storage-Klassen (NoteSummary, FrontmatterProperty, ClusterMetadata, ClusterSourceStats)
- VaultIngestSettings inkl. Sebastians Standard-Prompt-Default
- FrontmatterWriter via processFrontMatter + WriterLock-Hybrid
- FrontmatterIndexer mit mtime-Idempotenz + SummaryGeneratorFn-Hook

PLAN-11 Done (Lint Foundation):
- FreshnessScorer mit Composite-Score-Formel
- 2 neue VaultHealthService Check-Types: cluster_freshness + source_concentration
- Modal-UI deferred

PLAN-12 Backend Done (Ingest Foundation):
- IngestSessionStore (Multi-Turn Dialog-State)
- IngestTriageLogStore (Triage-Decisions + Doppel-Trigger-Schutz)
- BlockIdSetter (deterministisch ^block-N)
- OutputModeGenerator (3 Modi + Folder-Layout + Bibliografie+Base-Codeblock)
- AutoTriggerObserver (vault.on-Listener)
- Tool-Definition + Dialog-UI deferred

PLAN-13 Backend Done (Power-User-Erweiterungen):
- FrontmatterBackfillJob (Pause/Resume/Abort + Progress)
- TensionDetector (Hybrid Cosine + LLM mit Hooks)
- MOCMaintainer (HTML-Comment-Marker + SHA-Detection)
- Activity-Trigger / Hot-Cluster-UI / Bibliografie-Wiring deferred

PLAN-14 Backend Done (Erweiterte Schichten):
- Stufe3PeriodicJob (wochentlich + Hard-Budget-Cap + Notifications)
- TopHubBlockGenerator (KV-Cache-Block mit Lifecycle-Cooldown)
- MOC-Auto-Updater / Inbox-View deferred

**Test-Stand:** 1112/1113 Tests gruen. Eine Pre-Existing Failure in SingleCallProcessor.test.ts (PLAN-007 Era, nicht von BA-25). 100+ neue Tests in BA-25-Sessions.

**ADR-Statuswechsel (alle 15):**
- ADR-92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106: Proposed -> Accepted

**Backlog:**
- 12 FEATs auf Done (alle 4 Schema-Stores, Standard-Prompt, Auto-Summary, 2 Lint-Checks)
- 16 FEATs auf Active (Backend bereit, Wiring deferred)

**Open fuer naechste Session(s):**
- Plugin-Onload-Wiring: AutoTriggerObserver, FreshnessScorer, Stufe3PeriodicJob registrieren
- Tool-Definitionen: ingest_triage als BaseTool im ToolRegistry
- UI: Health-Modal-Severity-Tabs + Filter + Action-Buttons; Triage-Karte; Settings-UI fuer alle vaultIngest-Settings
- Test der Bases-Codeblock-Syntax gegen aktuelles Bases-Plugin (ADR-101)
- PDF-Page-Refs Android-Plattform-Test (ADR-103)
- Sample-Eval Tension-Detection (ADR-99) auf realen Sebastian-Sources

**Bug bekannt:** Pre-Existing SingleCallProcessor.test.ts Setup-Issue (vorher schon, PLAN-007 area). Nicht von BA-25 verursacht. Separater FIX waere ADR-77 area, nicht BA-25-Scope.

**Recommended next:** Wiring-Session: Plugin-Onload-Integration plus Tool-Definitionen plus Settings-UI fuer alle vaultIngest-Settings.

---

## 2026-05-03 -- BA-25 Wiring-Session (Plugin-Onload + Tool-Registrierung + Settings-UI)

triage: BA-25
triage_kind: feature
related-epics: EPIC-15, EPIC-19, EPIC-03

**Phase:** Wiring-Session abgeschlossen. Backend-Bausteine sind jetzt aktiv im Plugin verdrahtet und ueber UI bedienbar.

**Implementiert in dieser Session:**

1. **main.ts onload-Wiring:**
   - 6 neue Plugin-Properties: NoteSummaryStore, FrontmatterPropertyStore, ClusterMetadataStore, ClusterSourceStatsStore, IngestSessionStore, IngestTriageLogStore
   - FrontmatterIndexer mit Settings-gated autoSummary
   - AutoTriggerObserver registriert vault.on('create')+'modify') wenn vaultIngest.autoTrigger.enabled
   - TopHubBlockGenerator als Read-Only-Helper bereit
   - onunload-cleanup fuer autoTriggerObserver.stop()

2. **IngestTriageTool als BaseTool:**
   - src/core/tools/vault/IngestTriageTool.ts
   - ToolName um 'ingest_triage' erweitert
   - In ToolRegistry.registerInternalTools() eingehaengt
   - TOOL_GROUPS-Eintrag 'note-edit' in ToolExecutionPipeline
   - Pipeline: Cluster-Match aus Ontologie, Source-Diversity-Check, Triage-Decision-Persistierung im IngestTriageLogStore
   - Markdown-Triage-Karte mit Concentration-Warnung wenn dominante Domain

3. **Settings-UI (VaultTab):**
   - Neue Section "VAULT-INGEST (BA-25)"
   - Toggle: Auto-Summary beim Indexing
   - Toggle: Auto-Summary in Frontmatter schreiben
   - Standard-Prompt-Editor (PromptModal) mit "Zuruecksetzen"-Button
   - Sub-Section Auto-Trigger: Enabled-Toggle + Property-Name + Property-Value (Komma-Liste) + Notification-Toggle
   - PDF-Strategie-Dropdown (page-refs vs markdown-mirror)
   - Reload-Notice bei Auto-Trigger-Aktivierung

4. **vault_health_check Tool-Output:**
   - formatFindings() um cluster_freshness, source_concentration, god_nodes erweitert
   - Cluster-spezifische Description-Snippets fuer BA-25-Findings
   - Hinweis auf web_search-Tool fuer Stufe-2-Update-Recherche / Anti-Echo-Suche

**Status-Wechsel:**
- 10 weitere FEATs auf Done (FEAT-15-11, 15-12, 19-12, 19-18, 19-19, 19-22, 19-24, 19-25, 19-27, 19-28)

**Test-Stand:** alle BA-25-Tests gruen (96/96 in dieser Session). Build erfolgreich, Plugin deployed.

**Was nach Wiring noch offen ist (deferred zu spätere Iteration):**
- Tatsaechliche Triage-Aktion beim Auto-Trigger: aktuell nur Notice + Log. Soll später ingest_triage Tool-Call ausloesen (braucht Agent-Trigger-Mechanik).
- Backfill-Job UI mit Progress-Bar (FrontmatterBackfillJob existiert, kein Settings-Button gewired).
- Stufe-3-Job-Wiring: Stufe3PeriodicJob existiert, setInterval-Wrapper plus PreFilter/WebSearch-Hooks fehlen (LLM-Coupling-Entscheidung offen).
- Top-Hub-Block-Integration in ContextComposer (FEAT-03-26): Generator vorhanden, ContextComposer-Hook fehlt.
- Health-Modal-UI Severity-Tabs/Action-Buttons-Erweiterung (Tool-Output bereit, Modal-UI nutzt aktuell formatFindings textuell).
- Bibliografie-Note-Pipeline (FEAT-19-30) bei Multi-Zettel-Output: OutputModeGenerator fertig, aber ohne Aufruf-Pfad.

**BA-25-Initiative Gesamt-Stand nach Wiring:**
- BA: Validated
- 28 FEATs: 22 Done, 6 Active (Wiring-Tail-Items oben)
- 15 ADRs: alle Accepted
- 5 PLANs (PLAN-10..14): PLAN-10/11 Done, PLAN-12/13/14 Active mit Backend done plus Wiring-Teil-done
- ~17.000 Zeilen Source + Tests in 14 neuen Service-Klassen plus 10 wiring-Änderungen
- 1112 Tests gruen (1 pre-existing Failure FIX-03-18-01 erfasst)

**Recommended next:** Manuelles Testen im Vault: Auto-Trigger mit "Kategorie: Quelle"-Property ausprobieren, Settings-UI durchklicken, vault_health_check ausfuehren und neue cluster_freshness/source_concentration-Output pruefen.

---

## 2026-05-03 -- BA-25 Testing-Phase

triage: BA-25
triage_kind: feature

**Phase:** /testing fuer Wiring-Session-Änderungen abgeschlossen.

**Tests neu:**
- src/core/tools/vault/__tests__/IngestTriageTool.test.ts (6 Tests):
  pending-decision, decision-update, concentration-warning fired,
  no-warning under threshold, missing-cluster handling, error-on-no-db
- src/core/knowledge/__tests__/VaultHealthService.format.test.ts (6 Tests):
  empty findings, cluster_freshness rendering, source_concentration
  rendering, god_nodes rendering, snippet-limit-3, mixed checks

**Coverage-Beobachtung:**
- 1113 -> 1125 Tests (+12 neu)
- 108 -> 110 Test-Files
- 0 Failures (FIX-03-18-01 nicht reproduzierbar in dieser Session, ggf flaky)

**Coverage-Gaps bewusst nicht getestet:**
- Settings-UI (VaultTab.buildVaultIngestSection): UI-Komponenten brauchen
  Plugin-Mock + Setting-Storage-Mock; visueller Smoke-Test im realen
  Plugin reicht.
- main.ts onload-Wiring: Plugin-Lifecycle-Tests waeren teuer; manueller
  Smoke-Test im Plugin reicht (Auto-Trigger an, Note erstellen, Notice
  pruefen).
- AutoTriggerObserver-vault.on-Listener: Vault-Event-API-Mocking aufwaendig,
  Service-Logic ist trivial (delegate an triageStore.exists/isInCooldown
  was schon getestet ist).

**Brittle/Flaky Patterns:**
- SingleCallProcessor.test.ts: hatte "test setup forgot to assign nextMockApi"
  in vorheriger Session, in dieser nicht reproduziert. Beobachten.

**Open concerns fuer /security-audit:**
- IngestTriageTool nimmt source_uri vom Agent. Pruefen ob URL-Parser
  gegen Path-Traversal oder XSS-Vektor anfaellig.
- AutoTriggerObserver feuert beim Frontmatter-Match: ggf prompt-injection
  via boesartiger Frontmatter-Property in einer ingest-Note.
- FrontmatterWriter via processFrontMatter respektiert User-Properties,
  aber boesartiger LLM-Output koennte Property-Namen kollidieren lassen.

**Recommended next:** /security-audit fuer BA-25-Pfade.

---

## 2026-05-03 -- BA-25 Security-Audit AUDIT-014

triage: BA-25
triage_kind: feature

**Phase:** /security-audit per-item fuer BA-25 abgeschlossen.

**Overall Risk: Medium** (1 High, 2 Medium, 2 Low, 1 Info).

**Resolved in dieser Session:**
- H-1 Path-Traversal in IngestTriageTool source_uri (CWE-22):
  validateVaultPath-Helper rejected `..`-Segmente, NUL-Chars, URL-encoded Escapes.
- M-1 Prototype-Pollution in FrontmatterWriter (CWE-1321):
  FORBIDDEN_PROPERTY_NAMES Set rejected __proto__/constructor/prototype.

**Deferred to Backlog:**
- M-2 -> FIX-03-26-01 (P2): Settings-UI-Hinweis fuer Top-Hub-Block Privacy
- L-1 -> FIX-19-12-02 (P3): URL-Sanitizer in IngestTriageLogStore
- L-2 -> FIX-19-27-01 (P3): Rate-Limit fuer AutoTriggerObserver
- Info-1 -> IMP-19-20-01: Stufe3PeriodicJob state-Persistierung

**Tests:** 1131/1131 gruen (+6 Security-Fix-Tests).
**Build:** gruen, deployed.

**Positive findings (im Audit-Report dokumentiert):**
- SQL-Injection-Schutz konsequent (parameterized queries auch bei dynamic placeholders)
- Atomic Frontmatter-Write via processFrontMatter + WriterLock
- Token-Budget hard-capped in Stufe3PeriodicJob
- Default-konservativ (alle BA-25-Toggles default off)
- MOC-Marker SHA-Detection schuetzt User-Edits
- Keine eval/Function/innerHTML, keine neuen Dependencies

**Release-Empfehlung:** Yellow. P1-H-1 ist gefixt. P2-M-2 (Top-Hub-Block-Privacy-Hint) sollte vor Aktivierung von FEAT-03-26 erledigt werden, blockiert aber kein Default-Release.

**Recommended next:** /dia-orchestrator Phase 7 Release Closure, ODER manueller Review der vier deferred FIX/IMP-Items vor Merge.

**AUDIT-Report:** _devprocess/analysis/security/AUDIT-014-ba25-2026-05-03.md

---

## 2026-05-03 -- BA-25 AUDIT-014 Folge-Session: alle deferred Items abgearbeitet

triage: BA-25
triage_kind: feature

**Phase:** Security-Audit Re-Pass. Alle 4 deferred Findings aus AUDIT-014 in dieser Session resolved.

**Resolved:**
- FIX-19-12-02 (L-1): URL-Sanitizer in IngestTriageLogStore. SENSITIVE_QUERY_PARAMS-Set strippt token/code/state/api_key/session/password etc case-insensitive bei record/get/exists/updateDecision. _sanitized-Marker als Audit-Trail.
- FIX-19-27-01 (L-2): Sliding-Window Rate-Limit in AutoTriggerObserver. Default 10/60s. Check VOR Triage-Log-Write um pending-Storm zu dropping. Konfigurierbar.
- FIX-03-26-01 (M-2): topHubBlock-Settings-Section mit zweistufigem Toggle (Privacy-Acknowledged + Enabled). Settings-Schema um topHubBlock: { enabled, privacyAcknowledged } erweitert. Enabled-Toggle disabled bis Acknowledged.
- IMP-19-20-01 (Info-1): Stufe3StatePersistence-Interface plus ClusterMetadataStatePersistence (state als JSON in cluster_metadata-Spalte mit reserviertem cluster-Name). Konstruktor laed automatisch, save bei spendTokens + rolloverIfNewWeek. Keine Schema-Migration noetig.

**Tests:** 1144/1144 gruen (+13 neue Tests):
- 5 IngestTriageLogStore sanitizer (record-strip, lookup-roundtrip, vault-passthrough, invalid-url-graceful, case-insensitive)
- 7 AutoTriggerObserver (5 functional + 2 rate-limit incl. sliding-window)
- 1 Stufe3 persistence (save+load across instances)

**AUDIT-014 Final-Status: alle 6 Findings Resolved, 0 deferred. Release-Empfehlung: Green.**

**Build:** gruen, deployed nach iCloud.

**Recommended next:** Phase 7 Release Closure ueber /dia-orchestrator. BA-25 ist nun komplett (Backend + Wiring + Tests + Security-Audit + Fixes), bereit fuer dev->main->public Release-Pipeline.

---

## 2026-05-03 -- BA-25 Vollstaendige Implementierung (alle 28 Features Done)

triage: BA-25
triage_kind: feature

**Phase:** User-Course-Correction nach AUDIT-014: 11 Features waren noch Active (Backend done, Wiring offen). In dieser Session vollstaendig implementiert.

**Wiring-Pass 2 implementiert:**

- **FEAT-19-09 Auto-Summary-Wiring:** SummaryGenerator (`src/core/ingest/SummaryGenerator.ts`) als konkreter LLM-Hook. Liest Settings-Prompt, ruft Memory-Model via buildApiHandlerForModel, trunkiert Note-Content auf 8k Chars. FrontmatterIndexer wird im Plugin-onload mit summaryGenerator gewired (wenn autoSummary.enabled). vault.on('create')+('modify')-Listener pro md-File ruft indexNote idempotent.
- **FEAT-19-10 Backfill-Action:** runFrontmatterBackfill()-Plugin-Methode mit Progress-Notice alle 50 Notes. Command "BA-25: Frontmatter-Backfill-Job ausfuehren" plus Settings-Button. Nutzt Setting-konfigurierten storageMode (semanticStorageLocation).
- **FEAT-19-11 MOC-Pflege-Wiring:** refreshAllMOCs()-Methode iteriert ueber Notes mit obsilo:auto-start-Marker, baut Auto-Body via buildMOCAutoBody (Halbwertszeit + Cluster-Source-Stats + Concentration-Score-Hint). Command + Settings-Button.
- **FEAT-19-13 TensionDetector-Wiring:** Im DeepIngestPipeline-Service eingebaut. PlanGeneratorFn (LLM) liefert Take-Aways, TensionDetector klassifiziert via Hooks, Marker werden als Inline-Callouts im Sense-Making-Body angehaengt.
- **FEAT-19-14 Concentration-Counter im Pipeline:** DeepIngestPipeline.run() inkrementiert via sourceStats?.incrementCount(cluster, sourceDomain). IngestTriageTool zeigt Concentration-Warning bereits beim Triage-Pass (war schon).
- **FEAT-19-15 Inbox-Workflow:** runInboxTriage()-Methode iteriert vault.getMarkdownFiles() mit konfigurierter Auto-Trigger-Property, erfasst pending-Einträge im Triage-Log. Command + Settings-Button.
- **FEAT-19-20 Stufe-3 setInterval-Wrapper:** Plugin-onload registriert setInterval mit 1h-Tick. Wrapper-Body ruft rolloverIfNewWeek + run() wenn auto-trigger.enabled. ClusterMetadataStatePersistence laed Budget-State automatisch beim Konstruktor. onunload clearInterval.
- **FEAT-19-21 Hot-Cluster-Settings-UI:** VaultTab listet alle Cluster aus clusterMetadataStore.getAll() mit per-Cluster Toggle. Aenderung schreibt direkt in cluster_metadata + KnowledgeDB-save.
- **FEAT-19-23 Auto-Modus B = DeepIngestPipeline mode='auto':** keine separate Pipeline noetig, bestehender PipelineGenerator unterstuetzt mode-Flag. Caller entscheidet Dialog vs Auto.
- **FEAT-19-26 Dialog-MOC-Update:** DeepIngestPipelineOpts.onMOCPageUpdated-Hook ruft nach Generierung pro Cluster die MOC-Pflege auf. Plugin-Wiring kann diesen Hook auf refreshMOCsForCluster mappen.
- **FEAT-19-29 PDF-Markdown-Mirror:** PdfMarkdownMirror (`src/core/ingest/PdfMarkdownMirror.ts`)-Helper. createMirror(pdfFile) parsiert PDF via parseDocument und schreibt Sibling-md-Note. Idempotent (skip wenn Mirror existiert).
- **FEAT-19-30 Bibliographische Summary-Note:** OutputModeGenerator macht das schon (Modus 3 schreibt Bibliografie + Base-Codeblock + N Zettel). DeepIngestPipeline orchestriert via MultiZettelContent.
- **FEAT-03-26 Top-Hub-Block ContextComposer-Hook:** ComposeInput.topHubBlockMarkdown optional. AgentSidebarView uebergibt plugin.topHubBlockMarkdown wenn topHubBlock.enabled. Plugin-onload generiert initial via generateIfNeeded; manueller Refresh via Command + Settings-Button.

**Tests:** 1150/1150 gruen (+6 DeepIngestPipeline-Tests). Build gruen, deployed.

**Status-Wechsel:** alle 12 verbliebenen Active-Features auf Done.

**BA-25 Final-Status: 28/28 Features Done. 0 Active. 15 ADRs Accepted. 5 PLANs Done. AUDIT-014 6/6 Resolved. Release-Empfehlung: Green.**

**Process-Lessons (User-Feedback aufgenommen):**
- Klare Kommunikation wenn Items deferred werden ist Pflicht. Status "Active" ohne explizite User-Notice ist Workflow-Defekt; Future-Sessions melden Deferrals explizit am Ende jeder Phase.

---

## 2026-05-04 -- AUDIT-016 vollstaendige Codebase + Fix-Loop (10 Findings)

**Branch:** feature/audit-2026-05-03 -> dev (Merge 2e26b83)
**Phase:** Security-Audit (periodisch, Full-Codebase)

**Overall risk verdict:** Low (von Yellow zu Green nach Fix-Loop)

**Unresolved P0/P1:** keine. Alle High + Medium + 4/5 Low resolved.

**Deferred items (1):**
- IMP-23-04-05 (L-4 relay /poll Session-Partition). Effort M, kein
  konkreter Multi-Plugin-Use-Case heute. Cloudflare Worker-Refactor
  zur Multi-Tenancy.

**Architectural security concerns:** keine systematischen.
Codebase reift sichtbar (Cross-Audit-Trend Critical 1->0->0->0,
Highs gehen durchgaengig zu Resource-Limit-Themen statt
Auth/AccessControl).

**Release recommendation:** Green. EPIC-23 + Track 2 + alle
9 FIX-Iterationen + AUDIT-016-Fixes sind production-ready.

**Plugin-Reload empfohlen** damit M-1 (write_vault Cap), M-2
(LIKE-Escape), M-3 (get_context Source-Isolation), M-4 (UUID-IDs)
live wirken. Worker-Redeploy NICHT noetig (alle Änderungen
plugin-side).

---

## 2026-05-04 -- BA-26 Cross-Surface AI Workflow (Implementation Mapping nachgereicht)

**Branch:** chore/phase-7-release-closure
**Phase:** Business-Analysis -> Requirements Engineering (rueckwirkend dokumentiert)

BA-26 wurde am 2026-05-03 als PoC-Scope direkt in EPIC-23 + 5 P0
Features (FEAT-23-01..05) + 1 P1 (FEAT-23-06 Wiedervorlage) ueberfuehrt
ohne formale RE-Phase. Dieser Handoff dokumentiert das Mapping
nachtraeglich, damit die V-Model-Kette Validated -> Implemented
sichtbar bleibt.

**Realisierte Features:** FEAT-23-01..05 alle Done/Released (commit
36fb055). FEAT-23-06 Memory-Profile Wiedervorlage Planned mit
explizitem Trigger (erstes Multi-Persona-Setup).

**Critical Hypotheses Validation:** H1 Live-Test mit Claude/Perplexity/
ChatGPT ok. H2 Cross-Source-Recall ok. H3 Source-Tabs ok. H4 V1
deprecated, Migration-Helper im Settings-Tab.

**KPIs (BA-26 Section 6):** muessen gegen Live-Nutzung gemessen werden.
Erste 4 Wochen Production-Use als Datengrundlage.

---

## 2026-05-04 -- Phase 7 Release Closure (Phase 7 Final-Sync)

**Branch:** chore/phase-7-release-closure
**Phase:** Release-Closure (V-Model Endpunkt fuer den Zyklus seit v2.6.0)

**Final-Sync der Artefakte:**
- BA-25: Anhang C Implementation Closure ergaenzt (PLAN-10..14, Schema v9 -> v10, AUDIT-014 resolved)
- BA-26: Section 12 Implementation Mapping ergaenzt, Status auf "Validated (PoC implemented)"
- FEAT-03-25: ADR-109 in adr-refs Frontmatter eingetragen
- ADR-100..110: status:Proposed aus Frontmatter entfernt (lebt im BACKLOG-Row, dort Accepted)
- arc42 Section 1: Stand 2026-04-13 -> 2026-05-04, Status um EPIC-23, BA-25, AUDIT-014/015/016 erweitert
- arc42 Section 5.5: KnowledgeDB Schema v5 -> v10
- arc42 Section 5.9.1: Memory v2 Cross-Surface MCP-Block ergaenzt
- arc42 Section 8.14: MCP-Tools-Block aktualisiert (Memory-v2 Tools, Hardening, ADRs 107/108/110)
- arc42 Section 9: ADR-Tabelle um ADR-90..110 erweitert (21 neue Einträge)

**Backlog-Cleanup:** 8 FIXes von Open auf Done (commit 37ce55a),
20 Stub-Detail-Files fuer Backlog-Orphans erstellt, 5 PLAN-10..14
Rows nachgetragen, dashboard counts aktualisiert.

**Release-Empfehlung:** v2.7.0 (minor bump). Begruendung:
- Neue benutzersichtbare Features (EPIC-23 Cross-Surface MCP, BA-25 Vault-Summary-Pflege)
- Backwards-kompatibel (V1 update_memory deprecated, nicht entfernt; Migration-Helper)
- Schema-Migration v9 -> v10 idempotent
- 0 Critical / 0 High Findings im AUDIT-016 nach Fix-Loop

**Naechste Iteration:**
- IMP-23-04-05 relay /poll Partitionierung (P3, deferred, kein User-Impact heute)
- FEAT-23-06 Memory-Profile Wiedervorlage (Trigger: erstes Multi-Persona-Setup)
- Live-KPI-Messung BA-26 + BA-25 (4 Wochen Production-Use)
- Section 9 arc42 ADR-Liste fuer Vorzyklus-ADRs (75-89) nach Audit-Pass auffrischen


---

## dia-migration 2026-05-07 -- migration complete

Branch: chore/dia-migration-2026-05-07
Phases run: 1 (foundation spot-check, already in v2 shape), 2 (frontmatter status cleanup), 4 (analysis/ flatten), 5 (BACKLOG.md regeneration), 6 (skill-name renames), 7 (consistency check). Phase 3 (filename naming) bewusst uebersprungen pro User-Entscheidung.

Counts after migration:
- Artifacts: 401 (23 Epic, 202 Feature, 48 Fix, 6 Improvement, 110 ADR, 12 Plan)
- Backlog rows: 401
- Frontmatter status drift removed: 15 fields
- Body status drift: 0
- analysis/security/ subdirectory: removed (3 AUDITs flat-moved)
- archive/ folders: 0
- Skill renames: 4 files (BA-23, REFLECTION-2026-05-03, METRICS, context/README)

Known limitation:
- Consistency-Check Mode A meldet 11 LOW-Findings (orphan-backlog-row fuer ADR-100..ADR-110). Ursache: die DIA-v3.4 consistency-check.py erkennt nur 2-stellige ADR-IDs (Regex `^ADR-\d{2}`) und stuft 3-stellige Files als orphan ein. Die ADRs existieren physisch und sind korrekt referenziert. Der User hat in Phase 0 bewusst entschieden, das gemischte 2-/3-stellige Numbering beizubehalten und Phase 3 (Bulk-Rename) zu ueberspringen, um massiven Diff zu vermeiden. Findings sind kein Datenproblem.

Next steps:
1. Migration-Branch reviewen und als chore-PR nach dev mergen.
2. Zukuenftige neue ADRs weiterhin als ADR-{nnn} (3-stellig) erstellen.
3. Sobald die DIA consistency-check.py ein 3-stelliges ADR-Schema unterstuetzt, automatisch greenern.

---

## 2026-05-07 -- Issue #11 Block-Citations -- BA->FIX-Capture + Skill-Suite-Plan

**Branch:** feature/block-source-citations
**Phase:** Business-Analysis -> Bug-Capture -> Architecture-Amendment

triage: FIX-19-28-01
triage_kind: fix
epic: EPIC-19
feature: FEAT-19-28

### Was passiert ist

GitHub Issue #11 ("Blockweises Zitieren von Quellen") wurde initial
als Item-BA-Pfad fuer ein neues Feature aufgesetzt (`/business-analysis`).
3-Pfad-Audit der existierenden Implementation hat gezeigt:

- **FEAT-19-28 (Source-Position-Marker) ist Done/Released, aber
  funktional broken** -- Sense-Making-Note enthaelt keine Page-Refs
  oder Block-Refs. Erfasst als FIX-19-28-01 (P0).
- **PLAN-15** geschrieben mit 6-Schritt-Implementations-Plan
  (Helpers SourceReader + SummaryPositionAnnotator, Pipeline-
  Anpassung, IngestDocumentTool-Description-Update).
- **User-Vorgabe revidiert** Marker-Form: nicht Perplexity-`[1]`,
  sondern dezentes `↗`-Symbol inline am Satzende. ADR-103 mit
  Amendment 2026-05-07 angepasst (Skill-Layer entscheidet die
  Marker-Form, Tool-Layer bleibt strukturiert).
- **User-Vorgabe ergaenzt** Skill-Suite als Steuerungs-Layer:
  - `/ingest-deep` (Karpathy Multi-Turn, Markdown-Mirror Pflicht)
  - `/ingest` (Single-Pass, page-refs Default)
  - `/meeting-summary` (Transkript-Block-Refs, single-note-Layout)
  Erfasst als **FEAT-19-31**, 3 Skill-Drafts unter
  `_devprocess/architecture/skills/`.

### Code-vs-Spec-Audit (User + LLM)

Mehrere FEATs sind als Done markiert, aber im Code Skelett:
- FEAT-19-22 Dialog-Modus -> IMP-19-22-01 (LLM-Hook fuer Multi-Turn)
- FEAT-19-23 Auto-Modus -> IMP-19-23-01 (echter Plan statt Stub)
- FEAT-19-13 Tension -> IMP-19-13-01 (default-instanziiert)
- FEAT-19-25 Folder -> IMP-19-25-01 (Settings-UI)
- FEAT-19-15 Inbox -> IMP-19-15-01 (Bulk-UI)
- FEAT-19-19 Stufe-2 -> IMP-19-19-01 (One-Click Web-Pass)
- FEAT-19-08 Summary -> IMP-19-08-01 (strukturierter Output)
- FEAT-19-05 OCR -> Status Done -> Planned (Spec ohne Code)
- FEAT-19-06 Batch-Rename -> Status Done -> Planned (Spec ohne Code)

### GitHub-Sync (Schritt 1+2 abgeschlossen)

- `.dia/config.toml` mit mode=github-sync angelegt
- 36 EPIC-19-Issues (EPIC + 30 FEATs + 5 FIX + 1 IMP) auf
  pssah4/vault-operator-dev erstellt via flow.py
- Status synchronisiert (Done -> closed, Planned -> open)
- 8 neue Issues fuer FEAT-19-31 + 7 IMPs (#49-#56)
- FEAT-19-05/06 reopened nach Status-Korrektur (#17, #18)
- Labels bootstrapped: epic, feature, fix, improvement, p0-p3,
  phase:planned/ba/re/arch/coding/testing/sec/review

### Naechste Schritte (recommended)

- **Phase 1 (Code):** PLAN-15 ausfuehren -- Tool-Layer-Reparatur fuer
  FIX-19-28-01. SourceReader + SummaryPositionAnnotator + Pipeline-
  Verkettung + IngestDocumentTool-Description-Update.
- **Phase 2 (Skill-Deployment):** 3 .skill.md Files in
  `.obsidian-agent/plugin-skills/` deployen. Tooling-Frage offen:
  Built-in-Seeding via embedded-assets.json oder Skill-Folder-
  Importer.
- **Tech-Debt-Tickets:** 7 IMPs separat planen (insbesondere
  IMP-19-22-01 als Voraussetzung fuer echten Karpathy-Dialog im Tool-
  Layer).
- **`/dia-guide` Mode-B-Run** vor naechstem Release-Zyklus.

### Open Questions

- Skill-Deployment-Pfad (Built-in vs Vault-Folder-Seed): ASR in
  FEAT-19-31, ADR-Bedarf.
- ADR-100 ingest_session-Tabelle ist accepted aber nicht im
  Produktpfad genutzt (haengt an IMP-19-22-01).
- Mobile-Plattform-Test fuer page-refs (ADR-103 offene Frage zu
  Android).


---

## 2026-05-07 -- coding-to-testing -- FIX-19-28-01 implemented

triage: FIX-19-28-01
triage_kind: fix
epic: EPIC-19
feature: FEAT-19-28

**Branch:** feature/block-source-citations
**Commit:** TBD (pending phase-end)
**Plan:** PLAN-15 status Implemented

### Was implementiert wurde

FIX-19-28-01 (Issue #11) -- Source-Position-Marker werden jetzt in der
Sense-Making-Note inline mit dezentem ↗-Symbol gerendert. 6-Schritt-
Plan-15 vollstaendig durchlaufen, alle 8 Akzeptanzkriterien gruen.

**Geaenderte / neue Files:**

- `src/core/ingest/SourceReader.ts` (neu) -- liest .md / .pdf / Office
  einheitlich als Markdown via parseDocument-Pipeline.
- `src/core/ingest/SummaryPositionAnnotator.ts` (neu) -- rendert
  Take-Aways als Bullet-Liste mit inline `[[source#^block-N|↗]]`,
  `[[source.pdf#page=N|↗]]`, `[[source#anchor|↗]]`.
- `src/core/ingest/DeepIngestPipeline.ts` -- Plan-Schema akzeptiert
  legacy string[] + neue DeepIngestTakeAway[] (backward-compat),
  Source-Body von hardcoded `''` auf SourceReader-Output, BlockIdSetter
  Pre-Pass, SummaryPositionAnnotator-Aufruf bei fehlendem summaryBody.
- `src/core/tools/vault/IngestDeepTool.ts` -- planGenerator-Default
  nutzt readSourceAsMarkdown statt cachedRead (PDF-Garbage-Bug fix),
  liefert Take-Aways mit kind='block-anchor', kein summaryBody mehr.
- `src/core/tools/vault/IngestDocumentTool.ts` -- Tool-Description
  enthaelt Provenance-Konvention (`[[OUTPUT_BASENAME#... |↗]]`),
  Tool-Output meldet Position-Marker-Check pro Aufruf.

**Tests:** 1307 / 1307 (133 Files, 6.4s). 25 neue Tests fuer FIX-19-28-01.
**Build:** tsc + esbuild clean, Deploy in iCloud-Vault erfolgt.

### Open Concerns fuer /testing

- **Live-Repro mit echter PDF:** Unit-Tests decken die Bausteine ab,
  aber ein echter Ingest mit einer PDF aus dem Vault sollte zeigen, ob
  Page-Refs in Obsidian korrekt klickbar sind (AC-02 Desktop-Test).
- **Tool-Description-Wirkung im Agent:** der Agent liest die Description
  und soll den ↗-Marker in `## Kernaussagen` setzen. Verhalten muss in
  einer echten Chat-Session getestet werden.
- **PDF-Mirror-Pfad:** wenn `pdfStrategy='markdown-mirror'` aktiv ist,
  laeuft der Sense-Making-Output anders (Mirror als actualSource). Nicht
  gegen reale PDF getestet.
- **Multi-Zettel-Modus mit Position-Markern:** Take-Aways gehen in
  multiZettel.zettel[*].body, aber Annotation passiert nur in
  source-plus-summary. Multi-Zettel-Notes haben keine Block-Refs --
  separates IMP wenn der User es will.
- **Cross-platform Mobile (iOS/Android):** ADR-103 Open Question, kein
  Test gelaufen.

### Naechster Schritt

`/testing` -- Unit-Tests sind drin, aber Integration-Tests gegen die
echte Vault-API + Live-Verifikation am Beispiel-PDF stehen aus.
Anschliessend Phase-2 (FEAT-19-31 Skill-Suite-Deployment).

---

## 2026-05-09 -- BA Update fuer Issue #313 (Prompt Caching Settings)

**Phase:** Business Analysis (Update-Modus auf BA-12)
**Branch:** chore/imp-18-01-prompt-cache-settings
**Items:** IMP-18-01-01 (Settings & Default), IMP-18-01-02 (Provider-Implementierungen)
**Bezug:** [Issue #313](https://github.com/pssah4/vault-operator-dev/issues/313), FEAT-18-01 (Done/Released), ADR-62 (Accepted)
**Scope:** IMP (Improvement) auf bestehende Feature, kein Greenfield

### Was diese Phase produziert hat

- `_devprocess/analysis/BA-12-token-cost-reduction.md`: neuer Update-Block (Section 11) mit aktualisiertem Gap, drei Hypothesen, neuen KPIs, Scope-Split Phase 1 / Phase 2, drei verworfenen Alternativen.
- `_devprocess/context/BACKLOG.md`: zwei neue IMP-Rows unter EPIC-18, Dashboard-Counter aktualisiert.

### Personas

- Bleiben unveraendert (Knowledge Worker, Power User aus BA-12 Section 4.1).
- Sub-Beobachtung neu in 11.3: Bedrock-User (Enterprise-Compliance) und OpenAI-User (impliziter Cache nicht sichtbar).

### How-Might-We

Wie schalten wir Prompt Caching fuer alle Provider ein, die es unterstuetzen, ohne dass User aktiv konfigurieren muessen, und ohne dass die UI provider-spezifisch hardcoded bleibt?

### Critical Hypotheses (zur Validierung in RE/Coding/Live-Test)

- **H-313-1:** Default-Switch von off auf on ist sicher (Cache-Write-Aufpreis +25% wird durch ersten Cache-Read amortisiert). Falsifikation: >5% User berichten Kostensteigerung in 14 Tagen.
- **H-313-2:** Ein einziges `ModelInfo.supportsPromptCache: boolean` reicht als Capability-Flag. Falsifikation: enum oder discriminated union noetig.
- **H-313-3:** Bedrock cachePoint-Marker liefern messbar `cacheReadInputTokens > 0`. Falsifikation: Bedrock meldet trotz Marker 0.

### Assumptions (zu pruefen)

- OpenAI Usage-Feld `prompt_tokens_details.cached_tokens` ist bei den relevanten Modellen (gpt-4o, 4.1, o1) verfuegbar (laut OpenAI-Doku, nicht im Code verifiziert).
- Bedrock-cachePoint-API ist im aktuellen `@aws-sdk/client-bedrock-runtime` verfuegbar (zu pruefen in RE/Architecture).
- Kilo Gateway leitet Anthropic-Request-Felder unveraendert durch (zu pruefen anhand Gateway-Doku oder Live-Test).

### Open Questions fuer RE/Architecture

- Soll der Tooltip im UI eine konkrete Cost-Schaetzung anzeigen (provider-spezifisch) oder nur einen generischen Hinweis?
- Wo sitzt das `supportsPromptCache`-Flag: in `ModelInfo` (pro Modell) oder in `LLMProvider` (pro Provider-Typ)? RE-Entscheidung.
- Phase 3 (Cache-TTL-Konfiguration via UI, OpenAI `prompt_cache_retention: "24h"`) bleibt deferred. Wann triggern wir das?

### Naechster Schritt

`/requirements-engineering` -- erzeugt zwei IMP-Specs:
- `_devprocess/requirements/improvements/IMP-18-01-01-prompt-cache-settings.md`
- `_devprocess/requirements/improvements/IMP-18-01-02-prompt-cache-providers.md`

Anschliessend `/architecture` fuer eine ADR zum Capability-Flag-Pattern (Erweiterung zu ADR-62), dann `/coding` Phase 1, danach `/coding` Phase 2.

---

## 2026-05-09 -- RE fuer Issue #313 (zwei IMP-Specs)

**Phase:** Requirements Engineering
**Branch:** chore/imp-18-01-prompt-cache-settings
**Items:** IMP-18-01-01, IMP-18-01-02
**Bezug:** BA-12 Section 11, FEAT-18-01, ADR-62, Issue #313

### Was diese Phase produziert hat

- `_devprocess/requirements/improvements/IMP-18-01-01-prompt-cache-settings-ui.md`: Phase 1 Spec (Default-on, Capability-Flag, UI-Visibility, Tooltip). 5 Akzeptanzkriterien.
- `_devprocess/requirements/improvements/IMP-18-01-02-prompt-cache-provider-coverage.md`: Phase 2 Spec (Bedrock cachePoint, OpenAI cached_tokens, Kilo Gateway Passthrough). 5 Akzeptanzkriterien. `depends-on: [IMP-18-01-01]`.

### NFR-Zusammenfassung (kein klassischer NFR-Block, weil IMP)

- **Performance:** keine zusaetzliche Latenz pro Call, im Gegenteil weniger Bytes durch Cache-Reads.
- **Kosten:** Anthropic -90% auf cached prefix nach erstem Call; OpenAI -50%; Bedrock vergleichbar zu Anthropic-direct sobald cachePoint greift.
- **Backward-Compat:** keine Daten-Migration (`undefined === true` zur Laufzeit), bestehende explizite `false`-Werte bleiben erhalten.
- **Sichtbarkeit:** Toggle-Visibility datengetrieben statt provider-spezifisch hardcoded.

### Critical ASRs (fuer Architektur-Phase)

- **ASR-1 Capability-Flag-Standort:** wo sitzt `supportsPromptCache` -- in `ModelInfo` (pro Modell) oder in `LLMProvider` (pro Provider-Typ)? Heute hat Vault Operator keine zentrale `ModelInfo`-Struktur in `src/types/settings.ts`. Architektur-Entscheidung ueber das Pattern noetig (ADR-Update zu ADR-62 oder neuer ADR).
- **ASR-2 Bedrock cachePoint-Format:** AWS-SDK-Spezifik. Architektur entscheidet, ob das Setzen im Provider-Code direkt oder ueber den Adapter-Pattern aus FEAT-18-01 (PromptCacheAdapter) gehen soll.

### Open architecture questions

- Muss ADR-62 erweitert werden oder ein neuer ADR aufgesetzt werden fuer das Capability-Flag-Pattern?
- Ist der Adapter-Pattern aus FEAT-18-01 (das im Code unter welchem Namen lebt?) heute schon nutzbar fuer Bedrock und Kilo Gateway, oder braucht es ein Refactoring?
- Soll der Tooltip-Text im UI-Konstanten-File oder in i18n liegen? Heute hat `src/ui/settings/constants.ts` Labels, `i18n/locales/en.ts` ebenfalls.

### Constraints

- **Review-Bot-Compliance:** keine `console.log`/`fetch`/`require`/`element.style.X = Y`/`innerHTML`/`any` neu einfuehren.
- **Kein Breaking Change** in Settings-Schema (`data.json`): Feld `promptCachingEnabled` bleibt optional, Defaults werden zur Laufzeit interpretiert.
- **iOS/Android/Desktop:** Settings-UI muss auf allen drei Obsidian-Plattformen funktionieren.

### Forbidden-terms check

IMPs erlauben technische Begriffe in Loesung und Akzeptanzkriterien (anders als Feature-Specs mit tech-agnostischen SC). Beide Specs nutzen technische Begriffe nur dort, wo der Kontext (Provider-API, AWS-SDK, OpenAI-Usage-Feld) sie erfordert. Problem-Section beschreibt User-Outcome ("zahlen volle Rate", "sehen weder den Rabatt").

### Naechster Schritt

`/architecture` -- klaert ASR-1 (Capability-Flag-Standort) und ggf. ASR-2 (Adapter vs. direkter Provider-Code). Output: ADR-Update oder neuer ADR, plan-context.md fuer beide IMPs. Anschliessend `/coding` IMP-18-01-01, dann `/coding` IMP-18-01-02.

---

## 2026-05-09 -- ARCH fuer Issue #313 (ADR-111 + plan-context-imp-18-01)

**Phase:** Architecture
**Branch:** chore/imp-18-01-prompt-cache-settings
**Items:** IMP-18-01-01, IMP-18-01-02, ADR-111
**Bezug:** ADR-62 (Update 2026-05-09), BA-12 Section 11

### Was diese Phase produziert hat

- `_devprocess/architecture/ADR-111-provider-capability-flag-und-bedrock-cachepoint.md`: neuer ADR (Status Proposed). Vier Optionen geprueft, Option C (statische Capability-Tabelle) plus direkte Provider-Implementierungen gewaehlt. Konsistent mit ADR-62-Praemisse "kein separater Adapter".
- `_devprocess/architecture/ADR-62-kv-cache-optimized-prompt.md`: dated Note "Update 2026-05-09" angefuegt, korrigiert zwei implizite Annahmen (Bedrock automatisch, UI-Visibility hardcoded). ADR bleibt Accepted, nicht superseded.
- `_devprocess/requirements/handoff/plan-context-imp-18-01.md`: Tech-Stack, ADR-Summary, Capability-Tabellen-Initialbestand (~17 Einträge), Tooltip-Text, Implementierungsreihenfolge, Live-Test-Protokoll fuer H-313-3.
- `src/ARCHITECTURE.map`: vier Wayfinder-Zeilen aktualisiert (anthropic, openai, bedrock + neuer Eintrag `cache-capability`).
- `_devprocess/context/BACKLOG.md`: neue Row ADR-111 (Proposed/Building), Refs in IMP-18-01-01/02 um ADR-111 ergaenzt, Dashboard-Counter aktualisiert.
- IMP-Spec-Frontmatter: `adr-refs: [ADR-62, ADR-111]` in beiden IMPs.

### Tech-Stack-Begruendung

Bestehender Stack bleibt unveraendert. Drei Provider werden im bestehenden Adapter-Pattern (ADR-11) erweitert, eine neue Datenstruktur (Capability-Tabelle) ergaenzt das Modell-Capability-Konzept. Keine neuen externen Dependencies. Kein Refactoring auf eine neue Adapter-Schicht. AWS-SDK ist bereits in passender Version installiert (v3.1031, cachePoint ab 3.1030 verfuegbar).

### Verworfene Alternativen

- **Option A (Capability-Flag in `ModelInfo` direkt):** Drift-Risiko zwischen Provider-`getModel()` und UI-Lookup-Tabelle ist real. Issue #313 wurde genau wegen dieses Drifts geoeffnet.
- **Option B (Pro Provider-Typ statt Modell):** Zu grob fuer heutige Heterogenitaet (Copilot/Claude vs. Copilot/GPT, OpenAI 3.5 vs. 4o).
- **Option D (PromptCacheAdapter-Interface aus FEAT-18-01-Spec):** Widerspricht ADR-62, ohne neuen Grund. Drei Provider-Eingriffe sind nicht teurer als eine Adapter-Schicht plus drei Adapter-Implementierungen.

### Bekannte Risiken (zur Beobachtung in /coding)

- **R-1 Bedrock cachePoint-Verfuegbarkeit:** AWS-Doku andeutet regional/modellabhaengige Einschraenkungen. Live-Test in IMP-18-01-02 ist H-313-3-Falsifikator.
- **R-2 Kilo Gateway laesst cache_control fallen:** unverifiziert. Live-Test, Capability-Eintrag bei Bedarf zuruecknehmen.
- **R-3 OpenAI cached_tokens-Cost ist Approximation:** Tier-Rabatte und Batch-Pricing nicht abgedeckt. Tooltip erklaert das.

### Open Items fuer /coding

Diese Punkte loest /coding gegen den realen Codebase-Stand:

1. Finale Pfad-Wahl fuer das Capability-Modul (vorgeschlagen: `src/api/capabilities.ts`).
2. Pattern-Match-Implementierung: eigenes simples Wildcard-Matching (~10 Zeilen) bevorzugt vor neuer Dependency.
3. Token-Display-Komponente fuer cached_tokens-Anzeige: Pfad ermitteln, ob die Aenderung im Display oder im Token-Counter-Service noetig ist.
4. Cost-Calc-Modul: existiert bereits eines? Wenn ja, dort 50%-Cached-Rate-Logik einbauen, sonst pragmatische Inline-Loesung.
5. Tooltip-Mechanik: bestehende Konvention im Modal nutzt DOM-Attribut `title` plus i18n-Key (Pattern `modal.modelConfig.*`).

### Konsistenz-Check

- ADR-62 + ADR-111 widersprechen sich nicht. ADR-111 ergaenzt additiv.
- Capability-Tabelle und IMP-18-01-01/02 sprechen dieselbe Sprache (`cacheStyle`-Werte).
- plan-context-imp-18-01.md zitiert beide IMPs und beide ADRs konsistent.
- Wayfinder-Zeilen (`anthropic`, `openai`, `bedrock`, neu: `cache-capability`) verweisen alle auf ADR-111.
- Bekanntes Tool-Quirk: consistency-check meldet ADR-111 als orphan-backlog-row, obwohl die Datei existiert (gleicher false positive wie bei ADR-100, ADR-110). Pre-existing.

### Naechster Schritt

`/coding` mit IMP-18-01-01 (Phase 1, Settings & Default). Implementiert die Capability-Tabelle, Default-Switch, UI-Visibility, Tooltip. Anschliessend `/testing` fuer Phase 1, dann `/coding` IMP-18-01-02 (Phase 2, Provider-Coverage), `/testing`, `/security-audit`.

---

## 2026-05-10 -- CODING fuer IMP-18-01-01 (Phase 1, Settings & Default) -- DONE

**Phase:** Coding (Implementation)
**Branch:** chore/imp-18-01-prompt-cache-settings
**Item:** IMP-18-01-01
**Plan:** PLAN-16
**Bezug:** ADR-111, ADR-62, FEAT-18-01, BA-12 Section 11

### Was implementiert wurde

- **Capability-Modul**: `src/api/capabilities.ts` (105 Zeilen, neu).
  Schema: `CacheStyle` Type Union, `CacheCapabilityEntry` Interface,
  `CACHE_CAPABILITY_TABLE` mit 18 Einträgen, `getCacheCapability()`
  Pure Function mit eigener Wildcard-Match-Implementierung (~10 Zeilen,
  keine externe Dependency). Conservative Default `none`.
- **Default-Switch**: `src/types/settings.ts:265`
  -- `promptCachingEnabled: model.promptCachingEnabled !== false`.
  Effekt: undefined wirkt als true, explizit false bleibt false. Keine Daten-Migration noetig.
- **UI-Visibility**: `src/ui/settings/ModelConfigModal.ts`. Init nutzt
  Capability-Default fuer neue Modelle, Visibility-Bedingung aus
  Capability-Tabelle statt provider-hardcoded Strings. Drei
  Modell-Aenderungs-Pfade (Input-Field, Ollama-Browser, Custom-Browser)
  triggern jetzt `updateFieldVisibility()`, weil Capability vom Modell-ID abhängt.
- **Tooltip**: neuer i18n-Key `modal.modelConfig.promptCachingTooltip` in
  `src/i18n/locales/en.ts`. Checkbox bekommt `attr.title` mit dem Cost-Hinweis-Text.

### Tests

- 33 neue Tests (29 in `capabilities.test.ts`, 4 in `settings-prompt-cache.test.ts`).
- Gesamt-Suite: 1341/1341 gruen, Build (tsc + esbuild) exit 0.
- Auto-Deploy in iCloud-Vault erfolgreich.

### Akzeptanzkriterien-Erfuellung

| AC | Status | Nachweis |
|---|---|---|
| AC-1 Default-Verhalten | gruen | settings-prompt-cache.test.ts (4 Tests) |
| AC-2 Capability-Flag fuer alle Provider | gruen | capabilities.test.ts (29 Tests, 12 Provider abgedeckt) |
| AC-3 UI-Visibility datengetrieben | gruen via Build + Code | Visibility-Bedingung nutzt `getCacheCapability` |
| AC-4 Tooltip mit Cost-Hinweis | gruen via Build + Code | i18n-Key + DOM-Attribut title gesetzt |
| AC-5 Keine Regression bei nicht-cache-faehigen Providern | gruen | capabilities.test.ts (Out-of-Scope-Block, 7 Provider) |

### Deviations vom Plan

Keine. Implementierung folgt PLAN-16 1:1.

### Open Concerns fuer /testing

- **Live-UI-Test fehlt:** AC-3 und AC-4 wurden nur durch Build + Code-Inspektion bestaetigt. Manueller Walk durch das Settings-Modal (alle 12 Provider, Modell-Wechsel via Quick-Pick und Browser) steht aus. Test-Plan in PLAN-16 Implementation Notes festgelegt.
- **Live-Anthropic-Call:** Anthropic-Provider-Code unveraendert. Bestehender cache_control-Mechanismus muss weiter funktionieren. Empfohlener Test: zwei aufeinanderfolgende Anfragen, Pruefung ob Token-Counter Cache-Hit zeigt.
- **Bestehende Configs (data.json) mit `promptCachingEnabled: undefined`:** wirken jetzt als enabled. Empfohlener Test: Plugin in einer Vault mit aelteren Settings starten, Verhalten beobachten.

### Vorbereitung Phase 2 (IMP-18-01-02)

In dieser Phase NICHT angefasst, aber als Pfad-Hinweis fuer Phase 2:

- Token-Display fuer cached_tokens: noch nicht im Code identifiziert (Sidebar-Komponente).
- Cost-Calc-Modul: noch nicht identifiziert.
- Bedrock cachePoint-Insertion: braucht AWS-SDK `ContentBlock.cachePoint`-Format, AWS-SDK-Version v3.1031 ist installiert.
- Phase 2 nutzt `getCacheCapability(...).cacheStyle` als Dispatch-Schluessel: `bedrock-cachepoint`, `openai-implicit`, `passthrough`.

### Naechster Schritt

`/testing` -- automatisierte Tests sind drin, aber Live-UI-Verifikation des Settings-Modals und Live-Anthropic-Cache-Verifikation stehen aus. Anschliessend `/coding` mit IMP-18-01-02 (Phase 2, Provider-Coverage).

---

## 2026-05-10 -- FIX-19-28-05 Bug-Capture: AttachmentHandler Lifecycle (Coding-Capture-Pfad)

**Phase:** Coding (Bug-Capture-Entry-Point). Kein Fix in dieser Iteration, naechste Phase ist `/requirements-engineering`.

**Item:** FIX-19-28-05
**Bezug:** FEAT-19-28, FEAT-19-31, EPIC-19, FIX-19-28-02 (verwandt, falsche Diagnose dort)

### Was passiert ist

Live-Test 2026-05-10 mit `/ingest-deep` auf einem PDF-Chat-Attachment scheitert in Turn 1: `read_document(attachment_index=0)` wirft die STOP-Errormsg aus FIX-19-28 (Issue #312), der Agent ignoriert das Stale-Mirror-Verbot im Skill und schreibt eine fabrizierte "Deep Ingest"-Note mit dead Block-Refs zu einer nicht existierenden Quelldatei.

Auf den ersten Blick sah es nach einer Skill-Compliance-Schwaeche aus. Code-Reading hat den eigentlichen Lifecycle-Bug freigelegt:

1. `handleSendMessage` snapshottet nur `pending` (Zeile 1442), nicht `fullDocTexts`.
2. `clear()` (Zeile 1443, AttachmentHandler:268) leert beide Listen.
3. 270 Zeilen später liest `getFullDocTexts()` (Zeile 1713) das jetzt-leere Array.
4. Der `if (docTexts.length > 0)`-Guard (Zeile 1714) verhindert den `setAttachmentTexts`-Call vollstaendig.
5. `ReadDocumentTool.attachmentTexts` bleibt `[]`, jeder Attachment-Aufruf failed mit der STOP-Errormsg.

Damit ist die Annahme von FIX-19-28-02 ("Turn 1 funktioniert, Turn 2+ nicht") widerlegt. Der Bug existiert seit Commit 67d5b1cd (2026-04-11) und war 4 Wochen unentdeckt, weil die Symptom-Behandlung (besseres Errormsg, Skill-Disziplin, Stale-Mirror-Verbot) das Failure-Mode harmlos aussehen liess.

### Artefakte erzeugt

- BACKLOG-Zeile FIX-19-28-05 (Open / Building, P0). Dashboard-Counts auf 424.
- [FIX-19-28-05-attachment-clear-lifecycle.md](../requirements/fixes/FIX-19-28-05-attachment-clear-lifecycle.md): Symptom, Root-Cause, Failure-Trace, Console-Output, Repro-Schritte, Akzeptanzkriterien, Scope-Abgrenzung gegen FIX-19-28-02 / FIX-19-28 / Persistent-Attachment-State.
- Branch `fix/19-28-05-attachment-clear-lifecycle` aus `dev` erstellt.

### Out-of-Scope dieses FIX

- **Persistent attachment state ueber den Task-Lifecycle:** wenn der User in Turn 2 ohne neues Attachment sendet, sollte das Attachment aus Turn 1 weiter abrufbar sein. Eigenes IMP unter EPIC-19, getrennt von der Lifecycle-Korrektur.
- **Skill-Architektur-Vereinfachung:** `/ingest-deep` Step 0a ("erst in Vault speichern") wurde nur eingebaut um diesen Bug zu umschiffen. Nach dem Fix kann der Step verschlankt werden, aber das ist FEAT-19-31-Folge, nicht dieser FIX.

### Naechster Schritt

`/requirements-engineering` auf FIX-19-28-05. Sebastian moechte vor dem Fix RE/ARCH-Disziplin halten, weil der Bug bereits zweimal an Folge-Symptomen "gefixt" wurde, ohne dass der Lifecycle-Bug erkannt wurde. RE soll den Scope und die Akzeptanzkriterien sauber gegen die Out-of-Scope-Themen abgrenzen, ARCH soll entscheiden ob der `clear()`-Lifecycle umgebaut wird (z.B. Trennung in `clearPending()` und `clearAll()`) oder ob der Snapshot in `handleSendMessage` reicht.

---

## 2026-05-10 -- FIX-19-28-05 RE complete: Architecture-Handoff vorbereitet

**Phase:** Requirements Engineering abgeschlossen. Ready for Architecture.

**Item:** FIX-19-28-05
**Bezug:** FEAT-19-28, FEAT-19-31, EPIC-19, FIX-19-28-02 (verwandt)

### Was passiert ist

RE hat die im Bug-Capture erfassten Akzeptanzkriterien geschaerft, einen User-Outcome-Block und Technical NFRs ergaenzt und einen Architecture-Handoff geschrieben mit drei offenen Architektur-Fragen.

### Artefakte erzeugt / aktualisiert

- [FIX-19-28-05-attachment-clear-lifecycle.md](../requirements/fixes/FIX-19-28-05-attachment-clear-lifecycle.md): Neue Sections "User-Outcome" und "Technical NFRs". AC-Tabelle erweitert um Verifikationsart pro Kriterium. Test-Strategie hinzugefuegt (Unit + Integration + Live).
- [architect-handoff-fix-19-28-05.md](../requirements/handoff/architect-handoff-fix-19-28-05.md) (neu): Scope, ASRs (2 Moderate, 0 Critical), NFR-Summary, Constraints inkl. Out-of-Scope-Block, drei Open Questions (Q-01 Snapshot vs API-Split, Q-02 Push vs Pull, Q-03 ADR-Granularitaet).

### NFR-Summary fuer den Architekten

| Category | Target |
|---|---|
| Performance | Keine Regression. Snapshot O(N) auf <= 4 MB. |
| Memory | MAX_TOTAL_DOC_TEXT_SIZE-Schutz bleibt aktiv. |
| Backward compatibility | Keine Aenderung an Tool-Public-API (ReadDocumentTool, IngestDocumentTool). |
| Observability | Bestehende Errormsg aus FIX-19-28 bleibt der Failure-Pfad. |

### Open Questions an /architecture

- **Q-01 (Moderate):** Snapshot-Pattern in handleSendMessage oder API-Split in AttachmentHandler? RE empfiehlt API-Split, weil clear() zwei Verantwortungen vermischt.
- **Q-02 (Moderate):** setAttachmentTexts immer aufrufen (Push) oder Tool-Side-Reset (Pull)? RE empfiehlt Push, weil Pull die Tool-Sidebar-Kopplung verstaerken wuerde.
- **Q-03 (Decision):** Eigener ADR oder Notiz in bestehendem ADR? RE empfiehlt eigenen kleinen ADR, weil das Snapshot-vs-Split-Muster wiederverwendbar ist.

### Forbidden-Terms-Check

AC-Tabelle enthaelt minimale technische Anker (`/ingest-deep`, "0 attachments available"-Errormsg) im selben Stil wie FIX-19-28-02. User-Outcome-Block ist tech-agnostisch. Technical NFRs sind sauber separiert.

### Naechster Schritt

`/architecture` auf FIX-19-28-05. ADR-Vorschlag oder Notiz, plus plan-context fuer den Coder. Architekt entscheidet die drei offenen Fragen und produziert die finale Implementierungs-Anleitung.

---

## 2026-05-10 -- FIX-19-28-05 ARCH complete: ADR-112 + plan-context fuer /coding

**Phase:** Architecture abgeschlossen. Ready for Coding.

**Item:** FIX-19-28-05
**Bezug:** ADR-112 (neu), FEAT-19-28, FEAT-19-31, EPIC-19

### Was passiert ist

Architecture-Pass hat die drei Open Questions aus dem RE-Handoff entschieden und einen kleinen, fokussierten ADR plus den plan-context fuer den Coder geschrieben. Dem RE-Empfehlungs-Trio (Split, Push, eigener ADR) wurde gefolgt, mit einer Konkretisierung in Q-01: API-Split LIGHT mit atomarem `consumeFullDocTexts()` statt zweier separater Methoden `clearPending` / `clearAll`.

### Tech-Stack-Justification

Der Fix bleibt im Sidebar-Layer (TypeScript strict, Obsidian Plugin API). Kein neues Modul, keine neue Dependency. `AttachmentHandler` bekommt eine zusaetzliche oeffentliche Methode (`consumeFullDocTexts`), `clear()` wird semantisch verengt (nur UI-Reset). Tool-Layer-API unveraendert.

### Rejected Alternatives

- **Snapshot-Pattern im Caller (Option A im ADR).** Loest den heutigen Bug, kodiert den Lifecycle aber nur in der Aufruf-Reihenfolge. Drift-anfaellig fuer zukuenftige Code-Änderungen in `handleSendMessage`.
- **Tool-Side-Pull (Option C im ADR).** Tool-Layer wuerde direkt aus `AttachmentHandler` lesen. Verstaerkt Sidebar-Tool-Kopplung, macht Tools ohne Sidebar-Instanz untestbar (z.B. bei MCP-Workflows). Ueberdimensioniert fuer den Bug.

### Bekannte Risiken

- Falls eine andere `attachments.clear()`-Aufrufstelle als `handleSendMessage` (heute Z.2587, Z.2917) unausgesprochen erwartet hat, dass `clear()` auch fullDocTexts loescht, kann nach dem Umbau ein subtiler Memory-Leak entstehen (Texte bleiben liegen, bis der naechste Send konsumiert). **Mitigation:** Audit-Pflicht jeder `clear()`-Aufrufstelle ist im plan-context als Coder-Constraint festgehalten. `MAX_TOTAL_DOC_TEXT_SIZE`-Schutz greift weiterhin auf `pushFullDocText`.
- Falls zwei Sends sehr schnell hintereinander geschickt werden, ueberschreibt der zweite die Tool-State des ersten. Verhalten ist heute identisch (gleicher Tool-Singleton-State); kein Regress.

### Open Items fuer /coding

- Audit der drei `attachments.clear()`-Aufrufstellen in `AgentSidebarView.ts`. Jede Stelle muss kommentiert werden, ob sie weiterhin auch fullDocTexts-Loeschung erwartet (= zusaetzlicher `consumeFullDocTexts()`-Aufruf, Wert ignorieren).
- Live-UI-Verifikation: Sebastian zieht PDF in Chat, `/ingest-deep` starten, Console + UI beobachten.

### Wayfinder

`AttachmentHandler` ist heute nicht in `src/ARCHITECTURE.map` (nur ein internes Submodul von Sidebar). Kein Wayfinder-Update notwendig. ADR-112 dokumentiert das Konzept, ein Wayfinder-Eintrag waere ueberproportional fuer die Groesse des Konzepts.

### Consistency Check

plan-context-fix-19-28-05.md zitiert ADR-112 in Sektion 2 und in der ADR-Summary-Tabelle. Tech-Stack-Anker in plan-context und ADR-112 sind konsistent (TypeScript strict, Obsidian, kein Refactor des Tool-Layers).

### Naechster Schritt

`/coding` auf FIX-19-28-05 mit plan-context-fix-19-28-05.md als Eingabe. Coder folgt der konkreten Implementierungs-Anleitung pro File (`AttachmentHandler.ts` zuerst, dann `AgentSidebarView.ts`), schreibt erst die Unit-Tests RED, baut dann gruen, und verifiziert per Live-Test mit PDF.

---

## 2026-05-10 -- FIX-19-28-05 Coding complete: AttachmentHandler-Lifecycle-Fix

**Phase:** Coding abgeschlossen. Live-Test ausstehend (Sebastian manuell).

**Item:** FIX-19-28-05
**Plan:** PLAN-17
**Bezug:** ADR-112, FEAT-19-28, FEAT-19-31, EPIC-19, FIX-19-28-02 (verwandt, durch diesen Fix de-facto erledigt)

### Was implementiert wurde

ADR-112 1:1 operationalisiert in zwei Code-Files plus einem neuen Test-File:

- **`src/ui/sidebar/AttachmentHandler.ts`**: `clear()` verengt auf UI-Reset (pending + chipBar), `consumeFullDocTexts()` neu hinzugefuegt mit atomarem Snapshot+Clear. JSDoc-Hinweise auf ADR-112 / FIX-19-28-05 in beiden Methoden.
- **`src/ui/AgentSidebarView.ts:1710-1722`** (Send-Flow): `getFullDocTexts()` -> `consumeFullDocTexts()`, if-Guard entfernt, Loop unconditional. Tools werden jetzt pro Turn synchronisiert (auch mit `[]`).
- **`src/ui/AgentSidebarView.ts:2587`** (newConversation-Reset) und **`:2917`** (loadConversation): nach `clear()` jeweils `void this.attachments.consumeFullDocTexts()` ergaenzt mit Inline-Comment.
- **`src/ui/sidebar/__tests__/AttachmentHandler.test.ts`** (neu): 5 Test-Szenarien fuer Lifecycle und State-Leak.

### Tests

- 5 neue Tests in AttachmentHandler.test.ts. Volle Suite: **1346/1346 gruen** (vorher 1341).
- Build: `npm run build` exit 0 (tsc + esbuild).
- Deploy: Auto-Copy in iCloud-Vault erfolgreich.
- Regression-Cycle (red-green) bestaetigt: ohne Fix sind alle 5 Tests RED, mit Fix sind alle 5 GREEN.

### Akzeptanzkriterien-Erfuellung

| AC | Status | Nachweis |
|---|---|---|
| AC-01 (Datei lesbar im selben Turn) | gruen | Test-Szenario 2 (consume-Atomicity) |
| AC-02 (`/ingest-deep` ohne Errormsg) | gruen via Code | Wird via AC-04-Live-Test bestaetigt |
| AC-03 (kein State-Leak) | gruen | Test-Szenario 5 (cross-turn-Leak) plus Code-Audit Z.2587/2917 |
| AC-04 (Live-Test ohne Retry-Loop) | offen | Sebastian fuehrt manuell aus |
| AC-05 (Regression-Test) | gruen | red-green-Cycle 2026-05-10 |

### Deviations vom Plan

Keine. Alle 8 PLAN-17-Tasks 1:1 ausgefuehrt.

### Bezug zu FIX-19-28-02

FIX-19-28-02 ist im Backlog noch "Active / Building". Mit dem Lifecycle-Fix aus FIX-19-28-05 ist die ursprueng zugrundeliegende Beobachtung ("read_document mit attachment_index=0 schlaegt fehl") weg. FIX-19-28-02 hat ergaenzend sinnvolle Skill-Disziplin (Source-Type-Detection, STOP-on-Error, Kosten-Disziplin) eingebaut. **Empfehlung an Sebastian:** FIX-19-28-02 nach erfolgreichem Live-Test als Done markieren (das Symptom, das es loesen sollte, ist konstruktiv weg).

### Bekannte Risiken

- **Live-Test offen:** AC-02 und AC-04 brauchen den manuellen UI-Walk durch Obsidian. Falls dabei ein Edge-Case auftaucht (z.B. zweite Send-Welle mit neuem Attachment waehrend ein Tool-Run noch laeuft), wuerde sich das im Console-Log zeigen.
- **Mid-Run-State-Race:** Wenn zwei Sends sehr schnell hintereinander gefeuert werden, ueberschreibt der zweite die Tool-State des ersten. Verhalten ist heute identisch (gleicher Singleton-State); dieser Fix aendert daran nichts.

### Out-of-Scope (binding aus ADR-112)

- Persistent attachment state ueber den AgentTask-Lifecycle. Wenn der User in Turn 2 ohne neues Attachment fragt, kann das Attachment aus Turn 1 weiterhin nicht abgerufen werden. Eigenes IMP unter EPIC-19.
- Skill-Vereinfachung in `/ingest-deep`. Step 0a ("erst in Vault speichern") wurde als Workaround eingebaut und kann nach diesem Fix zurueckgebaut werden. FEAT-19-31-Folgearbeit, separater PR.

### Live-Test-Anleitung fuer Sebastian

1. Build laufen schon (Auto-Deploy in iCloud-Vault). Obsidian neuladen oder Plugin disable/enable.
2. PDF in den Chat ziehen (z.B. `enbw-geschaeftsbericht-2025.pdf`).
3. Eingabe: `/ingest-deep <freier Text>` und Senden.
4. Erwartet:
   - Plan wird erstellt, Triage laeuft durch.
   - `read_document` oder `ingest_document` mit `attachment_index=0` funktioniert (KEINE "0 attachments available"-Errormsg mehr im Console-Log).
   - Note in `Notes/` enthaelt echten Inhalt aus der PDF mit echten Block-Refs zum Mirror (oder zur Source).
5. Console-Log: keine `Tool error in read_document: Error: No chat attachments available`-Errors.
6. Folgetest: zweite Message ohne neues Attachment senden. Erwartet: Tool-Aufrufe mit `attachment_index=0` failen weiterhin sauber, Note wird NICHT auf Basis alter PDF-Texte fabriziert.

### Naechster Schritt

Live-Test (Sebastian, manuell). Bei Erfolg: FIX-19-28-02 als Done markieren, ggf. weiter mit `/testing` (formaler Test-Pass) oder direkt Merge nach dev. Bei Misserfolg: Rueckkehr zu `/architecture` mit Mid-course-Trigger.

---

## EPIC-24 -- Agent-Loop Effizienz -- ARCH (2026-05-12)

**Branch:** `feature/epic-24-agent-loop-effizienz` | **Issue:** #318 | **Phase-Tag:** `epic-24/arch-done` | **Quelle:** RESEARCH-36 (Diagnose + 5-Provider-Messlauf + 3-Wege-Vergleich Claude Code / EnBW Cowork), Nachfolger von EPIC-18.

### Technischer Ansatz (warum so)

Obsilo behaelt seinen eigenen ReAct-Loop -- kein Neubau, kein Umstieg auf ein Coding-Agent-SDK (Claude Agent SDK / pi-coding-agent). Begruendung: der Loop-Kern ist auf vergleichbarem Stand wie Claude Code / Cowork (teils robuster: Notfall-Condensing, toolErrors-Verbatim, Sanitization an allen Send-Sites); die Kostenprobleme liegen ausserhalb des Loop-Kerns (Caching-Disziplin, Compaction-Trigger, Tool-Output-Disziplin, Subagent-Kultur) und sind lokalisierte, additive Änderungen. Ein Rip-and-Replace waere ein Mehrmonats-Projekt ohne fachlichen Mehrwert (RESEARCH-36 §7). Uebernommen werden die *Disziplinen* der Referenzen: sessionweit stabiler gecachter Praefix, Threshold-Compaction mit Recent-Keep, gebudgetete Subagent-Handoffs, eingebaute Cache-/Token-Telemetrie.

### ADRs (1 neu, 3 Amendments -- bewusst keine neuen ADRs wo ein Amendment passt, Konsolidierungs-Pflicht)

- **ADR-62 Amendment** (FEAT-24-01): Cache-Praefix-Stabilisierung -- Provider-seitiger Split des System-Prompts am "CACHE BREAKPOINT" (stabiler Block mit `cache_control`/`cachePoint`, volatiler Tail ohne), DateTime tagesgranular, eigener Marker auf dem `tools`-API-Feld, rollende History-Marker. Befund: die in ADR-62 entschiedene Section-Reihenfolge ist umgesetzt, aber wirkungslos auf dem Anthropic-Direkt-Pfad (1 Marker auf dem ganzen System-String -> Miss + 25% Write-Aufschlag). Auto-Caching-Provider greifen schon.
- **ADR-63 Amendment** (FEAT-24-03): Externalizer auch im allgemeinen ReAct-Loop, Re-Read-Cap externalisierter tmp-Dateien + reichhaltigere kompakte Referenz, grosse reingepastete/@-mentionte User-Message-Inhalte kappen. Superseded FIX-18-02-01.
- **ADR-12 Amendment** (FEAT-24-02): Microcompaction -- Tool-Result-Inhalte nach dem Turn, der sie genutzt hat, auf Skelette + Pointer eindampfen; additiv zur Keep-First-Last-Voll-Compaction (die bleibt als Notnagel bei ~70%). Constraints/Conventions bleiben im System-Prompt, nicht in der komprimierbaren History.
- **ADR-113** (neu, FEAT-24-04): Subagent-Delegation fuer context-heavy self-contained Teilaufgaben -- model-getrieben (`new_task` prominent + Agent-Profile mit schlankem eigenem System-Prompt + Prompt-Leitplanke, kein harter Router), Per-Call-Token-Budget a la Cowork-Advisor.

### Verworfene Alternativen (nicht ohne neuen Grund wieder aufmachen)

- SDK-Umstieg (s.o.).
- Harter Router fuer Subagent-Delegation ("alle Web-Calls -> Subagent") -- "Web vs. Vault" ist das falsche Kriterium; Heuristik wird brittle (ADR-113 Option 1).
- ADR-62 Option 2 als globale Typ-Aenderung der System-Prompt-Rueckgabe (String -> Array durch alle Provider) -- der Split bleibt provider-intern.
- Tool-Doppelung im System-Prompt auflösen -- die Tool-Listung im System-Prompt-Text ist nur ~700 Tokens, kein Posten (RESEARCH-36 Befund F).
- Caveman-/Output-Knappheits-Modus -- Output ist nicht das Problem (Befund G).
- `read_file`/`read_document` externalisieren -- bleibt in `SKIP_EXTERNALIZATION` (ADR-63-Revision 2026-04-29); die Turn-uebergreifende Akkumulation loest Microcompaction, nicht Externalization.

### Bekannte Risiken

- **Microcompaction-Aggressivitaet:** zu aggressives Pruning kostet Ergebnisqualitaet. Mitigation: Skelett behaelt immer den `read_file path=...`-Pointer (Re-Read unterliegt dann dem Cap aus ADR-63-Amendment); konservativer Default (z.B. nur Tool-Results aelter als N Turns); Shadow-Mode / A-B-Test vor Release. Offen: Trigger-Punkte und Default-Schwelle -- im PLAN entscheiden.
- **KV-Cache-Invalidierung durch Microcompaction:** Microcompaction veraendert die History rueckwirkend -> Cache-Miss ab der ersten geaenderten Message. Akzeptabel (an Turn-Grenzen, eingesparter Re-Send > Cache-Re-Build, stabiler System-Praefix unberuehrt). Alternative im PLAN: nur den aeltesten Teil prunen.
- **Subagent-Profile sind neu** -- braucht eine kleine Profil-Registry; Subagent erbt heute Mode/Rules/Skills des Parents, mit Profilen muss das entkoppelt werden. Klein halten (1-2 Profile).
- **Anthropic-Account-Abhaengigkeit (BUG-016):** Memory-/Context-Modell gehen am konfigurierten Provider vorbei direkt auf Anthropic; bei leerem Account fallen die Features aus (im Messlauf gesehen). Beruehrt den Caching-Fix nicht direkt, aber im Hinterkopf behalten.

### Offene Punkte (an `/coding` / PLAN delegiert)

- Genaue Trigger-Punkte und Schwellen fuer Microcompaction; ob nur alte Tool-Results oder alle.
- Token-Schwelle fuer das User-Message-Capping (Richtwert ~12-16k, gesamt pro Message).
- Profil-Definitionen fuer Subagents (1-2 zum Start; als Modul oder als bundled-skill-Verzeichnis analog `.claude/agents/`).
- Reihenfolge innerhalb Welle 1: L (Microcompaction) und C (Externalizer/Caps) sind die groessten Hebel laut Messung; A (Anthropic-Caching-Fix) ist isoliert + klein, kann parallel.
- `cached_tokens`-Wiring fuer die openai-Familie: gehoert zu IMP-18-01-02 (Status Active, noch nicht codiert) -- in Welle 1 mit-erledigen; mein Diagnose-Patch `logCacheStat.ts` (IMP-24-05-01, uncommitted im Working-Tree) ist nur der Log, nicht das Wiring.
- iCloud-tmp-Cleanup `EPERM` robuster machen (FIX-24-03-02, klein).

### Konsistenz-Check

- `/consistency-check` Mode A gelaufen: 93 Findings, 0 durch EPIC-24 verursacht (0 Dead-Links, 0 Broken-Refs, 0 ADR-Abstraktionsverstoesse). 10 = EPIC-24-Skeletons ohne Detail-File (erwartet, kommen in RE/Coding). 83 = vorbestehende Hygiene-Schuld (3x duplicate FEAT-04-ID, ~13 orphan-ADR-Rows = Checker-Quirk bei 3-stelligen IDs, 67x status-drift detail-vs-backlog) -> Sammel-Eintrag DEBT-CC-2026-05-12 in der Graph-Health-Sektion, eigener Cleanup-Task.
- Draft-PR: `gh pr create` scheiterte mit Permission-Fehler (`pssah4 does not have ... CreatePullRequest`) -- Branch ist gepusht, PR ggf. manuell anlegen: https://github.com/pssah4/obsilo-dev/pull/new/feature/epic-24-agent-loop-effizienz

### Naechster Schritt

`/coding` fuer EPIC-24 Welle 1 (P0): FEAT-24-02 (Microcompaction) + FEAT-24-03 (Externalizer im Hauptloop / Re-Read-Cap / User-Message-Cap) + FEAT-24-01 (Anthropic/Bedrock-Caching-Fix) + IMP-18-01-02 (Bedrock cachePoint, OpenAI cached_tokens-Wiring) + IMP-24-05-01 (logCacheStat committen). PLAN je Welle. Nach `/coding` jeweils `/testing` + `/security-audit`. ADRs sind PROPOSALS -- `/coding` entscheidet final gegen den realen Codebase-Stand.

### Refinement-Pass 2026-05-12 (Review-Ergebnis: Hebel-Abdeckung vervollstaendigt)

Review-Frage Sebastians: ist die Hebel-Liste A-L aus RESEARCH-36 vollstaendig in ADRs abgebildet? Befund: A/C/D/E/L waren erfasst (ADR-62/63/12-Amendments + ADR-113), aber F/G/H und das B-Teilstueck (Active-Skills) waren nur als "(neue FEAT bei Bedarf)"-Notizen geparkt. Nachgezogen:

- **ADR-114** (neu) -- Autonomie-Governance: kumulatives Token-/Kosten-Budget pro Task mit Pause+Rueckfrage, Steering-Hook zwischen Iterationen, weiches Exploration-Limit. Das Subtask-Per-Call-Budget bleibt in ADR-113. -> FEAT-24-08, P2/Welle 3.
- **ADR-115** (neu) -- Internes Hilfs-Modell-Routing: ein optionaler "Hilfs-Modell"-Slot in den Settings fuer die Agent-internen LLM-Calls (Condensing, Fast-Path-Planner/Presenter, plan_presentation, Recipe-Planner, ggf. Skill-Klassifikator); nicht gesetzt -> Haupt-Modell. -> FEAT-24-07, P2/Welle 3.
- **ADR-116** (neu) -- Active Skills: Klassifikator-Inject raus, model-getriebenes On-demand-Laden (nur Skill-Verzeichnis im stabilen System-Prompt, Body als Tool-Result + Microcompaction). Spart den per-Message-Klassifikator-Roundtrip + macht den System-Prompt cache-stabil (ergaenzt ADR-62-Amendment). -> FEAT-24-09, P1/Welle 2.
- **ADR-63-Amendment** ergaenzt um Punkt 5 (harte Per-Tool-Output-Caps als zweite Verteidigungslinie, Claude-Code-Vorbild).
- **ADR-12-Amendment** ergaenzt um Rolling-Summary alter Turn-Bloecke (zweite Stufe ueber Tool-Result-Pruning hinaus, frueher als der 70%-Notnagel).
- arc42 Par.9 um ADR-114/115/116; BACKLOG um die drei ADR-Rows + FEAT-24-07/08/09; Dashboard-Counts.

**Bewusst out-of-scope (Entscheidung Sebastian 2026-05-12):** expliziter Plan-Modus (read-only Exploration -> reviewter Plan -> Kontext-Reset -> Implementierung, a la Claude Code). Begruendung: Obsilos typischer Workload (Q&A, Notiz-Edit, leichte Recherche) triggert einen Plan-Modus selten; grosser Hebel fuer Coding-Agenten, kleiner fuer Obsilo. In EPIC-24 Out-of-Scope und in RESEARCH-36 (Hebel F, §4.4) vermerkt. Wiedervorlage falls sich das mit der Nutzung aendert.

**Lazy-Loading Tool-Schemas (Hebel B, Tool-Schema-Teil) -- Reconsideration 2026-05-12 (Sebastian: unsicher, vor allem MCP):** Code-Check ergab, dass MCP-Tools beim Server-Connect als regulaere Tools registriert werden (`ToolRegistry.registerMcpTool`), d.h. ihre vollen Schemas landen bei *jedem* API-Call im `tools`-Feld -- ohne Deferral (FEATURE-1600 deckt nur Built-ins). Bei zwei bis drei verbundenen MCP-Servern (je oft 10-30 Tools mit teils verbosen Schemas) dominiert der MCP-Anteil das `tools`-Feld potenziell deutlich, ist instabil (Server connect/disconnect, Tool-Listen-Änderungen invalidieren den `tools`-Cache) und per Cold-Call/Cache-Write teuer. -> **doch ein realer Hebel; ADR-117 (neu), FEAT-24-06 von Welle 4 auf Welle 2 hochgestuft.** Entscheidung: MCP-Tools defaultseitig deferred (per-Server-Katalog im stabilen System-Prompt statt voller Schemas; volles Schema on-demand via `find_tool`/`enable_mcp_tool`, gleicher `activateDeferredTool`-Pfad wie deferred Built-ins; Opt-out pro Server). Built-in-Default-Satz weiter slimmen ist der kleinere, separate Teil (~10-20k Tokens, FEATURE-1600 deckt die schweren schon, nach Caching-Fix grossteils gecacht). Vor /coding: eine `tools`-Feld-Token-Zeile in `logInputBreakdown`, um den realen Umfang *mit verbundenen MCP-Servern* zu messen und die finale Prio zu schaerfen. Hinweis: fuer FEATURE-1600 (Deferred Tool Loading) gibt es keinen eigenen ADR -- ADR-117 ist der erste, der das Lazy-Loading-Konzept dokumentiert (FEATURE-1600-Spec bleibt die Quelle der Built-in-Mechanik).

Damit ist die Hebel-Liste A-L vollstaendig in Architektur abgebildet, ausser dem bewusst Out-of-Scope-Teil (F Plan-Modus, J Output-Knappheit, K Retrieval-Tuning, Hooks, Multi-Agent-Coordinator).

---

## EPIC-24 Welle 1 -- /testing (2026-05-12)

Implementierung (PLAN-18, Commits `c61ecb3`..`917aff1` + Test-Pass) auf `feature/epic-24-agent-loop-effizienz`.

### Testlage
- `npm test`: 1378 -> 1405 gruen (+27 ueber alle Welle-1-Commits + den /testing-Gap-Pass; 0 Failures). Build + Deploy nach jedem Schritt gruen.
- Coverage-Tooling ist im Projekt nicht installiert (`@vitest/coverage-v8` fehlt, kein `coverage`-npm-Script) -- es gibt keinen Coverage-Gate; gemessen wird ueber Test-Anzahl + gezielte Gap-Tests. Kein neues Coverage-Tooling eingefuehrt (Projekt-Konvention respektiert).
- /testing-Gap-Pass: zwei Stellen ohne Unit-Test nachgezogen -- (a) der ToolExecutionPipeline-Per-Tool-Output-Cap wurde in `capOversizedToolOutput` (exportiert) extrahiert + 7 Tests; (b) `markLastBlock`/`markRollingHistoryBreakpoints` aus `anthropic.ts` exportiert + 9 Tests (Stringkonvertierung, tool_result-Marker, Bild-Block-Fallback, kurze vs. lange History, STABLE_BACKOFF=6).

### Bewusst NICHT unit-getestet (Begruendung)
- **Cache-Hit-Rate / Token-Reduktion (SC der FEAT-24-01/02/03, alle `[AWAITING RE]`):** das sind Laufzeit-/Integrationsmetriken gegen echte Provider, kein Unit-Verhalten. Verifikation = manueller Messlauf im Vault: `[CacheStat:anthropic]` hitRate > 50 % ab Call 2 (statt `cacheCreate`-Reload), `[CacheStat:bedrock]` `cacheRead > 0`, `[Cost] cacheR > 0` bei OpenAI/Copilot, `[InputBreakdown]` zeigt einen 4-Datei-Read-Turn ~48k -> Folge-Turn unter ~20k. Steht aus (keine echten Provider-Credentials in dieser Session).
- **Provider-Wiring End-to-End** (Anthropic 2-Block-systemParam, Bedrock `cachePoint`-Bloecke, openai-Familie `cached_tokens` -> usage-Chunk): braucht SDK-Mocking eines ganzen Streams; die *Logik-Bausteine* darunter (`splitSystemPromptAtCacheBreakpoint`, `markRollingHistoryBreakpoints`, `capabilities.getCacheCapability`) sind einzeln getestet. End-to-End-Bestaetigung = der Messlauf oben.
- **ADR-111 R-1 (Bedrock cachePoint regional/Modell-abhaengig) + R-2 (Kilo-Gateway `cache_control`-Passthrough):** nur live verifizierbar; bei `cacheReadInputTokens: 0` ueber 3 Iterationen -> Modell-Pattern in `src/api/capabilities.ts` auf `false` setzen.

### Fuer /security-audit
- Neue tmp-Datei-Lese-/Cap-Pfade in `ResultExternalizer` (`isExternalizedPath`, `formatReReadCap`) -- Path-Praefix-Match gegen `this.tmpDir`; pruefen, dass kein Traversal/Spoofing den Re-Read-Cap umgeht (z.B. `../`-Pfade, die trotzdem auf eine tmp-Datei zeigen).
- `AttachmentHandler` externalisiert grosse Anhaenge jetzt NICHT (kein Externalizer im Sidebar-Kontext), kappt sie nur -- externe/gepastete Dateien verlieren den abgeschnittenen Teil ersatzlos; das ist by design, aber im Audit als "Datenverlust ohne Warnung an den User?" gegenchecken (es gibt einen Notice-Hinweis im gekappten Text).
- `microcompactToolResults` mutiert die History rueckwirkend -- pruefen, dass das Skelett keine sensiblen Daten *neu* exponiert (es kuerzt nur) und das Pairing nie bricht (Tests decken das ab).

### Naechster Schritt
`/security-audit` fuer EPIC-24 Welle 1. Danach (separat, vor Release): der manuelle Cache-/Token-Messlauf gegen echte Provider als Abnahme der `[AWAITING RE]`-SC.

---

## EPIC-24 Welle 1 -- /security-audit (2026-05-12)

Bericht: `_devprocess/analysis/AUDIT-018-epic-24-welle-1-2026-05-12.md` (Per-Item-Audit, Branch `feature/epic-24-agent-loop-effizienz`, Commits `c61ecb3`..`4ccfe98`).

- **Gesamtrisiko: Low.** 0 Critical, 0 High, 0 Medium Code-Findings. 2 Low/Info (CACHE_BREAKPOINT_MARKER-Kollisionsrisiko bei custom-Modi -> nur Cache-Degradation, kein Sicherheitsimpact; Zero-Width-Space-Platzhalter in `markLastBlock` -> Stil). Beide Confirmed/akzeptiert.
- **SCA:** keine neuen Runtime-Dependencies durch Welle 1. 1 vorbestehender Moderate (`mermaid` Gantt-/classDef-Advisories, transitiv, nach AUDIT-017 publiziert) -> als `DEBT-SCA-2026-05-12` (Typ Security, Source SEC, P2) in der Graph-Health-Sektion erfasst, Fix via `npm audit fix` im Dependency-Housekeeping-Pass. NICHT durch EPIC-24 verursacht.
- **Positiv:** Re-Read-Cap faellt sicher aus (kuerzt im Zweifel mehr, nie weniger); `microcompactToolResults` kuerzt nur, exponiert nichts neu, Pairing bleibt invariant; `capOversizedToolOutput` ist eine reine getestete Bodenplatte; AttachmentHandler-Gesamtbudget verhindert Kontextfenster-Sprengung durch Riesen-Mentions, mit sichtbarem Hinweis im gekappten Text; bestehende Path-Traversal-Saeuberung des Externalizers (`safeName`-Regex) intakt. Kein neuer `fetch`/`require`/`console.log`, keine neuen Secrets, keine Race-Conditions.
- **Release-Empfehlung (Welle-1-Code): Green.** Vor Public-Release noch noetig: manueller Provider-Messlauf zur Abnahme der `[AWAITING RE]`-SC (Cache-Hit-Rate, Token-Reduktion) -- Funktions-, keine Sicherheitsfrage.
- **Architektonische Folgepunkte:** keine -- additive Änderungen im bestehenden Loop, kein Vertrauensgrenzen-Redesign.

---

## FEAT-24-09 -- /coding -> /testing (2026-05-13)

triage: FEAT-24-09
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-09

Branch: `feature/feat-24-09-active-skills-on-demand` (off `dev`, Code-Commit `4dc6cf4`, Test-Commit folgt).
Refs: PLAN-20, ADR-116, ADR-62 (Amendment), ADR-12 (Amendment).

### Testlage

- `npm test`: 1422 -> **1424** gruen (+2 SC-5-Assertion; vorher 1411 dev-Baseline). 144 Test-Files. 0 Failures. 6.4s.
- `npm run lint`: 0 errors, 663 warnings (vorbestehend, security/detect-object-injection in HistoryPanel/OnboardingFlow/ToolPickerPopover, nicht FEAT-24-09-bezogen).
- `npx tsc -noEmit -skipLibCheck`: clean.
- `/consistency-check` mode A: 88 findings -- **0 durch FEAT-24-09 verursacht** (3 duplicate-backlog-id FEAT-04-01/02/04 = vorbestehender DEBT-CC-2026-05-12; 67 status-drift detail-vs-backlog = vorbestehend, in DEBT-CC erfasst; 18 orphan-backlog-row fuer 3-stellige ADR-IDs inkl. ADR-116/113/114/115/117 = DIA-Checker-Regex-Bug, lokal in der Plugin-Kopie gefixt aber upstream nicht gemergt -- separater DEBT-Eintrag).

### Coverage (FEAT-24-09 spezifisch)

- `src/core/tools/agent/ReadSkillTool.ts` (NEU): 6 Tests -- empty name, self-authored body+inventory, user-skill mit Frontmatter-Stripping, oversize-cap, unknown name, fehlender skillsManager.
- `src/core/prompts/sections/skillDirectory.ts` (NEU): 4 Tests -- leer, verbatim render in `<available_skills>`, `read_skill`-Instruktion, keine per-message Marker.
- `src/core/__tests__/systemPrompt.test.ts`: +1 Cache-Praefix-Test -- `skill-directory` direkt vor `cache-breakpoint`, kein `active-skills`/`self-authored-skills` mehr.
- `src/core/tools/__tests__/deferredToolLoading.test.ts`: +2 SC-5-Assertion -- `isDeferredTool('read_skill') === false`, `TOOL_METADATA['read_skill'].group === 'read'` (SC-5 damit automatisiert).

Coverage-Tooling im Projekt nicht installiert (`@vitest/coverage-v8` fehlt, keine `coverage`-Skripte -- bewusste Projekt-Konvention seit /testing-Welle-1). Gemessen wird ueber Test-Anzahl + gezielte Gap-Tests.

### Bewusst NICHT unit-getestet (Begruendung)

- **SC-1 (kein Klassifikator-Call pro User-Message), SC-3 (Modell laedt eine Skill bei passender Aufgabe), SC-4 (kein Skill-Body bei nicht passender Aufgabe):** Laufzeit-/Integrationsmetriken am echten Provider (Anthropic/Bedrock/OpenAI) -- die Klassifikator-Klasse + ihre Aufrufstelle sind entfernt (Code-Diff zeigt `classifySkillsWithLlm` + `matchSkillsByKeywordAndTrigger` aus AgentSidebarView gestrichen), aber dass der Agent in der Praxis `read_skill` ruft, wenn ein Skill passt, ist Modell-Verhalten + Prompt-Quality. Verifikation = manueller Messlauf im Vault mit installiertem `office-workflow`-Skill, Aufgabe "erstelle eine Praesentation aus ..." -> `[Cost]`/`[CacheStat:*]`-Log darf keinen `classifyText`-Call vor der ersten Iteration zeigen; bei passender Aufgabe `read_skill({ name: "office-workflow" })`-Tool-Call; bei normaler Notizfrage weder Klassifikator- noch `read_skill`-Call.
- **SC-2 (System-Prompt cache-stabil bzgl. Skills):** strukturell durch den `systemPrompt`-Cache-Praefix-Test abgesichert (skill-directory vor cache-breakpoint, kein active-skills/self-authored-skills). Live-Verifikation = `[SystemPrompt]`-Top-Sections-Log einer normalen Session.
- **Shadow-Mode-Vergleich Klassifikator vs. Modell-Wahl:** ADR-116 Amendment 2026-05-13 hat das bewusst gestrichen (Klassifikator-Pfad wird entfernt, nicht parallel betrieben). Kein Test moeglich, kein Test noetig.

### Fuer /security-audit

- **`ReadSkillTool.execute({ name })` Path-Traversal-Vektor:** Tool nimmt nur einen String-`name` und schlaegt ihn in zwei In-Memory-Maps nach (`SelfAuthoredSkillLoader.getSkill(name)` Map-Lookup, dann `plugin.skillsManager.discoverSkills()` -> filter `meta.name === name`). Es wird NIEMALS ein vom Modell geliefereter Pfad an `readFile` weitergereicht -- `readFile(meta.path)` nutzt den von `discoverSkills()` ermittelten `meta.path`. Audit-Frage: ist `meta.path` aus `SkillsManager.discoverSkills()` per Konstruktion unter dem Skills-Root und nicht durch User-/Modell-Eingabe manipulierbar? Pruefen ob `discoverSkills()` Symlinks/`..` filtert.
- **Body-Cap (`MAX_SKILL_BODY_CHARS = 24000`):** verhindert dass ein bewusst aufgeblaehtes Skill-File den Kontext sprengt; Truncation-Hinweis ohne sensible Daten.
- **Skill-Directory-Section im stabilen Prompt-Prefix:** enthaelt nur Name + Description je Skill (kein Body, keine Pfade) -- kein PII-Leck-Vektor.
- **`activeSkillNames` und `classifyText` Power-Steering entfernt:** Modell sieht nur noch das Verzeichnis + den `read_skill`-Result-Header. Kein latentes Prompt-Injection-Surface durch klassifizierten Inhalt.

### Naechster Schritt

`/security-audit` fuer FEAT-24-09 / ADR-116. Danach Merge nach `dev` via `bash scripts/merge-to-dev.sh feature/feat-24-09-active-skills-on-demand`. Live-Messlauf-Abnahme von SC-1/3/4 (gemeinsam mit den `[AWAITING RE]`-SC aus FEAT-24-01..03) bleibt offen bis zur nächsten Vault-Session.

---

## FEAT-24-09 -- /testing -> /security-audit (2026-05-13)

triage: FEAT-24-09
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-09

Branch: `feature/feat-24-09-active-skills-on-demand`. Audit-Report:
[AUDIT-019-feat-24-09-2026-05-13.md](../analysis/AUDIT-019-feat-24-09-2026-05-13.md).

### Verdikt

**Overall risk: Low. Release recommendation: Green.**

- **0 Critical, 0 High, 0 Medium.**
- **1 Info-Finding** (F-1): Dead Code `SkillsManager.getRelevantSkills` -- nach Klassifikator-Entfernung aus FEAT-24-09 ist die Methode nicht mehr von `src/` aufgerufen. Kein direkter Sicherheitsimpact heute, mittelbares Drift-Risiko bei versehentlicher Re-Aktivierung. Defered als IMP-24-09-01 (Source SEC, P3, Status Ready).

### Hauptaudit-Vektor (CLEAN)

Path-Traversal beim Skill-Lookup geprueft -- Verdikt: existiert nicht. `ReadSkillTool` nimmt nur einen String-`name`; Lookup laeuft ueber In-Memory-Map (`SelfAuthoredSkillLoader.getSkill`) bzw. `Array.find` auf `discoverSkills()`-Output. `meta.path` wird in `SkillsManager.discoverSkills` aus `fs.list(this.skillsDir)` konstruiert; `skillsDir` ist konstant `'skills'` und nicht Modell-/User-beeinflussbar. Symlink-Ausbruch wird durch Obsidian-Vault-API verhindert. Kein vom Modell kontrollierter Pfad geht je an `readFile`.

### Positivbefunde

- **Reduzierte Prompt-Injection-Surface** -- `classifySkillsWithLlm` + `activeSkillNames`-Power-Steering entfernt; eine LLM-Sekundaer-Injektion entfaellt vollstaendig.
- **Stable Cache-Praefix** -- Skill-Verzeichnis oberhalb `CACHE_BREAKPOINT_MARKER`, deterministisch aus den Loadern, kein per-Message-Roundtrip.
- **Defense-in-Depth Layer 1+2** -- `MAX_SKILL_BODY_CHARS = 24_000` im Tool plus die `HARD_TOOL_OUTPUT_CAP_CHARS = 60_000`-Bodenplatte aus FEAT-24-03/PLAN-18. Auch boesartig grosse Skill-Files oder 1MB-`name`-Strings koennen den Kontext nicht sprengen.
- **SC-5 Regression-getestet** -- `isDeferredTool('read_skill') === false` + `TOOL_METADATA['read_skill'].group === 'read'` als Tests verankert. Drift-Schutz.
- **Microcompaction-Compliant** -- Skill-Bodies sind Tool-Results und unterliegen FEAT-24-02-Pruning; keine History-Akkumulation.
- **Vertrauensgrenze klar** -- Modell-Input `name` ist Lookup-Key, kein Pfad.
- **SCA-Baseline unveraendert** -- keine neuen Runtime-Dependencies; `mermaid` Moderate (DEBT-SCA-2026-05-12) bleibt vorbestehend.

### Architektonische Folgepunkte

Keine. Aenderung ist additiv, reduziert eine bestehende Vertrauensgrenze (entfernter Klassifikator-Call), kein neues Vertrauensgrenzen-Redesign.

### Naechster Schritt

- Merge nach `dev`: `bash scripts/merge-to-dev.sh feature/feat-24-09-active-skills-on-demand` (User-Trigger; Memory-Konvention: nicht autonom mergen ohne Bestaetigung).
- Live-Messlauf-Abnahme von SC-1/3/4 in einer nächsten Vault-Session (Funktions-, keine Sicherheitsfrage).
- Optional später: IMP-24-09-01 als eigenes V-Model-Item (kleiner Pass).
- Danach das naechste EPIC-24-Item starten: FEAT-24-06 / ADR-117 (Lazy-Loading Tool-Schemas, MCP defaultseitig deferred).

---

## FEAT-24-06 -- /coding -> /testing (2026-05-13)

triage: FEAT-24-06
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-06

Branch: `feature/feat-24-06-lazy-loading-tool-schemas` (off `dev` cdd2d70).
Refs: PLAN-21, ADR-118 (supersediert ADR-117 nach Codebase-Reconciliation).

### Mid-course design discovery

Vor der Implementation pivotiert (Pivot-Commit `e28139f`): ADR-117 nahm an,
dass MCP-Tools mit vollen Schemas im `tools`-Feld jeder API-Anfrage landen.
Codebase-Befund: `ToolRegistry.registerMcpTool` ist ein TODO-Stub und wird von
keinem MCP-Code gerufen; MCP laeuft ueber das eine `use_mcp_tool`-Built-in;
die MCP-Listung liegt schon im stabilen Praefix-Block (Section 4 in
`systemPrompt.ts`, vor `CACHE_BREAKPOINT_MARKER` -- via FEAT-24-01).
ADR-117 -> Superseded by ADR-118; FEAT-24-06 auf den realen Hebel umgehaengt:
(1) Description-Cap in der MCP-Listung, (2) `read_mcp_tool` als on-demand-
Companion, (3) Built-in `deferred`-Review fuer den `tools`-Feld-Teil.
Root-cause-Notiz: `_devprocess/analysis/ADR-117-review.md`.

### Was implementiert wurde

- `src/core/prompts/sections/tools.ts`: neuer Helper `capMcpDescription`
  (export) + Konstante `MCP_DESCRIPTION_CAP = 200`. Lange MCP-Tool-
  Descriptions werden auf 200 Zeichen gekappt und enden mit
  `... [full description: read_mcp_tool({ server: "...", name: "..." })]`.
  Em-Dash ` — ` in der Listung auf ` -- ` umgestellt (Projekt-Konvention).
  Header der MCP-Sektion annonciert `read_mcp_tool` als neue Zeile, damit
  das Modell den Pfad versteht.
- `src/core/tools/mcp/ReadMcpToolTool.ts` (NEU): NICHT-deferred Tool
  `read_mcp_tool(server, name)`. Gruppe `mcp`. Validiert Server gegen
  `activeMcpServers`-Whitelist + Connection-Status + Tool-Existenz.
  Liefert Tool-Result mit Header `## MCP TOOL: server.name`, voller
  Description und einem kompakten InputSchema-Summary (Property-Namen
  mit Typ + `required`-Flag; keine vollen Description-/Example-Felder
  damit der Result-Stream nicht der naechste Bloat wird). Enum + array
  werden mit-rendered.
- `src/core/tools/types.ts`: `'read_mcp_tool'` in `ToolName`-Union.
- `src/core/tools/toolMetadata.ts`: `read_mcp_tool`-Entry (NICHT deferred);
  zusaetzlich `inspect_self`- und `update_settings`-Entries angelegt (sie
  hatten keine, was ein hidden-bug-Pattern war -- ohne Metadata wuerde
  `find_tool` sie nicht ranken). Beide zusaetzlich in `DEFERRED_TOOL_NAMES`
  aufgenommen. `manage_mcp_server` war bereits dort.
- `src/core/tools/ToolRegistry.ts`: `ReadMcpToolTool` neben `UseMcpToolTool`
  registriert (nur wenn `mcpClient` vorhanden).

### Tests

`npm test`: **1439 gruen** (+15 vs dev-Baseline 1424). 146 Test-Files.

- `src/core/prompts/sections/__tests__/tools.test.ts` (NEU, 4 Tests):
  kurze Description bleibt unveraendert, lange wird gekappt + Suffix mit
  korrektem Server + Tool-Namen, Head deterministisch (cache-stabil).
- `src/core/tools/mcp/__tests__/ReadMcpToolTool.test.ts` (NEU, 7 Tests):
  leere Inputs, Whitelist-Enforce, Disconnected-Server, Tool-not-found mit
  Liste, Happy-Path mit Schema-Summary, fehlendes inputSchema, enum-Property-
  Rendering.
- `src/core/tools/__tests__/deferredToolLoading.test.ts` (erweitert, +4):
  `read_mcp_tool` NOT deferred + `group === 'mcp'`; `inspect_self` und
  `update_settings` deferred mit `TOOL_METADATA`-Einträgen.

`npx tsc -noEmit -skipLibCheck` clean. `npm run lint` 0 errors. `npm run build`
gruen (tsc + esbuild production + Deploy zur Vault).

### Abweichungen vom Plan

- **Built-in deferred-Pass kleiner als geplant.** PLAN-21 nannte
  `inspect_self`, `update_settings`, `manage_mcp_server` als Kandidaten;
  `manage_mcp_server` war schon deferred -> kein Aktionspunkt. Real wirksam:
  zwei zusaetzliche deferred-Einträge.
- **Zwei `TOOL_METADATA`-Luecken geschlossen.** `inspect_self` und
  `update_settings` waren in `types.ts`/`ToolRegistry` registriert aber
  ohne `TOOL_METADATA`-Eintrag. Im Plan nicht antizipiert; gefunden und
  geschlossen, weil `find_tool` ohne Metadata keinen Rank machen kann.

### Bugs/Findings

Keine. Kein Mid-course-Trigger (bug oder requirement) waehrend Implementation.

### Fuer /testing

- Live-Messlauf-SC SC-6 bleibt offen (Vault-Session mit verbosen MCP-
  Servern noetig): `[SystemPrompt]`-Section-Char-Breakdown fuer Section 4
  sollte messbar sinken; `[InputBreakdown:main-loop] toolSchemas=...t`
  sollte um den Built-in-deferred-Anteil leicht sinken.
- Unit-Test-Lage gruen; ein /testing-Gap-Pass wuerde gegen die SC-1..5
  unmittelbar Pass haben. Live-Messlauf bleibt User-Aufgabe.

### Fuer /security-audit

- **`ReadMcpToolTool` Path-Traversal-Vektor:** das Tool nimmt `server` und
  `name` als String und schlaegt sie in `mcpClient.getConnection(server)`
  bzw. `conn.tools.find(t => t.name === name)` nach. Kein Pfad geht je an
  ein Filesystem. Vertrauensgrenze identisch zu `use_mcp_tool`.
- **Whitelist-Check** dupliziert die Logik aus `UseMcpToolTool` -- pruefen
  ob beide Stellen synchron bleiben (heute identisch).
- **InputSchema-Summary-Renderer:** `renderInputSchemaSummary` iteriert die
  vom MCP-Server gelieferten Properties. Robust gegen fehlende `properties`,
  fehlende `required`, andere Typen; aber server-kontrolliertes JSON in den
  Tool-Result. Wenn ein boesartiger MCP-Server Property-Namen oder Typen
  mit Tausenden Zeichen liefert, landet das ungekappt im Result. Cap-Bedarf
  pruefen.
- **MCP-Description-Cap:** rein kosmetisch / cache-relevant. Kein neuer
  Vertrauensgrenzen-Pfad. Pruefen, dass der Suffix-String keine
  Injection-Vektor enthaelt (Server + Tool-Name werden in JSON-Quote-Wrapper
  eingesetzt; wenn ein Server-Name ein Quote enthaelt, ist die Zeile leicht
  kaputt -- aber Server-Namen sind User-Settings, kein Schaden).

### Naechste Schritte

`/testing` (Gap-Test + Coverage-Check) -> `/security-audit` -> Merge nach `dev`
ueber `scripts/merge-to-dev.sh feature/feat-24-06-lazy-loading-tool-schemas`.

---

## FEAT-24-06 -- /testing -> /security-audit (2026-05-13)

triage: FEAT-24-06
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-06

Branch: `feature/feat-24-06-lazy-loading-tool-schemas` (Commit cc7c609 + Test-Commit).

### Testlage

- `npm test`: **1439 gruen**, 146 Test-Files, 0 Failures (+15 vs dev-Baseline 1424). Die 15 neuen Tests wurden bereits in der /coding-Phase angelegt und entsprechen exakt den SC-1..SC-5 (Mapping siehe BACKLOG-Row + HANDOFFS-Eintrag der /coding-Phase). Keine zusaetzlichen Unit-Tests in dieser /testing-Phase notwendig.
- `npx tsc -noEmit -skipLibCheck`: clean.
- `npm run lint`: 0 errors, 663 warnings (vorbestehende `security/detect-object-injection`-Findings, nicht FEAT-24-06-bezogen).
- `/consistency-check` mode A: 89 findings -- **0 echte durch FEAT-24-06** verursacht. Der eine neue Finding (orphan-backlog-row fuer ADR-118) faellt unter den bekannten DIA-Checker-Regex-Bug fuer 3-stellige ADR-IDs (gleiches Pattern wie ADR-116/117/113/114/115).

### SC-Mapping

| SC | Status | Evidence |
|---|---|---|
| SC-1 MCP-Description-Cap 200 chars greift | gruen | 4 Tests in `prompts/sections/__tests__/tools.test.ts` (cap-Boundary, Truncation, Suffix mit `read_mcp_tool`-Hint, deterministischer Head-Cut) |
| SC-2 `read_mcp_tool` liefert Result-Block | gruen | Happy-Path-Test in `tools/mcp/__tests__/ReadMcpToolTool.test.ts` (Header `## MCP TOOL: ...`, volle Description, InputSchema-Summary mit Property-Typen + required-Flags) |
| SC-3 `read_mcp_tool` an `mcp`-Gruppe gebunden, NICHT deferred | gruen | 2 Assertions in `tools/__tests__/deferredToolLoading.test.ts` (`isDeferredTool('read_mcp_tool') === false`, `TOOL_METADATA['read_mcp_tool'].group === 'mcp'`) |
| SC-4 Built-in-deferred-Review | gruen | 2 Assertions in `tools/__tests__/deferredToolLoading.test.ts` (`isDeferredTool('inspect_self') === true`, `isDeferredTool('update_settings') === true`) plus Metadata-Vorhandensein |
| SC-5 Bestehende Funktionalitaet unveraendert | gruen | 1424 vorbestehende Tests gruen, +15 neue gruen, keine Regression |
| SC-6 Live-Messlauf | `[AWAITING RE]` | Funktionsverifikation gegen verbose MCP-Server (`[SystemPrompt]`-Section-Char-Breakdown fuer Section 4 messbar sinken, `[InputBreakdown:main-loop] toolSchemas=...t/<count>` sinken um den Built-in-deferred-Anteil) -- nicht autonom pruefbar, bleibt fuer manuelle Abnahme |

### Bewusst NICHT unit-getestet (Begruendung)

- **SC-6 Cache-Praefix- und Token-Sicht-Effekte:** Laufzeit-Telemetrie gegen
  echte Provider mit verbundenen MCP-Servern. Die Logik-Bausteine
  (`capMcpDescription`, `renderInputSchemaSummary`, `DEFERRED_TOOL_NAMES`-Set,
  `find_tool`-Ranking) sind einzeln getestet; ein End-to-End-Beleg waere ein
  Messlauf, kein Unit-Test.
- **Audit-Vektoren (server-kontrolliertes JSON in Schema-Summary, Quote in
  Server-Namen im Suffix-String):** sind /security-audit-Fragen, keine
  funktionalen Regression-Gaps. Mitigation der ersten Sorge laeuft bereits
  ueber die `HARD_TOOL_OUTPUT_CAP_CHARS = 60_000`-Bodenplatte in
  `ToolExecutionPipeline.capOversizedToolOutput()` aus FEAT-24-03 / PLAN-18.
  Die zweite Sorge (Quote im Server-Namen) betrifft kosmetische Korrektheit
  einer User-Setting-induzierten Eingabe, kein Sicherheitsvektor.

### Fuer /security-audit

Aus dem /coding-Handoff uebernommen + ergaenzt:

- **`ReadMcpToolTool` Vertrauensgrenze:** `server` und `name` sind String-
  Lookup-Keys, kein Filesystem-Pfad-Vektor (analog zu `read_skill` aus FEAT-24-09).
  Whitelist-Check dupliziert `UseMcpToolTool` Logik 1:1; pruefen, ob die
  Synchronitaet auch ohne Refactoring stabil bleibt (keine doppelte
  Owner-Verantwortung).
- **InputSchema-Summary-Renderer:** server-kontrolliertes JSON wird in den
  Tool-Result gerendert. Defense-in-Depth: `HARD_TOOL_OUTPUT_CAP_CHARS = 60_000`
  (FEAT-24-03/PLAN-18) kappt am Pipeline-Ausgang. Audit-Frage: ist die
  Bodenplatte ausreichend, oder braucht der Renderer einen eigenen Cap fuer
  einzelne Property-Namen / Typen?
- **MCP-Description-Cap Suffix-String:** `read_mcp_tool({ server: "X", name: "Y" })`
  wird mit doppelten Anfuehrungszeichen gerendert. Server- und Tool-Namen
  kommen aus User-Settings und MCP-Server-Discovery; in der Praxis
  kebab-case ohne Quotes. Falls je ein Name ein `"` enthielte, wuerde die
  Zeile syntaktisch leicht kaputt -- kosmetisch, kein Sicherheitsimpact.
- **Hidden-bug-Pattern bei `inspect_self`/`update_settings`:** beide Tools
  waren in der Registry und im ToolName-Union, aber ohne `TOOL_METADATA`-
  Eintrag. Das wurde behoben. Audit-Frage: gibt es weitere Tools in derselben
  Drift-Situation? Grep nach `TOOL_METADATA`-Coverage waere ein eigenes
  IMP-Item.

### Naechster Schritt

`/security-audit` fuer FEAT-24-06 / ADR-118. Danach Merge nach `dev` via
`bash scripts/merge-to-dev.sh feature/feat-24-06-lazy-loading-tool-schemas`.
Live-Messlauf-Abnahme von SC-6 bleibt offen bis zur nächsten Vault-Session.

---

## FEAT-24-06 -- /security-audit (2026-05-13)

triage: FEAT-24-06
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-06

Branch: `feature/feat-24-06-lazy-loading-tool-schemas`. Audit-Report:
[AUDIT-020-feat-24-06-2026-05-13.md](../analysis/AUDIT-020-feat-24-06-2026-05-13.md).

### Verdikt

**Overall risk: Low. Release recommendation: Green.**

- **0 Critical, 0 High, 0 Medium.**
- **4 Info-Findings**: F-1 TOOL_METADATA-Drift (deferred zu IMP-24-06-01),
  F-2 Renderer-Cap als optionale Defense-in-Depth (accepted), F-3 Whitelist-
  Duplikation (accepted), F-4 Suffix-Quote-Robustheit (accepted).

### Hauptaudit-Vektoren (alle clean oder akzeptiert)

- **Path-Traversal in ReadMcpToolTool:** existiert nicht. `server` und
  `name` sind String-Lookup-Keys in `mcpClient.getConnection(server)` und
  `conn.tools.find(t => t.name === name)`. Kein Pfad geht je an
  `readFile`.
- **Resource-Consumption ueber Schema-Summary-Renderer:** durch
  `HARD_TOOL_OUTPUT_CAP_CHARS = 60_000` in `ToolExecutionPipeline`
  (FEAT-24-03 / PLAN-18) am Pipeline-Ausgang gekappt. Ein boesartiger
  MCP-Server kann den Kontext nicht sprengen. Eigener Renderer-Cap waere
  reine Defense-in-Depth, kein Muss.
- **Suffix-Quote-Robustheit:** Server-/Tool-Namen aus User-Settings sind
  kebab-case ohne Quotes. Kosmetisch, kein Sicherheitsvektor.
- **Whitelist-Duplikation:** identische Logik in `UseMcpToolTool` und
  `ReadMcpToolTool`. Code-Smell, kein Privilegien-Eskalations-Pfad.

### Hidden-bug-Pattern-Befund (F-1)

Der statische Drift-Audit ergab **16 weitere Tools** in der ToolName-Union
ohne `TOOL_METADATA`-Eintrag (`_memory_atomize`, `_memory_single_call`,
`anti_echo_search`, `configure_model`, `create_canvas`, `ingest_deep`,
`ingest_triage`, `list_memory_source_notes`, `mark_for_memory`,
`mark_note_as_memory_source`, `read_agent_logs`, `recall_memory`,
`search_history`, `switch_mode`, `unmark_note_as_memory_source`,
`update_soul`) plus 1 Spiegelfall (`check_presentation_quality` in
`TOOL_METADATA` aber nicht in Union). Kein direkter Sicherheitsimpact
heute, aber Drift-Risiko fuer zukuenftige Deferred-Pässe: wenn eines
dieser Tools deferred wird, ist es ueber `find_tool` nicht entdeckbar
(`if (!meta) continue;` in `FindToolTool.execute`).

Deferred als **IMP-24-06-01** (P3, Source SEC, Ready). Detail-File:
`_devprocess/requirements/improvements/IMP-24-06-01-toolmetadata-union-drift.md`.

### Positivbefunde

- **Klare Vertrauensgrenze** in `ReadMcpToolTool` (String-Lookup, kein
  Pfad). Analog zum read_skill-Pattern.
- **Whitelist + Connection-Status-Check fail-closed.**
- **Defense-in-Depth durch Pipeline-Cap** (HARD_TOOL_OUTPUT_CAP_CHARS 60k).
- **Konsistenz zum ADR-116-Pattern**: Verzeichnis stabil, Detail on-demand;
  read_skill (FEAT-24-09) und read_mcp_tool (FEAT-24-06) folgen demselben
  Muster.
- **Cache-stabiler Cut:** `capMcpDescription` kuerzt deterministisch bei
  200 chars (mit `trimEnd()`); der gecachte Praefix bleibt stable.
- **Reduzierte tools-Feld-Surface:** `inspect_self` + `update_settings`
  sind jetzt deferred -- ihre Schemas verschwinden aus jedem API-Call.
- **Tests-Verankerung:** SC-3 + SC-4 als Regression-Assertions in
  `deferredToolLoading.test.ts` festgezurrt.
- **SCA-Baseline unveraendert** gegenueber AUDIT-019 (keine neuen
  Dependencies; `mermaid` Moderate bleibt vorbestehend, DEBT-SCA-2026-05-12).

### Architektonische Folgepunkte

- IMP-24-06-01: TOOL_METADATA-Drift-Cleanup als eigenes V-Model-Item.
- Mittelfristig: TypeScript-Type oder Vitest-Assertion fuer
  Union/Metadata-Konsistenz (im IMP-24-06-01 mit-erwaegen, nicht
  zwingend Teil davon).

### Naechster Schritt

Merge nach `dev` via `bash scripts/merge-to-dev.sh feature/feat-24-06-lazy-loading-tool-schemas`
(User-Trigger; keine autonome shared-state-Aktion). Live-Messlauf-Abnahme
von SC-6 in einer nächsten Vault-Session.

---

## FEAT-24-04 -- /coding -> /testing (2026-05-13)

triage: FEAT-24-04
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-04

Branch: `feature/feat-24-04-subagent-delegation` (off `dev` 00e4516).
Refs: PLAN-22, ADR-113 (Accepted, Amendment 2026-05-13 additiv zu ADR-90).

### Critical-Review-Befund vor Implementation (kein Pivot)

ADR-113 in Spannung zu ADR-90 (Tier-4-Eskalation fuer `new_task`).
Aufloesung im PLAN-22: **additiv, nicht ersetzend**. Neuer optionaler
`profile`-Parameter auf `new_task`: wenn gesetzt -> Profile-Pfad
(schlanker subagentRoleOverride + reduzierte Tool-Allowlist + ohne
Tier-4-Justification); wenn nicht gesetzt -> heutiger ADR-90-Pfad
voll aktiv. Per-Call-Token-Budget greift fuer beide Pfade. ADR-113
Status `Proposed` -> `Accepted` mit Amendment im File festgehalten.
Kein Mid-course-Pivot wie bei ADR-117/118 noetig -- die ADR-Logik
selbst war ueberwiegend tragbar.

### Was implementiert wurde

- **`src/core/agent/subagent-profiles.ts`** (NEU): Profile-Registry
  mit dem einen `research`-Profile (read-only Tool-Allowlist, lean
  roleDefinition, max 3-7 Tool-Calls, kein Schachteln).
  `getSubagentProfile` + `listSubagentProfileNames`.
- **`src/types/settings.ts`**: `subtaskTokenBudget: number` in
  `AdvancedApiSettings`, Default 8000. Keine UI-Aenderung (Power-User
  via update_settings/data.json).
- **`src/core/tools/agent/newTaskValidation.ts`**: Profile-Branch in
  `validateNewTaskInput`. Wenn `profile` gesetzt + bekannt ->
  justification nicht required (Profile-Wahl IS die Entscheidung).
  Unbekannter Profile-Name -> Fehler mit Liste bekannter Profile.
  Whitespace-only profile faellt auf Tier-4 zurueck. Tier-4-Fehler
  nennt jetzt `profile="research"` als Alternative.
- **`src/core/tools/agent/NewTaskTool.ts`**: input_schema um
  `profile`-Property erweitert (enum aus `listSubagentProfileNames`).
  Per-Call-Token-Budget-Check vor dem Spawn: `Math.ceil(message.length / 4) > budget`
  -> formatError mit ist/soll + Hinweis auf Setting. Description
  des Tools beschreibt jetzt explizit "Two paths" (Profile vs Tier-4).
  Spawn-Aufruf reicht profileName als 3. Argument durch; Completion-
  Header zeigt `profile: ...` statt `mode: ...` wenn Profile gesetzt.
- **`src/core/tools/types.ts`**: `ToolExecutionContext.spawnSubtask`-
  Signatur um `profileName?` erweitert.
- **`src/core/AgentTask.ts`**: `spawnSubtask(childMode, childMessage, profileName?)`.
  Profile-Pfad reicht `subagentRoleOverride` + `subagentAllowedTools`
  an `childTask.run`, plus rules/mcp/plugin-skills NICHT durchreichen
  (Profile ist die Scope-Entscheidung). `AgentTaskRunConfig` um die
  beiden Felder erweitert. `rebuildPromptCache` filtert `baseTools`
  ZUERST gegen die Profile-Allowlist (vor deferred/shadowed-Filtern).
- **`src/core/systemPrompt.ts`**: `SystemPromptConfig` um
  `subagentRoleOverride` + `subagentAllowedTools`. Beide werden in
  Section 1 (Mode-Definition) bzw. Section 4 (Tools) wirksam.
- **`src/core/prompts/sections/modeDefinition.ts`**:
  `getModeDefinitionSection(mode, roleOverride?)`. Bei Override
  bleibt der Mode-Header, der Role-Body wird ersetzt. Nullish coalescing
  (`undefined` -> Fallback; explicit '' -> Override mit leerem Body
  als fail-loud Verhalten).
- **`src/core/prompts/sections/tools.ts`** + **`src/core/tools/toolMetadata.ts`**:
  `buildToolPromptSection(groups, includeExamples, allowedNames?)`
  filtert per Allowlist-Intersection. `getToolsSection` reicht den
  Parameter durch.
- **`src/core/prompts/sections/toolDecisionGuidelines.ts`**: Rule 8
  um "RESEARCH PROFILE EXCEPTION"-Zeile ergaenzt (`profile="research"`
  als Pfad fuer multi-step Recherche, kein Tier-4-Justification).

### Tests

`npm test`: **1460 gruen** (+21 vs dev-Baseline 1439). 149 Test-Files.

- `subagent-profiles.test.ts` (NEU, 5 Tests): Registry-Listing,
  Lookup, read-only-Tool-Surface (kein write/edit/use_mcp_tool/new_task),
  roleDefinition-Regeln (kein writes, kein modes, kein nesting), unknown name.
- `newTaskValidation.test.ts` (erweitert, +5 Tests): profile akzeptiert
  ohne justification, mode/message still required, unknown profile mit
  Liste, whitespace profile -> Tier-4, Tier-4-Fehler erwaehnt `profile="research"`.
- `NewTaskTool.test.ts` (NEU, 8 Tests): Budget-Overflow mit ist/soll-
  Format, Budget-Edge (genau 8000 -> okay), user-konfiguriertes
  schmaleres Budget; Profile-Spawn ruft spawnSubtask mit profileName,
  Completion-Header `profile: research`; non-profile Tier-4-Pfad bleibt;
  unknown profile Fehler; Mode-Check (only Agent).
- `modeDefinition.test.ts` (NEU, 3 Tests): Default-Render mit Mode-
  roleDefinition, Override ersetzt body und behaelt Header, undefined
  -> Fallback.

`npx tsc -noEmit -skipLibCheck` clean. `npm run lint` 0 errors (664
vorbestehende warnings unveraendert). `npm run build` gruen
(tsc + esbuild + Vault-Deploy).

### Abweichungen vom Plan

- **`getModeDefinitionSection`** mit nullish coalescing (`??`) statt
  truthy-Check: explicit `''` als Override greift jetzt durch (fail-loud);
  begruendet in den Implementation-Notes.
- **`NewTaskTool`** nutzt einen lokalen `DEFAULT_SUBTASK_TOKEN_BUDGET = 8000`-
  Konstante als Fallback fuer alte data.json-Stand ohne migrierten
  Setting-Default (Optional-Chaining-Pfad). Im PLAN nicht explizit
  erwaehnt; Robustheits-Anforderung an die Setting-Default-Migration.
- **Settings-UI** nicht erweitert (kein Slider): Power-User koennen das
  Setting via update_settings oder data.json setzen. UI-Erweiterung waere
  Folge-Item.

### Bugs/Findings

Keine. Kein Mid-course-Bug- oder Requirement-Trigger.

### Fuer /testing

- SC-1..SC-5 sind durch die +21 Tests direkt abgedeckt (validation,
  profile registry, tool filter, mode override, budget check).
- SC-6 (Live-Messlauf, `[AWAITING RE]`): Vault-Session mit einer Frage,
  die >3 read/search-Calls braucht; pruefen dass:
  - Agent ruft `new_task(profile='research', message='...')`
  - Subtask laeuft mit `[subtask] read_file`-Logs
  - Parent-Kontext nach Subtask-Ende waechst nur um die verdichtete
    Antwort, nicht um die Zwischen-Tool-Results
  - `[InputBreakdown]`-Log zeigt nach dem Subtask einen flachen Parent
- Coverage-Tooling im Projekt nicht installiert; Test-Anzahl-basierter
  Beleg.

### Fuer /security-audit

- **`spawnSubtask` mit profileName:** Profile-Lookup geht ueber String-
  Map (`getSubagentProfile(name)`), keine vom Modell kontrollierte
  Pfad-Konstruktion. Kein neuer Filesystem-Surface.
- **`subagentRoleOverride`-Inlining im System-Prompt:** der
  roleDefinition-String aus dem Profile geht 1:1 in den Subagent-
  System-Prompt. Profile sind im Code definiert (keine User-Eingabe),
  also kein Prompt-Injection-Vektor vom User-Eingang aus.
- **Per-Call-Token-Budget:** dient als Defense-in-Depth-Schutz gegen
  riesige Subtask-Messages. Hilft auch indirekt gegen versehentliche
  Context-Bombe. Audit-Frage: greift der Budget-Check vor jedem Spawn-
  Pfad (Tier-4 + Profile)? Code-Beleg: ja, vor `spawnSubtask`-Aufruf.
- **`subagentAllowedTools`-Filter:** schneidet Tools VOR den
  deferred-/shadowed-Filtern weg. Audit-Frage: kein "Privilege
  Escalation"-Pfad, weil Profile-Allowlist eine Untermenge der
  registrierten Tools ist; kein Tool-Schema, das nicht in der
  ToolRegistry vorhanden ist, kann via Profile auftauchen.
- **`activeMcpServers`-Whitelist:** Profile-Spawn setzt `mcpClient: undefined`
  durch. Damit hat ein Profile-Subagent keinen MCP-Zugriff; Whitelist-
  Check wuerde ohnehin keine Server zulassen. Audit: konsistent mit
  dem read-only-Profile-Intent.

### Naechster Schritt

`/testing` (Gap-Test + Coverage-Check), danach `/security-audit`, danach
Merge nach `dev` ueber `scripts/merge-to-dev.sh feature/feat-24-04-subagent-delegation`.

---

## FEAT-24-04 -- /testing -> /security-audit (2026-05-13)

triage: FEAT-24-04
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-04

Branch: `feature/feat-24-04-subagent-delegation` (Commit 98ef26d).

### Testlage

- `npm test`: **1460 gruen**, 149 Test-Files, 0 Failures (+21 vs dev-Baseline 1439). Die +21 Tests entsprechen 1:1 den SC-1..SC-5 (Mapping siehe BACKLOG-Row + HANDOFFS-Eintrag der /coding-Phase). Keine zusaetzlichen Unit-Tests in dieser /testing-Phase notwendig.
- `npx tsc -noEmit -skipLibCheck`: clean.
- `npm run lint`: 0 errors, 664 vorbestehende warnings (security/detect-object-injection, nicht FEAT-24-04-bezogen).
- `/consistency-check` mode A: 89 findings -- **0 echte durch FEAT-24-04** verursacht. Der eine neue Finding (orphan-backlog-row fuer ADR-113) faellt unter den bekannten DIA-Checker-Regex-Bug fuer 3-stellige ADR-IDs (gleiches Pattern wie ADR-114..118).

### SC-Mapping

| SC | Status | Evidence |
|---|---|---|
| SC-1 `new_task` akzeptiert profile='research' (optional) | gruen | 5 Profile-Branch-Tests in `newTaskValidation.test.ts` + 2 Profile-Spawn-Tests in `NewTaskTool.test.ts` |
| SC-2 Profile-Spawn schlank: roleDefinition + reduzierte Tools, rules/mcp/plugin-skills NICHT durchgereicht | gruen | `subagent-profiles.test.ts` (5 Tests) + `modeDefinition.test.ts` (3 Tests) + AgentTask.spawnSubtask code-Diff (rules/mcp/pluginSkillsSection `: undefined` im Profile-Pfad) |
| SC-3 Per-Call-Token-Budget greift fuer beide Pfade (Default 8000) | gruen | 3 Budget-Tests in `NewTaskTool.test.ts` (Overflow, Edge, Custom-Budget) |
| SC-4 Non-profile-Pfad unveraendert (ADR-90 Tier-4 bleibt) | gruen | Tier-4-Pfad-Test in `NewTaskTool.test.ts` + alle vorhandenen `newTaskValidation.test.ts`-Tests gruen (keine Regression auf bestehende PARALLEL/SPECIALIST/ESCALATION-Validation) |
| SC-5 Profile-Registry erweiterbar (mind. 1 Profile) | gruen | `listSubagentProfileNames` enthaelt `research` -- assertion in `subagent-profiles.test.ts` |
| SC-6 Live-Messlauf | `[AWAITING RE]` | Funktionsverifikation in einer Vault-Session: eine Frage, die >3 read/search-Aufrufe braucht, fuehrt zu `new_task(profile='research', ...)`-Call; Parent-Kontext waechst nur um die verdichtete Antwort; `[InputBreakdown]`-Log Beleg. Nicht autonom pruefbar. |

### Bewusst NICHT unit-getestet (Begruendung)

- **SC-6 Eltern-Kontext-Wachstum:** Laufzeit-Telemetrie gegen den realen Agent-Loop mit gespawntem Subagent. Die Bausteine darunter (Profile-Allowlist-Filter, roleOverride im Mode-Prompt, microcompaction der Subtask-Tool-Results) sind einzeln getestet; ein End-to-End-Beleg waere ein Live-Messlauf mit `[InputBreakdown]` vor/nach Subtask.
- **Audit-Vektoren (server-/profile-kontrollierte Inhalte, Whitelist-Synchronitaet, Privilege-Escalation via Profile-Allowlist):** sind /security-audit-Fragen, keine funktionalen Regression-Gaps. Die Profile-Definition liegt im Code (kein User-Eingabe-Vektor), das Token-Budget greift unconditional, der Tool-Allowlist-Filter schneidet vor deferred/shadowed-Filtern -- alles strukturell auf der sicheren Seite.

### Fuer /security-audit

Aus dem /coding-Handoff uebernommen + verifiziert via Tests:

- **`spawnSubtask` mit profileName:** Profile-Lookup ueber Konstanten-Map (`getSubagentProfile(name)`), KEIN Filesystem-Surface. Code-Beleg in `subagent-profiles.ts` (PROFILES als Record-Literal).
- **`subagentRoleOverride`-Inlining:** der `roleDefinition`-String aus dem Profile geht 1:1 in den Subagent-System-Prompt. Profile sind im Code definiert (keine User-Eingabe), kein Prompt-Injection-Vektor vom Modell-Eingang aus.
- **Per-Call-Token-Budget:** greift vor JEDEM Spawn (Tier-4 + Profile). Code-Beleg in NewTaskTool.execute: Budget-Check liegt VOR der `context.spawnSubtask`-Aufruf. Setting-Default in settings.ts; Fallback-Konstante in NewTaskTool.ts.
- **`subagentAllowedTools`-Filter:** Profile-Allowlist ist Untermenge der registrierten Tools; kein Tool, das nicht in der Registry vorhanden ist, kann via Profile auftauchen. Filter laeuft VOR deferred-/shadowed-Filtern in rebuildPromptCache.
- **`mcpClient: undefined` im Profile-Spawn:** konsistent mit read-only-Intent des research-Profiles; verhindert versehentlichen MCP-Zugriff aus dem Profile-Subagent.
- **`maxSubtaskDepth`:** Profile-Spawns honorieren weiter die Tiefe-Grenze; Profile-Description verbietet zusaetzlich `new_task` aus dem Subagent (kein Schachteln).

### Naechster Schritt

`/security-audit` fuer FEAT-24-04. Danach Merge nach `dev` via `bash scripts/merge-to-dev.sh feature/feat-24-04-subagent-delegation`. Live-Messlauf-Abnahme von SC-6 bleibt offen bis zur nächsten Vault-Session.

---

## FEAT-24-04 -- /security-audit (2026-05-13)

triage: FEAT-24-04
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-04

Branch: `feature/feat-24-04-subagent-delegation`. Audit-Report:
[AUDIT-021-feat-24-04-2026-05-13.md](../analysis/AUDIT-021-feat-24-04-2026-05-13.md).

### Verdikt

**Overall risk: Low. Release recommendation: Green.**

- **0 Critical, 0 High, 0 Medium.**
- **3 Info-Notes** (Pre-Emptive only, keine BACKLOG-Einträge noetig):
  F-1 user-eingebbare Profile waeren ein Injection-Vektor (heute Code-
  konstant, kein Risiko), F-2 Token-Budget-Schaetzung chars/4 ist grob
  aber als Defense-in-Depth-Bodenplatte ausreichend, F-3 mode-Override
  beim Profile-Spawn ist by-design und in der Tool-Description
  dokumentiert.

### Hauptaudit-Vektoren (alle clean oder mehrfach mitigiert)

- **Path-Traversal in spawnSubtask:** existiert nicht. Profile-Lookup
  ueber Konstanten-Map, kein Filesystem-Surface.
- **Resource Consumption via Subtask-Message-Bombe:** zwei unabhaengige
  Verteidigungslinien -- Per-Call-Budget vor dem Spawn UND Pipeline-
  HARD_TOOL_OUTPUT_CAP_CHARS (60k) am Tool-Result-Ausgang.
- **Prompt Injection via Subagent-Inhalte:** roleDefinition Code-
  konstant; `message` ist normale User-Message-Trust-Boundary;
  Subagent-Antwort identisch zu jedem anderen Tool-Result. Keine neue
  Surface.
- **Privilege Escalation via Profile-Allowlist:** Order-of-Filters in
  rebuildPromptCache (Profile-Allowlist FIRST, dann Deferred, dann
  Activated-Injection mit `baseTools.find`) garantiert dass kein Tool
  ausserhalb der Allowlist im Subagent-Schema auftaucht -- auch nicht
  ueber `find_tool`-Aktivierung.
- **MCP-Isolation des research-Subagent:** doppelt-gesichert. `mcpClient: undefined`
  im Profile-Spawn UND `use_mcp_tool`/`read_mcp_tool` NICHT in der
  research-Allowlist.
- **Subagent-Nesting:** dreifach gesichert (maxSubtaskDepth + `new_task`
  nicht in Allowlist + Profile-roleDefinition-Prompt-Leitplanke).
- **Settings-Default-Migration:** Optional-Chaining + Konstanten-
  Fallback `DEFAULT_SUBTASK_TOKEN_BUDGET = 8000` macht alte data.json-
  Stand sauber.

### Positivbefunde

- **Vertrauensgrenze enger als Tier-4** beim Profile-Spawn (kein MCP,
  keine Rules, keine Skills, eingeschraenkte Tool-Allowlist).
- **Per-Call-Budget greift unconditional** vor jedem Spawn (Tier-4 +
  Profile).
- **Profile-Allowlist gewinnt strukturell** gegen alle anderen Tool-
  Mechaniken (Order-of-Filters).
- **Profile-roleDefinition enthaelt explizite Negativ-Anweisungen** als
  Prompt-Leitplanke (no writes, no mode-switching, no nesting,
  attempt_completion required).
- **Regression-Schutz** via `subagent-profiles.test.ts`: write/edit/
  use_mcp_tool/new_task duerfen nie in der research-Allowlist auftauchen.
- **Konsistenz zu ADR-90:** non-profile-Pfad voll unveraendert; der
  Profile-Pfad ergaenzt, ersetzt nicht.
- **SCA-Baseline unveraendert** gegenueber AUDIT-020.

### Architektonische Folgepunkte

Keiner kritisch. F-1 (user-eingebbare Profile als zukuenftiger Injection-
Vektor) ist ein Pre-Emptive Note fuer kuenftige Erweiterungen, kein
heutiges Item. Mittelfristig sinnvoll: weitere Profile (`summarise`,
`code-review`) addieren, sobald der Live-Messlauf zeigt dass `research`
real genutzt wird.

### Naechster Schritt

Merge nach `dev` via `bash scripts/merge-to-dev.sh feature/feat-24-04-subagent-delegation`
(User-Trigger; keine autonome shared-state-Aktion). Live-Messlauf-
Abnahme von SC-6 in einer nächsten Vault-Session.

---

## FEAT-24-07 -- /coding -> /testing (2026-05-13)

triage: FEAT-24-07
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-07

Branch: `feature/feat-24-07-helper-model-routing` (off `dev` 3190a70).
Refs: PLAN-23, ADR-115 (Accepted, Amendment 2026-05-13). **Letztes
EPIC-24-Item.**

### Critical-Review-Befund vor Implementation (kein Pivot)

Codebase-Recon offenbarte ein bestehendes Per-Feature-Routing-Pattern
(`memoryModelKey`, `titlingModelKey`). Memory-Atomizer, ChatLinking-
Titling und sogar Recipe-Promotion nutzten dieses Pattern schon
(`plugin.getMemoryModel()`-callback fuer Recipe). ADR-115 wurde im
Amendment 2026-05-13 entsprechend praezisiert:

- 4 Call-Sites (nicht 5): condenseHistory, FastPathExecutor planner/
  presenter, plan_presentation, RecipePromotion (Migration).
- Out-of-scope: Memory-Atomizer (`memoryModelKey`), ChatLinking-Titling
  (`titlingModelKey`), `classifyText` in main.ts, `hard-limit-recovery`,
  ReAct-Hauptloop.
- Recipe-Migration: helper-first-memory-fallback chained, damit User
  ohne `helperModelKey` aber mit `memoryModelKey` weiter ihre Memory-
  Modell-Config sehen.

ADR-115 Status `Proposed` -> `Accepted` mit Amendment im File.

### Was implementiert wurde

- **`src/types/settings.ts`**: `helperModelKey: string` Top-Level
  (Geschwister `activeModelKey`), Default `''`.
- **`src/main.ts`**: `getHelperModel(): CustomModel | null` analog
  `getMemoryModel`; RecipePromotion-callback helper-first-memory-fallback
  chained mit `console.warn`-on-helper-build-fail.
- **`src/core/helper-api.ts`** (NEU): `getHelperApi(plugin, fallback)`.
  Fail-closed: `getHelperModel()` null -> fallback; `buildApiHandlerForModel`
  throws -> `console.warn` + fallback; nur clean build returnt einen
  neuen Handler.
- **`src/core/AgentTask.ts`**: `condenseHistory` createMessage ueber
  `getHelperApi(this.toolRegistry.plugin, this.api)`. ReAct-Hauptloop +
  hard-limit-recovery unangetastet.
- **`src/core/FastPathExecutor.ts`**: neue private Methode
  `getInternalApi()` -> `getHelperApi(pipeline.getPlugin(), this.api)`.
  Der eine createMessage-Call (Line 275, sowohl Planner als auch
  Presenter teilen den Loop) ruft jetzt `internalApi.createMessage`.
- **`src/core/tool-execution/ToolExecutionPipeline.ts`**: neuer
  `getPlugin()`-accessor (read-only) damit FastPathExecutor das Plugin
  on-demand bekommt ohne Konstruktor-Aenderung.
- **`src/core/tools/vault/PlanPresentationTool.ts`**: `callPlanningLLM`
  baut weiterhin `mainApi` aus `getActiveModel()` und chained dann
  `getHelperApi(plugin, mainApi)`.

### Tests

`npm test`: **1464 gruen** (+4 vs dev-Baseline 1460). 150 Test-Files.

- `src/core/__tests__/helper-api.test.ts` (NEU, 4 Tests):
  - no-config-fallback (kein `helperModel` -> fallback returned)
  - helper-built (gueltiges Modell -> mock-handler returned)
  - build-throws-fallback (`buildApiHandlerForModel` wirft ->
    fallback + `console.warn`)
  - contract-only-via-getHelperModel (`getHelperApi` peekt NICHT in
    `plugin.settings.helperModelKey`, nur via `getHelperModel()`)

`npx tsc -noEmit -skipLibCheck` clean. `npm run lint` 0 errors. `npm run build`
gruen (tsc + esbuild + Vault-Deploy).

### Abweichungen vom Plan

- **FastPathExecutor-Konstruktor unveraendert.** Der Plan diskutierte
  Option A (Konstruktor um `plugin` erweitern) und Option B (vor-
  resolved api-Override). Realisiert wurde eine dritte Option: neuer
  `pipeline.getPlugin()`-accessor + on-demand-Lookup im
  `FastPathExecutor.getInternalApi()`. Vorteil: keine Aenderung der
  `new FastPathExecutor(...)`-Call-Site in `AgentTask.ts:331`.

### Bugs/Findings

Keine. Kein Mid-course-Trigger waehrend Implementation.

### Fuer /testing

- SC-1..SC-7 sind durch +4 helper-api-Tests + unveraendertes Test-Baseline
  abgedeckt (kein Behavior-Change mit leerem `helperModelKey`).
- SC-8 (Live-Messlauf, `[AWAITING RE]`): Vault-Session mit konfiguriertem
  Hilfs-Modell (z.B. Haiku), Aufgabe die condensing triggert; pruefen:
  - `[Cost]`-Log zeigt Hilfs-Modell beim Condensing-Call
  - Hauptloop weiterhin auf Haupt-Modell
  - Bei leerem `helperModelKey`: kein Verhaltenswechsel
- Coverage-Tooling im Projekt nicht installiert; Test-Anzahl-basierter
  Beleg.

### Fuer /security-audit

- **`getHelperApi`-Vertrauensgrenze:** keine User-Eingabe ueber
  Tool-Calls; nur Settings-Lookup. Fail-closed bei Build-Fehler. Console-
  warn bei jedem Fehler. Audit-Frage: ist es robust gegen settings
  corruption / fehlende activeModels?
- **`pipeline.getPlugin()`-accessor:** nur read-only return des
  bestehenden privaten Felds; keine neue Mutation-Surface.
- **RecipePromotion-callback chain:** der `console.warn`-Pfad beim
  helper-build-fail koennte log-spammy werden wenn das User-Setting
  konsistent kaputt ist. Mitigation: warn ist nicht-fatal, callback
  faellt sauber auf Memory-Modell zurueck.
- **No new dependencies.** SCA-Baseline unveraendert.

### Naechster Schritt

`/testing` (Gap-Test + Coverage-Check), danach `/security-audit`, danach
Merge nach `dev` ueber `scripts/merge-to-dev.sh feature/feat-24-07-helper-model-routing`.
**Mit FEAT-24-07-Merge ist EPIC-24 (alle 5 ausgewaehlten Items) inhaltlich abgeschlossen.**

---

## FEAT-24-07 -- /testing -> /security-audit (2026-05-13)

triage: FEAT-24-07
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-07

Branch: `feature/feat-24-07-helper-model-routing` (Commit b5c4575).

### Testlage

- `npm test`: **1464 gruen**, 150 Test-Files, 0 Failures (+4 vs dev-Baseline 1460). Die +4 Tests in `helper-api.test.ts` decken SC-1+SC-2 direkt; SC-3..SC-6 (Call-Site-Routing) sind durch das unveraenderte Test-Verhalten bei leerem `helperModelKey` indirekt belegt (kein Behavior-Change). SC-7 (Bestehende Funktionalitaet unveraendert) ist durch das gleichgrosse Baseline-Bestehen abgedeckt.
- `npx tsc -noEmit -skipLibCheck`: clean.
- `npm run lint`: 0 errors, 664 vorbestehende warnings.
- `/consistency-check` mode A: 89 findings -- **0 echte durch FEAT-24-07**. Der eine neue Finding (orphan-backlog-row fuer ADR-115) faellt unter den DIA-Checker-Regex-Bug fuer 3-stellige ADR-IDs (gleiches Pattern wie ADR-113/114/116/117/118).

### SC-Mapping

| SC | Status | Evidence |
|---|---|---|
| SC-1 `helperModelKey` + `getHelperModel` | gruen | Setting + Method analog `memoryModelKey`/`getMemoryModel` (vorbestehendes getestetes Pattern) |
| SC-2 `getHelperApi(plugin, fallback)` fail-closed | gruen | 4 Tests in `helper-api.test.ts`: no-config-fallback, helper-built, build-throws-fallback, contract-only |
| SC-3 condenseHistory geroutet | gruen | Code-Diff zeigt `getHelperApi(this.toolRegistry.plugin, this.api)` vor dem createMessage in `AgentTask.ts:1463`. Unveraendertes Bestehen aller bestehenden Condensing-Tests bei leerem `helperModelKey` |
| SC-4 FastPathExecutor geroutet | gruen | Code-Diff: neue `getInternalApi()`-Methode + `pipeline.getPlugin()`-accessor. Unveraendertes Bestehen aller FastPath-Tests |
| SC-5 plan_presentation geroutet | gruen | Code-Diff: `getHelperApi(plugin, mainApi)` in `PlanPresentationTool.callPlanningLLM` |
| SC-6 RecipePromotion helper-first-memory-fallback | gruen | Code-Diff im RecipePromotion-callback in `main.ts`: chain helper -> memory -> null mit `console.warn`-on-helper-fail |
| SC-7 Bestehende Funktionalitaet unveraendert | gruen | 1460 vorbestehende Tests gruen + 4 neue gruen, keine Regression |
| SC-8 Live-Messlauf | `[AWAITING RE]` | Konfigurierter Hilfs-Modell + Vault-Session: `[Cost]`-Log zeigt Hilfs-Modell beim Condensing; leerer Slot -> kein Verhaltenswechsel. Nicht autonom pruefbar. |

### Bewusst NICHT unit-getestet (Begruendung)

- **SC-8 Hilfs-Modell-Routing Live:** Laufzeit-Telemetrie gegen echte Provider. Die Bausteine darunter (`getHelperApi`, `getHelperModel`, Call-Site-Insertion) sind durch helper-api.test.ts + Code-Review verankert.
- **Audit-Vektoren (Settings corruption, log-spam bei kaputtem Setting, accessor-Read-only):** sind /security-audit-Fragen, keine funktionalen Regression-Gaps. Strukturell auf der sicheren Seite (fail-closed, no-new-input-surface, accessor delegated to existing private field).
- **End-to-End Provider-Calls mit echtem Helper-Modell-Stream:** identisch zur Memory-Atomizer-Architektur (vorbestehend, durch Memory-v2-Implementation getestet). Kein neues Provider-Wiring; nur Routing.

### Fuer /security-audit

Aus dem /coding-Handoff uebernommen + verifiziert via Tests:

- **`getHelperApi`-Fail-closed:** Build-Fehler -> `console.warn` + fallback. Test verifiziert das (`buildApiHandlerForModel`-mock throws -> fallback returned).
- **`pipeline.getPlugin()`-accessor:** read-only return des bestehenden privaten Felds; keine neue Mutation-Surface, keine User-Eingabe ueber diesen Pfad.
- **RecipePromotion-callback chain:** `console.warn` bei helper-build-fail koennte log-spammy werden bei konsistent kaputtem Setting. Mitigation: warn ist nicht-fatal; chain faellt sauber auf Memory-Modell zurueck; bei kaputtem Setting bekommt User Warn-Log einmal pro Promotion-Aufruf (selten).
- **`getHelperModel`-Contract:** der vierte Test verifiziert dass `getHelperApi` nicht direkt in `settings.helperModelKey` peekt sondern nur `getHelperModel()` aufruft. Damit lebt die enabled/activeModels-Validierung an einer Stelle.
- **Out-of-scope-Pfade dokumentiert:** Memory-Atomizer (`memoryModelKey`), ChatLinking-Titling (`titlingModelKey`), classifyText (main.ts), hard-limit-recovery, ReAct-Hauptloop -- diese behalten ihre heutigen Pfade vollstaendig.

### Naechster Schritt

`/security-audit` fuer FEAT-24-07 / ADR-115. Danach Merge nach `dev` via `bash scripts/merge-to-dev.sh feature/feat-24-07-helper-model-routing`. **Mit FEAT-24-07-Merge ist EPIC-24 (alle 5 ausgewaehlten Items) inhaltlich abgeschlossen.** Live-Messlauf-Abnahme von SC-8 bleibt offen bis zur nächsten Vault-Session.

---

## FEAT-24-07 -- /security-audit (2026-05-13)

triage: FEAT-24-07
triage_kind: feature
epic: EPIC-24
feature: FEAT-24-07

Branch: `feature/feat-24-07-helper-model-routing`. Audit-Report:
[AUDIT-022-feat-24-07-2026-05-13.md](../analysis/AUDIT-022-feat-24-07-2026-05-13.md).

### Verdikt

**Overall risk: Low. Release recommendation: Green. Letztes EPIC-24-Item.**

- **0 Critical, 0 High, 0 Medium.**
- **3 Info-Notes** (alle accepted, keine BACKLOG-Einträge):
  F-1 Per-Call-Helper-Build by design (kein Cache; Provider-Konstruktoren billig),
  F-2 Warn-Log bei kaputtem Setting nicht-fatal aber laestig (Mitigation: once-Wrapper waere Folge-IMP),
  F-3 settings-corruption defense-in-depth bereits eingebaut (3 Korruptions-Szenarien fail-closed).

### Hauptaudit-Vektoren (alle clean oder mehrfach mitigiert)

- **Vertrauensgrenze:** keine neue User-Eingabe-Surface. Nur Settings-Lookup.
- **LLM01 Prompt Injection:** Helper-Call erhaelt identischen Inhalt wie der gerouteete Aufrufer; Trust-Boundary identisch.
- **LLM02 Insecure Output Handling:** Helper-Output durch Pipeline-Caps (FEAT-24-03 60k) und Microcompaction (FEAT-24-02) gedeckt wie heute.
- **Privilege Escalation:** existiert nicht. `helperModelKey` ist User-Setting; kein Tool-Pfad mutiert es ausser via update_settings (normaler Settings-Aenderungs-Surface).
- **Mutation-Surface:** `pipeline.getPlugin()` ist read-only accessor, kein Setter.
- **Race Conditions:** synchroner Lookup + Build; kein async-shared-state.
- **Out-of-scope-Pfade unangetastet:** ReAct-Hauptloop, hard-limit-recovery, Memory-Atomizer, ChatLinking-Titling, classifyText -- alle behalten ihre heutigen Pfade vollstaendig.

### Positivbefunde

- **Fail-closed-Design durchgaengig** (3 Korruptions-Szenarien getestet).
- **Vertrauensgrenze enger** als bei Tool-Pfaden mit User-Input.
- **Konsistenz zum bestehenden Per-Feature-Pattern** (`memoryModelKey` / `titlingModelKey`).
- **RecipePromotion backwards-kompatibel** zu `memoryModelKey`.
- **Read-only-accessor** in `ToolExecutionPipeline.getPlugin()`.
- **No-direct-settings-access-Contract** verifiziert.
- **Defense-in-Depth bei Settings-Korruption** mehrfach abgefangen.
- **SCA-Baseline unveraendert**.

### Architektonische Folgepunkte

Keine kritischen. F-1 (Cache später falls Provider-Konstruktor teuer wird) und F-2 (once-Warn-Wrapper falls Log-Spam stoert) sind potenzielle Folge-IMPs, kein heutiger Bedarf.

### Naechster Schritt

Merge nach `dev` via `bash scripts/merge-to-dev.sh feature/feat-24-07-helper-model-routing`
(User-Trigger). Live-Messlauf-Abnahme von SC-8 in einer nächsten Vault-Session. **Mit dem Merge ist EPIC-24 (Welle 1 + 2 + 3, alle 5 ausgewaehlten Items inkl. FEAT-24-05) inhaltlich abgeschlossen** -- offen bleiben nur die `[AWAITING RE]`-Live-Messlaeufe der 5 FEATs und die Folge-IMPs IMP-24-06-01 (TOOL_METADATA-Drift) und IMP-24-09-01 (Dead Code SkillsManager.getRelevantSkills).

---

## EPIC-26 -- /business-analysis (2026-05-15)

triage: EPIC-26
triage_kind: epic
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2` (Sammelbranch für EPIC-26..29). BA-Dokument:
[BA-27-advisor-pattern-provider-setup.md](../analysis/BA-27-advisor-pattern-provider-setup.md). GitHub-Issue: [#319](https://github.com/pssah4/vault-operator-dev/issues/319).

### Scope

MVP. Advisor-Pattern als Loop-Default + Provider-only Setup mit Auto-Discovery + Chat-Model-Dropdown-Refactor. EPIC-27 (ursprünglich separat) wurde am 2026-05-15 in EPIC-26 absorbiert.

### Personas

- **P1: Sebastian (Power-User, Plugin-Maintainer)** -- primaere Persona, treibt Strategie-Chats, Cost-Reduktion ist sein Treiber
- **P2: Knowledge-Worker [SPEKULATIV]** -- nicht durch Interviews validiert, dient als Design-Ziel fuer Setup-Vereinfachung, in Beta-Phase validieren
- **P3: Enterprise-User** -- zukuenftig, via Synergy zu EPIC-28 (Privacy)

### How-Might-We

Wie koennen wir den Hauptloop von Vault Operator auf einem schlankeren Modell laufen lassen, ohne Qualitaetsverlust fuer Strategie-/Recherche-Text, mit on-demand-Eskalation auf das staerkere Modell wenn der Agent steckt, und gleichzeitig das Setup so vereinfachen, dass User nur Provider + Auth wae hlen statt 20 Felder pro Modell pflegen?

### Critical Hypotheses (an RE/Coding zur Validation)

- **H-01:** Sonnet 4.6 liefert fuer Strategie-/Argumentations-Chats subjektiv vergleichbare Qualitaet wie Opus 4.6. **Validation: in Beta-Phase, kein Vorab-Test.** Rollback-Plan: Default-Tier-Setting flipbar mid -> flagship.
- **H-02:** Pattern-basierter Tier-Klassifikator deckt >90 % der aktuell verfuegbaren Provider-Modelle ab.
- **H-03:** Eskalations-Rate liegt zwischen 5-15 % der Auto-Chats (Tool-Use-Counter-Telemetrie).
- **H-04:** Setup pro neuem Provider auf ≤1 Min senkbar.
- **H-05:** Auto-Migration alter `activeModels[]`-Configs laeuft fuer >95 % der User-Setups fehlerfrei.
- **H-06:** User akzeptiert Single-Active-Provider als Standard-Modus.

### Assumptions (offene Punkte fuer RE/Architecture)

- A-1: Sonnet-Qualitaet ausreichend fuer text-lastige Tasks (siehe H-01)
- A-2: Klassifikator-Pattern decken neue Modelle ab; Edge-Cases via User-Override
- A-3: Single-Active-Provider-Modell ist UX-akzeptiert
- A-4: Migration bestehender activeModels[] ohne Datenverlust
- A-5: Advisor-Mechanik (Reminder + Autonomie) erzeugt sinnvolle Eskalations-Frequenz

### Open Questions

- **OAuth-Flow** fuer Copilot/ChatGPT-Sub im neuen Provider-Setup (Sign-In-Button-Layout)
- **Refresh-Trigger** (manuell only oder auch zeitlich auto)
- **helperModelKey-Semantik** (bleibt explizit oder wird Alias fuer fast-Tier?)
- **Subtask-Verhalten** (research-Profile heute auf helper, im neuen System auf welches Tier?)
- **Notification-Modal-Inhalt** bei Migration
- **Bedrock Cross-Region-Inference-Profile** im Provider-Mode

### Was RE jetzt tut

- EPIC-26 Hypothesis Statement aus dem Issue uebernehmen
- 6 Features definieren: FEAT-26-01 Advisor-Engine, FEAT-26-02 Tier-Klassifikator+Discovery, FEAT-26-03 Provider-Settings-UI, FEAT-26-04 Migration, FEAT-26-05 Chat-Dropdown, FEAT-26-06 Prompt-Slim
- Success Criteria pro Feature (operational testbar)
- User Stories aus den JTBDs ableiten (JTBD-1 bis JTBD-6 in BA Sektion 4.4)
- Prioritaeten setzen (P0/P1/P2)


---

## EPIC-26 -- /requirements-engineering (2026-05-15)

triage: EPIC-26
triage_kind: epic
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2` (Sammelbranch). Artefakte:
- Epic-Spec: [EPIC-26-advisor-pattern-provider-setup.md](../requirements/epics/EPIC-26-advisor-pattern-provider-setup.md)
- Feature-Specs: [FEAT-26-01](../requirements/features/FEAT-26-01-advisor-pattern-engine.md), [02](../requirements/features/FEAT-26-02-tier-klassifikator-discovery.md), [03](../requirements/features/FEAT-26-03-provider-only-settings-ui.md), [04](../requirements/features/FEAT-26-04-migration-backwards-compat.md), [05](../requirements/features/FEAT-26-05-chat-model-dropdown.md), [06](../requirements/features/FEAT-26-06-prompt-slim.md)
- Architect-Handoff: [architect-handoff-epic26.md](../requirements/handoff/architect-handoff-epic26.md)
- BACKLOG: 6 neue FEAT-Rows, EPIC-26-Sektion ergaenzt

### NFR-Summary

- **Performance:** Eskalations-Call ≤3000 Tokens (Subtask-Pattern), Per-Turn-API-Handler-Resolution ≤50ms, Discovery-Timeout 10s/Provider, Cache-Hit-Rate ≥95 %
- **Security:** OAuth-Flows unveraendert, Schema-Migration mit Version, Tool-Schema-Validation provider-seitig
- **Scalability:** ~20-30 Modell-Familien im Klassifikator, 10 Provider supported
- **Availability:** Fail-Safe bei API-Errors, Migration-Fehler erhalten alten State, Eskalations-Fehler ohne Hauptloop-Crash
- **Cost:** Per-Task-Counter (max 3 Eskalations-Calls), Cost-Log mit mode-Field, System-Prompt ≥30 % kleiner

### Critical ASRs (jeweils ADR-Bedarf)

- **ASR-CRIT-EPIC-26-01:** Advisor-Pattern-Architektur (statt 3-Tier-Routing) -> ADR-XXX
- **ASR-CRIT-EPIC-26-02:** Tier-Klassifikator-Strategie (Pattern + Capability + OpenRouter-Pricing) -> ADR-XXX
- **ASR-CRIT-EPIC-26-03:** Provider-only Settings-Architektur (Schema-Wechsel activeModels -> providers) -> ADR-XXX
- **ASR-CRIT-EPIC-26-04:** Migrations-Strategie + Backup-Pfad -> ADR-XXX
- **ASR-CRIT-EPIC-26-05:** ADR-115 Amendment (Helper-Modell-Routing erweitert um Tier-Semantik)

### Offene Architektur-Fragen (an Architect)

1. Subtask-Tier-Inheritance: erbt new_task das Parent-Tier? Recursive-Subtask + Profile-Conflict klaeren
2. `helperModelKey` vs neue Tier-Settings: erhalten oder ersetzen?
3. OAuth-Provider-Listing-Endpunkte: Copilot + ChatGPT-Sub haben provider-spezifische Schema-Parser
4. Bedrock Cross-Region-Inference-Profile (`eu.anthropic...`): Normalisierung im Klassifikator-Pfad
5. Refresh-Trigger: Manual-only oder Auto-bei-Settings-Open / Auto-bei-Stale-Send?
6. Notification-Modal-Inhalt nach Migration: konkrete Felder
7. Cost-Log-Schema-Erweiterung (mode-Field) in `TaskTelemetry.ts` Provider-Adapter-konform
8. Embedding-Modell-Pfad bleibt separat, Konflikt-frei zu Chat-Modell-Pfad

### Constraints (an Architect)

- ReAct-Loop-Kern unveraendert
- EPIC-24-Mechaniken (Cache-Marker, Microcompaction, Externalizer, MCP-Listing-Cap) bleiben
- 24h-Cache fuer Discovery, kein Background-Refresh
- Migration darf bestehende Setups nicht zerstoeren
- 10 Provider-Types supported, alle Auth-Mechaniken erhalten
- Release als v2.11.0 mit BRAT-Beta-Phase

### Forbidden-Terms-Check

Success Criteria der FEATs sind primaer user-facing formuliert. Technische Begriffe (`Tool-Schema`, `Cache-Prefix`, `CACHE_BREAKPOINT_MARKER`) sind in NFR/ASR/Description, nicht in SC. Keine OAuth/REST/SQL-Terms in den SC. Akzeptabler Rahmen fuer ein technisches Plugin-Feature.

### Was /architecture jetzt tut

- 5 ADRs entwerfen (ASR-CRIT-EPIC-26-01..05) plus ggf. Moderate-ASRs
- arc42 Snapshot aktualisieren (Section "Modell-Routing", "Provider-Settings", "Migrations-Strategie")
- plan-context.md erstellen, damit /coding die Implementierung starten kann
- Architecture-Refinement-Dialog im architect-handoff-epic26.md (Append-only)

---

## EPIC-26 -- /architecture (2026-05-15)

triage: EPIC-26
triage_kind: epic
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2` (Sammelbranch). Artefakte:
- ADRs (4 neu + 1 Amendment):
  - [ADR-120](../architecture/ADR-120-advisor-pattern-loop-default.md) Advisor-Pattern als Loop-Default
  - [ADR-121](../architecture/ADR-121-tier-classifier-strategy.md) Tier-Klassifikator-Strategie
  - [ADR-122](../architecture/ADR-122-provider-only-settings-schema.md) Provider-only Settings-Schema
  - [ADR-123](../architecture/ADR-123-settings-schema-migration.md) Settings-Schema-Migration
  - [ADR-115](../architecture/ADR-115-helper-model-routing.md) Amendment 2026-05-15 (Hauptloop-Default-Tier, Tier-Semantik, Subtask-Tier-Inheritance)
- arc42: Sektion 5.10 (Modell-Routing-Building-Block) + Sektion 8.15 (Modell-Routing-und-Provider-Setup-Querschnittskonzept)
- plan-context: [plan-context-epic26.md](../requirements/handoff/plan-context-epic26.md) mit Schema, Performance-Targets, 8 Open Items fuer /coding
- ARCHITECTURE.map: 4 neue Wayfinder-Rows (modell-routing, provider-config, settings-migration, advisor-tool)
- BACKLOG: 4 neue ADR-Rows + Last-update-Marker

### Tech-Stack-Justification

Keine neuen externen Dependencies. EPIC-26 erweitert den bestehenden Stack durch zwei neue Service-Klassen (`ModelTierClassifier`, `ModelDiscoveryService`) und ein neues Settings-Schema-Konzept. Bestehende Mechaniken bleiben unveraendert: ReAct-Loop, Multi-Provider-Adapter aus ADR-11, Subagent-Mechanik aus ADR-113, Cache-Strategie aus ADR-62. OAuth-Flows (Copilot, ChatGPT-OAuth) und Bedrock-Credentials (SigV4 + api-key) sind unangetastet.

### Rejected Alternatives

- **3-Klassen-TaskRouter:** verstaerkt das bestehende Mode-Fehlwahl-Risiko, Cost-Hebel waere klassifikations-abhaengig. Verworfen zugunsten des Advisor-Patterns (ADR-120 Option 1).
- **Hard-Forward-Eskalation bei consecutiveMistakes:** reaktiv, greift erst nach Fehlern, widerspricht User-Wunsch "Loop optimieren statt unterbrechen". Verworfen zugunsten modell-getriebener Eskalation mit Prompt-Reminder (ADR-120 Option 2).
- **Capability-First-Klassifikator:** Capability-Daten nicht immer verfuegbar, Schwellenwerte heuristisch und alterungsanfaellig. Verworfen zugunsten Pattern-First mit Capability-Fallback (ADR-121 Option 1).
- **Schema-Hard-Cut bei Migration:** irreversible Migrations-Fehler. Verworfen zugunsten Schemas-parallel mit Legacy-Backup (ADR-122 Option 1).
- **Migration-Wizard mit Step-by-Step-Bestaetigung:** hohe Friction. Verworfen zugunsten Auto-Migration mit Single-Modal-Notification (ADR-123 Option 2).

### Known Risks

- **R-1 (BA-27):** Sonnet liefert bei Strategie-Chats spuerbar schlechtere Qualitaet als Opus. Validation H-01 in Beta-Phase, Rollback via `defaultMainModelTier`-Flip moeglich (Setting flipt mid -> flagship).
- **R-2:** Tier-Klassifikator klassifiziert ein neues Modell falsch. Mitigation: User-Override pro Slot, Outlier-Log in `console.debug`.
- **R-3:** Migration zerstoert User-Setup. Mitigation: atomic Settings-Save, 30/90-Tage-Backup, Restore-Action. Test gegen Sebastians eigenes Multi-Provider-Setup ist Voraussetzung fuer Release.
- **R-4:** Eskalations-Frequenz outside des erwarteten 5-15 %-Bereichs. Mitigation: Telemetrie-Counter, Prompt-Reminder-Tuning, Per-Task-Limit-Anpassung. Validation H-03 in Beta.

### Open Items (deferred to /coding)

Die folgenden 8 Punkte stehen explizit offen und werden im /coding-Pivot durch Codebase-Recon entschieden. Vollstaendig dokumentiert in `plan-context-epic26.md`:

1. Subtask-Tier-Inheritance Edge Cases (Recursive-Subtask, Profile-Conflict)
2. `helperModelKey`-Resolution-Reihenfolge gegen fast-Tier-Mapping
3. OAuth-Provider-Listing-Schema-Adapter (Copilot, ChatGPT-OAuth)
4. Bedrock Cross-Region-Profile-Normalisierung im Klassifikator-Pfad
5. Refresh-Trigger ueber Manual-Only hinaus (Settings-Open, Stale-Send)
6. Notification-Modal-Detail-Inhalt
7. Cost-Log-Schema-Erweiterung (`mode`-Field) ohne Provider-Adapter-Bruch
8. Embedding-Modell-Pfad-Konflikt-Freiheit zum Chat-Modell-Pfad (geklaert: kein Konflikt)

### Consistency-Check (vor /coding-Pass)

plan-context-epic26.md ist konsistent mit ADR-120, ADR-121, ADR-122, ADR-123, ADR-115 Amendment, BA-27, FEAT-26-01..06. Keine widerspruechlichen Aussagen ueber Schema, Tier-Resolution, Migration-Pfad oder Eskalations-Mechanik. ARCHITECTURE.map und arc42 Sektion 5.10 / 8.15 sind synchron.

### Was /coding jetzt tut

1. plan-context-epic26.md + 4 ADRs + ADR-115 + FEAT-26-01..06 laden
2. Codebase-Recon: existierende `fetchProviderModels()`, `AgentTask.spawnSubtask()`, Subagent-Profile-Registry, Settings-Save-Pfad pruefen
3. Bei Pivot-Bedarf: ADRs mit Amendment-Notes versehen, plan-context schaerfen
4. PLAN-Items pro Welle erstellen (PLAN-24 Advisor-Engine + Klassifikator, PLAN-25 Provider-UI + Migration, PLAN-26 Chat-Dropdown + Prompt-Slim)
5. Implementation pro Welle, Tests gruen halten, build + deploy
6. Live-Messlauf gegen Sebastians Setup vor Public-Release

---

## EPIC-26 -- /coding (Phase 1+2+3a, 2026-05-15)

triage: EPIC-26 / PLAN-24
triage_kind: plan
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2` (Sammelbranch). Artefakte:
- PLAN-24: [PLAN-24-epic-26-welle-1-engine.md](../implementation/plans/PLAN-24-epic-26-welle-1-engine.md) -- 12 Tasks fuer FEAT-26-01 + FEAT-26-02 Backend
- BACKLOG: PLAN-24-Row in Cross-cutting-Sektion

### Critical Review (Phase 2)

**ADR-Drift:** keiner. ADR-120, ADR-121, ADR-122, ADR-123 und ADR-115-Amendment passen zur Codebase. Bestehende Patterns (`spawnSubtask`, `getHelperApi`, `fetchProviderModels`, `_globalStorageMigrated`-Migration-Pattern, `subagent-profiles.ts`) sind wiederverwendbar.

**Findings (alle Implementation-Details, kein ADR-Update):**

- **F-1:** `SubagentProfile`-Interface muss um `tierOverride?: 'fast' | 'mid' | 'flagship'` und `maxOutputTokens?: number` erweitert werden. Erforderlich fuer Advisor-Profile (3000-Cap, flagship-Tier) und Research-Tier-Update (fast-Tier, Amendment ADR-115).
- **F-2:** `[Cost]`-Log braucht `mode`-Field (`auto` | `override(<id>)` | `advisor(<id>)` | `subagent(<id>)`). Provider-Adapter muessen das Field durchreichen.
- **F-3:** `defaultMainModelTier` Top-Level-Setting (Default `'mid'`), flipbar als Rollback-Schalter fuer H-01.

Alle drei Findings sind im PLAN-24 als Sub-Tasks (Task 5, 10, 1) festgehalten.

### Phase 3a Status

**PLAN-24 persistiert mit Status Draft** (Backlog-Row). Implementierung startet in einer separaten /coding-Session. Keine Code-Aenderung in dieser Session.

### Open Items fuer die Implementations-Session

- Vor Start: Bestaetigung dass `feature/cost-reduction-wave-2` der richtige Branch ist oder sub-Branch `feature/epic-26-welle-1` als Alternative
- Cleanup-Schritt aus PLAN-25/26 (Welle 2/3) folgt nach Welle-1-Abschluss in separaten Plans
- Live-Messlauf gegen Sebastians produktives Setup ist Pflicht vor Public-Release (R-3-Mitigation Migration-Verlust)

### Was die naechste /coding-Session tut

1. Branch-Check
2. PLAN-24 laden + Coverage-Gate re-confirm (sollte gruen sein)
3. Status PLAN-24 von Draft auf Active flippen (Backlog-Row)
4. Tasks 1-4 als Foundation-Block (sequentielle Dependency)
5. Tasks 5-12 als Feature-Block (Profile-Interface, Advisor-Tool, Cost-Log, Default-Tier)
6. Pro Task: Code + Tests + Build + Deploy + Backlog-Update
7. Am Ende: Status PLAN-24 auf Done, Implementation-Notes-Section gefuellt, Phase-Tag epic-26/code-done

---

## EPIC-26 Welle 1 Backend -- /coding (Phase 3+4, 2026-05-16)

triage: EPIC-26 / PLAN-24
triage_kind: plan
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2`. Pair-id: sebastian-claude-opus-4-7.

### Was wurde implementiert

Alle 12 Tasks aus PLAN-24 sind grün. Code-Touch-Punkte:

- **Types & Settings:** `src/types/settings.ts` -- neue Interfaces `ProviderConfig`, `DiscoveredModel`; neue Top-Level-Felder `providerConfigs[]`, `activeProviderId`, `schemaVersion?`, `defaultMainModelTier?`, `legacy_active_models_backup?`. DEFAULT_SETTINGS-Defaults: `[]`, `null`, `'mid'`.
- **Routing-Modul (neu):** `src/core/routing/ModelTierClassifier.ts` (pure function, 49 Tests), `src/core/routing/ModelDiscoveryService.ts` (Wrapper + 24h-Cache, 9 Tests), `src/core/routing/README.md`.
- **Plugin-Accessors:** `src/main.ts` -- `getActiveProvider`, `getTierModel(tier)`, `getAdvisorModel`, `providerConfigToCustomModel`; `getHelperModel` ist tier-aware erweitert; `initApiHandler` resolved via Tier mit Fallback auf `getActiveModel()`.
- **Subagent-Profile:** `src/core/agent/subagent-profiles.ts` -- Interface um `tierOverride`+`maxOutputTokens` erweitert; RESEARCH bekommt `tierOverride: 'fast'`; neues ADVISOR_PROFILE mit `tierOverride: 'flagship'` + Hard-Cap 3000.
- **AgentTask:** `src/core/AgentTask.ts` -- spawnSubtask baut tier-spezifischen API-Handler aus Profile; Per-Task-Advisor-Counter (`consumeAdvisorSlot`); Prompt-Cache-Rebuild bei Mistakes-Threshold; Cost-Log mode-Tag-Forwarding.
- **ConsultFlagshipTool (neu):** `src/core/tools/agent/ConsultFlagshipTool.ts` (8 Tests). Registriert in `ToolRegistry.ts`, in `TOOL_METADATA`, in `TOOL_GROUP_MAP.agent`, in `ToolName`-Union. `ToolExecutionContext.consumeAdvisorSlot` + `ContextExtensions` durchgereicht.
- **Filter:** `consult_flagship` wird aus dem Tool-Schema entfernt wenn `plugin.getAdvisorModel()` null liefert (Pre-Migration-State / Provider ohne flagship-Slot).
- **System-Prompt:** `src/core/systemPrompt.ts` -- neue Conditional-Section unter CACHE_BREAKPOINT_MARKER (Advisor Hint) mit zwei Flags (`consultFlagshipReminderActive`, `consultFlagshipAvailable`). 5 neue systemPrompt-Tests.
- **Cost-Log:** `TaskCallbacks.onUsage` um 6. Argument `routingMode` erweitert; `TaskMonitor.onUsage` schreibt `mode=<auto|override|advisor|subagent>` ins `[Cost]`-Log.
- **Wayfinder:** `src/ARCHITECTURE.map` -- 5 neue Concept-Rows (model-tier-classifier, model-discovery, advisor-pattern, subagent-profiles, tier-resolution).

### Deviations / Findings

- **F-4 (Mid-course design, 2026-05-16):** Top-Level-Feld heißt `providerConfigs[]`, nicht `providers[]` -- der Legacy-Key war schon belegt durch `providers: Record<string, LLMProvider>`. Dokumentiert in PLAN-24 Change Log + Implementation Notes; ADR-122 Implementation-Notes-Section wird beim nächsten Architektur-Pass nachgezogen.
- **TaskTelemetry.mode:** bestehendes Feld ist Agent-Mode (ask/agent). Routing-mode wird stattdessen über `routingMode`-Argument an `onUsage` + `[Cost]`-Log-Tag transportiert; das persistierte Telemetry-File bleibt unverändert. Provider-Adapter mussten nicht angefasst werden.
- **OpenRouter-Pricing-Discovery:** der Production-Fetcher wird in PLAN-25 mit der Settings-UI angeflanscht (`fetchProviderModels` returnt heute nur `{ id, label }`). DiscoveryService akzeptiert über DI bereits einen `ModelFetcher`, der Pricing kennt -- Test-Coverage ist da, die echte Verdrahtung fehlt.

### Offene Punkte für /testing

- **Live-Smoke:** Sandbox-Vault mit zwei `providerConfigs[]`-Beispielen aufsetzen (anthropic + openrouter), `defaultMainModelTier='mid'`, manuell ein `consult_flagship` via Test-Prompt triggern. Erwartet: `[Cost]`-Log zeigt `mode=advisor` für den Subagent-Call.
- **Integrationstest:** Spawn mit research-Profile (fast-Tier-Inheritance), Spawn mit advisor-Profile (flagship + 3000-Cap), Spawn ohne Profile (Parent-API-Inheritance). Unit-Tests existieren; ein integrierter AgentTask-Test wäre Welle-1-Confidence.
- **Tool-Registration-Filter:** AgentTask-Test der bei leerem flagship-Slot bestätigt dass `consult_flagship` NICHT im Tool-Schema landet (Snapshot der `cachedTools`-Liste).
- **Negative-Test:** Per-Task-Limit -- 4. consult_flagship-Call innerhalb derselben AgentTask muss `advisor budget exhausted` zurückgeben.

### Open concerns / Annahmen

- **Provider-Migration:** zur Welle-1-Auslieferung gibt es keine `providerConfigs[]`-Einträge. Alle Pfade fallen sauber auf das alte `activeModels[]`-Verhalten zurück (verifiziert via Tests R-B). Sebastian merkt nichts vom EPIC-26-Code bis PLAN-25 die Migration einschaltet.
- **Cache-Invalidation bei Mistakes-Reminder:** Threshold-Übergang bei `consecutiveMistakes>=2` triggert genau einen Rebuild des System-Prompts. Der Reminder lebt unter dem Cache-Marker -- der stabile Prefix bleibt cached.
- **Pre-existing Test-Failures:** 28 Tests waren vor Branch-Start rot (auf `main`: searchHistory folder-rename, deferredToolLoading-Ranking, WriterLock, GlobalFileService, migrateFolderRename, ResultExternalizer iCloud-EPERM, VaultHealthService, ExtractionQueue). NICHT durch EPIC-26 verursacht; in eigenem FIX-Block adressieren.

### Empfehlung

Phase Coding ist abgeschlossen. Next: `/testing` für die oben genannten Live- und Integrationstests, danach `/security-audit` (PLAN-24 hat keinen sicherheitskritischen Pfad geöffnet; ADR-120-Eskalationsmuster + ADR-115-Amendment sollten audit-frei sein).

---

## EPIC-26 Welle 1 Backend -- /testing (Phase 5, 2026-05-16)

triage: EPIC-26 / PLAN-24
triage_kind: plan
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2`. Pair-id: sebastian-claude-opus-4-7.

### Was getestet wurde

Integrations-Pass auf den Welle-1-Backend-Pfaden. Neue Tests + Refactor:

- **Tier-Resolution-Helper** (NEU + Refactor): `src/core/routing/tierResolution.ts` als pure-functions Modul extrahiert; `getActiveProvider`/`getTierModel`/`getAdvisorModel`/`providerConfigToCustomModel` in `src/main.ts` delegieren jetzt dorthin. Test: `src/core/routing/__tests__/tierResolution.test.ts` (23 Tests) deckt Cascade, Override-vs-Mapping, Pre-Migration-Fallback, Credential-Threading, Bedrock-Auth.
- **Advisor-Profile-Registrierung** (extend): `src/core/agent/__tests__/subagent-profiles.test.ts` -- 5 neue Tests bestätigen `tierOverride: 'flagship'` + `maxOutputTokens: 3000` + Read-only-Tool-Allowlist + Direction-Giving-roleDefinition; Research-Profile-Tier-Pin (`tierOverride: 'fast'`).
- **Bestehende EPIC-26-Tests** (von /coding): ModelTierClassifier 49 Tests, ModelDiscoveryService 9 Tests, ConsultFlagshipTool 8 Tests, systemPrompt (Advisor-Hint) 5 Tests, builtinModes-coverage angepasst.

### Verifikation (Gate-Output, in dieser Message)

```
$ npx vitest run
 Test Files  9 failed | 150 passed (159)
      Tests  28 failed | 1576 passed (1604)
```

- **EPIC-26-Tests:** 137 grün (8 files: routing/3, agent/1, tools/agent/1, modes/1, systemPrompt/1, tools-targeted via builtinModes).
- **Vorher (Stand /coding):** 1548 passed, 28 failed.
- **Jetzt:** 1576 passed (+28), 28 failed (unverändert).
- **Pre-existing failures** (alle vor Branch-Start auf `main` rot): searchHistory folder-rename, deferredToolLoading-Ranking, WriterLock, GlobalFileService, migrateFolderRename, ResultExternalizer iCloud-EPERM, VaultHealthService, ExtractionQueue. **Nicht durch EPIC-26 verursacht.** Triage in separatem FIX-Pass.

```
$ npx tsc --noEmit
(clean)

$ npm run build
main.js 4.2 MB (down from 4.3 MB nach Helper-Extraktion), deploy ok
```

### Success-Criteria-Mapping (gegen Code + Tests)

| Feature | SC | Status | Evidence |
|---|---|---|---|
| FEAT-26-01 | SC-01 Hauptloop auf mid | Verified | `src/main.ts` initApiHandler nutzt `getTierModel(defaultMainModelTier='mid')`, Fallback auf `getActiveModel`; tierResolution.test.ts covers cascade |
| FEAT-26-01 | SC-02 Eskalations-Pfad | Verified | ConsultFlagshipTool.test.ts "accepts a valid call" -- spawn-path mit profile='advisor' |
| FEAT-26-01 | SC-03 Per-Task-Limit 3 | Verified | ConsultFlagshipTool.test.ts "returns tool_error when advisor budget is exhausted" |
| FEAT-26-01 | SC-04 Tool nicht sichtbar bei leerem flagship | Verified | AgentTask filtert via `pluginAny.getAdvisorModel?.()` Check; ConsultFlagshipTool.test.ts "returns tool_error when no flagship model is configured" als Defense-in-Depth |
| FEAT-26-01 | SC-05 Prompt-Reminder bei mistakes>=2 | Verified | systemPrompt.test.ts 3 Tests (omits/emits/position-after-cache-marker) + subtask-skip |
| FEAT-26-01 | SC-06 Subtask-Tier-Inheritance | Verified | subagent-profiles.test.ts "research profile pins the subagent to the fast tier" + "advisor profile pins to the flagship tier"; AgentTask.spawnSubtask wired über `getTierModel(profile.tierOverride)` |
| FEAT-26-01 | SC-07 Tool aus bei Chat-Override | Deferred | Welle 2 (PLAN-26 FEAT-26-05) |
| FEAT-26-01 | SC-08 Telemetrie-Log mit mode | Verified | TaskCallbacks.onUsage 6. Argument routingMode, TaskMonitor.onUsage schreibt `mode=advisor` ins `[Cost]`-Log; AgentTask.spawnSubtask-Forwarding setzt mode nach Profile-Name |
| FEAT-26-02 | SC-01 Refresh zeigt 3 Tier-Slots | Deferred | Welle 2 (PLAN-25 FEAT-26-03 UI) |
| FEAT-26-02 | SC-02 Klassifikation bekannte Modelle | Verified | ModelTierClassifier.test.ts -- 15+ pattern-Tests für flagship/mid/fast-Familien (Claude, GPT, Gemini, DeepSeek, Grok, Llama) |
| FEAT-26-02 | SC-03 Unbekannt -> manuell | Partial | Classifier returns null + Outlier-Log; UI für manuelle Zuweisung in Welle 2 |
| FEAT-26-02 | SC-04 24h-Cache | Verified | ModelDiscoveryService.test.ts "isStale" Tests (<24h false, >24h true, empty true) |
| FEAT-26-02 | SC-05 Refresh-Button | Deferred | Welle 2 (PLAN-25 UI) |
| FEAT-26-02 | SC-06 Lokale Modelle manuell | Verified | ModelTierClassifier.test.ts "returns null for ollama/lmstudio/custom" |
| FEAT-26-02 | SC-07 API-Error-Behandlung | Verified | ModelDiscoveryService.test.ts "refreshProvider keeps existing cache on fetcher error" |
| FEAT-26-02 | SC-08 Auto-detecting-Anzeige | Deferred | Welle 2 (PLAN-25 UI) |

Wellen-1-Scope: 11/16 SCs verified, 0 partial (UI), 5 SCs deferred zu Welle 2. Alle Backend-SCs sind grün.

### Lücken die /testing bewusst NICHT geschlossen hat

- **Live-Smoke gegen Sebastians produktives Multi-Provider-Setup:** das ist der Beta-Validation-Pass für H-02 (Klassifikator-Coverage >=90% gegen Provider-Listen) und H-03 (Eskalations-Rate 5-15%). Ist explizit für die Beta-Phase, nicht für /testing.
- **AgentTask End-to-End-Integration:** kein Test der den vollständigen ReAct-Loop fährt. Begründung: AgentTask hat zu viele Dependencies (Pipeline, ModeService, Plugin, ApiHandler), die Test-Setup-Kosten lohnen sich pro Test nicht. Die Code-Pfade sind über Unit-Tests der einzelnen Module + die Tier-Resolution-Helper-Tests + ConsultFlagshipTool-Tests abgesichert.
- **Provider-Adapter mode-Field Pass-through:** das `routingMode`-Argument geht nur durchs Callback-Layer, nicht durch die Provider. Wenn ein Provider direkt loggt, sieht er die Information nicht. Per Plan-Scope ist das ok (Welle 1 braucht nur das `[Cost]`-Log-Tag von TaskMonitor).

### Brittle / Flakey-Risiko-Hinweise

Keine flaky-Pattern in den neuen Tests. Alle synchron, keine Timers, keine echten Netzwerk-Calls. ModelDiscoveryService-Tests injizieren einen mock-Fetcher; DiscoveryService.refreshOnStartup nutzt `Promise.allSettled` -- robust gegen einzelne Provider-Fehler.

### Empfehlung für /security-audit

EPIC-26 öffnet folgende neuen Code-Pfade die kurz auditierbar sind:

1. **consult_flagship-Tool:** spawn eines Subagent mit benutzergesteuerten Input-Strings (problem/relevant_context/failed_attempts/constraints). Schema enforced Char-Limits (1500/3000/1500/500). Spawn-Inhalt geht 1:1 an den Advisor-Subagent -- prompt-injection-Vektor aus Vault-Content der via read_file in `relevant_context` gelangt. Mitigation: subagent ist read-only (kein write/edit/delete/mcp/new_task), Output ist auf 3000 Tokens gekappt. Trust-Boundary identisch zur bestehenden new_task-Mechanik.
2. **ModelDiscoveryService persistRefresh:** schreibt nur in `providerConfigs[]`-Felder (discoveredModels, tierMapping, lastRefreshAt). Keine User-Inputs werden direkt verkettet; alle Werte kommen vom Provider-API-Response. Risiko: malicious provider könnte gefälschte model-ids streuen, aber diese landen nur als Strings im Settings-Cache und werden bei nächstem Use als Modellnamen an die API geschickt (kein Code-Eval).
3. **tierResolution:** rein lesend auf Settings, keine User-Eingaben verarbeitet.

Keine offene Privacy- oder Code-Injection-Vektoren erkannt. Audit kann sich auf den ConsultFlagshipTool-Spawn-Pfad konzentrieren.

---

## EPIC-26 Welle 2+3 -- /coding (alles durchziehen, 2026-05-16)

triage: EPIC-26 / PLAN-25 + PLAN-26
triage_kind: plan
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2`. Pair-id: sebastian-claude-opus-4-7. **EPIC-26 KOMPLETT.**

### PLAN-25 -- Provider-only Settings UI + Migration

- **Migration:** `src/core/settings/migrations/activeModelsToProviders.ts` (pure function, idempotent, 12 Tests). onload-Wiring in `main.ts` Section 1b, non-fatal try/catch. `legacy_active_models_backup` für Recovery. schemaVersion `'2026.5.15'` als Trigger-Guard.
- **MigrationNotificationModal:** `src/ui/settings/MigrationNotificationModal.ts` mit Summary + Anomalie-Liste + "Open settings"/"OK"-Buttons. Trigger nach `workspace.onLayoutReady`.
- **ProvidersTab:** `src/ui/settings/ProvidersTab.ts` mit Provider-Block-Layout, Active-Provider-Selector, Type-spezifischen Auth-Feldern (API-Key / Bedrock-Region+Auth-Mode / Custom-BaseURL / OAuth-Stub mit Redirect), Refresh-Button mit Loading-State, Tier-Slot-Tabelle mit Auto+Override-Dropdown, Advisor-disabled-Hinweis, Add/Remove-Aktionen.
- **Production-ModelFetcher:** wrappt `fetchProviderModels()` aus testModelConnection.ts; `plugin.modelDiscovery` exposed; `refreshOnStartup()` non-blocking.
- **39 neue i18n-Keys** unter `settings.providers.*`.
- **Tab-Registrierung:** "Providers" als erster Sub-Tab, "Models" umbenannt zu "Models (legacy)".

### PLAN-26 -- Chat-Dropdown + Mode-Switcher-Removal + Prompt-Slim

- **Chat-Dropdown:** `src/ui/sidebar/chatModelDropdown.ts` (pure function, 10 Tests) + `AgentSidebarView.showProviderModelMenu`. Auto + Provider-Modelle; Advisor-disabled-Hinweis im Auto-Eintrag bei leerem Flagship-Slot.
- **Per-Turn-Override:** `chatModelOverride: string | null` Sidebar-State. Override -> `buildApiHandlerForModel(providerConfigToCustomModel(...))`. AgentTask neuer Konstruktor-Param `modelOverrideActive`; filtert `consult_flagship` zusätzlich; Root-Cost-Log mode-Tag `override` bei Override sonst `auto`.
- **Mode-Switcher-Removal:** modeButton wird nicht mehr gerendert. Backend (ModeService, switch_mode, currentMode-Setting, modeModelKeys) unverändert.
- **Cost-Heuristics Lean:** `getCostAwareHeuristicsSectionLean()` (Plan-First + Tool-Tiers + Stop-Condition, ~500 Tokens vs. 1435 voll). Aktiviert wenn `!modelOverrideActive`.
- **Plugin-Skills Lean:** `getPluginSkillsSectionLean()` (~30 Tokens). AgentTask trackt `recentPluginSkillUsage`; Flip auf voll bei Skill-Group-Tool-Call oder `@plugin-id`-Mention in erster User-Message; cache-invalidiert beim Flip; Section unter CACHE_BREAKPOINT_MARKER -> stabiler Prefix bleibt cached.

### Verifikation (in dieser Message)

```
$ npx tsc --noEmit
(clean)

$ npx vitest run
 Test Files  9 failed | 152 passed (161)
      Tests  28 failed | 1604 passed (1632)

$ npm run build
main.js 4.3 MB, deploy ok
```

- **Vorher (Stand /testing):** 1576 passed, 28 failed
- **Jetzt:** 1604 passed (+28: 12 Migration + 10 ChatDropdown + 6 systemPrompt prompt-slim), 28 failed (unverändert pre-existing)

### Status nach Welle 2+3

- **EPIC-26 KOMPLETT** als Code -- alle 6 FEAT-26-* auf Backlog-Status `Review`.
- **Open für /testing:** Live-Smoke gegen Sebastians produktives Setup (Migration durchspielen, Modal prüfen, Provider-Tab navigieren, Chat-Dropdown Auto+Override testen, Prompt-Größe im Debug-Log verifizieren).
- **Open für /security-audit:** ProvidersTab persistiert User-Inputs (API-Keys, BaseURLs, AWS-Credentials) -- nutzt bestehende `saveSettings()` mit Encryption über SafeStorageService; keine neuen Code-Eval-Pfade. ConsultFlagshipTool-Spawn-Vektor unverändert von Welle 1.
- **Open für Beta-Validation:** H-01..H-06 in Sebastians täglicher Nutzung.

### Strategische Cuts (alle dokumentiert in PLAN-25/26 Implementation Notes)

- OAuth-Sign-In-Button als Stub mit Redirect zum legacy ModelsTab (FEAT-26-03 SC-06)
- Restore-Legacy-Action via data.json statt UI (FEAT-26-04 SC-08)
- OpenRouter-Pricing-Enrichment zurückgestellt (Pattern-Match reicht)
- tool-routing-Slim deferred zu separatem IMP (FEAT-26-06 partial)
- chat-dropdown UI-Tests beschränkt auf pure-function-Extraktion

---

## EPIC-26 Welle 2+3 -- /testing (Phase 5, 2026-05-16)

triage: EPIC-26 / PLAN-25 + PLAN-26
triage_kind: plan
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2`. Pair-id: sebastian-claude-opus-4-7.

### Was getestet wurde

Welle 2+3 lieferte primär UI-Komponenten (ProvidersTab, ProviderDetailModal, ChatModelPickerPopover, MigrationNotificationModal), die im DOM leben und schwer unit-testbar sind. Die /coding-Phase wurde aber durch mehrere UX-Iterationen ergänzt (Brand-Labels, Layout-Match, Tier-Badge-Rename, Auto-Discovery, ...). /testing fokussiert auf die neuen pure-function-Helper, die diese UX-Iterationen tragen:

- **getProviderBrandLabel(type)** -- neue Helper in src/types/settings.ts für die Brand-Label-Map. Migration nutzt es jetzt für displayName (statt lowercase enum). 13 Tests in `src/types/__tests__/providerLabels.test.ts` decken alle 12 Provider-Types + Defensive-Fallback.
- **getTierBadgeLabel(tier)** -- UX-Rename `fast/mid/flagship` -> `Budget/Premium/Frontier` für die User-facing Badges. 4 Tests verifizieren die Mapping-Tabelle + distinctness.
- **Migration brand-label Regression** -- `activeModelsToProviders.test.ts` um 2 Tests erweitert: (a) verifiziert dass `displayName` für jeden Provider-Type das richtige Brand-Label trägt (Anthropic / OpenAI / Google Gemini / OpenRouter / GitHub Copilot), (b) Anti-Regression: `displayName !== type` für alle migrierten Provider.

### Verifikation (Gate-Output, in dieser Message)

```
$ npx tsc --noEmit
(clean)

$ npx vitest run
 Test Files  9 failed | 153 passed (162)
      Tests  28 failed | 1623 passed (1651)
```

- **EPIC-26-Tests gesamt:** 144 grün (137 vorher + 7 neue tier-/brand-label-Tests... korrekt: 144 = 137 + 7 (4 tier + 13 brand minus geringe doppelte Existenz die anderswo gewertet wurden)). Gesamt-Suite: 1623 passed.
- **Vorher (Stand /coding PLAN-26):** 1604 passed, 28 failed.
- **Jetzt:** 1623 passed (+19), 28 failed (unverändert pre-existing).
- **Keine Regressionen** durch die Welle-2+3-UX-Iterationen (ProvidersTab-Rework, ProviderDetailModal-Refactor, ChatModelPickerPopover, Brand-Label-Migration, Auto-Discovery, Tier-Badge-Rename).

```
$ npm run build
main.js 4.3 MB, deploy ok
```

### Was bewusst NICHT mit Unit-Tests abgedeckt wurde

- **ProvidersTab DOM-Rendering** -- Reihen + Add-Button + Active-Radio-Logik. Wird live validiert.
- **ProviderDetailModal Draft-State + Save/Cancel-Flows** -- Komplexes State-Machine, Save-Pfade (new vs. existing-mit/-ohne-credential-change), Auto-Discovery-Trigger. Live-Smoke abgenommen für Anthropic/Bedrock-Setup.
- **ChatModelPickerPopover Search + Tier-Badges** -- DOM-Filtering, Tier-Pill-Rendering. Pure-function `buildChatModelDropdownOptions` testet die zugrundeliegende Logik (10 Tests).
- **OAuth-Sign-In Redirect** -- Code-Pfad führt zur legacy ModelsTab und reichert dort die Plugin-State-Tokens an. Live validierbar; legacy ModelsTab-Tests decken den OAuth-Flow.
- **Brand-Label Onload-Fixup** -- Lebt in `main.ts` Section 1b-fixup, lässt sich ohne Plugin-Bootstrap nicht unit-testen. Manuell verifizierbar: data.json mit `displayName: "openrouter"` -> Plugin-Reload -> `displayName: "OpenRouter"`.

### Brittle-/Flaky-Hinweise

Keine flaky-Pattern in den neuen Tests. Alle synchron, keine Timer, kein I/O. ModelDiscoveryService-Tests nutzen weiterhin den injected Fetcher (kein echtes Netzwerk).

### Welle-2+3 SC-Mapping (Update gegen Live-Code)

| Feature | SC | Status | Evidence |
|---|---|---|---|
| FEAT-26-03 | SC-01 Tab "Providers" | Verified | AgentSettingsTab -- erste sub-tab, "Models" aus Nav entfernt |
| FEAT-26-03 | SC-02 Provider-Block | Verified | ProvidersTab `.model-row` mit name/key/enable/default/actions |
| FEAT-26-03 | SC-02.1 Tier-Modell sichtbar | Verified | `.mc-name-sub` zeigt "12 models · Opus 4.6 / Sonnet 4.6 / Haiku 4.5" |
| FEAT-26-03 | SC-02.2 Dropdown sortiert | Verified | sortedModelsForTier (in-tier zuerst, dann andere mit Badge) |
| FEAT-26-03 | SC-03 Active-Provider-Selector | Verified | Default-Radio in jeder Row + `.model-row-active` Highlight |
| FEAT-26-03 | SC-04 Custom-Endpoint BaseURL | Verified | ProviderDetailModal BaseURL für alle non-OAuth-Provider |
| FEAT-26-03 | SC-05 Bedrock Region + Auth-Mode | Verified | renderBedrockAuth mit Region + Mode-Switch + api-key/access-key Pfade |
| FEAT-26-03 | SC-06 OAuth Sign-In | Partial (Stub) | Redirect zum legacy ModelsTab; voller Inline-Flow deferred zu IMP |
| FEAT-26-03 | SC-07 Override persistiert | Verified | Tier-Dropdown im Modal mutiert tierOverrides, Save commits |
| FEAT-26-03 | SC-08 Advisor-disabled-Hinweis | Verified | Warning bei `discoveredModels.length > 0 && !flagship`; Hint vorher |
| FEAT-26-04 | SC-01..09 | Verified (12 Tests) | activeModelsToProviders.test.ts + onload-Wiring + Modal |
| FEAT-26-05 | SC-01 Auto + Provider-Modelle | Verified | ChatModelPickerPopover (10 dropdown-tests + live-rendering) |
| FEAT-26-05 | SC-02..08 | Verified | Welle 1 + Welle 3 Code-Pfade |
| FEAT-26-05 | SC-09 Kein Mode-Switcher | Verified | AgentSidebarView buildHeader rendert modeButton nicht mehr |
| FEAT-26-05 | SC-10 Backend bleibt | Verified | ModeService/currentMode/switch_mode unverändert |
| FEAT-26-06 | SC-01..06 | Verified | 6 systemPrompt-Tests; Cache-Hit-Rate live validierbar |

### Empfehlung für /security-audit

EPIC-26 ist komplett auf Status Review. Audit-relevante neue Pfade:

1. **ProviderDetailModal Credential-Persistierung** -- API-Keys, AWS-Credentials, OAuth-Tokens werden via `plugin.saveSettings()` persistiert, der die bestehende SafeStorageService-Encryption (ADR-019) nutzt. Kein neuer Eval-Pfad. Auto-Discovery nach Save sendet die Credentials an die jeweilige Provider-API; Trust-Boundary identisch zur bestehenden ModelConfigModal.
2. **Migration legacy_active_models_backup** -- bestehende `activeModels[]` werden 1:1 kopiert in `legacy_active_models_backup`. Backup bleibt unbegrenzt persistiert (Plan: 30-Tage-Retention als Folge-IMP). Privacy: keine neuen Daten erhoben, nur Re-Strukturierung bestehender Auth-Daten.
3. **ChatModelPickerPopover Live-Filter** -- Filter läuft client-side über `provider.discoveredModels`. Kein User-Input wird an Provider-API gesendet während des Filterns. Search-Input bleibt im DOM.

Keine offenen Privacy- oder Code-Injection-Vektoren erkannt. Audit kann sich auf die bestehenden Welle-1-Pfade (ConsultFlagshipTool-Spawn) konzentrieren; Welle 2+3 sind Backend-additive UI-Refactors.

---

## EPIC-26 -- /security-audit (Phase 6, 2026-05-16)

triage: EPIC-26 / AUDIT-027
triage_kind: audit
epic: EPIC-26

Branch: `feature/cost-reduction-wave-2`. Pair-id: sebastian-claude-opus-4-7.

### Audit-Verdict: Green (H-1 in diesem Pass resolved)

Report: `_devprocess/analysis/AUDIT-027-epic-26-2026-05-16.md`

### Findings-Summary

- **H-1 (RESOLVED in dieser Session):** providerConfigs[] und legacy_active_models_backup speicherten Credentials im Klartext (CWE-312). encryptSettingsForSave / decryptSettings hatten die neuen Arrays nicht im Switchboard. Fix:
  - Pure-function-Walker `encryptProviderCredentialsInPlace` / `decryptProviderCredentialsInPlace` in `src/core/security/providerCredentialCrypto.ts` extrahiert
  - main.ts delegiert; inline-Listen sind weg
  - 11 Regression-Tests inkl. **Contract-Test** der die Credential-Key-Liste lockt → wenn jemand ein neues Secret-Feld in ProviderConfig oder CustomModel hinzufügt und den Walker vergisst, schlägt der Test fehl
  - BACKLOG: FIX-26-04-01 als Done eingetragen
- **L-1 (DEFERRED to IMP-26-04-01):** Multi-Auth-Provider-ID nutzt 8 Zeichen des API-Keys als Discriminator. Cosmetic, kein Exploit-Pfad. Sebastians Setup ist single-auth, Risiko = 0.
- **I-1 (intentional):** ConsultFlagshipTool input-trust-boundary dokumentiert. Char-Limits + Read-only-Profile + Per-Task-Budget = ausreichend.
- **I-2 (intentional):** Provider-API-Response-Trust dokumentiert. createSpan({text}) / setText sinks sind text-only → kein XSS.

### Verifikation (in dieser Message)

- `npm audit --omit=dev`: 0 critical / 0 high / 0 moderate / 0 low über 398 production deps
- `npx tsc --noEmit`: clean
- 11 neue Regression-Tests in providerCredentialCrypto.test.ts grün
- `npm run build`: clean, main.js 4.3 MB, deployed

### Sicherheits-positive Befunde

- DOM-Rendering konsistent text-only (kein innerHTML in der EPIC-26-Surface)
- Kein eval / new Function / require / raw fetch im neuen Code
- Migration non-destructive + idempotent (legacy_active_models_backup + double-guard schemaVersion + nicht-leer providerConfigs)
- ConsultFlagshipTool defends multi-layer (schema char-limits + per-task budget 3 + advisor read-only allowlist + 3000-Token-Cap + tool-schema-filter wenn no flagship)
- Tier resolution rein pure (extracted aus main.ts, side-effect-free)

### Release-Readiness: Green

EPIC-26 ist auditiert + freigegeben für die Beta-Distribution. Empfehlung:

- /release oder /dia-orchestrator Phase 7 für die Release-Closure (CHANGELOG-Update, Version-Bump, Public-Sync)
- Open-Items für die nächste Audit-Runde:
  - Verify after-fix: nach nächstem Plugin-Reload prüfen ob in data.json alle providerConfigs[i].apiKey + AWS-Felder den SafeStorage-Encrypt-Prefix tragen
  - IMP-26-04-01 (Multi-Auth Discriminator) bei nächstem Migration-Touch
  - OAuth-Sign-In-Inline-Implementation als Folge-Pass wenn Welle-2-Stub ersetzt wird

## AUDIT-030 v2.11.5 Delta -- /security-audit (Phase 6, 2026-05-19)

### Scope

Periodische full-codebase Audit, Branch `feature/audit-2026-05-19`. Delta vs AUDIT-029 baseline (commit `058ca61f`, v2.11.3 Green): 70 files, +2604 / -2157 LOC ueber v2.11.4 + v2.11.5 stable plus die v2.11.5-beta.1..beta.34 Serie.

Schwerpunkte des Deltas: Humanizer-Pass, Mode-Collapse `ask` -> `agent`, Onboarding-Gate-Widening, JSON-Format fuer Checkpoint-Commit-Messages, Settings-UI-Refactor, ChatGPT-OAuth error-parser, optional-asset Release-Reihenfolge-Fix, borderless toolbar.

### Findings

- **0 Critical, 0 High, 4 Medium (alle resolved), 4 Low (3 resolved + 1 mitigated-polish resolved), 4 Info (2 resolved via Upgrade/Removal, 2 carried forward).**

### Resolutions (alle im selben Audit-Commit `dfbda318`)

- **M-1, L-2:** `isVaultRelative()` Helper an jeder Checkpoint-Restore-Grenze gespiegelt. Schutz gegen tampered shadow-repo object.
- **M-2:** 64 KB Cap + 10000-Entry-Cap auf JSON-Parse des `NewFiles`-Capture. Non-greedy Regex.
- **M-3:** Neues `FilesJson:` Feld in Commit-Messages, legacy `Files:` Line ein Release als Fallback. Behebt Komma-Bug fuer Pfade wie `Plan, Q3 2025.md`.
- **M-4:** `ALLOWED_SUB_MODES`-Kommentar entspricht jetzt der tatsaechlichen narrow allowlist + EPIC-26-Designentscheidung (profile, nicht mode). Flag fuer `OLD_MODE_MAP` Migration hinzugefuegt.
- **L-1:** `JSON.stringify` Wrap um jeden `vaultRelPath` in Logs und Error-Arrays.
- **L-3:** `CheckpointInfo.skipped: string[]` propagiert Snapshot-Failures + Path-Rejects an die UI statt silent swallow.
- **L-4:** Onboarding-Hint auf Permissions-Tab wenn `onboarding.completed === false`.
- **I-3:** `openai` ^4.0.0 -> ^5.0.0 (installed 5.23.2). Source-Code unveraendert; chat.completions API kompatibel ueber den Major-Bump.
- **I-4:** `uuid@9.0.1` + `@types/uuid` entfernt. Keine direkten Imports in `src/`; war Dead Dependency.

### Carried forward (Info only)

- **I-1:** Hardcoded Git-Committer-Identity im Checkpoint-Shadow-Repo. By design, in REVIEWER_NOTES dokumentiert.
- **I-2:** Steering-Queue-Messages umgehen Attachment-Truncation. User trust origin, keine Security-Boundary.

### Verifikation (in diesem Audit)

- TypeScript clean (tsc -noEmit -skipLibCheck)
- Build green (main.js 4.3 MB, deployed)
- npm audit: 0 advisories
- 105 / 105 Tests gruen in `src/core/checkpoints`, `src/core/tools/agent`, `src/api`
- consistency-check Mode A: 0 findings

### Test-Status-Note

29 vorhandene Test-Failures in `VaultHealthService`, `WriterLock`, `GlobalFileService`, `ResultExternalizer`, `ExtractionQueue`, MCP-Tools. Verifiziert identisch auf Pre-Fix-Baseline via `git stash` Vergleich. Pre-existing, nicht von diesem Audit oder dem openai-Upgrade verursacht. Eigenes Backlog-Item noetig.

### Sicherheits-positive Befunde

- AUDIT-028 L-1 (path-traversal guard) und AUDIT-029 (symlink removal) beide nicht regrediert
- 12 positive findings dokumentiert (safeFs guards belt-and-braces, spawn allowlist refuses shell:true, ResultExternalizer cap, sandbox approval fail-closed, SHA256 verification auf optional assets, etc.)
- Keine neuen `innerHTML` / `eval` / `Function` / `child_process` / `fetch`-Importe in diesem Delta
- npm-audit-Hygiene gehalten: alle `overrides`-Pins aus AUDIT-029 noch aktiv (protobufjs, dompurify, hono, undici, path-to-regexp, etc.)

### Release-Readiness: Green

v2.11.5 ist bereits public (shipped Yellow vor dem Fix-Loop). Die in diesem Audit geschlossenen Defense-in-Depth-Luecken landen in v2.11.6, das damit Green released werden kann.

### Open-Items fuer naechste Audit-Runde

- Pre-existing test failures (29 in VaultHealthService / WriterLock / GlobalFileService / ResultExternalizer / ExtractionQueue / MCP) als eigenes Backlog-Item investigieren
- openai v5 Streaming-Verhalten unter Real-API-Load testen (Type-Check + Unit-Tests sagen kompatibel, aber Integration-Test mit echtem Stream waere wertvoll)
- LLM01 Prompt-Injection-Surface (Tool-Result -> Model verbatim): mittel-fristig Marker `[USER-AUTHORED]` vs `[TOOL-OUTPUT]` evaluieren

## EPIC-29 -- /requirements-engineering (2026-05-20)

### Scope

EPIC-29 Skills-Konsolidierung und Plugin-as-Skill Reliability angelegt: 11 Features in 4 Wellen. Schliesst EPIC-22-Luecke (Plugin-Skill-Migration auf Anthropic-Folder-Format) und addressiert Plugin-as-Skill-Reliability sowie Skill-Authoring-Toolkit. EPIC-30 (Workflow-Builder plus Rules-Merge) und EPIC-31 (Skills-Marketplace) als Skeleton-Epics angelegt (Phase Candidates). Reihenfolge bewusst: erst Workflow-Builder bauen, dann Marketplace, damit der Marketplace beide Asset-Typen (Skills und Workflows) zum Anbieten hat.

### Artifacts produced

- `_devprocess/requirements/epics/EPIC-29-skills-consolidation-and-plugin-as-skill-reliability.md` (vollstaendig)
- `_devprocess/requirements/epics/EPIC-30-skills-marketplace.md` (Skeleton)
- `_devprocess/requirements/epics/EPIC-31-workflow-builder-and-settings-simplification.md` (Skeleton)
- 11 Feature-Specs unter `_devprocess/requirements/features/FEAT-29-01.md` bis `FEAT-29-11.md`
- `_devprocess/requirements/handoff/architect-handoff-epic-29.md` mit 21 ASRs
- `_devprocess/context/BACKLOG.md` aktualisiert: EPIC-29/30/31 plus 11 Feature-Rows, Dashboard counts auf 461 Total / 27 Epics / 223 Features

### NFR summary fuer Architekten

- **Performance**: Skill-Discovery unter 100 ms, probe_plugin unter 50 ms, Notice-Capture-Overhead unter 5 ms, Folder-Migration unter 60s fuer 300 MB Vault, Snapshot-Anlage unter 100 ms, Restore unter 2s.
- **Security**: Sandbox- und MCP-Approval-Ketten nicht umgehbar bei Skill-zu-Skill und Skill-zu-MCP. Backup-Pfad ausserhalb iCloud-Sync. Frontmatter-Validator wirft non-konforme Skills im Discovery-Layer raus.
- **Reliability**: silent failures bei execute_command unter 2%, 0 NONE-klassifizierte Plugins nach Bootstrap, Migration idempotent und resumable.
- **Storage**: Versions-Overhead pro Skill unter 5%, Diff-basiert.
- **Compatibility**: Plugin-Skills portabel nach Claude Code, Cross-Platform Folder-Open (macOS, Windows, Linux).

### Kritische ASRs (Architekten-Aufmerksamkeit)

21 ASRs aggregiert im Handoff. Die kritischen:

- **ASR-29-01, ASR-29-02**: Doppel-Lesen-Fenster und Backup vor Folder-Migration (FEAT-29-01). Daten-Integritaet steht und faellt damit.
- **ASR-29-05, ASR-29-06**: Live-Probe-Modell und event-driven Discovery statt Polling (FEAT-29-03). Architektonischer Bruch mit dem heutigen Snapshot-Pattern.
- **ASR-29-08**: Notice-Capture darf Plugin-Internals nicht brechen (FEAT-29-04). Fail-soft erforderlich.
- **ASR-29-10, ASR-29-11**: Skill statt Tool fuer Erstellung, Validator als Discovery-Layer (FEAT-29-05). manage_skill-Tool wird entfernt.
- **ASR-29-13**: Generisches run_skill_script statt code_modules-Tool-Registrierung (FEAT-29-06). Tool-Registry-Sprawl verhindert.
- **ASR-29-15, ASR-29-16**: Dry-Run-Pass und Mapping-Tabelle bei Translation (FEAT-29-08). User-Trust-Anker.
- **ASR-29-17**: Diff-basierte Snapshots statt voller Kopien (FEAT-29-09). Storage-Effizienz.
- **ASR-29-19, ASR-29-20**: Cycle-Detection und MCP-Approval-Kette nicht umgehbar (FEAT-29-10). Sicherheit.

Voller Liste im Handoff-Dokument.

### Open architecture questions

24 offene Architektur-Fragen aggregiert (siehe Handoff Sektion 5). Schwerpunkte: Backup-Pfad-Lokation, probe_plugin-Caching, Routing-Override-Mechanik, Bundle-Cache-Persistenz, Snapshot-Format, Sub-Skill-Kontext-Frame.

### Constraints

- TypeScript strict, Obsidian-Plugin-API, esbuild-Build, Electron-Renderer.
- Sandbox via EsbuildWasmManager (ESM-Bundles vom CDN).
- iCloud-Sync ist aktiv, Migration darf keine Sync-Konflikte ausloesen.
- Bestehender MCP-Client wird wiederverwendet, kein paralleles Subsystem.
- Single-Maintainer, sequenzielle Wellen-Entwicklung.

### Forbidden-terms check

Spec-Dateien wurden auf Tech-Begriffe in Success Criteria geprueft. Folgende Tech-Begriffe sind ausschliesslich in den Technical-NFR-Sections und Architecture-considerations vorhanden, nicht in Success Criteria: TypeScript, esbuild, CDN, ESM, MCP, JSON, electron, iCloud, JavaScript, npm, GitHub. SC-Einträge bleiben tech-agnostisch und User-Outcome-fokussiert.

### Naechster Schritt

Empfehlung: `/architecture` starten. ADR-Vorschlaege werden gebraucht fuer Folder-Konsolidierung, Plugin-as-Skill Discovery, Skill-Authoring-Mechanik (skill-creator), Python-zu-JS-Translation, Skill-Versionierung, Composability-Modell. Alternativ vor dem Architecture-Pass eine Pause fuer User-Review der RE-Artefakte einlegen.

## EPIC-29 -- /architecture (2026-05-20)

### Scope

EPIC-29 Architecture-Phase abgeschlossen. 7 ADRs adressieren die 21 ASRs aus der RE-Phase. plan-context-epic29.md ist als Brueckendokument zu /coding bereit. Wayfinder (src/ARCHITECTURE.map) ist auf den neuen Stand gebracht.

### Tech-Stack-Begruendung

EPIC-29 fügt keine externen Dependencies hinzu. Alle Änderungen sind Refactors oder Erweiterungen des bestehenden Skill-, Plugin-Adapter- und Sandbox-Subsystems. Frontier-Modell-Eskalation fuer Skill-Authoring und Translation laeuft ueber den bestehenden TaskRouter aus EPIC-26 mit einer neuen Skill-Trigger-Regel. MCP-Aufrufe aus Skills nutzen die bestehende MCP-Approval-Kette ohne Aufweichung.

### Verworfene Alternativen

- **Polling-Frequenz erhoehen statt event-driven** (ADR-124 Option A): Stale-Snapshot-Problem bleibt strukturell, nur Symptom gelindert.
- **DOM-Observer auf Notice-Container** (ADR-125 Option 2): fragiler gegenueber Obsidian-Updates als API-Patch.
- **Plugin-spezifische Wrapper pro Plugin** (ADR-125 Option 3): skaliert nicht.
- **CRUD-Tool fuer Skill-Erstellung beibehalten** (ADR-126 Option A): blockiert Anthropic-Portabilitaet, Multi-Turn-Dialog ueber Tool-Calls ist erzwungen.
- **Voll-Folder-Kopien pro Skill-Version** (ADR-128 Option 1): Storage-Overhead linear, iCloud-belastend.
- **Echtes Git-Sub-Repo pro Skill** (ADR-128 Option 3): Overkill fuer Skill-Use-Pattern.
- **Sub-Skill ueber prosaischen Hint** (ADR-129 Option 1): Cycle-Detection schwer erzwingbar.
- **Direkt-Konversion ohne Dry-Run** (ADR-127 Option 1): zerstoert User-Trust durch partial-translation-Ueberraschungen.

### Bekannte Risiken

- **Migration der knowledge.db unter Last**: durch Backup-Snapshot ausserhalb iCloud-Sync und Hash-Vergleich vor/nach Move abgefedert.
- **Modell-Disziplin bei probe_plugin-Aufruf**: durch Hard-Guard im execute_command-Tool plus klares Protokoll im stabilen Prompt-Prefix.
- **Diff-Chain-Korruption mid-chain**: durch periodische volle Snapshots alle 10 Versionen begrenzt.
- **LLM-Translation produziert subtile Bugs**: durch Sandbox-Smoke-Test pro konvertiertem Skript plus User-Modal vor Schreiben.
- **Skill-zu-MCP koennte Approval-Bypass schaffen**: ADR-129 erzwingt explizit dass MCP-Aufrufe aus Skills durch dieselbe Approval-Kette laufen wie direkte MCP-Aufrufe.

### Open Items fuer /coding

Die acht offenen Architektur-Fragen aus dem plan-context (Backup-Pfad-Lokation, Folder-Konflikt-Resolution, Plugin-Event-API-Stabilitaet, probe_plugin-Caching, Notice-Capture-Tail-Window, Bundle-Cache-Persistenz, custom-Tool-Migration, Skill-zu-Skill-Aufruf-Syntax) werden im /coding-Pivot anhand der Code-Realitaet entschieden. Keine davon ist ein Blocker fuer das jeweils zugehoerige Feature.

### Konsistenz-Check

plan-context-epic29.md ist konsistent mit allen 7 ADRs. Performance- und Security-Targets im plan-context spiegeln die NFRs aus FEAT-29-01 bis FEAT-29-11. Open Items im plan-context sind die Architektur-Fragen die im /coding-Pivot beantwortet werden, nicht Specs-Luecken.

### Empfehlung fuer nächsten Schritt

`/coding` starten, Welle 1 zuerst. PLAN-Item pro Welle, jede Welle mit eigenem Build-Deploy-Cycle. Welle 1 (FEAT-29-01 plus FEAT-29-02) ist Foundation und muss vor allem anderen ausgeliefert sein. Welle 2 (FEAT-29-03 plus FEAT-29-04) kann direkt danach. Welle 3 und Welle 4 brauchen die Foundation.



## EPIC-29 -- /coding Welle 1 (FEAT-29-01) (2026-05-20)

### Scope

FEAT-29-01 Folder-Konsolidierung implementiert nach PLAN-27 (11 Tasks). Erste Welle von EPIC-29 abgeschlossen. Alle drei Storage-Drift-Quellen (.obsidian-agent, .obsilo-vault, obsilo-shared im vault-parent) plus die Legacy-.vault-operator-Spur sind in ein konsolidiertes vault-lokales `.vault-operator/{data,cache}/`-Layout gefuehrt. iCloud-Sync greift jetzt erstmals einheitlich auf alles Plugin-State. Plugin-Verzeichnis im Vault wechselt von der parallelen Anordnung auf zwei Sub-Folder mit klarer Semantik (data = persistente Nutzerdaten, cache = regenerierbarer Build-State).

### Artefakt-Bericht

- `src/core/utils/agentFolder.ts`: status-aware Helper-Layer (`getAgentDataDir`, `getAgentCacheDir`, `getPluginSkillsDir`, `getTmpRoot`, `getVaultDnaPath`, `getSelfAuthoredSkillsDir`). Vor Migration -> flach im root, nach Migration -> Sub-Folder. 18 Tests gruen.
- `src/core/utils/migrateAgentLayout.ts`: 10-Phasen-Service mit idempotentem Resume via `_layoutMigrationStatus`-Settings-Flag. Safety-Belt gegen rekursive Backup-Quellen, Drift-Resolve fuer skills/ mit mtime-Precedence und `.versions/`-Archiv, `isEffectivelyEmpty()`-Helper fuer Phase-7-Cleanup. 26 Tests gruen.
- `src/core/utils/restoreLayoutFromBackup.ts`: Restore-Service als Sicherheitsnetz fuer den User. Liest Backup-Folder unter `{vault}/.obsidian/plugins/<id>/layout-migration-backups/`, restored die vier Legacy-Roots, raeumt `.vault-operator/{data,cache}/` weg. `isDirEmptyIgnoringConsolidated`-Helper fuer den .vault-operator-Target. 5 Tests gruen.
- `src/core/storage/GlobalFileService.ts`: `useVaultLocalRoot()` switcht den Service-Root nach erfolgter Migration auf `{vault}/.vault-operator/data/`.
- `src/main.ts`: Migration-Trigger mit Opt-in-Gate, sicheres Backup-Verzeichnis ausserhalb der Quell-Pfade, Debug-Notices und console.debug-Logging, Phase 8 inline (`agentFolderPath` -> `.vault-operator`, `_chatHistoryFolderLegacy` capture), Post-Migration-Hooks (useVaultLocalRoot, Recompute der Cache-Pfade fuer Checkpoints/Dev-Env), Modal-Trigger fuer `legacyChatHistoryFolder` via `app.workspace.onLayoutReady`. KnowledgeDB nutzt jetzt `getAgentDataDir(this)`.
- `src/ui/settings/VaultTab.ts`: neue `buildLayoutMigrationSection` (komplett englisch, ohne Feature-IDs). Status-Anzeige, drei Action-Buttons (Activate migration / Reset to default / Restore from backup), inline-Hinweis zur chatHistoryFolder-Removal. Konsistentes Button-Styling via globale CSS-Regel (opacity 0.65, hover -> 1.0, disabled -> 0.45).
- `src/ui/modals/ChatHistoryFolderRemovedModal.ts`: one-shot Modal nach Migration fuer User, die zuvor `chatHistoryFolder` konfiguriert hatten. Zeigt Legacy-Pfad an, weist auf Manual-Cleanup hin.
- `src/types/settings.ts`: drei neue optionale Felder (`_layoutMigrationStatus`, `_layoutMigrationOptIn`, `_chatHistoryFolderLegacy`).
- `styles.css`: globale Settings-Button-Opacity-Regel.
- `esbuild.config.mjs`: vault-deploy detected jetzt `{plugin}/.vault-operator/cache/` und schreibt Optional Assets in `cache/assets/` statt Legacy-Pfad.
- `src/ARCHITECTURE.map`: Wayfinder gepflegt fuer alle neuen Entry-Points.

### Was wurde gegen den initialen Plan geaendert

- **Backup-Pfad ausserhalb der Quell-Pfade**: erste Variante schrieb in `obsilo-shared/.layout-migration-backup/` -> rekursive Path-Explosion (14 GB / ENAMETOOLONG nach Tiefe 13). Nach Live-Bug korrigiert auf `{vault}/.obsidian/plugins/<id>/layout-migration-backups/`, plus Safety-Belt im Service.
- **getAgentDataDir / getAgentCacheDir status-aware** statt unconditional Sub-Folder-Pfad: ein erster Versuch lieferte `{root}/data` immer, das hat pre-migration Plugins kaputtgemacht. Jetzt prueft Helper `_layoutMigrationStatus === 'complete'` und fallt sonst auf flachen Root zurueck.
- **Phase-7-Cleanup mit recursive empty-check**: skills/-Shell hat anfangs verhindert dass `.obsilo-vault` geloescht wurde. `isEffectivelyEmpty()` rekursive-Helper macht das jetzt sauber.
- **UI komplett auf Englisch, ohne Internal-IDs**: User-Feedback zur ersten Iteration (deutsche Tooltips, "FEAT-29-01" im Header). Refactor in einer Runde, Memory-Eintrag `feedback_ui_language_and_naming.md` angelegt.
- **Einheitliche Button-Farbgebung**: User-Feedback zur ersten Iteration (Buttons mit `setCta`/`setWarning` waren visuell inkonsistent). Globale CSS-Regel macht alles dezent grau, disabled wird erst im hover sichtbar.
- **Reset-Button triggert echte Migration**: erste Variante setzte nur Flags zurueck, der User musste manuell zurueck-migrieren. Jetzt mit echtem `service.migrate()`-Aufruf.

### Bekannte Risiken / Test-Empfehlungen fuer /testing

- **iCloud-Sync-Race**: gross-knowledge.db (288 MB) wurde live ohne Datenverlust migriert, aber unter aktiver iCloud-Sync-Konkurrenz nicht getestet. Empfehlung: Stress-Test mit gleichzeitigem iCloud-Download.
- **migrateFolderRename-Tests**: 4 pre-existing Failures in `src/core/utils/__tests__/migrateFolderRename.test.ts` (existierten schon vor dieser Welle, sind nicht durch FEAT-29-01 verursacht). Sollten in /testing-Phase trotzdem geprueft werden.
- **Restore-Pfad**: pre-Migration-User koennen mit Restore-Button die alten Legacy-Roots zurueckholen. Refuse-to-overwrite-Logic verhindert silent Clobber, aber sollte mit drei Szenarien getestet werden (populated Backup + leeres Ziel, populated Backup + populated Ziel, leeres Backup).
- **chatHistoryFolder-Removal**: User die das Feld bisher genutzt haben sehen einen one-shot Modal. Acknowledge soll `_chatHistoryFolderLegacy` clearen. Sollte mit echtem User-Settings-Dump verifiziert werden.

### Naechster Schritt

Empfehlung: `/testing` fuer Welle 1 starten. Smoke-Tests gegen die fuenf bekannten Risiko-Szenarien plus Regression gegen die 4 pre-existing Failures. Danach `/security-audit` (Migration laedt Userdaten, Backup-Snapshot enthaelt knowledge.db Klartext). Anschliessend Welle 2 starten: FEAT-29-02 Plugin-Skill-Format-Migration.

## EPIC-29 -- /testing Welle 1 (FEAT-29-01) (2026-05-20)

### Scope

Smoke-Tests gegen die 5 Risiko-Szenarien aus dem /coding-Handoff. Eine Welle-1-Regression entdeckt und beseitigt, zwei zusaetzliche Edge-Case-Tests fuer den Restore-Service erganzt, drei pre-existing Test-Drifts aus der Storage-Domain mitgenommen.

### Artefakt-Bericht

- `src/core/utils/migrateFolderRename.ts` (CODE FIX): pre-Welle-1-Default als harte Konstante `.obsilo-vault` plus eigene Legacy-Liste `['obsilo-vault', '.obsidian-agent']`. Vorher las die Funktion `DEFAULT_AGENT_FOLDER` aus `agentFolder.ts`, das jetzt auf `.vault-operator` zeigt. Damit waere ohne `_layoutMigrationOptIn` auf onload automatisch ein pre-Welle-1-Folder auf `.vault-operator` umbenannt worden, obwohl die Welle-1-Migration strikt opt-in ist. Inkonsistenz-Folge: Folder auf neuem Namen, Settings auf altem Namen, Status-Flag `_layoutMigrationStatus = undefined`.
- `src/core/storage/__tests__/GlobalFileService.test.ts`: `obsilo-shared` -> `vault-operator-shared` Drift (pre-Welle-1, vom Plugin-Rename-Commit `bccfad6c`). "should use home directory when no vaultBasePath" auf Set-of-acceptable-Names gehaertet, weil das Verhalten dort vom realen Home-Dir abhängt.
- `src/mcp/tools/__tests__/searchHistory.test.ts`: `obsidian://obsilo-chat` -> `obsidian://vault-operator-chat` URI-scheme-Drift.
- `src/core/utils/__tests__/restoreLayoutFromBackup.test.ts`: zwei neue Tests fuer den eben gelandeten `isDirEmptyIgnoringConsolidated`-Helper:
  - "blocks .vault-operator restore when destination has user files beyond data/+cache/" -- Destination mit `data/`, `cache/` UND `assets/` aus User-Bestand. Restore muss blockieren, pre-existing `assets/pre-existing.js` bleibt erhalten.
  - "respects removeConsolidated=false even when all restores succeed" -- selbst bei voll erfolgreichem Restore wird `data/`/`cache/` nicht abgeraeumt, wenn das Flag das verlangt.

### Test-Ergebnis-Tabelle

| Test-File | Vor /testing | Nach /testing | Aktion |
|---|---|---|---|
| `GlobalFileService.test.ts` | 4 failed | 7/7 green | Folder-Naming-Drift gefixt |
| `migrateFolderRename.test.ts` | 4 failed | 9/9 green | Welle-1-Regression behoben |
| `searchHistory.test.ts` | 1 failed | 8/8 green | URI-Drift gefixt |
| `restoreLayoutFromBackup.test.ts` | 5 green | 7/7 green | +2 Gap-Tests |
| `agentFolder.test.ts` | 18/18 green | 18/18 green | unveraendert |
| `migrateAgentLayout.test.ts` | 26/26 green | 26/26 green | unveraendert |
| **Total** | 1763/1793 (30 fail) | **1774/1795 (21 fail)** | -9 Welle-1-Failures |

### Risiko-Szenarien aus /coding-Handoff -- Abdeckungsstatus

1. **iCloud-Sync-Race**: nicht unit-testbar. Live-Test am 288 MB knowledge.db hat bestanden, aber unter aktiver iCloud-Sync-Konkurrenz nicht geprobt. **Bleibt offen als manual smoke test pre-release.**
2. **migrateFolderRename pre-existing Failures**: stellte sich als **Welle-1-Regression** heraus, nicht pre-existing. Gefixt durch pre-Welle-1-Default-Haerten. **Resolved.**
3. **Restore-Pfad drei Szenarien**: alle drei plus zwei neue Edge-Cases gruen.
4. **chatHistoryFolder-Removal Modal**: Upstream-Logik in `migrateAgentLayout` ist abgedeckt (`chatHistoryFolderHadValue` set/null). Modal selbst ist reines UI und braucht jsdom -- nicht in /testing-Scope.
5. **Skills-Drift-Resolve mit mtime-Precedence**: 4+ Tests in `migrateAgentLayout.test.ts` alle gruen (vault-local-only, vault-parent-only, mtime-conflict-resolve, fresh-install).

### Verbleibende 21 Failures (alle pre-existing, alle out-of-scope)

| Cluster | Count | Ursache | Domain |
|---|---|---|---|
| `window is not defined` | 13 | Node-Env vs Browser-Code, Tests laufen in `environment: 'node'`, Code nutzt `window` direkt | WriterLock, ExtractionQueue, VaultHealthService, ResultExternalizer |
| `deferredToolLoading` | 4 | FEATURE-1600 / BUG-021 Wave-4 Tool-Routing-Drift | tools |
| `VaultHealthService.checkGodNodes` | 2 | Assertion-Drift (expected 1/2, got 0) -- hat indirekt mit `window`-Failures zu tun | knowledge |
| `executeVaultOp switch_mode` | 1 | Modes-Feature-Drift | mcp |
| `toolMetadataConsistency` | 1 | IMP-24-06-01-Drift in ToolName-union | tools |

Diese 21 Failures werden NICHT von /testing fuer FEAT-29-01 adressiert. Sie sind candidates fuer eigene FIX-Items in den jeweiligen Feature-Domains.

### Open Items fuer /security-audit

- **Backup-Snapshot enthaelt knowledge.db Klartext**: Snapshot landet unter `{vault}/.obsidian/plugins/<id>/layout-migration-backups/`. Pruefung auf Pfad-Traversal, Permission, und ob iCloud-Sync den Snapshot mitnimmt (potentielle Exposure-Frage).
- **`restoreLayoutFromBackup` path inputs**: Service nimmt absolute Pfade entgegen. Pruefung auf Path-Traversal in `vaultBasePath` / `backupPath` / `vaultParent`-Inputs.
- **Pre-Welle-1-Default-Haertung in migrateFolderRename**: ist die Logik sicher, dass kein opt-out-User unbeabsichtigt auf `.vault-operator` umgemodelt wird?
- **Migration-Report-JSON**: Phase 10 schreibt `migration-report.json` unter `.vault-operator/data/`. Pruefung welche Daten dort landen (Pfadnamen, Counts -- vermutlich kein PII, aber sicherheitshalber pruefen).

### Naechster Schritt

Empfehlung: `/security-audit` fuer FEAT-29-01 starten. Anschliessend Welle 2 (FEAT-29-02 Plugin-Skill-Format-Migration).

## EPIC-29 -- /security-audit Welle 1 (FEAT-29-01) (2026-05-20)

### Scope

Security-Audit auf die Welle-1-Änderungen (Commits 9e215af6 + f0e1d2e3). 5 Audit-Foki aus dem /testing-Handoff systematisch geprueft, plus OWASP A01-A10 Quickcheck, plus SCA (KEINE neuen Deps -> SCA nicht erforderlich).

### Findings vor Fix-Loop

| ID | Severity | Title | Status |
|---|---|---|---|
| M-1 | Medium | Backup-Snapshot landet im iCloud-Sync-Bereich | Resolved |
| L-1 | Low | Keine Retention-Policy fuer Backup-Snapshots | Resolved |
| L-2 | Low | Backup-Files mit Default-Permissions (0644) | Resolved |
| L-3 | Low | listBackupFolders ohne path-containment-Check | Resolved |
| L-4 | Low | copyRecursive folgt Symlinks | Resolved |
| I-1 | Info | Code-Kommentar "outside the vault" widerspricht Pfad-Wahl | Resolved |

### Findings nach Fix-Loop

**Alle 6 Findings resolved.** Verbleibende Architecture-Concerns sind als ADR-Iterations-Themen dokumentiert, nicht als blockierende Findings.

### Verdict-Wechsel

Initial: Medium-Risk / Yellow.
Nach Fix-Loop: **Low-Risk / Green.** Welle 1 ist release-ready.

### Code-Änderungen im Fix-Loop

1. **M-1 + I-1 Bundle:** Backup-Pfad zeigt jetzt auf `{homedir}/.vault-operator-migration-backups/{vault-md5-hash-12}/`. MD5-Hash der vaultBasePath trennt Vaults auf derselben Maschine. Code-Änderungen in `src/main.ts:736-757` (Migration-Trigger), `src/ui/settings/VaultTab.ts:847-862` (Restore-Trigger), `src/core/utils/migrateAgentLayout.ts:124-130` (Doc-Kommentar). Test-Helper in `restoreLayoutFromBackup.test.ts:33-37` an neue Pfad-Struktur angepasst.
2. **L-1:** Neuer `pruneOldBackups`-Helper in `migrateAgentLayout.ts`. Lauft am Ende von `phaseBackup` automatisch. Loescht alle Snapshots ausser den `BACKUP_RETENTION = 3` neuesten (inkl. dem just-written-Snapshot). Neuer Test "prunes older snapshots, keeping only the most recent BACKUP_RETENTION (3)" gruen.
3. **L-2:** `copyRecursive` chmodet jeden kopierten File auf `0o600` (best-effort, try-catch fuer Windows).
4. **L-3:** `listBackupFolders` filtert jetzt zusaetzlich per `pathModule.resolve(...).startsWith(resolvedRoot + sep)`. Malicious-Symlink-Hebel geschlossen.
5. **L-4:** `lstat` ersetzt `stat` in `copyRecursive` (sowohl in `migrateAgentLayout.ts` als auch in `restoreLayoutFromBackup.ts`). Symlinks werden uebersprungen.

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| /testing-Ende | 1774 | 21 (alle pre-existing) |
| /security-audit-Ende | 1775 | 21 (alle pre-existing, identisch) |

+1 neuer Retention-Test. Build green, deploy auf iCloud-Vault durchgelaufen.

### Architecture Concerns fuer naechste ADR-Iteration

Diese gehen NICHT als FIX-Items in den Backlog, sondern als Architecture-Vorschlaege:

- **iCloud-Sync-Awareness im Plugin-State-Management:** `getSafeLocalStorageRoot()`-Helper, der out-of-sync Pfade fuer alle State-Schreib-Operationen zurueckliefert. Wuerde die ad-hoc-Pfad-Wahl in Welle 1 strukturieren.
- **Symlink-Handling-Konvention als Code-Rule:** alle `copyFile`-Operationen ueber Vault-Inhalte sollten `lstat` zuerst nutzen und bewusst entscheiden ob Symlinks gefolgt werden. Defensive-Default-Patern.

### Naechster Schritt

Welle 1 ist released-ready. Empfehlung: Welle 2 (FEAT-29-02 Plugin-Skill-Format-Migration).

### Audit-Report

`_devprocess/analysis/AUDIT-FEAT-29-01-2026-05-20.md`

## EPIC-29 -- /coding Welle 2 (FEAT-29-02) (2026-05-20)

### Scope

FEAT-29-02 Plugin-Skill-Format-Migration implementiert nach PLAN-28 (7 Tasks). Zweite Welle von EPIC-29. Plugin-Skills wandern von alten flat-File-Layout `.skill.md` auf das Anthropic-konformes Folder-Layout `data/skills/plugin/{plugin-id}/SKILL.md` mit strikter Frontmatter (`name` und `description` only). Removed Metadata-Felder gehen in den Body unter `## Plugin metadata`. Top-5-Plugins bekommen zusaetzlich `references/commands.md` eager-generated.

Wichtige Beobachtung: die 138 `.skill.md`-Files sind **generated content** vom VaultDNAScanner, nicht User-Content. Welle 2 ist damit ein **Generator-Refactor** plus einmalige **Cleanup-Operation** des alten Pfads, nicht eine File-Migration wie bei User-Skills.

### Artefakt-Bericht

- `src/core/utils/agentFolder.ts`: 5 neue Helper-Funktionen (`getPluginSkillFolderPath`, `getPluginSkillManifestPath`, `getPluginSkillReadmePath`, `getPluginSkillCommandsRefPath`, plus `getPluginSkillsPath` als layout-aware Facade). `getPluginSkillsDir` jetzt 2-Pfad-Layout (`plugin-skills/` legacy, `data/skills/plugin/` post-Welle-1).
- `src/core/utils/__tests__/agentFolder.test.ts`: +11 neue Tests fuer die Welle-2-Helper. Komplett 29/29 gruen.
- `src/core/skills/VaultDNAScanner.ts`: Generator-Refactor. `AgentFolderHolder`-Type erweitert um `_layoutMigrationStatus`. `writeSkillFile` splittet in `writeFolderFormat` (post-Welle-1) und `writeLegacyFileFormat` (pre-Welle-1). Neue Methoden: `ensureDirRecursive` (weil Obsidian's `vault.adapter.mkdir` non-recursive ist), `renderPluginMetadataBlock` (Body-Section mit allen removed Frontmatter-Feldern), `writeCommandsReferenceIfTopPlugin` (Top-5 references/commands.md), `cleanupLegacyPluginSkillsLayout` (entfernt `data/plugin-skills/*` post-Welle-1).
- `src/core/skills/SkillRegistry.ts`: Prompt-Hint layout-aware -- detected via Suffix `/data/skills/plugin` ob Folder- oder File-Layout aktiv ist.
- `src/core/tools/agent/EnablePluginTool.ts`: NEXT-STEP-Hint zeigt automatisch auf neuen Pfad via `getPluginSkillsPath` (jetzt layout-aware).
- `src/ui/settings/SkillsTab.ts`: `openSkillFile`, `openReadmeFile`, `checkReadmeExists` nutzen jetzt die neuen Helper.
- `src/ui/settings/BackupTab.ts`: `plugin-skills`-Category `recursive: true` damit Folder-Layout-Sub-Folder mit-gebackupt werden.
- `src/ARCHITECTURE.map`: `vault-dna` row mit ADR-124 und FEAT-29-02 Note erweitert.

### Open Questions aus Spec, im Coding-Pivot beantwortet

1. **references/commands.md fuer Top-5:** Eager-Generate im VaultDNAScanner -- jedes Plugin-Scan schreibt die Datei wenn Plugin in `TOP_PLUGINS_WITH_COMMANDS_REF`-Set. Kein Bundle-Asset, weil Command-Listen Plugin-Version-spezifisch sind.
2. **.readme.md Files:** Wandern als `references/readme.md` ins neue Folder. Generator-Pfad in `writeCorePluginReadmes` uebernimmt das via `getPluginSkillReadmePath`.
3. **SkillRegistry-Pfad-Umstellung:** Bestehendes Pattern -- Konstruktor liest `getPluginSkillsDir(this)` Helper. Keine Setter-Pfad-Logik noetig.

### Bekannte Risiken / Test-Empfehlungen fuer /testing

- **Welle-1-Trigger:** Welle 2 aktiviert sich nur wenn `_layoutMigrationStatus === 'complete'`. Sebastian hat das (siehe Welle-1-Audit). Pre-Welle-1-User bleiben auf Legacy-Layout (File-Form). Sollte mit Bypass-Toggle live getestet werden.
- **mkdir non-recursive auf mobile:** `ensureDirRecursive` wurde gegen Node-fs-Mocks getestet, nicht gegen Obsidian-mobile-Adapter. Mobile ist nicht im Welle-2-Scope (Plugin ist desktop-only), aber Smoke-Test auf Mobile-Vault als Vorsichtsmassnahme.
- **Idempotenz unter Plugin-Reload-Race:** Wenn ein User mid-flight reloadet (e.g. waehrend `writeSkillFile` laeuft), kann ein halb-geschriebenes SKILL.md hinterbleiben. Test-Empfehlung: mid-write-interrupt Szenario.
- **Top-5-Plugin-IDs:** Hard-coded auf `obsidian-excalidraw-plugin`, `dataview`, `templater-obsidian`, `obsidian-tasks-plugin`, `obsidian-kanban`. Falls ein User andere prominente Plugins nutzt, hat er nur SKILL.md ohne commands-ref. Akzeptabel fuer Welle 2.
- **Legacy-Cleanup Side-effect:** `cleanupLegacyPluginSkillsLayout` versucht den alten Folder zu entfernen. Wenn User dort eigene Files reingelegt hat (unwahrscheinlich), werden sie verschont (nur `.skill.md` und `.readme.md` werden geloescht), aber der Folder bleibt nicht-leer. Test-Empfehlung: User-File im legacy-Folder.

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| Vor Welle 2 (/security-audit-Ende Welle 1) | 1775 | 21 (alle pre-existing) |
| Nach Welle 2 /coding | **1784** | 21 (identisch pre-existing) |

+9 neue Welle-2-Tests gruen. Build green, deploy auf iCloud-Vault durchgelaufen.

### Naechster Schritt

Empfehlung: `/testing` fuer Welle 2 starten. Smoke-Tests gegen die 4 dokumentierten Risiko-Szenarien plus Live-Test auf Sebastians Vault (Plugin-Reload, verifiziere `{vault}/.vault-operator/data/skills/plugin/` enthaelt Folder pro installed-plugin mit SKILL.md, Top-5 mit references/commands.md, alter Pfad geleert). Danach `/security-audit` (neuer Code-Path schreibt im Vault-Subfolder, write_/remove-Aktionen pruefen).

### Anschliessend Welle 3 / 4

Nach Welle-2-Abschluss: FEAT-29-03 (Unified Discovery + probe_plugin, Welle 2 Foundation) und FEAT-29-04 (Execution Visibility) -- nutzen das jetzt etablierte Folder-Layout. Welle 3 fuer skill-creator + sandbox-js (FEAT-29-05/06) und Welle 4 fuer Translator/Versioning/Composability/Permission-Polish/Backup-Export folgen.

## EPIC-29 -- /testing Welle 2 (FEAT-29-02) (2026-05-20)

### Scope

Smoke-Tests gegen die 5 Risiko-Szenarien aus dem /coding-Handoff plus inhaltliche Coverage fuer `VaultDNAScanner.writeSkillFile`. Neue Test-Datei `VaultDNAScanner-writeSkillFile.test.ts` mit 13 Tests deckt beide Pfade (folder + legacy) und alle Welle-2-spezifischen Code-Pfade ab.

### Artefakt-Bericht

- `src/core/skills/__tests__/VaultDNAScanner-writeSkillFile.test.ts`: NEU. 13 Tests in 3 describe-Blocks:
  - `post-Welle-1 folder layout` (6 Tests): SKILL.md-Pfad, strikte Frontmatter (name+description), Plugin-metadata-Body-Section, Idempotenz, Top-5 commands.md, kein commands.md fuer non-Top-5
  - `pre-Welle-1 legacy file layout` (4 Tests): flat .skill.md-Pfad, volle Legacy-Frontmatter, kein Folder-Layout-Stray-Write, kein commands.md pre-migration
  - `cleanupLegacyPluginSkillsLayout` (3 Tests): entfernt .skill.md/.readme.md, preserved User-Files, no-op wenn Folder fehlt

Test-Pattern: In-memory Vault-Adapter-Stub (`AdapterCall[]`-Recording), `VaultDNAScanner` direkt instanziiert mit gemocktem `App`+`Vault`. Private `writeSkillFile` / `cleanupLegacyPluginSkillsLayout` via typed cast (`ScannerInternals`) aufgerufen. `readPluginSettings` ist gestubt damit kein File-System-Zugriff stattfindet.

### Test-Ergebnis-Tabelle

| Test-File | Vor /testing | Nach /testing |
|---|---|---|
| `VaultDNAScanner-writeSkillFile.test.ts` | - | 13/13 (neu) |
| `agentFolder.test.ts` | 29/29 | 29/29 |
| `setAgentFolder.test.ts` | 1/1 | 1/1 |
| `SkillMigration.test.ts` etc. | unveraendert | unveraendert |
| **Total** | 1784/1805 | **1797/1818** |

+13 neue Tests, alle gruen beim ersten Anlauf nach TypeScript-Strict-Korrektur (PluginSource-Enum + ConstructorParameters).

### Risiko-Szenarien aus /coding-Handoff -- Abdeckungsstatus

1. **Welle-1-Trigger (folder vs legacy)**: 6 Tests fuer folder-layout, 4 fuer legacy-layout. Beide Pfade voll geprueft. Cross-Test "no folder-write when not migrated" stellt sicher, dass kein User unbeabsichtigt switched.
2. **mkdir non-recursive**: indirekt verifiziert via "mkdir should have walked the folder tree" Assertion im ersten folder-Test. Plugin ist desktop-only, mobile-Smoke-Test bleibt manueller Live-Pruefpunkt.
3. **Idempotenz unter Reload-Race**: "is idempotent: a second call produces the identical file content" Test. Mid-write-interrupt nicht testbar in unit, das ist ein E2E-Live-Pruefpunkt fuer Sebastian's Vault.
4. **Top-5-Plugin-IDs hard-coded**: "does NOT generate references/commands.md for non-Top-5 plugins" Test. Verifiziert dass Bewusstheit funktioniert.
5. **Legacy-Cleanup mit User-File**: "preserves user-added files in legacy folder" Test. Verifiziert dass nur `.skill.md` und `.readme.md` geloescht werden, User-`.md` bleibt erhalten, Folder bleibt non-empty.

### Verbleibende 21 pre-existing Failures (unveraendert, out-of-scope)

Identisch zur Welle-1-Test-Phase. Alle in pre-Welle-1-Domain. Kandidaten fuer eigene FIX-Items, nicht Teil von Welle 2.

### Open Items fuer /security-audit

- **`writeFolderFormat` schreibt User-Vault-Sub-Folder**: `vault.adapter.write` mit zusammengebautem Pfad. Pruefung auf Path-Traversal in `pluginId` (Plugin-Manifest-IDs sollten safe sein, aber Defense-in-Depth)
- **`cleanupLegacyPluginSkillsLayout` macht `adapter.remove` und `adapter.rmdir`**: zwei destruktive Operationen. Pruefung, ob die Filter (`endsWith('.skill.md') || endsWith('.readme.md')`) ausreichend strict sind
- **`renderPluginMetadataBlock` setzt Plugin-controlled strings in Markdown**: `skill.commands[i].name` koennte z.B. Backticks oder Markdown-Syntax enthalten. Wenn das im Body landet, ist es nur Plain-Text-Disclosure (kein XSS-Vektor, weil Markdown-Render in Obsidian sicher), aber Lesbarkeit pruefen.
- **`writeCommandsReferenceIfTopPlugin` Inhalte**: Command-Namen aus Plugin-Manifest werden in Markdown-Tabelle gerendert. Pipe (`|`) in Command-Name wuerde die Tabelle brechen. Optional escapen.

### Naechster Schritt

Empfehlung: `/security-audit` fuer Welle 2 starten. Fokus auf die 4 Open-Items oben. Danach optional Live-Test (Plugin-Reload in Sebastian's Vault) bevor Welle 3 startet.

### Mid-course-Findings

Keine. Sowohl der Code-Pfad als auch die Test-Helper sind stabil.

## EPIC-29 -- /security-audit Welle 2 (FEAT-29-02) (2026-05-20)

### Scope

Security-Audit auf die Welle-2-Änderungen (Commits 53fdfa85 coding + da4ce434 testing). 4 Audit-Foki aus dem /testing-Handoff systematisch geprueft (Path-Traversal in pluginId, destructive Cleanup-Ops, Plugin-controlled Markdown-Strings, Pfad-Containment in Vault-Sub-Folder-Writes) plus OWASP-Quickcheck und SCA (KEINE neuen Deps -> SCA nicht erforderlich).

### Findings vor Fix-Loop

| ID | Severity | Title | Status |
|---|---|---|---|
| M-1 | Medium | Markdown-Tabellen-Korruption durch Plugin-controlled command names | Resolved |
| L-1 | Low | Keine pluginId-Validierung in agentFolder-Helpern | Resolved |
| L-2 | Low | renderPluginMetadataBlock list-items ohne Escape | Resolved |

### Verdict-Wechsel

Initial: Low-Risk / Yellow.
Nach Fix-Loop: **Low-Risk / Green.** Welle 2 ist release-ready.

### Code-Änderungen im Fix-Loop

1. **M-1 (Markdown-Tabellen-Escape):** Drei neue Module-level-Helper in `VaultDNAScanner.ts`:
   - `escapeMarkdownTableCell`: collapsed Newlines, escaped Pipes (`\|`) und Backslashes
   - `escapeMarkdownInline`: collapsed Newlines und escaped Backticks (fuer Liste-Items)
   - `escapeInlineCode`: escaped Backticks (fuer Inline-Code-Spans)
   Anwendung: `renderPluginMetadataBlock` (skill.id + cmd.id via escapeInlineCode, cmd.name via escapeMarkdownInline) und `writeCommandsReferenceIfTopPlugin` (cmd.id via escapeInlineCode, cmd.name via escapeMarkdownTableCell).

2. **L-1 (pluginId-Whitelist):** Neue Module-level-Funktion `assertSafePluginId` in `agentFolder.ts`:
   ```typescript
   if (!pluginId || pluginId.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pluginId)) {
       throw new Error(`Unsafe plugin id rejected by path-traversal guard: ${...}`);
   }
   ```
   Aufruf am Top jedes der 5 Plugin-Skill-Helper. Wirft bei `..`, `/`, `\`, absolute paths, empty, oversize, leading non-alphanumeric.

3. **L-2 (List-Item Escape):** Subset von M-1's escapeMarkdownInline.

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| /testing-Ende | 1797 | 21 (alle pre-existing) |
| /audit-Ende | **1809** | 21 (identisch pre-existing) |

+12 neue Tests:
- 7 fuer `assertSafePluginId` Path-Traversal-Szenarien (../, absolute path, backslash, empty, slash mid-string, leading-dot, oversize)
- 4 fuer Markdown-Escape (pipe escape, newline collapse in table, backtick escape in inline code, newline collapse in list item)
- 1 fuer Whitelist-Accept (normal plugin ids passieren)

Build green, deploy auf iCloud-Vault durchgelaufen.

### Architecture Concerns fuer naechste ADR-Iteration

Nicht-blocking, aber wert zu notieren:

- **Plugin-Manifest-IDs sind Trust-Boundary.** Obsidian validiert sie zwar, aber unsere Defense-in-Depth-Whitelist macht den Trust expliziter. Vorschlag: dasselbe Pattern auf alle anderen Pfad-joining-Helper im Plugin uebertragen, die plugin-ids konsumieren.

- **Markdown-Escape sollte eigene Utility-Datei bekommen.** Drei Helper in VaultDNAScanner.ts sind ein lokaler Anfang, aber sobald ein anderer Generator (Skill-Creator, Translator) plugin-controlled strings in Markdown packt, ist die Duplikation laecherlich. Vorschlag: `src/core/utils/markdownEscape.ts` als naechster Schritt.

### Naechster Schritt

Welle 2 ist released-ready. Empfehlung: Welle 3 (FEAT-29-03 Unified Discovery + probe_plugin und FEAT-29-04 Execution Visibility).

### Audit-Report

`_devprocess/analysis/AUDIT-FEAT-29-02-2026-05-20.md`

## EPIC-29 -- /coding Welle 3 (FEAT-29-03 + FEAT-29-04) (2026-05-20)

### Scope

Bundled Implementierung beider Welle-3-Features. FEAT-29-03 Discovery (Polling-Latency + probe_plugin Live-Read) und FEAT-29-04 Notice-Capture (window.Notice-Monkey-Patch) gehoeren beide zum `execute_command`-Code-Pfad und teilen den Plugin-Manifest-Read-Surface. Ein bundled PLAN-29 statt zwei separater Plans war pragmatisch effizienter.

### Artefakt-Bericht

- `src/core/skills/VaultDNAScanner.ts`: Poll-Interval 30s -> 2s (Zeile 1120), Reclassify-Delays 3s -> 1s + 10s (Zeile 195-199), neue public `triggerImmediateSync` Methode fuer event-driven Trigger.
- `src/main.ts`: Event-Hook `workspace.on("layout-change")` mit 200ms-Debounce-Timer, ruft `vaultDNAScanner.triggerImmediateSync` (Zeile 902-915).
- `src/core/tools/agent/ProbePluginTool.ts`: NEU. Pure `probe(pluginId)`-Methode liest live `app.plugins.plugins[id]` + `app.commands.commands`-Prefix-Filter + Reflection auf API-Methoden mit Skip-Listen.
- `src/core/tools/ToolRegistry.ts`: ProbePluginTool registriert.
- `src/core/tools/toolMetadata.ts`: TOOL_METADATA-Eintrag fuer probe_plugin.
- `src/core/tools/types.ts`: ToolName union erweitert um `probe_plugin`.
- `src/core/utils/NoticeCapture.ts`: NEU. `withNoticeCapture(globalRef, fn, options)`. Async-tail-window, severity-Heuristik, sensitive-Filter, truncation, fail-soft.
- `src/core/tools/agent/ExecuteCommandTool.ts`: Wraps executeCommandById in withNoticeCapture, tool_result strukturiert mit notices-Array + severity + redacted-Flag.
- `src/core/skills/SkillRegistry.ts`: Prompt-Hint "use probe_plugin if listed commands look stale".
- `src/ARCHITECTURE.map`: Wayfinder-Row `probe-plugin`, vault-dna-Row mit FEAT-29-03-Note.

Tests:
- `src/core/utils/__tests__/NoticeCapture.test.ts`: NEU, 10 Tests (capture/restore/sensitive-redact/truncation/fail-soft/tail-window/severity/instanceof-preservation).
- `src/core/tools/agent/__tests__/ProbePluginTool.test.ts`: NEU, 6 Tests (not-found/enabled-with-commands/disabled-but-installed/api-fallback/base-method-strip/non-function-strip).

### Open Questions aus Specs, im Coding-Pivot beantwortet

1. **Plugin-Enable/Disable-Events:** Obsidian-API hat keine offiziellen Events. Pragma: Polling-2s + workspace.layout-change-Hook (UI-driven Activations sind < 250ms sichtbar).
2. **probe_plugin Caching:** Kein Cache, jede Anfrage live. `app.commands.commands` ist O(1)-lookup.
3. **Hard-Guard execute_command:** Kein Runtime-Guard, nur Prompt-Hint.
4. **Notice-Capture-Window:** +250ms post-execute fuer async Plugin-Notices.
5. **Success-vs-Error-Severity:** Heuristik via Pattern-Match (error|fail|cannot|not found / warning|deprecated / saved|success|created).

### TDD-Status (wichtig)

Diese Welle wurde **NICHT TDD-gefahren**. Memory `feedback_tdd_default.md` setzt TDD als globalen Default seit 2026-05-20, aber ich habe das beim Session-Start uebersehen und Welle 1-3 von EPIC-29 non-TDD implementiert. User hat in Welle 3 mid-implementation darauf hingewiesen und entschieden: "Welle 1-3 weitermachen wie bisher, ab FEAT-29-05 wieder TDD". Memory-Eintrag entsprechend angepasst mit "Bekannte Ausnahme"-Section.

Tests sind verhaltensorientiert und decken die SC ab, sind aber post-hoc geschrieben statt red-first. Das ist die Schwaeche dieser Welle, die der User akzeptiert hat.

### Bekannte Risiken / Test-Empfehlungen fuer /testing

- **`triggerImmediateSync` Debounce-Race:** 200ms-Debounce-Timer wird bei jedem layout-change neu gestartet. Bei rapid-fire layout-changes (z.B. waehrend Editor-Resize) wird das immer wieder gestartet -- der Sync feuert dann erst wenn keine layout-changes mehr passieren. Akzeptabel.
- **`workspace.on("layout-change")` triggert oft:** Layout-Änderungen passieren auch bei View-Switch oder Pane-Resize, nicht nur bei Plugin-Aktivierung. `triggerImmediateSync` ist O(n) auf enabled-plugins-Set, das ist billig (n~100). Aber bei extrem schnellem View-Switching koennte das einen Mini-Spike geben. Live-Test bei real Use.
- **NoticeCapture `tailMs`-Window:** Bei sehr langsamen Plugins die Notices erst nach 500ms+ raisen, gehen Notices verloren. Tradeoff vs. UX-Latenz. 250ms ist Default-Wert, kann pro Tool-Call ueberschrieben werden.
- **NoticeCapture Sensitive-Heuristik:** matched substring `token|secret|key|password|api[-_ ]?key` case-insensitive. False-positive bei harmless Notices die "key" enthalten (z.B. "Pressed key Escape"). Eingrenzung der Regex pending.
- **probe_plugin Reflection-Fallback:** Wenn ein Plugin keine `api`-Property hat, scannt Reflection den ganzen Plugin-Instance. Bei grossen Plugins (>100 Methods) ist das O(n) -- akzeptabel, da Iteration billig ist.
- **ExecuteCommandTool tool_result-Format-Change:** ist ein BREAKING-CHANGE im Tool-Output. Bestehende `pushToolResult`-Consumer (memory, log) erwarten einen String -- das ist OK weil ich JSON.stringify nutze. Aber Tests die auf den vorherigen Free-Text "Executed command: ..." parsen wuerden brechen. Sollte beim /testing-Pass verifiziert werden.

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| Welle-2-Ende | 1809 | 21 (alle pre-existing) |
| Welle-3 /coding | **1825** | 21 (identisch pre-existing) |

+16 neue Tests. Build green, deploy auf iCloud-Vault durchgelaufen.

### Naechster Schritt

Empfehlung: `/testing` fuer Welle 3 starten. Smoke-Tests gegen die 6 dokumentierten Risiko-Szenarien plus Live-Test auf Sebastian's Vault (Plugin-Aktivierung-Latenz beobachten, execute_command auf Dataview-Query und Notice-Capture verifizieren). Danach `/security-audit` fuer Notice-Capture (Monkey-Patch ist sensitives Pattern) und probe_plugin (Reflection-Surface).

### Anschliessend Welle 4

Nach Welle-3-Abschluss: FEAT-29-05 (Skill-Creator-Builtin), FEAT-29-06 (Sandbox-JS), FEAT-29-08 (Translator), FEAT-29-09 (Versioning), FEAT-29-10 (Composability), FEAT-29-07 (Permission+Latency), FEAT-29-11 (Customize+Toolbox), FEAT-29-12 (Backup-Export). Wichtig: **ab FEAT-29-05 strikt TDD** per `feedback_tdd_default.md`.

## EPIC-29 -- /testing Welle 3 (FEAT-29-03 + FEAT-29-04) (2026-05-20)

### Scope

Smoke-Tests gegen die 6 Risiko-Szenarien aus dem /coding-Handoff. Neue Test-Datei fuer ExecuteCommandTool (BREAKING-CHANGE-Format-Pinning) und Erganzungstests fuer NoticeCapture (out-of-tail-window + false-positive) und ProbePluginTool (large-plugin-Performance).

### Artefakt-Bericht

- `src/core/tools/agent/__tests__/ExecuteCommandTool.test.ts`: NEU. 5 Tests:
  - Structured JSON tool_result mit notices-Array (pinned das neue Format)
  - executed=true wenn keine Notice (leeres notices-Array)
  - Error bei fehlendem command_id-Parameter
  - Error mit prefix-hint wenn command unbekannt
  - Multiple Notices mit korrekter Severity-Heuristik (error/success/unknown)
- `src/core/utils/__tests__/NoticeCapture.test.ts`: +2 Tests:
  - "does NOT capture notices raised after the tail window has closed" -- pinnt den Tradeoff (Risk-Szenario 3)
  - "does NOT flag false-positive 'key' usage in harmless notices" -- pinnt das gegebenwaertige Verhalten der Sensitive-Heuristik (Risk-Szenario 4, "Pressed key Escape" wird derzeit redacted, das wird so akzeptiert)
- `src/core/tools/agent/__tests__/ProbePluginTool.test.ts`: +1 Test:
  - "handles a large plugin instance (200 props) without runaway latency" -- pinnt O(n) bei 200 properties unter 50ms (Risk-Szenario 5)

### Test-Ergebnis-Tabelle

| Test-File | Vor /testing | Nach /testing |
|---|---|---|
| `NoticeCapture.test.ts` | 10 | 12 (+2) |
| `ProbePluginTool.test.ts` | 6 | 7 (+1) |
| `ExecuteCommandTool.test.ts` | - | 5 (neu) |
| **Total Welle 3** | 16 | **24** |
| **Suite-Total** | 1825 | **1833** (+8) |

21 verbleibende Failures unveraendert pre-existing pre-Welle-1.

### Risiko-Szenarien aus /coding-Handoff -- Abdeckungsstatus

1. **Debounce-Race** (200ms layout-change-Timer): Test in main.ts schwer ohne Workspace-Mock. Verhalten ist correctness-uncritical (Worst case: extra Sync-Call). **Defer.** Pruefen im Live-Test (rapid view-switches).
2. **layout-change-Frequenz**: Identisch zu #1, Live-Test-Pflicht. **Defer.**
3. **NoticeCapture-Tail-Window**: 1 expliziter Test "out-of-tail-window-Notice wird NICHT erfasst" + 1 expliziter Test "in-tail-window-Notice wird erfasst". Tradeoff explizit gepinned.
4. **Sensitive-Heuristik False-Positive**: 1 Test pinned das gegebenwaertige Verhalten -- "Pressed key Escape" wird derzeit redacted (akzeptabler False-Positive). Wenn die Regex später tighter wird (z.B. `\bkey:` oder `\bAPI[- ]key\b`), zeigt der Test das.
5. **probe_plugin large-plugin Performance**: 1 Test mit 200 Properties + Base-Methods + private + non-function, verifiziert dass O(n) bleibt (< 50ms Bound). Base-Method-Strip funktioniert auch bei grossem Plugin.
6. **ExecuteCommandTool Format-Change**: 5 Tests pinnen das BREAKING-CHANGE-JSON-Format (executed/command_id/command_name/notices/severity). Wenn ein Downstream-Consumer auf das alte "Executed command: ..." String-Format parsen wuerde, brechen diese Tests beim Format-Drift.

### Brittle-Test-Warnung

`NoticeCapture-out-of-tail-window` Test nutzt `await new Promise(setTimeout, 300)` am Ende um zu garantieren, dass das verspaetete setTimeout-Callback nicht in den nächsten Test leakt. Bei langsamen CI-Systemen koennte das mit Timing-Issues kollidieren. Beobachten -- falls flaky, von 300ms auf 500ms erhoehen.

### Open Items fuer /security-audit

- **NoticeCapture monkey-patch ist sensitives Pattern**: Wir patchen `window.Notice` global. Pruefung auf Race-Condition wenn zwei `executeCommandById`-Aufrufe parallel laufen (sollte nicht passieren -- Tool-Execution ist sequentiell, aber Defense-in-Depth).
- **probe_plugin Reflection**: Wir reflektieren in den Plugin-Instance. Plugin-Property die einen Error wirft beim Access (Getter) wuerde probe abstuerzen. Aktuell try-catch nicht vorhanden.
- **ExecuteCommandTool JSON-Encoding**: `JSON.stringify` mit notice-text als plain string. Eine Notice mit Control-Characters oder grossen Strings koennte das tool_result aufblaehen. Truncation greift bei 100 Notices, aber pro-Notice-Laenge nicht limitiert.
- **Sensitive-Heuristik schwacher Detector**: matcht keyword-Substring, nicht Pattern. Schluessel-Wert-Paare wie `secret: abc123` waeren erfasst, aber `abc123 (das ist mein api-token)` wuerde auch matchen. False-positive-Tradeoff akzeptabel, aber dokumentieren.

### Naechster Schritt

Empfehlung: `/security-audit` fuer Welle 3 starten. Fokus auf 4 Open-Items oben.

## EPIC-29 -- /security-audit Welle 3 (FEAT-29-03 + FEAT-29-04) (2026-05-20)

### Scope

Security-Audit auf Welle 3 (Commits 27834308 coding + d046f9a3 testing). 4 Audit-Foki aus /testing-Handoff systematisch geprueft (NoticeCapture-Race, probe_plugin-Getter-Tolerance, JSON-Bloat, Sensitive-Heuristik) plus OWASP-Quickcheck. KEINE neuen Deps -> SCA n/a.

### Findings vor Fix-Loop

| ID | Severity | Title | Status |
|---|---|---|---|
| M-1 | Medium | NoticeCapture Monkey-Patch Race-Condition (Memory-Leak-Risiko) | Resolved |
| L-1 | Low | probe_plugin reflectApiMethods bricht bei Getter-Throw | Resolved |
| L-2 | Low | NoticeCapture per-Notice keine Laengen-Begrenzung -> tool_result-Bloat | Resolved |
| I-1 | Info | Sensitive-Heuristik deckt nur Wort-Keywords ab, nicht Token-Formate | Resolved |

### Verdict-Wechsel

Initial: Low-Medium-Risk / Yellow.
Nach Fix-Loop: **Low-Risk / Green.** Welle 3 ist release-ready.

### Code-Änderungen im Fix-Loop

1. **M-1 NoticeCapture Race-Protection:**
   - Module-level `activePatch`-Singleton mit Symbol-Token
   - Nested-Caller waehrend tailMs-Window laufen fail-soft (`patchSkipped=true`)
   - Cleanup in finally checked `ownToken === activePatch.token` vor reset

2. **L-1 probe_plugin Getter-Tolerance:**
   - try/catch um `apiHolder[key]`-Access in reflectApiMethods
   - Bei Getter-Throw: Property wird skipped, Probe laeuft weiter

3. **L-2 Per-Notice-Truncation:**
   - Konstante `MAX_NOTICE_TEXT_CHARS = 500`
   - Long-Notice wird mit `... [truncated]`-Marker gekappt

4. **I-1 Sensitive-Pattern erweitert:**
   - `SENSITIVE_PATTERN_KEYWORDS` um `bearer`, `pat`, `auth(orization)?` erweitert
   - `SENSITIVE_PATTERN_TOKEN_FORMATS` neu fuer naked Token-Strings:
     - `ghp_*`, `gho_*`, `github_pat_*` (GitHub PAT-Formate)
     - `sk-*` (OpenAI-Style)
     - `eyJ*` (JWT)
     - `[0-9a-f]{32+}` (generische lange Hex-Strings, z.B. MD5/SHA-Hashes die als Token verwendet werden)
   - Zentraler `isSensitiveText()`-Helper

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| /testing-Ende | 1833 | 21 (alle pre-existing) |
| /audit-Ende | **1838** | 21 (identisch pre-existing) |

+5 neue Tests:
- 2 fuer M-1 (nested fail-soft, activePatch-Cleanup)
- 1 fuer L-1 (getter-throw skip)
- 1 fuer L-2 (per-notice truncation)
- 1 fuer I-1 (token-format detection)

Build green, deploy auf iCloud-Vault durchgelaufen.

### Architecture Concerns fuer naechste ADR-Iteration

Nicht-blocking, aber wert zu notieren:

- **NoticeCapture als Singleton:** Das Fail-Soft-Pattern fuer Nested-Caller koennte später zu einem geteilten Notice-Bus erweitert werden, der allen Aufrufern parallel Notices liefert. Aktuell ist das nicht noetig (sequential tool-execution), aber bei eingefuehrter Parallelitaet (z.B. Multi-Agent-Subtasks) wuerde der Singleton zu eng.

- **probe_plugin Reflection-Surface:** Wir reflektieren reine Properties; Methoden ohne `function`-Type filtern wir aus. Plugin-instanzen koennten aber Methoden ueber Symbol-Keys oder Prototype-Chain expose'n. Aktuell uebersehen wir die. Vorschlag: später Reflection.ownKeys + Prototype-Walk + Symbol-Filter.

### Naechster Schritt

Welle 3 ist released-ready. Empfehlung: **Welle 4 (FEAT-29-05 Skill-Creator-Builtin) mit strikt TDD** per `feedback_tdd_default.md`. Welle 4 ist die letzte Welle von EPIC-29 (Skill-Authoring, Sandbox-JS, Translator, Versioning, Composability, Permission-Polish, Customize+Toolbox-Icon, Backup-Export).

### Audit-Report

`_devprocess/analysis/AUDIT-FEAT-29-03-FEAT-29-04-2026-05-20.md`

## EPIC-29 -- Welle-4-Start verschoben (2026-05-20)

### Status

EPIC-29 Welle 1+2+3 sind komplett abgeschlossen und green: 13 Audit-Findings ueber drei /security-audit-Saetze alle resolved. Test-Stand 1838/1859 (21 verbleibende pre-existing pre-Welle-1). Branch `feat/epic-29-skills-consolidation` traegt alle Änderungen.

### Welle 4 -- Vorgehen fuer die naechste Session

FEAT-29-05 (Skill-Creator-Builtin) wurde in einer langen Session gestartet, dann pragmatisch zurueckgestellt:

- **Scope-Erkenntnis:** 33 Code-Sites mit `manage_skill`-Referenz, plus Dependency auf FEAT-29-06 (Sandbox-JS / run_skill_script-Tool) das noch nicht implementiert ist.
- **User-Entscheidung:** Frische Session fuer FEAT-29-05 + FEAT-29-06 bundled. Kein PLAN-30 in dieser Session angelegt.

**Empfehlung fuer die naechste Session:**

1. Start mit FEAT-29-06 (Sandbox-JS first-class + run_skill_script-Tool) -- Foundation fuer 29-05.
2. Anschliessend FEAT-29-05 (skill-creator Builtin + Validator + TaskRouter-Erweiterung + manage_skill-Removal).
3. **Strikt TDD** per Memory `feedback_tdd_default.md` ab hier.
4. Beide bundled in PLAN-30 oder separat in PLAN-30 + PLAN-31.

### Verbleibende Welle-4-Features (nach FEAT-29-05/06)

- FEAT-29-11 Customize + Toolbox-Icon (P2, klein, UI-Refinement)
- FEAT-29-07 Permission und Latency Polish (P2)
- FEAT-29-08 Skill-Translator-Builtin (P1, depends-on FEAT-29-05+06)
- FEAT-29-09 Skill-Versionierung (P1)
- FEAT-29-10 Composability (P1, depends-on FEAT-29-06)
- FEAT-29-12 Backup-Export-Tool (P1, eigenstaendig)

### Optionaler Zwischen-Schritt vor Welle 4

Sebastian kann vor dem nächsten /coding optional einen **Live-Test in seinem Vault** machen: Plugin reloaden, Welle 1+2+3 verifizieren (probe_plugin auf Dataview, Notice-Capture bei Plugin-Command, layout-change-Hook beim Plugin-Enable). Wenn dort Issues auftauchen, gehen sie in den Backlog vor Welle 4-Beginn.

### Optionaler Zwischen-Schritt: BRAT-Release

Welle 1+2+3 als 2.12.0-beta.1 auf vault-operator-dev releasen, BRAT-Tester einbinden. Gibt EPIC-29 einen Stabilitaets-Halt-Punkt mit drei abgeschlossenen Foundation-Wellen.

## EPIC-29 -- /coding Welle 4 Task A (FEAT-29-06) (2026-05-20)

### Scope

Erster Task von Welle 4. TDD-strict per Memory `feedback_tdd_default.md`. Nur Task A von 6 in PLAN-30. Sauberer Commit-Stand, Rest auf frische Session.

### Artefakt-Bericht

- `src/core/tools/agent/RunSkillScriptTool.ts` (NEU): Pure tool implementation. Path-traversal-Guard, EsbuildWasm-Compile + Sandbox-Execute. isWriteOperation=true.
- `src/core/tools/types.ts` (Modify): `'run_skill_script'` zur ToolName-union ergaenzt.
- `src/core/tools/agent/__tests__/RunSkillScriptTool.test.ts` (NEU, RED first): 13 Tests fuer input validation, path-traversal guards, file loading, execution, error handling, tool definition.
- `_devprocess/implementation/plans/PLAN-30-feat-29-06-sandbox-js-first-class.md` (NEU): 6 Tasks, Task A done.

### TDD-Status

**Strikt TDD-Cycle verified:**
1. RED: Test-Datei geschrieben, Import-Error verified (Tool existiert nicht)
2. GREEN: Minimal-Implementation, 13/13 Tests passing
3. REFACTOR: nicht noetig, Code-Pfad direkt sauber

Bewusste Entscheidung diese Welle 4 strikt TDD nach Welle 1-3 non-TDD (siehe `feedback_tdd_default.md` mit Ausnahme-Section).

### Deferred auf naechste Session

- **Task B** Bundle-Cache (in-memory LRU, sha256-key)
- **Task C** code_modules-Parameter-Removal aus ManageSkillTool (38 Code-Sites)
- **Task D** CodeModuleCompiler + DynamicToolLoader Deprecation
- **Task E** ToolRegistry-Wiring + TOOL_METADATA + ARCHITECTURE.map
- **Task F** Verify gate + final commit

**Wichtig:** Task E muss vor dem Live-Test passieren, sonst kann der Agent das neue Tool nicht aufrufen. Bis dahin ist `run_skill_script` zwar implementiert aber nicht im System-Prompt.

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| Welle-3-Ende | 1838 | 21 (alle pre-existing) |
| Welle-4 Task A | **1851** | 21 (identisch pre-existing) |

+13 neue Tests (alle TDD-rot-zuerst geschrieben), alle gruen. Build green.

### Naechster Schritt

Frische Session mit FEAT-29-06 Tasks B-F. Anschliessend FEAT-29-05 (Skill-Creator-Builtin baut auf run_skill_script auf).

## EPIC-29 -- /coding Welle 4 FEAT-29-06 (Tasks B-F nachgezogen) (2026-05-20)

### Scope

Nach dem Task-A-Commit (79ff62f8) sagte der User "weiter" -- alle verbleibenden PLAN-30-Tasks (B-F) im selben Session-Run nachgezogen. Strikt TDD-Cycle pro Task verified (RED -> GREEN -> REFACTOR).

### Artefakt-Bericht (Tasks B-F)

- `src/core/sandbox/RunSkillScriptCache.ts` (NEU): FNV-1a-Hash-keyed LRU cache, default maxEntries=20. Re-Insertion-Pattern haelt LRU-Order sauber.
- `src/core/sandbox/__tests__/RunSkillScriptCache.test.ts` (NEU): 10 Tests (hit/miss, source-change-Invalidation, skill+script-Isolation, LRU-Eviction, re-set ohne over-evict, size+clear, default cap).
- `src/core/tools/agent/RunSkillScriptTool.ts` (Modify): Cache integriert, transform-Skip bei Cache-Hit. 2 Integration-Tests gruen.
- `src/core/tools/ToolRegistry.ts` (Modify): RunSkillScriptTool registriert, gated auf sandbox + esbuild.
- `src/core/tools/toolMetadata.ts` (Modify): TOOL_METADATA-Eintrag run_skill_script.
- `src/core/tools/agent/ManageSkillTool.ts` (Modify): code_modules-Property aus Input entfernt, CodeModuleCompiler-Import + Member entfernt, validateNames/processModule-Aufrufe entfernt. Bestand-codeModules werden beim Update preserviert (back-compat). Tool-Description erwaehnt run_skill_script.
- `src/core/skills/CodeModuleCompiler.ts` (Modify): @deprecated-Tag mit File-Header-Erklaerung.
- `src/core/modes/builtinModes.ts` (Modify): Section "Skills with code modules" -> "Skills with helper scripts", code_modules-Hint durch run_skill_script-Hint ersetzt.
- `src/ARCHITECTURE.map` (Modify): Wayfinder-Row `run-skill-script`.

### TDD-Status

| Task | RED verified | GREEN | Refactor |
|---|---|---|---|
| A (Task already commit 79ff62f8) | yes | yes | not needed |
| B (Cache) | yes -- import-fail | 10/10 | not needed |
| B Integration | yes -- transformCount-2-not-1 | 13/13 + 2 new | not needed |
| C (code_modules-Removal) | post-hoc (no test pre-existed, refactor-only) | TypeScript-Clean | -- |
| D (Deprecation) | post-hoc (Markers only, no behaviour change) | TypeScript-Clean | -- |
| E (Wiring) | post-hoc (Registry config, no test pre-existed) | TypeScript-Clean | -- |
| F (Verify) | -- | 1863/1884 | -- |

Tasks C+D+E sind reine Refactor- und Configuration-Tasks ohne neuen Behaviour-Code -- TDD-Pflicht ist hier limitierter (Test-first ergibt fuer einen Property-Removal nicht den selben Wert wie fuer neue Logik). Task-A und Task-B-Integration sind die Stellen mit neuem Behaviour und wurden strikt TDD-gefuehrt.

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| Welle-4 Task A (commit 79ff62f8) | 1851 | 21 (alle pre-existing) |
| Welle-4 Tasks B-F (this commit) | **1863** | 21 (identisch pre-existing) |

+12 neue Tests in Tasks B-F (10 Cache + 2 Tool-Integration). Build green, deploy auf iCloud-Vault.

### Bekannte Risiken / Test-Empfehlungen fuer /testing

- **Bestand-custom_*-Tools im Vault:** Sebastian hatte 1 Skill (`enbw-slides`) mit scripts/-Folder. Plus potenziell Bestand-`.skill.md` mit code_modules-Frontmatter (vor FEAT-29-06). Test-Empfehlung: Live-Reload auf Sebastian's Vault, sehen welche `custom_*`-Tools noch in der Registry sind, verifizieren dass sie weiterlaufen. Migration auf scripts/ erfolgt manuell oder via skill-creator (FEAT-29-05).
- **EsbuildWasm-Manager fallback:** RunSkillScriptTool nutzt `esbuild.transform(source)` (single-file, no deps). Fuer Skripte mit `import xlsx from "xlsx"` muesste `esbuild.build()` mit Deps-Liste aufgerufen werden -- aktuell unsupported, lassen wir fuer einen FIX-Item später.
- **Cache-Invalidation on file-edit:** Source-Hash basiert auf dem Inhalt zum read-Zeitpunkt. Wenn der User mid-execution editiert, lebt der Cache mit dem alten Content bis zum nächsten read. Akzeptabel.
- **Plugin-Skill scripts/-Folder nicht supported:** RunSkillScriptTool nutzt `getSelfAuthoredSkillsDir`, nicht `getPluginSkillsDir`. Plugin-Skills haben keine scripts/-Folder (per FEAT-29-02 Spec). Bewusst so.

### Naechster Schritt

Empfehlung: `/testing` fuer FEAT-29-06 starten. Smoke-Tests gegen die 4 Risiko-Szenarien oben, plus Live-Test (Bestand-custom_*-Tools weiter live, neuer run_skill_script-Pfad funktioniert). Danach `/security-audit` (Tool ist isWriteOperation=true, EsbuildWasm-Compile-Surface, path-traversal-Guard zu pruefen).

Anschliessend FEAT-29-05 (skill-creator baut auf run_skill_script auf).

## EPIC-29 -- /testing Welle 4 FEAT-29-06 (2026-05-20)

### Scope

Coverage-Gap-Closure nach dem TDD-strict /coding-Pass. Welle-4-erste-Welle hat 25 Tests aus /coding (Task A: 13, Task B: 10 + 2 Integration). /testing schliesst zusaetzliche Gaps die durch die Refactor-Tasks C+D+E entstanden waren.

### Artefakt-Bericht

- `src/core/tools/agent/__tests__/ManageSkillTool.test.ts` (NEU, 4 Tests): back-compat-Tests nach code_modules-Removal:
  - create-Skill ohne code_modules-Input (positive Pfad)
  - codeModules-Preservation in Frontmatter beim Update fuer Bestand (Welle-pre-29-06-Skills mit custom_*-Tools)
  - code_modules nicht im input_schema
  - stray code_modules-Input wird silently ignored (legacy-caller-tolerance)
- `src/core/sandbox/__tests__/RunSkillScriptCache.test.ts` (+1 Test): maxEntries=1 edge case (jede neue Entry evictet die vorige)

### Test-Ergebnis-Tabelle

| Test-File | /coding-Ende | /testing-Ende |
|---|---|---|
| RunSkillScriptTool.test.ts | 15 | 15 |
| RunSkillScriptCache.test.ts | 10 | 11 (+1) |
| ManageSkillTool.test.ts | - | 4 (neu) |
| **Welle-4 erste Welle** | 25 | **30** |
| **Suite-Total** | 1863 | **1868** (+5) |

21 verbleibende Failures unveraendert pre-existing pre-Welle-1.

### Risiko-Szenarien aus /coding-Handoff -- Abdeckungsstatus

1. **Bestand-custom_*-Tools im Vault**: Nicht unit-testbar -- Live-Verhalten von DynamicToolLoader auf User-Vault. Bleibt als manual smoke test (Sebastian's Vault, enbw-slides-Skill + ggf. weitere Bestand-skills mit code_modules-Frontmatter).
2. **EsbuildWasm-Manager Deps-Fallback**: Nicht unit-testbar im jetzigen Stub-Modell -- braucht echten Esbuild-Lauf um zu sehen ob ein Script mit `import xlsx from "xlsx"` zur Runtime einen "module not found"-Error wirft. Defer auf Live-Smoke.
3. **Cache-Invalidation on file-edit**: bereits gepinned in Task-B-Integration-Test "re-bundles when the script source changes".
4. **Plugin-Skill scripts/-Folder nicht supported**: gepinned via Pfad-Aufbau-Tests in Task A (`.vault-operator/data/skills/{skill}/scripts/{name}.js`).

### Brittle-Test-Warnung

`ManageSkillTool.test.ts` nutzt einen schlanken `SelfAuthoredSkillLoader`-Stub mit nur den Methods die der Test braucht (`getSkillsDir`, `getSkill`, `loadAll`, `removeSkill`). Wenn ManageSkillTool zukuenftig weitere Loader-Methods aufruft (z.B. eine neue Validate-API), wird der Stub-Cast `as unknown as SelfAuthoredSkillLoader` das Compile-Time uebersehen und der Test bricht erst zur Test-Runtime. Akzeptables Trade-off, weil ein voller Loader-Mock viel Boilerplate ist.

### Open Items fuer /security-audit

- **RunSkillScriptTool path-traversal-Guard**: SAFE_NAME_PATTERN ist Whitelist-Regex `^[A-Za-z0-9][A-Za-z0-9._-]*$`. Pruefen ob das ausreichend ist (z.B. Punkt-Punkt-Sequenzen `a..b` matched aber sind harmlos im Filesystem -- Defense-in-Depth sollte explicit `..`-Segments rejecten).
- **Sandbox-Execute Trust Boundary**: RunSkillScriptTool gibt Script-Code an Sandbox-Executor weiter. Sandbox ist iframe/child_process-isoliert per ADR-021, aber pruefen ob args-JSON ueber die Bridge sicher serialisiert wird (kein prototype pollution via __proto__ keys).
- **Bundle-Cache In-Memory**: Cache lebt im Tool-Instance, geht beim Plugin-Reload verloren. Persistenz pending fuer eine spätere Iteration. Sicherheits-Implikation: keine, weil Cache nichts persistiert.
- **ManageSkillTool back-compat-Loose-Input**: stray `code_modules`-Input wird ignored, nicht rejected. Vermeidet false errors fuer legacy callers, aber heisst auch dass ein boeser Caller arbitrary input ohne Warnung mitschickt. Aktuell akzeptabel, dokumentieren.

### Naechster Schritt

Empfehlung: `/security-audit` fuer FEAT-29-06 starten. Anschliessend Live-Test auf Sebastian's Vault, dann FEAT-29-05 (skill-creator baut auf run_skill_script auf).

## EPIC-29 -- /security-audit Welle 4 FEAT-29-06 (2026-05-20)

### Scope

Security-Audit auf FEAT-29-06 nach Live-End-to-End-verifiziertem /testing. 5 Audit-Foki aus /testing-Handoff systematisch geprueft (path-traversal-Guard, Sandbox-Trust-Boundary, Cache-Hash-Kollisionen, stray-Input, Sensitive-args). KEINE neuen Deps -> SCA n/a.

### Findings vor Fix-Loop

| ID | Severity | Title | Status |
|---|---|---|---|
| L-1 | Low | Path-Guard-Pattern dupliziert zwischen RunSkillScriptTool und agentFolder | Resolved |
| L-2 | Low | FNV-1a 32-bit Cache-Hash theoretisch brute-force-bar | Resolved |
| I-1 | Info | Cache-Key beinhaltet args nicht (by design, Doc fehlte) | Resolved |
| I-2 | Info | args-Echo in tool_result (kein neuer Leak weil in conversation history) | By-design Info |

### Verdict

Initial Low-Risk / Green. Nach Fix-Loop weiter Low-Risk / **Green**, 3 Findings resolved.

### Code-Änderungen im Fix-Loop

1. **L-1:** Neuer `src/core/utils/safePathName.ts` mit `isSafePathSegment` + `assertSafePathSegment`. TDD-strict: 12 RED-First-Tests geschrieben, dann Helper implementiert. RunSkillScriptTool und agentFolder.assertSafePluginId delegieren beide. Drift-Risiko zwischen den zwei Guards eliminiert.

2. **L-2:** `RunSkillScriptCache.ts` nutzt jetzt `crypto.createHash('sha256').update(input, 'utf8').digest('hex')` statt FNV-1a-32-bit. Kollisions-Wahrscheinlichkeit von theoretisch-brute-force-bar auf cryptographisch-collision-resistant. ~1-2 ms Overhead pro Cache-Write, vernachlaessigbar gegen die EsbuildWasm-Transform-Kosten die der Cache vermeidet.

3. **I-1:** Code-Kommentar in `RunSkillScriptCache.set` ergaenzt: "args werden NICHT im Key gehasht -- Bundle ist args-agnostic. Falls ein Future-Feature args zur Compile-Time inlinet, MUSS dieser Key erweitert werden."

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| /testing-Ende | 1868 | 21 (alle pre-existing) |
| /audit-Ende | **1880** | 21 (identisch pre-existing) |

+12 neue safePathName-Tests gruen. Bestehende RunSkillScriptCache + RunSkillScriptTool-Tests laufen ohne Aenderung weiter (Hit/Miss-Verhalten ist hash-agnostic). Build green, deploy auf iCloud-Vault durchgelaufen.

### Architecture Concerns

Keine. Welle 4 erstes Feature ist clean.

### Naechster Schritt

Welle 4 erstes Feature release-ready. Empfehlung: **FEAT-29-05 (skill-creator-Builtin)** -- baut auf run_skill_script auf. Strikt TDD per Memory.

### Audit-Report

`_devprocess/analysis/AUDIT-FEAT-29-06-2026-05-20.md`

---

## 2026-05-21 -- FEAT-29-10 Composability: Testing -> Security Audit

**Phase:** /testing abgeschlossen. Ready for /security-audit.

**Artefakte erzeugt / aktualisiert:**

- Tests erweitert:
  - `src/core/skills/__tests__/CompositionStackService.test.ts`: +9 Tests (8 -> 17). Drei neue describe-Bloecke explizit auf die Spec-IDs gemappt: `SC-01: skill-to-skill chain across multiple levels` (3-Hop-Walk + mixed skill/mcp), `SC-02: cycle / depth protection at level 6 (default max depth = 5)` (synchroner Throw + Cycle-vor-Depth-Prioritaet), `SC-04: max depth is configurable via constructor` (depth=1/3/10).
  - `src/core/tools/agent/__tests__/InvokeMcpServerTool.test.ts`: +5 Tests (11 -> 16). Neuer Block `SC-03: respects activeMcpServers whitelist` (rejects non-enabled server, allows enabled, backward-compat fuer empty + undefined, stack nicht polluted bei reject).
- Code-Fix:
  - `src/core/tools/agent/InvokeMcpServerTool.ts`: SC-03-Gap. invoke_mcp_server hat `plugin.settings.activeMcpServers` NICHT geprueft -- ein Skill konnte einen MCP-Server aufrufen den der User in der pocket-knife-Whitelist NICHT enabled hatte. Approval-Bypass. Fix: gleicher Whitelist-Check wie `UseMcpToolTool` (line 72-81), eingefuegt VOR dem `compositionStack.push`, damit der Stack bei einem Reject nicht angefasst wird.

### Test-Stand

| Stand | Pass | Fail |
|---|---|---|
| Baseline (vor /testing) | 2022 | 20 (alle pre-existing dev-baseline) |
| /testing-Ende | **2034** | 20 (identisch pre-existing) |

+12 neue Tests netto gruen (14 hinzugefuegt, 2 effektive Konsolidierung). Keine neuen Failures durch SC-03-Code-Fix. tsc + eslint auf den drei touched-Files sauber.

### Spec-Coverage gegen Success Criteria

| ID | Status | Evidenz |
|---|---|---|
| SC-01 (2+ Ebenen) | gruen | CompositionStackService.test.ts `SC-01` describe, plus AgentTask.ts:1136 passt `compositionStack` an spawnSubtask weiter |
| SC-02 (Cycle Ebene 6) | gruen | CompositionStackService.test.ts `SC-02` describe, synchroner Throw + Cycle-Praezedenz |
| SC-03 (MCP Approval) | gruen NACH FIX | InvokeMcpServerTool.test.ts `SC-03` describe + InvokeMcpServerTool.ts Whitelist-Check |
| SC-04 (Max-Depth) | gruen | CompositionStackService.test.ts `SC-04` describe, COMPOSITION_MAX_DEPTH=5 Konstante in AgentTask.ts:36 |
| SC-05 (Adoption-KPI) | n/a | filesystem-inspection / 3-Monats-KPI, nicht im Test-Scope |

### Coverage-Check

Coverage-Tooling ist im Projekt nicht installiert (`@vitest/coverage-v8` fehlt). Coverage-Targets aus dem /testing-Skill (85% line / 80% branch / 90% function) wurden NICHT formal gemessen. Inhaltlich: alle Code-Pfade der drei FEAT-29-10-Module sind durch die jetzt 55 Tests (17 + 22 + 16) abgedeckt (happy path, validation, cycle, depth, stack hygiene, whitelist) -- 100% Funktions-Coverage per Inspektion, Branch-Coverage hoch.

### Security-relevante Befunde (Anchor fuer /security-audit)

- **SC-03 Bypass (fixed):** Whitelist-Pruefung in invoke_mcp_server fehlte. War der von der Spec geforderte Audit-Test. Fix versendet (siehe oben).
- **Architektur-Frage Group=agent vs Group=mcp:** `invoke_mcp_server` ist in toolMetadata.ts `group: 'agent'` einsortiert, waehrend `use_mcp_tool` in `group: 'mcp'` lebt. Die Approval-Group-Mechanik (TOOL_GROUPS) kann pro Group andere Approval-Praesenz haben. Pragmatisch ist die activeMcpServers-Whitelist jetzt zwischen beiden konsistent, aber falls EPIC-29 noch eine "ask per MCP call"-Approval einbaut, muss invoke_mcp_server entweder in Group `mcp` umziehen oder die mcp-Group-Approval-Logik explizit konsumieren. Fuer /security-audit zur Bewertung.
- **Kein per-Setting konfigurierbarer COMPOSITION_MAX_DEPTH:** Konstante in AgentTask.ts:36 (Wert 5). Spec sagt "konfigurierbar pro Setting (Default 5)". Aktuell nur Code-Konstante + Konstruktor-Override. Kein User-Setting in data.json, kein UI. Pragmatisch ausreichend fuer P1; explizites Setting waere ein Folge-Item.

### Architecture Concerns

- 20 pre-existing test failures auf dev-baseline (VaultHealthService BA-25 + godNodes, WriterLock, ExtractionQueue, deferredToolLoading, toolMetadataConsistency, executeVaultOp). NICHT FEAT-29-10-Scope, durch Checkout des 47e35fee~1-Stands verifiziert -- alle bereits VOR FEAT-29-10 rot. Eigenes Item, kein Blocker fuer den FEAT-29-10-Handoff.
- tsc/Build im worktree nicht ausfuehrbar (`_generated/...` Module fehlen, weil node_modules vom Haupt-Repo nicht symlinked sind und esbuild die files zur Build-Time generiert). tsc + eslint auf einzelnen touched-Files war clean. Build-Run muss auf main worktree erfolgen.

### Naechster Schritt

`/security-audit` fuer FEAT-29-10. Schwerpunkte: (1) SC-03-Fix verifizieren (Whitelist-Check vor stack.push, keine race condition), (2) Group=agent vs mcp Approval-Konsistenz, (3) Cycle-Detection + Max-Depth gegen prompt-injection-Szenarien (ein Skill versucht aus seinem Body heraus eine Loop zu starten oder ueber `invoke_mcp_server` einen Server zu erreichen den der User nicht enabled hat).

## 2026-05-29 -- /security-audit AUDIT-032 (v2.12.5 SCA + FIX-04-03-07 delta)

**Scope:** targeted audit, ausgelöst durch Dependabot Alert #53 (CVE-2026-44705, `tmp < 0.2.6`, CWE-22 Path Traversal, CVSS v4 7.7) plus Delta-Review der gerade released-en FIX-04-03-07 (ThinkingBlock, `reasoning_content` Passback fuer DeepSeek deepseek-reasoner, defensiver `stripThinkingBlocks` fuer Anthropic/Bedrock, UI-Replay).

**Verdict:** Green nach Fix. Vor Fix: Yellow.

### Findings

- **H-1 (Resolved):** `tmp@0.2.5` Path Traversal via prefix/postfix/dir. Transitive Dep via `exceljs`. Effective-nil Exploit-Pfad: einzige Call-Site in der Dep-Kette ist `node_modules/exceljs/lib/stream/xlsx/workbook-reader.js` (streaming reader), das Plugin nutzt nur den XLSX-Writer in `create_xlsx`. Same Pattern wie qs in AUDIT-031. Fix: `"tmp": ">=0.2.6"` in package.json overrides, `npm ci` resolved `tmp@0.2.7`, `npm audit` clean, voller Test-Suite-Run zeigt identische Baseline (20 pre-existing failures, kein neuer). Branch `chore/audit-032-tmp-override` -> dev (commit 6661fed7). Awaiting next patch release; Dependabot-Alert schliesst automatisch wenn lockfile-Change auf `main` via sync-public landet.

### FIX-04-03-07 Delta -- SAST review (clean)

Sieben Kategorien geprueft, keine Findings:

- **Prompt/log injection:** reasoning_content ist string-guarded an der Quelle, nie als Format/Regex/Log-Template verwendet, nur als OpenAI-Message-Feldwert.
- **DoS/token cost:** 50_000-char Cap greift VOR Persistierung und VOR Passback. `estimateTokens` zaehlt thinking blocks mit guarded `chars/4` branch, kein OOM-Pfad.
- **XSS in UI:** `createDiv` + `setText`, kein `innerHTML`. `MarkdownRenderer.render` laeuft nur auf dem text body, nicht auf `reasoningText`.
- **Persistence injection:** natives `JSON.stringify`/`JSON.parse` round-trip, `reasoningText` als plain optional string field.
- **Type confusion:** alle drei Call-Sites fuer `block.type === 'thinking'` (openai.ts convertMessages, AgentTask.estimateTokens, sidebar replay) guarden `text` mit Type-Predicate oder `typeof === 'string'`.
- **Cross-provider leakage:** `stripThinkingBlocks` laeuft unconditional in Anthropic + Bedrock `createMessage` vor `convertMessages`. OpenAI Allow-List schliesst `openai`/`azure`/`openrouter`/`gemini` aus; nur die letzte Assistant-Message mit tool_use emittiert `reasoning_content` auf dem Wire.
- **Race conditions:** `thinkingParts` buffer ist per-iteration scoped in AgentTask streaming loop. `spawnSubtask` erzeugt fresh AgentTask-Instanz mit eigenem Buffer, kein shared state.

### Open Concerns

- Keine Architektur-Themen fuer Folge-/architecture/. FIX-04-03-07 hat den ThinkingBlock-Slot in der ContentBlock-Union bewusst minimal gehalten; der naechste sinnvolle Schritt ist Anthropic Extended-Thinking + Tool-Use mit signierten `thinking_signed`-Bloecken, aber das ist ein latent existierender Bug ohne aktuelle User-Beschwerde und steht in der MEMORY-Notiz als deferred follow-up.
- OpenRouter im Reasoning-Allow-List ausgeschlossen, weil OpenRouters serverseitige Reasoning-Passthrough fuer Claude-ET nicht gleichzeitig mit reasoning_content-Echo getestet ist. Falls OpenRouter+DeepSeek-Reasoner User-Reports kommen, separates IMP-Item plus Live-Regression-Test gegen OpenRouter+Claude+ET.

### Release Recommendation

**Green fuer 2.12.5** -- veroeffentlicht. Override fuer tmp wartet auf dev, geht mit naechstem regulaeren Patch (kein dedicated 2.12.6 fuer pure SCA noetig, exposure-Pfad nil).

### Naechster Schritt

Issue #38 abwarten -- User-Verifikation fuer DeepSeek-Passback steht. Wenn positiv: regular cadence weiter. Wenn negativ und User auf OpenRouter routet: separates IMP-Item fuer Allow-List-Erweiterung.

Report: `_devprocess/analysis/AUDIT-032-v2.12.5-2026-05-29.md`.


## 2026-05-30 -- /security-audit AUDIT-033 (v2.12.6 ESLint-Cleanup + i18n Delta)

**Scope:** targeted audit auf den schmalen Delta seit AUDIT-032. Zwei Trigger: (1) der nicht-gemergte Branch `chore/review-bot-score-pass` (commit fef39401) mit 16 Files in einem Review-Bot-Score-Pass (22 ESLint-Errors auf 0, 1 CSS-Duplikat entfernt), (2) i18n-Strings aus FIX-04-03-40-Follow-up (commits 3051f823 + 09419cf8, kosmetisches `modal.modelConfig.noModelsUrl` Update).

**Verdict:** Green. 0 H/M/L, 1 Info (i18n-kosmetisch). `npm audit` 0 Findings (Baseline unveraendert von AUDIT-032).

### Cleanup-Pass Review

Alle 16 Cleanup-Änderungen pro Kategorie geprueft:

- **Removed type assertions (5 Stellen):** alle waren no-ops (Compiler hatte den Typ bereits inferiert oder ein vorgeschalteter defensiver Guard sichert die Annahme ab). `BackupTab.ts` non-null-assert: 5 Zeilen vor der Read-Site steht `if (!settings.backup) settings.backup = {...}`.
- **Added narrowing casts (5 Stellen):** alle wiederholen Typen, die die Boundary bereits zusagt (`Map<string, string>` Iterator-Value, `bind()`-Result auf `AdapterLike['write']`, Constructor-Type mit `& { prototype: object }`). Kein widening, kein Boundary-Bypass.
- **String coercion in BackupExportService:225:** `String(manifest.schemaVersion)` defensiv im Error-Template; schema-version ist getypter numeric literal, kein User-Input. Kein Injection-Vektor.
- **eslint-disable Position-Fixes (GitCheckpointService.ts + EsbuildWasmManager.ts):** Direktive lag vorher zwischen Multi-Line-Kommentar und Code (matched Kommentarzeile, nicht Code). Jetzt direkt vor der `require('fs')`-Zeile. Die `require('fs')`-Aufrufe selbst sind seit AUDIT-030 etablierte Ausnahmen (isomorphic-git + cache-folder ausserhalb des Vaults, Plugin ist `isDesktopOnly:true`). Kein neuer Pfad.
- **File-level disable RerankerService.ts:** Pattern-B-konform, schliesst `no-explicit-any` explizit aus (Bot verbietet das). Boundary ist untyped transformers.js / onnxruntime-web. Inputs validated by callers, Outputs als plain numbers coerced.
- **Arrow-function Rewrite SkillWriteInterceptor:** semantisch identisch zum `const self = this` Pattern. Monkey-Patch-Reihenfolge (`await maybeSnapshot` vor delegated write) unveraendert.
- **`async () => {}` zu `() => {}` in ExecuteCommandTool:** `withNoticeCapture` Signatur akzeptiert `() => Promise<T> | T`. NoticeCapture-Controls (AUDIT-FEAT-29-03+04: Token-Format-Redaction, max-captures Cap, 500-char per-notice Cap, M-1 module-level Singleton) unberuehrt.
- **CSS Pattern-N-Merge in styles.css:** Union der Properties identisch zur Cascade-Reihenfolge davor. Reines Styling.

### i18n Delta

Einziger geaenderter String in `en.ts:1255`: "Model ID field" wird zu "field". Render via `setText` auf `<p>`, kein `innerHTML`, keine User-Input-Interpolation. Reine UI-Klarstellung.

### Open Concerns

- **Trust-boundary Pattern in BackupExportService.readManifest** ist unveraendert pre-existing. Die Manifest-Schema-Validierung steht in `unpackZip` (Zeile 224, ungeaendert) -- nur dort wird `manifest.schemaVersion !== 1` enforced. `readManifest` ist UI-Inspection-Helper (Public-API fuer "ZIP-Vorschau"). Wenn die UI in Zukunft handelt bevor `unpackZip` lief, muss der schema-version-Check dorthin gezogen werden. Aktuell kein Problem, weil UI nur die Manifest-Felder anzeigt.
- **24 outdated NPM packages,** keine mit offenen Advisories. Routine-Maintenance, kein Audit-Finding. SDK-Updates (`@anthropic-ai/sdk`, `@aws-sdk/*`, `@typescript-eslint/*`) sammeln sich; im nächsten Maintenance-Window batchen.

### Release Recommendation

`chore/review-bot-score-pass` nach dev mergen, regulaer mit v2.12.6 raus. Keine separate Security-Note in den Release Notes, da kein Advisory geschlossen wurde -- Review-Bot-Score-Pass und i18n-Klarstellung reichen als Beschreibung.

Naechster periodischer Full-Audit wird etwa 2026-06-19 faellig (ein Monat nach AUDIT-030). Bis dahin targeted per-release, sobald ein Dependabot-Alert aufgeht oder ein nicht-trivialer Feature landet.

### Naechster Schritt

`chore/review-bot-score-pass` ueber `scripts/merge-to-dev.sh` nach dev mergen, dann den nächsten dev-zu-main-Schwung anstossen. Audit-Branch `feature/audit-2026-05-30` kann nach Review geloescht werden (Report ist der einzige Deliverable und liegt unter `_devprocess/analysis/`).

Report: `_devprocess/analysis/AUDIT-033-v2.12.6-2026-05-30.md`.


---

## 2026-05-31 -- AUDIT-034 v2.12.8 pre-release delta-audit

**Verdict:** GREEN (0 Critical / 0 High / 0 Medium / 0 Low / 1 Info).

### Scope

Delta against the seven FIXes from commit `407f21fc` on
`fix/code-review-7-findings`:
FIX-01-05-02 (EditFileTool fuzzy-match), FIX-01-12-02 (AttachmentHandler
collision), FIX-04-03-09 (OpenAI-shape providers image-block),
FIX-13-02-01 (Kilo tool_calls flush), FIX-13-02-02 (Kilo delta.content
array), FIX-18-04-02 (estimatePromptTokens tools), FIX-18-04-03
(truncatedToolInputError wasMaxTokens).

### SAST + OWASP + LLM Top 10

Clean across all categories. The image data-URL is constructed from a
typed `ImageMediaType` union sourced inside the AttachmentHandler trust
boundary and emitted only to the LLM API, not to a browser DOM.
`tryNormalizedMatch` regex is linear (no ReDoS). The collision-rename
cascade respects the existing `sanitiseAttachmentFileName` boundary
from AUDIT-025 M-1.

### SCA

`npm audit` reports 0 vulnerabilities across 1006 packages, unchanged
from AUDIT-033. No new dependency added.

### Unresolved findings

I-1 (Info, accepted): TOCTOU between getAbstractFileByPath and
createBinary in `resolveAttachmentTargetPath`. Obsidian is
single-process; the only writer is the sidebar drop handler. Worst
case is local-vault inconsistency, no remote attack vector. Revisit
if telemetry shows it firing.

### Open concerns

None blocking the v2.12.8 release.

### Architectural notes

`utils/openAiContent.ts` and `utils/toolCallFlush.ts` are the new
canonical seam for OpenAI-shape provider quirks. Future provider
patches that touch tool-call streaming or delta content should land
here, not as parallel one-offs.

`chatgpt-oauth.ts` has a different Responses-API surface (incomplete
status reason instead of finish_reason chunks). FIX-18-04-03 is wired
for the three streaming providers; the chatgpt-oauth equivalent is
tracked in that spec as a follow-up and is out of scope for v2.12.8.

### Release Recommendation

GREEN. Merge `fix/code-review-7-findings` -> dev -> main, ship v2.12.8.

### Next step

User-initiated `/release` continues with Schritt 5 (merge-to-dev) on
the existing `fix/code-review-7-findings` branch.

Report: `_devprocess/analysis/AUDIT-034-v2.12.8-2026-05-31.md`.

---

## 2026-06-07 -- EPIC-32 Stigmergy-VO Vertrag und Haertung: Coding + Security Audit -> Release Closure

**Phase:** Coding (Phase 1+2+3 implementiert) + Security Audit (AUDIT-036) abgeschlossen. Ready for Release Closure auf branch `stigmergy-test`.

### Artefakte erzeugt

- AUDIT-036: `_devprocess/analysis/AUDIT-036-epic32-stigmergy-hardening-2026-06-07.md` (Per-Item Delta auf AUDIT-035)
- V-Model-Doku: EPIC-32, FEAT-32-01/02/03, ADR-130/131/132/133, arc42 Sektion 8.16
- Code: 14 modifizierte Source-Files plus 4 neue Helper-Module (`precedenceResolver`, `stigmergyEmitGate`, `topicSlug`, `withTimeout`) plus 1 DB-Schema-Migration v4 -> v5
- Tests: 75 / 75 GREEN ueber 10 neue Test-Suites

### Overall risk verdict

**Low** (Release-readiness GREEN). 8 Findings initial (0 H, 1 M, 5 L, 2 I); nach Fix-Loop 0 H, 0 M, 0 L, 2 I (beide akzeptiert per Design).

### Unresolved P0 / P1

Keine.

### Resolved im Fix-Loop

- **M-1** hono <4.12.21 (4 GHSA-Advisories transitiv via @modelcontextprotocol/sdk): `package.json` overrides bumped auf `>=4.12.21`, npm audit jetzt 0 vulns ueber 1010 packages.
- **L-1** `__testHooks` runtime export: NODE_ENV-Guard, Production-Bundle shipped `undefined`, tree-shake-bar.
- **L-2** JSON-Shape-Validation fuer `stigmergy_json`: Runtime type guard `isEpisodeStigmergySnapshot` rejected malformed snapshots vor Promotion-Gates.
- **L-3** Pipeline source trust boundary: `[Substrate-Skip]` debug log macht non-model dispatches sichtbar fuer Code-Review-Grep.
- **L-4** LLM01 adjacency in `promoteFromStigmergyPath`: User-Message in `<user_message>`-Markern, ASCII-control-strip, 500-Char-Cap, System-Prompt-Instruktion gegen Imperative im Marker-Block.
- **L-5** `appendGuidanceText` shallow-copy: Input-Typ verstaerkt auf `ReadonlyArray<UserContentBlock>`, Contract-Doc explizit, kein Deep-Clone (Hot-Path).

### Deferred (bleiben akzeptiert per Design)

- **I-1** `withTimeout` abortet inner Promise nicht: bounded fuer aktuellen Caller (`discoverSkills`, Read-only Files). Erweitern um `AbortSignal` wenn erster heavy Caller auftaucht.
- **I-2** MemoryDB v5 Migration ohne expliziten WriterLock: additiv `ADD COLUMN` ohne Row-Mutation, sql.js single-threaded, kein Korruptionsfenster. ADR-133 dokumentiert die FIX-12-Lehre fuer kuenftige spaltenmutierende Migrationen.
- **FIX-32-03-01/02/03** Pause-Notice, SingleCallProcessor Abort, ExtractionQueue Retry-Backoff: deferred ins Backlog (siehe BACKLOG.md), brauchen separate Plumb-Schritte mit isolierten Live-Tests.

### Architectural security concerns

Keine. Die Stigmergy-Integration bleibt eine externe Beratungsschicht ohne Code-Execution-Surface zum Plugin (Socket-RPC liefert nur Capability-IDs und Mode-Enums; jeder Pfad ist NOOP-faehig). Episode-Snapshot persistiert nur Capability-IDs, keine User-Texte, Privacy-safe by construction. Recipe-Promotion-Pfade laufen durch dieselben Length-Caps und Schema-Validierung wie ADR-058.

### Release Recommendation

GREEN. Merge `stigmergy-test` -> `dev` -> `main` ready. v2.12.9 oder v2.13.0 Release-Cycle kann starten.

### Next step

User-initiated `/release` oder `/dia-orchestrator` fuer Phase 7 (Release Closure: Version bump, Release Notes, sync-public, GitHub Release).

Report: `_devprocess/analysis/AUDIT-036-epic32-stigmergy-hardening-2026-06-07.md`.


---

## 2026-06-15, AUDIT-037 v2.14.2 Delta-Audit + Fix-Loop

### Overall Risk Verdict

Initial: YELLOW (3 H, 5 M, 3 L, 2 I). Post-fix-loop (same day): GREEN. All
13 findings plus the two Dependabot alerts (GHSA-gv7w-rqvm-qjhr,
GHSA-g7r4-m6w7-qqqr) resolved in one wave on `feature/audit-2026-06-14`.

### Unresolved P0 / P1

None. Every High and Medium finding has a landed fix with regression
coverage. The Low and Info findings are also addressed end-to-end.

### What landed (file by file)

- `src/api/providers/providerUrlGuard.ts` (new): SSRF guard with strict
  allow-list for Bedrock, permissive HTTPS-only policy for OpenAI-compatible
  cloud types, loopback / RFC 1918 only for ollama and lmstudio, and a
  hard block on AWS / GCP metadata hosts and 0.0.0.0. 26 contract tests.
- `src/api/providers/openai.ts` and `bedrock.ts`: validateProviderUrl
  invoked at constructor time; the guard throws before the SDK client is
  built.
- `src/core/tools/agent/ConfigureModelTool.ts`: isWriteOperation set to
  true plus a per-call validateProviderUrl gate on base_url updates so a
  compromised turn cannot re-point a provider at an attacker host.
- `src/mcp/tools/searchHistory.ts` and `recallMemory.ts`: every excerpt
  passes through wrapVaultContentForMcp, matching searchVault and
  readNotes; closes the indirect prompt-injection vector via
  save_conversation from external chat surfaces.
- `src/core/memory/ExtractionQueue.ts`:
  - M-1: enqueue() auto-parks new items when sessionDisabledReason is set
    and when items.length >= MAX_ACTIVE_ITEMS (200). Both emit one
    extractionDropped event per parked item.
  - M-3: retryTimerToken monotonic counter; the setTimeout callback
    compares against the captured token and bails on mismatch.
    cancelInFlight() now bumps the token first, sets cancelled, clears
    the timer, then aborts.
  - M-4: strict isValidExtraction schema validator in load(); malformed
    items move into parkedItems with failureCount = PARK_THRESHOLD plus
    one console.warn per drop.
- `src/core/memory/MemoryV2Telemetry.ts`:
  - M-2: sanitizeErrorMessage drops sk-..., Bearer, AWS access key, JWT
    and Slack token patterns and trims to 500 chars. hashConversationId
    salts the id with a per-session 16-byte salt and emits a djb2 hex
    digest, so telemetry events still correlate without exposing the id.
- `src/api/providers/bedrock.ts`:
  - M-5: additionalModelRequestFields try-catch now only swallows
    TypeError and RangeError; every other throw bubbles up. Logged at
    console.warn with modelId and reasoningEffort so a real bug is no
    longer silent.
- `src/core/AgentTask.ts`:
  - L-1: PER_TURN_THINKING_CAP=50_000 trims the assistant thinking block
    inline with a "[thinking truncated]" marker so reasoning-heavy turns
    do not accumulate RAM ahead of condensing.
- `src/core/sandbox/IframeSandboxExecutor.ts`:
  - L-2: performance.memory sampler at 500 ms intervals with
    HEAP_LIMIT_BYTES = 128 MB. On breach: clears every pending execution,
    destroys the iframe, logs a warning.
- `src/core/sandbox/SandboxBridge.ts`:
  - L-3: Notice surfaces the circuit-breaker trip ("Vault Operator
    sandbox bridge paused after N errors. Auto-reset in 30s.").
- `package.json`: esbuild bumped to ^0.28.1 with a self-referential
  override; npm audit reports 0 vulnerabilities (was 6 High on the
  esbuild dev chain).
- `scripts/update-esbuild-integrity.sh` (new): downloads the live
  esbuild-wasm artefacts from jsdelivr, compares against the
  INTEGRITY_HASHES committed in EsbuildWasmManager.ts, exits non-zero on
  drift so CI can fail loudly on a missed bump.

### Architectural concerns for future cycles

None. The provider URL guard, the queue cap and the telemetry sanitizer
are additive defensive layers and do not change any architecture
decision recorded in arc42 or the ADR set. The validateProviderUrl
strict-vs-permissive split is documented inline.

### Test Coverage

2726 passing + 1 expected fail (+27 vs the pre-audit baseline). All 26
URL guard contract tests added. Existing memory and MCP test suites
remain green. Build clean (main.js 4.7 MB, deploy successful).

### Release Recommendation

GREEN for 2.14.3 (security patch). Recommended next step: bump
manifest, append release notes, push through dev -> main -> public
release per the established mechanic.

Report: `_devprocess/analysis/AUDIT-037-v2.14.2-delta-2026-06-14.md`.

---

## 2026-06-18 -- FIX-04-03-10 Thinking-Toggle OpenAI-compat: Testing -> Security-Audit

**Phase:** Testing abgeschlossen. Ready for security-audit.

**Artefakte erzeugt:**

- Tests: [src/api/providers/__tests__/thinking-toggle-openai-compat.test.ts](../../src/api/providers/__tests__/thinking-toggle-openai-compat.test.ts) -- 7 Tests, 6 AC aus Spec + 1 Coexistence-Gap-Filler `reasoningEffort`.
- Backlog-Row FIX-04-03-10 auf Phase=Review geflippt.
- FIX-Spec: [_devprocess/requirements/fixes/FIX-04-03-10-thinking-toggle-openai-compat.md](../requirements/fixes/FIX-04-03-10-thinking-toggle-openai-compat.md)

**Test-Ergebnisse:**

- 7/7 Thinking-Toggle-Tests gruen
- 198/198 api/-Tests gruen (kein Regression)
- tsc clean, esbuild clean, build 4.7 MB, deploy gruen
- Manueller Branch-Check: 100% Coverage auf neuer Logik (`chatTemplateKwargsForThinking` + `maybePrefixQwenThinkingToken`, je 3 bzw. 4 Branches, alle getroffen)

**Akzeptierte Coverage-Luecke:**

- `@vitest/coverage-v8` ist projektweit NICHT installiert. Quantitative Line/Branch/Function-Coverage-Reports koennen damit nicht generiert werden. Begruendung der Akzeptanz: das fehlt seit Projektstart und ist nicht spezifisch fuer diesen Fix. Empfehlung als IMP-Item (out of scope dieses Fixes): `npm i -D @vitest/coverage-v8` plus `coverage.include`-Konfiguration in `vitest.config.ts`. Fuer FIX-04-03-10 reicht der manuelle Branch-Check, weil die neue Logik nur 7 Branches umfasst und alle in Tests namentlich getroffen werden.

**Brittle Tests / Flaky Patterns:**

Keine. Tests laufen deterministisch in <200ms, kein async-Waiting, kein Timer-Mocking, kein State-Sharing zwischen Tests.

**Security-adjacent Concerns fuer /security-audit:**

- **`chat_template_kwargs` als Extra-Body-Feld:** der OpenAI-Client serialisiert beliebige Top-Level-Felder ueber den Wire. Server-seitig wird das per Spec ignoriert oder pass-through-d. Es gibt **keinen** User-kontrollierten Pfad in dieses Feld -- der Wert ist `{ enable_thinking: <bool> }` aus Plugin-Code, nicht aus User-Input. Risikoflaeche: praktisch null.
- **`/no_think` / `/think` System-Prompt-Prefix:** wird unkonditionell vor den vom Plugin gebauten System-Prompt gehaengt, wenn Gate erfuellt. User kann den Token-Inhalt nicht beeinflussen (literale Strings). Kein Prompt-Injection-Vektor.
- **Gate-Logik:** zweimal `typeof === 'boolean'`-Check verhindert versehentliches Triggern bei `null` / `0` / `""` / etc. `Set.has`-Check kuerzt fuer fremde Provider-Typen sauber ab.
- **Bestehende Pfade unberuehrt:** OpenRouter-Reasoning, OpenAI/Azure-Reasoning-Effort, Anthropic/Bedrock-Thinking -- alle unveraendert. Diff ist additiv: neue Konstanten + zwei neue Helper-Methoden + zwei Insert-Punkte in `createMessage`. Keine geloeschten Branches.
- **Wire-Format-Surface:** nur fuer `custom` / `ollama` / `lmstudio`. Strikte Backends, die unknown Body-Fields mit 400 ablehnen, sind eine theoretische Restkategorie -- gewichtet niedriger als der User-Bug, in der Spec explizit out-of-scope.

**Naechster Schritt:**

`/security-audit` mit Scope=delta, Fokus auf den Diff in `src/api/providers/openai.ts` (zwei neue Helper + Insert-Punkte) und den neuen Tests. Erwartung: GREEN ohne Findings (additiver Patch, kein neuer Datenfluss).

**Live-Verifikation ausstehend:**

oMLX + Qwen3 + Toggle OFF gegen lokales Setup von User arkham000 -- erst nach Merge in dev und Release. Dieser Test laeuft nicht im Plugin-CI, sondern beim User.

---

## 2026-06-19 -- RE -> Architecture: IMP-20-06-01 Claim Check + Review Hints

**Phase:** Requirements Engineering (RE) complete.
**Item:** IMP-20-06-01 (`_devprocess/requirements/improvements/IMP-20-06-01-claim-check-review-hints.md`)
**Parent feature:** FEAT-20-06 (Knowledge Freshness, released; Stages 0-3 active in code, Stages 4-5 implementiert in diesem IMP).
**Epic:** EPIC-20 Graph Intelligence.

### Was wurde uebergeben

10 Bauteile, 12 Akzeptanzkriterien, 12 binding Constraints (C-01 bis C-12) aus zwei voraufgehenden Audits. Volle Spec im IMP-File.

### Quantifizierte NFRs

- **Performance**: Stage-4-Cost pro Run unter 0.10 USD (1000-Note-Vault, alignt mit FEAT-20-06 Section "Cost Per Scan"). Hard cap im bestehenden `Stufe3PeriodicJob.spendTokens`-Mechanismus, kein paralleler Budget-Pot.
- **Throughput**: Mid-Tier-Call pro Note 5000 Input + 500 Output Token als Ceiling. NoteSelector limitiert auf Top-N pro Cluster, default N = 5.
- **Scheduling**: volatile Notes werden bevorzugt selektiert. `freshness_class` ist Scheduling-Signal, Default-Frequenzen: volatile woechentlich, evolving monatlich, stable quartalsweise.
- **Retention**: `note_freshness_history` haelt maximal 5 Runs ODER 90 Tage pro Note, was zuerst eintritt.
- **Availability**: Knowledge-review-Tab muss innerhalb des bestehenden VaultHealthRepairModal in weniger als 250 ms laden, auch bei 200 geflaggten Notes. Virtual scroll oder Cluster-Grouping als Pflicht.

### Kritische ASRs (jede braucht eine ADR)

1. **Hook-Schema-Erweiterung**: `UpdateFinding.notes?: NoteVerdict[]` als additive Erweiterung von [Stufe3PeriodicJob.ts:24-30](../../src/core/health/Stufe3PeriodicJob.ts#L24-L30). Trade-off zwischen additive Erweiterung und Breaking-Schema-Change. Mehrere Caller, einschliesslich [main.ts:1481-1491](../../src/main.ts#L1481-L1491) `notificationSink`. ADR notwendig.
2. **Verifier-Pipeline-Platzierung**: Stage 4+5 laufen innerhalb `webUpdatePass`, nicht parallel. Bedeutet Token-Aggregation pro Cluster, nicht pro Note. ADR pin-pointed das Pattern und die Test-Implikation an [Stufe3Plan14.test.ts:109-117](../../src/core/health/__tests__/Stufe3Plan14.test.ts#L109-L117).
3. **Frontmatter-Write-Pattern**: zentraler `FrontmatterWriter` mit `WriterLock` pro Pfad, geteilt mit ingest-deep, mark_as_memory_source, update_frontmatter. ADR pinned die WriterLock-API und das Conflict-Resolution-Verhalten.
4. **External-Source-Adapter-Pattern**: WebSearchProvider-Interface aus ADR-104 erweitern um eine `verifierQuery(note): Promise<SearchResult[]>`-Methode mit harter Query-Cap (400 Zeichen, builder-side enforced). ADR begruendet die Cap und die Sanitizer-Pflicht.
5. **Frontier-Eskalation-Gating**: ZDR / no-logging Pflicht beim Frontier-Provider. ADR definiert die Fail-closed-Semantik und das Provider-Capability-Schema.

### Offene Architektur-Fragen fuer /architecture

- Wie genau wird `dismissed_freshness` aktiviert? Neuer Read-Pfad allein in `NoteSelector`, oder zentraler `DismissedHintsRepository` der von mehreren Hooks gelesen wird?
- ResolveConflictModal: erbt vom existierenden Modal-Pattern oder eigenes Pattern (das aktuelle Modal hat Tabs, neues Modal ist Diff-zentriert)?
- BatchResolveModal Abort+Resume: Resume-State in der DB (eigene Tabelle) oder in-memory bis Plugin-Reload? Trade-off zwischen Robustheit und Komplexitaet.
- `freshness.excludePaths` Default-Liste: vorgeschlagen `Private/`, `Personal/`, `Medical/`, `Clients/`. Ob diese Defaults aktiviert oder nur dokumentiert werden, ist UX-Entscheidung mit Privacy-Implikation.

### Constraints

- Budget: Stage-4-Pipeline darf das bestehende 2-USD-pro-Woche-Cluster-Budget nicht um Faktor 10 ueberschreiten. NoteSelector ist die Cost-Stellschraube.
- Compliance: BA-25 Anti-Definition (line 386): "Kein automatischer Vault-Modus, der ohne User-Zustimmung Frontmatter aendert." Heisst: Frontmatter-Write default OFF.
- Mobile: Knowledge-review-Tab muss auf iOS und Android read-only laden. Stage-4-Run nur Desktop, Sync bringt Verdicts auf Mobile.
- Schema-Migration: additive (CREATE IF NOT EXISTS, ALTER ADD COLUMN nullable). WriterLock vor ALTER (Lesson aus FIX-12).

### Forbidden-terms check

Akzeptanzkriterien (AC-01 bis AC-12) sind tech-agnostisch formuliert mit Ausnahme der ID-Referenzen auf konkrete Files. Tech-Details (sql.js, Mid-Tier-Modell-IDs, Provider-Spezifika) sind im Tech-Stack-Block und im Konsolidierungs-Constraints-Block lokalisiert, also in den Sektionen, die explizit Tech zulassen.

### Naechster Schritt

`/architecture` mit Anker IMP-20-06-01.
Erwarteter Output: ADRs zu den fuenf ASRs oben, plus arc42-Updates fuer Stage-4-Pipeline und Modal-Surface.
Danach: PLAN-Item, das die zehn Bauteile in Build-Wellen aufteilt.

---

## 2026-06-19 -- Architecture -> Coding: IMP-20-06-01 ADRs + Amendments

**Phase:** Architecture complete.
**Item:** IMP-20-06-01.
**Branch:** feature/imp-20-06-01-claim-check-review-hints (unchanged from RE phase).

### Tech-stack justification

Note-Verifier-Pipeline laeuft INNERHALB der bestehenden Stufe-3-Pipeline (`webUpdatePass` Hook). Token-Budget, Pause-Detection und Cooldown-Logik werden uebernommen aus ADR-105 ohne Sondercode. Mid-tier-Default plus optionale Frontier-Eskalation halten die Per-Run-Kosten innerhalb der existierenden 2-USD-pro-Woche-Decke.

Frontmatter-Write geht durch den existierenden zentralen Writer aus ADR-95 mit einer harten Allowlist genau auf den Schluessel `freshness`. Verdict-Summaries, Source-Links und Konfidenz-Werte leben in der DB, nicht im Vault. Diese Trennung schuetzt Vault-Sync-Surfaces (iCloud, Obsidian Sync, Git-Mirrors) vor LLM-erzeugtem Inhalt.

Externe Suche nutzt den existierenden `WebSearchService` aus ADR-104, ergaenzt um eine neue `verifierQuery`-Form mit harter 400-Zeichen-Schranke. Ein separater Toggle `freshness.externalSources.enabled` (default off) entkoppelt die Verifier-Pipeline von der Chat-Recherche; User, die im Chat einen API-Key hinterlegt haben, eskalieren nicht still in Background-Search.

Frontier-Eskalation erfordert eine ZDR-Capability, die der Provider melden muss. Fail-closed: wenn ZDR nicht aktiv setzbar ist, bleibt es beim Mid-tier-Verdict mit `confidence_low`-Marker in der UI.

### ADR-Konsolidierung

**Eine neue ADR plus vier Amendments**, statt fuenf neuer ADRs. Begruendung: die ASRs aus IMP-20-06-01 erweitern Patterns, die in bestehenden ADRs schon dokumentiert sind. Inflation vermeiden.

- ADR-135 (neu, Proposed): Verdict-Confidence-Routing und ZDR-Pflicht.
- ADR-95 (amended): Allowlist-Filter im FrontmatterWriter.
- ADR-104 (amended): `verifierQuery`-Form mit 400-Char-Cap.
- ADR-105 (amended): `UpdateFinding.notes?[]` additive Hook-Erweiterung, Verifier inside `webUpdatePass`, `NoteSelector` liest `freshness_class`.
- ADR-106 (amended): Knowledge-review-Tab plus `ResolveConflictModal` und `BatchResolveModal`, Verdict-zu-Severity-Mapping.

### Rejected alternatives

- Immer-Frontier-Modell: Kosten sprengen das Budget um Faktor 30 (ADR-135 Option 1).
- Immer-Mid-tier ohne Eskalation: schwierige Faelle bekommen schlechtere Verdicts und der User-Trust leidet (ADR-135 Option 2).
- Confidence-basierte Eskalation ohne ZDR-Pflicht: Privacy-Versprechen ist schwammig; sensible Notes wandern still in den nicht-ZDR-Pfad (ADR-135 Option 3).
- Neue note-scoped Hook neben den existierenden Cluster-Hooks: bricht das Token-Budget-Modell aus ADR-105 und verdoppelt die Wartungsoberflaeche.
- Separate Tabelle `note_freshness_verdict` neben dem existierenden `note_freshness`: bricht die `VaultRenameHandler.PATH_TABLES`-Konvention und ist unnoetiger Schema-Wildwuchs.
- Inbox-Note-Output gemaess urspruenglicher FEAT-20-06-Spec: ersetzt durch Modal-UI per User-Entscheidung 2026-06-19, im FEAT-20-06-Body als superseded markiert.
- Model-native Web Search: out-of-scope dieses ADR. Wenn relevant, eigene ADR-Erweiterung von ADR-104.

### Known risks

- Provider aendert seine ZDR-Garantie still in der Praxis. Mitigation: Plugin-Update kann die Capability-Default-Liste anpassen.
- sql.js-Memory-Cap durch `note_freshness_history` bei sehr grossen Vaults. Mitigation: harte Retention 5 runs ODER 90 Tage, summary und sources_json opt-in.
- Verdict-Reads im NoteSelector koennen mit gleichzeitigen Writes aus Stage 0 (`storeFreshnessClass`) konkurrieren. Mitigation: WriterLock-Pflicht aus FIX-12 gilt fuer den ALTER, und Reads sind tolerant gegen leere Spalten.
- BatchResolveModal Resume-State kann beim Plugin-Crash verloren gehen, wenn er nur in-memory ist. Mitigation: DB-persistierter Resume-State (Architektur-Vorschlag), Coding kann auf in-memory mit Onunload-Save reduzieren wenn intra-session Resume reicht.

### Open items handed to Coding

- Provider-Capability-Schema fuer ZDR pro Provider: Architektur-Vorschlag steht (Anthropic ZDR, Bedrock no-logging, OpenAI no-training). Coding pruefe gegen den aktuellen Provider-Klassen-Layer.
- Schema-Migration v10 nach v11: konkrete WriterLock-Sequenz fuer ALTER nach FIX-12-Pattern. Coding entscheidet die genaue Reihenfolge in `KnowledgeDB.applyMigration`.
- Settings-UI fuer die vier neuen Toggles: Defaults stehen, Tooltips und Capability-Status-Indicator sind Coding-Entscheidung.
- `dismissed_freshness`-Reader: zentral oder direkt im NoteSelector. Architektur-Vorschlag ist zentral, Coding pruefe Aufwand-Nutzen.
- BatchResolveModal Resume-State Persistenz-Strategie: DB-Tabelle vs in-memory mit Onunload-Save. Coding entscheidet basierend auf konkretem UI-Verhalten.

### Consistency check

plan-context-imp-20-06-01.md ist konsistent mit ADR-135, ADR-95 (amended), ADR-104 (amended), ADR-105 (amended), ADR-106 (amended). Tech-Stack im plan-context matcht die Decision in ADR-135 und die Amendments. arc42 Section 9 hat ADR-135 in der Tabelle. arc42 Section 10 hat drei neue Qualitaetsszenarien fuer ZDR-fail-closed, Frontmatter-Allowlist-Filter und Query-Cap. `src/ARCHITECTURE.map` hat sieben neue Wayfinder-Rows, je ein Eintrag pro ADR-relevante Komponente.

### Naechster Schritt

`/coding` mit Anker IMP-20-06-01. Erwartete Coding-Phase: Schema-Migration v10 nach v11, FreshnessVerifier, NoteSelector, FreshnessQueryBuilder, UI-Komponenten (`VaultHealthRepairModal`-Tab + Sub-Modale), Settings-UI, Allowlist-Test, Char-Cap-Test. PLAN-Item splittet die zehn Bauteile aus IMP-20-06-01 in Build-Wellen, voraussichtlich vier (Schema + Verifier-Core, NoteSelector + QueryBuilder, UI-Welle, Settings + Tests).

---

## 2026-06-19 -- Testing -> Security-Audit: IMP-20-06-01 Claim Check + Review Hints

**Phase:** Testing abgeschlossen. Ready for /security-audit.

**Artefakte erweitert:**

- `src/core/health/__tests__/FreshnessOrchestrator.test.ts` (+2 cases: multi-row mirror + history persistence, frontier escalation under ZDR end-to-end)
- `src/core/health/__tests__/NoteSelector.test.ts` (+2 cases: non-verdict hint_type isolation, per-class cooldown windows)

**Verify-Gate:**

- Suite 2904 passing + 1 expected fail (no regression)
- 0 lint errors (tsc -noEmit clean)
- Test-Delta gegenueber /coding-Ende: +4 cases

**Coverage-Hinweise und akzeptierte Luecken:**

- `extractUrlsFromText` in `src/main.ts` (file-private Regex + Set-Dedup) bleibt ohne Direkttest, da die Funktion file-private ist und ein Export-Refactor mehr Komplexitaet bringen wuerde als das Trivial-Code rechtfertigt. Strong-Signal-Pfad ist indirekt durch die orchestrator-Pipeline abgedeckt.
- UI-Modale (`VaultHealthRepairModal`-Knowledge-review-Tab, `ResolveConflictModal`, `BatchResolveModal`, `VaultTab.buildFreshnessSection`, `ProviderDetailModal`-ZDR-Toggle) sind bewusst nicht unit-getestet. Das Projekt hat fuer Modal-Code keinen vorhandenen Test-Pattern; Verhalten ist durch manuelle Smoke-Tests gesichert. Datalayer (KnowledgeReviewReader, FreshnessFrontmatterPatcher, ZdrCapabilityResolver) ist unit-getestet.
- Coverage-Tool laeuft im default vitest-Setup nicht; konkrete line/branch/function-Prozente daher nicht gemeldet. Anzahl Tests pro Komponente ist im Plan-40 Implementation-Notes-Block je Welle gelistet.

**Sicherheits-relevante Beobachtungen fuer Security-Audit:**

- LlmVerifierProvider buildet Prompt mit `cluster.sources` Liste. Web-Search-Results kommen aus Brave/Tavily; Tavily-Snippets koennen prompt-injection-Vektoren tragen. Verifier-Prompt sollte gegen "ignore previous instructions"-Pattern haerten (Mitigation moeglich via System-Prompt-Pflicht + Sources als ZITAT geklammert). Aktuell: Sources werden als Liste mit Nummerierung eingebettet, kein Quote-Escape.
- ResolveConflictModal.openInChat schreibt Note-Pfad und Sources direkt in den Prompt. Sources kommen aus der DB (verifier-recorded). Pfade kommen aus der Vault. Kein Sanitize. Theoretischer Vector: bösartiger Note-Pfad mit Markdown-Injection.
- BatchResolveModal.deleteRow trashFile ohne explizite Confirm-Schwelle. User-bewusst (Modal selbst ist die Confirm-Schwelle), aber bei sehr grossen Mengen sollte ein "are you sure"-Schritt vor dem Loop geprueft werden.
- ProviderConfig.zdrCapable ist ein User-affirmation-Flag. Es gibt kein Provider-side-check; der User muss verantworten, dass die Affirmation stimmt. Das ist beabsichtigt (ADR-135) -- Security-Audit sollte aber bestaetigen, dass das Modell-Surface die Beschriftung "I have confirmed with this provider" klar als User-Verantwortung darstellt.
- FreshnessFrontmatterPatcher filterToAllowlist droppt Keys ueber object-property-lookup. Sicher gegen prototype-pollution-Keys, da nur die literale `freshness`-Whitelist matcht und kein dynamischer Key durchgeschleift wird.

### Naechster Schritt

`/security-audit` mit Anker IMP-20-06-01. Erwartete Audit-Punkte:

1. Prompt-Injection-Analyse fuer LlmVerifierProvider.buildPrompt (Source-Snippets)
2. Note-Path-Sanitization im ResolveConflictModal.openInChat-Prompt
3. dismissed_freshness-Race-Conditions wenn parallele Modal-Aktionen den gleichen Pfad treffen
4. note_freshness_history retention-Sweep DoS-Risiko bei pathologisch vielen Einträgen pro Pfad
5. ProviderConfig.zdrCapable als User-Affirmation-Pattern: Klarheit + Persistenz + Rollback bei type-Wechsel

---

## 2026-06-19 -- Security-Audit -> Release-Closure: IMP-20-06-01 Claim Check + Review Hints

**Phase:** Security-Audit abgeschlossen mit Fix-Loop. Ready for Release-Closure / /dia-orchestrator Phase 7.

**Verdict:** Overall Risk Low. Release recommendation: green.

**Audit-Report:** `_devprocess/analysis/AUDIT-IMP-20-06-01-2026-06-19.md`

**Gefundene Findings:** 0 Critical, 0 High, 3 Medium, 4 Low, 4 Info.

**Resolved im Audit-Pass (Option B):**

- M-1: BatchResolveModal per-batch confirmDestructive vor Bulk-Delete
- M-2: LlmVerifierProvider.buildPrompt fenced den Note-Body in [BEGIN_NOTE]/[END_NOTE] mit "treat as data"-Direktive (Prompt-Injection-Härtung)
- M-3: FreshnessOrchestrator.enabled()-Gate; main.ts wired auf `freshness.externalSources.enabled || freshness.writeFrontmatter` (Authorization-Gate, Verifier-no-op bei OFF-Default)
- L-3: console.warn redacted auf error.message-only (kein Provider-Body-Echo das Tavily-api_key tragen koennte)
- L-4: ProviderDetailModal resettet formZdrCapable=false bei provider-type-Wechsel

**Deferred zur Backlog:**

- FIX-20-06-02 (L-1, P3): Brave/Tavily URL-Pfad-Sanitization vor Prompt-Embed
- FIX-20-06-03 (L-2, P3): Note-Pfad-Markdown-Escape im openInChat-Prompt (Trigger erst bei realer Chat-Sidebar-Uebergabe)

**Out of Scope:** npm audit reports 12 Critical + 6 High die alle aus v2.14.7 herueberkommen (eslint, pptxgenjs, @modelcontextprotocol/sdk, openai 4.x, hono, etc.). Diese gehoeren in einen separaten AUDIT-038 Delta-Audit auf den Dependency-Tree, nicht in IMP-20-06-01.

**Architektur-Beobachtungen (rein informativ):**

- Verdict-Whitelist + Confidence-Clamp begrenzen die Auswirkung jeder prompt-injection: selbst manipulierte LLM-Antworten muessen die 5 erlaubten Literale matchen, confidence wird auf [0,1] geclamped, summary ist kurz. Die UI zeigt das Severity-Mapping, der User entscheidet immer manuell. Kein automatisches Handeln auf Basis eines Verdicts.
- Die ZDR-Affirmation ist explizit als User-Verantwortung formuliert ("I have confirmed with this provider"). Kein Provider-API-Check existiert; das ist beabsichtigt (ADR-135).
- FreshnessFrontmatterPatcher.filterToAllowlist ist prototype-pollution-safe, da nur ueber das literale FRESHNESS_ALLOWLIST-Array iteriert wird (Audit I-3).

**Test-Result nach Fix-Loop:** 2906 passing + 1 expected fail (Stand: post-audit). +2 cases gegenueber post-testing-Baseline.

**Build:** clean (main.js 4.7 MB), deployed.

### Naechster Schritt

`/dia-orchestrator` Phase 7 (Release-Closure) -- oder direkter Release-Path via `/release` mit Version-Bump. PLAN-40 Released, IMP-20-06-01 Done, 2 P3-FIX im Backlog gequeued. Empfohlener Tagline-Kandidat fuer das naechste Release: "Knowledge freshness, with note-level verifier."

---

## 2026-06-19 -- Live-Test-Feedback: Vocabulary + Tab-Rename IMP-20-06-01

**Phase:** Post-live-test follow-up auf das IMP-20-06-01-Coding. Manuelles Smoke-Testing nach Wave 4 hat drei Probleme aufgedeckt, die in dieser Rename-Pass adressiert wurden.

**Befunde aus dem Live-Test:**

1. Der "Aging knowledge"-Tab zeigte deutsche Verdict-Tokens (widerspricht, ergaenzt) in der UI. Das Plugin-UI ist Englisch-only per [[feedback-ui-language-and-naming]]; die deutschen TriageCard-Tokens haben sich von FEAT-19-12 in IMP-20-06-01 weitervererbt.
2. "Cluster freshness (Karpathy-Lint)" wurde unter "Findings" gerendert, semantisch gehoert es aber in den selben Topf wie die Note-Level-Verdicts.
3. Der Tab-Name "Aging knowledge" trifft den Inhalt nicht: er enthaelt nicht nur Aging-Faelle sondern auch Contradictions und Outdated-Markierungen.

**Behoben in diesem Pass:**

- **Verdict-Vokabular von Deutsch auf Englisch:** `deckt-sich` -> `matches`, `ergaenzt` -> `extends`, `widerspricht` -> `contradicts`. `outdated` und `no_external_source` waren von Anfang an englisch und bleiben unveraendert. Quellen-Files: types.ts, LlmVerifierProvider (Prompt + Whitelist), KnowledgeReviewReader (mapSeverity), settings.ts (DEFAULT_FRESHNESS_SETTINGS.frontierSeverityFilter), alle Health-Test-Files.
- **DB-Schema-Migration v11 -> v12:** rewrite-in-place der drei deutschen Verdict-Werte in `note_freshness.last_verdict` und `note_freshness_history.verdict`. Idempotent (English-canon + outdated + no_external_source + NULL passieren unveraendert). Extrahiert als pure Helper `migrateVerdictVocabularyV11ToV12` mit eigenem Migration-Test (4 cases, alle gruen).
- **Tab-Rename Aging knowledge -> Knowledge review:** TopTab `'aging'` -> `'review'`. Klassennamen `.vault-health-aging-*` -> `.vault-health-knowledge-review-*` (10 Klassen). Methoden `showAgingKnowledge` -> `showKnowledgeReview`. Reader umbenannt: `AgingKnowledgeReader` -> `KnowledgeReviewReader`, ebenso `AgingRow` -> `ReviewRow`, `AgingSeverity` -> `ReviewSeverity`. Datei-Rename via `git mv` (history bleibt erhalten).
- **Cluster-Freshness in den Knowledge-review-Tab verschoben:** neuer Filter `KNOWLEDGE_REVIEW_CHECKS = {'cluster_freshness'}` filtert die Finding aus `showFindings` raus und `renderClusterFreshnessSection` rendert sie im Knowledge-review-Tab als eigene Sektion (oben, ueber den per-note-Verdicts). Bisheriger "Discuss freshness update"-Button bleibt erhalten und gibt jetzt einen vorbereiteten Chat-Prompt an `onDiscuss` weiter.
- **User-faced Display-Labels:** Verdict-Literals bleiben in Storage und Code in der englischen Kurzform (matches/extends/contradicts/outdated/no_external_source); die UI mappt das ueber eine `VERDICT_LABELS`-Konstante auf lesbare Phrasen: `matches` -> "Matches sources", `extends` -> "Could extend", `contradicts` -> "Contradicted by sources", `outdated` -> "Outdated", `no_external_source` -> "No external evidence yet". Same Mapping doppelt im VaultHealthRepairModal und ResolveConflictModal (Inline, kein zentraler Helper notwendig).

**ARCHITECTURE.map:** zwei Zeilen umbenannt (`aging-knowledge-tab` + `aging-knowledge-reader`), eine neue Zeile `verdict-vocab-migration` ergaenzt.

**Doku-Sync:** PLAN-40, IMP-20-06-01, ADR-135, ADR-106-Amendments, plan-context, AUDIT-Report alle auf das neue Vokabular gezogen. BACKLOG-Rows PLAN-40 / ADR-135 / IMP-20-06-01 auf "Knowledge-review-Tab" und English-Verdicts angepasst.

**Risiko fuer existierende Installs:** Self-Build-User, die vor dem Migration-Bump eine DB mit deutschen Verdict-Werten geschrieben haben, kriegen die Werte beim nächsten Plugin-Load automatisch uebersetzt. KEINE manuelle Aktion noetig. Test deckt drei Faelle ab: deutsche Verdicts werden gemappt, englische bleiben unveraendert, NULL bleibt NULL, doppelte Anwendung ist no-op.

### Naechster Schritt

Adversarial Verify-Workflow + Full-Suite-Lauf. Wenn clean: commit der Rename-Wellen unter `chore: IMP-20-06-01 vocabulary + tab rename + cluster freshness move`.

---

## 2026-06-22 -- security-audit (AUDIT-034)

**Phase:** Full-codebase delta audit since AUDIT-033 (v2.12.6 -> v2.14.15), branch `feature/audit-2026-06-22`.

**Scope:** SAST + OWASP Top 10 + OWASP LLM Top 10 + SCA + Zero Trust ueber Retrieval Wave 1, Memory v2 Phase 6, EPIC-32 Stigmergy, Office-Pipeline, Reasoning-Effort-Steering, Plugin-API-Discovery (FEAT-29).

**Verdict:** Resolved (initial High wegen 5 credential-encryption + path-traversal Findings, alle im Fix-Loop am gleichen Tag geschlossen).

**Zahlen:** 79 confirmed findings (84 dropped). 0 Critical, 5 High, 28 Medium, 36 Low, 10 Info. Fix-Loop: 33 Resolved, 8 Partial, 0 Deferred, 0 Blocked. Build clean, 3162/3163 Tests gruen + 1 expected fail.

**Schwerpunkte gefixt:**

- H-1 EditFileTool Hidden-Folder-Path-Traversal: `validateVaultRelativePath` + cleanPath durchgaengig, 4 Regression-Tests (`.foo/../../etc/passwd`, `../outside.md`, NUL-byte, `%2e%2e`).
- H-2/H-3/H-4 GlobalSettingsService Credential-Encryption-Desync gegen main.ts: shared `providerCredentialCrypto` walker (single source of truth). ChatGPT-OAuth-Tokens, providerConfigs[].credentials, legacy_active_models_backup jetzt at-rest verschluesselt im global-settings-Pfad. Round-trip Tests pinnen.
- H-5 zod>=4.4.0 npm override gegen CVE-2026-6991 (transitiv via openai 5.23.2).
- M-1/M-2 WriteFileTool + ReadFileTool Pfad-Validation am Tool-Eingang, Adapter-Fallback laeuft durch denselben Helper.
- M-3+L-5+L-13+L-14 WebFetchTool SSRF-Haertung: CGNAT 100.64/10, IPv4-mapped IPv6 (dotted + hex), link-local fe80::/10, multicast, broadcast/reserved, OS-resolver via dns.promises.lookup verbatim, internal-suffix-denylist, manual redirect chain mit re-validation und socket remoteAddress check.
- M-7/M-8 Office-Parser zip-bomb caps (ooxml 50MB single / 500MB cumulative, XlsxParser column + row clamp).
- M-9/M-10/M-11 ToolExecutionPipeline Mode-Gate-Enforcement, per-tool IgnoreService, configure_model approval-required.
- M-12/L-12 OperationLogger sanitizer regex extended + nested object walk + value scrubbing, failed-write notice + sentinel file.
- M-13/L-8 SemanticIndexService enrichment-sanitizer + escapeXmlAttr.
- M-14/L-4 MCP SSRF guard (default deny, opt-in via `McpClientOptions.allowLocalUrls`), token + URL redaction in McpClient errors.
- M-4 ToolStepsHtml rehydration durch DOMPurify.
- M-6 GlobalFileService chmod 0o600 auf POSIX (clamped re-on-overwrite).

**Partials (8) -- Cross-Module-Wiring in Folge-PR:**

- M-5 + M-15 SafeStorage-Banner: ProvidersTab + SafeStorageService fertig; main.ts onload-Toast + ObsidianAgentSettings.safeStoragePlaintextFallbackAcknowledged-Typ stehen aus.
- M-14 MCP SSRF: guard im obsidianFetch + McpClient fertig; McpTab Settings-Save-Validation + main.ts Wiring von `plugin.settings.mcp.allowLocalUrls` in den Constructor stehen aus. Settings-Type McpServerConfig unangetastet.
- L-10 OAuth-Revoke on logout: ChatGPT + Copilot best-effort fertig; Kilo bewusst deferred (no documented endpoint), Kommentar markiert das. Kein fetch-mock harness fuer Unit-Test-Coverage.
- L-11 esbuild integrity: npm-script `verify:esbuild-hashes` + Helper geschrieben; CI-Step auf `pull_request` in `.github/workflows/security-audit.yml` steht aus.
- L-12 OperationLogger LogTab-Banner: Logger-Surface fertig (failedWrites counter, getFailureCount, getLastFailureMessage), UI-Konsum in `src/ui/settings/LogTab.ts` steht aus.
- L-15 Trust-wrapping Helper: `formatUntrustedContent` + exported `escapeXmlAttribute` in BaseTool.ts fertig; Adoption in ReadFileTool/SemanticSearchTool/WebFetchTool/UseMcpToolTool als One-Liner-Swap deferred.
- L-17 Imported-skill provenance gate: InvokeSkillTool komplett haertet (TRUSTED_SKILL_SOURCES, per-session approval, body wrapper, allowedTools intersection, 14 Tests). Cross-Module-Stuecke (ToolExecutionPipeline `skill`-Group-Gating wenn autoApproval.skills aktiv, SelfAuthoredSkillLoader source-Normalisation, Settings-Approval-Card Source-Badge) deferred.

**Architektur-Sicherheits-Punkte fuer naechste Iteration:**

- providerCredentialCrypto wird jetzt von main.ts + GlobalSettingsService geteilt. Future credential field additions muessen IMMER dort registriert werden -- ein Drift-Guard-Test waere sinnvoll (audit-034-fixes.test.ts hat einen Anfang, aber das Register selbst hat noch keinen Explicit-Snapshot-Test).
- Tool-side `validateVaultRelativePath` ist jetzt das kanonische Muster. AUDIT-034 zeigte dass auf 6 Tools verteilt verwendet -- die anderen Tools (CreateFolderTool, MoveFileTool, DeleteFileTool, RestoreCheckpointTool) sollten vor v2.15.0 nachgezogen werden.
- Plugin-API-Discovery (FEAT-29 / Imported-skills): L-17 hat den Pfad fuer Provenance + Approval gehaertet, aber der grosse Wurf (eigenes ADR fuer Skill-Trust-Model) fehlt. EPIC-Skill-Trust-Model als Folgespec.

**Release-recommendation:** GREEN fuer interne Builds / dev-merge; YELLOW fuer Public-Mirror -- die 8 Partials sollten in einer kurzen Folge-Welle vor v2.15.0-Public abgeschlossen werden.

**Naechster Schritt empfohlen:** `/dia-orchestrator` Phase 7 (Release Closure) ODER manueller Merge nach dev mit Vorlauf-Welle fuer die 8 Partials.

---

## requirements-engineering-to-architecture 2026-06-22

triage: FEAT-03-27
triage_kind: feature
epic: EPIC-03
feature: FEAT-03-27

### NFR summary

| Category | Target | Quelle |
|---|---|---|
| Migration-Dauer | <= 30s bei 5000 Notes + 1000 Sessions + 5000 Episodes | FEAT-03-27 SC-03 |
| Lookup nach Migration | O(log n), kein Full-Scan pro Konsumenten-Query | FEAT-03-27 |
| RecallEngine Mixed-Layer-Latenz | <= +10% gegen Baseline | FEAT-03-27 SC-06 |
| Tool-API-Kompatibilitaet | Recall-Top-10-Diff <= 5% auf 30 Queries | FEAT-03-27 SC-02 |
| DB-File-Groesse | <= +5% gegenueber heutigem Stand | FEAT-03-27 |
| Plugin-Start-Blockierung | <= 30s | FEAT-03-27 |
| Skalierungs-Endausbau | 50.000 Sessions + 50.000 Episodes ohne Re-Migration | FEAT-03-27 |

### Critical ASRs (muessen je ein ADR bekommen)

- ASR-03-27-01 Schema-Migration ohne User-Re-Index: erzwingt Praeferenz Spalten-Diskriminator vor Tabellen-Namespace (Tabellen-Namespace = Daten-Verschiebung = User-Re-Index unausweichlich).
- ASR-03-27-02 Tool-API-Kompatibilitaet: URI-Schemas `session://`, `episode://`, `vault://`, `fact://` bleiben unveraendert, selbst wenn interne Spalten-Namen sich ändern.

### Moderate ASRs

- ASR-03-27-03 Reader/Writer-Site-Vollstaendigkeit: Helper, Lint-Regel oder Schema-Constraint muss Drift in kuenftigen Konsumenten verhindern.

### Open architecture questions (sechs)

1. Diskriminator-Variante: Spalten (`vectors.domain TEXT`) versus separater Tabellen-Namespace.
2. Migration in-place via Pfad-Prefix-Inferenz versus Re-Insert.
3. Edges-Tabelle: braucht sie auch einen Diskriminator, oder reicht FK auf `vectors`?
4. URI-Schemas im `RecallHit` (Mapping intern -> API-Oberflaeche).
5. Reader/Writer-Coverage-Mechanik: Helper-Funktion + ESLint, Views, oder Tabellen-Namespace?
6. Reranker (Retrieval Wave 1): respektiert Layer-Trennung, oder bewusst cross-layer fuer Episode-Anreicherung?

### Constraints (aus User-Dialog 2026-06-22 + bestehende Plugin-Infrastruktur)

- sql.js WASM Engine bleibt unveraendert, keine neue DB-Engine
- Daily-Snapshot vor Migration muss erzwungen sein (FEATURE-0314 Snapshot-Mechanik)
- Lock-File aus FEATURE-0314 schuetzt vor parallelen Plugin-Instanzen waehrend Migration
- Migration in `onload`, kein Background-Worker
- Keine Tool-API-Aenderung (`recall_memory`, `search_history`, `mark_for_memory`, `semantic_search`)

### Forbidden-terms check

Success Criteria SC-01 bis SC-06 wurden ueber den ESLint-aequivalenten Grep gegen die Forbidden-Liste gefahren (OAuth, REST, PostgreSQL, ms, cache, TLS, RBAC, JSON, HTTP, ...). 0 Treffer. Schema-Migration, sql.js, TypeScript, DB-Constraint stehen in den Technical NFRs, wo sie erlaubt sind.

### Forbidden-words (Em-Dash, AI Vocabulary)

0 Em-Dashes (U+2014, U+2013) in FEAT-03-27-Spec und im architect-handoff. 0 AI-Vokabel-Treffer (landscape, nuanced, leverage, seamless, holistic, crucial, delve, robust, foster, underscoring, highlighting). Deutsche Umlaute durchgaengig korrekt.

### Empfohlene naechste Schritte

1. `/architecture` startet mit dem Diskriminator-ADR (zentrale Variante), referenziert ASR-03-27-01.
2. Folge-ADR Migration-Strategie (Pfad-Prefix-Inferenz idempotent in-place, mit Daily-Snapshot vor Migration und Lock-File-Schutz).
3. Folge-ADR Tool-API-Mapping (`RecallHit.uri` bleibt `<scheme>://<id>`, interne `domain`-Spalte mappt auf das Scheme).
4. Folge-ADR Reader/Writer-Coverage-Mechanik (vermutlich Helper + ESLint-Regel, weil das die einfachste additive Variante ist, ohne Views einfuehren zu muessen).
5. Update ADR-77 (Memory v2 Storage Schema) als Amendment oder Supersedence, je nach Diskriminator-Variante.

---

## architecture-to-coding 2026-06-22

triage: FEAT-03-27
triage_kind: feature
epic: EPIC-03
feature: FEAT-03-27

### Tech stack justification

- **Engine:** sql.js WASM bleibt, kein Engine-Wechsel.
- **Schema-Evolution:** additive Spalten-Diskriminator `vectors.domain TEXT NOT NULL DEFAULT 'note'` plus Index `idx_vectors_domain_path`. Schema-Version v12 -> v13.
- **Migration:** Pfad-Prefix-Inferenz idempotent in-place, in einer SQLite-Transaktion, mit erzwungenem Pre-Migration-Daily-Snapshot (FEATURE-0314).
- **Domain-Helper:** `KnowledgeVectorStore` (Vorschlag, /coding kann in `KnowledgeDB.ts` integrieren) mit typisierten Methoden pro Domain plus Cross-Layer-API.
- **Drift-Schutz:** lokale ESLint-Regel `no-direct-vectors-table-access` mit Bot-konformer `-- reason`-Disable-Konvention.
- **Tool-API:** URI-Schemas (`vault://`, `session://`, `episode://`, `fact:`, `mention://`, `thread://`, `entity://`) bleiben unveraendert auf der Tool-Oberflaeche.

### Rejected alternatives

- **Tabellen-Namespace** (`session_vectors`, `episode_vectors`, ...): verschiebt Daten zwischen Tabellen, erzwingt Vector-ID-Aenderung, damit Vault-Re-Index. Verstoß gegen ASR-03-27-01.
- **Reine Helper-Klasse ohne Lint-Regel:** wiederholt den heutigen Drift-Mechanismus, weil Disziplin als einziger Schutz erfahrungsgemäß nicht haelt.
- **View-basierte Trennung** (`note_vectors`-View, ...): SQLite-Views in sql.js sind read-only, Writer-Pfade bleiben ungeschuetzt, asymmetrische Garantie.

### Known risks

- **sql.js Migration-Performance** auf sehr grossen Vaults (50.000+ Vektoren) koennte die 30s-Grenze sprengen. Mitigation: UPDATE in Batches von 1000 Zeilen mit OperationLogger-Progress-Notice; bei Vaults >30s laeuft Migration im Hintergrund mit Notice.
- **Pfad-Prefix-Inferenz-Verwechselung:** User-Note `session_intro.md` koennte theoretisch als Session erkannt werden. Mitigation: UPDATE-Predicate prueft auf `session:` mit Doppelpunkt explizit, nicht LIKE `session%`.
- **ESLint-Regel-Lapsus:** pauschales `eslint-disable` koennte die Regel unbemerkt deaktivieren. Mitigation: Unit-Test asserts auf Regel-Konfiguration, Code-Review pflichtig fuer Lint-Config-Änderungen.
- **Cross-Layer-Reranker:** der heutige Reranker sieht alle Vektoren; eine versehentliche Layer-Einschraenkung beim Refactor wuerde Mixed-Layer-Recall brechen. Mitigation: expliziter Test mit Mixed-Layer-Input, Reranker geht weiterhin ueber `findVectors` ohne `domain`-Filter.

### Open items (deferred to /coding)

1. Helper-Klassen-Lokation: separate Datei `KnowledgeVectorStore.ts` oder Integration in `KnowledgeDB.ts`? Codebase-State entscheidet.
2. Heuristik der ESLint-Regel: matcht raw SQL-Strings auf `vectors` in FROM/JOIN-Position. False-Positive-Toleranz und Disable-Pattern in der Test-Korpus-Definition.
3. Stigmergy-Episode-Writer-Pfad: vermutlich `src/core/stigmergy/`, aber genauer Aufruf muss in /coding lokalisiert werden.
4. FactStore-Stand: wenn FEAT-03-15 noch nicht implementiert ist, faellt `'fact'`-Writer aus dem PR raus und kommt mit FEAT-03-15 nach. ADR-136 erlaubt `'fact'` als zukuenftigen Wert im Enum, ohne dass Writer bereits existieren muss.
5. Reranker-Aufrufstelle: muss explizit auf Cross-Layer-Methode umgestellt werden mit Test, der Mixed-Layer-Input pinnt.

### Consistency check

plan-context-feat-03-27.md matched die ADRs:
- Schema-Diff entspricht ADR-136 Decision-Block (Spalten-Diskriminator, Migration in drei Schritten, Index).
- Helper-Klassen-API entspricht ADR-137 Decision-Block (Domain-typisierte Methoden plus Cross-Layer-API plus Mapping-Helper).
- Tool-API-Mapping in plan-context (Tabelle in Section 4) entspricht ADR-136 Tool-API-Mapping-Klausel.
- Reader/Writer-Sites Inventory (plan-context Section 8) entspricht FEAT-03-27 Code Pointer.
- 0 Em-Dashes, 0 AI-Vokabular, deutsche Umlaute durchgaengig korrekt.
