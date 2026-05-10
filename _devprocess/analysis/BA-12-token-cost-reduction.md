# Business Analysis: Token-Kostenreduktion (FIX-12)

> **Scope:** MVP
> **Erstellt:** 2026-04-04
> **Status:** Updated (2026-05-09: Update-Block fuer Issue #313 / IMP-18-01-01+02)

---

## 1. Executive Summary

### 1.1 Problem Statement

Eine Standard-Aufgabe in Obsilo ("Suche Notizen zu X und erstelle Zusammenfassung")
verbraucht 634.000 Input-Tokens und kostet ~$2.00 via OpenRouter Sonnet 4.6. Bei
GitHub Copilot Sonnet 4.6 scheitert die Aufgabe komplett (183k > 168k Token-Limit).
Das macht das Plugin fuer typische Knowledge-Worker-Tasks wirtschaftlich untragbar
und technisch inkompatibel mit mehreren Providern.

### 1.2 Proposed Solution

Drei komplementaere Hebel die zusammen 80-90% Kostenreduktion erreichen sollen --
ohne Qualitaetsverlust:
1. **Recipe-basierte Batch-Execution** ("Fast Path") -- reduziert LLM-Roundtrips von 8 auf 2
2. **Prompt Caching** -- reduziert Kosten des stabilen System-Prompt-Anteils um 90% (Provider-abhaengig)
3. **Smartere Tool-Ergebnisse** -- bessere Information in weniger Tokens (Qualitaetsverbesserung)

### 1.3 Expected Outcomes

- Token-Verbrauch pro Standard-Task: 634k -> 60-130k (80-90% Reduktion)
- Kosten pro Standard-Task: $2.00 -> $0.15-0.30
- Kompatibilitaet mit 168k-Token-Limit (GitHub Copilot, aeltere Modelle)
- Keine Qualitaetseinbusse bei Agent-Ergebnissen

---

## 2. Business Context

### 2.1 Background

Obsilo ist ein AI-Agent-Plugin fuer Obsidian mit 47 Tools, 48 Plugin-Skills,
Memory-System und Multi-Provider-Unterstuetzung. Der Agent arbeitet in einer
ReAct-Loop: LLM entscheidet pro Iteration welches Tool aufzurufen ist, fuehrt
es aus, und entscheidet erneut. Bei jeder Iteration wird die gesamte bisherige
History (System Prompt + alle vorherigen Tool-Calls + Tool-Results) erneut gesendet.

### 2.2 Current State ("As-Is")

**Token-Verbrauch einer Standard-Aufgabe (gemessen 2026-04-03):**

```
Iteration 1: System Prompt + Tools + User Message          ~28.000 Tokens
Iteration 2: + search_files + semantic_search Results       ~45.000 Tokens
Iteration 3: + 3x read_file Results                         ~62.000 Tokens
Iteration 4-8: + weitere Tool-Calls, Power Steering         ~200.000+ Tokens
─────────────────────────────────────────────────────────────
KUMULATIV (alle API-Calls summiert):                        634.000 Input-Tokens
```

**Kosten-Breakdown (Sonnet 4.6 via OpenRouter, $3/MTok input):**
- System Prompt (25k Tokens x 8 Iterationen = 200k): ~$0.60
- Tool-Definitions (API `tools` Parameter, ~10k x 8 = 80k): ~$0.24
- Tool-Results in History (akkumulierend, ~250k): ~$0.75
- Assistant-Responses in History (~100k): ~$0.30
- Sonstiges (Memory, Skills, Recipes): ~$0.11

**Provider-Kompatibilitaet:**
- GitHub Copilot Sonnet 4.6 (168k Limit): SCHEITERT ab Iteration 4
- OpenRouter Sonnet 4.6 (200k Limit): Funktioniert, aber teuer
- Ollama/LM Studio (lokal): Kosten irrelevant, aber langsam bei 634k

### 2.3 Desired State ("To-Be")

```
Iteration 1: System Prompt + Tools + User Message          ~28.000 Tokens
             (davon 25k via Prompt Caching = 90% guenstiger)
Iteration 2: Recipe-Batch: parallel search + read + write   ~40.000 Tokens
             (smartere Tool-Results: Top-5 statt 50 Matches)
─────────────────────────────────────────────────────────────
KUMULATIV:                                                  ~68.000 Input-Tokens
KOSTEN (mit Prompt Caching):                                ~$0.10-0.20
```

### 2.4 Gap Analysis

| Gap | As-Is | To-Be | Hebel |
|-----|-------|-------|-------|
| Zu viele LLM-Roundtrips | 8 Iterationen | 2 Iterationen | Fast Path |
| System Prompt wird 8x berechnet | Volle Kosten jedes Mal | 90% Rabatt ab 2. Mal | Prompt Caching |
| Aufgeblaehte Search-Results | 50 Matches, volle Pfad-Listen | Top-5 mit Score + Excerpt | Smartere Results |
| Tool-Results akkumulieren unkomprimiert | Volle Dateien in History | Nur relevante Abschnitte | Smartere Results |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Beduerfnisse |
|-------------|------|----------|-----------|--------------|
| Obsilo-User (Endanwender) | Primaernutzer | H | H | Schnelle, guenstige, qualitativ hochwertige Antworten |
| Plugin-Entwickler (Sebastian) | Product Owner | H | H | Wirtschaftlich tragfaehiges Plugin, breite Provider-Kompatibilitaet |
| API-Provider (Anthropic, OpenAI, etc.) | Infrastruktur | M | M | Faire Nutzung, keine Abuse-Patterns |
| Obsidian Community | Oekosystem | M | L | Verlaessliches Plugin ohne uebertriebene API-Kosten |

### 3.2 Key Stakeholders

**Primary:** Plugin-Entwickler und Endanwender (Kosten betreffen beide direkt)
**Secondary:** API-Provider (Caching-Features muessen korrekt genutzt werden)

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: Knowledge Worker**
- **Rolle:** Wissensarbeiter, Forscher, Student
- **Ziele:** Vault-Inhalte effizient organisieren und synthetisieren
- **Pain Points:** $2 pro "Suche und fasse zusammen" ist nicht tragbar bei 10+ Tasks/Tag
- **Nutzungshaeufigkeit:** Daily (5-20 Interaktionen)
- **Budget-Sensitivitaet:** Hoch -- erwartet <$0.50/Tag oder Flat-Rate via Copilot

**Persona 2: Power User / Selbststaendiger**
- **Rolle:** Content Creator, Berater, Lehrer
- **Ziele:** Automatisierte Workflows fuer repetitive Vault-Tasks
- **Pain Points:** Token-Overflow crasht bei GitHub Copilot, muss auf teurere Provider wechseln
- **Nutzungshaeufigkeit:** Daily (20-50 Interaktionen)
- **Budget-Sensitivitaet:** Mittel -- zahlt fuer Qualitaet, aber nicht 10x zu viel

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Jede Iteration der Agent-Loop sendet den GESAMTEN bisherigen Kontext erneut an die API:
System Prompt (25k Tokens) + Tool-Definitionen (10k) + alle bisherigen Messages + alle
bisherigen Tool-Results. Bei 8 Iterationen wird der System Prompt 8x berechnet und bezahlt.
Die Tool-Results akkumulieren ohne Kompression in der History.

### 5.2 Root Causes

1. **Architektur der ReAct-Loop:** Jede Iteration ist ein unabhaengiger API-Call mit
   voller History. Das ist das Standard-Pattern fuer LLM-Agenten, aber teuer.

2. **Keine Parallelisierung von Tool-Calls bei bekannten Patterns:** Der Agent entscheidet
   pro Iteration ein Tool (oder parallele Tools gleicher Gruppe). Bei bekannten Workflows
   (z.B. "suche, lies, schreibe") koennte er alle Schritte vorab planen und in weniger
   Iterationen ausfuehren.

3. **Kein Prompt Caching implementiert:** Die Anthropic/OpenAI/DeepSeek APIs bieten
   explizites Prompt Caching an, das den stabilen System-Prompt-Anteil um 90% guenstiger
   macht. Obsilo nutzt das nicht.

4. **Unkomprimierte Tool-Results:** `search_files` gibt bis zu 50 Matches zurueck,
   `semantic_search` gibt 10 Ergebnisse mit je 2.000 Zeichen Excerpt. Diese bleiben
   vollstaendig in der History, auch wenn nur 3 Treffer relevant waren.

### 5.3 Impact

- **Business Impact:** Plugin wird als "zu teuer" wahrgenommen. User mit
  GitHub Copilot (168k Limit) koennen Standard-Tasks nicht ausfuehren.
  Potenzielle Nutzer wechseln zu Konkurrenzprodukten.
- **User Impact:** Frustration bei Token-Overflow-Fehlern. Angst vor
  Kosten-Ueberraschungen. Einschraenkung auf triviale Tasks.

---

## 6. Goals & Objectives

### 6.1 Business Goals

- Obsilo wirtschaftlich tragfaehig fuer taegliche Nutzung (5-20 Tasks/Tag < $1)
- Kompatibel mit allen gaengigen Providern inkl. 168k-Limit-Modelle
- Qualitaet der Agent-Ergebnisse bleibt identisch oder verbessert sich

### 6.2 User Goals

- Standard-Tasks (Suche+Zusammenfassung) in <30 Sekunden und <$0.10
- Keine Token-Overflow-Fehler bei Standard-Aufgaben
- Gleiche oder bessere Ergebnisqualitaet

### 6.3 Success Metrics (KPIs)

| KPI | Baseline (Ist) | Target (Soll) | Timeframe |
|-----|----------------|----------------|-----------|
| Input-Tokens pro Standard-Task | 634.000 | <130.000 | 4 Wochen |
| Kosten pro Standard-Task (Sonnet 4.6) | $2.00 | <$0.30 | 4 Wochen |
| LLM-Iterationen pro Standard-Task | 8 | 2-3 | 4 Wochen |
| Kompatibilitaet 168k-Modelle | Scheitert | Funktioniert | 4 Wochen |
| Qualitaets-Regression | -- | 0 (keine) | Immer |

---

## 7. Scope Definition

### 7.1 In Scope

- **Hebel 1: Recipe-basierte Batch-Execution ("Fast Path")**
  - Wenn ein Recipe matcht: Tool-Calls direkt in der Pipeline ausfuehren
  - Mindestens 1 LLM-Call fuer Parameterisierung, dann deterministische Ausfuehrung
  - Parallele Tool-Ausfuehrung wo sicher (read-tools)

- **Hebel 2: Prompt Caching**
  - Anthropic API: `cache_control` Breakpoints fuer System Prompt
  - OpenAI API: Automatisches Prefix-Caching nutzen (stabile Prompt-Reihenfolge)
  - Provider-Detection: Caching nur aktivieren wo unterstuetzt
  - Fallback: Normale Calls wo Caching nicht verfuegbar

- **Hebel 3: Smartere Tool-Ergebnisse**
  - search_files: Top-Treffer mit Relevanz-Score statt 50 Pfad-Listen
  - semantic_search: Kuerzere, gezieltere Excerpts
  - read_file: Optional Heading-basiertes Partial-Read
  - Bestehende Truncation-Limits intelligenter nutzen

### 7.2 Out of Scope

- Modell-Distillation (eigenes kleineres Modell trainieren)
- Grundlegende Aenderung der Agent-Loop-Architektur
- Qualitaetskompromisse (weniger Tools, kuerzere Prompts die zu Fehlern fuehren)
- Prompt-Kompression (Zusammenfassen des System Prompts -- zu riskant)
- Deferred Tool Loading als Standalone (nur in Kombination mit Fast Path sinnvoll)

### 7.3 Assumptions

- Prompt Caching bei Anthropic/OpenAI ist stabil und zuverlaessig
- Recipe-Matching (ADR-58) erkennt wiederkehrende Patterns zuverlaessig
- Parallele Tool-Ausfuehrung (read-safe Tools) ist bereits implementiert
- Die meisten Standard-Tasks folgen bekannten Patterns (search -> read -> write)

### 7.4 Constraints

- **Keine Qualitaetskompromisse** -- Agent-Ergebnisse muessen identisch oder besser sein
- **Multi-Provider-Kompatibilitaet** -- Loesung muss mit/ohne Caching-Support funktionieren
- **Bestehende Architektur** -- AgentTask, ToolExecutionPipeline, ReAct-Loop bleiben
- **Review-Bot-Compliance** -- Keine neuen Obsidian-API-Verst??sse

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Fast Path waehlt falsche Tools (Recipe passt nicht exakt) | M | H | Fallback auf normale ReAct-Loop wenn Fast Path scheitert |
| Prompt Caching invalidiert zu oft (dynamische Sections) | M | M | Stabile Sections zuerst, dynamische danach (Cache-Prefix-Optimierung) |
| Smartere Results filtern relevante Treffer weg | L | H | A/B-Test: vergleiche Result-Qualitaet vor/nach Optimierung |
| Fast Path funktioniert nur fuer wenige Patterns | M | M | Graceful Degradation: unbekannte Tasks nutzen normale Loop |
| Provider-spezifische Caching-Bugs | L | M | Provider-Detection + Fallback |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

**FR-1: Fast Path Execution**
- System erkennt wenn ein Recipe fuer den User-Intent existiert
- System fuehrt Recipe-Steps als Batch aus (minimale LLM-Roundtrips)
- System faellt auf normale ReAct-Loop zurueck bei Fehlern
- User sieht keinen Unterschied im Ergebnis

**FR-2: Prompt Caching**
- System nutzt Provider-spezifisches Prompt Caching wo verfuegbar
- System ordnet Prompt-Sections so dass der stabile Anteil maximiert wird
- System funktioniert identisch mit und ohne Caching-Support

**FR-3: Smartere Tool-Ergebnisse**
- search_files liefert Top-N mit Relevanz statt alle Matches bis 50
- semantic_search liefert kompaktere, relevantere Excerpts
- Tool-Results in History werden komprimiert (Zusammenfassung statt Roh-Output)

### 9.2 Non-Functional Requirements (Summary)

- **Performance:** Standard-Task Latenz gleich oder besser (weniger Roundtrips = schneller)
- **Qualitaet:** Keine messbaren Regressionen bei Agent-Ergebnissen
- **Kosten:** 80-90% Reduktion der Token-Kosten
- **Kompatibilitaet:** Funktioniert mit allen konfigurierten Providern

### 9.3 Key Features (fuer RE)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | Fast Path Execution | Recipe-gesteuerte Batch-Ausfuehrung mit Fallback |
| P0 | Prompt Caching (Anthropic) | cache_control Breakpoints fuer System Prompt |
| P1 | Prompt Caching (OpenAI/DeepSeek) | Prefix-Caching-Optimierung |
| P1 | Search-Result Kompression | Top-N statt 50, mit Relevanz-Score |
| P2 | Tool-Result Summarization | Komprimierte Results in History |
| P2 | Partial File Read | Heading-basiertes read_file |

---

## 10. Next Steps

- [x] Review durch Stakeholder (Sebastian)
- [x] Uebergabe an Requirements Engineer: /requirements-engineering
- [x] Architecture: ADRs fuer Fast Path, Caching, Result-Kompression (ADR-58, ADR-61, ADR-62, ADR-63)

---

## 11. Update-Block: Issue #313 -- Provider-Coverage Gap (2026-05-09)

> **Trigger:** GitHub Issue [#313](https://github.com/pssah4/obsilo-dev/issues/313) "Prompt Caching Settings"
> **Bezug:** FEAT-18-01 (Done/Released), ADR-62 (Accepted)
> **Folge-Items:** IMP-18-01-01 (Settings & Default), IMP-18-01-02 (Provider-Implementierungen)

### 11.1 Was wurde mit FEAT-18-01 tatsaechlich ausgeliefert

FEAT-18-01 hat die in Section 7.1 versprochene Architektur teilweise eingeloest. Was steht:
- Anthropic-Provider setzt `cache_control: ephemeral` auf System Prompt + letzte User-Message ([anthropic.ts:60-90](../../src/api/providers/anthropic.ts#L60-L90))
- Settings-Feld `promptCachingEnabled` in `CustomModel` und `LLMProvider` ([settings.ts:32, 231](../../src/types/settings.ts#L32))
- Wiring von Settings bis API-Call funktioniert ([settings.ts:261](../../src/types/settings.ts#L261))
- KV-Cache-optimierte Prompt-Reihenfolge (DateTime ans Ende, ADR-62)

Was nicht oder nur partiell umgesetzt wurde:
- **OpenAI/DeepSeek (P1 in Section 9.3):** weder `cache_control` noch `cached_tokens`-Tracking.
- **UI-Toggle ist provider-hardcoded:** nur sichtbar fuer Anthropic + Copilot/Claude ([ModelConfigModal.ts:561](../../src/ui/settings/ModelConfigModal.ts#L561)). Das Adapter-Pattern aus Success Criterion SC-04 ist im Provider-Code, aber nicht im Settings-UI angekommen.
- **Default off:** Modal-Init ist `false` ([ModelConfigModal.ts:152](../../src/ui/settings/ModelConfigModal.ts#L152)), `undefined` wird als off interpretiert. Das verletzt SC-03 ("Zero-Config -- automatische Aktivierung bei kompatiblem Provider"): User muss aktiv klicken, sonst ist auch bei Anthropic kein Caching aktiv.
- **Bedrock:** liest `cacheReadInputTokens`/`cacheWriteInputTokens` aus der Response, setzt selbst aber keine cachePoint-Marker im Request. Effekt: Bedrock-User zahlen die volle Anthropic-Bedrock-Rate ohne Cache-Rabatt.

### 11.2 Aktualisierter Gap (Update zu 2.4)

| Gap | Heute | Ziel | Hebel |
|-----|-------|------|-------|
| Default-Verhalten verletzt SC-03 | Toggle Default off, User-Aktion noetig | Default on (`undefined === true`) | IMP-18-01-01 |
| UI-Visibility provider-hardcoded | nur Anthropic + Copilot-Claude | Capability-Flag pro Modell (`ModelInfo.supportsPromptCache`) | IMP-18-01-01 |
| OpenAI cached_tokens nicht getrackt | Usage-Block ignoriert Cache-Felder | Usage liest `cached_tokens`, Cost-Berechnung beruecksichtigt Rabatt | IMP-18-01-02 |
| Bedrock setzt keine cachePoints | Volle Kosten trotz Caching-faehigem Modell | Explizite cachePoint-Marker im Request-Body | IMP-18-01-02 |
| Kilo Gateway / OpenRouter: cache_control nicht durchgereicht | Anthropic-via-Gateway zahlt voll | `cache_control` passthrough im Request | IMP-18-01-02 |

### 11.3 Aktualisierte Persona-Sicht

Persona 1 (Knowledge Worker) und Persona 2 (Power User) bleiben unveraendert. Neue Sub-Beobachtung:

- **Bedrock-User (Sub-Persona Power User):** Enterprise-Kunden mit AWS-Compliance-Pflicht koennen Anthropic-Modelle nur ueber Bedrock nutzen. Aktuell zahlen sie **die volle Bedrock-Rate** (Anthropic-via-Bedrock), obwohl Bedrock Caching unterstuetzt. Wirtschaftlicher Impact identisch zu Direkt-Anthropic-Usern, aber technisch nicht aktivierbar.
- **OpenAI-User (Sub-Persona Knowledge Worker):** OpenAI cached implizit ab >1024 Tokens. Der Rabatt (50% auf cached prefix) faellt zwar auf Provider-Seite an, aber Obsilo zeigt es weder im Token-Tracking noch in Cost-Schaetzungen. User glauben, kein Caching zu haben, weil das UI nichts dazu sagt.

### 11.4 Neue Hypothesen (zur Validierung in Phase RE/Coding/Live-Test)

- **H-313-1 (Default-Switch ist sicher):** Der Wechsel von Default off auf Default on fuegt keinen User-Schaden zu, weil bei Anthropic der Cache-Write-Aufpreis (+25%) durch den ersten Cache-Read bereits amortisiert ist (ADR-62 Praemisse). **Falsifikation:** Mehr als 5% der bestehenden User berichten unerwartete Kostensteigerung in den ersten 14 Tagen nach Release.
- **H-313-2 (Capability-Flag deckt alle relevanten Provider ab):** Ein einzelnes `ModelInfo.supportsPromptCache: boolean`-Flag pro Provider/Modell genuegt fuer die UI-Visibility-Entscheidung. Provider-spezifische Sub-Modi (Anthropic ephemeral vs. OpenAI implicit vs. Bedrock cachePoint) sind im Provider-Code gekapselt. **Falsifikation:** Wir brauchen mehr als ein Boolean (z.B. enum oder discriminated union), bevor Phase 2 fertig ist.
- **H-313-3 (Bedrock cachePoints liefern messbar Rabatt):** Anthropic-Modelle auf Bedrock liefern bei aktivem cachePoint-Marker einen messbaren `cacheReadInputTokens`-Wert >0 in der naechsten Iteration. **Falsifikation:** cachePoint-Marker werden gesetzt, aber Bedrock meldet weiter `cacheReadInputTokens: 0` (Modell-spezifische Einschraenkung). Mitigation in dem Fall: Toggle-Visibility per Modell, nicht per Provider.

### 11.5 Aktualisierte KPIs (Erweiterung zu Section 6.3)

| KPI | Baseline (heute) | Target (nach IMP-18-01-01+02) | Timeframe |
|-----|------------------|-------------------------------|-----------|
| Anteil User mit aktivem Prompt Cache (alle Provider) | unbekannt, vermutlich <30% | >90% (Default on) | 14 Tage nach Release |
| Cache-Hit-Rate sichtbar im UI bei OpenAI-Usern | 0% (keine Anzeige) | 100% (cached_tokens im Token-Counter) | mit IMP-18-01-02 |
| Bedrock-Token-Kosten pro Standard-Task (Anthropic-Modell auf Bedrock) | wie ohne Cache | -50 bis -90% wie Direkt-Anthropic | mit IMP-18-01-02 |
| Anzahl Provider mit Caching-Support im UI | 1 (Anthropic) + 1 (Copilot/Claude) | mind. 4 (Anthropic, Bedrock, OpenAI, Kilo Gateway) | mit IMP-18-01-01 |

### 11.6 Aktualisierter Scope (Erweiterung zu Section 7.1)

**In Scope (IMP-18-01-01, Phase 1 -- Settings & Default):**
- Default `promptCachingEnabled` auf `true` umstellen via Laufzeit-Interpretation (`undefined === true`), keine Daten-Migration
- Neues Capability-Flag `ModelInfo.supportsPromptCache: boolean` pro Provider/Modell
- UI-Toggle in `ModelConfigModal` an dieses Flag knuepfen, nicht mehr an provider-spezifische Strings
- Tooltip im UI mit kurzem Hinweis auf Cache-Write-Aufpreis (+25% bei Anthropic) und Default-Empfehlung

**In Scope (IMP-18-01-02, Phase 2 -- Provider-Implementierungen):**
- Bedrock: explizite `cachePoint`-Marker im `ConverseStream`-Request fuer Anthropic-Modelle
- OpenAI: `cached_tokens` aus `usage.prompt_tokens_details.cached_tokens` in Token-Tracking aufnehmen, in Cost-Schaetzung beruecksichtigen
- Kilo Gateway: `cache_control` Marker im Anthropic-formatierten Request passthrough
- OpenRouter (sofern via Kilo Gateway oder direkt): identisches Passthrough-Verhalten

**Out of Scope:**
- GitHub Copilot Provider: kein offizielles Prompt-Caching dokumentiert. Toggle ausgeblendet.
- ChatGPT-OAuth Provider: nutzt inoffizielle Backend-API, Cache-Verhalten undokumentiert. Toggle ausgeblendet.
- Gemini Context Caching (TTL-basiert, eigener Mechanismus): bleibt deferred wie in FEAT-18-01 Out-of-Scope vermerkt.
- Cache-TTL-Konfiguration ueber UI (z.B. OpenAI `prompt_cache_retention: "24h"`): Phase 3, nicht Teil dieser Iteration.
- Daten-Migration der bestehenden `data.json`-Configs: ueberfluessig, weil `undefined === true` zur Laufzeit interpretiert wird.

### 11.7 Aktualisierte Risiken (Erweiterung zu Section 8)

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Default-on ueberrascht User mit erstem Cache-Write-Aufpreis (+25%) | M | L | Tooltip in Settings + Release-Notes mit klarem Hinweis |
| Capability-Flag wird falsch gesetzt (z.B. supportsPromptCache=true bei Modell ohne Support) | M | M | Default-Wert konservativ (false), pro Modell explizit pflegen |
| Bedrock cachePoint-Implementierung ist modellspezifisch und nicht vollstaendig stabil | M | M | Live-Test mit Claude-Sonnet-on-Bedrock vor Release, Fallback auf "Toggle aus" wenn `cacheReadInputTokens: 0` ueber 5 Iterationen bleibt |
| OpenAI cached_tokens nur fuer bestimmte Modellfamilien verfuegbar (gpt-4o, 4.1, o1) | L | L | Nur tracken wenn Feld vorhanden, kein Fehler bei undefined |

### 11.8 Verworfene Alternativen

- **Alternative A (Daten-Migration der bestehenden Configs):** Verworfen, weil `undefined === true` zur Laufzeit funktional aequivalent ist und keine Schreib-Pfade fuer Settings-Daten beruehrt. Reduziert Migrations-Risiko auf 0.
- **Alternative B (Drei-Wert-Toggle: ein/aus/auto):** Verworfen, weil "auto" semantisch identisch zu "ein" ist (Provider entscheidet selbst, ob Cache wirkt). Zwei Werte reichen.
- **Alternative C (Globaler Default-Switch in Plugin-Settings statt pro Modell):** Verworfen, weil unterschiedliche Provider unterschiedliche Cost-Profile haben (Bedrock-Kunden mit AWS-Vertrag vs. OpenAI-Pay-as-you-go). Pro-Modell-Toggle ist die richtige Granularitaet.

---

## Appendix

### A. Glossar

- **Fast Path:** Deterministische Tool-Ausfuehrung basierend auf gelerntem Recipe,
  ohne iterative LLM-Entscheidung pro Tool-Call
- **Prompt Caching:** Provider-Feature das wiederholte identische Prompt-Prefixe
  guenstiger berechnet (Anthropic: 90% Rabatt, OpenAI: 50%)
- **ReAct-Loop:** Reasoning-Action-Loop -- Agent entscheidet iterativ
  (LLM-Call -> Tool-Call -> LLM-Call -> ...)
- **Batch-Execution:** Mehrere Tool-Calls in einer Iteration statt ueber mehrere

### B. Messdaten (Systemtest 2026-04-03/04)

- Task: "Suche meine Notizen zum Thema Kant und erstelle eine Zusammenfassung"
- Provider: OpenRouter Sonnet 4.6 ($3/MTok input, $15/MTok output)
- Input-Tokens: 634.123
- Output-Tokens: 2.755
- Kosten: ~$2.00
- Iterationen: 8 (search, search, read, read, read, search, write, open)
- Bei GitHub Copilot Sonnet 4.6: Scheitert mit 183.820 > 168.000 Token-Limit

### C. References

- FIX-12 im Backlog: `_devprocess/context/BACKLOG.md`
- ADR-58: Semantic Recipe Promotion (Grundlage fuer Fast Path)
- FEAT-16-00: Deferred Tool Loading (geplant, wird durch Fast Path teilweise ersetzt)
- Anthropic Prompt Caching Docs: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
