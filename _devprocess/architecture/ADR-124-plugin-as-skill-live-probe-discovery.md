---
id: ADR-124
title: Plugin-as-Skill Live-Probe Discovery statt periodischem Polling
date: 2026-05-20
deciders: [Sebastian, Architekt-Agent]
asr-refs: [ASR-29-03, ASR-29-04, ASR-29-05, ASR-29-06, ASR-29-07]
feature-refs: [FEAT-29-02, FEAT-29-03]
related-adrs: [ADR-14, ADR-75, ADR-116]
supersedes: null
superseded-by: null
---

# ADR-124: Plugin-as-Skill Live-Probe Discovery statt periodischem Polling

## Context

Das heutige Plugin-Skill-Subsystem schreibt einen Datei-pro-Plugin-Snapshot, der von einem periodischen Polling-Job alle paar Sekunden aktualisiert wird. Die Snapshots tragen den Plugin-Command-Katalog und werden ueber den System-Prompt-Praefix dem Modell zur Verfuegung gestellt. Drei Probleme liegen darin verschachtelt: erstens veralten die Snapshots, weil Plugin-Commands sich zur Laufzeit aendern (Lazy-Loading, Plugin-Updates, Settings-getriebene Command-Registrierung). Zweitens entsteht eine Race-Condition zwischen dem Plugin-Boot und einem zu fruehen Polling-Pass, was bei vielen lazy-loadenden Plugins zur Fehl-Klassifizierung fuehrt (NONE statt FULL). Drittens ist das Snapshot-Format nicht Anthropic-konform: es ist eine File pro Plugin im Custom-Format, waehrend User-Skills ueber ADR-75 bereits auf das Folder-mit-SKILL.md-Format umgestellt wurden.

EPIC-22 hatte das Anthropic-Format-Refactor fuer User-Skills durchgezogen, aber Plugin-Skills wurden nicht migriert. Das ist die offene Luecke.

ADR-116 hat das Active-Skills-on-Demand-Pattern eingefuehrt, in dem das Modell selbst entscheidet wann ein Skill-Body geladen wird, ueber einen Tool-Call statt System-Prompt-Inject. Die gleiche Idee passt fuer Plugin-State: statt Snapshot des Plugin-Command-Katalogs im Prompt, ein Tool das den Live-Stand zum Zeitpunkt der Nutzung abfragt.

**Triggering ASR:**
- ASR-29-03 (Critical): Idempotenz der Plugin-Skill-Migration
- ASR-29-05 (Critical): Live-Probe-Modell statt Snapshot-Polling
- ASR-29-06 (Critical): Event-driven Discovery (Plugin-Enable/Disable und Vault-File-Events)
- ASR-29-07 (Moderate): SKILL.md als Description-Anker, Commands live aus probe-Tool
- Quality attribute: Reliability, Data Freshness, Performance

## Decision drivers

- **Vereinheitlichtes Skill-Format**: Plugin-Skills und User-Skills muessen denselben Anthropic-konformen Folder-Mit-SKILL.md-Standard folgen, sonst ist die Skill-Authoring-Toolkette (Skill-Creator, Translator) inkonsistent.
- **Stale-Snapshot-Problem strukturell loesen**: Live-Probe zum Use-Zeitpunkt eliminiert Stale-Snapshots per Definition.
- **Race-Condition-Eliminierung**: Wenn Discovery beim Use stattfindet statt beim Plugin-Boot, gibt es keinen Race mehr.
- **Token-Effizienz im stabilen Prefix**: Der Plugin-Command-Katalog als Snapshot blaeht den Prefix auf und ist trotzdem nicht aktuell. Ein One-Liner pro Plugin im Prefix plus Live-Probe ist beides.
- **Disziplin-Risiko**: Modell muss zuverlaessig vor erstem Plugin-Use die Live-Probe aufrufen. Wenn es das vergisst, fallback noetig.

## Considered options

### Option A: Status quo behalten, nur Polling-Frequenz erhoehen

Polling von fuenf auf eine Sekunde reduzieren, ansonsten Architektur belassen.

- Pro: Minimaler Eingriff.
- Con: Erhoehte CPU-Last, Stale-Snapshot-Problem bleibt, Race-Condition bleibt, Format-Drift zwischen Plugin- und User-Skills bleibt.
- Con: Verstoesst gegen die Architektur-Konvergenz mit ADR-75.

### Option B: Vollstaendige Konvergenz auf Folder/SKILL.md mit Live-Probe-Tool

Plugin-Skills migrieren ins Folder-Format wie User-Skills (eine Folder mit SKILL.md pro Plugin, Frontmatter `name` plus `description`). Polling wird abgeschafft. Discovery laeuft event-driven auf Plugin-Enable und Plugin-Disable-Events plus Vault-File-Watcher auf den Skill-Verzeichnissen. Zusaetzlich kommt ein neues Tool, das zur Modell-Laufzeit die aktuellen Commands und API-Methoden eines Plugins live aus dem laufenden Obsidian-State holt. Im System-Prompt-Praefix steht nur noch der One-Liner pro Plugin, die Commands kommen erst beim Use.

- Pro: Stale-Snapshot strukturell weg.
- Pro: Race weg, weil Discovery beim Use stattfindet.
- Pro: Token-Ersparnis im stabilen Prefix.
- Pro: Format-Konvergenz mit ADR-75.
- Con: Modell muss Probe-Aufruf-Disziplin halten. Bei Vergessen entstehen Halluzinationen.
- Con: Bestehende Plugin-Skill-Files muessen migriert werden, Migration muss verlustfrei sein.

### Option C: Hybrid mit Probe-Cache

Wie Option B, aber Probe-Resultate werden lokal gecached, beispielsweise mit TTL. Erster Probe-Call bei einer Session ist live, weitere lesen aus Cache.

- Pro: Reduzierte Latenz bei wiederholten Aufrufen.
- Con: Cache-Invalidierung bei Plugin-Reload muss separat geloest werden.
- Con: Wiederholter Stale-Risk wenn Cache-TTL zu lang.

## Decision

**Proposed option:** Option B mit optionaler Cache-Ueberlagerung pro Session.

**Reasoning:**
Die strukturelle Eliminierung von Stale-Snapshots und Race-Conditions ist die Kerneigenschaft die EPIC-29 liefern soll. Format-Konvergenz mit ADR-75 ist ein Bonus, der die Skill-Authoring-Toolkette geradezu ermoeglicht. Der Disziplin-Aspekt wird durch eine klare Protokoll-Anweisung im stabilen Prompt-Prefix plus einen Hard-Guard im Command-Execution-Tool adressiert ("Plugin-ID nicht in deiner Probe-History dieser Session, hier sind die verfuegbaren Commands"). Optionaler Cache mit kurzer Session-TTL kann spaeter ergaenzt werden falls Latenz-Messungen das nahelegen.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Eine einzige Skill-Discovery-Engine fuer beide Subsysteme.
- Plugin-Skill-Format ist portabel: ein Plugin-Skill kann nach Claude Code kopiert werden und funktioniert dort als Doku-Skill.
- Wegfall des periodischen Pollings reduziert CPU- und Speicher-Last.
- Vereinheitlichung mit dem ADR-116-Pattern (Skill-Body on-demand) ergibt ein konsistentes Skill-Loading-Modell.

### Negative

- Migration der bestehenden Plugin-Skill-Files ist einmaliger Aufwand.
- Pro Plugin-Use kommt ein zusaetzlicher Tool-Call dazu (Live-Probe), ausser bei aktivem Cache.

### Risks

- **Modell vergisst Live-Probe vor Use**: mitigation durch Hard-Guard im Command-Execution-Tool das auf "kein vorheriger Probe-Call" prueft und in dem Fall die Live-Daten direkt im Error-Result mitschickt.
- **Plugin-Event-API instabil**: mitigation durch Fallback auf Vault-Reload-Trigger plus manueller Refresh-Action im Settings-UI.
- **Migration verliert kuratierte Plugin-spezifische Hints**: mitigation durch Beibehaltung der Hint-Files als `references/`-Unterordner im neuen Folder-Format.

## Related decisions

- ADR-14: VaultDNA Plugin-Discovery. ADR-120 ersetzt das periodische Polling durch event-driven Discovery plus Live-Probe.
- ADR-75: Skill-Package-Architektur. ADR-120 erweitert die ADR-75-Konvention auf Plugin-Skills.
- ADR-116: Active Skills on-demand. ADR-120 wendet dasselbe Pattern auf Plugin-State an.

## References

- FEAT-29-02: Plugin-Skill-Format-Migration
- FEAT-29-03: Unified Discovery und probe_plugin-Tool
- EPIC-29

---

## Implementation Notes (optional, may go stale)

Erste Skizze fuer die /coding-Phase:

- Das neue Tool fuer Live-Probe ist registriert im Tool-Registry analog zu execute_command und call_plugin_api.
- Plugin-Event-Listener werden in der Plugin-Onload-Phase registriert, mit Fallback-Polling alle dreissig Sekunden als Belt-and-Suspenders.
- Migration der Plugin-Skill-Files erfolgt im selben One-Shot-Pass wie die Folder-Konsolidierung (ADR-119), damit User nur ein einziges Migration-Event sehen.
- Probe-Cache, falls eingefuehrt, lebt In-Memory pro Plugin-Session und wird bei Plugin-Enable/Disable-Events invalidiert.
