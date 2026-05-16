---
id: FEAT-26-02
title: Tier-Klassifikator + Discovery-Service
epic: EPIC-26
priority: P0
date: 2026-05-15
related: BA-27, RESEARCH-36
adr-refs: []
plan-refs: []
depends-on: []
---

# FEAT-26-02: Tier-Klassifikator + Discovery-Service

## Description

Das Plugin ruft beim Start und auf User-Action die `/v1/models`-Endpunkte aller konfigurierten Provider auf (Mechanik existiert bereits in `src/ui/settings/testModelConnection.ts:355` als `fetchProviderModels()`, wird hier erweitert um Caching und Auto-Trigger). Die zurückgegebenen Modelle werden durch einen Klassifikator in drei Tiers eingeordnet: fast, mid, flagship.

Klassifikations-Strategie:
- **Pattern-First:** Regex-Tabelle pro Modell-Familie (opus, gpt-5, o1, gemini-2.5-pro → flagship; sonnet, gpt-4.1, gpt-4o, deepseek-chat → mid; haiku, gpt-4o-mini, gemini-2.5-flash, llama-3-8b → fast).
- **Capability-Fallback:** wenn Pattern nicht greift, nutze `context_length` und `max_output_tokens` zur Klassifikation.
- **OpenRouter-Sonderpfad:** nutzt API-Pricing-Daten direkt für die Tier-Zuordnung.

Discovery-Cache: 24h-TTL pro Provider, manueller Refresh per Button in Settings, Auto-Refresh nur bei Plugin-Start wenn Cache abgelaufen. Lokale Provider (Ollama, LMStudio) werden listed, aber das Tier-Mapping bleibt manuell.

Quelle: BA-27 Sektion 7.1 Welle 2. QA-Decisions 3 (Tier-Fallback) und 4 (Single Active Provider).

## Benefits Hypothesis

Wenn das Plugin selbst entscheiden kann, welches Modell welchem Tier zuzuordnen ist, entfällt die manuelle Modell-Pflege durch den User. Neue Modell-Releases werden automatisch sichtbar. Das Tier-Mapping ist die natürliche Quelle für das Advisor-Pair (FEAT-26-01) und das Chat-Dropdown (FEAT-26-05). Ohne diesen Klassifikator müsste der User die Pair-Slots manuell pflegen, was den Setup-Aufwand wieder hochsetzt.

## User Stories

- **US-02-01 (P1 Sebastian, JTBD-3, JTBD-4):** Als Power-User möchte ich einen neuen Provider durch Auth-Eingabe konfigurieren und sehen, wie das Plugin automatisch die verfügbaren Modelle in fast/mid/flagship einordnet, damit ich nicht 20 Felder pro Modell pflege.
- **US-02-02 (P1 Sebastian):** Als Power-User möchte ich, dass neue Modell-Releases (z.B. Opus 4.7) nach einem Refresh sichtbar werden, damit ich keine manuelle Pflege bei Provider-Updates habe.
- **US-02-03 (P2 Knowledge-Worker):** Als Standard-User möchte ich, dass das Plugin selbst entscheidet, welches Modell für welche Aufgabe sinnvoll ist, damit ich keine Modell-Expertise brauche.

## Success Criteria

1. Wenn ich einen Provider konfiguriere und gültige Credentials eingebe, sehe ich nach Klick auf "Refresh" eine Liste der vom Provider angebotenen Modelle in den drei Tier-Slots.
2. Die Tier-Zuordnung der bekannten aktuellen Modelle ist intuitiv korrekt (Opus → flagship, Sonnet → mid, Haiku → fast usw.). Klassifikator deckt mindestens die aktuell verbreiteten Modelle der unterstützten Provider ab.
3. Wenn ein Modell vom Klassifikator nicht zugeordnet werden kann (unbekanntes Pattern), wird es im "Other"-Bereich des Settings sichtbar, der User kann es manuell einem Tier zuweisen.
4. Discovery-Calls passieren nicht bei jedem Plugin-Start. Wenn der Cache jünger als 24 Stunden ist, wird die zuletzt geholte Liste verwendet.
5. Ein klar sichtbarer "Refresh"-Button erzwingt einen sofortigen Refresh aller aktiven Provider.
6. Lokale Modelle (Ollama, LMStudio) werden gelistet, aber die Tier-Zuordnung erfolgt nur durch User-Auswahl (kein Auto-Pattern).
7. Wenn der Provider-API-Call fehlschlägt (Auth-Error, Timeout, 5xx), zeigt das UI eine klare Fehlermeldung und behält die letzte gecachte Liste.
8. Bei Plugin-Start asynchron: Discovery blockiert nicht das UI. Während des Refreshs zeigt der Tier-Slot "Auto-detecting..." statt einer leeren Auswahl.

## Technical NFRs

- **Performance:** Discovery-Call mit 10s-Timeout pro Provider. Parallelisierung über alle konfigurierten Provider beim Auto-Refresh.
- **Caching:** 24h-TTL, persistiert in `data.json` (oder eigene Cache-Datei). Cache wird invalidiert bei Provider-API-Key-Änderung.
- **Klassifikator-Patterns:** zentrale Tabelle in `src/core/routing/ModelTierClassifier.ts`, leicht erweiterbar (Code-Path, kein DB-Pfad).
- **Fallback-Logik:** wenn Pattern nicht greift, Capability-basiert (`contextWindow >= 200_000 && maxOutputTokens >= 32_000` → flagship; `contextWindow >= 128_000 && maxOutputTokens >= 8_000` → mid; else → fast).
- **OpenRouter-Pricing-Integration:** wenn der Provider OpenRouter ist und `pricing.prompt`/`pricing.completion` in der API-Antwort enthalten sind, nutze diese statt Pattern.
- **Provider-Auth-Robustheit:** Discovery-Call respektiert die jeweils provider-spezifische Auth-Mechanik (API-Key, OAuth-Token via `GitHubCopilotAuthService.getToken()`, Bedrock SigV4 etc.).
- **Determinismus:** identische Modell-Liste muss identische Klassifikations-Ergebnisse liefern (keine random tie-breakers).

## ASRs

- **ASR-CRIT-01:** Klassifikator-Patterns sind in einem zentralen Modul gehalten. Erweiterung um neue Modelle erfolgt durch Code-Change, nicht durch User-Konfiguration (zu hohes Drift-Risiko).
- **ASR-MOD-01:** Cache-Persistierung darf bei Plugin-Crash nicht zu Datenverlust führen (atomic write, wie `KnowledgeDB` Pattern aus FEATURE-0314).
- **ASR-MOD-02:** Discovery-Service ist read-only auf das Plugin-Settings-Objekt. Schreib-Aktionen (User wählt Override) gehen über den Settings-Save-Pfad.

## Definition of Done

- [ ] `ModelTierClassifier`-Klasse mit Pattern-Tabelle und Capability-Fallback
- [ ] `ModelDiscoveryService`-Klasse mit 24h-Cache + manuellem/automatischem Refresh
- [ ] Erweiterung von `fetchProviderModels()` um Caching-Layer (Wrapper, nicht Replacement)
- [ ] Klassifikations-Tests gegen die aktuellen Modell-Listen aller unterstützten Provider (Snapshot-Tests)
- [ ] OpenRouter-Pricing-basierte Klassifikation als Sonderpfad
- [ ] Telemetrie: Klassifikations-Outliers (Modelle die nur per Fallback klassifiziert wurden) werden in `console.debug` geloggt
- [ ] Tests: Pattern-Match, Capability-Fallback, Cache-Hit, Cache-Miss-with-API-Error, OpenRouter-Pricing-Pfad
- [ ] Live-Messlauf [AWAITING RE]: Discovery-Call gegen Anthropic, OpenAI, Bedrock, Copilot, OpenRouter, sichtbares Tier-Mapping in Settings

## Validation (Critical Hypothesis H-02)

H-02 sagt: Pattern deckt >90 % der Provider-Modelle ab. Validation: Klassifikations-Test gegen `fetchProviderModels()`-Output aller Provider zum Release-Zeitpunkt. Bei <90 %: Patterns nachschärfen oder Capability-Fallback-Schwellen anpassen.

## Out-of-Scope

- Auto-Pricing-Lookup über OpenRouter für unbekannte Modelle anderer Provider
- Background-Refresh (zeitlich getriggert, ohne User-Action)
- Klassifikator-Konfiguration durch User (Patterns bleiben Code-Path)
- Multi-Provider-Cross-Tier-Mapping
