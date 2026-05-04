# Feature: MCP Server Core (stdio)

> **Feature ID**: FEAT-14-00
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Obsilo exponiert sich als MCP Server ueber stdio-Transport. Der Server laeuft als
Child Process (Node.js `child_process.fork`), kommuniziert via IPC mit dem Plugin
im Renderer-Prozess. Claude Desktop/Code verbindet sich via stdio und kann Obsilo's
Intelligence-Features nutzen.

**Architektur-Kernprinzip:** Claude ist der Agent (orchestriert, denkt), Obsilo ist
das Intelligence-Backend (sucht, liest, schreibt, lernt). Obsilo macht KEINE eigenen
LLM-Calls im Connector-Modus. Alle Inferenz kommt von Claude.

**Kein Standalone-Impact:** Der MCP Server ist ein reiner Aufsatz auf bestehende
Public APIs. Wenn `enableMcpServer = false` (Default), existiert er nicht.
Keine Aenderungen an bestehenden Services.

## Benefits Hypothesis

**Wir glauben dass** ein lokaler MCP Server
**Folgende messbare Outcomes liefert:**
- Claude Desktop kann direkt auf den Vault zugreifen
- Kein API-Key-Setup fuer den Connector-Modus
- Obsilo's 4-Stufen-Retrieval-Pipeline fuer Claude nutzbar

**Wir wissen dass wir erfolgreich sind wenn:**
- Claude Desktop erkennt den MCP Server und listet die Tools
- search_vault liefert Ergebnisse mit Graph + Implicit + Reranking
- Der Standalone-Modus funktioniert unveraendert

## User Stories

### Story 1: Vault in Claude nutzen
**Als** Obsidian-Nutzer mit Claude Desktop
**moechte ich** meinen Vault als MCP Connector verbinden
**um** aus Claude heraus intelligent in meinen Notizen zu suchen

### Story 2: Zero-Config
**Als** nicht-technischer User
**moechte ich** den MCP Server mit einem Toggle aktivieren
**um** ohne manuelle JSON-Konfiguration loszulegen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Claude Desktop erkennt Obsilo als Connector | Verbindung hergestellt | Claude Desktop zeigt "Obsilo" |
| SC-02 | search_vault liefert 4-Stufen-Pipeline-Ergebnisse | Semantic + Graph + Implicit | Ergebnis-Pruefung |
| SC-03 | Standalone-Modus funktioniert unveraendert | 0 Regressionen | Alle bestehenden Tests gruen |
| SC-04 | Antwortzeit | Unter 500ms (lokal) | Zeitmessung |

---

## Technical NFRs

### Performance
- Tool-Call-Latenz: <500ms (lokal, stdio)
- Server-Start: <2s

### Reliability
- Stabil solange Obsidian offen
- Graceful Shutdown bei Plugin-Unload
- Kein Zombie-Prozess

### Security
- Nur lokale stdio-Verbindung (kein Netzwerk)
- Write-Ops mit Approval (wie Standalone)

### Isolation
- **0 Aenderungen an bestehenden Services**
- Neues `src/mcp/` Verzeichnis, komplett separat
- main.ts: nur +5 Zeilen (if-guarded by Setting)

---

## MCP Tools (6 Intelligence-Tools + 2 Learning-Tools)

| MCP Tool | Obsilo API (read-only Zugriff) | Beschreibung |
|----------|-------------------------------|--------------|
| `get_context` | MemoryService, VaultStats, SkillsManager | IMMER zuerst aufrufen. Liefert User-Profil, Memory, Vault-Kontext, verfuegbare Skills. |
| `search_vault` | SemanticIndexService, GraphStore, ImplicitConnectionService, RerankerService | Intelligente Vault-Suche: Semantic + Graph + Implicit + Reranking in einem Call. |
| `read_notes` | Vault.cachedRead | Mehrere Dateien lesen, strukturiert mit Frontmatter + Linked Notes. |
| `write_vault` | Vault.create/modify/delete | Batch-Write mit Approval-Pipeline. |
| `create_document` | CreateDocx/Pptx/XlsxTool | PPTX, DOCX, XLSX erstellen. Claude liefert Inhalt, Obsilo formatiert. |
| `execute_vault_op` | Diverse Tools | Spezial-Ops: generate_canvas, update_frontmatter, create_base, etc. |
| `sync_session` | MemoryService, EpisodicExtractor | Konversation + Learnings speichern. Claude extrahiert, Obsilo persistiert. |
| `update_memory` | MemoryService | User-Profil, Patterns, Errors aktualisieren. |

## MCP Prompts (System-Prompt-Ersatz)

| MCP Prompt | Quelle | Inhalt |
|------------|--------|--------|
| `obsilo-system-context` | MemoryService + soul.md + Rules | Rolle, Kommunikationsstil, User-Profil, Regeln. Wird bei Connect geladen. |
| `obsilo-skills` | SkillsManager | Workflow-Anleitungen (office-workflow, research, etc.) |

## MCP Resources

| Resource | Quelle | Inhalt |
|----------|--------|--------|
| `vault://structure` | Vault API | Folder-Hierarchie + Stats |
| `vault://tags` | GraphStore | Tag-Cloud mit Counts |

---

## Architecture

### Neue Dateien (kein Impact auf Standalone)

```
src/mcp/
+-- McpServer.ts                  # stdio Server-Prozess (child_process.fork)
+-- McpBridge.ts                  # IPC Bridge: Plugin <-> Server-Prozess
+-- tools/
|   +-- searchVault.ts            # -> SemanticIndexService + Graph + Implicit + Reranker
|   +-- readNotes.ts              # -> Vault.cachedRead
|   +-- writeVault.ts             # -> Vault.create/modify + Approval
|   +-- getContext.ts             # -> MemoryService + VaultStats + Skills
|   +-- syncSession.ts           # -> MemoryService.writeSessionSummary
|   +-- updateMemory.ts          # -> MemoryService.appendToFile
|   +-- recordEpisode.ts         # -> EpisodicExtractor.recordEpisode
|   +-- createDocument.ts        # -> CreateDocx/Pptx/Xlsx
+-- prompts/
    +-- systemContext.ts          # -> soul.md + Rules + Memory -> MCP Prompt
```

### main.ts Integration (minimal)

```typescript
// Am Ende von doLoad(), nach allen bestehenden Services:
if (this.settings.enableMcpServer) {
    this.mcpServer = new McpServer(this);
    await this.mcpServer.start();
}
```

---

## Definition of Done

### Functional
- [ ] MCP Server startet bei Plugin-Load (wenn enabled)
- [ ] stdio-Transport: JSON-RPC mit Claude Desktop
- [ ] Alle 8 MCP Tools funktionieren Ende-zu-Ende
- [ ] MCP Prompts liefern System-Kontext (Memory + Rules + Skills)
- [ ] MCP Resources liefern Vault-Struktur
- [ ] Sauberer Shutdown bei Plugin-Unload
- [ ] Standalone-Modus: 0 Regressionen

### Quality
- [ ] Integration Test: Claude Desktop verbindet und fuehrt search_vault aus
- [ ] Bestehende Tests: alle 58+ Knowledge-Layer Tests gruen
- [ ] Performance: <500ms fuer search_vault

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] ADR fuer MCP Server Architektur

---

## Dependencies
- **MCP SDK**: `@modelcontextprotocol/sdk` (npm)
- **Alle bestehenden Services** (read-only Zugriff, keine Aenderungen)
- User muss Embedding-API-Key haben (fuer Semantic Search Index)

## Out of Scope
- Remote Transport (FEAT-14-03)
- Authentication (FEAT-14-04)
- Eigene LLM-Calls im Connector-Modus
