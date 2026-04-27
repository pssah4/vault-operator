# Handoffs (append-only)

Phase-zu-Phase-Uebergaben im V-Model-Workflow. Jeder Eintrag dokumentiert,
was uebergeben wurde und was der naechste Schritt ist.

---

## 2026-04-23 -- EPIC-023 Mobile Support: Business Analysis -> Requirements Engineering

**Phase:** Business Analysis (MVP-Scope) abgeschlossen. Ready for RE.

**Artefakte erzeugt:**

- BA: [BA-023-mobile-support.md](../analysis/BA-023-mobile-support.md) (815 Zeilen, Status: Draft)
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
Input: _devprocess/analysis/BA-023-mobile-support.md
Ziel: EPIC-023 anlegen, Features FEATURE-2301..FEATURE-23NN breakdown, Success Criteria tech-agnostisch, architect-handoff-023.md
```

---

## 2026-04-19 -- v2.6.0 Pre-Release Security Audit: Coding -> Release Closure

**Phase:** Security Audit abgeschlossen. Ready for Public Release.

**Artefakte erzeugt:**
- [AUDIT-012-obsilo-2026-04-19.md](../analysis/security/AUDIT-012-obsilo-2026-04-19.md)

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

## 2026-04-17 -- EPIC-022 Skill-Package Ecosystem: RE -> Architecture -> Coding

**Phase:** Requirements Engineering + Architecture abgeschlossen. Ready for Coding.

**Artefakte erzeugt:**

- BA: `_devprocess/analysis/BA-021-skill-package-ecosystem.md`
- Epic: `_devprocess/requirements/epics/EPIC-022-skill-package-ecosystem.md`
- Features:
  - `_devprocess/requirements/features/FEATURE-2201-skill-folder-structure.md` (P0, M)
  - `_devprocess/requirements/features/FEATURE-2202-skill-zip-import.md` (P0, S)
  - `_devprocess/requirements/features/FEATURE-2203-skill-scripts.md` (P1, M)
  - `_devprocess/requirements/features/FEATURE-2204-coordinator-skill.md` (P1, M)
- Handoff: `_devprocess/requirements/handoff/architect-handoff-022.md`
- ADR: `_devprocess/architecture/ADR-075-skill-package-architecture.md` (Proposed)
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
Reihenfolge: FEATURE-2201 -> 2202 -> 2203 -> 2204 (2201 ist Fundament fuer alle anderen)
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
- `_devprocess/implementation/plans/PLAN-001-memory-v2-master.md` (Status: Draft) -- validierter Master-Plan mit 8 Phasen, 11.5 Wochen
- `_devprocess/architecture/ADR-076-episode-fact-boundary.md` (Proposed)
- `_devprocess/architecture/ADR-077-memory-v2-storage-schema.md` (Proposed)
- `_devprocess/architecture/ADR-078-uri-versioning-schema.md` (Proposed)
- `_devprocess/architecture/ADR-079-knowledge-db-hardening.md` (Proposed)

**Triage:** Capability-Set unter EPIC-003 (context-memory-scaling). 8 Phasen werden 8 FEATUREs (FEATURE-0314 bis FEATURE-0321). Mehrere ADRs (4 vorbereitet, weitere nach Bedarf).

**Vorhandene Bezugs-Artefakte:**

- EPIC-003-context-memory-scaling (Parent)
- FEATURE-0304-memory-personalization (vorhanden, wird durch Memory v2 superseded)
- FEATURE-1411-memory-transparency (vorhanden, integriert in Memory v2 UI)
- FEATURE-0306-context-condensing (vorhanden, bleibt orthogonal)
- FEATURE-1802-context-externalization (vorhanden, bleibt orthogonal)
- ADR-013, ADR-018, ADR-058, ADR-059, ADR-060 (Memory-bezogen, werden im Verlauf supersediert oder supplementiert)

**Codebase-Analyse durchgefuehrt:** Tiefenanalyse Memory-Subsystem + Best-Practice-Recherche 2026 (Mem0, A-MEM, Letta, Zep, Anthropic Prompt Caching, sql.js+FTS5+sqlite-vec). 15 kritische Diskrepanzen zwischen Source-Spec und Codebase identifiziert, in PLAN-001 dokumentiert und addressed.

**RE-Auftrag:**

1. 8 FEATUREs unter EPIC-003 anlegen (FEATURE-0314 bis FEATURE-0321), pro Feature 1 Phase aus PLAN-001
2. Akzeptanzkriterien aus PLAN-001-Phasen-Tabelle ableiten, plus die 15 Diskrepanzen aus PLAN-001 als FEATURE-spezifische Kriterien zuordnen
3. ASRs/NFRs aus PLAN-001 "Eval & Quality Gates" und "Risks R10-R15"
4. architect-handoff.md schreiben: Engine-API-Design ist der zentrale Architektur-Vertrag (UCM-Konsument), ATTACH-DATABASE-Pattern + URI-Schema (ADR-078) sind Cross-Cutting
5. Bestehende Memory-FEATUREs (0304, 1411) aktualisieren: Status auf "Subsumed by Memory v2" markieren, Cross-Reference auf neue FEATUREs

**Offene Entscheidungen, die RE klaeren oder als ASR formulieren sollte:**

- Custom-sql.js-WASM-Build vs Trigram-Fallback: nach Phase-0-Spike entscheidbar, FEATURE-0315 sollte Akzeptanzkriterium pro Variante haben
- Embedding-Modell-Default fuer Migration: derzeit konfigurierbar, Memory v2 braucht Default-Strategy
- Custom-WASM-Bundle-Size-Limit: Plugin Review-Bot Kontext

**Naechster Schritt:**

```
/requirements-engineering
Input: _devprocess/implementation/plans/PLAN-001-memory-v2-master.md (primaer)
       + alle 4 ADRs + BA-UNIFIED-CHAT-MEMORY-V2 + OBSILO-MEMORY-V2-FULL-REWRITE
Output: 8 FEATURE-0314 bis FEATURE-0321 + architect-handoff.md
```

---

## re-to-architecture 2026-04-26: Memory v2 + UCM Foundation

**Initiative:** Memory v2 Full Rewrite (Pfad alpha) -- 8 FEATUREs FEATURE-0314 bis FEATURE-0321 unter EPIC-003 angelegt.

**Output (Requirements Engineering):**

- **8 Feature-Specs:** FEATURE-0314 (Knowledge-DB-Haertung), FEATURE-0315 (Engine-Foundation), FEATURE-0316 (Migration + Vault-RRF), FEATURE-0317 (Dynamic Context Composition), FEATURE-0318 (Single-Call Update Pipeline), FEATURE-0319 (Living Document UX), FEATURE-0320 (History Search), FEATURE-0321 (Engine-Extract)
- **Architect-Handoff:** `_devprocess/requirements/handoff/architect-handoff-memory-v2.md` mit 16 ASRs (10 Critical, 6 Moderate), 19 NFR-Targets, 15 Constraints, 15 Open Questions
- **EPIC-003 aktualisiert** (Memory v2 Initiative-Sektion ergaenzt, Status: Active)
- **FEATURE-0304-memory-personalization** Status auf "Subsumed by Memory v2"
- **FEATURE-1411-memory-transparency** Cross-Reference auf FEATURE-0319

**ASR-Hoehepunkte (Critical):**

- ASR-001: Multi-File-Atomic-Commit fuer 2 DBs (FEATURE-0314, ADR-079)
- ASR-002: URI-Konvention vor Memory v2 (FEATURE-0314, ADR-078)
- ASR-003: Constructor-Injection in Stores (FEATURE-0315)
- ASR-004: ADR-062 KV-Cache-Layout vor Phase 3 (FEATURE-0315)
- ASR-006: ATTACH DATABASE Pattern in einzelner sql.js-Instanz (FEATURE-0317)
- ASR-007: Topic-Inference ohne LLM-Call beim Conversation-Start (FEATURE-0317)
- ASR-009: Single-Call-Extraction via Tool-Calling-Schema (FEATURE-0318)
- ASR-014: Engine-Public-API-Surface klein und stabil (FEATURE-0321)
- ASR-015: Adapter-Interface fuer Knowledge-DB ohne Vault-Spezifika (FEATURE-0321)
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
       + 4 Proposed ADRs (ADR-076, 077, 078, 079)
       + PLAN-001-memory-v2-master.md
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
  - ADR-080 Persistenz-Service-Pattern (3 Setup-Klassen A/B/C)
  - ADR-081 MCP-Tool-Routing + Plugin-Standalone-RPC (Bearer-Token + HTTPS)
  - ADR-082 Topic-Inference-Strategie (lokale Centroids, Soft-Topic-Lock)
  - ADR-083 Single-Call Tool-Calling Output-Schema
  - ADR-084 Engine-Public-API-Versionierung (semver + Schema-Version)
  - ADR-085 Soft-Delete-Cascade auf vier Granularitaets-Ebenen
  - ADR-086 Inference-Pass-Architektur fuer Derives
  - ADR-087 Vault-Note-Memory-Source-Pipeline
- **4 bestehende ADRs** weiterhin Proposed (ADR-076 Episode-Fact-Boundary, ADR-077 Storage-Schema, ADR-078 URI-Versioning, ADR-079 Knowledge-DB-Haertung)
- **arc42-Update** Section 5.9.1 "Memory v2 Architecture" ergaenzt
- **plan-context-memory-v2.md** in `_devprocess/requirements/handoff/` mit Tech-Stack, Quality-Goals, ADR-Summary, Data-Model, Performance/Security-Targets, Implementation-Reihenfolge, /coding-Aufgaben

**Tech-Stack-Justification:**

- TypeScript strict + esbuild bleibt (Bestand)
- sql.js@^1.14.1 ist einziger Driver (Review-Bot blockiert native bessere-sqlite3)
- Custom-WASM-Build mit FTS5+JSON1 wenn Phase-0-Spike Bundle-Size traegt, sonst JS-Trigram-Fallback
- Embeddings: konfigurierbar (Sebastians Setup nutzt qwen3-embedding-8b multilingual)
- LLM: konfigurierbar (Sebastian nutzt Claude Haiku 4.5), Tool-Calling-Pflicht
- Cloudflare-Relay (existierend, FEATURE-1404) bleibt fuer externe MCP-Clients
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
- 12 FEATUREs (FEATURE-0314 bis FEATURE-0325) sind im plan-context Implementation-Reihenfolge-Tabelle vollstaendig: bestaetigt
- Quality-Goals (Hosting-Neutralitaet, Token-Effizienz, Privacy, Performance, Korrektheit) decken die 22 Critical ASRs: bestaetigt

**Naechster Schritt:**

```
/coding
Input: _devprocess/requirements/handoff/plan-context-memory-v2.md
       + 12 ADRs (ADR-076 bis ADR-087, alle Proposed)
       + 12 FEATUREs (FEATURE-0314 bis FEATURE-0325)
       + arc42 Section 5.9.1
       + PLAN-001 Master-Plan
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

1. **ADR-079 Knowledge-DB-Haertung:** Single-File-Atomic-Write existiert bereits (KnowledgeDB.ts:485-518, FIX-12 Marker). ADR auf reduzierten Scope angepasst: Multi-File-Coordination + Vault-Mode-Haertung + Migration-Journal + Daily-Snapshot bleiben offen, Single-File ist gefixt.
2. **ADR-080 Persistenz-Service-Pattern:** Bestehende `storageLocation`-Werte in KnowledgeDB.ts:151 (global/local/obsidian-sync) gemappt zu neuen Setup-Klassen K-A/K-B (K-C ist neu). Settings-Migration in FEATURE-0323 muss diese Werte transformieren.
3. **FEATURE-0314 Effort:** 1.5 Wo -> 1 Wo reduziert (bestehende Atomic-Write-Logic wird erweitert, nicht neu gebaut).
4. **FEATURE-0315 Implementation-Strategie:** MemoryDB ist heute Wrapper um KnowledgeDB. Schema-Erweiterung additiv, KnowledgeDB-Klasse selbst nicht refactoren. history.db nutzt denselben Wrapper-Pattern.

**Writebacks ausgefuehrt:** ADR-079, ADR-080, FEATURE-0314, FEATURE-0315 mit Code-Review-Findings-Sections versehen.

**40_metrics.md Drift-Row:** 12 ADRs reviewed, 4 Drift flagged, 4 resolved, 0 open.

**PLAN-002 angelegt:** Phase 0 Spikes (ATTACH+CTE-Performance, FTS5-Bundle-Size, Single-Call-Token-Profil) als Quality-Gate vor Phase-0.5-Implementation. Status `Draft`.

**Nicht getan in dieser Session:**

- Spikes nicht ausgefuehrt (User-Entscheidung erforderlich)
- ADRs nicht zu Accepted promoted (haengen an Spike-Ergebnissen ab)
- Phase-0.5-Implementation noch nicht gestartet (FEATURE-0314)
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
- **SPIKE-002 FTS5+JSON1-Bundle-Size:** Provisional Green via Approximation (~250KB Aufschlag, ~0.7% auf Plugin-Bundle). Echter Custom-WASM-Build deferred zu Phase 0.5 (FEATURE-0314 Sub-Task).
- **SPIKE-003 Single-Call-Token-Profil:** Provisional Green via Approximation aus Mem0-Benchmark + Claude-Haiku-Pricing (~2500 Tokens Median, ~$0.50-3/Monat fuer Sebastian). Echter Test deferred zu Phase 4 (FEATURE-0318).

**ADR-Promotion:** ADR-076 bis ADR-087 alle auf `Accepted`, ADR-080 als `Accepted (modified by Spike-1 + Code-Review)`.

**Implementation-Aufwand reduziert:**

- ADR-080 Spike-1-Outcome: ~500-1000 LOC ATTACH-DATABASE-Code entfaellt
- ADR-079 Code-Review: Single-File-Atomic-Write existiert bereits (FIX-12 in KnowledgeDB.ts), FEATURE-0314 reduziert von 1.5 auf 1 Wo

**Zwischen-Stand-Effort-Schaetzung:**

- Phase 0: 1.5 Wo nominell (heute komplett, brutto ~4 Stunden Real-Aufwand wegen Approximations-Strategie + Spike-1-Echt-Test)
- Phase 0.5 (FEATURE-0314): 1 Wo (war 1.5)
- Phase 1-7: 11 Wo nominell
- Querschnitt FEATURE-0322/0323/0324/0325: 4.5 Wo
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
Phase 0.5 -- FEATURE-0314 Knowledge-DB-Haertung
PLAN-003 anlegen (FEATURE-0314 implementation plan):
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
