# Feature: Attachment-Batch-Umbenennung

> **Feature ID**: FEAT-19-06
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P1-High
> **Effort Estimate**: S

## Feature Description

Ein Skill der Attachments (PDFs, Bilder) im Vault batch-weise nach der `Autor-Jahr_Titel`
Konvention (Quellen) oder aus dem Kontext der einbettenden Note (Bilder) umbenennt.
Nutzt ein kleines, guenstiges Modell (z.B. Haiku) fuer die Namensableitung.

Der User bekommt eine Vorschlagsliste und bestaetigt einzeln oder gesammelt.
Alle eingehenden Wikilinks werden automatisch mitaktualisiert.

## Benefits Hypothesis

**Wir glauben dass** konsistente Dateinamen die Auffindbarkeit und Ordnung im Vault
dramatisch verbessern.

**Folgende messbare Outcomes liefert:**
- Inkonsistent benannte Attachments sinken von ~80% auf <20%
- Attachments sind ueber Dateinamen zuordenbar (nicht nur ueber einbettende Note)

**Wir wissen dass wir erfolgreich sind wenn:**
- Batch-Umbenennung funktioniert ohne broken Links
- User nutzt den Skill mindestens 1x/Monat

## User Stories

### Story 1: Batch-Umbenennung
**Als** Wissensarbeiter
**moechte ich** dem Agent sagen "Benenne meine Attachments um"
**um** alle kryptisch benannten Dateien auf einmal zu korrigieren

### Story 2: Einzelne Umbenennung
**Als** Wissensarbeiter
**moechte ich** auch einzelne Attachments umbenennen lassen
**um** bei neuen Dateien direkt die richtige Benennung zu bekommen

### Story 3: Bild-Benennung aus Kontext
**Als** Wissensarbeiter
**moechte ich** dass Bilder nach der Note benannt werden in der sie eingebettet sind
**um** Bilder auch ausserhalb der Note zuordnen zu koennen

### Story 4: Visuelle Bild-Erkennung
**Als** Wissensarbeiter
**moechte ich** dass der Agent bei Bildern alternativ den Bildinhalt analysiert
**um** einen aussagekraeftigen Dateinamen zu erhalten auch wenn keine einbettende Note existiert

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Umbenennung bricht keine bestehenden Links | 0 broken Links nach Umbenennung | Automatisierter Test |
| SC-02 | Vorschlaege sind sinnvoll | >80% Akzeptanzrate | User-Feedback |
| SC-03 | Batch funktioniert mit vielen Dateien | 100+ Dateien in einem Durchlauf | Performance-Test |
| SC-04 | User behaelt Kontrolle | Vorschlagsliste vor Ausfuehrung | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Namensableitung**: <2s pro Datei (Haiku-Call)
- **Batch**: Sequenziell, mit Progress-Anzeige
- **Link-Update**: Vault.rename aktualisiert alle Referenzen automatisch

### Cost
- **Modell**: Kleines/guenstiges Modell (Haiku) fuer Namensableitung
- **Token-Budget**: ~200 Tokens pro Datei (Kontext + Name)
- **Bild-Analyse**: Multimodales Modell nur wenn Kontext-Ableitung scheitert

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1**: Link-Integritaet bei Umbenennung
- **Warum ASR**: Umbenennung von Attachments muss alle eingehenden `![[Dateiname]]` und `[[Dateiname]]` Referenzen mitaktualisieren
- **Impact**: Muss Obsidians vault.rename oder FileManager.renameFile nutzen
- **Quality Attribute**: Data Integrity

### Namensableitungs-Logik

```
1. PDF-Quellen:
   → Aus Frontmatter der einbettenden Note: Autor + Jahr + Titel
   → Oder: Aus PDF-Inhalt extrahieren (Titelseite)
   → Format: Autor-Jahr_Titel.pdf

2. Bilder:
   → Primaer: Aus einbettender Note + Position im Text ableiten
   → Fallback: Visuelle Analyse des Bildinhalts (multimodal)
   → Format: Kontext-Beschreibung.png/jpg

3. Andere Attachments:
   → Aus einbettender Note ableiten
```

### Open Questions fuer Architekt
- Soll die Vorschlagsliste als Chat-Ausgabe oder als eigenes Modal praesentiert werden?
- Undo-Mechanismus: Reicht Obsidians File-Recovery oder brauchen wir ein Rename-Log?
- Wie wird der Progress bei 100+ Dateien angezeigt?

---

## Definition of Done

### Functional
- [ ] Batch-Umbenennung fuer PDFs nach `Autor-Jahr_Titel` Konvention
- [ ] Bild-Umbenennung aus Kontext der einbettenden Note
- [ ] Visuelle Bild-Analyse als Fallback
- [ ] Vorschlagsliste mit Bestaetigung (einzeln oder gesammelt)
- [ ] Alle Wikilinks werden automatisch aktualisiert
- [ ] Einzelne Umbenennung moeglich

### Quality
- [ ] 0 broken Links nach Umbenennung
- [ ] Funktioniert mit 100+ Dateien
- [ ] Obsidian Review-Bot Compliance

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] Skill-Datei (.skill.md) dokumentiert
- [ ] Backlog aktualisiert

---

## Dependencies
- **Obsidian API**: vault.rename / FileManager.renameFile fuer Link-Updates
- **FEAT-19-00 (Ingest)**: Kann im Ingest-Flow einzelne PDFs umbenennen
- **Multimodales Modell**: Fuer visuelle Bild-Analyse (optional)

## Out of Scope
- Automatische Umbenennung bei vault.on('create') -- nur explizit per Skill
- Ordner-Reorganisation (nur Dateinamen, nicht Pfade)
