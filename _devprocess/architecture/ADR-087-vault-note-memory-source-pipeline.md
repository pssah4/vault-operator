---
id: ADR-087
title: Vault-Note-Memory-Source-Pipeline (Documents-zu-Memories)
status: Accepted
phase: Building
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - FEATURE-0325-vault-note-fact-extraction.md
  - ADR-077-memory-v2-storage-schema.md
  - ADR-078-uri-versioning-schema.md
  - ADR-085-soft-delete-cascade.md
triggers:
  - ASR-060 (Vault-Note-zu-Fact-Extraction, einzigartiger Selling-Point)
---

# ADR-087 -- Vault-Note-Memory-Source-Pipeline

## Status

Proposed.

## Context

E10-Empfehlung (FEATURE-0325, Supermemory-Differenzierung) verlangt, dass Vault-Notes als Fact-Quelle dienen koennen, analog zu Supermemorys "Documents -> Memories"-Pipeline. Plus: dies ist UCMs einzigartiger Selling-Point gegen Mem0/Zep/Letta/Supermemory -- eine bidirektionale Obsidian-Bridge.

Triggernde ASR: ASR-060 (Vault-Note-Source-Pipeline).

Konflikt: Vault-Notes sind heute schon im KnowledgeIndexService eingebettet (FEATURE-0301). Memory-v2-Pipeline muss dazu komplementaer sein, nicht konkurrierend.

## Decision Drivers

- **DD-1 Differenzierung:** UCM ist einzige Memory-Engine im Markt mit bidirektionaler Vault-Bridge
- **DD-2 Dirty-Tracking-Konsistenz:** Bei Note-Aenderung muessen abgeleitete Facts re-extracted werden
- **DD-3 Cascade-Sicherheit:** Bei Note-Loeschen muessen abgeleitete Facts nicht orphan werden
- **DD-4 Bedienfehler-Schutz:** User soll nicht versehentlich seinen ganzen Vault als memory-source markieren

## Considered Options

### Option 1: Vault-Note-Inhalt automatisch in alle Conversations injizieren (verworfen)

knowledge.db-Embeddings reichen, kein Memory-Source-Pipeline.

- + Pro: Keine Implementation-Aufwand
- - Con: Bricht DD-1, kein Memory-Konzept fuer Vault-Inhalte
- - Con: User kann nicht steuern was in Memory landet

### Option 2: Marked-Notes als Fact-Source mit dirty-tracking + cascade (Empfohlen)

User markiert Notes explizit. Single-Call-Extraktor extrahiert Facts mit `source_uri='vault://...'`. Vault-Hooks triggern Re-Extract bei Aenderung, Cascade bei Loeschung.

- + Pro: DD-1, DD-2, DD-3 erfuellt
- + Pro: Konsistent mit Memory-eligibility-Modell (User-Trigger)
- - Con: Drei Trigger-Pfade (Agent-Tool, Frontmatter, Settings) noetig fuer Flexibilitaet
- - Con: Dirty-Tracking-State persistent zu halten

### Option 3: Auto-Detection welche Notes als memory-source taugen (verworfen fuer MVP)

LLM klassifiziert Notes nach "memory-wuerdig".

- + Pro: keine User-Interaktion noetig
- - Con: zu viel Auto-Magie, User verliert Kontrolle
- - Con: Erkennung von "memory-wuerdig" ist ambig

## Decision

**Option 2 -- Marked-Notes als Fact-Source mit dirty-tracking + cascade.**

**Schema (siehe ADR-077 Erweiterung):**

```sql
CREATE TABLE memory_source_notes (
    note_path TEXT PRIMARY KEY,
    last_extracted_at TIMESTAMP,
    dirty INTEGER NOT NULL DEFAULT 0,
    fact_count INTEGER NOT NULL DEFAULT 0,
    marker_source TEXT NOT NULL,  -- 'agent-tool' | 'frontmatter' | 'settings-list'
    created_at TIMESTAMP NOT NULL,
    CHECK (dirty IN (0, 1))
);
```

Plus `facts.source_uri TEXT` (NULL bei Conversation-Source, gesetzt bei Note-Source).

**Drei Trigger-Pfade:**

1. **Agent-Tool:** `mark_note_as_memory_source(notePath)`. Konsistent mit FEATURE-0319 Agent-als-Interface.
2. **Frontmatter:** `memory-source: true` in Note-Frontmatter. Bei Vault-Index-Run wird Sync gegen `memory_source_notes`-Tabelle ausgefuehrt.
3. **Settings-Liste:** Memory-Source-Notes-Verwaltung in Plugin-Settings (Liste mit Add/Remove).

**Single-Call-Extraktion-Pipeline (analog FEATURE-0318):**

Bei initial-Markierung oder dirty-Re-Extract:

```
1. Lese Note-Inhalt aus Vault
2. Schicke an Single-Call-Extraktor (gleicher Pfad wie Conversation-Extraktion)
3. Output: Facts mit source_interface='vault-note', source_uri='vault://...'
4. FactIntegrator-Pfad: relation: 'new' bei initial, 'update' bei dirty-re-extract
5. Update memory_source_notes: last_extracted_at=now(), dirty=0, fact_count=N
```

**Vault-Hooks:**

- `vault.on('modify', notePath)` -> wenn `notePath` in `memory_source_notes`: setze `dirty=1`. Debounced Re-Extract-Trigger 5s nach letzter Aenderung.
- `vault.on('delete', notePath)` -> Cascade-Soft-Delete (ADR-085): alle Facts mit `source_uri='vault://${notePath}'` werden soft-deleted. User-Notice mit Cascade-Statistik.
- `vault.on('rename', oldPath, newPath)` -> Update-Cascade fuer URIs (ADR-078). `memory_source_notes.note_path` updaten, `facts.source_uri` updaten, `fact_edges.to_external_ref` updaten.

**Bedienfehler-Schutz:**

- Setting `vaultMemorySource.maxNotes` (Default 100, Max 500)
- Bei 101. Markierung: Modal "Du hast bereits 100 Notes als memory-source markiert. Memory koennte unbrauchbar werden, wenn zu viele Facts entstehen. Wirklich fortfahren?"
- Bei Erreichen von Max 500: hard-stop mit Empfehlung "Markiere nur Notes mit dauerhaft relevantem Wissen, nicht Tagebuecher oder Meeting-Notes."

**Re-Extract-Cost:**

- Inkrementelle Re-Extraktion via Delta-Window: nur veraenderte Sektionen werden geschickt (FEATURE-0318 Pattern)
- Token-Cost-Cap (FEATURE-0318 C5) respektiert: wenn Cap erreicht, Re-Extract pausiert bis naechster Tag

**Beziehung zu knowledge.db:**

- knowledge.db.vectors enthaelt **alle** Vault-Notes (FEATURE-0301 Vault-Index)
- memory.db.facts enthaelt **nur** Facts aus markierten Notes (FEATURE-0325)
- Beide koexistieren: knowledge.db ist Volltext+Embedding fuer semantic_search, facts sind atomare Statements fuer Memory-Composition
- Verbindung via `mentions_vault_note`-Edges in fact_edges + `source_uri` in facts

## Consequences

**Positiv:**

- Einzigartiger Selling-Point gegen Konkurrenz
- User-kontrolliert (Opt-In, kein Auto-Magie)
- Cascade-Sicherheit bei Note-Loeschen
- Inkrementelle Re-Extraktion via Delta-Window

**Negativ:**

- Drei Trigger-Pfade = Komplexitaet
- Dirty-Tracking-State persistent zu pflegen
- Vault-Hook-Coupling -- bei Vault-API-Aenderung muss Code angepasst werden
- Bei sehr grossen Notes (> 50k Chars) braucht Chunking-Strategie

**Risks:**

- **R-1:** Inkrementelle Re-Extract-Logic ist nicht-trivial -- Diff-Detection zwischen alter und neuer Note-Version. **Mitigation:** Initial einfache "voll-re-extract"-Logic, Delta-Diff post-MVP.
- **R-2:** Frontmatter-Marker und Settings-Liste koennten konflikten. **Mitigation:** Settings-Liste hat Vorrang, Frontmatter wird als Sync-Quelle behandelt.
- **R-3:** User markiert versehentlich 500+ Notes. **Mitigation:** Hard-Stop-Limit + klare Empfehlung im Modal.

## Implementation-Bezug

- FEATURE-0325 implementiert Schema, Hooks, Trigger-Pfade, Limit-Logic
- Engine-Public-API: `VaultMemorySourceService` (markNote, unmarkNote, listNotes, triggerReExtract, handleVaultEvent)
- ADR-077 enthaelt `memory_source_notes`-Tabelle und `source_uri`-Spalte in facts
- ADR-078 URI-Resolver behandelt `vault://`-URIs
- ADR-085 Soft-Delete-Cascade deckt Vault-Note-Delete-Cascade

## Open Questions

- Inkrementelle Re-Extraktion (Diff-Detection): post-MVP, MVP nutzt voll-re-extract
- Image / PDF / DOCX als memory-source: nur .md initial, andere Formate post-MVP
- Cross-Note-Inferenz (mehrere Notes zu uebergreifenden Facts kombinieren): post-MVP
- Vault-Folder-bulk-Markierung: aktuell nur Single-Note-Granularitaet
