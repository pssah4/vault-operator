# Epic: Skills-Konsolidierung und Plugin-as-Skill Reliability

> **Epic ID**: EPIC-29
> **Feature Prefix**: FEAT-29-XX
> **Business Alignment**: User-getrieben aus Session-Diskussion 2026-05-20, kein dediziertes BA-Dokument. Schliessung der Plugin-Skill-Luecke von EPIC-22 und Daten-Ordner-Konsolidierung.
> **Scope**: MVP (Refactor + neue Capabilities, alle vier Wellen in einem Epic)

## How-Might-We

How might we Plugin-Skills, User-Skills und Builtin-Skills unter einem konsistenten Format und einem einzigen Daten-Ordner zusammenfuehren, so dass bestehende Anthropic-Skills nahtlos importiert werden, der Agent und der User produktiv neue Skills erzeugen koennen, Skill-Aenderungen rueckholbar bleiben und keine Race-Conditions, Stale Snapshots oder unklare Datenpfade die Zuverlaessigkeit beeintraechtigen?

## Epic Hypothesis Statement

Fuer Power-User des Vault Operators, die heute auf drei parallele Daten-Ordner (`.obsilo-vault`, `.obsidian-agent`, `.vault-operator`) und zwei nicht-konvergierende Skill-Formate (File-basierte Plugin-Skills, Folder-basierte User-Skills) treffen und deshalb erleben, dass installierte Plugins als Skills mal funktionieren und mal still versagen, verspricht EPIC-29 eine konsolidierte Skill-Infrastruktur. Sie verlegt alle Plugin-Daten unter den kanonischen Pfad `.vault-operator/`, migriert die rund 138 File-basierten Plugin-Skills auf das Anthropic-konforme Folder-Format mit `SKILL.md`, bringt eine Live-Probe-Architektur statt periodischem Polling, macht Plugin-Command-Ausfuehrung sichtbar via Notice-Capture, stattet den Agent mit einem skill-creator-Builtin-Skill sowie einem skill-translator aus (damit externe Anthropic-Skills mit Python-Skripten automatisiert in Sandbox-taugliches JavaScript ueberfuehrt werden), versionsiert jeden Skill mit Snapshot-Restore und macht Skills explizit komponierbar mit anderen Skills und MCP-Servern. Im Gegensatz zum heutigen Status, in dem EPIC-22 das User-Skill-System bereits auf Anthropic-Format umgestellt hat, das Plugin-Skill-System aber unveraendert geblieben ist, vereint diese Initiative beide Subsysteme unter derselben Discovery, demselben Validator und derselben Sandbox-Bridge, so dass Plugin-Funktionalitaet und User-Workflows vom gleichen Modell-Pattern profitieren.

## Business Outcomes (messbar)

1. **Plugin-Skill-Reliability**: Anteil der `execute_command`-Aufrufe ohne stille Fehlschlaege steigt von heute geschaetzt 80% auf ueber 98%, gemessen ueber Notice-Capture-Logs an 100 stichprobenartigen Command-Ausfuehrungen vor und nach Welle 2.
2. **Skill-Discovery-Latenz**: Zeit vom Plugin-Enable bis zur Skill-Sichtbarkeit fuer den Agent sinkt von heute 0 bis 5 Sekunden (Polling) auf unter 100 Millisekunden (event-driven).
3. **Daten-Ordner-Konvergenz**: Anzahl aktiver Plugin-Daten-Ordner sinkt von 3 auf 1, gemessen per Migration-Helper-Report nach Welle 1.
4. **Skill-Authoring-Adoption**: Skills mit echtem Folder-Ecosystem (`scripts/` oder `references/` vorhanden) steigt von heute 1 von 8 auf ueber 50% nach drei Monaten Verfuegbarkeit von skill-creator.
5. **Skill-Versions-Sicherheitsnetz**: 100% der durch skill-creator oder skill-translator geschriebenen Skill-Aenderungen erzeugen automatisch einen wiederherstellbaren Snapshot, kein manueller Backup-Schritt mehr noetig.

## Leading Indicators

- Migrations-Erfolg: alle Plugin-Skill-Files nach Welle 1 ohne Datenverlust im neuen Layout vorhanden, Migration-Report mit 0 errors.
- probe_plugin-Adoption: nach Welle 2 wird probe_plugin bei jedem ersten Plugin-Use pro Session aufgerufen, sichtbar in Tool-Call-Telemetry.
- skill-translator-Konversion: zwei prominente Anthropic-Skills (pdf, pptx) konvertieren sich entweder vollstaendig oder zeigen einen klaren partial-translation-Hinweis vor dem Schreiben.
- Snapshot-Nutzung: Anzahl der ueber die Versions-Liste durchgefuehrten Restores pro Monat (Indikator, dass die Versionierung adoptiert wird).
- Composability-Nutzung: Anzahl der Skills die andere Skills oder MCP-Server aufrufen, Anteil > 20% nach Welle 4.

## Critical Hypotheses

| Ref | Hypothese | Validiert durch Feature | Status |
|---|---|---|---|
| H-01 | Notice-Capture macht silent Command-Failures sichtbar ohne Plugin-Internals zu brechen. | FEAT-29-04 | Open |
| H-02 | Live-Probe statt Polling reduziert die Skill-Discovery-Latenz auf unter 100ms, ohne in Race-Conditions mit langsam ladenden Plugins zu geraten. | FEAT-29-03 | Open |
| H-03 | Python-zu-JS-Konversion liefert fuer die Top-5 Anthropic-Skill-Patterns (pdf, pptx, docx, xlsx, json) eine voll funktionale JavaScript-Version. | FEAT-29-08 | Open |
| H-04 | Ein Builtin-skill-creator-Skill wird vom Modell zuverlaessig getriggert, sobald ein User-Prompt nach Skill-Erstellung klingt, ohne dass es ein dediziertes Tool dafuer braucht. | FEAT-29-05 | Open |
| H-05 | Snapshot-basierte Versionierung pro Skill-Aenderung kostet weniger als 5% Storage-Overhead und ist fuer Restore < 2 Sekunden ausfuehrbar. | FEAT-29-09 | Open |
| H-06 | Skill-to-Skill und Skill-to-MCP-Komposition wird vom Modell innerhalb eines Skill-Bodies zuverlaessig orchestriert, ohne Hard-Loops oder unkontrollierte Rekursion. | FEAT-29-10 | Open |
| H-07 | Cross-Vault-Transfer ueber selektives Backup-Tool ist fuer User-Workflow ausreichend, automatisches Cross-Vault-Sharing ist nicht noetig. | FEAT-29-12 | Open |

## MVP Features

| Feature ID | Name | Priority | Effort | Welle |
|---|---|---|---|---|
| FEAT-29-01 | Folder-Konsolidierung (`.vault-operator` als kanonisch) | P0 | M | 1 |
| FEAT-29-02 | Plugin-Skill-Format-Migration (File zu Folder/SKILL.md) | P0 | M | 1 |
| FEAT-29-03 | Unified Discovery und probe_plugin-Tool | P0 | M | 2 |
| FEAT-29-04 | Execution Visibility (Notice-Capture) | P0 | S | 2 |
| FEAT-29-05 | Skill-Creator-Builtin-Skill | P1 | M | 3 |
| FEAT-29-06 | Sandbox-JS als First-Class-Skill-Pattern | P1 | S | 3 |
| FEAT-29-11 | Lucide Toolbox Icon und Customize-Section-Refinement | P2 | S | 3 |
| FEAT-29-07 | Permission und Latency Polish | P2 | S | 4 |
| FEAT-29-08 | Skill-Translator-Builtin-Skill | P1 | M | 4 |
| FEAT-29-09 | Skill-Versionierung (Snapshot und Restore) | P1 | M | 4 |
| FEAT-29-10 | Composability (Skill-to-Skill und Skill-to-MCP) | P1 | M | 4 |
| FEAT-29-12 | Backup- und Export-Tool fuer Plugin-State | P1 | M | 4 |

**Priority:** P0-Critical (Foundation und Reliability ohne die nichts laeuft), P1-High (Authoring- und Ecosystem-Wertschoepfung), P2-Medium (UX-Polish).
**Effort:** S (1 bis 2 Sprints), M (3 bis 5 Sprints).
**Wellen-Reihenfolge:** 1 -> 2 -> 3 -> 4. Welle 4 buendelt alle Features die auf der technischen Foundation aufbauen.

## Explicit Out-of-Scope

- Eigener Skill-Marketplace oder Online-Registry. Skill-Distribution bleibt Zip-Drop oder Folder-Copy. Folge-Initiative: EPIC-31.
- GitHub-PR-Workflow fuer Skill-Submissions. Folge-Initiative: EPIC-31.
- Anthropic-Marketplace-Discovery-UI. Folge-Initiative: EPIC-31.
- Workflow-Builder fuer Skill-Sequenzen (n8n-artig). Folge-Initiative: EPIC-30.
- Rules-zu-Additional-Instructions-Migration. Folge-Initiative: EPIC-30.
- Migration der `knowledge.db` zwischen Folder-Pfaden ohne Backup. Migration legt vorher zwingend einen Backup-Snapshot an.
- Signaturverifikation fuer importierte Skills. Sandbox-Approval bleibt der Schutzmechanismus.
- Aenderungen am laufenden EPIC-22-Code-Pfad fuer User-Skills jenseits der Migration. EPIC-29 nutzt die EPIC-22-Foundation unveraendert und schliesst nur die Plugin-Luecke.

## Dependencies und Risks

### Dependencies

- **EPIC-22 released**: Folder-Format fuer User-Skills (FEAT-22-01), Skill-Zip-Import (FEAT-22-02), Sandbox-Scripts (FEAT-22-03), Coordinator-Pattern (FEAT-22-04) bilden die Basis.
- **Sandbox-Executor zuverlaessig**: laut Memory `EsbuildWasmManager` mit ESM-Bundles ueber esm.sh und jsdelivr-Fallback. Vorausgesetzt fuer FEAT-29-06, FEAT-29-08 und FEAT-29-10.
- **FEAT-05-07 Konfigurierbarer Agent-Folder (ADR-072)**: per Setting `agentFolderPath` laesst sich der kanonische Pfad setzen. Migration in FEAT-29-01 nutzt diesen Mechanismus.
- **EPIC-26 Advisor-Pattern**: Tier-Klassifikator (mid-Tier default, flagship on-demand) wird in FEAT-29-05 und FEAT-29-08 um eine Skill-getriggerte Eskalation erweitert.
- **FEAT-01-07 Checkpoints**: Snapshot-Pattern dient als Vorbild fuer Skill-Versionierung in FEAT-29-09 (kein direkter Code-Reuse, aber bewaehrter Architektur-Ansatz).
- **MCP-Integration (EPIC-04)**: bestehender MCP-Client-Code wird in FEAT-29-10 fuer Skill-to-MCP-Aufrufe wiederverwendet.

### Risks

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| Migration der 138 Plugin-Skill-Files korrupt | M | H | Migration als Transaktion, alter Pfad bleibt bis Validierung gruen, Backup-Snapshot der gesamten `.obsilo-vault/`-Struktur vor dem ersten Schreiben. |
| Wechsel auf `.vault-operator/` bricht andere Subsysteme | M | H | Vollstaendige Code-Inventur aller Folder-Referenzen vor Migration, Settings-Pfad-Migration mit Doppel-Lesen-Fenster waehrend des Uebergangs. |
| probe_plugin-Disziplin nicht eingehalten | M | M | Hard-Guard in execute_command: bei "not found" automatisch probe_plugin-Vorschlag in der Error-Message, plus klare Protokoll-Anweisung im stabilen Prompt-Prefix. |
| Notice-Capture-Patch bricht Plugin-internen Notice-Code | L | M | Capture-Patch nur waehrend aktiver `execute_command`-Ausfuehrung, danach automatisch wiederhergestellt. Fail-soft mit Log-Warnung wenn Plugin eigenen Notice-Override hat. |
| Python-zu-JS-Translator produziert subtile Bugs | H | M | Dry-Run mit Smoke-Test pro Skript vor dem Schreiben, User-Modal bei partial-translation mit klarem Abbruch-Pfad und Verweis auf skill-creator. |
| Flagship-Routing macht Skill-Authoring teuer | M | M | Skill-Creator und Translator sind explizite User-Aktionen, kein automatisches Flagship-Triggering im Background. Eskalation nur waehrend aktivem Skill-Run. |
| EPIC-22-Setup-Annahmen veralten still | L | M | Bei jeder FEAT-29-XX-Implementierung explizite Re-Validierung der EPIC-22-API-Vertraege (Skill-Folder-Layout, Sandbox-Aufruf-Schnittstelle). |
| Versionierung blaeht Storage massiv auf | M | M | Nur Diff-Snapshots (nicht volle Kopien), Retention-Policy (z.B. letzte 20 Versionen plus alle markierten Tags), Konfigurierbar via Setting. |
| Skill-zu-Skill-Loops oder unbeschraenkte Rekursion | M | H | Max-Depth-Limit (z.B. 5 Levels), Cycle-Detection ueber Aufruf-Stack, klare Fehlermeldung bei Limit-Ueberschreitung. |
| Skill-zu-MCP-Bridge oeffnet uebersehene Permission-Pfade | M | M | MCP-Aufrufe aus Skills laufen durch die bestehende MCP-Approval-Kette, kein Bypass. Audit-Log pro Aufruf. |

## Architektur-Beruehrungspunkte

- **ADR (neu) Folder-Konsolidierung**: kanonischer Pfad `.vault-operator/`, Migrations-Strategie aus den drei alten Pfaden, Doppel-Lesen-Fenster, Backup-Policy. Wird in FEAT-29-01 ausgearbeitet.
- **ADR (neu) Plugin-as-Skill Discovery**: Live-Probe-Architektur, einheitliche Frontmatter-Discovery, Wegfall des periodischen Pollings, event-driven Refresh. Wird in FEAT-29-03 ausgearbeitet.
- **ADR (neu) Skill-Authoring-Mechanik**: Skill statt Tool fuer Erstellung, manage_skill-Tool wird entfernt, Validator als Discovery-Layer, generisches `run_skill_script` statt code_modules-Pattern. Wird in FEAT-29-05 plus FEAT-29-06 ausgearbeitet.
- **ADR (neu) Python-zu-JS-Translation**: Mapping-Tabelle, Dry-Run-Pass, partial-translation-UX, Bibliotheks-Whitelist. Wird in FEAT-29-08 ausgearbeitet.
- **ADR (neu) Skill-Versionierung**: Snapshot-Format, Retention, Restore-Semantik. Wird in FEAT-29-09 ausgearbeitet.
- **ADR (neu) Composability-Modell**: Skill-Aufruf-Syntax aus Skill-Body, MCP-Bridge-Semantik, Loop-Schutz. Wird in FEAT-29-10 ausgearbeitet.
- **ADR-072 Konfigurierbarer Agent-Folder**: bleibt gueltig, EPIC-29 setzt den Default auf `.vault-operator/` und ergaenzt Migrations-Logik.
- **EPIC-22 Skill-Package Ecosystem**: bleibt released, EPIC-29 schliesst die offene Luecke (Plugin-Skill-Migration) und baut auf die EPIC-22-Foundation auf.

## Erfolgskriterien (Epic)

| ID | Kriterium | Messung |
|---|---|---|
| EPIC029-SC-01 | Nur noch ein aktiver Plugin-Daten-Ordner nach Welle 1 | Manueller `ls`-Check, Migration-Report |
| EPIC029-SC-02 | Alle Plugin-Skills im neuen Folder/SKILL.md-Format | Count der `.vault-operator/skills/plugin/*/SKILL.md` matcht installed-plugin-count |
| EPIC029-SC-03 | execute_command-Visibility deckt mindestens 95% der Failure-Modi auf | Stichprobe ueber 100 Aufrufe |
| EPIC029-SC-04 | probe_plugin wird vom Modell vor erstem Plugin-Use pro Session aufgerufen | Tool-Call-Telemetry ueber 20 Sessions |
| EPIC029-SC-05 | skill-creator wird vom Modell getriggert bei "create skill"-aehnlichen Anfragen | Manuelle Verifikation an 10 Test-Prompts |
| EPIC029-SC-06 | Anthropic-Skill aus offiziellem Repo (pdf oder pptx) konvertiert vollstaendig oder bricht mit klarem User-Hinweis ab | Manueller Test |
| EPIC029-SC-07 | Keine Regression bei den 8 bestehenden User-Skills | Smoke-Test ueber alle vorhandenen User-Skills |
| EPIC029-SC-08 | Skill-Version-Restore funktioniert in unter 2 Sekunden | Manueller Test mit 20 Versionen |
| EPIC029-SC-09 | Skill-to-Skill-Aufruf funktioniert ueber mindestens 2 Ebenen, Cycle-Detection greift bei Ebene 6 | Test mit synthetischem Loop-Skill |
| EPIC029-SC-10 | Skill-to-MCP-Aufruf wird durch die bestehende Approval-Kette gefuehrt | Manueller Test mit einem MCP-Server |
