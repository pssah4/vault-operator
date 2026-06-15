---
id: PLAN-39
title: FEAT-26-07 Bedrock-Gateway-Auth-Mode Implementation
date: 2026-06-15
status: Released v2.14.5
released-on: 2026-06-15
feature-refs: [FEAT-26-07]
adr-refs: [ADR-134]
fix-refs: []
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-claude-opus-4-7
---

# PLAN-39: FEAT-26-07 Bedrock-Gateway-Auth-Mode Implementation

## Kontext (Root-Cause / Warum)

EnBW-Gateway-URL `https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock/model/{model-id}/converse-stream` ist Bedrock-Runtime-ConverseStream-Format, kommt aber von einem Azure-APIM mit Subscription-Key-Header statt AWS-SigV4. Der Plugin-Bedrock-Provider scheitert an zwei Stellen: (1) URL-Allowlist in `providerUrlGuard.ts` blockt Non-AWS-Hosts; (2) `BedrockRuntimeClient` kennt nur AWS-Bearer und SigV4.

Loesung: Additiver `awsAuthMode='gateway'`-Branch, der die Allowlist via `gatewayMode`-Flag umgeht und SDK-Auth durch eine Middleware-basierte Custom-Header-Injection ersetzt. Wire-Format bleibt unveraendert -- der bestehende `ConverseStreamCommand` ist genau das, was das Gateway erwartet.

## Aenderungen

### Task 1: providerUrlGuard `gatewayMode`-Flag (TDD-RED zuerst)

**Modify:** `src/api/providers/__tests__/providerUrlGuard.test.ts` (existiert evtl. unter anderem Namen, sonst neu)
- Neuer Test-Block `validateProviderUrl + gatewayMode`:
  - `gatewayMode: true` akzeptiert `https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock`
  - `gatewayMode: true` lehnt `http://gateway.example.com/...` ab (Plain-HTTP)
  - `gatewayMode: true` lehnt `https://169.254.169.254/...` ab (Metadata-Host)
  - `gatewayMode: true` lehnt `https://10.0.0.1/...` ab (Private-IP)
  - `gatewayMode: false` (Default) lehnt `enbw-az.cloud` weiterhin ab (Regression-Guard)

**Modify:** `src/api/providers/providerUrlGuard.ts`
- `ValidateUrlOptions` um `gatewayMode?: boolean` erweitern
- In `validateProviderUrl`: wenn `providerType === 'bedrock' && opts.gatewayMode`, ueberspringt den `PROVIDER_HOST_ALLOWLIST`-Check. Alle vorgelagerten Pruefungen (Protokoll, BLOCKED_HOSTNAMES, isLocalLike) bleiben aktiv. HTTPS bleibt Pflicht.

### Task 2: Settings-Typ-Erweiterung (TDD-RED zuerst)

**Modify:** `src/types/__tests__/settings.test.ts` (oder neu falls nicht existent)
- Neuer Test: `modelToLLMProvider` reicht `awsAuthMode='gateway'`, `gatewayHeaderName`, `gatewayHeaderValue` 1:1 durch.

**Modify:** `src/types/settings.ts`
- `CustomModel.awsAuthMode`: `'api-key' | 'access-key'` -> `'api-key' | 'access-key' | 'gateway'`
- Neue Felder `gatewayHeaderName?: string`, `gatewayHeaderValue?: string` (beide in `CustomModel`, `LLMProvider`, `ProviderConfig`)
- `modelToLLMProvider` reicht die zwei neuen Felder durch
- JSDoc-Kommentare an allen drei Stellen

**Modify:** `src/core/security/providerCredentialCrypto.ts`
- Walker erweitern: `gatewayHeaderValue` ist Credential und muss verschluesselt werden (analog `awsApiKey`, `awsSecretKey`)
- Test in `providerCredentialCrypto.test.ts`: gatewayHeaderValue wird verschluesselt + entschluesselt

### Task 3: BedrockProvider Gateway-Branch (TDD-RED zuerst)

**Modify:** `src/api/providers/__tests__/bedrock.test.ts` (oder neuer `bedrock.gateway.test.ts`)
- Neuer Test-Block `BedrockProvider gateway-mode`:
  - Initialisierung mit `awsAuthMode='gateway'`, `baseUrl='https://gateway.x.cloud/genai/cowork/bedrock'`, `awsRegion='eu-central-1'`, `gatewayHeaderName='Ocp-Apim-Subscription-Key'`, `gatewayHeaderValue='secret123'` wirft NICHT
  - Validation-Fehler bei fehlendem `gatewayHeaderValue` (analog zur api-key-Pruefung)
  - Mock-Client: nach `createMessage`-Aufruf enthaelt der finale HTTP-Request den Header `Ocp-Apim-Subscription-Key: secret123` und KEINEN `Authorization`-Header
  - URL-Guard wird mit `{ gatewayMode: true }` aufgerufen, akzeptiert den Non-AWS-Host

**Modify:** `src/api/providers/bedrock.ts`
- Im Konstruktor: Branch fuer `authMode === 'gateway'`:
  ```
  validateProviderUrl('bedrock', config.baseUrl, { gatewayMode: true })
  Region: config.awsRegion (Pflicht), KEIN region-Parsing aus URL
  Validierung: gatewayHeaderName + gatewayHeaderValue gesetzt
  clientConfig.endpoint = config.baseUrl
  clientConfig.credentials = { accessKeyId: 'gateway', secretAccessKey: 'gateway' } (Dummy, damit SDK nicht in Default-Provider-Chain laeuft)
  ```
- Nach `new BedrockRuntimeClient(clientConfig)`: Middleware via `this.client.middlewareStack.add(...)` mit `step: 'finalizeRequest', priority: 'low'`:
  - Header `authorization`/`Authorization` entfernen
  - Header `x-amz-date`/`x-amz-security-token`/`x-amz-content-sha256` entfernen
  - `request.headers[gatewayHeaderName] = gatewayHeaderValue`
- `authMode` defaultet weiter auf `'api-key'`, bestehende Pfade unveraendert

### Task 4: ModelConfigModal UI

**Modify:** `src/ui/settings/ModelConfigModal.ts` (oder wo die `awsAuthMode`-Wahl heute sitzt)
- Bedrock-Auth-Mode-Dropdown um Option `gateway` ergaenzen: Label `API Gateway (Bedrock-compatible)`
- Bei `gateway`:
  - Felder einblenden: `baseUrl` (Pflicht, https-Hint), `awsRegion` (Pflicht, Default-Vorschlag `eu-central-1`), `gatewayHeaderName` (Default `Ocp-Apim-Subscription-Key`), `gatewayHeaderValue` (password-input)
  - Felder ausblenden: `awsApiKey`, `awsAccessKey`, `awsSecretKey`, `awsSessionToken`
- Save-Validation: bei `gateway`-Mode HTTPS-baseUrl + Region + headerName + headerValue alle non-empty
- Settings-UI in Englisch (Memory-Regel `feedback_ui_language_and_naming`)

### Task 5: BACKLOG.md Eintrag

**Modify:** `_devprocess/context/BACKLOG.md`
- EPIC-26-Tabelle: neuer FEAT-26-07-Eintrag (Status: In Progress, Phase: Branch, Priority: P1)
- ADR-Tabelle: neuer ADR-134-Eintrag (Status: Accepted, Phase: Branch)
- PLAN-Tabelle: neuer PLAN-39-Eintrag (Status: In Progress, Phase: Branch)

## Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|---|---|---|
| `src/api/providers/providerUrlGuard.ts` | `gatewayMode`-Flag in ValidateUrlOptions, Bypass der AWS-Allowlist | Mittel (Security) |
| `src/api/providers/__tests__/providerUrlGuard.test.ts` | Neue Tests fuer gatewayMode | Niedrig |
| `src/types/settings.ts` | `awsAuthMode='gateway'` + 2 neue Felder in CustomModel/LLMProvider/ProviderConfig + Mapper | Niedrig (additiv) |
| `src/types/__tests__/settings.test.ts` | Test fuer Mapper-Durchreichung | Niedrig |
| `src/core/security/providerCredentialCrypto.ts` | gatewayHeaderValue zur Crypto-Walker-Liste | Niedrig |
| `src/core/security/__tests__/providerCredentialCrypto.test.ts` | Test fuer gatewayHeaderValue-Encryption | Niedrig |
| `src/api/providers/bedrock.ts` | Gateway-Auth-Branch + Middleware-Header-Injection | Mittel (SDK-Interna) |
| `src/api/providers/__tests__/bedrock.gateway.test.ts` | Neue Tests fuer Gateway-Mode | Niedrig |
| `src/ui/settings/ModelConfigModal.ts` | UI-Erweiterung | Niedrig |
| `_devprocess/context/BACKLOG.md` | 3 neue Eintraege | Niedrig |

## Nicht betroffen

- AnthropicProvider, OpenAiProvider, GitHubCopilotProvider, KiloGatewayProvider, ChatGptOAuthProvider
- ProviderConfigs-Migration (FEAT-26-04) -- neuer Mode ist additiv im selben Schema
- `awsAuthMode='api-key'` und `'access-key'` Pfade -- unveraendert
- `PROVIDER_HOST_ALLOWLIST` selbst -- nur der Bypass kommt dazu, der Default-Pfad bleibt strikt
- Wire-Format / `ConverseStreamCommand` / Streaming-Handler

## Verifikation

1. `npm run build` gruen (`tsc` + esbuild)
2. `npm test` gruen, alle neuen Tests grün, kein bestehender Test rot
3. Manueller Smoke-Test in Obsidian:
   - Neues Bedrock-Model anlegen, Mode `API Gateway` waehlen
   - Base URL: `https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock`
   - Region: `eu-central-1`
   - Header-Name: `Ocp-Apim-Subscription-Key`, Wert: User-Subscription-Key
   - Modell-ID: `eu.anthropic.claude-haiku-4-5-20251001-v1:0`
   - Kurzer Send im Chat -> Streaming-Antwort sichtbar
4. AUDIT-037-Reanalyse-Notiz in der Spec (R-2)

## TDD-Reihenfolge

1. Task 1 RED (URL-Guard-Tests schreiben) -> RED bestaetigen -> Task 1 GREEN (Guard-Impl) -> REFACTOR
2. Task 2 RED -> GREEN -> REFACTOR
3. Task 3 RED -> GREEN -> REFACTOR
4. Task 4 (UI, kein TDD-Pflicht-Pfad -- manueller Smoke-Test)
5. Task 5 (BACKLOG-Pflege, kein Test noetig)
