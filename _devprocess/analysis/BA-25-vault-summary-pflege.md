---
status: Draft
scope: MVP
created-by: /business-analysis on 2026-05-02
parent-ba: BA-19-knowledge-maintenance.md
related-epics: EPIC-15, EPIC-19, EPIC-03
---

# Business Analysis: Karpathy-Wiki-Pattern fuer Obsilo (Ingest, Retrieval, Lint)

> **Scope:** MVP
> **Erstellt:** 2026-05-02
> **Status:** Draft
> **Inspiration:** [Karpathy LLM-Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f), [swarmvault](https://github.com/swarmclawai/swarmvault), [PENgram](https://dev.to/penfieldlabs/we-fixed-karpathys-llm-wiki-pengram-is-the-typed-knowledge-graph-pipeline-everyone-asked-for-j3j), [OwlerLite](https://arxiv.org/abs/2601.17824), [Atlan Freshness-Framework](https://atlan.com/know/llm-knowledge-base-freshness-scoring/), Vertiefung von [BA-19](BA-19-knowledge-maintenance.md)

---

## 1. Executive Summary

### 1.1 Problem Statement

Obsilo hat mit EPIC-15 (Knowledge Layer), EPIC-19 (Knowledge Maintenance) und EPIC-20 (Graph Intelligence) die technische Foundation fuer Karpathys LLM-Wiki-Pattern bereits gebaut: SQLite-Storage mit Vektoren, Edges, Implicit-Connections, typisierte Ontologie, Freshness-Klassifikation, 4-Stufen-Retrieval-Pipeline mit Reranker, Vault-Health-Check, Knowledge-Ingest-Skill. **Was fehlt sind drei aktive Schichten ueber dieser Foundation, die zusammen die Lebensader eines kompoundierenden Wissensartefakts sind: Ingest mit Bias-Awareness, Retrieval mit Note-Level-Awareness, Lint mit pro-aktiver Aktualitaetspflege.**

**Pain Points entlang der drei Dimensionen:**

- **Retrieval:** Note-Level-Summary fehlt als verbindendes Element. Manuelle Frontmatter-Pflege skaliert nicht (30-60s pro Note bei 1.500 Notes Backlog). Agent hat keinen verdichteten Vault-Ueberblick im stabilen Prompt-Prefix, jede Recherche braucht Tool-Roundtrip.

- **Ingest:** User stoesst auf Artikel, schafft es zeitlich nicht sauber zu ingesten. Echo-Chamber-Risiko: jeder Auto-Ingest-Mechanismus, der nur "passend zu existierendem Wissen" filtert, verstaerkt Bias und macht neue Perspektiven unsichtbar. Heute keine Bias-Awareness, keine Source-Diversity-Tracking, kein Tension-Marker zwischen widersprechenden Aussagen.

- **Lint:** VaultHealthService prueft strukturelle Probleme (Orphans, Broken Links, Weak Clusters), aber nicht inhaltliche Aktualitaet. Vault veraltet schrittweise, ohne dass User es bemerkt. Kein Themen-Halbwertszeit-Modell, keine externe Source-Verifikation, keine Erkennung "neue Entwicklungen seit deine letzte Note".

### 1.2 Proposed Solution

**Sieben zusammenhaengende Massnahmen entlang der drei Dimensionen.**

**Retrieval-Dimension:**

1. **Zentrale Note-Summaries:** SemanticIndexService liest beim Indexing pro Note das Frontmatter. Existierende "Zusammenfassung" wird in eine neue Tabelle `note_summaries` uebernommen. Fehlt sie, wird sie via konfigurierbarem Standard-Prompt (Sebastians vorgegebener Wortlaut) generiert und in der DB gespeichert.

2. **SQL-beschleunigte Taxonomie-Pflege:** "Themen", "Konzepte" und "tags" werden beim Indexing aus dem Frontmatter in eine Tabelle `frontmatter_properties` gespiegelt. Bei Generierung neuer Notes liest der Agent die existierende Taxonomie aus SQL (1ms) statt LLM-Volltext-Suche.

3. **Setting-gated Vault-Frontmatter-Write:** Standardmaessig schreibt das System nur in die DB. Wer Karpathys Pattern voll will, aktiviert einen Toggle. Backfill-Lauf ergaenzt fehlende Properties, ueberschreibt nichts.

4. **Selektiver Top-Hub-Block im KV-Cache:** Ein Token-budgetierter (~3k) Block aus den Top-30 Hub-Notes wird optional in den stabilen System-Prompt-Prefix gehaengt. Default off, bis Telemetrie es rechtfertigt.

**Ingest-Dimension:**

5. **Pre-Triage-Pass mit Bias-Awareness:** Wenn User Artikel droppt (URL, PDF, Markdown), erzeugt das System einen 10-Sekunden-Triage-Pass: Relevanz-Score, Neuheits-Check gegen Vault (deckt sich / ergaenzt / widerspricht), Source-Diversity-Marker (welche Domain, ist diese Domain in dem Cluster schon ueberpraesent). User entscheidet ingesten / spaeter / verwerfen. Bei Ja folgt Deep-Ingest mit Tension-Detection und expliziter Markierung widersprechender Claims.

**Lint-Dimension (integriert in VaultHealthService):**

6. **3-Stufen-Lint-Stack:**
   - **Stufe 1 (passiv, kostenlos, Default an):** Pro Cluster eine konfigurierbare Halbwertszeit. Lokal berechneter Composite-Freshness-Score aus Content-Age, Cluster-Halbwertszeit, Coverage-Drift. UI-Badge im bestehenden Vault-Health-Modal.
   - **Stufe 2 (activity-triggered, low-cost):** Wenn User Note in Cluster X oeffnet/bearbeitet UND Cluster reif: dezenter Hint "letzter externer Check vor X Tagen". Klick triggert Light-Web-Search (3-5 Suchen) plus LLM-Synthese, Befunde als Update-Vorschlag. Selbst-limitierend.
   - **Stufe 3 (periodisch, opt-in, hart budgetiert):** Wochentlicher Job auf User-definierten Hot-Clusters mit Token-Budget-Cap. Semantic-Pre-Filter vor teurem LLM-Call. Notification nur bei strong signal.

7. **Bias-Awareness als eigene Lint-Kategorie:**
   - Source-Diversity-Tracking pro Cluster.
   - Concentration-Warning wenn Cluster zu > 70% aus einer Domain stammt: UI-Hint mit Vorschlag "Suche aktiv Gegenpositionen".
   - Beim Ingest: Tension-Detection markiert widersprechende Aussagen explizit.

### 1.3 Expected Outcomes

**Retrieval:**
- Note-Summary-Pflege kostet User null aktive Zeit, Indexing erledigt es im Hintergrund.
- Existierende manuell gepflegte Summaries bleiben unangetastet.
- Taxonomie-Konsistenz steigt durch SQL-Lookup statt LLM-Erfindung.
- Agent gewinnt optional Vault-Awareness im KV-Cache.

**Ingest:**
- Schnell-Triage-Pass macht "ja/nein/spaeter" in 10 Sekunden moeglich, ohne Artikel komplett lesen zu muessen.
- Bias-Awareness verhindert Echo-Chamber-Effekt: System markiert wenn ein Cluster einseitig wird.
- Tension-Marker machen Widersprueche zwischen Quellen sichtbar statt sie wegzukomprimieren.

**Lint:**
- Vault veraltet nicht mehr stillschweigend: passive Freshness-Score zeigt sofort welche Cluster reif sind.
- Activity-Trigger informiert beim Themen-Beruehren, ohne dass User aktiv suchen muss.
- Optional periodischer Job mit hartem Budget gibt "ich werde aktiv informiert" ohne Token-Explosion.
- Alle Findings konsistent im bestehenden Vault-Health-Modal (UI-Konsistenz).

---

## 2. Business Context

### 2.1 Background

BA-19 hat das Karpathy-Wiki-Pattern als Leitstern fuer EPIC-19 etabliert und die drei Operationen (Ingest, Lint, Synthese) in Obsilo verankert. Was BA-19 nicht ausgearbeitet hat: **die drei aktiven Schichten ueber der vorhandenen Foundation**. Karpathys index.md hat pro Page einen 1-Zeiler. Obsilo hat heute Per-Chunk-Text in `vectors.text`, aber keine Note-Level-Beschreibung. Diese Luecke macht drei Dinge teurer als noetig:

- Retrieval-Output: search_vault liefert Chunk-Snippets, kein Note-Level-Kontext.
- Taxonomie-Pflege: jeder neue Themen-Vorschlag braucht LLM-Suche statt SQL-Lookup.
- Vault-Awareness des Agents: ohne Note-Level-Index keine kompakte Karte fuer Cold-Start oder KV-Cache.

**Erkenntnisse aus Karpathy-Adoptionen (Mai 2026):**

- **swarmvault** macht das Karpathy-Pattern voll: Nodes tragen Freshness, Confidence, Community-Membership; `lint --deep --web` reichert Findings mit externer Evidenz an; Activity-triggered Updates via Watch-Mode, Git-Hooks, periodische Schedules. Token-Budget-Cap per Compile-Pass.
- **PENgram** kritisiert Karpathys untypisierte Wikilinks und loest das mit 24 typisierten Relationen plus Confidence-Labels (EXTRACTED, INFERRED, AMBIGUOUS) auf jeder Edge. Obsilo hat hier bereits einen Vorsprung durch das edges-Schema.
- **OwlerLite** loest die Token-Explosion bei Web-Recherche durch user-definierte Scopes plus Semantic Change Detection: re-indexiert nur bei meaningful updates statt blind zu pollen.
- **Atlan** definiert vier Freshness-Dimensionen (Content Age, Embedding Lag, Stale Retrieval Rate, Coverage Drift) plus Composite-Score 0-100 mit Alert-Schwellwerten.
- **Echo-Chamber-Forschung** liefert Diversity-Metriken (separation, variety, disparity, Harrison/Klein), die noch keine Karpathy-Adoption explizit nutzt. **Hier ist Obsilo-Innovationsspielraum.**

Sebastian pflegt heute manuell ein Frontmatter-Schema mit "Zusammenfassung" (1 Satz, 25 Worte, deutsch), "tags", "Themen", "Konzepte". Der Skill-Aufruf dafuer existiert als manueller Workflow. Skalierung ueber den Single-User-Use-Case scheitert aber an der Kadenz: 1.500 existierende Notes plus 5-10 neue pro Tag erzeugen Backlog statt Pflege. Beim Ingest neuer Artikel scheitert es an der Lese-Zeit: zu viele Quellen, zu wenig Stunden, aber automatischer Ingest ohne Bias-Schutz produziert Echo-Chamber.

### 2.2 Current State

**Note-Summary-Pflege heute:**

1. User markiert Note, ruft Skill mit Standard-Prompt auf.
2. LLM liest Note, generiert 1-Satz-Summary, 5-10 Keywords, 2-3 Themen, 2-3 Konzepte.
3. LLM ruft search_files auf, um existierende Themen/Konzepte zu finden (mehrere Tool-Calls).
4. LLM nutzt replaceInFile, um YAML-Frontmatter struktur-erhaltend zu erweitern.
5. Aufwand: 30-60 Sekunden pro Note, 5.000-10.000 Tokens pro Pflege-Pass.

**Technischer Status:**
- `vectors.text` enthaelt Volltext-Chunks plus optional LLM-Prefix (Pass-2 enrichment).
- `tags`-Tabelle enthaelt Tag-zu-Path-Mapping.
- `ontology`-Tabelle enthaelt Cluster-Membership mit Quelle (moc, implicit, ingest, louvain).
- Kein zentrales Note-Level-Summary-Feld. Kein zentraler Frontmatter-Property-Mirror jenseits der `tags`-Tabelle.

**Pain Points (nach Schwere, drei Dimensionen):**

| # | Dimension | Problem | Impact |
|---|-----------|---------|--------|
| 1 | Retrieval | Manuelle Summary-Pflege nicht skalierbar bei 1.500+ Notes | Backlog wird nie aufgeholt |
| 2 | Retrieval | Themen/Konzepte-Suche jedes Mal als LLM-Volltext-Search | Token-Verschwendung, langsam |
| 3 | Retrieval | Inkonsistente Schreibweise neu erfundener Themen/Konzepte | Cluster-Bildung leidet |
| 4 | Retrieval | Retrieval-Output ohne Note-Level-Kontext | Agent muss aus Chunks rekonstruieren |
| 5 | Retrieval | Agent hat keinen Vault-Ueberblick im Prompt | Tool-Roundtrip fuer jede Recherche |
| 6 | Retrieval | Frontmatter-Pflege ist Power-User-Workflow | Knowledge-Layer-Mehrwert verfaellt ohne Pflege |
| 7 | Ingest | Artikel-Lese-Zeit zu knapp, Quellen stapeln sich ungelesen | Wertvolle Sources gehen verloren |
| 8 | Ingest | Naive Auto-Ingest-Logik wuerde Echo-Chamber verstaerken | Verlust neuer Perspektiven |
| 9 | Ingest | Keine Tension-Detection zwischen widersprechenden Quellen | Vault wird inhaltlich konformistisch |
| 10 | Ingest | Source-Diversity nicht trackbar (welche Domain dominiert Cluster X) | Bias bleibt unsichtbar |
| 11 | Lint | Vault veraltet schrittweise, ohne dass User es bemerkt | Wissensstand driftet vom Realitaetsstand ab |
| 12 | Lint | Kein Themen-spezifisches Halbwertszeit-Modell | Cluster Tech und Cluster Geschichte werden gleich behandelt |
| 13 | Lint | Externe Source-Verifikation komplett manuell | "Was hat sich geaendert seit meiner letzten Note" bleibt blind |
| 14 | Lint | Strukturelle Vault-Health-Checks und inhaltliche Aktualitaet sind getrennte UIs | UX-Inkonsistenz, doppelter mentaler Aufwand |

### 2.3 Desired State

**Indexing-Lauf (zukuenftig, Retrieval-Dimension):**
1. SemanticIndexService scannt Note, baut Chunks und Vektoren wie heute.
2. Liest Frontmatter. Wenn "Zusammenfassung" existiert: in `note_summaries` uebernehmen.
3. Wenn nicht existiert und Setting "Auto-Summary generieren" aktiv: LLM-Call mit Standard-Prompt.
4. Themen/Konzepte werden gegen `frontmatter_properties` gemappt: existierende uebernehmen, neue als Vorschlag eintragen.
5. Wenn Setting "Frontmatter-Write aktivieren" aktiv: fehlende Properties in YAML ergaenzen via struktur-erhaltendem Pattern. Bestehende Properties unangetastet.
6. Note-Summary plus Keywords plus Themen-Liste in note_summaries und frontmatter_properties gespeichert.

**Retrieval-Output (zukuenftig):**
- search_vault liefert pro Hit zusaetzlich die Note-Summary aus note_summaries als Kontext-Zeile.
- Optional Top-Hub-Block im KV-Cache, settings-gated.

**Ingest-Workflow (zukuenftig, Ingest-Dimension):**
1. User droppt Artikel (URL, PDF, Markdown) in eine Inbox oder triggert "Ingesten" auf einer existierenden Note.
2. **Pre-Triage-Pass** (10 Sekunden, ein LLM-Call mit Cluster-Context aus SQL):
   - Relevanz-Score (0-1) gegen User-Interessen.
   - Neuheit gegen Vault: deckt sich mit / ergaenzt / widerspricht.
   - Source-Diversity-Score: ist diese Domain im Ziel-Cluster bereits ueberpraesent?
   - Output als kompakte Triage-Karte: Title, Score, Cluster-Match, Tension-Hint.
3. User entscheidet: Deep-Ingest / Spaeter / Verwerfen.
4. Bei Deep-Ingest:
   - Key-Claims-Extraction.
   - Tension-Marker fuer widersprechende Aussagen explizit im neuen Note (zB als Frontmatter-Property oder Inline-Callout).
   - Frontmatter-Pflege via Standard-Pipeline.
   - Source-Diversity-Counter pro Cluster aktualisiert.
5. Bei Concentration-Warning: System schlaegt aktiv "Suche Gegenpositionen zu diesem Thema" vor.

**Lint-Workflow (zukuenftig, Lint-Dimension, integriert in VaultHealthService):**

VaultHealthService bekommt drei neue Check-Kategorien zusaetzlich zu den 7 strukturellen:

- **cluster_freshness** (Stufe 1): pro Cluster Composite-Freshness-Score lokal berechnet, Notes ueber Halbwertszeit markiert.
- **source_concentration** (Bias): Cluster mit > 70% Single-Source-Anteil.
- **knowledge_decay_external** (Stufe 2/3): bei aktiven Triggern Befunde aus Web-Search.

Trigger-Strategie ueber drei Stufen:

- **Stufe 1** laeuft bei jedem Vault-Open (heute schon). Lokal, kostenlos.
- **Stufe 2** triggert bei Note-Open/Edit in reifem Cluster: dezenter Hint im UI, optionaler Klick startet Web-Search.
- **Stufe 3** opt-in periodisch mit hartem Token-Budget. Notification bei strong signal.

Alle Findings landen im bestehenden Vault-Health-Modal mit kontext-spezifischen Action-Buttons.

**MOC-File-Pflege (Subsystem):**
- MOC-Files existieren bereits pro Cluster (Thema, Konzept).
- Heute enthalten sie eine Base mit verlinkten Notizen.
- Neue Erweiterung: Header-Section mit auto-generierten Hub-Status, Implicit-Connection-Vorschlaegen, Cluster-Statistik plus Freshness-Status. Strikt zwischen User-edited Body und auto-generierten Block durch Marker getrennt.

### 2.4 Gap Analysis

| Dimension | Luecke | As-Is | To-Be | Mechanismus |
|-----------|--------|-------|-------|------------|
| Retrieval | Zentrale Summary | nicht vorhanden | `note_summaries`-Tabelle | DB-Schema-Erweiterung |
| Retrieval | Auto-Summary-Generierung | manueller Skill-Aufruf | beim Indexing (settings-gated) | SemanticIndexService Hook |
| Retrieval | Taxonomie-Mirror | nur tags, nicht Themen/Konzepte | `frontmatter_properties`-Tabelle | Schema-Erweiterung plus Indexing-Hook |
| Retrieval | Frontmatter-Write | nie | settings-gated, opt-in | Indexing schreibt struktur-erhaltend |
| Retrieval | Backfill | manuell pro Note | einmaliger Background-Job | Job-Runner mit Progress-UI |
| Retrieval | Vault-Awareness | search_vault nur on-demand | optional Top-Hub-Block im Prefix | ContextComposer-Erweiterung |
| Retrieval | MOC-Pflege | passiv, nur Base | aktiv, auto-generierter Header-Block | MOC-Marker-Konvention plus Pflege-Job |
| Ingest | Pre-Triage | nicht vorhanden | 10-Sekunden-Triage-Pass mit Cluster-Context | Neues `ingest_triage`-Tool oder Erweiterung von `ingest_document` |
| Ingest | Bias-Tracking | nicht vorhanden | Source-Diversity-Counter pro Cluster | Neue `cluster_source_stats`-Tabelle |
| Ingest | Tension-Detection | nicht vorhanden | Widersprechende Claims explizit markiert | Erweiterung Deep-Ingest-Pipeline mit Vault-Vergleich |
| Ingest | Anti-Echo-Chamber-Vorschlag | nicht vorhanden | System schlaegt Gegenpositions-Suche vor | UI-Hint plus optional Web-Search |
| Lint | Themen-Halbwertszeit | unbekannt, nicht modelliert | Pro Cluster konfigurierbare Halbwertszeit | Neue `cluster_metadata`-Tabelle |
| Lint | Composite-Freshness-Score | nicht berechnet | Stufe-1-Check in VaultHealthService | Erweiterung VaultHealthService um neue Check-Types |
| Lint | Activity-Trigger | nicht vorhanden | On-Note-Open/Edit-Hint bei reifem Cluster | Vault-Event-Listener plus Health-Modal-Integration |
| Lint | Externe Source-Verifikation | manuell | On-Demand-Web-Search (Stufe 2), opt-in periodisch (Stufe 3) | Web-Search-Tool plus Job-Runner mit Token-Budget-Cap |
| Lint | UX-Konsistenz | strukturelle und inhaltliche Checks getrennt | alle Findings im selben Health-Modal | Health-Modal-Erweiterung mit kontextuellen Action-Buttons |

---

## 3. Personas und Needs

### 3.1 Personas

**P1: Power-User mit grossem Vault (Sebastian)**
- Rolle: Knowledge-Worker, Forscher, Builder
- Goal: Wissen ueber Jahre kompoundieren, ohne Pflege-Last und ohne Echo-Chamber-Effekt
- Pain: 1.500+ Notes, Pflege ist Engpass, Themen-Schreibweise driftet, Quellen-Backlog ungelesen, Vault veraltet unbemerkt
- Quote: "Aktuell ist das ein nerviger extra Schritt"; "ich brauche Unterstuetzung im Filtern von relevanten Infos, ohne dabei in eine Echokammer zu geraten"; "ich moechte mitbekommen wenn mein Wissen ein Update braucht"
- Top-Needs:
  - N1: Pflege-Tasks vom System uebernehmen lassen (asynchron, im Hintergrund)
  - N2: Vorhandene Pflege bewahren (kein Ueberschreiben)
  - N3: Konsistente Taxonomie ueber Jahre
  - N4: Schnell-Triage von Artikeln ohne Vollstaendiges-Lesen
  - N5: Echo-Chamber-Schutz: aktiv auf einseitige Cluster hingewiesen werden
  - N6: Aktualitaets-Awareness: aktiv informiert werden wenn Wissen zu altert
  - N7: Token-Budget-Kontrolle bei aktiven Lint-Mechanismen

**P2: Casual User mit mittelgrossem Vault**
- Rolle: Notiznehmer, gelegentlicher Researcher
- Goal: Vault wird beim Wachsen automatisch besser, ohne aktiv zu pflegen
- Pain: kennt MOC-Pattern nicht, wuerde nicht manuell pflegen, ingestiert sporadisch ohne System
- Top-Needs:
  - N8: Default-Workflows, die ohne Setup-Wissen funktionieren
  - N9: Retrieval, das ab Tag 1 brauchbar ist
  - N10: Bias-Awareness als Default-on Sicherheitsnetz

**P3: Neuer User mit kleinem Vault**
- Rolle: Erstausstieg in Obsilo
- Goal: Erleben, dass Obsilo den Vault als Wissenssystem versteht
- Pain: leerer Vault, kein Mehrwert sichtbar
- Top-Needs:
  - N11: Erste Notes werden sofort eingeordnet, nicht ignoriert
  - N12: Erste Ingest-Aktion zeigt Mehrwert (Triage demonstriert Verstaendnis)

### 3.2 Cross-Persona Needs

- N13: Transparenz darueber, was das System gerade automatisch pflegt
- N14: Reversibilitaet: jede Auto-Aenderung muss zurueckdrehbar sein
- N15: Performance: Indexing darf den User nicht ausbremsen
- N16: Token-Budget-Transparenz: User sieht laufende und prognostizierte Kosten
- N17: Konsistente UI: alle Wissens-Operationen (Pflege, Lint, Bias) im selben Modal

---

## 4. Problem Analysis

### 4.1 Problem-Dimensionen

**Dimension A: Pflege-Skalierung (Retrieval).** Manuelle Pflege ist O(n) in der Note-Anzahl. Pro Note 30-60 Sekunden plus 5-10k Token. Bei 1.500 Notes summiert: 12-25 Stunden plus 7.500-15.000k Token Backlog. Auto-Pflege ist O(n) in der maschinellen Zeit, aber 0 in der User-Zeit.

**Dimension B: Konsistenz der Taxonomie (Retrieval).** Themen wie "AI-Agent" vs "KI-Agent" oder "Knowledge-Management" vs "Wissensmanagement" entstehen, wenn der Agent ohne Lookup neue Begriffe einfuehrt. SQL-Lookup gegen frontmatter_properties zwingt zur Disambiguierung beim Insert.

**Dimension C: Awareness-Asymmetrie (Retrieval).** Der User sieht den Vault. Der Agent sieht ihn nur ueber search_vault. Karpathys Loesung: Index in den Prompt, Awareness ohne Tool-Call. Trade-off: Tokens.

**Dimension D: Frontmatter-Hoheit (Retrieval).** Wer darf das Frontmatter aendern? User-Workflow heute: nur User, plus Skills die der User explizit triggert. Karpathy-Pattern: LLM darf alles. Mittelweg: Setting-gated, opt-in, struktur-erhaltend, kein Ueberschreiben.

**Dimension E: Triage-Last beim Ingest (Ingest).** User stoesst auf Artikel im Tagesablauf. Vollstaendiges Lesen plus Pflege kostet 15-30 Minuten pro Source. Ohne Schnell-Triage staut sich der Backlog. Mit naivem Auto-Ingest geht Bias-Risiko durch.

**Dimension F: Echo-Chamber-Effekt (Ingest).** Auto-Ingest mit reinem Cluster-Match-Filter verstaerkt bestehendes Wissen. Neue Perspektiven werden weggefiltert. Ohne aktive Source-Diversity-Tracking bleibt Bias unsichtbar.

**Dimension G: Stille Wissens-Veraltung (Lint).** Vault-Inhalte altern fachgebiet-spezifisch unterschiedlich. Tech-Notes nach 6 Monaten potentiell ueberholt, geschichtliche Quellen nach Dekaden noch valide. Ohne Themen-Halbwertszeit-Modell und ohne externe Reality-Checks veraltet der Vault stillschweigend.

**Dimension H: Token-Budget bei aktiver Pflege (Lint).** Periodische externe Recherche zu allen Themen taeglich = unbezahlbar (~1.750 USD/Monat naiv). Lazy/Activity-Triggered + Hot-List + Semantic-Pre-Filter loesen das (< 10 USD/Monat moeglich), aber Architektur-Komplexitaet steigt.

### 4.2 Root Causes

- RC1: Karpathy-Pattern wurde in EPIC-19 konzeptionell uebernommen, aber Note-Level-Summary als verbindendes Element fehlt im Datenmodell.
- RC2: Taxonomie-Suche wurde als LLM-Aufgabe entwickelt, weil zur Entwicklungszeit kein Property-Mirror in der DB existierte.
- RC3: Frontmatter-Write war out-of-scope wegen Vault-Hoheits-Risiko, wurde aber nie als opt-in nachgereicht.
- RC4: KV-Cache-Optimierung (EPIC-18) hat den Prefix stabilisiert, aber Vault-Awareness nicht hinzugefuegt.
- RC5: Ingest-Tools (`ingest_document`, `knowledge-ingest` Skill) wurden fuer Vollstaendige-Aufnahme designt, nicht fuer Schnell-Triage.
- RC6: Bias-Awareness ist konzeptionell nirgends adressiert, in keiner Karpathy-Adoption etabliert. Echte Innovationsluecke.
- RC7: VaultHealthService prueft Struktur-Heuristiken, weil das aus knowledge.db ohne externe Calls moeglich ist. Inhaltliche Aktualitaet wurde als out-of-scope behandelt.
- RC8: Token-Kosten fuer aktiven Lint sind nicht modelliert, weshalb das Thema bisher abgewendet wurde.

### 4.3 Jobs to be Done

**P1 Power-User (Retrieval):**
- "Wenn ich eine Note erstelle, will ich, dass Obsilo sie automatisch einordnet, damit ich den Pflege-Schritt einsparen kann."
- "Wenn ich eine bestehende Note bearbeite, will ich, dass meine bisherige Pflege nicht zerstoert wird, damit ich dem System trauen kann."
- "Wenn ich nach einem Thema frage, will ich, dass der Agent die richtigen existierenden Themen-Notes findet, damit transitives Retrieval funktioniert."

**P1 Power-User (Ingest):**
- "Wenn ich einen Artikel sehe, will ich in 10 Sekunden wissen ob er ingest-wert ist, damit ich nicht den Backlog vergroessere."
- "Wenn ich einen Cluster aufbaue, will ich aktiv darauf hingewiesen werden wenn er einseitig wird, damit meine Sicht nicht enger wird."
- "Wenn eine neue Quelle meinem bestehenden Wissen widerspricht, will ich das explizit markiert sehen, statt es wegkomprimieren zu lassen."

**P1 Power-User (Lint):**
- "Wenn ich ein Thema beruehre an dem ich lange nicht gearbeitet habe, will ich wissen ob mein Wissen noch aktuell ist, damit ich nicht auf veraltetem Stand argumentiere."
- "Wenn ich aktiv informiert werden will ueber neue Entwicklungen, will ich das mit einem harten Token-Budget tun, damit es nicht zur Kostenfalle wird."

**P2 Casual User:**
- "Wenn ich einen Wissens-Vault aufbaue, will ich, dass er ohne mein Zutun strukturiert wird, damit ich den Mehrwert ohne Lernkurve bekomme."
- "Wenn das System einen Bias bei mir entdeckt, will ich das einfach erklaert bekommen, damit ich verstehe was los ist."

---

## 5. Goals und KPIs

### 5.1 Business Goals

- BG1: Pflege-Last fuer Power-User auf null reduzieren, ohne User-Trust zu beschaedigen.
- BG2: Taxonomie-Konsistenz im Vault messbar erhoehen (weniger Synonym-Cluster).
- BG3: Retrieval-Qualitaet messbar verbessern, ohne Token-Budget zu sprengen.
- BG4: Casual und neue User profitieren ohne Setup.
- BG5: Ingest-Backlog reduzieren durch Schnell-Triage, ohne wertvolle Sources zu verlieren.
- BG6: Echo-Chamber-Effekt aktiv verhindern, Source-Diversity messbar erhoehen.
- BG7: Vault-Aktualitaet kontinuierlich pflegen mit garantiertem Token-Budget.
- BG8: UI-Konsistenz durch Vault-Health-Modal als zentrale Anlaufstelle fuer alle Wissens-Operationen.

### 5.2 KPIs (qualitativ wo Baseline fehlt)

**Retrieval-KPIs:**

| KPI | Baseline | Ziel | Messung |
|-----|----------|------|---------|
| Pflege-Zeit pro Note (P1) | 30-60s manuell | 0s im Default-Pfad | Telemetrie: User-Trigger vs Indexing-Trigger |
| Token-Kosten pro Indexing-Lauf (1.500 Notes) | heute 0 (kein Auto-Index) | < 1.50 USD bei Haiku, < 5 USD bei Sonnet | LLM-Call-Tracking |
| Anteil Notes mit zentraler Summary | unbekannt | > 95% nach 1 Backfill-Lauf | DB-Query: count(notes ohne Summary) |
| Themen-Synonym-Cluster | unbekannt | reduziert um > 50% | Manueller Audit vor/nach SQL-Mapping |
| Adoption Frontmatter-Toggle (P1) | n.a. | > 30% Aktivierung in 4 Wochen | Settings-Telemetrie |
| Retrieval-Recall mit Note-Summary | aktuelle Top-K-Recall-Rate | + 5 bis 10% messbar | A/B-Eval mit fixem Test-Set |
| KV-Cache-Top-Hub-Block Netto-Saldo | n.a. | netto positiv | tokens_added vs search_vault_calls_avoided |

**Ingest-KPIs:**

| KPI | Baseline | Ziel | Messung |
|-----|----------|------|---------|
| Triage-Pass-Dauer | n.a. (Feature neu) | < 15s end-to-end | Telemetrie pro Triage-Call |
| Triage-Token-Kosten | n.a. | < 0.05 USD pro Triage | LLM-Call-Tracking |
| Ingest-Rate (ingestiert / triaged) | unbekannt | 30-60% (Selektion findet wirklich statt) | Telemetrie ingest-Decisions |
| Source-Diversity-Score pro Cluster | unbekannt | > 3 distinct Domains pro 10 Notes | DB-Query auf cluster_source_stats |
| Tension-Marker-Rate | n.a. | > 5% der ingestierten Notes haben min 1 Tension-Marker | Telemetrie ingest-Output |
| Concentration-Warnings ausgeloest | n.a. | erste warnung innerhalb 4 Wochen Real-Use | Telemetrie warnings.fired |

**Lint-KPIs:**

| KPI | Baseline | Ziel | Messung |
|-----|----------|------|---------|
| Stufe-1-Findings im Health-Modal | n.a. | sichtbar bei jedem Vault-Open | UI-Test |
| Activity-Trigger-Rate (Stufe 2) | n.a. | 1-5 Hints pro Woche bei P1 | Telemetrie hints.shown |
| Stufe-2-Acceptance-Rate | n.a. | > 30% (User klickt durch) | Telemetrie hints.clicked |
| Stufe-3-Token-Verbrauch | n.a. | innerhalb User-Budget (Default 2 USD/Woche) | Telemetrie tokens.weekly |
| Update-Findings-Quality (Precision) | n.a. | > 70% relevant (User-Feedback) | Manuelle Sample-Eval nach 4 Wochen |
| Vault-Health-Modal-Time-to-Action | unbekannt | < 30s vom Open bis Action | Telemetrie modal.open->action |

### 5.3 User Goals

- UG1: User soll spueren, dass Pflege passiert, ohne sie aktiv triggern zu muessen.
- UG2: User soll dem System vertrauen, dass es seine bisherige Pflege bewahrt.
- UG3: User soll Pflege-Aktivitaet jederzeit nachvollziehen und zurueckdrehen koennen.

---

## 6. Nordstern, Wow, Anti-Definition

### 6.1 Nordstern

Der Vault wird zum kompoundierenden Wissens-Artefakt, ohne dass der User dafuer Pflege-Zeit aufwendet UND ohne dass das System ihn in einer Echo-Chamber gefangen haelt. Karpathys Versprechen ("LLMs don't tire of bookkeeping") wird auf Obsilo-Niveau eingeloest, mit Bias-Awareness und Aktualitaets-Pflege als Innovations-Layer obendrauf.

### 6.2 Wow

"Ich sehe einen Artikel, klicke 'Triage', sehe in 10 Sekunden ob er meinem Wissen widerspricht oder es bestaetigt, entscheide ja/nein. Wenn ja: ingestiert, eingeordnet, mit Tension-Markern bei Widersprueche, Frontmatter automatisch gepflegt. Wenn ich danach lange nicht im Themen-Cluster aktiv war, erinnert mich das System beim naechsten Beruehren mit einem dezenten Hint, dass mein Wissen evtl Updates braucht. Mein Token-Budget bleibt im Rahmen, weil das System nur dann teure Web-Recherche macht, wenn ich es will."

### 6.3 Anti-Definition

**Was wir nicht bauen:**
- Kein automatischer Vault-Modus, der ohne User-Zustimmung Frontmatter aendert.
- Kein Ueberschreiben oder Loeschen bestehender Frontmatter-Properties.
- Kein KV-Cache-Block, der das Token-Budget unkontrolliert wachsen laesst.
- Keine Re-Generierung bestehender Summaries (alte Standards bleiben respektiert).
- Keine MOC-File-Pflege, die User-edited Content ueberschreibt.
- Kein Auto-Ingest ohne User-Approval (selbst nicht bei hoher Confidence).
- Kein blindes periodisches Web-Polling ueber alle Themen (Token-Falle).
- Keine impliziten Bias-Filter beim Ingest, die Sources verwerfen ohne User-Sicht.
- Keine getrennten UIs fuer strukturelles und inhaltliches Lint (UX-Konsistenz).

---

## 7. Scope

### 7.1 In-Scope (existierend, wird genutzt)

- knowledge.db Schema v9 mit vectors, edges, tags, implicit_edges, ontology, note_freshness
- SemanticIndexService two-pass enrichment
- 4-Stufen Retrieval-Pipeline mit Reranker
- OntologyStore mit Cluster-Membership
- ContextComposer fuer System-Prompt-Komposition
- replaceInFile-Pattern fuer struktur-erhaltende YAML-Edits

### 7.2 In-Scope (neu zu bauen, Kandidaten fuer FEATURE-Specs)

**Retrieval-Dimension:**

| Kandidat | Epic-Mapping | Prioritaet |
|----------|--------------|------------|
| `note_summaries`-Tabelle plus Indexing-Hook | EPIC-15 | P0 |
| `frontmatter_properties`-Tabelle plus SQL-Taxonomie-Lookup | EPIC-15 | P0 |
| Standard-Prompt als Settings-konfigurierbarer Wert | EPIC-19 | P0 |
| Auto-Summary-Generierung beim Indexing (Setting-gated) | EPIC-19 | P0 |
| Frontmatter-Write Toggle plus Backfill-Job mit Progress-UI | EPIC-19 | P1 |
| Aktive MOC-File-Pflege mit Marker-Konvention | EPIC-19 | P2 |
| Selektiver Top-Hub-Block im KV-Cache (Setting-gated) | EPIC-03 | P2 |

**Ingest-Dimension:**

| Kandidat | Epic-Mapping | Prioritaet |
|----------|--------------|------------|
| Pre-Triage-Tool plus 10-Sekunden-Triage-Karte | EPIC-19 | P0 |
| `cluster_source_stats`-Tabelle fuer Source-Diversity-Tracking | EPIC-15 | P0 |
| Tension-Detection beim Deep-Ingest (Vault-Vergleich) | EPIC-19 | P1 |
| Concentration-Warning UI plus Anti-Echo-Vorschlag | EPIC-19 | P1 |
| Inbox-Workflow fuer batch-Triage (mehrere Artikel) | EPIC-19 | P2 |

**Lint-Dimension (integriert in VaultHealthService):**

| Kandidat | Epic-Mapping | Prioritaet |
|----------|--------------|------------|
| `cluster_metadata`-Tabelle plus Halbwertszeit-Konfiguration | EPIC-19 | P0 |
| Stufe-1 Composite-Freshness-Score als neuer VaultHealth-Check | EPIC-19 | P0 |
| Source-Diversity-Check als Bias-Lint-Kategorie | EPIC-19 | P0 |
| Health-Modal-Erweiterung mit kontext-spezifischen Action-Buttons | EPIC-19 | P0 |
| Stufe-2 Activity-Trigger plus Web-Search-Update-Pass | EPIC-19 | P1 |
| Stufe-3 Periodischer Job plus Token-Budget-Cap plus Notification | EPIC-19 | P2 |
| Hot-Cluster-Konfiguration in Settings (User-definierte Scopes) | EPIC-19 | P1 |

### 7.3 Out-of-Scope

- Vollautomatisches Anlegen neuer Notes durch das System.
- Re-Generierung bestehender User-Pflege.
- Automatisches Ueberschreiben von User-Edits in MOC-Files.
- Token-budget-loser Vollstaendiger-Index im Prompt-Prefix (Karpathy-Variante A, verworfen wegen Skalierung).
- Vollstaendig automatischer Ingest ohne User-Approval.
- Periodisches Web-Polling auf alle Themen ohne Hot-List-Filter (Token-Falle).
- Eigenstaendige Bias-UI ausserhalb des Vault-Health-Modals.
- Automatische Anpassung von Note-Inhalten basierend auf externen Befunden (System schlaegt vor, User integriert).

### 7.4 Critical Hypotheses

**Retrieval-Hypothesen:**

- **H-01:** Note-Summary in note_summaries verbessert search_vault-Recall um messbare 5 bis 10% bei gleichbleibendem Token-Budget. *(Test: A/B-Eval mit fixem Query-Set vor und nach Aktivierung.)*
- **H-02:** SQL-Lookup fuer Themen/Konzepte reduziert LLM-Tokens pro neue Note um > 50% gegenueber LLM-Volltext-Suche. *(Test: Token-Tracking pro Note-Pflege-Lauf vor und nach Umstellung.)*
- **H-03:** Setting-gated Frontmatter-Write wird von > 30% der Power-User innerhalb 4 Wochen nach Release aktiviert. *(Test: Settings-Telemetrie nach Release.)*
- **H-04:** Selektiver Top-Hub-Block reduziert search_vault-Aufrufe pro Conversation um > 20% und kostet weniger Tokens als die eingesparten Tool-Roundtrips. *(Test: Telemetrie-A/B mit Block on vs off.)*
- **H-05:** Aktive MOC-File-Pflege mit auto-generiertem Header-Block stoert User-edited Content nicht und wird von Power-Usern als Mehrwert wahrgenommen. *(Test: Diff-Audit nach 4 Wochen, plus User-Befragung.)*
- **H-06:** Bestehende manuell gepflegte Frontmatter-Summaries bleiben in 100% der Faelle erhalten und werden 1:1 in note_summaries uebernommen. *(Test: Vor- und Nach-Diff aller Frontmatter-Felder im Backfill-Lauf.)*

**Ingest-Hypothesen:**

- **H-07:** 10-Sekunden-Triage-Pass kostet < 0.05 USD pro Triage und liefert genug Signal fuer ja/nein/spaeter-Entscheidung. *(Test: Token-Tracking plus User-Acceptance-Rate ueber 4 Wochen.)*
- **H-08:** Source-Diversity-Tracking pro Cluster identifiziert Concentration-Cases (> 70% Single-Source) korrekt mit > 80% Precision. *(Test: Manueller Audit der ersten 10 Warnings.)*
- **H-09:** Tension-Detection markiert widersprechende Aussagen mit > 60% Precision (Sample-Eval), und User findet das wertvoll (NPS > 7 in Befragung). *(Test: Sample-Eval plus User-Feedback nach 4 Wochen.)*
- **H-10:** Anti-Echo-Vorschlag fuehrt in > 20% der Faelle dazu, dass User aktiv eine Gegenposition sucht. *(Test: Telemetrie click-through-Rate.)*

**Lint-Hypothesen:**

- **H-11:** Stufe-1-Composite-Score identifiziert subjektiv "stale" Notes mit > 70% Precision (User-Feedback bei Sample). *(Test: Sample-Eval, User markiert vor und nach.)*
- **H-12:** Stufe-2-Activity-Trigger generiert 1-5 Hints pro Woche bei P1, davon werden > 30% akzeptiert. *(Test: Telemetrie hints.shown vs hints.clicked.)*
- **H-13:** Stufe-3 mit User-definiertem Hot-Cluster-Filter und Token-Budget-Cap bleibt unter Default-Budget (2 USD/Woche) bei realer Nutzung. *(Test: Token-Tracking pro Wochen-Job.)*
- **H-14:** Update-Findings haben > 70% Precision (User markiert "relevant" oder "irrelevant" pro Befund). *(Test: User-Feedback im Health-Modal.)*
- **H-15:** UX-Konsistenz im Vault-Health-Modal (alle Findings im selben Modal) reduziert User-Time-to-Action um > 30% gegenueber separaten UIs. *(Test: A/B-Test wenn moeglich, sonst User-Befragung.)*

### 7.5 Assumptions

- Sebastians Standard-Prompt repraesentiert eine Best-Practice, die als Default fuer neue User taugt.
- 1.500-Notes-Backfill mit Haiku ist token-oekonomisch tragbar.
- Der Indexing-Lauf darf langsamer werden, solange er asynchron im Hintergrund laeuft.
- Vault-Frontmatter-Edits ueber Obsidian-API kollidieren nicht mit aktiven User-Edits (Conflict-Detection im Indexing).

---

## 8. Risks

| ID | Dimension | Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|----|-----------|--------|--------------------|--------|------------|
| R-1 | Retrieval | Backfill-Lauf zerstoert User-Frontmatter durch fehlerhaftes replaceInFile-Pattern | Niedrig | Sehr hoch | Pre-Backfill-Diff plus User-Approval pro Batch, plus Vault-Backup-Empfehlung |
| R-2 | Retrieval | Auto-Summary-Generierung kostet bei Sonnet/Opus zu viele Tokens | Mittel | Hoch | Default-Modell konfigurierbar (Haiku als Default), Token-Budget-Cap |
| R-3 | Retrieval | SQL-Taxonomie-Lookup liefert irrelevante Vorschlaege | Mittel | Mittel | Bei jedem Indexing Mirror aktualisieren, Stale-Detection |
| R-4 | Retrieval | Top-Hub-Block bricht KV-Cache durch zu haeufige Regenerierung | Niedrig | Hoch | Regenerierung nur bei Hub-Membership-Aenderung, max 1x pro Tag |
| R-5 | Retrieval | MOC-Header-Block-Marker wird vom User versehentlich geloescht | Mittel | Mittel | Marker-Detection, Skip mit Warnung, kein Re-Insert |
| R-6 | Retrieval | iCloud-Sync-Conflicts bei Frontmatter-Write parallel zur User-Bearbeitung | Mittel | Mittel | Conflict-Detection vor Write, Skip mit Log-Eintrag |
| R-7 | Ingest | Triage-Pass-Score ist unzuverlaessig, User filtert falsch (Gold weg) | Mittel | Hoch | Triage zeigt Score plus Begruendung, User entscheidet immer manuell, kein Auto-Reject |
| R-8 | Ingest | Tension-Detection produziert false-positives (sieht Widersprueche wo keine sind) | Mittel | Mittel | Confidence-Label auf Marker, User kann dismissen, Threshold konfigurierbar |
| R-9 | Ingest | Source-Diversity-Tracking ist Domain-basiert und greift bei aggregator-Sites zu kurz | Mittel | Niedrig | Spaetere Iteration: Author-Level-Tracking, Reddit/HN als eigene Source-Klasse |
| R-10 | Ingest | Bias-Hint wird als bevormundend empfunden und ausgeschaltet | Mittel | Mittel | Tonalitaet sachlich, dismiss-Action verfuegbar, opt-out-Setting |
| R-11 | Lint | Stufe-1-Halbwertszeit-Defaults sind subjektiv und passen nicht zu jedem User | Hoch | Niedrig | Per-Cluster konfigurierbar, sinnvoller Default fuer common Clusters |
| R-12 | Lint | Stufe-2-Web-Search wird zu oft getriggert (jede Note-Bearbeitung) | Mittel | Hoch | Cooldown pro Cluster, Mindest-Score-Schwelle, max N Hints/Tag |
| R-13 | Lint | Stufe-3-Periodischer-Job ueberzieht Token-Budget durch unerwartete Cost-Spikes | Niedrig | Hoch | Hartes Budget-Cap mit Auto-Stop, Notification bei 80% Verbrauch |
| R-14 | Lint | Update-Findings sind veraltet weil Web-Search-Provider stale Cache liefert | Mittel | Mittel | Provider-Wahl explizit, Cache-Bust pro Query, User-sichtbares Datum |
| R-15 | Cross | Vault-Health-Modal wird zu voll bei vielen Findings, User ignoriert alles | Mittel | Mittel | Severity-Sortierung, Dismiss-Bulk, Filter-Toggles, Default-Severity-Threshold |

---

## 9. Constraints

### 9.1 Technisch

- Sebastians Standard-Prompt-Wortlaut ist bindend (im konfigurierbaren Settings-Feld als Default hinterlegen).
- Frontmatter-Schreiben muss replaceInFile-Pattern nutzen, struktur-erhaltend.
- knowledge.db v9 Schema additiv erweitern, kein Breaking Change. Neue Schema-Version v10.
- Indexing-Lauf darf nicht im UI-Thread blockieren.
- Mobile (iOS/Android) muss zumindest Read-Pfad unterstuetzen, Write-Pfad kann Desktop-only sein.

### 9.2 Strategisch

- Default-Verhalten konservativ (kein Vault-Write), Power-User-Mehrwert opt-in.
- Karpathys Pattern wird umgesetzt, aber keine 1:1-Kopie. Anpassung an Obsidian-Vault-Hoheit.
- Vault-Hoheit bleibt beim User. System pflegt nur, was er aktiviert.

### 9.3 Delivery

Implementation in fuenf Phasen entlang der drei Dimensionen, jede einzeln deploybar:

- **Phase 1 Foundation (P0, Retrieval-Slice 1):** note_summaries plus frontmatter_properties als reine DB-Schicht plus Schema-Migration v9 -> v10. Auto-Summary-Generierung beim Indexing (Setting-gated, Default off). cluster_metadata-Tabelle.
- **Phase 2 Frontmatter-Write (P1, Retrieval-Slice 2):** Frontmatter-Write Toggle plus Backfill-Job mit Progress-UI. Standard-Prompt als Settings-konfigurierbarer Wert.
- **Phase 3 Lint Foundation (P0, Lint-Slice 1):** VaultHealthService-Erweiterung um cluster_freshness und source_concentration Check-Types. Health-Modal-UI fuer neue Categories.
- **Phase 4 Ingest Foundation (P0, Ingest-Slice 1):** Pre-Triage-Tool plus 10-Sekunden-Triage-Karte. cluster_source_stats-Tabelle. Tension-Detection beim Deep-Ingest.
- **Phase 5 Aktive Schichten (P1/P2):** Stufe-2-Activity-Trigger plus Web-Search-Update-Pass, Concentration-Warning UI, MOC-File-Pflege, Selektiver Top-Hub-Block, Stufe-3 Periodischer-Job. Reihenfolge nach Telemetrie aus Phase 1-4.

---

## 10. Requirements Overview

### 10.1 Feature-Kandidaten (gehen in Requirements Engineering)

Aufgeteilt nach Dimensionen, IDs sind Vorschlaege fuer RE.

**Retrieval-Dimension (Sub-Initiative R):**

1. **FEAT-15-09** Note-Summary Storage (note_summaries-Tabelle + Indexing-Hook)
2. **FEAT-15-10** Frontmatter-Property Mirror (frontmatter_properties + SQL-Taxonomie-Lookup)
3. **FEAT-19-08** Konfigurierbarer Standard-Prompt (Settings-Feld, Default = Sebastians Wortlaut)
4. **FEAT-19-09** Auto-Summary-Generierung beim Indexing (Setting-gated, Default off)
5. **FEAT-19-10** Frontmatter-Write plus Backfill-Job mit Progress-UI (Setting-gated, Default off)
6. **FEAT-19-11** Aktive MOC-File-Pflege mit Marker-Konvention (Setting-gated, Default off)
7. **FEAT-03-26** Selektiver Top-Hub-Block im KV-Cache (Setting-gated, Default off)

**Ingest-Dimension (Sub-Initiative I):**

8. **FEAT-19-12** Pre-Triage-Tool mit 10-Sekunden-Triage-Karte
9. **FEAT-15-11** cluster_source_stats-Tabelle plus Source-Diversity-Tracking
10. **FEAT-19-13** Tension-Detection beim Deep-Ingest (Vault-Vergleich + Marker)
11. **FEAT-19-14** Concentration-Warning UI plus Anti-Echo-Vorschlag
12. **FEAT-19-15** Inbox-Workflow fuer Batch-Triage (mehrere Artikel)

**Lint-Dimension (Sub-Initiative L, integriert in VaultHealthService):**

13. **FEAT-15-12** cluster_metadata-Tabelle plus Halbwertszeit-Konfiguration
14. **FEAT-19-16** Stufe-1 Composite-Freshness-Score als VaultHealth-Check
15. **FEAT-19-17** Source-Diversity-Check als Bias-Lint-Kategorie
16. **FEAT-19-18** Health-Modal-Erweiterung mit kontext-spezifischen Action-Buttons
17. **FEAT-19-19** Stufe-2 Activity-Trigger plus Web-Search-Update-Pass
18. **FEAT-19-20** Stufe-3 Periodischer Job plus Token-Budget-Cap plus Notifications
19. **FEAT-19-21** Hot-Cluster-Konfiguration in Settings (User-definierte Scopes)

### 10.2 NFR-Prioritaet

1. Daten-Sicherheit (kein Frontmatter-Verlust).
2. User-Trust (Reversibilitaet, Transparenz).
3. Performance (Indexing-Latenz, KV-Cache-Stabilitaet).
4. Token-Oekonomie (Backfill-Kosten, Pro-Note-Kosten).
5. Skalierbarkeit (Vault-Groessen 100 bis 10.000+ Notes).

### 10.3 ADR-Bedarf (Indikatoren fuer Architecture-Phase)

**Retrieval:**
- ADR fuer note_summaries-Schema-Design (separate Tabelle vs Spalte in vectors).
- ADR fuer frontmatter_properties-Schema (Erweiterung tags vs eigenstaendige Tabelle).
- ADR fuer Conflict-Detection-Strategie bei parallelem User-Edit.
- ADR fuer MOC-Marker-Konvention (HTML-Comment vs Dataview-Block vs eigene Syntax).
- ADR fuer KV-Cache-Block-Lifecycle (Trigger fuer Regenerierung).

**Ingest:**
- ADR fuer Pre-Triage-Tool-Architektur (eigenstaendiges Tool vs Erweiterung von ingest_document).
- ADR fuer Source-Identitaet (Domain-only vs Domain plus Author plus Section-Klasse).
- ADR fuer Tension-Detection-Algorithmus (Cosine-Threshold vs LLM-Klassifikation vs Hybrid).

**Lint:**
- ADR fuer Cluster-Halbwertszeit-Modell (statische Defaults vs adaptive Heuristik).
- ADR fuer Web-Search-Provider-Wahl (welche Provider als opt-in, BYOK?).
- ADR fuer Token-Budget-Enforcement-Mechanik (soft cap vs hard cap, Reset-Strategie).
- ADR fuer Health-Modal-Severity-Modell (Sortierung, Threshold, Filter).
- ADR fuer Activity-Trigger-Cooldown-Strategie (pro Cluster, pro Tag, hybrid).

---

---

## 11. Ingest-Dimension Detail

### 11.1 Pre-Triage-Pass (10 Sekunden)

**Trigger:** User droppt Source (URL, PDF, MD, Excerpt) oder triggert "Triage" auf bestehender Inbox-Note.

**Pipeline:**

1. **Extract:** wenn URL -> requestUrl + Markdown-Konvertierung; wenn PDF -> bestehende Parser-Pipeline (EPIC-06); wenn MD -> direkt.
2. **Compact-Embed:** Source wird in 1-2 Chunks reduziert (Title plus erste 1.500 Tokens), Embedding berechnet.
3. **Cluster-Match:** Nearest-Neighbor-Lookup gegen ontology-Centroide. Top-3-Cluster mit Score.
4. **Vault-Vergleich (Single LLM-Call):** Mit Cluster-Context aus SQL (top-5 Notes pro Match-Cluster, Note-Summary plus Topics, ~2k Token Kontext). LLM klassifiziert: deckt sich / ergaenzt / widerspricht / orthogonal. Plus Relevanz-Score 0-1.
5. **Source-Diversity-Check:** SQL-Query auf cluster_source_stats: ist diese Domain im Match-Cluster bereits ueberpraesent (> 70% der Notes aus dieser Domain)?
6. **Triage-Karte rendert:**
   ```
   Title: Karpathys LLM Wiki
   Cluster-Match: Knowledge Management (0.87), AI Tools (0.71)
   Verhaeltnis: ergaenzt (Score 0.78) -- bringt neuen Aspekt zu Source-Diversity
   Source-Diversity-Hint: 4 von 12 Notes in Knowledge Management stammen aus medium.com (33%) -- ok
   Tension: keine Widersprueche detektiert
   Relevanz: 0.84
   Empfehlung: Deep-Ingest
   ```
7. User-Action: Ingest / Spaeter / Verwerfen.

**Token-Kosten:** ein LLM-Call mit ~3k Token Input plus 500 Token Output = ~0.02-0.05 USD bei Haiku.

### 11.2 Deep-Ingest mit Tension-Detection

Wird ausgefuehrt wenn User in Triage "Ingest" waehlt.

**Pipeline:**

1. **Vollstaendiges Lesen** (chunked, fuer grosse Sources mehrere LLM-Passes).
2. **Key-Claims-Extraktion:** Liste atomarer Aussagen mit Source-Position-Marker.
3. **Vault-Vergleich pro Claim:** Lookup gegen vorhandene Notes im Match-Cluster. Pro Claim: stuetzt-Note-X / widerspricht-Note-Y / neutral.
4. **Note-Generierung:** neue Vault-Note mit:
   - YAML-Frontmatter via Standard-Pipeline (Summary, Keywords, Themen, Konzepte).
   - Body: Originalinhalt strukturiert.
   - **Tension-Marker:** widersprechende Claims werden explizit als Inline-Callout markiert: `> [!tension] Widerspricht [[Note-Y]]: dort steht X, hier steht Y`.
   - **Support-Marker:** unterstuetzende Claims als Inline-Callout: `> [!support] Stuetzt [[Note-X]]: bestaetigt das Argument durch...`.
5. **Source-Diversity-Counter aktualisieren:** cluster_source_stats fuer Match-Cluster inkrementieren.
6. **Concentration-Check:** wenn Cluster jetzt > 70% Single-Source erreicht: Concentration-Warning ausloesen, Anti-Echo-Vorschlag generieren.

### 11.3 Source-Diversity-Tracking

**Schema (`cluster_source_stats`):**
```sql
cluster TEXT NOT NULL,
source_domain TEXT NOT NULL,
note_count INTEGER NOT NULL DEFAULT 0,
first_seen_at TEXT NOT NULL,
last_seen_at TEXT NOT NULL,
PRIMARY KEY (cluster, source_domain)
```

**Auswertung:**
- Concentration-Score pro Cluster: max(note_count) / sum(note_count).
- Diversity-Score (Shannon-Entropy ueber source_domain).
- Single-Source-Trigger: Concentration-Score > 0.7 plus min 5 Notes im Cluster.

### 11.4 Anti-Echo-Vorschlag

Bei Concentration-Warning:
- Hint im Vault-Health-Modal: "Cluster X ist zu 75% von domain.com gepraegt. Suche aktiv nach alternativen Quellen?"
- Optional Klick: Light-Web-Search mit gezielter Anfrage "Critical perspectives on [Cluster-Topic] not from domain.com" (Source-Filter).
- Findings landen als Triage-Vorschlaege in Inbox.

### 11.5 Inbox-Workflow fuer Batch-Triage

- Webclipper-Inbox-Folder wird vom System ueberwacht.
- "Triage Inbox"-Command zeigt Liste aller untriaged Notes.
- Jede Note hat Triage-Karte plus Schnell-Actions.
- User kann pro Note entscheiden oder Bulk-Action (alle ergaenzenden ingesten, alle nieder-priorisierten verschieben).

---

## 12. Lint-Dimension Detail (3-Stufen-Stack)

### 12.1 Stufe 1: Passive Freshness (Default an, kostenlos)

**Mechanik:**

Pro Cluster eine konfigurierbare Halbwertszeit. Default-Vorschlaege (in Settings editierbar):

| Cluster-Kategorie | Halbwertszeit-Default |
|-------------------|----------------------|
| Tech / Software / AI | 6 Monate |
| Wissenschaft / Forschung | 12 Monate |
| Politik / Wirtschaft | 1 Monat |
| Geschichte / Philosophie | 24 Monate |
| Personal / Self / Reflection | nie (statisch) |

**Composite-Freshness-Score (0-100) pro Note:**

```
Score = w1 * (1 - Content-Age / Halbwertszeit) +
        w2 * (1 - Coverage-Drift) +
        w3 * (1 - Stale-Reference-Rate)

w1=0.6, w2=0.3, w3=0.1 (Default, konfigurierbar)
```

- **Content-Age:** Zeit seit letzter Vault-Modifikation.
- **Coverage-Drift:** Anteil verlinkter Notes im Cluster, die selbst stale sind.
- **Stale-Reference-Rate:** Anteil externer Links die kaputt oder umgezogen sind (separate Pipeline).

**Schwellwerte:** Score < 70 = Hint, < 50 = Warning, < 30 = Critical.

**Trigger:** beim Vault-Open laeuft VaultHealthService einmal. SQL-only, null LLM-Calls. Findings landen im Vault-Health-Modal.

**Schema (`cluster_metadata`):**
```sql
cluster TEXT PRIMARY KEY,
half_life_days INTEGER NOT NULL,
custom_weights TEXT,  -- JSON optional
last_external_check TEXT,
hot_cluster INTEGER NOT NULL DEFAULT 0  -- fuer Stufe 3
```

### 12.2 Stufe 2: Activity-Triggered (low-cost, smart)

**Mechanik:**

Vault-Event-Listener registriert auf `vault.on('open')` und `vault.on('modify')`.

Bei Note-Open/Modify in Cluster X:
1. SQL-Query: Cluster-Freshness-Score plus letzter externer Check.
2. Wenn Score < 70 UND letzter externer Check > 30 Tage UND kein Cooldown aktiv:
3. **Dezenter Hint** im UI (Sidebar-Notification, dismissable):
   ```
   Cluster "AI Tools" letzter externer Check vor 92 Tagen. Update-Recherche starten?
   [Ja, prueefen]  [Spaeter]  [Nicht mehr fuer diesen Cluster]
   ```
4. Bei Klick "Ja, pruefen": Light-Web-Search-Pipeline:
   - 3-5 gezielte Queries ueber Web-Search-Provider zum Cluster-Topic.
   - LLM-Synthese der Top-Results: was ist neu seit Datum X?
   - Befunde als Update-Vorschlag im Vault-Health-Modal.
   - cluster_metadata.last_external_check aktualisieren.
5. Cooldown: gleicher Cluster max 1x pro Woche, max 5 Hints pro Tag.

**Token-Kosten:** ein Web-Search-Pass kostet ~0.10-0.50 USD (3-5 Search-API-Calls + 1 Synthese-Call). Selbst-limitierend durch User-Klick und Cooldown.

### 12.3 Stufe 3: Periodisch budgetiert (opt-in)

**Mechanik:**

Wochentlicher Background-Job (per setInterval mit Cooldown), opt-in via Settings.

**Hot-Cluster-Konfiguration:** User markiert in Settings welche Cluster als "Hot" gelten (Default: Top-10 Cluster nach Note-Count). Nur Hot-Clusters werden periodisch geprueft.

**Token-Budget-Cap:** 
- Default 2 USD/Woche, konfigurierbar.
- Hartes Stop-Limit: bei Erreichen wird Job abgebrochen, naechste Woche neu.
- Notification bei 80% Verbrauch.

**Pipeline:**
1. Iteration ueber Hot-Clusters sortiert nach Freshness-Score (niedrig zuerst).
2. Pro Cluster: **Semantic-Pre-Filter** (cheap LLM-Call mit Cluster-Summary): "Hat sich zu diesem Topic seit Datum X wahrscheinlich was Wesentliches geaendert?". Antwort yes/no/unsure.
3. Bei "yes" oder "unsure": Light-Web-Search wie Stufe 2.
4. Pro Befund: **Strong-Signal-Filter** (mindestens 3 unabhaengige Sources melden vergleichbare Aenderung). Nur strong signals werden Notification.
5. Notifications sammeln, am Wochenende dem User in Vault-Health-Modal anzeigen.

**Token-Kosten** (Schaetzung):
- Semantic-Pre-Filter: ~50 Hot-Clusters x 500 Token = 25k Token = 0.025 USD bei Haiku.
- Web-Search-Calls fuer ~30% der Cluster (yes/unsure): 15 x (3-5 Searches + 1 Synthese) = ~3-5 USD/Woche bei Default-Hot-List, ~1-2 USD/Woche realistisch nach Filter.
- Innerhalb Default-Budget realistisch.

### 12.4 Bias-Check als VaultHealth-Kategorie

Eigenstaendiger Check-Type: `source_concentration`.

**Trigger:** beim Vault-Open SQL-Query auf cluster_source_stats: alle Cluster wo Concentration-Score > 0.7 plus min 5 Notes.

**UI-Output:**
```
Cluster "Knowledge Management": 9 von 12 Notes (75%) aus medium.com.
Empfehlung: Suche aktiv Gegenpositionen aus academic, official-docs, oder direkten Quellen.
[Anti-Echo-Suche starten]  [Cluster-Status anzeigen]  [Dismiss diese Warnung]
```

Anti-Echo-Suche triggert Light-Web-Search analog Stufe 2, aber mit Source-Filter (block dominante Domain).

### 12.5 Vault-Health-Modal-Erweiterung

Bestehend: 7 strukturelle Check-Kategorien.

Neu zusaetzlich:
- **Freshness** (Stufe 1 lokal)
- **Source-Concentration** (Bias)
- **Update-Findings** (Stufe 2/3 extern)

UI-Konzept:
- Gruppierung nach Severity (Critical / Warning / Hint).
- Innerhalb Severity Gruppierung nach Kategorie.
- Pro Finding: Title, Cluster/Note-Referenz, Action-Buttons (kontextuell).
- Filter-Toggles fuer Kategorien (User kann Bias-Hints temporaer ausblenden).
- Bulk-Dismiss-Action.

### 12.6 Token-Budget-Modell ueber alle drei Stufen

| Stufe | Trigger | Token-Kosten/Monat (P1, realistisch) |
|-------|---------|--------------------------------------|
| Stufe 1 | Passive, beim Vault-Open | 0 USD |
| Stufe 2 | Activity-Triggered, on-demand-Klick | 5-30 USD (geschaetzt 5-10 Klicks/Monat) |
| Stufe 3 | Periodisch wochentlich, opt-in | < 8 USD bei Default-Budget |
| Bias-Check | Passive, beim Vault-Open | 0 USD (SQL-only) |
| Anti-Echo-Suche | On-Demand-Klick | analog Stufe 2 |

Gesamt-Schaetzung P1 mit allen Stufen aktiv: ~10-50 USD/Monat. User-konfigurierbar bis hin zu "alles aus" (nur Stufe 1 plus Bias-Passive = 0 USD).

---

## Anhang A: Verweise

**Interne Artefakte:**
- [BA-19 Knowledge Maintenance](BA-19-knowledge-maintenance.md) (Karpathy-Pattern als Leitstern)
- [EPIC-15 Knowledge Layer](../requirements/epics/EPIC-15-knowledge-layer.md)
- [EPIC-19 Knowledge Maintenance](../requirements/epics/EPIC-19-knowledge-maintenance.md)
- [EPIC-03 Context, Memory and Scaling](../requirements/epics/EPIC-03-context-memory-scaling.md)
- [EPIC-20 Graph Intelligence](../requirements/epics/EPIC-20-graph-intelligence.md)
- [ADR-67 Lint-Architektur](../architecture/ADR-67-lint-architecture.md)
- [ADR-65 Ontologie-Schema](../architecture/ADR-65-ontologie-schema.md)

**Externe Quellen (Karpathy-Adoptionen, Mai 2026 Recherche):**
- [Karpathys LLM Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [swarmvault GitHub (direkter Karpathy-Klon)](https://github.com/swarmclawai/swarmvault)
- [PENgram (Karpathy-Kritik plus typed-graph)](https://dev.to/penfieldlabs/we-fixed-karpathys-llm-wiki-pengram-is-the-typed-knowledge-graph-pipeline-everyone-asked-for-j3j)
- [Atlan Freshness-Scoring-Framework](https://atlan.com/know/llm-knowledge-base-freshness-scoring/)
- [OwlerLite Scope- and Freshness-Aware Retrieval (arXiv)](https://arxiv.org/abs/2601.17824)
- [qmd README (Tobi Lutke)](https://github.com/tobi/qmd/blob/main/README.md)
- [Filter Bubbles Systematic Review (arXiv)](https://arxiv.org/pdf/2307.01221)

## Anhang B: Sebastians Standard-Prompt (Default-Wert fuer FEAT-19-08)

Wird als Default in Settings hinterlegt, vom User editierbar. Inhalt steht in der Konversation, wird in PLAN-Phase woertlich uebernommen.
