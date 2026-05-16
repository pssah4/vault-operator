---
id: FEAT-26-03
title: Provider-only Settings UI
epic: EPIC-26
priority: P0
date: 2026-05-15
related: BA-27
adr-refs: []
plan-refs: []
depends-on: [FEAT-26-02]
---

# FEAT-26-03: Provider-only Settings UI

## Description

Settings-Tab "Models" wird zu "Providers". Statt einer flachen Liste konfigurierter Modelle sieht der User pro Provider einen kompakten Block mit Enable-Toggle, Auth-Eingabe (API-Key oder OAuth-Sign-In), Discovered-Modell-Liste mit Refresh-Anzeige und einer Tier-Mapping-Tabelle (fast, mid, flagship) mit Auto-Default und Override-Dropdown pro Slot. Ein globaler "Active Provider"-Selector wählt genau einen Provider als aktiv.

Custom-Endpoints (Ollama, LMStudio, Custom-OpenAI-kompatibel) bleiben pflegbar mit BaseURL-Feld. Bei diesen muss die Tier-Zuordnung manuell erfolgen (FEAT-26-02 listet die Modelle, klassifiziert sie aber nicht automatisch).

Bedrock-Provider zeigt zusätzlich Region und Auth-Modus (apiKey vs accessKey/secretKey). OAuth-Provider (GitHub Copilot, ChatGPT-OAuth) zeigen Sign-In-Button statt API-Key-Feld, bestehender OAuth-Flow (`GitHubCopilotAuthService`) wird unverändert genutzt.

Quelle: BA-27 Sektion 7.1 Welle 3. QA-Decisions 4 (Single Active) und Mockup im BA Sektion 2.3 To-Be.

## Benefits Hypothesis

User pflegen heute pro Modell ~20 Felder manuell. Wenn das UI nur Provider-Auth-Pflege verlangt und alles andere automatisch passt (Tier-Mapping via FEAT-26-02), sinkt der Setup-Aufwand pro Provider von 5-10 Min auf ≤1 Min. Provider-only UI ist auch die Voraussetzung dafür, dass Vault Operator über den Power-User-Kreis hinaus empfehlbar wird.

## User Stories

- **US-03-01 (P1 Sebastian, JTBD-3):** Als Power-User möchte ich einen neuen Provider nur durch Provider-Auswahl plus API-Key oder OAuth-Login konfigurieren, damit ich keine 20 Felder pro Modell verstehen muss.
- **US-03-02 (P1 Sebastian):** Als Power-User möchte ich zwischen konfigurierten Providern per Dropdown wechseln können (z.B. Privacy-sensitive Themen auf lokales Ollama, Coding auf Bedrock), damit ich situative Provider-Kontrolle behalte.
- **US-03-03 (P1 Sebastian):** Als Power-User möchte ich pro Tier-Slot ein Override-Dropdown sehen, damit ich bei Bedarf das automatisch gewählte Modell überschreiben kann.
- **US-03-04 (P2 Knowledge-Worker):** Als Standard-User möchte ich, dass das Setup nach Provider-Auswahl und API-Key sofort funktioniert, damit ich keine weiteren Entscheidungen treffen muss.
- **US-03-05 (P3 Enterprise):** Als Enterprise-User möchte ich klar sehen, welcher Provider gerade aktiv ist und welche Tier-Modelle zugeordnet sind, damit ich Audit-Compliance gewährleisten kann.

## Success Criteria

1. Settings-Tab heisst "Providers" statt "Models" und listet alle unterstützten Provider als kompakte Blöcke.
2. Pro Provider-Block sehe ich: Enable-Toggle, Auth-Eingabe (API-Key-Feld oder OAuth-Sign-In-Button je nach Provider-Type), Discovered-Modell-Count, Refresh-Button mit Zeitstempel, drei Tier-Slots mit Auto-Wahl und Override-Dropdown.
2.1. In jedem Tier-Slot ist das aktuell ausgewählte Modell direkt sichtbar (z.B. "Flagship → Claude Opus 4.7"), nicht nur ein generisches "Auto"-Label. Wenn das Modell automatisch klassifiziert wurde, erscheint ein dezenter "auto-detected"-Hinweis neben dem Modellnamen. Bei manuellem Override entfällt der "auto-detected"-Hinweis, ein "manually set"-Hinweis erscheint stattdessen.
2.2. Das Dropdown im Tier-Slot listet alle Modelle des Providers, sortiert: zuerst das auto-detected Modell für diesen Tier, dann weitere geeignete Modelle des Tiers, danach Modelle anderer Tiers (als grauer Block mit Hinweis "different tier"). Per Klick wechselt der User auf ein anderes Modell, die Auswahl wird sofort persistiert und im Slot angezeigt.
3. Ein "Active Provider"-Selector oben im Tab zeigt genau einen Provider als aktiv markiert. Wechsel ist mit einem Klick möglich.
4. Bei Custom-Endpoints (Ollama, LMStudio) sehe ich ein BaseURL-Feld zusätzlich. Tier-Slots sind manuell zu setzen, kein Auto-Pattern.
5. Bedrock-Provider zeigt Region-Dropdown und Auth-Modus-Switch (api-key vs access-key/secret-key).
6. OAuth-Provider zeigt "Sign in"-Button. Nach erfolgreichem Sign-In wird der Provider als authentifiziert markiert, Discovery wird ausgelöst.
7. Wenn ich einen Tier-Slot per Override ändere, wird die Auswahl persistiert und das Plugin nutzt das Override-Modell für den entsprechenden Tier ab dem nächsten Send.
8. Wenn ein Provider keinen flagship-Tier-Slot belegt hat, sehe ich einen Hinweis "Advisor pattern disabled for this provider".

## Technical NFRs

- **UX-Konsistenz:** Provider-Block-Layout wiederverwendbar (Component-Pattern), pro Provider-Type nur die spezifischen Felder hinzu.
- **Migration-Awareness:** UI muss mit Legacy-`activeModels[]`-Configs koexistieren während FEAT-26-04 läuft. Bei migrierten Configs sieht der User Hinweise im Modal (siehe FEAT-26-04).
- **Persistenz-Atomicity:** Settings-Save bei Tier-Override ist transaktional (kein Half-Write der Tier-Zuordnung).
- **Refresh-Feedback:** während Refresh läuft (Discovery-Call gegen API), zeigt Button-State "Refreshing..." und blockiert weiteres Klicken.
- **OAuth-Wiederverwendung:** `GitHubCopilotAuthService` und `ChatGPTOAuthService` (falls existiert) bleiben unverändert. Settings-UI ruft nur deren `signIn()`/`signOut()`-Methoden.

## ASRs

- **ASR-CRIT-01:** Bestehende Auth-Flows (OAuth, Bedrock SigV4) dürfen nicht refaktoriert werden, nur das UI um sie herum.
- **ASR-MOD-01:** Active-Provider-Wechsel ist eine atomic Setting-Mutation. Plugin liest den aktiven Provider bei jedem Send, nicht beim Plugin-Start gecacht.
- **ASR-MOD-02:** Tier-Slots werden in einer neuen Settings-Struktur gehalten (`providers: ProviderConfig[]` mit `tierMapping: { fast, mid, flagship }`), nicht direkt im legacy `activeModels[]`.

## Definition of Done

- [ ] Neuer `ProvidersTab.ts` ersetzt bzw. erweitert `ModelsTab.ts`
- [ ] Provider-Block-Komponente mit Type-spezifischen Feldern (API-Key, OAuth-Button, Region, BaseURL)
- [ ] Tier-Mapping-Tabelle mit Auto/Override-Dropdown pro Slot
- [ ] Active-Provider-Selector am Top des Tabs
- [ ] Refresh-Button mit Loading-State und Timestamp-Anzeige
- [ ] Settings-Schema-Erweiterung um `providers`-Liste und `activeProviderId`
- [ ] Bestehende `activeModels[]` bleibt unangetastet für FEAT-26-04-Migration
- [ ] i18n-Keys für alle neuen UI-Elemente (en, de)
- [ ] Tests: Provider-Block-Rendering, Tier-Override-Persistierung, Active-Provider-Wechsel
- [ ] Live-Messlauf [AWAITING RE]: Setup eines neuen Providers in ≤1 Min messbar

## Validation (Critical Hypothesis H-04)

H-04 sagt: Setup pro neuem Provider auf ≤1 Min senkbar. Validation: Stoppuhr-Test in Beta-Phase. Bei >1 Min: UI-Friction analysieren (zu viele Klicks, unklare Reihenfolge, fehlendes Auto-Default).

## Out-of-Scope

- Multi-Provider-Active parallel
- Provider-Discovery-Endpunkt-Konfiguration (Liste der unterstützten Provider bleibt im Code)
- Erweiterte Provider-Diagnostik (Latency-Metrics pro Provider, Rate-Limit-Anzeige)
- Embedding-Modell-Konfiguration (bleibt im bisherigen UI-Pfad, FEAT-26-03 betrifft nur Chat-Modelle)
