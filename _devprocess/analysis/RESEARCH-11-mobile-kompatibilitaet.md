# MOBILE-001: Kompatibilitaetsanalyse Obsilo auf iOS/Android

> Stand: 2026-03-08
> Status: Analyse abgeschlossen, Umsetzung offen

---

## 1. Ausgangslage

### Obsidian Desktop vs Mobile Architektur

| | Desktop | Mobile (iOS/Android) |
|---|---|---|
| **Runtime** | Electron (Chromium + Node.js) | Capacitor (WebView, kein Node.js) |
| **Plugin-Ausfuehrung** | JavaScript in V8 mit vollem Node.js-Zugriff | JavaScript in WebView -- nur Browser-APIs |
| **Dateisystem** | Node.js `fs` + Obsidian Vault API | Nur Obsidian Vault API (kein `fs`) |
| **Prozesse** | `child_process.spawn()`, `vm` Modul | Nicht verfuegbar |
| **Keychain** | Electron `safeStorage` | Nicht verfuegbar |
| **Plugin-Code** | Identische `main.js` wird geladen | Identische `main.js` wird geladen |

**Kernprinzip:** Derselbe Plugin-Code (`main.js`) laeuft auf beiden Plattformen. Features, die nur Obsidian-APIs nutzen, funktionieren automatisch. Features, die Node.js/Electron-APIs nutzen, crashen auf Mobile.

Plugins koennen sich via `Platform.isMobile` / `Platform.isDesktop` abfragen und Features bedingt aktivieren. Alternativ: `"isDesktopOnly": true` in `manifest.json` (aktueller Obsilo-Status).

---

## 2. Node.js-Abhaengigkeiten in Obsilo (Blocker)

### 2.1 Electron APIs (2 Dateien)

**SafeStorageService** (`src/core/security/SafeStorageService.ts`)
- `require('electron')` -- Zugriff auf OS Keychain (macOS Keychain, Windows DPAPI, Linux libsecret)
- `electron.safeStorage.encryptString()` / `decryptString()` -- API-Key-Verschluesselung
- `Buffer.from(b64, 'base64')` -- Base64-Dekodierung

### 2.2 child_process APIs (3 Dateien)

**ProcessSandboxExecutor** (`src/core/sandbox/ProcessSandboxExecutor.ts`)
- `require('child_process')` -- Spawnt separaten Node.js-Prozess fuer Sandbox
- `require('fs')` -- Prueft Worker-Pfad
- `cp.spawn()` mit `ELECTRON_RUN_AS_NODE=1` -- OS-Level Isolation
- `process.env` Zugriff (PATH, HOME, LANG, NODE_PATH)

**ExecuteRecipeTool** (`src/core/tools/agent/ExecuteRecipeTool.ts`)
- `import { spawn } from 'child_process'` -- Fuehrt Shell-Recipes aus (z.B. Pandoc)
- `process.platform` -- OS-Erkennung
- `process.env.PATH`, `process.env.HOME` -- Umgebungsvariablen

**sandbox-worker.ts** (`src/core/sandbox/sandbox-worker.ts`)
- `import { createContext, runInNewContext } from 'vm'` -- V8 Scope-Isolation
- `process.on('uncaughtException')` / `process.exit()` / `process.send()` -- IPC

### 2.3 File System APIs (3 Dateien)

**GlobalFileService** (`src/core/storage/GlobalFileService.ts`)
- `import fsModule from 'fs'` -- Alle Disk-I/O fuer `~/.obsidian-agent/`
- `import pathModule from 'path'` -- Pfad-Auflosung
- `import osModule from 'os'` -- `homedir()`
- Betrifft: Memory, Workflows, Skills, Logs, Settings, Episodes

**GitCheckpointService** (`src/core/checkpoints/GitCheckpointService.ts`)
- `import fs from 'fs'` -- Filesystem-Backend fuer isomorphic-git
- `import git from 'isomorphic-git'` -- Git-Operationen (braucht `fs`)

**SemanticIndexService** (`src/core/semantic/SemanticIndexService.ts`)
- `import * as path from 'path'` -- Pfad-Manipulation
- `import * as fs from 'fs'` -- Index-Dateien lesen/schreiben

### 2.4 VM Modul (1 Datei)

**sandbox-worker.ts** (`src/core/sandbox/sandbox-worker.ts`)
- `vm.createContext()` / `vm.runInNewContext()` -- Defense-in-Depth Scope-Isolation
- Nicht verfuegbar in Browser/WebView

### 2.5 Zusammenfassung Blocker

| Kategorie | Dateien | Desktop-Only |
|-----------|---------|--------------|
| Electron APIs | 2 | Ja |
| child_process | 3 | Ja |
| File System (fs) | 3 | Ja |
| path Modul | 3 | Ja |
| VM Modul | 1 | Ja |
| process.* | 5 | Ja |
| Buffer | 2 | Ja |

**11 harte Blocker in 8 Dateien** verhindern aktuell den Mobile-Betrieb.

---

## 3. Feature-Kompatibilitaetsmatrix

### 3.1 Funktioniert auf Mobile (nur Obsidian API / HTTP)

| Feature | Tools | Grund |
|---|---|---|
| Vault lesen/schreiben | `read_file`, `write_file`, `edit_file`, `append_to_file`, `move_file`, `delete_file` | Ausschliesslich `Vault` API |
| Vault Intelligence | `get_vault_stats`, `get_frontmatter`, `search_by_tag`, `get_linked_notes`, `get_daily_note`, `open_note`, `list_files`, `search_files` | Reine Obsidian API |
| Frontmatter | `update_frontmatter` | Obsidian API |
| Canvas und Bases | `generate_canvas`, `create_base`, `update_base`, `query_base` | JSON-Dateien via Vault API |
| Web-Zugriff | `web_fetch`, `web_search` | `requestUrl` ist plattformuebergreifend |
| LLM-Kommunikation | Anthropic, OpenAI Provider | HTTP via `requestUrl` / SDK |
| Agent-Steuerung | `ask_followup_question`, `attempt_completion`, `update_todo_list`, `switch_mode` | Reine Logik |
| Multi-Agent | `new_task` | Reine Logik |
| Context Condensing | Summarization | LLM-Call |
| Skills (Markdown) | `manage_skill` | Vault-Dateien |
| Chat Linking | Frontmatter-Stamping | Vault API |
| i18n | UI-Sprache | Reine Logik |
| Modes | ModeService | Reine Logik |
| MCP (SSE/HTTP) | `manage_mcp_server`, `use_mcp_tool` | HTTP-Transport |
| Office-Dokumente | `create_pptx`, `create_docx`, `create_xlsx` | `vault.createBinary()` (JSZip ist reines JS) |
| Dokument-Parsing | `read_document` | Pure JS-Parser |
| Plugin-Interaktion | `execute_command`, `call_plugin_api`, `enable_plugin` | Obsidian API |
| Logging | `read_agent_logs`, ConsoleRingBuffer | In-Memory |

**Ergebnis: ca. 35 von 47 Tools funktionieren auf Mobile ohne Aenderungen.**

### 3.2 Funktioniert NICHT auf Mobile

| Feature | Blockierende Abhaengigkeit | Moeglicher Mobile-Ersatz |
|---|---|---|
| Sandbox (OS-Level) | `child_process.spawn()`, `vm.createContext()` | `IframeSandboxExecutor` (existiert bereits) |
| Sandbox (esbuild WASM) | `new Function()` fuer WASM-Bootstrap | Web Worker -- muesste getestet werden |
| Recipe Execution | `child_process.spawn()` (Pandoc etc.) | Kein Ersatz -- Shell-Zugriff auf Mobile unmoeglich |
| API Key Encryption | `electron.safeStorage` + `Buffer` | Fallback auf unverschluesselten Storage mit UI-Warnung |
| Global Storage | `fs` Modul fuer `~/.obsidian-agent/` | Vault-lokaler Storage im `.obsidian/plugins/`-Verzeichnis |
| Semantic Index | `fs` + `path` fuer Index-Dateien | Umstellen auf Vault API fuer Index-Speicherung |
| Git Checkpoints | `isomorphic-git` braucht `fs` Modul | Vereinfachtes Snapshot-System via Vault API oder deaktivieren |
| Settings Sync | GlobalFileService mit `fs` | Vault-lokale Settings |

---

## 4. Portierungsplan

### 4.1 Einfach portierbar (geringer Aufwand)

**Sandbox** -- `IframeSandboxExecutor` existiert bereits als Fallback.
- Aenderung: `Platform.isMobile` Check in `createSandboxExecutor()`, dann Iframe statt Process.
- Risiko: Gering. Iframe-Sandbox ist funktional identisch, nur ohne OS-Level Isolation.

**API Key Storage** -- Fallback auf unverschluesselten Storage.
- Aenderung: `SafeStorageService` erhaelt `Platform.isMobile` Check.
- Mobile: Keys in `localStorage` oder Plugin-Settings (unverschluesselt).
- UI-Warnung noetig: "API-Keys werden auf Mobile nicht verschluesselt gespeichert."
- Risiko: Mittel. Sicherheits-Downgrade, aber akzeptabel mit Warnung.

**Recipe Execution** -- Auf Mobile deaktivieren.
- Aenderung: `ExecuteRecipeTool` wird bei `Platform.isMobile` nicht registriert.
- Risiko: Kein. Feature ist auf Mobile konzeptionell unmoeglich.

### 4.2 Mittlerer Aufwand

**Global Storage** -- Von `~/.obsidian-agent/` auf Vault-lokalen Storage umstellen.
- Aenderung: `GlobalFileService` erhaelt zweiten Adapter, der `vault.adapter` nutzt.
- Mobile-Pfad: `.obsidian/plugins/obsilo-agent/global-data/`
- Betrifft: Memory, Workflows, Skills, Logs, Episodes, Settings
- Risiko: Mittel. Daten sind dann Vault-spezifisch statt global.

**Semantic Index** -- `fs`/`path` durch Vault-API ersetzen.
- Aenderung: `SemanticIndexService` nutzt `vault.adapter.read/write` statt `fs`.
- Index-Pfad bleibt: `.obsidian/plugins/obsilo-agent/semantic-index/`
- Risiko: Gering. Funktional identisch, nur anderer I/O-Pfad.

**Git Checkpoints** -- Vereinfachen oder deaktivieren.
- Option A: Auf Mobile deaktivieren (`Platform.isMobile` Check).
- Option B: Vereinfachtes Snapshot-System ohne isomorphic-git (Vault API Copy).
- Risiko: Gering. Checkpoints sind Nice-to-have, nicht kritisch.

### 4.3 Zusaetzliche Aufgaben

**UI fuer kleine Bildschirme**
- Sidebar-View muss auf Smartphone-Breiten funktionieren.
- Touch-Targets vergroessern (min. 44x44px).
- Scrollverhalten und Keyboard-Handling pruefen.

**Testing**
- Obsidian Mobile hat einen Developer-Modus fuer Plugin-Entwicklung.
- Testen auf iOS (Safari WebView) und Android (Chrome WebView).
- Performance-Check: LLM-Streaming auf schwaecher Hardware.

---

## 5. Empfohlene Reihenfolge

```
Schritt 1: Platform-Guards einbauen
           - Platform.isMobile Checks in allen 8 betroffenen Dateien
           - Desktop-only Features graceful deaktivieren

Schritt 2: Storage-Fallbacks implementieren
           - GlobalFileService: Vault-lokaler Adapter
           - SafeStorageService: Unverschluesselter Fallback + Warnung
           - SemanticIndexService: Vault-API statt fs

Schritt 3: manifest.json aendern
           - isDesktopOnly: false

Schritt 4: UI-Anpassungen
           - Responsive Sidebar
           - Touch-Optimierung

Schritt 5: Mobile-Testing
           - iOS + Android mit Obsidian Mobile Developer Mode
           - Performance-Profiling
```

---

## 6. Strategische Entscheidung

**Ergebnis der Analyse:** Jetzt Obsidian festigen und Mobile-ready machen. Keine Plattform-Abstraktion fuer Notion/Logseq.

**Begruendung:**
- 75% der Tools (35/47) funktionieren bereits auf Mobile ohne Aenderungen
- Die 8 betroffenen Dateien sind klar identifiziert und isoliert
- Mobile-Bereinigung erzeugt automatisch saubereren Code als Basis fuer spaetere Diversifizierung
- Premature Abstraction waere teurer als spaetere Extraktion

**Abgrenzung Notion/Logseq (fuer spaeter dokumentiert):**
- Notion: Kein Plugin-System mit UI, nur REST API -- waere eigenstaendige Web-App
- Logseq: Plugin-API mit iframe-UI -- aehnlichste Architektur zu Obsidian
- Core Engine (Agent-Loop, Provider, Tool-Logik) ist ca. 40% des Codes und extrahierbar
- Details: Analyse in dieser Session dokumentiert, nicht weiter verfolgt
