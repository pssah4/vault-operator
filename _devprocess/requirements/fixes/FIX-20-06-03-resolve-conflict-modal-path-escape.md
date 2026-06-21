---
id: FIX-20-06-03
epic: EPIC-20
feature: FEAT-20-06
adr-refs: []
plan-refs: []
depends-on: [IMP-20-06-01]
audit-refs: [AUDIT-IMP-20-06-01-2026-06-19]
created: 2026-06-19
---

# FIX-20-06-03: ResolveConflictModal.openInChat interpoliert Note-Pfad ungeescaped (Audit L-2)

## Symptom

Audit-Finding L-2 aus [AUDIT-IMP-20-06-01-2026-06-19.md](../../analysis/AUDIT-IMP-20-06-01-2026-06-19.md). `openInChat` interpoliert den Note-Pfad ungeescaped in einen Markdown-Prompt.

Trigger: erst wenn `openInChat` tatsaechlich an die Chat-Sidebar uebergibt. Heute nur `console.debug` -- daher latenter Bug, kein akutes Risiko.

## Root Cause

`src/ui/modals/ResolveConflictModal.ts:99-103` baut den Prompt via String-Concatenation mit dem Note-Pfad. Markdown-Sonderzeichen (eckige Klammern, Pipes) werden nicht escaped.

## Fix-Skizze

- Markdown-Sonderzeichen im Pfad escapen, oder
- Strukturiertes Feld nutzen statt Prompt-Interpolation (bevorzugt).

## Status

P3. Planned. Gehoert zusammen mit FIX-20-06-02 in eine eigene Audit-Welle. Nicht im Scope des aktuellen MCP-Hotfix-Branches.
