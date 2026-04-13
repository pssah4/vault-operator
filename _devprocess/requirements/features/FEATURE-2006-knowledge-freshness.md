# Feature: Knowledge Freshness

**Status:** Implementiert (v2.4.3, 2026-04-12)

> **Feature ID**: FEATURE-2006
> **Epic**: EPIC-020 - Graph Intelligence
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Proactively identifies knowledge areas in the vault that may be outdated, inconsistent, or incomplete. Unlike the existing vault health check (FEATURE-1901) which finds technical inconsistencies (broken links, missing backlinks), this feature analyzes the **content** of notes -- factual accuracy, internal consistency between notes, and temporal relevance.

The key design constraint is cost: reading every note through an LLM on every scan is prohibitively expensive. Instead, the system uses a **multi-stage funnel** that progressively narrows candidates using zero-cost filters before any LLM reads happen. The most cost-effective stage piggybacks on the existing enrichment pass (Pass 2 of SemanticIndexService) which already sends every chunk to a small model (Haiku) -- extending that prompt to also classify freshness adds zero additional API calls.

The agent does not write or update notes itself. It creates categorized review hints in the inbox that the user works through at their own pace.

## Multi-Stage Freshness Funnel

```
Stage 0: Freshness classification (during enrichment)       -- 0 extra tokens
         Haiku classifies volatile/evolving/stable per chunk
         Majority vote -> note-level freshness_class in DB

Stage 1: Temporal markers (during chunk creation)            -- 0 tokens
         Regex identifies time-bound assertions in note text
         "Stand 2024", "aktuell", "geplant fuer", version numbers

Stage 2: Passive detection (during normal usage)             -- 0 extra tokens
         Agent notices outdated claims while answering questions
         Beilaeuig: "Diese Note erwaehnt X, das ist inzwischen Y"

Stage 3: Embedding consistency (cluster outliers)            -- 0 tokens
         Notes far from cluster centroid may be inconsistent
         Intra-cluster divergence flags potential contradictions

Stage 4: Claim check (LLM, only for candidates)             -- cheap
         50 extracted claims in one batch call
         Not 50 full notes individually

Stage 5: Full read (LLM, only for confirmed candidates)     -- expensive, rare
         Only when stages 0-4 deliver concrete suspicion
```

Each stage reduces the candidate set. A 1000-note vault might have 200 volatile/evolving notes (Stage 0), 50 with temporal markers (Stage 1), 15 cluster outliers (Stage 3), and only 5-10 that actually need LLM review (Stage 4-5).

## Operational Cycle: When Does What Run?

Stages 0-1 run **once during index build** and are cached. They classify WHAT could become outdated, not WHEN. The actual freshness check requires a **scan trigger** that evaluates candidates against current reality.

### Trigger Model

```
ONCE (during index build, 0 extra cost):
  Stage 0: freshness_class set (volatile/evolving/stable)
  Stage 1: temporal_markers counted

CONTINUOUSLY (every chat interaction, 0 extra cost):
  Stage 2: Agent notices outdated claims while reading retrieved notes

ON-DEMAND (user says "check my vault" or via skill trigger):
  Stage 3: Cluster outlier detection                    -- 0 tokens
  Stage 4: Candidate claims batch-check                 -- ~$0.02-0.05
  Stage 5: Confirmed candidates full read               -- ~$0.01-0.03
```

### Scan Frequency Options (user-configurable)

| Mode | Trigger | Cost/month | Coverage | Default? |
|------|---------|-----------|----------|----------|
| **On-demand only** | User says "pruefe meinen Vault" or uses skill | $0.00 + per-scan | Manual | Yes (default) |
| **Weekly** | Background scan once per week | ~$0.20 | 100% of volatile/evolving notes | Opt-in |
| **On startup** | Once per session when Obsidian starts | ~$1.50 (daily use) | 100%, fast detection | Opt-in |

Default: On-demand. User can enable periodic scans in settings with a frequency dropdown (never / weekly / on startup).

### Passive Detection as Primary Channel (Stage 2)

The most important detection channel costs nothing extra. When the user sends 10-20 chat messages per day and the agent retrieves 5-10 notes per message, ~150-300 unique notes are "passively reviewed" per month. For a 1000-note vault, that covers ~20-30% without a single additional call.

Over 3-4 months, the most actively used parts of the vault (which are the ones most likely to matter) are covered organically.

### Cost Per Scan (1000-note vault, typical)

| Step | Input | Output | Cost |
|------|-------|--------|------|
| SQL: volatile/evolving + age > threshold + markers > 0 | 1000 notes | ~80 candidates | $0.00 |
| Stage 3: Cluster outlier (vector distance) | 80 candidates | ~20 outliers | $0.00 |
| Stage 4: Claims batch-check (20 claims in one call) | ~2K input tokens | ~500 output tokens | ~$0.02 |
| Stage 5: Full read (3-5 confirmed notes) | ~15K input tokens | ~2K output tokens | ~$0.03 |
| **Total per scan** | | | **~$0.05** |

For comparison: a normal chat message with retrieval costs ~$0.02-0.05. A freshness scan costs roughly the same as 1-2 chat messages.

## Stage Details

### Stage 0: Freshness Classification (Enrichment Piggyback)

The existing enrichment pass (`SemanticIndexService.enrichChunkWithContext`) sends every chunk to Haiku with the document context. The prompt currently asks for a 2-3 sentence contextual prefix. Extension:

**Current prompt:**
```
Give a short (2-3 sentence) context that situates this chunk within the document.
```

**Extended prompt:**
```
Give a short (2-3 sentence) context that situates this chunk within the document.
Also: Is this content time-sensitive? Reply <freshness>volatile</freshness>,
<freshness>evolving</freshness>, or <freshness>stable</freshness> before the context.
```

This adds ~1 token to the response. The classification is extracted per chunk and aggregated to note-level via majority vote. Stored in a new `freshness` table or as an OntologyStore attribute.

**Freshness classes:**

| Class | Meaning | Examples | Review trigger |
|-------|---------|----------|----------------|
| `volatile` | Topic changes rapidly | AI regulation, tech trends, pricing | Age > 3 months + temporal markers |
| `evolving` | Changes occasionally | Research findings, best practices | Age > 6 months + temporal markers |
| `stable` | Changes rarely/never | History, philosophy, mathematics | Never automatic |
| `manual` | User explicitly marked | Anything the user wants to track | On user request |

Notes classified as `stable` are **never** automatically flagged. This eliminates false positives like "Bolschewismus ist 12 Monate alt -> Review!".

### Stage 1: Temporal Markers (Regex, Zero Cost)

During chunk creation in `SemanticIndexService.buildIndex()`, a regex scan identifies time-bound assertions:

- Date references: `/\b(Stand|seit|ab|bis)\s+\d{4}\b/i`, `/\b20[2-3]\d\b/`
- Currency/status markers: `/\b(aktuell|derzeit|momentan|bisher)\b/i`
- Version numbers: `/\bv?\d+\.\d+(\.\d+)?\b/` in non-code context
- Future markers: `/\b(geplant|vorgesehen|Entwurf|noch nicht)\b/i`
- Regulatory: `/\b(in Kraft|tritt .* in Kraft|Uebergangsfrist)\b/i`

Results stored as `temporal_marker_count INTEGER` per note in DB. Notes with `freshness_class != 'stable'` AND `temporal_marker_count > 0` AND `age > threshold` become review candidates.

### Stage 2: Passive Detection (Zero Extra Cost)

Not a code feature but a **system prompt instruction**. The agent's power steering includes:

> "When you read a note as context for answering a question and notice claims that appear outdated based on your knowledge, mention this briefly. Example: 'Your note [[X]] says Y is still in draft -- this has since been enacted. Want me to create a review hint?'"

This happens naturally during retrieval. No dedicated scan needed. The agent reads the note anyway to answer the question. Cost: zero additional tokens.

### Stage 3: Embedding Consistency (Zero Cost, Depends on FEATURE-2002)

Using cluster centroids from community detection:

1. **Cluster outliers:** Compute distance of each note's average embedding to its cluster centroid. Notes >2 standard deviations from centroid are flagged as potential inconsistencies.

2. **Intra-cluster contradiction candidates:** If 8 of 10 notes in a cluster have similar embeddings but 2 diverge strongly, those 2 may contain contradictory information. Flag for LLM review in Stage 4.

This is pure vector math on existing embeddings. No API calls.

### Stage 4: Claim Check (Cheap LLM, Candidates Only)

For notes that passed Stages 0-3 as candidates, extract key claims and batch-check them:

**Option A: Claims extracted during enrichment (piggyback)**
Extend the enrichment prompt further to also extract 1-2 key claims per chunk:
```
<claims>EU AI Act is in draft phase (2024)</claims>
```
Stored in a `claims` table. Later batch-checked: 50 claims in one LLM call.

**Option B: Claims extracted on-demand during scan**
When a freshness scan runs, read only the candidate notes (not the whole vault) and extract claims. More flexible but slightly more expensive.

Recommendation: Start with Option B (simpler), evolve to Option A if token savings justify the complexity.

### Stage 5: Full Read (Expensive, Rare)

Only for notes where Stage 4 confirmed a specific claim as potentially outdated. The agent reads the full note and produces a detailed review hint. This is the most expensive stage but runs on <1% of vault notes.

## Review Hint Format

Output is a note in the inbox with category `Review`:

```yaml
---
Kategorie: Review
Typ: staleness | inconsistency | missing-connection
Betrifft: "[[Note-die-geprueft-werden-soll]]"
Erstellt: 2026-04-12
Prioritaet: hoch | mittel | niedrig
---

## Was pruefen?

Deine Note [[KI-Regulierung in der EU]] enthaelt die Aussage:
"Der EU AI Act ist noch in der Entwurfsphase" (Stand Juni 2024).

Der EU AI Act ist seit August 2025 in Kraft. Diese Aussage ist
wahrscheinlich veraltet.

## Warum relevant?

12 Notes verlinken auf [[KI-Regulierung in der EU]]. Veraltete
Informationen dort beeinflussen dein gesamtes KI-Ethik-Cluster.

## Vorgeschlagene Aktion

- [ ] Note lesen und Aussage pruefen
- [ ] Ggf. aktualisieren
- [ ] Wenn erledigt: diesen Review-Hint loeschen
```

## Benefits Hypothesis

**We believe that** multi-stage freshness analysis with enrichment-piggybacking
**Delivers the following measurable outcomes:**
- >80% of surfaced review hints address genuine content issues (not just old dates)
- <$0.10 per full vault freshness scan (Stages 0-3 are free, Stage 4 is batched)

**We know we are successful when:**
- >50% of review hints are acted on within 2 weeks
- Users report fewer "I cited outdated information" incidents
- False positive rate <20% (hints that user dismisses as irrelevant)

## Jobs to be Done (from BA)

| Job Type | Job | Addressed in Story |
|----------|-----|-------------------|
| Functional | Know which parts of my knowledge are outdated | Story 1 |
| Functional | Discover contradictions between notes | Story 2 |
| Functional | Stay current without manually monitoring every note | Story 3 |
| Emotional | Trust my vault as a reliable knowledge base | Story 4 |

## User Stories

### Story 1: Content staleness detection (Functional)
**As a** researcher tracking fast-moving fields
**I want to** the agent to flag notes with claims that may no longer be accurate
**so that** I can prioritize which notes to review and update

### Story 2: Internal consistency check (Functional)
**As a** PKM user with deep topic clusters
**I want to** the agent to surface potential contradictions between notes in the same cluster
**so that** I can resolve inconsistencies in my knowledge base

### Story 3: Passive freshness awareness (Functional)
**As a** knowledge worker asking the agent questions
**I want to** be alerted when the agent reads a note with potentially outdated claims
**so that** I become aware of staleness without running explicit scans

### Story 4: Vault confidence (Emotional)
**As a** consultant relying on my vault for client work
**I want to** trust that my knowledge base reflects current understanding
**so that** I feel confident using it as foundation for recommendations

### Story 5: Configurable scan frequency (Functional)
**As a** user who wants ongoing freshness monitoring
**I want to** configure how often the system scans for outdated content (never, weekly, on startup)
**so that** I can balance cost against coverage based on my needs

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Freshness classification happens without dedicated processing cost | Zero additional calls beyond existing enrichment | Code review |
| SC-02 | System identifies notes with potentially outdated claims, not just old dates | >80% of hints address genuine content issues | User review of 20 hints |
| SC-03 | Stable topics (history, math) are never auto-flagged | Zero false positives on stable-classified notes | Audit |
| SC-04 | Review hints are created as inbox notes, no existing notes modified | Zero modifications to existing notes | Audit |
| SC-05 | User can dismiss hints and they do not recur | Dismissed hints stay dismissed | Persistence test |
| SC-06 | Full vault freshness scan costs less than a typical chat conversation | <$0.10 for 1000 notes (Stages 0-3 free, Stage 4 batched) | Cost tracking |
| SC-07 | Agent mentions potential staleness during normal conversation | Passive detection works without explicit scan | Manual test |
| SC-08 | Scan frequency is user-configurable | Settings: never / weekly / on startup | Settings UI test |
| SC-09 | Passive detection covers a significant portion of the vault over time | >20% of vault notes passively reviewed per month during normal usage | Retrieval log analysis |

---

## Technical NFRs (for Architect)

### Performance
- **Enrichment extension**: <1 additional output token per chunk (freshness tag)
- **Temporal marker scan**: <100ms for 1000 notes (regex during existing chunking)
- **Cluster outlier detection**: <500ms (vector distance on existing embeddings)
- **Claim check batch**: 50 claims in one LLM call (<$0.02)

### Cost
- **Stage 0-3**: Zero additional cost (piggyback on existing processes)
- **Stage 4**: <$0.05 per scan (batched claims)
- **Stage 5**: <$0.05 per confirmed candidate (rare, <5 notes per scan)
- **Total per scan**: ~$0.05 for 1000 notes
- **Monthly (on-demand only)**: $0.00 base + passive detection (free)
- **Monthly (weekly scans)**: ~$0.20
- **Monthly (daily/on-startup)**: ~$1.50

### Data Integrity
- **Read-only on existing notes**: Feature never modifies existing vault content
- **Inbox-only output**: Review hints written only to inbox with `Kategorie: Review`
- **Dismissal persistence**: Dismissed hints stored in DB, survive restarts

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Freshness classification must piggyback on existing enrichment -- no separate pass
- **Why ASR**: A dedicated classification pass would double the Haiku API calls during indexing
- **Impact**: `enrichChunkWithContext()` prompt must be extended, response parsing adapted
- **Quality Attribute**: Cost

**CRITICAL ASR #2**: Must not modify existing notes
- **Why ASR**: Core design principle "linking is thinking" -- content changes are the user's job
- **Impact**: All output goes to inbox via `write_file`, never `edit_file` on existing notes
- **Quality Attribute**: Trust

**MODERATE ASR #3**: Dismissals must persist across sessions
- **Why ASR**: Re-surfacing dismissed hints erodes trust
- **Impact**: New `dismissed_freshness` table in KnowledgeDB
- **Quality Attribute**: UX Quality

### Open Questions for Architect
- Should `freshness_class` live in OntologyStore (alongside cluster data) or in a new table?
- Claim extraction: piggyback on enrichment (Option A) or on-demand (Option B)?
- Temporal marker patterns: hardcoded regex or configurable per locale?
- How to handle notes that get re-enriched (enrichment re-run)? Update freshness_class?
- Passive detection: system prompt instruction or dedicated post-processing in AgentTask?

---

## Definition of Done

### Functional
- [ ] Stage 0: Enrichment prompt extended, freshness_class stored per note
- [ ] Stage 1: Temporal markers extracted during chunk creation
- [ ] Stage 2: System prompt includes passive freshness detection instruction
- [ ] Stage 3: Cluster outlier detection produces candidate list
- [ ] Stage 4: Claim batch-check on candidates
- [ ] Review hints created in inbox with correct format
- [ ] Dismissal mechanism with persistence
- [ ] Configurable settings: review thresholds, enabled stages, scan frequency
- [ ] Scan frequency setting: never (default) / weekly / on startup
- [ ] User can manually classify a note's freshness (`manual` class)
- [ ] On-demand scan via chat ("pruefe meinen Vault") or skill trigger
- [ ] Background scan does not block UI (runs async with progress indicator)

### Quality
- [ ] Unit tests: freshness classification parsing from enrichment response
- [ ] Unit tests: temporal marker regex
- [ ] Integration test: full funnel produces review hints
- [ ] Cost test: <$0.10 per 1000-note scan
- [ ] False positive test: stable notes never auto-flagged

### Documentation
- [ ] Feature spec updated (Status: Implemented)
- [ ] Backlog updated

---

## Hypothesis Validation

| Hypothesis (BA Ref) | Test Method | Success Criterion | Result |
|--------------------|-------------|-------------------|--------|
| Enrichment piggyback produces useful freshness classes | Compare Haiku classification with manual assessment on 50 notes | >80% agreement | Open |
| Multi-stage funnel reduces candidates to <5% of vault | Run full funnel on 500+ note vault | <25 candidates reach Stage 4 | Open |
| Review hints address genuine content issues | User reviews 20 hints | >80% rated as relevant | Open |

**If disproven:** If enrichment classification is unreliable, fall back to temporal-marker-only approach (Stage 1) as primary filter. Less precise but zero-cost and deterministic.

---

## Dependencies
- **SemanticIndexService**: Enrichment pass (Stage 0 piggyback)
- **FEATURE-2002** (Community Detection): Cluster data for Stage 3 (outlier detection)
- **FEATURE-2001** (Confidence Scoring): Edge confidence for prioritizing candidates
- **KnowledgeDB**: New tables (freshness, temporal_markers, dismissed_freshness)
- **Power Steering / System Prompt**: Stage 2 passive detection instruction

## Assumptions
- Haiku can reliably classify volatile/evolving/stable in one additional output token
- Temporal marker regex covers >80% of time-bound assertions in German+English
- Cluster outlier detection produces meaningful candidates (not just noise)

## Out of Scope
- Automatic note updates or content rewrites
- Real-time monitoring of external sources (RSS, newsletters)
- Scheduled automatic scans (user must trigger explicitly -- could be added later)
- Cross-vault freshness analysis
- Claim extraction during enrichment (Option A) -- deferred to Phase 2 after validating Stage 4 with on-demand extraction

---

## Key Files

| Datei | Zweck |
|-------|-------|
| `src/core/semantic/SemanticIndexService.ts` | Freshness classification (Stage 0 Enrichment-Piggyback) |
