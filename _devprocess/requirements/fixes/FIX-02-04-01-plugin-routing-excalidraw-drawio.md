# BUG-018: Agent nutzt built-in `create_excalidraw` statt Excalidraw-Plugin (Plugin-Routing-Regression)

**Prioritaet:** P0 (User-Kernfeature, Plugin-Discovery / VaultDNA)
**Datei:** `src/core/tools/vault/CreateExcalidrawTool.ts` (Tool-Description),
`src/core/skills/SkillRegistry.ts` (Plugin-Routing-Hinweise im System-Prompt)
**Feature-Bezug:** FEAT-02-04 (Local Skills via VaultDNA)
**Entdeckt:** 2026-04-17 (User-Repro: "Erstelle Excalidraw aus Note")

---

## Problem

Wenn der User den Agent bittet, ein Excalidraw zu erstellen, ruft der Agent
das built-in `create_excalidraw` Tool auf. Dieses Tool zeichnet nur farbige
Boxen mit Labels (keine Pfeile, keine Freihand, keine Layer). Das
Excalidraw-Community-Plugin kann viel mehr und ist beim User installiert.

Aehnliches Problem bei Diagrams.net (drawio) Plugin: der Agent ruft entweder
nichts auf oder halluziniert ein `create_drawio` Tool.

User-Aussage: "Beides hat in frueheren releases funktioniert". Nicht
strukturiert getestet, also Regression-Zeitpunkt unklar.

## Root Cause Analyse

Zwei zusammenhaengende Faktoren:

1. **Built-in vs. Plugin-Skill Routing.** Der LLM sieht im Tool-Schema
   `create_excalidraw` mit Description "Create an Excalidraw drawing". Das
   ist die naechstliegende Wahl bei "erstelle Excalidraw". Plugin-Skills
   sind in der separaten PLUGIN SKILLS Sektion des System-Prompts gelistet,
   aber ohne harten Disambiguator gegen den built-in.

2. **Plugin-Skill-Discovery Latenz.** VaultDNA-Scanner laeuft beim
   `onLayoutReady`-Hook. Wenn der erste Tool-Call stattfindet bevor der
   Scanner durch ist, fehlt die PLUGIN SKILLS Sektion komplett. Aber:
   nach Plugin-Reload ist der Scanner schon durch (Console zeigt
   `[VaultDNA] Reclassification complete: 46 total skills`), also sollte
   die Sektion da sein.

Bei Drawio existiert kein built-in. Der LLM sollte dann das
Diagrams.net-Plugin via execute_command aufrufen. Wenn er das nicht tut,
ist die Plugin-Skills-Sektion entweder unklar oder nicht vorhanden.

## Auswirkung

- **Funktional:** Hoch. Excalidraw und Drawio sind populaere Plugins. User
  installiert sie BEWUSST und erwartet dass der Agent sie nutzt. Stattdessen
  produziert der Agent einen schlechteren built-in Output.
- **Vertrauen:** Sehr hoch. "Plugin-Awareness" ist eines der zentralen
  Werteversprechen von Vault Operator (VaultDNA).

## Fix Wave 1 (beta.2)

1. **`CreateExcalidrawTool.getDefinition()`** prueft beim Schema-Build, ob
   das Excalidraw-Plugin (id `obsidian-excalidraw-plugin`) aktiv ist. Wenn
   ja, ersetzt es die Description durch eine harte Anweisung "DO NOT USE
   THIS TOOL ... use execute_command ... ". Das eliminiert den built-in im
   tool-pick-Heuristik des LLMs.

2. **System-Prompt-Disambiguatoren** in `SkillRegistry.ts` ergaenzt um
   konkrete Excalidraw- und Drawio-Beispiele in der COMMON MISTAKES
   Sektion. Macht das Routing in Plugin-Skill-aware Vaults explizit.

## Fix Wave 2 (offen)

- Tool-Filtering im `rebuildPromptCache`: built-in Tools, fuer die ein
  Plugin-Aequivalent installiert ist, aus dem Tool-Schema komplett
  rauswerfen statt nur in der Description abzuraten. Robuster gegen LLMs
  die Descriptions ignorieren.
- Erweiterung der Plugin-Skill-Discovery: bei jedem Plugin-Toggle
  aktualisieren statt nur bei Plugin-Load.
- Telemetry: Counter pro Tool-Call ob built-in vs. execute_command genutzt
  wurde. Zeigt Routing-Drift fruh.

## Verifikation

1. Build und 326/326 Tests gruen.
2. Manueller Test in Vault MIT Excalidraw-Plugin: Agent ruft
   `execute_command(...)` statt `create_excalidraw`.
3. Manueller Test in Vault OHNE Excalidraw-Plugin: Agent ruft weiter
   `create_excalidraw` (Fallback) und nicht `write_file`.
