---
id: PLAN-35
title: FEAT-29-12 Backup- und Export-Tool (selektiv, ZIP, optional Auto-Daily)
date: 2026-05-21
feature-refs: [FEAT-29-12]
adr-refs: []
fix-refs: []
imp-refs: []
pair-id: 35
---

# PLAN-35 -- FEAT-29-12 Backup/Export-Tool

> Backlog row: `_devprocess/context/BACKLOG.md` -> PLAN-35
> (status, phase, last-change, claim leben dort).

## Context

Nach FEAT-29-01 lebt aller Plugin-State vault-local in `.vault-operator/`. Cross-Vault-Transfer ist damit nicht mehr automatisch sondern braucht ein dediziertes Werkzeug. FEAT-29-12 liefert ein Backup/Export-Tool: User waehlt selektiv welche Bereiche (Skills, Memory, History, Rules, Workflows, Alles), exportiert in ZIP, importiert in einen anderen Vault. Pflicht-Verhalten:

- **Secret-Filterung beim Export** (API-Keys raus, opt-in zum Mitexport).
- **Konflikt-Modal beim Import** (User entscheidet ueber gleichnamige Items).
- **Auto-Daily optional**, nicht Default aktiv.

Bereiche-Inventur (aus Spec + Code-Stand):
- **Skills**: `data/skills/` (User + builtin)
- **Memory**: `data/memory.db` + `data/memory.db-journal`
- **History**: `data/history.db` + `data/history.db-journal`
- **Rules**: `data/rules.md` falls vorhanden
- **Workflows**: `data/workflows/` falls vorhanden
- **Settings (optional, Secret-filtered)**: `data.json`

Out-of-Scope (per Spec): Cloud-Backup, differentielle Backups, Backup-Verschluesselung.

## Tasks

### Task A: BackupExportService (pure logic + Tests)

Files:
- `src/core/backup/BackupExportService.ts`
  - `collectFiles(selection: BackupSelection): Promise<BackupFile[]>` -- selektiv Files aus dem agent-folder einsammeln
  - `buildZip(files: BackupFile[]): Promise<Uint8Array>` -- JSZip-Wrapper
  - `unpackZip(zipBytes: Uint8Array): Promise<BackupFile[]>` -- entpackt + validiert (kein Path-Traversal, no symlinks)
  - `validateZipMetadata(zip): { ok, schemaVersion, sections, fileCount, hash }`
- `BackupSelection` Type: `{ skills, memory, history, rules, workflows, settings, exportSecrets }`
- `BackupFile` Type: `{ path: string, content: Uint8Array, isText: boolean }`
- `src/core/backup/__tests__/BackupExportService.test.ts` mit Round-Trip-Tests (pure logic, in-memory fs)

### Task B: BackupSecretFilter (pure + tests)

Files:
- `src/core/backup/BackupSecretFilter.ts`
  - `filterSecretsFromDataJson(json: unknown, allowlist?: Set<string>): unknown` -- strippe `awsApiKey`, `apiKey`, `awsSecretKey`, `awsSessionToken`, `anthropicApiKey`, `openaiApiKey` rekursiv. Allowlist erlaubt opt-in pro Feld
  - `getKnownSecretKeys(): Set<string>` -- statische Liste der bekannten Secret-Pfade
- Tests pinnen welche Keys gestrippt werden und welche nicht (z.B. `model`, `baseUrl` bleiben)

### Task C: ImportConflictResolver (pure + tests)

Files:
- `src/core/backup/ImportConflictResolver.ts`
  - `detectConflicts(targetVaultFiles, incomingFiles): Conflict[]`
  - `applyResolution(resolution, ...): BackupFile[]`
  - Resolutions: `overwrite-all`, `skip-all`, `per-item-map`
- Tests pinnen Path-Mapping, Konflikt-Detektion, Per-Item-Anwendung

### Task D: Settings + AutoBackupScheduler

Files:
- `src/types/settings.ts` -- `backup: { exportSecretsAllowed: boolean, autoDailyEnabled: boolean, autoDailyTargetPath: string, retentionCount: number, lastAutoBackupAt: number }`
- `src/core/backup/AutoBackupScheduler.ts`
  - `maybeRunAutoBackup()` -- onload-Hook, prueft `lastAutoBackupAt` vs. now, wenn >= 24h und enabled -> trigger Export
  - Retention: behaelt die letzten N Auto-Backups, loescht aeltere
- `src/main.ts` -- onload-Trigger fuer maybeRunAutoBackup() (defer 60s nach Boot)
- Tests fuer AutoBackupScheduler-Trigger-Logik

### Task E: UI -- BackupExportModal + Settings-Tab

Files:
- `src/ui/modals/BackupExportModal.ts` -- Selection-UI (Checkboxes per Bereich), "Export to ZIP" button, secret-filter-toggle, "Save backup to..." File-Dialog
- `src/ui/modals/BackupImportConflictModal.ts` -- bei Konflikten: per-Bereich-Diff, "Overwrite all" / "Skip all" / "Per-Item entscheiden"
- `src/ui/settings/BackupTab.ts` (oder Sektion in bestehender Tab) -- Buttons "Export now" / "Import now" + Auto-Daily-Toggle + retention-Slider

### Task F: ARCHITECTURE.map + Wiring + Live-Test

- `src/ARCHITECTURE.map` -- concept `backup-export-tool`
- `src/main.ts` Wiring -- onload-Trigger
- Live-Smoke: Export -> Save -> Import in zweitem Vault (oder im selben Vault als Round-Trip), verify dass Skills + Memory wiederhergestellt werden

## Coverage Gate

SC-01 (selektive Auswahl) -> Task E UI + Task A collectFiles-Tests
SC-02 (Round-Trip funktioniert) -> Task A export+unpack Tests + Task F Live-Test
SC-03 (Konflikt-Resolution) -> Task C + Task E ConflictModal
SC-04 (Auto-Daily) -> Task D Scheduler-Tests + Live-Test ueber 24h-Skip
SC-05 (Backup-Verifikation per Hash) -> Task A validateZipMetadata + Tests

Build commands:
- `npm run build`
- `npx tsc --noEmit`

Test commands:
- `npx vitest run src/core/backup`
- Live-Smoke Round-Trip nach Task F

## Change Log

(Append-only.)
