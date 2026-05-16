---
ba: BA-27
epic: EPIC-26
arch-completed: 2026-05-15
related-epics: [EPIC-24, EPIC-26]
adr-count: 5 (ADR-120, ADR-121, ADR-122, ADR-123 plus ADR-115 Amendment 2026-05-15)
plan-count: 0 (PLAN-Items folgen im /coding-Pivot)
---

# plan-context EPIC-26: Advisor-Pattern + Provider-only Setup + Auto-Discovery

## Tech-Stack (Stand 2026-05-15)

Existing Stack bleibt unverändert, EPIC-26 fügt keine externen Dependencies hinzu.

- **Sprache:** TypeScript strict
- **Plugin-Framework:** Obsidian Plugin API
- **Build:** esbuild plus Deploy-Plugin
- **AI APIs:** Anthropic SDK, OpenAI SDK, Google Gemini, OpenRouter, GitHub Copilot (OAuth), ChatGPT-OAuth, AWS Bedrock SDK (api-key oder SigV4), Ollama, LM Studio, Azure OpenAI, Custom-OpenAI-kompatibel
- **Discovery-Quelle:** existierendes `fetchProviderModels()` in `src/ui/settings/testModelConnection.ts` (wird gewrappt durch neuen `ModelDiscoveryService`)
- **Modell-Metadata:** existierende `ModelInfo` und `normalizeModelId()` aus `src/types/model-registry.ts`
- **Pricing:** existierende `ModelPricing.ts`-Tabelle bleibt statisch (manuelle Pflege bei Drift), OpenRouter-Pricing wird zusätzlich live aus der API gelesen für Tier-Klassifikation
- **Cost-Computation:** existierende `computeCost()` in `ModelPricing.ts`, erweitert um `mode`-Field im Cost-Log
- **Subagent-Mechanik:** existierende `AgentTask.spawnSubtask()` und Profile-Registry aus FEAT-24-04 (research-Profile als Vorbild)
- **Settings-Persistence:** Obsidian's loadData/saveData, atomic write nach KnowledgeDB-Pattern (FEATURE-0314)
- **OAuth-Services:** bestehende `GitHubCopilotAuthService` und `ChatGPTOAuthService` bleiben unverändert

Keine neuen externen Dependencies. Kein Sprach-Wechsel. Kein Framework-Wechsel.

## Architektur-Stil und Quality-Goals

**Stil:** Bestehende Plugin-Architektur mit Service-Layer-Pattern. EPIC-26 fügt zwei neue Service-Klassen (`ModelTierClassifier`, `ModelDiscoveryService`) und ein neues Settings-Schema-Konzept (Provider-zentriert mit Tier-Mapping). Adapter-Pattern aus ADR-11 bleibt unverändert. ReAct-Loop-Kern bleibt unverändert.

**Quality-Goals (BA-27 NFR-Prio):**

1. Zuverlässigkeit (Migration darf User-Setup nicht zerstören)
2. Kostentransparenz (Sidebar-Cost-Anzeige akkurat über Modellwechsel und Eskalation)
3. Performance (Discovery beim Cold-Start blockiert UI nicht)
4. Wartbarkeit (Klassifikator-Pattern zentral, leicht erweiterbar)
5. Sichtbarkeit (User sieht jederzeit auf welchem Tier er gerade läuft)

## ADR-Summary-Tabelle

| ADR | Title | Status | Verbindet Feature |
|-----|-------|--------|-------------------|
| ADR-120 | Advisor-Pattern als Loop-Default statt Multi-Tier-Routing | Proposed | FEAT-26-01 |
| ADR-121 | Tier-Klassifikator-Strategie (Pattern + Capability + OpenRouter-Pricing) | Proposed | FEAT-26-02 |
| ADR-122 | Provider-only Settings-Schema | Proposed | FEAT-26-03, FEAT-26-04 |
| ADR-123 | Settings-Schema-Migration und Recovery-Pfad | Proposed | FEAT-26-04 |
| ADR-115 | Helper-Modell-Routing -- Amendment 2026-05-15 (Hauptloop-Default-Tier, Tier-Semantik, Subtask-Tier-Inheritance) | Accepted with Amendment | FEAT-24-07, FEAT-26-01 |

## Data Model (Core Entities)

### ProviderConfig (neu, Top-Level-Setting)

```typescript
interface ProviderConfig {
    id: string;                              // eindeutig, z.B. 'anthropic-default' oder generierter Slug
    type: ProviderType;                      // 'anthropic' | 'openai' | 'bedrock' | 'openrouter' | 'github-copilot' | 'chatgpt-oauth' | 'azure' | 'ollama' | 'lmstudio' | 'custom'
    enabled: boolean;
    // Auth-Felder (provider-spezifisch, optionale Felder ja nach Type)
    apiKey?: string;
    baseUrl?: string;
    apiVersion?: string;                     // Azure
    awsRegion?: string;                      // Bedrock
    awsAuthMode?: 'api-key' | 'access-key';  // Bedrock
    awsApiKey?: string;                      // Bedrock api-key mode
    awsAccessKey?: string;                   // Bedrock access-key mode
    awsSecretKey?: string;                   // Bedrock access-key mode
    awsSessionToken?: string;                // Bedrock SSO
    // Discovery-Daten
    discoveredModels: DiscoveredModel[];     // vom Discovery-Service gepflegt
    lastRefreshAt: number;                   // Unix-Timestamp fuer 24h-Cache
    // Tier-Mapping
    tierMapping: { fast?: string; mid?: string; flagship?: string };       // auto-detected Modell-IDs
    tierOverrides: { fast?: string; mid?: string; flagship?: string };     // User-manuelle Wahl, gewinnt
}

interface DiscoveredModel {
    id: string;                              // Modell-ID vom Provider
    displayName?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
    pricingPromptUsd?: number;               // pro Million Tokens, nur OpenRouter
    pricingCompletionUsd?: number;
    autoTier?: 'fast' | 'mid' | 'flagship';  // Klassifikations-Ergebnis
    autoTierSource?: 'pattern' | 'capability' | 'pricing';  // wie klassifiziert
}
```

### Settings-Top-Level Ergänzungen

```typescript
interface ObsidianAgentSettings {
    // ... existing fields ...
    providers: ProviderConfig[];                                  // NEU
    activeProviderId: string | null;                              // NEU
    schemaVersion?: string;                                       // NEU, z.B. '2026.5.15'
    legacy_active_models_backup?: {                               // NEU, fuer Recovery
        models: CustomModel[];
        migratedAt: number;
        originalCount: number;
    };
    activeModels: CustomModel[];                                  // BLEIBT (Read-Only ab Migration, Pflege durch Backup)
    activeModelKey: string;                                       // BLEIBT (Backwards-Kompat)
    helperModelKey: string;                                       // BLEIBT (gewinnt ueber Tier-Mapping wenn gesetzt)
    memoryModelKey: string;                                       // BLEIBT unveraendert (EPIC-26 Out-of-Scope)
    titlingModelKey: string;                                      // BLEIBT unveraendert (EPIC-26 Out-of-Scope)
    autoTaskRouter: { enabled: boolean };                         // BLEIBT (TaskRouter v2.10 bleibt aktiv fuer simple-Tasks)
    defaultMainModelTier?: 'fast' | 'mid' | 'flagship';            // NEU, Default 'mid' nach Migration. Rollback-Schalter fuer H-01.
}
```

### Subagent-Profile-Erweiterung

```typescript
// In src/core/agent/subagent-profiles.ts
const ADVISOR_PROFILE: SubagentProfile = {
    name: 'advisor',
    roleDefinition: "...",
    allowedTools: ['read_file', 'read_document', 'search_files', 'web_fetch', 'web_search'],
    maxOutputTokens: 3000,  // hart
    tierOverride: 'flagship'
};

// Bestehendes research-Profile wird um tierOverride: 'fast' ergaenzt
```

## External Integrations

EPIC-26 hat keine neuen externen Integrationen, sondern erweitert bestehende:

- **Provider /v1/models Endpoints:** Anthropic, OpenAI, OpenRouter, Azure, Bedrock, Copilot, ChatGPT-OAuth, Ollama, LMStudio. Discovery-Calls über bestehendes `fetchProviderModels()` mit 24h-Cache-Layer.
- **OpenRouter-Pricing:** zusätzlicher Lookup auf `pricing.prompt` und `pricing.completion` in der API-Antwort. Optional, fällt bei Fehlen auf Pattern-Match zurück.
- **OAuth-Flows:** unverändert über `GitHubCopilotAuthService.signIn()` und (falls vorhanden) `ChatGPTOAuthService.signIn()`. Settings-UI ruft nur die Service-Methoden.

## Performance und Security

### Performance-Targets

- **Discovery-Call:** Timeout 10s pro Provider, parallel über alle aktiven Provider beim Auto-Refresh
- **Cache-TTL:** 24h pro Provider, manueller Refresh-Button erzwingt sofortigen Call
- **Klassifikations-Latenz:** <50ms pro Modell-Liste (pure Function, Pattern-Match + optional Pricing-Lookup)
- **Per-Turn-API-Handler-Resolution:** <50ms beim Send-Click (kein synchroner Provider-API-Call)
- **Eskalations-Call:** asynchron als Subtask, Hauptloop wartet auf Tool-Result. 3000-Token-Cap erzwungen provider-seitig.
- **Cache-Hit-Rate:** >= 95 % für stabilen Prefix bei wiederkehrenden Session-Patterns (Cache-Strategie aus ADR-62 bleibt aktiv, konditionale Sections aus FEAT-26-06 nach CACHE_BREAKPOINT_MARKER)
- **Migration-Dauer:** asynchron, blockiert Plugin-Init nicht. Bei sehr grossen `activeModels[]`-Listen läuft sie als Background-Job.

### Security-Anforderungen

- **OAuth-Token-Migration:** kein Re-Auth erforderlich. Auth-Services bleiben Single Source of Truth für Tokens.
- **Bedrock-Credentials:** SigV4 und api-key bleiben unverändert in den Settings, werden 1:1 ins neue Schema migriert.
- **Backup-Daten:** `legacy_active_models_backup` enthält die alte `activeModels[]`-Liste mit allen Auth-Daten in Klartext. Bleibt im Settings-File auf Disk. Cleanup-Banner nach 30 Tagen, Hard-Cleanup nach 90 Tagen.
- **Tool-Schema-Validation:** `consult_flagship` enforced harte Längen-Limits provider-seitig (JSON-Schema). Verhindert, dass der Agent das Pflicht-Schema umgeht.
- **Atomic Settings-Save:** Migration und Tier-Override nutzen atomic-write-Pattern (temp-file + atomic-rename), analog `KnowledgeDB`-Pattern aus FEATURE-0314. Schützt vor inkonsistentem State bei Plugin-Crash.

### Cost-Awareness

- **Per-Task-Counter:** max 3 Advisor-Calls. Nach Erreichen Tool-Result-Meldung "advisor budget exhausted".
- **Cost-Log-Erweiterung:** zusätzliches `mode`-Field markiert `auto`, `override(<id>)`, `advisor(<flagship-id>)`. Sidebar-Footer zeigt Mode beim Hover.
- **System-Prompt-Größe:** Welle 6 (FEAT-26-06) kürzt für Auto-Modus mindestens 30 %, hilft beim Cache-Write-Cost bei Cold-Sessions.

## Bekannte Risiken (an /coding)

- **R-1 (BA-27):** Sonnet liefert bei Strategie-Chats spürbar schlechtere Qualität als Opus. Validation in Beta-Phase, Rollback via `defaultMainModelTier`-Flip möglich.
- **R-2:** Tier-Klassifikator klassifiziert ein neues Modell falsch (z.B. Opus 4.7 als mid). Mitigation: User-Override pro Slot, Outlier-Log.
- **R-3:** Migration zerstört bestehendes User-Setup. Mitigation: Backup-Pfad, Recovery-Action, atomic Settings-Save. **Test gegen Sebastians eigenes Multi-Provider-Setup ist Voraussetzung für Release.**
- **R-4:** consult_flagship wird zu oft oder zu selten gerufen. Mitigation: Per-Task-Limit, Telemetrie, Prompt-Reminder-Tuning nach Beta-Feedback.
- **R-7:** User mit Subscription-Provider versteht das Tier-Mapping nicht. Mitigation: UI-Hinweise im Provider-Block, klare Cost-Anzeige.
- **R-8:** OAuth-Flow bricht beim UI-Refactor. Mitigation: Auth-Services bleiben unangetastet, nur UI-Layer wird ausgetauscht.

## Open Items für /coding (deferred decisions)

Diese acht Punkte stehen bewusst offen und werden im /coding-Pivot durch Codebase-Recon entschieden:

1. **Subtask-Tier-Inheritance Edge Cases:** Recursive-Subtask (Subtask spawnt Subtask), Profile-Conflict (research im advisor-Pfad). Lösung: Klare Resolution-Reihenfolge in `subagent-profiles.ts`.
2. **`helperModelKey`-Resolution-Reihenfolge:** Settings-Accessor erweitern, sodass explizite `helperModelKey` über fast-Tier-Mapping gewinnt. Backwards-Kompat-Test gegen FEAT-24-07-Tests.
3. **OAuth-Provider-Listing-Schema:** Copilot und ChatGPT haben provider-spezifische Modell-Listen-Endpoints mit unterschiedlichen Response-Strukturen. Klassifikator braucht Per-Provider-Adapter im Discovery-Pfad.
4. **Bedrock Cross-Region-Profile:** `eu.anthropic.claude-opus-4-6-v1` muss vor Pattern-Match normalisiert werden (existierende `normalizeModelId()` nutzen).
5. **Refresh-Trigger über Manual hinaus:** Auto-Refresh bei Settings-Open oder bei stale-Cache beim Send. Bewertung im Coding-Pivot ob Latenz vertretbar.
6. **Notification-Modal-Detail-Inhalt:** Welche Felder zeigt das Migration-Modal genau (Provider-Liste, Tier-Vorschläge, Anomalien-Liste mit Aktions-Empfehlungen). UI-Komponente sollte sich an bestehende Modal-Patterns halten.
7. **Cost-Log-Schema-Erweiterung:** `mode`-Field in `TaskTelemetry.ts` ohne Provider-Adapter-Bruch einbauen. Pro-Provider-Cost-Adapter müssen das neue Feld respektieren.
8. **Embedding-Modell-Pfad-Konflikt-Freiheit:** EPIC-26 betrifft Chat-Modelle. `fetchEmbeddingModels()` und Embedding-Settings bleiben im bisherigen Pfad. Architect bestätigt: kein Konflikt.

## Wayfinder (ARCHITECTURE.map)

Neue Wayfinder-Einträge:

```
modell-routing | src/core/routing/ | ADR-120, ADR-121 | Pattern-Tabelle in ModelTierClassifier erweitern, neue Provider-Adapter in fetchProviderModels
provider-config | src/types/settings.ts (Interface ProviderConfig) | ADR-122 | Provider-Type hinzufuegen, Auth-Feld ergaenzen
settings-migration | src/core/settings/migrations/ | ADR-123 | Migrations-Step fuer neue Schema-Version hinzufuegen
advisor-tool | src/core/tools/agent/ConsultFlagshipTool.ts | ADR-120 | Pflicht-Schema-Felder anpassen
```

## Consistency-Check

plan-context-epic26.md ist konsistent mit:

- ADR-120 (Advisor-Pattern, Per-Task-Limit 3, 3000-Token-Budget, Pflicht-Schema)
- ADR-121 (Tier-Klassifikator Pattern-First mit Capability-Fallback und OpenRouter-Pricing)
- ADR-122 (Settings-Schema mit `providers[]`, `tierMapping`, `tierOverrides`, `schemaVersion`)
- ADR-123 (Auto-Migration mit Notification-Modal und 30-Tage-Backup)
- ADR-115 Amendment (Hauptloop-Default-Tier, fast-Tier-Alias für `helperModelKey`)
- BA-27 (alle 6 Critical Hypotheses, 6 KPIs, 8 Risks)
- FEAT-26-01..06 (Success Criteria, NFRs, ASRs, Definition of Done)

## Quellen

- BA-27 (`_devprocess/analysis/BA-27-advisor-pattern-provider-setup.md`)
- ADR-120, ADR-121, ADR-122, ADR-123 (in diesem Architecture-Pass erstellt)
- ADR-115 (mit Amendment 2026-05-15)
- Architect-Handoff `_devprocess/requirements/handoff/architect-handoff-epic26.md` (8 Open Questions, alle in diesem plan-context adressiert)
