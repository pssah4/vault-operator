---
id: architect-handoff-epic26
title: Architect Handoff -- EPIC-26
date: 2026-05-15
epic: EPIC-26
status: Open
related:
  - _devprocess/analysis/BA-27-advisor-pattern-provider-setup.md
  - _devprocess/requirements/epics/EPIC-26-advisor-pattern-provider-setup.md
  - _devprocess/requirements/features/FEAT-26-01-advisor-pattern-engine.md
  - _devprocess/requirements/features/FEAT-26-02-tier-klassifikator-discovery.md
  - _devprocess/requirements/features/FEAT-26-03-provider-only-settings-ui.md
  - _devprocess/requirements/features/FEAT-26-04-migration-backwards-compat.md
  - _devprocess/requirements/features/FEAT-26-05-chat-model-dropdown.md
  - _devprocess/requirements/features/FEAT-26-06-prompt-slim.md
github-issue: 319
---

# Architect Handoff -- EPIC-26: Advisor-Pattern + Provider-only Setup + Auto-Discovery

## Zusammenfassung für den Architekten

EPIC-26 stellt den Hauptloop des Agenten auf das mid-Tier-Modell um (typisch Sonnet) und führt ein `consult_flagship`-Tool ein, das der Agent selbst rufen kann, wenn schwierige Synthese nötig wird. Pair-Resolution und Tier-Mapping werden durch einen neuen `ModelDiscoveryService` und `ModelTierClassifier` automatisiert. Settings-Tab wechselt von Modell-zentriert auf Provider-zentriert. Bestehende `activeModels[]`-Configs werden automatisch migriert.

ReAct-Loop-Kern bleibt unverändert. EPIC-24-Mechaniken (Cache-Marker, Microcompaction, MCP-Listing-Cap, Helper-Routing-für-4-interne-Calls) werden nicht angetastet.

## NFR-Summary (quantifiziert)

### Performance

- Eskalations-Call (`consult_flagship`): max 3000 Output-Tokens, Subtask-Pattern, blockiert Hauptloop nicht
- Per-Turn-API-Handler-Resolution: ≤50ms (kein synchroner Provider-API-Call beim Send)
- Discovery-Call mit Timeout: 10s pro Provider
- Discovery-Refresh bei Plugin-Start: asynchron, blockiert UI nicht
- Pro-Provider-Discovery parallelisiert beim Auto-Refresh

### Caching

- 24h-TTL für Discovery-Cache pro Provider
- Cache-Persistierung atomic (analog `KnowledgeDB`-Pattern aus FEATURE-0314)
- Eskalations-Call darf Hauptloop-Cache nicht invalidieren (separater API-Handler, separater Cache-Prefix)
- Konditionale Prompt-Sections (FEAT-26-06) nach `CACHE_BREAKPOINT_MARKER`, stabiler Block unverändert
- Cache-Hit-Rate für Standard-Sessions: ≥95 % (kein Thrashing durch konditionale Sections)

### Security

- OAuth-Flows (GitHub Copilot, ChatGPT-OAuth) bleiben unverändert (Wiederverwendung von `GitHubCopilotAuthService`)
- Bedrock-Credentials (SigV4 / api-key) werden 1:1 übernommen, kein Re-Auth bei Migration
- Tool-Schema-Validation enforced provider-seitig (JSON-Schema, nicht nur Runtime-Check)
- Schema-Migration mit eindeutiger `schemaVersion` für zukünftige Migrationen

### Scalability

- Klassifikator-Patterns deckt aktuell ~20-30 unterschiedliche Modell-Familien ab. Erweiterung per Code-Change, kein DB-Pfad.
- Provider-Liste umfasst: Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot, ChatGPT-OAuth, Azure, Ollama, LMStudio, Custom-OpenAI-kompatibel
- Multi-Provider-Pflege (mehrere konfiguriert, einer aktiv): keine Performance-Implikation, nur Settings-Größe

### Availability

- Bei Provider-API-Fehler (Auth, Timeout, 5xx) bleibt die letzte gecachte Liste verwendbar
- Bei Migration-Fehler bleibt der ursprüngliche `activeModels[]`-Zustand erhalten
- Bei Subtask-Fehler (Eskalation) wird Tool-Result mit klarem Error zurückgegeben, Hauptloop läuft weiter
- Fallback-Robustheit: wenn Render-Entscheidung in FEAT-26-06 fehlschlägt, wird die Voll-Variante gerendert

### Cost-Awareness

- Per-Task-Counter für Advisor-Calls (max 3)
- Cost-Log markiert explizit: `model=auto(mid:<id>)`, `model=advisor(<flagship-id>)`, `model=override(<id>)`
- Telemetrie für Eskalations-Rate (Validation H-03)
- System-Prompt-Größe nach EPIC-26: ≥30 % kleiner für Standard-Auto-Sessions

## Critical ASRs (jeder hat eigenes ADR-Bedürfnis)

### ASR-CRIT-EPIC-26-01: Advisor-Pattern-Architektur (statt 3-Tier-Routing)

**Problem:** Der Hauptloop muss zwischen einem schlanken Default-Modell und gelegentlicher Flagship-Eskalation balancieren. Drei Architektur-Alternativen wurden in der QA verglichen:

- 3-Klassen-TaskRouter (simple → fast, complex-text → mid, complex-reasoning → flagship): zu komplex, klassifikations-fehleranfällig, Loop-Wechsel mid-Stream problematisch
- Hard-Forward-Eskalation bei consecutiveMistakes: User-Wunsch explizit dagegen ("Loop optimieren statt stoppen")
- Modell-getriebene Eskalation via Tool (Cowork-Pattern): Agent ruft `consult_flagship` selbst, Prompt-Reminder bei mistakes

**Entscheidung:** Modell-getrieben + Prompt-Reminder. ADR muss begründen warum, plus Risiken (Eskalations-Frequenz-Tuning, Reminder-Effektivität).

**ADR-Kandidat:** ADR-XXX Advisor-Pattern statt 3-Tier-Routing

### ASR-CRIT-EPIC-26-02: Tier-Klassifikator-Strategie

**Problem:** Wie klassifiziert das Plugin ein Modell in fast/mid/flagship? Drei Strategien wurden diskutiert:

- Pattern-First mit Capability-Fallback (Empfehlung): schnell, deterministisch, neue Modelle werden meist erkannt
- Capability-First: theoretisch sauberer, aber Capability-Daten sind nicht immer verfügbar
- Explizit per Settings: User pflegt alle Tier-Slots manuell (gegen die Vereinfachungs-Vision)

**Entscheidung:** Pattern-First mit Capability-Fallback. OpenRouter hat einen Sonderpfad (API-Pricing). ADR muss Pattern-Definition, Fallback-Schwellen und Erweiterungs-Pfad dokumentieren.

**ADR-Kandidat:** ADR-XXX Tier-Klassifikator-Strategie (Pattern + Capability + OpenRouter-Pricing)

### ASR-CRIT-EPIC-26-03: Provider-only Settings-Architektur

**Problem:** Settings-Schema-Wechsel von `activeModels: CustomModel[]` zu `providers: ProviderConfig[]` mit `tierMapping`. Wie wird das modelliert ohne Verlust von Bestehendem?

**Entscheidung:** Neue parallele Struktur (`providers`), bestehende `activeModels[]` bleibt während Übergang. Migration ist eigener Pfad (FEAT-26-04). ADR muss Schema-Definition und Migrations-Pfad festschreiben.

**ADR-Kandidat:** ADR-XXX Provider-only Settings-Schema

### ASR-CRIT-EPIC-26-04: Migrations-Strategie für `activeModels[]`

**Problem:** Bestehende User haben kuratierte `activeModels[]`-Configs (~20 Felder pro Eintrag). Auto-Migration muss robust sein, kein User-Setup darf zerstört werden.

**Entscheidung:** Auto-Migrate + Notification-Modal + 30-Tage-Backup unter `legacy_active_models_backup`. ADR muss Edge-Cases dokumentieren (Multi-Auth pro Provider, fehlende Tiers, exotische Custom-Endpoints).

**ADR-Kandidat:** ADR-XXX Migrations-Strategie und Backup-Pfad

### ASR-CRIT-EPIC-26-05: ADR-115 Amendment

**Problem:** ADR-115 dokumentiert Helper-Modell-Routing für 4 interne Calls. EPIC-26 erweitert die Semantik: Hauptloop-Default-Tier ist konfigurierbar, `helperModelKey` wird zu "fast-Tier"-Setting umdefiniert (oder Alias).

**Entscheidung:** ADR-115 Amendment statt neuem ADR. Klärt: `helperModelKey` bleibt Setting-Path-stabil, semantisch ist es jetzt fast-Tier-Alias. Subtask-Profile (research) override auf fast-Tier.

**ADR-Kandidat:** ADR-115 Amendment

### ASR-MOD-EPIC-26-06: Chat-Override-Mechanik

**Problem:** Per-Turn-Override im Chat-Dropdown muss deterministisch, schnell und cache-freundlich sein. Beim Override wird `consult_flagship` aus dem Tool-Schema gefiltert.

**Entscheidung:** API-Handler wird pro Send neu gebaut (Override-Wert beim Send-Event gelesen). Tool-Registration-Filter ist deterministisch.

**ADR-Kandidat:** könnte als Moderate-ASR in einer Sub-Sektion eines bestehenden ADR landen.

## Offene Architektur-Fragen

1. **Subtask-Tier-Inheritance:** Erbt `new_task` ohne `profile` das aktive Tier (= mid bei Auto-Modus, override-Modell bei Override) oder läuft es immer auf einem Default? Empfehlung in FEAT-26-01 ist: Subtask erbt Tier des Parents. Bei research-Profile explizit auf fast-Tier. Architect muss Edge-Cases (Recursive-Subtask, Profile-Conflict) entscheiden.

2. **`helperModelKey` vs neue Tier-Settings:** soll `helperModelKey` als Setting bleiben (für 4 interne Calls) oder durch das neue Tier-System ersetzt werden? Bei Erhalt: explizit dokumentieren dass das Setting an fast-Tier gebunden ist. Bei Ersatz: Migration-Pfad nötig.

3. **OAuth-Provider-Listing-Endpunkte:** GitHub Copilot und ChatGPT-OAuth haben jeweils eigene Modell-Listing-Endpunkte mit unterschiedlichen Strukturen. Klassifikator muss provider-spezifisches Schema-Parsing haben.

4. **Bedrock Cross-Region-Inference-Profile:** `eu.anthropic.claude-opus-4-6-v1` hat einen `eu.`-Prefix der vom Klassifikator normalisiert werden muss (Existing `normalizeModelId()` aus `src/types/model-registry.ts`). Architect muss prüfen ob diese Normalisierung im Klassifikator-Pfad sauber integriert ist.

5. **Refresh-Trigger:** Pure Manual (Button-Only) reicht für MVP. Architect kann erwägen, ob ein Auto-Refresh bei Settings-Open oder beim ersten Send nach Cache-Stale sinnvoll wäre. Out-of-Scope für EPIC-26 ist Background-Cron-Refresh.

6. **Notification-Modal-Inhalt:** Welche konkreten Felder zeigt das Modal nach Migration? Vorschlag: Provider-Liste mit Tier-Zuordnung, Anomalien-Liste, Action-Buttons. Architect kann den Detail-Inhalt im PLAN festlegen.

7. **Cost-Log-Schema-Erweiterung:** Bisheriges `[Cost]`-Log braucht ein `mode`-Field (`auto`, `override`, `advisor`). Architect muss prüfen ob das in `TaskTelemetry.ts` sauber integrierbar ist ohne Provider-Adapter-Bruch.

8. **Embedding-Modell:** EPIC-26 betrifft nur Chat-Modelle. Embedding-Modelle bleiben im bisherigen Pfad (`fetchEmbeddingModels()`). Architect muss bestätigen dass die beiden Pfade nicht in Konflikt geraten.

## Constraints

### Technisch

- ReAct-Loop-Kern (`AgentTask.run()`) bleibt unverändert
- EPIC-24-Mechaniken (Cache-Marker, Microcompaction, Externalizer, MCP-Listing-Cap) bleiben unverändert
- Provider-Liste umfasst: Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot, ChatGPT-OAuth, Azure, Ollama, LMStudio, Custom
- 24h-Cache für Discovery, kein Background-Refresh
- Migration darf bestehende User-Setups nicht silent zerstören

### Strategisch

- Plugin bleibt MIT-lizenziert
- Bewährte Mechaniken aus EPIC-24 nicht antasten
- EPIC-28 (Privacy) und EPIC-29 (Cluster-aware Memory) laufen parallel, EPIC-26 darf sie nicht blockieren

### Delivery / Operations

- Release als v2.11.0
- BRAT-Beta-Phase auf privatem Dev-Repo vor Public-Release (analog v2.5.0-beta)
- Live-Messlauf gegen Sebastians produktives Setup vor Public-Release (analog MESSLAUF-EPIC-24)
- Notification-Modal beim ersten Start nach Upgrade ist Pflicht

## Forbidden-Terms-Check

Success Criteria der Features wurden auf Tech-Begriffe geprüft. Findings:

- FEAT-26-01..05: Success Criteria sind primär user-facing formuliert. Vereinzelt sind technische Begriffe in Beschreibung und Tool-Namen explizit nötig (z.B. "Tool-Result-Meldung", "Tool-Schema", "API-Call"), da das Feature inhärent technisch ist. Diese sind klar von Erfolgskriterien getrennt.
- FEAT-26-06: System-Prompt-Größe und Cache-Hit-Rate sind in den SC explizit als Zahlen genannt. Das ist gerechtfertigt durch den technischen Charakter der Optimierung. Tech-Begriffe wie `CACHE_BREAKPOINT_MARKER` sind in NFR/ASR, nicht in SC.

**Verdikt:** SC ist im akzeptablen Rahmen für ein technisches Plugin-Feature. Keine OAuth/REST/SQL-Begriffe in SC.

## Dialog

(Architekt füllt diesen Abschnitt während der `/architecture`-Phase. Append-only, Rows werden nicht gelöscht.)
