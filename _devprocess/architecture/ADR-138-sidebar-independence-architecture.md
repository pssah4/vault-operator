---
id: ADR-138
title: Sidebar-Independence-Architektur fuer Inline-AI-Actions
date: 2026-06-22
deciders:
  - Sebastian Hanke
  - Architecture Agent (Claude Opus 4.7)
asr-refs:
  - ASR-EPIC-33-01
feature-refs:
  - FEAT-33-01
  - FEAT-33-02
  - FEAT-33-03
  - FEAT-33-04
  - FEAT-33-05
  - FEAT-33-06
  - FEAT-33-07
  - FEAT-33-08
  - FEAT-33-09
  - FEAT-33-10
  - FEAT-33-11
related-adrs: []
supersedes: null
superseded-by: null
---

# ADR-138: Sidebar-Independence-Architektur fuer Inline-AI-Actions

## Context

Inline-Actions aus EPIC-33 muessen funktionieren, wenn die Chat-Sidebar geschlossen ist. Der User soll im Editor markieren, eine Action ausloesen und ein Ergebnis bekommen, ohne dass eine Sidebar-View geoeffnet sein muss. Das ist eine harte Produkt-Anforderung und eine Critical Hypothesis der Beta (H-06).

Die heutige Architektur kapselt die AgentTask-Konstruktion und alle UI-Callbacks (onText, onThinking, onToolStart, onToolResult) in der AgentSidebarView. Wenn die Sidebar nicht offen ist, existiert kein Caller fuer den Agent-Loop. Spike A hat den Status quo inventarisiert: rund 60 Prozent der AI-Pfade sind bereits sidebar-unabhaengig. Die API-Provider sind reine Factory-Funktionen ohne View-Referenzen, AgentTask ist auf Callback-Ebene abstrakt, Settings liegen global zentral in main.ts, und es gibt etablierte Vorbilder fuer interne Tool-LLM-Calls (PlanPresentationTool, SemanticSearchTool HyDE, MemoryService SingleCallProcessor). Die uebrigen 40 Prozent sind gekoppelt: die AgentTask-Konstruktion findet ausschliesslich in der Sidebar statt, Callbacks manipulieren das Sidebar-DOM direkt, und Mode-, Thinking- sowie Effort-Overrides sind reine Sidebar-Instanz-Variablen, die heute nicht nach aussen propagiert werden.

Ohne eine Entkopplung von Agent-Loop und Sidebar-View bleibt EPIC-33 architektonisch nicht umsetzbar. Jeder kuenftige Headless-Pfad (Inline-Actions, Background-Jobs, MCP-Server-Auto-Invocation, CLI) wuerde dieselbe Wand treffen.

**Triggering ASR:** ASR-EPIC-33-01 ("Inline-AI-Actions muessen ohne offene Chat-Sidebar lauffaehig sein").

**Quality attribute:** Modifiability (neue Aufruf-Sites koennen den Agent-Loop konsumieren) und Availability (Inline-Actions funktionieren unabhaengig vom UI-Zustand der Sidebar).

## Decision drivers

- **Sidebar-Unabhaengigkeit als harte Anforderung.** Inline-Actions, Background-Jobs und kuenftige Headless-Pfade brauchen den Agent-Loop ohne View-Kontext. Jede Loesung muss diese Entkopplung liefern, sonst verfehlt EPIC-33 sein Ziel.
- **Regressionsrisiko fuer den bestehenden Chat-Flow.** Die Sidebar-Pipeline ist live, beta-getestet und stabil. Ein Refactor darf die laufenden Chat-Workflows nicht beschaedigen.
- **Aufwand und Test-Mass.** Der Refactor muss in einer Welle mit Beta-Risiko-Profil passen. Ein Big-Bang ueber alle Schichten waere riskant und schwer zu testen.
- **Vorhandene Pattern-Vorbilder.** Interne LLM-Calls wie PlanPresentationTool zeigen, dass die Bausteine fuer einen sauberen Runner schon existieren. Die Loesung sollte dieses Pattern verallgemeinern, nicht parallel etwas Neues bauen.
- **Erweiterbarkeit fuer Action-spezifische Overrides.** FEAT-33-10 verlangt Per-Action-Pinning von Mode, Thinking und Effort. Das setzt voraus, dass Overrides als Config-Parameter durch den Runner reisen, statt aus einer View-Instanz gelesen zu werden.

## Considered options

### Option 1: Direkt-Refactor in einem Schritt

Tier 1 und Tier 2 werden in einem PR umgesetzt: ToolCallbacks-Extraktion, AgentTaskRunner-Abstraktion, Mode-, Thinking- und Effort-Override-Parameter, Settings-Source-Dekoppelung und ContextTracker-Extract zusammen. Sidebar und Headless-Pfade entstehen parallel auf einem konsolidierten Fundament.

**Pros:**
- Eine atomare Migration ohne Mid-State.
- Klare Schnittlinie nach dem Refactor, alle Konsumenten greifen sofort auf das neue Modell zu.
- Settings-Source und ContextTracker sind ab Tag eins entkoppelt, kein nachgelagerter Refactor noetig.

**Cons:**
- Aufwand von ein bis zwei Wochen am Stueck, blockiert andere EPIC-33-Wellen.
- Regressionsrisiko fuer Chat-Workflows ist hoch, weil viele Schichten gleichzeitig kippen.
- Test-Aufwand explodiert, Snapshot-Tests muessten sowohl Callback-Outputs als auch Settings-Pfade absichern.
- Mid-Refactor-Bugs sind schwer zu lokalisieren, weil mehrere Aenderungsachsen ueberlagern.

### Option 2: Stufenweiser Refactor (empfohlen)

Welle 1 liefert Tier 1: ToolCallbacks-Interface als Adapter, AgentTaskRunner-Abstraktion als zentraler Einstiegspunkt fuer den Agent-Loop, und Mode-, Thinking- sowie Effort-Override-Parameter im Runner-Config-Layer. Die Sidebar konsumiert denselben Runner weiterhin, nur die DOM-Logik liegt jetzt in einem dedizierten Renderer. Tier 2 (Settings-Source-Dekoppelung, ContextTracker-Extract) folgt nach Beta-Verifikation der Welle 1.

**Pros:**
- Tier 1 ist eigenstaendig wertvoll und einzeln teste-bar, Inline-Actions werden damit moeglich.
- Sidebar-Funktionalitaet bleibt waehrend des Refactors unveraendert, weil sie weiterhin denselben Runner ruft, nur mit anderen Callbacks.
- Tier 2 startet erst, nachdem Tier 1 in der Beta bestaetigt ist, das reduziert Kaskaden-Risiko.
- Generalisiert das PlanPresentationTool-Pattern zur Norm fuer kuenftige Headless-Konsumenten.
- Mode-, Thinking- und Effort-Pinning pro Action wird ab Welle 1 moeglich, ohne dass die Settings-Source umgebaut sein muss.

**Cons:**
- Tier 2 bleibt als Refactor-Schuld bis nach Welle 1 bestehen, die Settings-Source ist in der Zwischenzeit weiterhin global zugreifbar.
- Mid-State zwischen Tier 1 und Tier 2 (Override im Runner-Config, Settings noch ungesplittet) muss als bewusste Etappe akzeptiert werden.

### Option 3: Adapter-Pattern ohne Refactor

Ein neuer InlineActionService-Layer sitzt als Fassade vor AgentTask und ruft den Agent-Loop mit synthetischen Sidebar-DOM-Callbacks auf. Die Sidebar-View bleibt komplett unveraendert, der Inline-Pfad konsumiert AgentTask wie heute, nur mit Mock-Callbacks.

**Pros:**
- Minimal-invasiv, kein Eingriff in die laufende Sidebar.
- Schnell implementierbar, niedriger Initial-Aufwand.
- Niedriges Regressionsrisiko fuer den Chat-Flow.

**Cons:**
- Mock-DOM-Callbacks sind ein Code-Smell, der dauerhaft im Repo bleibt.
- Performance-Overhead durch Dummy-DOM-Operationen, die nichts rendern.
- Drift-Risiko: jede Aenderung an den Sidebar-Callbacks zwingt den Mock zur Nachpflege, sonst geht der Inline-Pfad still kaputt.
- Tier 2 wird nie sauber moeglich, weil der Mock die Settings-Source weiterhin als View-Detail behandelt.
- Per-Action-Override fuer Mode, Thinking und Effort bleibt strukturell schwierig, weil die Overrides in der Sidebar-Instanz haengen.

## Decision

Wir waehlen Option 2, den stufenweisen Refactor.

Welle 1 schliesst Tier 1 ab: ein ToolCallbacks-Interface kapselt die DOM-Adapter-Schicht, ein AgentTaskRunner ist die einzige Stelle, an der AgentTask konstruiert wird, und Mode-, Thinking- sowie Effort-Override gehen als Felder durch die Runner-Config. Die Sidebar wird auf den Runner umgestellt und liefert ihre eigenen Callbacks ueber den neuen Renderer. Inline-Actions konsumieren denselben Runner mit eigenen, kopfeloseren Callbacks.

Tier 2 (Settings-Source-Dekoppelung, ContextTracker-Extract) startet erst, nachdem Welle 1 in der Beta produktiv bestaetigt ist. Diese Reihenfolge nimmt das Sidebar-Regressionsrisiko aus dem kritischen Pfad und macht Inline-Actions trotzdem in der ersten Welle moeglich.

Die Begruendung folgt den Decision-Drivers: Sidebar-Unabhaengigkeit wird in Welle 1 erreicht, das Regressionsrisiko bleibt klein, weil die Sidebar weiterhin denselben Runner mit denselben semantischen Callback-Punkten verwendet, und der Aufwand passt in eine Welle. Das PlanPresentationTool-Pattern wird zur Norm verallgemeinert, statt parallel etwas Neues zu bauen. Per-Action-Override wird ab Welle 1 moeglich, ohne dass Settings-Source und Context-Tracking gleichzeitig kippen muessen.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- AgentTask wird aus beliebigen Aufruf-Sites instanziierbar. Inline-Actions, kuenftige CLI-Pfade, MCP-Server-Auto-Invocation und Background-Jobs koennen denselben Runner verwenden.
- Sidebar-Funktionalitaet bleibt waehrend des Refactors funktional unveraendert, weil sie auf denselben Runner umgestellt wird, nur mit eigenen Callbacks.
- Das PlanPresentationTool-Pattern wird zur Norm. Jeder neue Inline-Action-Pfad konsumiert den AgentTaskRunner direkt und nicht eine View.
- Mode-, Thinking- und Effort-Override koennen pro Action gepinnt werden, weil sie als Config-Parameter durch den Runner reisen. Damit ist die Vorbedingung fuer FEAT-33-10 erfuellt.
- Die Architektur wird testbarer: der Runner laesst sich mit Stub-Callbacks isoliert testen, ohne View-Mocking.

### Negative

- Tier-1-Refactor ist substantiell. Er beruehrt die zentrale Callback-Pipeline und braucht sorgfaeltige Snapshot-Tests vor und nach der Migration.
- Mid-State zwischen Tier 1 und Tier 2 bleibt sichtbar: die Settings-Source ist weiterhin global zugreifbar, der ContextTracker lebt noch in der Sidebar. Das ist bewusst akzeptierte Refactor-Schuld bis Welle 1 stabil ist.
- Tier 2 muss bewusst eingeplant werden, sonst bleibt der Mid-State dauerhaft.

### Risks

- **Callback-Drift waehrend der Migration.** Wenn die Sidebar-Callbacks nicht 1-zu-1 in den neuen Renderer ueberfuehrt werden, brechen subtile Chat-Verhalten weg. Mitigation: Snapshot-Tests auf den Callback-Outputs vor und nach dem Refactor, plus eine manuelle Regression-Checkliste fuer die haeufigsten Chat-Pfade.
- **Override-Verhalten kann sich subtil aendern.** Wenn Mode-, Thinking- und Effort-Override jetzt durch den Runner-Config-Layer gehen statt aus der Sidebar-Variable gelesen zu werden, koennen Reihenfolgen oder Default-Werte abweichen. Mitigation: dedizierte Regression-Tests fuer die Override-Pfade, inklusive Default-Cases und Overrides aus Skill-Kontext.
- **Aufwand-Unterschaetzung in Tier 1.** Das Spike-A-Inventar hat 40 Prozent Kopplung gefunden, aber nicht jede Kopplung ist bisher in Code sichtbar. Mitigation: Tier-1-Plan beginnt mit einem Code-Walkthrough der heutigen Callback-Outputs und einem expliziten Cut-Set.

## Implementation Notes

Konkret betroffene Files in Tier 1:

- `src/ui/AgentSidebarView.ts:1959` (AgentTask-Konstruktion verschieben in den neuen AgentTaskRunner)
- `src/ui/AgentSidebarView.ts:1963-2250` (Callback-Implementierungen extrahieren nach `src/ui/rendering/SidebarMessageRenderer.ts`)
- `src/core/AgentTask.ts:163-210` (AgentTaskRunConfig erweitern um `modelOverride`, `thinkingOverride`, `effortOverride`)
- `src/core/agent/AgentTaskRunner.ts` (NEU, Abstraktion ueber AgentTask plus Callbacks plus Config)

Pattern-Vorbilder, an denen sich der Runner orientiert:

- `src/core/AgentTask.ts:856-983` (spawnSubtask) zeigt, dass Subtask-Erstellung mit abstrakten Callbacks bereits funktioniert.
- `src/core/tools/vault/PlanPresentationTool.ts:164-172` zeigt interne LLM-Calls via `buildApiHandlerForModel` ohne View-Kontext.
- `src/core/tools/vault/SemanticSearchTool.ts:101-107` (HyDE) zeigt internen Konsumenten von `plugin.apiHandler` ohne UI-Kopplung.

Konsumenten-Migration in Welle 1:

- Sidebar konsumiert den Runner mit dem neuen `SidebarMessageRenderer` als Callback-Adapter.
- Inline-Action-Path konsumiert den Runner mit einem kopflosen Callback-Adapter (Stream-Sammler, kein DOM).

Tier-2-Files (spaeter, nicht Welle 1):

- `src/main.ts:143` (Settings-Centralization in eine eigene SettingsSource, die nicht ueber den Plugin-Singleton laeuft)
- `src/ui/sidebar/ContextDisplay.ts` (ContextTracker-Logik nach `src/core/context/ContextTracker.ts` extrahieren, View nur noch Renderer)

Migrations-Reihenfolge in Tier 1:

1. Renderer-Modul `SidebarMessageRenderer` neu anlegen und Callbacks aus der Sidebar 1-zu-1 hineinziehen.
2. `AgentTaskRunner` als Wrapper neu anlegen, der heute exakt das tut, was die Sidebar an Konstruktion macht.
3. Sidebar auf den Runner umstellen, kein Verhaltens-Delta.
4. `AgentTaskRunConfig` um Override-Felder erweitern und Sidebar-Variablen darin verkabeln.
5. Inline-Action-Pfad als zweiter Konsument des Runners anbinden.
