# Business Analysis: Knowledge Maintenance

> **Scope:** MVP
> **Erstellt:** 2026-04-07
> **Status:** Draft
> **Inspiration:** [Karpathy LLM-Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

---

## 1. Executive Summary

### 1.1 Problem Statement

Obsidian-Power-User mit Zettelkasten-Methode oder vergleichbaren Wissensmanagement-Ansaetzen scheitern am **Bookkeeping**: Das manuelle Pflegen von MOC-Properties, Backlinks, Tags, Zusammenfassungen und konsistenten Dateinamen skaliert nicht. Bei 700+ Notes und 500+ Attachments fallen Verlinkungen unvollstaendig aus, Quellen bleiben unstrukturiert, und der volle Wert des vernetzten Wissens wird nicht ausgeschoepft.

### 1.2 Proposed Solution

Vault Operator wird vom passiven Index-System zum aktiven Wissens-Pfleger. Der Agent uebernimmt das Bookkeeping: neue Notes intelligent einordnen (Ingest), bestehende Strukturen konsistent halten (Lint), Chat-Synthesen als Zettel speichern und Quell-Dokumente automatisch aufbereiten (OCR). Ergaenzt durch UI-Verbesserungen fuer effizientere Chat-Interaktion.

### 1.3 Expected Outcomes

- Neue Notes werden in unter 1 Minute vollstaendig eingeordnet statt 5-10 Minuten manuell (oder gar nicht)
- Strukturelle Vault-Qualitaet steigt messbar: weniger verwaiste Notes, konsistentere Properties
- Transitives Retrieval ("alles zu Thema X") wird zuverlaessig vollstaendig
- Denkarbeit aus Chats geht nicht mehr verloren (Synthese → Zettel)
- Attachments sind konsistent benannt und auffindbar

---

## 2. Business Context

### 2.1 Background

Karpathys LLM-Wiki-Konzept (April 2026) beschreibt eine persistente, LLM-gepflegte Wissensdatenbank mit drei Kernoperationen: Ingest (Quellen aufnehmen und einordnen), Query (Wissen abrufen mit transitiver Vollstaendigkeit) und Lint (Konsistenz pruefen). Die zentrale These: "LLMs don't tire of bookkeeping."

Vault Operator hat mit EPIC-15 (Knowledge Layer) die technische Basis gebaut: SemanticIndex, GraphStore, ImplicitConnections, 4-Stufen-Retrieval-Pipeline mit Contextual Retrieval. Diese Infrastruktur ist produktionsreif, wird aber nur **passiv** genutzt -- zum Indexieren und Suchen, nicht zum aktiven Pflegen.

### 2.2 Current State ("As-Is")

**Ingest-Workflow (heute):**
1. Webclipper-Artikel landet in Inbox-Ordner mit korrekt konfiguriertem Frontmatter
2. PDFs werden in Attachments abgelegt oder per `![[Datei.pdf]]` in Notes eingebettet
3. User erstellt **manuell** eigene Zettel zu den Quellen (Zettelkasten-Prinzip)
4. User befuellt **manuell** MOC-Properties (Themen, Konzepte, Personen, Projekte...) -- schafft aber nur 2-3 von potentiell 10+ Verlinkungen
5. Dateinamen von PDFs und Bildern bleiben kryptisch (keine `Autor-Jahr_Titel` Konvention)
6. Zusammenfassungen in YAML-Frontmatter und als Markdown-Section werden inkonsistent gepflegt

**Technischer Status:**
- `vault.on('create')` triggert automatisch: SemanticIndex (Vektor-Embedding) + GraphExtractor (Wikilinks/MOC)
- pdfjs-dist extrahiert Text-Layer, scheitert bei gescannten/bildbasierten PDFs
- ImplicitConnections werden inkrementell berechnet (event-driven)
- Alle Daten liegen in KnowledgeDB (SQLite) vor -- werden aber nur fuer Suche genutzt

**Pain Points (nach Schwere):**

| # | Problem | Impact |
|---|---------|--------|
| 1 | MOC-Properties befuellen nicht leistbar (5-10 Min/Note, oft unvollstaendig) | Wissensnetz bleibt fragmentiert |
| 2 | "Alles zu Thema X" findet nicht alles (keine transitive Suche) | Relevante Notes werden uebersehen |
| 3 | Keine systematische Konsistenzpruefung | Verwaiste Notes, fehlende Links bleiben unerkannt |
| 4 | PDF-Ingest rein manuell (Properties, Dateiname, Zusammenfassung) | PDFs bleiben unstrukturiert |
| 5 | Attachments (Bilder, PDFs) kryptisch benannt | Nicht auffindbar, nicht zuordenbar |
| 6 | Zusammenfassungen inkonsistent gepflegt | Schneller Ueberblick fehlt |
| 7 | Gescannte PDFs nicht indexierbar (kein Text-Layer) | Inhalte unsichtbar fuer Suche |
| 8 | Chat-Synthesen gehen verloren | Denkarbeit muss wiederholt werden |
| 9 | Chat-UI hat zu viele Buttons, Menues brechen bei schmaler Sidebar | Bedienbarkeit leidet |

### 2.3 Desired State ("To-Be")

**Ingest-Workflow (zukuenftig):**
1. Webclipper/PDF/Bild landet im Vault
2. User sagt "Integriere diese Note" (oder: Agent bietet es an)
3. Agent liest die Note, erkennt Themen/Konzepte/Personen
4. Agent **sucht zuerst bestehende Entitaeten** und ordnet die Note zu
5. Wenn neue Entitaet noetig: Agent schlaegt vor + erstellt inhaltlich angereicherte Stub-Note
6. User entscheidet: Stub jetzt vertiefen oder spaeter (→ Task in TaskNotes)
7. Agent setzt Properties, Links, MOC-Eintraege, Zusammenfassung, Tags
8. Bei PDFs: OCR via Chandra → Markdown, Original-PDF als URL/Pfad verlinkt, korrekt benannt

**Taeglicher Vault-Check:**
- Automatisch bei Vault-Open: Stille DB-Queries (keine Token-Kosten)
- Badge zeigt Findings: "5 verwaiste Notes, 3 fehlende MOC-Eintraege"
- Agent schlaegt Fixes vor, User bestaetigt (einzeln oder gesammelt)

**Retrieval:**
- Ontologie-Tabelle in KnowledgeDB: Themen-Cluster, Konzept-Hierarchien
- Transitives Retrieval: "Alles zu Legitimitaet" findet auch Notes ueber Menschenwuerde, Tyrannenmord, Gesellschaftsvertrag
- Bei Bedarf: Agent generiert Canvas/Base als Arbeitsflaehe (Luhmanns Schreibtisch-Metapher)

**Chat-Synthese:**
- Neuer "Synthese → Zettel" Button im Chat
- Agent generiert Zettel mit vollstaendigem Frontmatter und Verlinkung (Ingest-Logik)
- Neuer Zettel oeffnet sich im Editor, User kann bearbeiten oder loeschen

**Chat-UI:**
- Aufgeraeumte Button-Leiste: Tools & Skills in "..." Menue, Kontext-Hinzufuegen ueber "+"
- Keine abgeschnittenen Buttons bei schmaler Sidebar
- Alle Kontext-Menues oeffnen nach oben, immer vollstaendig lesbar

### 2.4 Gap Analysis

| Bereich | As-Is | To-Be | Gap |
|---------|-------|-------|-----|
| Note-Einordnung | Manuell, 2-3 von 10+ Properties | Agent-assistiert, vollstaendig | Ingest-Skill + Template-Onboarding |
| Vault-Konsistenz | Keine Pruefung | Taeglicher automatischer Check | Lint + vault_health_check |
| Retrieval-Vollstaendigkeit | Semantisch + 1-3 Hops | Transitiv ueber Ontologie | Ontologie-Tabelle in KnowledgeDB |
| PDF-Qualitaet | pdfjs-dist (nur Text-Layer) | OCR (Chandra) → Markdown | Neuer OCR-Parser |
| Attachment-Benennung | Kryptisch | `Autor-Jahr_Titel` Konvention | Batch-Umbenennungs-Skill |
| Chat-Synthesen | Gehen verloren | Synthese → Zettel Button | UI + Ingest-Logik |
| Chat-UI | Button-Clutter, Layout-Bugs | Aufgeraeumt, responsive | CSS/UI-Refactoring |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|-------------|------|----------|-----------|-------|
| Sebastian (Product Owner) | Primaerer User & Entwickler | H | H | Effizientes PKM, Zettelkasten-Workflow |
| Vault Operator-Community-User | Zukuenftige Nutzer | H | M | Anpassbare Templates, mehrsprachig |
| Obsidian Review-Bot | Gatekeeper | M | H | Plugin-Compliance (kein innerHTML, etc.) |

### 3.2 Key Stakeholders

**Primary:** Sebastian -- nutzt Vault Operator taeglich fuer persoenliches Wissensmanagement
**Secondary:** Community-User mit eigenen Wissensmanagement-Methoden (nicht nur Zettelkasten)

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: Der Wissensarbeiter (Sebastian)**
- **Rolle:** Power-User mit 700+ Notes, Zettelkasten-Methode
- **Ziele:** Vernetztes Denken, "neue Synapsen" entdecken, nichts Relevantes uebersehen
- **Pain Points:** Bookkeeping skaliert nicht, Properties befuellen dauert zu lange, Attachments sind Chaos
- **Nutzungshaeufigkeit:** Daily
- **Anspruch:** Konzepte im PKM muessen selbst verstanden sein -- kein Wikipedia-Duplikat

**Persona 2: Der Einsteiger**
- **Rolle:** Neuer Obsidian-User, will strukturiert Notizen machen
- **Ziele:** Ordnung im Vault, einfacher Einstieg
- **Pain Points:** Weiss nicht welche Properties sinnvoll sind, kein bestehendes Schema
- **Nutzungshaeufigkeit:** Weekly
- **Beduerfnis:** Default-Templates als Startpunkt, Onboarding das nichts kaputt macht

### 4.2 User Journey (High-Level)

**Ersteinrichtung (einmalig):**
```
Plugin installieren
  → Onboarding-Dialog: "Hast du eigene Templates?"
  → Ja: Ordner angeben, Agent liest sie
  → Nein: Sprache waehlen, Agent kopiert Default-Templates
  → Kein bestehendes Frontmatter wird ueberschrieben
```

**Taeglicher Workflow:**
```
Vault oeffnen
  → Lint-Badge: "3 Findings"
  → User klickt → Agent zeigt Findings, bietet Fixes an
  → User bestaetigt (einzeln oder batch)

Neue Note erstellen / Webclipper-Artikel einordnen
  → "Integriere diese Note"
  → Agent ordnet ein, schlaegt Properties/Links vor
  → Bei neuer Entitaet: Stub erstellen, jetzt vertiefen oder Task anlegen

Chat-Recherche
  → "Zeig mir alles zu Thema X" → Transitives Retrieval
  → Agent erstellt Canvas als Arbeitsflaehe
  → User denkt, verbindet, schreibt neue Zettel

Chat-Synthese
  → Agent hat gute Antwort gegeben
  → [Synthese → Zettel] Button → Neuer Zettel oeffnet sich
```

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Das Wissensmanagement in Obsidian hat ein fundamentales Skalierungsproblem: Der Wert eines vernetzten Vault steigt mit der Anzahl und Qualitaet der Verbindungen, aber der Aufwand diese Verbindungen zu pflegen steigt schneller als der Nutzen. Ab einer kritischen Vault-Groesse (~300+ Notes) gibt der User auf und die Struktur erodiert.

Vault Operator hat mit EPIC-15 die technische Basis fuer automatische Verbindungserkennung gebaut (SemanticIndex, GraphStore, ImplicitConnections). Diese wird aber nur fuer Retrieval genutzt -- die erkannten Verbindungen werden nicht in den Vault zurueckgeschrieben.

### 5.2 Root Causes

1. **Passives System:** Vault Operator indexiert und sucht, aber pflegt nicht aktiv
2. **Kein Ontologie-Verstaendnis:** Der Agent kennt keine Themen-Hierarchien, kann nur paarweise Aehnlichkeit erkennen
3. **Kein Ingest-Workflow:** Neue Dateien werden technisch indexiert (Vektoren), aber nicht inhaltlich eingeordnet
4. **OCR-Luecke:** Gescannte PDFs sind unsichtbar fuer das System
5. **Kein Rueckkanal:** Chat-Synthesen fliessen nicht ins Wissensnetz zurueck

### 5.3 Impact

- **User Impact:** 5-10 Minuten Bookkeeping pro Note, oft uebersprungen → fragmentiertes Wissensnetz
- **Retrieval Impact:** "Alles zu Thema X" findet nur 50-60% der relevanten Notes → Denkarbeit auf unvollstaendiger Basis
- **Langzeit-Impact:** Vault verliert Strukturqualitaet ueber Zeit, User verliert Vertrauen in das System

---

## 6. Goals & Objectives

### 6.1 Business Goals

- Vault Operator als einzigartiges Produkt positionieren: Kein anderes Obsidian-Plugin bietet aktives Wissensmanagement
- Karpathys LLM-Wiki Vision als konkretes Produkt-Feature umsetzen
- Token-Kosten minimal halten (Skill-basiert, kein permanenter Hintergrund-Agent)

### 6.2 User Goals

- **Primaer:** Bookkeeping-Aufwand auf nahe Null reduzieren
- **Primaer:** Beim Recherchieren nichts Relevantes uebersehen (transitive Vollstaendigkeit)
- **Sekundaer:** Vault-Konsistenz ohne manuellen Aufwand sicherstellen
- **Sekundaer:** Denkarbeit aus Chats im Wissensnetz bewahren

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|-----|----------|--------|-----------|
| Time-to-integrate (neue Note vollstaendig eingeordnet) | 5-10 Min (manuell) | <1 Min (Agent-assistiert) | Sofort nach Release |
| Property-Vollstaendigkeit (% befuellter MOC-Properties) | ~30% (geschaetzt) | >80% | 4 Wochen nach Nutzung |
| Verwaiste Notes (ohne eingehende Links) | Unbekannt | -50% | 4 Wochen nach Nutzung |
| Retrieval-Vollstaendigkeit ("alles zu X") | ~60% | >90% (transitiv) | Nach Ontologie-Aufbau |
| Inkonsistent benannte Attachments | ~80% | <20% | Nach Batch-Umbenennung |
| Lint-Findings pro Woche | 0 (keine Pruefung) | Aktiv gemeldet und behoben | Sofort nach Release |

---

## 7. Scope Definition

### 7.1 In Scope

**Feature 1: Knowledge Ingest Skill**
- Agent liest neue Notes, erkennt Themen/Konzepte/Personen
- Sucht bestehende Entitaeten, ordnet Note zu (Properties, Links, MOC)
- Erstellt inhaltlich angereicherte Stub-Notes fuer neue Entitaeten
- Dialog: Jetzt vertiefen oder spaeter (→ Task in TaskNotes)
- Zusammenfassung + Tags gemaess User-Konventionen
- Dateinamen-Korrektur nach `Autor-Jahr_Titel` Schema fuer Quellen

**Feature 2: Knowledge Lint**
- Taeglicher Vault-Check bei Vault-Open (DB-Queries, keine Token-Kosten)
- Checks: Verwaiste Notes, fehlende MOC-Eintraege, inkonsistente Tags, Broken Links, schwache Cluster
- Badge mit Findings-Anzahl, Vorschlaege auf Klick
- User bestaetigt Fixes einzeln oder gesammelt

**Feature 3: Template-Onboarding**
- Onboarding-Dialog: Eigene Templates erkennen oder Default kopieren
- Sprachauswahl fuer Default-Templates
- Default-Templates basierend auf Sebastians Schema (Zettel, Thema, Konzept, Person, Projekt, Meeting-Notiz, Quelle, Notiz)
- User passt Templates als .md-Dateien an (nicht ueber Settings)
- Info-Modal erklaert Template-Anpassung

**Feature 4: Synthese → Zettel Button**
- Neuer Button im Chat: "Synthese → Zettel"
- Agent generiert Zettel mit vollstaendigem Frontmatter (Ingest-Logik)
- Neuer Zettel oeffnet sich im Editor
- User kann bearbeiten oder loeschen

**Feature 5: OCR + Batch-Umbenennung**
- PDF-OCR via Chandra: Gescannte PDFs → strukturiertes Markdown
- Original-PDF als URL/Pfad im Frontmatter verlinkt, nur Markdown im Vault
- Batch-Umbenennung von Attachments (PDFs, Bilder) via Skill mit kleinem Modell (Haiku)
- Bilder: Name ableiten aus einbettender Note oder visueller Analyse
- User bekommt Vorschlagsliste, bestaetigt einzeln oder gesammelt

**Feature 6: Ontologie (KnowledgeDB)**
- Neue Tabelle in KnowledgeDB fuer Themen-Cluster und Konzept-Hierarchien
- Wird beim Ingest und Lint automatisch aktualisiert
- Ermoeglicht transitives Retrieval ("alles zu Thema X" inkl. verwandter Konzepte)
- Kein Token-Overhead beim Lesen (SQL-Query)
- Canvas/Base-Generierung on-demand aus Ontologie-Daten

**Feature 7: Chat UI Polish**
- Tools & Skills in "..." Menue integrieren (Taschenmesser entfernen)
- Kontext-Hinzufuegen ueber einheitlichen "+" Button (Upload + Vault-Auswahl)
- Minimum-Breite fuer Sidebar: Buttons duerfen nie abgeschnitten werden
- Alle Kontext-Menues (Mode, Model, etc.) oeffnen nach oben, immer vollstaendig sichtbar

### 7.2 Out of Scope

- Automatischer Hintergrund-Ingest ohne User-Trigger (Modell C -- zu teuer, User verliert Kontrolle)
- Aenderungen an bestehender SemanticIndex- oder GraphStore-Logik (Infrastruktur steht)
- Vault-uebergreifendes Wissen
- Full GraphRAG (Microsoft) -- zu teuer, Obsidian-Graph reicht
- Permanenter Hintergrund-Agent
- Content-Generierung ueber Stubs hinaus (Agent schreibt keine Aufsaetze)

### 7.3 Assumptions

- User hat ein Template-basiertes Frontmatter-Schema (oder akzeptiert das Default-Schema)
- Chandra OCR API ist stabil und kostenmaessig akzeptabel fuer den User
- TaskNotes-Plugin ist installiert wenn "spaeter"-Option genutzt wird (graceful degradation wenn nicht)
- SemanticIndex und GraphStore sind funktional und aktuell (EPIC-15 deployed)
- Obsidian Enhanced Canvas Plugin ist installiert fuer Wikilink-Canvas (optional)

### 7.4 Feature-Typen und Settings

Nicht alle Bausteine sind gleich: Skills werden explizit getriggert, automatische Features brauchen Toggles.

| Typ | Name | Toggle in Settings | Begruendung |
|-----|------|--------------------|-------------|
| Skill | `knowledge-ingest` | Nein | Nur bei explizitem User-Trigger, keine Hintergrundkosten |
| Skill | `knowledge-rename` | Nein | Nur bei explizitem User-Trigger (Batch-Umbenennung) |
| Feature | Vault Health Check (Lint) | `enableVaultHealthCheck` | Laeuft automatisch bei Vault-Open, User muss abschalten koennen |
| UI-Button | Synthese → Zettel | `enableSynthesisButton` | Optionaler Button im Chat, User will vielleicht keinen extra Button |
| Sub-Feature | OCR via Chandra | `enableOcrIngest` | Kostet API-Calls, muss opt-in sein |
| Infrastruktur | Ontologie (KnowledgeDB) | Nein | Wird implizit befuellt wenn Ingest/Lint aktiv |
| Einmalig | Template-Onboarding | Nein | Laeuft einmal bei Ersteinrichtung |
| UI-Fix | Chat UI Polish | Nein | Bessere UX, kein optionales Feature |

### 7.5 Constraints

- **Token-Budget:** Kein permanenter Hintergrund-Agent. Alle LLM-Calls sind explizit getriggert
- **Vault-Integritaet:** Agent schreibt nie ohne User-Bestaetigung in bestehende Notes (Trockenlauf oder Batch-Bestaetigung)
- **Template-Sprache:** Properties muessen konsistent in der Sprache des Users sein (keine Mischung)
- **Review-Bot Compliance:** Alle neuen UI-Elemente muessen OWASP-konform sein (kein innerHTML, etc.)
- **Geschaetzter Token-Verbrauch:** ~120k Tokens/Monat bei typischer Nutzung (~$0.03/Monat mit Haiku)

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User akzeptiert Agent-Vorschlaege nicht (zu viel Noise) | M | H | Konservative Schwellwerte, nur High-Confidence vorschlagen, Akzeptanzrate tracken |
| MOC-Schema des Users ist nicht vorhersagbar | M | M | Schema wird aus bestehenden Templates gelernt (Onboarding), nicht hardcoded |
| Ontologie-Tabelle wird zu gross/langsam | L | M | Inkrementelles Update, nicht Full-Recompute. Index auf cluster/entity_path |
| Chandra OCR API-Kosten skalieren | M | M | User muss OCR explizit triggern, Kosten-Transparenz in UI |
| Batch-Umbenennung bricht bestehende Wikilinks | M | H | Agent prueft alle eingehenden Links und aktualisiert sie mit (Obsidian-API: vault.rename) |
| Template-Onboarding ueberschreibt bestehende Dateien | L | H | Explizite Ordner-Abfrage, Existenz-Check vor Kopieren, nie ueberschreiben |
| Synthese-Zettel werden als "nicht meine Gedanken" abgelehnt | M | M | Zettel oeffnet sich als Entwurf, User hat volle Kontrolle, kann loeschen |
| Lint-Badge nervt bei zu vielen Findings | M | L | Findings nach Severity sortieren, Low-Priority optional unterdrücken |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

1. Agent kann Notes intelligent einordnen (Properties, Links, MOC, Stubs)
2. Agent kann Vault auf strukturelle Inkonsistenzen pruefen (taeglicher Check)
3. User kann Templates als .md-Dateien anpassen, Onboarding schuetzt bestehende Strukturen
4. Chat-Synthesen koennen per Button als Zettel gespeichert werden
5. PDFs koennen via OCR in Markdown gewandelt werden
6. Attachments koennen batch-umbenannt werden
7. Transitives Retrieval ueber Ontologie-Tabelle
8. Chat-UI ist aufgeraeumt und responsive

### 9.2 Non-Functional Requirements (Summary)

- **Performance:** Lint-Scan <5s fuer 1000 Notes (reine DB-Queries), Ingest <30s pro Note
- **Token-Kosten:** ~120k Tokens/Monat bei typischer Nutzung, kein Hintergrund-Agent
- **Datensicherheit:** Nie in bestehende Notes schreiben ohne Bestaetigung
- **Kompatibilitaet:** Obsidian Review-Bot Compliance, graceful degradation ohne optionale Plugins
- **Internationalisierung:** Templates in der Sprache des Users

### 9.3 Key Features (fuer RE)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | Knowledge Ingest Skill | Notes einordnen, Properties/Links/MOC setzen, Stubs erstellen |
| P0 | Knowledge Lint | Taeglicher Vault-Check, Findings praesentieren, Fixes anbieten |
| P0 | Ontologie (KnowledgeDB) | Themen-Cluster fuer transitives Retrieval |
| P1 | Template-Onboarding | Dialog fuer Template-Setup, Sprachauswahl, Schutz bestehender Strukturen |
| P1 | Synthese → Zettel | Chat-Button, Zettel mit vollstaendigem Frontmatter generieren |
| P1 | OCR-Integration | Chandra OCR fuer gescannte PDFs, Markdown-only im Vault |
| P1 | Batch-Umbenennung | Attachments nach Konvention umbenennen (Skill mit Haiku) |
| P2 | Chat UI Polish | Button-Konsolidierung, Min-Breite, Menue-Richtung |

---

## 10. Next Steps

- [ ] Review durch Sebastian
- [ ] Uebergabe an Requirements Engineer (`/requirements-engineering`)
- [ ] ADR fuer Ontologie-Tabelle (KnowledgeDB-Erweiterung)
- [ ] ADR fuer OCR-Integration (Chandra API vs. Alternativen)
- [ ] ADR fuer Template-System (Onboarding-Flow, Sprachhandling)

---

## Appendix

### A. Glossar

| Begriff | Definition |
|---------|------------|
| MOC | Map of Content -- uebergeordnete Note die thematisch verwandte Notes verlinkt |
| Stub-Note | Vom Agent erstellte Note fuer eine neue Entitaet, inhaltlich angereichert aber vom User noch nicht vertieft |
| Zettelkasten | Wissensmanagement-Methode nach Luhmann: atomare Notizen mit Querverweisungen |
| Ontologie | Strukturierte Darstellung von Beziehungen zwischen Themen, Konzepten und Entitaeten |
| Ingest | Prozess der inhaltlichen Einordnung einer neuen Note in das bestehende Wissensnetz |
| Lint | Automatische Pruefung der Vault-Struktur auf Inkonsistenzen und Verbesserungsmoeglichkeiten |
| Transitives Retrieval | Suche die nicht nur direkte Treffer findet, sondern auch ueber verwandte Konzepte navigiert |

### B. Interview Notes

**Kernerkenntnisse aus dem Interview (2026-04-07):**

1. **Zettelkasten-Workflow:** User nutzt ein ausgereiftes Template-System mit 10 Kategorien (Zettel, Thema, Konzept, Person, Projekt, Meeting-Notiz, Quelle, Notiz, Pattern, Reise). Jede Kategorie hat spezifische MOC-Properties und bildet ein bidirektionales Verlinkungsnetz.

2. **Pain Point Bookkeeping:** Das Befuellen der MOC-Properties ist "nicht leistbar" -- User schafft 2-3 von 10+ moeglichen Verlinkungen pro Note. Themen-Disziplin erfordert Vault-ueberblick den der User nicht hat.

3. **Quellen-Handling:** Webclipper-Notes haben korrektes Frontmatter (konfiguriert). PDFs muessen manuell aufbereitet werden (Properties, Dateiname, Zusammenfassung). Bilder in Attachments haben kryptische Dateinamen.

4. **Kontrolle ueber Wissensnetz:** User will Konzepte in seinem PKM **selbst verstanden haben**. Neue Entitaeten sind Einladungen zum Denken, keine fertigen Wikipedia-Artikel. Bestehende Zuordnungen darf der Agent selbst setzen, neue Entitaeten muessen vorgeschlagen werden.

5. **Interaktionsmodell:** Trockenlauf (alle Vorschlaege zeigen, dann gesammelt bestaetigen) ODER bestimmte Aktionen automatisch, andere mit Freigabe. Jetzt-oder-spaeter-Dialog fuer Stub-Vertiefung, mit Task-Anlage bei "spaeter".

6. **Template-Strategie:** Sebastians Templates als Default, in der Sprache des Users. User kann Templates als .md anpassen. Onboarding-Dialog fragt nach bestehenden Templates bevor Default kopiert wird -- bestehende Strukturen werden nie ueberschrieben.

7. **Dateinamen-Konvention:** `Autor-Jahr_Titel` fuer Quellen (BibTeX/Zotero-kompatibel, skript-freundlich). Regulaere Notes: lesbarer Titel.

8. **Knowledge Map:** User braucht keine statische Uebersichts-Note -- nutzt lieber Canvas (Luhmanns Schreibtisch-Metapher) oder Base fuer thematische Arbeitsfaechen. Aber fuer den Agent ist ein interner Ueberblick (Ontologie) wertvoll fuer transitives Retrieval.

9. **Lint:** Taeglich als feste Routine (on open/reload + Shortcut). Reine DB-Queries ohne Token-Kosten fuer den Scan, LLM nur fuer Vorschlags-Formulierung.

10. **Zusammenfassungen:** Bestehender Settings-Prompt definiert Format (1 Satz, max 25 Woerter fuer YAML; 5-10 Keywords deutsch/englisch; 2-3 Themen/Konzept-Vorschlaege mit Vault-First-Prinzip).

### C. References

- [Karpathy LLM-Wiki Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- EPIC-15: Unified Knowledge Layer (implementiert)
- EPIC-03: Context, Memory & Scaling (implementiert)
- ADR-51: 4-Stufen Retrieval-Pipeline
- ADR-50: SQLite Knowledge DB
- Vault-Templates: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/NexusOS/Tools & Settings/Templates/`
- Bestehender Prompt: Settings → "Metadata Summary & Tags"
