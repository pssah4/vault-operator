---
id: BA-ADVISOR-PROVIDER-SETUP
title: Business Analysis -- Advisor-Pattern + Provider-only Setup + Auto-Discovery
status: Validated
version: 1.0
created: 2026-05-15
owner: Sebastian Hanke
epic: EPIC-26
github-issue: 319
related:
  - _devprocess/analysis/BA-12-token-cost-reduction.md
  - _devprocess/requirements/epics/EPIC-24-agent-loop-effizienz.md
  - _devprocess/analysis/RESEARCH-36-agent-loop-cost-refactoring.md
  - _devprocess/architecture/ADR-115-helper-model-routing.md
qa-session: 2026-05-15 (10 Entscheidungen dokumentiert in Issue #319)
---

# Business Analysis: Advisor-Pattern + Provider-only Setup + Auto-Discovery

> **Scope:** MVP
> **Erstellt:** 2026-05-15
> **Auslöser:** Live-Test eines 8-Turn-Strategie-Chats kostete 20,45 EUR. Cowork-Architektur-Analyse zeigt strukturell anderen Ansatz.

---

## 1. Executive Summary

### 1.1 Problem Statement

Ein typischer Strategie- oder Recherche-Chat in Vault Operator (8 Turns, Mix aus Argumentation und Note-Writing) kostet 15 bis 25 EUR. Der Hauptloop läuft konsequent auf dem teuersten verfügbaren Modell (Claude Opus 4.6 zu ~5x Sonnet-Preis und ~25x Haiku-Preis), obwohl die meisten Turns reine Text-Generierung sind und keine Flagship-Reasoning brauchen. Der TaskRouter aus v2.10 klassifiziert solche Chats korrekt als "complex" und behält Opus, weil seine Logik binär ist (simple → Helper, complex → Main) und keine mittlere Stufe kennt.

Parallel dazu hat das Setup einen hohen Onboarding-Aufwand: Der User pflegt pro Modell ~20 Felder manuell (Provider, BaseURL, MaxTokens, ThinkingBudget, Cache-Konfiguration, etc.). Wenn ein neues Modell erscheint (z.B. Opus 4.7), muss er es manuell hinzufügen. Das Resultat ist ein gepflegter aber rigider Modell-Pool, der nicht mit dem Tempo der Provider-Releases mithält.

Die Analyse von EnBW Cowork zeigt einen strukturell anderen Lösungsansatz: weak-Modell läuft permanent im Hauptloop, strong-Modell wird via `consult_advisor`-Tool gerufen, wenn der Agent steckt. Plus: Provider-only Setup mit Auto-Discovery, der User wählt nur den aktiven Provider + Auth, der Rest läuft automatisch.

### 1.2 Proposed Solution

Drei zusammenhängende Komponenten, die einen einzigen Roadmap-Schnitt bilden:

1. **Advisor-Pattern als Loop-Default.** Hauptloop läuft auf "mid"-Tier (typisch Sonnet). Bei harten Fragen ruft der Agent selbst `consult_flagship`, ein Tool mit Pflicht-Schema (problem, relevant_context, failed_attempts, constraints) und hartem 3000-Token-Budget. Eskalation kostet einen einzelnen Flagship-Call, nicht den ganzen Loop.

2. **Tier-Klassifikator + Auto-Discovery.** Plugin ruft `/v1/models`-Endpunkte der Provider auf (existiert bereits in `fetchProviderModels()`), klassifiziert die zurückgegebenen Modelle nach Tier (fast/mid/flagship) per Pattern-Match + Capability-Fallback. Klassifikator füllt die drei Tier-Slots automatisch, User kann pro Slot überschreiben.

3. **Provider-only Settings UI.** Settings-Tab "Models" wird zu "Providers". Pro Provider: Enable-Toggle, API-Key oder OAuth-Sign-In, Tier-Mapping-Tabelle mit Auto/Override pro Slot. "Active Provider"-Selector (genau einer aktiv). Chat-Header zeigt Dropdown mit "Auto" als Default und Modellen des aktiven Providers als Override-Optionen pro Turn.

### 1.3 Expected Outcomes

- Kosten pro Strategie-/Recherche-Chat: 20 EUR → 5 EUR (~75 % Reduktion) ohne Qualitätsverlust für Text-Generierung
- Onboarding-Aufwand pro Provider: 5-10 Min → 1 Min (API-Key + Klassifikator macht den Rest)
- Modell-Drift: neue Provider-Modelle werden automatisch sichtbar nach Refresh (heute manuell)
- UX-Konsistenz: User wählt situativ pro Turn zwischen "Auto" (intelligentes Routing) und expliziter Modell-Wahl (Kontrolle), Kontext bleibt erhalten

### 1.4 Strategische Einordnung

EPIC-26 ist die direkte Fortsetzung von EPIC-24 (Agent-Loop Effizienz, v2.7.3..v2.10.x). EPIC-24 löste das simple-Task-Routing (TaskRouter), Cache-Stabilisierung (FEAT-24-01), Microcompaction (FEAT-24-02) und MCP-Listing (FEAT-24-06). Was offen blieb: das "complex-text"-Plateau, also Strategie-/Argumentations-Tasks die kein Reasoning auf Opus-Niveau brauchen, aber heute trotzdem dort landen. Plus: das Modell-Setup, das mit jedem neuen Anthropic/OpenAI-Release komplexer wurde.

EPIC-27 (Provider-only Setup, ursprünglich separat geplant) wurde am 2026-05-15 in EPIC-26 absorbiert, weil der Tier-Klassifikator die natürliche Pair-Quelle ist und eine doppelte Settings-Migration (heute → manuelles Pair → später Auto-Tier) für die User vermieden wird.

---

## 2. Business Context

### 2.1 Background

Vault Operator ist ein KI-Agent-Plugin für Obsidian mit 63 Tools, das täglich Sebastian und ähnliche Knowledge-Worker bei Recherche, Notiz-Erstellung, Strategie-Chats und Code-Implementation unterstützt. Der Loop ist ReAct-basiert, multi-provider-fähig (Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot, ChatGPT-OAuth, Azure, Ollama, LMStudio).

Die Token-Kostenreduktion ist seit v2.7.3 ein durchgehendes Thema (FIX-12 → EPIC-18 → EPIC-24). Frühere Wellen reduzierten Kosten dramatisch für Tool-heavy Tasks (Recipe-Batching, Caching, Microcompaction). Was die Wellen bisher nicht trafen: dialogische Strategie-Chats mit hohem Output-Anteil und niedriger Tool-Use-Dichte.

### 2.2 As-Is Analysis

**Modell-Routing heute (v2.10.x):**

```
User-Prompt → TaskRouter.classifyByRegex()
                ├─ "simple"  → helper-Modell (Sonnet/Haiku via Copilot)
                ├─ "complex" → main-Modell (Opus 4.6)
                └─ "unknown" → main-Modell (Opus 4.6, sicherer Default)
```

Komplexe Prompts (Multi-Step, Research-Verben, >300 Chars) bleiben auf Opus. Eine 8-Turn-Strategie-Diskussion mit Opus-Output (3-6k Tokens pro Turn) summiert sich zu 15-25 EUR pro Session. Der heutige Helper-Modell-Pfad (FEAT-24-07) routet nur 4 interne Calls (condenseHistory, FastPath-Planner, plan_presentation, RecipePromotion), nicht den Hauptloop.

**Modell-Pflege heute:**

User pflegt `activeModels: CustomModel[]` mit ~20 Feldern pro Eintrag (provider, displayName, apiKey, baseUrl, maxTokens, temperature, apiVersion, promptCachingEnabled, thinkingEnabled, thinkingBudgetTokens, awsRegion, awsAuthMode, awsApiKey, awsAccessKey, awsSecretKey, awsSessionToken, etc.). Hinzufügen eines neuen Modells: ModelConfigModal öffnen, manuell Felder ausfüllen, "Fetch models"-Button optional, dann Modell in der Modell-Liste sichtbar. Pro Chat wählt der User über das Chat-Dropdown welches der konfigurierten Modelle laufen soll.

**Token-Verteilung pro Session (Beispiel: 20-EUR-Chat, 8 Turns):**

- System-Prompt: ~17.300 Tokens (cost-heuristics=1435, plugin-skills=5066, tools-section=3403, skill-directory=1176, mode=1160, memory=1039, objective=962, response-format=806)
- Tool-Schemas: ~8.115 Tokens (38 Tools)
- Prefix-Cache-Read pro Turn nach erstem: ~25k Tokens × $1.50/M (Opus Cache-Read) = ~3,5 ct
- Output: 3-6k Tokens pro Turn × $75/M (Opus Output) = 22-45 ct pro Turn
- History akkumuliert auf 60k+ Tokens bei Turn 7+

Output dominiert die Kosten bei diesem Workflow-Typ, nicht der Prefix.

### 2.3 To-Be Analysis

**Modell-Routing nach EPIC-26:**

```
Plugin-Start → ModelDiscoveryService.refreshOnStartup()
                → Klassifikator: { fast: Haiku, mid: Sonnet, flagship: Opus }

User-Prompt → AgentTask.run() startet auf mid-Tier (Sonnet)
              Loop läuft auf mid

Wenn Agent steckt: consult_flagship(problem, relevant_context, failed_attempts, constraints)
                   → Subtask auf flagship-Tier mit 3000-Token-Budget
                   → Antwort fließt als Tool-Result zurück in den mid-Loop

User-Override im Chat-Dropdown: "Auto" (Default) | Opus | Sonnet | Haiku
- Bei "Auto": Pattern aktiv wie oben
- Bei explizitem Modell: Loop fix auf Wahl, consult_flagship nicht registriert
```

**Modell-Pflege nach EPIC-26:**

```
Settings → Providers

[+ Add provider]     [Refresh models]     Active provider: [Anthropic ▼]

[Anthropic]                                  ✓ active
  API Key:  ●●●●●●●●●●●
  5 models discovered (last refresh: 2 min ago)
  
  Flagship  →  Claude Opus 4.7      [▼ Override]
  Mid       →  Claude Sonnet 4.6    [▼ Override]
  Fast      →  Claude Haiku 4.5     [▼ Override]

[GitHub Copilot]                              inactive
  OAuth: [Sign in]

[Ollama]                                      inactive
  Base URL: http://localhost:11434
  (lokale Modelle, Tier-Mapping manuell)
```

User wählt nur Provider + Auth. Bei Erst-Setup: Plugin discoveryt automatisch verfügbare Modelle, klassifiziert in 3 Tier-Slots, User kann pro Slot überschreiben. Setup-Zeit für neuen Provider: ~1 Minute.

### 2.4 Gap Analysis

| Dimension | As-Is (v2.10.x) | To-Be (EPIC-26) | Gap |
|-----------|-----------------|------------------|-----|
| Default-Modell für Strategie-Chats | Opus 4.6 | Sonnet 4.6 (mid) via Auto-Routing | Loop-Refactoring + Tier-Mapping |
| Eskalations-Mechanik | TaskRouter rückwärts (Helper → Main bei mistakes) | `consult_flagship`-Tool, modell-getrieben | Neues Tool + Prompt-Guidance |
| Modell-Onboarding pro Provider | ~20 Felder manuell | Provider + Auth, Auto-Klassifikator | DiscoveryService + UI-Refactor |
| Drift bei neuen Modellen | Manuell nachpflegen | Auto-Refresh per Klick | Cache + Refresh-Logik |
| Chat-Modell-Selektor | Liste aller activeModels über Provider hinweg | "Auto" + Modelle des aktiven Providers | Dropdown-Refactor |
| Override-Granularität | Pro Chat (Mode-Switch) | Pro Turn (Dropdown) | Per-Turn-Handler-Resolution |

---

## 3. Personas und Needs

### P1: Sebastian (Power-User, Plugin-Maintainer)

**Rolle:** Senior-Knowledge-Worker, KI-Plugin-Entwickler, Berater im EnBW-Kontext.

**Goal:** Vault Operator als Daily-Driver nutzen für Strategie-Chats, Code-Implementation, Note-Curation. Kostentransparenz und -kontrolle wichtig, weil pro Tag mehrfach genutzt.

**Pain:** Strategie-Chats kosten 15-25 EUR pro Session. Modell-Setup wurde mit jedem neuen Provider/Modell komplexer. Bei jedem Anthropic-Release manuelle Pflege. Im Chat muss er aus 10+ Modellen das Richtige wählen.

**Quote (sinngemäß aus dem Strategie-Chat):**
> "Das waren keine komplexen Fragen, aber 20 EUR. Der Loop läuft auf Opus, obwohl ich nur diskutiere. Wenn ich nur Provider + API-Key konfigurieren müsste und der Rest würde automatisch passen, wäre das ein riesiger UX-Gewinn."

**Top Needs:**
1. **Funktional:** Automatisches Routing auf günstigere Modelle bei text-lastigen Tasks
2. **Funktional:** Setup-Vereinfachung (Provider + Auth statt 20 Felder pro Modell)
3. **Funktional:** Override-Option pro Turn, falls Modell-Wahl situativ wichtig
4. **Emotional:** Vertrauen, dass das Plugin intelligent Kosten optimiert ohne Qualitätsverlust
5. **Sozial:** Plugin als Open-Source-Tool weitergeben können ohne komplexes Setup-Erklären

### P2: Knowledge-Worker (Standard-User) [SPEKULATIV]

> **Validierungs-Status:** Noch nicht durch Interviews bestätigt. Persona dient als Design-Ziel für Setup-Vereinfachung, basiert auf der Hypothese, dass Vault-Operator-Adoption über den Power-User-Kreis hinauswächst, wenn das Onboarding entwickler-frei wird. Echte Bedürfnisse werden in der Beta-Phase nach Release validiert (User-Feedback, Adoption-Telemetrie).

**Rolle:** Wissensarbeiter mit Obsidian-Vault, nutzt KI für Note-Generierung, Recherche-Zusammenfassung, Daily-Note-Pflege.

**Goal:** KI-Assistenz in seinem Vault, ohne sich mit Modell-Tiering, Token-Optimierung oder Cache-Marker beschäftigen zu müssen.

**Pain:** Heutiges Setup wirkt entwickler-zentriert. Pro Modell viele Felder, viele Provider-Optionen, unklar was zu wählen.

**Top Needs (hypothetisch):**
1. **Funktional:** Plugin "just works" nach Provider + API-Key
2. **Emotional:** Sicherheit, dass keine Kosten-Falle lauert
3. **Sozial:** Plugin so empfehlen können, dass Bekannte es ohne Hand-holding aufsetzen

### P3: Enterprise-User (zukünftig, via EPIC-28-Synergie)

**Rolle:** IT-Pro oder Compliance-Beauftragter, nutzt Vault Operator im Unternehmens-Kontext (interne Vault-Inhalte, sensitive Daten).

**Goal:** Klare Kontrolle über Kosten, Provider-Wahl (z.B. EU-Bedrock statt US-Anthropic), Audit-Trail.

**Pain:** Heutiges Multi-Modell-Setup ist schwer zu auditieren ("welches Modell hat welche Anfrage gesehen?"). Provider-Wechsel braucht Re-Konfiguration vieler Modelle.

**Top Needs:**
1. **Funktional:** Single-Active-Provider mit klarer Disziplin
2. **Funktional:** Audit-/Telemetrie-Sichtbarkeit (welcher Tier hat welche Anfrage gesehen)
3. **Strategisch:** Provider-Wechsel ohne Modell-Pflege-Overhead

### Cross-Persona Needs

- Transparente Tier-Anzeige (welches Modell hat gerade gelaufen, war es Auto oder Override)
- Kein-Schaden-Garantie: Migration alter `activeModels[]`-Configs darf kein Setup zerschießen
- Vertrauenswürdige Default-Klassifikation (Pattern-Erkennung darf nicht systematisch falsch liegen)

---

## 4. Problem Analysis

### 4.1 Problem Dimensions

**Dimension 1: Cost-Pollution durch Default-Routing.**
- Symptom: 20 EUR pro Strategie-Chat, statt 4-5 EUR möglich
- Root: TaskRouter ist binär (simple/complex), keine "complex-text"-Klasse, Hauptloop hat keine Tier-Awareness
- Impact: Plugin wird als "teuer" wahrgenommen, User reduziert Nutzung oder switcht manuell auf Sonnet (verliert Auto-Komfort)

**Dimension 2: Onboarding-Friktion.**
- Symptom: Neues Modell hinzufügen dauert 5-10 Min, viele Felder zu verstehen
- Root: ModelConfigModal ist Power-User-zentriert, kein guided Setup
- Impact: Plugin wirkt entwickler-only, Verbreitung über Power-User-Kreis hinaus erschwert

**Dimension 3: Drift bei Provider-Releases.**
- Symptom: Opus 4.7 erscheint, User muss manuell hinzufügen, eventuell BA-12-Pricing-Tabelle aktualisieren
- Root: Provider-Listen sind kein Default-Sync-Target, Pricing-Tabelle ist statisch
- Impact: Plugin hinkt 1-3 Monate hinter aktuellen Modell-Releases, User upgraden nicht

**Dimension 4: Chat-Modell-Selektor-Chaos.**
- Symptom: Dropdown im Chat zeigt 10+ Einträge aus verschiedenen Providern (z.B. "Opus via Bedrock", "Opus via Copilot Sub", "Opus via Anthropic API")
- Root: Modell-Selektor ist activeModels-flat, kein Provider-Scoping
- Impact: User wählt versehentlich falsches Modell, kein klares Mental-Model

### 4.2 Root Causes

1. **Loop-Architektur kennt nur ein Modell pro Task.** AgentTask konstruiert sich mit einem `api: ApiHandler`. Cross-Tier-Eskalation ist heute eine Mistake-getriebene Rückwärts-Eskalation, kein Forward-Pattern.
2. **Settings-Schema ist activeModels-zentriert, nicht Provider-zentriert.** CustomModel ist die Unit, nicht Provider. Tier-Klassifikation fehlt als Konzept.
3. **Discovery existiert nur als manueller Action im Modal.** Kein Auto-Refresh, kein Tier-Mapping.

### 4.3 Impact

- **Direkt:** 70-80 % Kosten-Aufschlag pro Strategie-Chat. Bei 5 Strategie-Chats/Woche × 15 EUR Überaufwand = 75 EUR/Woche.
- **Indirekt:** Plugin-Adoption stagniert über Power-User-Kreis hinaus. Setup-Erklärung blockt Empfehlungen.
- **Strategisch:** Mit jedem neuen Modell-Release wächst die Pflege-Schuld. Ohne Auto-Discovery wird der Status quo unhaltbar.

### 4.4 Jobs to be Done

**JTBD-1 (P1 Sebastian):** "Wenn ich eine Strategie-Diskussion mit dem Agent führe, will ich, dass das Plugin selbstständig auf einem günstigeren Modell läuft (Sonnet), ohne dass ich pro Chat manuell switchen muss, so dass ich Kosten reduziere ohne Qualitätsverlust für Text-Generierung."

**JTBD-2 (P1 Sebastian):** "Wenn der Agent eine schwierige Synthese braucht (z.B. Architektur-Vergleich, kreative Optionen), will ich dass er selbst auf das stärkere Modell eskaliert für genau diesen Sub-Step, so dass ich nicht den ganzen Loop teuer fahren muss."

**JTBD-3 (P1, P2):** "Wenn ich einen neuen Provider konfiguriere, will ich nur den API-Key oder OAuth-Login eingeben und sofort loslegen, so dass ich keine 20 Felder verstehen muss."

**JTBD-4 (P1, P2):** "Wenn Anthropic ein neues Modell released, will ich, dass es ohne meine Aktion verfügbar wird, so dass ich nicht alle paar Monate Pflege-Aufwand habe."

**JTBD-5 (P1):** "Wenn ich für eine spezifische Frage besseres Judgement habe als die Auto-Klassifikation, will ich pro Turn das Modell überschreiben können, so dass die Kontrolle bei mir bleibt."

**JTBD-6 (P3):** "Wenn ich für ein Audit nachweisen muss, welches Modell welche Anfrage gesehen hat, will ich eine klare Single-Provider-Disziplin pro Session, so dass die Datenflüsse nachvollziehbar bleiben."

---

## 5. Goals und KPIs

### 5.1 Business Goals

- **BG-1:** Plugin-Adoption über Power-User-Kreis hinaus ermöglichen durch Setup-Vereinfachung.
- **BG-2:** Token-Kosten pro Strategie-/Recherche-Chat um ~70-75 % reduzieren ohne Qualitätsverlust für Text-Generierung.
- **BG-3:** Plugin-Wartungskosten pro Provider-Release (neues Anthropic/OpenAI-Modell) gegen Null fahren.

### 5.2 User Goals

- **UG-1 (Sebastian):** Strategie-Chats bei ~5 EUR pro Session statt 20 EUR.
- **UG-2 (Sebastian):** Neuer Provider in ≤1 Min konfiguriert.
- **UG-3 (Knowledge-Worker):** Plugin-Setup ohne KI-Modell-Expertise möglich.
- **UG-4 (Enterprise):** Klare Single-Provider-Disziplin pro Session, audit-fähig.

### 5.3 KPIs

**KPI-1: Durchschnittliche Kosten pro Chat-Session (Strategie/Recherche-Typ).**
- Baseline: ~20 EUR (gemessen am 2026-05-15 Strategie-Chat-Beispiel)
- Target: ≤ 5 EUR (75 % Reduktion)
- Messung: `[Cost]`-Log-Aggregation über Chat-Lifecycle
- Pflicht-Filter: nur Chats mit "Auto"-Modus im Dropdown

**KPI-2: Setup-Time pro neuem Provider.**
- Baseline: 5-10 Min (manuelle Modell-Pflege)
- Target: ≤ 1 Min (Provider-Eintrag + API-Key + Auto-Klassifikator)
- Messung: Time-from-Add-Provider-Click-to-First-Successful-Send (Telemetrie)

**KPI-3: Modell-Drift-Latenz (Zeit zwischen Provider-Release und Plugin-Verfügbarkeit).**
- Baseline: 1-3 Monate (manuelle Pflege)
- Target: ≤ 24h für User mit Auto-Refresh (Cache-TTL)
- Messung: Vergleich `last_refresh`-Timestamp mit Anthropic/OpenAI-Release-Datum

**KPI-4: Anteil "Auto"-Modus an allen Chats.**
- Baseline: nicht messbar (existiert noch nicht)
- Target: ≥ 70 % der Chats laufen im Auto-Modus
- Messung: Chat-Dropdown-Value-Telemetrie

**KPI-5: Advisor-Eskalations-Rate.**
- Baseline: 0 (Pattern existiert nicht)
- Target: 5-15 % der Auto-Chats triggern mindestens einen `consult_flagship`-Call
- Messung: Tool-Use-Counter pro Session
- Interpretation: <5 % deutet auf "Sonnet reicht eh" oder "Reminder greift nicht". >20 % deutet auf "mid-Tier zu schwach gewählt" oder "Modell überängstlich".

**KPI-6: Subjektive Qualitäts-Bewertung (qualitativ).**
- Baseline: User-Akzeptanz heute ist hoch für Opus-basierte Chats
- Target: keine spürbare Qualitäts-Regression bei Strategie-/Recherche-Chats
- Messung: User-Feedback, Vergleich gleicher Tasks im Auto-Modus vs Override-Opus

---

## 6. Nordstern, Wow, Anti-Definition

### 6.1 Nordstern

**"Setup einmal, Klugheit automatisch."** Der User konfiguriert einen Provider, das Plugin nutzt ab dann automatisch das richtige Modell für die richtige Aufgabe und gleicht sich mit jedem Provider-Release selbst ab. Der User behält Kontrolle ohne Pflege-Aufwand.

### 6.2 Wow

**Das Plugin ist nach 60 Sekunden Setup voll produktiv und kostet beim ersten Strategie-Chat ein Viertel von dem, was die letzte Version gekostet hat, ohne dass der User irgendwas am Workflow geändert hat.**

Es weiß selbst, wann Opus nötig ist und ruft das Modell für genau die paar Token, die es braucht. Den Rest macht es auf Sonnet, und der User merkt keinen Unterschied außer auf der Rechnung.

### 6.3 Anti-Definition

EPIC-26 ist NICHT:

- Eine Cost-Cap-Feature mit Pause/Stop-Mechanik (User-Wunsch explizit: "Loop optimieren, nicht User unterbrechen")
- Ein 3-Klassen-TaskRouter-Refactoring (verworfen zugunsten Advisor-Pattern)
- Eine Tool-Konsolidierung oder ein Lean-Tool-Mode (mit Sonnet-Hauptloop vernachlässigbar)
- Ein Auto-Pricing-Lookup für unbekannte Modelle (Pricing-Tabelle bleibt statisch, außer OpenRouter)
- Multi-Provider parallel aktiv (bewusst Single-Active-Provider)
- Folder-basierte oder Tag-basierte Memory-Scoping (separate EPICs)

---

## 7. Scope

### 7.1 In-Scope (6 Wellen)

**Welle 1: Advisor-Pattern Engine**
- `consult_flagship`-Tool mit Pflicht-Schema (problem, relevant_context, failed_attempts, constraints)
- 3000-Token-Budget hart gekappt
- Tool wird nur registriert wenn flagship-Tier-Slot belegt ist
- Subtask-Pfad-Reuse (analog FEAT-24-04 research-Profile)
- Per-Task-Limit: 3 Advisor-Calls
- Prompt-Reminder bei `consecutiveMistakes >= 2`

**Welle 2: Tier-Klassifikator + Discovery-Service**
- `ModelTierClassifier`: Pattern-Match (opus/sonnet/haiku/gpt-5/4.1/4o-mini/etc.) + Capability-Fallback
- OpenRouter-Sonderpfad: API-Pricing nutzen
- `ModelDiscoveryService`: 24h-Cache, Stale-Refresh, manueller Refresh-Button
- Edge-Cases: lokale Modelle (Ollama, LMStudio) bleiben manuell

**Welle 3: Provider-only Settings UI**
- Settings-Tab "Models" → "Providers"
- Pro Provider: Enable-Toggle, API-Key oder OAuth-Sign-In, optional BaseURL
- Tier-Mapping-Tabelle (Auto + Override) pro Provider
- "Active Provider"-Selector (Single)
- Custom-Endpoints: pflegbar, Tier-Mapping manuell

**Welle 4: Migration und Backwards-Compat**
- Auto-Migration bei erstem Plugin-Start nach Upgrade
- Notification-Modal informiert User
- Plugin gruppiert vorhandene Modelle nach Provider, klassifiziert in Tiers
- `activeModelKey`-Provider wird als "Active" gesetzt

**Welle 5: Chat-Model-Dropdown ersetzen**
- Dropdown listet "Auto" + Modelle des aktiven Providers
- Override gilt pro Turn
- Bei Override: Advisor-Pattern für diesen Turn deaktiviert
- Kontext bleibt bei Modellwechsel erhalten

**Welle 6: Prompt-Slim**
- `cost-heuristics`-Section auf Lean-Variante kürzen oder konditional rendern
- `plugin-skills`-Directory konditional rendern (nur wenn Skills aktiv)
- `tool-routing`-Section verschlanken

### 7.2 New Persona Candidates (aus Personas-Walk)

Keine neuen Personas. P1 (Sebastian) und P2 (Knowledge-Worker) sind die heutigen Hauptnutzer. P3 (Enterprise) ist Synergy zu EPIC-28 und wird durch EPIC-26 mitvorbereitet.

### 7.3 Out-of-Scope

- Lean-Tool-Mode (irrelevant bei Sonnet-Hauptloop)
- Tool-Konsolidierung (Read-Pair, Discovery-Cluster, Search-Trio)
- 3-Klassen-TaskRouter
- Multi-Provider parallel aktiv (Cross-Provider-Tier-Mapping)
- Hard-Cost-Budget mit User-Pause
- Auto-Pricing-Lookup über OpenRouter als Fallback für unbekannte Modelle
- Cost-Cap-Modal vor Send

### 7.4 Assumptions

- **A-1:** Sonnet 4.6 (oder vergleichbares mid-Tier) liefert für Strategie-/Recherche-Text genauso gute Qualität wie Opus 4.6. **Open:** Empirische Verifikation in der Implementierungs-Phase (Live-Vergleich gleicher Tasks).
- **A-2:** Tier-Klassifikator-Pattern decken >90 % der erscheinenden Modelle ab. Edge-Cases werden über User-Override aufgefangen. **Open:** Test gegen aktuelle Modell-Listen der unterstützten Provider.
- **A-3:** User akzeptiert die "Single Active Provider"-Einschränkung. Multi-Provider-Hedging ist Power-User-Edge-Case, der über Helper-Modell bereits adressierbar ist. **Open:** Validierung nach Release.
- **A-4:** Migration bestehender `activeModels[]`-Configs läuft fehlerfrei für die ~95 % "Standard-Setups". Edge-Cases (Multi-Anthropic mit verschiedenen API-Keys, exotische Custom-Endpoints) werden im Modal explizit markiert. **Open:** Test gegen Sebastians eigenes Setup als realistischen Worst-Case.
- **A-5:** Der Advisor-Mechanismus (Reminder bei consecutiveMistakes + Modell-Autonomie) führt nicht zu Eskalations-Loops oder zu zu seltenen Eskalationen. **Open:** Live-Beobachtung der Eskalations-Rate über die ersten Wochen.

---

## 8. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R-1 | Sonnet liefert spürbar schlechtere Qualität bei Strategie-Chats als Opus | Mittel | Hoch (User-Akzeptanz) | Kein Vorab-Test. Beta-Validation (Sebastian + Beta-Tester nutzen produktiv). Override-Dropdown bleibt (User kann zurück auf Opus). Rollback-Plan: Default-Tier-Setting flipbar von mid auf flagship. |
| R-2 | Tier-Klassifikator klassifiziert ein neues Modell falsch (z.B. Opus 4.7 als mid statt flagship) | Mittel | Mittel | Pattern-First mit Capability-Fallback. User-Override pro Tier-Slot. Telemetrie zeigt Klassifikations-Outliers. |
| R-3 | Migration bestehender activeModels schlägt fehl, User-Setup zerstört | Niedrig | Sehr hoch (User-Vertrauen) | Auto-Backup vor Migration. Modal mit Rollback-Option. Test gegen Sebastians eigenes Setup. |
| R-4 | consult_flagship-Tool wird vom Modell zu oft oder zu selten gerufen | Mittel | Niedrig (Cost-Effekt) | Per-Task-Limit (3 Calls). Telemetrie misst Eskalations-Rate. Prompt-Reminder-Tuning. |
| R-5 | Cache-Invalidation bei Modellwechsel pro Turn macht Override teuer | Niedrig | Niedrig | Erster Turn nach Wechsel zahlt einmalig cache-write. Bei Sonnet ~3 ct. Akzeptabel für User-Kontrolle. |
| R-6 | Discovery-API-Calls beim Plugin-Start verlangsamen Cold-Start | Niedrig | Niedrig | 24h-Cache. Pro Reload nur abgelaufene Provider neu fetchen. Asynchron, blockiert UI nicht. |
| R-7 | User mit Subscription-Provider (Copilot, ChatGPT-Sub) versteht das Mapping zu Tiers nicht | Mittel | Mittel | UI-Hinweise pro Provider ("Subscription deckt Kosten"). Klare Cost-Anzeige im Chat. |
| R-8 | OAuth-Flow für Copilot/ChatGPT-Sub bricht beim Refactor | Niedrig | Hoch | Bestehender OAuth-Code (GitHubCopilotAuthService) bleibt unverändert, nur UI wechselt. Integrations-Tests. |

---

## 9. Constraints

### 9.1 Technische Constraints

- **C-T-1:** Obsidian-Plugin-Sandbox. Plugin kann keine native Subprocess-APIs nutzen. Discovery muss über requestUrl-Wrapper laufen.
- **C-T-2:** Multi-Provider-Support für Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot, ChatGPT-OAuth, Azure, Ollama, LMStudio, Custom. Klassifikator muss für alle robust funktionieren.
- **C-T-3:** Backwards-Compat: Plugin-Update darf nicht alte `activeModels[]`-Configs zerstören. Migration muss fail-safe sein.
- **C-T-4:** Provider-API-Rate-Limits respektieren. 24h-Cache als Default. Refresh nur on-demand oder bei manuellem Trigger.
- **C-T-5:** ReAct-Loop-Kern bleibt unverändert. EPIC-26 ist Default-Routing-Refactor, kein Loop-Engine-Rewrite.

### 9.2 Strategische Constraints

- **C-S-1:** Plugin bleibt MIT-lizenziert und Open-Source-tauglich (Privacy/PII via EPIC-28).
- **C-S-2:** Bewährte EPIC-24-Mechanik (Cache-Marker, Microcompaction) wird nicht angetastet.
- **C-S-3:** EPIC-28 (Privacy & Diagnostics) und EPIC-29 (Cluster-aware Memory) laufen parallel, EPIC-26 darf sie nicht blockieren.

### 9.3 Delivery/Operations

- **C-D-1:** Release als v2.11.0 nach EPIC-24 (v2.10.x).
- **C-D-2:** BRAT-Beta-Phase auf privatem Dev-Repo vor Public-Release (analog v2.5.0-beta).
- **C-D-3:** Live-Messlauf gegen Sebastians produktives Setup vor Public-Release (analog MESSLAUF-EPIC-24).
- **C-D-4:** Notification-Modal beim ersten Start nach Upgrade ist Pflicht. Migration darf nicht silently passieren.

---

## 10. Requirements Overview

Detail-Spezifikationen folgen in der Requirements-Engineering-Phase (`/requirements-engineering`):

- **EPIC-26-Spec:** Hypothesis Statement final, Features als FEAT-26-NN ausarbeiten, Success Criteria je Feature
- **FEAT-26-01:** Advisor-Pattern Engine (`consult_flagship`-Tool, Eskalations-Mechanik, Per-Task-Limit)
- **FEAT-26-02:** Tier-Klassifikator + Discovery-Service
- **FEAT-26-03:** Provider-only Settings UI
- **FEAT-26-04:** Migration und Backwards-Compat
- **FEAT-26-05:** Chat-Model-Dropdown-Refactor
- **FEAT-26-06:** Prompt-Slim
- **ADR-XXX:** Advisor-Pattern statt 3-Tier-Routing
- **ADR-XXX:** Tier-Klassifikator-Strategie (Pattern + Capability)
- **ADR-XXX:** Provider-only Settings-Architektur
- **ADR-XXX:** Migrations-Strategie für `activeModels[]`
- **ADR-115 Amendment:** Helper-Modell-Routing erweitert um Hauptloop-Default

### 10.1 NFR-Prioritäten

1. **Zuverlässigkeit:** Migration darf nicht User-Setup zerstören (Backup + Rollback)
2. **Kostentransparenz:** Sidebar-Cost-Anzeige bleibt akkurat über Modellwechsel
3. **Performance:** Discovery beim Cold-Start blockiert UI nicht
4. **Wartbarkeit:** Klassifikator-Pattern an einem zentralen Ort, leicht erweiterbar
5. **Sichtbarkeit:** User sieht jederzeit auf welchem Tier er gerade läuft

---

## 11. Critical Hypotheses (Validation Targets)

Diese Hypothesen werden in der RE-Phase als Validation-Targets übernommen und in der Coding-Phase live geprüft:

**H-01:** Sonnet 4.6 liefert für Strategie-/Argumentations-Chats subjektiv vergleichbare Qualität wie Opus 4.6. **Validation: in Beta-Phase**. Kein Vorab-Test gegen identische Inputs. EPIC-26 wird in v2.11-Beta released (BRAT auf privatem Dev-Repo), Sebastian und Beta-Tester nutzen das System produktiv, Qualitäts-Feedback fließt vor Public-Release zurück. **Rollback-Plan bei H-01-Fail:** Default-Tier von "mid" auf "flagship" umstellen (Setting), Plugin bleibt funktional, EPIC-26 wird zu einer reinen Setup-Vereinfachung ohne Kosten-Hebel.

**H-02:** Pattern-basierter Tier-Klassifikator deckt >90 % der aktuell verfügbaren Provider-Modelle ab (Anthropic, OpenAI, Google, Bedrock). Validation: Klassifikations-Test gegen `fetchProviderModels()`-Output aller Provider zum Release-Zeitpunkt.

**H-03:** `consult_flagship`-Tool wird vom mid-Tier-Modell selbst gerufen, wenn nötig. Eskalations-Rate liegt zwischen 5-15 % der Auto-Chats. Validation: Telemetrie-Counter über 2 Wochen Live-Use.

**H-04:** Provider-only Settings-UI macht den Setup-Aufwand für neuen Provider auf ≤1 Min senkbar. Validation: Stoppuhr-Test mit Sebastian beim Add-Provider-Flow.

**H-05:** Auto-Migration alter `activeModels[]`-Configs läuft für >95 % der User-Setups fehlerfrei. Validation: Test gegen Sebastians eigenes Multi-Provider-Setup und 2-3 Standard-Setup-Varianten.

**H-06:** User akzeptiert Single-Active-Provider als Standard-Modus, Override-Dropdown im Chat reicht für situative Modell-Wahl. Validation: User-Feedback in Beta-Phase.

---

## 12. Quellen / Referenzen

- **GitHub Issue:** #319 (mit allen QA-Entscheidungen) — https://github.com/pssah4/vault-operator-dev/issues/319
- **EnBW Cowork Codebase:** EnBWAG/enbw-cowork.enbw-open-cowork@develop (Architektur-Analyse 2026-05-15)
- **Vorgänger-BA:** BA-12 Token-Kostenreduktion (FIX-12, EPIC-18)
- **Verwandte Research:** RESEARCH-36 Agent-Loop Cost-Refactoring
- **ADRs:** ADR-115 (Helper Model Routing, 2026-05-13)
- **Strategie-Chat-Analyse:** 2026-05-15 ($20.45-Chat als Trigger-Evidenz)
- **QA-Session:** 2026-05-15 (Decisions-Tabelle im Issue #319)

---

## 13. Status

**Status:** Validated (User-Walkthrough 2026-05-15: P2-Persona als spekulativ markiert, H-01 in Beta-Phase validiert mit Rollback-Plan, übrige Sektionen direkt aus QA-Decisions im Issue #319 übernommen). Bereit für `/requirements-engineering`.
