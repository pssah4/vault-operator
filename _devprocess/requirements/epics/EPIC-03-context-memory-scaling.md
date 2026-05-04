---
id: EPIC-03
title: Context, Memory & Scaling
---

# Epic: Context, Memory & Scaling

> **Epic ID**: EPIC-03
> **Phase**: C (Original) + Memory v2 Initiative (2026-04-26 hinzugefuegt)
> **Note**: Phase C implementiert, Memory v2 in Vorbereitung (8 neue FEATUREs Planned)

## Beschreibung

Semantic Index (vectra HNSW), Context Management, 3-Tier Memory, Multi-Agent Orchestrierung, Context Condensing, Power Steering, Canvas & Bases, Global/Safe Storage.

**Erweitert seit 2026-04-26 um Memory v2 Initiative (Pfad alpha):** Komplette Neuarchitektur des Memory-Subsystems mit `facts`-Schema, dynamischer Composition, Single-Call-Extraction und Engine-Extract als Foundation fuer UCM (Unified Chat Memory). Siehe [PLAN-01-memory-v2-master](../../implementation/plans/PLAN-01-memory-v2-master.md), [BA-UNIFIED-CHAT-MEMORY-V2](../../analysis/BA-24-unified-chat-memory-v2.md).

## Features (Phase C, implementiert)

| Feature ID | Name | Priority | Status |
|------------|------|----------|--------|
| FEAT-03-01 | Semantic Index & Retrieval | P0 | Implementiert |
| FEAT-03-02 | Keyword Search Upgrade | P1 | Implementiert |
| FEAT-03-03 | Context Management | P0 | Implementiert |
| FEAT-03-04 | Memory & Personalization | P0 | Subsumed by Memory v2 (siehe FEAT-03-15 bis 0321) |
| FEAT-03-05 | Multi-Agent (new_task) | P1 | Implementiert |
| FEAT-03-06 | Context Condensing | P1 | Implementiert (orthogonal zu Memory v2) |
| FEAT-03-07 | Power Steering | P1 | Implementiert |
| FEAT-03-08 | Tool Repetition Detection | P1 | Implementiert |
| FEAT-03-09 | Canvas & Bases | P0 | Implementiert |
| FEAT-03-10 | Global Storage | P1 | Implementiert |
| FEAT-03-11 | Safe Storage | P1 | Implementiert |
| FEAT-03-12 | Modular System Prompt | P1 | Implementiert |
| FEAT-03-13 | Code Import Models | P2 | Implementiert |

## Features (Memory v2 Initiative, Planned)

| Feature ID | Name | Priority | Status | Effort |
|------------|------|----------|--------|--------|
| FEAT-03-14 | Knowledge-DB-Haertung (BUG-012-Fix, Vault-Rename, embedding_model, URI-Konvention) | P0 | Planned | 1.5 Wo |
| FEAT-03-15 | Memory-Engine-Foundation (facts/edges/styles/audit, Stores mit DI, ADR-62) | P0 | Planned | 2 Wo |
| FEAT-03-16 | Memory-Migration + Vault-RRF-Quick-Win | P0 | Planned | 1.5 Wo |
| FEAT-03-17 | Dynamic Context Composition (ContextComposer, Topic-Inference, recall_memory) | P0 | Planned | 1 Wo |
| FEAT-03-18 | Single-Call Update Pipeline + Combined Note-Index | P0 | Planned | 2 Wo |
| FEAT-03-19 | Living Document UX (Save-to-Memory, mark_conversation_for_memory, Auto-Suggestion) | P1 | Planned | 1 Wo |
| FEAT-03-20 | History Search ueber alle Conversations | P1 | Planned | 1 Wo |
| FEAT-03-21 | Engine-Extract zu @obsilo/memory-engine (UCM-Foundation) | P0 | Planned | 1 Wo |
| FEAT-03-22 | Privacy & Forget-Right (Selective Deletion + Drei-States, Cascade, Backup-Sweep) | P0 | Planned | 1 Wo |
| FEAT-03-23 | Memory-UX, Onboarding & Settings-Migration (v2.6.x -> v2-Mapping, Coach-Marks, Agent-als-Fehler-UI) | P1 | Planned | 1 Wo |
| FEAT-03-24 | Inference-Pass fuer Derives (Pattern-basierte Memory-Evolution, Supermemory-Differenzierung) | P1 | Planned | 1 Wo |
| FEAT-03-25 | Vault-Note-zu-Fact-Extraction (Documents-Pipeline, einzigartiger Vault-Bridge-Selling-Point) | P1 | Planned | 1.5 Wo |

**Gesamt-Effort Memory v2:** 15.5 Wochen plus Phase 0 (1.5 Wo Spikes + ADRs) = 17 Wochen brutto. (12 Features inkl. Querschnitts-Features 0322/0323 + Supermemory-Differenzierungs-Features 0324/0325 aus A/B/C/E-Beschluessen 2026-04-26.)

## E1-E10 Empfehlungen aus Supermemory-Differenzierungs-Diskussion (2026-04-26)

Folgende konzeptuelle Verbesserungen aus dem Vergleich mit Supermemory wurden in die bestehenden Features integriert:

| ID | Empfehlung | Verankert in |
|---|---|---|
| E1 | Edge-Konzept-Layer `update`/`extend`/`derive` | ADR-77, FEAT-03-18 |
| E2 | Memory-Typ `kind`-Spalte (fact/preference/identity/event) | FEAT-03-15, FEAT-03-18 (differenzierte Aging-Konstanten) |
| E3 | Noise-Filter + Pre-Insert-Importance-Threshold | FEAT-03-18 |
| E4 | `is_latest`-Boolean-Spalte als Index-Optimierung | FEAT-03-15 (Schema), ADR-77 |
| E5 | Inference-Pass fuer Derives | FEAT-03-24 (eigenes Feature) |
| E6 | Pipeline-States visible in ConversationMeta | FEAT-03-19 |
| E7 | Context-aware Reranker-Pass nach RRF | FEAT-03-17 |
| E8 | `kind`-Klassifikation im Tool-Calling-Output | FEAT-03-18 (haengt an E2) |
| E9 | User-Profile-View als Engine-Public-Method | FEAT-03-17, FEAT-03-21 |
| E10 | Vault-Note-zu-Fact-Extraction | FEAT-03-25 (eigenes Feature) |

## Konsumenten-Beziehung zu UCM

EPIC-03 traegt seit 2026-04-26 die Foundation-Verantwortung fuer das geplante UCM-Projekt (Unified Chat Memory, separates Repo). FEAT-03-21 ist harter Liefer-Constraint, nicht Optional.

## Verbundene ADRs

- ADR-13 (Memory Architecture): wird durch ADR-76 + ADR-77 superseded
- ADR-18 (Episodic Task Memory): bleibt gueltig, ADR-76 klaert Boundary
- ADR-58 (Recipe-Promotion): bleibt unberuehrt
- ADR-59 (Memory Decay Prevention): supplementiert durch FEAT-03-18 Aging
- ADR-60 (Session Summary Reliability): bleibt gueltig, FEAT-03-16 nicht-tangiert
- ADR-76 (Episode-Fact-Boundary): NEU
- ADR-77 (Memory v2 Storage Schema): NEU
- ADR-78 (URI-Versioning): NEU
- ADR-79 (Knowledge-DB-Haertung): NEU
- ADR-62 (KV-Cache-Layout): wird in FEAT-03-15 implementiert (war bisher nur architektonisch beschrieben)
