# Feature: Batch Ingest


> **Feature ID**: FEAT-20-05
> **Epic**: EPIC-20 - Graph Intelligence
> **Priority**: P1-High
> **Effort Estimate**: L

## Feature Description

Enables users to integrate an entire folder of notes and documents in a single conversational workflow instead of processing each file individually. The pipeline has three phases: (1) deterministic pre-scan (no LLM) that inventories files, detects duplicates, and checks existing frontmatter, (2) token-optimized entity recognition that shares an entity cache across files (search once, link many), and (3) conversational group review where the user confirms integration decisions per thematic group. Each confirmed group creates a checkpoint for undo. The key design constraint: batch processing must not produce "AI slop" -- the user reviews every structural decision, and linking remains an expression of their own thinking.

## Benefits Hypothesis

**We believe that** enabling folder-based batch integration
**Delivers the following measurable outcomes:**
- Inbox throughput increases from 5-10 notes/session to 50+
- Per-note cost decreases by 50% through entity caching and deterministic preprocessing

**We know we are successful when:**
- 50 documents are integrated in <30 minutes (vs. ~8h individually)
- Token cost per note is <$0.15 in batch mode (H-02)
- User reviews and approves every structural decision (no autonomous linking)

## Jobs to be Done (from BA)

| Job Type | Job | Addressed in Story |
|----------|-----|-------------------|
| Functional | Integrate 50+ documents in one session without processing each individually | Story 1 |
| Functional | Control token costs during bulk operations | Story 2 |
| Emotional | Feel in control despite batch processing -- no autonomous decisions | Story 3 |
| Functional | Undo batch integration if results are unsatisfactory | Story 4 |

## User Stories

### Story 1: Folder-based integration (Functional)
**As a** researcher with 50 PDFs in my inbox
**I want to** say "integrate all files in Inbox/"
**so that** all documents are analyzed, categorized, and linked in one workflow

### Story 2: Cost-aware processing (Functional)
**As a** cost-conscious user
**I want to** the agent to reuse entity lookups across files in a batch
**so that** I don't pay for redundant searches when multiple documents reference the same topics

### Story 3: Batch with control (Emotional)
**As a** PKM user who values intentional linking
**I want to** review integration proposals per thematic group before they are applied
**so that** I maintain ownership of my vault's structure even during bulk operations

### Story 4: Safe rollback (Functional)
**As a** user who just ran a batch integration
**I want to** undo the entire batch or individual groups
**so that** I can reverse decisions that didn't work out without manual cleanup

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | User can trigger integration for an entire folder in one command | Single conversational instruction | Manual test |
| SC-02 | System groups documents thematically and presents groups for review | Groups shown before any changes are made | Manual test |
| SC-03 | User approves or rejects each group independently | Rejected groups are not processed | Manual test |
| SC-04 | Each approved group can be undone independently | Undo restores exact previous state | Undo test |
| SC-05 | Per-document cost is significantly lower than individual processing | <$0.15/note (vs ~$0.20 individual) | Cost tracking |
| SC-06 | Pre-scan phase runs without incurring usage-based costs | Deterministic, no external calls | Code review |
| SC-07 | No structural changes are made without user confirmation | Zero autonomous link creation | Audit test |

---

## Technical NFRs (for Architect)

### Performance
- **Pre-scan**: <10s for 100 files (file listing, frontmatter parsing, duplicate detection)
- **Entity cache**: Shared lookup cache across batch reduces redundant semantic_search calls by >50%
- **Progress feedback**: User sees progress per file/group (not a silent wait)

### Cost
- **Token budget**: Configurable per-batch limit (default: no limit, but cost estimate shown before start)
- **Deterministic preprocessing**: File scanning, duplicate detection, frontmatter parsing without LLM

### Data Integrity
- **Checkpoint per group**: Git checkpoint before each group's changes are applied
- **Undo per group**: Each group independently reversible via existing checkpoint service
- **Failure isolation**: If one file in a group fails, remaining files in the group still complete

### Scalability
- **Batch size**: No artificial limit, but progress shown and groups kept manageable (5-15 files per group)
- **Memory**: Entity cache bounded (max 1000 entities, LRU eviction)

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Must use existing knowledge-ingest skill per-file, not reinvent the ingest pipeline
- **Why ASR**: The ingest skill encodes domain rules (existing-first search, stub note creation, frontmatter schema). Duplicating this logic would create maintenance burden.
- **Impact**: Batch orchestration wraps the existing skill with entity caching and group presentation
- **Quality Attribute**: Maintainability

**CRITICAL ASR #2**: Entity cache must be shared across files but not persist between sessions
- **Why ASR**: Persisting entity resolutions across sessions would make the system less responsive to vault changes
- **Impact**: In-memory cache, populated during batch, discarded after
- **Quality Attribute**: Correctness

**MODERATE ASR #3**: Thematic grouping should use Louvain clusters if available (FEAT-20-02)
- **Why ASR**: If community detection has run, grouping files by detected cluster produces more coherent groups
- **Impact**: Optional dependency on FEAT-20-02, fallback to LLM-based grouping
- **Quality Attribute**: UX Quality

### Open Questions for Architect
- Should batch ingest be a new tool (batch_ingest) or a new skill that orchestrates existing tools?
- How to handle mixed file types in one batch (50% markdown, 30% PDF, 20% DOCX)?
- Entity cache invalidation: what if a stub note is created mid-batch that changes entity resolution?
- Should the agent ask the user upfront "how do you want to handle this batch?" (full auto, group review, individual review)?

---

## Definition of Done

### Functional
- [ ] All user stories implemented
- [ ] All success criteria met
- [ ] Pre-scan phase: file inventory, duplicate detection, frontmatter audit
- [ ] Entity cache: shared lookups across batch files
- [ ] Group presentation: thematic groups with preview before execution
- [ ] Group-level undo via checkpoint service
- [ ] Cost estimate shown before batch starts

### Quality
- [ ] Integration test: 20-file batch on test vault
- [ ] Cost benchmark: compare per-note cost individual vs. batch
- [ ] Performance test: pre-scan <10s for 100 files
- [ ] Undo test: restore after group confirmation

### Documentation
- [ ] Feature spec updated (Status: Implemented)
- [ ] Backlog updated
- [ ] Skill documentation updated (knowledge-ingest extended or new batch-ingest skill)

---

## Hypothesis Validation

| Hypothesis (BA Ref) | Test Method | Success Criterion | Result |
|--------------------|-------------|-------------------|--------|
| H-02: Batch reduces token cost by 50% | Benchmark: 50 PDFs individual vs. batch | <$0.15/note batch vs ~$0.20 individual | Open |

**If disproven:** Entity caching may not yield enough savings. Consider reducing LLM involvement further: use deterministic frontmatter extraction for known patterns (author, year, title), reserve LLM only for entity disambiguation.

---

## Dependencies
- **Knowledge-ingest skill**: Existing per-file ingest logic
- **Checkpoint service**: For group-level undo
- **FEAT-20-02** (Community Detection): Optional -- for thematic grouping based on clusters
- **IngestDocumentTool**: For PDF/Office document parsing

## Assumptions
- Users are willing to review groups of 5-15 files at a time (not individual review for 50 files)
- Entity cache with 1000-entry LRU is sufficient for typical batch sizes
- Existing ingest skill is callable programmatically (not only via chat trigger)

## Out of Scope
- Fully autonomous batch ingest without user review
- Scheduled/automatic inbox processing (e.g. "process inbox every morning")
- Cross-vault batch operations

---

## Key Files

| Datei | Zweck |
|-------|-------|
| `bundled-skills/knowledge-batch-ingest/SKILL.md` | Batch-Ingest Skill-Definition |
