---
id: EPIC-003
title: Context, Memory & Scaling
phase: Building
status: Active
---

# Epic: Context, Memory & Scaling

> **Epic ID**: EPIC-003
> **Phase**: C (Original) + Memory v2 Initiative (2026-04-26 hinzugefuegt)
> **Status**: Phase C implementiert, Memory v2 in Vorbereitung (8 neue FEATUREs Planned)

## Beschreibung

Semantic Index (vectra HNSW), Context Management, 3-Tier Memory, Multi-Agent Orchestrierung, Context Condensing, Power Steering, Canvas & Bases, Global/Safe Storage.

**Erweitert seit 2026-04-26 um Memory v2 Initiative (Pfad alpha):** Komplette Neuarchitektur des Memory-Subsystems mit `facts`-Schema, dynamischer Composition, Single-Call-Extraction und Engine-Extract als Foundation fuer UCM (Unified Chat Memory). Siehe [PLAN-001-memory-v2-master](../../implementation/plans/PLAN-001-memory-v2-master.md), [BA-UNIFIED-CHAT-MEMORY-V2](../../analysis/BA-UNIFIED-CHAT-MEMORY-V2.md).

## Features (Phase C, implementiert)

| Feature ID | Name | Priority | Status |
|------------|------|----------|--------|
| FEATURE-0301 | Semantic Index & Retrieval | P0 | Implementiert |
| FEATURE-0302 | Keyword Search Upgrade | P1 | Implementiert |
| FEATURE-0303 | Context Management | P0 | Implementiert |
| FEATURE-0304 | Memory & Personalization | P0 | Subsumed by Memory v2 (siehe FEATURE-0315 bis 0321) |
| FEATURE-0305 | Multi-Agent (new_task) | P1 | Implementiert |
| FEATURE-0306 | Context Condensing | P1 | Implementiert (orthogonal zu Memory v2) |
| FEATURE-0307 | Power Steering | P1 | Implementiert |
| FEATURE-0308 | Tool Repetition Detection | P1 | Implementiert |
| FEATURE-0309 | Canvas & Bases | P0 | Implementiert |
| FEATURE-0310 | Global Storage | P1 | Implementiert |
| FEATURE-0311 | Safe Storage | P1 | Implementiert |
| FEATURE-0312 | Modular System Prompt | P1 | Implementiert |
| FEATURE-0313 | Code Import Models | P2 | Implementiert |

## Features (Memory v2 Initiative, Planned)

| Feature ID | Name | Priority | Status | Effort |
|------------|------|----------|--------|--------|
| FEATURE-0314 | Knowledge-DB-Haertung (BUG-012-Fix, Vault-Rename, embedding_model, URI-Konvention) | P0 | Planned | 1.5 Wo |
| FEATURE-0315 | Memory-Engine-Foundation (facts/edges/styles/audit, Stores mit DI, ADR-062) | P0 | Planned | 2 Wo |
| FEATURE-0316 | Memory-Migration + Vault-RRF-Quick-Win | P0 | Planned | 1.5 Wo |
| FEATURE-0317 | Dynamic Context Composition (ContextComposer, Topic-Inference, recall_memory) | P0 | Planned | 1 Wo |
| FEATURE-0318 | Single-Call Update Pipeline + Combined Note-Index | P0 | Planned | 2 Wo |
| FEATURE-0319 | Living Document UX (Save-to-Memory, mark_conversation_for_memory, Auto-Suggestion) | P1 | Planned | 1 Wo |
| FEATURE-0320 | History Search ueber alle Conversations | P1 | Planned | 1 Wo |
| FEATURE-0321 | Engine-Extract zu @obsilo/memory-engine (UCM-Foundation) | P0 | Planned | 1 Wo |
| FEATURE-0322 | Privacy & Forget-Right (Selective Deletion + Drei-States, Cascade, Backup-Sweep) | P0 | Planned | 1 Wo |
| FEATURE-0323 | Memory-UX, Onboarding & Settings-Migration (v2.6.x -> v2-Mapping, Coach-Marks, Agent-als-Fehler-UI) | P1 | Planned | 1 Wo |
| FEATURE-0324 | Inference-Pass fuer Derives (Pattern-basierte Memory-Evolution, Supermemory-Differenzierung) | P1 | Planned | 1 Wo |
| FEATURE-0325 | Vault-Note-zu-Fact-Extraction (Documents-Pipeline, einzigartiger Vault-Bridge-Selling-Point) | P1 | Planned | 1.5 Wo |

**Gesamt-Effort Memory v2:** 15.5 Wochen plus Phase 0 (1.5 Wo Spikes + ADRs) = 17 Wochen brutto. (12 Features inkl. Querschnitts-Features 0322/0323 + Supermemory-Differenzierungs-Features 0324/0325 aus A/B/C/E-Beschluessen 2026-04-26.)

## E1-E10 Empfehlungen aus Supermemory-Differenzierungs-Diskussion (2026-04-26)

Folgende konzeptuelle Verbesserungen aus dem Vergleich mit Supermemory wurden in die bestehenden Features integriert:

| ID | Empfehlung | Verankert in |
|---|---|---|
| E1 | Edge-Konzept-Layer `update`/`extend`/`derive` | ADR-077, FEATURE-0318 |
| E2 | Memory-Typ `kind`-Spalte (fact/preference/identity/event) | FEATURE-0315, FEATURE-0318 (differenzierte Aging-Konstanten) |
| E3 | Noise-Filter + Pre-Insert-Importance-Threshold | FEATURE-0318 |
| E4 | `is_latest`-Boolean-Spalte als Index-Optimierung | FEATURE-0315 (Schema), ADR-077 |
| E5 | Inference-Pass fuer Derives | FEATURE-0324 (eigenes Feature) |
| E6 | Pipeline-States visible in ConversationMeta | FEATURE-0319 |
| E7 | Context-aware Reranker-Pass nach RRF | FEATURE-0317 |
| E8 | `kind`-Klassifikation im Tool-Calling-Output | FEATURE-0318 (haengt an E2) |
| E9 | User-Profile-View als Engine-Public-Method | FEATURE-0317, FEATURE-0321 |
| E10 | Vault-Note-zu-Fact-Extraction | FEATURE-0325 (eigenes Feature) |

## Konsumenten-Beziehung zu UCM

EPIC-003 traegt seit 2026-04-26 die Foundation-Verantwortung fuer das geplante UCM-Projekt (Unified Chat Memory, separates Repo). FEATURE-0321 ist harter Liefer-Constraint, nicht Optional.

## Verbundene ADRs

- ADR-013 (Memory Architecture): wird durch ADR-076 + ADR-077 superseded
- ADR-018 (Episodic Task Memory): bleibt gueltig, ADR-076 klaert Boundary
- ADR-058 (Recipe-Promotion): bleibt unberuehrt
- ADR-059 (Memory Decay Prevention): supplementiert durch FEATURE-0318 Aging
- ADR-060 (Session Summary Reliability): bleibt gueltig, FEATURE-0316 nicht-tangiert
- ADR-076 (Episode-Fact-Boundary): NEU
- ADR-077 (Memory v2 Storage Schema): NEU
- ADR-078 (URI-Versioning): NEU
- ADR-079 (Knowledge-DB-Haertung): NEU
- ADR-062 (KV-Cache-Layout): wird in FEATURE-0315 implementiert (war bisher nur architektonisch beschrieben)
