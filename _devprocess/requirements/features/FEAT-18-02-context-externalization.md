# Feature: Context Externalization (Dateisystem als Kontext)

> **Feature ID**: FEAT-18-02
> **Epic**: EPIC-18 - Token-Kostenreduktion
> **Priority**: P1-High
> **Effort Estimate**: M (4-7 Tage)

## Feature Description

Tool-Results (Suchergebnisse, gelesene Dateien, Web-Inhalte) akkumulieren im
Kontext und werden bei jeder folgenden Iteration erneut an die API gesendet.
Das ist der groesste Token-Verbraucher bei Multi-Step-Tasks.

Inspiriert durch Manus Context Engineering: Das Dateisystem wird als erweiterter
Kontext genutzt. Grosse Tool-Results werden in temporaere Dateien geschrieben.
Im Kontext bleibt nur eine kompakte Referenz (Dateipfad + Zusammenfassung +
Schluesselinformation). Der Agent kann die volle Information jederzeit per
read_file nachladen.

Dieses Feature definiert ein **einheitliches Pattern** fuer alle Tools:

```
Tool-Result erzeugt
    |
    v
Groesse > EXTERNALIZE_THRESHOLD?
    |                    |
   NEIN                  JA
    |                    |
    v                    v
Normales Result      Datei schreiben + kompakte Referenz
im Kontext           im Kontext (Pfad + Summary + Top-N)
(mit Score/Ranking)
```

## Warum ein einheitliches Pattern statt zwei Features?

Urspruenglich waren "Search Result Optimization" und "Tool Result Compression"
getrennte Features. Aber:

1. Beide loesen dasselbe Problem (zu viele Tokens im Kontext)
2. Getrennte Loesungen fuehren zu inkonsistentem Verhalten (manche Results
   optimiert, manche komprimiert, manche beides)
3. Das Dateisystem-Pattern (Manus) loest das Problem an der Wurzel und macht
   die In-Kontext-Optimierung teilweise ueberfluessig
4. Ein einheitliches Pattern in der ToolExecutionPipeline ist wartbarer als
   Tool-spezifische Optimierungen in 10+ Dateien

## Benefits Hypothesis

**Wir glauben dass** ein einheitliches Context Externalization Pattern
**folgende messbare Outcomes liefert:**
- 50-70% weniger akkumulierte Tokens in der Conversation History
- KV-Cache bleibt stabil (Append-only, keine History-Manipulation)
- Keine Informationsverluste (Dateien bleiben nachladbar)
- Bessere Agent-Entscheidungen durch kompakte, gerankte Zusammenfassungen
- Konsistentes Verhalten ueber alle Tools hinweg

**Wir wissen dass wir erfolgreich sind wenn:**
- Standard-Task (search+read+write) bleibt unter 130k Input-Tokens
- Agent findet weiterhin alle relevanten Dateien (Recall unveraendert)
- Agent liest externalisierte Results bei Bedarf selbststaendig nach
- KV-Cache-Hit-Rate sinkt NICHT durch Result-Handling

## User Stories

### Story 1: Effiziente Standard-Tasks
**Als** Vault Operator-Nutzer
**moechte ich** dass der Agent Suchergebnisse effizient verarbeitet
**um** schnellere und guenstigere Ergebnisse zu bekommen

### Story 2: Kein Informationsverlust
**Als** Power User mit komplexen Recherche-Aufgaben
**moechte ich** dass der Agent auf alle gefundenen Informationen zurueckgreifen kann
**um** vollstaendige Ergebnisse zu bekommen auch bei langen Workflows

### Story 3: Laengere Workflows
**Als** Vault Operator-Nutzer
**moechte ich** dass auch nach vielen Schritten kein Token-Overflow auftritt
**um** komplexe Aufgaben ohne Abbruch bearbeiten zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Grosse Arbeitsergebnisse werden ausserhalb des Gespraeches gespeichert und sind bei Bedarf abrufbar | 100% wiederherstellbar | Agent kann externalisierte Ergebnisse nachladen |
| SC-02 | Im Gespraech bleiben kompakte Zusammenfassungen mit den wichtigsten Informationen | Top-Treffer + Score sichtbar | Pruefung des Kontext-Inhalts |
| SC-03 | Gesamte Eingabedaten pro Standard-Aufgabe sinken signifikant | >=50% weniger History-Wachstum | Token-Vergleich vorher/nachher |
| SC-04 | Der Agent findet weiterhin alle relevanten Informationen | Recall unveraendert | Vergleichstest: gleiche Aufgabe mit/ohne Externalization |
| SC-05 | Zwischenspeicherung folgt einem einheitlichen Muster fuer alle Werkzeuge | 1 Pattern fuer alle Tools | Code-Review: kein Tool-spezifischer Sonderfall |
| SC-06 | Ergebnisqualitaet bleibt identisch oder verbessert sich | 0 Regressionen | Vergleichstest |

---

## Technical NFRs (fuer Architekt)

### Einheitliches Pattern (ToolExecutionPipeline)

```
EXTERNALIZE_THRESHOLD = ~2000 chars (~500 Tokens)

Fuer JEDES Tool-Result:
1. Messe Result-Groesse
2. Wenn > EXTERNALIZE_THRESHOLD:
   a. Schreibe volles Result in temp-Datei
   b. Erstelle kompakte Referenz:
      - Dateipfad (fuer read_file Nachlade)
      - Zusammenfassung (Top-N Treffer mit Score, oder Datei-Metadata)
      - Hinweis "Use read_file to see full results"
   c. Gib kompakte Referenz als tool_result zurueck
3. Wenn <= EXTERNALIZE_THRESHOLD:
   Normales Result (unveraendert)
```

### Tool-spezifische Referenz-Formate

| Tool | Kompakte Referenz (im Kontext) | Externalisiert (Datei) |
|------|-------------------------------|------------------------|
| search_files | "Found 50 matches. Top 5: [path (N matches)]... Full results: .obsidian-agent/tmp/{id}/search.md" | Alle 50 Matches mit Kontext-Snippets |
| semantic_search | "8 results. Top 3: [path (score)]... Full results: .obsidian-agent/tmp/{id}/semantic.md" | Alle Results mit vollen Excerpts |
| read_file | Unveraendert (wenn <Threshold) ODER "Content of {path} ({N chars}). Headings: {h1, h2...}. Use read_file({path}) to re-read." | Keine temp-Datei noetig (Original existiert im Vault) |
| web_search | "5 results. Top 3: [title (url)]... Full results: .obsidian-agent/tmp/{id}/web.md" | Alle Ergebnisse mit Snippets |
| web_fetch | "Fetched {url} ({N chars}). Summary: {first 500 chars}... Full content: .obsidian-agent/tmp/{id}/fetch.md" | Voller Seiteninhalt |

### KV-Cache-Kompatibilitaet (Manus-Prinzipien)

- **Append-only**: History-Eintraege werden NIE modifiziert. Externalization passiert
  BEIM Erstellen des tool_result, nicht nachtraeglich.
- **Deterministische Referenzen**: Pfade und Summaries muessen deterministisch sein.
  Keine Timestamps oder Zufallswerte im Kontext-Text.
- **read_file fuer Nachladen**: Agent nutzt bestehendes read_file Tool, kein neues Tool noetig.
  ABER: read_file auf temp-Dateien muss das Tool-Result-Cache umgehen (sonst cached es
  die kompakte Referenz statt des Dateiinhalts).

### Temp-Dateien Management

- **Speicherort**: `.obsidian-agent/tmp/{taskId}/` (pro Task isoliert)
- **Namenskonvention**: `{toolName}-{iteration}.md` (deterministisch, keine Timestamps)
- **Cleanup**: Nach Task-Completion alle Dateien unter `tmp/{taskId}/` loeschen
- **Crash-Safety**: Cleanup auch beim naechsten Plugin-Start fuer verwaiste tmp-Verzeichnisse

### Interaktion mit bestehendem System

- **Tool Result Cache** (per-task): Cached volle Results VOR Externalization.
  Wiederholter identischer Call liefert gecachtes volles Result → wird erneut
  externalisiert (deterministisch, gleiche Referenz).
- **Context Condensing (ADR-12)**: Arbeitet auf der bereits kompakten History.
  Weniger zu kondensieren → Condensing wird seltener noetig.
- **ToolRepetitionDetector**: Ledger behaelt Tool-Call-Info (Name + Input-Key).
  Braucht NICHT den vollen Result-Text.
- **EpisodicExtractor**: Nutzt `toolSequence` und `toolLedger` (nicht Result-Content).
  Kein Einfluss.

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Externalization muss in der ToolExecutionPipeline als einheitliches Pattern implementiert werden
- **Warum ASR**: Wenn jedes Tool seine eigene Externalization-Logik hat, wird das
  System unwartbar und inkonsistent
- **Impact**: Zentrale Stelle in ToolExecutionPipeline.executeTool() die NACH dem
  Tool-Aufruf und VOR dem Zurueckgeben des Results die Groesse prueft
- **Quality Attribute**: Consistency, Maintainability

**CRITICAL ASR #2**: Externalization darf den KV-Cache nicht invalidieren
- **Warum ASR**: Das ist das Hauptziel -- Token-Reduktion ohne Cache-Kosten
- **Impact**: Append-only, deterministisch, keine nachtraegliche Manipulation
- **Quality Attribute**: Cost Efficiency

**MODERATE ASR #3**: Agent muss externalisierte Results selbststaendig nachladen
- **Warum ASR**: Kompakte Referenz ist nur nuetzlich wenn der Agent weiss dass er nachladen kann
- **Impact**: Referenz-Format muss selbsterklaerend sein ("Use read_file to see full results")
- **Quality Attribute**: Correctness

### Constraints
- **Bestehende Tools unveraendert**: Tool-Implementierungen aendern sich NICHT.
  Externalization passiert in der Pipeline, nicht im Tool.
- **Kein neues Tool noetig**: Agent nutzt read_file fuer Nachlade (bestehendes Tool)
- **Review-Bot-Compliance**: Temp-Dateien via GlobalFileService, nicht via raw fs

### Open Questions fuer Architekt
1. Exakter EXTERNALIZE_THRESHOLD? (2000 chars vorgeschlagen, evtl. konfigurierbar)
2. Soll Externalization per Tool konfigurierbar sein (z.B. read_file nie externalisieren)?
3. Wie wird dem Agent im System Prompt erklaert dass Results externalisiert werden koennen?
4. Soll der Threshold abhaengig vom Model-Context-Window sein (groesseres Fenster = hoeherer Threshold)?

---

## Definition of Done

### Functional
- [ ] Einheitliches Pattern in ToolExecutionPipeline implementiert
- [ ] Grosse Tool-Results werden in temp-Dateien geschrieben
- [ ] Kompakte Referenzen im Kontext mit Pfad + Summary + Top-N
- [ ] Agent laedt externalisierte Results bei Bedarf per read_file nach
- [ ] Temp-Dateien werden nach Task-Completion bereinigt
- [ ] Verwaiste tmp-Verzeichnisse beim Plugin-Start bereinigt

### Quality
- [ ] Token-Messung: >=50% weniger History-Wachstum bei 8-Iterations-Task
- [ ] Recall-Test: Agent findet gleiche relevante Dateien
- [ ] Vergleichstest: Identische Ergebnisqualitaet mit/ohne Externalization
- [ ] KV-Cache: Append-only verifiziert (kein History-Eintrag modifiziert)

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] ADR fuer Context Externalization Pattern
- [ ] Tool-Routing-Rules angepasst (Hinweis auf Externalization)
- [ ] Backlog aktualisiert

---

## Dependencies
- **ToolExecutionPipeline**: Zentrale Implementierungsstelle
- **GlobalFileService**: Temp-Dateien schreiben/lesen/bereinigen
- **Tool Result Cache**: Muss mit Externalization harmonieren

## Assumptions
- Agent versteht das Referenz-Format und laedt bei Bedarf nach
- 2000 chars Threshold ist ein guter Kompromiss (zu niedrig = zu viele Dateien,
  zu hoch = zu viel im Kontext)
- Temp-Dateien in .obsidian-agent/tmp/ stoeren den Vault nicht

## Out of Scope
- Persistente Externalization ueber Sessions hinweg (nur intra-task)
- Externalization von Assistant-Responses (nur Tool-Results)
- Streaming-basierte Externalization
