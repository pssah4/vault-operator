# Business Analysis: Graph Intelligence

> **Scope:** MVP
> **Created:** 2026-04-11
> **Status:** Draft

---

## 1. Executive Summary

### 1.1 Problem Statement
Obsidian Vaults mit 500+ Notes verlieren strukturelle Uebersicht. Der User erkennt nicht welche Themen-Cluster emergieren, welche Hub-Notes ueberladen sind, und ob die Verbindungen im Graph vertrauenswuerdig sind. Batch-Integration neuer Dokumente ist zu muehsam fuer Inbox-Staus von 50+ Dateien.

### 1.2 How-Might-We Question
**How might we** help Obsidian PKM users **understand and improve** the structure of their knowledge graph, **despite** growing vault sizes and the need to preserve the user's own thinking in every linking decision?

### 1.3 Value Proposition (Solution Hypothesis)
Graph Intelligence erweitert den Obsilo Agent auf zwei Ebenen: (1) User-facing -- Diagnostik-Tools die dem User helfen, die Struktur seines Denkens zu erkennen und zu verbessern (Confidence Scoring, Cluster-Erkennung, God-Node-Analyse, Batch-Ingest). (2) Agent-facing -- smartere Retrieval-Qualitaet durch Confidence-gewichtete Graph-Expansion, Cluster-aware Suche und Hub-Kontext-Anker. Beide Ebenen respektieren das Prinzip: Verlinkungen sind Ausdruck des eigenen Denkens.

### 1.4 High-Level Concept
"IDE Code Analyzer fuer dein Wissensnetz -- findet strukturelle Probleme und schlaegt Verbesserungen vor, ohne deinen Code umzuschreiben."

### 1.5 Expected Outcomes

**User-facing:**
- User erkennt emergente Cluster in seinem Vault (die er nicht manuell organisiert hat)
- User weiss welche Hubs zu gross sind und wo er aufteilen koennte
- User kann 50+ Notes in einem Workflow integrieren statt einzeln
- User vertraut seinen Graph-Verbindungen weil er echt vs. vermutet unterscheiden kann

**Agent-facing (Retrieval-Qualitaet):**
- semantic_search liefert relevantere Ergebnisse durch Confidence-gewichtete Graph-Expansion
- Agent findet thematisch zusammengehoerende Notes ueber Cluster-Zugehoerigkeit statt nur Embedding-Aehnlichkeit
- Hub-Notes dienen als Kontext-Anker fuer breitere Themen-Abfragen

---

## 2. Business Context

### 2.1 Background
Obsilo hat einen vollstaendigen Knowledge Graph (GraphStore, OntologyStore, VaultHealthService) mit 5 Health Checks und einem Ingest-Skill. Die aktuelle Analyse basiert auf manuellen MOC-Properties und mechanischen Pruefungen (broken links, fehlende Backlinks). Graphentheoretische Analyse (Clustering, Hub-Metriken, Confidence) fehlt.

Inspiration: Graphify nutzt Community Detection (Leiden/Louvain) und Confidence Scoring fuer Code-Graphen. Diese Konzepte sind auf PKM-Graphen uebertragbar. Fuer die JS-Implementierung steht Louvain via graphology zur Verfuegung (Leiden hat keine JS-Library).

### 2.2 Current State ("As-Is")
- OntologyStore clustert nur basierend auf expliziten MOC-Properties (was der User manuell verlinkt hat)
- Implizite Edges (Cosine-Similarity) existieren, haben aber keine Confidence-Werte und sind nicht von echten Edges unterscheidbar
- Health Check findet mechanische Fehler, keine strukturellen Anti-Patterns
- Ingest ist einzeln und interaktiv (~10min pro Note/PDF)
- **Retrieval:** Graph-Expansion in semantic_search behandelt alle Edges gleich -- ein echter Wikilink hat dasselbe Gewicht wie eine schwache implizite Verbindung. Cluster-Zugehoerigkeit fliesst nicht in die Suche ein.

### 2.3 Desired State ("To-Be")
- Graph-Edges haben Confidence-Werte (1.0 fuer User-gesetzte, 0.x fuer implizite)
- Community Detection entdeckt emergente Cluster unabhaengig von manuellen MOC-Properties
- God-Node-Analyse warnt vor ueberladenen Hubs und schlaegt Aufteilungspunkte vor
- Batch-Ingest verarbeitet Ordner von Notes/PDFs mit Token-effizienter Pipeline
- Alle Vorschlaege sind konversationell: Agent zeigt, User entscheidet
- **Retrieval:** semantic_search gewichtet Graph-Expansion nach Confidence. Cluster-Zugehoerigkeit boosted thematisch verwandte Notes. Hub-Notes dienen als Kontext-Anker bei breiten Abfragen.

### 2.4 Gap Analysis
| Gap | As-Is | To-Be | Effort |
|-----|-------|-------|--------|
| Cluster-Erkennung | Nur manuelle MOC-Properties | Louvain auf Graph-Topologie + Embeddings | M |
| Confidence | Alle Edges gleich | 3-stufig: EXTRACTED, INFERRED, IMPLICIT | S |
| Hub-Analyse | Keine | Degree + Betweenness Centrality, Aufteilungsvorschlaege | S |
| Batch-Ingest | Einzeln, interaktiv, ~$0.20/Note | Ordner-weise, semi-automatisch, Token-optimiert | L |
| Retrieval-Qualitaet | Alle Edges gleichgewichtig, kein Cluster-Boost | Confidence-gewichtete Expansion, Cluster-aware Ranking | M |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|-------------|------|----------|-----------|-------|
| Obsilo User (PKM) | Endanwender | H | H | Bessere Graph-Uebersicht, weniger manuelle Arbeit |
| Obsidian Community | Review / Feedback | M | M | Plugin-Qualitaet, Performance, keine Obsidian-API-Verletzungen |
| Sebastian (Developer) | Entwickler + Product Owner | H | H | Technische Machbarkeit, Wartbarkeit, Token-Kosten |

### 3.2 Key Stakeholders

**Primary:** Sebastian (Entwickler + einziger Maintainer)
**Secondary:** Obsidian PKM Community (Early Adopters via BRAT)

---

## 4. User Analysis

### 4.1 User Personas
Siehe Exploration Board `EXPLORE-11-graph-intelligence.md` (3 Personas: Dr. Lena Forster, Marcus Keller, Sarah Chen).

### 4.2 Needs
Siehe Exploration Board N-01 bis N-08. Ergaenzung gegenueber reiner Diagnostik:

**N-08 (Retrieval-Qualitaet):** Der Agent soll nicht nur dem User helfen seinen Graph zu verstehen, sondern selbst bessere Antworten liefern. Confidence-gewichtete Graph-Expansion, Cluster-aware Ranking und Hub-Kontext-Anker verbessern die Relevanz der Retrieval-Ergebnisse direkt.

### 4.3 Insights

**Functional Insights:**
- Ab ~500 Notes wird manuelles Graph-Browsing ineffizient
- Health Check ist nuetzlich fuer mechanische Fehler, aber strukturelle Probleme bleiben unsichtbar
- Batch-Ingest wuerde die groesste Zeitersparnis bringen (10min * 50 Notes = 8h -> 30min)

**Emotional Insights:**
- "Summaries don't replace thinking" -- der User will Kontrolle ueber seine Wissensstruktur behalten
- Befriedigung bei gutem Graphen, Ueberwaeltigung bei Inbox-Stau
- Vertrauen ist essenziell: Wenn der User nicht weiss welche Verbindungen echt sind, verliert der Graph seinen Wert

**Analogies:**
- Graphify: Confidence Scoring + Community Detection fuer Code-Graphen
- IDE Code Smells: God-Node = God-Class Anti-Pattern
- Git PR Review: Agent zeigt Diff, User merged (oder nicht)

### 4.4 User Journey (High-Level)
1. User oeffnet Obsidian, sieht Health Badge mit Findings
2. User fragt Agent im Chat: "Wie sieht mein Graph aus?"
3. Agent analysiert Graph-Topologie, zeigt Cluster, God-Nodes, Confidence-Verteilung
4. User entscheidet welche Vorschlaege er umsetzen will
5. Agent fuehrt bestaetigt Aktionen aus (neue Themen, Backlinks, Stub-Notes)
6. Optional: User startet Batch-Ingest fuer Inbox-Ordner

### 4.5 Touchpoints

| Touchpoint | Phase | Channel | Experience |
|------------|-------|---------|------------|
| Health Badge | Before | Obsidian Sidebar | Neutral -> Positiv (priorisierte Findings) |
| Chat-Analyse | During | Agent Chat | Positiv (erklaerend, konversationell) |
| Cluster-Report | During | Agent Response | Positiv (emergente Muster sichtbar) |
| Batch-Ingest Progress | During | Agent Chat + Notices | Positiv (Fortschritt sichtbar) |
| Obsidian Graph View | After | Obsidian nativ | Positiv (bessere Struktur sichtbar) |

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)
PKM Vaults leiden an vier strukturellen Problemen die mit wachsender Groesse zunehmen:

1. **Cluster-Blindheit:** Emergente Themen-Cluster sind unsichtbar weil die OntologyStore nur explizite MOC-Properties kennt. Notes die thematisch zusammengehoeren aber nicht verlinkt sind, bleiben isoliert.

2. **Hub-Wildwuchs:** Manche Themen-Notes akkumulieren 50+ Backlinks und werden zu generisch. Der User weiss nicht wo er aufteilen soll.

3. **Vertrauensproblem:** Implizite Edges (Cosine-Similarity) und echte Wikilinks sehen identisch aus. Der User kann nicht beurteilen ob eine Verbindung "echt" (sein Denken) oder "vermutet" (Algorithmus) ist.

4. **Ingest-Stau:** Einzeln-interaktiver Ingest skaliert nicht. 50 PDFs in der Inbox = 8h manuelle Arbeit. Das fuehrt zu Vermeidungsverhalten.

### 5.2 Root Causes
- OntologyStore clustert nur basierend auf was der User explizit verlinkt hat (keine Emergenz)
- Edges-Tabelle hat keine Confidence-Spalte
- VaultHealthService prueft mechanische Fehler, keine Graph-Metriken (Degree, Centrality)
- Knowledge-Ingest-Skill ist fuer Einzelnoten designed, nicht fuer Batch

### 5.3 Impact
- **User Impact:** 8h+ pro Monat fuer Vault-Maintenance bei 500+ Notes. Retrieval-Qualitaet sinkt bei unorganisiertem Graph. Motivation sinkt bei vollem Inbox.
- **Business Impact:** Churn-Risiko -- User wechselt zu einfacherem Tool wenn Vault zu komplex wird.

### 5.4 Jobs to be Done

| Job Type | Job Description | Currently "Hired" | Firing Reason |
|----------|----------------|-------------------|---------------|
| Functional | Strukturelle Muster im Wissensgraph erkennen | Manuelles Graph-Browsing | Unlesbar ab 500+ Notes |
| Functional | 50+ Dokumente integrieren | Knowledge-Ingest-Skill (einzeln) | Skaliert nicht, 10min/Note |
| Emotional | Vertrauen in die Qualitaet meines Graphen haben | Blind vertrauen oder Health Check | Keine Confidence-Info |
| Emotional | Kontrolle ueber mein Denken behalten | Manuelles Verlinken | Agent setzt keine Links ohne Bestaetigung |

---

## 6. Goals & Objectives

### 6.1 Business Goals
- Vault-Maintenance-Aufwand um 70% reduzieren (von 8h/Monat auf 2h/Monat)
- Retrieval-Qualitaet durch bessere Graph-Struktur verbessern
- Differenzierung gegenueber anderen PKM-Tools durch Graph-Intelligence

### 6.2 User Goals
- Emergente Cluster sehen und verstehen
- Ueberladene Hubs erkennen und aufteilen koennen
- 50+ Notes in einem Workflow integrieren
- Verbindungen nach Vertrauenswuerdigkeit beurteilen koennen

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|-----|----------|--------|-----------|
| Vault-Maintenance-Zeit pro Monat | ~8h (geschaetzt) | <2h | 3 Monate nach Release |
| Inbox-Durchsatz (Notes/Session) | 5-10 (einzeln) | 50+ (Batch) | Sofort |
| Cluster-Abdeckung (% Notes in Clustern) | ~40% (nur MOC-verlinkte) | >80% (inkl. emergente) | 1 Monat |
| Health Check Findings-Aufloesung | ~30% resolved | >70% resolved | 3 Monate |
| Retrieval-Relevanz (Top-5 Precision) | ~60% (geschaetzt) | >80% | 2 Monate |

---

## 7. Idea Potential & Solution Concept

### 7.1 Idea Potential (3 Assessment Axes, Scale 0-10)

| Axis | Score | Rationale |
|------|-------|-----------|
| **Value / Urgency** | 8 | PKM-User mit 500+ Notes haben das Problem jetzt. Vaults wachsen schneller als User sie organisieren. |
| **Transferability** | 7 | Betrifft alle ernsthaften PKM-User (nicht Casual). Skaliert mit Vault-Groesse. |
| **Feasibility** | 7 | GraphStore und OntologyStore existieren. Confidence ist eine Spalte. Louvain verfuegbar via graphology (~100KB). Batch-Ingest ist Orchestrierung bestehender Tools. |

### 7.2 The Wow

"Der Agent zeigt dir Muster in deinem Denken, die du selbst noch nicht bemerkt hast -- emergente Cluster, die organisch aus deinen Notes entstanden sind. Nicht weil der Computer sie erfunden hat, sondern weil du sie geschrieben hast und er sie erkannt hat."

### 7.3 Critical Hypotheses

| ID | Hypothesis | Type | Test Method | Success Criterion |
|----|-----------|------|-------------|-------------------|
| H-01 | Louvain Community Detection auf Wikilink+Frontmatter-Graphen liefert sinnvolle Cluster (nicht nur Noise) | Tech Feasibility | PoC auf echtem Vault mit 500+ Notes | >60% der Cluster-Zuordnungen sind fuer den User nachvollziehbar |
| H-02 | Batch-Ingest kann Token-Kosten pro Note um 50% reduzieren gegenueber Einzel-Ingest | Data / Cost | Benchmark: 50 PDFs einzeln vs. batch | $0.10/Note statt $0.20/Note |
| H-03 | God-Node-Warnung (Degree > 50) korreliert mit User-wahrgenommener "Ueberladung" | Problem-Solution Fit | Befragung/Test mit 3 Usern | >80% der geflaggten Nodes werden vom User als "zu gross" bestaetigt |
| H-04 | User akzeptiert emergente Cluster als Reflexion seines Denkens (nicht als AI-Slop) | Problem-Solution Fit | Qualitatives Interview nach Nutzung | User bestaetigt >70% der Cluster |
| H-05 | Confidence-gewichtete Graph-Expansion verbessert Top-5 Retrieval-Precision messbar | Tech Feasibility | A/B-Vergleich: gleichgewichtete vs. Confidence-gewichtete Expansion auf 20 Testabfragen | >15% Verbesserung der Top-5 Precision |

### 7.4 Solution Idea and Object Model

**4 Features, aufgebaut auf bestehendem Stack:**

**F1: Confidence Scoring**
- Neue Spalte `confidence REAL` in `edges` Tabelle
- 3 Stufen: EXTRACTED (1.0, Body-Wikilinks), MOC (1.0, Frontmatter-Properties), IMPLICIT (0.x, Cosine-Similarity)
- GraphExtractor setzt Confidence beim Schreiben
- SemanticSearch und VaultHealth nutzen Confidence fuer Gewichtung
- Agent kann im Chat berichten: "Dein Graph hat 2000 echte Verbindungen und 500 vermutete"

**F2: Community Detection (Louvain)**
- Louvain-Algorithmus auf dem bestehenden GraphStore-Edge-Graphen (via graphology)
- Ergebnis: Community-IDs pro Note, gespeichert in OntologyStore
- Vergleich mit bestehenden MOC-Clustern: "3 Cluster sind neu, 5 sind bestaetigt"
- Agent praesentiert konversationell: Cluster-Name (LLM-generiert), Mitglieder, Vorschlag
- User entscheidet ob Cluster zu Themen-Note wird oder nicht

**F3: God-Node-Analyse**
- Berechne In-Degree, Out-Degree, Betweenness Centrality pro Note
- Flagge Notes mit Degree > konfigurierbar (default 50) als "God Nodes"
- Agent schlaegt Aufteilungspunkte vor basierend auf Cluster-Zugehoerigkeit der Backlinks
- Neuer Health Check Typ: "Ueberladene Hubs"

**F4: Batch-Ingest**
- Neuer Workflow: "Integriere alle Notes/PDFs in Ordner X"
- Phase 1 (deterministisch, kein LLM): Dateien scannen, Duplikate erkennen, Frontmatter pruefen
- Phase 2 (LLM, Token-optimiert): Entity-Erkennung pro Datei, aber mit geteiltem Entitaets-Cache (einmal suchen, mehrfach verlinken)
- Phase 3 (konversationell): Zusammenfassung zeigen, User bestaetigt gruppenweise
- Checkpoint nach jeder Gruppe fuer Undo

**F5: Retrieval-Quality-Verbesserungen (Agent-facing)**
- **Confidence-gewichtete Graph-Expansion:** `getNeighbors()` gewichtet Ergebnisse mit Edge-Confidence. Echte Wikilinks (1.0) werden bevorzugt, schwache implizite Edges (0.5) abgewertet. RRF-Fusion integriert Confidence als Rank-Boost.
- **Cluster-aware Retrieval:** Wenn semantic_search einen Treffer findet, werden andere Notes im selben Louvain-Cluster als "thematisch verwandt" geboostet -- auch wenn ihre Embeddings nicht direkt aehnlich sind.
- **Hub-Kontext-Anker:** Bei breiten Abfragen (z.B. "Was weiss ich ueber KI?") identifiziert der Agent den relevanten Hub (Themen-Note "Kuenstliche Intelligenz") und nutzt dessen Cluster als Retrieval-Scope statt den gesamten Vault zu durchsuchen.
- **Cluster-Kontext im System-Prompt:** Kontext-Kondensierung kann Cluster-Zugehoerigkeit als kompakten Hint einbetten ("This note belongs to cluster 'Ethics in AI' with 12 related notes").

---

## 8. Scope Definition

### 8.1 In Scope
- Confidence Scoring fuer GraphStore Edges (F1)
- Louvain Community Detection mit OntologyStore-Integration (F2)
- God-Node-Analyse als neuer Health Check Typ (F3)
- Batch-Ingest fuer Ordner mit Token-Optimierung (F4)
- Retrieval-Quality-Verbesserungen: Confidence-gewichtete Expansion, Cluster-aware Ranking, Hub-Kontext-Anker (F5)
- Konversationelle Praesentation aller Ergebnisse im Chat
- Settings fuer Thresholds (God-Node Degree, Confidence-Minimum, Batch-Groesse)

### 8.2 Out of Scope
- Eigener Graph-Viewer (Obsidians nativer Graph View reicht)
- Automatisches Linking ohne User-Bestaetigung
- Code-Analyse / AST-Parsing (das ist Graphify's Domaene, nicht PKM)
- Video/Audio-Transkription (kein User-Bedarf im PKM-Kontext)
- Hyperedges (zu komplex, MOC-Pattern deckt den Use Case ab)
- Echtzeit-Clustering bei jedem Keystroke (zu teuer, Batch-Analyse reicht)

### 8.3 Assumptions
- Louvain-Algorithmus ist via graphology-communities-louvain verfuegbar
- GraphStore hat genuegend Edges fuer sinnvolles Clustering (>200 Edges)
- Token-Kosten fuer Batch-Ingest sind durch deterministische Vorverarbeitung reduzierbar

### 8.4 Constraints
- Obsidian Plugin API: Kein eigener Graph-Viewer, keine nativen Graph-Erweiterungen
- Token-Budget: Batch-Ingest darf nicht >$0.15/Note kosten
- Performance: Graph-Analyse muss in <5s fuer 1000 Notes abschliessen
- Review-Bot: Alle Code-Aenderungen muessen obsidianmd ESLint bestehen

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Louvain in JS nicht performant genug | M | H | PoC mit echten Daten vor Implementierung. Fallback: Label Propagation |
| Cluster sind fuer User nicht nachvollziehbar | M | H | LLM-generierte Cluster-Namen + User-Bestaetigung. H-04 validieren |
| Batch-Ingest erzeugt AI-Slop | M | H | Deterministische Vorverarbeitung. LLM nur fuer semantische Entscheidungen. User-Review pro Gruppe |
| Token-Kosten explodieren | L | M | Entitaets-Cache, deterministische Schritte, Token-Budget pro Batch |
| Graph-Analyse zu langsam bei 1000+ Notes | L | M | SQL-basierte Vorberechnung, Cache, inkrementelle Updates |

---

## 10. Requirements Overview (High-Level)

### 10.1 Functional Requirements (Summary)
1. Confidence-Werte fuer alle Graph-Edges berechnen und speichern
2. Community Detection auf dem Wikilink/Frontmatter-Graphen ausfuehren
3. God-Node-Metriken (Degree, Centrality) berechnen und warnen
4. Batch-Ingest fuer Ordner mit Token-Optimierung und Gruppen-Review

### 10.2 Non-Functional Requirements (Summary)
- **Performance:** Graph-Analyse <5s fuer 1000 Notes
- **Token-Kosten:** Batch-Ingest <$0.15/Note
- **UX:** Konversationelle Praesentation, kein eigenmaechtes Handeln
- **Datenintegritaet:** Checkpoint/Undo fuer alle strukturellen Aenderungen

### 10.3 Key Features (for RE)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | Confidence Scoring | Spalte `confidence` in `edges`, 3-stufige Klassifikation, GraphExtractor-Integration |
| P0 | Community Detection | Louvain auf GraphStore, OntologyStore-Integration, konversationelle Praesentation |
| P1 | God-Node-Analyse | Degree/Centrality-Berechnung, neuer Health Check Typ, Aufteilungsvorschlaege |
| P1 | Batch-Ingest | Ordner-basierter Workflow, Entitaets-Cache, Token-Optimierung, Gruppen-Review |
| P0 | Retrieval-Quality | Confidence-gewichtete Graph-Expansion, Cluster-aware Ranking, Hub-Kontext-Anker |

---

## 11. Evaluate -- Market Assessment & Business Viability

### 11.1 Value Proposition Score (Scale 0-10)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Activate users** | 8 | PKM-User mit >500 Notes haben ein akutes Problem. Graph Intelligence ist ein starkes Differenzierungsmerkmal. |
| **Preference vs. substitutes** | 7 | Kein anderes Obsidian-Plugin kombiniert Graph-Analyse mit LLM-Agent. Smart Connections und Graph Analysis sind partiell. |
| **Willingness to pay** | N/A | Obsilo ist Open Source (Apache-2.0). Kein Pricing. |
| **Referral potential** | 8 | "Zeig mir deinen Graphen" ist ein Community-Meme. Graph Intelligence ist teilbar und visuell ansprechend. |

### 11.2 Assessment Radar (Scale 0-10)

| Axis | Score | Rationale |
|------|-------|-----------|
| **Brand Fit** | 9 | Graph Intelligence passt perfekt zu Obsilo's Positionierung als "AI Operating Layer" |
| **Investment** | 6 | 4 Features, ~2-4 Wochen Implementierung. graphology-Integration ist das groesste Risiko. |
| **Asset Fit** | 9 | GraphStore, OntologyStore, VaultHealthService existieren. Erweiterung, kein Neubau. |
| **Viral Potential** | 8 | "Mein Agent hat 5 neue Cluster in meinem Vault entdeckt" ist teilbar. |
| **New Customer** | 6 | Eher Retention als Akquisition. Aber Graph Intelligence koennte Power User anziehen. |
| **Market Size** | 5 | Nische (Obsidian PKM Power User), aber wachsend. |

### 11.3 Price Point & Willingness to Pay
- N/A -- Open Source, kostenfrei. Token-Kosten traegt der User (eigener API Key).

### 11.4 Channels

| Channel | Purpose | Priority |
|---------|---------|----------|
| BRAT (Beta Testing) | Early Adopter Distribution | H |
| Obsidian Community Plugins | Breitere Distribution | H |
| GitHub Releases | Versionierung + Changelog | H |
| Obsidian Discord / Reddit | Community Feedback | M |

### 11.5 Unfair Advantage
- Einziges Obsidian-Plugin das einen LLM-Agent mit Graph-Intelligence kombiniert
- Bestehender Knowledge Graph Stack (GraphStore, OntologyStore, VectorStore) als Fundament
- 49 Tools + Multi-Agent-Architektur ermoeglichen komplexe Workflows (Batch-Ingest)

### 11.6 Revenue Stream
N/A -- Open Source. Wertschoepfung durch Community-Wachstum und Plugin-Reputation.

### 11.7 KPIs

| KPI | Baseline | Target | Timeframe | Measurement Method |
|-----|----------|--------|-----------|-------------------|
| Cluster-Abdeckung | ~40% | >80% | 1 Monat | OntologyStore: Notes in Clustern / Total Notes |
| Inbox-Durchsatz | 5-10/Session | 50+/Session | Sofort | Batch-Ingest Counter |
| Health Findings resolved | ~30% | >70% | 3 Monate | VaultHealthService Metric |
| User-Akzeptanz emergenter Cluster | 0% | >70% | 1 Monat | Qualitatives Feedback |

### 11.8 User Experience & Emotion
- **User Experience:** Konversationell, erklaerend, nicht praeskriptiv. Agent zeigt Muster, User entscheidet. "Dein Vault, dein Denken -- ich zeige dir nur was ich sehe."
- **Emotional Response:** Neugier ("Oh, diese Notes gehoeren zusammen?"), Kontrolle ("Ich entscheide was verlinkt wird"), Befriedigung ("Mein Graph ist jetzt besser organisiert").

---

## 12. Next Steps

- [ ] Review dieses Dokuments
- [ ] Handoff zu Requirements Engineer (`/requirements-engineering`)
- [ ] Input: `_devprocess/analysis/BA-11-graph-intelligence.md`

---

## Appendix

### A. Glossary
- **Confidence Score:** Numerischer Wert (0.0-1.0) der die Zuverlaessigkeit einer Graph-Verbindung angibt
- **Community Detection:** Graphentheoretischer Algorithmus der dicht verbundene Gruppen von Knoten findet
- **God Node:** Anti-Pattern: Ein Knoten mit uebermaessig vielen Verbindungen der aufgeteilt werden sollte
- **Louvain Algorithm:** Community Detection Algorithmus (Blondel et al., 2008). Leiden (Traag et al., 2019) ist der Nachfolger, hat aber keine JS-Implementierung.
- **MOC:** Map of Content -- Obsidian-Pattern fuer thematische Ueberblicksseiten
- **Hub-and-Spoke:** PKM-Pattern: wenige starke Hub-Notes mit vielen Spoke-Notes

### B. Exploration Board
`_devprocess/analysis/EXPLORE-11-graph-intelligence.md`

### C. Interview Notes
Basierend auf Interview mit Sebastian Hanke (Developer + User) am 2026-04-11.
Zentrale Einsicht: "Summaries don't replace thinking." -- Verlinkungen sind Ausdruck des eigenen Denkens und duerfen nicht eigenmaechtig vom Agent gesetzt werden.

### D. References
- Graphify: https://github.com/safishamsi/graphify (Confidence Scoring, Community Detection)
- Traag, V.A., Waltman, L. & van Eck, N.J. (2019). "From Louvain to Leiden: guaranteeing well-connected communities."
- Karpathy, A. (2026). "How I use LLMs" (LLM-managed personal wiki pattern)
- Sebastian Hanke (2026). LinkedIn-Post: "Summaries don't replace thinking" (PKM-Philosophie)
