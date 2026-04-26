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
