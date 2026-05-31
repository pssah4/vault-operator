---
id: FIX-01-12-02
feature: FEAT-01-12
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-31
---

# FIX-01-12-02: AttachmentHandler -- gleicher Dateiname tauscht Vault-Inhalt stumm aus

## Symptom

Code-Review 2026-05-31 (xhigh focused): User zieht `report.pdf` (Inhalt A) in den Chat -- AttachmentHandler parst, legt Vault-Datei `Attachements/report.pdf` an, Chat zeigt parsed Text + Attachment-Chip. Spaeter (gleicher oder neuer Chat) zieht User einen anderen `report.pdf` (Inhalt B) rein. AttachmentHandler erkennt den Filename-Konflikt -- legt aber den **neuen** Inhalt nicht ab und gibt den **bestehenden** Pfad zurueck. Der zugehoerige parsed Text von Inhalt B wird trotzdem ins Chat geschrieben, und das vault_path-Attribut im attached_document-XML verweist auf `Attachements/report.pdf`.

Effekt: Chat-History sagt "vault_path=Attachements/report.pdf" mit Inhalt-B-Text. Jeder Folge-Tool (`read_document`, `move_file`, `ingest_document` per vault_path) liest aber Inhalt A. Silent content swap, nur ein `Notice` deutet die Kollision an.

## Cause

[src/ui/sidebar/AttachmentHandler.ts:476-484](src/ui/sidebar/AttachmentHandler.ts#L476-L484):

```ts
const existing = this.vault.getAbstractFileByPath(targetPath);
if (existing instanceof TFile) {
    new Notice(`Attachment already in vault: ${targetPath}`);
    return targetPath;
}
await this.vault.createBinary(targetPath, data);
return targetPath;
```

Early-return ohne Schreiben. Caller (Z. 141-178) verwendet den Pfad unconditionell als `resolvedVaultPath`, baut ihn ins attached_document-XML ein, pusht parsed Text und Item nach `pending` und `fullDocTexts`.

## Fix

Bei Filename-Kollision: **eindeutige Vault-Path-Variante** erzeugen statt early-return.

1. Helper `nextAvailablePath(targetPath)` -- pruefe `report.pdf`, `report-2.pdf`, `report-3.pdf`, ..., gib erste freie zurueck.
2. In `saveExternalBinaryToAttachments`: wenn `existing instanceof TFile`, dann durch Hash-Check entscheiden:
   - Bytes identisch (gleicher SHA-256 ueber `data` vs Vault-Read) -> early-return wie bisher mit `Notice` "Attachment already in vault (identical bytes)".
   - Bytes unterschiedlich -> `targetPath = nextAvailablePath(targetPath)`, dann `createBinary` ausfuehren, neuen Pfad zurueckgeben.
3. Caller bleibt unveraendert (verwendet den **tatsaechlich verwendeten** Pfad).

Hash-Check vermeidet sinnloses Vermehren bei echten Duplikaten.

## Regression test

In `src/ui/sidebar/__tests__/AttachmentHandler.test.ts`:

- **identical bytes -> reuse:** zweimal die gleichen Bytes als `report.pdf` -> beide Aufrufe geben `Attachements/report.pdf` zurueck, nur ein `createBinary` Call.
- **different bytes -> rename:** zwei verschiedene Inhalte als `report.pdf` -> zweiter Call gibt `Attachements/report-2.pdf` zurueck und schreibt die Bytes.
- **multiple renames cascade:** dritter unterschiedlicher `report.pdf` -> `report-3.pdf`.
- **edge: extension preserved:** `report.tar.gz` collidiert -> `report.tar-2.gz` oder `report-2.tar.gz`? Wir gehen mit dem letzten Punkt als Extension, also `report.tar-2.gz`. Dokumentieren.

## How tested

1. Vitest gruen.
2. Live-Smoke: zwei verschiedene `report.pdf` nacheinander reinziehen; pruefe dass beide eigene Vault-Dateien anlegen und die Chat-XML-vault_path-Attribute korrekt sind.
