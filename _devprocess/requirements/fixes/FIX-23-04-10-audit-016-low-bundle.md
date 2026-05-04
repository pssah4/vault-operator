---
id: FIX-23-04-10
feature: FEAT-03-25
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-04-10: ActiveMcpSessions ohne Hash + cosine NaN-Guard + OutputModeGenerator instanceof + validateVaultPath-Helper (AUDIT-016 L-1/L-2/L-3/L-5)

## Symptom

Vier kleinere Findings aus AUDIT-016 als Bundle:

- **L-1**: ActiveMcpSessions makeKey nutzte djb2-Hash statt direktem mcpToken+source-String -- Hash-Kollision moeglich.
- **L-2**: cosine() konnte NaN zurueckliefern bei Zero-Vektoren -- liefert jetzt 0 wenn `Number.isFinite(sim)` false.
- **L-3**: OutputModeGenerator castete via `as TFolder` statt `instanceof TFolder` -- Review-Bot-Verstoss.
- **L-5**: Drei Vault-Tools dupliziertem Path-Traversal-Check; gemeinsamer Helper `validateVaultRelativePath` in `src/core/tools/vault/pathValidation.ts`.

## Fix

Alle vier Findings adressiert in einem Sweep, jeweils mit Unit-Tests.

## Verification

AUDIT-016 L-1/L-2/L-3/L-5 resolved. BACKLOG: Status Done (commit 2e26b83).
