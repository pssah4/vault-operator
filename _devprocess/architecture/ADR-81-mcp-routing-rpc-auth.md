---
id: ADR-81
title: MCP-Tool-Routing + Plugin-Standalone-RPC-Authentifizierung
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - ADR-80-persistence-service-pattern.md
  - FEAT-14-04 (MCP Remote Auth)
  - FEAT-03-19-living-document-ux.md
triggers:
  - ASR-032 (Plugin-MCP routet pro Tool-Call)
  - ASR-034 (Persistenz-Service-RPC Multi-Client-tauglich)
  - ASR-045 (Bearer-Token + HTTPS)
---

# ADR-81 -- MCP-Tool-Routing + Plugin-Standalone-RPC

## Status

Proposed.

## Context

ADR-80 (Persistenz-Service-Pattern) etabliert drei Setup-Klassen. In Klasse C ("Central-Service") proxied Plugin-MCP Memory-Tool-Calls an einen externen Persistenz-Service. Externe Clients (Claude Desktop, Claude Code, ChatGPT-Developer-Mode) sehen aber **eine** MCP-URL (Plugin-Cloudflare-Tunnel) -- sie wissen nichts von der Service-Trennung.

Triggernde ASRs: ASR-032 (Plugin-MCP-Tool-Routing), ASR-034 (RPC Multi-Client), ASR-045 (Auth-Strategie).

Bestehender Kontext: FEAT-14-04 (MCP Remote Auth) hat heute Bearer-Token + Cloudflare-Tunnel. OAuth 2.1 ist Backlog.

## Decision Drivers

- **DD-1 Single-MCP-Endpoint fuer externe Clients:** Claude Desktop merkt nicht, ob Memory-Tools lokal oder remote bedient werden.
- **DD-2 Multi-Client-RPC:** Mehrere Workers (Plugin auf Notebook A, Plugin auf Notebook B, Standalone-Service) muessen gleichzeitig zum Persistenz-Service schreiben koennen.
- **DD-3 Setup-Wechsel ohne URL-Aenderung beim Client:** User wechselt von K-A zu K-C, externe Clients muessen nicht umkonfiguriert werden.
- **DD-4 Auth-Konsistenz mit FEAT-14-04:** kein paralleler Auth-Mechanismus.

## Considered Options

### Option 1: Zwei separate MCP-Endpoints (Plugin + Service direkt)

Externer Client muss zwei MCP-URLs kennen, eine fuer Vault-Tools (Plugin), eine fuer Memory-Tools (Standalone-Service).

- + Pro: Keine Routing-Logic im Plugin, klare Trennung
- - Con: Bricht DD-1 (Client muss zwei URLs konfigurieren)
- - Con: Bricht DD-3 (Setup-Wechsel erfordert Client-Reconfig)

### Option 2: Plugin-MCP routet alle Tool-Calls (Empfohlen)

Plugin-MCP empfaengt alle Tool-Calls. Routing-Logic entscheidet pro Tool: Vault-Tool -> Plugin antwortet selbst, Memory-Tool -> Plugin antwortet (K-A/K-B) oder proxied an Service-URL (K-C).

- + Pro: DD-1 erfuellt -- Client sieht eine URL
- + Pro: DD-3 erfuellt -- Setup-Wechsel ohne Client-Aenderung
- + Pro: Konsistent mit Cloudflare-Relay-Pattern (heute schon im Code)
- - Con: Plugin wird Routing-Bottleneck. Aber: Routing ist O(1) per Tool-Name-Lookup, kein Performance-Problem.

### Option 3: MCP-Aggregator als drittes Programm (verworfen)

Ein duenner Proxy aggregiert beide MCP-Worker-Endpoints und exponiert eine einheitliche API.

- - Con: Zusaetzlicher Prozess, mehr Setup-Aufwand. Nicht-trivial fuer Single-User-MVP.

## Decision

**Option 2 -- Plugin-MCP routet pro Tool-Call.**

Routing-Logik:

```
Plugin-MCP empfaengt Tool-Call
+- Vault-Tool (read_file, write_file, search_files, semantic_search,
|              get_vault_implicit_edges, get_vault_note_metadata)
|  -> Plugin antwortet selbst (knowledge.db lokal)
`- Memory-Tool (save_conversation, search_history, recall_memory,
                mark_conversation_for_memory, mark_conversation_private,
                update_fact, delete_fact, set_importance, ...)
   +- persistenceService='local'  -> Plugin antwortet via lokaler Engine
   `- persistenceService='remote' -> Plugin proxied via HTTPS/JSON-RPC
                                     an persistenceServiceUrl
```

**RPC-Authentifizierung:** Bearer-Token + HTTPS (konsistent mit FEAT-14-04). Pro Worker eigenes Token, in `_devprocess/security/safe-storage.json` ueber Electron SafeStorage verschluesselt persistiert.

**RPC-Format:** HTTP/JSON-RPC 2.0:

```json
POST https://persistenceServiceUrl/rpc
Authorization: Bearer <worker-token>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": "<uuid>",
  "method": "save_conversation",
  "params": { "conversation_id": "...", "messages": [...] }
}
```

Schema entspricht Memory-Tool-Schema (gleiches Format wie MCP-Tools), damit kein zweiter Vertrag entsteht.

**Multi-Client-Tauglichkeit:** Persistenz-Service akzeptiert beliebig viele Clients. Pro Token wird ein `client_id` deriviert (Hash-Praefix). Audit-Log traegt `client_id`-Stempel.

## Consequences

**Positiv:**

- Externe Clients sehen einen Endpoint, Setup-Wechsel transparent
- Konsistent mit FEAT-14-04-Auth-Strategie
- Multi-Client-faehig von Anfang an (kein Refactor wenn UCM kommt)

**Negativ:**

- Routing-Code im Plugin-MCP-Layer (~100-200 Zeilen)
- Latenz-Aufschlag bei `remote`: LAN-RTT typisch 10-30ms, plus Proxy-Overhead 20ms
- Token-Leak = voller Memory-Schreibzugriff. Mitigation: Token-Rotation manuell ueber Service-Admin-UI (post-MVP).

**Risks:**

- **R-1:** OAuth 2.1 (FEAT-14-04 Backlog) wird nicht synchron mit Memory v2 gebaut. **Mitigation:** Bearer-Token reicht fuer MVP, Migration zu OAuth ist additiv.
- **R-2:** RPC-Tool-Schema-Drift zwischen Plugin und Service bei Engine-Update. **Mitigation:** semver-Disziplin (siehe ADR-84), Plugin und Service muessen kompatible Engine-Major-Version haben.
- **R-3:** Cloudflare-Tunnel + Plugin-Standalone-Tunnel zusammen: zwei Tunnels koennten zu komplex werden. **Mitigation:** Service-RPC nutzt nicht Cloudflare-Relay, sondern direkten HTTPS-Endpoint zum Service-Geraet.

## Implementation-Bezug

- FEAT-03-19 implementiert Plugin-MCP-Routing-Logic + Settings
- FEAT-14-04 bleibt fuer externe-Client-Auth zustaendig (Cloudflare-Tunnel)
- Plugin-Standalone-RPC ist neuer Pfad, nicht ueber Cloudflare

## Open Questions

- Token-Rotation-UX (manuell vs automatisch) -- post-MVP
- mTLS als Premium-Option fuer Enterprise-Setups -- Backlog
- Service-Discovery (statisch vs DNS-SD vs Bonjour) -- aktuell nur statische URL-Konfig
