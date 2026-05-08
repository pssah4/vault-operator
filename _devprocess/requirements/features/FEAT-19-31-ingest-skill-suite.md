# Feature: Ingest- und Synthese-Skill-Suite

> **Feature ID**: FEAT-19-31
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11 + GitHub Issue #11 + ADR-103-Amendment 2026-05-07
> **Priority**: P1
> **Effort Estimate**: M

## Feature Description

User-steuerbare Skill-Suite, die die existierenden Ingest- und Synthese-
Tools (`ingest_triage`, `ingest_document`, `ingest_deep`) hinter
expliziten Slash-Commands kapselt. User waehlt per Slash-Command-
Picker den passenden Workflow fuer die jeweilige Source bzw. Aufgabe;
Tools bleiben generisch.

Drei Skills:

- **`/ingest-deep`** -- Karpathy Multi-Turn-Dialog mit Pflicht-
  Markdown-Konversion (PDF -> Markdown-Mirror erzwungen), Block-Refs,
  Triage als interner Schritt 1, Output-Modus 2 (Source + Sense-
  Making) oder 3 (Source + Multi-Zettel + Bibliografie).
- **`/ingest`** -- Schneller Single-Pass-Ingest, page-refs Default
  fuer PDFs, Single-Note-Output (Frontmatter + Overview + Kernaussagen
  + Originaltext-Section). Keine Triage, keine Markdown-Konversions-
  Pflicht.
- **`/meeting-summary`** -- Spezialisiert auf Transkript-Markdown-
  Notes. Setzt Block-IDs an Schluesselpassagen im Transkript, schreibt
  Zusammenfassung als Section in derselben Note (single-note-Layout),
  Block-Refs als same-note-Wikilinks.

Alle drei Skills folgen einer einheitlichen Marker-Konvention (siehe
ADR-103-Amendment 2026-05-07): `[[source#^block-N|↗]]` bzw.
`[[source.pdf#page=N|↗]]`, dezent inline am Satzende, kein Praefix,
nur das `↗`-Symbol als Display-Text.

## Benefits Hypothesis

Wir glauben, dass eine User-steuerbare Skill-Suite das Routing-Problem
zwischen `ingest_document` und `ingest_deep` aufloest, ohne die Tool-
Architektur (ADR-103) zu revidieren. User waehlen explizit per Slash-
Command den passenden Workflow; Tools bleiben generisch und unter-
stuetzen mehrere Skills.

Wir wissen, dass wir erfolgreich sind, wenn:
- 3 Skills im Slash-Command-Picker erscheinen, korrekt vom
  VaultDNAScanner discovered.
- Jeder Skill produziert konsistente `↗`-Marker-Form im Output.
- User aendert die Skill-Auswahl ohne Settings-Eingriffe.

## User Stories

**Story 1:** Als Power-User mit text-lastigen Forschungs-PDFs moechte ich
`/ingest-deep` aufrufen und einen Multi-Turn-Dialog mit Markdown-Mirror
und Block-Refs bekommen, weil ich Provenance brauche.

**Story 2:** Als User mit einem Webclip-Artikel moechte ich `/ingest`
aufrufen und einen schnellen Single-Note-Ingest bekommen, weil ich
keine 5-15 Minuten Dialog brauche.

**Story 3:** Als User mit einem Meeting-Transkript moechte ich
`/meeting-summary` aufrufen und eine kompakte Zusammenfassung mit
Block-Refs auf Transkript-Passagen bekommen, ohne den existierenden
Transkript-Body zu veraendern.

**Story 4:** Als User moechte ich, dass die Skills die Marker-Form
einheitlich `↗` rendern, sodass meine Synthesen visuell konsistent
bleiben.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | 3 Skills im Slash-Command-Picker sichtbar | Desktop + Mobile | manueller Test |
| SC-02 | `/ingest-deep` erzwingt Markdown-Konversion fuer PDFs | 100% der PDF-Aufrufe | Integration-Test |
| SC-03 | `/ingest` belaesst PDFs auf page-refs (keine Mirror-Pflicht) | 100% der PDF-Aufrufe | Integration-Test |
| SC-04 | `/meeting-summary` setzt Block-IDs an Schluesselpassagen ohne sichtbaren Body zu aendern | manueller Diff-Test | Integration-Test |
| SC-05 | Alle Skills rendern Marker-Form `[[source#^block-N|↗]]` (oder `#page=N|↗` bei PDF-Default) | 100% der Outputs | Output-Validation-Test |
| SC-06 | Triage als interner Schritt in `/ingest-deep`, kein eigenes `/triage`-Skill | Skill-Anleitung | Code-Review |
| SC-07 | User kann Skill-Anleitungen im Vault editieren (User-Steuerbarkeit) | Skills im `.obsidian-agent/plugin-skills/` | manueller Test |

## Technical NFRs

- **Performance:** Skill-Discovery via VaultDNAScanner laeuft im
  Hintergrund, kein Block.
- **Storage:** 3 `.skill.md`-Files, < 5 KB pro Skill.
- **Robustness:** Skill-Aufruf ohne KnowledgeDB (z.B. erste Sitzung)
  faellt graceful auf Triage-Skip oder Cluster-Hint-Skip zurueck.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Default-Deployment-Pfad fuer die 3 Skills.
  Plugin-built-in (in `_generated/embedded-assets.json`) vs Vault-
  Folder-Seeding (Skill-Files werden bei Setup in
  `.obsidian-agent/plugin-skills/` kopiert). ADR-Bedarf wenn
  Built-in gewaehlt wird.
- **ASR-2 (Low):** Tool-Description-Update fuer `ingest_document`
  ("Always use this tool" -> "Used by /ingest skill"), damit Skills
  nicht mit Tool-Default-Hinweisen kollidieren.

## Definition of Done

- 3 `.skill.md`-Drafts unter `_devprocess/architecture/skills/`
  (Source-of-Truth fuer die Skill-Anleitungen).
- Deployment-Mechanismus entschieden und implementiert (Built-in
  Seeding ODER Skill-Folder-Importer).
- Marker-Form `↗` durch Skill-Anleitung verbindlich enforced.
- Tool-Description fuer `ingest_document` neutralisiert.
- Manuelle Tests: Skill-Picker zeigt alle 3, Output-Form korrekt.
- FEAT-19-31 BACKLOG-Row Status `Done` nach Pass.

## Refs

- ADR-103 (mit Amendment 2026-05-07): Marker-Form Skill-owned
- FEAT-19-28: Source-Position-Marker (Tool-Layer)
- FIX-19-28-01: Bug, der die Tool-Layer-Reparatur antreibt
- BA-25 Section 11.6: Output-Modi 1/2/3
- GitHub Issue #11 pssah4/obsilo-dev
