---
id: FEAT-03-27
title: Tracing-Layer-Trennung in der KnowledgeDB
epic: EPIC-03
priority: P1
effort: M
asr-refs: [ASR-03-27-01, ASR-03-27-02]
adr-refs: []
depends-on: [FEAT-03-15, FEAT-03-20]
created: 2026-06-22
---

# Feature: Tracing-Layer-Trennung in der KnowledgeDB

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-03-27
> (status, phase, claim, last-change live there).

## Feature description

Die KnowledgeDB speichert heute zwei semantisch unterschiedliche Inhaltsarten in derselben `vectors`-Tabelle: vault-resident Notes (echte `.md`-Files unter Pfaden wie `Notes/Foo.md`) und KnowledgeDB-interne Tracing-Einträge (Sessions als `session:YYYY-MM-DD-xxxx`, Episodes als `episode:ep-xxxx`, plus die kommenden URI-Schemas für Facts, Mentions, Threads und Entities aus Memory v2 Phase 1+). Diese Vermischung produziert in Konsumenten der Tabelle systematische Fehler: der Vault Health Check meldet seit Memory v2 Phase 6 (HistoryDB + search_history) 412 "orphaned notes", von denen rund 400 Pseudo-Einträge ohne Vault-Bezug sind. Die heutige Korrektur ist ein lokaler `path.startsWith('session:')`-Filter an einer Stelle (SemanticIndexService.ts:596), der das Problem an genau diesem Aufrufpunkt verbirgt aber an jeder anderen Konsumenten-Stelle erneut auftaucht.

Das Feature führt eine harte Layer-Trennung an der Datenbasis ein: ab Schema v13 unterscheidet die KnowledgeDB pro Vector-Eintrag, ob er ein User-Vault-Objekt oder ein interner Tracing-Eintrag ist. Alle bestehenden Konsumenten (Vault Health, RecallEngine, MemoryRetriever, semantic_search, search_history, Stigmergy-Episode-Reader) lesen ab dann nur den jeweils zuständigen Layer und sehen den anderen nie. Die Tool-API (`recall_memory`, `search_history`, `mark_for_memory`, `semantic_search`) bleibt unverändert, Migration v12 -> v13 ist additiv und idempotent. Das ist die Wurzellösung statt der Symptom-Filter aus FIX-19-01-05.

## Benefits hypothesis

**We believe that** eine harte Trennung von User-Vault-Objekten und KnowledgeDB-internen Tracing-Einträgen an der Datenbasis

**delivers the following measurable outcomes:**

- Vault Health Check zeigt nur noch echte vault-resident Orphan-Notes, keine Tracing-Pseudo-Einträge mehr (target: 0 Pseudo-Einträge in der Orphan-Liste bei einem typischen Vault mit mehreren hundert Sessions + Episodes)
- Neue Konsumenten der `vectors`-Tabelle können nicht versehentlich Tracing-Einträge als Notes interpretieren (verifiziert durch Schema-Constraint statt Code-Review-Disziplin)
- Schema-Migration v12 -> v13 läuft idempotent durch, ohne dass User ihren Vault-Index neu aufbauen müssen

**We know we are successful when:**

- Im Vault Health Check eines typischen Vaults (Sebastian's vault, Stand 2026-06-22) sind 0 von 412 gemeldeten Orphan-Einträgen Pseudo-Pfade
- Die bestehenden Tool-Aufrufe `recall_memory`, `search_history`, `semantic_search`, `mark_for_memory` liefern semantisch identische Ergebnisse vor und nach der Migration (gemessen über Recall-Top-10-Diff auf einem Snapshot-Set von 30 Test-Queries)
- Der zentrale `path.startsWith('session:') || path.startsWith('episode:')` Filter aus SemanticIndexService.ts:596 ist nicht mehr nötig und entfernt
- RecallEngine-Latenz für Mixed-Layer-Queries (vault + memory) bleibt innerhalb +/-10% der Baseline vor der Migration

## Jobs to be Done (from User-Dialog 2026-06-22)

> Referenziert nicht eine formale BA-Section, sondern den User-Dialog der die Phase angestoßen hat. Die Jobs sind aus dem dort beschriebenen Verständnis abgeleitet.

| Job type   | Job                                                                                  | Addressed in story |
|------------|--------------------------------------------------------------------------------------|--------------------|
| Functional | Den eigenen Vault als saubere Wissensbasis pflegen können, ohne dass interne Tracing-Schichten die Sicht stören | Story 1 |
| Emotional  | Dem Health Check vertrauen können, weil seine Befunde echte Vault-Realität zeigen statt Plumbing | Story 2 |
| Social     | Den eigenen Vault als kuratierte Knowledge-Base vorzeigen können, ohne dass interne Plugin-IDs in Orphan-Listen auftauchen | Story 3 |

## User stories

### Story 1: Health Check zeigt nur echte Notes (Functional Job)

**As a** Power-User mit Zettelkasten oder vergleichbarer Wissensbasis
**I want to** im Vault Health Check unter Orphans nur `.md`-Dateien sehen, die in meinem Vault auch existieren
**so that** I can accomplish die kuratorische Arbeit am Vault, ohne dass jedes Re-run hunderte Pseudo-Einträge wieder vor mir liegen

### Story 2: Health-Check-Vertrauen (Emotional Job)

**As a** Power-User
**I want to** dem Health-Check-Report blind vertrauen können, dass jeder Orphan-Eintrag eine reale kuratorische Entscheidung ist
**so that** I experience das Tool als Hilfe statt als Quelle von Noise, die ich erst rausfiltern muss

### Story 3: Vault als kuratierte Basis (Social Job)

**As a** Power-User der seinen Vault gelegentlich anderen zeigt
**I want to** dass der Health-Check keine Plugin-internen Strukturen (Episodes, Sessions, Facts) als Notes klassifiziert
**so that** I am perceived als jemand der eine sauber strukturierte Wissensbasis führt, nicht jemand mit hunderten "broken" Notes

---

## Success criteria (tech-agnostic)

> Keine Technologie-Begriffe. Schema-Migration, sql.js, Spalten und Tabellen sind in den Technical NFRs unten erlaubt.

| ID    | Criterion                                                                                  | Target                                  | Measurement |
|-------|--------------------------------------------------------------------------------------------|-----------------------------------------|-------------|
| SC-01 | Vault Health Check zeigt unter Orphans nur Einträge, die im Vault als File existieren     | 0 Pseudo-Einträge bei typischem Vault  | Manueller Re-Run im User-Vault nach Migration, Vergleich gegen Baseline-Report vom 2026-06-22 |
| SC-02 | Bestehende Memory- und Search-Tools liefern semantisch gleiche Ergebnisse                  | Recall-Top-10-Diff <= 5% auf 30 Queries | Vergleich Pre- und Post-Migration-Snapshots auf einem festen Test-Set |
| SC-03 | Migration läuft für einen typischen Vault innerhalb einer Pluginstart-Sequenz            | <= 30 Sekunden bei einem Vault mit 5000 Notes + 1000 Sessions + 5000 Episodes | Zeit-Messung im OperationLogger während onload |
| SC-04 | Migration ist idempotent (wiederholte Anwendung ändert das Ergebnis nicht)                 | Zweite Anwendung produziert 0 Schreibvorgänge | Migration-Logs zählen Schreib-Operationen auf zweitem Lauf |
| SC-05 | Tracing-Einträge können nach Migration nicht versehentlich als Vault-Notes interpretiert werden | Build-Zeit-Garantie (Type oder Constraint) | TypeScript-Compiler oder DB-Constraint reicht aus, kein Runtime-Check nötig |
| SC-06 | RecallEngine-Latenz bleibt für Mixed-Layer-Queries innerhalb 10% der Baseline             | <= +10% gegen Baseline                  | Vorhandene RecallEngine-Bench-Suite (FEAT-03-15 hat eine Baseline) |

---

## Technical NFRs (for the architect): technology terms allowed

### Performance

- Migration v12 -> v13: linearer Scan über `vectors` und `edges`, maximal eine Vault-Index-Laufzeit (~30s bei 5000 Notes)
- Lookup nach Migration: Index auf der Diskriminator-Spalte oder Tabellen-Routing muss `O(log n)`-Reads gewährleisten, kein Full-Scan pro Konsumenten-Query
- KnowledgeDB-File-Größe darf maximal 5% gegenüber heutigem Stand wachsen (zusätzliche Spalten plus Index)

### Security

- Migration erbt SafeStorage-Schutzschicht der KnowledgeDB unverändert
- Backups vor Migration: Daily-Snapshot-Mechanik aus FEATURE-0314 (Storage-Mode `local`) muss vor der Migration ein Snapshot-File schreiben
- Kein neuer Trust-Boundary-Crossing (keine neuen externen Calls in der Migration)

### Scalability

- Datenvolumen: muss auch für Vaults mit 50.000 Sessions plus 50.000 Episodes lauffähig bleiben (das ist eine mögliche Endausbaustufe über zwei Jahre kontinuierlichen Plugin-Use)
- Wachstumsrate: Sessions akkumulieren mit ca. 1 pro Chat-Session, Episodes mit ca. 10 pro Tag bei aktivem Stigmergy-Use. Schema muss diese Mengen unterstützen ohne Re-Migration

### Availability

- Plugin-Start-Verfügbarkeit: Migration darf den Plugin-Load nicht länger als 30 Sekunden blockieren (siehe SC-03), sonst verzögert es Obsidian-Startup
- Migration-Failure-Mode: bei Crash mitten in der Migration muss der nächste Plugin-Start die Migration neu starten können (Idempotenz aus SC-04 macht das möglich)
- Lock-File-Mechanik aus FEATURE-0314 verhindert parallele Plugin-Instanzen während Migration

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR-03-27-01:** Schema-Migration ohne User-Re-Index der Vault-Vektoren

- Why ASR: ein Re-Index dauert auf großen Vaults Stunden (Sebastian's Vault: ca. 10.800 Vektoren). Wenn die Migration einen Re-Index erzwingt, ist sie de-facto release-blocking. Diese Anforderung schränkt die Wahl zwischen Tabellen-Namespace und Spalten-Diskriminator ein.
- Impact: betrifft die Wahl zwischen ADR-A "neuer Tabellen-Namespace pro Layer" und ADR-B "Spalten-Diskriminator auf `vectors`". Tabellen-Namespace zwingt zu Daten-Verschiebung, Spalten-Diskriminator nicht.
- Quality attribute: Performance + Availability (Plugin-Start-Zeit)

**CRITICAL ASR-03-27-02:** Tool-API-Kompatibilität über die Migration hinweg

- Why ASR: `search_history`, `recall_memory`, `mark_for_memory`, `semantic_search` werden vom Agent als externes Vertrags-Interface genutzt. Eine Änderung der zurückgegebenen URI-Schemas (`session://`, `episode://`, `vault://`) würde Recipes, Memory-Konventionen und Test-Set-Vergleichbarkeit brechen.
- Impact: ADR muss explizit feststellen, dass die URI-Schemas auf der API-Oberfläche unverändert bleiben, selbst wenn die internen Speicher-Felder umbenannt werden.
- Quality attribute: Compatibility

**MODERATE ASR-03-27-03:** Reader/Writer-Site-Vollständigkeit

- Why ASR: vergessene Konsumenten der `vectors`-Tabelle kompromittieren die Layer-Trennung still. Ein einzelner übersehener Pfad genügt, um Vault Health wieder mit Pseudo-Orphans zu fluten.
- Impact: ADR oder PLAN muss eine vollständige Reader/Writer-Liste enthalten plus einen Test, der das Auftauchen neuer Reader/Writer im Code-Review erzwingt (z.B. Lint-Regel, Helper-Funktion als einzigen Zugang)
- Quality attribute: Maintainability

### Constraints

- Technology: bestehende sql.js WASM Engine (Schema-Version v12 als Ausgangspunkt), keine Engine-Änderung
- Platform: Obsidian-Plugin-Runtime (Electron), KnowledgeDB liegt unter `.vault-operator/data/knowledge.db`
- Compliance: keine zusätzliche Anforderung; bestehende SafeStorage-Schutzschicht erbt

### Open questions for architect

- **Diskriminator-Variante:** Spalten-Diskriminator (`vectors.domain TEXT`) versus separater Tabellen-Namespace (`note_vectors`, `session_vectors`, `episode_vectors`, ...). Welche skaliert besser auf den projizierten Endausbau (50.000 Sessions plus 50.000 Episodes)?
- **Migration in-place:** können die bestehenden Einträge ihren Diskriminator-Wert aus dem Pfad-Prefix ableiten (`session:` -> `domain = 'session'`), oder ist ein Re-Insert nötig?
- **Edges-Tabelle:** muss auch `edges` einen Diskriminator bekommen, oder reicht die FK-Beziehung auf `vectors`?
- **URI-Schemas im RecallHit:** bleiben sie als `session://`, `episode://`, `vault://` auf der API-Oberfläche oder wird der Diskriminator-Wert direkt exponiert? ASR-03-27-02 will Kompatibilität -- ADR muss das Mapping explizit machen.
- **Reader/Writer-Coverage:** wie wird sichergestellt, dass künftige Konsumenten der KnowledgeDB den Layer-Filter nicht vergessen? Helper-Funktion, Lint-Regel, oder Tabellen-Trennung als Build-Zeit-Garantie?
- **Reranker-Index:** der Cross-Encoder-Reranker aus Retrieval Wave 1 sieht heute alle Vektoren -- muss er die Layer-Trennung respektieren oder bewusst überbrücken (z.B. für Episode-getriebene Recall-Anreicherung)?

---

## Definition of Done

### Functional

- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria SC-01 bis SC-06 erfüllt (verifiziert)
- [ ] Live-Verifikation in Sebastian's Vault: Pseudo-Orphan-Zähler von 412 auf 0 reduziert
- [ ] Bestehender lokaler Filter aus SemanticIndexService.ts:596 entfernt (Drift-Vermeidung)

### Quality

- [ ] Unit Tests: Migration-Helper hat dedizierten Test für Idempotenz + Pfad-Prefix-Inferenz
- [ ] Integration Tests: Vault-Health-Check + RecallEngine laufen auf Pre- und Post-Migration-Snapshot mit gleichem Ergebnis (modulo SC-02 Toleranz)
- [ ] Security Scan: keine neuen H/M-Findings im Folge-Audit
- [ ] Performance Tests: RecallEngine-Latenz innerhalb +10% der Baseline (SC-06)

### Documentation

- [ ] Backlog row updated auf Status `Done`, Commit-SHA recorded
- [ ] ARCHITECTURE.map updated falls ein neuer Entry-Point landet (z.B. neuer Domain-Konstanten-Helper)
- [ ] ADR für Diskriminator-Variante akzeptiert
- [ ] MEMORY.md für Schema-Version v12 -> v13 aktualisiert

---

## Hypothesis validation (if applicable)

Diese Feature validiert keine kritische Hypothese aus einer BA, weil sie aus einem User-Dialog statt einer formellen BA-Section abgeleitet ist. Die Benefits-Hypothese oben ist die Grundlage für die Erfolgsmessung.

---

## Dependencies

- **FEAT-03-15 (Memory-Engine-Foundation):** liefert die `facts`/`edges`/`styles`/`audit`-Tabellen-Schicht. Wenn FEAT-03-15 bereits einen Layer-Konstanten-Apparat hat, baut FEAT-03-27 darauf auf statt parallel zu definieren.
- **FEAT-03-20 (History Search):** liefert die HistoryDB + HistoryIndexer-Infrastruktur, in der die `session:`-URIs erzeugt werden. FEAT-03-27 muss die HistoryDB-Writer-Site in die Reader/Writer-Liste aufnehmen.

## Assumptions

- Bestehende SafeStorage- und Lock-File-Mechanik aus FEATURE-0314 ist auch bei Migration v12 -> v13 wirksam
- sql.js WASM Engine bleibt unverändert; Migration läuft komplett im bestehenden Storage-Layer
- Sebastian's Vault als Referenz-Test-Vault hat 412 gemeldete Orphans (Baseline vom 2026-06-22), davon erwartet ca. 400 Pseudo-Einträge

## Out of scope

- Memory v2 Phase 1+ Rewrite (`facts`, `fact_edges`, `history_chunks` als separate Tabellen) -- das ist FEAT-03-15 Territory, FEAT-03-27 ist nur die additive Layer-Trennung auf der bestehenden Schicht
- URI-Schema-Änderung auf der Tool-API-Oberfläche -- bleibt explizit unverändert (ASR-03-27-02)
- Performance-Optimierung der RecallEngine über die Migration hinaus -- separate Initiative falls Bench zeigt das es nötig wäre
- UI-Änderungen am Vault Health Check (Modal, Settings) -- der bestehende Health Check liefert nach der Migration korrekte Ergebnisse ohne UI-Anpassung
- Migration v13 zurück auf v12 (Rollback): kein Reverse-Migration-Pfad. User-Bedarf bei Schema-Korruption durch Daily-Snapshots aus FEATURE-0314 abgedeckt

---

## Code Pointer (optional, may go stale)

> Der Wayfinder (`src/ARCHITECTURE.map`) ist die Quelle für aktuelle Pfade.

ARCHITECTURE.map concepts: `knowledge-db`, `semantic-index`.

Die heutigen Reader/Writer-Sites, die das ADR enumerieren muss (Stand 2026-06-22):

- Writers in `vectors`: `SemanticIndexService.insertChunks`, `HistoryIndexer.writeChunks`, `Stigmergy-Episode-Writer` (sucht in `src/core/stigmergy/`), `FactStore.commit*` (falls FEAT-03-15 schon existiert)
- Readers von `vectors`: `VaultHealthService.checkOrphans` plus weitere Check-Methoden, `RecallEngine` (`src/core/memory/`), `MemoryRetriever`, `semantic_search` Tool, `search_history` Tool
- Lokaler Filter heute: `SemanticIndexService.ts:596` (`if (p.startsWith('session:') || p.startsWith('episode:')) continue;`) -- der Drift-Trigger, der durch FEAT-03-27 obsolet wird
