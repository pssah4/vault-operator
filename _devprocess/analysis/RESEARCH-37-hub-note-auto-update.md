---
id: RESEARCH-37
title: Hub-Note Auto-Update -- Design-Memo
date: 2026-05-31
status: Draft (User-Entscheidung ausstehend)
epic-refs: [EPIC-19]
relates-to: [knowledge-ingest, ingest, ingest-deep, TopHubBlockGenerator, ImplicitConnectionService]
---

# Hub-Note Auto-Update -- Design-Memo

## Anlass

Live-Frage am 2026-05-31: "Wie werden aktuell die Bases und Backlinks in
den Themen- und Konzept-Hub-Notes regelmaessig und automatisch
aktualisiert? Ich habe den Eindruck, dass das aktuell nicht geschieht."

Antwort: Eindruck stimmt. Hub-Notes bekommen aktuell keinen
sichtbaren Auto-Update des Markdown-Bodys. Was es gibt, ist alles
intern oder Obsidian-built-in:

| Mechanismus | Wirkung | Sichtbarkeit |
|---|---|---|
| Obsidian-natives Backlinks-Panel | Listet alle Notes mit `[[Hub]]` | Sidebar, **nicht im Body** der Hub-Note |
| TopHubBlockGenerator | Sammelt Top-30 Hubs nach incoming-edges in einen 3k-Token-Block | System-Prompt (KV-Cache), unsichtbar fuer User |
| ImplicitConnectionService | Cosine-Similarity > 0.7 -> implicit_edges-Tabelle | Nur in KnowledgeDB, nie im Markdown |
| `create_base` / `update_base` (Agent-Tool) | Base manuell erstellt | Nur on-demand, kein periodischer Refresh |

Hub-Note `Themen/Agentic AI.md` weiss nicht von alleine, dass eine
neue Quellen-Note in der Inbox sie als `Themen: [[Agentic AI]]`
referenziert. Sie bleibt syntaktisch und visuell unveraendert; nur
das Obsidian-Backlinks-Panel listet die neue Referenz.

## Was gemeint ist mit "Hub-Aktualisierung"

Vier Auslegungen sind moeglich. Wir muessen wissen, welche der User
wirklich will, bevor wir Code schreiben.

1. **Body-Liste in der Hub-Note**: ein `## Eingehende Notes`-Block
   im Markdown-Body der Hub-Note, der nach jedem Ingest die neuen
   Wikilinks anhaengt. Sichtbar im Reading-Mode, persistiert im
   Markdown, ueberlebt Plugin-Deaktivierung.

2. **Companion-Base pro Hub**: pro Hub-Note eine `.base`-Datei mit
   einer Query wie `Themen: contains "[[Agentic AI]]"`. Obsidian
   rendert die Liste zur Laufzeit, nichts wird ins Markdown
   geschrieben.

3. **Hub-Note-Resummary**: nicht nur die Liste, sondern ein
   LLM-erzeugter Update-Block ("Was ist seit dem letzten Refresh
   in diesem Hub passiert"). Token-teuer, lesbar.

4. **Index-Note**: eine globale Note `Inbox/Hub-Index.md` die alle
   Hubs + Counts auflistet, nicht jede Hub-Note einzeln aktualisiert.

Die folgenden Optionen decken die vier Auslegungen in
unterschiedlichen Kombinationen ab.

## Optionen

### Option A -- Companion-Base pro Hub (push)

Beim Anlegen einer Hub-Note `Themen/Agentic AI.md` legt der Skill
zusaetzlich `Themen/Agentic AI.base` an. Inhalt analog zur Themen-
Indizierung in Obsidian-1.9+ Bases: filtert alle Notes mit
`Themen: contains "[[Agentic AI]]"`. Sortierung nach Datum.

Vorteile.
- Kein Markdown-Update noetig. Liste rendert sich zur Laufzeit aus
  Obsidian's Property-Index.
- Konsistent: Loeschen einer Quellen-Note entfernt sie sofort aus
  der Liste.
- Skill-only Aenderung (knowledge-ingest, ingest, ingest-deep), kein
  Plugin-Code.

Nachteile.
- Bases sind Obsidian-1.7+ (Insider-Build noch). Nutzer mit
  aelteren Obsidian-Versionen sehen nichts.
- Die Liste lebt im Base-Viewer, nicht im Reading-Mode der Hub-Note.
  Lesbarkeit haengt von Obsidian-UI ab.
- Eine Datei mehr pro Hub. Aufrauemen wenn die Hub-Note umbenannt
  wird, geht nicht automatisch (Rename-Cascade braucht Plugin-Code).

Aufwand. Skill-Aenderung in drei Skills + eine Stub-Base-Template-
Datei. Geschaetzt: 1 Tag, kein Plugin-Code, keine Tests am Plugin.

### Option B -- Markdown-Body-Block per Skill (push)

Beim Anlegen einer Quellen-/Konzept-Note ergaenzt der Skill ueber
`edit_file` einen `## Eingehende Notes`-Block in den referenzierten
Hub-Notes. Pro Hub eine zusaetzliche Zeile mit Wikilink + Datum.

Vorteile.
- Sichtbar im Reading-Mode, ueberlebt Plugin-Deaktivierung.
- Funktioniert auf jeder Obsidian-Version.
- Kein Plugin-Code, nur Skill-Logik.

Nachteile.
- Loeschen oder Umbenennen einer Quellen-Note bricht die Liste
  (dangling Wikilinks).
- Skill muss `edit_file` auf der Hub-Note machen -- das verstoesst
  gegen das aktuelle Verbot "Skill aendert keine bestehenden Notes
  inhaltlich" (Regel 4 in knowledge-ingest).
- Bei Batch-Ingest bricht die Idempotenz, wenn die gleiche Quelle
  zweimal verarbeitet wird (Doppelzeile).

Aufwand. Skill-Aenderung in drei Skills + idempotente Append-Logik
(vorher pruefen ob die Zeile schon drin ist). Geschaetzt: 2 Tage,
kein Plugin-Code, viele Edge-Cases.

### Option C -- Periodischer Plugin-Job (pull)

Neuer Job in `Stufe3PeriodicJob.ts` analog zum bestehenden
TopHubBlockGenerator: scant alle Notes mit `Kategorie: Thema` oder
`Kategorie: Konzept`, ermittelt eingehende Wikilinks aus der
`edges`-Tabelle, schreibt einen `## Eingehende Notes`-Block ins
Markdown der Hub-Note. Tagliche Cadence, idempotent (vorhandenen
Block ersetzen, nicht anhaengen).

Vorteile.
- Selbst-heilend: Umbenennungen, Loeschungen, neue Notes alle
  einbezogen, ohne dass der Skill etwas tun muss.
- Konsistent ueber den ganzen Vault, nicht abhaengig davon ob der
  Nutzer den Skill verwendet hat.
- Sichtbar im Reading-Mode, ueberlebt Plugin-Deaktivierung als
  letzter Snapshot.

Nachteile.
- Plugin-Code-Aenderung mit neuen Tests und einem neuen
  Settings-Eintrag (Cadence, ein/aus).
- Schreibt regelmaessig ins Markdown der Hub-Note -- haendische
  Aenderungen unterhalb des Blocks bleiben unangetastet, aber
  Vault-Sync-User sehen daily Diffs.
- Sehr nahe am Roo-Memory-Bank-Konzept; semantisch erfordert es
  einen klaren Block-Marker (`<!-- vault-operator:hub-list start -->`)
  damit der Job nicht User-Inhalt ueberschreibt.

Aufwand. Neuer Service `HubBodyRefreshJob`, +Settings, +Tests,
+Migration der Block-Marker bei Bestandsvaults. Geschaetzt: 4-5
Tage.

### Option D -- Index-Note statt Hub-Note-Update

Eine globale Note `Themen/00 Hub-Index.md` mit allen Hubs +
incoming-counts + Top-5-Referenzen pro Hub. Wird periodisch oder
beim Ingest geschrieben. Hub-Note selbst bleibt unangetastet.

Vorteile.
- Eine Datei statt N Updates. Diff-rauschen minimal.
- Hub-Notes bleiben User-Eigentum, kein Block-Marker-Konflikt.
- Sehr billig zu implementieren (Option A's Base-Variante reicht
  auch hier, alternativ ein Plugin-Job).

Nachteile.
- Die Information ist nicht in der Hub-Note. Wer in der Hub-Note
  blaettert (z.B. via Wikilink-Klick), sieht weiterhin nichts vom
  Aktualisierungsstand des Themas.
- Loest die ursprueengliche Frage des Users nur teilweise.

Aufwand. Skill-Variante: 1 Tag. Plugin-Job-Variante: 2 Tage.

## Trade-off-Vergleich

| Kriterium | A (Base pro Hub) | B (Skill-edit) | C (Plugin-Job) | D (Index-Note) |
|---|---|---|---|---|
| Sichtbar im Reading-Mode | nein | ja | ja | je nach Implementierung |
| Selbst-heilend (Delete/Rename) | ja | nein | ja | ja |
| Plugin-Code-Aenderung | nein | nein | ja | optional |
| Obsidian-Version-Abhaengigkeit | 1.7+ | egal | egal | egal |
| Vault-Sync-Diffrauschen | keins | bei jedem Ingest | taeglich | minimal |
| Skill-Regel "Hub-Note nicht aendern" | unverletzt | verletzt | umstaendlich | unverletzt |
| Aufwand | 1 Tag | 2 Tage | 4-5 Tage | 1-2 Tage |
| Token-Kosten Ingest | unveraendert | +1 edit_file pro Hub | unveraendert | unveraendert |

## Empfehlung

**Option A (Companion-Base pro Hub) als Phase 1**, kombiniert mit
**Option D (Index-Note)** als Phase 2. Beide ohne Plugin-Code.

Begruendung. Option A nutzt Obsidian's native Property-Indizierung,
ist immer aktuell, und verstoesst nicht gegen die Skill-Regel "keine
fremden Notes inhaltlich aendern". Der einzige echte Nachteil ist
Obsidian-Version-Abhaengigkeit -- akzeptabel, da der Plugin-Stack
ohnehin bereits 1.8.7 als minAppVersion forderte (FIX-04-03-09
Eskalation).

Option D als Phase 2 deckt den "Drauf-Klick"-Pfad ab: User klickt
auf einen Hub-Wikilink, landet auf der Hub-Note, dort steht ein
kurzer Verweis `[Hub-Index](Themen/00%20Hub-Index.md)` der eine
Uebersicht zeigt. Index-Note wird periodisch oder beim Ingest
aktualisiert.

Option C (Plugin-Job) waere die "perfekte" Loesung, kostet aber 4-5
Tage Plugin-Arbeit. Wenn Phase 1+2 nicht reichen, kommen wir darauf
zurueck. Nicht jetzt.

Option B (Skill-edit) lehnen wir aus zwei Gruenden ab: (a) verletzt
Regel 4 von knowledge-ingest (keine fremden Notes inhaltlich
aendern), (b) nicht selbst-heilend bei Delete/Rename.

## Skill-Mechanik bei Empfehlung A+D

Bei jedem neuen Hub (Kategorie: Thema oder Kategorie: Konzept) im
knowledge-ingest-Skill (Step A5 oder B4):

1. Pruefe ob `<Hub-Path>.base` schon existiert. Wenn ja: nichts tun.
2. Wenn nein: schreibe `<Hub-Path>.base` mit Stub-Inhalt (siehe
   unten).
3. Bei der Quellen-/Konzept-Note selbst: keine Aenderung am
   bisherigen Verhalten.

Base-Template fuer Themen-Hub (knowledge-ingest extrahiert
Property-Name aus dem Hub-Path):

```yaml
filters:
  and:
    - "Themen.contains(this.file.link)"
sort:
  - property: file.mtime
    direction: desc
columns:
  - file.link
  - Zusammenfassung
  - file.mtime
```

Index-Note bleibt vorerst manuell. Phase-2-Konzept kommt nach
Erfahrung mit Phase 1.

## Offene Fragen (User-Entscheidung)

1. Ist Option A+D als Phase-1+2-Plan akzeptabel, oder gibt es ein
   konkretes Use-Case der Option C oder B braucht?
2. Sollen Companion-Bases neben der Hub-Note liegen (z.B.
   `Themen/Agentic AI.base`) oder in einem eigenen Ordner
   (`_bases/Themen/Agentic AI.base`)? Letzteres haelt den Themen-
   Ordner sauber.
3. Welcher Property-Name traegt die Liste, `Themen.contains` oder
   `Konzepte.contains`? Pro Hub-Kategorie genau ein Filter, oder
   beide UND-verknuepft?
4. Soll der Base-Filter auch transitive Beziehungen einbeziehen
   (z.B. Konzept zaehlt zu allen Themen, in denen es vorkommt)?
   Pragmatisch: nein, in Phase 1 nur direkter Property-Hit.

## Naechste Schritte

- User-Antwort zur Option-Wahl und den offenen Fragen
- Bei A+D: FEAT-19-XX in EPIC-19 anlegen, Spec schreiben,
  knowledge-ingest und ingest-deep um die Base-Anlage erweitern
- Bei B oder C: separate Spezifikation mit Plugin-Code-Plan

Solange diese Antworten ausstehen, ist Hub-Auto-Update **nicht** in
v2.12.8. Die Skill-Regel zur Themen/Konzepte-Property-Disziplin
(FIX-Equivalent in den drei Skills) bleibt unabhaengig in v2.12.8.
