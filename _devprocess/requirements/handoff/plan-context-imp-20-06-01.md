# Plan-Context for IMP-20-06-01: Claim Check + Review Hints

This document is the context bridge from Architecture into PLAN and Coding for IMP-20-06-01. It pins the tech-stack, the architectural decisions that constrain the implementation, the data model, and the performance and security envelopes.

## Tech-Stack

- **Plugin language**: TypeScript, strict mode (existing).
- **Database**: KnowledgeDB built on sql.js WASM. Atomic save per FIX-12. WriterLock-pflicht vor any `ALTER TABLE`.
- **Mid-tier LLM**: default `claude-haiku-4-5` or `gemini-flash`, routed through the existing provider abstraction in `src/api/providers/`. Pro call ceiling 5000 input + 500 output tokens.
- **Frontier LLM (optional)**: `claude-opus-4-7` or `claude-sonnet-4-6`, only behind `freshness.allowFrontierEscalation` AND the provider's ZDR capability flag.
- **Web search**: existing `WebSearchTool` in `src/core/tools/web/WebSearchTool.ts` mit private `searchBrave`/`searchTavily` Methoden, getrieben durch das `webTools.provider`-Setting (`'brave' | 'tavily' | 'none'`). Der Verifier nutzt einen neuen schlanken `FreshnessWebSearch`-Helper, der die gleichen Provider-Pfade aufruft, ohne ein zweites Settings-Schema. Provider-Auswahl wie heute: User waehlt einen Provider, kein automatischer Fallback. Query-Builder mit 400-Zeichen-Cap.
- **Frontmatter I/O**: existing zentralisierter `FrontmatterWriter` in `src/core/ingest/FrontmatterWriter.ts` mit `WriterLock`-Pattern aus ADR-79 und Conflict-Detection aus ADR-95. Allowlist-Filter im Caller-Closure, der genau den Schluessel `freshness` zulaesst.
- **UI**: Obsidian Plugin Modal-Pattern. `VaultHealthRepairModal` bekommt einen weiteren Tab. Zwei neue Sub-Modal-Klassen (`ResolveConflictModal`, `BatchResolveModal`) erben das bestehende Modal-Pattern dieses Plugins.

## Architecture style and quality goals

- **Style**: additive Erweiterung bestehender Surfaces. Keine neue Top-Level-Subsysteme. Verifier-Pipeline lebt INNERHALB des bestehenden `webUpdatePass`-Hooks aus ADR-105.
- **Quality goal 1 (data privacy)**: Verifier-Pipeline darf keine Note-Inhalte stillschweigend an Provider eskalieren. Fail-closed bei ZDR-Pflicht.
- **Quality goal 2 (cost predictability)**: Token-Budget bleibt im bestehenden Stufe-3-Cap. Kein paralleler Budget-Pot.
- **Quality goal 3 (vault-cleanness)**: Keine Vault-Pollution durch Verdict-Summaries oder Source-Links im Frontmatter. Nur `freshness:`-Property als Label, hart auf der Allowlist gepinnt.
- **Quality goal 4 (compatibility)**: alle Hook- und Schema-Erweiterungen sind additiv. Bestehende Caller funktionieren unveraendert.

## ADR summary

| ADR | Entscheidung | Status | Rolle in IMP-20-06-01 |
|---|---|---|---|
| ADR-135 | Verdict-Confidence-Routing und ZDR-Pflicht | Proposed (2026-06-19) | Neue ADR: Mid-Tier-default, Frontier-Eskalation nur mit ZDR, sonst fail-closed mit Mid-tier-Verdict |
| ADR-95 (amend) | Frontmatter-Write Conflict-Detection | Accepted, amended 2026-06-19 | Verifier nutzt denselben Helper und denselben Lock; neuer Allowlist-Filter pro Aufruf |
| ADR-104 (amend) | Web-Search-Provider BYOK | Accepted, amended 2026-06-19 | Neue `verifierQuery`-Aufruf-Form, 400-Zeichen-Cap, separater `freshness.externalSources.enabled`-Toggle |
| ADR-105 (amend) | Stufe-3 Job-Runner und Token-Budget | Accepted, amended 2026-06-19 | `UpdateFinding.notes?[]` additive Hook-Erweiterung, Verifier inside `webUpdatePass`, NoteSelector reads `freshness_class` |
| ADR-106 (amend) | Health-Modal-Severity und Cooldown | Accepted, amended 2026-06-19 | Aging-knowledge-Tab plus `ResolveConflictModal` und `BatchResolveModal` als Sub-Modale, Verdict-zu-Severity-Mapping |

## Data model: core entities und ihre Veraenderungen

- **`note_freshness`** (existierend, ALTER TABLE v10 nach v11): additive Spalten `last_verdict TEXT`, `last_confidence REAL`, `last_summary TEXT`, `last_sources_json TEXT`, `last_checked_at TEXT`, `last_verifier_tier TEXT`. WriterLock vor ALTER.
- **`note_freshness_history`** (neu, 1:N zu `note_freshness.path`): `(id, path, run_at, verdict, confidence, summary?, sources_json?, verifier_tier, model_id, tokens_used)`. Retention 5 runs OR 90 Tage, default summary und sources_json off (opt-in via Settings).
- **`dismissed_freshness`** (existierend, neuer Reader): Tabelle traegt `(note_path, hint_type, dismissed_at, UNIQUE(note_path, hint_type))`. Neuer Reader filtert User-Quittierungen mit `hint_type='verdict'` aus dem NoteSelector raus. Schreibpfad: INSERT OR REPLACE bei `Mark verified` im ResolveConflictModal.
- **`cluster_metadata.last_external_check`** (existierend, wiederverwendet): Verifier liest und schreibt diese Spalte als Cooldown-Marker. Kein neues Feld.
- **`UpdateFinding`** (existierende TypeScript-Struktur in Stufe-3-Hook): optionales Feld `notes?: NoteVerdict[]`. `NoteVerdict` traegt `path`, `verdict`, `confidence`, `summary`, `sources`, `verifierTier`.

## External integrations

- **Tavily API**: BYOK, Settings-Toggle `freshness.externalSources.enabled` zusaetzlich zum bestehenden `webTools.tavilyApiKey`.
- **Brave API**: BYOK, identisches Pattern wie Tavily.
- **Anthropic/Bedrock/OpenAI**: Mid-tier-Calls ueber existing Provider-Abstraktion. Frontier-Calls nur unter ZDR-Capability-Flag.
- **Model-native Web Search**: explizit out-of-scope, eigene ADR-Erweiterung wenn relevant.

## Performance envelope

- Stage-4-Run pro 1000-Note-Vault: unter 0.10 USD, alignt mit FEAT-20-06 Section "Cost Per Scan".
- Mid-tier-Call pro Note: 5000 Input + 500 Output Token Ceiling.
- NoteSelector default Top-N=5 pro Cluster.
- Aging-knowledge-Tab Load-Zeit: unter 250 ms bei bis zu 200 geflaggten Notes (virtual scroll oder cluster grouping als Pflicht).
- Retention im History-Table: 5 runs ODER 90 Tage pro Note, oldest dropped on insert.

## Security envelope

- Frontier-Eskalation nur mit ZDR-Capability-Flag. Fail-closed, kein silent fallback.
- Verifier-Query an Tavily/Brave: harter 400-Zeichen-Cap, Builder-side enforced, Unit-Test pinnt.
- Frontmatter-Write: harter Allowlist-Filter genau auf `freshness`. Unit-Test pinnt, jeder Drift-PR wird rot.
- `freshness.externalSources.enabled` default off, unabhaengig von `webTools.enabled`.
- `freshness.excludePaths` default-conservative Set (`Private/`, `Personal/`, `Medical/`, `Clients/`); Notes unter diesen Pfaden werden vom Verifier ueberhaupt nicht ausgewaehlt.
- Verdict-Summaries und Source-Listen leben in der DB, nicht im Vault. Backup-UI flagged `knowledge.db` als note-summary-haltig.

## Mobile envelope

- Stage-4-Run nur Desktop.
- Aging-knowledge-Tab read-only auf iOS und Android. Apply, Delete, Bulk-Run sind ausgeblendet; UI zeigt `synced from desktop` Hinweis.
- Persistierte Verdicts werden via knowledge.db-Sync auf Mobile gespiegelt (Storage-Mode `obsidian-sync`).

## Implementation entry points (Wayfinder)

- `src/core/health/FreshnessVerifier.ts` (neu): Stage-4-Pipeline.
- `src/core/health/NoteSelector.ts` (neu): liest `freshness_class`, baut prioritisierten Kandidaten-Stack.
- `src/core/health/FreshnessQueryBuilder.ts` (neu): `verifierQuery`-Builder mit 400-Char-Cap, Unit-Test pinned.
- `src/core/knowledge/KnowledgeDB.ts`: ALTER TABLE v10 nach v11.
- `src/core/health/Stufe3PeriodicJob.ts`: `UpdateFinding.notes?: NoteVerdict[]` additive Hook-Erweiterung.
- `src/ui/modals/VaultHealthRepairModal.ts`: neuer Tab.
- `src/ui/modals/ResolveConflictModal.ts` (neu).
- `src/ui/modals/BatchResolveModal.ts` (neu).
- `src/core/settings/types.ts`: vier neue Settings (`freshness.writeFrontmatter`, `freshness.externalSources.enabled`, `freshness.allowFrontierEscalation`, `freshness.excludePaths`).
- `src/core/health/__tests__/FrontmatterAllowlist.test.ts`: pinned Allowlist-Test.
- `src/core/health/__tests__/FreshnessQueryBuilder.test.ts`: pinned Char-Cap-Test.

## Open items handed to Coding

- Provider-Capability-Schema fuer ZDR pro Provider: Default-Liste (Anthropic ZDR, Bedrock no-logging, OpenAI no-training) ist Architecture-Vorschlag. Coding pruefe gegen den aktuellen Provider-Klassen-Layer ob die Default-Liste exakt setzbar ist.
- Schema-Migration v10 nach v11: konkrete WriterLock-Sequenz fuer ALTER laut FIX-12-Pattern. Coding entscheidet die genaue Reihenfolge in `KnowledgeDB.applyMigration`.
- Settings-UI fuer die vier neuen Toggles: Architecture schreibt nur die Defaults; UI-Wording, Tooltips und Provider-Capability-Status-Indicator entscheidet Coding mit dem Settings-Tab-Owner.
- `dismissed_freshness`-Reader: Architecture-Vorschlag ist ein zentraler `DismissedHintsRepository`. Coding pruefe ob ein leichterer Direct-SELECT in `NoteSelector` reicht oder ob es absehbar weitere Reader gibt.
- BatchResolveModal Resume-State: Architecture-Vorschlag ist eine kleine DB-Tabelle mit Run-ID-Index. Coding pruefe ob ein in-memory-State mit Plugin-Onunload-Save reicht; Resume waere dann nur intra-session.

## Consistency check confirmation

- tech-stack im plan-context matcht die Decision in ADR-135 und die Amendments in ADR-95, ADR-104, ADR-105, ADR-106.
- Forbidden-Vokabular gescannt und entfernt vor Save.
- Em-dashes und En-dashes gescannt und entfernt vor Save.
