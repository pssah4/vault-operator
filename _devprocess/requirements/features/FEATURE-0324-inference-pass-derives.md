---
id: FEATURE-0324
title: Inference-Pass fuer Derives (Pattern-basierte Memory-Evolution)
epic: EPIC-003-context-memory-scaling
phase: Building
status: Planned
priority: P1
effort: M
depends-on: [FEATURE-0315, FEATURE-0317, FEATURE-0318]
related:
  - PLAN-001-memory-v2-master.md
  - BA-UNIFIED-CHAT-MEMORY-V2.md (Section 5.1.1, Differenzierung Supermemory)
---

# Feature: Inference-Pass fuer Derives

> **Feature ID:** FEATURE-0324
> **Epic:** [EPIC-003 Context, Memory & Scaling](../epics/EPIC-003-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, E5-Empfehlung aus Supermemory-Differenzierungs-Diskussion 2026-04-26
> **Priority:** P1-High (Differenzierung Supermemory's "Derives"-Konzept)
> **Effort:** M (1 Wo)

## Feature Description

Memory-Engine generiert "derived" Facts aus Patterns in der bestehenden Fact-Sammlung -- analog zu Supermemorys "Derives"-Konzept. Beispiel: Drei Facts ueber Sebastian + Plan-Mode + erfolgreiches Outcome -> derived Fact "Sebastian bevorzugt Plan-Mode bei nicht-trivialen Aenderungen" (`kind=preference`, neu inferred). Dieses Feature ist die naechste Evolution nach Single-Call-Extraction (FEATURE-0318) und ergaenzt die Update/Extend/Derive-Trinitaet (E1).

**Trigger-Strategie:**

Inference-Pass laeuft nicht synchron mit Single-Call-Extraktion (zu teuer pro Conversation), sondern als **separater Background-Job**:

- Triggert taeglich oder bei Plugin-Start, wenn > 24h seit letztem Run
- Operiert auf Facts mit Topic-Cluster-Pattern: wenn `>=3 Facts` denselben `mentions_entity`-URI plus aehnliches Topic teilen, wird ein zweiter LLM-Call ausgeloest
- Single-Call-Cost-Cap (FEATURE-0318) gilt auch hier -- Inference-Pass-Tokens werden gegen das tagliche Budget gerechnet

**Output:**

LLM bekommt die N kandidaten Facts und generiert optional einen "derived" Fact mit:
- `kind: 'preference' | 'fact'` (LLM-klassifiziert)
- `relation: 'derive'`
- Provenance: `derived_from_episode`-Edge oder neue `derived_from_pattern`-Edges zu allen Source-Facts
- Confidence-Score: hoch wenn Pattern stark, niedrig wenn schwach

**Confidence-Bands:**

- **Confidence >= 0.85**: Auto-Insert mit `kind=preference`, Notification "Ich habe ein Pattern erkannt: ..."
- **Confidence 0.5-0.85**: Pending-Review-Queue (FEATURE-0318) -- User bestaetigt oder verwirft
- **Confidence < 0.5**: kein Insert, nur Audit-Log

**Beispiel:**

Existing Facts:
- `fact:101` "Sebastian nutzte Plan-Mode bei Memory-v2-Refactor, Outcome erfolgreich" (kind=event, mentions_entity:Plan-Mode)
- `fact:217` "Sebastian nutzte Plan-Mode bei MCP-Bridge-Refactor, Outcome erfolgreich" (kind=event, mentions_entity:Plan-Mode)
- `fact:298` "Sebastian nutzte Plan-Mode bei UCM-Engine-Extract-Diskussion, Outcome erfolgreich" (kind=event, mentions_entity:Plan-Mode)

Inference-Pass erkennt Pattern, generiert:
- `fact:412` "Sebastian bevorzugt Plan-Mode fuer nicht-triviale Aenderungen" (kind=preference, relation=derive, confidence=0.92)
- Edges: `fact:412 --derived_from_pattern--> fact:101`, `fact:412 --derived_from_pattern--> fact:217`, `fact:412 --derived_from_pattern--> fact:298`

User-Notice: "Ich habe ein Verhaltensmuster erkannt: 'Sebastian bevorzugt Plan-Mode fuer nicht-triviale Aenderungen' (basierend auf 3 Konversationen). Dieses Preference wurde ins Memory aufgenommen. Du kannst es ueber `delete_fact` entfernen, falls falsch."

## Benefits Hypothesis

**We believe that** Pattern-basierte Inference UCM zu einer "lernenden" Memory-Engine macht, die nicht nur statische Facts speichert, sondern Verhaltensmuster und Praeferenzen aktiv erkennt. Das ist Supermemory's "Derives"-Konzept und schliesst die Differenzierungs-Luecke.

**Delivers the following measurable outcomes:**

- 3-10 derived Facts pro Monat bei aktivem User (geschaetzt)
- Confidence-Verteilung: 60% auto-insert, 30% pending-review, 10% rejected
- User-Notification-Akzeptanz > 70% (User bestaetigt das Pattern als korrekt)

**We know we are successful when:**

- Sebastian sieht erste derived Preferences nach 2-4 Wochen aktivem Use
- Mindestens 70% der Auto-Inserts sind als korrekt empfunden
- Memory-Block enthaelt diese Preferences und beeinflusst Conversation-Verhalten messbar

## User Stories

### Story 1: Memory lernt aktiv von mir (Emotional Job)

**As a** Sebastian
**I want to** dass das Plugin meine wiederkehrenden Praeferenzen aktiv erkennt
**so that** ich sie nicht jedem Chat manuell sagen muss

### Story 2: Falsche Patterns sind klar entfernbar (Functional Job)

**As a** Sebastian
**I want to** dass derived Facts klar als solche markiert sind und ich sie via Tool entfernen kann
**so that** falsche Inferenzen keinen permanenten Memory-Drift verursachen

### Story 3: Inference ist nicht teuer (Functional Job)

**As a** Sebastian (Cost-bewusst)
**I want to** dass Inference-Pass nicht pro Conversation laeuft, sondern selten und kontrolliert
**so that** Token-Budget nicht explodiert

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Inference-Pass triggert Pattern-Detection | bei > 3 verwandten Facts | Test mit synthetischem Pattern |
| SC-02 | LLM-Output ist deterministisch parsebar | 0 Parse-Fehler auf 50 Test-Conversations | Eval-Test-Suite |
| SC-03 | Derived Facts haben klare Provenance | derived_from_pattern-Edges zu allen Source-Facts | DB-Query nach Insert |
| SC-04 | Confidence-Bands greifen | Auto/Pending/Reject je nach Score | Test |
| SC-05 | User-Notification ist klar | "Ich habe Pattern erkannt: ..." mit Source-Fact-Liste | UAT |
| SC-06 | Token-Cost-Cap respektiert | Inference-Pass faellt aus wenn Cap erreicht | Test |

---

## Technical NFRs

### Performance

- **Pattern-Detection-Query:** < 500ms fuer 10k Facts (Topic-Cluster + Entity-Aggregation)
- **Inference-LLM-Call:** < 30s p95 (vergleichbar mit Single-Call-Extraktion)
- **Background-Job-Frequenz:** taeglich oder Plugin-Start nach 24h

### Security

- **Confidence-Banding:** klar definierte Schwellen, im Audit-Log nachvollziehbar
- **User-Override:** alle derived Facts loeschbar via `delete_fact` (FEATURE-0322)

### Scalability

- **Linear bis 10k Facts** (Sebastian-Skalierung), Pattern-Detection nutzt Indizes auf `mentions_entity` und Topic

### Availability

- **Crash-Resilienz:** Inference-Pass-State persistiert (`last_inference_run_at`), Job-Resume nach Plugin-Restart

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1:** Inference-Pass ist Background-Job mit Token-Cost-Cap-Schutz.

- **Why ASR:** Synchroner Pass pro Conversation waere zu teuer
- **Impact:** Job-Scheduler im Plugin-Start (oder setInterval), gemeinsame Cost-Cap-Logik mit FEATURE-0318
- **Quality Attribute:** Cost, Performance

**MODERATE ASR #2:** Pattern-Detection-Query ist Engine-Public-Method.

- **Why ASR:** UCM kann denselben Job-Pfad nutzen
- **Impact:** Engine-Public-API erweitert um `runInferencePass()`, `findPatternCandidates()`
- **Quality Attribute:** Reusability

### Constraints

- LLM muss Tool-Calling-Schema fuer derived Facts unterstuetzen (analog FEATURE-0318)
- Confidence-Bands konsistent mit FactIntegrator (FEATURE-0318) Conflict-Resolution

### Open Questions for Architect

- Pattern-Detection-Algorithmus: rein cosine-basiert, oder mit graph-walk ueber `mentions_entity`?
- Pattern-Threshold (3 Facts default): konfigurierbar?
- Inference-Job-Trigger: Plugin-Start ODER setInterval ODER beides?
- Re-Inference: wenn Source-Facts updated/deleted werden, was passiert mit derived Fact (Cascade-Soft-Delete)?

---

## Definition of Done

### Functional

- [ ] Pattern-Detection-Query (Topic-Cluster + mentions_entity-Aggregation, > 3 Facts Threshold)
- [ ] Inference-LLM-Call mit Tool-Calling-Schema (Output: derived-Fact-Candidate mit confidence + Source-Fact-IDs)
- [ ] Confidence-Bands (auto/pending/reject)
- [ ] Auto-Insert mit `relation=derive`, `kind=preference|fact`, derived_from_pattern-Edges
- [ ] Pending-Review-Queue-Integration
- [ ] User-Notification "Pattern erkannt"
- [ ] Background-Job-Scheduler (taeglich oder Plugin-Start nach 24h)
- [ ] Token-Cost-Cap-Schutz (gemeinsam mit FEATURE-0318)
- [ ] Cascade-Soft-Delete: Wenn Source-Facts geloescht werden, derived Fact wird ebenfalls soft-deleted (oder als "stale" markiert)
- [ ] Engine-Public-API: `runInferencePass()`, `findPatternCandidates()`, `inferDerivedFact(candidates)`
- [ ] Eval-Test-Set: 10 synthetische Pattern-Szenarien

### Quality

- [ ] Eval-Test-Set gruen mit > 70% Auto-Insert-Akzeptanz (LLM-as-Judge + manuelle Validation)
- [ ] Pattern-Detection-Performance-Test (10k Facts < 500ms)
- [ ] Cascade-Test (Source-Fact-Delete propagiert)
- [ ] Coverage > 80%

### Documentation

- [ ] FEATURE-0324 Status: Implemented
- [ ] User-Doku: 'Wie UCM Patterns erkennt' mit Beispielen
- [ ] Differenzierungs-Story in BA Section 5.1.1 ergaenzt

---

## Dependencies

- **FEATURE-0315** (Engine-Foundation): facts mit `kind` und `is_latest`, fact_edges mit derived_from_*-Types
- **FEATURE-0317** (Dynamic Composition): derived Facts werden via ContextComposer in Memory-Block aufgenommen
- **FEATURE-0318** (Single-Call Update Pipeline): Token-Cost-Cap, Pending-Review-Queue, FactIntegrator-Logic werden wiederverwendet

## Assumptions

- Sebastian's Vault-Use generiert genug Pattern-relevante Facts (> 3 verwandte) innerhalb sinnvoller Zeit
- LLM (Haiku-Klasse via memoryModelKey) ist zuverlaessig in Pattern-Recognition

## Out of Scope

- Multi-Hop-Pattern-Inference (Patterns ueber Patterns) -- post-MVP
- User-definierte Pattern-Regeln (regelbasiert statt LLM-driven) -- nicht im UCM-Stil
- Cross-User-Patterns (z.B. anonymisiert in Cloud-Service) -- v1 ist Single-User
