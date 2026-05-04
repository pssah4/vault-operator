# Specialist Overlay Architektur -- Multi-Agent Option 4

> Analyse und Implementierungskonzept fuer arbeitsteilige Spezialisierung in Obsilo.
> Ergebnis der Evaluierung von [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents/) und Abgleich mit Obsilo's bestehender Multi-Agent-Architektur.

---

## 1. Kontext & Problemstellung

### Ausgangslage

Obsilo hat zwei Mechanismen fuer Multi-Agent-Arbeit:

| Mechanismus | Datei | Verhalten |
|---|---|---|
| `switchMode` | `src/core/AgentTask.ts:223-225`, `340-352` | Sequentiell, eine Mode pro Iteration, neuer System-Prompt + Tool-Set |
| `spawnSubtask` | `src/core/AgentTask.ts:227-288` | Child-AgentTask mit frischer History, blockierend (`await`), max Depth 2 |

### Probleme

1. **Sequentielle Mode-Switches sind zu langsam** -- mindestens 2 Extra-Iterationen (hin + zurueck) fuer jeden Wechsel
2. **Discovery des richtigen Spezialisten ist teuer** -- LLM-basierte Routing-Entscheidung kostet Tokens und Zeit, besonders bei einfachen Tasks die der Basis-Agent selbst loesen kann
3. **Orchestrator-Pattern verworfen** -- zu viel Overhead, zentraler Bottleneck, eigener Agent der nur delegiert

### Evaluierte Optionen

| Option | Bewertung | Problem |
|---|---|---|
| 1: Manuelle Mode Switches | Ungeeignet als Haupt-Strategie | Zu langsam, 2+ Extra-Iterationen pro Switch |
| 2: Spezialisten als Subtasks | Richtig fuer unabhaengige Teilaufgaben | Blockierend, Kontextverlust, nur agent/ask erlaubt |
| 3: Specialist Prompt Injection | Effizient, aber Entscheidungsproblem | Wer entscheidet ob Specialist noetig? Neigt zu Over-Delegation |
| **4: Hybrid 3-Stufen (gewaehlt)** | **Skaliert mit Aufgabenkomplexitaet** | **Keine Runtime-Entscheidung fuer Stufe 1** |

---

## 2. Gewaehlt: Option 4 -- Hybrid 3-Stufen-Architektur

```
Stufe 0: Base Agent           Einfache Tasks -- kein Overhead
         |
         | (statisch, zur Prompt-Build-Zeit)
         v
Stufe 1: Specialist Injection  Domain-Wissen injiziert, gleicher Agent
         |
         | (nur wenn echte Parallelitaet noetig, Agent-Entscheidung)
         v
Stufe 2: Parallel Subtasks     Unabhaengige Arbeitsstraenge gleichzeitig
```

### Stufe 0: Base Agent

- Default-Zustand. Kein Overhead.
- Mode bestimmt Tool-Set ueber Tool-Gruppen (`read`, `edit`, `web`, etc.)
- Agent beantwortet "Was steht in Datei X?" ohne jeden Specialist-Overhead

### Stufe 1: Statische Specialist Injection

- **Keine Runtime-Entscheidung** -- Overlays werden zur System-Prompt-Build-Zeit geladen
- Mode hat Tools -> Tools gehoeren zu Gruppen -> Gruppen haben Overlays -> Overlays im System-Prompt
- Agent nutzt das Wissen wenn relevant, ignoriert es wenn nicht
- Kosten: nur Context-Window, keine Extra-Iterationen, keine Extra-API-Calls

### Stufe 2: Parallel Subtasks

- Agent spawnt bewusst unabhaengige Arbeitsstraenge
- Erweiterung: `Promise.all()` statt sequentielles `await`
- Erweiterung: Erlaubte Modes ueber `agent`/`ask` hinaus
- Selten, aber maechtig fuer "recherchiere X und baue Y gleichzeitig"

---

## 3. Specialist Overlay Definition

### Struktur

```typescript
interface SpecialistOverlay {
    slug: string;                // Eindeutiger Identifier
    name: string;                // Anzeigename
    forToolGroups: ToolGroup[];  // Trigger: Aktive Tool-Gruppen
    forTools?: string[];         // Optional: Spezifische Tools (feingranular)
    promptFile: string;          // Pfad zur Markdown-Datei mit Specialist-Wissen
    additionalTools?: string[];  // Optional: Extra-Tools freischalten
}
```

### Binding-Logik

Overlays haengen an **Tool-Gruppen**, nicht an einzelnen Tools. Das loest das Cross-Tool-Problem (z.B. "Research Synthesizer" braucht `web_search` + `web_fetch` + `write_file`):

```
Mode (z.B. "Agent")
  -> Tool-Gruppen: [read, vault, edit, web, agent, mcp, skill]
      -> Jede Gruppe kann 0-N Specialist Overlays haben
          -> Overlays werden statisch in System-Prompt injiziert

Beispiel Mode "Agent" mit aktivem Tool-Set:
  Basis-Prompt
  + [edit aktiv, create_pptx registriert] -> "Presentation Design" Overlay
  + [edit aktiv, create_docx registriert] -> "Document Writer" Overlay
  + [web aktiv]                           -> "Research Synthesizer" Overlay
```

### Kern-Prinzip: Wissen vs. Capability

```
Fehlendes Wissen    -> Specialist Overlay (Stufe 1) -- kein neues Tool noetig
Fehlende Capability -> Neues Tool + optional Specialist Overlay
```

Ein Specialist fuegt keine neuen Faehigkeiten hinzu -- er fuegt **Wissen** hinzu, wie bestehende Tools besser genutzt werden. Beispiel:

- **Ohne** Presentation-Specialist: Agent generiert eine generische Folie
- **Mit** Presentation-Specialist: Agent weiss ueber Designregeln (6 Worte/Zeile, narrative Struktur, Bildplatzhalter) und nutzt `create_pptx` mit besseren Parametern

---

## 4. Relevante Specialists fuer Obsilo

### Aus agency-agents Repo uebernommen: Keine

Die 61 Agents im Repo sind auf Software-Entwicklungsteams zugeschnitten (Frontend Dev, DevOps, API Tester, visionOS Engineer, TikTok Strategist...). Fuer ein Obsidian Knowledge-Management-Plugin ist die Schnittmenge zu gering. Die Prompts sind zu generisch (Agentur-Kontext) und zu lang (200+ Zeilen).

**Erkenntnisse aus dem Repo die wir uebernehmen:**

- Markdown-basierte Agent-Definitionen (konsistente Sektionen)
- Quality-Kriterien pro Agent (messbare Erfolgskriterien)
- Handoff-Strukturen fuer Subtask-Kommunikation

### Eigene Specialists fuer Obsilo

| Specialist | Wofuer | Tool-Gruppen-Trigger | Tool-Trigger (feingranular) |
|---|---|---|---|
| **Presentation Design** | PPTX mit Design-Regeln | `edit` | `create_pptx` |
| **Document Writer** | Strukturierte Reports/Briefs | `edit` | `create_docx` |
| **Data Analyst** | Tabellen, Auswertungen | `edit` | `create_xlsx` |
| **Research Synthesizer** | Quellen recherchieren + zusammenfassen | `web` | `web_search`, `web_fetch` |
| **Vault Architect** | Tagging, Linking, MOCs, Struktur | `vault` + `edit` | -- |
| **Canvas Designer** | Visuelle Wissensstrukturen | `edit` | `generate_canvas` |

### Prioritaet

1. **Presentation Design** -- `bundled-skills/presentation-design/SKILL.md` existiert bereits, laufende Optimierung in parallelem Dialog
2. **Document Writer** -- Analog zu Presentation Design, nutzt `create_docx`
3. **Research Synthesizer** -- Web-Tools bereits vorhanden
4. Weitere nach Bedarf

---

## 5. Implementierungsplan

### Phase 1: Presentation Design als Pilot (aktuell)

**Ziel:** Erster Specialist Overlay als Proof-of-Concept, integriert in den laufenden `create_pptx`-Optimierungsdialog.

**Schritte:**

1. `bundled-skills/presentation-design/SKILL.md` als Overlay-Prompt finalisieren
2. Overlay-Registry erstellen (statische Map: Tool -> Overlay-Datei)
3. System-Prompt-Builder erweitern: Overlays laden wenn zugehoerige Tools im Mode aktiv
4. Build + Test: PPTX-Erstellung mit und ohne Overlay vergleichen

**Betroffene Dateien:**

| Datei | Aenderung | Risiko |
|---|---|---|
| `src/core/prompts/` (neuer Builder-Abschnitt) | Overlay-Injection in System-Prompt | Niedrig |
| `bundled-skills/presentation-design/SKILL.md` | Inhaltliche Optimierung | Niedrig |
| Neue Datei: Overlay-Registry/Config | Mapping Tool -> Overlay | Niedrig |
| `src/core/AgentTask.ts` | Keine Aenderung in Phase 1 | -- |

### Phase 2: Overlay-System generalisieren

1. `SpecialistOverlay`-Interface definieren
2. Overlay-Loader: Markdown-Dateien aus `bundled-skills/` und User-definierte aus Vault
3. Zweiten Specialist (Document Writer) hinzufuegen
4. Validieren dass Overlays korrekt gefiltert werden (Ask-Mode ohne `edit` -> kein Presentation Overlay)

### Phase 3: Parallel Subtasks

1. `spawnSubtask` erweitern: `Promise.all()` fuer mehrere gleichzeitige Children
2. Erlaubte Subtask-Modes erweitern (Custom Modes zulassen)
3. Handoff-Struktur definieren (strukturierte Ergebnis-Rueckgabe)

---

## 6. Abgrenzung: Was wir NICHT bauen

| Konzept | Warum nicht |
|---|---|
| **Orchestrator-Agent** | Zentraler Bottleneck, eigener Agent der nur delegiert -- zu viel Overhead |
| **Automatisches Agent-Routing** | Discovery-Problem: LLM-Entscheidung kostet Tokens, neigt zu Over-Delegation |
| **NEXUS-Pipeline** (aus agency-agents) | Manuell gesteuert, 7-Phasen-Wasserfall -- passt nicht zu interaktivem Vault-Agent |
| **61 spezialisierte Agents** | Obsidian-Kontext braucht 5-6 Specialists, nicht 61 |
| **Neue Tool-Gruppen fuer Specialists** | Specialists haengen an bestehenden Gruppen, keine neuen noetig |

---

## 7. Referenzen

- **agency-agents Repo:** [github.com/msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents/)
- **Bestehende Architektur:** ADR-04 (Mode-based Tool Filtering), ADR-08 (Modular Prompt Sections), ADR-09 (Local Skills)
- **Presentation Design Skill:** `bundled-skills/presentation-design/SKILL.md`
- **Mode-System:** `src/core/modes/ModeService.ts`, `src/core/modes/builtinModes.ts`
- **Subtask-System:** `src/core/AgentTask.ts:227-288`, `src/core/tools/agent/NewTaskTool.ts`
