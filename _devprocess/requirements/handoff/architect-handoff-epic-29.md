# Architect Handoff fuer EPIC-29 Skills-Konsolidierung und Plugin-as-Skill Reliability

> Handoff-Dokument von `/requirements-engineering` an `/architecture`.
> Aggregiert alle ASRs, NFR-Summary, Constraints, Open Questions fuer EPIC-29.
> EPIC-30 (Marketplace) und EPIC-31 (Workflow-Builder) sind Skeleton-Epics und bekommen eigene Handoffs nach Abschluss EPIC-29 Welle 2 bzw. Welle 3.

**Status:** Ready for Architect
**Last update:** 2026-05-20
**Author:** Requirements Engineer (Session-driven)

---

## 1. Scope

- **Scope:** MVP, Refactor plus neue Capabilities, vier Wellen
- **Main goal:** Plugin-Skills und User-Skills unter einem konsistenten Anthropic-konformen Format und einem einzigen Daten-Ordner zusammenfuehren, mit zuverlaessiger Discovery, ausfuehrbarer Sandbox-Integration, Versions-Sicherheitsnetz und expliziter Composability.
- **Target release:** mehrere Wellen, jede deploybar. Welle 1 (Foundation) idealerweise v2.12.0, Welle 4 (Polish + Authoring) bis v2.14.0.

## 2. Architecturally Significant Requirements (ASRs)

| ID | Source FEATURE | Classification | Constraint | Notes |
|---|---|---|---|---|
| ASR-29-01 | FEAT-29-01 | Critical | Doppel-Lesen-Fenster waehrend Folder-Migration: jeder Lese-Pfad muss waehrend Migration alten UND neuen Pfad konsultieren | Verhindert Datenverlust bei Plugin-Reload mitten in der Migration |
| ASR-29-02 | FEAT-29-01 | Critical | Backup-Snapshot vor erstem Schreiben: knowledge.db plus alle Skills muessen wiederherstellbar sein | knowledge.db ist 288 MB, Reindex kostet OpenRouter-Tokens |
| ASR-29-03 | FEAT-29-02 | Critical | Idempotenz der Plugin-Skill-Migration | Plugin-Reload kann mid-flight triggern, Mehrfach-Lauf darf nicht korrumpieren |
| ASR-29-04 | FEAT-29-02 | Moderate | Frontmatter strikt auf Anthropic-Standard (nur name plus description) | Folgt Anthropics canonical skill-creator |
| ASR-29-05 | FEAT-29-03 | Critical | Live-Probe-Modell statt Snapshot-Polling | Polling-Snapshots sind die Wurzel der heutigen Drift-Probleme |
| ASR-29-06 | FEAT-29-03 | Critical | Event-driven Discovery (Plugin-Enable/Disable und Vault-File-Events) | Polling skaliert nicht und ist Quelle der Latenz |
| ASR-29-07 | FEAT-29-03 | Moderate | SKILL.md als Description-Anker, Commands live aus probe_plugin | Token-Effizienz und Aktualitaet |
| ASR-29-08 | FEAT-29-04 | Critical | Notice-Capture darf Plugin-Internals nicht brechen | Manche Plugins haben eigenen Notice-Wrapper, Fail-soft erforderlich |
| ASR-29-09 | FEAT-29-04 | Moderate | Strukturiertes Notice-Schema im tool_result | Agent muss programmatisch entscheiden koennen |
| ASR-29-10 | FEAT-29-05 | Critical | Skill statt Tool fuer Erstellung | Multi-Turn-Workflow mit Modell-Interpretation, Tool waere nicht portabel |
| ASR-29-11 | FEAT-29-05 | Critical | Validator als Discovery-Layer | Validation muss fuer alle Skill-Quellen greifen, nicht nur fuer skill-creator-Output |
| ASR-29-12 | FEAT-29-05 | Moderate | TaskRouter-Eskalation auf Flagship bei Skill-Creation-Triggern | Komplexe Code-Generation profitiert von Frontier-Modell |
| ASR-29-13 | FEAT-29-06 | Critical | Generisches run_skill_script statt code_modules-Tool-Registrierung | Vermeidet custom_*-Sprawl in Tool-Registry |
| ASR-29-14 | FEAT-29-06 | Moderate | Bundle-Caching fuer wiederholte Skript-Aufrufe | Performance unter 50ms ab dem zweiten Aufruf |
| ASR-29-15 | FEAT-29-08 | Critical | Dry-Run-Pass vor Schreiben bei Translation | Verhindert User-Ueberraschung durch unvollstaendigen Skill |
| ASR-29-16 | FEAT-29-08 | Critical | Mapping-Tabelle als versionierter Datenbestand | Pflegbarkeit und Erweiterbarkeit |
| ASR-29-17 | FEAT-29-09 | Critical | Diff-basierte Snapshots statt voller Kopien | Storage und Sync-Last (iCloud) drastisch reduzieren |
| ASR-29-18 | FEAT-29-09 | Moderate | Atomic Snapshot-Plus-Write als Transaktion | Daten-Integritaet |
| ASR-29-19 | FEAT-29-10 | Critical | Cycle-Detection und Max-Depth-Limit | Verhindert unendliche Rekursion |
| ASR-29-20 | FEAT-29-10 | Critical | MCP-Approval-Kette nicht umgehbar bei Skill-zu-MCP | Security, User-Control |
| ASR-29-21 | FEAT-29-10 | Moderate | Kontext-Isolation pro Sub-Skill | Sub-Skill bekommt nur explizite Inputs, nicht Parent-State |

## 3. Non-Functional Requirements summary

| Kategorie | Target | Source FEATUREs |
|---|---|---|
| Performance (Skill-Discovery-Latenz) | unter 100 ms nach Plugin-Enable | FEAT-29-03 |
| Performance (probe_plugin) | unter 50 ms fuer Plugin mit bis zu 100 Commands | FEAT-29-03 |
| Performance (Notice-Capture-Overhead) | unter 5 ms pro Command | FEAT-29-04 |
| Performance (Folder-Migration) | unter 60 Sekunden fuer 300 MB Vault | FEAT-29-01 |
| Performance (Skill-Snapshot-Anlage) | unter 100 ms pro Skill | FEAT-29-09 |
| Performance (Restore) | unter 2 Sekunden | FEAT-29-09 |
| Performance (Skript-Bundle-Erstellung) | unter 500 ms initial, unter 50 ms cached | FEAT-29-06 |
| Storage (Versions-Overhead pro Skill) | unter 5% der Original-Groesse | FEAT-29-09 |
| Security (Sandbox-Approval-Kette) | nicht umgehbar | FEAT-29-06, FEAT-29-10 |
| Security (MCP-Approval-Kette) | nicht umgehbar bei Skill-zu-MCP | FEAT-29-10 |
| Security (Backup-Pfad) | ausserhalb iCloud-Sync | FEAT-29-01 |
| Reliability (silent failures bei execute_command) | unter 2% verbleibend | FEAT-29-04 |
| Reliability (NONE-klassifizierte Plugins) | 0 nach Bootstrap | FEAT-29-03 |
| Compatibility (Plugin-Skill-Portabilitaet) | Skill kann nach Claude Code kopiert werden und als Doku-Skill funktionieren | FEAT-29-02 |
| Compatibility (Cross-Platform Folder-Open) | macOS, Windows, Linux | FEAT-29-11 |

## 4. Constraints

- **Stack constraints**: TypeScript (strict), Obsidian-Plugin-API, esbuild-Build, Electron-Renderer-Process, Sandbox via EsbuildWasmManager (ESM-Bundles vom CDN).
- **Integration constraints**: Obsidian-Plugin-Events (`app.plugins.on`), Notice-API (`window.Notice`), Vault-Events (`app.vault.on`), MCP-Client (existing, Wiederverwendung Pflicht).
- **Operational constraints**: Plugin laeuft im Vault des Users, iCloud-Sync ist aktiv, Daten-Migration darf weder Sync-Konflikte ausloesen noch Plugin-Boot verzoegern.
- **Team constraints**: Single-Maintainer, alle vier Wellen werden sequenziell entwickelt, nicht parallel.

## 5. Open Questions

- Backup-Pfad: `~/.vault-operator-backups/` (User-Home, ausserhalb iCloud) oder `<vault>/.vault-operator-backup/` (im Vault, aber von iCloud nicht synct)? FEAT-29-01.
- Retention-Policy fuer Folder-Migrations-Backups? Letzten 3 oder Zeitbasiert? FEAT-29-01.
- Wie wird der `.vault-operator/`-Konflikt zwischen aktuellem Inhalt (assets/, runtime/) und neuem Ziel-Inhalt (Skills, knowledge.db) geloest? Sub-Folder? FEAT-29-01.
- Wo liegen die kuratierten `references/commands.md` fuer Top-Plugins (Excalidraw, Dataview, Templater)? Im Plugin-Bundle oder beim Eager-Generate angelegt? FEAT-29-02.
- Was passiert mit `.readme.md`-Files neben den `.skill.md`-Files? Migration nach `references/readme.md` oder verwerfen? FEAT-29-02.
- Bietet `app.plugins.on("enabled" | "disabled")` ein stabiles Event-Interface, oder muss man auf `app.plugins.manifests`-Reflection lauschen? FEAT-29-03.
- File-Watcher fuer Skill-Verzeichnisse: `app.vault.on("create"/"modify"/"delete")` filtern? FEAT-29-03.
- probe_plugin-Caching: per-Aufruf live oder TTL-Cache pro plugin_id? FEAT-29-03.
- Notice-Capture: nur waehrend des Command-Calls oder auch 1-2 Sekunden danach (asynchrone Effekte)? FEAT-29-04.
- Wie unterscheiden wir Success-Notices von Error-Notices? Heuristik via Substring oder Notice-Severity-Field? FEAT-29-04.
- skill-creator-Builtin: gitignored im Plugin-Bundle oder beim ersten Start in `.vault-operator/skills/builtin/` extrahiert? FEAT-29-05.
- Routing-Override-Mechanik: Regex im TaskRouter oder Embedding-Match auf Skill-Description? FEAT-29-05.
- Bundle-Cache-Lokation: In-Memory oder persistent in `.vault-operator/runtime/bundle-cache/`? FEAT-29-06.
- Run_skill_script args-Schema: JSON mit Validation oder positional? FEAT-29-06.
- Migration-Pfad fuer bestehende custom_*-Tools nach scripts/-Folder? FEAT-29-06.
- Auto-Promotion: ab welcher Anzahl Approvals (3 als Default-Vorschlag)? FEAT-29-07.
- Mapping-Tabelle fuer Python-zu-JS: Speicherort und Pflege? FEAT-29-08.
- Partial-translation-User-Modal: Granular pro Skript oder global pro Skill? FEAT-29-08.
- Snapshot-Format: file-by-file Diff oder Tarball-Diff? FEAT-29-09.
- Restore-Strategie: in-place oder Rename? FEAT-29-09.
- Skill-zu-Skill-Aufruf-Syntax in SKILL.md: Prosa oder klar parsbares Pattern? FEAT-29-10.
- Sub-Skill-Kontext-Frame: spawnSubtask oder Inline-Run mit eigenem Message-Buffer? FEAT-29-10.
- Folder-Open im OS-default-FS-Browser vs. in-Plugin Folder-Anzeige? FEAT-29-11.

## 6. Dialog

### Questions from Architect to RE

| ID | Date | Question | Addressed by | Status |
|---|---|---|---|---|

### Answers from RE

| ID | Date | Answer | Affected artifacts | Status |
|---|---|---|---|---|

### Dialog rules

- **Kein Blocker.** Pending Eintraege stoppen die ADR-Arbeit des Architekten nicht. Nur die ADR die von der Frage abhaengt wartet.
- **Erst selbst beantworten.** Beim Skill-Session-Start zuerst aus Code und bestehenden Doku versuchen zu antworten, bevor an den User eskaliert wird.
- **Eine Frage pro Session an den User.** Bei nicht selbst beantwortbaren Fragen alle in einer AskUserQuestion bundeln.
- **Append-only.** Antworten ueberschreiben Fragen via Status=Resolved. Eintraege werden nie geloescht.

---

## 7. Ready-to-design checklist

- [x] Alle Critical ASRs haben quantifizierte Constraints (Performance- und Reliability-Targets pro ASR im FEATURE definiert)
- [x] NFR-Tabelle hat Zahlen, keine Adjektive
- [x] Jedes Feature aus EPIC-29 ist in Section 2 oder 3 vertreten
- [x] Open Questions sind kategorisiert (per FEAT-Referenz zuordenbar, alle async, kein Blocker)
- [x] Handoff in kanonischem Stil geschrieben (keine Em-Dashes, keine AI-Vokabeln, deutsche Umlaute)
