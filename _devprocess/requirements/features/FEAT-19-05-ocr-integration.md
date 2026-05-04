# Feature: OCR-Integration

> **Feature ID**: FEAT-19-05
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Priority**: P1-High
> **Effort Estimate**: M

## Feature Description

Integration eines OCR-Dienstes (z.B. Chandra OCR) fuer die Konvertierung gescannter
und bildbasierter PDFs in strukturiertes Markdown. Nach der Konvertierung wird nur das
Markdown im Vault gespeichert -- die Original-PDF wird als URL oder lokaler Pfad im
Frontmatter referenziert. Reduziert die Vault-Groesse und macht bisher unsichtbare
Inhalte durchsuchbar.

Heute scheitert pdfjs-dist bei gescannten PDFs: `(No extractable text found)`. Diese
Inhalte sind fuer SemanticIndex und Agent unsichtbar.

## Benefits Hypothesis

**Wir glauben dass** OCR-Integration bisher unsichtbare PDF-Inhalte durchsuchbar macht
und gleichzeitig die Vault-Groesse reduziert.

**Folgende messbare Outcomes liefert:**
- 100% der PDFs sind indexierbar (statt nur Text-Layer-PDFs)
- Vault-Groesse sinkt signifikant (nur Markdown statt PDF + Markdown)

**Wir wissen dass wir erfolgreich sind wenn:**
- OCR-Qualitaet ist ausreichend fuer Semantic Search (>90% korrekte Extraktion)
- User nutzt OCR fuer mindestens 50% der neuen PDFs

## User Stories

### Story 1: PDF konvertieren
**Als** Wissensarbeiter
**moechte ich** eine PDF per Agent-Ingest in durchsuchbares Markdown konvertieren
**um** den Inhalt im Wissensnetz nutzen zu koennen

### Story 2: Original-Referenz behalten
**Als** Wissensarbeiter
**moechte ich** dass die Original-PDF als Pfad/URL im Frontmatter verlinkt bleibt
**um** bei Bedarf auf das Original zurueckgreifen zu koennen

### Story 3: Vault-Groesse kontrollieren
**Als** Wissensarbeiter
**moechte ich** nur das Markdown im Vault behalten und die PDF ausserhalb lagern
**um** meinen Vault schlank und sync-freundlich zu halten

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Gescannte PDFs werden korrekt konvertiert | >90% Text korrekt extrahiert | Stichprobe mit 10 PDFs |
| SC-02 | Tabellen und Struktur bleiben erhalten | Markdown spiegelt Layout wider | Visueller Vergleich |
| SC-03 | Original-PDF ist ueber Frontmatter-Link erreichbar | URL/Pfad funktioniert | Manueller Test |
| SC-04 | Feature ist opt-in | Toggle in Settings | Manueller Test |
| SC-05 | Kosten sind transparent | User sieht geschaetzte Kosten vor dem OCR-Call | UI-Check |

---

## Technical NFRs (fuer Architekt)

### Performance
- **Konvertierungszeit**: <30s pro PDF-Seite (API-abhaengig)
- **Batch**: Sequenzielle Verarbeitung mehrerer PDFs

### Security
- **Datenschutz**: PDF-Inhalt wird an externen OCR-Dienst gesendet -- User muss informiert zustimmen
- **API-Key**: Sicher gespeichert (SafeStorageService)

### Cost
- **Transparenz**: Geschaetzte Kosten vor dem Call anzeigen
- **Budget**: Kein automatischer OCR ohne User-Trigger

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: OCR-Provider-Auswahl
- **Warum ASR**: Chandra OCR vs. Alternativen (Tesseract lokal, Google Vision, etc.) -- bestimmt Qualitaet, Kosten und Privacy
- **Impact**: API-Client, Kosten-Modell, Datenschutz-Anforderungen
- **Quality Attribute**: Quality, Cost, Privacy

**MODERATE ASR #2**: Markdown-Output-Format
- **Warum ASR**: OCR-Output muss als sauberes Markdown gespeichert werden das der SemanticIndex chunken kann
- **Impact**: Parser/Formatter zwischen OCR-Output und Vault-Note
- **Quality Attribute**: Correctness

### Workflow

```
User triggert Ingest fuer PDF (FEAT-19-00)
  → Agent erkennt: PDF hat keinen Text-Layer (oder enableOcrIngest aktiv)
  → Agent fragt: "PDF via OCR konvertieren? (geschaetzte Kosten: ~$0.XX)"
  → User bestaetigt
  → PDF wird an OCR-Dienst gesendet
  → Markdown-Ergebnis kommt zurueck
  → Quellen-Note wird erstellt:
    - Frontmatter: Autor, Jahr, Titel, URL/Pfad zur Original-PDF
    - Body: OCR-Markdown (strukturiert: Headings, Tabellen, Text)
  → Original-PDF optional aus Vault entfernen (User entscheidet)
  → SemanticIndex indexiert das Markdown
```

### Open Questions fuer Architekt
- Chandra OCR API: Wie ist die Preisstruktur? Pro Seite? Pro Dokument?
- Soll die Original-PDF automatisch verschoben werden (z.B. in einen "Archiv"-Ordner ausserhalb des Vault)?
- Fallback auf pdfjs-dist wenn OCR deaktiviert ist?
- Lokale OCR-Alternative (Tesseract WASM) als Fallback ohne API-Kosten?

---

## Definition of Done

### Functional
- [ ] PDF-zu-Markdown Konvertierung via OCR funktioniert
- [ ] Strukturerkennung (Tabellen, Headings, Listen)
- [ ] Original-PDF als URL/Pfad im Frontmatter verlinkt
- [ ] Toggle `enableOcrIngest` in Settings
- [ ] Kosten-Transparenz vor dem Call
- [ ] Integration mit Ingest-Skill (FEAT-19-00)

### Quality
- [ ] >90% korrekte Textextraktion bei Stichproben
- [ ] API-Key sicher gespeichert
- [ ] Datenschutz-Hinweis bei erstem OCR-Call

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] ADR fuer OCR-Provider-Auswahl
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-19-00 (Ingest)**: OCR ist ein Sub-Schritt des Ingest-Workflows
- **Externer Dienst**: Chandra OCR API (oder Alternative)
- **SafeStorageService**: Fuer API-Key-Speicherung

## Out of Scope
- Bild-OCR (nur PDFs im MVP)
- Batch-OCR aller bestehenden PDFs (spaeter)
- Lokale OCR ohne API
