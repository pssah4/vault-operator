---
id: FEAT-29-14
title: Templates-Setup, Materialisierung und Sprach-Wahl im First-Run
epic: EPIC-29
priority: P2
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-13]
created: 2026-05-21
---

# Feature: Templates-Setup, Materialisierung und Sprach-Wahl

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-14
> (status, phase, claim, last-change leben dort).

## Feature description

Vor diesem Feature mussten User die Frontmatter-Templates fuer die /ingest- und /ingest-deep-Skills (Quelle/Source, Notiz/Note, Meeting-Notiz/Meeting Note) manuell anlegen und die Pfade einzeln in den Settings eintragen. Das war doppelt unschoen:

1. Der Plugin lieferte zwar Default-Templates im Build (`bundled-templates/notes/quelle-template.md`), schrieb sie aber nie in den Vault. Es gab keinen Mechanismus, das Default-Set per Klick zu uebernehmen.
2. Templates lagen nur auf Englisch im Bundle. Vault-User mit deutscher Konvention (oder anderen Sprachen) mussten zumindest die Frontmatter-Keys von Hand uebersetzen.
3. Der Plugin kannte keinen Templates-Ordner. Das Obsidian-Core-Templates-Plugin hat aber einen perfekten Eintrag dafuer (`<configDir>/templates.json` -> `folder`), der bisher ignoriert wurde.

Dieses Feature liefert:

- **Sprach-segmentierte Bundled-Templates** unter `bundled-templates/notes/{de,en}/`. Der Build-Generator emittiert sie als `BUNDLED_NOTE_TEMPLATES: Record<lang, Record<filename, content>>`.
- **TemplatesFolder-Resolver** (`resolveCoreTemplatesFolder`) liest den Templates-Ordner aus dem Obsidian-Core-Templates-Plugin.
- **TemplateMaterializer** schreibt das Default-Set in den konfigurierten Ordner (skip-existing, force-overwrite-Option). Fuer Sprachen ausserhalb DE/EN ruft er einen LLM-Translator-Callback auf, der die EN-Templates uebersetzt; ohne aktives Modell fallback auf EN-Inhalt unveraendert.
- **First-Run-Wizard-Schritt "Templates"** mit Sprach-Dropdown (Deutsch / English / Other), Folder-Anzeige (auto-detected, override-fähig) und Toggle "Materialisieren?".
- **Vault-Settings-Erweiterung**: neues `quellenNotizTemplate`-Feld (fuer die Sense-Making-Notes von FEAT-29-15) und `templatesLanguage` (persistierte User-Wahl), plus "Re-materialize"-Button mit Skip/Overwrite-Confirm.

## Benefits hypothesis

**Wir glauben dass** Templates per Klick anlegen + automatische Settings-Verkabelung + LLM-Uebersetzung fuer beliebige Sprachen
**folgende messbare Wirkung erzielt:**

- Time-to-first-/ingest sinkt von "User legt 3 Templates manuell an und traegt 3 Pfade in Settings ein" auf "Klick im First-Run-Wizard".
- /ingest-Output passt zur Vault-Konvention (DE/EN-Frontmatter-Keys, korrekte Kategorien) ohne Nachbearbeitung.
- User mit anderen Sprachen werden nicht zurueckgewiesen, sondern bekommen LLM-uebersetzte Default-Templates.

**Wir wissen dass wir erfolgreich sind, wenn:**

- First-Run-Wizard zeigt Templates-Step zwischen Search-Provider und Optional-Downloads.
- Sprach-Auswahl Deutsch / English / Other funktioniert.
- Klick auf "Weiter" mit Materialize-Toggle an schreibt die 3 Templates skip-existing in den konfigurierten Ordner und setzt `vaultIngest.templates.*`-Pfade.
- Re-materialize-Button im Vault-Tab triggert denselben Code-Pfad inkl. Confirm-Dialog.
- Bestehende Templates des Users werden **nie** ueberschrieben (ohne Force).

## User stories

### Story 1: First-Run klickt Templates an (Functional Job)

**Als** neuer User der den Plugin frisch installiert
**moechte ich** im First-Run-Wizard auswaehlen koennen ob ich Default-Templates anlegen will,
**damit** ich /ingest sofort nutzen kann ohne 3 Templates manuell zu schreiben.

### Story 2: Vault-Sprache passt (Functional Job)

**Als** User mit deutschem Vault
**moechte ich** dass die Templates `Zusammenfassung`, `Autor`, `Themen` etc. heissen (nicht `Summary`, `Author`),
**damit** /ingest-Output mit meinen bestehenden Notes konsistent ist.

### Story 3: Vault-Sprache ist Spezial (Functional Job)

**Als** User mit franzoesischem Vault
**moechte ich** dass der Plugin meine Templates auf Franzoesisch anlegt (via LLM-Uebersetzung),
**damit** ich nicht auf DE oder EN ausweichen muss.

### Story 4: Templates nicht ueberschreiben (Defensive Job)

**Als** User der eigene Templates schon angepasst hat
**moechte ich** dass eine zweite Materialisierung meine Anpassungen nicht zerstoert,
**damit** ich den Re-materialize-Button gefahrlos klicken kann.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Bundled-Templates liegen in DE und EN als separate Sets vor | je 3 Files in `bundled-templates/notes/{de,en}/` | Build-Output: 6 note templates |
| SC-02 | First-Run-Wizard zeigt Templates-Step zwischen Search-Provider und Optional-Downloads | Step sichtbar in der Progress-Leiste | Manueller Test im frischen Vault |
| SC-03 | Sprach-Dropdown bietet Deutsch / English / Other an, Other zeigt Text-Input | dynamische Visibility | Manueller Test |
| SC-04 | Bei Klick "Weiter" mit Materialize-Toggle an werden Templates angelegt und Settings-Pfade gesetzt | 3 Files geschrieben, 4 Settings-Pfade befuellt | Manueller Test + read settings.json |
| SC-05 | Existierende Files werden skipped ohne Force; force-overwrite via Confirm-Dialog | skip-Liste im Notice; force ueberschreibt | Manueller Test + Materializer-Unit-Test |
| SC-06 | Custom-Sprache triggert LLM-Translator, ohne aktives Modell -> EN-Fallback | translator called or fallbackLanguage='en' | Materializer-Unit-Test |
| SC-07 | Re-materialize-Button im Vault-Tab triggert denselben Code-Pfad | Button funktional, Confirm-Dialog erscheint | Manueller Test |
| SC-08 | `resolveCoreTemplatesFolder` liest `<configDir>/templates.json` korrekt, null bei Fehlerfaellen | 7/7 Unit-Tests gruen | vitest |

---

## Technical NFRs

### Performance

- Materialisierung sollte unter 1 s pro Sprache liegen (3 Adapter-Writes + 1 Folder-mkdir).
- LLM-Uebersetzung blockiert den Wizard fuer max. 30 s; bei Timeout/Fehler weiter mit EN-Fallback.

### Robustness

- Skip-existing ist Default. Force-overwrite verlangt Confirm-Dialog.
- Failed-writes blockieren die Materialisierung nicht (Failed-Liste, Materializer schreibt was er kann).

### Accessibility

- Wizard-Step kann via Tab navigiert werden, Dropdowns/Inputs haben Labels.

---

## Files affected

| Datei | Aenderung |
|---|---|
| `bundled-templates/notes/de/{Quelle,Notiz,Meeting-Notiz} Template.md` | NEU -- DE-Default-Set |
| `bundled-templates/notes/en/{Source,Note,Meeting Note} Template.md` | NEU -- EN-Default-Set |
| `bundled-templates/notes/quelle-template.md`, `meeting-notiz-template.md` | DELETE -- alte flat-Templates |
| `esbuild.config.mjs` | Generator walks `bundled-templates/notes/{lang}/*.md`, emittiert `BUNDLED_NOTE_TEMPLATES` (lang-segmented) |
| `src/_generated/bundled-templates.ts` | Auto-generiert, neue Form |
| `src/types/settings.ts` | `quellenNotizTemplate` + `templatesLanguage` Felder + Defaults |
| `src/core/utils/templatesFolder.ts` | NEU -- `resolveCoreTemplatesFolder` |
| `src/core/utils/__tests__/templatesFolder.test.ts` | NEU -- 7 Tests |
| `src/core/templates/TemplateMaterializer.ts` | NEU -- Materializer-Klasse mit skip/force/translator |
| `src/core/templates/__tests__/TemplateMaterializer.test.ts` | NEU -- 8 Tests |
| `src/core/templates/translateTemplate.ts` | NEU -- `makeTemplateTranslator` wrapper um aktives Modell |
| `src/ui/modals/FirstRunWizardModal.ts` | Neuer 'templates'-Step + State + advance-Hook + applyTemplatePathsToSettings |
| `src/ui/settings/VaultTab.ts` | Neues quellenNotizTemplate-Feld + Re-materialize-Button + handleRematerializeTemplates |

---

## Verification

1. Unit-Tests: `npx vitest run src/core/utils/__tests__/templatesFolder.test.ts src/core/templates/__tests__/TemplateMaterializer.test.ts` -- 15/15 green.
2. Build + Deploy: `npm run build` -- clean, 6 note templates emitted.
3. First-Run mit frischem `data.json`: Templates-Step sichtbar, Folder auto-detected (`Tools & Settings/Templates`), Sprache "Deutsch" gewaehlt, Toggle an -> Materialisierung schreibt 3 Templates, Notice zeigt "3 written".
4. Wiederholung: dieselben Templates -> Notice zeigt "0 written, 3 skipped".
5. Re-materialize-Button im Vault-Tab -> Confirm-Dialog, OK (skip-existing) oder Overwrite -> erwartetes Verhalten.
6. Custom-Sprache "French": Templates landen uebersetzt; ohne aktives Modell: EN-Fallback mit Notice.
