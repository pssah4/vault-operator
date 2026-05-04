# Feature: Pre-Creation Dialog & Template-Upload

> **Feature ID**: FEAT-11-02
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P0-Critical
> **Effort Estimate**: S

## Feature Description

Bevor der Agent eine PPTX-Praesentation erstellt, fragt er den User ob eine Vorlage vorhanden ist. Der User kann dann eine PPTX-Datei ueber die Bueroklammer im Chat hochladen oder einen Vault-Pfad angeben. Alternativ wird ein Default-Template verwendet.

## User Flow

```
1. User: "Erstelle eine Praesentation ueber X"
2. Agent prüft: Hat der User bereits ein Theme/Template in Memory?
   [JA] -> Nutzt gespeichertes Template/Theme automatisch
   [NEIN] -> Weiter zu Schritt 3
3. Agent fragt via ask_followup_question:
   "Hast du eine PowerPoint-Vorlage, deren Design ich verwenden soll?
    Du kannst eine PPTX-Datei ueber die Bueroklammer unten links
    in den Chat laden. Oder ich erstelle die Praesentation mit
    einem schlichten Standard-Design."
   Optionen: ["Ich lade jetzt eine Vorlage hoch",
              "Ohne Vorlage, Standard-Design verwenden"]
4a. User waehlt "Ich lade jetzt eine Vorlage hoch":
    -> Agent wartet auf naechste Nachricht mit PPTX-Attachment
    -> Attachment wird als Template verwendet (binaer, nicht nur Design)
4b. User waehlt "Standard-Design":
    -> Agent nutzt Default-Template (executive.pptx)
4c. User nennt Vault-Pfad: "Nutze Templates/firma.pptx"
    -> Agent liest PPTX aus Vault und nutzt sie als Template
5. Agent erstellt Praesentation mit gewaehltem Template
```

## Implementation

### Prompt-Section: officeBaseRules

Konditionale Prompt-Section (nur aktiv wenn edit-Toolgroup verfuegbar):
- Instruiert den Agent zur Template-Nachfrage
- Definiert die Frage-Formulierung und Optionen
- Erklaert wie Attachments als Templates verarbeitet werden
- Erklaert wann die Frage uebersprungen wird (Template bereits in Memory oder im selben Turn bereitgestellt)

### Template aus Attachment

Wenn der User eine PPTX per Bueroklammer hochlaedt:
1. AttachmentHandler erkennt `.pptx`-Datei
2. Binaerdaten werden als Template an CreatePptxTool durchgereicht
3. Zusaetzlich wird Theme extrahiert und als `<design_theme>` Block im Chat angezeigt (fuer Kontext)

### Template aus Vault

Wenn der User einen Vault-Pfad nennt:
1. Agent nutzt `read_file` um PPTX-Binaerdaten zu lesen (oder neues `load_template`-Tool)
2. Binaerdaten werden als Template an CreatePptxTool durchgereicht

## Success Criteria

| ID | Criterion | Target |
|----|-----------|--------|
| SC-01 | Agent fragt vor PPTX-Erstellung nach Template wenn kein Memory vorhanden | 100% |
| SC-02 | Agent ueberspringt Frage wenn Template bereits in Memory oder im selben Turn | 100% |
| SC-03 | PPTX-Attachment wird als Template erkannt und verwendet | Funktional |
| SC-04 | Vault-Pfad zu PPTX wird als Template geladen | Funktional |

## Definition of Done

- [ ] officeBaseRules Prompt-Section implementiert und konditional geladen
- [ ] Agent fragt zuverlaessig nach Template vor PPTX-Erstellung
- [ ] PPTX-Attachment-Upload wird als Template durchgereicht
- [ ] Vault-Pfad-Referenz funktioniert
- [ ] Memory-Check ueberspringt Frage wenn Design-Praeferenz vorhanden

## Dependencies

- **FEAT-11-00:** Template-Engine muss Templates verarbeiten koennen
- **FEAT-11-01:** Default-Templates muessen vorhanden sein
- **Existing:** AttachmentHandler, ask_followup_question Tool

## Out of Scope

- UI-Modal fuer Template-Auswahl (laeuft ueber Chat-Interaktion)
- Drag-and-Drop von Dateien in den Chat
- Template-Vorschau im Chat
