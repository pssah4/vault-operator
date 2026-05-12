# ADR-68: OCR-Provider-Auswahl

**Date:** 2026-04-08
**Deciders:** Sebastian Hanke

## Context

FEAT-19-05 (OCR-Integration) benoetigt einen OCR-Dienst der gescannte PDFs in strukturiertes Markdown konvertiert. Heute nutzt Vault Operator pdfjs-dist fuer PDF-Textextraktion, das bei gescannten oder bildbasierten PDFs scheitert (`No extractable text found`). Die Wahl des OCR-Providers bestimmt Qualitaet, Kosten, Privacy und Plattformkompatibilitaet.

**Triggering ASR:**
- ASR-7 (FEAT-19-05): OCR-Provider-Auswahl -- Quality, Cost, Privacy

## Decision Drivers

- **Qualitaet**: Tabellen, Spalten, Formeln, Bilder muessen erkannt werden (nicht nur Fliesstext)
- **Markdown-Output**: Direkt nutzbares Markdown ohne aufwaendiges Post-Processing
- **Privacy**: PDF-Inhalte verlassen das Geraet -- User muss informiert zustimmen
- **Kosten**: Transparent und vorhersagbar fuer den User
- **Plattform**: Muss aus Electron (Obsidian Desktop) aufrufbar sein
- **Fallback**: Wenn OCR deaktiviert/unavailable, muss pdfjs-dist weiterhin funktionieren

## Considered Options

### Option 1: Chandra OCR (datalab-to/chandra-ocr-2)

Cloud-basierte OCR-API spezialisiert auf akademische/wissenschaftliche Dokumente. Gibt strukturiertes Markdown zurueck inkl. Tabellen, Formeln (LaTeX), Bilder.

- Pro: Exzellente Qualitaet bei akademischen PDFs (Tabellen, Formeln, Spalten)
- Pro: Output ist bereits Markdown -- minimales Post-Processing
- Pro: Aktive Entwicklung, Open Source Modell
- Pro: REST-API, einfach aus Electron aufrufbar (via requestUrl)
- Con: Cloud-basiert -- Daten verlassen das Geraet
- Con: Kostenstruktur muss evaluiert werden
- Con: Abhaengigkeit von externem Dienst (Verfuegbarkeit, Rate Limits)
- Con: Fuer einfache Text-PDFs ueberqualifiziert

### Option 2: Tesseract WASM (lokal)

Tesseract OCR kompiliert zu WebAssembly. Laeuft komplett lokal im Browser/Electron.

- Pro: 100% lokal -- keine Daten verlassen das Geraet
- Pro: Keine API-Kosten
- Pro: Keine Netzwerk-Abhaengigkeit
- Con: Deutlich schlechtere Qualitaet bei komplexen Layouts (Tabellen, Spalten)
- Con: Kein Markdown-Output -- nur Rohtext, Post-Processing noetig
- Con: WASM-Bundle ~5MB (zusaetzlich zum sql.js WASM)
- Con: Langsam bei grossen PDFs (keine GPU-Beschleunigung)
- Con: Keine Formel-/LaTeX-Erkennung

### Option 3: Multimodales LLM (Vision-Modelle)

PDF-Seiten als Bilder an ein multimodales LLM senden (Claude, GPT-4o, Gemini) das OCR + Strukturerkennung in einem Schritt macht.

- Pro: Beste Qualitaet bei beliebigen Layouts
- Pro: Direkte Markdown-Generierung mit semantischem Verstaendnis
- Pro: Nutzt bereits konfigurierte LLM-Provider (kein neuer Dienst)
- Pro: Kann Zusammenfassung + OCR in einem Call machen
- Con: Teuerste Option (Bild-Tokens sind teuer, ~$0.01-0.05 pro Seite)
- Con: Langsam bei vielen Seiten (1 Call pro Seite oder sehr grosse Kontexte)
- Con: Daten verlassen das Geraet (wie Option 1)
- Con: Inkonsistente Ergebnisse bei gleicher Eingabe (non-deterministic)

### Option 4: Hybrid (pdfjs-dist + Chandra Fallback)

pdfjs-dist bleibt primary. Nur wenn kein Text-Layer erkannt wird, bietet der Agent Chandra als Fallback an.

- Pro: Kein Overhead fuer Text-PDFs (pdfjs-dist reicht)
- Pro: OCR nur wenn noetig (Kosten-Optimierung)
- Pro: Graceful Degradation: Ohne Chandra-API funktioniert alles wie bisher
- Pro: User entscheidet pro PDF ob OCR genutzt wird
- Con: Zwei Code-Pfade (pdfjs + Chandra)
- Con: Erkennung "hat keinen Text-Layer" muss zuverlaessig sein

## Decision

**Vorgeschlagene Option:** Option 4 -- Hybrid (pdfjs-dist + Chandra Fallback)

**Begruendung:**

1. **pdfjs-dist funktioniert fuer 80%+ der PDFs**: Die meisten PDFs haben einen Text-Layer. Chandra ist nur fuer gescannte Dokumente noetig.

2. **Kosten-Optimierung**: OCR-Calls nur wenn noetig, nicht fuer jede PDF. User sieht geschaetzte Kosten vor dem Call.

3. **Graceful Degradation**: Ohne Chandra-API-Key funktioniert der Ingest wie bisher. OCR ist ein optionales Upgrade (`enableOcrIngest` Toggle).

4. **Chandra statt Tesseract weil Qualitaet**: Tesseract scheitert bei komplexen Layouts die gerade bei akademischen PDFs haeufig sind. Der Qualitaetsunterschied rechtfertigt die Cloud-Abhaengigkeit.

5. **Chandra statt Vision-LLM weil Kosten**: Multimodale LLMs sind 5-10x teurer pro Seite und non-deterministisch. Chandra ist ein spezialisiertes OCR-Modell -- billiger und konsistenter.

### Architektur

```
PDF kommt rein (Ingest Skill)
  → pdfjs-dist: Textextraktion versuchen
  → Text gefunden? 
    → Ja: Markdown generieren, fertig
    → Nein: "Gescannte PDF erkannt"
      → enableOcrIngest aktiv?
        → Ja: "OCR via Chandra? (geschaetzte Kosten: ~$X.XX)"
          → User bestaetigt → Chandra API Call → Markdown
        → Nein: "(No extractable text found)" Warnung
```

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- 80%+ der PDFs brauchen kein OCR (pdfjs-dist reicht)
- Kosten nur bei tatsaechlichem Bedarf
- Qualitaet bei komplexen PDFs durch Chandra gewaehrleistet
- Bestehende Funktionalitaet bricht nicht

### Negative
- Zwei Code-Pfade fuer PDF-Verarbeitung
- Cloud-Abhaengigkeit fuer OCR (Chandra)
- API-Key-Management noetig (SafeStorageService)

### Risks
- **Chandra API Stabilitaet/Preise aendern sich**: Mitigation: Abstraktion ueber Interface, Provider austauschbar.
- **Text-Layer-Erkennung unzuverlaessig**: Mitigation: Wenn pdfjs-dist weniger als X Zeichen pro Seite findet → als "gescannt" behandeln.
- **Privacy-Bedenken bei Cloud-OCR**: Mitigation: Expliziter Datenschutz-Hinweis beim ersten OCR-Call, Toggle ist opt-in.

## Implementation Notes

- `OcrService` Interface in `src/core/document-parsers/OcrService.ts`
- `ChandraOcrProvider` implementiert OcrService
- Integration in `parseDocument.ts`: Nach pdfjs-dist Fallback → OcrService
- API-Key via SafeStorageService (wie bestehende Provider)
- Kosten-Schaetzung: Seitenzahl × Preis-pro-Seite im Chandra-Dialog anzeigen
- requestUrl statt fetch (Review-Bot Compliance)

## Related Decisions

- ADR-50: SQLite Knowledge DB (Markdown wird nach OCR indexiert)
- ADR-66: Ingest-Strategie (OCR ist Sub-Schritt des Ingest)
- FEAT-06-01: Document Parsing Pipeline (bestehende Parser-Architektur)

## References

- Chandra OCR: https://github.com/datalab-to/chandra-ocr-2
- pdfjs-dist: Bestehende Implementierung in `src/core/document-parsers/parsers/PdfParser.ts`
