---
id: ADR-101
title: Output-Modus-Architektur (3 Modi + Folder-Layout + Bibliografie)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-24
  - FEAT-19-25
  - FEAT-19-30
---

# ADR-101: Output-Modus-Architektur

## Context

Drei Output-Modi (FEAT-19-24) bestimmen wie Ingest-Resultate manifest werden: Source-only, Source+Summary-Note (Karpathy-Default), Source+Multi-Zettel (Sebastians Zettelkasten). Daran haengen drei Architektur-Sub-Entscheidungen: Folder-Layout (FEAT-19-25), Cross-Link-Generierung im Multi-Zettel-Modus, Bibliografie-Schema (FEAT-19-30) plus Base-Codeblock-Standard.

## Decision Drivers

- Konfigurierbarkeit pro User-Vault-Konvention
- Zettelkasten-Praxis-Kompatibilitaet (Sebastian)
- Selbst-aktualisierende Bibliografie (BA-25 H-23)
- Kein Schema-Bruch wenn User Modus wechselt

## Considered Options

### Option A: Eine generische Note-Generator-Pipeline pro Modus

Pros:
- Klare Trennung pro Modus.
- Cross-Link-Generierung als shared Modul.

Cons:
- Drei Pipelines pflegen.

### Option B: Einheitliche Pipeline mit Modus-Strategie

Pros:
- Eine Code-Basis.

Cons:
- Modus-Logik vermischt sich, schwer zu lesen.

## Decision

Drei Sub-Entscheidungen werden hier gebuendelt:

**Output-Generator:** Option A. Drei Generator-Funktionen, eine pro Modus, plus shared Helpers (Frontmatter-Builder, Block-ID-Setter, Cross-Link-Vorschlaege).

**Folder-Layout:** Konfigurierbar. Default-Vorschlag bei erstem Plugin-Open: drei Settings:
- `vaultIngest.sourceFolder` Default `Sources`
- `vaultIngest.knowledgeFolder` Default leer (= Cluster-Match aus Ontologie verwenden)
- `vaultIngest.bibliographyFolder` Default = sourceFolder (Bibliografie-Note neben Original-Source)

User kann jeden Pfad ueberschreiben. Auto-Create wenn nicht existent.

**Cross-Link-Generierung im Multi-Zettel-Modus:** LLM-basiert. Beim Generierung der Zettel schlaegt LLM Cross-Links zwischen Zetteln vor (basierend auf inhaltlicher Verbindung). User approved im Dialog (Modus A) oder Auto-akzeptiert (Modus B). Cosine-Similarity als Pre-Filter wuerde halluzinierte Links nicht verhindern, deshalb LLM-Klassifikation.

**Bibliografie-Schema:** Standard-Frontmatter:
```yaml
title: "..."
author: "..."        # optional, aus Source-Metadata
year: ...           # optional
url: "..."          # bei URL-Sources
source_type: "url" | "pdf" | "markdown" | "video" | "podcast"
source_path: "[[...]]"
summary: "..."      # auto-generiert via Standard-Prompt
themen: [...]
konzepte: [...]
keywords: [...]
ingested_at: "2026-..."
ingest_mode: "multi-zettel"
```

Plus Body mit:
1. 1-Absatz-Abstract (auto).
2. Auto-generierter Base-Codeblock fuer dynamische Zettel-Liste:
   ```
   ~~~base
   from "Sources/" or "Knowledge/"
   where source = link(this.file)
   sort created asc
   ~~~
   ```
   (Genaue Base-Query-Syntax wird in Coding-Phase verifiziert gegen aktuelles Bases-Plugin-Schema.)

**Modus-Wechsel ohne retroaktive Re-Verarbeitung:** Wenn User Modus aendert, gilt das nur fuer neue Ingests. Bestehende Sources behalten ihren urspruenglichen Modus. Eine separate `re_process_source(source_uri, target_mode)`-Action wird **nicht** in dieser Initiative geliefert (deferred zu kuenftiger FEAT-19-31).

**Tension-Marker in Multi-Zettel-Modus:** Marker landet **am Zettel mit dem Claim**, nicht als separate Tension-Note. Begruendung: Tension-Aussage ist Teil des atomaren Gedankens, gehoert in den Zettel. Eine separate Tension-Note wuerde Zettelkasten-Atomicity verletzen.

**Memory-v2-Fact-Extraktion-Verhaeltnis:** Multi-Zettel-Notes bekommen kein eigenes Frontmatter-Flag fuer Memory-Source-Markierung. Sie sind ganz normale Vault-Notes und unterliegen dem existing FEAT-03-25-Pfad (vault-note-as-fact-source via memory_source_notes-Tabelle, dirty-Flag, MemoryAtomizer). Wenn User die Zettel als Memory-Source markieren will, nutzt er den existing Workflow.

## Consequences

### Positive
- Sebastians Zettelkasten-Praxis vollstaendig unterstuetzt.
- Bibliografie selbst-aktualisierend via Base-Codeblock.
- Modus-Wechsel ohne Datenchaos.
- Klare Verbindung zu Memory-v2 ohne Doppel-Pfad.

### Negative
- Drei Generator-Pipelines pflegen.
- Bibliografie-Note plus Multi-Zettel produziert mehr Vault-Files pro Source.

### Risks
- Base-Codeblock-Syntax kann mit Bases-Plugin-Updates brechen. Mitigation: Test in Coding-Phase, Helper-Funktion fuer Base-Query-Generierung.
- LLM-basierte Cross-Links koennen halluzinieren. Mitigation: Modus A (Dialog) macht User-Approval Pflicht. Modus B (Auto) ist im Recent-Ingests-Tab nachpruefbar.

## Implementation Notes

Generator-Module:
- `outputModeSourceOnly.ts`: schreibt Original-Source-Note mit Frontmatter, fertig.
- `outputModeSummary.ts`: schreibt Original-Source plus eine Sense-Making-Note im Cluster-Match-Folder mit Wikilink zur Source.
- `outputModeMultiZettel.ts`: schreibt Original-Source plus Bibliografie-Note plus N Zettel-Notes plus Cross-Link-Vorschlaege.

Shared Helpers:
- `buildFrontmatter(template, values)`: Standard-Frontmatter-Renderer.
- `setBlockIds(content, ids)`: Block-IDs in Source-Note setzen (siehe ADR-103).
- `generateCrossLinks(zettel, allZettelOfSource)`: LLM-Vorschlaege fuer Zettel-Cross-Links.
