---
id: ADR-85
title: Soft-Delete-Cascade auf vier Granularitaets-Ebenen
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - FEAT-03-22-privacy-forget-right.md
  - ADR-77-memory-v2-storage-schema.md
  - ADR-79-knowledge-db-hardening.md
triggers:
  - ASR-043 (Soft-Delete + Cascade vier Ebenen)
  - ASR-044 (Drei Conversation-States, Privacy via Forget-Right)
---

# ADR-85 -- Soft-Delete-Cascade

## Status

Proposed.

## Context

DSGVO-Compliance plus User-Souveraenitaet erfordern selektives Loeschen auf vier Ebenen (siehe FEAT-03-22): einzelner Fact, alle Facts zu Entity-URI, ganze Conversation, alle Bezuege auf Vault-Note. Plus 30-Tage-Soft-Delete-Window mit Hard-Delete + Backup-Sweep danach.

Triggernde ASRs: ASR-043 (vier Ebenen), ASR-044 (Privacy-Modell).

Konflikt: Cascade muss `fact_edges` mit-loeschen, aber History-Erhaltung im Audit-Log erforderlich. Plus Engine muss DSGVO-konform auch `.bak`-Files bereinigen koennen.

## Decision Drivers

- **DD-1 DSGVO-Vollstaendigkeit:** Forget-Right deckt alle Spuren ab (Hauptdaten, Edges, Audit-Log, Backups)
- **DD-2 Undo-Window:** User soll versehentliches Loeschen rueckgaengig machen koennen
- **DD-3 Cascade-Konsistenz:** Loeschen einer Entity-URI darf nicht zu orphan Edges fuehren
- **DD-4 Audit-Trail:** Wer hat wann was warum geloescht, fuer 30 Tage rueckverfolgbar

## Considered Options

### Option 1: Hard-Delete sofort (verworfen)

Direkt aus DB loeschen, kein Soft-Delete-Window.

- + Pro: Einfach, kein Storage-Overhead
- - Con: Bricht DD-2 (kein Undo)
- - Con: Bricht DD-4 (kein Audit-Trail moeglich)

### Option 2: Soft-Delete + Hard-Delete-Job + Backup-Sweep (Empfohlen)

`deleted_at`-Timestamp + Cascade-Soft-Delete in fact_edges. Hard-Delete-Job (taeglich) entfernt Soft-deletete Eintraege > 30 Tage. Backup-Sweep durchsucht `.bak`-Files auf geloeschte IDs.

- + Pro: DD-1, DD-2, DD-3, DD-4 erfuellt
- - Con: Storage-Aufschlag waehrend Soft-Delete-Window (geschaetzt 5-10% Mehrgroesse)
- - Con: Backup-Sweep ist eigener Code-Pfad

### Option 3: Crypto-Erase via Verschluesselung (verworfen fuer MVP)

DBs verschluesselt, Loeschen = Schluessel-Vernichtung pro Entity.

- + Pro: maximale DSGVO-Konformitaet
- - Con: at-rest-Encryption ist Out-of-Scope (siehe C1 Backlog)
- - Con: Komplexitaet erheblich

## Decision

**Option 2 -- Soft-Delete + Hard-Delete-Job + Backup-Sweep.**

**Soft-Delete-Schema:**

- `facts.deleted_at TIMESTAMP` (NULL bei aktiv, Date bei soft-deleted)
- `facts.deletion_reason TEXT` (z.B. `'user-action'`, `'cascade-vault-note-deleted'`, `'aged_out_no_confirmation'`)
- `fact_edges.deleted_at TIMESTAMP` analog
- Default-Filter in Queries: `WHERE deleted_at IS NULL` (zusaetzlich zu `is_latest=1`)

**Cascade auf vier Ebenen:**

| Ebene | API | Cascade-Verhalten |
|---|---|---|
| **Fact** | `delete_fact(id, reason)` | Soft-delete Fact + alle eingehenden Edges (`fact_edges WHERE to_fact_id=id`) + alle ausgehenden Edges (`from_fact_id=id`) |
| **Entity** | `delete_facts_by_entity(uri, reason)` | Alle Facts die `mentions_entity`-Edge zu uri haben werden soft-deletet, plus Cascade ihrer Edges |
| **Conversation** | `delete_conversation(threadId, reason)` | Alle Facts mit `source_thread_id=threadId` + alle history_chunks der Conversation + alle Episodes |
| **Vault-Ref** | `delete_facts_by_vault_ref(uri, reason)` | Alle Facts mit `mentions_vault_note`-Edge zu uri + Cascade ihrer Edges. Plus FEAT-03-25-Cascade: alle Facts mit `source_uri=uri` werden ebenfalls geloescht |

**Hard-Delete-Job:**

Taeglicher Background-Job (oder Plugin-Start wenn > 24h):

```sql
-- Hard-Delete von soft-deleted Facts > 30 Tage alt
DELETE FROM facts WHERE deleted_at < datetime('now', '-30 days');
DELETE FROM fact_edges WHERE deleted_at < datetime('now', '-30 days');
```

Audit-Log behaelt Eintrag, aber mit `metadata.hard_deleted_at`-Timestamp.

**Backup-Sweep:**

Nach Hard-Delete: Sweep ueber `.bak`-Files. Pro `.bak`-File:

1. DB im Read-Only-Modus oeffnen
2. Pruefen ob soft-deletete IDs vorhanden
3. Wenn ja: gefilterte Kopie erzeugen, alte `.bak` ersetzen
4. Audit-Log-Eintrag

Backup-Sweep ist **opt-in** ueber Settings (Default an, fuer DSGVO-bewusste User abschaltbar).

**Soft-Delete-Window:**

- 30 Tage Default
- Konfigurierbar in Settings (`forgetRight.softDeleteDays`, Min 7, Max 90)
- Innerhalb Window: `recall_memory(query, includeDeprecated=true)` zeigt soft-deletete Facts
- `restore_fact(id)` re-aktiviert (deleted_at=NULL)

**Audit-Log:**

`memory_audit`-Eintrag pro Loesch-Operation:

- `operation: 'soft_delete' | 'hard_delete' | 'restore'`
- `fact_id`, `related_fact_id`
- `rationale`: deletion_reason
- `metadata`: `{ user_initiated: boolean, cascade_level: 'fact' | 'entity' | 'conversation' | 'vault_ref' }`
- `timestamp`

## Consequences

**Positiv:**

- DSGVO-konform inklusive Backups
- Undo-Window 30 Tage = User-Vertrauen
- Cascade-Logic ist klar definiert, keine orphan Edges
- Audit-Trail vollstaendig

**Negativ:**

- Storage-Aufschlag waehrend Soft-Delete-Window
- Backup-Sweep ist nicht-trivial (Read-Modify-Rewrite ueber .bak-Files)
- Cross-DB-Cascade (memory.db + ggf. ucm-sidecar.db) braucht Multi-File-Atomic-Commit-Pattern (ADR-79)

**Risks:**

- **R-1:** Backup-Sweep verändert .bak-Files -- bei Power-Loss waehrend Sweep koennte ein `.bak`-File korrupt werden. **Mitigation:** Sweep-Pattern via Multi-File-Atomic-Commit (write `.bak.tmp`, dann rotate, ADR-79).
- **R-2:** User entscheidet Cascade-Level falsch (z.B. delete_facts_by_entity statt delete_fact). **Mitigation:** Pre-Delete-Preview ueber Agent ("Diese Aktion wird N Facts loeschen, sicher?")
- **R-3:** Hard-Delete-Job laeuft waehrend aktiver Conversation. **Mitigation:** Job nimmt Read-Lock, nicht Write-Lock auf andere DBs (sql.js gepoolt).

## Implementation-Bezug

- FEAT-03-22 implementiert die Soft-Delete + Cascade + Hard-Delete + Backup-Sweep
- ADR-79 Multi-File-Atomic-Commit deckt Backup-Sweep
- ADR-77 Schema enthaelt `deleted_at` + `deletion_reason` Spalten
- Engine-Public-API: `softDelete`, `hardDelete`, `restoreSoftDeleted`, `runDeletionSweep`

## Open Questions

- Cross-DB-Cascade bei UCM-Sidecar -- post-MVP (UCM-Repo)
- Cascade-Level bei mentions_external (z.B. cloud://) -- aktuell wie mentions_entity behandelt
- DSGVO-Audit-Workflow: gibt es einen "DSGVO-Export"-Trigger (alle Daten zu User X exportieren)? Backlog.
