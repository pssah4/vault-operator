---
id: FIX-14-03-02
feature: FEAT-14-03
epic: EPIC-14
adr-refs: [ADR-55]
plan-refs: []
depends-on: []
created: 2026-05-04
---

# FIX-14-03-02: RelayClient verschluckt Poll-Fehler komplett, Diagnose nur ueber Browser-DevTools moeglich

## Symptom

Wenn der Cloudflare Worker einen Fehler liefert (HTTP 429, 5xx,
Auth-Fehler, Timeout, DNS), zeigt die Obsidian-Konsole nur
`[RelayClient] Poll failed, retrying in N ms`. Status-Code, Body und
Error-Type fehlen. Bei FIX-14-03-01 war fuer den User nicht erkennbar,
dass es ein Quota-Issue ist und kein Network-Problem oder
Token-Mismatch. Diagnose erforderte manuellen `curl`-Test ausserhalb
des Plugins.

## Root cause

Der `catch`-Block in `pollLoop` faengt den Fehler ohne Binding und
loggt nur eine generische Warnung. Der ursprung des Fehler-Swallow
ist eine Sicherheits-Anforderung aus AUDIT-005 (H-2/H-3: kein
Token-Material in Logs). Die Implementierung warf das Kind mit dem
Bade aus: nicht nur Token, sondern jede Fehler-Info wurde entfernt.

```
RelayClient.pollLoop()
  -> catch {                              // src/mcp/RelayClient.ts:104
       console.warn('Poll failed ...')   // src/mcp/RelayClient.ts:110
     }
  -> Originaler Error (Status, Body, Stack) ist im Closure nicht
     mehr referenzierbar, weil keine Binding-Variable
  -> Devtools zeigt zwar das requestUrl-Resultat oben drueber,
     aber keine kausale Zuordnung zur Warning-Zeile
```

## Fix

Offen. Vorschlag: `catch (err)` mit Binding, dann sanitiziertes Logging:

- HTTP-Status loggen (kein Token-Material).
- Bei `requestUrl`-Errors aus Obsidian: `err.status` und ein gekuerzter
  Body (max 200 Zeichen, Token-Patterns redacted).
- Bei Network-Errors: `err.name` plus `err.message` (Token via
  Regex-Redaction durch `<redacted>` ersetzen, der relayUrl-Hostname
  bleibt).
- Optional: nach 3 Fehlern in Folge eine Notice an den User
  (`new Notice('Relay nicht erreichbar, Details in Console')`),
  damit der Bug nicht silent bleibt.

Implementation pointer: `src/mcp/RelayClient.ts:104-114`. ARCHITECTURE.map
fuehrt RelayClient unter `src/mcp/RelayClient.ts` als Entry-Point.

## Regression test

Test, der `requestUrl` so mockt, dass er einen Error mit `status: 429`
und `body: 'error code: 1027'` wirft. Erwartung: ein einzelner
`console.warn`-Aufruf mit String, der `429` enthaelt und keinen Token
enthaelt.

## Status

See the backlog row for FIX-14-03-02 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).
