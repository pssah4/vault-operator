---
id: ADR-120
title: Advisor-Pattern als Loop-Default statt Multi-Tier-Routing
date: 2026-05-15
deciders: Sebastian + Architekt-Agent
related-features: FEAT-26-01
related-adrs: ADR-11 (Multi-Provider API Architecture), ADR-113 (Subagent-Delegation), ADR-115 (Helper-Modell-Routing)
related-imps: []
---

# ADR-120: Advisor-Pattern als Loop-Default

## Status

Proposed (Architecture-Pass 2026-05-15, EPIC-26 Welle 1).
Triggernde ASR: EPIC-26 / FEAT-26-01; BA-27 Sektion 4.4 JTBD-1 und JTBD-2.

## Kontext

Der Hauptloop des Agenten läuft heute auf dem User-konfigurierten `activeModelKey`. Dieses Modell bedient jeden Turn unabhängig von der Aufgaben-Schwierigkeit. Für Knowledge-Worker-Workflows ist der Default in der Praxis fast immer das stärkste verfügbare Modell (Opus 4.6), weil die Aufgabe potenziell anspruchsvoll wird. Tatsächlich ist die Mehrheit der Turns reine Text-Generierung (Argumentation, Note-Drafting, Recherche-Zusammenfassung), die ein mid-Tier-Modell qualitativ vergleichbar liefern kann. Der Kostenunterschied ist nicht inkrementell sondern strukturell: Opus zu Sonnet ist ein Faktor 5 auf Input und Output, zu Haiku ein Faktor 25. Eine 8-Turn-Strategie-Session erreicht 20 EUR statt der möglichen 5 EUR, weil das Defaultmodell zu stark gewählt ist.

Der TaskRouter aus dem Vorgänger-Refactoring routet bereits trivial-simple Prompts auf ein Helper-Modell, behält aber complex-klassifizierte Prompts auf dem Main-Modell. Eine binäre Klassifikation reicht nicht für den dialogischen chat-style Workflow, der "complex" gemäß Regex (lang, Multi-Verb), aber qualitativ "complex-text" ist und kein Flagship-Reasoning benötigt.

Die Frage ist, wie der Agent zwischen einem schlanken Default-Modell und gelegentlicher Flagship-Eskalation balancieren kann, ohne den User mit feingranularer Routing-Konfiguration zu belasten.

## Decision Drivers

- Kostenreduktion ohne Qualitätsverlust für dialogische Sessions
- Vorhersagbare Cost-Anzeige (User sieht im Voraus auf welchem Modell der Loop läuft)
- Keine Loop-Mid-Stream-Modellwechsel (Cache-Stabilität, deterministische Antwort)
- Vermeidung von Klassifikations-Fehlern (Regex-binär ist heute schon problematisch, dreifache Klasse macht das Risiko größer)
- Kontrolle für den User (Override-Pfad pro Turn bleibt verfügbar)
- Minimaler Eingriff in den bewährten ReAct-Loop-Kern
- Wiederverwendung des bestehenden Subagent-Mechanismus (ADR-113)

## Considered Options

### Option 1: 3-Klassen-TaskRouter mit Loop-Wechsel

Der TaskRouter wird um eine dritte Klasse `complex-text` erweitert. Bei Prompt-Klassifikation als `complex-text` wird der Hauptloop auf mid-Tier umgestellt, bei `complex-reasoning` bleibt er auf flagship. Klassifikation läuft pro User-Prompt zu Task-Start, der Loop bleibt während des Tasks auf dem gewählten Modell.

- **Pro:** klare Per-Task-Routing-Entscheidung, deterministisch, kein Mid-Stream-Wechsel
- **Con:** dritte Regex-Klasse erbt die Klassifikations-Fehler der binären Variante und verstärkt sie. Klassifikator-Pflege wird teurer (mehr Pattern, mehr Edge-Cases). Strategie-Chats können trotzdem auf flagship landen, wenn der Initial-Prompt thematisch unklar ist. Cost-Hebel ist abhängig von Klassifikations-Treffsicherheit. Verstärkt das bestehende Mode-Fehlwahl-Risiko.

### Option 2: Hard-Forward-Eskalation bei consecutiveMistakes

Der Hauptloop läuft permanent auf mid-Tier. Bei einer Schwelle von N aufeinanderfolgenden Tool-Errors oder Parse-Errors wird automatisch auf flagship eskaliert. User bleibt unbeteiligt.

- **Pro:** keine Klassifikation nötig, deterministisch, klar definierter Eskalations-Pfad
- **Con:** Eskalation passiert nur wenn der Agent schon scheitert. Reaktive Mechanik führt zu unnötigen Fehlern bevor die Eskalation greift. User-Wunsch explizit gegen "Stoppen oder Eskalieren als Reaktion auf Mistakes" formuliert ("Loop optimieren, nicht User unterbrechen"). Bei text-lastigen Tasks ohne Tool-Use greift der Mechanismus nie, dort wo Eskalation potenziell wertvoll wäre.

### Option 3: Modell-getriebenes Advisor-Tool

Der Hauptloop läuft permanent auf mid-Tier. Ein neues Built-In-Tool `consult_flagship` wird dem Modell exponiert mit einem strukturierten Pflicht-Schema. Wenn der Agent eine schwierige Synthese, Architektur-Vergleich oder kreative Eskalation benötigt, ruft er das Tool selbst und erhält eine kompakte Text-Antwort vom Flagship-Modell zurück. Bei consecutiveMistakes injiziert das Plugin einen Prompt-Reminder, das Tool zu erwägen, erzwingt aber keinen automatischen Call. Per-Task-Limit verhindert Cost-Eskalation.

Übernommen aus dem EnBW-Cowork-Pattern (weak-strong-Pair plus mandatory-schema-Tool). Wiederverwendet die Subagent-Mechanik aus ADR-113 mit einem dedizierten Sub-Profile.

- **Pro:** Agent-Autonomie über Eskalations-Bedarf, keine Klassifikation nötig, Eskalations-Granularität auf Sub-Step-Ebene (ein einzelner Flagship-Call statt ganzer Loop-Wechsel). Wiederverwendung von ADR-113-Mechanik. Validierbar via Eskalations-Rate-Telemetrie. Loop-Cache bleibt stabil (Eskalations-Call hat separaten Cache-Prefix).
- **Con:** Eskalations-Frequenz hängt von Modell-Selbsteinschätzung ab, schwer vorherzusagen vor Beta-Test. Prompt-Leitplanke muss klar sein, sonst ruft das Modell das Tool zu oft oder zu selten. Tool-Schema-Validierung muss strikt sein, sonst wird das Pflicht-Feld-Pattern als optional behandelt.

## Entscheidung

**Option 3.** Modell-getriebenes Advisor-Tool als Loop-Default-Pattern.

Konkrete Mechanik:

- Hauptloop läuft auf dem Tier-Slot `mid` des aktiven Providers (resolviert durch den Tier-Klassifikator aus ADR-121)
- Tool `consult_flagship` wird dem Modell exponiert mit Pflicht-Schema: `problem`, `relevant_context`, `failed_attempts`, `constraints`
- Tool-Call ruft einen Subagenten auf dem Tier-Slot `flagship` mit einem harten Output-Budget von 3000 Tokens
- Subagent hat read-only Tool-Set (analog research-Profile aus FEAT-24-04)
- Per-Task-Limit von 3 Eskalations-Calls, danach Tool-Result `advisor budget exhausted for this task`
- Bei `consecutiveMistakes >= 2` wird ein Prompt-Reminder injiziert. Reminder ist Empfehlung, kein erzwungener Call
- Tool wird nur registriert wenn der flagship-Tier-Slot belegt ist (sonst kein Eskalations-Pfad verfügbar)
- Bei explizitem User-Override im Chat-Dropdown (FEAT-26-05) wird das Tool für den Turn nicht registriert und der Loop läuft auf dem gewählten Modell

Eskalations-Rate wird via Telemetrie geprüft (Validation-Hypothese H-03 aus EPIC-26: erwartet 5-15 % der Auto-Chats). Bei Drift wird die Prompt-Leitplanke nachgeschärft, nicht die Architektur.

## Konsequenzen

### Positiv

- Strategie- und Recherche-Chats laufen strukturell auf einem schlankeren Modell, der Kosten-Hebel ist nicht klassifikations-abhängig
- Eskalations-Call ist Sub-Step-granular, der Loop bleibt schlank
- Wiederverwendung des Subagent-Mechanismus reduziert Implementations-Aufwand
- Agent-Autonomie respektiert die User-Anforderung "Loop optimieren statt unterbrechen"
- Loop-Cache bleibt stabil, kein Mid-Stream-Modellwechsel
- Override-Pfad pro Turn gibt dem User Kontrolle ohne Default-Friction

### Negativ

- Eskalations-Frequenz ist nicht vorab kalibrierbar, hängt von Beta-Erfahrung ab
- Prompt-Leitplanke muss klar genug sein, dass das Modell das Tool nicht ignoriert oder zu aggressiv ruft
- Tool-Schema-Validierung ist eine zusätzliche Surface (Längen-Limits müssen provider-seitig erzwungen werden)
- Cost-Log braucht ein zusätzliches `mode`-Field, um Auto-Turns von Override-Turns und Advisor-Calls zu unterscheiden
- Subtask-Tier-Inheritance erfordert eine explizite Regel (Default: erbt Parent-Tier, research-Profile bleibt auf fast-Tier)

### Risiken

- Bei zu seltener Eskalation merkt der User Qualitäts-Regression bei schwierigen Synthese-Aufgaben. Mitigation: Validation-Hypothese H-01 aus EPIC-26 (Beta-Phase), Rollback-Plan via Default-Tier-Setting flipbar auf flagship
- Bei zu häufiger Eskalation explodiert der Cost-Hebel. Mitigation: Per-Task-Limit, Telemetrie-Monitoring, Prompt-Leitplanke nachschärfen
- Subagent-Auth-Fehler bei Eskalations-Call führt zu Tool-Result-Error. Mitigation: klare Fehler-Meldung an den Hauptloop, kein Crash

### Architektonische Folgepunkte

- ADR-115 wird per Amendment um Hauptloop-Default-Tier und Tier-Semantik erweitert (siehe ADR-115 Amendment 2026-05-15)
- ADR-122 (Provider-only Settings Schema) liefert die Tier-Slot-Struktur, von der dieses ADR abhängt
- arc42 Sektion 5 (Building Block View) bekommt einen Subagent-Pfad für `consult_flagship`-Calls

## Related Decisions

- Vorausgesetzt von ADR-121 (Tier-Klassifikator-Strategie): liefert das `mid`- und `flagship`-Modell
- Erweitert ADR-115 (Helper-Modell-Routing): Helper-Tier wird zum fast-Tier-Alias
- Nutzt ADR-113 (Subagent-Delegation): Eskalations-Call läuft als Subagent

## Implementation Notes

Die folgenden Code-Pfade sind Anhaltspunkte und können nach Coding-Pivots veralten. Verbindliche Decision-Substanz steht oben.

- Neues Built-In-Tool in `src/core/tools/agent/`, registriert in `TOOL_METADATA` und `TOOL_GROUP_MAP.agent`
- Tool-Schema mit JSON-Schema-Längen-Limits (z.B. `maxLength: 1500` für `problem`, `maxLength: 500` für `constraints`)
- Spawn-Pfad nutzt `AgentTask.spawnSubtask()` mit neuem Profile `advisor` (eigene Registry in `src/core/agent/subagent-profiles.ts`)
- Per-Task-Counter im AgentTask-State, Reset bei Task-Start
- Prompt-Reminder als konditionale Section im System-Prompt nach `CACHE_BREAKPOINT_MARKER` (Cache-Stabilität, ADR-62)
- Tool-Filter bei Override: `ToolRegistry.getActiveTools()` respektiert eine Override-Flag aus dem aktuellen API-Handler

## Quellen

- BA-27 Sektion 4.4 JTBDs, Sektion 11 Critical Hypotheses
- FEAT-26-01 Description, Success Criteria, NFRs
- EnBW Cowork `consult_advisor`-Pattern (Architektur-Analyse 2026-05-15)
- ADR-113 (Subagent-Delegation als Mechanik-Vorbild)
- ADR-115 (Helper-Modell-Routing als Routing-Vorbild)
