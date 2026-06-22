---
id: ADR-137
title: KnowledgeDB Domain-Access-Pattern (Helper + Lint-Regel)
date: 2026-06-22
deciders: [Sebastian Hanke]
asr-refs: [ASR-03-27-03]
feature-refs: [FEAT-03-27]
related-adrs:
  - ADR-136-knowledgedb-domain-discriminator-and-migration
supersedes: null
superseded-by: null
---

# ADR-137: KnowledgeDB Domain-Access-Pattern

## Context

ADR-136 entscheidet, dass die Layer-Trennung der KnowledgeDB als Spalten-Diskriminator `vectors.domain` implementiert wird. Die Schwäche dieser Variante gegenüber einer Tabellen-Namespace-Lösung ist die fehlende Build-Zeit-Garantie: ein Reader kann theoretisch direkt `SELECT path FROM vectors` ohne `WHERE domain = ?` schreiben und versehentlich Tracing-Einträge als Notes verarbeiten. Genau diese Drift hat über die letzten Monate das 412-Pseudo-Orphans-Problem erzeugt.

Die Frage ist, wie der Layer-Filter so verankert wird, dass künftige Konsumenten ihn nicht vergessen können. Drei Mechaniken stehen zur Wahl: eine Helper-Funktion als zentraler Zugang, eine Lint-Regel als verbindlicher Code-Style, oder eine Kombination aus beiden. Eine reine Sichtbarkeits-Maßnahme (Doc-Hinweis, Code-Comment) genügt nicht, weil der heutige Drift bereits in einer dokumentierten Konvention besteht und trotzdem ueberall ignoriert wird.

Zusätzlich gilt: bestehende Reader und Writer der `vectors`-Tabelle (siehe Reader/Writer-Liste in FEAT-03-27 unter "Code Pointer") müssen auf das neue Pattern migriert werden, ohne dass jeder dieser Konsumenten den Filter selbst neu erfindet.

**Triggering ASR:**
- ASR-03-27-03 (FEAT-03-27): Reader/Writer-Site-Vollständigkeit. Quality attribute: Maintainability.

## Decision drivers

- **Drift-Resistenz auf Build-Zeit-Niveau**: das Pattern muss Drift in künftigen Konsumenten verhindern, idealerweise zur Build-Zeit, mindestens zur Lint-Zeit.
- **Migrations-Kosten der bestehenden Konsumenten**: Refactor-Aufwand soll minimal sein. Reader, die einen Filter heute lokal anwenden, sollen einen One-Liner-Swap bekommen.
- **Lesbarkeit**: der Helper-Aufruf muss am Aufrufpunkt klar sagen, welchen Layer der Reader meint. `findNoteVectors(...)` ist klarer als `findVectors({domain: 'note'})`.
- **Tool-API-Mapping-Konsolidierung**: das interne-zu-extern-Mapping aus ADR-136 (zwischen `domain`-Spalte und URI-Schema) soll an genau einer Stelle leben.
- **Test-Barkeit**: Helper-Methoden sind direkt unit-testbar. Inline-SQL-Statements sind nur durch Integrations-Tests abdeckbar.
- **Kompatibilität mit bestehenden Storage-Schutzschichten**: der Helper darf die Atomic-Write- und Lock-File-Mechanik aus ADR-79 nicht umgehen.

## Considered options

### Option 1: Helper-Klasse mit Domain-typisierten Methoden plus optionale Lint-Regel

Eine neue Klasse `KnowledgeVectorStore` (oder eine bestehende Service-Klasse als Erweiterung) bietet Methoden wie `findNoteVectors`, `findSessionVectors`, `findEpisodeVectors`, `insertNoteVector`, `insertSessionVector` etc. Jede Methode setzt den Diskriminator-Wert intern. Direkte `db.exec("SELECT ... FROM vectors")`-Aufrufe ausserhalb der Klasse werden durch eine ESLint-Regel verboten. Die Lint-Regel ist additiv: bestehende Konsumenten werden nach und nach umgezogen, die Regel wird nach abgeschlossener Migration verbindlich.

- Pro: Build-Zeit-Garantie über die Lint-Regel. Direkter SQL-Zugriff auf `vectors` ausserhalb der Helper-Klasse triggert Lint-Error.
- Pro: Tool-API-Mapping ist an einer Stelle. Externes URI-Schema bleibt extern, interner `domain`-Wert lebt nur im Helper.
- Pro: Test-Barkeit: die Helper-Methoden sind direkt unit-testbar mit einer In-Memory-DB.
- Pro: Refactor der bestehenden Reader ist ein One-Liner pro Aufrufstelle. `db.exec("SELECT path FROM vectors WHERE chunk_index = 0")` wird zu `kvs.findVectors({chunkIndex: 0})`, mit klarem Default `domain = 'note'`.
- Con: Die Lint-Regel ist ein zusaetzlicher Wartungsaufwand. ESLint-Konfigurations-Änderungen können die Regel versehentlich deaktivieren.
- Con: Helper-Klasse bedeutet eine zusätzliche Indirektion für alle bestehenden Konsumenten. Code-Review-Zeit für den Migrations-PR ist nicht trivial.

### Option 2: Reines Helper-Pattern ohne Lint-Regel

Eine Helper-Klasse wie in Option 1, aber ohne Lint-Regel. Konsumenten sollen den Helper nutzen, weil die Doku es sagt. Direkter SQL-Zugriff bleibt syntaktisch erlaubt.

- Pro: Minimal-Implementierung. Nur die Helper-Klasse, keine Lint-Config-Änderung.
- Pro: Code-Review-Aufwand für den Migrations-PR ist niedriger, weil keine Lint-Konfiguration zu validieren ist.
- Con: Drift-Resistenz auf reiner Konventions-Ebene. Genau das Drift-Pattern, das das aktuelle Problem ausgelöst hat. **Verstoß gegen den Geist von ASR-03-27-03.**
- Con: Kein Mechanismus, der einen künftigen Autor zwingt, den Helper zu nutzen. Code-Review als einzige Sicherung ist erfahrungsgemäß unzuverlässig.

### Option 3: View-basierte Trennung statt Helper

Statt eines Helpers werden SQL-Views (`note_vectors`, `session_vectors`, ...) angelegt. Konsumenten gehen über die View. Eine Lint-Regel verbietet `SELECT ... FROM vectors` in Reader-Pfaden.

- Pro: SQL-nahe Sichtbarkeit. Konsumenten lesen `SELECT ... FROM session_vectors` und sehen unmittelbar welchen Layer sie ansprechen.
- Pro: Keine TypeScript-Indirektion notwendig, raw SQL-Strings bleiben raw.
- Con: SQLite-Views in sql.js sind read-only. Writer müssen weiterhin auf die Basis-Tabelle schreiben, was die Layer-Garantie für Schreib-Pfade aufweicht. Damit ist die Garantie asymmetrisch und schwer zu kommunizieren.
- Con: Tool-API-Mapping (`domain` interne Spalte versus `session://` externes URI) muss separat in der Application-Logik leben, doppelte Wahrheit.
- Con: Unit-Test-Barkeit ist schwächer als bei einem TypeScript-Helper.
- Con: Lint-Regel auf raw-SQL-Strings ist heuristischer als eine Regel auf Imports/Aufrufe. False-Positives wahrscheinlicher.

## Decision

**Proposed option:** Option 1 (Helper-Klasse plus Lint-Regel).

**Reasoning:**
Option 1 ist die einzige Variante, die echte Drift-Resistenz liefert und gleichzeitig die Tool-API-Mapping-Konsolidierung aus ADR-136 an einer Stelle haelt. Der zusätzliche Wartungsaufwand für die Lint-Regel ist im Vergleich zu den Folgekosten von wiederkehrendem Drift (412-Pseudo-Orphans-Welle) gering. Option 2 wiederholt den heutigen Drift-Mechanismus, Option 3 hat zu viele Schwächen (asymmetrische Writer-Garantie, doppeltes Tool-API-Mapping).

Konkret schlaege ich vor: eine Helper-Klasse `KnowledgeVectorStore` (Namen ist Vorschlag, /coding verfeinert), die folgende Aufgaben uebernimmt:

1. Typisierte Methoden pro Domain: `findNoteVectors`, `findSessionVectors`, `findEpisodeVectors`, `findFactVectors`, `findMentionVectors`, `findThreadVectors`, `findEntityVectors`, jeweils mit den heute genutzten Filter-Parametern (`chunkIndex`, `pathLike`, `withinDistance`, etc.).
2. Eine generische `findVectors({domain, ...})` für Cross-Layer-Queries (Reranker, kombinierte Recall). Der Parameter `domain` ist optional; wenn weggelassen, sind alle Domains abgefragt (das ist das einzige API, das Cross-Layer-Recall direkt erlaubt).
3. Schreib-Methoden `insertNoteVector`, `insertSessionVector`, ... pro Domain, plus eine Helper-Funktion `uriToDomain(uri: string): Domain`, die das interne-zu-extern-Mapping aus ADR-136 zentralisiert.
4. Eine Domain-Konstante `KNOWLEDGE_DOMAINS = ['note', 'session', 'episode', 'fact', 'mention', 'thread', 'entity'] as const`, die der ESLint-Regel als Wertebereich-Quelle dient.

Die ESLint-Regel ist ein lokaler Plugin-Eintrag, der direkten Zugriff auf `vectors` ausserhalb der Helper-Datei verbietet. Pattern: jeder String-Literal `"vectors"` oder Template-String, der in einer SQL-Position auftaucht, ausserhalb der KnowledgeVectorStore-Datei wird zum Lint-Error. Heuristik mit moeglichen False-Positives, aber die Regel ist disable-bar mit `-- reason` Suffix (entspricht der existierenden Bot-Konvention).

**Note:** Dies ist ein PROPOSAL. Das /coding-Skill faellt die finale Entscheidung auf Basis des realen Codebase-Standes. Insbesondere koennte sich zeigen, dass eine bestehende Service-Klasse (`SemanticIndexService` oder eine Abstraktion in `src/core/storage/`) bereits die richtige Heimat für die Helper-Methoden ist, statt eine separate `KnowledgeVectorStore`-Klasse.

## Consequences

### Positive

- Drift in künftigen Konsumenten der `vectors`-Tabelle wird durch zwei unabhaengige Schutzmechanismen (Helper-Klasse plus Lint-Regel) verhindert. Code-Review wird der dritte Mechanismus, nicht der einzige.
- Tool-API-Mapping aus ADR-136 lebt an einer Stelle (`uriToDomain` plus `domainToUri`), nicht verstreut über alle Konsumenten.
- Unit-Tests für Layer-spezifische Lookups sind direkt am Helper schreibbar, ohne Integrations-Test-Aufwand.
- Bestehende Reader migrieren mit einem One-Liner-Swap pro Aufrufstelle.

### Negative

- Eine zusätzliche TypeScript-Klasse mit unklarem Namensraum (`KnowledgeVectorStore` überlappt thematisch mit `SemanticIndexService` und `KnowledgeDB`). /coding muss entscheiden, ob die Methoden in einer existierenden Klasse landen oder eine neue Klasse rechtfertigt sind.
- Lint-Regel ist heuristisch (matcht raw-SQL-Strings) und kann False-Positives produzieren. Disable-bar mit `-- reason`-Suffix.
- Refactor-PR beruehrt ~10 Aufrufstellen in mehreren Modulen (SemanticIndexService, HistoryIndexer, RecallEngine, MemoryRetriever, VaultHealthService, plus Stigmergy-Episode-Writer und FactStore falls FEAT-03-15 schon existiert).

### Risks

- **Risk:** Die ESLint-Regel laesst sich versehentlich deaktivieren (z.B. durch eine pauschale `eslint-disable` am Datei-Anfang). Mitigation: die Regel ist Teil eines lokalen Plugin-Eintrags, dessen Konfigurations-Änderungen im Code-Review sichtbar sind. Plus ein Unit-Test, der die Regel-Konfiguration assertiert.
- **Risk:** Der Helper koennte sich zu einer Allzweck-DAO-Schicht entwickeln. Mitigation: Scope ist strikt auf Layer-Filter beschraenkt. Komplexere Queries (z.B. Reranker-spezifische Cross-Layer-Joins) gehen über die `findVectors`-Cross-Layer-Methode oder leben weiter in den Service-Klassen.
- **Risk:** Cross-Layer-Reranking (Reranker sieht heute alle Vektoren) koennte unbeabsichtigt eingeschraenkt werden, wenn der Reranker-Code auf eine Layer-spezifische Methode umgezogen wird. Mitigation: explizit ein Test, der den Reranker mit Mixed-Layer-Input fuettert und das alte Verhalten bestaetigt. Der Reranker geht weiterhin über `findVectors` ohne `domain`-Filter.

## Related decisions

- ADR-136: KnowledgeDB Domain-Diskriminator und Migration v12 zu v13. ADR-137 ist die Code-Pattern-Ergänzung zur Schema-Entscheidung in ADR-136.
- ADR-79: KnowledgeDB Härtung. Die Helper-Klasse delegiert Schreib-Operationen an die existierenden Atomic-Write-Wege aus ADR-79, umgeht sie nicht.

## References

- FEAT-03-27 Tracing-Layer-Trennung in der KnowledgeDB
- architect-handoff-feat-03-27.md
- Bot-Konvention zu eslint-disable-Suffix `-- reason` (MEMORY.md Stand 2026-06-22)

---

## Implementation Notes (optional, may go stale)

> Dieser Anhang darf nach Refactoring veralten. Der Wayfinder
> (`src/ARCHITECTURE.map`) bleibt die Quelle für aktuelle Pfade.

**Codebase-Reconciliation 2026-06-22 (durch /coding Phase 2a):**

Die ARCH-Annahme einer NEUEN Klasse `KnowledgeVectorStore` ist gegen die echte Codebase verworfen. `src/core/knowledge/VectorStore.ts` existiert bereits als zentrale Helper-Klasse mit allen direkten SQL-Zugriffen auf die `vectors`-Tabelle. Die Entscheidung wandelt sich von "Neue Klasse anlegen" zu "VectorStore um Domain-Awareness erweitern". Die übrigen ADR-137-Aussagen (Helper plus Lint-Regel, typisierte Methoden pro Domain, Cross-Layer-API, Lint-Regel-Disable mit `-- reason` Suffix) gelten unverändert.

Reale Code-Standorte (Stand 2026-06-22):

- Helper-Klasse: `src/core/knowledge/VectorStore.ts` wird erweitert (nicht neu angelegt). Neue Methoden: `findNoteVectors`, `findSessionVectors`, `findEpisodeVectors`, `findFactVectors`, `findMentionVectors`, `findThreadVectors`, `findEntityVectors` plus `findVectors({domain?})` für Cross-Layer. Insert-Pendants pro Domain.
- ESLint-Regel: Inline-Eintrag in `eslint.config.mjs` über `no-restricted-syntax` mit Pattern, das SQL-String-Literale mit `vectors` als FROM-Target außerhalb von `VectorStore.ts` verbietet. Kein separates Plugin nötig. Disable-bar mit `-- reason` Suffix.
- Direkte SQL-Reader auf `vectors` außerhalb VectorStore (drei Stellen, die migrieren):
  - `VaultHealthService.ts:366` in `checkOrphans` (der konkrete Anlass des Features)
  - `VaultHealthService.ts:596-602` in `checkWeakClusters` (`SELECT DISTINCT path FROM vectors WHERE chunk_index = 0`)
  - `SemanticIndexService.ts:596` in `cleanupStubVectors` (Drift-Filter, wird durch Domain-Awareness obsolet)
  - `KnowledgeDB.ts:597` ist ein `SELECT count(*) FROM vectors` für den Integritäts-Check und bleibt als interne KnowledgeDB-Operation. Die Lint-Regel ignoriert KnowledgeDB.ts plus VectorStore.ts als Helper-Heimat.
- Writer-Sites auf `vectors` (vier Stellen in SemanticIndexService):
  - `SemanticIndexService.ts:500` und `:636` (Note-Pfade, vault-resident)
  - `SemanticIndexService.ts:1020` (`session:${id}`)
  - `SemanticIndexService.ts:1059` (`episode:${id}`)
- Nicht betroffen (entgegen ARCH-Annahme):
  - `HistoryIndexer.writeChunks` schreibt in die `history_chunks`-Tabelle in der separaten `history.db`, NICHT in `vectors`
  - `FactStore.create/update` schreibt in die `facts`-Tabelle in `memory.db`, NICHT in `vectors`
  - Es gibt keinen separaten Stigmergy-Episode-Writer. Episodes werden über `SemanticIndexService.insertChunks(\`episode:${id}\`, ...)` geschrieben.

PLAN-{nn} aus dem aktuellen /coding-Pass enthält die endgültige Task-Liste.
