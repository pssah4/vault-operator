---
id: ADR-115
title: Internes Hilfs-Modell-Routing fuer Agent-interne LLM-Calls
date: 2026-05-12
deciders: Sebastian + Architekt-Agent
related-features: FEAT-24-07
related-adrs: ADR-11 (Multi-Provider API Architecture), ADR-12 (Context Condensing), ADR-17 (Procedural Recipes), ADR-61 (Fast Path Execution)
related-imps: []
---

# ADR-115: Internes Hilfs-Modell-Routing

## Status

Accepted with Amendment (2026-05-15, EPIC-26 Welle 1, fuer FEAT-26-01).
Vorgaenger-Status: Accepted (Codebase-Reconciliation 2026-05-13, im /coding fuer FEAT-24-07). Proposed (Architecture-Pass 2026-05-12, EPIC-24 Welle 3).
Triggernde ASR: EPIC-24 / FEAT-24-07; EPIC-26 / FEAT-26-01; RESEARCH-36 Abschnitt 8 (Hebel H).

### Amendment 2026-05-15 (EPIC-26 Welle 1): Hauptloop-Default-Tier und Tier-Semantik

EPIC-26 erweitert das Helper-Modell-Konzept aus FEAT-24-07. Bisher routet `helperModelKey` vier interne LLM-Calls (condenseHistory, FastPath planner/presenter, plan_presentation, RecipePromotion) auf ein separat konfiguriertes Hilfs-Modell. Der **Hauptloop** lief weiterhin auf dem `activeModelKey`.

Mit dem Advisor-Pattern (ADR-120) wird der Hauptloop selbst auf ein Tier-konfiguriertes Modell umgestellt. Damit ändert sich die Semantik der bestehenden Modell-Settings:

**Tier-Semantik nach EPIC-26:**

- `fast`-Tier: schnelles, günstiges Modell. Wird von den vier internen LLM-Calls aus FEAT-24-07 genutzt. `helperModelKey` wird semantisch zum fast-Tier-Alias.
- `mid`-Tier: ausgewogenes Modell, Default für den Hauptloop bei "Auto"-Modus im Chat-Dropdown.
- `flagship`-Tier: stärkstes Modell. Wird vom neuen `consult_flagship`-Tool als Eskalations-Ziel genutzt.

**Backwards-Kompatibilität:** `helperModelKey` als explizite Setting-Pfad bleibt erhalten. Die Default-Resolution-Logik wird erweitert:

1. Wenn `providers[activeProviderId].tierMapping.fast` gesetzt ist und EPIC-26 migriert ist: Plugin verwendet das fast-Tier-Modell des aktiven Providers als Helper.
2. Wenn ein expliziter `helperModelKey` gesetzt ist: dieser Override gewinnt (auch nach Migration). User-Wahl bleibt respektiert.
3. Wenn weder Tier-Mapping noch `helperModelKey`: Plugin fällt auf Main-Modell zurück (heutiges Verhalten).

**Subtask-Tier-Inheritance (neu in EPIC-26):**

- Subtasks aus `new_task` ohne expliziten Profile-Override erben das aktuelle Hauptloop-Tier (typisch mid bei Auto-Modus, override-Modell bei explizitem Override).
- Subtasks mit `profile: 'research'` (FEAT-24-04) laufen explizit auf fast-Tier statt nur auf `helperModelKey`. Die research-Mechanik bleibt unverändert, nur die Tier-Quelle wird aktualisiert.
- Subtasks mit `profile: 'advisor'` (neu in FEAT-26-01) laufen auf flagship-Tier mit 3000-Token-Budget.

**Out-of-Scope (bleibt):**

- Memory-Atomizer (`memoryModelKey`) und ChatLinking-Titling (`titlingModelKey`) bleiben eigene Settings. Die EPIC-24-Amendment-Logik (fallback auf `helperModelKey` wenn nicht gesetzt) ist nicht betroffen und greift unverändert.
- `classifyText`-Hook in `main.ts` bleibt out-of-scope (siehe Amendment 2026-05-13).
- ReAct-Hauptloop-Logik selbst bleibt unverändert. Nur die Modell-Auflösung wird durch Tier-Slots erweitert.

**Konsequenzen des Amendments:**

- Settings-Migration in ADR-123 setzt das Tier-Mapping aus dem heutigen `activeModels[]`. Bestehende `helperModelKey`-Settings bleiben erhalten und gewinnen über das fast-Tier-Mapping (Override-Disziplin).
- Plugin-Code-Pfade, die heute `getHelperApi(plugin, fallback)` rufen, brauchen keine Änderung. Die Resolution-Logik wird intern erweitert (zuerst expliziter `helperModelKey`, dann fast-Tier des aktiven Providers, dann Fallback).
- Test-Surface wächst: zusätzlich zur No-Config-Fallback-Logik gibt es jetzt zwei Resolution-Schichten (Tier-Mapping plus explizite Override).

### Amendment 2026-05-13 (PLAN-23 Umsetzung): konkrete Call-Site-Liste, Recipe-Migration, classifyText out-of-scope

Codebase-Recon zeigte ein **bestehendes Pattern** fuer Per-Feature-Model-
Routing: `MemorySettings.memoryModelKey` + `ChatLinkingSettings.titlingModelKey`
sind eigene Settings, die ueber `plugin.getMemoryModel()` /
`plugin.getActiveModel()` zu einem `buildApiHandlerForModel(model)` aufgeloest
werden. Memory-Atomizer, ChatLinking-Titling und Recipe-Promotion nutzen
dieses Pattern bereits. PLAN-23 erweitert die Konvention mit einem
catch-all `helperModelKey`:

**Konkret betroffene Call-Sites (4, nicht 5 -- Recipe ist eine Migration):**

1. `condenseHistory` in `AgentTask.ts` (Haupt-API heute -> helper-routed).
2. `FastPathExecutor` planner + presenter (`createMessage` in einer
   einzigen Stelle -- Such-/Lese-Planner und Presenter teilen einen
   Loop).
3. `plan_presentation` in `PlanPresentationTool.ts` (heute
   `plugin.getActiveModel()` = Haupt; mit helperModelKey wird der
   intern-constraint-LLM-Call auf das Hilfs-Modell geroutet).
4. `RecipePromotionService`-callback in `main.ts` (heute `getMemoryModel`-
   only -> **helper-first, memory-fallback**, main-fallback). Backwards-
   kompatibel: User mit nur `memoryModelKey` setzt weiter Memory-Modell;
   `helperModelKey`-User hat den Helfer als Vorrang.

**Out-of-Scope der PLAN-23-Umsetzung:**

- **Memory-Atomizer / SingleCallExtractor:** nutzt schon `memoryModelKey`,
  separate Domaene (Memory-Extraktion). Bleibt unangetastet.
- **ChatLinking-Titling:** nutzt schon `titlingModelKey`, separate
  Domaene. Bleibt unangetastet.
- **`classifyText`-Hook in `main.ts:830`:** semantisch passt zum Helper-
  Modell, aber separater Pfad (Stufe3 Web-Update-PreFilter). Eigene
  IMP-Row wenn relevant.
- **`hard-limit-recovery` in `AgentTask.ts:1081`:** Output ist
  user-facing ("Deliver your final answer NOW"). Bleibt auf Haupt-Modell
  per ADR-Decision-Driver.
- **Aktive-Skills-Klassifikator:** seit FEAT-24-09 entfallen (kein Call).

**Settings-Eintrag:** `helperModelKey: string` als Top-Level in
`ObsidianAgentSettings` (Geschwister von `activeModelKey`), nicht in
`AdvancedApiSettings`. Begruendung: konsistent mit dem bestehenden
Per-Feature-Pattern (`memoryModelKey` ist in `MemorySettings`,
`titlingModelKey` ist in `ChatLinkingSettings`; ein generischer
`helperModelKey` gehoert als globales Routing-Setting auf die
Top-Ebene). Default: leer (kein Helper -> alle Calls auf Haupt-API).

**Helper-Function:** `getHelperApi(plugin, fallback)` liefert den
Helper-Handler ODER `fallback`. Build-Fehler -> `console.warn` +
fallback. Pro Call-Site: `getHelperApi(plugin, this.api).createMessage(...)`.

## Kontext

Der Agent macht neben dem eigentlichen ReAct-Loop eine Reihe von **internen LLM-Calls**, die der Nutzer nie als Antwort sieht: die Condensing-Zusammenfassung (ADR-12), die Such- und Lese-Planner des Fast Path (ADR-61), den Output-Presenter des Fast Path, den `plan_presentation`-Call der PPTX-Pipeline, den Recipe-Planner und die Active-Skills-Klassifikation. Alle diese Calls laufen heute auf dem **konfigurierten Haupt-Modell** -- also typischerweise einem Frontier-/Premium-Modell (Opus, GPT-5, Sonnet). Das ist teuer und meist unnoetig: Zusammenfassen, Planen aus einer Treffer-Liste, eine Klassifikation -- das sind Aufgaben, fuer die ein Mittelklasse-Modell (Haiku, GPT-5-mini, Gemini Flash) reicht. RESEARCH-36 nennt Model Routing fuer interne Hilfs-Calls als einen der Hebel; in einer langen Session laeuft Condensing mehrfach, und der Fast Path macht pro Task zwei Planner-Calls -- das summiert sich.

Triggernde ASR: EPIC-24 / FEAT-24-07; RESEARCH-36 Abschnitt 8 (Hebel H).

## Decision Drivers

- Interne Hilfs-Calls sollen auf einem guenstigen Modell laufen, ohne dass der Nutzer dafuer manuell zwei Modelle pflegen muss.
- Kein Qualitaetsverlust an den Stellen, wo es zaehlt (der finale Plan-Review oder eine schwierige Synthese darf weiterhin das gute Modell bekommen).
- Robuster Fallback: wenn kein Hilfs-Modell konfiguriert oder es nicht erreichbar ist, faellt alles auf das Haupt-Modell zurueck (nie schlechter als heute).
- Vorhandene Multi-Provider-Infrastruktur (ADR-11) nutzen.

## Considered Options

### Option 1: Status quo -- alle internen Calls auf dem Haupt-Modell

- Pro: kein Aufwand, keine zusaetzliche Konfiguration.
- Con: teuer; Condensing in langen Sessions und die Fast-Path-Planner kosten Frontier-Tarif fuer Aufgaben, die ein Mittelklasse-Modell loest.

### Option 2: Pro internem Call-Typ ein eigenes konfigurierbares Modell

- Pro: maximale Kontrolle.
- Con: Konfigurations-Wildwuchs (sechs-plus Modell-Slots); die meisten Nutzer wollen das nicht.

### Option 3: Ein optionales "Hilfs-Modell" in den Settings, das fuer alle internen Hilfs-Calls verwendet wird; nicht gesetzt -> Haupt-Modell

Ein einziger optionaler Settings-Eintrag ("Hilfs-Modell fuer interne Aufgaben: Condensing, Planung, Klassifikation"). Ist er gesetzt, laufen alle internen Hilfs-Calls darauf. Ist er nicht gesetzt oder das Modell nicht erreichbar, laufen sie wie heute auf dem Haupt-Modell. Eine kleine, klar abgegrenzte Liste von Call-Typen ist betroffen; der eigentliche ReAct-Loop und alles, was der Nutzer als Antwort sieht, bleibt auf dem Haupt-Modell.

- Pro: ein Schalter, kein Wildwuchs; opt-in; robuster Fallback; nutzt ADR-11.
- Con: ein Hilfs-Modell-Slot ist eine grobe Granularitaet -- der finale Plan-Review (wenn der Fast Path ihn als "internen" Call fuehrt) wuerde mit auf dem Hilfs-Modell landen. Mitigation: der finale Plan-Review wird explizit vom "Hilfs-Call"-Set ausgenommen, falls er ueberhaupt als interner Call laeuft.

## Entscheidung

**Option 3.** Ein optionales "Hilfs-Modell" in den Settings. Ist es gesetzt, werden die folgenden Agent-internen LLM-Calls darauf geleitet: Condensing-Zusammenfassung (ADR-12, inklusive Emergency Condensing), Fast-Path-Such-Planner und -Lese-Planner (ADR-61), Fast-Path-Output-Presenter, `plan_presentation` (PPTX-Pipeline), Recipe-Planner (ADR-17), Active-Skills-Klassifikation (sofern die nach ADR-116 ueberhaupt noch existiert). Nicht betroffen: der ReAct-Hauptloop, jeder Call dessen Output der Nutzer als Antwort sieht, und ein etwaiger expliziter finaler Plan-Review (bleibt auf dem Haupt-Modell). Ist das Hilfs-Modell nicht gesetzt oder nicht erreichbar -> Fallback auf das Haupt-Modell, Verhalten wie heute.

## Konsequenzen

### Positiv

- Interne Hilfs-Calls kosten Mittelklasse- statt Frontier-Tarif (Faktor 3-50x je nach Modellwahl); wirkt vor allem in langen Sessions (mehrfaches Condensing) und bei Fast-Path-Tasks (zwei Planner-Calls).
- Opt-in mit einem Schalter; wer es nicht setzt, merkt nichts.
- Robuster Fallback -- nie schlechter als heute.

### Negativ

- Eine zusaetzliche Modell-Konfiguration. Mitigation: optional, ein Schalter, klare Beschreibung welche Calls betroffen sind.
- Grobe Granularitaet (ein Slot fuer alle internen Calls). Akzeptabler Trade-off; feinere Aufteilung waere Konfigurations-Wildwuchs.

### Risiken

- Ein zu schwaches Hilfs-Modell verschlechtert die Condensing-Qualitaet (eine schlechte Zusammenfassung kostet den Agent Orientierung) oder die Planner-Qualitaet (ein schlechter Read-Plan laedt die falschen Dateien). Mitigation: die Beschreibung empfiehlt ein Mittelklasse-Modell (Haiku 4.5, GPT-5-mini, Gemini Flash), kein Budget-Tier; bei beobachteten Problemen kann der Nutzer den Slot leeren (-> Haupt-Modell). Fuer Ollama mit sehr kleinem Kontextfenster ist Condensing ohnehin schon abgeschaltet (analog zur Cowork-Tuning-Logik) -- dort greift das Hilfs-Modell nicht.
- Provider-Mix: das Hilfs-Modell kann bei einem anderen Provider liegen als das Haupt-Modell -- das ist ueber ADR-11 gedeckt, erhoeht aber die Zahl gleichzeitig aktiver Provider-Verbindungen.

## Related Decisions

- ADR-11: Multi-Provider-Architektur -- das Hilfs-Modell wird ueber dieselbe Provider-Abstraktion angesprochen.
- ADR-12 / ADR-61 / ADR-17: die internen Calls, deren Modellwahl hier geroutet wird.

## Implementation Notes (2026-05-12, kann veralten)

Settings: ein optionaler `helperModel`-Eintrag (Provider + Modell-ID, ueber denselben Konfig-Pfad wie das Haupt-Modell). Eine zentrale Hilfsfunktion (z.B. `getHelperApiHandler()`), die den Hilfs-Modell-Handler liefert oder auf den Haupt-Handler zurueckfaellt; die internen Call-Sites (`condenseHistory()` in `AgentTask.ts`, die Planner/Presenter in `FastPathExecutor.ts`, der `plan_presentation`-Call, der Recipe-Planner, ggf. der Active-Skills-Klassifikator) holen den Handler dort statt direkt `this.api`. Diagnose: der `[Cost]`-Log zeigt das Modell pro Call -- interne Calls sollten das Hilfs-Modell zeigen. Verwandt: FEAT-24-07, RESEARCH-36 Abschnitt 8 (Hebel H).
