---
id: IMP-20-06-01
feature: FEAT-20-06
epic: EPIC-20
adr-refs: []
plan-refs: []
depends-on: [FEAT-20-06, FEAT-19-12, FEAT-19-19, FEAT-20-01]
created: 2026-06-19
---

# IMP-20-06-01: Claim Check + Review Hints (FEAT-20-06 Stage 4+5 Implementation)

**Prioritaet:** P2
**Feature-Bezug:** FEAT-20-06 (Knowledge Freshness), EPIC-20 (Graph Intelligence)

## Problem

FEAT-20-06 spezifiziert einen fuenfstufigen Freshness-Funnel. Stages 0 bis 3 sind released und im Code wirksam: per-Chunk-Klassifikation (volatile/evolving/stable) als Mehrheitsvote, temporale Marker, passive Detection im Chat-Pfad, Cluster-Outlier-Score. Die letzten zwei Stufen sind in der Spec konzeptionell beschrieben, aber im Produktpfad nicht aktiv.

Konkrete Belege aus Code-Audit 2026-06-19:

- [Stufe3PeriodicJob.ts:38-39](../../../src/core/health/Stufe3PeriodicJob.ts#L38-L39) definiert die Callback-Typen `PreFilterFn` und `WebUpdatePassFn` cluster-scoped. Beide Hooks werden in [main.ts:1513-1524](../../../src/main.ts#L1513-L1524) registriert, aber die LLM-seitige Implementation ist Stub (no-op return).
- [`note_freshness`-Tabelle](../../../src/core/knowledge/KnowledgeDB.ts#L128) traegt heute nur `freshness_class`, `temporal_marker_count` und `classified_at`. Keine Verdict-Spalten, kein History-Trail.
- [`dismissed_freshness`-Tabelle](../../../src/core/knowledge/KnowledgeDB.ts#L135) ist angelegt, aber kein Reader greift sie ab.
- Output-Modell aus der FEAT-20-06-Spec ist eine "Review"-Note im Inbox-Folder. Sebastians spaeter getroffene UX-Entscheidung (siehe Audit-Dialog 2026-06-19) verlangt stattdessen: ein Eintrag im bestehenden Health-Check-Modal plus ein optionales schlankes Frontmatter-Label (genau ein Feld, kein zusaetzliches Subtree).

Folge: Notes mit hoher Volatilitaetstendenz werden klassifiziert, aber niemals gegen externe Quellen geprueft. Der User sieht den 0-100-Score auf Cluster-Ebene, aber keine Note-Ebene-Verdicts mit handlungsleitenden Vorschlaegen.

## Scope

Diese Implementierung realisiert Stage 4 und Stage 5 als zusammenhaengende Pipeline mit angepasstem Output-Modell. Sieben Bauteile, die im PLAN sequenziell oder parallel umgesetzt werden:

1. **Stage 4 Claim-Check-Pipeline**. Mid-Tier-LLM-Call pro Note aus dem Stufe-3-Kandidatenset, der ein Verdict, eine Confidence im Bereich 0.0 bis 1.0, eine kurze Begruendung und einen Vorschlag fuer die naechste Note-Aenderung liefert. Frontier-Eskalation als Option, default off.
2. **Stage 5 Review-Hint-Output**. Strukturierte Vorschlaege pro Severity: Section-Replacement, Section-Append, Inline-Caveat oder Delete-Pointer. Persistiert in der erweiterten `note_freshness`-Tabelle.
3. **`note_freshness` ALTER TABLE**. Additive Spalten fuer `last_verdict`, `last_confidence`, `last_summary`, `last_sources_json`, `last_checked_at`, `last_verifier_tier`. Migration v10 nach v11. WriterLock vor ALTER.
4. **`note_freshness_history`**. Neue 1:N-Tabelle mit Retention von 5 Runs oder 90 Tagen, summary und sources_json opt-in. Path-Spalte verweist auf `note_freshness.path`.
5. **Knowledge-review-Tab** im bestehenden [VaultHealthRepairModal](../../../src/ui/modals/VaultHealthRepairModal.ts). Liste der geflaggten Notes mit Severity-Badge, kurzem Summary, Source-Link.
6. **ResolveConflictModal**. Single-Note-Auflösung mit Diff-View, Apply, Edit, Mark verified, Delete (mit Bestaetigung) und Open-in-Chat-Handover an den Default-Agent.
7. **BatchResolveModal**. Bulk-Apply mit Filter nach Severity und Confidence, sequentielles Anwenden mit Progress, Abort und Resume nach Fehler.

Plus drei Hilfsbauteile, die mit den UI-Teilen einhergehen:

8. **NoteSelector**. Liest `freshness_class` als Scheduling-Heuristik: volatile woechentlich, evolving monatlich, stable quartalsweise oder on-demand. Reduziert das Token-Budget gegenueber einem Full-Sweep.
9. **`buildFreshnessQuery`**. Erzeugt aus einer Note eine Suchanfrage mit harter 400-Zeichen-Schranke, fuer Tavily- und Brave-Adapter. Niemals Vollnote im Query-Body.
10. **Frontmatter-Key-Allowlist**. Strikte Whitelist fuer Frontmatter-Writes des Verifiers, gepinnt durch einen Unit-Test, der jeden Drift in den Schreibcode rot werden laesst.

## Konsolidierungs-Constraints (binding)

Das Spec-Code-Audit 2026-06-19 hat zwoelf Constraints identifiziert, die in dieser Implementation gelten:

| ID | Constraint | Quelle |
|---|---|---|
| C-01 | Vocabulary: `matches`, `extends`, `contradicts` (mit Severity), `outdated`. Alignt mit TriageCard. | FEAT-19-12 |
| C-02 | Frontmatter-Write default OFF. Opt-in via Setting analog `vaultIngest.frontmatterWrite.enabled`. | BA-25 Anti-Definition (line 386) |
| C-03 | Confidence-Skala 0.0 bis 1.0, REAL. | FEAT-20-01 (`edges.confidence`) |
| C-04 | User-Override geht durch `dismissed_freshness` mit `hint_type='verdict'`. Keine neue Spalte in `note_freshness`. | Audit (Tabelle existiert, kein Reader) |
| C-05 | Letztes External-Check-Timestamp pro Cluster in [ClusterMetadataStore.last_external_check](../../../src/core/knowledge/ClusterMetadataStore.ts). Keine neue Spalte. | Audit (vorhandenes Feld) |
| C-06 | Hook-Erweiterung additiv: `UpdateFinding` bekommt optionales `notes?: NoteVerdict[]`. Cluster-Hooks bleiben cluster-scoped. | Audit (`Stufe3PeriodicJob.ts:24-30`) |
| C-07 | Stage-4/5-Pipeline laeuft innerhalb `webUpdatePass`, nicht parallel. Keine neuen Hooks. | Audit |
| C-08 | Web-Search folgt ADR-104: Brave und Tavily BYOK. Model-native Web-Search ist Out-of-Scope dieses IMP. | ADR-104 |
| C-09 | FrontmatterWriter wiederverwenden. Kein zweiter Writer. | Audit |
| C-10 | `freshness_class` ist Scheduling-Signal fuer den NoteSelector. Heute liest niemand die Spalte fuer Prioritaet. | Audit |
| C-11 | `freshness.externalSources.enabled` ist ein eigener Privacy-Toggle. Default OFF, unabhaengig von `webTools.enabled`. | Adversarial Review (Tavily/Brave-Leak) |
| C-12 | `freshness.allowFrontierEscalation` default OFF. ZDR-Endpoint pro Provider zu pruefen, fail-closed wenn nicht setzbar. | Adversarial Review (Frontier auf sensitive Notes) |

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | Beim manuellen Trigger eines Vault-Scans landet eine Note mit veralteter Aussage als Eintrag im Knowledge-review-Tab des Health-Modals, mit Verdict, Confidence und Summary |
| AC-02 | Eine Note die als `verified` klassifiziert wird, wird im Tab nicht angezeigt und ihr `last_checked_at` ist gesetzt |
| AC-03 | Single-Note-Resolve erlaubt Apply, Edit, Delete (mit Bestaetigungs-Modal), Mark verified, Open in chat. Apply schreibt atomar ueber den bestehenden FrontmatterWriter und EditFileTool-Pfad mit Checkpoint |
| AC-04 | BatchResolve erlaubt Filter nach Severity und Confidence, sequentielles Anwenden, Abort waehrend Run und Resume nach Fehler |
| AC-05 | Per-Run-Token-Verbrauch wird im bestehenden Budget der Stufe-3-Pipeline aggregiert. Kein paralleler zweiter Budget-Pot. |
| AC-06 | Frontmatter-Write des Verifiers ist im Default OFF. Wird die Setting aktiviert, schreibt der Writer ausschliesslich Keys aus der Allowlist; ein Unit-Test verifiziert das |
| AC-07 | Stage-4-Pipeline laeuft nicht ohne `freshness.externalSources.enabled` UND einen verfuegbaren Tavily- oder Brave-Key. Andernfalls Verdict `no_external_source` |
| AC-08 | Frontier-Eskalation ist nur aktiv wenn `freshness.allowFrontierEscalation` an ist UND das Provider-Token ZDR oder no-logging unterstuetzt. Fail-closed sonst |
| AC-09 | Mobile (FEAT-27) zeigt den Knowledge-review-Tab read-only mit Hinweis "synced from desktop". Run-Buttons sind dort deaktiviert |
| AC-10 | Eine Note die der User per `Mark verified` quittiert, taucht beim naechsten Run nicht wieder auf, solange `mtime` der Note konstant bleibt (dismissed_freshness mit `hint_type='verdict'`) |
| AC-11 | `note_freshness_history` haelt maximal 5 Runs ODER 90 Tage pro Note, was zuerst eintritt. Aelteste Eintraege werden bei Insert verdraengt |
| AC-12 | Schema-Migration von v10 nach v11 ist additiv. Bestehende Reads auf `freshness_class`, `temporal_marker_count`, `classified_at` brechen nicht |

## Tech-Stack und nicht-funktionale Anker

Diese Sektion ist explizit Tech-haltig, weil IMP nach FEAT geht und der Architekt schon Konstanten kennt. Sie speist die NFR-Tabelle im architect-handoff.

- **Datenbank**: KnowledgeDB (sql.js WASM). Atomic Save laut FIX-12. WriterLock-Pflicht vor ALTER TABLE.
- **Mid-Tier-Modell**: Default `claude-haiku-4-5` oder `gemini-flash`. Token-Budget je Run aggregiert.
- **Frontier-Modell**: Opt-in, default off. Pro Provider ZDR-Flag pruefen, fail-closed wenn nicht setzbar.
- **External-Source-Adapter**: WebSearchProvider-Interface aus ADR-104. Erste Implementation Tavily, dann Brave. Model-native Web Search ist OOS dieses IMP.
- **UI**: VaultHealthRepairModal-Erweiterung, kein neues Top-Level-Modal. Sub-Modale (`ResolveConflictModal`, `BatchResolveModal`) werden vom Knowledge-review-Tab geoeffnet.
- **Mobile**: Read-only. Schreibender Stage-4-Lauf nur auf Desktop. Mobile-Sync bringt persistierte Verdicts auf das Geraet.

## Performance- und Cost-Schwellen

- Token-Budget pro Run summiert sich in `webUpdatePass.tokensUsed`. Hard cap im bestehenden `Stufe3PeriodicJob.spendTokens` Mechanismus.
- Stage-4-Cost (1000 Notes, ein Run): unter 0.10 US-Dollar laut FEAT-20-06 Section "Cost Per Scan". Verifier-Pipeline darf das nicht um Faktor 10 ueberschreiten.
- Mid-Tier-Call pro Note: 5000 Input + 500 Output Tokens als Ceiling. NoteSelector limitiert auf Top-N pro Cluster, default N = 5.

## Security-Anker

- Tavily- und Brave-Queries werden via `buildFreshnessQuery` gebaut, harte 400-Zeichen-Schranke. Keine Vollnote im Query-Body.
- Hard-Deny-Pfade fuer Frontmatter-Write: keine `freshness:`-Property in Notes unter Pfaden die `freshness.excludePaths` matchen (default-conservative Set: `Private/`, `Personal/`, `Medical/`, `Clients/`).
- Frontier-Calls ohne ZDR-Endpoint sind nicht erlaubt; UI zeigt eine erklaerende Notice und der Verifier markiert das als `severity: confidence_low` ohne Frontier-Lauf.

## Files (vorlaeufig, voller Plan im /architecture)

- `src/core/knowledge/KnowledgeDB.ts`: ALTER TABLE v10 nach v11.
- `src/core/health/FreshnessVerifier.ts` (neu): Stage-4 + 5 Pipeline.
- `src/core/health/NoteSelector.ts` (neu): liest `freshness_class`, schlaegt Reihenfolge vor.
- `src/core/health/FreshnessQueryBuilder.ts` (neu): `buildFreshnessQuery`.
- `src/core/health/Stufe3PeriodicJob.ts`: `UpdateFinding.notes?: NoteVerdict[]` additiv.
- `src/ui/modals/VaultHealthRepairModal.ts`: neuer Tab.
- `src/ui/modals/ResolveConflictModal.ts` (neu).
- `src/ui/modals/BatchResolveModal.ts` (neu).
- `src/core/settings/types.ts`: neue Settings `freshness.writeFrontmatter`, `freshness.externalSources.enabled`, `freshness.allowFrontierEscalation`, `freshness.excludePaths`.
- Tests pro Bauteil, plus Allowlist-Pin in `src/core/health/__tests__/FrontmatterAllowlist.test.ts`.

## Out of scope

- Model-native Web Search (bleibt fuer eine spaetere ADR-Erweiterung von ADR-104).
- Automatischer Default-ON-Modus fuer Frontmatter-Write (verletzt BA-25 Anti-Definition).
- Inbox-Note-Output gemaess urspruenglicher FEAT-20-06-Spec (durch Modal-UI ersetzt; FEAT-20-06-Body wird in diesem IMP-Commit mit Cross-Ref auf IMP-20-06-01 aktualisiert).
- Granulares Per-Note-Budget. Bestehende Cluster-Budget-Grenze ist Source of Truth.
- Hardlink-Erkennung im Vault. Bekanntes Restrisiko aus dem Adversarial Review, eigener IMP wenn relevant.

## Bezuege

- Eltern-FEAT: FEAT-20-06 Knowledge Freshness (Released, Body wird zur Verlinkung dieses IMP minimal aktualisiert).
- Vorgaenger-Specs: FEAT-19-12 Pre-Triage-Tool (Vocabulary), FEAT-19-19 Stufe-2 Activity-Trigger, FEAT-20-01 Confidence Scoring.
- ADR-Refs: ADR-94 Cluster-Halbwertszeit, ADR-104 Web-Search-Provider.
- BA: BA-25 vault-summary-pflege.
- Adversarial Review: `/private/tmp/.../w1yt77f1h.output` (3 unabhaengige Lenses, 26 verbleibende Risiken, 7 als binding constraints in dieses IMP integriert).
- Spec-Code-Audit: `/private/tmp/.../wwem23luj.output` (39 Findings, 12 als Constraints C-01 bis C-12 oben gepinnt).
