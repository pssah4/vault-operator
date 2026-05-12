---
id: ADR-114
title: Autonomie-Governance -- Token-/Kosten-Budget pro Task, Steering-Hook, Exploration-Limits
date: 2026-05-12
deciders: Sebastian + Architekt-Agent
related-features: FEAT-24-08
related-adrs: ADR-01 (Zentrale ToolExecutionPipeline), ADR-06 (Sliding Window fuer Tool-Repetition), ADR-12 (Context Condensing), ADR-113 (Subagent-Delegation, Per-Call-Budget)
related-imps: []
---

# ADR-114: Autonomie-Governance

## Status

Proposed (Architecture-Pass 2026-05-12, EPIC-24 Welle 3). Triggernde ASR: EPIC-24 / FEAT-24-08; RESEARCH-36 Abschnitt 8 (Hebel G).

## Kontext

Der Agent hat heute zwei Bremsen gegen Entgleisen: einen Iterations-Cap (Default 25, plus ein Soft-Limit bei 60 % davon) und einen Wiederholungs-Detektor (ADR-06). Was fehlt:

- **Kein kumulatives Token-/Kosten-Budget pro Task.** Ein Iterations-Cap deckelt die Anzahl der Schleifendurchlaeufe, nicht den Aufwand pro Durchlauf. Ein einzelner Turn, der vier grosse Dateien liest und dann durch fuenf Iterationen mit der angehaeuften History weiterlaeuft, liegt innerhalb von 25 Iterationen, kostet aber 100k-plus Tokens. Beobachtet: der Ausloeser-Chat verbrannte rund 42 EUR (UI-Anzeige) ueber sechs Turns, ohne dass jemals ein Limit gegriffen haette.
- **Kein Steering-Hook.** Wenn der Agent erkennbar in eine Sackgasse laeuft (eine URL raten, die nicht existiert; immer wieder dasselbe Tool mit leicht variierten Argumenten), kann der Nutzer heute nur abbrechen, nicht korrigierend eingreifen, ohne den Lauf zu verlieren. Claude Code laesst zwischen Iterationen einen korrigierenden Prompt einschmuggeln; Cowork bricht lange Subtasks per Token-Budget ab.
- **Keine Exploration-Limits.** Ein Agent mit vagem Auftrag kann beliebig viele Dateien oder APIs durchgehen, bevor er etwas tut -- jede dieser explorativen Schleifen ist ein voller Kontext-Durchlauf.

Triggernde ASR: EPIC-24 / FEAT-24-08; RESEARCH-36 Abschnitt 8 (Hebel G).

## Decision Drivers

- Ein Runaway-Lauf darf nicht unbemerkt ein Vielfaches der erwarteten Kosten verbrennen.
- Der Nutzer soll korrigieren koennen, ohne den Lauf abzubrechen.
- Default-Verhalten darf nicht stoeren: einfache Aufgaben sollen ungebremst durchlaufen; Limits greifen erst, wenn etwas auffaellig wird.
- Vorhandene Mechanik nutzen (Iterations-Cap, Token-Schaetzung aus ADR-12, Per-Call-Budget aus ADR-113), nicht parallel neu bauen.

## Considered Options

### Option 1: Status quo -- Iterations-Cap plus Soft-Limit, sonst nichts

- Pro: kein Aufwand.
- Con: deckelt nur die Iterationszahl, nicht den Aufwand; kein Steering; ein teurer Turn bleibt teuer.

### Option 2: Hartes Token-Budget pro Task mit Abbruch

Bei Ueberschreitung eines Token-/Kosten-Budgets bricht der Lauf ab.

- Pro: deckelt den Aufwand zuverlaessig.
- Con: ein harter Abbruch mitten in einer mehrteiligen Aufgabe verliert Arbeit; der Nutzer haette vielleicht "ja, mach weiter" gesagt.

### Option 3: Token-/Kosten-Budget pro Task mit Pause und Rueckfrage, plus Steering-Hook, plus Exploration-Limit

Bei Ueberschreitung eines konfigurierbaren Token-/Kosten-Budgets pausiert der Lauf und fragt den Nutzer ("Du naeherst dich X EUR / X Tokens. Weitermachen / Limit erhoehen / abbrechen?"). Zusaetzlich ein Steering-Hook: zwischen zwei Iterationen kann der Nutzer einen korrigierenden Prompt einschieben, der beim naechsten Tool-Result-Schritt eingespeist wird. Plus ein weiches Exploration-Limit: nach N reinen Lese-/Such-Aufrufen ohne produktiven Schritt ein Hinweis an den Agent ("du hast viel exploriert, fokussiere oder spawne einen Subtask").

- Pro: deckelt den Aufwand, ohne Arbeit zu verlieren; der Nutzer behaelt die Kontrolle; das Steering loest Sackgassen ohne Abbruch; das Exploration-Limit greift den Recherche-im-Hauptkontext-Fall an (vgl. ADR-113).
- Con: drei Mechaniken statt einer; Schwellwerte muessen gut gewaehlt sein, sonst nervt die Rueckfrage.

## Entscheidung

**Option 3.** Drei additive Mechaniken, alle defaultseitig grosszuegig parametrisiert:

- **Token-/Kosten-Budget pro Task** (konfigurierbar, mit sinnvollem Default und einer Warnschwelle darunter): die kumulierte Token-/Kosten-Zahl des laufenden Tasks wird mitgefuehrt (die Daten dafuer kommen aus den `usage`-Chunks, die der Agent ohnehin akkumuliert). Beim Ueberschreiten der Warnschwelle pausiert der Lauf und fragt den Nutzer (weitermachen / Limit fuer diesen Task erhoehen / abbrechen). Subtasks zaehlen auf das Task-Budget mit anteilig (das Per-Call-Budget aus ADR-113 bleibt eine zusaetzliche, engere Grenze fuer den einzelnen Subtask-Aufruf).
- **Steering-Hook:** zwischen zwei Loop-Iterationen kann ein vom Nutzer eingegebener korrigierender Text als zusaetzliche User-Message vor dem naechsten Iterationsschritt eingespeist werden, ohne den Lauf abzubrechen.
- **Weiches Exploration-Limit:** nach N aufeinanderfolgenden reinen Lese-/Such-Aufrufen ohne produktiven Schritt (Edit, finale Antwort, Subtask-Spawn) bekommt der Agent einen Hinweis, zu fokussieren oder die Recherche in einen Subtask zu delegieren (ADR-113). Kein Abbruch, nur ein Steuerimpuls.

Defaults so gewaehlt, dass einfache Aufgaben (ein bis drei Iterationen, wenig Tokens) nie ein Limit beruehren -- die Mechaniken greifen erst, wenn ein Lauf auffaellig wird.

## Konsequenzen

### Positiv

- Ein Runaway-Lauf verbrennt nicht mehr unbemerkt ein Vielfaches der erwarteten Kosten -- der Nutzer wird vorher gefragt.
- Sackgassen lassen sich ohne Abbruch korrigieren (Steering).
- Das Exploration-Limit verstaerkt die Subtask-Delegation aus ADR-113.
- Nutzt vorhandene Bausteine (Iterations-Cap, `usage`-Akkumulation, Token-Schaetzung aus ADR-12).

### Negativ

- Drei zusaetzliche Mechaniken erhoehen die Konfigurationsflaeche. Mitigation: vernuenftige Defaults, die meisten Nutzer fassen sie nie an.
- Zu enge Schwellwerte fuehren zu nervigen Rueckfragen. Mitigation: grosszuegige Defaults; die Warnschwelle ist konfigurierbar; bei Ueberschreitung "Limit fuer diesen Task erhoehen" als erste Option.

### Risiken

- Das Steering-Hook erfordert eine UI-Eingriffsmoeglichkeit waehrend ein Lauf laeuft -- die Sidebar hat heute keinen Mechanismus dafuer. Mitigation: minimaler Einstieg (ein Textfeld, das die naechste Iteration aufnimmt); kann spaeter ausgebaut werden.
- Das Per-Task-Budget braucht eine verlaessliche kumulierte Token-Zahl auch dann, wenn die Kostenanzeige der openai-Familie cached_tokens heute nicht abzieht (siehe IMP-18-01-02 / ADR-62-Amendment). Solange das offen ist, ueberschaetzt das Budget tendenziell -- akzeptabel, eher konservativ, und wird mit IMP-18-01-02 korrekt.

## Related Decisions

- ADR-12: die Token-Schaetzung und die Condensing-Trigger nutzt das Budget mit.
- ADR-06: der Wiederholungs-Detektor ist eine engere, automatische Bremse; das Exploration-Limit ist die breitere.
- ADR-113: das Per-Call-Budget fuer Subtasks ist eine engere Grenze unter dem Task-Budget; das Exploration-Limit verweist auf die Subtask-Delegation.

## Implementation Notes (2026-05-12, kann veralten)

Token-/Kosten-Akkumulation und Budget-Check in `src/core/AgentTask.ts` (dort, wo heute `totalInputTokens`/`totalOutputTokens` und der Iterations-Cap leben); die Pause-und-Rueckfrage ueber den bestehenden `askQuestion`/Approval-Callback-Pfad (`ToolExecutionContext`). Steering-Hook: ein Eingabepfad von der Sidebar in den laufenden `AgentTask` (neuer Callback, der zwischen Iterationen geprueft wird). Exploration-Limit: ein Zaehler im Loop, der bei reinen read-/search-Tool-Calls hochzaehlt und bei einem produktiven Schritt zurueckgesetzt wird; bei Schwellwert eine zusaetzliche User-Message mit dem Hinweis. Settings: `taskTokenBudget` / `taskCostBudgetEur` / `taskBudgetWarnRatio` / `explorationLimit`. Diagnose: `[InputBreakdown]` und der kumulierte `[Cost]`-Log. Verwandt: FEAT-24-08, ADR-113, RESEARCH-36 Abschnitt 8 (Hebel G), Claude Code (Steering zwischen Iterationen), EnBW Cowork (Subtask-Token-Budget).
