---
id: FIX-24-03-01
feature: FEAT-24-03
epic: EPIC-24
adr-refs: [ADR-63]
plan-refs: []
depends-on: []
created: 2026-05-12
---

# FIX-24-03-01: Externalize -> sofortiges Re-Read = No-Op; verallgemeinert FIX-18-02-01

## Symptom

In 4 von 5 Test-Sessions (Messlauf 2026-05-12) schrieb der `ResultExternalizer` ein Such-/Semantic-Result in eine tmp-Datei + gab eine kompakte Referenz zurueck -- und der Agent las unmittelbar danach die ganze tmp-Datei via `read_file` zurueck. Da `read_file` in `SKIP_EXTERNALIZATION` ist (Revision 2026-04-29), bleibt der Volltext dann ungekuerzt in der History: der Brocken wird nur eine Message weiter geschoben, nicht entfernt. Im 5. Test (Gemini) las der Agent die tmp-Datei nicht zurueck -- eine reichhaltigere Referenz haette gereicht. Dies ist die allgemeinere Variante von FIX-18-02-01 (PDF-Attachments mehrfach im Kontext), das damit superseded ist.

## Fix

Siehe ADR-63-Amendment / FEAT-24-03: Re-Read einer externalisierten tmp-Datei unterliegt selbst dem Externalize-/Cap-Mechanismus; reichhaltigere kompakte Referenz (mehr Top-Treffer/Headings/Metadaten) + Prompt-Leitplanke "nur nachlesen, wenn du einen konkreten Abschnitt brauchst"; Externalizer auch im allgemeinen Hauptloop wirksam.
