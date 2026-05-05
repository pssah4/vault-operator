---
id: FIX-14-03-01
feature: FEAT-14-03
epic: EPIC-14
adr-refs: [ADR-55]
plan-refs: []
depends-on: []
created: 2026-05-04
status: Resolved in v2.7.1
resolved: 2026-05-05
commit: 3be9eca
---

# FIX-14-03-01: Relay-Poll laeuft endlos in Backoff weil Cloudflare Worker mit HTTP 429 + Errorcode 1027 antwortet

## Symptom

Nach erfolgreichem `Connected to relay` beim Plugin-Start failt jeder
weitere `GET /poll` durchgehend. Das Plugin durchlaeuft den exponential
Backoff (1s, 2s, 4s, 8s, 16s, 30s) und bleibt bei 30s haengen. Externe
MCP-Clients (Claude.ai, ChatGPT) sehen keine Tools mehr von Obsilo. In
der UI gibt es keine Fehlermeldung. `curl https://obsilo-relay.se-hanke.workers.dev/`
liefert reproduzierbar `HTTP 429` mit Cloudflare-Body `error code: 1027`.

## Root cause

Cloudflare Workers Free Plan: 100k Requests/Tag pro Account. Der
RelayClient pollt unabhaengig von tatsaechlicher MCP-Nutzung alle 2s
ein `GET /poll`, solange Obsidian offen ist. Das ergibt 43.200
Requests/Tag bei 24h-Session pro Plugin-Instanz. User-Beobachtung
2026-05-04: Limit erreicht trotz fast keiner aktiven MCP-Nutzung,
Cloudflare zeigt `Daily requests limit: 100000`, Reset 2026-05-05
00:00 UTC.

```
Obsidian onload -> Plugin onload -> RelayClient.connect()
                -> Polling /poll alle 2s = 43200 Requests/Tag
                   * pro offener Obsidian-Instanz
                   * unabhaengig von echter MCP-Nutzung
                -> bei 2-3 Geraeten / Plugin-Reloads via BRAT /
                   npm run dev Watch-Mode -> 100k erreicht
                -> Worker liefert 429 + 1027
                -> requestUrl wirft, Catch in pollLoop greift
                -> Endloser Backoff bei 30s
                -> Recovery erst beim Quota-Reset um 00:00 UTC
```

Hauptverursacher ist das aggressive 2s-Polling, nicht die MCP-Calls
selbst. Externe Clients (Claude.ai, ChatGPT) addieren Requests, sind
aber nur Sekundaer-Effekt.

## Fix

Offen. Loesungs-Optionen (zu entscheiden):

1. **Polling-Intervall reduzieren:** 2s -> 10s reduziert Plugin-Last
   um Faktor 5x (43k -> 8.6k/Tag pro Instanz). Loest das akute Limit
   ohne Plan-Upgrade. Kostet bis zu 10s Latenz beim ersten Tool-Call
   nach Idle, aber Tool-Calls passieren ueblicherweise in Bursts und
   die Folge-Calls sehen die volle Latenz nicht.
2. **Long-Polling im Worker:** `/poll` haelt Connection bis Daten da
   sind (statt sofort leer zu antworten). Reduziert Requests
   drastisch (von 43200 auf < 100/Tag). Erfordert Aenderung in
   `relayWorkerCode.ts` mit Durable-Object-Wait-Logik. Worker-CPU-Time
   pro Request steigt, aber CPU-Limit ist auf Free Plan grosszuegiger
   als Request-Count.
3. **Workers Paid Plan ($5/Monat):** 10M Requests inkludiert, Limit
   praktisch nicht erreichbar. ADR-55 nennt $5/Monat bereits als
   geplante Kosten. Loest das Symptom ohne Architektur-Aenderung.
4. **Polling pausieren bei Idle:** Plugin pausiert das Polling, wenn
   Obsidian-Window nicht im Vordergrund ist (`document.visibilityState`).
   Erfordert Listener-Setup, hilft aber bei mehreren Geraeten.

Empfehlung: Option 1 zuerst (kleiner Code-Change in
`src/mcp/RelayClient.ts:103`), parallel Cloudflare-Analytics pruefen
um zu bestaetigen dass /poll der Hauptverursacher ist. Option 2 ist
die saubere Langzeit-Loesung, Option 3 als Fallback wenn Volumen mit
externen Clients dauerhaft >100k bleibt.

Implementiert: Option 1 (Polling-Intervall 2s -> 10s) in
`src/mcp/RelayClient.ts`. Konstanten `POLL_INTERVAL_MS = 10_000`,
`INITIAL_RECONNECT_DELAY_MS = 5_000`, `MAX_RECONNECT_DELAY_MS = 60_000`
ersetzen die Magic Numbers. Verbrauch sinkt von 43.200 auf 8.640
Requests/Tag pro Plugin-Instanz. Long-Polling im Worker (Option 2)
bleibt als spaetere Optimierung im Backlog. Plan-Upgrade (Option 3)
nicht noetig, solange Multi-Device-Setup stabil unter 100k bleibt.

## Regression test

Smoke-Check `curl -I https://obsilo-relay.se-hanke.workers.dev/poll`
mit gueltigem Bearer Token muss `200 OK` liefern, nicht `429`. Plus
Plugin-Konsole muss nach erstem `Connected to relay` keine
`Poll failed`-Warnings ueber 5 Minuten produzieren.

## Status

See the backlog row for FIX-14-03-01 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).
