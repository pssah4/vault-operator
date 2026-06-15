---
id: ADR-134
title: Bedrock-Gateway-Auth-Mode (Custom-Header statt SigV4 hinter Enterprise-APIM)
date: 2026-06-15
status: Accepted
released-on: 2026-06-15 (v2.14.5)
deciders: [Sebastian, Architekt-Agent]
asr-refs: []
feature-refs: [FEAT-26-07]
related-adrs: [ADR-122, AUDIT-037]
supersedes: null
superseded-by: null
---

# ADR-134: Bedrock-Gateway-Auth-Mode (Custom-Header statt SigV4 hinter Enterprise-APIM)

## Context

Enterprise-Kunden (konkret: EnBW) reichen die AWS-Bedrock-Runtime-API ueber ein firmeneigenes API-Management-Gateway durch. Das Gateway uebernimmt den AWS-Account-Trust und reicht das ConverseStream-Wire-Format (`/model/{model-id}/converse-stream`) unveraendert weiter, ersetzt aber AWS-SigV4-Signing durch einen Header-basierten Subscription-Key (typisch `Ocp-Apim-Subscription-Key`). Der Plugin-Bedrock-Provider akzeptiert heute zwei Auth-Modi (`api-key` = AWS-Bearer, `access-key` = SigV4) und pinnt zusaetzlich die Host-Allowlist auf `*.bedrock(-runtime).<region>.amazonaws.com` (AUDIT-037 H-2).

User-Konfiguration laeuft am Plugin damit ins Leere: weder die Allowlist noch die Auth-Modi decken einen frei waehlbaren Gateway-Host mit einem Custom-Header ab. Ohne diese Option bleibt den User-Lagern nur ein selbstgebauter Proxy-Wrapper oder ein Fork.

**Triggering ASR:** keine direkte ASR. Konkreter User-Bedarf 2026-06-15 mit dokumentiertem EnBW-Gateway (`gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock/model/{model-id}/converse-stream`, EU-Inference-Profile-IDs).

## Decision drivers

- **Wire-Format-Wiederverwendung:** Gateway reicht 1:1 Bedrock-ConverseStream durch. Der bestehende `BedrockRuntimeClient` aus `@aws-sdk/client-bedrock-runtime` kann ohne Format-Aenderung weiterverwendet werden.
- **SSRF-Defensivitaet bleibt:** AUDIT-037 darf nicht aufgeweicht werden. Im Gateway-Mode entfaellt die strenge AWS-Allowlist, aber Standard-Schutz (Metadata-Hosts, RFC1918, Plain-HTTP) bleibt erzwungen.
- **Konfigurationsflexibilitaet:** Header-Name ist nicht universell (`Ocp-Apim-Subscription-Key` ist Azure-APIM-Default, andere Gateways nutzen `api-key` oder `X-API-Key`). User muss den Namen pflegen koennen, ohne dass ein Plugin-Release noetig ist.
- **Trennschaerfe der Auth-Modi:** Bestehende `api-key` und `access-key` Setups duerfen nicht regressen. Gateway-Mode ist additiv.
- **Kompakte SDK-Customization:** AWS-SDK soll moeglichst wenig veraendert werden, damit Updates der `@aws-sdk/client-bedrock-runtime`-Major-Version nicht jedes Mal Patch-Arbeit ausloesen.

## Considered options

- **Option A (gewaehlt): `awsAuthMode='gateway'` erweitern, Custom-Header-Middleware** -- Bestehender `BedrockProvider` bekommt einen dritten Auth-Branch. SDK-Client wird mit Dummy-Credentials + `endpoint: gatewayUrl` initialisiert; eine `finalizeRequest`-Middleware tauscht den AWS-Auth-Header gegen den konfigurierten Custom-Header. URL-Guard erhaelt einen `gatewayMode`-Flag, der die strenge AWS-Allowlist ueberspringt aber alle anderen SSRF-Checks beibehaelt.
- **Option B: Neuer Provider-Type `bedrock-gateway`** -- Saubere Trennung, aber duplizierte Code-Pfade (zwei `BedrockProvider`-Klassen, zwei Settings-Sektionen, zwei UI-Bloecke). Wire-Format ist identisch, der Aufwand zahlt sich nicht aus.
- **Option C: `custom`-Provider missbrauchen** -- Wuerde OpenAI-Chat-Completions-Wire-Format senden, was am Bedrock-Converse-Endpoint scheitert. Nicht moeglich ohne komplette Wire-Format-Translation.
- **Option D: Externer Proxy** -- Verschiebt das Problem auf User. Plugin bleibt out-of-the-box unbrauchbar fuer Enterprise-Gateways.

## Decision outcome

Option A. Begruendung:

- Gateway-Wire-Format ist Bedrock-ConverseStream; der bestehende SDK-Client und alle internen Streaming-/Tool-Use-/Caching-Pfade bleiben unveraendert.
- Additive Erweiterung (kein neuer Provider-Type, kein neuer ApiHandler), damit das Settings-Schema kompatibel bleibt und keine Migration noetig wird.
- URL-Guard-Bypass ist auf den explizit gewaehlten `gatewayMode` beschraenkt; Default-Verhalten (strenge AWS-Allowlist) bleibt fuer Standard-Bedrock-Nutzer aktiv.
- AUDIT-037-Reanalyse: Im Gateway-Mode ist der Trust-Level vergleichbar mit dem `custom`-Provider (User-elected, HTTPS-pflichtig, kein Metadata-Pivot moeglich). Kredentials laufen weiter durch den `providerCredentialCrypto`-Walker (FIX-26-04-01).

## Consequences

- **Positive:** Enterprise-User koennen Vault Operator direkt gegen ihre internen Bedrock-Gateways konfigurieren. Wartung bleibt minimal, da Wire-Format unveraendert.
- **Negative:** Bedrock-Provider-Code wird um einen Branch komplexer. Ein neuer SDK-Middleware-Hook bringt eine kleine zusaetzliche Schicht, die bei AWS-SDK-Major-Bumps revalidiert werden muss.
- **Risk:** Wenn der konfigurierte Custom-Header beim Gateway-Anbieter wechselt, muss der User den Namen in den Settings nachziehen. Mitigation: Header-Name ist UI-konfigurierbar.

## Validation

- AUDIT-037-Spot-Check bei naechstem Security-Audit: pruefen dass `gatewayMode` weiterhin nur Metadata/RFC1918/HTTP blockt und nicht versehentlich die ganze Pruefung deaktiviert.
- Regression-Test: `awsAuthMode='api-key'` und `'access-key'` Pfade bleiben gruen.
- Live-Validation bei Sebastian: EnBW-Gateway + `eu.anthropic.claude-haiku-4-5-20251001-v1:0` liefert sichtbares Streaming im Chat.
