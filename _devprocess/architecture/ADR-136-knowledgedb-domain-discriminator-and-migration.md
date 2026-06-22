---
id: ADR-136
title: KnowledgeDB Domain-Diskriminator und Migration v12 zu v13
date: 2026-06-22
deciders: [Sebastian Hanke]
asr-refs: [ASR-03-27-01, ASR-03-27-02]
feature-refs: [FEAT-03-27]
related-adrs:
  - ADR-50-knowledge-db-foundation
  - ADR-77-memory-v2-storage-schema
  - ADR-79-knowledge-db-härtung
  - ADR-92-knowledge-db-schema-v10
supersedes: null
superseded-by: null
---

# ADR-136: KnowledgeDB Domain-Diskriminator und Migration v12 zu v13

## Context

Die KnowledgeDB speichert in ihrer `vectors`-Tabelle heute Einträge aus zwei semantisch unterschiedlichen Quellen: vault-resident Notes (echte `.md`-Files im User-Vault) und KnowledgeDB-interne Tracing-Einträge (Sessions, Episodes, ab Memory v2 Phase 1 auch Facts, Mentions, Threads und Entities). Die Unterscheidung ist heute implizit über den Pfad-Prefix kodiert: vault-relative Pfade wie `Notes/Foo.md` sind Notes, Pfade wie `session:YYYY-MM-DD-xxxx` oder `episode:ep-xxxx` sind Tracing-Einträge. Diese implizite Konvention wird in einer Lese-Stelle lokal gefiltert und in allen anderen Lese-Stellen ignoriert.

Die Konsequenz dieser impliziten Trennung ist Drift in jedem neuen Konsumenten der Tabelle. Der Vault Health Check meldet seit Memory v2 Phase 6 systematisch hunderte Pseudo-Orphans, weil seine Orphan-Query gegen `vectors` keinen Pfad-Prefix-Filter kennt. Bei einem User-Vault mit aktiver Stigmergy- und History-Nutzung sind 95% der gemeldeten Orphans Tracing-Einträge. Die Frage ist architektonisch: wie wird die Layer-Trennung an der Datenbasis so verankert, dass künftige Konsumenten der Tabelle den Filter nicht vergessen können und die Trennung auch für künftige URI-Schemas (Facts, Mentions, Threads, Entities) gilt?

Zwei harte Randbedingungen schränken die Antwort ein: erstens darf die Migration den vorhandenen Vault-Index nicht invalidieren (ein Re-Index dauert auf großen Vaults Stunden), zweitens müssen die Tool-API-Schemas (`session://`, `episode://`, `vault://`, `fact://`) auf der Oberfläche unverändert bleiben, weil Agents, Recipes und Memory-Konventionen diese Schemas als Vertrag konsumieren.

**Triggering ASRs:**
- ASR-03-27-01 (FEAT-03-27): Schema-Migration ohne User-Re-Index der Vault-Vektoren. Quality attribute: Performance, Availability.
- ASR-03-27-02 (FEAT-03-27): Tool-API-Kompatibilität über die Migration hinweg. Quality attribute: Compatibility.

## Decision drivers

- **Migration ohne Re-Index** (ASR-03-27-01): jede Variante, die Daten zwischen Tabellen verschiebt, zwingt zu einem Vault-Re-Index, weil die Vector-IDs an der Verschiebung hängen. Bestehende Vaults mit zehntausenden Vektoren würden Stunden brauchen. Inakzeptabel.
- **Tool-API-Kompatibilität** (ASR-03-27-02): externe URI-Schemas sind als Vertragsinterface festgelegt. Eine Migration darf die zurückgegebenen URIs nicht ändern, sonst brechen Recipes und Memory-Konventionen.
- **Drift-Resistenz**: die heutige Lösung scheitert daran, dass jeder neue Konsumenten der Tabelle die Filter-Regel selbst kennen muss. Die Wurzel-Lösung muss die Trennung an der Datenbasis verankern, nicht an einer Code-Konvention.
- **Idempotenz**: die Migration muss auf Wiederholung 0 Schreibvorgänge erzeugen, sonst kann ein Crash mitten in der Migration einen halben Zustand hinterlassen.
- **Skalierbarkeit auf den Endausbau**: 50.000 Sessions plus 50.000 Episodes innerhalb von zwei Jahren Plugin-Use sind eine realistische Obergrenze. Die Variante muss diese Mengen ohne weitere Schema-Änderung tragen.
- **Beibehaltung der bestehenden Storage-Schutzschicht**: Atomic Write (FIX-12 aus ADR-79), Lock-File, Daily-Snapshots gelten weiterhin und duerfen nicht durch die Variante umgangen werden.

## Considered options

### Option 1: Separater Tabellen-Namespace pro Layer

Die `vectors`-Tabelle bleibt für User-Vault-Objekte erhalten. Neue Tabellen `session_vectors`, `episode_vectors`, `fact_vectors`, `mention_vectors`, `thread_vectors`, `entity_vectors` werden pro Layer angelegt. Die Migration v12 nach v13 verschiebt alle Tracing-Einträge aus `vectors` in die entsprechenden neuen Tabellen.

- Pro: Build-Zeit-Garantie. Ein Reader von `vectors` sieht physikalisch nur Notes, ein Reader von `session_vectors` sieht physikalisch nur Sessions. Kein Filter im Code nötig, kein Drift-Pfad möglich.
- Pro: Klare Speicher-Trennung erleichtert spätere Layer-spezifische Optimierungen (z.B. eigene Index-Strategien pro Layer).
- Con: Migration verschiebt Daten zwischen Tabellen, was die Vector-IDs ändert. Damit ist ein Vault-Re-Index praktisch unausweichlich, weil die externen Referenzen (zwischen-Layer-Verweise in `edges`) ihre Targets verlieren. **Verstoß gegen ASR-03-27-01.**
- Con: Anzahl der Tabellen waechst mit jedem neuen URI-Schema (Phase 1+ bringt Facts, Mentions, Threads, Entities). Schema-Migrations-Pfad wird komplexer mit jeder neuen Layer-Sorte.
- Con: Cross-Layer-Queries (z.B. Reranker, der Vault-Notes und Sessions gemeinsam scort) brauchen `UNION ALL`-Statements über alle Layer-Tabellen. Performance-Verlust auf Mixed-Layer-Recall.

### Option 2: Spalten-Diskriminator auf `vectors`

Eine neue Spalte `domain TEXT NOT NULL DEFAULT 'note'` wird zu `vectors` hinzugefuegt. Erlaubte Werte: `'note'`, `'session'`, `'episode'`, `'fact'`, `'mention'`, `'thread'`, `'entity'`. Ein Index auf `(domain, path)` macht Layer-spezifische Lookups schnell. Bestehende Einträge werden in-place aktualisiert: ihr Diskriminator-Wert wird aus dem Pfad-Prefix abgeleitet (`session:` -> `'session'`, `episode:` -> `'episode'`, sonst `'note'`).

- Pro: Migration ohne Daten-Verschiebung, ohne Vector-ID-Änderung. Bestehende Embedding-Vektoren bleiben gültig, kein User-Re-Index. **Erfüllt ASR-03-27-01.**
- Pro: Cross-Layer-Queries (Reranker, kombinierte Recall) sind unverändert möglich, nur Layer-spezifische Queries fügen ein `WHERE domain = ?` hinzu.
- Pro: Neue URI-Schemas erweitern nur den erlaubten Wertebereich der Spalte, kein Schema-Migration je neuem Layer.
- Pro: Tool-API-Mapping bleibt sauber: die `domain`-Spalte ist intern, das URI-Schema `session://`, `episode://`, `vault://`, `fact://` bleibt extern. Mapping ist ein-zu-eins und verlustfrei.
- Con: Drift-Resistenz hängt am Helper plus Lint-Regel (siehe ADR-137), nicht an einer physikalischen Tabellen-Trennung. Lint-Lapsus oder direkter SQL-Zugriff können die Trennung umgehen.
- Con: SQLite-spezifisch: `ALTER TABLE ... ADD COLUMN` mit Default ist O(1) in sql.js, aber der Index auf `(domain, path)` braucht einen vollen Scan zur Aufbau-Zeit.

### Option 3: View-basierte Trennung über `vectors`

Die `vectors`-Tabelle bleibt unverändert. Neue SQL-Views `note_vectors`, `session_vectors`, `episode_vectors`, ... werden auf der Tabelle als `SELECT * FROM vectors WHERE path LIKE 'session:%'` etc. definiert. Alle Reader gehen über die View, nicht die Basis-Tabelle. Eine Lint-Regel verbietet direkten Zugriff auf `vectors` in Reader-Pfaden.

- Pro: Keine Schema-Migration nötig. Views werden bei DB-Open zur Laufzeit angelegt.
- Pro: Layer-Trennung sichtbar im SQL: Konsumenten formulieren `SELECT ... FROM note_vectors WHERE ...` und sehen aus dem Code unmittelbar welchen Layer sie ansprechen.
- Con: Implizite Trennung bleibt auf Pfad-Prefix-Konvention angewiesen. Eine Note mit Pfad `session_intro.md` wird fälschlich der `session_vectors`-View zugeordnet (theoretisches Drift-Risiko bei Vault-Pfaden, die ein Layer-Prefix imitieren).
- Con: SQLite-Views in sql.js sind read-only. Writer müssen weiterhin auf die Basis-Tabelle schreiben, was die Layer-Garantie für Schreib-Pfade aufweicht.
- Con: Query-Planner muss bei jedem View-Zugriff den Pfad-Prefix-Filter auflösen. Performance-Charakteristik identisch zur Option 2 ohne dedizierten Index, aber ohne den Build-Zeit-Garantie-Vorteil von Option 1.

## Decision

**Proposed option:** Option 2 (Spalten-Diskriminator auf `vectors`).

**Reasoning:**
Option 2 erfüllt beide kritischen ASRs ohne Trade-off. Migration ohne Re-Index ist die einzige Variante, die den Vault-Index überlebt. Tool-API-Kompatibilität bleibt durch das interne-zu-extern-Mapping erhalten. Die Drift-Resistenz, die Option 1 als physikalische Garantie bietet, wird in Option 2 durch die Kombination mit ADR-137 (Helper-Funktion plus Lint-Regel) auf ein vergleichbares Niveau gehoben. Skalierbarkeit auf neue URI-Schemas ist additiv und kostet keine weitere Schema-Migration.

**Migration-Strategie (Teil dieser Entscheidung):**

Die Migration v12 nach v13 laeuft in einer einzigen Transaktion innerhalb `onload` des Plugins. Sie besteht aus drei Schritten:

1. `ALTER TABLE vectors ADD COLUMN domain TEXT NOT NULL DEFAULT 'note'`. Erzeugt die Spalte als O(1)-Operation, alle bestehenden Zeilen bekommen den Default `'note'`.
2. `UPDATE vectors SET domain = 'session' WHERE path LIKE 'session:%'` und analog für alle anderen Tracing-Schemas. Pfad-Prefix-Inferenz, idempotent, da wiederholte Anwendung keine Zeile mehr findet (alle Sessions sind dann schon `'session'`).
3. `CREATE INDEX IF NOT EXISTS idx_vectors_domain_path ON vectors(domain, path)`. Einmaliger voller Scan bei Aufbau, danach O(log n)-Lookups.

**Codebase-Reconciliation 2026-06-22 (durch /coding Phase 2a):** Die ARCH-Annahme einer separaten "Daily-Snapshot-vor-Migration"-Trigger-Mechanik ist gegen die echte Codebase präzisiert. Realität ist das atomic-write-Pattern aus FIX-12 (KnowledgeDB.ts Header, Zeile 12): `write tmp -> rotate current -> .bak -> rename tmp -> current` produziert nach jedem `KnowledgeDB.save()` eine `.bak`-Datei mit dem vorherigen DB-Stand. Diese `.bak` ist das Pre-Migration-Sicherheitsnetz. Vor der Migration genügt ein einziger erzwungener `save()`-Aufruf, der die `.bak` auf den aktuellen Pre-Migration-Stand zieht. Ein separater Daily-Snapshot-Trigger ist NICHT nötig. Die Auto-Recovery-Logik in `KnowledgeDB.ts:334-344` liest bei DB-Corruption automatisch aus `.bak`. Die Lock-File-Mechanik aus FEATURE-0314 verhindert weiterhin parallele Plugin-Instanzen während der Migration. Bei einem Crash mitten in der Migration startet der nächste Plugin-Start die Migration neu, weil sie idempotent ist und die Schema-Version erst nach erfolgreichem Abschluss von v12 auf v13 gesetzt wird. Die `AutoBackupRunner`-Mechanik aus `src/core/backup/` ist eine Vault-weite User-Backup-Schicht und wird durch die KnowledgeDB-internen `.bak`-Files NICHT ersetzt.

**Tool-API-Mapping (Teil dieser Entscheidung):**

Die interne `domain`-Spalte bleibt strikt intern. Die zurückgegebenen URIs in `RecallHit` und allen Tool-Antworten folgen weiter dem bestehenden Schema-Vertrag: `vault://<path>`, `session://<id>`, `episode://<id>`, `fact:<id>`, `mention://<id>`, `thread://<id>`, `entity://<name>`. Das Mapping zwischen `domain`-Spalte und URI-Schema ist deterministisch und in einem zentralen Helper kodifiziert (siehe ADR-137). Insbesondere bleibt der heutige `fact:`-Schema-Sonderfall ohne Doppel-Slash erhalten (er ist als Konvention bereits in `RecallHit.uri` JSDoc dokumentiert), die Migration ändert ihn nicht.

**Note:** Dies ist ein PROPOSAL. Das /coding-Skill faellt die finale Entscheidung auf Basis des realen Codebase-Standes.

## Consequences

### Positive

- 412 Pseudo-Orphans im Vault Health Check (Stand 2026-06-22 in Sebastian's Vault) werden zu 0 reduziert, ohne dass User ihren Vault-Index neu aufbauen.
- Drift in künftigen Konsumenten der `vectors`-Tabelle wird durch die Kombination ADR-136 (Diskriminator-Spalte) und ADR-137 (Helper plus Lint-Regel) hart verhindert.
- Neue URI-Schemas aus Memory v2 Phase 1+ (Facts, Mentions, Threads, Entities) sind in der Schema-Erweiterung bereits vorgesehen und brauchen keine eigene Migration.
- Cross-Layer-Queries (Reranker, kombinierte Recall) bleiben effizient, weil keine `UNION ALL`-Statements über separate Tabellen nötig sind.
- Plugin-Start-Zeit wird minimal beeinflusst: `ALTER TABLE ADD COLUMN` mit Default ist O(1), das `UPDATE` ist linear in der Vector-Anzahl, der `CREATE INDEX` ist linear plus log-Faktor. Erwartete Migration-Zeit für einen typischen Vault mit 11.000 Vektoren: deutlich unter 5 Sekunden.

### Negative

- Drift-Garantie hängt am Helper plus Lint-Regel, nicht an einer physikalischen Tabellen-Trennung. Ein lapsus in der Lint-Konfiguration oder ein bewusster direkter SQL-Zugriff kann die Trennung umgehen. Mitigation in ADR-137.
- Bestehende ADRs zur KnowledgeDB-Schema-Versionierung (ADR-77, ADR-92) müssen ein Amendment bekommen, das die `domain`-Spalte als additive Erweiterung vermerkt.

### Risks

- **Risk:** sql.js-spezifisch: bei sehr großen `vectors`-Tabellen (50.000+ Einträge) koennte der `UPDATE`-Schritt der Migration die Plugin-Start-Zeit über 30s druecken (SC-03-Grenze). Mitigation: der UPDATE wird in Batches von 1000 Zeilen ausgefuehrt, OperationLogger gibt Progress-Notice an den User. Bei Vaults oberhalb 30s migriert der Plugin im Hintergrund und gibt eine Notice, dass die Migration aktiv ist.
- **Risk:** Pfad-Prefix-Inferenz kann theoretisch eine User-Note mit pathologischem Pfad `session_intro.md` fälschlich als Session klassifizieren. Mitigation: der UPDATE-Predicate prueft explizit auf `session:` (mit Doppelpunkt, ohne Underscore), `episode:` etc. statt LIKE-Pattern, das auch `session_intro.md` matchen würde.
- **Risk:** Crash mitten in der Migration koennte eine partielle `domain`-Spalte hinterlassen. Mitigation: die Migration ist als einzelne SQLite-Transaktion implementiert. Bei Crash rolled SQLite zurück. Plus die Daily-Snapshot vor Migration ist ein zweites Sicherheitsnetz.

## Related decisions

- ADR-50: KnowledgeDB Foundation. Schema-Grundlage der Tabelle.
- ADR-77: Memory v2 Storage Schema. Definiert das Facts/Edges/Styles/Audit-Schema. Bekommt ein Amendment mit Hinweis auf ADR-136.
- ADR-79: KnowledgeDB Härtung (Atomic Write, Multi-File-Commit, Rename-Cascade). Die Schutzschichten gelten weiterhin und werden durch die Migration nicht beeintraechtigt.
- ADR-92: KnowledgeDB Schema v10 Bundle. Voriges grosses Schema-Update. Bekommt einen Hinweis auf die v12-zu-v13-Folgemigration aus ADR-136.
- ADR-137: KnowledgeDB Domain-Access-Pattern (geschwistert): die Drift-Resistenz, die Option 1 als physikalische Garantie geboten haette, wird durch ADR-137 auf Code-Ebene rekonstruiert.

## References

- FEAT-03-27 Tracing-Layer-Trennung in der KnowledgeDB
- architect-handoff-feat-03-27.md mit ASRs und sechs offenen Fragen
- User-Dialog 2026-06-22 mit expliziter Wahl Variante 2 (Schema-Trennung statt Symptom-Filter)
- MEMORY.md Stand 2026-06-22 (FIX-12 atomic write, KnowledgeDB schema v12, lock-file, daily snapshots)

---

## Implementation Notes (optional, may go stale)

> Dieser Anhang darf nach Refactoring veralten. Der Wayfinder
> (`src/ARCHITECTURE.map`) bleibt die Quelle für aktuelle Pfade.

Voraussichtliche Code-Standorte für den Migration-Helper (Stand 2026-06-22):

- Schema-Migration-Helper neben den bestehenden Migrationen, vermutlich in `src/core/storage/` oder `src/core/knowledge/`
- Die Schema-Versions-Konstante (heute `SCHEMA_VERSION = 12`) wandert auf `13` nach erfolgreicher Migration
- Der existierende `path.startsWith('session:') || path.startsWith('episode:')`-Filter in `SemanticIndexService.ts:596` wird obsolet und entfernt; ein Test pinnt das Entfernen
- Pre-Migration-Snapshot triggert die Mechanik aus FEATURE-0314 (Daily-Snapshot, `.bak/{name}/{YYYY-MM-DD}.db`) auch ausserhalb des regulieren 24h-Fensters

PLAN-{nn} aus dem nächsten /coding-Pass enthaelt die aktuell gültige Task-Liste mit echten Pfaden.
