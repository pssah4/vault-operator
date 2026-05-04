---
id: FEAT-03-22
title: Privacy und Forget-Right (Selective Deletion + Drei-States)
epic: EPIC-03-context-memory-scaling
priority: P0
effort: M
depends-on: [FEAT-03-15, FEAT-03-19]
related:
  - PLAN-01-memory-v2-master.md
  - BA-UNIFIED-CHAT-MEMORY-V2.md
---

# Feature: Privacy und Forget-Right

> **Feature ID:** FEAT-03-22
> **Epic:** [EPIC-03 Context, Memory & Scaling](../epics/EPIC-03-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Privacy-Querschnitt (entstanden aus A1+A2 Diskussion 2026-04-26)
> **Priority:** P0-Critical (DSGVO-Reflex, User-Souveraenitaet, UCM-Public-Vorbereitung)
> **Effort:** M (1 Wo)

## Feature Description

Selective Deletion auf vier Granularitaets-Ebenen plus Memory-Eligible-Konzept fuer Conversation-Level-Opt-In. Forget-Right wird ueber Agent-Tools (nicht eigene UI) bedient: User fragt Agent nach Facts und kann sie via Tool-Call loeschen. Das ist konsistent mit FEAT-03-19 (Agent ist das Memory-Interface).

**Conversation-Memory-Modell:**

- **Default `searchable`:** Conversation in history.db indiziert (search_history findet sie), aber kein Fact-Extraction.
- **`memory-eligible`:** zusaetzlich Single-Call-Extraction triggers. Trigger via Star-Button (Obsilo) oder `mark_conversation_for_memory`-Tool. Opt-In aus Cost+Quality-Gruenden, nicht primaer Privacy.

Privacy-Schutz auf Conversation-Ebene ergibt sich aus der **Nutzungsentscheidung selbst:** Wer UCM nutzt, akzeptiert die Datenspeicherung. Wer Privacy will, nutzt UCM nicht. Loesch-Moeglichkeit ist DAS Privacy-Werkzeug, kein dediziertes `private`-Marker noetig (im Local-First-Modell). Fuer eine eventuelle Cloud-Service-Variante (UCM v2) wird das Privacy-Modell separat designed -- BA-Out-of-Scope.

**Soft-Delete + Cascade auf vier Ebenen:**

1. **Einzelner Fact:** `delete_fact(id)`-Tool. Fact bekommt `deleted_at`-Timestamp + Cascade in `fact_edges` (alle Edges mit diesem Fact als Endpoint werden mit-deleted).
2. **Alle Facts zu einer Entity-URI:** `delete_facts_by_entity('entity:UniCredit')` -- alle Facts mit `mentions_entity`-Edge zu der URI.
3. **Ganze Conversation:** `delete_conversation(threadId)` -- entfernt Conversation aus history.db, Cascade-deletet abgeleitete Facts (alle mit `source_thread_id=threadId`).
4. **Alle Bezuege auf eine Vault-Note:** `delete_facts_by_vault_ref('vault://Notes/X.md')` -- alle Facts mit `mentions_vault_note`-Edge zur URI.

**Hard-Delete-Job + Backup-Sweep:** Periodischer Job (taeglich oder Plugin-Start) loescht Facts/Conversations mit `deleted_at < now() - 30 days` permanent (Hard-Delete). Plus Backup-Sweep: alle `.bak`-Files werden auf geloeschte IDs durchsucht und bereinigt. Damit ist DSGVO-Compliance auch ueber Backups eingehalten.

**Audit-Log fuer Deletions:** `memory_audit` traegt `operation='deprecate'` plus reason und initiator (User-direct, Tool-triggered, Auto-Aging). Damit ist Forget-Right nachvollziehbar (zeigt wann/warum, aber Inhalt selbst ist weg).

**Undo-Toast (Window):** Nach Soft-Delete erscheint Toast 'Fact geloescht (Undo in 30 Tagen via recall_memory mit includeDeprecated=true)'. Hard-Delete-Job nach 30 Tagen ist Punkt-of-No-Return.

## Benefits Hypothesis

**We believe that** selective Deletion auf vier Granularitaets-Ebenen plus Hard-Delete-Job DSGVO-Compliance gewaehrleistet und User-Vertrauen herstellt, ohne UX-Last (Agent-Tool-driven statt UI-driven).

**Delivers the following measurable outcomes:**

- DSGVO-Compliance-Coverage: 100% (Fact / Entity / Conversation / Vault-Ref deletable)
- Undo-Window: 30 Tage zwischen Soft-Delete und Hard-Delete
- Forget-Right-UX-Friction: 0 (User sagt Agent 'loesch das', kein Wechsel zu separater UI)

**We know we are successful when:**

- Sebastian kann via Agent-Conversation einen Fact loeschen, der danach in recall_memory(includeDeprecated=false) nicht mehr erscheint
- Cascade-Test: Loeschen einer Vault-Note-URI loescht alle abgeleiteten Facts
- Hard-Delete-Job laeuft taeglich, leert .bak-Files von alten Eintraegen
- Audit-Log dokumentiert jeden Delete

## User Stories

### Story 1: Einzelnen Fact vergessen lassen (Functional Job)

**As a** Sebastian
**I want to** dem Agent sagen 'vergiss, dass ich Java mag'
**so that** der Fact in zukuenftigen Conversations nicht mehr erscheint

### Story 2: Alle Facts zu einer Person/Firma loeschen (Functional Job)

**As a** Sebastian (Stelle gewechselt)
**I want to** dem Agent sagen 'vergiss alles ueber UniCredit'
**so that** der alte Arbeitgeber nicht mehr in Memory erscheint, ohne dass ich jeden Fact einzeln finden muss

### Story 3: DSGVO-Compliance fuer Backups (Functional Job)

**As a** Sebastian (oder spaeter UCM-User)
**I want to** dass geloeschte Daten auch aus Backups verschwinden
**so that** Forget-Right nicht durch persistierende Backup-Files unterlaufen wird

### Story 4: Versehentliches Loeschen rueckgaengig machen (Emotional Job)

**As a** Sebastian
**I want to** ein versehentlich geloeschten Fact innerhalb 30 Tage wiederherstellen koennen
**so that** Loesch-Aktion keine Angst-besetzte Operation ist

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Vier Deletion-Granularitaets-Ebenen funktionieren | 100% Coverage in Test-Suite | Test-Suite |
| SC-02 | Cascade in fact_edges fuer alle vier Ebenen | keine orphan Edges | DB-Query nach Delete |
| SC-03 | Hard-Delete-Job laeuft idempotent | doppelter Run am selben Tag tut nichts Zusaetzliches | Test |
| SC-04 | Backup-Sweep entfernt deletete IDs aus .bak-Files | Test mit gefaketem .bak-File | Test |
| SC-05 | Undo-Window 30 Tage funktioniert | Soft-deletete Facts erscheinen in recall_memory(includeDeprecated=true) | Test |
| SC-06 | Audit-Log dokumentiert jeden Delete | Audit-Eintrag mit reason, initiator, timestamp | Test |
| SC-07 | Agent-Tool-Pfad funktioniert | User-Conversation 'vergiss X' loescht via update/delete_fact-Tool | UAT |

---

## Technical NFRs

### Performance

- **Soft-Delete pro Fact:** < 50ms inkl. Cascade
- **Bulk-Delete (Entity-URI):** < 500ms fuer 100 Facts
- **Hard-Delete-Job (10k Facts):** < 5s, single Transaction
- **Backup-Sweep:** < 30s pro 100MB .bak-File

### Security

- **Audit-Trail:** alle Deletes geloggt mit reason, initiator, timestamp
- **Hard-Delete-Punkt-of-No-Return:** klar in Audit-Log markiert
- **Backup-Sweep-Konsistenz:** sweep-Algorithmus traegt Schema-Version, vermeidet falsche Sweeps bei DB-Format-Wechsel

### Scalability

- **Cascade-Linear:** O(N) ueber fact_edges, transactional
- **Backup-Retention:** 7 Tage `.bak`, 30 Tage Soft-Delete-Window

### Availability

- **Hard-Delete-Idempotent:** doppelter Run im selben Tag tut nichts
- **Engine-Public-API:** `softDelete`, `hardDelete`, `restoreSoftDeleted`, `runDeletionSweep`

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1:** Soft-Delete + Cascade muss alle drei Engine-DBs (memory, history, ggf. ucm-sidecar) und ggf. knowledge.db (via MCP-Tool) treffen.

- **Why ASR:** Cascade-Konsistenz ueber Adapter-Grenzen hinweg ist DSGVO-relevant
- **Impact:** Multi-DB-Transaction-Pattern, Engine-API muss Cascade-Verfahren ueber Adapter-Pattern abstrahieren
- **Quality Attribute:** Functional Correctness, Compliance

**MODERATE ASR #2:** Backup-Sweep ist eigenstaendiger Job, nicht inline mit Hard-Delete.

- **Why ASR:** .bak-Files koennen gross werden, Sweep darf User nicht blocken
- **Impact:** Background-Worker oder Plugin-Startup-Job
- **Quality Attribute:** Performance, Availability

### Constraints

- Engine-Public-API: `softDelete`, `hardDelete`, `restoreSoftDeleted`, `runDeletionSweep` muessen exportiert werden (FEAT-03-21)
- Audit-Log darf nicht inflationaer werden (FEAT-03-18 Audit-Pruning gilt: nur state-changing Operations geloggt)

### Open Questions for Architect

- Cascade ueber `mentions_vault_note`: was, wenn die Vault-Note geloescht wird (FEAT-03-14 Cascade)? Werden abgeleitete Facts auch geloescht oder bleiben sie als Reference-Tokens?
- Hard-Delete-Trigger: Plugin-Start, taeglicher Cron via setInterval, oder beim Plugin-Quit?
- Backup-Sweep-Granularitaet: Sweep alle .bak-Files (slow) oder nur die juengsten N (fast, nicht 100% DSGVO)?

---

## Definition of Done

### Functional

- [ ] Soft-Delete-Spalte (`deleted_at`) in facts, fact_edges, conversation_threads, communication_styles
- [ ] Cascade-Logic ueber fact_edges
- [ ] Vier Delete-Granularitaets-Ebenen (Fact / Entity / Conversation / Vault-Ref)
- [ ] Engine-Public-API: `softDelete`, `hardDelete`, `restoreSoftDeleted`, `runDeletionSweep`
- [ ] Agent-Tool-Erweiterungen: `delete_fact`, `delete_facts_by_entity`, `delete_conversation`, `delete_facts_by_vault_ref`, `restore_fact`
- [ ] Hard-Delete-Job nach 30 Tagen Soft-Delete-Window (taeglich oder Plugin-Start)
- [ ] Backup-Sweep-Algorithmus fuer .bak-Files
- [ ] Audit-Log-Eintraege mit reason, initiator, timestamp
- [ ] Undo-Toast in Obsilo-UI nach Soft-Delete

### Quality

- [ ] Cascade-Test fuer alle vier Granularitaets-Ebenen
- [ ] Hard-Delete-Job-Idempotenz-Test
- [ ] Backup-Sweep-Test mit gefakeden .bak-Files
- [ ] DSGVO-Compliance-Audit (keine Daten persistieren in DB oder .bak nach Hard-Delete)
- [ ] Coverage > 90% fuer Delete-Pfad

### Documentation

- [ ] FEAT-03-22 Status: Implemented
- [ ] User-Doku: 'Forget-Right via Agent erklaert', mit Beispielen
- [ ] Audit-Log-Schema dokumentiert

---

## Dependencies

- **FEAT-03-15** (Engine-Foundation): facts, fact_edges, audit muessen existieren
- **FEAT-03-19** (Living Document UX): Agent-Interface-Konzept etabliert

## Assumptions

- Sebastian akzeptiert 30-Tage-Soft-Delete-Window als Default
- DSGVO-Compliance ist heute fuer Solo-User-Setup nicht primary, wird aber Voraussetzung wenn UCM oeffentlich

## Out of Scope

- Cloud-Service-Variante (UCM v2 mit Cloud-DBs) -- separate BA, anderes Privacy-Modell
- Crypto-Erase (DBs verschluesselt, Schluessel-Vernichtung als Loesch-Verfahren) -- spaeter wenn at-rest-Encryption kommt
- Per-User-Granularitaet (Multi-User) -- Single-User-MVP
