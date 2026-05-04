# Business Analysis: Token-Kostenreduktion (FIX-12)

> **Scope:** MVP
> **Erstellt:** 2026-04-04
> **Status:** Draft

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

- [ ] Review durch Stakeholder (Sebastian)
- [ ] Uebergabe an Requirements Engineer: /requirements-engineering
- [ ] Architecture: ADRs fuer Fast Path, Caching, Result-Kompression

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
