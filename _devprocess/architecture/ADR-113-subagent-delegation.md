---
id: ADR-113
title: Subagent-Delegation fuer context-heavy Teilaufgaben (model-getrieben, Per-Call-Token-Budget)
date: 2026-05-12
deciders: Sebastian + Architekt-Agent
related-features: FEAT-24-04
related-adrs: ADR-01 (Zentrale ToolExecutionPipeline), ADR-12 (Context Condensing), ADR-62 (KV-Cache-Optimized Prompt Structure), ADR-63 (Context Externalization)
related-imps: []
---

# ADR-113: Subagent-Delegation fuer context-heavy Teilaufgaben

## Status

Proposed (Architecture-Pass 2026-05-12, EPIC-24 Welle 2). Triggernde ASR: EPIC-24 / FEAT-24-04; RESEARCH-36 Abschnitt 8 (Hebel E).

## Kontext

Der Agent hat eine Subtask-Mechanik (ein Tool, das einen frischen Agent-Loop mit eigener History startet und nur das Endergebnis zurueckgibt; lean konfiguriert, ohne Condensing/Power-Steering). Sie wird kaum genutzt. Mehrschrittige explorative Teilaufgaben (vault-weite Recherche: N Suchen plus M Reads, die zu einer Zusammenfassung verdichtet werden; Web-Recherche; Codebase-Exploration) laufen heute im Hauptloop. Folge: alle Zwischen-Tool-Results (Web-Pages, Such-Treffer, Multi-File-Reads) landen im Eltern-Kontext, obwohl der Parent nur das verdichtete Ergebnis braucht. Der 5-Provider-Messlauf zeigt das als einen der Wachstumstreiber (ein Turn mit vier Datei-Reads endet bei ~48k Tokens, davon ~32k Tool-Results, die fortan mitfahren).

Claude Code (das `Task`-Tool, mit Agent-Definitionen je Typ) und EnBW Cowork (eine Subagent-Mechanik plus ein "Advisor"-Subagent mit hartem 3000-Token-Budget pro Aufruf und Secret-Redaction) zeigen das Muster: solche Teilaufgaben in einen frischen Subagent auslagern, nur das Ergebnis zurueck. Trade-off: Subagents erhoehen den Gesamt-Token-Verbrauch (eigener System-Prompt plus eigene Tool-Definitionen; Anthropic dokumentiert fuer Multi-Agent grob das Fuenfzehnfache gegenueber Chat). Sie gewinnen nur, wenn die Alternative der aufgeblaehte Eltern-Kontext mit Fehlschleifen ist.

## Decision Drivers

- Eltern-Kontext stabil halten: Zwischenstaende einer Teilaufgabe gehoeren nicht in den Hauptkontext.
- Kein Over-Triggering: ein einzelner Datei-Lese-Aufruf braucht keinen Subagent, das waere nur ein zusaetzlicher Roundtrip ohne Gewinn.
- Subagents duerfen nicht selbst entgleisen: ein Token-Budget pro Subtask-Aufruf.
- Vorhandene Subtask-Mechanik nutzen, nicht neu bauen.
- Das Model trifft die Delegations-Entscheidung gut genug ohne harten Router (Beleg: Claude Code arbeitet so).

## Considered Options

### Option 1: Harter Router -- alle Web-Tool-Sequenzen automatisch in einen Subagent

- Pro: deterministisch, kein Verlass auf das Model-Urteil.
- Con: "Web gegen Vault" ist das falsche Kriterium -- eine Multi-Note-Lese-Sequenz ist genauso context-heavy; die Router-Heuristik wird brittle und ueberlebt Refactorings schlecht; sie behandelt nicht den eigentlichen Fall (sperrige Zwischenstaende, gleich welcher Tool-Familie).

### Option 2: Model-getrieben -- Subtask-Tool prominent machen plus Agent-Profile plus Prompt-Leitplanke plus Per-Call-Token-Budget

- Pro: ein Kriterium ("self-contained plus eigene Reasoning-Schleife plus sperrige Zwischenstaende"), nicht an Tool-Familien gebunden; Claude Code macht es so und es funktioniert; Profile geben dem Subagent einen schlanken eigenen System-Prompt und eine eingeschraenkte Tool-Auswahl.
- Con: haengt vom Model-Urteil ab; braucht eine gute Prompt-Leitplanke.

### Option 3: Status quo -- Subtask-Tool existiert, wird nicht beworben

- Pro: kein Aufwand.
- Con: das Problem (Recherche im Hauptkontext) bleibt.

## Entscheidung

**Option 2.** Das Subtask-Tool wird prominent (im System-Prompt als empfohlenes Werkzeug fuer explorative und recherchierende Teilaufgaben), bekommt **Agent-Profile** und ein **hartes Per-Call-Token-Budget**.

- **Agent-Profile:** mindestens ein "Recherche/Explore"-Profil mit schlankem eigenem System-Prompt und einer auf read-only-, Such- und Web-Tools eingeschraenkten Tool-Auswahl (analog zu Claude Codes Agent-Definitionen je Typ). Das Profil ersetzt fuer den Subagent das vom Parent geerbte Mode-/Rules-/Skills-Set; zum Start bewusst nur ein bis zwei Profile.
- **Per-Call-Token-Budget:** der Aufruf des Subtask-Tools schnuert ein Kontext-Paket; ueberschreitet das den Budget-Wert, kommt ein Tool-Error mit Ist- und Soll-Zahl zurueck, der Agent kuerzt und ruft erneut (Cowork-Advisor-Pattern). Verhindert, dass ein Recherche-Subagent mit einem schon ueberfuellten Auftrag startet.
- **Kriterium "wann delegieren"** (in der Prompt-Leitplanke): die Teilaufgabe ist (a) self-contained, (b) braucht eine eigene mehrschrittige Reasoning-Schleife, (c) erzeugt sperrige Zwischenstaende, die der Parent nicht braucht -- nur das Ergebnis. Ein einzelner Datei-Lese- oder Such-Aufruf faellt nicht darunter.
- **Optionale weiche Heuristik:** ab N geplanten Such- oder Lese-Aufrufen schlaegt der Harness dem Model das Subtask-Tool vor (Vorschlag, kein Zwang). Default und Schwelle als Setting; im PLAN zu entscheiden.

## Konsequenzen

### Positiv

- Eltern-Kontext waechst bei Recherche-Teilaufgaben nur um die verdichtete Antwort, nicht um die Zwischenstaende.
- Das Per-Call-Budget verhindert Runaway-Subtasks.
- Profile machen Subagents schlanker (weniger Tools, kuerzerer System-Prompt) als der Hauptagent.

### Negativ

- Mehr Gesamt-Tokens bei falschem Einsatz (Subagent fuer triviale Einzel-Aufrufe). Mitigation: Prompt-Leitplanke plus optionale weiche Heuristik.
- Das Model-Urteil kann danebenliegen. Mitigation: konservative Leitplanke, Profile mit klarem Scope.

### Risiken

- Die Profil-Mechanik (eigener System-Prompt je Profil) ist neu im Agent und braucht eine kleine Profil-Registry. Klein halten: ein bis zwei Profile zum Start.
- Der Subagent erbt heute Mode, Rules und Skills des Parents. Mit Profilen muss das entkoppelt werden (das Profil definiert den Scope). Detail fuer den PLAN.

## Related Decisions

- ADR-01: zentrale ToolExecutionPipeline -- Subtasks laufen darueber.
- ADR-12: Context Condensing -- Subtasks condensen nicht, sie sind kurzlebig.
- ADR-62 / ADR-63: Caching und Externalization gelten auch innerhalb eines Subtasks.

## Implementation Notes (2026-05-12, kann veralten)

Subtask-Spawn in `src/core/AgentTask.ts` (Profil-Parameter plus Per-Call-Token-Budget-Check vor dem Spawn). Tool-Beschreibung des `new_task`-Tools in `src/core/tools/toolMetadata.ts` aufwerten. Profil-Definitionen als kleines neues Modul (z.B. `src/core/subagent-profiles.ts`) oder als bundled-skill-Verzeichnis analog Claude Codes Agent-Definitionen -- im PLAN entscheiden. Prompt-Leitplanke in `src/core/prompts/sections/objective.ts` bzw. `toolDecisionGuidelines.ts`. Diagnose: `logInputBreakdown` (`[InputBreakdown]`) -- bei Recherche-Turns soll der Eltern-Kontext flach bleiben. Verwandt: FEAT-24-04, RESEARCH-36 Abschnitt 8 (Hebel E), EnBW Cowork (Advisor-Pattern), Claude Code (Task-Tool).
