---
id: ADR-98
title: Pre-Triage-Tool-Architektur (eigenes ingest_triage)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-12
  - ADR-66
---

# ADR-98: Pre-Triage-Tool-Architektur (eigenes ingest_triage-Tool)

## Context

Pre-Triage-Pass (FEAT-19-12) generiert in 10 Sekunden eine Triage-Karte fuer eine Source. Es kann entweder als eigenes Tool `ingest_triage` oder als Action-Erweiterung des bestehenden `ingest_document` realisiert werden. Das bestehende `ingest_document` ist auf Vollstaendige-Aufnahme ausgelegt (PDF/DOCX -> Note), nicht auf Schnell-Triage.

## Decision Drivers

- Trennung von Triage und Deep-Ingest (zwei verschiedene LLM-Calls)
- Wiederverwendbarkeit (Triage wird auch von Auto-Trigger ADR-102 aufgerufen)
- Tool-Description-Klarheit (LLM muss wissen wann triage vs ingest)
- Bestehende ingest_document-API nicht aufblaehen

## Considered Options

### Option A: Eigenes Tool `ingest_triage`

Pros:
- Klare Tool-Description: "Schnell-Triage in 10s, ja/nein/spaeter".
- Wiederverwendbar von Auto-Trigger und Inbox-Workflow.
- ingest_document bleibt fokussiert auf Deep-Ingest.

Cons:
- Ein zusaetzliches Tool im Registry.
- Pflege-Aufwand fuer zwei Tools statt eines.

### Option B: Action-Erweiterung von ingest_document mit `action='triage'`

Pros:
- Ein Tool, eine Registry-Stelle.

Cons:
- Tool-Description wird unscharf ("dieses Tool macht entweder Triage oder Deep-Ingest").
- LLM-Routing-Fehler wahrscheinlicher.
- Vermischt zwei Use-Cases mit verschiedenen Token-Kosten.

### Option C: Beide Tools, Triage rufts ingest_document optional auf

Pros:
- Triage und Deep-Ingest klar getrennt.
- Workflow-Verkettung Triage -> ingest_document explizit.

Cons:
- Workflow-Logik im Tool kompliziert (Triage entscheidet ob ingest_document aufgerufen wird).
- Konsistenz mit User-Approval-Schritt schwierig.

## Decision

**Option A**: Eigenes Tool `ingest_triage`. Wenn User in Triage-Karte "Ingest" waehlt, wird **separat** der Deep-Ingest-Modus (Modus A oder B, ADR-101) aufgerufen, nicht intern verkettet.

Begruendung:
- Tool-Trennung folgt Single-Responsibility-Prinzip.
- BA-25 H-07 verlangt < 0.05 USD pro Triage. Separate Tool-Definition macht Token-Tracking trivial.
- Auto-Trigger (ADR-102) ruft ingest_triage direkt, ohne Deep-Ingest-Pfad zu kennen.
- Konsistent mit existierendem Tool-Pattern (jedes Tool hat eine fokussierte Description).

## Consequences

### Positive
- Klare Trennung Triage vs Deep-Ingest.
- Token-Kosten pro Tool isoliert messbar.
- Wiederverwendbar von Auto-Trigger und Inbox-Workflow.

### Negative
- Zwei Tools statt einem.
- LLM braucht zwei Tool-Calls fuer komplette Ingest-Sequenz (Triage + Deep-Ingest), das ist aber inhaltlich korrekt.

### Risks
- Wenn User von Triage zu Deep-Ingest will, muss UI klar machen welche Decision-Action welchen Tool-Call ausloest.

## Implementation Notes

Tool-Definition `ingest_triage`:
- Input: `source_uri` (URL, vault-Path, attachment-Index), optional `cluster_hint`
- Output: TriageCard mit `relevance_score`, `cluster_match[]`, `relationship` (deckt-sich/ergaenzt/widerspricht/orthogonal), `source_diversity_hint`
- Read-Only auf Vault, Write auf neue Tabelle `ingest_triage_log` (id, source_uri, triaged_at, decision, decision_reason).

Wiring:
- Manueller Trigger via Tool-Call von Agent.
- Auto-Trigger via VaultObserver (ADR-102) ruft Tool intern.
- Inbox-Workflow (FEAT-19-15) ruft Tool pro Note in Inbox.
