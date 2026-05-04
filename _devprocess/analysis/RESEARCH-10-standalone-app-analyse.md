# Obsilo Standalone App -- Machbarkeitsanalyse

> Analyse zur Entkopplung von Obsidian und Aufbau einer eigenstaendigen Electron-App.
> Erstellt: 2026-03-07

---

## 1. Ausgangslage

Obsilo ist ein Obsidian-Plugin mit 46+ Tools, Multi-Provider AI, Semantic Search, Document Intelligence,
Multi-Agent-Orchestrierung und umfangreichen Erweiterungs-Mechanismen (Skills, Rules, Workflows, MCP, Sandbox).

Obsidian dient als Runtime fuer drei Dinge:
1. **I/O-Schicht** (Vault API fuer Lesen/Schreiben)
2. **UI-Framework** (Sidebar, Modals, Settings, Editor)
3. **Platform Services** (requestUrl, safeStorage, Plugin-System)

Diese Analyse untersucht, was noetig waere, um Obsilo als eigenstaendige Electron-App zu betreiben --
mit vollem Funktionsumfang inklusive Wissensmanagement.

---

## 2. Drei moegliche Ausbaustufen

### Stufe A: Reiner Chat-Client (10-15 Tage)

Kein Wissensmanagement, kein Editor, kein Datei-Browser.
Nur AI-Chat mit Agent-Framework, Tools, Skills, MCP, Sandbox.

**Was bleibt:**
- Multi-Provider AI (Anthropic, OpenAI, Gemini, Ollama, Azure, OpenRouter, LM Studio)
- AgentTask + 6-Stufen-Pipeline
- Multi-Agent (Sub-Tasks, parallele Ausfuehrung)
- Mode System (Ask, Agent, Custom)
- Context Condensing + 3-Tier Memory
- Document Parsers (als Chat-Attachment-Input)
- Document Creation (PPTX, DOCX, XLSX als Download-Output)
- Skills, Rules, Workflows, MCP, Sandbox
- Safety (Approval, Audit Trail, safeStorage, Rate Limiting)
- i18n (6 Sprachen)

**Was wegfaellt:**
- Alle Vault-Tools (read_file, write_file, edit_file, list_files, search_files)
- Semantic Index / Search
- Canvas, Bases, Chat-Linking, Task Extraction
- VaultDNA, Plugin API Bridge
- Shadow Git Checkpoints

**Ergebnis:** Lokales, privacy-first ChatGPT mit Plugin-System.
USP: Erweiterbarkeit (Skills + MCP + Sandbox) + volle Datenkontrolle.

---

### Stufe B: Chat + Filesystem-Agent (20-25 Tage)

Agent arbeitet auf lokalem Filesystem statt Obsidian Vault.
Nutzer definiert Workspace-Ordner. Dateien werden im externen Editor geoeffnet.

**Architektur-Kern: StorageAdapter-Interface**

```typescript
interface StorageAdapter {
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  delete(path: string): Promise<void>;
  list(dir: string, options?: ListOptions): Promise<FileInfo[]>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<FileStat>;
  watch(callback: WatchCallback): void;
  getMetadata(path: string): Promise<FileMetadata>;
}
```

Zwei Implementierungen:
- `ObsidianStorageAdapter` -- wrappt Vault API (fuer bestehendes Plugin)
- `LocalStorageAdapter` -- wrappt Node.js fs (fuer Standalone)

Spaeter optional: S3, WebDAV, Google Drive, REST API Adapter.

**Was zusaetzlich zu Stufe A:**
- Alle Vault-Tools funktionieren (ueber StorageAdapter)
- Semantic Index (vectra, identisch, nur anderer Pfad)
- Shadow Git Checkpoints (isomorphic-git, identisch)
- File-Watching via chokidar (statt Vault-Events)
- Task Extraction, Chat-Linking (auf Filesystem adaptiert)

**Was wegfaellt gegenueber Obsidian-Version:**
- MetadataCache (Ersatz: gray-matter + remark-basierter Link/Tag-Parser)
- Wikilink-Aufloesung (Ersatz: eigener Datei-Index oder relative Pfade)
- Link-Update bei Rename (Ersatz: Scan + Replace)
- Plugin Bridge (Ersatz: MCP-Server + API-Adapter-System)
- Canvas (Ersatz: Mermaid/SVG oder weglassen)
- Obsidian-spezifisches Markdown-Rendering (Callouts, Embeds)

**Externer Editor Integration:**
- `shell.openPath(filePath)` oeffnet Datei in Standard-App
- chokidar erkennt externe Aenderungen und triggert Re-Index
- Vorteil: Nutzer kann eigenen Lieblings-Editor verwenden

---

### Stufe C: Vollstaendige Knowledge App (30-40 Tage)

Eigener Markdown-Editor, Datei-Browser, Graph View -- voller Obsidian-Ersatz mit AI.

**Zusaetzlich zu Stufe B:**

| Komponente | Bibliothek | Aufwand |
|---|---|---|
| Markdown-Editor | CodeMirror 6 (MIT, gleiche Engine wie Obsidian) | 5-7 Tage |
| Live-Preview | @lezer/markdown + CM6 Decorations | Teil des Editors |
| Datei-Browser Sidebar | React/Svelte Tree-Component | 2-3 Tage |
| Tab-System | Eigenes Tab-Management | 1-2 Tage |
| Wikilink-Support | CM6 Extension + remark-wiki-link | 1-2 Tage |
| Backlinks-Panel | Eigener Link-Index | 1-2 Tage |
| Graph View | d3-force oder cytoscape.js | 2-3 Tage |
| Quick Switcher (Cmd+O) | Fuzzy-Search ueber Dateinamen | 0.5 Tage |
| Daily Notes | Template + Datei-Erstellung | 0.5 Tage |
| Templates | Markdown mit Variablen-Substitution | 1 Tag |
| Split View | CM6 Multi-Editor-Layout | 1-2 Tage |
| Outline Panel | AST-Extraktion via remark | 0.5 Tage |

**Ergebnis:** Eine App die alles kann was Obsilo + Obsidian heute kann,
plus Unabhaengigkeit, freie Editor-Wahl, keine Review-Bot-Einschraenkungen.

---

## 3. Was 1:1 uebernommen wird (alle Stufen)

Diese Komponenten haben KEINE Obsidian-Abhaengigkeit:

- AI Provider Layer (src/providers/) -- reines SDK
- AgentTask + Pipeline (src/core/) -- reines TypeScript
- Document Parsers (src/core/document-parsers/) -- reines JS
- Document Creator (create_pptx, create_docx, create_xlsx) -- reines JS
- Semantic Index (vectra) -- reines Node.js
- MCP Client -- reines SDK
- Sandbox/Evaluator -- reines JS
- Skills, Rules, Workflows -- Markdown-basiert, liest vom Filesystem
- isomorphic-git -- reines Node.js
- Safety-Mechanismen -- reine Logik
- i18n -- reine JSON/TypeScript

---

## 4. Obsidian-Abhaengigkeiten und ihre Ersetzung

### I/O-Schicht

| Obsidian API | Standalone-Ersatz | Aufwand |
|---|---|---|
| Vault.read() / create() / modify() | fs.promises (Node.js) | Trivial |
| FileManager.trashFile() | shell.trashItem() (Electron) | Trivial |
| Vault.getFiles() | glob / rekursives readdir | Trivial |
| MetadataCache | gray-matter + remark (unified) | Mittel |
| File-Events | chokidar | Trivial |
| vault.configDir | Fester App-Config-Pfad (~/.obsilo/) | Trivial |

### UI-Schicht

| Obsidian API | Standalone-Ersatz | Aufwand |
|---|---|---|
| ItemView (Sidebar) | React/Svelte Component | Mittel |
| createEl/createDiv/appendText | Standard DOM oder JSX | Trivial |
| Modal, Notice, Setting | Eigene Components | Mittel |
| MarkdownRenderer.render() | marked / markdown-it | Leicht |
| Workspace Events | Eigenes Event-System | Leicht |
| CSS Theme System | CSS Custom Properties | Leicht |

### Platform Services

| Obsidian API | Standalone-Ersatz | Aufwand |
|---|---|---|
| requestUrl | Node.js fetch (kein CORS in Electron) | Trivial |
| safeStorage (via Electron) | Identisch (ist Electron, nicht Obsidian) | Null |
| Plugin Lifecycle | Eigener App Lifecycle | Leicht |
| app.plugins (Plugin Bridge) | MCP + API-Adapter-System | Mittel |
| Deep Links (obsidian://) | Eigenes URL-Schema (obsilo://) | Trivial |
| BRAT / Plugin Store | electron-updater + GitHub Releases | Leicht |

---

## 5. Was man verliert (ehrliche Bewertung)

| Verlust | Schwere | Kommentar |
|---|---|---|
| MetadataCache | Mittel | Nachbaubar mit gray-matter + remark (3-4 Tage) |
| Wikilink-Aufloesung | Niedrig | Eigener Index oder relative Pfade |
| Link-Update bei Rename | Niedrig | Scan + Replace (1 Tag) |
| Plugin Bridge (800+ Plugins) | Mittel | Kein direkter Ersatz, MCP ist die Alternative |
| Canvas | Niedrig | Format-Wechsel auf Mermaid/SVG |
| Deep Links (obsidian://) | Trivial | Eigenes Schema |
| Obsidian Markdown-Rendering | Niedrig | Standard-Renderer reicht fuer 95% der Faelle |
| Community Distribution | Niedrig | electron-updater + GitHub Releases |

**Fazit:** Kein Verlust der den Agent schwaecher macht. Nur Obsidian-spezifische
Convenience-Features und das Plugin-Oekosystem gehen verloren.

---

## 6. Was man gewinnt

- **Kein Obsidian-Lock-in** -- laeuft unabhaengig, keine Abhaengigkeit von Obsidians Geschaeftsmodell
- **Kein Plugin-Review-Bot** -- keine kuenstlichen Code-Einschraenkungen
  (innerHTML, console.log, fetch, any-Types, etc.)
- **Freie Editor-Wahl** -- eingebetteter CM6 oder externer Editor
- **Eigene Distribution** -- direkter Download, Auto-Updater, kein BRAT
- **API-Adapter statt Plugin-Bridge** -- offener, nicht auf Obsidian beschraenkt
  (Notion, Linear, GitHub, Todoist, Calendar, etc.)
- **Dual-Deployment moeglich** -- gleiche Codebasis, StorageAdapter-Interface,
  Obsidian-Plugin UND Standalone parallel pflegen

---

## 7. Schluessel-Bibliotheken (alle MIT-lizenziert)

| Zweck | Bibliothek | Lizenz |
|---|---|---|
| Editor | CodeMirror 6 | MIT |
| Markdown AST | unified / remark | MIT |
| Frontmatter | gray-matter | MIT |
| Wikilinks | remark-wiki-link | MIT |
| File-Watching | chokidar | MIT |
| Markdown-Rendering | marked / markdown-it | MIT |
| Graph Visualization | d3-force / cytoscape.js | MIT/BSD |
| Desktop Framework | Electron | MIT |
| Installer/Updater | electron-builder | MIT |
| Git | isomorphic-git | MIT |
| Semantic Index | vectra | MIT |

**Wichtig:** Obsidian ist NICHT Open Source (Closed Source, kostenlos fuer persoenliche Nutzung).
Der Quellcode ist nicht einsehbar. Alle oben genannten Ersatz-Bibliotheken sind unabhaengig
und sauber lizenziert.

---

## 8. Empfohlene Vorgehensweise

### Phase 1: StorageAdapter einfuehren (im bestehenden Plugin)
Das Interface und den ObsidianStorageAdapter in die bestehende Codebasis einfuehren.
Alle Tools auf StorageAdapter umstellen. Das Plugin funktioniert identisch,
aber die Codebasis ist entkoppelt. **Risiko: Null. Aufwand: 3-5 Tage.**

### Phase 2: Standalone-Prototyp (Stufe B)
Electron Shell + Chat UI + LocalStorageAdapter. Prueft ob die Entkopplung
tatsaechlich sauber funktioniert. **Aufwand: 15-20 Tage.**

### Phase 3: Editor-Integration (Stufe C, optional)
CodeMirror 6 einbetten, Datei-Browser, Tabs, Backlinks.
Nur wenn der Markt es verlangt. **Aufwand: 10-15 Tage.**

### Parallel-Pflege
Durch das StorageAdapter-Interface koennen beide Varianten
(Obsidian-Plugin + Standalone) aus derselben Codebasis gebaut werden.
Build-Target entscheidet, welcher Adapter und welches UI gebundlet wird.

---

## 9. Risiken

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| CM6-Integration komplexer als geschaetzt | Mittel | Hoch | Erst Stufe B (externer Editor), CM6 spaeter |
| Electron-Bundle zu gross | Niedrig | Mittel | Tree-Shaking, Code-Splitting |
| vectra-Performance bei grossem Index | Niedrig | Mittel | Bereits geloest im Plugin |
| Obsidian aendert Plugin API | Mittel | Mittel | StorageAdapter isoliert die Aenderung |
| Markt fuer Standalone zu klein | Mittel | Hoch | Stufe B als Validierung vor Stufe C |

---

## 10. Fazit

Die Entkopplung von Obsidian ist technisch unkompliziert. Der Agent-Kern hat keine
Obsidian-Abhaengigkeit. Die I/O-Schicht ist durch ein Interface austauschbar.
Das UI ist der groesste Posten, aber mit CodeMirror 6 und Standard-Web-Technologien machbar.

Der strategisch kluge Weg: StorageAdapter JETZT einfuehren (Phase 1),
damit die Option fuer spaeter offen bleibt -- ohne das bestehende Plugin zu gefaehrden.
