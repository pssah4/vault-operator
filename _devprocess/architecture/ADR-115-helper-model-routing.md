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

Proposed (Architecture-Pass 2026-05-12, EPIC-24 Welle 3). Triggernde ASR: EPIC-24 / FEAT-24-07; RESEARCH-36 Abschnitt 8 (Hebel H).

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
