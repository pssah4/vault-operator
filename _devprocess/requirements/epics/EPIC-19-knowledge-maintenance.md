# Epic: Knowledge Maintenance

> **Epic ID**: EPIC-19
> **Business Alignment**: _devprocess/analysis/BA-19-knowledge-maintenance.md
> **Scope**: MVP
> **Note**: Phase 1 Teilweise Implementiert

## Epic Hypothesis Statement

FUER Obsidian-Power-User mit Zettelkasten oder vergleichbaren Wissensmanagement-Methoden
DIE am Bookkeeping scheitern (MOC-Properties, Backlinks, Tags, Zusammenfassungen, Dateinamen)
IST Knowledge Maintenance
EIN Skill- und Feature-basiertes System das den Agent zum aktiven Wissens-Pfleger macht
DAS neue Dokumente intelligent einordnet, bestehende Strukturen konsistent haelt, Chat-Synthesen bewahrt und Quellen automatisch aufbereitet
IM GEGENSATZ ZUM heutigen passiven System das Inhalte nur indexiert (Vektoren, Graph-Extraktion) aber keine strukturellen Verbesserungen vorschlaegt
UNSERE LOESUNG nutzt die bestehende Infrastruktur (SemanticIndex, GraphStore, ImplicitConnections) und orchestriert sie ueber Skills, automatische Checks und eine Ontologie-Schicht zu aktiven Wissensmanagement-Workflows -- ohne permanente Hintergrund-LLM-Kosten

## Kern-These (nach Karpathy)

> "The boring part of a knowledge base is not reading or thinking -- it's bookkeeping:
> cross-references, summaries, consistency across 15 pages. Humans give up because
> maintenance costs grow faster than value. LLMs don't tire."

Vault Operator hat die technische Basis (Vektoren, Graph, MOC-Parsing, Implicit Connections).
Was fehlt ist der Schritt vom passiven Index zum aktiven Wissens-Pfleger:
- **Ingest**: Nicht nur embedden, sondern verstehen und einordnen
- **Lint**: Nicht nur Verbindungen erkennen, sondern Inkonsistenzen aufdecken
- **Ontologie**: Nicht nur paarweise Aehnlichkeit, sondern transitive Themen-Zusammenhaenge
- **Synthese**: Denkarbeit aus Chats zurueck ins Wissensnetz

## Business Outcomes (messbar)

1. **Ingest-Geschwindigkeit**: Time-to-integrate sinkt von 5-10min (manuell) auf <1min (Agent-assistiert)
2. **Property-Vollstaendigkeit**: Anteil befuellter MOC-Properties steigt von ~30% auf >80% innerhalb 4 Wochen
3. **Strukturelle Vault-Qualitaet**: Verwaiste Notes sinken um 50% innerhalb 4 Wochen
4. **Retrieval-Vollstaendigkeit**: "Alles zu Thema X" findet >90% statt ~60% der relevanten Notes
5. **Attachment-Ordnung**: Inkonsistent benannte Attachments sinken von ~80% auf <20%

## Leading Indicators

- **Ingest-Skill-Nutzung**: Wie oft wird der Skill pro Woche getriggert?
- **Vorschlag-Akzeptanzrate**: Wieviel % der vorgeschlagenen Links/Properties akzeptiert der User?
- **Lint-Findings**: Anzahl identifizierter und behobener Inkonsistenzen pro Woche
- **Synthese-Button-Nutzung**: Wie oft werden Chat-Synthesen als Zettel gespeichert?
- **OCR-Nutzung**: Wie viele PDFs werden via OCR konvertiert?

## MVP Features

| Feature ID | Name | Typ | Priority | Effort | Status |
|------------|------|-----|----------|--------|--------|
| FEAT-19-00 | Knowledge Ingest Skill | Skill | P0 | M | Implementiert (`bundled-skills/knowledge-ingest/SKILL.md`, 269 Zeilen) |
| FEAT-19-01 | Vault Health Check (Lint) | Feature (Toggle) | P0 | M | Implementiert (VaultHealthCheckTool, VaultHealthService, VaultHealthRepairModal) |
| FEAT-19-02 | Knowledge Ontologie | Infrastruktur | P0 | M | Teilweise (OntologyStore.ts implementiert, ADR-65) |
| FEAT-19-03 | Template-Onboarding | Einmalig | P1 | S | Geplant |
| FEAT-19-04 | Synthese → Zettel | UI-Button (Toggle) | P1 | S | Implementiert (AgentSidebarView synthesisZettel-Button, Setting `enableSynthesisButton`) |
| FEAT-19-05 | OCR-Integration | Sub-Feature (Toggle) | P1 | M | Implementiert (text-extractor Fallback, ADR-68) |
| FEAT-19-06 | Attachment-Batch-Umbenennung | Skill | P1 | S | Implementiert (`bundled-skills/knowledge-rename/SKILL.md`) |
| FEAT-19-07 | Chat UI Polish | UI-Fix | P2 | S | Geplant |

**Priority:** P0-Critical, P1-High, P2-Medium
**Effort:** S (1-2 Sprints), M (3-5 Sprints), L (6+ Sprints)

## Feature-Typen und Settings

| Typ | Name | Toggle in Settings | Begruendung |
|-----|------|--------------------|-------------|
| Skill | `knowledge-ingest` | Nein | Nur bei explizitem User-Trigger |
| Skill | `knowledge-rename` | Nein | Nur bei explizitem User-Trigger |
| Feature | Vault Health Check | `enableVaultHealthCheck` | Automatisch bei Vault-Open |
| UI-Button | Synthese → Zettel | `enableSynthesisButton` | Optionaler Button im Chat |
| Sub-Feature | OCR via Chandra | `enableOcrIngest` | Kostet API-Calls, opt-in |
| Infrastruktur | Ontologie | Nein | Wird implizit befuellt |
| Einmalig | Template-Onboarding | Nein | Laeuft einmal |
| UI-Fix | Chat UI Polish | Nein | Bessere UX |

## Token-Kosten-Analyse

### Design-Prinzip: Event-driven, nicht permanent

Kein Modell laeuft im Hintergrund. Alle LLM-Calls sind explizit getriggert.
Lint-Scan ist reine DB-Query (0 Tokens). LLM nur fuer Vorschlags-Formulierung.

### Monatliche Schaetzung (typische Nutzung)

```
Ingest:       5 Notes/Woche x 4k Tokens    = 80k Tokens/Monat
Lint:         taeglich, LLM nur bei Klick   = ~24k Tokens/Monat
Synthese:     2x/Woche x 3k Tokens         = 24k Tokens/Monat
Umbenennung:  1x/Monat Batch x 5k Tokens   = 5k Tokens/Monat
OCR:          Externe API (Chandra)         = separat
                                       Total: ~133k Tokens/Monat

Kosten (Haiku):  ~$0.03/Monat
Kosten (Sonnet): ~$0.40/Monat
```

## Explizit Out-of-Scope

- **Automatischer Hintergrund-Ingest ohne User-Trigger**: Zu teuer, User verliert Kontrolle
- **Vollstaendiges GraphRAG (Microsoft)**: Zu teuer, Obsidian-Graph reicht
- **Permanenter Hintergrund-Agent**: Kein "always-on" LLM-Prozess
- **Vault-uebergreifendes Wissen**: Nur innerhalb des aktuellen Vault
- **Content-Generierung ueber Stubs hinaus**: Agent schreibt keine Aufsaetze
- **Aenderungen an SemanticIndex/GraphStore-Logik**: Infrastruktur steht (EPIC-15)

## Dependencies

- **EPIC-15 (Knowledge Layer)**: Vollstaendig implementiert -- SemanticIndex, GraphStore, ImplicitConnections
- **EPIC-03 (Memory)**: MemoryService, KnowledgeDB als Basis fuer Ontologie-Tabelle
- **Bestehende Tools**: read_file, read_document, write_file, semantic_search, list_files
- **Externes**: Chandra OCR API (FEAT-19-05), TaskNotes Plugin (optional, fuer "spaeter"-Flow)

## Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User akzeptiert Vorschlaege nicht (zu viel Noise) | M | H | Konservative Schwellwerte, Akzeptanzrate tracken |
| MOC-Schema des Users nicht vorhersagbar | M | M | Schema aus Templates lernen (Onboarding) |
| Ontologie wird zu gross/langsam | L | M | Inkrementelles Update, Index auf cluster/entity |
| Chandra OCR API-Kosten skalieren | M | M | Expliziter Trigger, Kosten-Transparenz |
| Batch-Umbenennung bricht Wikilinks | M | H | vault.rename nutzen (aktualisiert alle Links) |
| Template-Onboarding ueberschreibt Dateien | L | H | Existenz-Check, nie ueberschreiben |
| Synthese-Zettel als "nicht meine Gedanken" | M | M | Oeffnet als Entwurf, User kann loeschen |

## Abgrenzung zu EPIC-15

```
EPIC-15 (done): Vault -> Vektoren + Graph + Implicit Edges    [PASSIV]
EPIC-19 (neu):  Vektoren + Graph + Ontologie ->
                   Vorschlaege -> User bestaetigt ->
                     Vault wird besser ->                       [AKTIV]
                       Besserer Graph ->
                         Bessere Suche
```
