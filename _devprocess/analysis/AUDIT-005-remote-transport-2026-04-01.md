# Security Audit: FEAT-14-03 Remote Transport

> **Audit-ID:** AUDIT-005
> **Datum:** 2026-04-01
> **Scope:** Remote Transport (Cloudflare Relay) -- relayWorkerCode.ts, RelayClient.ts, CloudflareDeployer.ts, McpTab.ts
> **Gesamt-Risiko:** High (2C, 7H, 7M, 3L, 1I)

---

## Zusammenfassung

| Severity | Anzahl | Status |
|----------|--------|--------|
| Critical | 2 | Confirmed |
| High | 7 | Confirmed |
| Medium | 7 | Confirmed |
| Low | 3 | Confirmed |
| Info | 1 | Positive Finding |

---

## Critical Findings

### C-1: Unauthenticated /diag Endpoint Leaks Token Material
**CWE-200, CWE-287 | relayWorkerCode.ts:49-59**

Der `/diag`-Endpunkt erfordert KEINE Authentifizierung und gibt zurueck:
- Token-Prefix (erste 6 Zeichen)
- Token-Laenge
- Boolean `match` (Token-Oracle fuer Brute-Force)

Jeder, der die Relay-URL kennt, kann Token-Material extrahieren.

**Remediation:** `/diag`-Endpunkt entfernen. War nur fuer Debugging noetig.

### C-2: Unauthenticated /debug Endpoint Exposes Internal State
**CWE-200 | relayWorkerCode.ts:62-70, 138-145**

Der `/debug`-Endpunkt erfordert KEINE Authentifizierung und gibt zurueck:
- `pluginConnected` Status (Obsidian online/offline)
- Request-Queue-Laenge
- Letzte 20 Log-Eintraege inkl. MCP-Methoden und Pfade

**Remediation:** `/debug`-Endpunkt entfernen. War nur fuer Debugging noetig.

---

## High Findings

### H-1: Timing-Attack Vulnerable Token Comparison
**CWE-287 | relayWorkerCode.ts:75, 92, 97**

Token-Vergleich mit `===` ist nicht constant-time. Auf Cloudflare Workers (niedrige Latenz, konsistente Ausfuehrung) potenziell ausnutzbar.

**Remediation:** Constant-time Vergleich: Beide Tokens mit SHA-256 hashen, dann Byte-weise mit XOR vergleichen.

### H-2: Token Prefix Logged in Plugin Console
**CWE-200 | RelayClient.ts:63**

Token-Prefix und -Laenge werden bei jedem Reconnect per `console.warn` geloggt. DevTools-Console persistiert und koennte bei Crash Reports erfasst werden.

**Remediation:** Token-Prefix aus Logs entfernen. Nur `hasToken: true/false` loggen.

### H-3: Diagnostic Call Sends Full Token to Unauthenticated Endpoint
**CWE-200 | RelayClient.ts:66**

Vollstaendiger Token wird an `/diag` gesendet. War nur fuer Debugging.

**Remediation:** Diag-Call entfernen.

### H-4: Token Transmitted in URL Query String
**CWE-311 | RelayClient.ts:73, 149, 161**

Token wird als Query-Parameter (`?token=xxx`) gesendet. URL-Logs bei Cloudflare, Proxies, Browser-History koennen Token erfassen.

**Remediation:** Token in `Authorization: Bearer` Header verschieben fuer alle Endpunkte.

### H-5: Unbounded Request Queue in Durable Object
**CWE-400 | relayWorkerCode.ts:125, 224-226**

`requestQueue` und `pending` Map haben kein Limit. DoS durch Queue-Flooding moeglich (DO hat 128 MB RAM-Limit).

**Remediation:** Queue auf 100 Eintraege, Pending auf 50 begrenzen. HTTP 429 bei Ueberlauf.

### H-6: Wildcard CORS on Authenticated Endpoints
**CWE-352 | relayWorkerCode.ts:30-34**

`Access-Control-Allow-Origin: *` auf ALLEN Endpunkten inkl. authentifizierten. Jede Website kann Cross-Origin-Requests senden und Responses lesen.

**Remediation:** CORS nur fuer MCP-Endpunkt (claude.ai etc.), nicht fuer `/poll` und `/respond`.

### LLM-1: No Approval Gate for Destructive Tools via Relay
**LLM01 | RelayClient.ts:131-135**

Write-Operationen (write_vault, update_memory) werden ohne User-Bestaetigung ausgefuehrt. Bei kompromittiertem AI-Client koennen beliebige Vault-Aenderungen vorgenommen werden.

**Remediation:** Geplant als FEAT-14-08 (Remote Approval Pipeline). Kurzfristig: Write-Tools fuer Remote deaktivieren oder Rate-Limiting.

---

## Medium Findings

### M-1: Unvalidated JSON Deserialization from Relay
**CWE-502 | RelayClient.ts:84, 113**

Relay-Responses werden ohne Runtime-Validierung per `as` gecastet.

**Remediation:** Runtime-Type-Checks (typeof) vor handleToolCall.

### M-2: Cloudflare API Token Possibly Stored in Plaintext
**CWE-200 | McpTab.ts:137, settings.ts:565**

CF API Token wird in `data.json` gespeichert. Unklar ob SafeStorage-Verschluesselung greift.

**Remediation:** Verifizieren dass SafeStorage den CF Token verschluesselt, oder Token nicht persistieren.

### M-3: No URL Validation on Relay URL
**CWE-918 | RelayClient.ts:38**

Relay-URL wird nicht validiert (HTTPS, Domain).

**Remediation:** HTTPS erzwingen, URL-Format pruefen.

### M-4: Diagnostic Response Leaks URL Structure
**CWE-200 | relayWorkerCode.ts:58**

Wird mit C-1 entfernt.

### M-5: No Request Size Limit on MCP POST Body
**CWE-693 | relayWorkerCode.ts:185**

Kein Content-Length-Check. Grosse Payloads verstaerken H-5.

**Remediation:** Bodies > 1 MB ablehnen.

### M-6: execSync for Node Path Discovery
**CWE-78 | McpTab.ts:453**

`execSync('which node')` -- kein User-Input, aber entdeckter Pfad wird in Claude Desktop Config geschrieben. Lokaler Privilege-Escalation-Vektor.

**Remediation:** Node-Binary validieren (`node --version`).

### M-7: Guessable Correlation IDs in /respond
**CWE-287 | relayWorkerCode.ts:161-169**

JSON-RPC IDs sind sequentiell (0, 1, 2...). Attacker kann Fake-Responses fuer pending Requests injizieren.

**Remediation:** Server-seitig kryptographische Correlation-IDs generieren.

---

## Low Findings

### L-1: Error Messages May Leak Internal Details
**CWE-200 | RelayClient.ts:155, 166**

Exception-Messages werden ueber Relay an AI-Client gesendet.

### L-2: Diagnostic Response Logged to Console
**CWE-200 | RelayClient.ts:67**

Wird mit H-3 entfernt.

### L-3: Broad CORS Headers
**CWE-693 | relayWorkerCode.ts:33**

Verstaerkt H-6.

---

## Positive Findings

- **Token-Generierung** (McpTab.ts:166): `crypto.getRandomValues` mit 256 Bit Entropie -- korrekt
- **TLS erzwungen**: Cloudflare erzwingt HTTPS automatisch
- **Self-Hosted**: Kein Drittanbieter-Server, User kontrolliert Infrastruktur
- **Token-in-URL Auth**: Umgeht OAuth-Komplexitaet, angemessen fuer Self-Hosted BYOK

---

## SCA (Software Composition Analysis)

| Dependency | Severity | CVE | Status |
|-----------|----------|-----|--------|
| path-to-regexp >=8.0.0 <8.4.0 | High | GHSA-j3q9-mxjg-w52f | ReDoS -- dev dependency, nicht runtime-relevant |
| path-to-regexp | Moderate | GHSA-27v5-c462-wpq7 | ReDoS -- dev dependency |
| 5 weitere | Moderate | diverse | Dev dependencies |

**Bewertung:** Keine Runtime-Vulnerabilities. Alle Findings betreffen Dev-Dependencies.

---

## LLM-spezifische Findings

### LLM-2: Vault Content Passes Through CF Edge in Plaintext
**LLM06 | Medium**

Alle Vault-Inhalte (Suchergebnisse, Dateien, Memory) fliessen ueber Cloudflare Workers. TLS wird am CF Edge terminiert -- Cloudflare kann Plaintext einsehen. Fuer Self-Hosted-Szenario akzeptabel (User vertraut seinem eigenen CF Account), aber fuer sensitive Inhalte relevant.

**Remediation:** In Doku dokumentieren. E2E-Verschluesselung als spaeteres Feature (komplex).

---

## Empfohlene Prioritaet

**P0 (sofort):** C-1, C-2 -- Debug-Endpunkte entfernen (5 Min)
**P1 (kurzfristig):** H-2, H-3, L-2 -- Debug-Logging entfernen (5 Min)
**P1 (kurzfristig):** H-5 -- Queue-Limits (10 Min)
**P1 (kurzfristig):** H-6 -- CORS einschraenken (10 Min)
**P2 (mittelfristig):** H-1 -- Constant-time Token-Vergleich
**P2 (mittelfristig):** H-4 -- Token von URL zu Header migrieren
**P2 (mittelfristig):** M-5, M-7 -- Request-Size-Limit, Random Correlation IDs
**Backlog:** M-2, M-3, M-6, LLM-1 (FEAT-14-08), LLM-2
