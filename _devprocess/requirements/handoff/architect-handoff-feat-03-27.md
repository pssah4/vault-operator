# Architect Handoff for FEAT-03-27 (Tracing-Layer-Trennung in der KnowledgeDB)

> Handoff document from `/requirements-engineering` to `/architecture`.
> Single-Feature-Scope. Aggregiert die zwei CRITICAL ASRs, die NFR-Targets
> und die offenen ARCH-Fragen.

**Status:** Ready for Architect
**Last update:** 2026-06-22
**Author:** sebastian-claude-opus-4-7

---

## 1. Scope

- **Scope:** Memory v2 Phase 7 Haertung, single FEATURE
- **Main goal:** Vault Health Check zeigt nur echte vault-resident Notes, KnowledgeDB-interne Tracing-Eintraege (Sessions, Episodes, Facts, Mentions, Threads, Entities) sind hart getrennt
- **Target release:** v2.15.0 oder v2.14.16, Effort 1 Woche
- **Branch:** feature/tracing-layer-separation (von dev d91c1de1)

## 2. Architecturally Significant Requirements (ASRs)

| ID | Source FEATURE | Classification | Constraint | Notes |
|---|---|---|---|---|
| ASR-03-27-01 | FEAT-03-27 | Critical | Schema-Migration ohne User-Re-Index der Vault-Vektoren | Erzwingt die Wahl Spalten-Diskriminator vor Tabellen-Namespace bei der ADR-Entscheidung, weil Letzteres Daten-Verschiebung erfordert |
| ASR-03-27-02 | FEAT-03-27 | Critical | Tool-API-Kompatibilitaet ueber die Migration hinweg (`recall_memory`, `search_history`, `mark_for_memory`, `semantic_search`, `RecallHit.uri`) | URI-Schemas `session://`, `episode://`, `vault://`, `fact://` bleiben auf der API-Oberflaeche unveraendert |
| ASR-03-27-03 | FEAT-03-27 | Moderate | Reader/Writer-Site-Vollstaendigkeit | Schema-Constraint, Helper-Funktion oder Lint-Regel muss verhindern dass kuenftige Konsumenten den Layer-Filter vergessen |

## 3. Non-Functional Requirements summary

| Category | Target | Source FEATURE |
|---|---|---|
| Performance (Migration-Dauer) | <= 30s bei 5000 Notes + 1000 Sessions + 5000 Episodes (SC-03) | FEAT-03-27 |
| Performance (Lookup nach Migration) | O(log n) Reads, kein Full-Scan pro Konsumenten-Query | FEAT-03-27 |
| Performance (RecallEngine-Latenz Mixed-Layer) | <= +10% gegen Baseline (SC-06) | FEAT-03-27 |
| Scalability (Datenvolumen) | 50.000 Sessions plus 50.000 Episodes ohne Re-Migration | FEAT-03-27 |
| Scalability (DB-File-Groesse) | <= +5% gegenueber heutigem Stand | FEAT-03-27 |
| Availability (Plugin-Start) | Migration blockiert Plugin-Load <= 30s | FEAT-03-27 |
| Availability (Failure-Mode) | Bei Crash mitten in Migration startet naechster Plugin-Start sauber neu (Idempotenz aus SC-04) | FEAT-03-27 |
| Compatibility (Tool-API) | `recall_memory`, `search_history`, `mark_for_memory`, `semantic_search` liefern semantisch gleiche Ergebnisse (Top-10-Diff <= 5%, SC-02) | FEAT-03-27 |
| Security | SafeStorage-Schutzschicht unveraendert, kein neuer Trust-Boundary-Crossing | FEAT-03-27 |

## 4. Constraints

- **Stack constraints:** bestehende sql.js WASM Engine bleibt unveraendert. Keine neue DB-Engine, keine externen Storage-Komponenten.
- **Integration constraints:** Daily-Snapshot-Mechanik aus FEATURE-0314 muss vor Migration ein Snapshot-File schreiben. Lock-File-Mechanik aus FEATURE-0314 verhindert parallele Plugin-Instanzen waehrend Migration.
- **Operational constraints:** Migration laeuft in `onload` der Plugin-Klasse, kein Background-Job, kein separater Migrations-Worker. User darf Obsidian nicht waehrend Migration killen (Lock-File faengt ein Wiederanlaufen ab).
- **Team constraints:** Single-Owner-Implementation, kein Team-Hand-Off. Drift-Schutz muss in den Helper oder die Schema-Trennung eingebaut sein, nicht auf Code-Review-Disziplin verlassen.

## 5. Open Questions

Sechs offene Fragen, die der Architekt im ADR loesen muss:

1. **Diskriminator-Variante:** Spalten-Diskriminator (`vectors.domain TEXT NOT NULL DEFAULT 'note'`) versus separater Tabellen-Namespace (`note_vectors`, `session_vectors`, `episode_vectors`, ...). Welche skaliert besser auf 50.000 + 50.000 Datensaetze, welche ist einfacher zu migrieren? ASR-03-27-01 favorisiert Spalten-Diskriminator, weil Tabellen-Namespace Daten-Verschiebung erzwingt.

2. **Migration in-place vs Re-Insert:** koennen die bestehenden Eintraege ihren Diskriminator-Wert aus dem Pfad-Prefix ableiten (`session:` -> `domain = 'session'`, `episode:` -> `'episode'`, sonst `'note'`), oder ist ein Re-Insert noetig? Pfad-Prefix-Inferenz waere idempotent und ohne Daten-Verschiebung, aber sie verlaengert die heutige Pfad-Konvention zur impliziten Schema-Annahme.

3. **Edges-Tabelle:** muss `edges` auch einen Diskriminator bekommen, oder reicht die FK-Beziehung auf `vectors`? Wenn `edges` cross-layer-Verknuepfungen erlaubt (z.B. ein Fact zeigt auf eine Note), wo wird das gespeichert?

4. **URI-Schemas im RecallHit:** bleiben sie als `session://`, `episode://`, `vault://`, `fact://` auf der API-Oberflaeche, oder wird der Diskriminator-Wert direkt exponiert? ASR-03-27-02 will Kompatibilitaet -- ADR muss das Mapping explizit machen.

5. **Reader/Writer-Coverage:** wie wird sichergestellt, dass kuenftige Konsumenten der KnowledgeDB den Layer-Filter nicht vergessen? Drei Optionen: (a) Helper-Funktion als einziger Zugang plus ESLint-Regel die direkten `db.exec("SELECT ... FROM vectors")` verbietet, (b) Schema-Constraint mit Views (`note_vectors`-View, `session_vectors`-View) so dass die Basis-Tabelle nie direkt angesprochen wird, (c) separater Tabellen-Namespace als Build-Zeit-Garantie. Welche passt zur Migration-Strategie aus Frage 1+2?

6. **Reranker-Index:** der Cross-Encoder-Reranker aus Retrieval Wave 1 sieht heute alle Vektoren. Muss er die Layer-Trennung respektieren oder bewusst ueberbruecken (z.B. fuer Episode-getriebene Recall-Anreicherung)? Wenn cross-layer-Reranking erhalten bleibt, muss der Helper aus Frage 5 das explizit anbieten.

## 6. Dialog

> Bidirectional channel between Architect and Requirements Engineer.
> Bei Start: 0 Questions, 0 Answers. Architekt fuegt Q-001 etc bei
> Bedarf.

### Questions from Architect to RE

| ID | Date | Question | Addressed by | Status |
|---|---|---|---|---|

(leer bei RE-Abschluss)

### Answers from RE

| ID | Date | Answer | Affected artifacts | Status |
|---|---|---|---|---|

(leer bei RE-Abschluss)

### Dialog rules

- **Not a blocker.** Pending entries stop nur die ADRs, die von einer offenen Frage abhaengen.
- **Try to self-answer first.** Architekt versucht zuerst aus Codebase und MEMORY.md zu antworten, bevor er den User fragt.
- **One question per session to the user.** Aggregiert mehrere offene Punkte zu einer AskUserQuestion-Session-Aufmacher.
- **Append-only.** Antworten setzen Status auf Resolved, nichts wird geloescht.

---

## 7. Ready-to-design checklist

- [x] Beide Critical ASRs haben quantifizierte Constraints (Migration-Dauer 30s, Top-10-Diff 5%, Latenz +10%)
- [x] NFR-Tabelle hat Zahlen statt Adjektive (30s, 5000 Notes, 50.000 Sessions, 5% File-Groesse, +10% Latenz, etc.)
- [x] FEAT-03-27 ist die einzige Source-FEATURE und durchgaengig referenziert
- [x] Open Questions klassifiziert: alle sechs sind async, keine ist ein Blocker fuer den Architekt-Start (die Diskriminator-Variante in Q1 ist die zentrale ARCH-Entscheidung und wird durch das ADR beantwortet)
- [x] Handoff im kanonischen Stil (keine Em-Dashes, kein AI-Vokabular, deutsche Umlaute durchgaengig)
