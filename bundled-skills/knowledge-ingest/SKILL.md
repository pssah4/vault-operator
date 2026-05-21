---
name: knowledge-ingest
description: Integrate new notes into the knowledge graph. Create PDFs as markdown source notes. Set properties, links, MOC entries. Prefer existing entities, propose new ones as stub notes.
trigger: integrier|einordne|ingest|einpflege|knowledge.*maintain|wissen.*pflege|note.*einordne|ordne.*ein|pdf.*umwandel|pdf.*markdown|quelle.*anlegen
source: bundled
requiredTools: [read_file, read_document, semantic_search, update_frontmatter, write_file, ingest_document, list_files]
---

# Knowledge Ingest

Ordne eine Note systematisch in das bestehende Wissensnetz ein.
Bei PDFs und Dokumenten: Erstelle eine vollstaendige Markdown-Repraesentation als Quellen-Note.
Befolge diese Schritte IN DER REIHENFOLGE. Ueberspringe keine Schritte.

## Step 0: QUELLE ODER NOTE? (Weiche stellen)

Bestimme was du vor dir hast:

- **PDF/Office-Dokument** (im Chat als Attachment, oder als Datei im Vault) → Gehe zu **Pfad A: Quellen-Ingest**
- **Bestehende Markdown-Note** → Gehe zu **Pfad B: Note einordnen**

---

## Pfad A: Quellen-Ingest (PDF/Dokument → Markdown-Note)

Das Ziel: Eine vollstaendige Markdown-Repraesentation der Quelle im Vault. Die PDF selbst wird NICHT im Vault gespeichert -- die Markdown-Note IST die Vault-Repraesentation.

### A1: LESEN UND VERSTEHEN

Lies das Dokument:
- Vault-Datei: `read_document`
- Chat-Attachment: Der Inhalt ist bereits im Kontext (als `<attached_document>`)

Pruefe die Attribute des `<attached_document>` Tags:
- `vault_path` → Datei liegt im Vault. Diesen Pfad als `Quelle` im Frontmatter verwenden.
- `source_path` → Datei liegt ausserhalb des Vaults (z.B. OneDrive, Downloads). Diesen Pfad als `Quelle` im Frontmatter verwenden.
- Keines von beiden → User nach dem Speicherort fragen

Extrahiere:
- **Metadaten**: Autor(en), Jahr, Titel, URL/DOI/ISBN (aus Inhalt, Kopfzeile, oder User-Angabe)
- **Struktur**: Kapitel, Abschnitte, Ueberschriften
- **Kernaussagen**: Was sind die 3-5 wichtigsten Punkte?
- **Entitaeten**: Themen, Konzepte, Personen (wie bei Note-Ingest)

### A2: BESTEHENDE ENTITAETEN SUCHEN

Fuer JEDE erkannte Entitaet: `semantic_search` im Vault.

**KRITISCH:** Bevorzuge IMMER bestehende Notes. Suche gruendlich bevor du neue Entitaeten vorschlaegst.
Wenige starke Hub-Themen sind besser als viele schwache.

### A3: VORSCHLAG PRAESENTIEREN (und STOP)

Zeige dem User:

```
Quellen-Note fuer "[Titel]":

**Dateiname:** Autor-Jahr_Titel.md
**Ordner:** [Quellen-Ordner im Vault, falls erkennbar]

**Frontmatter:**
- Autor: [Name(n)]
- Jahr: [YYYY]
- Titel: [Vollstaendiger Titel]
- Quelle: [Pfad oder URL zur Original-Datei]
- Zusammenfassung: "[1 Satz, max 25 Woerter]"
- Kategorie: Quelle
- Themen: [[Thema A]], [[Thema B]]
- Konzepte: [[Konzept X]]
- tags: [keyword-1, keyword-2, ...]

**Neue Entitaeten** (noch keine Note im Vault):
- Konzept "Z" -- Stub-Note erstellen? [JA/NEIN]
- Person "W" -- Stub-Note erstellen? [JA/NEIN]

Soll ich die Note so erstellen?
```

**STOP.** Warte auf Antwort des Users.

### A4: NOTE ERSTELLEN (nach Bestaetigung)

**PFLICHT: Nutze `ingest_document`** -- NICHT `write_file`. Nur `ingest_document` kann den vollstaendigen Originaltext anhaengen.

Du schreibst NUR den `header_content` (Frontmatter + Ueberblick + Kernaussagen). Das Tool haengt den vollstaendigen Originaltext AUTOMATISCH an -- du musst ihn NICHT selbst ausgeben.

Parameter:
- `output_path`: IMMER in `Inbox/` schreiben (z.B. `"Inbox/Webb-2026_Convergence-Outlook.md"`)
- `header_content`: Dein Frontmatter + Ueberblick (siehe unten)
- `source_path`: Wenn die PDF im Vault liegt (z.B. `"Attachements/report.pdf"`)
- `attachment_index`: Wenn die PDF als Chat-Attachment hinzugefuegt wurde (0 fuer das erste Attachment)

Der `header_content` hat diese Struktur:

```yaml
---
Zusammenfassung: "[1 Satz]"
Autor: [Name(n)]
Jahr: [YYYY]
Titel: [Vollstaendiger Titel]
Quelle: "[Pfad oder URL]"
Kategorie:
  - Quelle
Themen: ["[[Thema A]]", "[[Thema B]]"]
Konzepte: ["[[Konzept X]]"]
tags: [keyword-1, keyword-2, keyword-3]
---

## Ueberblick

[3-5 Absaetze: Zentrale These, wichtigste Erkenntnisse, Argumentation, Relevanz.
 Ermoeglicht schnellen Einstieg ohne den gesamten Text zu lesen.]

## Kernaussagen

- [Kernaussage 1]: [Kurze Erlaeuterung]
- [Kernaussage 2]: [Kurze Erlaeuterung]
- [Kernaussage 3]: [Kurze Erlaeuterung]
```

**WICHTIG:** Schreibe KEINEN `## Originaltext` Abschnitt. Das `ingest_document` Tool fuegt den vollstaendigen Originaltext automatisch an. Du musst ihn NICHT ausgeben -- das spart Tokens und umgeht Output-Limits.

### STRIKTE REGELN fuer Wikilinks im Body

1. **KEIN Wikilink ohne existierende Note oder Stub-Note.** Wenn du `[[Konzept X]]` im Text schreibst, MUSS entweder eine bestehende Note existieren ODER du erstellst eine Stub-Note dafuer in Step A5.
2. **Wikilinks NUR fuer Entitaeten** (Themen, Konzepte, Personen, Organisationen, Projekte). NICHT fuer generische Begriffe.
3. **Bestehende Notes verwenden**: Wenn `semantic_search` eine passende Note findet, verwende deren exakten Dateinamen als Wikilink.

### A5: VERNETZUNG UND STUB-NOTES (PFLICHT)

Dieser Schritt ist NICHT optional. Fuer JEDE Entitaet die im Frontmatter oder Body als Wikilink referenziert wird:

1. **Existiert bereits?** → Nichts zu tun
2. **Existiert nicht?** → Stub-Note erstellen (siehe Pfad B, Step 4b)

Das bedeutet: Wenn du 10 Konzepte im Frontmatter listest und 5 davon nicht als Notes existieren, erstellst du 5 Stub-Notes. KEINE dangling Wikilinks hinterlassen.

Abschliessend:
- Frage: "Soll ich die PDF-Datei umbenennen? Vorschlag: `Autor-Jahr_Titel.pdf`"
  (User muss das extern machen wenn die PDF nicht im Vault liegt)

---

## Pfad B: Note einordnen (bestehende Markdown-Note)

### B1: ANALYSE (lies und verstehe)

Lies die Note mit `read_file`.

Erkenne im Text:
- **Themen**: Uebergeordnete Wissensgebiete (z.B. Philosophie, KI, Projektmanagement)
- **Konzepte**: Spezifische Ideen oder Theorien (z.B. Kategorischer Imperativ, Prompt Injection)
- **Personen**: Erwaehnte oder referenzierte Personen
- **Projekte**: Referenzierte Projekte oder Initiativen
- **Organisationen**: Firmen, Institutionen, Teams

Pruefe das bestehende Frontmatter: Welche Properties sind schon gesetzt? Welche fehlen oder sind leer?

### B2: BESTEHENDE ENTITAETEN SUCHEN (immer zuerst!)

Fuer jede erkannte Entitaet: `semantic_search` im Vault.

**KRITISCH:** Bevorzuge IMMER bestehende Notes. Suche gruendlich bevor du neue Entitaeten vorschlaegst.

- Gibt es schon eine Note zu dieser Person/Thema/Konzept? → Verwende den exakten Dateinamen als `[[Wikilink]]`
- Gibt es aehnliche Themen die zusammengehoeren? → Nutze das bestehende Thema statt ein neues zu erstellen
- Die semantic_search zeigt auch "Related concepts (via ontology)" -- nutze diese fuer transitive Entdeckungen

**Themen-Disziplin:** Wenige starke Hub-Themen sind besser als viele schwache. Erstelle KEIN neues Thema wenn ein bestehendes passt.

### B3: VORSCHLAEGE PRAESENTIEREN (und STOP)

Zeige dem User alle Vorschlaege gesammelt. Warte auf Bestaetigung.

```
Vorschlaege fuer "[Note-Titel]":

**Properties:**
- Themen: [[Thema A]], [[Thema B]]
- Konzepte: [[Konzept X]]
- Personen: [[Person Y]]
- Zusammenfassung: "Ein Satz mit max 25 Woertern."
- tags: [keyword-1, keyword-2, keyword-3, ...]

**Neue Entitaeten** (noch keine Note im Vault):
- Konzept "Z" -- Stub-Note erstellen? [JA/NEIN]
- Person "W" -- Stub-Note erstellen? [JA/NEIN]

Moechtest du die Vorschlaege uebernehmen? (Einzelne koennen geaendert oder entfernt werden.)
```

**STOP.** Warte auf Antwort des Users.

### B4: AUSFUEHRUNG (nach Bestaetigung)

#### 4a: Properties setzen

Nutze `update_frontmatter` fuer die Note:
- Setze nur Properties die der User bestaetigt hat
- NIEMALS bestehende Werte ueberschreiben -- nur leere Properties befuellen
- Wikilinks in Properties als Array: `["[[Thema A]]", "[[Thema B]]"]`

#### 4b: Stub-Notes erstellen (PFLICHT fuer jede bestaetigte neue Entitaet)

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

#### 4c: Vertiefen oder spaeter?

Frage fuer jede neue Stub-Note:
- **Jetzt vertiefen?** → Agent hilft beim Ausarbeiten
- **Spaeter?** → Task anlegen (wenn TaskNotes-Plugin installiert)

---

## Regeln (IMMER einhalten)

### KRITISCHE REGELN (Verstoss = fehlerhafter Ingest)

1. **Quellen-Ingest MUSS `ingest_document` nutzen** -- NIEMALS `write_file` fuer Pfad A. Nur `ingest_document` haengt den Originaltext an.
2. **Neue Notes IMMER nach `Inbox/`** -- NICHT nach `Notes/`. Der User sortiert Notes selbst von Inbox nach Notes.
3. **KEINE bestehenden Notes verschieben** -- NIEMALS `move_file` waehrend eines Ingest. Notes dort lassen wo sie sind.
4. **KEINE bestehenden Notes inhaltlich aendern** -- Nur Backlinks/Callouts zu neuen Quellen-Notes ergaenzen (via `edit_file`), niemals den Kern-Inhalt veraendern.
5. **KEINE dangling Wikilinks** -- Jeder `[[Wikilink]]` im Body oder Frontmatter MUSS auf eine existierende Note zeigen. Wenn die Note nicht existiert, Stub-Note erstellen oder den Wikilink weglassen.
6. **KEIN PDF-Embed als Ersatz** -- NIEMALS `![[datei.pdf]]` statt Originaltext verwenden.

### ALLGEMEINE REGELN

7. **NIEMALS** Properties ueberschreiben die bereits einen Wert haben
8. **IMMER** bestehende Entitaeten bevorzugen (Vault durchsuchen bevor neue erstellt werden)
9. **Zusammenfassung**: Genau 1 Satz, max 25 Woerter, in der Sprache der Note
10. **Keywords/Tags**: 5-10 Stueck, deutsch + englisch, Bindestrich-Schreibweise (max 2 Woerter verbunden)
11. **Themen**: Restriktiv -- wenige starke Hub-Themen, nicht fuer jede Nuance ein neues Thema
12. **Stub-Notes**: Inhaltlich angereichert mit Erklaerung und Aspekten, NICHT leer. Auch Stub-Notes nach `Inbox/`.
13. **Thema vs. Konzept**: Wenn du eine neue Entitaet erstellen musst, unterscheide:
    - **Thema** = Wissensgebiet, Fachbereich. Man kann darin navigieren und entdecken. Beispiele: Philosophie, Agentic AI, Organisationsentwicklung
    - **Konzept** = Idee, Prinzip, Modell. Man kann es in 2-3 Saetzen erklaeren. Beispiele: Kategorischer Imperativ, MCP Protocol, Zettelkasten-Methode
    - Im Zweifel: Frage den User ob Thema oder Konzept
14. **Sprache**: Properties und Inhalte in der Sprache des bestehenden Vault
15. **Bestaetigung**: Alle Aenderungen MUESSEN vom User bestaetigt werden bevor sie geschrieben werden
16. **Kategorie-Property**: Den im Vault verwendeten Property-Namen nutzen (z.B. "Kategorie", "Category", "Type"). Beim Quellen-Ingest immer den Wert "Quelle" (bzw. "Source" in englischen Vaults) setzen
17. **Frontmatter sauber halten**: Genau ein `---` am Anfang, genau ein `---` am Ende. KEIN doppelter Separator. Keine leeren Properties ohne Wert (lieber weglassen als `ISBN:` ohne Wert).
