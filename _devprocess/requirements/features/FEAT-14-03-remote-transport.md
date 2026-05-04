# Feature: Remote Transport (Cloudflare Relay)

> **Feature ID**: FEAT-14-03
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P1-High
> **Effort Estimate**: L

## Feature Description

Obsilo's MCP Server wird ueber einen selbst-gehosteten Relay-Server von ueberall erreichbar.
Der Relay laeuft auf Cloudflare Workers + Durable Objects ($5/Monat). Das Plugin verbindet
sich per ausgehender WebSocket-Verbindung zum Relay -- kein Tunnel-Binary, kein Port-Oeffnen.

Funktioniert mit ALLEN MCP-Clients: claude.ai, ChatGPT, Cursor, Windsurf, etc.

## Architektur

```
claude.ai  ──┐
ChatGPT    ──┼──→ HTTPS → Cloudflare Worker → Durable Object ←── WebSocket ←── Obsilo Plugin
Cursor     ──┘             (Relay, auf User's Cloudflare)                        (lokal)
                           Auth: Shared Secret
```

### Wie es funktioniert

1. **User erstellt Cloudflare API Token** (kostenlos, im Browser, vorbefuellter Link)
2. **User gibt Token in Obsilo ein** (ein Feld)
3. **User klickt "Deploy relay"** -- Obsilo deployed den Worker per Cloudflare REST API
4. **Plugin verbindet** sich per WebSocket zum Relay (ausgehend, keine Firewall-Probleme)
5. **MCP-Clients** senden Requests an die Relay-URL (HTTPS)
6. **Relay forwarded** Request ueber WebSocket an Plugin, wartet auf Response, gibt sie zurueck
7. **Durable Object Hibernation:** Relay schlaeft wenn keine Requests kommen (keine Kosten im Idle)

**Kein Terminal, kein CLI, kein wrangler.** Alles passiert ueber die Cloudflare REST API
direkt aus Obsilo heraus (via `requestUrl`, Review-Bot-konform).

### Zwei Komponenten

**A) Relay-Deployment (in Obsilo, per Cloudflare API)**
- Worker-Code als String im Plugin eingebettet
- Deployment per REST API: PUT /workers/scripts/{name}
- Durable Object Bindings + Migration in den Metadata
- Secret per API setzen: PUT /workers/scripts/{name}/secrets
- Account ID wird automatisch per API ermittelt

**B) Plugin-Erweiterung (in Obsilo)**
- WebSocket-Client der sich zum Relay verbindet
- Reconnect-Logik (exponentieller Backoff)
- Keepalive Pings
- Settings: Cloudflare API Token, Relay-URL (automatisch), Auth-Secret (automatisch)

## Benefits Hypothesis

**Wir glauben dass** ein selbst-gehosteter Relay
**Folgende messbare Outcomes liefert:**
- Obsilo von jedem Geraet und jeder AI-Plattform erreichbar
- Kein Tunnel-Binary auf dem User-Rechner noetig
- Stabile, persistente URL (ueberlebt Neustarts)

**Wir wissen dass wir erfolgreich sind wenn:**
- claude.ai kann Obsilo-Tools ueber die Relay-URL nutzen
- ChatGPT kann denselben Relay nutzen
- Verbindung ueberlebt Obsidian-Neustart (automatischer Reconnect)

## User Stories

### Story 1: Vault von ueberall
**Als** Knowledge Worker
**moechte ich** von claude.ai im Browser auf meinen Vault zugreifen
**um** auch unterwegs mein Wissen zu nutzen

### Story 2: Multi-Plattform
**Als** User der Claude UND ChatGPT nutzt
**moechte ich** denselben Connector fuer beide Plattformen verwenden
**um** nicht zwei Setups pflegen zu muessen

### Story 3: Einfaches Setup
**Als** technisch versierter User
**moechte ich** den Relay mit einem "Deploy" Button aufsetzen
**um** nicht manuell Server konfigurieren zu muessen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | claude.ai kann ueber Relay auf Vault zugreifen | search_vault funktioniert | E2E-Test |
| SC-02 | ChatGPT kann denselben Relay nutzen | Tools verfuegbar | E2E-Test |
| SC-03 | Verbindung ueberlebt Plugin-Neustart | Automatischer Reconnect | Restart-Test |
| SC-04 | Unautorisierte Requests abgelehnt | 401 ohne Token | Security-Test |
| SC-05 | Relay-Setup unter 10 Minuten | Anleitung + Deploy Button | User-Test |
| SC-06 | Latenz akzeptabel | Unter 2s Ende-zu-Ende | Zeitmessung |

---

## Technical NFRs

### Performance
- Relay-Hop-Latenz: <100ms (Cloudflare Edge)
- Ende-zu-Ende: <2s (Relay + Plugin Tool Execution)
- WebSocket Reconnect: <5s nach Verbindungsabbruch

### Security
- Shared Secret Token (Bearer Header) fuer alle Requests
- TLS erzwungen (Cloudflare automatisch)
- Token in Obsilo via SafeStorageService verschluesselt
- Relay speichert keine Daten (reine Weiterleitung)

### Reliability
- Durable Object Hibernation: WebSocket bleibt offen auch wenn DO schlaeft
- Plugin-seitiger Reconnect mit exponentiellem Backoff
- Keepalive Pings alle 30s

### Kosten
- Cloudflare Workers Paid: $5/Monat (inkl. Durable Objects)
- Realistischer Verbrauch: wenige hundert Requests/Tag pro User
- Keine Kosten im Idle (Hibernation)

---

## Architecture Considerations

### ASRs

**CRITICAL ASR #1**: Kein Terminal, kein CLI
- Deployment per Cloudflare REST API direkt aus Obsilo
- User gibt nur API Token ein und klickt "Deploy"

**CRITICAL ASR #2**: Multi-Plattform-kompatibel
- Ein Relay-Endpoint fuer alle MCP-Clients
- MCP JSON-RPC ueber HTTPS (Streamable HTTP kompatibel)

**CRITICAL ASR #3**: User hostet auf eigenem Account (Privacy)
- Worker laeuft auf dem Cloudflare-Account des Users
- Keine Daten fliessen ueber Dritte
- API Token mit minimalen Permissions

---

## Definition of Done

### Functional
- [ ] Relay-Code als eingebetteter String im Plugin
- [ ] "Deploy relay" Button deployt per Cloudflare REST API (kein CLI)
- [ ] Account ID automatisch ermittelt per API
- [ ] Auth-Secret automatisch generiert und per API gesetzt
- [ ] Plugin: WebSocket-Client mit Reconnect
- [ ] Plugin: Settings (API Token, Relay-URL automatisch, Auth-Secret automatisch)
- [ ] claude.ai: E2E funktioniert
- [ ] ChatGPT: E2E funktioniert
- [ ] Standalone-Modus: 0 Regressionen

### Quality
- [ ] Security: Unautorisierte Requests abgelehnt
- [ ] Reliability: Reconnect nach Verbindungsabbruch
- [ ] Performance: <2s Ende-zu-Ende

### Documentation
- [ ] Setup-Guide fuer Cloudflare Relay
- [ ] Feature-Spec aktualisiert

---

## Dependencies
- **FEAT-14-00**: MCP Server Core (lokaler HTTP-Server)
- **Cloudflare Account**: Kostenlos (Durable Objects seit April 2025 im Free Tier)

## Out of Scope
- OAuth 2.1 (FEAT-14-04 -- spaeter, Shared Secret reicht fuer BYOK)
- Managed Relay Service (spaeter -- erstmal Self-Deploy)
- Approval-Pipeline fuer Remote Writes (FEAT-14-08)
