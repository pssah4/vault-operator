# ADR-54: MCP Tool-Mapping & System-Prompt-Uebertragung

**Date:** 2026-03-31
**Deciders:** Sebastian Hanke

## Context

Vault Operator hat 46+ interne Tools und einen reichhaltigen System-Prompt (Memory, Skills, Rules, Tool-Guidelines). Im Connector-Modus muss diese Intelligenz ueber MCP an Claude uebertragen werden -- ohne eigene LLM-Calls in Vault Operator.

**Triggering ASRs:**
- ASR-2: Bestehende Tool-Pipeline wiederverwenden (0 Aenderungen)
- ASR-4: System-Prompt via MCP Prompts uebertragbar

**Kernprinzip:** Claude ist der Agent. Vault Operator exponiert **wenige hochstufige MCP Tools** die intern die volle Pipeline kapseln. Claude sieht keine internen Tool-Namen.

## Decision Drivers

- **Token-Effizienz**: 8 Tool-Definitionen statt 46 (weniger Kontext-Verbrauch)
- **Intelligence-Kapselung**: `search_vault` loest intern 4-Stufen-Pipeline aus
- **System-Prompt-Parität**: Claude soll im Connector-Modus das gleiche "wissen" wie im Standalone
- **Zero-Impact**: Keine Aenderungen an bestehenden Services

## Considered Options

### Option 1: 1:1 Tool-Mapping (46 MCP Tools)

Jedes interne Tool wird als eigenes MCP Tool exponiert.

- Pro: Maximale Kontrolle fuer Claude
- Con: 46 Tool-Definitionen = ~8000 Token (zu viel)
- Con: Claude muss wissen welche Tools zusammengehoeren (semantic_search + graph + implicit)
- Con: Kein Differenzierungsmerkmal gegenueber MCPVault
- **Ergebnis: Abgelehnt**

### Option 2: 2-Tool-Pattern (getTools + useTools, Claudesidian-Ansatz)

Nur 2 MCP Tools: eines listet verfuegbare Operationen, eines fuehrt aus.

- Pro: Minimal Token (nur 2 Definitionen)
- Pro: Dynamisch erweiterbar
- Con: Claude muss zwei Calls machen fuer jede Operation
- Con: Unnatuerliches Interaktionsmuster
- Con: Tool-Discovery ist ein Overhead bei jeder Konversation
- **Ergebnis: Abgelehnt**

### Option 3: 8+2 hochstufige Intelligence-Tools

Wenige Tools die intern mehrere interne Tools orchestrieren.
Plus 2 Learning-Tools fuer Memory-Sharing.

- Pro: **~2000 Token** fuer alle Definitionen (Token-effizient)
- Pro: `search_vault` kapselt die gesamte 4-Stufen-Pipeline
- Pro: Klare Semantik: Claude versteht sofort was jedes Tool tut
- Pro: Differenzierung: kein anderer MCP Server hat Intelligence-Tools
- Con: Weniger Granularitaet (Claude kann z.B. nicht nur Graph-Expansion aufrufen)
- Con: Mapping-Logik muss implementiert werden

## Decision

**Option 3: 8+2 hochstufige Intelligence-Tools**

### Tool-Definitionen

**Intelligence (3):**

| MCP Tool | Interne APIs | Token-Budget |
|----------|-------------|--------------|
| `get_context` | MemoryService.loadMemoryFiles() + buildMemoryContext() + VaultStats + SkillsManager.getSkills() + RulesLoader.getRules() | ~300 |
| `search_vault` | SemanticIndexService.search() + keywordSearch() + RRF + RerankerService.rerank() + GraphStore.getNeighbors() + ImplicitConnectionService.getImplicitNeighbors() | ~300 |
| `read_notes` | Vault.cachedRead() + metadataCache.getFileCache() (Frontmatter, Links, Tags) | ~200 |

**Execution (3):**

| MCP Tool | Interne APIs | Token-Budget |
|----------|-------------|--------------|
| `write_vault` | Vault.create/modify/delete + Approval-Pipeline (ToolExecutionPipeline Pattern) | ~250 |
| `create_document` | CreateDocxTool / CreatePptxTool / CreateXlsxTool (Template + Adhoc) | ~250 |
| `execute_vault_op` | generate_canvas, update_frontmatter, create_base, search_by_tag, get_daily_note | ~200 |

**Learning (2):**

| MCP Tool | Interne APIs | Token-Budget |
|----------|-------------|--------------|
| `sync_session` | MemoryService.writeSessionSummary() + EpisodicExtractor.recordEpisode() | ~200 |
| `update_memory` | MemoryService.writeFile() / appendToFile() | ~150 |

**Gesamt: ~1850 Token** (weit unter 3000 Budget)

### System-Prompt via MCP Prompts

| MCP Prompt | Quelle | Inhalt |
|------------|--------|--------|
| `obsilo-system-context` | soul.md + user-profile.md + patterns.md + RulesLoader + MemoryService.buildMemoryContext() | Rolle, Kommunikationsstil, User-Profil, Patterns, Regeln. Dynamisch generiert. |
| `obsilo-skill-{name}` | SkillsManager.getSkills() | Pro Skill ein Prompt mit Workflow-Anleitung. |

**`get_context` als Backup:**
Falls Claude die MCP Prompts nicht proaktiv laedt, liefert `get_context` (Tool) dieselben Informationen. Tool-Description sagt: "ALWAYS call this first."

### Tool-Description-Qualitaet

Jede Tool-Description enthaelt:
- **Was es tut** (1 Satz)
- **Wann es nutzen** (When to use)
- **Was es zurueckgibt** (Output-Beschreibung)
- **Beispiel** (konkretes Szenario)

Kein `whenToUse`, `commonMistakes` etc. als separate Felder (MCP Schema hat nur `description`). Alles in den Description-Text.

## Consequences

### Positive
- ~1850 Token statt ~8000 (Token-effizient)
- `search_vault` differenziert Vault Operator von CRUD-Servern
- System-Prompt wird via MCP Prompts uebertragen
- 0 Aenderungen an bestehenden Services

### Negative
- Mapping-Logik muss implementiert werden (search_vault -> 6 interne Calls)
- Weniger Granularitaet fuer Claude (kann nicht einzelne Pipeline-Stufen aufrufen)
- MCP Prompt-Nutzung durch Claude ist nicht garantiert (get_context als Fallback)

### Risks
- **MCP Prompt wird ignoriert:** Mitigation: get_context Tool als Fallback + prominente Description
- **search_vault zu langsam (6 interne Calls):** Mitigation: Parallel-Execution wo moeglich, <500ms Gesamtzeit
- **write_vault Approval blockiert MCP:** Mitigation: Approval via IPC an Plugin UI

## Related
- ADR-53: MCP Server Prozess-Architektur
- FEAT-14-01: Tool-Tier-Mapping
- FEAT-14-06: MCP Prompts
