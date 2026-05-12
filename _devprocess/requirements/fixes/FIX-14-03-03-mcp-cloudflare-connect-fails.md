---
id: FIX-14-03-03
feature: FEAT-14-03
epic: EPIC-14
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-08
issue: https://github.com/pssah4/vault-operator-dev/issues/64
---

# FIX-14-03-03: MCP Cloudflare-Worker-Connect schlaegt aus Settings UI fehl

## Symptom

Live-Test 2026-05-08 (User-Report). Beim Verbinden eines via Cloudflare
Worker erreichbaren MCP-Servers in den Plugin-Settings schlaegt der
Connect-Versuch fehl. Sichtbare Fehlermeldung in der UI; konkreter
Text wird vom User als Issue-Kommentar nachgereicht (siehe
[#64](https://github.com/pssah4/vault-operator-dev/issues/64)).

Verwandte Vorgaenger im selben Feature:

- FIX-14-03-01 -- Relay-Poll endlos in Backoff bei HTTP 429 (Done).
- FIX-14-03-02 -- RelayClient verschluckt Poll-Fehler (Done).

Beide bereits released; FIX-14-03-03 ist also keine Wiederkehr derselben
Symptome.

## Root cause -- offen, Diagnose-Vorschlaege

Endgueltige Root-Cause-Identifikation erst moeglich, wenn:

1. User den konkreten Fehlertext aus der Settings-UI nachreicht.
2. Network-Tab aus Browser-DevTools aktiviert ist (Status-Code,
   Response-Body, Request-Headers des Connect-Calls).

Bekannte Stolpersteine im FEAT-14-03-Pfad
(`memory/project_remote_transport.md`):

- Token-in-URL-Auth: falscher Token-Inject-Pfad fuehrt zu 401/403 mit
  Plain-Text-Body, den der RelayClient mglw. als Connect-Failure
  rendert.
- HTTP long-polling Backoff: bei 429 endete der Pfad frueher in
  unendlichem Backoff (FIX-14-03-01); moeglich, dass eine Variante
  zurueckgekehrt ist (z. B. ueber Cloudflare Worker-side rate
  limiting).
- Cloudflare DO Cold Start: erste Connect-Welle laeuft in Timeout,
  weil Durable Object erst gestartet wird; spaeter geht es. Wenn der
  RelayClient den Timeout als hartes Failure rendert, sieht der User
  ein dauerhaftes Connect-Failed obwohl ein Retry funktionieren wuerde.
- HTTPS-Cert vs. Tunnel-Hostname: Worker-Hostname stimmt nicht mit
  dem in der Settings-URL hinterlegten Server-Namen ueberein.

## Fix

Offen, abhaengig von der Diagnose. Iterativ:

1. User-Fehlermeldung aus Issue-Kommentar lesen.
2. Falls vorhanden: Network-Tab-Daten lesen; Request-URL,
   Response-Status, Request- und Response-Headers in Issue
   dokumentieren.
3. RelayClient-Logs auf neue Fehlerklassen pruefen (FIX-14-03-02 hat
   zwar Logging eingebaut, mglw. nicht alle Pfade abgedeckt).
4. Worker-Side Logs (Cloudflare Dashboard) checken, falls Request
   beim Worker ankommt, sonst auf Cloudflare-Tunnel-Routing-Ebene
   debuggen.

## Regression test

Hangt von der Root Cause ab. Mindestens: Smoke-Test gegen den
Cloudflare-Worker-MCP-Server (Connect, einen Tool-Call ausfuehren,
disconnect); plus Reproduce des Fehlerpfads sobald Root Cause
identifiziert.

## Status

See the backlog row for FIX-14-03-03 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).

## Tracking

GitHub Issue: https://github.com/pssah4/vault-operator-dev/issues/64
