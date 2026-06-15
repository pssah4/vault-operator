---
id: FEAT-26-07
title: Bedrock-kompatibler API-Gateway-Auth-Modus
epic: EPIC-26
priority: P1
date: 2026-06-15
released-on: 2026-06-15
related: EPIC-26, FIX-04-03-40
adr-refs: [ADR-134]
plan-refs: [PLAN-39]
depends-on: [FEAT-26-03]
---

# FEAT-26-07: Bedrock-kompatibler API-Gateway-Auth-Modus

## Description

Enterprise-Setups stellen den AWS-Bedrock-Runtime-ConverseStream-Endpoint nicht direkt frei, sondern reichen ihn ueber ein eigenes API-Management-Gateway durch (z.B. EnBW `gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock`). Das Gateway leitet das `/model/{model-id}/converse-stream`-Wire-Format 1:1 weiter, ersetzt aber AWS-SigV4-Signing durch einen Header-basierten Subscription-Key (typisch `Ocp-Apim-Subscription-Key`).

Der bestehende Bedrock-Provider blockiert beides:
1. Die SSRF-Allow-List `providerUrlGuard.ts` pinnt den Host auf `*.bedrock(-runtime).<region>.amazonaws.com`.
2. Die Auth-Modi `api-key` (AWS-Bearer) und `access-key` (SigV4) decken den Gateway-Header-Style nicht ab.

FEAT-26-07 ergaenzt einen dritten `awsAuthMode='gateway'`, der (a) im URL-Guard die strenge Allow-List umgeht (Standard-SSRF-Pruefung bleibt aktiv), (b) im `BedrockRuntimeClient` AWS-Signing deaktiviert und einen frei konfigurierbaren Custom-Header setzt. Das Wire-Format bleibt unveraendert -- der bestehende `ConverseStreamCommand` aus `@aws-sdk/client-bedrock-runtime` wird weiterverwendet.

Quelle: User-Request 2026-06-15 mit EnBW-Gateway-Doku (`gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock/model/{model-id}/converse-stream`, EU-Inference-Profile-IDs wie `eu.anthropic.claude-opus-4-7`).

## Benefits Hypothesis

Corporate-User koennen Vault Operator ohne Provider-Workarounds gegen ihre internen Bedrock-Gateways laufen lassen. Hypothese: Wer heute den Plugin-Bedrock-Provider waehlt und im Browser ueberprueft warum es nicht geht, wechselt ohne den Gateway-Modus auf einen Workaround (eigenes Proxy-Skript oder direkter Bedrock-Zugriff mit AWS-Keys, falls erlaubt). Mit Gateway-Modus laeuft die Konfiguration in unter 2 Minuten direkt in den Plugin-Settings.

## User Stories

- **US-07-01 (P1 Enterprise-User):** Als Enterprise-User mit firmeneigenem Bedrock-Gateway moechte ich den Gateway-Endpoint + den Subscription-Key in den Plugin-Settings eingeben, damit ich keinen lokalen Proxy oder Provider-Patch betreiben muss.
- **US-07-02 (P2 Enterprise-User):** Als Enterprise-User moechte ich den Auth-Header-Namen anpassen koennen (Default `Ocp-Apim-Subscription-Key`), damit ich auch nicht-Azure-APIM-Gateways anbinden kann ohne neuen Release.
- **US-07-03 (P2 Sebastian):** Als Power-User mit EU-Inference-Profile-IDs moechte ich Modelle wie `eu.anthropic.claude-opus-4-7` direkt eintragen koennen, damit Cross-Region-Routing zur EU funktioniert.

## Success Criteria

1. Im ModelConfigModal ist bei `provider=bedrock` ein dritter Auth-Mode `API Gateway (Bedrock-compatible)` waehlbar.
2. Bei aktivem Gateway-Mode zeigt das Modal Felder fuer Base URL, Region, Header-Name (Default `Ocp-Apim-Subscription-Key`), Subscription Key (password-input).
3. `validateProviderUrl('bedrock', url, { gatewayMode: true })` akzeptiert nicht-AWS-HTTPS-Hosts, lehnt aber Private-IPs, Metadata-Hosts und Plain-HTTP weiterhin ab.
4. Ein `BedrockProvider`-Instanz mit `awsAuthMode='gateway'` schickt ConverseStream-Requests an den konfigurierten Endpoint, mit dem konfigurierten Header, **ohne** AWS-SigV4-Signing oder AWS-Bearer-Header.
5. Live-Test mit EnBW-Gateway + `eu.anthropic.claude-haiku-4-5-20251001-v1:0` liefert eine Streaming-Antwort.
6. Bestehende Bedrock-Konfigurationen (`api-key` und `access-key`) bleiben funktional unveraendert -- keine Regression in den vorhandenen Tests.
7. Die Gateway-Auth-Credentials werden analog zu den vorhandenen AWS-Credentials per SafeStorage verschluesselt persistiert (kein Klartext in `data.json`).

## Out of Scope

- Nicht-Bedrock-Wire-Formate hinter API-Gateways (z.B. Anthropic-Messages-API hinter APIM). Dafuer eigenes Feature, falls jemals gewuenscht.
- Auto-Discovery von Modellen via Gateway. EnBW-Gateway-Spec dokumentiert keinen `/v1/models`-Endpoint -- der User pflegt die Modell-IDs manuell.
- OAuth oder mTLS am Gateway. Nur Header-basierte Subscription-Keys.

## Acceptance Test Plan

- **AT-1 (Unit, RED-first):** `providerUrlGuard.gatewayMode.test.ts` -- gatewayMode lehnt `169.254.169.254`, `http://...`, `0.0.0.0` ab; akzeptiert `https://gateway.integration-apihub.enbw-az.cloud/...`; gatewayMode=false bleibt strikt auf AWS-Hosts.
- **AT-2 (Unit, RED-first):** `bedrock.gateway.test.ts` -- `BedrockProvider` im Gateway-Mode setzt den konfigurierten Header, der finale HTTP-Request enthaelt KEINE AWS-Auth-Header (`Authorization`, `X-Amz-Date`, `X-Amz-Security-Token`).
- **AT-3 (Unit, RED-first):** `modelToLLMProvider` mappt die neuen Felder `gatewayHeaderName` und `gatewayHeaderValue` 1:1 durch.
- **AT-4 (Unit):** Bestehende `bedrock.test.ts` und `providerUrlGuard.test.ts` bleiben gruen (Regression).
- **AT-5 (Manual):** Live-Send gegen EnBW-Gateway mit `eu.anthropic.claude-haiku-4-5-20251001-v1:0` liefert sichtbaren Stream im Chat.

## Risks

- **R-1 (low):** AWS-SDK aendert Middleware-API in Minor-Versionen. Mitigation: konservative `finalizeRequest`-Middleware-Implementation, breitet Tests gegen mock-Client ab.
- **R-2 (medium):** Gateway-Mode schwaecht die strenge Bedrock-Allow-List. Mitigation: Standard-SSRF-Block (Metadata-Hosts, RFC1918, HTTP-Pflicht) bleibt aktiv, AUDIT-037-Reanalyse in der Spec dokumentiert.
- **R-3 (low):** Schluessel-Verlust bei Backup-Restore. Mitigation: Gleicher Crypto-Walker wie AUDIT-027 FIX-26-04-01 -- neue Felder ins `encryptProviderCredentialsInPlace`-Set aufnehmen.

## Dependencies

- FEAT-26-03 Provider-only Settings UI (ModelConfigModal-Erweiterung)
- ADR-134 Bedrock-Gateway-Mode (Architektur-Entscheidung)
- FIX-26-04-01 providerCredentialCrypto (Schluessel-Verschluesselung)
