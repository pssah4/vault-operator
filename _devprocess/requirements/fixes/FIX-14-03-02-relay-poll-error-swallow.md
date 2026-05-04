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

Implementiert: `catch (err)` mit Binding plus zwei reine Helfer
`describeRequestError(err, token)` und `redactToken(text, token)` in
`src/mcp/RelayClient.ts`. Der Catch-Block loggt jetzt Format
`[RelayClient] Poll failed (HTTP 429: error code: 1027), retrying in
5000 ms`. AUDIT-005 H-2/H-3 bleibt erfuellt: jeder geloggte String
laeuft durch `redactToken`, das den Relay-Token und alle generischen
`Bearer`-Header durch `<redacted>` ersetzt. Nach drei aufeinander
folgenden Fehlern erscheint einmalig eine Obsidian-`Notice`, damit
ein Outage ohne Devtools sichtbar ist; der Counter resettet beim
naechsten erfolgreichen Poll.

Implementation pointer: `src/mcp/RelayClient.ts` (Helfer + erweiterter
`pollLoop`-Catch).

## Regression test

`src/mcp/__tests__/RelayClient.test.ts` deckt beide Helfer ab: 8
Cases inkl. Status+Body-Format, Token-Redaction, Body-Truncation
auf 200 Zeichen, Fallback auf `err.message` und `err.name`. Vitest
`npx vitest run src/mcp/__tests__/RelayClient.test.ts` muss alle 8
Tests gruen liefern.

## Status

See the backlog row for FIX-14-03-02 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).
