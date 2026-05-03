---
id: ADR-97
title: KV-Cache-Block-Lifecycle (Top-Hub)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-03-26
  - ADR-62
---

# ADR-97: KV-Cache-Block-Lifecycle fuer Top-Hub-Block

## Context

Selektiver Top-Hub-Block (FEAT-03-26) wird optional in den stabilen System-Prompt-Prefix gehaengt. KV-Cache-Hit-Rate haengt davon ab, wie oft der Block regeneriert wird. Zu haeufige Regenerierung killt den Cache-Vorteil. Zu seltene Regenerierung macht den Block stale. ADR-62 (KV-Cache-Optimized Prompt Structure) verlangt stabilen Prefix.

## Decision Drivers

- KV-Cache-Hit-Rate (Token-Kosten)
- Aktualitaet der Hub-Liste
- Vorhersagbarkeit fuer User
- Implementierungs-Komplexitaet

## Considered Options

### Option A: Regeneration nur bei Hub-Membership-Aenderung, max 1x pro Tag

Pros:
- Cache-stabil ueber den Tag.
- Reagiert auf strukturelle Aenderungen.

Cons:
- Wenn User mehrere Notes pro Tag aendert, kann erstes Conversational-Turn cold sein.

### Option B: Regeneration nur bei Plugin-Onload

Pros:
- Maximale Cache-Stabilitaet pro Session.
- Trivial implementierbar.

Cons:
- Block bleibt stale solange Obsidian offen ist (Tage moeglich).

### Option C: Regeneration bei jeder neuen Conversation

Pros:
- Immer aktuell.

Cons:
- Kein Cross-Conversation-Cache-Vorteil.
- Token-Kosten nicht netto positiv.

## Decision

**Option A**: Regeneration nur bei Hub-Membership-Aenderung ODER Hub-Note-Re-Summarization, mit hartem Cooldown von 24 Stunden.

Trigger-Logik:
- Beim Indexing-Lauf: nach OntologyStore-Update wird Hub-Liste neu berechnet (Top-30 nach incoming-edges-count).
- Wenn neue Top-30-Liste != alte Top-30-Liste UND `lastBlockGeneratedAt + 24h < now`: regenerate.
- Wenn eine Note in Top-30 re-summarized wurde UND `lastBlockGeneratedAt + 24h < now`: regenerate.
- Sonst: kein Regenerate.

Position im Prompt: vor DateTime-Block, nach Soul-Block (siehe ADR-62 KV-Cache-Layout).

Begruendung:
- Cache-Hit-Rate Ziel > 95% (BA-25 SC-01 fuer FEAT-03-26).
- 24-Stunden-Cooldown ist Sebastians realer Vault-Frequenz angemessen (5-10 Note-Updates pro Tag, davon < 1 in Top-30).
- Hub-Membership-Change-Detection deterministisch via DB-Query.

## Consequences

### Positive
- Cache-Hit-Rate hoch.
- Block reagiert auf strukturelle Vault-Aenderungen (neue Hub-Notes).
- Token-Mehrkosten kontrollierbar.

### Negative
- In den ersten 24 Stunden nach Hub-Aenderung sieht der Agent die neue Struktur erst im naechsten Cooldown-Window.

### Risks
- Falls Telemetrie nach 4 Wochen zeigt dass tokens_added > search_vault_calls_avoided: Setting sollte deaktiviert werden. ADR aktualisieren ggf zu Default off-Empfehlung.

## Implementation Notes

Persistenz: `cluster_metadata.last_external_check`-Pattern wiederverwenden, oder neue Settings-Property `vaultIngest.topHubBlock.lastGeneratedAt` plus `lastHubsHash` (SHA der Hub-Liste fuer Change-Detection). Generator-Funktion: `generateTopHubBlock()` lest Top-30 aus OntologyStore + note_summaries, rendert Markdown-Block ~3k Token.
