# Technische Regeln Vault Operator

> Max 150 Zeilen. Stabile Wahrheiten. Aenderungen passieren waehrend
> /architecture und /coding, wenn eine Regel ihre Bedeutung aendert.

## Stack

- Sprache: TypeScript (strict)
- Plattform: Obsidian Plugin (Electron via Obsidian)
- Build: esbuild mit Deploy-Plugin
- Tests: Vitest
- Lint: ESLint + Prettier
- AI SDKs: Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot
- DB: sql.js (WASM, KnowledgeDB) und MemoryDB-Tabellen daneben
- Vector: KnowledgeDB Vektor-Tabelle, qwen3-embedding-8b ueber OpenRouter

## Befehle

```bash
npm run build              # Production Build
npm run dev                # Watch-Mode mit Auto-Deploy
npm run deploy             # Nur Deploy
npm run test               # Vitest
npm run lint               # ESLint
npm run typecheck          # tsc --noEmit
```

Build und Deploy nach JEDEM Implementierungsschritt.

## Konventionen

- Functional components, named exports, PascalCase Klassen
- Conventional Commits: feat:, fix:, chore:, docs:, refactor:, style:
- Co-Authored-By Claude in jedem Commit
- Vault-Pfade ueber `vault.configDir`, niemals hardcoded `.obsidian`
- `instanceof` statt `as TFile` / `as TFolder`
- Floating Promises mit `void` prefix oder `.catch()`
- `unknown` statt `any`, mit Type Guards

## Obsidian Community Plugin Review-Bot Rules (zwingend)

| Verboten                            | Ersatz                                       |
|-------------------------------------|----------------------------------------------|
| `console.log()` / `console.info()`  | `console.debug()`, `.warn()`, `.error()`     |
| `fetch()`                           | `requestUrl` aus obsidian oder SDK-Clients   |
| `require()`                         | ES `import` (Ausnahmen siehe unten)          |
| Hardcoded `.obsidian`               | `vault.configDir`                            |
| `element.style.X = Y`               | CSS-Klassen `.agent-u-*` oder `style.setProperty()` |
| `innerHTML`                         | Obsidian DOM API (`createEl`, `createDiv`)   |
| `any` Types                         | `unknown` plus Type Guards                   |
| Floating Promises                   | `void` Prefix oder `.catch()`                |
| `as TFile` / `as TFolder`           | `instanceof` Checks                          |
| `Vault.delete()` / `Vault.trash()`  | `FileManager.trashFile()`                    |

`require()` Ausnahmen mit `// eslint-disable-line -- reason`:
- `require('electron')` in SafeStorageService
- `require('child_process')` im Sandbox-Bridge
- `require('fs')` fuer Knowledge-DB-Tooling
- `createSandboxExecutor`-Aufruf

Vollstaendige Referenz: `memory/review-bot-compliance.md`.

## Test-Patterns

- Integration-Tests primaer, Unit-Tests sekundaer
- Mocks: nur externe Services (Anthropic API, Obsidian Vault), nie
  interne Module
- Coverage-Schwelle: 30% lines, 35% functions

## Code-Qualitaet

- Fehler an der Wurzel beheben, nicht mit `eslint-disable` stillstellen
- Bei unbekannten APIs: Doku lesen, nicht raten
- Kein impliziter Datenverlust (DROP COLUMN, Schema-Rewrites) ohne
  explizite User-Freigabe
- KnowledgeDB-Migrationen: WriterLock VOR Spalten-Mutation acquiren
  (Lehre aus BUG-012)

## Build Output

- Plugin-Bundle: `main.js` im Repo-Root
- Deploy-Pfad ueber `.env` (`PLUGIN_DIR`), aktuell iCloud:
  `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/NexusOS/.obsidian/plugins/vault-operator/`

## Wegweiser

Fuer "wo lebt X?"-Fragen: `grep "<concept>" src/ARCHITECTURE.map` und
dann den JSDoc-Header der Entry-Point-Datei lesen. Diese Datei hier
listet Regeln, nicht Pfade.
