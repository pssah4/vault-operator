---
id: FIX-24-07-01
feature: FEAT-24-07
epic: EPIC-24
adr-refs: [ADR-115]
plan-refs: []
audit-refs: []
depends-on: []
created: 2026-05-13
---

# FIX-24-07-01: update_settings WRITABLE_PATHS-Drift fuer 5 EPIC-24-Settings

## Symptom

Im Live-Messlauf MESSLAUF Test 4 versuchte der Agent
`update_settings(action: "set", path: "helperModelKey", value: "...")`
und bekam:

```
<error>Setting path "helperModelKey" is not writable via this tool.
Use configure_model for API key changes.</error>
```

Der Agent konnte den FEAT-24-07-Helper-Slot nicht setzen. Er versuchte
ein `configure_model select` als Workaround, was aber das aktive
Haupt-Modell auf Haiku umschaltete (statt den helperModelKey zu setzen).

## Root cause (kausale Kette)

`src/core/tools/agent/UpdateSettingsTool.ts:17` definiert eine
`WRITABLE_PATHS`-Allowlist mit den erlaubten Dot-Paths. Beim Hinzufuegen
neuer Settings in EPIC-24 wurde die Allowlist nie aktualisiert. Fuenf
Settings sind betroffen:

- `advancedApi.microcompactionEnabled` (FEAT-24-02)
- `advancedApi.rollingSummaryThreshold` (FEAT-24-02)
- `advancedApi.subtaskTokenBudget` (FEAT-24-04 / ADR-113)
- `helperModelKey` (FEAT-24-07 / ADR-115)
- `costWarnThresholdEur` (FEAT-24-05)

Folge: der Agent kann diese fuenf User-facing-Toggles nicht selbst
setzen, obwohl sie genau dafuer designed wurden.

## Fix

Allowlist um die fuenf Pfade erweitert, mit FEATURE-ID-Kommentar je
Eintrag. `WRITABLE_PATHS` wird exportiert (vorher `const` lokal), damit
der Regression-Test darauf zugreifen kann.

## Regression test

`src/core/tools/agent/__tests__/UpdateSettingsTool.test.ts` mit 5
Asserts:

- FEAT-24-02: microcompactionEnabled + rollingSummaryThreshold writable
- FEAT-24-04: subtaskTokenBudget writable
- FEAT-24-07: helperModelKey writable
- FEAT-24-05: costWarnThresholdEur writable
- Smoke-Check: activeModels / activeModelKey NICHT writable (die haben
  ihren eigenen Pfad ueber configure_model -- write-Permission via
  update_settings waere ein Vertrauensgrenzen-Bruch).

## Status

Done 2026-05-13. 1477 Tests gruen (+5 vs 1472). lint 0 errors, tsc
clean.

**Live-Verifikation:** Sebastian wiederholt MESSLAUF Test 4 Setup nach
Plugin-Reload. Erwartung: der Agent kann jetzt `update_settings` mit
`path: "helperModelKey"` erfolgreich aufrufen.
