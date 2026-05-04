# Epic: Claude Code Pattern Adoption

> **Epic ID**: EPIC-16
> **Quelle**: Analyse des geleakten Claude Code Quellcodes (DonutShinobu/claude-code-fork, ~1900 TS-Dateien, 512k LoC)
> **Scope**: Selektive Uebernahme von Patterns die fuer Wissensarbeit Mehrwert bringen

## Epic Hypothesis Statement

FUER Obsilo-User mit wachsenden Vaults und komplexen Wissensarbeits-Workflows
DIE schnellere Antworten, geringere Token-Kosten und bessere Memory-Nutzung benoetigen
IST DIE Claude Code Pattern Adoption
EIN Set von 5 inkrementellen Verbesserungen am bestehenden System
DAS System-Prompt-Groesse reduziert, Memory intelligent filtert, Skills bedarfsgesteuert laedt und parallele Vault-Recherche ermoeglicht
IM GEGENSATZ ZU einer 1:1-Portierung des Claude Code Coordinator Mode (der fuer Software-Entwicklung designt ist und 900+ Zeilen coding-spezifischen System-Prompt benoetigt)
UNSERE LOESUNG uebernimmt nur die Patterns die sich auf Wissensarbeit uebertragen lassen und baut auf der bestehenden Obsilo-Architektur auf (ToolRegistry, SkillsManager, MemoryService, NewTaskTool)

## Business Outcomes (messbar)

1. **Token-Einsparung**: System-Prompt-Groesse sinkt um ~30-40% durch Deferred Tool Loading (FEAT-16-00) -- messbar als Token-Differenz pro API-Call
2. **Memory-Skalierbarkeit**: Memory kann beliebig wachsen ohne Performance-Einbuss -- nur relevante Memories werden geladen (FEAT-16-01)
3. **Prompt-Praezision**: Weniger irrelevante Skills/Tools im Kontext -- Agent macht weniger Fehlentscheidungen bei Tool-Auswahl
4. **Recherche-Geschwindigkeit**: Fan-Out-Recherche ueber 3+ Quellen gleichzeitig statt sequenziell (FEAT-16-03)

## Leading Indicators (Fruehindikatoren)

- **System-Prompt Token Count**: Vorher/Nachher pro Mode (Ziel: -30% im Agent-Mode)
- **Memory-Load-Time**: Zeit fuer Memory-Injection bei Session-Start (Ziel: konstant unabhaengig von Dateianzahl)
- **Skill-Count im Prompt**: Anzahl aktiver Skills pro Turn (Ziel: nur kontextuell relevante)
- **SubTask-Parallelitaet**: Anzahl gleichzeitig laufender read-SubTasks (Baseline: 0, Ziel: 2-5)

## Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEAT-16-00 | Deferred Tool Loading | P1-High | M | Geplant |
| FEAT-16-01 | Memory Side-Query | P1-High | M | Geplant |
| FEAT-16-02 | Conditional Skills | P2-Medium | M | Geplant |
| FEAT-16-03 | Parallel SubTasks (Fan-Out) | P2-Medium | M | Geplant |
| FEAT-16-04 | Task-Typisierung | P3-Low | S | Geplant |

**Priority:** P1-High (groesster ROI), P2-Medium (wertsteigernd), P3-Low (Housekeeping)
**Effort:** S (1-2 Sprints), M (3-5 Sprints)

## Verworfene Kandidaten (mit Begruendung)

### Spezialisierte Agents (verworfen)

Claude Code definiert 6 Built-in Agents (Explore, Plan, Verification, General Purpose, etc.) mit eigenen Tool-Einschraenkungen und guenstigeren Modellen.

**Warum nicht fuer Obsilo:**
- Obsilo's Skills decken Spezialisierung bereits ab (office-workflow, presentation-design, etc.)
- Agent-Spezialisierung loest Coding-Probleme: phasengetrennte Toolsets (kein Edit im Plan-Mode), objektives Verify (Tests bestehen/scheitern), Kostenoptimierung (Haiku fuer Explore)
- Bei Wissensarbeit gibt es keine klare Phasentrennung -- Lesen und Schreiben passieren im selben Fluss
- Ein "Vault Explorer" der nur lesen kann muesste erst fertig werden bevor der naechste Agent schreibt -- das verlangsamt statt zu beschleunigen
- Kein objektives "Verify" fuer Wissensarbeit (kein Aequivalent zu `npm test`)
- Automatischer Wechsel waere einziger Mehrwert, rechtfertigt den Aufwand nicht

### Full Coordinator Mode (reduziert auf FEAT-16-03)

Claude Code's Coordinator ist ein reiner Denker ohne eigene Tools (nur Agent, SendMessage, TaskStop). Er orchestriert Worker ueber async Notifications mit einem 900-Zeilen System-Prompt.

**Warum nicht vollstaendig fuer Obsilo:**
- Coordinator als toolloser Denker widerspricht Wissensarbeit wo Lesen+Schreiben im selben Fluss passieren
- SendMessage/TaskStop als separate Tools: zu viel Komplexitaet fuer seltenen Fan-Out-Use-Case
- 900-Zeilen Coordinator-Prompt: coding-spezifisch (Research -> Synthesis -> Implementation -> Verification Phasen)
- Token-Overhead: jeder Worker braucht eigenen System-Prompt + Kontext-Aufbau
- Typische Obsilo-Anfragen ("fasse Meeting-Notes zusammen", "erstelle PPTX aus Notizen") profitieren nicht von Delegation

**Was stattdessen:** FEAT-16-03 uebernimmt den einzig relevanten Teil -- parallele read-only SubTasks via Promise.all als inkrementelle Erweiterung des bestehenden new_task-Systems.

## Explizit Out-of-Scope

- **React/Ink Terminal UI Patterns**: Claude Code nutzt React+Ink fuer Terminal-Rendering -- nicht relevant fuer Obsidian Plugin
- **Permission Mode System**: Claude Code's allow/deny/ask Regeln pro Tool -- Obsilo hat eigenes Approval-System
- **Feature Flags / GrowthBook**: A/B-Testing-Infrastruktur -- nicht relevant fuer Plugin
- **Bun-spezifische Patterns**: `feature('XYZ')` Compile-Time-Feature-Gates -- nicht uebertragbar
- **IDE Bridge / LSP Integration**: VS Code / JetBrains Anbindung -- Obsilo laeuft in Obsidian
- **Voice / Vim / Keybindings**: Terminal-UX-Features -- nicht relevant

## Dependencies & Risks

### Dependencies

| Feature | Abhaengigkeit |
|---------|--------------|
| FEAT-16-00 (Deferred Tool Loading) | Erweiterung ToolRegistry + neues Meta-Tool in toolMetadata.ts |
| FEAT-16-01 (Memory Side-Query) | Memory-Dateien brauchen Frontmatter-Schema (Migration bestehender Dateien) |
| FEAT-16-02 (Conditional Skills) | FEAT-16-00 (kombiniert am effektivsten) |
| FEAT-16-03 (Parallel SubTasks) | FEAT-16-04 (Task-Typisierung macht Parallel-Logik sauberer) |
| FEAT-16-04 (Task-Typisierung) | Keine -- reine Refactoring-Aufgabe |

### Risks

| Risiko | Mitigation |
|--------|-----------|
| Deferred Loading: Agent findet Tool nicht weil Schema nicht geladen | Meta-Tool mit guten Keyword-Hints, Fallback auf vollstaendiges Schema |
| Memory Side-Query: Zusaetzlicher API-Call pro Turn erhoet Latenz | Guenstiges/schnelles Model (Haiku), Cache fuer wiederholte Queries, Skip bei wenigen Memory-Dateien |
| Parallel SubTasks: Race Conditions bei Vault-Zugriff | Phase 1 nur read-only SubTasks, write bleibt sequenziell |
| Conditional Skills: Skill wird nicht geladen obwohl relevant | Konservative Trigger-Patterns, manuelle Override-Option |

## Implementierungsreihenfolge

```
FEAT-16-04 (Task-Typisierung)     -- Housekeeping, macht 1603 sauberer
    |
FEAT-16-00 (Deferred Tool Loading) -- groesster ROI, sofort Token-Einsparung
    |
FEAT-16-01 (Memory Side-Query)    -- macht Memory skalierbar
    |
FEAT-16-02 (Conditional Skills)   -- kombiniert mit 1600 fuer minimalen Prompt
    |
FEAT-16-03 Phase 1 (Parallel SubTasks) -- read-only Fan-Out via Promise.all
    |
FEAT-16-03 Phase 2 (Async SubTasks)    -- nur wenn Phase 1 sich bewaehrt
```

## Referenz: Claude Code Quellcode-Mapping

| Obsilo Feature | Claude Code Datei(en) | Pattern |
|---------------|----------------------|---------|
| FEAT-16-00 | src/tools/ToolSearchTool/, src/Tool.ts (searchHint, maxResultSizeChars) | Deferred tool schema, keyword matching |
| FEAT-16-01 | src/memdir/findRelevantMemories.ts, memoryScan.ts, memoryTypes.ts | Frontmatter-basiertes Manifest, Sonnet-Side-Query |
| FEAT-16-02 | src/skills/loadSkillsDir.ts (parseSkillPaths, activateConditionalSkillsForPaths) | Path-Frontmatter, ignore-Lib Matching |
| FEAT-16-03 | src/coordinator/coordinatorMode.ts, src/tools/AgentTool/runAgent.ts | Async Worker, task-notification XML |
| FEAT-16-04 | src/Task.ts (TaskType, TaskStatus, generateTaskId) | Typisierte IDs, Terminal-Status-Guards |
