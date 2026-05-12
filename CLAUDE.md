# Obsidian Agent (Vault Operator) -- Projekt-Kontext

> Projekt-spezifische Anweisungen fuer Claude Code.
> Globale Arbeitsweise-Patterns stehen in `~/.claude/CLAUDE.md`.

---

## Projekt

Kilo Code Clone als Obsidian Plugin. AI-gesteuerter Agent mit 30+ Tools
fuer Vault-Management, Semantic Search, Canvas-Generierung und Multi-Agent-Orchestrierung.

## Tech Stack

- **Sprache:** TypeScript (strict)
- **Framework:** Obsidian Plugin API
- **Build:** esbuild mit Deploy-Plugin
- **Runtime:** Electron (via Obsidian)
- **AI APIs:** Anthropic SDK, OpenAI SDK

## Build & Deploy

```bash
npm run build              # Build
npm run dev                # Watch-Mode mit Auto-Deploy
npm run deploy             # Nur Deploy (ohne Build)
```

**Deploy-Pfad:** Aus `.env` (PLUGIN_DIR) -- aktuell iCloud: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/NexusOS/.obsidian/plugins/vault-operator/`

Build + Deploy nach JEDEM Implementierungsschritt.

## Referenz-Implementierung

`forked-kilocode/` enthaelt die originale Kilo Code Codebase.
Vor jeder neuen Feature-Implementierung dort das Pattern pruefen.

## Obsidian Community Plugin Review-Bot Rules

Diese Regeln MUESSEN eingehalten werden (sonst wird das Plugin abgelehnt):

| Verboten | Ersatz |
|----------|--------|
| `console.log()` / `console.info()` | `console.debug()`, `.warn()`, `.error()` |
| `fetch()` | `requestUrl` aus obsidian (oder SDK-Clients) |
| `require()` | ES `import` (Ausnahme: `require('electron')` in SafeStorageService) |
| Hardcoded `.obsidian` | `vault.configDir` |
| `element.style.X = Y` | CSS-Klassen (`.agent-u-*`) oder `style.setProperty()` |
| `innerHTML` | Obsidian DOM API (`createEl`, `createDiv`, `appendText`) |
| `any` Types | `unknown` + Type Guards, oder `obsidian-augments.d.ts` |
| Floating Promises | `void` Prefix oder `.catch()` |
| `as TFile` / `as TFolder` | `instanceof` Checks |
| `Vault.delete()` / `Vault.trash()` | `FileManager.trashFile()` |

Vollstaendige Referenz: `memory/review-bot-compliance.md`

## Architektur-Eckdaten

- **AgentTask:** api, toolRegistry, callbacks, modeService, consecutiveMistakeLimit, rateLimitMs, condensingEnabled, condensingThreshold, powerSteeringFrequency
- **ToolExecutionContext:** spawnSubtask, switchMode, signalCompletion, askQuestion, updateTodos, onApprovalRequired
- **SemanticIndexService:** vectra LocalIndex
- **Vault Tool Groups:** read, vault, edit (Details in memory/MEMORY.md)

## Wichtige Verzeichnisse

```
src/core/           -- AgentTask, Pipeline, Context
src/tools/          -- Alle 30+ Tools (je ein File)
src/providers/      -- AI Provider (Anthropic, OpenAI)
src/ui/             -- Sidebar, Settings, Modals
_devprocess/           -- Internes Wissensarchiv (nicht public)
forked-kilocode/    -- Referenz-Implementierung
```
