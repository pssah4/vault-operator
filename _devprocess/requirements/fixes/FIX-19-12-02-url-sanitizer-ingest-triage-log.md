---
id: FIX-19-12-02
feature: FEAT-19-12
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-19-12-02: URL-Sanitizer in IngestTriageLogStore (Query-Params strippen)

## Symptom

AUDIT-014 hat im IngestTriageLogStore Query-Parameter (Tracking, Tokens) im persistierten URL-Feld gefunden. Risiko: Sensitive Daten landen unverschluesselt in der DB und in spaeteren Audit-Exporten.

## Fix

URL-Sanitizer entfernt Query-String beim Schreiben in den Store.

## Verification

AUDIT-014 Re-Audit gruen. BACKLOG: Status Done.
