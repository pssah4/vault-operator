---
id: ADR-078
title: URI-Schema fuer Memory-Knoten und Versionierungs-Strategie
status: Accepted
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - ADR-077-memory-v2-storage-schema.md
  - ADR-079-knowledge-db-hardening.md
  - PLAN-001-memory-v2-master.md
---

# ADR-078 -- URI-Schema fuer Memory-Knoten

## Context

Die neue Memory-Architektur (ADR-077) speichert in `fact_edges.to_external_ref` String-Verweise auf externe Knoten (Vault-Notes, Entities, Threads). Gleichzeitig nutzt `knowledge.db.vectors.path` heute schon Strings als Identifier (Vault-Pfade, mit `session:`/`episode:`-Prefix fuer Memory-Eintraege).

Heute herrscht Inkonsistenz:

- Vault-Notes: roher Pfad (`Notes/Sebastian.md`)
- Sessions: `session:abc123`
- Episodes: `episode:817`

Mit Memory v2 kommen Facts (`fact:412`), Entities (`entity:UniCredit`) und UCM-Threads (`thread:abc-xfer`) hinzu. Ohne kanonische URI-Konvention drohen Schluesselkollisionen (z.B. wenn ein Vault-Note `session:foo.md` heisst).

Zusaetzlich: URIs sind in beiden DBs persistiert. Eine spaetere Schema-Aenderung (z.B. `vault://` -> `obsilo-vault://`) wuerde alle Edges still kaputtmachen.

## Decision

### URI-Schema (offen, nicht enum)

Memory-Knoten und Source-Refs werden als URIs persistiert. Das Schema ist **offen**: bekannte Standard-Schemata sind unten dokumentiert, weitere koennen jederzeit ergaenzt werden, ohne Schema-Change in der DB. Ein URI-Resolver-Service kennt die Standard-Schemata, unbekannte Schemata werden als Reference-Token behandelt (Edge bleibt funktional, Resolution liefert null).

**Standard-Schemata (Engine-known):**

| Knoten-Typ | URI-Schema | Beispiel | Storage / Adapter |
|---|---|---|---|
| Fact | `fact:{id}` | `fact:412` | memory.db.facts (Engine intern) |
| Vault-Note | `vault://{relative_path}` | `vault://Notes/UniCredit.md` | VaultAdapter (Obsilo) -> knowledge.db.vectors |
| Vault-Asset (Attachment) | `vault://{relative_path}` | `vault://Attachments/Pitch.pdf` | VaultAdapter (Obsilo), Resolution via parseDocument |
| Session-Summary | `session://{source}/{id}` (source optional) | `session://obsilo/2026-04-25-a3f2`, oder `session://2026-04-25-a3f2` (Solo-Obsilo) | memory.db.sessions, history.db.history_chunks |
| Session-Message-Chunk | `session://{source}/{id}#message-{i}#chunk-{j}` | `session://claude-desktop/abc#message-3#chunk-0` | history.db.history_chunks (FEATURE-0320) |
| Episode | `episode://{id}` | `episode://817` | memory.db.episodes |
| Entity | `entity://{name}` | `entity://UniCredit` | virtuell (kein Storage, nur in Edges) |
| Thread (UCM) | `thread://{id}` | `thread://abc-xfer` | memory.db.conversation_threads (Phase 5) |
| Vault-Block | `vault://{relative_path}#block-{id}` | `vault://Notes/X.md#block-abc` | VaultAdapter (Phase 6) |
| Lokale Datei | `file://{absolute_path}` | `file:///Users/seb/Docs/Pitch.pdf` | LocalFileAdapter (Read-only, **kein Rename-Watcher**) |
| Web-URL | `https://...` / `http://...` | `https://example.com/page` | WebUrlAdapter (Fetch-on-Demand, optional Cache) |
| Cloud-Datei (generisch) | `cloud://{provider}/{path}` | `cloud://gdrive/folder/file.pdf` | CloudAdapter (Stub Phase 7+, Provider-Implementierung opt-in) |
| Custom-Quelle | `{scheme}://{anything}` | `notion://workspace/page-id`, `slack://channel/ts-id` | Extension-Adapter (Konsumenten registrieren eigene) |

**Konvention:** Doppel-Slash `://` fuer alle Schemata. Konsistent, klar abgrenzbar zu Free-Text.

### Source-Adapter-Registry-Pattern

Engine bietet eine Adapter-Registry, an der Hosts (Obsilo, UCM, andere) Source-Adapter registrieren:

```typescript
interface SourceAdapter {
  readonly schemes: string[];                          // z.B. ['vault']
  resolve(uri: string): Promise<ResolvedContent | null>; // Optional, null wenn nicht aufloesbar
  watch?(callback: (event: SourceChangeEvent) => void): Disposable; // Optional, fuer Rename/Delete-Cascade
}

interface ResolvedContent {
  uri: string;
  text?: string;            // Plain-Text-Repraesentation, fuer Embedding/Snippet
  contentType?: string;     // 'text/markdown', 'application/pdf', 'image/png', ...
  metadata?: Record<string, unknown>;
}
```

**Registrierung:**

- Engine startet ohne Adapter, alle URIs sind Reference-Tokens (Resolution liefert null).
- Plugin-Worker registriert `LocalVaultAdapter` (vault://), `LocalFileAdapter` (file://), optional `WebUrlAdapter` (https://).
- Standalone-UCM-Service registriert `McpVaultAdapter` (vault://) wenn Plugin-MCP-URL konfiguriert -- der Adapter ruft Plugin-MCP-Tools (`semantic_search`, `get_vault_implicit_edges`, `get_vault_note_metadata`) statt direkt knowledge.db zu lesen.
- Standalone-UCM-Service ohne Plugin-Verbindung registriert keinen vault-Adapter, alle vault://-Refs bleiben Tokens (kein Crash, kein Resolution).

**KnowledgeGraphAdapter-Doppelimplementierung (FEATURE-0317):** Engine-API unterscheidet nicht zwischen Local und MCP -- beide Implementierungen erfuellen dasselbe `SourceAdapter`-Interface. UnifiedGraphService nutzt sie austauschbar. Lokale ATTACH-CTE-Walks (Setup A/B) sind sub-50ms, MCP-RPC-Walks (Setup C) addieren LAN-RTT (~20-50ms zusaetzlich, akzeptabel).

**Rename/Delete-Cascade:**

- Adapter mit `watch()`-Implementation kann Renames signalisieren. Engine cascaded URI-Updates in `fact_edges`, `vectors`, `tags`, `note_freshness`.
- Adapter ohne `watch()` (z.B. `LocalFileAdapter` ausserhalb Vault, `WebUrlAdapter`, `CloudAdapter`): keine Cascade. Edges koennen stale werden. **Akzeptierte Limitation**, dokumentiert in Adapter-API.
- Cascade ist Opt-In pro Adapter, Engine erzwingt es nicht.

### Versionierungs-Strategie

Zwei Mechanismen kombiniert:

1. **Schema-Version-Pragma pro DB:** `PRAGMA user_version = 2;` in beiden DBs. Migration-Code prueft Version beim Plugin-Start, fuehrt Forward-Migration aus.

2. **URI-Resolver-Layer in der Anwendung:** Direkter URI-Vergleich in SQL nur fuer exakte Matches. Fuer komplexere URI-Manipulationen (Schema-Erkennung, Path-Extraction) gibt es einen `UriResolver`-Service, der die Schema-Version kennt:

```typescript
class UriResolver {
    static parse(uri: string): { scheme: string; path: string };
    static build(scheme: string, path: string): string;
    static migrate(uri: string, fromVersion: number, toVersion: number): string;
}
```

Damit kann eine zukuenftige URI-Konventions-Aenderung als Migration durchgefuehrt werden, ohne dass Application-Code stabile URIs hardcoded.

### Migration der bestehenden Identifier (Phase 0.5)

Einmaliger UPDATE-Pass auf `knowledge.db.vectors`:

```sql
-- Vault-Pfade: kein ":" enthalten, kriegen vault://-Prefix
UPDATE vectors SET path = 'vault://' || path WHERE path NOT LIKE '%://%' AND path NOT LIKE 'session:%' AND path NOT LIKE 'episode:%';

-- Sessions: 'session:abc' -> 'session://abc'
UPDATE vectors SET path = 'session://' || SUBSTR(path, 9) WHERE path LIKE 'session:%';

-- Episodes: 'episode:817' -> 'episode://817'
UPDATE vectors SET path = 'episode://' || SUBSTR(path, 9) WHERE path LIKE 'episode:%';
```

Migration ist idempotent (doppeltes Ausfuehren tut nichts) und transaktional (in einem `BEGIN; ... COMMIT;`-Block).

### Vault-Rename-Cascade (Adapter-spezifisch)

Der `VaultAdapter` implementiert `watch()` und cascadiert Renames innerhalb des Vault. Externe Adapter (file://, https://, cloud://) implementieren `watch()` typischerweise NICHT, deren Refs koennen stale werden.

Wenn Obsidian `vault.on('rename')` feuert (alter Pfad -> neuer Pfad):

```typescript
async function onVaultRename(oldPath: string, newPath: string) {
    const oldUri = `vault://${oldPath}`;
    const newUri = `vault://${newPath}`;
    await transaction(async () => {
        await knowledgeDB.exec(`UPDATE vectors SET path = ? WHERE path = ?`, [newUri, oldUri]);
        await knowledgeDB.exec(`UPDATE implicit_edges SET from_path = ? WHERE from_path = ?`, [newUri, oldUri]);
        await knowledgeDB.exec(`UPDATE implicit_edges SET to_path = ? WHERE to_path = ?`, [newUri, oldUri]);
        await knowledgeDB.exec(`UPDATE tags SET note_path = ? WHERE note_path = ?`, [newUri, oldUri]);
        await knowledgeDB.exec(`UPDATE note_freshness SET path = ? WHERE path = ?`, [newUri, oldUri]);
        await memoryDB.exec(`UPDATE fact_edges SET to_external_ref = ? WHERE to_external_ref = ?`, [newUri, oldUri]);
    });
}
```

Folder-Renames: rekursiver Pattern-Update via `LIKE 'vault://oldFolder/%'`.

## Consequences

**Positiv:**

- Eindeutige Identifier-Konvention ueber beide DBs
- Race-Conditions bei Note-Renames werden gefangen, statt stille Recall-Verschlechterung
- URI-Resolver-Layer entkoppelt Application-Code von URI-Schema-Aenderungen
- UCM kann das Schema 1:1 uebernehmen (Engine-Public-Konvention)

**Negativ:**

- Migrations-Schritt fuer alle bestehenden `vectors.path`-Rows noetig (one-shot, idempotent)
- Application-Code muss URI-aware sein (kein direkter Vault-Pfad-Zugriff mehr)
- `://`-Trennzeichen in URIs ist optisch lang, aber semantisch klar

**Risk:** Wenn ein User eine Note tatsaechlich `vault%2F` oder aehnliche URI-Reserved-Zeichen im Pfad nutzt, kollidiert das mit URI-Encoding. Mitigation: Pfade werden NICHT URL-encoded, sondern roh nach `vault://` gehaengt. SQLite-LIKE und JS-Vergleich behandeln das korrekt.

## Alternatives Considered

1. **`identifier`-Spalte plus separate `kind`-Spalte** -- Verworfen, weil String-Joins schwerer und Edge-Refs komplexer.
2. **Einheitlich `kind:id`-Format ohne `://`** -- Verworfen, weil konventionell URIs mit `://` arbeiten und `:` in IDs (z.B. ISO-Timestamps) Konflikte erzeugt.
3. **JSON-Encoding statt String** -- Verworfen, sql.js ohne JSON1, Performance-Aufschlag bei jedem Edge-Read.

## Open Questions

- Sollen URIs zusaetzlich URL-encoded werden (Sicherheit gegen pathologische Pfade)?
- Wie wird der Resolver-Layer in `@obsilo/memory-engine` als Public-API exportiert?
- Cross-Vault-URIs (z.B. wenn ein User mehrere Vaults synct): braucht es `vault://{vault-id}/{path}`?
- LocalFileAdapter: Read-Permissions-Modell (Sandbox-konform vs. nativ)?
- WebUrlAdapter: Caching-Strategie (Tag-basiert, ETag, immer fresh)?
- CloudAdapter-Stub: welche Provider zuerst (Google Drive, Dropbox, OneDrive, iCloud)?
- Stale-Edge-Erkennung fuer external Schemata: Background-Health-Check oder lazy on-Resolution-Failure?
