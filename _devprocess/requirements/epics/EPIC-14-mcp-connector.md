# Epic: MCP Connector

> **Epic ID**: EPIC-14
> **Business Alignment**: _devprocess/analysis/BA-MCP-CONNECTOR.md
> **Scope**: MVP
> **Note**: Teilweise implementiert (1400-1403, 1411 implementiert, 1404-1410 geplant)

## Epic Hypothesis Statement

FUER Obsidian-Nutzer mit Claude-Abonnement (Pro/Max/Team/Enterprise)
DIE ihren Vault nahtlos in Claude-Workflows einbinden wollen ohne eigene API-Keys zu verwalten
IST DER Obsilo MCP Connector
EIN Intelligence-Backend fuer Claude
DAS Vault-Operationen (Suche, Lesen, Schreiben, Dokument-Erstellung) direkt aus Claude heraus ermoeglicht
IM GEGENSATZ ZU bestehenden Community MCP-Servern die nur CRUD-Operationen bieten
UNSERE LOESUNG bietet Agent-Intelligence (semantische Suche, Memory, Plugin Skills) als kuratierten 3-Tier MCP Server

## Business Outcomes (messbar)

1. **Adoption Rate**: Aktive Connector-Installationen steigen von 0 auf 500+ innerhalb 6 Monaten nach Release
2. **Tool-Usage**: Tool Calls pro User pro Woche steigen von 0 auf 20+ innerhalb 3 Monaten nach Release
3. **Onboarding-Conversion**: 30% der neuen User aktivieren den Connector in der ersten Woche innerhalb 3 Monaten nach Release
4. **Einstiegshuerde**: API-Key-Setup entfaellt komplett fuer Connector-User (0 Konfigurationsschritte vs. 3 im Standalone)

## Leading Indicators (Fruehindikatoren)

- **Connector-Aktivierungsrate**: Anteil der Obsilo-Installationen mit aktiviertem MCP Server (Ziel: >30%)
- **Tool-Call-Verteilung**: Anteil Read vs. Write vs. Intelligence Tools (zeigt Nutzungstiefe)
- **Retention nach 7 Tagen**: Connector-User die nach Erstaktivierung weiterhin aktiv sind
- **Error-Rate**: Fehlgeschlagene Tool Calls / Gesamt Tool Calls (Ziel: <5%)

## MVP Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEAT-14-00 | MCP Server Core (stdio) | P0 | M | Not Started |
| FEAT-14-01 | Tool-Tier-Mapping | P0 | M | Not Started |
| FEAT-14-02 | MCP Server Settings UI | P0 | S | Not Started |
| FEAT-14-03 | Remote Transport (Streamable HTTP) | P1 | L | Not Started |
| FEAT-14-04 | Remote Authentication | P1 | M | Not Started |
| FEAT-14-05 | MCP Resources | P1 | S | Not Started |
| FEAT-14-06 | MCP Prompts | P1 | M | Not Started |
| FEAT-14-07 | Plugin Skill Discovery | P2 | M | Not Started |
| FEAT-14-08 | Remote Approval Pipeline | P2 | S | Deferred (approval in Claude) |
| FEAT-14-09 | Connectors Directory Submission | P2 | S | Not Started |
| FEAT-14-10 | Sandbox Exposure via MCP | P1 | M | Not Started |
| FEAT-14-11 | Memory Transparency (Agent vs. Human) | P1 | S | Implemented |

**Priority:** P0-Critical (ohne geht MVP nicht), P1-High (wichtig), P2-Medium (wertsteigernd)
**Effort:** S (1-2 Sprints), M (3-5 Sprints), L (6+ Sprints)

## Neue Features aus Code-Review (2026-03-29)

### FEAT-14-10: Sandbox Exposure via MCP

**Kontext:** Obsilo hat eine isolierte Sandbox (Process/iframe) mit Vault-APIs (read, write, list) und CDN-HTTP (esm.sh, unpkg). Externe Clients (Claude Code) haben eigene Code-Execution, aber NICHT Vault-scoped mit Security-Garantien.

**Was exponiert werden soll:**
- `evaluate_expression` als MCP Tool -- externer Client sendet TypeScript/JS, Obsilo fuehrt es sicher in der Sandbox aus
- Security Boundary bleibt in Obsilo: Pfad-Validierung, Rate-Limiting (10 Writes/min, 5 Requests/min), .obsidian-Blockade, AstValidator
- Custom Tools (`custom_*`) als MCP Tools -- DynamicToolFactory-registrierte Tools werden via MCP aufrufbar
- NPM-Dependency-Bundling via EsbuildWasmManager bleibt server-seitig

**Warum relevant:**
- Batch-Operationen ueber 5+ Vault-Dateien sind mit einzelnen read/write MCP-Calls ineffizient
- Die Sandbox bietet atomare Vault-Batch-Ops die ein externer Client nicht replizieren kann
- Security: Externer Client muesste Vault-Pfade nicht selbst validieren

**Architektur-Implikation:** Im Connector-Modus sendet der externe Client Code als String, Obsilo validiert (AstValidator), kompiliert (esbuild falls noetig) und fuehrt in der Sandbox aus. Result zurueck via MCP Response.

### FEAT-14-11: Memory Transparency (Agent vs. Human)

**Kontext:** Das Memory-System unterscheidet NICHT zwischen menschlichem Input und Agent-Input (via MCP). Beides wird als `role: 'user'` behandelt.

**Was geaendert werden soll:**
- Source-Tracking: `UiMessage` erhaelt `source: 'human' | 'mcp' | 'subtask'` Feld
- Audit-Trail: SessionExtractor speichert Source-Info in Session-Summaries
- Memory-Updates via MCP werden separat markiert (z.B. `[via MCP]` Prefix)
- Learnings aus Agent-Aktionen sollen genauso gelernt werden wie aus Human-Aktionen (transparent)

**Warum relevant:**
- Obsilo soll egal sein ob Mensch oder Agent -- aber fuer Audit und Debugging muss die Quelle nachvollziehbar sein
- Verhindert unbeabsichtigtes Memory-Poisoning durch externe Agents
- Ermoeglicht spaetere Analyse: "Welche Learnings kamen aus Standalone vs. Connector?"

## Explizit Out-of-Scope

- **Monetarisierung / Tier-Trennung (Free vs Pro)**: Erstmal alles kostenlos, spaetere Phase
- **Mobile-Support**: Obsidian Mobile hat kein stdio/HTTP-Runtime
- **Multi-Vault-Support**: 1 Vault = 1 MCP Server Instanz
- **Eigene Chat-UI**: Claude IS die UI im Connector-Modus
- **Migration bestehender Community MCP-Server**: Kein Migrations-Pfad geplant

## Dependencies & Risks

### Dependencies
- **Anthropic Custom Connector Feature**: Muss stabil fuer Pro/Max/Team/Enterprise bleiben. Impact bei Wegfall: Epic nicht realisierbar.
- **MCP Spec (2025-03-26)**: Rueckwaertskompatibilitaet noetig. Impact bei Breaking Changes: Transport-Layer Anpassung.
- **Cloudflare Tunnel Free Tier**: Fuer Remote-Transport (FEAT-14-03). Impact bei Wegfall: Alternative Tunnel-Loesung noetig.
- **Obsidian Plugin Review**: stdio-Server muss Plugin-Richtlinien entsprechen. Impact bei Ablehnung: Architektur-Anpassung.

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Electron erlaubt keinen nativen HTTP-Server im Plugin-Kontext | M | H | Phase 1 nur stdio. Remote via separaten Prozess oder Tunnel Worker. Fruehe PoC-Validierung. |
| MCP Spec Breaking Changes | M | M | Abstraktionsschicht zwischen MCP-Transport und Tool-Pipeline. Spec-Version pinnen. |
| Plugin Review Ablehnung des MCP-Server-Teils | L | H | Frueh mit Obsidian-Team klaeren. Bestehende MCP-Plugin-Beispiele als Praezedenz. |
| Approval-UX fuer Remote Write-Operationen nicht loesbar | H | M | Design-Frage fuer Architektur. Optionen: Push-Notification, Whitelist, Auto-Approve mit Einschraenkungen. |
| Skill-Prompts performen als MCP Prompt schlechter als System Prompt | M | M | Frueh testen. Ggf. Prompt-Adapter-Schicht. |
| Concurrent Access Standalone + Connector auf selben Vault | M | L | Beide nutzen Obsidian Vault API. Locking-Strategie in Architektur klaeren. |

## Technical Debt (nur PoC)

| Shortcut | Description | MVP Conversion Impact |
|----------|-------------|----------------------|
| Hardcoded Tool-Tier-Zuordnung | Tools werden statisch in Tiers eingeteilt statt dynamisch | Niedrig -- Mapping-Tabelle anpassen genuegt |
| Keine Approval-Pipeline fuer Remote Writes | Phase 1 (stdio) braucht keine Approval (lokal). Remote wird erst in Phase 2 relevant | Mittel -- Approval-UX muss fuer Remote designed werden |
| Kein Auth fuer stdio | stdio ist lokal, Auth nicht noetig. Fuer Streamable HTTP muss OAuth 2.1 nachgeruestet werden | Mittel -- Auth-Schicht als eigenes Feature (FEAT-14-04) |
