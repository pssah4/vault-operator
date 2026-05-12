---
id: FIX-24-03-02
feature: FEAT-24-03
epic: EPIC-24
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-12
---

# FIX-24-03-02: tmp-Cleanup des ResultExternalizers schlaegt auf iCloud-Pfad mit EPERM fehl

## Symptom

`[Externalize] Cleanup failed after retries (non-fatal, will retry on next plugin start): Error: EPERM: operation not permitted, unlink '.../.obsilo-vault/tmp/task-...'` -- in jedem Test-Run beobachtet. Auf dem iCloud-synchronisierten Vault-Pfad schlaegt das Loeschen der Task-tmp-Verzeichnisse fehl. Non-fatal (Retry beim naechsten Plugin-Start), aber die tmp-Files bleiben liegen.

## Fix

Robuster Cleanup: Retry mit Delay, oder rmdir-recursive statt unlink, oder Cleanup beim naechsten Start verlaesslicher machen; ggf. iCloud-spezifischer Pfad-Fallback (`.obsidian/`-Konfig-Verzeichnis statt Vault-Root). Detail im PLAN.
