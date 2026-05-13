---
id: MESSLAUF-EPIC-24-WELLE-2-3
date: 2026-05-13
zweck: Manueller Vault-Session-Test der heutigen Implementierungen (Welle 2 + 3 + IMPs)
geprueft-gegen: dev = 8396d32, deployed via npm run build in NexusOS-Vault
scope:
  - FEAT-24-09 (Active Skills on-demand, cdd2d70)
  - FEAT-24-06 (MCP-Listing-Cap + read_mcp_tool + Built-in deferred, 00e4516)
  - FEAT-24-04 (Subagent-Delegation profile=research, 3190a70)
  - FEAT-24-07 (Hilfs-Modell-Routing, cc017ff)
  - IMP-24-06-01 (TOOL_METADATA-Drift fuer 13 neue Tools, 8396d32)
ausserhalb-scope:
  - Welle 1 (FEAT-24-01..03 Cache + Microcompaction + Tool-Output) -- schon in v2.7.3
  - IMP-24-09-01 (Dead Code Removal) -- kein Verhaltenswechsel, nur unit-test-verifiziert
---

# Live-Messlauf -- heutige Implementierungen (Welle 2+3+IMPs)

5 Tests fuer die heute auf `dev` gemergten Items. Jeder Test ist
selbst-enthalten (Setup, Aktion, Erwartung, was du mir zurueckgibst).
Reihenfolge spielt keine Rolle. Wenn ein Test fehlschlaegt: weiter, ich
werte am Ende aus.

---

## Vorbereitung (einmalig fuer alle Tests)

### Schritt V1: Plugin neu laden

In Obsidian `Cmd+P` -> "Reload app without saving". Der `npm run build`
von vorhin hat den dev-Stand (8396d32) schon in deinen NexusOS-Vault
deployed.

Verifiziere die Version: bei "Reload app" sollte das Plugin "Vault
Operator" mit dem dev-Bundle laden. Wenn du in der Sidebar auf das
Plugin-Icon klickst und einen Chat oeffnest, ist das der heutige Stand.

### Schritt V2: Developer Tools oeffnen

`Cmd+Option+I` (macOS) / `Ctrl+Shift+I` (Win/Linux). Tab "Console".

### Schritt V3: Console-Filter setzen

Im Filter-Feld oben rechts in der Console:

```
[CacheStat|[SystemPrompt|[InputBreakdown|[Cost|[FastPath|[subtask|read_skill|new_task|read_mcp_tool|find_tool|classifyText
```

Damit siehst du nur die relevanten Zeilen (Chrome DevTools nutzt `|` als
ODER).

### Schritt V4: Zwischen Tests

Nach jedem Test:

- Chat-Toolbar -> "Clear chat history" (neuer Konversations-Kontext).
- Console-Toolbar -> Clear console (oder `Cmd+K`).

Damit sind die Logs pro Test sauber getrennt.

---

## Test 1 -- FEAT-24-09: Active Skills on-demand

### Was getestet wird

1. **Cache-Stabilitaet:** Skill-Verzeichnis ist im stabilen Prompt-Praefix
   (vor `cache-breakpoint`); kein per-Message-Klassifikator-Call mehr.
2. **On-demand-Loading:** bei passender Aufgabe ruft das Modell selbst
   `read_skill({ name: ... })`; bei nicht-passender Aufgabe kein
   `read_skill` und kein Skill-Body in der History.

### Setup

- Mindestens ein Skill installiert. Pruefen: Settings -> Vault Operator
  -> Skills-Tab (oder `~/.../plugins/vault-operator/skills/`-Pfad).
- Bundled: `office-workflow`, `presentation-design` o.ae. sind dabei.
  Wenn keiner sichtbar: ein Skill ist immer vorhanden, sonst ist das
  Plugin-Bundle defekt -- in dem Fall melden.

### Aktion A -- passende Aufgabe

Neuer Chat. Tippe:

```
Erstelle mir eine Praesentation aus der Notiz <eine vorhandene .md-Datei>.
```

(Wenn `office-workflow` als Skill da ist; sonst tippe etwas, das zu einem
deiner installierten Skills passt.)

### Aktion B -- nicht-passende Aufgabe

Neuer Chat (Clear). Tippe:

```
Wieviel ist 17 mal 23?
```

### Erwartung im Chat

- **Teil A:** Agent ruft `read_skill({ name: "office-workflow" })`. Im
  Chat siehst du den Tool-Aufruf als gefaltete Box, danach folgt das
  Workflow-Ergebnis. Danach evtl. weitere Tools (z.B. `read_file`,
  `plan_presentation`, `create_pptx`) aus dem Workflow.
- **Teil B:** keine Tool-Aufrufe, nur eine direkte Textantwort `391`.

### Erwartung im Console-Log

- **Beide Teile:** scrolle hoch bis zum ersten `[SystemPrompt]`-Section-
  Char-Breakdown-Log nach deinem Prompt. Suche in der section-Liste:
  - ENTHAELT: `skill-directory` (wenn Skills installiert sind),
    `cache-breakpoint`.
  - ENTHAELT NICHT: `active-skills`, `self-authored-skills`.
  - Reihenfolge: `skill-directory` kommt VOR `cache-breakpoint`.
- **Teil A:** im Log eine Zeile mit `read_skill` als Tool-Start. NULL
  `classifyText`-Zeile (Filter zeigt nichts).
- **Teil B:** keine `read_skill`-Zeile, keine `classifyText`-Zeile.

### Rueckgabe an mich

```
### Test 1 (FEAT-24-09)

Teil A SystemPrompt-Sections:
<die [SystemPrompt]-Zeile mit der Section-Liste>

Teil A read_skill-Aufruf:
<die Zeile mit "read_skill" Tool-Start>

Teil B Befund:
"kein read_skill, kein classifyText" -- ODER zeig die unerwartete Zeile.
```

---

## Test 2 -- FEAT-24-06 + IMP-24-06-01: MCP-Listing-Cap + read_mcp_tool + deferred Built-ins

### Was getestet wird

1. **MCP-Description-Cap 200 chars** in der MCP-Listung.
2. **`read_mcp_tool({ server, name })`** liefert die volle Description +
   InputSchema-Summary.
3. **`inspect_self` / `update_settings` jetzt deferred** -- Agent muss
   `find_tool` rufen bevor sie nutzbar sind.
4. **Neue TOOL_METADATA-Eintraege** fuer 13 Tools (IMP-24-06-01) -- der
   `find_tool`-Ranker findet jetzt z.B. `recall_memory`, `search_history`,
   `ingest_deep`.

### Setup

- Mindestens ein MCP-Server verbunden. Settings -> MCP -> Status
  "connected".
- Wenn kein MCP-Server konfiguriert: Teil A + B ueberspringen, nur Teil
  C + D testen.

### Aktion A -- MCP-Listing-Cap (nur mit MCP-Server)

Neuer Chat. Tippe:

```
Welche MCP-Tools hast du verfuegbar? Liste sie nur auf, nicht aufrufen.
```

### Aktion B -- read_mcp_tool (nur mit MCP-Server)

Im selben Chat (oder neu):

```
Lade die volle Beschreibung des Tools <server>.<tool> ueber read_mcp_tool.
```

(`<server>` und `<tool>` ersetzen durch einen Eintrag den du in Teil A
gesehen hast.)

### Aktion C -- Built-in deferred Test

Neuer Chat (Clear). Tippe:

```
Lies meinen Plugin-Logs der letzten 5 Minuten. Filter auf Errors.
```

(Das Tool `read_agent_logs` ist nicht deferred -- siehe IMP-24-06-01.
Aber: `inspect_self` und `update_settings` sind nach FEAT-24-06 jetzt
deferred. Damit testen wir, dass `find_tool` greift wenn der Agent eine
Settings-Aenderung machen will.)

Lass es kurz laufen, dann zweite Frage im selben Chat:

```
Schalte das Auto-Approval fuer Note-Edits aus.
```

(Erwartet: Agent ruft `find_tool({ query: "settings" })`, kriegt
`update_settings` aktiviert, fragt dann `update_settings`.)

### Aktion D -- find_tool findet die neuen Metadata (IMP-24-06-01)

Neuer Chat (Clear). Tippe:

```
Welche meiner Notizen sind als Memory-Source registriert?
```

(Erwartet: `list_memory_source_notes` ist im deferred-Set nicht enthalten
-- es ist in `read`-Gruppe und nicht deferred. Aber: wenn der Agent vorher
nicht wusste was es tut, ruft er moeglicherweise `find_tool` -- in dem
Fall sollte `list_memory_source_notes` jetzt rankbar sein dank
IMP-24-06-01. Wenn der Agent direkt das Tool ruft, ist das auch OK.)

### Erwartung im Chat

- **Teil A:** Agent listet die MCP-Server + Tools mit kurzen
  Descriptions.
- **Teil B:** Agent ruft `read_mcp_tool`, Ergebnis ist ein Block:
  ```
  ## MCP TOOL: <server>.<name>
  **Description:** ...
  **Input schema summary:**
  - <prop>: <type>[, required]
  ```
- **Teil C:** Agent ruft `find_tool({ query: "settings" })`, dann
  `update_settings`.
- **Teil D:** Agent listet die Memory-Source-Notes (oder bestaetigt
  "noch keine").

### Erwartung im Console-Log

- **Teil A:** `[SystemPrompt]`-Section-Char-Breakdown zeigt Section
  `tools`/Section 4 mit messbarer Groesse. Wenn ein MCP-Tool eine sehr
  lange Description hat, ist die Section trotzdem kompakt (weil cap
  greift). Schwer ohne side-by-side-Vergleich messbar -- siehe
  "Rueckgabe" unten.
- **Teil B:** `read_mcp_tool`-Tool-Start-Zeile, kein Crash.
- **Teil C:** `find_tool`-Zeile, dann `activatedDeferredTool: update_settings`-
  Bestaetigung, dann `update_settings`-Tool-Start.
- **Teil D:** Tool-Start fuer `list_memory_source_notes` (oder via
  `find_tool` falls Agent unsicher; in dem Fall: das `find_tool`-Result
  zeigt jetzt `list_memory_source_notes: <description>` als Match --
  belegt IMP-24-06-01).

### Rueckgabe an mich

```
### Test 2 (FEAT-24-06 + IMP-24-06-01)

Teil A (wenn MCP verbunden):
<die [SystemPrompt]-Zeile mit Section-Char-Counts -- ich vergleiche mit
v2.7.3-Erwartung>

Teil B (wenn MCP verbunden):
<der ## MCP TOOL: ...-Block aus dem Chat>

Teil C:
<die find_tool-Tool-Result-Zeile + die direkt darauf folgende
"Activated update_settings"-Zeile>

Teil D:
<entweder direkter list_memory_source_notes-Aufruf
 ODER find_tool-Result mit list_memory_source_notes in den Treffern>
```

---

## Test 3 -- FEAT-24-04: Subagent profile='research'

### Was getestet wird

1. **Profile-Spawn bei Multi-Step-Recherche:** `new_task({ profile: 'research', ... })`.
2. **Reduzierte Tool-Liste im Subagent** (read-only, kein write).
3. **Parent-Kontext bleibt flach** nach Subtask-Abschluss.
4. **Token-Budget greift** bei zu langer Spawn-Message.

### Setup

- Mode: **Agent** (Pflicht; `new_task` ist nicht im Ask-Mode).

### Aktion A -- Recherche-Spawn

Neuer Chat. Tippe:

```
Such in meinem Vault alle Notizen, die das Wort "EPIC-24" erwaehnen, lies
die ersten 5 davon, und gib mir eine kompakte Zusammenfassung der
aktuellen Aufgaben und ihres Status.
```

### Aktion B -- Negativ-Test (kein ueber-Triggering)

Neuer Chat (Clear). Tippe:

```
Was steht im ersten Absatz von <eine Notiz>?
```

(Erwartet: KEIN `new_task`, der Agent ruft direkt `read_file`.)

### Aktion C -- Token-Budget-Trigger (optional, nur bei Lust)

Neuer Chat. Tippe eine extrem lange Aufgabenstellung -- z.B. paste
einfach 30000+ Zeichen Text mit der Frage "und spawne dafuer einen
Research-Subagent". Token-Budget Default ist 8000 -> 32000+ chars =
8001+ tokens estimiert -> Fehler.

### Erwartung im Chat

- **Teil A:** Agent ruft `new_task` mit `profile: "research"` und einer
  kompakten Message. Danach `[subtask]`-praefixierte Tool-Calls
  (`[subtask] search_files`, `[subtask] read_file` mehrfach). Ende: ein
  Sub-agent-completed-Block mit verdichteter Antwort.
- **Teil B:** direkt `read_file`-Tool-Call, KEINE `new_task`-Zeile.
- **Teil C:** Tool-Error mit Text "new_task message exceeds the per-call
  token budget: NNNN tokens > 8000 budget. Shorten the message ..."

### Erwartung im Console-Log

- **Teil A:** `new_task`-Tool-Start mit `profile: research`. Mehrere
  `[subtask] read_file` / `[subtask] search_files` Zeilen.
  `Sub-agent completed -- profile: research`. Bei einer Folge-Frage in
  demselben Chat: `[InputBreakdown:main-loop]` zeigt einen Parent-Turn
  der nur die Subtask-Summary enthaelt (~paar hundert Tokens), NICHT die
  5 read_file-Zwischen-Ergebnisse.
- **Teil B:** keine `new_task`-Zeile, kein `[subtask]`.
- **Teil C:** `new_task message exceeds the per-call token budget`-Zeile.

### Rueckgabe an mich

```
### Test 3 (FEAT-24-04)

Teil A:
- new_task-Aufruf-Zeile (mit profile=research argument)
- 3-5 [subtask]-Zeilen als Auswahl
- Sub-agent-completed-Block-Header

Folge-Turn (optional, wenn du eine Folge-Frage gestellt hast):
- [InputBreakdown:main-loop]-Zeile -- ich vergleiche die Token-Zahl mit
  einer "alle 5 reads sichtbar"-Schaetzung

Teil B Befund:
"kein new_task -- direkter read_file" ODER zeige die unerwartete
new_task-Zeile

Teil C (optional):
<die "exceeds the per-call token budget"-Fehlermeldung>
```

---

## Test 4 -- FEAT-24-07: Hilfs-Modell-Routing

### Was getestet wird

1. **Bei gesetztem `helperModelKey`** laeuft `condenseHistory` auf dem
   Hilfs-Modell.
2. **Bei leerem `helperModelKey`** bleibt das Verhalten identisch zu vor
   FEAT-24-07 (Haupt-Modell).
3. **Fail-closed:** wenn das Hilfs-Modell nicht erreichbar ist
   (ungueltige Config), fallback auf Haupt-Modell, kein Crash.

### Setup

- Settings -> Models: mindestens **zwei aktive Modelle**. Empfehlung:
  - Haupt: dein gewohntes (z.B. Sonnet 4.7)
  - Hilfs: ein guenstigeres (z.B. Haiku 4.5)
- `helperModelKey` setzen. Es gibt aktuell **keinen UI-Slider**. Setze es
  via einer der folgenden Methoden:
  - **Methode 1 (im Chat):** "Setze `helperModelKey` in den Settings auf
    den Key meines Haiku-Modells." Der Agent ruft `update_settings`. Er
    kann den Key per `inspect_self` oder via Modell-Lookup ermitteln.
  - **Methode 2 (manuell):** in
    `~/.../plugins/vault-operator/data.json` den Eintrag
    `"helperModelKey": "<haiku-key>"` ergaenzen und Plugin reloaden.
    Den Key findest du im Block `"activeModels"` unter `"name": "<haiku>"`.

Verifiziere: nach dem Set sollte `inspect_self area=settings` den
`helperModelKey` mit dem richtigen Wert zeigen.

### Aktion A -- Condensing triggern

Neuer Chat. Tippe eine Sequenz die viel Kontext-Wachstum erzwingt:

```
Lade die folgenden fuenf laengeren Notizen aus meinem Vault, vergleiche
sie und schreibe eine konsolidierte Zusammenfassung. <Such 5 lange
Notes aus.>

Erweitere die Zusammenfassung um zwei zusaetzliche Aspekte: 1) welche
offenen Punkte gibt es, 2) was waere der naechste Schritt. Schreibe das
Ergebnis in eine neue Notiz "Konsolidiert-2026.md".

Schreibe danach noch einen kurzen Action-Plan in eine zweite Notiz.

Pruefe dann beide Notizen nochmal, vergleiche sie und schlage Aenderungen
vor. Schreibe die Aenderungen direkt in beide Notizen rein.
```

Ziel: die Konversation wird gross genug, dass condensing greift.
condensing-Threshold default 80% des Kontextfensters.

### Aktion B -- Negativ-Test (Helper leer)

Wenn Test A geklappt hat: setze `helperModelKey` zurueck auf `""`,
Plugin reloaden, identische Sequenz fahren.

### Erwartung im Chat

- **Teil A:** mehrere read_file + write_file Operationen. Irgendwann
  signalisiert die Sidebar "Context condensed" oder die Token-Anzeige im
  Footer faellt deutlich.
- **Teil B:** dasselbe Verhalten funktional, aber Logs zeigen das
  Haupt-Modell.

### Erwartung im Console-Log

- **Teil A beim Condensing-Trigger:** eine `[CacheStat:...]`-Zeile mit
  `model: <Hilfs-Modell>` (z.B. `claude-haiku-4-5-...`). Alle anderen
  `[CacheStat:...]`-Zeilen zeigen das Haupt-Modell.
- **Teil B beim Condensing-Trigger:** dieselbe Zeile zeigt jetzt das
  Haupt-Modell.

### Rueckgabe an mich

```
### Test 4 (FEAT-24-07)

Teil A (helperModelKey gesetzt):
- die [CacheStat:...]-Zeile beim Condensing-Trigger (nur die eine in der
  ein anderes Modell als das Haupt-Modell auftaucht)

Teil B (helperModelKey leer, optional):
- die analoge Zeile -- sollte jetzt das Haupt-Modell zeigen
```

---

## Test 5 -- IMP-24-06-01 Drift-Test (1 Minute, kein UI-Interaction)

### Was getestet wird

Konsistenz-Test fuer TOOL_METADATA: dass alle 13 neu eingetragenen Tools
(plus die vorbestehenden) jetzt korrekt im System-Prompt-Tools-Block
beschrieben sind.

### Aktion

Keine UI-Aktion. Einfach in einem leeren Chat tippen:

```
Welche Tools hast du verfuegbar? Liste sie kompakt nach Gruppen auf.
```

### Erwartung im Chat

In der Liste sollten u.a. erscheinen:

- `anti_echo_search` (web-Gruppe)
- `configure_model` (agent)
- `ingest_deep`, `ingest_triage` (edit)
- `list_memory_source_notes` (read)
- `mark_for_memory`, `recall_memory`, `update_soul` (agent / memory)
- `mark_note_as_memory_source`, `unmark_note_as_memory_source` (edit)
- `read_agent_logs` (agent)
- `search_history` (read)
- `switch_mode` (agent)

UND: `create_canvas` darf NICHT mehr auftauchen (Legacy entfernt).
`check_presentation_quality` darf NICHT mehr auftauchen.

### Rueckgabe an mich

```
### Test 5 (IMP-24-06-01)

Die Tool-Listung aus dem Chat. Speziell:
- search_history erscheint: ja/nein
- list_memory_source_notes erscheint: ja/nein
- create_canvas erscheint: ja/nein -- DARF NEIN sein
- check_presentation_quality erscheint: ja/nein -- DARF NEIN sein
```

---

## Wie du den Console-Log am besten zurueckgibst

1. **Filtern:** Console-Filter wie in der Vorbereitung beschrieben
   eingestellt lassen.
2. **Pro Test bundeln:** kopiere mir pro Test einen kompakten Block --
   nicht den ganzen Log am Stueck. Format wie unter "Rueckgabe an mich"
   in jedem Test angegeben.
3. **Bei Fehlern:** zeig mir die unerwartete Zeile bzw. die Stelle wo
   der Test abbricht. Auch "Test 3 Teil A hing nach dem zweiten subtask
   read_file" ist eine sinnvolle Info.
4. **Wenn ein Setup-Schritt nicht klappt:** ueberspring den Test und
   schreib "Setup Test N gescheitert weil X" -- ich helfe.

## Cheatsheet: welche Log-Zeile belegt welche SC

| Test | SC | Log-Zeile die SC belegt |
|---|---|---|
| 1 | FEAT-24-09 SC-2 | `[SystemPrompt] sections: ... skill-directory ... cache-breakpoint` (keine active-skills/self-authored-skills) |
| 1 | FEAT-24-09 SC-3 | Tool-Start `read_skill name: <X>` bei passender Aufgabe |
| 1 | FEAT-24-09 SC-4 | Filter `read_skill` und `classifyText` zeigen 0 Zeilen waehrend Zahl-Frage |
| 2 | FEAT-24-06 SC-1 | `[SystemPrompt]` Section-Char-Breakdown fuer Section 4 (gegen v2.7.3 nur sinnvoll mit verbose MCP) |
| 2 | FEAT-24-06 SC-2 | Chat-Output `## MCP TOOL: <server>.<name>` mit Description + Input schema summary |
| 2 | FEAT-24-06 SC-4 | `find_tool`-Aufruf vor `update_settings`/`inspect_self` |
| 2 | IMP-24-06-01 | `find_tool`-Result rankt jetzt die 13 neuen Tools (z.B. `search_history`) |
| 3 | FEAT-24-04 SC-1 | Tool-Start `new_task profile: research` |
| 3 | FEAT-24-04 SC-2 | `[subtask] ...`-Tool-Calls sind read-only (kein write_file) |
| 3 | FEAT-24-04 SC-3 | `[InputBreakdown:main-loop]` Folge-Turn klein nach Subtask-Abschluss |
| 3 | FEAT-24-04 SC-4 | "exceeds the per-call token budget"-Fehler bei zu langer Spawn-Message |
| 4 | FEAT-24-07 SC-1 | `[CacheStat:...] model: <helper>` waehrend Condensing |
| 4 | FEAT-24-07 SC-2 | `[CacheStat:...] model: <main>` mit leerem helperModelKey |
| 5 | IMP-24-06-01 SC-1 | search_history / recall_memory / update_soul etc. in Tool-Listung sichtbar |
| 5 | IMP-24-06-01 SC-2 | create_canvas / check_presentation_quality NICHT in Tool-Listung |
