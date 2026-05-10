---
id: FIX-18-02-01
feature: FEAT-18-02
epic: EPIC-18
adr-refs: [ADR-063]
plan-refs: []
depends-on: []
created: 2026-05-08
issue: https://github.com/pssah4/obsilo-dev/issues/62
---

# FIX-18-02-01: PDF tool_result mehrfach im Hauptkontext, Context Externalization (ADR-063) greift bei PDF-Attachments nicht

## Symptom

Live-Test 2026-05-08 (`/ingest-deep` auf
`Attachements/enbw-geschaeftsbericht-2025.pdf`, branch
`feature/block-source-citations`). `[InputBreakdown:main-loop]` zeigt
das gleiche PDF in drei verschiedenen Messages des Hauptkontexts:

```
total=~138275t (sys=11470t hist=126805t over 32 msgs, 33 tools).
Top msgs:
  #17 user[tool_result]=56311t "<content source='Attachements/enbw-geschaeftsbericht-2025.pdf' format='pdf' tota..."
  #15 user[tool_result]=47184t "<content source='Attachements/enbw-geschaeftsbericht-2025.pdf' format='pdf' tota..."
  #6  user[tool_result,tool_result]=10670t "<content source='Attachements/enbw-geschaeftsbericht-2025.pdf' format='pdf' tota..."
```

Drei separate Tool-Result-Bloecke fuer dasselbe Dokument, in den
Positionen #6, #15, #17. Zusammen ~114k Tokens fuer ein einziges PDF;
Hauptkontext steigt waehrend der Session auf 138k Tokens.

## Root cause -- Hypothese (zu validieren)

ADR-063 (Context Externalization) verlangt, dass grosse Tool-Result-Bloecke
in eine Temp-Datei ausgelagert werden und im Kontext nur eine kompakte
Referenz steht. Fuer PDF-Attachments scheint einer von zwei Pfaden zu
greifen:

1. Externalize-Threshold uebersieht das Format `<content
   source='...pdf' format='pdf' ...>`. Die Externalization-Heuristik
   triggert auf bestimmte Token-Groessen oder Tool-Namen, aber nicht
   auf Tool-Results dieses Shapes.
2. Externalize laeuft pro `tool_result`, nicht pro Inhalt. Wenn das
   gleiche PDF von drei Tool-Calls geliefert wird (z. B.
   `read_document`, `ingest_document`, weiterer LLM-getriebener Read),
   landet das Attachment dreimal im Kontext, jeweils unterhalb des
   Externalize-Thresholds (z. B. 47k < 50k), und entgeht der
   Externalisierung.

Hash-basierte Deduplication ueber alle `tool_result`-Bloecke des
Hauptkontexts wuerde Pfad 2 schliessen. Format-spezifische
Externalisierung fuer `format='pdf'` (immer extern, unabhaengig von
Token-Groesse) wuerde Pfad 1 schliessen.

```
hist (32 msgs)
  ├── #6 tool_result <content source=...pdf>  10670t   <- nicht externalisiert
  ├── #15 tool_result <content source=...pdf> 47184t   <- nicht externalisiert
  └── #17 tool_result <content source=...pdf> 56311t   <- mglw. ueber Threshold, trotzdem im Kontext?
```

## Fix

Offen. Vorschlag:

1. ContextExternalizer (FEAT-18-02) inspizieren:
   - Greift der Threshold auf PDF-Tool-Results?
   - Wird die Externalisierung pro Message angewandt oder nur einmalig
     beim Append?
2. Quick-Win: harten Threshold fuer Tool-Results runtersetzen
   (z. B. >5k Tokens immer externalisieren) -- damit alle drei
   Vorkommen extern landen wuerden.
3. Mittelfristig: Hash-basierte Deduplication ueber `tool_result`-Bloecke,
   sodass das gleiche PDF nicht in drei verschiedenen Messages parallel
   gehalten wird. Die Inhalte sind byte-identisch und damit ein
   eindeutiger Hash.
4. Format-spezifische Externalisierung: `format='pdf'`/`format='docx'`/
   `format='pptx'` immer extern, unabhaengig vom Token-Threshold.

Verzahnung mit Bug C aus IngestDeep: das PDF wird mehrfach geladen,
weil die Mirror-Generierung nur 1-135 von 410 Seiten abdeckt
(FIX-19-28-04). Das wiederholte Laden ist ein eigenes Symptom; die
Externalization muss aber unabhaengig davon greifen.

## Regression test

Test mit synthetischem Tool-Result `<content format='pdf'>` von 50k
Tokens, dreimal im Hauptkontext eingefuegt. Assertion: nach
ContextExternalizer-Pass enthaelt der Hauptkontext nur drei
Externalize-Refs (z. B. `[externalised: tmp/.../pdf-xyz.bin]`),
keine Inline-Bloecke. Plus separate Assertion: byte-identische
Tool-Results sharen denselben Externalize-Pfad (Hash-Dedupe).

## Status

See the backlog row for FIX-18-02-01 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).

## Tracking

GitHub Issue: https://github.com/pssah4/obsilo-dev/issues/62
