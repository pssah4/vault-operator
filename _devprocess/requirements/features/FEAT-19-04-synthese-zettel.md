# Feature: Synthese → Zettel

> **Feature ID**: FEAT-19-04
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Ein neuer Button im Chat der eine Chat-Synthese als Zettel im Vault speichert.
Der Agent generiert einen vollstaendigen Zettel mit Frontmatter (Properties, Tags,
Zusammenfassung) und Verlinkungen -- unter Nutzung der Ingest-Logik (FEAT-19-00).
Der neue Zettel oeffnet sich im Editor, wo der User ihn bearbeiten oder loeschen kann.

Heute geht Denkarbeit aus Chats verloren: Wenn der Agent eine nicht-triviale Synthese
aus mehreren Quellen erstellt, existiert sie nur im Chat-Verlauf.

## Benefits Hypothesis

**Wir glauben dass** ein Synthese-Button Denkarbeit im Wissensnetz bewahrt und den
Rueckkanal von Chat zu Vault schliesst.

**Folgende messbare Outcomes liefert:**
- Wertvolle Chat-Synthesen werden dauerhaft im Vault gespeichert
- Gespeicherte Synthesen sind sofort verlinkt und auffindbar

**Wir wissen dass wir erfolgreich sind wenn:**
- User nutzt den Button mindestens 2x/Woche
- >80% der gespeicherten Zettel werden nicht sofort geloescht

## User Stories

### Story 1: Synthese speichern
**Als** Wissensarbeiter
**moechte ich** eine gute Agent-Antwort per Knopfdruck als Zettel speichern
**um** Denkarbeit nicht zu verlieren und sie spaeter wiederzufinden

### Story 2: Zettel bearbeiten
**Als** Wissensarbeiter
**moechte ich** dass der neue Zettel sich im Editor oeffnet
**um** ihn mit meinen eigenen Gedanken ergaenzen oder anpassen zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Button ist sichtbar und verstaendlich | User findet ihn ohne Erklaerung | User-Test |
| SC-02 | Generierter Zettel hat vollstaendiges Frontmatter | Alle Template-Properties befuellt | Stichprobe |
| SC-03 | Zettel ist sofort im Wissensnetz verlinkt | Backlinks und MOC-Properties gesetzt | Manueller Test |
| SC-04 | Zettel oeffnet sich im Editor | User kann sofort bearbeiten | Manueller Test |
| SC-05 | Feature ist abschaltbar | Toggle in Settings | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Generierung**: <10s vom Klick bis der Zettel im Editor offen ist
- **Token-Kosten**: ~3k Tokens pro Synthese (Ingest-Logik + Zettel-Generierung)

### Usability
- **Button-Placement**: Im Chat-Message-Bereich, nicht in der Toolbar
- **Toggle**: `enableSynthesisButton` in Settings

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Button-Placement und Chat-UI-Integration
- **Warum ASR**: Der Button muss ins bestehende Chat-Message-UI passen (neben dem "Einfuegen"-Button)
- **Impact**: UI-Komponenten-Architektur
- **Quality Attribute**: Usability

**MODERATE ASR #2**: Wiederverwendung der Ingest-Logik
- **Warum ASR**: Der Synthese-Zettel soll die gleiche Property/Link/MOC-Logik nutzen wie FEAT-19-00
- **Impact**: Ingest-Logik muss als wiederverwendbare Funktion extrahiert werden, nicht nur als Skill
- **Quality Attribute**: Maintainability

### Workflow

```
User klickt [Synthese → Zettel]
  → Agent extrahiert Kern-Synthese aus der Chat-Nachricht
  → Agent generiert Zettel:
    - Titel aus Inhalt ableiten
    - Frontmatter: Properties, Tags, Zusammenfassung (Ingest-Logik)
    - Body: Synthese-Text mit Wikilinks zu referenzierten Notes
    - Kategorie: Zettel (oder User waehlt)
  → Datei wird im Vault gespeichert
  → Note oeffnet sich im Editor
  → Ontologie-Update (FEAT-19-02)
```

### Open Questions fuer Architekt
- Soll der Button bei jeder Nachricht erscheinen oder nur bei "substantiellen" Antworten?
- Braucht es einen Zwischendialog (Titel bestaetigen, Kategorie waehlen) oder reicht direkte Generierung?
- Wie wird der Bezug zur Chat-Nachricht hergestellt (Chat-Link FEAT-07-01)?

---

## Definition of Done

### Functional
- [ ] Button im Chat sichtbar (bei Agent-Nachrichten)
- [ ] Klick generiert Zettel mit vollstaendigem Frontmatter
- [ ] Verlinkungen werden automatisch gesetzt (Ingest-Logik)
- [ ] Neuer Zettel oeffnet sich im Editor
- [ ] Toggle `enableSynthesisButton` in Settings

### Quality
- [ ] Obsidian Review-Bot Compliance
- [ ] Button verschwindet nicht bei schmaler Sidebar (→ FEAT-19-07)

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-19-00 (Ingest)**: Wiederverwendung der Property/Link/MOC-Logik
- **FEAT-19-02 (Ontologie)**: Update nach Zettel-Erstellung
- **FEAT-07-01 (Chat-Linking)**: Optional, fuer Rueckverweis zum Chat

## Out of Scope
- Diff-View vor dem Speichern (Note oeffnet sich direkt)
- Automatisches Speichern ohne Button-Klick
- Batch-Synthese (mehrere Nachrichten auf einmal)
