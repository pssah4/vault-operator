# Feature: Chat UI Polish

> **Feature ID**: FEAT-19-07
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P2-Medium
> **Effort Estimate**: S

## Feature Description

UI-Verbesserungen fuer die Chat-Sidebar: Button-Konsolidierung, einheitliches
Kontext-Hinzufuegen, Minimum-Breite und korrekte Menue-Richtung. Behebt bestehende
Layout-Probleme und schafft Platz fuer den Synthese-Button (FEAT-19-04).

## Benefits Hypothesis

**Wir glauben dass** eine aufgeraeumte Chat-UI die Bedienbarkeit verbessert und
Layout-Bugs beseitigt.

**Folgende messbare Outcomes liefert:**
- Weniger Buttons in der Hauptleiste (3 statt 5+)
- Keine abgeschnittenen UI-Elemente bei schmaler Sidebar

**Wir wissen dass wir erfolgreich sind wenn:**
- Kein Button verschwindet bei minimaler Sidebar-Breite
- Alle Menues sind vollstaendig lesbar

## User Stories

### Story 1: Taschenmesser konsolidieren
**Als** Wissensarbeiter
**moechte ich** Tools & Skills ueber das "..." Menue erreichen
**um** weniger Buttons in der Chat-Leiste zu haben

### Story 2: Kontext einheitlich hinzufuegen
**Als** Wissensarbeiter
**moechte ich** Dateien und Vault-Notes ueber einen einzigen "+" Button hinzufuegen
**um** nicht zwischen verschiedenen Upload-Mechanismen wechseln zu muessen

### Story 3: Responsive Sidebar
**Als** Wissensarbeiter
**moechte ich** dass die Sidebar nie so schmal wird dass Buttons verschwinden
**um** immer alle Aktionen ausfuehren zu koennen

### Story 4: Lesbare Menues
**Als** Wissensarbeiter
**moechte ich** dass alle Kontext-Menues (Mode, Model, Tools) nach oben oeffnen und vollstaendig sichtbar sind
**um** Optionen lesen zu koennen ohne zu scrollen oder die Sidebar zu vergroessern

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Buttons sind bei minimaler Sidebar-Breite sichtbar | 100% der Buttons immer sichtbar | Test bei verschiedenen Breiten |
| SC-02 | Menues sind vollstaendig lesbar | Kein Menue wird abgeschnitten | Visueller Test |
| SC-03 | "+" Button vereinheitlicht Kontext-Hinzufuegen | Upload + Vault-Auswahl in einem Flow | Manueller Test |
| SC-04 | Tools & Skills erreichbar ueber "..." Menue | Untermenue klappt korrekt auf | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Usability
- **Minimum Sidebar-Breite**: CSS min-width das alle Buttons garantiert
- **Menue-Richtung**: Dropdowns/Popups immer nach oben (bottom-anchor)
- **Sub-Menue**: Tools & Skills als Flyout nach rechts im "..." Menue
- **Overflow**: Nie horizontalen Overflow in der Button-Leiste

---

## Architecture Considerations

### UI-Aenderungen im Detail

**1. Taschenmesser → "..." Menue:**
```
Vorher:  [Mode] [Model] [Taschenmesser] [Attach] [Send]
Nachher: [Mode] [Model] [+] [...] [Send]

"..." Menue:
├─ Tools →  (Flyout mit Tool-Liste)
├─ Skills → (Flyout mit Skill-Liste)
└─ Weitere Optionen...
```

**2. "+" Button:**
```
[+] klicken:
├─ Datei hochladen (Bild, PDF, etc.)
└─ Note aus Vault waehlen (Vault-Picker)
```

**3. Minimum-Breite:**
- CSS `min-width` auf Sidebar-Container
- Buttons wrappen nie, werden nie hidden

**4. Menue-Richtung:**
- Alle Dropdowns: `position: absolute; bottom: 100%`
- Sub-Menues: `position: absolute; left: 100%` mit Viewport-Clipping-Check

### Open Questions fuer Architekt
- Soll der Mode/Model-Selector auch ins "..." Menue wandern oder bleibt er in der Hauptleiste?
- Gibt es bestehende Obsidian-UI-Patterns fuer Flyout-Menues die wir nutzen sollten?
- Minimum-Breite: Fester Wert (z.B. 320px) oder dynamisch basierend auf Button-Anzahl?

---

## Definition of Done

### Functional
- [ ] Taschenmesser entfernt, Tools & Skills in "..." Menue
- [ ] "+" Button mit Datei-Upload und Vault-Note-Auswahl
- [ ] Minimum-Breite verhindert Button-Verschwinden
- [ ] Alle Menues oeffnen nach oben
- [ ] Sub-Menues vollstaendig sichtbar (kein Viewport-Clipping)

### Quality
- [ ] Obsidian Review-Bot Compliance (CSS-Klassen, kein inline style)
- [ ] Getestet bei verschiedenen Sidebar-Breiten
- [ ] Kein Bruch bestehender Funktionalitaet

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-19-04 (Synthese)**: Der neue Button braucht Platz in der aufgeraeumten Leiste
- **Bestehende UI-Komponenten**: SidebarView, ChatInput, ToolPicker

## Out of Scope
- Komplettes UI-Redesign
- Theming / Dark Mode Anpassungen
- Mobile-spezifische UI (spaeter)
