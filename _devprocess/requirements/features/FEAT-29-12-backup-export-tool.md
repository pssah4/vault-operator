---
id: FEAT-29-12
title: Backup- und Export-Tool fuer Plugin-State (selektiv, ZIP, Auto-Daily)
epic: EPIC-29
priority: P1
effort: M
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-01]
created: 2026-05-20
---

# Feature: Backup- und Export-Tool fuer Plugin-State

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-12
> (status, phase, claim, last-change leben dort).

## Feature description

Nach FEAT-29-01 lebt alles Plugin-State vault-local in `{vault}/.vault-operator/`. Damit faellt der automatische Cross-Vault-Sharing-Effekt weg, den vault-parent vorher (mit Einschraenkungen) hatte. Cross-Vault-Sharing wird durch ein dediziertes Backup- und Export-Tool ersetzt: User waehlt selektiv welche Bereiche (Skills, Memory, History, Rules, Workflows, alle) und exportiert in eine ZIP-Datei. Import laedt das ZIP in einen anderen Vault. Damit ist Cross-Vault-Transfer ein User-Werkzeug, kein Side-Effect der Storage-Lokation. Zusaetzlich ist das Backup-Tool ohnehin sinnvoll fuer Datensicherung, vor groesseren Aenderungen, vor Plugin-Updates.

## Benefits hypothesis

**Wir glauben dass** ein selektives Backup-Export-Tool
**folgende messbare Wirkung erzielt:**

- User hat Datensicherung in der Hand, nicht abhaengig von Filesystem-Quirks
- Cross-Vault-Transfer wird transparent und kontrolliert
- Plugin-Updates die Daten anfassen koennen vor Backup laufen

**Wir wissen dass wir erfolgreich sind, wenn:**

- ZIP-Export-Datei kann auf einem anderen Vault importiert werden und das Plugin sieht die Daten
- Selektive Auswahl funktioniert (z.B. nur Skills, oder nur Memory)
- Auto-Daily Backup laeuft im Hintergrund ohne User-Eingriff (optional)

## Jobs to be Done

| Job-Typ | Job | Story |
|---|---|---|
| Functional | User will Skills zwischen Vaults uebertragen | Story 1 |
| Emotional | User will Vertrauen dass Plugin-Daten gesichert sind | Story 2 |
| Social | User will einen Vault-Klon eines Kollegen schnell auf seinem Setup laden | Story 3 |

## User stories

### Story 1: Skills zwischen Vaults transferieren (Functional Job)

**Als** Power-User mit mehreren Vaults
**moechte ich** meine eigenen Skills aus einem Vault in einen anderen uebernehmen,
**damit** ich nicht jedes Mal von vorne anfangen muss.

### Story 2: Vor Plugin-Update backuppen (Emotional Job)

**Als** User vor einem groesseren Plugin-Update mit Datenmigrations-Phase
**moechte ich** vorher ein vollstaendiges Backup machen,
**damit** ich bei einem Migrations-Fehler zurueckholen kann.

### Story 3: Vault-Klon-Setup teilen (Social Job)

**Als** User der einem Kollegen sein Vault-Operator-Setup zeigt
**moechte ich** ein ZIP mit meinen Skills, Workflows und Rules schicken,
**damit** der Kollege es importieren und schnell starten kann.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | User kann selektiv waehlen welche Bereiche exportiert werden (Skills, Memory, History, Rules, Workflows, Alles) | Mehrfach-Auswahl im UI | Manueller Test |
| SC-02 | ZIP-Export funktioniert und ist auf einem anderen Vault importierbar | Round-Trip-Test mit allen Bereichen | Test mit zweitem Vault |
| SC-03 | Import handhabt Konflikte (gleichnamiger Skill im Ziel-Vault vorhanden) klar | Modal fragt User: ueberschreiben oder ueberspringen | Manueller Test |
| SC-04 | Optional Auto-Daily Backup laeuft im Hintergrund | Backup-Datei wird einmal taeglich angelegt | Test mit aktiviertem Setting |
| SC-05 | Backup-Datei ist verifizierbar (keine korrupten ZIPs) | Hash und Inhalt-Liste pro Backup | Verifikation gegen Original |

---

## Technical NFRs

### Performance

- Export von 100 Skills + Memory-DB unter 30 Sekunden
- Import in einen leeren Vault unter 30 Sekunden
- Auto-Daily-Backup im Hintergrund mit minimaler UI-Blocking-Time

### Security

- Export enthaelt keine sensitiven Secrets (API-Keys werden gefiltert oder gewarnt)
- Import-ZIPs werden validiert (Format-Pruefung, keine Path-Traversal)
- User-Modal bei Import explizit fragt was passieren soll bei Konflikten

### Scalability

- Bis zu 5 GB Backup-Daten (knowledge.db plus memory.db plus history plus rest)
- Selektive Auswahl reduziert Backup-Groesse auf das Noetige

### Availability

- Auto-Backup-Failures werden geloggt aber blockieren nicht den Plugin-Boot
- Bei Disk-Full klare Fehlermeldung, kein partial-Backup

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1:** Konflikt-Auflösung bei Import

- Begruendung: gleichnamiger Skill, gleichnamige Workflow, gleicher Memory-Eintrag im Ziel-Vault. Default-Verhalten muss klar sein.
- Impact: Import-UX, ggf. Pre-Import-Dry-Run der Konflikte zeigt.
- Qualitaetsattribut: User-Trust, Data-Safety.

**CRITICAL ASR #2:** Secret-Filterung beim Export

- Begruendung: data.json kann API-Keys enthalten (Provider-Konfigs). Ein Export der diese mitnimmt ist ein Security-Risiko wenn das ZIP geteilt wird.
- Impact: Export-Logik, ggf. dediziertes Setting "API-Keys mitexportieren ja/nein" mit Default nein.
- Qualitaetsattribut: Security.

### Constraints

- ZIP als universelles Container-Format (keine Plugin-Bibliothek-Dependency, JSZip ist bereits im Plugin verfuegbar)
- Auto-Daily ist optionales Setting, nicht Default aktiv (User muss aktivieren)

### Open questions for architect

- Wo werden Auto-Daily-Backups gespeichert (Vault-Folder, Plugin-Daten-Verzeichnis, User-konfigurierbar)?
- Wie viele Auto-Daily-Backups behalten (Retention-Policy)?
- Soll Import den Ziel-Vault-Zustand vor Import als Pre-Import-Snapshot sichern?
- Welche Bereiche sind exportierbar? Inventur noetig: Skills, Memory, History, Rules, Workflows, Episodes, KnowledgeDB?

---

## Definition of Done

### Functional

- [ ] Alle User stories umgesetzt
- [ ] Alle Success criteria erfuellt (verifiziert)

### Quality

- [ ] Unit-Tests fuer Export-Logik (selektive Auswahl, ZIP-Erstellung)
- [ ] Unit-Tests fuer Import-Logik (Konflikt-Resolution, Validierung)
- [ ] Integrations-Test: Round-Trip mit allen Bereichen
- [ ] Edge-Case-Test: Backup auf Disk-Full, Import von korruptem ZIP

### Documentation

- [ ] Backlog row updated to status `Done`, commit SHA recorded
- [ ] Settings-UI dokumentiert Backup-Section mit Erklaerung Optionen

---

## Hypothesis validation

Nicht anwendbar.

---

## Dependencies

- **FEAT-29-01 Folder-Konsolidierung**: Alles Plugin-State liegt vault-local an einem Ort. Backup-Tool braucht das einheitliche Layout.
- **EPIC-22 Skill-Format**: Skills sind Anthropic-konforme Folder, ZIP-Import-Export ist trivial fuer Skills.

## Assumptions

- JSZip ist im Plugin verfuegbar (oder leicht hinzufuegbar via npm)
- User akzeptiert dass Cross-Vault-Sharing nicht automatisch laeuft sondern via Backup-Tool

## Out of scope

- Cloud-basiertes Backup (S3, Dropbox-API etc.)
- Differentielle Backups (immer Vollbackup, einfacher)
- Backup-Verschluesselung (Out-of-Scope, User kann ZIP-Datei extern verschluesseln)

---

## Code Pointer (optional)

ARCHITECTURE.map concept: `backup-export-tool` (neu in dieser Implementierung).
