---
id: FEAT-03-25
title: Vault-Note-zu-Fact-Extraction (Documents-Pipeline)
epic: EPIC-03-context-memory-scaling
priority: P1
effort: M
depends-on: [FEAT-03-14, FEAT-03-15, FEAT-03-17, FEAT-03-18, FEAT-03-22]
adr-refs: [ADR-109]
related:
  - PLAN-01-memory-v2-master.md
  - BA-UNIFIED-CHAT-MEMORY-V2.md (Section 5.1.1, Differenzierung Supermemory)
---

# Feature: Vault-Note-zu-Fact-Extraction

> **Feature ID:** FEAT-03-25
> **Epic:** [EPIC-03 Context, Memory & Scaling](../epics/EPIC-03-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Vault-Source-Pipeline (entstanden aus Supermemory-Differenzierungs-Diskussion 2026-04-26, E10-Empfehlung)
> **Priority:** P1-High (Differenzierung Obsidian-Vault-Bridge, einzigartig im Markt)
> **Effort:** M (1.5 Wo)

## Feature Description

Erweitert Memory v2 um Vault-Notes als zweite Fact-Quelle neben Conversations. Supermemory hat das Konzept "Documents -> Memories": Documents (raw input) werden via Pipeline zu Memories (semantic chunks). UCM wird das auf Obsidian-Vault-Notes uebertragen -- der einzigartige Selling-Point von UCM ist die bidirektionale Vault-Bridge.

**Konzept:**

User markiert eine Vault-Note explizit als "memory-source" (analog zum Conversation-Star, aber fuer Dateien). Single-Call-Extraktor (FEAT-03-18) liest die Note und produziert Facts mit `source_interface='vault-note'` und `source_uri='vault://Notes/X.md'`. Diese Facts fliessen in alle Memory-v2-Mechanismen ein: Hybrid-Retrieval, Topic-Centroids, fact_edges, ContextComposer.

**Beispiel:**

Note `Notes/Projekt-Plan-EnBW.md`:
```
- Phase 1 startet Q2-2026, Stakeholder ist Sven Meier
- Budget Q2: 200k EUR
- Tech-Stack: TypeScript, Anthropic API
```

Nach Markierung produziert der Extraktor:
- `fact:421 "Phase 1 EnBW-Projekt startet Q2-2026" (kind=event)`
- `fact:422 "Sven Meier ist Stakeholder im EnBW-Projekt" (kind=fact, mentions_entity:Sven Meier + entity:EnBW)`
- `fact:423 "EnBW Q2-Budget ist 200k EUR" (kind=event)`
- `fact:424 "EnBW-Projekt nutzt TypeScript + Anthropic API" (kind=fact)`

Alle mit `source_interface='vault-note'`, `source_uri='vault://Notes/Projekt-Plan-EnBW.md'`. Bei jedem Conversation-Start mit Topic 'projects' sind sie im Memory-Block.

**Dirty-Tracking + Re-Extract:**

`vault.on('modify')`-Hook erkennt Note-Aenderung an memory-source-Notes. Setzt `dirty=true`-Flag in einer `memory_source_notes`-Tabelle. Beim naechsten Aging-Cycle (oder explizit per User-Trigger) werden die abgeleiteten Facts via `update`-Edge superseded und neue Facts werden eingefuegt. Inkrementell, nicht voll-Re-Extract -- nur veraenderte Sektionen werden neu durchgereicht.

**Cascade bei Note-Loeschen:**

`vault.on('delete')`-Hook setzt alle Facts mit `source_uri='vault://...'` auf `deleted_at` (FEAT-03-22 Soft-Delete). User-Notice: "Note geloescht, X abgeleitete Facts wurden entfernt. Undo in 30 Tagen ueber recall_memory(includeDeprecated=true)."

**Dirty-Limit gegen Bedienfehler:**

Settings-Schwelle `vaultMemorySource.maxNotes` (Default 100, max 500). Damit User nicht versehentlich seinen ganzen Vault als memory-source markiert (waere 2000+ Notes -> 10-30k Facts in einem Schwung -> Topic-Centroids unscharf, Retrieval-Quality leidet). Bei Schwellen-Ueberschreitung: Modal-Hinweis mit Empfehlung "Markiere nur Notes mit dauerhaft relevantem Wissen".

**Beziehung zu knowledge.db:**

Vault-Notes sind weiterhin auch in knowledge.db.vectors embedded (FEAT-03-01). Memory-Source-Markierung ergaenzt das, ersetzt es nicht. knowledge.db ist Volltext+Embedding fuer semantic_search. memory.db.facts (mit `source_interface='vault-note'`) sind atomare Statements fuer Memory-Composition. Beide Quellen koexistieren ohne Konflikt -- ueber `mentions_vault_note`-Edges sind sie verbunden.

**Trigger-UX (Agent-Konsistent):**

Konsistent mit FEAT-03-19 (Agent-als-Interface): User markiert Note ueber Agent-Conversation ("speichere die Note Notes/Projekt-Plan-EnBW.md ins Memory") oder Frontmatter-Marker (`memory-source: true`) oder Settings-Liste (Memory-Source-Notes-Verwaltung). Drei Trigger-Pfade fuer Flexibilitaet.

## Benefits Hypothesis

**We believe that** Vault-Notes als Fact-Quelle UCM zur einzigartigen Memory-Engine im Markt machen, weil keine andere Loesung (Mem0, Zep, Letta, Supermemory, Memoir) eine bidirektionale Obsidian-Bridge hat.

**Delivers the following measurable outcomes:**

- Vault-Knowledge-zu-Memory-Coverage: User markiert avg 30-100 Notes als memory-source, davon entstehen 200-1000 Facts
- Conversation-Start-Token-Reduktion: Wissen aus Notes ist schon im Memory, kein semantic_search-Tool-Call noetig in haeufigen Faellen -> -30% Tool-Call-Latenz
- Differenzierungs-Story: einzigartiger Selling-Point gegen Supermemory/Mem0/Zep

**We know we are successful when:**

- Sebastian markiert seine ~50 wichtigsten Vault-Notes als memory-source
- Bei Conversation-Start zu Topic 'projects' sind die abgeleiteten Facts im Memory-Block ohne Tool-Call
- Note-Aenderung triggert Re-Extract innerhalb 60s (oder bei naechstem Aging-Cycle)
- Note-Loeschen cascadiert sauber

## User Stories

### Story 1: Wichtige Vault-Note als permanente Wissens-Quelle (Functional Job)

**As a** Sebastian
**I want to** eine Vault-Note explizit als memory-source markieren
**so that** der Agent das darin enthaltene Wissen ohne expliziten Tool-Call kennt

### Story 2: Note-Aenderung fuehrt zu Memory-Update (Functional Job)

**As a** Sebastian (Note editiert)
**I want to** dass Note-Inhalts-Aenderungen automatisch ins Memory propagieren
**so that** Memory nie stale ist

### Story 3: Note-Loeschen ohne orphan Facts (Functional Job)

**As a** Sebastian
**I want to** dass Loeschen einer Note auch deren abgeleitete Facts entfernt
**so that** kein Inkonsistenz-State entsteht

### Story 4: Schutz vor Bedienfehler (Emotional Job)

**As a** Sebastian (eventueller Eifer-Klicker)
**I want to** dass das System mich bremst, wenn ich zu viele Notes markiere
**so that** ich nicht versehentlich mein Memory unbrauchbar mache

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | User kann Note ueber drei Pfade als memory-source markieren | Agent-Conversation, Frontmatter-Marker, Settings-Liste | UAT |
| SC-02 | Single-Call-Extraktor produziert sinnvolle Facts aus Note | Eval-Test-Set 10 echte Notes mit erwarteten Facts | LLM-as-Judge + manuelle Validation |
| SC-03 | Note-Aenderung triggert Re-Extract | Innerhalb 60s nach Save | Test |
| SC-04 | Note-Loeschen cascadiert Facts | Alle Facts mit source_uri werden soft-deleted | Test |
| SC-05 | Dirty-Limit greift bei Bedienfehler | Modal bei > 100 markierten Notes, hard-stop bei > 500 | UAT |
| SC-06 | Source-URI-Spalte ist suchbar | Query 'alle Facts aus Note X' funktioniert | Test |

---

## Technical NFRs

### Performance

- **Single-Call-Extraktion pro Note:** < 30s p95 (gleicher Single-Call-Path wie Conversations)
- **Dirty-Re-Extract-Trigger:** debounced 5s nach letzter Note-Aenderung (vermeidet Flickern bei aktivem Editieren)
- **Cascade bei Note-Loeschen:** < 200ms fuer 50 abgeleitete Facts

### Security

- **Dirty-Tracking ist persistent:** ueberlebt Plugin-Restart in `memory_source_notes`-Tabelle
- **Cascade-Cleanup ist transactional:** entweder alle Facts soft-deleted oder keiner

### Scalability

- **Linear bis 500 memory-source-Notes** (Sebastian-Skalierung)
- **Re-Extract-Queue respektiert ExtractionQueue-Throttle + Cost-Cap** (FEAT-03-18)

### Availability

- **Crash-Resilienz:** Dirty-Flag persistiert, Re-Extract holt Aenderung beim naechsten Plugin-Start nach

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1:** Neue Tabelle `memory_source_notes` in memory.db.

- **Why ASR:** Dirty-Tracking braucht persistente State pro Note (path, last_extracted_at, dirty, fact_count)
- **Impact:** Schema-Erweiterung in FEAT-03-15
- **Quality Attribute:** Maintainability

**MODERATE ASR #2:** Vault-Watch-Pipeline-Reuse statt eigenem vault.on-Listener (Spec-Update 2026-05-03, ADR-109).

- **Why ASR:** BA-25 hat einen `FrontmatterIndexer` mit vault.on(modify/create/rename/delete)-Listener fuer alle Markdown-Notes. Ein zweiter Listener wuerde doppelte LLM-Calls und Notice-Spam riskieren. Dirty-Tracking integriert sich in `note_freshness` (knowledge.db) statt in eine getrennte Tabelle.
- **Impact:** Erweiterung des bestehenden FrontmatterIndexer um Erkennung des `memory-source`-Frontmatter-Properties + Brueckentabelle `memory_source_notes` haelt nur (note-path -> source_session_id), nicht den vollen State.
- **Quality Attribute:** Maintainability + Resource-Efficiency
- **Architectural Decision:** ADR-109 "Vault-zu-Memory-Bruecke via Single-Listener-Pattern"

**MODERATE ASR #3:** Frontmatter-Marker `memory-source: true` als alternativer Trigger.

- **Why ASR:** User koennen Notes deklarativ markieren, ohne durch UI zu gehen
- **Impact:** Frontmatter-Reader bei Vault-Index, Sync mit `memory_source_notes`-Tabelle
- **Quality Attribute:** Discoverability

### Constraints

- Re-Extract nutzt denselben Single-Call-Pfad wie Conversations -> konsistente Token-Cost-Cap (FEAT-03-18 C5)
- Cascade respektiert FEAT-03-22 Soft-Delete + 30-Tage-Window

### Open Questions for Architect

- Frontmatter-Marker-Sync: bei Konflikt zwischen Frontmatter und Settings-Liste -- welcher gewinnt?
- Inkrementelle Re-Extraktion: nur veraenderte Sektion oder ganze Note? Diff-Detection-Logic.
- Vault-Note mit grossen Inhalten (z.B. 50k Chars): Chunking vor Extraktion oder Single-Call mit grossem Window?

---

## Definition of Done

### Functional

- [ ] `memory_source_notes`-Tabelle in memory.db (path, last_extracted_at, dirty, fact_count, marker_source)
- [ ] Drei Trigger-Pfade: Agent-Conversation-Tool, Frontmatter-Marker, Settings-Liste
- [ ] Settings-Liste-UI: Memory-Source-Notes-Verwaltung
- [ ] Frontmatter-Reader (`memory-source: true`)
- [ ] Single-Call-Extraktor erweitert um Vault-Note-Source
- [ ] vault.on('modify') Hook -> dirty=true + debounced Re-Extract-Trigger
- [ ] vault.on('delete') Hook -> Cascade Soft-Delete der abgeleiteten Facts
- [ ] vault.on('rename') Hook -> source_uri-Update (FEAT-03-14 Cascade-Pattern, hier auch fuer Facts)
- [ ] Dirty-Limit (Settings `vaultMemorySource.maxNotes` Default 100, max 500)
- [ ] User-Notice bei Loeschung mit Cascade-Statistik
- [ ] Agent-Tool: `mark_note_as_memory_source(notePath)`, `unmark_note(notePath)`, `list_memory_source_notes()`
- [ ] Eval-Test-Set: 10 echte Notes mit erwarteten Facts

### Quality

- [ ] Eval-Test-Set gruen mit > 80% Output-Quality-Score (LLM-as-Judge)
- [ ] Dirty-Tracking-Test (Note edit, save, dirty flag, re-extract)
- [ ] Cascade-Test (Note delete, alle abgeleiteten Facts soft-deleted)
- [ ] Limit-Test (101. Markierung triggert Modal)
- [ ] Coverage > 85%

### Documentation

- [ ] FEAT-03-25 Status: Implemented
- [ ] User-Doku: 'Vault-Notes als Memory-Source erklaert'
- [ ] Onboarding-Hint (FEAT-03-23) erweitert: 'Markiere Notes als memory-source nur fuer dauerhaft relevantes Wissen, nicht fuer Tagebuch-Eintraege'

---

## Dependencies

- **FEAT-03-15** (Engine-Foundation): facts, fact_edges, source_uri-Spalte
- **FEAT-03-18** (Single-Call Update Pipeline): Extraktion-Logik wird wiederverwendet
- **FEAT-03-17** (Dynamic Context Composition): Facts aus Notes fliessen in ContextComposer
- **FEAT-03-22** (Privacy & Forget-Right): Cascade nutzt Soft-Delete
- **FEAT-03-14** (Knowledge-DB-Haertung): vault.on('rename') ist heute schon Vault-Pflicht-Hook

## Assumptions

- Sebastians Vault hat ~500-2000 Notes, davon werden 30-100 als memory-source markiert
- Notes-Inhalt ist in der Regel < 10k Chars (Single-Call-fitting)
- Re-Extract bei Note-Aenderung wird seltener triggers als initial-Markierung

## Out of Scope

- Auto-Detection-Heuristik welche Notes als memory-source taugen (User-Wahl)
- Image / PDF / DOCX als memory-source (nur .md initial)
- **Eigener vault.on-Listener** -- siehe ADR-109. Wir reuse den BA-25 FrontmatterIndexer.
- **Eigener VaultMemorySourceService als Top-Level-Klasse** -- die Logik lebt als Komponente im FrontmatterIndexer (Bridge-Pattern). Dadurch existiert nur ein Vault-Watch-Pfad mit drei Sinks (knowledge.db Ontology, memory.db Facts, BA-25 MOC-Pflege).
- Cross-Note-Inferenz (mehrere Notes zusammenfuegen zu uebergreifenden Facts) -- separate Phase
- Vault-Folder als bulk-memory-source -- klare Single-Note-Granularitaet im MVP
