---
id: FEATURE-0318
title: Single-Call Update Pipeline und Combined Note-Index-Pass
epic: EPIC-003-context-memory-scaling
phase: Building
status: Planned
priority: P0
effort: L
depends-on: [FEATURE-0317]
related:
  - PLAN-001-memory-v2-master.md (Phase 4)
  - ADR-076-episode-fact-boundary.md
---

# Feature: Single-Call Update Pipeline und Combined Note-Index-Pass

> **Feature ID:** FEATURE-0318
> **Epic:** [EPIC-003 Context, Memory & Scaling](../epics/EPIC-003-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 4
> **Priority:** P0-Critical
> **Effort:** L (2 Wochen)

## Feature Description

Konsolidierung der heutigen 2-3 LLM-Calls pro memory-eligible Conversation (SessionExtractor + LongTermExtractor + optional ContextPrefix) in einen einzigen strukturierten Tool-Calling-Output. Single-Call produziert: Session-Summary, Fact-Candidates mit Topics + Importance + Rationale, Episode-Outcome, plus generische `mentions: [{uri, label?, kind?}]`-Liste fuer Bridge-Edges ueber alle Source-Schemata (vault://, file://, https://, cloud://, entity://, custom). Lazy Conflict-Resolution: zusaetzlicher LLM-Call nur wenn Cosine > 0.9 UND Topic-Overlap (geschaetzt < 10% der Inserts statt 100%).

**Inkrementelle Extraktion (Delta-Window):** Bei Re-Run einer memory-eligible Conversation wird nicht die ganze History wiederholt durchgereicht. Stattdessen Delta-Window: Messages mit `index > lastExtractedMessageIndex` plus eine kompakte "Conversation-So-Far"-Summary aus dem letzten Run als Context (~200 Tokens). Single-Call-Output enthaelt nur **neue** Fact-Candidates plus optionale Refine-Hints zu existierenden Facts. Token-Verbrauch pro Re-Extract: linear in Delta-Laenge, nicht in Conversation-Laenge.

**Provisional-Mention-Edges (Synchron, kein LLM):** Pro User-Message laeuft ein leichtgewichtiger Parser, der erkennt:

- Wiki-Links `[[Notes/X.md]]` -> `vault://Notes/X.md`
- Markdown-Links `[text](path/to/file.pdf)` -> `vault://...` (vault-relativ) oder `file:///...` (absolut)
- Bare URLs `https://...` / `http://...` -> `https://...`
- File-Pfade in Conversation-Text -> `file://...` (mit Heuristik, optional)

Diese Edges werden als `mentions_*_provisional` (Edge-Type-Suffix) sofort persistiert, mit `confidence: 'parser'` in metadata. Der End-of-Conversation-Single-Call upgraded sie zu konfirmierten `mentions_*`-Edges, oder verwirft sie (soft-delete). Damit ist Cross-DB-Bruecke innerhalb einer laufenden Conversation live, Hybrid-Retrieval findet erwaehnte Quellen sofort.

**Topic-Drift-Hook (Cross-Cutting mit FEATURE-0317):** FactExtractor signalisiert dem ContextComposer, wenn ein Topic-Wechsel detected wird (Cosine zwischen aktueller User-Message und Topic-Lock < 0.6). Composer kann den Topic-Lock soft-invalidieren und Topical-Memory-Block fuer den naechsten Turn refresh. Re-Extraction-Trigger nutzt denselben Hook: bei detected Topic-Wechsel mid-conversation wird ein zusaetzlicher Re-Extract-Job in die ExtractionQueue gestellt, ueber den Throttle hinweg, weil Topic-Drift selten ist.

**Bypass-Pfad fuer expliziten Save-Trigger:** User-Trigger (Star-Button "Save now", `mark_conversation_for_memory`-Tool, `/save now`-Command) ueberspringt den 60s-Throttle und triggert sofort eine Single-Call-Extraction des aktuellen Delta-Windows. Bypass setzt einen Flag im ExtractionQueue-Item, der den Throttle-Check umgeht.

**Episode-Living-Document-Verhalten (B2-Beschluss 2026-04-26):** Eine Episode pro Conversation, die mit jedem Re-Extract erweitert wird (mehr tool_sequence-Eintraege, Outcome aktualisiert). ADR-018 Episode-Schema bekommt `last_updated_at`-Spalte, Updates sind idempotent. Recipe-Promotion (ADR-058) sieht eine konsolidierte Episode statt vieler Fragmente. Recipes bleiben Obsilo-spezifisch (B3-Beschluss), nicht in Engine-Public-API exportiert.

**Edge-Konzept-Layer (E1, Supermemory-Differenzierung):** Single-Call-Output gibt pro Fact-Candidate eine semantische `relation`-Klassifikation zurueck (`new` | `update` | `extend` | `derive`), die FactIntegrator nutzt:

- `new`: Insert als neuer Fact, `is_latest=1`
- `update`: alter Fact bekommt `is_latest=0` + `superseded_by={neue_id}`, neue Fact mit `is_latest=1`. Edge `supersedes` automatisch
- `extend`: beide Facts `is_latest=1`, Edge `refines` zwischen ihnen
- `derive`: neuer inferred Fact (siehe FEATURE-0324), Edge `derived_from_*` zur Source

Damit reduziert sich FactIntegrator-Output von 5 Klassen (`equivalent`/`refinement`/`update`/`contradiction`/`unrelated_despite_similarity`) auf 4 sauberere Klassen.

**Memory-Typ-Klassifikation (E2/E8):** Single-Call-Output traegt pro Fact-Candidate ein `kind`-Feld (`fact` | `preference` | `identity` | `event`). LLM klassifiziert direkt im Tool-Calling-Schema. Aging-Algorithmus nutzt unterschiedliche Halbwertzeiten:

- `identity` ("Sebastian arbeitet bei EnBW") -- 180-Tage-Halbwertzeit, sehr langsam Decay
- `preference` ("Sebastian bevorzugt Plan-Mode") -- persistent, multiplikativer use-count-Boost +0.05 pro Confirmation
- `fact` ("UniCredit nutzt Java 8") -- 90-Tage-Halbwertzeit (heute geplanter Default)
- `event` ("Sebastian schaut gerade Dortmund vs Bayern") -- 14-Tage-Halbwertzeit, schneller Decay

**Noise-Filter + Pre-Insert-Importance-Threshold (E3):** Single-Call-Extraction-Prompt erhaelt Anweisung: "Extrahiere keine Facts fuer Smalltalk, hypothetische Fragen, Filler. Wenn Statement keine klare Wissens-Aussage ist, ueberspringe es." Plus Pre-Insert-Filter im FactIntegrator: Facts mit `importance < 0.2` werden gar nicht erst geschrieben (gespart: Storage, Cache-Tokens, Conflict-Resolution-Calls).

AgingService laeuft taeglich (oder bei Plugin-Start wenn > 24h seit letztem Run). Aging mit `use_count`-Boost und `last_used_at`-Touch-Refresh statt rein 90-Tage-Decay. AuditPruning: nur state-changing Operations (insert/supersede/deprecate) werden geloggt, Use-Counts inline in `facts.use_count`.

Eval-Test-Set als Phase-1-Deliverable: 5+ realistische Conversations mit erwarteten Fact-Outputs (inklusive Mid-Session-Topic-Wechsel und Re-Extract-Cases), Schema-Validierung, Performance-Profil.

Parallel als Vault-Side-Quick-Win: Combined Note-Index-Pass. Heute (vermutlich) drei separate LLM-Paesse pro Note (note_freshness, implicit_edges, Tag-Vorschlaege). Combined: ein Pass mit strukturiertem Output, ~50% Cost-Reduction beim Vault-Indexing.

## Benefits Hypothesis

**We believe that** Single-Call-Extraction die LLM-Cost pro Conversation halbiert und Lazy Conflict-Resolution die Conflict-LLM-Calls um 90% reduziert, ohne Qualitaetsverlust.

**Delivers the following measurable outcomes:**

- LLM-Calls pro memory-eligible Conversation: 1 (heute 2-3)
- Conflict-LLM-Calls pro Insert: < 0.1 im Schnitt (heute implizit jeder Insert wenn LongTermExtraction laeuft)
- Vault-Index-LLM-Cost pro Note: -50% (Combined-Pass)
- Audit-Log-Volumen pro 1000 Operations: < 100 Rows (heute potentiell 1000+)

**We know we are successful when:**

- Token-Profil-Eval zeigt < 1500 Tokens pro Memory-Operation (Mem0-Benchmark-Ziel)
- Eval-Test-Set bewertet Single-Call-Output-Qualitaet > 80% gegenueber separaten Calls
- Aging-Cycle laeuft transaktional, ohne Hot-Path-Blockierung
- Combined Note-Index-Pass produziert vergleichbare Vault-Edges wie heute getrennt

## User Stories

### Story 1: Memory-Update kostet weniger (Functional Job)

**As a** Sebastian (Cost-bewusst)
**I want to** dass eine memory-eligible Conversation nicht 3 separate LLM-Calls triggert
**so that** Token-Verbrauch unter Kontrolle bleibt

### Story 2: Konflikte werden nur dann analysiert wenn relevant (Functional Job)

**As a** Obsilo-Nutzer
**I want to** dass nur echte Konflikte LLM-Aufwand kosten, nicht jede Aehnlichkeit
**so that** Memory-Update schnell bleibt

### Story 3: Alte Facts verschwinden organisch (Emotional Job)

**As a** langjaehriger Nutzer
**I want to** dass veraltete Memory-Eintraege langsam verblassen statt zu bleiben
**so that** mein Memory-System nicht von veralteten Wahrheiten verschmutzt wird

### Story 4: Konversation entwickelt sich, Memory entwickelt sich mit (Functional Job)

**As a** Sebastian (lebende Konversation)
**I want to** dass Memory neuer Beitraege ohne erneutes Verarbeiten der ganzen History extrahiert wird
**so that** Re-Extraction billig und schnell ist, auch nach 50+ Messages

### Story 5: Erwaehnungen aller Quellen werden erkannt (Functional Job)

**As a** Obsilo-Nutzer
**I want to** dass Verweise auf Vault-Notes, Attachments, lokale Dateien und Web-URLs alle als Bridge-Edges erfasst werden
**so that** Hybrid-Retrieval Cross-Source-Hits liefern kann

### Story 6: Sofort-Speichern auf explizite Geste (Functional Job)

**As a** Obsilo-Nutzer
**I want to** mit einem Klick oder Voice-Trigger eine Konversation sofort in Memory uebernehmen
**so that** der 60s-Throttle nicht im Weg steht, wenn ich es eilig habe

### Story 7: Topic-Wechsel mid-conversation wird erkannt (Functional Job)

**As a** Obsilo-Nutzer
**I want to** dass das Plugin merkt, wenn ich das Thema wechsle, und Memory-Kontext entsprechend nachzieht
**so that** der Agent nicht mit veralteten Topical-Facts arbeitet

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Memory-Update verbraucht weniger LLM-Calls | 1 Call pro Conversation (statt 2-3) | Telemetrie |
| SC-02 | Konflikt-Resolution nur wenn echter Konflikt | < 10% der Inserts triggern Conflict-LLM-Call | Telemetrie + Eval |
| SC-03 | Aging respektiert Use-Patterns | Facts mit haeufiger Nutzung verblassen nicht | Test mit simuliertem Use-Pattern |
| SC-04 | Audit-Log waechst kontrolliert | < 100 Rows pro 1000 Operations | DB-Query |
| SC-05 | Vault-Index-Pass kostet weniger | Combined-Pass < 50% Cost gegenueber 3 separaten Calls | Telemetrie |
| SC-06 | Single-Call-Output ist robust gegen LLM-Varianten | 0 Parse-Fehler in 100 Test-Conversations | Eval-Test-Suite |
| SC-07 | Re-Extract-Cost ist linear in Delta, nicht in Conversation-Laenge | Token-Verbrauch < 30% bei 5x Re-Extract gegenueber Full-Re-Run | Telemetrie |
| SC-08 | Mentions aller Schemata werden erfasst | 90% Recall fuer vault://, file://, https:// in 20 Test-Messages | Eval |
| SC-09 | Provisional-Mention-Edges entstehen synchron, ohne LLM-Call | Innerhalb 200ms nach User-Message persistiert | Test |
| SC-10 | Bypass-Pfad ueberspringt Throttle | "Save now" triggert Re-Extract sofort, unabhaengig vom 60s-Fenster | Test |
| SC-11 | Topic-Drift triggert Re-Extract auch ohne Time-Throttle | Topic-Wechsel mid-conversation -> Re-Extract-Job in der Queue | Test |

---

## Technical NFRs

### Performance

- **Single-Call-Extraction:** < 30 Sekunden p95 (heute ca. 20-40 Sekunden fuer 2-3 separate Calls)
- **Aging-Cycle (10k Facts):** < 5 Sekunden, single Transaction
- **Combined Note-Index-Pass:** < 50% der heutigen 3-Pass-Cost
- **Conflict-Resolution-Trigger-Rate:** < 10% der Inserts

### Security

- **JSON-Schema-Validation:** Tool-Calling-Output wird gegen Schema validiert, Malformed = Reject + Log
- **Audit-Trail-Vollstaendigkeit:** alle state-changing Operations geloggt, Use-Counts inline

### Scalability

- **Aging-Linear:** O(N) ueber Facts-Tabelle, transactional
- **Eval-Test-Set:** mindestens 10 Conversations, erweiterbar

### Availability

- **ExtractionQueue-Robust:** isPermanentProviderError-Semantik wird beibehalten und auf neue Pipeline ueberfuehrt
- **Aging-Idempotent:** doppelter Run im selben Tag tut nichts

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1:** Single-Call-Extraction nutzt Tool-Calling-Schema, kein Free-Form-Markdown.

- **Why ASR:** Robust, validierbar, deterministisch parsebar
- **Impact:** Provider-Support pruefen (Anthropic + OpenAI haben Tool-Calling, Ollama u.U. nicht)
- **Quality Attribute:** Reliability

**MODERATE ASR #2:** Aging-Algorithmus muss Use-Count-Boost integrieren, nicht nur Decay.

- **Why ASR:** Reine Decay vergisst auch wichtige Facts
- **Impact:** Importance-Update-Formel: importance' = max(decay, baseline + use_boost)
- **Quality Attribute:** Functional Correctness

**MODERATE ASR #3:** Inkrementelle Extraktion mit Delta-Window und konsolidierter Conversation-So-Far-Summary.

- **Why ASR:** Sonst skaliert Re-Extract-Cost mit Conversation-Laenge
- **Impact:** ConversationMeta.lastExtractedMessageIndex + Summary-Persistierung, Single-Call-Prompt-Variante fuer Delta-Mode
- **Quality Attribute:** Performance, Cost

**MODERATE ASR #4:** Mention-Detection ist Schema-agnostisch und nutzt Source-Adapter-Registry (ADR-078).

- **Why ASR:** Vault-zentrische Mention-Detection schliesst file://, https://, cloud:// aus
- **Impact:** Generischer Parser-Step (synchron, nur Regex/URL-Detect) plus generische LLM-Output-Field `mentions: [{uri, label?, kind?}]`
- **Quality Attribute:** Extensibility

**MODERATE ASR #5:** Topic-Drift-Hook ist bidirektional zwischen FactExtractor und ContextComposer.

- **Why ASR:** Composer braucht Drift-Signal fuer Soft-Topic-Lock-Invalidierung, Extractor braucht Drift-Signal fuer Re-Extract-Trigger
- **Impact:** Cross-Component-Event-Bus oder shared State-Service
- **Quality Attribute:** Maintainability

### Constraints

- ExtractionQueue bleibt der Trigger-Pfad (BUG-016-Schutz erhalten)
- Memory-Modell muss Tool-Calling unterstuetzen (Anthropic, OpenAI, Gemini ja, Ollama unklar)

### Open Questions for Architect

- Fallback-Modell bei fehlendem Tool-Calling-Support: separater Free-Form-Pfad oder Hard-Requirement?
- Aging-Cron-Trigger: Plugin-Start oder via setInterval?
- Combined Note-Index: optional per Setting oder Default?
- Delta-Summary-Persistierung: dedizierte Spalte in conversation_threads oder als JSON-Metadata pro Conversation?
- File-Path-Heuristik im Synchron-Parser: aggressiv (alle abs Paths) oder konservativ (nur in Code-Blocks oder Backticks)?
- Topic-Drift-Schwelle 0.6: Spike-Daten oder pragmatische Default?
- Provisional-Edge-Cleanup-Strategie: TTL bei nie-confirmed (z.B. nach 7 Tagen ohne Single-Call-Upgrade)?

---

## Definition of Done

### Functional

- [ ] Single-Call-Extraction-Prompt mit Tool-Calling-Schema
- [ ] FactExtractor (ersetzt LongTermExtractor + SessionExtractor)
- [ ] FactIntegrator mit Lazy-Conflict-Resolution-Threshold
- [ ] AgingService mit Touch-Refresh + Use-Count-Boost
- [ ] AuditPruning (nur state-changing Operations)
- [ ] Combined Note-Index-Pass fuer Vault
- [ ] Eval-Test-Set mit 10+ Conversations (inklusive Mid-Session-Topic-Wechsel und Re-Extract-Cases)
- [ ] ExtractionQueue-Integration mit Bypass-Flag
- [ ] Inkrementelle Extraktion: Delta-Window-Logik im FactExtractor (lastExtractedMessageIndex)
- [ ] Conversation-So-Far-Summary persistiert pro Conversation
- [ ] Generische Mentions: `mentions: [{uri, label?, kind?}]` im Tool-Calling-Schema
- [ ] Synchroner Provisional-Edge-Pass (Wiki-Link-Parser + URL-Detect + File-Path-Heuristik)
- [ ] Edge-Type-Suffix `_provisional` bis Single-Call upgrades oder verwirft
- [ ] Topic-Drift-Hook (Cosine-Schwelle 0.6) zwischen FactExtractor und ContextComposer
- [ ] Bypass-Flag im ExtractionQueue-Item (ueberspringt 60s-Throttle)
- [ ] **Token-Cost-Cap pro Tag mit Auto-Disable** (C5-Beschluss 2026-04-26): Engine-interner Token-Counter (taeglich reset um Mitternacht). Settings-Schwelle (Default 1M Input + 200K Output Tokens/Tag, ca. $5-10/Tag bei Sonnet). Bei Schwellen-Ueberschreitung: Auto-Disable von Single-Call-Extraction fuer den Tag mit Notice 'Cost-Cap erreicht, Memory-Update pausiert'. isPermanentProviderError-Schutz bleibt zusaetzlich
- [ ] **Telemetrie-Logs** (C4-Beschluss 2026-04-26): Single-Call-Token-Verbrauch, Conflict-Resolution-Decisions (welcher Mode getriggered, mit confidence), Aging-Cycle-Statistiken nach `_devprocess/logs/memory-v2/{YYYY-MM-DD}.jsonl`
- [ ] **Edge-Konzept-Layer** (E1): Tool-Calling-Output traegt `relation: new|update|extend|derive` pro Fact-Candidate, FactIntegrator-Pfad reduziert auf 4 Klassen
- [ ] **Memory-Typ `kind`** (E2/E8): Tool-Calling-Output traegt `kind: fact|preference|identity|event` pro Fact-Candidate, Aging differenziert pro Kind (180/persistent/90/14 Tage Halbwertzeit)
- [ ] **Noise-Filter** (E3): Prompt-Anweisung gegen Smalltalk + Pre-Insert-Importance-Threshold < 0.2

### Quality

- [ ] Eval-Test-Suite gruen mit > 80% Output-Quality-Score
- [ ] Performance-Test: Single-Call < 30 Sekunden p95
- [ ] Conflict-Trigger-Rate-Test < 10%
- [ ] Aging-Idempotenz-Test
- [ ] Coverage > 85%

### Documentation

- [ ] FEATURE-0318 Status: Implemented
- [ ] ADR-076-Update mit konkretem Single-Call-Schema-Beispiel

---

## Dependencies

- **FEATURE-0317** (Dynamic Context Composition): braucht stabile Retrieval-Side bevor Update-Side gebaut wird
- **ExtractionQueue** (existierend): bleibt Trigger-Pfad

## Assumptions

- Tool-Calling-Support ist bei den default-konfigurierten Modellen vorhanden (Anthropic primaer)
- Eval-Test-Set kann mit anonymisierten realen Conversations gebaut werden

## Out of Scope

- LLM-driven Fact-Audit (manuelles Review)
- Explizite Recipe-Promotion-Updates (ADR-058 bleibt unangetastet)
- Multi-Modal-Facts (Images, Audio)
