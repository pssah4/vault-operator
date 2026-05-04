# ADR-53: MCP Server Prozess-Architektur

**Date:** 2026-03-31
**Deciders:** Sebastian Hanke

## Context

Obsilo soll sich als MCP Server exponieren (EPIC-14). Claude Desktop/Code verbindet sich via stdio, Claude spricht MCP JSON-RPC, und Obsilo fuehrt Intelligence-Operationen aus (Suche, Lesen, Schreiben, Memory).

**Triggering ASRs:**
- ASR-1: MCP Server muss als separater Prozess laufen (Electron Renderer kann nicht stdio bedienen)
- ASR-3: Claude ist der Agent, Obsilo macht keine LLM-Calls im Connector-Modus

**Constraint:** Obsidian laeuft im Electron Renderer-Prozess. Node.js stdio ist im Renderer nicht direkt nutzbar. `child_process.fork()` funktioniert nicht in Electron (ELECTRON_RUN_AS_NODE wird ignoriert). Bewiesenes Pattern: `child_process.spawn()` mit IPC (ProcessSandboxExecutor).

## Decision Drivers

- **Electron-Kompatibilitaet**: Renderer kann nicht stdio bedienen
- **Bestehende Services nutzen**: SemanticIndex, GraphStore, MemoryService etc. leben im Renderer
- **Stabilitaet**: Server-Prozess darf Plugin nicht destabilisieren
- **Einfachheit**: Minimale Architektur, wenig neue Abstraktionen

## Considered Options

### Option 1: In-Process (Renderer) mit SDK StdioServerTransport

MCP Server laeuft direkt im Electron Renderer.

- Pro: Kein IPC, direkter Zugriff auf alle Services
- Pro: Einfachste Architektur
- Con: **Renderer hat keinen Zugriff auf process.stdin/stdout** (Electron blockiert das)
- Con: Blockierender I/O im Renderer friert UI ein
- **Ergebnis: Nicht machbar**

### Option 2: Separater Prozess (spawn) mit IPC-Bridge

MCP Server laeuft als Node.js Child Process (spawn). Kommuniziert via IPC mit dem Plugin im Renderer. Der Child Process bedient stdio (MCP JSON-RPC) nach aussen und IPC (Requests) nach innen.

```
Claude Desktop  ←stdio→  McpServerProcess  ←IPC→  ObsiloPlugin (Renderer)
                          (child_process)           (alle Services)
```

- Pro: **Bewiesenes Pattern** (ProcessSandboxExecutor nutzt genau dieses Muster)
- Pro: stdio im Child Process funktioniert (normaler Node.js Prozess)
- Pro: Plugin bleibt stabil (Server-Crash isoliert)
- Pro: IPC-Message-Typing via Discriminated Unions (bewiesenes Pattern)
- Con: IPC-Overhead (~1-5ms pro Message)
- Con: Serialisierung aller Daten ueber IPC (kein shared Memory)
- Con: Zwei Prozesse zu managen (Lifecycle, Error Handling)

### Option 3: Worker Thread

MCP Server als Node.js Worker Thread im Electron-Prozess.

- Pro: Geteilter Speicher moeglich (SharedArrayBuffer)
- Pro: Weniger Overhead als spawn
- Con: Worker Threads haben keinen Zugriff auf Electron APIs
- Con: Unklare Kompatibilitaet mit MCP SDK Transport
- Con: **Kein bewiesenes Pattern in der Codebase**

## Decision

**Option 2: Separater Prozess (spawn) mit IPC-Bridge**

**Begruendung:** Identisches Pattern wie ProcessSandboxExecutor. Bewiesene Electron-Kompatibilitaet. stdio funktioniert im Child Process. IPC-Overhead (1-5ms) ist vernachlaessigbar gegenueber der Tool-Execution-Zeit (50-500ms). Lifecycle-Management (spawn, SIGTERM, respawn) ist bereits implementiert und getestet.

## Architecture

### Prozess-Modell

```
Obsidian (Electron Renderer)
  └── ObsidianAgentPlugin
        ├── mcpClient (bestehend, konsumiert externe MCP Server)
        ├── mcpServer: McpBridge (NEU)
        │     └── child_process.spawn('node', ['mcp-server-worker.js'])
        │           ├── stdin/stdout → MCP JSON-RPC (nach aussen, Claude)
        │           └── IPC channel  → Bridge-Messages (nach innen, Plugin)
        ├── semanticIndex, graphStore, ... (bestehende Services)
        └── toolRegistry (bestehend)

Claude Desktop
  └── MCP Client
        └── stdio → verbindet mit dem Child Process
```

### IPC Message Protocol

```typescript
// Plugin → Server
type PluginToServerMessage =
    | { type: 'tool-result'; id: string; result: unknown }
    | { type: 'context-update'; memory: string; skills: string[] }
    | { type: 'shutdown' };

// Server → Plugin
type ServerToPluginMessage =
    | { type: 'server-ready' }
    | { type: 'tool-call'; id: string; tool: string; args: Record<string, unknown> }
    | { type: 'error'; id: string; message: string };
```

### Dateien

```
src/mcp/
├── McpBridge.ts              # Plugin-seitig: spawn, IPC, Lifecycle
├── mcp-server-worker.ts      # Child Process: MCP SDK Server + stdio
├── tools/                    # Tool-Handler (Plugin-seitig)
│   ├── searchVault.ts
│   ├── readNotes.ts
│   ├── writeVault.ts
│   ├── getContext.ts
│   ├── syncSession.ts
│   ├── updateMemory.ts
│   └── createDocument.ts
└── prompts/
    └── systemContext.ts      # MCP Prompt Builder
```

### Server-Worker (mcp-server-worker.ts)

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({ name: 'obsilo', version: '1.0.0' }, {
    capabilities: { tools: {}, prompts: {}, resources: {} }
});

// Tool-Call → IPC → Plugin → IPC → Result
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const id = crypto.randomUUID();
    process.send!({ type: 'tool-call', id, tool: request.params.name, args: request.params.arguments });
    return await waitForResult(id);  // Promise resolved by IPC message
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.send!({ type: 'server-ready' });
```

### Claude Desktop Auto-Config

Obsilo schreibt automatisch in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsilo": {
      "command": "node",
      "args": ["{pluginDir}/mcp-server-worker.js"],
      "env": {}
    }
  }
}
```

Pfad zu `claude_desktop_config.json`:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

## Consequences

### Positive
- Bewiesenes Pattern (ProcessSandboxExecutor)
- Server-Crash isoliert vom Plugin
- stdio funktioniert im Child Process
- Bestehende Services unberuehrt

### Negative
- IPC-Serialisierung fuer alle Daten (~1-5ms Overhead)
- Zwei Prozesse zu managen
- mcp-server-worker.js muss als separate Datei deployed werden (wie sandbox-worker.js)

### Risks
- **IPC-Timeout bei langen Tool Calls:** Mitigation: Timeout pro Tool-Call (30s default)
- **Worker-Crash:** Mitigation: Respawn mit Limit (3 Versuche, wie Sandbox)
- **MCP SDK API-Aenderungen:** Mitigation: Version pinnen, Abstraktionsschicht

## Related
- ADR-54: MCP Tool-Mapping + System-Prompt
- ProcessSandboxExecutor (bewiesenes spawn+IPC Pattern)
