---
ba: BA-25
re-completed: 2026-05-03
related-epics: [EPIC-03, EPIC-15, EPIC-19]
features-count: 28
---

# Architect-Handoff: BA-25 Karpathy-Wiki-Pattern (Ingest, Retrieval, Lint)

## Zusammenfassung

28 Features ueber drei Dimensionen, gemappt auf drei existierende Epics. Keine neuen Epics. Implementierung in fuenf Phasen geplant. Mehrere Schema-Migrationen knowledge.db v9 -> v10 koennen gebuendelt werden.

**Bindende User-Entscheidungen** (RE-Output, Architektur muss respektieren):
- Variante B Frontmatter-Write: Default OFF, Backfill bei Aktivierung, kein Ueberschreiben.
- Taxonomie SQL-beschleunigt, nicht LLM-only.
- Sebastians Standard-Prompt-Wortlaut bleibt erhalten als Settings-Default.
- Lint integriert in bestehenden VaultHealthService und Vault-Health-Modal.
- 3-Stufen-Lint-Stack mit hartem Token-Budget-Cap auf Stufe 3.
- Bias-Awareness als eigene Lint-Kategorie.
- Zwei Ingest-Modi (Aktiver Dialog vs Auto), Modus A als Default.
- Drei Output-Modi (Source-only / Source+Summary / Source+Multi-Zettel), Modus 2 als System-Default.
- Auto-Trigger via konfigurierbarer Frontmatter-Property, Default off.
- Source-Position-Marker im Perplexity-Stil als klickbare Block-Refs/Page-Refs/Anchors.
- PDF-Default Page-Refs, Markdown-Mirror als opt-in.
- Bibliographische Summary-Note mit Base-Codeblock fuer Multi-Zettel-Modus.

## Feature-Liste mit Bundling-Vorschlag

### Schema-Migration-Bundle: knowledge.db v9 -> v10

Vier Features teilen sich eine Schema-Migration und sollten in **einem PLAN** umgesetzt werden, weil eine zweite Migration zur selben Version sehr teuer und fehleranfaellig waere:

- FEAT-15-09 Note-Summary Storage (note_summaries-Tabelle)
- FEAT-15-10 Frontmatter-Property Mirror (frontmatter_properties-Tabelle)
- FEAT-15-11 Cluster-Source-Stats (cluster_source_stats-Tabelle)
- FEAT-15-12 Cluster-Metadata mit Halbwertszeit (cluster_metadata-Tabelle)

**Bundling-Empfehlung:** PLAN "Memory-Layer-Erweiterung v10" mit allen vier Tabellen plus Read/Write-API plus Migration-Test.

### Phase 1: Foundation (P0)

Schema-Bundle plus erste anhaengige Features. Ziel: alle DB-Schichten und Standard-Prompt verfuegbar fuer alle drei Dimensionen.

| Feature | Epic | Sub-Init |
|---------|------|----------|
| FEAT-15-09 Note-Summary Storage | EPIC-15 | R |
| FEAT-15-10 Frontmatter-Property Mirror | EPIC-15 | R |
| FEAT-15-11 Cluster-Source-Stats | EPIC-15 | I |
| FEAT-15-12 Cluster-Metadata | EPIC-15 | L |
| FEAT-19-08 Konfigurierbarer Standard-Prompt | EPIC-19 | R |
| FEAT-19-09 Auto-Summary-Generierung beim Indexing | EPIC-19 | R |

### Phase 2: Lint Foundation (P0, abhaengig von Phase 1)

| Feature | Epic | Sub-Init |
|---------|------|----------|
| FEAT-19-16 Stufe-1 Composite-Freshness-Score | EPIC-19 | L |
| FEAT-19-17 Source-Diversity-Check | EPIC-19 | L |
| FEAT-19-18 Health-Modal-Erweiterung | EPIC-19 | L |

### Phase 3: Ingest Foundation (P0, abhaengig von Phase 1-2)

| Feature | Epic | Sub-Init |
|---------|------|----------|
| FEAT-19-12 Pre-Triage-Tool | EPIC-19 | I |
| FEAT-19-22 Aktiver Dialog-Ingest-Modus | EPIC-19 | I |
| FEAT-19-24 Output-Modus-Auswahl | EPIC-19 | I |
| FEAT-19-25 Source-Folder-Konfiguration | EPIC-19 | I |
| FEAT-19-27 Konfigurierbarer Auto-Trigger | EPIC-19 | I |
| FEAT-19-28 Source-Position-Marker | EPIC-19 | I |

### Phase 4: Power-User-Erweiterungen (P1)

| Feature | Epic | Sub-Init |
|---------|------|----------|
| FEAT-19-10 Frontmatter-Write plus Backfill | EPIC-19 | R |
| FEAT-19-13 Tension-Detection | EPIC-19 | I |
| FEAT-19-14 Concentration-Warning plus Anti-Echo | EPIC-19 | I |
| FEAT-19-19 Stufe-2 Activity-Trigger | EPIC-19 | L |
| FEAT-19-21 Hot-Cluster-Konfiguration | EPIC-19 | L |
| FEAT-19-23 Auto-Ingest-Modus | EPIC-19 | I |
| FEAT-19-26 Dialog-getriebener MOC-Page-Update | EPIC-19 | I |
| FEAT-19-29 PDF-Strategie | EPIC-19 | I |
| FEAT-19-30 Bibliographische Summary-Note | EPIC-19 | I |

### Phase 5: Erweiterte Schichten (P2, abhaengig von Telemetrie)

| Feature | Epic | Sub-Init |
|---------|------|----------|
| FEAT-19-11 Aktive MOC-File-Pflege | EPIC-19 | R |
| FEAT-19-15 Inbox-Workflow Batch-Triage | EPIC-19 | I |
| FEAT-19-20 Stufe-3 Periodischer Job | EPIC-19 | L |
| FEAT-03-26 Selektiver Top-Hub-Block | EPIC-03 | R |

## Architecturally Significant Requirements (ASRs)

Critical ASRs, die JE einen ADR brauchen:

| ASR-ID | Feature | Beschreibung |
|--------|---------|--------------|
| ASR-1 | FEAT-15-09 | Schema-Migration v9 -> v10 muss additiv sein, kein Datenverlust |
| ASR-2 | FEAT-19-09 | Idempotenz: Re-Indexing einer unveraenderten Note darf nicht erneut LLM-Call ausloesen |
| ASR-3 | FEAT-19-10 | Frontmatter-Write muss struktur-erhaltend sein (replaceInFile-Pattern) |
| ASR-4 | FEAT-19-10 | Conflict-Detection bei parallelem User-Edit |
| ASR-5 | FEAT-19-11 | MOC-Marker-Konvention muss Obsidian-rendering-vertraeglich sein |
| ASR-6 | FEAT-19-12 | Tool-Architektur fuer Pre-Triage (eigenes Tool vs Erweiterung ingest_document) |
| ASR-7 | FEAT-19-13 | Tension-Detection-Algorithmus (Cosine vs LLM vs Hybrid) |
| ASR-8 | FEAT-19-19 | Web-Search-Provider-Strategie (BYOK vs Default-Provider via Gateway) |
| ASR-9 | FEAT-19-20 | Stufe-3-Job-Runner-Mechanik (setInterval / BackgroundFetch / Cron) |
| ASR-10 | FEAT-19-20 | Token-Budget-Enforcement (soft cap vs hard cap) |
| ASR-11 | FEAT-19-22 | Dialog-State-Persistenz (Conversation / DB-Tabelle / Memory-v2) |
| ASR-12 | FEAT-19-28 | Block-Reference-Konvention (System `^block-N` vs LLM-IDs) |
| ASR-13 | FEAT-19-29 | PDF-Page-Reference Plattform-Kompatibilitaet (iOS/Android) |
| ASR-14 | FEAT-03-26 | Block-Lifecycle-Trigger fuer KV-Cache-Stabilitaet |

## Non-Functional Requirements (NFRs) Prioritaet

Aus BA-25 Section 10.2 (User-Entscheidung):

1. **Daten-Sicherheit:** kein Frontmatter-Verlust, Backfill bewahrt 100% Bestehendes.
2. **User-Trust:** Reversibilitaet, Transparenz, Default-konservativ.
3. **Performance:** Indexing-Latenz, KV-Cache-Stabilitaet, UI-Responsiveness.
4. **Token-Oekonomie:** Backfill < 5 USD bei Sonnet, Stufe-3 hartes Budget.
5. **Skalierbarkeit:** Vault-Groessen 100-10.000+ Notes.

Quantifizierte NFRs pro Bereich:

**Performance:**
- SQL-Lookups < 1ms (Single), < 100ms (Bulk 1.500 Notes)
- LLM-Calls Triage < 15s, Summary < 10s
- Indexing-Pass darf nicht UI-blockieren

**Token-Kosten:**
- Note-Summary-Generierung Default Haiku, < 0.001 USD pro Note
- Triage-Pass < 0.05 USD pro Source
- Stufe-2-Web-Search-Pass < 0.50 USD pro Klick
- Stufe-3-Wochen-Job Default 2 USD, hart kappiert

**Storage:**
- Schema-Migration v9 -> v10 additiv
- knowledge.db Wachstum proportional Vault, kein Bulk-Increase

**Security:**
- Web-Search BYOK respektiert User-API-Keys
- Frontmatter-Write nur mit User-Approval
- Vault-Backups sind User-Verantwortung, System empfiehlt vor Backfill

## ADR-Bedarf (22 Indikatoren)

**Schema und Storage:**
- ADR: knowledge.db v9 -> v10 Migration-Strategie und Bundle-Inhalt
- ADR: note_summaries-Schema-Design (separate Tabelle vs Spalte in vectors)
- ADR: frontmatter_properties-Schema (Erweiterung tags vs eigenstaendige Tabelle)
- ADR: cluster_source_stats Source-Identitaet (Domain-only vs Domain+Author)
- ADR: cluster_metadata Halbwertszeit-Modell (statisch vs adaptiv)

**Retrieval:**
- ADR: Conflict-Detection-Strategie bei Frontmatter-Write parallel zu User-Edit
- ADR: MOC-Marker-Konvention (HTML-Comment vs Dataview-Block vs eigene Syntax)
- ADR: KV-Cache-Top-Hub-Block-Lifecycle (Trigger fuer Regenerierung)

**Ingest:**
- ADR: Pre-Triage-Tool-Architektur (eigenstaendiges Tool vs Erweiterung ingest_document)
- ADR: Tension-Detection-Algorithmus (Cosine-Threshold vs LLM-Klassifikation vs Hybrid)
- ADR: Dialog-Ingest-State-Machine-Storage (Conversation, eigene Tabelle, Memory-v2)
- ADR: Output-Modus-Architektur (Note-Generierung pro Modus, Folder-Konfiguration)
- ADR: Multi-Zettel-Cross-Link-Generierung (LLM-Vorschlag vs Embedding-Aehnlichkeit)
- ADR: Source-Folder vs Wissens-Folder Default-Layout
- ADR: Auto-Trigger-Detection-Mechanik (vault.on-Listener vs Polling vs Hybrid)
- ADR: Block-Reference-Konvention beim Source-Note-Schreiben
- ADR: PDF-Strategie (Default Page-Refs vs Markdown-Mirror, Sync-Modell)
- ADR: Bibliographische-Summary-Note-Schema und Base-Codeblock-Standard

**Lint:**
- ADR: Web-Search-Provider-Strategie (BYOK obligatorisch vs Default via Gateway)
- ADR: Stufe-3-Job-Runner-Mechanik (setInterval vs BackgroundFetch vs OS-Cron)
- ADR: Token-Budget-Enforcement (soft cap vs hard cap, Reset-Strategie)
- ADR: Health-Modal-Severity-Modell (Sortierung, Threshold, Filter)
- ADR: Activity-Trigger-Cooldown-Strategie (pro Cluster, pro Tag, hybrid)

## Open Questions an Architektur

**Schema-Bundling:**
- Soll FEAT-15-09 + 15-10 + 15-11 + 15-12 wirklich in einer Migration gebuendelt werden, oder besser in zwei Migrations-Schritten (Retrieval-Tabellen + Ingest/Lint-Tabellen)?
- Wenn Bundle: wie wird Migration-Rollback bei Fehlschlag im dritten Schritt sauber gehandhabt?

**MOC-Pflege:**
- Default-Tiefe der MOC-Pflege (Header-only oder auch Body bei Markern)?
- Wenn User Marker loescht, definiertes Verhalten (Re-Inject vs Skip vs Notification)?

**Output-Modus:**
- Wenn User Modus aendert (zB von 2 nach 3): retroaktive Re-Verarbeitung Default off, aber explizite "Re-process Source"-Action separat?
- Tension-Marker in Multi-Zettel-Modus: am Zettel mit Claim oder als separate Tension-Note?
- Wie verhalten sich Zettel-Notes zur Memory-v2-Fact-Extraktion (FEAT-03-25)? Brauchen sie ein Frontmatter-Flag "diese Note ist Memory-Source"?

**Web-Search:**
- BYOK obligatorisch fuer Stufe-2 und Stufe-3 oder Default-Provider via Obsilo-Gateway anbieten (Token-Kosten dann pro User-Account)?
- Welcher Web-Search-Provider hat beste Source-Filter-Optionen (fuer Anti-Echo-Suche)?

**Ingest-Approval:**
- Backfill-Approval-Modell: pro Note, Batch, Settings-Level?
- Auto-Modus-Default: bulk-Approval-Toggle im Settings-Level oder pro Inbox-Bulk-Action?

**Cross-Cuts:**
- Wie werden die 28 Features in einem PLAN-Pro-Phase zusammengefasst? (RE empfiehlt 5 Phasen-PLANs)
- Welche Telemetrie-Punkte braucht Architektur fuer A/B-Vergleiche der Hypothesen?

## Constraints

- Mobile (iOS/Android) muss zumindest Read-Pfad unterstuetzen, Write-Pfad kann Desktop-only sein.
- Sebastians Standard-Prompt-Wortlaut bleibt im Settings-Default 1:1 erhalten.
- Bestehende Architektur (SemanticIndexService, VaultHealthService, ContextComposer) wird ERWEITERT, nicht ersetzt.
- knowledge.db Schema v9 -> v10 ist die einzige geplante Migration in dieser Initiative.
- Alle neuen Features sind setting-gated (Default off oder konservativer Default), kein silent rollout.

## Forbidden-Terms-Check

Saemtliche Success Criteria der 28 Features wurden auf forbidden tech terms geprueft. Erlaubte Begriffe: User-Outcome-Beschreibungen, qualitative Schwellwerte ("schnell", "in Sekunden", "fuer den User nicht spuerbar"). Erlaubt mit Quantifizierung: Token-Kosten in USD, Cluster-Counts, Note-Counts. Verboten in SC: SQL, REST, OAuth, etc. Pruefung bestanden.

## Naechster Schritt

`/architecture` lesen den Handoff plus die 28 FEATURE-Specs plus BA-25 plus existierende ADRs (ADR-50, ADR-51, ADR-52, ADR-65, ADR-67, ADR-79, ADR-87 als naechste Verwandte). Erstellt 22 ADRs (oder bundled wo sinnvoll) und plan-context.md.

## Dialog

(leer beim RE-Handoff. Architektur fuellt Antworten zu obigen Open Questions hier ein, plus eigene Rueckfragen an RE oder BA.)
