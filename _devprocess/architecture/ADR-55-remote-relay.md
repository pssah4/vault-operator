# ADR-55: Remote MCP Relay via Cloudflare Workers + Durable Objects

**Date:** 2026-03-31
**Deciders:** Sebastian Hanke

## Context

Obsilo's MCP Server laeuft auf localhost:27182 im Electron Renderer. Fuer Remote-Zugriff
(claude.ai, ChatGPT, etc.) muss der Server ueber eine oeffentliche HTTPS-URL erreichbar sein.

Direkte Tunnel-Loesungen (cloudflared, ngrok) erfordern ein Binary auf dem User-Rechner
und liefern instabile URLs (Free Tier). Ein Relay-Server in der Cloud loest beide Probleme:
Das Plugin verbindet sich per ausgehender WebSocket -- kein Binary, kein Port-Oeffnen.

**Triggering ASR:**
- ASR: Kein Binary auf User-Rechner, Multi-Plattform (Claude + ChatGPT + Cursor)

## Decision Drivers

- **Kein lokales Binary**: WebSocket-Verbindung ist ausgehend, keine Firewall-Probleme
- **Persistente URL**: Ueberlebt Neustarts, einmal in MCP-Clients eintragen
- **Self-Deploy (BYOK)**: User hostet auf eigener Cloudflare-Instanz
- **Kosten**: Minimal ($5/Monat Cloudflare Workers Paid)
- **Multi-Client**: Ein Endpoint fuer alle MCP-Clients

## Considered Options

### Option 1: Cloudflare Quick Tunnel (cloudflared Binary)
- Pro: Zero Config, kein Account
- Con: Binary auf User-Rechner, URL aendert sich bei Neustart
- **Abgelehnt:** Instabil, Binary-Requirement

### Option 2: ngrok mit Authtoken
- Pro: Persistente URL (Free Tier)
- Con: Native NAPI-Bindings (Electron-Risiko), 1 GB Bandwidth-Limit
- **Abgelehnt:** Electron-Kompatibilitaet unsicher

### Option 3: Cloudflare Workers + Durable Objects (Relay)
- Pro: Kein Binary, persistente URL, Hibernation (keine Idle-Kosten)
- Pro: Edge-global (niedrige Latenz), $5/Monat pauschal
- Pro: "Deploy to Cloudflare" Button moeglich
- Con: User braucht Cloudflare-Account ($5/Monat)
- Con: Relay-Code muss gepflegt werden

### Option 4: Fly.io (Node.js Server)
- Pro: Volle Kontrolle, einfacher Code (~150 LOC)
- Pro: Free Tier (3 VMs)
- Con: Kein Scale-to-Zero (VM muss laufen), Cold Start bei Scale-to-Zero
- **Alternative fuer Power-User**

## Decision

**Option 3: Cloudflare Workers + Durable Objects, deployed per REST API aus dem Plugin**

Die entscheidende Ergaenzung: Der Relay wird NICHT per CLI (wrangler) deployed, sondern
per Cloudflare REST API direkt aus dem Obsidian Plugin heraus. Der User gibt einen
Cloudflare API Token ein und klickt "Deploy" -- kein Terminal, kein CLI.

### Deployment per REST API

```
User-Aktion: API Token eingeben + "Deploy" klicken

Obsilo intern:
  1. GET /accounts → Account ID ermitteln
  2. PUT /accounts/{id}/workers/scripts/obsilo-relay
     → Worker-Code hochladen (als String im Plugin eingebettet)
     → Metadata: Durable Object Bindings + Migrations
  3. PUT /accounts/{id}/workers/scripts/obsilo-relay/secrets
     → Auth-Secret setzen (automatisch generiert)
  4. Workers.dev URL: https://obsilo-relay.{subdomain}.workers.dev
```

Alle API-Calls nutzen Obsidians `requestUrl` (Review-Bot-konform, kein `fetch()`).

Durable Objects sind seit April 2025 im Free Tier -- der User braucht keinen
Workers Paid Plan ($5/Monat ist nicht mehr noetig).

### Relay-Architektur

```
MCP Client (claude.ai, ChatGPT, etc.)
    │
    │  HTTPS POST /{relay-id}/mcp
    │  Header: Authorization: Bearer {token}
    ▼
Cloudflare Worker (Router)
    │
    │  Lookup Durable Object by relay-id
    ▼
Durable Object (per User)
    │
    │  Forward request over WebSocket
    │  Wait for response (30s timeout)
    ▼
Obsilo Plugin (WebSocket Client)
    │
    │  handleToolCall() → result
    │
    ▲  Send response back over WebSocket
    │
Durable Object → HTTP Response → MCP Client
```

### Durable Object Design

```typescript
export class RelayDO {
    // Hibernation API: WebSocket bleibt offen, DO schlaeft wenn idle
    async fetch(request: Request) {
        if (isWebSocketUpgrade(request)) {
            // Plugin verbindet sich
            const [client, server] = Object.values(new WebSocketPair());
            this.ctx.acceptWebSocket(server);
            return new Response(null, { status: 101, webSocket: client });
        }

        // MCP Request von claude.ai/ChatGPT
        const correlationId = crypto.randomUUID();
        const ws = this.ctx.getWebSockets()[0];
        ws.send(JSON.stringify({ id: correlationId, ...await request.json() }));

        // Warte auf Response (Plugin antwortet ueber WebSocket)
        return await this.waitForResponse(correlationId, 30000);
    }

    webSocketMessage(ws, message) {
        // Response vom Plugin empfangen, wartenden HTTP-Request resolven
        const data = JSON.parse(message);
        this.resolveRequest(data.id, data);
    }
}
```

### Auth: Shared Secret

```
Relay generiert bei Deploy: RELAY_TOKEN=sk-{random-64-chars}
Plugin Settings:  Relay URL + Token (SafeStorageService verschluesselt)
MCP Client:       Authorization: Bearer {token} Header

Relay validiert Token bei JEDEM Request (Worker-Level, vor DO-Dispatch).
```

### Plugin WebSocket Client

```typescript
class RelayClient {
    private ws: WebSocket | null = null;

    async connect(relayUrl: string, token: string) {
        this.ws = new WebSocket(`${relayUrl}/ws`, { headers: { Authorization: `Bearer ${token}` } });
        this.ws.onmessage = (msg) => this.handleRequest(JSON.parse(msg.data));
        this.ws.onclose = () => this.reconnect(); // exponentieller Backoff
    }

    private async handleRequest(request) {
        const result = await handleToolCall(this.plugin, request.tool, request.args);
        this.ws.send(JSON.stringify({ id: request.id, result }));
    }
}
```

## Consequences

### Positive
- Kein Terminal, kein CLI -- Deployment per REST API aus dem Plugin
- Kein Binary auf User-Rechner (WebSocket ausgehend)
- Persistente URL (ueberlebt alles)
- Multi-Client (Claude, ChatGPT, Cursor, etc.)
- Hibernation: keine Idle-Kosten
- Cloudflare Free Tier reicht (seit April 2025)
- User kontrolliert seine Daten (eigener Account)

### Negative
- User braucht Cloudflare-Account (kostenlos, aber trotzdem ein Account)
- User muss API Token erstellen (Browser, 2 Minuten)
- Relay-Code als String im Plugin eingebettet (Updates nur ueber Plugin-Updates)
- WebSocket-Reconnect-Logik noetig

### Risks
- Cloudflare API aendert sich: Mitigation: Version pinnen, SDK nutzen
- WebSocket Idle-Timeout: Mitigation: Keepalive Pings alle 30s
- Relay-Ausfall: Mitigation: Lokaler Connector (Claude Desktop) funktioniert weiterhin
- API Token zu breite Permissions: Mitigation: Vorbefuellter Link mit minimalen Permissions

## Related
- ADR-53: MCP Server Prozess-Architektur
- ADR-54: MCP Tool-Mapping
- FEAT-14-03: Remote Transport
