# Exploration Board: Graph Intelligence

> **Project:** EPIC-20: Graph Intelligence
> **Created:** 2026-04-11
> **Phase:** EXPLORE

---

## 1. Research Mind Map

**Central Question:** Wie kann der Obsilo Knowledge Graph dem User helfen, die Struktur seines Denkens zu erkennen und zu verbessern -- ohne das Denken selbst zu ersetzen?

| Research Field | Guiding Questions | Priority |
|----------------|-------------------|----------|
| Users & User Groups | Wer nutzt PKM aktiv? Vault-Groessen, Vernetzungsgrad, Pflegeaufwand? | H |
| Graphentheorie & PKM | Welche Graph-Algorithmen sind auf Wissensnetze anwendbar? Louvain, PageRank, Betweenness? | H |
| Token-Oekonomie | Wie viel kostet eine Batch-Analyse von 500+ Notes? Wo kann LLM durch Code ersetzt werden? | H |
| Philosophie des PKM | Wo endet "Hilfe beim Organisieren" und beginnt "Denken ersetzen"? | H |
| Wettbewerb | Graphify, Obsidian Graph Analysis, Roam Research, Logseq -- was machen andere? | M |

---

## 2. Trends & Technology

- **Knowledge Graphs im PKM:** Obsidian, Roam, Logseq setzen auf User-kuratierte Graphen. LLM-gestuetzte Analyse ist ein neuer Trend (Karpathy-Pattern, Graphify).
- **Community Detection:** Louvain-Algorithmus fuer ungerichtete Graphen. Verfuegbar als JS-Library (graphology-communities-louvain). Leiden (Nachfolger) hat keine JS-Implementierung.
- **Hybrid Retrieval:** Kombination aus Graph-Topologie + Embedding-Vektoren fuer Suche ist bewaehrt (GraphRAG, Microsoft Research).
- **LLM-Token-Reduktion:** Deterministische Vorverarbeitung (AST, Regex, SQL) statt LLM-Calls fuer mechanische Aufgaben ist Standard-Optimierung.

---

## 3. Potential Partners & Competitors

### Competitors

| Competitor | Solution | Strengths | Weaknesses |
|------------|----------|-----------|------------|
| Graphify | AST + LLM -> NetworkX -> Community Detection | Deterministische Code-Extraktion, Confidence Scoring, Batch | Code-fokussiert, kein PKM, kein inkrementelles Update |
| Obsidian Graph Analysis | Community Plugin fuer Graph-Metriken | Native Obsidian, PageRank, Betweenness | Keine LLM-Integration, nur Analyse ohne Handlungsvorschlaege |
| Smart Connections | Obsidian Plugin fuer semantische Aehnlichkeit | Implizite Verbindungen | Nur Embeddings, kein Graph-Verstaendnis, keine Cluster |
| Breadcrumbs | Obsidian Plugin fuer hierarchische Navigation | Strukturierte Hierarchien | Manuell, kein automatisches Clustering |

### Potential Partners

| Partner | Competency | Synergy |
|---------|-----------|---------|
| Obsidian Community | Plugin-Oekosystem, Graph-View API | Native Integration, User-Feedback |
| graphology (JS) | Louvain-Implementierung | Algorithmus-Grundlage fuer Clustering |

---

## 4. Facts & Figures

- Obsilo Vault-Referenz: ~500-1000 Notes, 10-20 neue/Woche, 10.783 Vektoren im Index
- GraphStore: SQLite, ~2000-5000 Edges typisch bei 500+ Notes
- Aktueller Health Check: 5 Pruefungen, ~0ms Laufzeit (pure SQL)
- Knowledge Ingest: ~$0.10-0.30 pro Note (LLM-Kosten), bei 50 PDFs = $5-15
- Graphify Token-Reduktion: 71.5x weniger Tokens pro Query durch Graph-Vorverarbeitung

---

## 5. Potential Fields

1. **Graph-Diagnostik:** User will verstehen WO strukturelle Probleme liegen -- nicht nur broken links, sondern emergente Muster (ueberladene Hubs, isolierte Cluster, fehlende Verbindungen zwischen Themengebieten).

2. **Vertrauenswuerdigkeit:** User will wissen welche Verbindungen "echt" (selbst gesetzt) und welche "vermutet" (semantische Aehnlichkeit) sind. Aktuell sieht alles gleich aus.

3. **Batch-Effizienz:** 50 unintegrierte Notes sind ein Motivationskiller. Der Ingest-Prozess muss skalieren ohne dabei Token-Kosten zu explodieren oder AI-Slop zu produzieren.

4. **Denken vs. Automatisieren:** Die Grenze zwischen "Agent hilft beim Organisieren" und "Agent ersetzt mein Denken" ist das zentrale Design-Problem. Verlinkungen sind Ausdruck des eigenen Denkens -- sie duerfen nicht eigenmaechtig gesetzt werden.

---

## 6. User(s)

### Persona 1: Dr. Lena Forster (Akademische Forscherin)

- **Role/Occupation:** Postdoc, Sozialwissenschaften, 3 Jahre Zettelkasten-Erfahrung
- **Age/Segment:** 34, Digital Humanities
- **Goals:** Literatur-Corpus verwalten (200+ Quellen), Themen-Cluster fuer Publikationen erkennen, neue Verbindungen zwischen Forschungsfeldern entdecken
- **Frustrations:** "Ich habe 80 ungelesene PDFs in meiner Inbox. Jede einzeln zu integrieren dauert 10 Minuten. Das ist ein ganzer Tag Arbeit." Kein Ueberblick welche Themen-Cluster emergieren.
- **Typical Quote:** "Ich will sehen wo mein Denken hingeht, nicht wo der Computer denkt dass es hingeht."
- **Usage Context:** Taeglich 2-3h im Vault, Quellen lesen, Notes schreiben, Wikilinks setzen. Wochenendlich: Vault aufraeuumen, MOCs pflegen.

### Persona 2: Marcus Keller (Wissensarbeiter)

- **Role/Occupation:** Produktmanager, Tech-Unternehmen, 1 Jahr Obsidian-Erfahrung
- **Age/Segment:** 42, agiles Projektmanagement
- **Goals:** Meeting-Notes, Strategie-Dokumente, Projekt-Wissen vernetzen. Schnell relevante Kontexte finden.
- **Frustrations:** "Mein Vault ist ein Chaos. 600 Notes, kaum verlinkt. Ich weiss nicht wo ich anfangen soll." Vault Health Badge zeigt 40+ Findings aber er weiss nicht welche wichtig sind.
- **Typical Quote:** "Ich brauche jemanden der mir sagt: fang hier an, das ist dein groesstes Problem."
- **Usage Context:** Taeglich 30min im Vault, hauptsaechlich Meeting-Notes und Quick Captures. Monatlich: versucht aufzuraeumen, gibt meist auf.

### Persona 3: Sarah Chen (PKM Power User)

- **Role/Occupation:** Freelance Consultant, Knowledge Management, 3+ Jahre Zettelkasten
- **Age/Segment:** 38, Cross-Domain Consulting
- **Goals:** Perfekter Wissensgraph mit dichten Verlinkungen. Nutzt MOCs, Themen, Konzepte konsequent. Will neue Verbindungen zwischen Domains entdecken.
- **Frustrations:** "Meine Themen-Notes werden zu gross. 'Kuenstliche Intelligenz' hat 80 Backlinks -- ich muesste es in Sub-Themen aufteilen, aber ich weiss nicht wo ich schneiden soll." Fehlende Uebersicht ueber die Graph-Topologie.
- **Typical Quote:** "Zeig mir die Struktur meines Denkens -- dann kann ich entscheiden was ich aendern will."
- **Usage Context:** Taeglich 1-2h aktive Pflege, woechentlich Vault-Maintenance-Ritual mit Health Check.

---

## 7. Needs

| Need ID | Need | Type | Priority | Addressed for Persona |
|---------|------|------|----------|-----------------------|
| N-01 | Strukturelle Probleme im Vault automatisch erkennen (Cluster-Blindheit, ueberladene Hubs, isolierte Notes) | Functional | H | Alle |
| N-02 | Vertrauen in die Qualitaet der Verbindungen haben (echt vs. vermutet unterscheiden koennen) | Emotional | H | Lena, Sarah |
| N-03 | 50+ Notes/PDFs in einem Rutsch integrieren ohne einzeln durchzugehen | Functional | H | Lena, Marcus |
| N-04 | Wissen welche Hub-Notes aufgeteilt werden sollten und WO der Schnitt sinnvoll waere | Functional | M | Sarah |
| N-05 | Das eigene Denken und die eigene Struktur behalten -- Agent soll zeigen, nicht entscheiden | Emotional | H | Lena, Sarah |
| N-06 | Klar priorisierte naechste Schritte bekommen statt ueberwaetigender Findings-Listen | Emotional | M | Marcus |
| N-07 | Token-Kosten bei Batch-Operationen kontrollierbar halten | Functional | M | Alle |
| N-08 | Agent liefert relevantere Antworten durch bessere Retrieval-Qualitaet (Confidence-gewichtete Expansion, Cluster-aware Ranking) | Functional | H | Alle |

---

## 8. Insights

### General / Contextual
- Vaults wachsen schneller als User sie organisieren koennen. Die Schere zwischen "neue Notes" und "integrierte Notes" wird groesser mit der Zeit.
- Ab ~500 Notes verliert der User den Ueberblick ueber die Gesamt-Topologie. Obsidians Graph View wird unlesbar.

### Functional Insights
- **Workaround "manuelles Graph-Browsing":** User zoomen im Graph View rein und raus, suchen nach Clustern die "komisch aussehen". Extrem ineffizient.
- **Workaround "Health Check":** Findet nur mechanische Fehler (broken links, fehlende Tags). Strukturelle Probleme (ueberladene Hubs, fehlende Cluster) werden nicht erkannt.
- **Workaround "Ignorieren":** Marcus' Ansatz. Funktioniert bis der Vault so unorganisiert ist dass Retrieval-Qualitaet leidet.

### Emotional Insights
- **Angst vor AI-Slop:** Groesste Sorge ist dass der Agent "dumme Verbindungen" setzt die das eigene Denken verwassern. "Summaries don't replace thinking." (Karpathy-Kritik)
- **Befriedigung bei gutem Graphen:** Sarah beschreibt ein "Flow-Gefuehl" wenn ein neuer Ingest gut verlinkt ist und sich organisch in den bestehenden Graphen einfuegt.
- **Ueberwaeltigung bei Inbox-Stau:** Lena beschreibt "Ingest-Muedigkeit" -- je laenger die Inbox voll ist, desto weniger Motivation sie abzuarbeiten.

### Social Insights
- PKM ist grundsaetzlich eine Solo-Aktivitaet. Aber die Community (Obsidian Discord, Reddit) teilt Workflows und Patterns. "Zeig mir deinen Graphen" ist ein haeufiger Post-Typ.

### Analogies
- **Graphify (Code-Analyse):** Confidence Scoring (EXTRACTED/INFERRED/AMBIGUOUS) ist direkt uebertragbar auf PKM-Edges.
- **IDE Code Smell Warnings:** "God Node" Warnung ist analog zu "God Class" in der Software-Entwicklung -- ein Anti-Pattern das auf Refactoring hindeutet.
- **Git Diff Review:** "Vorschlaege zeigen, User entscheidet" -- wie ein Pull Request Review. Der Agent ist der Reviewer, nicht der Autor.

---

## 9. Touchpoints

| Touchpoint | Phase | Channel | Experience |
|------------|-------|---------|------------|
| Sidebar Health Badge | Before | Digital (Obsidian UI) | Neutral -- zeigt Zahl, aber keine Prioritaet |
| Chat mit Agent | During | Digital (Obsidian Chat) | Positiv -- konversationell, erklaerend |
| Health Repair Modal | During | Digital (Obsidian Modal) | Positiv -- One-Click mit Undo |
| Obsidian Graph View | After | Digital (Obsidian native) | Negativ bei 500+ Notes -- unlesbar |
| Semantic Search Results | During | Digital (Agent-Response) | Positiv -- findet relevante Notes |

---

## 10. How Might We?

### Primary HMW Question

**How might we** help Obsidian PKM users **understand and improve** the structure of their knowledge graph, **despite** growing vault sizes and the need to preserve the user's own thinking in every linking decision?

### Alternative HMW Questions

1. How might we enable batch-integration of 50+ documents without sacrificing the quality of human-curated connections?
2. How might we surface emergent knowledge clusters that the user hasn't explicitly organized, in a way that invites exploration rather than prescribing structure?
3. How might we distinguish between human-authored and system-inferred connections, so users can trust their graph while benefiting from AI-assisted discovery?

---

## Transition to IDEATION

The Explore phase is complete when:
- [x] At least 1 persona fully described (3 personas created)
- [x] At least 3 validated needs identified (7 needs identified)
- [x] At least 2 insights per category (functional: 3, emotional: 3)
- [x] Primary how-might-we question formulated
- [x] Potential fields identified (4 fields)
- [x] Trends and competitors researched
