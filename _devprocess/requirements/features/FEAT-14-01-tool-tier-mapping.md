# Feature: Tool-Tier-Mapping

> **Feature ID**: FEAT-14-01
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Die 46+ internen Obsilo-Tools werden auf 8 hochstufige MCP Tools + 2 Learning-Tools
gemappt. Claude sieht NICHT die einzelnen internen Tools, sondern intelligente
Operationen die Obsilo's gesamte Pipeline kapseln.

**Kernprinzip:** Ein `search_vault`-Call loest intern die volle 4-Stufen-Pipeline aus
(Semantic + Graph + Implicit + Reranking). Claude muss nicht wissen wie die Suche
intern funktioniert -- es bekommt einfach die besten Ergebnisse.

## Benefits Hypothesis

**Wir glauben dass** ein intelligentes Tool-Mapping
**Folgende messbare Outcomes liefert:**
- Claude waehlt effizient (8 statt 46 Tools = weniger Token, bessere Auswahl)
- Suchergebnisse sind sofort reichhaltig (keine Multi-Tool-Ketten fuer eine Suche)
- Differenzierung gegenueber CRUD-basierten Community MCP-Servern

## User Stories

### Story 1: Intelligente Suche
**Als** Claude-User
**moechte ich** "Suche nach X" sagen und sofort die besten Ergebnisse mit Kontext bekommen
**um** nicht manuell durch Suchergebnisse navigieren zu muessen

### Story 2: Batch-Operationen
**Als** Knowledge Worker
**moechte ich** mehrere Dateien in einem Call lesen oder schreiben koennen
**um** effizienter zu arbeiten

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | search_vault liefert 4-Stufen-Ergebnisse in einem Call | Graph + Implicit + Reranking inkludiert | Ergebnis-Pruefung |
| SC-02 | Tool-Definitionen unter 3000 Token gesamt | Token-Budget eingehalten | Token-Count |
| SC-03 | Claude waehlt korrekte Tools | >80% richtige Wahl | 10 Test-Queries |
| SC-04 | Kein internes Tool direkt exponiert | 0 interne Tool-Namen sichtbar | MCP Tool Listing |

---

## MCP Tool Definitionen

### Intelligence Tools

**`get_context`** -- IMMER zuerst aufrufen
```
Input: {} (keine Parameter)
Output: { userProfile, patterns, identity, vaultStats, activeSkills, rules }
Intern: MemoryService.loadMemoryFiles() + buildMemoryContext() + VaultStats + SkillsManager
```

**`search_vault`** -- Intelligente Vault-Suche
```
Input: { query: string, top_k?: number, folder?: string, tags?: string[] }
Output: { results: [{ path, excerpt, score, method, graphContext?, implicitConnections? }] }
Intern: SemanticIndexService.search() + keywordSearch() + RRF + RerankerService + GraphStore.getNeighbors() + ImplicitConnectionService
```

**`read_notes`** -- Strukturiertes Lesen
```
Input: { paths: string[] }
Output: { notes: [{ path, content, frontmatter, linkedNotes, tags }] }
Intern: Vault.cachedRead() + metadataCache.getFileCache() + getLinkedNotes-Logik
```

### Execution Tools

**`write_vault`** -- Batch-Write mit Approval
```
Input: { operations: [{ type: 'create'|'edit'|'append'|'delete'|'move', path, content? }] }
Output: { results: [{ path, success, error? }] }
Intern: Vault.create/modify/delete + Approval-Pipeline
```

**`create_document`** -- Dokument-Erstellung
```
Input: { type: 'docx'|'pptx'|'xlsx', path, content, template? }
Output: { path, success }
Intern: CreateDocxTool / CreatePptxTool / CreateXlsxTool
```

**`execute_vault_op`** -- Spezial-Operationen
```
Input: { operation: string, params: Record<string, unknown> }
Operations: generate_canvas, update_frontmatter, create_base, search_by_tag, get_daily_note
Intern: Dispatch zum jeweiligen Tool
```

### Learning Tools

**`sync_session`** -- Konversation speichern
```
Input: { title, summary, toolsUsed: string[], learnings?: string }
Output: { sessionId, episodeRecorded: boolean }
Intern: MemoryService.writeSessionSummary() + EpisodicExtractor.recordEpisode()
```

**`update_memory`** -- Memory aktualisieren
```
Input: { category: 'profile'|'patterns'|'errors'|'projects', content: string }
Output: { success }
Intern: MemoryService.appendToFile() oder writeFile()
```

---

## Definition of Done

### Functional
- [ ] 8 MCP Tools implementiert mit korrektem Mapping
- [ ] search_vault kapselt volle 4-Stufen-Pipeline
- [ ] get_context liefert Memory + Skills + Rules + Vault-Stats
- [ ] Tool-Definitionen < 3000 Token gesamt
- [ ] write_vault nutzt Approval-Pipeline

### Quality
- [ ] 10 Test-Queries: >80% korrekte Tool-Wahl durch Claude
- [ ] Kein internes Tool-Name sichtbar fuer Claude

---

## Dependencies
- **FEAT-14-00**: MCP Server Core (Server-Runtime)
- **Alle bestehenden Services** (read-only Zugriff)
