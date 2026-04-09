---
name: knowledge-ingest
description: Neue Notes in das Wissensnetz einordnen. Properties, Links, MOC-Eintraege setzen. Bestehende Entitaeten bevorzugen, neue als Stub-Notes vorschlagen.
trigger: integrier|einordne|ingest|einpflege|knowledge.*maintain|wissen.*pflege|note.*einordne|ordne.*ein
source: bundled
requiredTools: [read_file, read_document, semantic_search, update_frontmatter, write_file, list_files]
---

# Knowledge Ingest

Ordne eine Note systematisch in das bestehende Wissensnetz ein.
Befolge diese Schritte IN DER REIHENFOLGE. Ueberspringe keine Schritte.

## Step 1: ANALYSE (lies und verstehe)

Lies die Note mit `read_file` (oder `read_document` fuer PDFs/Office-Dokumente).

Erkenne im Text:
- **Themen**: Uebergeordnete Wissensgebiete (z.B. Philosophie, KI, Projektmanagement)
- **Konzepte**: Spezifische Ideen oder Theorien (z.B. Kategorischer Imperativ, Prompt Injection)
- **Personen**: Erwaehnte oder referenzierte Personen
- **Projekte**: Referenzierte Projekte oder Initiativen
- **Organisationen**: Firmen, Institutionen, Teams

Pruefe das bestehende Frontmatter: Welche Properties sind schon gesetzt? Welche fehlen oder sind leer?

## Step 2: BESTEHENDE ENTITAETEN SUCHEN (immer zuerst!)

Fuer jede erkannte Entitaet: `semantic_search` im Vault.

**KRITISCH:** Bevorzuge IMMER bestehende Notes. Suche gruendlich bevor du neue Entitaeten vorschlaegst.

- Gibt es schon eine Note zu dieser Person/Thema/Konzept? → Verwende den exakten Dateinamen als `[[Wikilink]]`
- Gibt es aehnliche Themen die zusammengehoeren? → Nutze das bestehende Thema statt ein neues zu erstellen
- Die semantic_search zeigt auch "Related concepts (via ontology)" -- nutze diese fuer transitive Entdeckungen

**Themen-Disziplin:** Wenige starke Hub-Themen sind besser als viele schwache. Erstelle KEIN neues Thema wenn ein bestehendes passt.

## Step 3: VORSCHLAEGE PRAESENTIEREN (und STOP)

Zeige dem User alle Vorschlaege gesammelt. Warte auf Bestaetigung.

Format:
```
Vorschlaege fuer "[Note-Titel]":

**Properties:**
- Themen: [[Thema A]], [[Thema B]]
- Konzepte: [[Konzept X]]
- Personen: [[Person Y]]
- Zusammenfassung: "Ein Satz mit max 25 Woertern."
- tags: [keyword-1, keyword-2, keyword-3, ...]

**Neue Entitaeten** (noch keine Note im Vault):
- Konzept "Z" -- Stub-Note erstellen?
- Person "W" -- Stub-Note erstellen?

Moechtest du die Vorschlaege uebernehmen? (Einzelne koennen geaendert oder entfernt werden.)
```

**STOP.** Warte auf Antwort des Users.

## Step 4: AUSFUEHRUNG (nach Bestaetigung)

### 4a: Properties setzen

Nutze `update_frontmatter` fuer die Note:
- Setze nur Properties die der User bestaetigt hat
- NIEMALS bestehende Werte ueberschreiben -- nur leere Properties befuellen
- Wikilinks in Properties als Array: `["[[Thema A]]", "[[Thema B]]"]`

### 4b: Stub-Notes erstellen (wenn bestaetigt)

Fuer jede neue Entitaet: `write_file` mit passendem Inhalt.

**Stub-Note Struktur:**
```yaml
---
Zusammenfassung: "[1 Satz Erklaerung]"
[Kategorie-spezifische Properties aus dem Vault-Schema]
Kategorie:
  - [Thema/Konzept/Person/Projekt]
tags: [relevante-keywords]
Permanent: false
---
---

[2-3 Absaetze: Was ist das? Warum ist es relevant?]

## Aspekte und Teilbereiche

- [Aspekt 1]: [Kurze Erklaerung]
- [Aspekt 2]: [Kurze Erklaerung]
- [Aspekt 3]: [Kurze Erklaerung]

## Verbindungen

- Verlinkt von: [[Ausloesende Note]]
- Verwandte Konzepte: [[...]]
```

Die Stub-Note soll **inhaltlich nuetzlich** sein (Agent-Wissen + Vault-Kontext), nicht leer.
Sie ist eine Einladung zum Weiterdenken, kein fertiger Artikel.

### 4c: Vertiefen oder spaeter?

Frage fuer jede neue Stub-Note:
- **Jetzt vertiefen?** → Agent hilft beim Ausarbeiten (Quellen suchen, Aspekte vertiefen)
- **Spaeter?** → Task anlegen: "Konzept [X] vertiefen" (wenn TaskNotes-Plugin installiert)

## Quellen-spezifische Regeln

Wenn die Note eine **Quelle** ist (PDF, Webclip, Buch-Zusammenfassung):

1. **Metadaten extrahieren**: Autor, Jahr, Titel, URL/ISBN aus dem Inhalt
2. **Dateiname pruefen**: Soll dem Schema `Autor-Jahr_Titel.md` folgen
   - Wenn der aktuelle Name nicht passt: Vorschlag machen (NICHT automatisch umbenennen)
3. **Frontmatter**: Autor, Jahr, URL/ISBN in die entsprechenden Properties eintragen
4. **Zusammenfassung**: Kurz im YAML-Frontmatter (1 Satz) + ausfuehrlicher im Body

## Regeln (IMMER einhalten)

1. **NIEMALS** Properties ueberschreiben die bereits einen Wert haben
2. **IMMER** bestehende Entitaeten bevorzugen (Vault durchsuchen bevor neue erstellt werden)
3. **Zusammenfassung**: Genau 1 Satz, max 25 Woerter, in der Sprache der Note
4. **Keywords/Tags**: 5-10 Stueck, deutsch + englisch, Bindestrich-Schreibweise (max 2 Woerter verbunden)
5. **Themen**: Restriktiv -- wenige starke Hub-Themen, nicht fuer jede Nuance ein neues Thema
6. **Stub-Notes**: Inhaltlich angereichert mit Erklaerung und Aspekten, NICHT leer
7. **Thema vs. Konzept**: Wenn du eine neue Entitaet erstellen musst, unterscheide:
   - **Thema** = Wissensgebiet, Fachbereich. Man kann darin navigieren und entdecken. Beispiele: Philosophie, Agentic AI, Organisationsentwicklung
   - **Konzept** = Idee, Prinzip, Modell. Man kann es in 2-3 Saetzen erklaeren. Beispiele: Kategorischer Imperativ, MCP Protocol, Zettelkasten-Methode
   - Im Zweifel: Frage den User ob Thema oder Konzept
8. **Sprache**: Properties und Inhalte in der Sprache des bestehenden Vault
9. **Bestaetigung**: Alle Aenderungen MUESSEN vom User bestaetigt werden bevor sie geschrieben werden
