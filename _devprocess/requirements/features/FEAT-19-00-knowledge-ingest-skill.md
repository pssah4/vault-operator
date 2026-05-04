# Feature: Knowledge Ingest Skill

> **Feature ID**: FEAT-19-00
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Ein Skill der den Agent anleitet, neue Dokumente (Notes, PDFs, Webclipper-Artikel)
aktiv in die bestehende Vault-Struktur einzuordnen. Der Agent liest die Note, erkennt
Entitaeten, sucht bestehende Zuordnungen im Vault und schlaegt Properties, Links und
MOC-Eintraege vor. Bei Bedarf erstellt er inhaltlich angereicherte Stub-Notes fuer
neue Entitaeten.

Heute passiert bei neuen Dateien nur passives Indexieren (Vektoren + Graph-Extraktion).
Der Ingest-Skill schliesst die Luecke zwischen "Datei ist suchbar" und "Datei ist
vollstaendig in mein Wissens-Netzwerk integriert".

## Benefits Hypothesis

**Wir glauben dass** der Knowledge Ingest Skill das manuelle Befuellen von MOC-Properties
automatisiert und die Einordnungszeit pro Note drastisch reduziert.

**Folgende messbare Outcomes liefert:**
- Time-to-integrate sinkt von 5-10 Min auf <1 Min pro Note
- Property-Vollstaendigkeit steigt von ~30% auf >80%

**Wir wissen dass wir erfolgreich sind wenn:**
- User nutzt den Skill mindestens 3x/Woche
- Vorschlag-Akzeptanzrate liegt ueber 70%

## User Stories

### Story 1: Note einordnen
**Als** Wissensarbeiter
**moechte ich** dem Agent sagen "Integriere diese Note"
**um** die Note vollstaendig mit Properties, Links und MOC-Eintraegen zu versehen ohne alles manuell eingeben zu muessen

### Story 2: Neue Entitaet entdecken
**Als** Wissensarbeiter
**moechte ich** dass der Agent erkennt wenn ein Konzept/Thema/Person im Text vorkommt das noch keine eigene Note hat
**um** entscheiden zu koennen ob ich diese Entitaet jetzt vertiefen oder als Task fuer spaeter anlegen will

### Story 3: Bestehende Zuordnung bevorzugen
**Als** Wissensarbeiter
**moechte ich** dass der Agent zuerst bestehende Themen und Konzepte im Vault sucht statt neue zu erstellen
**um** mein Wissensnetz mit wenigen starken Hub-Themen zu pflegen statt es mit Duplikaten zu fragmentieren

### Story 4: Quellen-Ingest
**Als** Wissensarbeiter
**moechte ich** dass der Agent bei PDFs die Properties (Autor, Jahr, Titel) extrahiert und den Dateinamen korrigiert
**um** meine Quellen nach der `Autor-Jahr_Titel` Konvention zu benennen

### Story 5: Zusammenfassung und Tags
**Als** Wissensarbeiter
**moechte ich** dass der Agent eine Zusammenfassung (1 Satz, max 25 Woerter) und 5-10 Keywords generiert
**um** konsistente Metadaten im Frontmatter zu haben ohne sie manuell schreiben zu muessen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Neue Notes werden vollstaendig eingeordnet | >80% der Properties befuellt | Stichproben-Vergleich vor/nach |
| SC-02 | Bestehende Entitaeten werden bevorzugt | <20% der Vorschlaege sind neue Entitaeten | Log-Analyse der Ingest-Aktionen |
| SC-03 | User behaelt Kontrolle ueber sein Wissensnetz | 100% der Aenderungen benoetigen Bestaetigung | Manueller Test |
| SC-04 | Stub-Notes sind inhaltlich nuetzlich | User akzeptiert >60% der Stubs ohne groessere Aenderung | User-Feedback |
| SC-05 | Quellen erhalten korrekte Metadaten | Autor, Jahr, Titel korrekt extrahiert | Test mit 10 verschiedenen PDFs |
| SC-06 | Einordnung ist schnell | <1 Min pro Note (Agent-Laufzeit) | Zeitmessung |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Ingest-Laufzeit**: <30s pro Note (LLM-Call + Vault-Queries)
- **Token-Verbrauch**: ~4k Tokens pro Ingest (Input + Output)

### Security
- **Vault-Integritaet**: Kein Schreiben ohne User-Bestaetigung
- **Template-Pfad**: Kein Path-Traversal bei Template-Lesen

### Scalability
- **Vault-Groesse**: Funktioniert mit 1000+ Notes
- **Batch**: Sequenzieller Ingest mehrerer Notes moeglich

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Schema-Erkennung aus Templates
- **Warum ASR**: Der Skill muss mit beliebigen User-Templates arbeiten, nicht nur mit einem hardcodierten Schema
- **Impact**: Bestimmt wie der Skill Properties erkennt und vorschlaegt
- **Quality Attribute**: Flexibility

**CRITICAL ASR #2**: Entitaets-Zuordnung (bestehend vs. neu)
- **Warum ASR**: Die Qualitaet der Vorschlaege haengt davon ab wie gut der Agent bestehende Entitaeten findet
- **Impact**: Bestimmt ob Ontologie-Tabelle (FEAT-19-02) vor oder mit Ingest implementiert wird
- **Quality Attribute**: Correctness

**MODERATE ASR #3**: Stub-Note-Generierung
- **Warum ASR**: Stubs sollen inhaltlich angereichert sein (Agent-Wissen + Vault-Kontext), nicht leer
- **Impact**: LLM-Prompt-Design, Token-Budget pro Stub
- **Quality Attribute**: Usefulness

### Constraints
- **Skill-basiert**: Keine neuen Tools noetig -- bestehende read_file, write_file, semantic_search reichen
- **Template-gesteuert**: Properties kommen aus User-Templates (FEAT-19-03), nicht aus Settings
- **Bestaetigung**: Trockenlauf oder Batch-Bestaetigung, nie still schreiben

### Open Questions fuer Architekt
- Soll der Skill die Ontologie-Tabelle (FEAT-19-02) direkt befuellen oder einen separaten Schritt triggern?
- Wie wird das Frontmatter-Schema aus den Templates geparst (statisch beim Onboarding oder dynamisch pro Ingest)?
- Task-Anlage bei "spaeter": Direkter TaskNotes-API-Aufruf oder Obsidian-URI?

---

## Definition of Done

### Functional
- [ ] Skill erkennt Themen, Konzepte, Personen, Projekte aus Note-Text
- [ ] Skill findet bestehende Entitaeten via semantic_search + Ontologie
- [ ] Skill schlaegt Properties vor die zum User-Schema passen
- [ ] Stub-Notes werden mit Inhalt erstellt (nicht leer)
- [ ] Dialog: Jetzt vertiefen oder spaeter (Task anlegen)
- [ ] Zusammenfassung + Tags werden generiert (Format aus Settings-Prompt)
- [ ] Quellen-PDFs: Autor/Jahr/Titel extrahiert, Dateiname korrigiert

### Quality
- [ ] Funktioniert mit verschiedenen Template-Schemata (nicht nur Sebastians)
- [ ] Keine bestehenden Frontmatter-Properties ueberschrieben
- [ ] Obsidian Review-Bot Compliance

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Skill-Datei (.skill.md) dokumentiert
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-19-02 (Ontologie)**: Fuer transitive Entitaets-Zuordnung (kann ohne starten, wird besser mit)
- **FEAT-19-03 (Onboarding)**: Fuer Template-Schema-Erkennung (Fallback: mocPropertyNames aus Settings)
- **FEAT-19-05 (OCR)**: Fuer PDF-Ingest mit gescannten Dokumenten (optional)

## Assumptions
- SemanticIndex und GraphStore sind aktuell (EPIC-15 deployed)
- User hat mindestens ein Template mit Frontmatter-Properties
- TaskNotes-Plugin ist installiert fuer "spaeter"-Flow (graceful degradation wenn nicht)

## Out of Scope
- Automatischer Ingest bei vault.on('create') -- nur explizit per User-Trigger
- Content-Generierung ueber Stubs hinaus
- Aenderungen an SemanticIndex oder GraphExtractor
