# Project Metrics (Memory v2 + UCM)

> Append-additive Signal-Layer fuer V-Model-Workflow.
> Schreibende Skills: /coding, /business-analysis, /dia-guide, /architecture, /testing.

## Drift count (plan-context.md vs. real code)

| Date | ADRs reviewed | arc42 sections | plan-context items | Drift flagged | Drift resolved | Open | Reviewer |
|------|---------------|----------------|---------------------|---------------|----------------|------|----------|
| 2026-04-26 | 12 (ADR-76 bis 087) | 1 (Section 5.9.1) | 12 | 4 | 4 | 0 | /coding Phase 2 |
| 2026-05-12 | 4 (ADR-12, ADR-62, ADR-63, ADR-111 inkl. Amendments) | 0 | 8 (FEAT-24-01/02/03, FIX-24-01-01/03-01/03-02, IMP-24-05-01, IMP-18-01-02) | 1 (ADR-62-Amendment-Impl-Note nennt die `── CACHE BREAKPOINT ──`-Kommentarzeile als Split-Anker, aber dieser Kommentar steht nicht im gerenderten System-Prompt-String -> Split braucht einen echten Sentinel) | 1 (in PLAN-18 Task 4 aufgeloest: exportierte `CACHE_BREAKPOINT_MARKER`-Konstante zwischen Section 8 und 9 emittieren, Provider splittet daran und strippt sie) | 0 | /coding Phase 2 (EPIC-24 Welle 1) |
| 2026-05-16 | 3 (ADR-120, ADR-121, ADR-115-Amendment) | 0 | 1 (plan-context-epic26.md) | 1 (Plan-Text spricht von Top-Level-Feld `providers: ProviderConfig[]`; Legacy `providers: Record<string, LLMProvider>` belegt den Key) | 1 (F-4: neues Feld in PLAN-24 + ADR-Implementation-Notes auf `providerConfigs[]` umbenannt; Legacy bleibt unangetastet -- keine silent Schema-Migration nötig) | 0 | /coding Phase 2 (EPIC-26 Welle 1) |
| 2026-05-20 | 7 (ADR-119, ADR-124 bis ADR-129) | 0 | 1 (plan-context-epic29.md) | 2 (ADR-119 nahm drei Drift-Pfade auf einen kanonischen Pfad an, Realitaet ist Legacy + Daten-Folder + Asset-Cache funktional getrennt; FEAT-29-01 SC waren auf "kanonischer Pfad" ohne Sub-Folder formuliert) | 2 (ADR-119 amendiert mit Variante B + Cleanup; FEAT-29-01 SC-02 amendiert auf data/ und cache/ Sub-Folder; plan-context Welle-1-Komponentenskizze aktualisiert; SC-06 fuer Legacy-Cleanup hinzugefuegt) | 0 | /coding Phase 2 (EPIC-29 Welle 1, FEAT-29-01) |
| 2026-05-20 | 1 (ADR-119 dritte Iteration) | 0 | 1 (plan-context-epic29.md) | 4 (vault-parent obsilo-shared enthielt unerkannte 45 MB Cross-Vault-Shared-Daten inkl 252 history-Eintraege; skills-Drift zwischen vault-local und vault-parent; chatHistoryFolder als redundantes Sub-System erkannt; Episodes-vs-Workflows-Konzept-Ueberlappung) | 4 (ADR-119 dritte Iteration auf Option 1 alles vault-local; FEAT-29-01 SC erweitert um SC-06/07/08 fuer Drift-Resolve, chatHistoryFolder-Removal, Reset-Buttons; FEAT-29-12 Backup-Export-Tool als neues Feature angelegt; EPIC-30 Scope erweitert um FEAT-30-06 Episodes-Recipes-Konsolidierung; PLAN-27 Tasks 9/10/11 ergaenzt) | 0 | /coding Phase 2c (EPIC-29 Welle 1, dritte Iteration nach User-Diskussion Storage-Topologie) |
| 2026-06-19 | 5 (ADR-135 neu, ADR-95 ADR-104 ADR-105 ADR-106 amendiert 2026-06-19) | 2 (Section 9 ADR-Tabelle, Section 10 Qualitaetsszenarien) | 1 (plan-context-imp-20-06-01.md) | 3 (plan-context fuehrt einen `WebSearchService` (FEAT-04-02) als zentralen Layer auf, im Code existiert stattdessen ein `WebSearchTool` mit private `searchBrave`/`searchTavily` Methoden; plan-context impliziert Provider-Fallback Tavily-dann-Brave, das Settings-Schema kennt aber nur eine Provider-Wahl auf einmal; ADR-95-Amendment beschreibt WriterLock-Pattern als ADR-95-eigen, in Wahrheit kommt das WriterLock aus ADR-79 und ADR-95 baut die Conflict-Detection darueber) | 3 (plan-context auf `WebSearchTool` plus neuer `FreshnessWebSearch`-Helper umgestellt; Provider-Sektion auf User-Konfig statt Fallback praezisiert; ADR-104-Amendment redeclariert Provider-Quelle als bestehendes `WebSearchTool`; ADR-95-Amendment trennt WriterLock (ADR-79) von Conflict-Detection (ADR-95)) | 0 | /coding Phase 2c (IMP-20-06-01 Welle 0) |
| 2026-06-22 | 7 (ADR-138 bis ADR-144 alle neu, EPIC-33) | 1 (arc42 Section 5.10 Inline-Editor-AI-Layer) | 1 (plan-context-epic-33.md) | 2 (ADR-141 nimmt einheitliches SkillManifest-Interface an, src/core/skills/types.ts hat mehrere Skill-Typen statt einem Manifest; ADR-144 sagt "OperationLogger-Schema mit event_type-Enum erweitern", Realitaet ist LogEntry-Interface mit JSONL-Storage und kein event_type) | 2 (PLAN-42 Section 12 dokumentiert beide Klaerungen ohne ADR-Drift: inlineActionCapability landet im Self-Authored Skill Type plus PluginSkillMeta optional; LogEntry bekommt optionalen inlineAction-Block, JSONL ist flexibel) | 0 | /coding Phase 2c (EPIC-33 PLAN-42 Vorbereitung) |

## Cycle time per FEATURE

| FEATURE ID | Started | Completed | Cycle time | Scope | Notes |
|---|---|---|---|---|---|
| FEAT-26-01 (Welle 1 Backend) | 2026-05-15 (BA-Pass) | 2026-05-16 (Code) | 1 Tag | Advisor-Pattern Engine -- Tool + Profile + Tier-Resolver + Prompt-Reminder + Cost-Log mode-Tag | Backend-Scope; UI-SC-07 deferred zu Welle 2 FEAT-26-05 |
| FEAT-26-02 (Welle 1 Backend) | 2026-05-15 (BA-Pass) | 2026-05-16 (Code) | 1 Tag | Tier-Klassifikator + DiscoveryService (Pattern + Capability + OpenRouter-Pricing, 24h-Cache) | Production-Fetcher-Wiring + UI-Toggles bleiben Welle 2 PLAN-25 |

## Phase transition counts

| Date | Item | Phase from -> to | Notes |
|---|---|---|---|
| 2026-05-16 | PLAN-24 | Active -> Done | EPIC-26 Welle 1 Engine komplett, Übergang nach /testing geplant |
| 2026-05-16 | ADR-120 | Proposed -> Accepted | Implementation deckt Decision; Beta-Validation H-03 ausstehend |
| 2026-05-16 | ADR-121 | Proposed -> Accepted | Classifier 49 Tests grün, Pattern-Tabelle aktiv |

## Cross-phase trigger counts

| Date | PLAN | Trigger | Artifact | Notes |
|---|---|---|---|---|
| 2026-05-16 | PLAN-24 | design | F-4 -- `providers` Namens-Kollision | Beim Phase-2-Reconciliation entdeckt; Top-Level-Feld zu `providerConfigs[]` umbenannt, Plan-Text + ADR-Notiz aktualisiert. Kein Code-Pivot, additiv. |
