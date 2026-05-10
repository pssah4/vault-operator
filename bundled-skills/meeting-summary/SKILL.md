---
name: meeting-summary
description: Compact summary of a transcript note that stays digestible in under a minute. Strictly on the transcript, no interpretations. Sets block-IDs at key passages and links each statement in the summary discreetly via ↗ symbol to the source passage. Single-note layout (summary on top, transcript below).
trigger: meeting.*summary|meeting.*zusammenfassung|protokoll|transkript.*zusammenfassung|gespraechsprotokoll|besprechung.*notiz
source: bundled
requiredTools: [read_file]
---

# /meeting-summary -- Transkript-Zusammenfassung mit Block-Refs

## Ziel

Eine kompakte gut strukturierte Zusammenfassung der aktiven Note
(`{activeNote}`), die in maximal 1 Minute erfassbar ist. Halte dich
**streng** an die transkribierten Inhalte: **Keine Interpretationen,
keine Ergaenzungen.**

## Fokus

Pro Thema ein Gliederungspunkt:

- Themen, Thesen, Diskussionspunkte
- Was ist passiert / wurde besprochen
- Unterschiedliche Positionen und Perspektiven inkl. Argumente
- Ergebnis oder Erkenntnis
- Warum relevant (sehr knapp, dem Diskussionspunkt zugeordnet)
- Aufgaben / Todos in `- [ ]` mit Verantwortlichen

## Stil und Struktur

- Klarer, professioneller Ton -- Ziel: schneller Wiedereinstieg, die
  wichtigsten Aussagen parat haben.
- Kein reines Bullet-Point-Format -- Erklaerungen wo sinnvoll als
  kurze Saetze.
- Beginne mit Ziel, Kernaussage oder Kernergebnis (in 15 Sekunden
  erfassbar), danach wichtigste Punkte in logischer Reihenfolge, in
  thematischen Bloecken.
- Aktive Verben, kurze Hauptsaetze. Keine Fuellwoerter, keine
  Wiederholungen.
- Inhalt in ca. 1 Minute erfassbar.
- Wichtige Aussagen **fett**.
- Ueberschriften `##` und `###` zur Gliederung.
- Leerzeile zwischen Ueberschrift und Textkoerper.
- Aussagen Speakern zuordnen, wo das zweifelsfrei moeglich ist.
- Am Ende Todo-Liste mit Aufgaben aus dem Termin (sofern klar besprochen).
- Neutraler, informativer Stil.

## Frontmatter-Template (Pflicht, vor dem Schreiben)

Das Frontmatter der Meeting-Note kommt aus den Settings:
`vaultIngest.templates.meetingSummaryTemplate` (vault-relativer Pfad).

Vorgehen:

1. Setting-Wert pruefen. Wenn nicht-leer:
   - `read_file path="<setting-wert>"` -> extrahiere den Frontmatter-
     Block.
   - Felder einfuellen: `Zusammenfassung`, `Datum`, `Personen`,
     `Themen`, `Konzepte`, `Projekt`, `Quellen`, `tags`.
2. Wenn Setting leer: nutze den Inline-Default unten.

**Inline-Default (Fallback wenn Setting leer):**

```yaml
---
Zusammenfassung:
Datum:
Personen:
Themen:
Konzepte:
Notizen:
Meeting-Notizen:
Projekt:
Quellen:
Kategorie:
  - Meeting-Notiz
tags:
Permanent: false
---
```

Wenn die Active-Note bereits Frontmatter hat: nicht ueberschreiben,
sondern fehlende Felder ergaenzen. Bestehende Werte bleiben.

## Block-Ref-Konvention

Pro Aussage in der Zusammenfassung muss ein Quell-Verweis auf die
Belegstelle im Transkript stehen.

### 1. Vorbereitung -- Code-Block-Check

Wenn das Transkript in einem Code-Block (` ``` `) liegt, greifen
Block-IDs nicht. Den Code-Block-Wrapper mit User-Bestaetigung
entfernen, sonst funktioniert keine Verlinkung.

### 2. Block-IDs setzen

Pro Schluesselpassage ein system-generated `^block-N` ans Absatz-Ende
anhaengen (Leerzeichen vor dem Anker). **Eine ID pro Kernaussage**,
nicht pro Satz. Idempotent: vorhandene `^block-N`-IDs respektieren,
nicht neu nummerieren.

### 3. Inline-Link in der Zusammenfassung

Am Ende jeder Aussage (direkt nach dem letzten Satzzeichen, ein
Leerzeichen Abstand) den Block-Ref-Link setzen:

```markdown
Skills sind Markdown-Dateien... Der Agent laedt sie erst bei
Bedarf. [[#^block-7|↗]]
```

Pflicht-Form:

- **Same-Note-Ref** (Summary und Transkript in derselben Datei):
  `[[#^block-N|↗]]`
- **Cross-Note-Ref** (Summary in eigener Note): `[[Transkript#^block-N|↗]]`
- Display-Text immer **nur** `↗`, kein "Quelle", kein "[1]".
- Inline am Satzende, **nicht** auf eigener Zeile.

### 4. IDs sind stabil

Einmal gesetzte Block-IDs nicht umbenennen, sonst brechen die
Wikilinks.

## Aktionen

1. Erstelle die Zusammenfassung gemaess Fokus / Stil / Block-Ref-
   Konvention.
2. Setze Block-IDs an den Anker-Stellen im Transkript-Section der
   selben Note.
3. Fuege die Zusammenfassung als `## Zusammenfassung`-Section am
   Anfang der Datei ein (vor dem Transkript-Body).

## Pflicht

Fuehre alle Schritte ohne weitere Rueckfrage aus und stoppe erst,
wenn du fertig bist. Behalte bestehende Inhalte unveraendert bei.

Das Setzen der Block-IDs zaehlt **nicht** als Inhaltsaenderung -- die
IDs sind unsichtbar im Reading-Mode und dienen nur als Wikilink-Anker.

## Verboten

- Bestehende Inhalte loeschen.
- Transkript in der Zusammenfassung wiederholen.
- `[1]`-, `[2]`-Marker im Perplexity-Stil verwenden.
- Sprechende `^kebab-id` Block-IDs erfinden (System-generated `^block-N`).
- Zusammenfassung ohne Block-Ref-Marker ausgeben.
- Interpretationen oder Ergaenzungen ueber den Transkript-Inhalt
  hinaus.
