---
name: knowledge-rename
description: Batch-Umbenennung von Attachments (PDFs, Bilder) nach Konventionen. Autor-Jahr_Titel fuer Quellen, Kontext-basiert fuer Bilder.
trigger: umbenennen|rename|dateiname|attachment.*name|benenne.*um|name.*korrig
source: bundled
requiredTools: [list_files, read_file, read_document, semantic_search, move_file]
---

# Attachment-Umbenennung

Benenne Attachments (PDFs, Bilder) nach den Vault-Konventionen um.
Alle Wikilinks werden automatisch aktualisiert (Obsidians vault.rename).

## Namenskonventionen

### Quellen-Dateien (PDFs, Office-Dokumente)
Schema: `Autor-Jahr_Titel.ext`
- Autor: Nachname des Autors
- Jahr: Vierstellig
- Titel: Kurztitel, Woerter mit Bindestrich verbunden
- Beispiel: `Ahrens-2017_Das-Zettelkasten-Prinzip.pdf`

### Bilder
Schema: `Kontext-Beschreibung.ext`
- Primaer: Aus der einbettenden Note ableiten (Titel + Position)
- Fallback: Bildinhalt visuell beschreiben (multimodales Modell)
- Beispiel: `Agentic-AI-Architektur-Diagramm.png`

## Workflow

### Einzelne Datei umbenennen
1. User sagt "Benenne diese Datei um" (mit aktiver Note oder Attachment)
2. Lies die Datei oder die einbettende Note
3. Leite den korrekten Namen ab
4. Schlage den neuen Namen vor
5. Nach Bestaetigung: `move_file` (aktualisiert alle Wikilinks automatisch)

### Batch-Umbenennung
1. User sagt "Benenne meine Attachments um"
2. `list_files` im Attachments-Ordner
3. Fuer jede Datei mit kryptischem Namen:
   a) Ist sie in einer Note eingebettet? → Name aus Kontext ableiten
   b) Ist es ein PDF? → Autor/Jahr/Titel aus Inhalt extrahieren
   c) Ist es ein Bild? → Name aus einbettender Note oder visuell
4. Zeige Vorschlagsliste: Alt → Neu
5. User bestaetigt (einzeln oder gesammelt)
6. `move_file` fuer jede Umbenennung

## Regeln
- IMMER den User fragen bevor umbenannt wird (Vorschlagsliste zeigen)
- NIEMALS Dateien loeschen oder verschieben (nur umbenennen)
- Obsidians `move_file` nutzen (aktualisiert Wikilinks automatisch)
- Sonderzeichen vermeiden: kein ?, !, /, \, *, ", <, >
- Umlaute sind erlaubt (Obsidian-kompatibel)
- Leerzeichen durch Bindestriche ersetzen
