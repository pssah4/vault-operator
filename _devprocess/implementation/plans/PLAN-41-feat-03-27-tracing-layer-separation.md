---
id: PLAN-41
title: FEAT-03-27 Tracing-Layer-Trennung in der KnowledgeDB
date: 2026-06-22
feature-refs: [FEAT-03-27]
adr-refs: [ADR-136, ADR-137]
bug-refs: []
pair-id: sebastian-claude-opus-4-7
---

# PLAN-41: FEAT-03-27 Tracing-Layer-Trennung in der KnowledgeDB

> Backlog row in `_devprocess/context/BACKLOG.md` (Status, Phase, Commit-SHAs).
> TDD-Mode aktiv (globale Default-Regel, CLAUDE.md Abschnitt D).

## Scope

Schema-Migration der KnowledgeDB von v12 auf v13, additiv über eine Diskriminator-Spalte `vectors.domain TEXT NOT NULL DEFAULT 'note'` mit erlaubten Werten `'note' | 'session' | 'episode' | 'fact' | 'mention' | 'thread' | 'entity'`. Die bestehende `VectorStore`-Klasse wird um domain-typisierte Methoden plus eine generische Cross-Layer-API erweitert. Drei direkte SQL-Reader auf `vectors` außerhalb der VectorStore-Heimat werden auf die neuen Methoden umgestellt. Vier Writer-Aufrufe in `SemanticIndexService` werden auf die domain-spezifischen Insert-Pendants umgestellt. Eine lokale ESLint-Regel verhindert künftigen Drift. Der lokale Filter in `SemanticIndexService.cleanupStubVectors` (Zeile 596) wird entfernt.

## Tasks (TDD-Reihenfolge)

### Welle 1: Domain-Konstanten, Migration, VectorStore-Erweiterung (Foundation)

**Task 1.1: Domain-Konstanten und URI-Mapping**

- Create: `src/core/knowledge/knowledgeDomains.ts`
  - Export `KNOWLEDGE_DOMAINS = ['note', 'session', 'episode', 'fact', 'mention', 'thread', 'entity'] as const`
  - Export `KnowledgeDomain` Typ
  - Export `pathPrefixToDomain(path: string): KnowledgeDomain` (Pfad-Prefix-Inferenz; `session:` → `'session'`, `episode:` → `'episode'`, `fact:` → `'fact'`, sonst `'note'`)
  - Export `domainToUriScheme(domain: KnowledgeDomain): string` mit `fact` als Sonderfall ohne `//`
- Create: `src/core/knowledge/__tests__/knowledgeDomains.test.ts`
  - RED: `pathPrefixToDomain('Notes/Foo.md')` returns `'note'`
  - RED: `pathPrefixToDomain('session:abc')` returns `'session'`
  - RED: `pathPrefixToDomain('episode:ep-1')` returns `'episode'`
  - RED: `pathPrefixToDomain('session_intro.md')` returns `'note'` (Underscore-Pathologie aus ADR-136 Risk)
  - RED: `domainToUriScheme('fact')` returns `'fact:'` (kein `//`)
  - RED: `domainToUriScheme('session')` returns `'session://'`
  - GREEN: Implementation lässt alle Tests passieren
- Verify: `npx vitest run knowledgeDomains.test`

**Task 1.2: Schema-Migration v12 → v13 in KnowledgeDB.migrateSchema**

- Modify: `src/core/knowledge/KnowledgeDB.ts:52` SCHEMA_VERSION von `12` auf `13`
- Modify: `src/core/knowledge/KnowledgeDB.ts:migrateSchema` neuer Block `if (currentVersion < 13) { ... }` nach dem v12-Block
  - `ALTER TABLE vectors ADD COLUMN domain TEXT NOT NULL DEFAULT 'note'` mit try/catch für "column may already exist"
  - `UPDATE vectors SET domain = 'session' WHERE path LIKE 'session:%' AND domain = 'note'`
  - `UPDATE vectors SET domain = 'episode' WHERE path LIKE 'episode:%' AND domain = 'note'`
  - `UPDATE vectors SET domain = 'fact' WHERE path LIKE 'fact:%' AND domain = 'note'`
  - `UPDATE vectors SET domain = 'mention' WHERE path LIKE 'mention:%' AND domain = 'note'` (Memory v2 Phase 1+ vorbereiten)
  - `UPDATE vectors SET domain = 'thread' WHERE path LIKE 'thread:%' AND domain = 'note'`
  - `UPDATE vectors SET domain = 'entity' WHERE path LIKE 'entity:%' AND domain = 'note'`
  - `CREATE INDEX IF NOT EXISTS idx_vectors_domain_path ON vectors(domain, path)`
- Modify: `src/core/knowledge/KnowledgeDB.ts` vor `migrateSchema()`: erzwungener `save()`-Aufruf wenn `currentVersion < 13`, damit die `.bak` den Pre-Migration-Stand hält (Codebase-Reconciliation aus ADR-136)
- Create: `src/core/knowledge/__tests__/KnowledgeDB.v13Migration.test.ts`
  - RED: Migration v12 → v13 mit gemischten Eintrag (Note + Session + Episode) setzt `domain` korrekt
  - RED: Migration ist idempotent (zweiter Lauf produziert 0 UPDATEs)
  - RED: Note mit pathologischem Pfad `session_intro.md` bleibt `domain = 'note'` (kein false-positive durch LIKE)
  - RED: `.bak` enthält den Pre-Migration-Stand (über die in-memory-Recovery testbar)
  - RED: schema_meta Version steht nach Migration auf 13
  - GREEN: Migration-Block im migrateSchema lässt alle Tests passieren
- Verify: `npx vitest run KnowledgeDB.v13Migration`

**Task 1.3: VectorStore um domain-Awareness erweitern**

- Modify: `src/core/knowledge/VectorStore.ts`
  - Neue Insert-Methoden: `insertNoteVector`, `insertSessionVector`, `insertEpisodeVector`, `insertFactVector`, `insertMentionVector`, `insertThreadVector`, `insertEntityVector`. Jede ruft intern `insertChunks` mit dem entsprechenden Domain-Wert auf.
  - Neue Find-Methoden: `findNoteVectors({chunkIndex?, pathLike?, ...})`, `findSessionVectors`, `findEpisodeVectors`, `findFactVectors`, `findMentionVectors`, `findThreadVectors`, `findEntityVectors`. Jede setzt `WHERE domain = ?` mit dem entsprechenden Wert.
  - Generische Cross-Layer-Methode: `findVectors({domain?, ...})` für Cross-Layer-Reranker
  - Erweiterte interne SQL: bestehende `INSERT INTO vectors (...)` um `domain`-Spalte erweitern. Bestehende `SELECT ... FROM vectors` Methoden bleiben unverändert (sie sind in der Helper-Heimat und sehen den Diskriminator nicht explizit).
  - Helper: `getStubCandidatePaths` filtert intern auf `domain = 'note'` statt String-Prefix-Vergleich
- Modify: `src/core/knowledge/__tests__/VectorStore.test.ts`
  - RED: `insertNoteVector` schreibt mit `domain = 'note'`
  - RED: `insertSessionVector` schreibt mit `domain = 'session'`
  - RED: `findNoteVectors({chunkIndex: 0})` ignoriert Session- und Episode-Einträge
  - RED: `findSessionVectors()` ignoriert Note- und Episode-Einträge
  - RED: `findVectors({})` (kein Domain-Filter) liefert Eintraege über alle Layer (Cross-Layer-Reranker-Kompatibilität)
  - RED: `getStubCandidatePaths` schließt `session:`- und `episode:`-Pfade aus, ohne dass der Aufrufer einen Prefix-Filter braucht
  - GREEN: Implementation lässt alle Tests passieren
- Verify: `npx vitest run VectorStore`

### Welle 2: Reader-Migration (Drift-Stelle weg)

**Task 2.1: VaultHealthService.checkOrphans auf VectorStore-API**

- Modify: `src/core/knowledge/VaultHealthService.ts:366-372`
  - Statt `db.exec(\`SELECT DISTINCT v.path FROM vectors v WHERE v.chunk_index = 0 ...\`)` Aufruf `this.knowledgeDB.vectorStore.findNoteVectors({chunkIndex: 0, excludePathPrefixes: userExcludes, excludePathContains: ['Templates', 'Daily Notes', 'Attachements']})`
  - VectorStore-Methode muss `excludePathContains` plus `excludePathPrefixes` unterstützen
- Modify: `src/core/knowledge/__tests__/VaultHealthService.format.test.ts` oder neue Datei
  - RED: `checkOrphans` mit gemischten Eintrag (10 Notes + 50 Sessions + 100 Episodes) meldet 0 Pseudo-Eintraege
  - RED: ein echter Note-Orphan wird weiterhin gemeldet
  - GREEN: nach Umstellung auf `findNoteVectors` ist die Pseudo-Eintrag-Zahl 0
- Verify: `npx vitest run VaultHealthService`

**Task 2.2: VaultHealthService.checkWeakClusters auf VectorStore-API**

- Modify: `src/core/knowledge/VaultHealthService.ts:596-602` Subquery `SELECT DISTINCT path FROM vectors WHERE chunk_index = 0` durch VectorStore-Methode ersetzen. Da die ursprüngliche SQL eine NOT IN-Klausel hat, prüfen ob ein Set-basierter Reader (`getNoteVectorPaths({chunkIndex: 0})`) ergänzt werden muss oder ob die existierende Query intern um den Domain-Filter ergänzt wird
- Modify: passender Test in `__tests__/VaultHealthService.format.test.ts`
  - RED: `checkWeakClusters` ignoriert Tracing-Eintraege beim Cluster-Membership-Check
  - GREEN: Umstellung läßt Test passieren
- Verify: `npx vitest run VaultHealthService`

**Task 2.3: cleanupStubVectors entdriften**

- Modify: `src/core/semantic/SemanticIndexService.ts:589-602` (`cleanupStubVectors`)
  - `vectorStore.getStubCandidatePaths(...)` liefert jetzt schon nur `domain = 'note'`-Pfade
  - Entferne `if (p.startsWith('session:') || p.startsWith('episode:')) continue;` (Zeile 596)
- Add test: `src/core/semantic/__tests__/cleanupStubVectors.test.ts` oder neue Datei
  - RED: Test prüft per Source-Inspect (regex auf `startsWith('session:')`), dass der lokale Filter aus SemanticIndexService.ts:596 nicht mehr existiert (Drift-Pin)
  - GREEN: nach Entfernen schlägt der Pin in die Pin-Erwartung um
- Verify: `npx vitest run cleanupStubVectors`

### Welle 3: Writer-Migration (vier Stellen in SemanticIndexService)

**Task 3.1: Note-Writer-Sites auf insertNoteVector**

- Modify: `src/core/semantic/SemanticIndexService.ts:500` und `:636`
  - `this.vectorStore.insertChunks(file.path, ...)` → `this.vectorStore.insertNoteVector(file.path, ...)`
- Verify: vorhandene SemanticIndexService-Tests laufen weiter

**Task 3.2: Session-Writer-Site auf insertSessionVector**

- Modify: `src/core/semantic/SemanticIndexService.ts:1020`
  - `this.vectorStore.insertChunks(\`session:${sessionId}\`, ...)` → `this.vectorStore.insertSessionVector(sessionId, ...)`
  - VectorStore-Methode setzt intern den `session:${id}`-Pfad
- Test: ein Integrationstest, der den Session-Insert über die neue API laufen lässt und in der DB `domain = 'session'` plus `path = 'session:${id}'` verifiziert

**Task 3.3: Episode-Writer-Site auf insertEpisodeVector**

- Modify: `src/core/semantic/SemanticIndexService.ts:1059`
  - `this.vectorStore.insertChunks(\`episode:${episodeId}\`, ...)` → `this.vectorStore.insertEpisodeVector(episodeId, ...)`
  - VectorStore-Methode setzt intern den `episode:${id}`-Pfad
- Test: gleiches Pattern wie 3.2 für Episodes

### Welle 4: ESLint-Regel (Drift-Schutz)

**Task 4.1: no-restricted-syntax-Regel für direkten `vectors`-Zugriff**

- Modify: `eslint.config.mjs`
  - Neuer Eintrag `no-restricted-syntax` mit selector, der raw SQL-String-Literale matcht, die `'vectors'` als Tabellennamen verwenden (Heuristik mit Regex `/\bFROM\s+vectors\b/i` und `/\bINSERT\s+INTO\s+vectors\b/i`)
  - Datei-Ausnahmen: `src/core/knowledge/VectorStore.ts`, `src/core/knowledge/KnowledgeDB.ts` (Helper-Heimat plus Migration)
  - Message: "Direct access to the `vectors` table is forbidden outside the VectorStore helper. Use the domain-typed methods (findNoteVectors, insertSessionVector, ...) or findVectors({domain?}) for cross-layer queries. See ADR-137."
- Add test: `src/__tests__/eslintConfig.audit034-vectors-rule.test.ts`
  - RED: Fixture-File mit `db.exec('SELECT FROM vectors')` in einem anderen Pfad triggert die Regel
  - RED: Fixture-File in `src/core/knowledge/VectorStore.ts`-Pfad triggert die Regel nicht
  - GREEN: ESLint-Konfiguration lässt beide Tests passieren
- Verify: `npx vitest run eslintConfig` plus `npx eslint src/ 2>&1 | grep no-restricted-syntax`

### Welle 5: Integration und Live-Verifikation

**Task 5.1: Volle Suite plus tsc plus build**

- Run: `npm run build` (tsc + esbuild)
- Run: `npx vitest run`
- Erwartet: 0 neue Failures gegenüber Pre-PR-Baseline, alle neu hinzugefügten Tests grün

**Task 5.2: ARCHITECTURE.map und CHANGELOG**

- Modify: `src/ARCHITECTURE.map` Row für `knowledge-vector-store` finalisieren (Pfad jetzt klar: `src/core/knowledge/VectorStore.ts` statt der ARCH-Vermutung `KnowledgeVectorStore.ts`)
- Modify: JSDoc-Header in `src/core/knowledge/VectorStore.ts` um ADR-137-Referenz und Domain-Awareness-Hinweis ergaenzen
- Modify: `memory/MEMORY.md` Eintrag für Schema-Version v12 → v13 plus Hinweis auf `vectors.domain`

**Task 5.3: Live-Verifikation in Sebastian's Vault**

- Manual: Plugin in Obsidian neu laden, KnowledgeDB-Migration läuft beim Open
- Erwartung: 412 Pseudo-Eintraege im Vault-Health-Orphan-Report → 0
- Erwartung: RecallEngine, semantic_search, search_history funktional unverändert
- Migration-Dauer im OperationLogger sichtbar (Erwartung 3-5s bei 10.800 Vektoren)

## Verification gates

```bash
# Build gate (each commit muss diesen Test passieren)
npm run build

# Test gate (volle Vitest-Suite)
npx vitest run

# Lint gate
npx eslint src/

# Live gate (manuell)
# 1. Plugin in Obsidian deployen
# 2. Vault Health Check öffnen
# 3. Orphan-Zaehler ablesen (Erwartung: 412 → wenige echte Orphans)
```

## Coverage Gate (binding, runs before status flips to Active)

| SC | Mapped Task(s) |
|---|---|
| SC-01 (0 Pseudo-Eintraege) | Task 2.1 + Task 2.2 + Task 5.3 (Live) |
| SC-02 (Recall-Top-10-Diff <= 5%) | Task 5.1 (Suite) + Task 5.3 (Live mit ad-hoc Vergleich) |
| SC-03 (Migration <= 30s) | Task 1.2 (Migration) + OperationLogger-Logging |
| SC-04 (Idempotenz) | Task 1.2 (Idempotenz-Test) |
| SC-05 (Build-Zeit-Garantie) | Task 4.1 (ESLint-Regel) |
| SC-06 (RecallEngine-Latenz <= +10%) | Task 5.1 (Suite) + Task 5.3 (Live) |

| ADR | Mapped Task(s) |
|---|---|
| ADR-136 (Diskriminator + Migration) | Task 1.1 + Task 1.2 + Task 1.3 |
| ADR-137 (Helper + Lint) | Task 1.3 + Task 4.1 |
| ADR-77 Amendment | Task 5.2 (MEMORY.md) |

Keine SCs deferred. Keine ADR-Decision-Gaps. Codebase-Anchoring: jede Task nennt mindestens einen konkreten Pfad. Verification-Gates: drei Befehle (build, vitest, eslint) plus eine Live-Verifikation.

## Change Log

| Date | Trigger | Note |
|---|---|---|
| 2026-06-22 | initial | PLAN-41 angelegt, basiert auf plan-context-feat-03-27.md plus ARCH-Reconciliation in /coding Phase 2a (VectorStore existiert bereits, HistoryIndexer/FactStore nicht betroffen, .bak ersetzt expliziten Pre-Migration-Snapshot). |

## Implementation Notes

(zu fuellen waehrend der Implementation: per-Task Commit-SHA, Deviation-Summary, Test-Count-Delta, Cycle-Time, Wayfinder-Updates)
