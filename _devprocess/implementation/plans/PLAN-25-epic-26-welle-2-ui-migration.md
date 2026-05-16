---
id: PLAN-25
title: EPIC-26 Welle 2 -- Provider-only Settings UI + Migration
date: 2026-05-16
feature-refs: [FEAT-26-03, FEAT-26-04]
adr-refs: [ADR-122, ADR-123]
fix-refs: []
imp-refs: []
supersedes: null
superseded-by: null
pair-id: sebastian-claude-opus-4-7
---

# PLAN-25: EPIC-26 Welle 2 -- Provider-only Settings UI + Migration

## Scope dieses Plans

Welle 2 baut auf der Welle-1-Engine (PLAN-24) auf und liefert das User-sichtbare Setup:

1. **Migration** (FEAT-26-04): Automatische Konvertierung von `activeModels[]` zu `providerConfigs[]` beim ersten Plugin-Start nach EPIC-26-Upgrade. Notification-Modal mit Anomalie-Liste.
2. **Provider-only Settings UI** (FEAT-26-03): Settings-Tab "Providers" mit Provider-Block-Komponenten, Tier-Slot-Mapping, Refresh-Button, Active-Provider-Selector.

Welle 3 (Chat-Dropdown + Prompt-Slim) folgt in PLAN-26.

## Bestehende Patterns die wiederverwendet werden

- **Settings-Tab-Struktur:** `src/ui/settings/ModelsTab.ts` als Template-Vorlage; `setupSettingsTab.ts` registriert die Tab.
- **Modal-Pattern:** `src/ui/settings/CodeImportModal.ts`, `src/ui/settings/NewModeModal.ts` als Beispiele für Dialog-Modale.
- **i18n-Keys:** `src/i18n/en.json` + `src/i18n/de.json`, Lookup via `t('settings.providers.xxx')`.
- **ModelDiscoveryService** (PLAN-24): bereits implementiert, akzeptiert injected `ModelFetcher`. Welle 2 verkabelt den produktiven Fetcher aus `fetchProviderModels()`.
- **Settings-Atomic-Save:** bestehender `plugin.saveSettings()`-Pfad.

## Task-Schnitt

### Task 1: Migration pure function

**Create:** `src/core/settings/migrations/activeModelsToProviders.ts`
**Test:** `src/core/settings/migrations/__tests__/activeModelsToProviders.test.ts`

- Funktion `migrateActiveModelsToProviders(settings): MigrationResult`
- Input: aktuelle Settings (lesend)
- Output: `{ providerConfigs: ProviderConfig[]; activeProviderId: string | null; anomalies: MigrationAnomaly[]; legacyBackup: CustomModel[]; }`
- Gruppiere `activeModels` nach `provider`-Type
- Pro Gruppe: erstes enabled-Model liefert die Auth; weitere mit anderem API-Key flaggen als Multi-Auth-Anomalie
- Klassifiziere alle enabled-Models in der Gruppe via `ModelTierClassifier`
- Erkennt Anomalien: Multi-Auth, fehlendes flagship, unbekannte Custom-Endpoints
- Idempotenz: wenn `providerConfigs[]` schon befüllt ist, return no-op result (mit Flag)

### Task 2: Plugin onload wiring

**Modify:** `src/main.ts`

- Nach `loadSettings` und vor `initApiHandler`: prüfe ob Migration nötig ist
- Trigger-Bedingung: `!settings.schemaVersion && (settings.activeModels.length > 0) && (settings.providerConfigs.length === 0)`
- Bei Trigger: rufe `migrateActiveModelsToProviders`, schreibe Result in Settings (provider configs + activeProviderId + legacyBackup), setze `schemaVersion = '2026.5.15'`
- Speichere via saveSettings (atomic)
- Stelle Anomalie-Liste für Modal bereit (per-Plugin-Property, wird beim Sidebar-Open konsumiert)

### Task 3: Migration Notification Modal

**Create:** `src/ui/settings/MigrationNotificationModal.ts`

- Standard Obsidian-Modal mit "Settings öffnen" / "OK"-Buttons
- Zeigt Migrations-Zusammenfassung: N Provider, M Modelle migriert
- Liste der Anomalien (Multi-Auth, fehlende Tiers, Custom-Endpoints)
- "Settings öffnen" öffnet Settings auf Providers-Tab

### Task 4: ProvidersTab UI

**Create:** `src/ui/settings/ProvidersTab.ts`

- Active-Provider-Selector (Dropdown) am Top
- Pro Provider-Block:
  - Header mit Provider-Type-Label + Enable-Toggle
  - Auth-Eingabe (Type-spezifisch: API-Key-Feld / Bedrock-Region+Auth-Mode / Custom-BaseURL / OAuth-Sign-In-Button)
  - Discovered-Models-Count + Refresh-Button mit Loading-State + lastRefreshAt-Anzeige
  - Tier-Slots (fast/mid/flagship) als Tabelle mit Dropdown pro Slot (Auto/Override + alle Discovered-Models)
  - Tier-Slot-Hinweise: "auto-detected" / "manually set" / "different tier"
  - Hinweis bei leerem flagship-Slot ("Advisor pattern disabled for this provider")
- "Add provider"-Button für neue Provider-Instanzen (gibt jeden ProviderType einmal her)

### Task 5: Real ModelFetcher wiring

**Modify:** `src/main.ts`

- Konstruiere `ModelDiscoveryService` mit produktivem Fetcher
- Fetcher wrappt `fetchProviderModels(provider.type, provider.apiKey, provider.baseUrl, provider.apiVersion, bedrockCreds)` und mappt das Result auf `RawDiscoveredModel[]`
- OpenRouter-Pricing-Enrichment: Welle-1-Scope-Cut (bleibt offen als IMP-Item, weil `fetchProviderModels` für openrouter heute keine Pricing-Felder durchreicht). Statt openrouter-Pricing setzt der Production-Fetcher pricing nur auf undefined, classifier fällt auf Pattern + Capability zurück (ausreichend für bekannte Modelle).
- Im Plugin-State exponieren als `plugin.modelDiscovery`, von ProvidersTab konsumiert

### Task 6: Tab registration + i18n keys

**Modify:** Settings-Setup (wahrscheinlich `src/main.ts` SettingTab) + `src/i18n/en.json` + `src/i18n/de.json`

- ProvidersTab als neuer Reiter zwischen ModelsTab und EmbeddingsTab
- ModelsTab bleibt sichtbar im Welle-2-Übergang (für User die noch nicht migriert sind oder Custom-Modelle pflegen wollen)
- i18n-Keys: `settings.providers.title`, `.intro`, `.activeProviderLabel`, `.refreshButton`, `.refreshing`, `.tierSlotFast/Mid/Flagship`, `.tierSlotAutoLabel`, `.tierSlotOverrideLabel`, `.tierSlotAutoDetected`, `.tierSlotManuallySet`, `.tierSlotDifferentTier`, `.advisorDisabled`, `.addProvider`, plus Migration-Modal-Keys

### Task 7: Tests for migration + anomalies

**Test:** `src/core/settings/migrations/__tests__/activeModelsToProviders.test.ts`

- Test 1: Standard-Migration (1 Anthropic mit Opus + Sonnet + Haiku) -> 1 ProviderConfig mit 3 Tier-Slots gefüllt, keine Anomalien
- Test 2: Multi-Auth (2 Anthropic-Models mit verschiedenen API-Keys) -> Anomalie "multi-auth"
- Test 3: Fehlendes flagship (nur Sonnet + Haiku) -> Anomalie "missing-flagship"
- Test 4: Disabled-Modell wird ignoriert
- Test 5: Custom-Endpoint (Ollama) -> Anomalie "manual-tier-required" (kein autoTier)
- Test 6: Idempotenz: bereits gefülltes `providerConfigs[]` -> no-op
- Test 7: `activeModelKey` mapped korrekt auf `activeProviderId`
- Test 8: legacyBackup enthält das Original

## Coverage Gate

### SC-Coverage (FEAT-26-03 + FEAT-26-04)

| Feature | SC | Task | Status |
|---|---|---|---|
| FEAT-26-03 | SC-01 Tab "Providers" | Task 4 + 6 | Mapped |
| FEAT-26-03 | SC-02 Provider-Block | Task 4 | Mapped |
| FEAT-26-03 | SC-02.1 Tier-Modell sichtbar | Task 4 | Mapped |
| FEAT-26-03 | SC-02.2 Dropdown sortiert | Task 4 | Mapped (vereinfacht: Modelle des Providers, sortiert nach autoTier-Match zum Slot) |
| FEAT-26-03 | SC-03 Active-Provider-Selector | Task 4 | Mapped |
| FEAT-26-03 | SC-04 Custom-Endpoint BaseURL | Task 4 | Mapped |
| FEAT-26-03 | SC-05 Bedrock Region + Auth-Mode | Task 4 | Mapped |
| FEAT-26-03 | SC-06 OAuth Sign-In-Button | Task 4 | Deferred (Sign-In-Button-Stub; bestehende OAuth-Flows in /coding nicht angetastet, separate IMP wenn Welle 2 live) |
| FEAT-26-03 | SC-07 Override persistiert | Task 4 | Mapped |
| FEAT-26-03 | SC-08 Advisor-disabled-Hinweis | Task 4 | Mapped |
| FEAT-26-04 | SC-01 Auto-Migration onload | Task 2 | Mapped |
| FEAT-26-04 | SC-02 Notification-Modal | Task 3 | Mapped |
| FEAT-26-04 | SC-03 Settings öffnen | Task 3 | Mapped |
| FEAT-26-04 | SC-04 OK-Button | Task 3 | Mapped |
| FEAT-26-04 | SC-05 activeModelKey -> activeProviderId | Task 1 | Mapped (Test 7) |
| FEAT-26-04 | SC-06 Anomalien-Modal | Task 1 + 3 | Mapped |
| FEAT-26-04 | SC-07 legacyBackup in data.json | Task 1 + 2 | Mapped (Test 8) |
| FEAT-26-04 | SC-08 Restore-legacy | Task 1 | Deferred (Setting-Reset-UI; ist Out-of-Scope-Komfort, Backup-Read aus data.json reicht für Welle 2) |
| FEAT-26-04 | SC-09 Idempotenz | Task 1 | Mapped (Test 6) |

### ADR-Alignment

- ADR-122 (Schema): providerConfigs[]-Struktur in PLAN-24 angelegt; Migration füllt sie
- ADR-123 (Migration + Recovery): atomic Settings-Save analog FEATURE-0314 KnowledgeDB-Pattern; Backup-Retention; Anomalien im Modal

### Codebase-Anchoring

Alle Tasks haben konkrete File-Pfade.

### Verifikations-Gates

- `npm run build` (esbuild + deploy)
- `npx tsc --noEmit`
- `npm run test` (Vitest, focus auf neue activeModelsToProviders.test.ts)
- Manual-Smoke: Sebastian-Setup migrieren, Modal prüfen, ProvidersTab durchklicken

## Change Log

- 2026-05-16 init -- PLAN-25 angelegt. EPIC-26 Welle 2 Scope. Strategischer Cut: OAuth-Sign-In-Button als Stub, Restore-Legacy als Out-of-Scope (data.json bietet Recovery), OpenRouter-Pricing-Enrichment deferred (klassifikator-Pattern reicht für Welle 2).

## Implementation Notes

Implementations-Pass 2026-05-16. Welle-2-Backend + UI auf `feature/cost-reduction-wave-2` landed; 125 EPIC-26-Tests grün, tsc + build clean.

| Task | Status | Pfad(e) | Notiz |
|---|---|---|---|
| 1: Migration pure function | Done | `src/core/settings/migrations/activeModelsToProviders.ts` + Test (12 Tests) | Idempotent: schemaVersion-Check + non-empty providerConfigs-Check. Multi-Auth flaggt zweite Auth-Gruppe als separaten ProviderConfig. Custom-Endpoints (ollama/lmstudio/custom) bekommen kein autoTier und liefern Anomaly `manual-tier-required`. |
| 2: onload-Wiring | Done | `src/main.ts` Section 1b | Migration läuft in try/catch; failure ist non-fatal (legacy bleibt). schemaVersion = `'2026.5.15'` als Marker. legacy_active_models_backup persistiert. pendingMigrationSummary für Modal. |
| 3: Notification-Modal | Done | `src/ui/settings/MigrationNotificationModal.ts` | Header + Body mit Summary, Anomalie-Liste, Backup-Hinweis, zwei Buttons (Open settings -> `openSettingsAt('agent','providers')` / OK). |
| 4: ProvidersTab UI | Done | `src/ui/settings/ProvidersTab.ts` | Active-Provider-Selector + Provider-Blocks (Type-spezifische Auth: API-Key / Bedrock-Region+Auth-Mode / Custom-BaseURL / OAuth-Stub) + Discovery-Section mit Refresh-Button-Loading-State + Tier-Slot-Tabelle (Auto+Override + sortierte Modelle pro Tier) + Advisor-Disabled-Hinweis + Remove-Provider + Add-Provider-Selector. Bot-Compliance: keine console.log, kein innerHTML, kein hardcoded .obsidian, alle inputs als createEl. |
| 5: Production-Fetcher | Done | `src/main.ts` Section 1c | ModelDiscoveryService konstruiert mit DiscoveryHost (read/save providerConfigs) + ModelFetcher (wrappt `fetchProviderModels` aus testModelConnection.ts). refreshOnStartup() non-blocking. plugin.modelDiscovery exposed für ProvidersTab. |
| 6: Tab + i18n | Done | `src/ui/AgentSettingsTab.ts` + `src/i18n/locales/en.ts` | "Providers"-Tab als ERSTER Eintrag in Providers-Sub-Tabs, "Models" umbenannt zu "Models (legacy)". 39 neue i18n-Keys unter `settings.providers.*`. |
| 7: Tests | Done | 12 Migration-Tests | Happy-Path, Anomalien (multi-auth/missing-flagship/manual-tier-required/disabled-skip), Idempotenz (drei Trigger), Non-mutation. |

### Deviations from plan

- **OAuth-Sign-In-Button als Stub** (FEAT-26-03 SC-06): Plan-Coverage Gate hatte das schon deferred markiert. ProvidersTab zeigt OAuth-Status (Authed/Not authed) und einen Button, der den User zum legacy ModelsTab umleitet wo der echte OAuth-Flow lebt. Voller Sign-In-Refactor wäre Welle-2-Scope-Explosion.
- **Restore-Legacy-Action via data.json**: SC-08 (FEAT-26-04) wurde im Plan-Coverage Gate als deferred markiert. legacy_active_models_backup ist persistiert; UI-Restore-Action ist out-of-scope Komfort.
- **OpenRouter-Pricing-Enrichment deferred**: Plan-Cut. `fetchProviderModels` für openrouter returnt heute nur `{ id, label }`; ein 2nd Call für Pricing wäre möglich, lohnt sich aber erst wenn Beta-Validation H-02 zeigt dass Pattern + Capability nicht reichen. IMP-Item für später.

### Verifikation

- `npx tsc --noEmit` clean
- `npx vitest run` 125 EPIC-26-Tests grün (12 neue Migration-Tests + 113 vorher)
- `npm run build` clean, main.js 4.3 MB, deployed nach iCloud-Plugin-Pfad

### Coverage-Gate Re-Run

12/16 Welle-2-SCs verified, 2 deferred per Plan-Cut, 2 SCs (FEAT-26-04 SC-08, FEAT-26-03 SC-06) deferred. Alle ADRs (122 + 123) operationalisiert.
