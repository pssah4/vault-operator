---
id: ANALYSIS-companion-architecture
title: Companion-Architektur fuer Vault Operator -- Strategische Analyse
date: 2026-05-16
status: Draft (zur spaeteren Review)
related: EPIC-28, AUDIT-027
---

# Companion-Architektur fuer Vault Operator

## Kontext

Diese Analyse dokumentiert **Weg B** aus der Strategie-Diskussion vom 2026-05-16, in der drei Wege zum Obsidian-Community-Store-Listing diskutiert wurden:

- **Weg A** -- Capability-Reduktion (Lite-Build ohne fs/child_process)
- **Weg B** -- Companion-Architektur (Plugin schlank, Companion-App haelt die schweren Capabilities)
- **Weg C** -- Disclosure-Maximierung + manueller Review akzeptieren (gewaehlter Weg in EPIC-28)

EPIC-28 setzt Weg C jetzt um. Diese Analyse haelt Weg B als **dokumentierte Alternative** fest, damit eine spaetere Entscheidung (falls Weg C im Review scheitert oder das Listing-Ziel sich aendert) auf einer konkreten Architektur-Skizze basiert und nicht bei null anfaengt.

Die Analyse ist **nicht** Implementierungs-Plan. Sie ist Spec-Vorlauf: Trade-offs, Datenfluss, Migrationspfad, Setup-UX. Die Implementierung wuerde 4-8 Wochen Vollzeit kosten (4 wenn aggressiv, 8 mit sauberer Migration) und in ein eigenes EPIC laufen.

## Was Companion meint

Eine Companion-Architektur trennt das Plugin in zwei Artefakte:

1. **Vault Operator Plugin** (Obsidian-Plugin, im Community-Store) -- Chat-UI, Vault-API-Bindings, Provider-Settings, Skill-Library, Mode-Manager. Kein `fs`, kein `child_process`, kein dynamisches Code-Execution ausserhalb des Browsers. Klein, Store-tauglich, Fast-Track-fähig.

2. **Vault Operator Companion** (separate Electron-App, CLI oder lokaler HTTP-Daemon) -- KnowledgeDB (sql.js), SemanticIndex (vectra), Office-Pipeline (LibreOffice, pptx-automizer), Sandbox-Worker (Node child process), shadow-git Checkpoints, MCP-Server-Proxy, OAuth-Token-Store. Verteilt ausserhalb des Obsidian-Store via GitHub-Releases.

Das Plugin spricht mit dem Companion ueber ein lokales HTTP-Interface (loopback only, token-gated). Setup: User installiert das Plugin aus dem Obsidian-Store; beim ersten Start fragt das Plugin "Companion is required for advanced features. Install now?" und fuehrt den User durch den Download.

```
+--------------------+                          +-------------------------+
|  Obsidian renderer |                          |  Vault Operator         |
|                    |  HTTP loopback           |  Companion (Electron    |
|  Vault Operator    +--> 127.0.0.1:27182  -->  |  app or system daemon)  |
|  Plugin            |     Bearer token         |                         |
|  (Store-tauglich)  |                          |  KnowledgeDB / Semantic |
|                    |                          |  Index / Office /       |
|                    |                          |  Sandbox / Checkpoints  |
+--------------------+                          +-------------------------+
```

## Was bleibt im Plugin

Das Plugin enthaelt nur Features, die mit der Obsidian-API allein machbar sind:

- ChatView, ProviderSettings, ModeManager
- Vault-API-Bindings (read_file, write_file, edit_file, etc. nutzen `vault.*`)
- @-Mention-Attachments (rein UI, keine fs-Pfade)
- SystemPrompt-Builder, ToolRegistry, AgentTask-Pipeline (alles JS in-memory)
- Provider-SDKs (Anthropic, OpenAI, Bedrock, etc.) inkl. OAuth-Flows mit Token-Storage **via Obsidian-Settings** (data.json) -- safeStorage-Encrypted, kein fs noetig
- MCP-Client (HTTP/SSE only, kein stdio)
- Companion-Discovery + Companion-Heartbeat

Plugin-Bundle-Groesse-Schaetzung: ~1.2 MB statt aktuelle 4.3 MB. Hauptersparnis: sql.js + pptxgenjs + pptx-automizer + esbuild-wasm fallen weg.

## Was zieht in den Companion

| Feature | Plugin -> Companion via | Companion-Komponente |
|---------|-------------------------|----------------------|
| KnowledgeDB (memory v2, history search) | HTTP POST /memory/query, /memory/save | sql.js + WriterLock + Snapshots |
| Semantic Index | HTTP POST /semantic/search, /semantic/index | vectra + KnowledgeDB |
| Office-Erzeugung (PPTX/DOCX/XLSX) | HTTP POST /office/create | pptx-automizer + PptxGenJS + ExcelJS + docx |
| Sandbox (evaluate_expression) | HTTP POST /sandbox/run | ProcessSandboxExecutor + AstValidator + EsbuildWasmManager |
| Checkpoints | HTTP POST /checkpoints/snapshot, /checkpoints/restore | shadow-git, FS-Operationen auf vault |
| MCP-stdio-Server | HTTP POST /mcp/spawn, WebSocket /mcp/stream | child_process + JSON-RPC-Bridge |
| LibreOffice-Pipeline | im /office/create-Pfad | child_process (`soffice --headless --convert-to`) |
| Cloudflare-Tunnel | im /mcp/spawn-Pfad | child_process (`cloudflared tunnel --url`) |

Die HTTP-API ist intern. Der Companion bindet ausschliesslich auf 127.0.0.1, ist token-authentifiziert (Token wird beim Companion-Install generiert und ueber Obsidian-Settings ans Plugin uebergeben), und akzeptiert keine Verbindungen von ausserhalb localhost.

## Datenfluss-Beispiel: Semantic Search

Heute (Single-Plugin):

```
ChatView -> semantic_search Tool -> SemanticIndexService -> KnowledgeDB.search
   -> sql.js WASM in renderer -> Antwort -> Tool-Result -> Chat
```

Companion (split):

```
ChatView -> semantic_search Tool -> CompanionClient.searchSemantic(query)
   -> HTTP POST 127.0.0.1:27182/semantic/search { query, vaultRoot, token }
   -> Companion: KnowledgeDB.search -> sql.js -> Antwort
   -> HTTP 200 { results } -> Tool-Result -> Chat
```

Round-trip-Cost: ~5-15 ms zusaetzlich pro Aufruf (lokaler HTTP). Fuer Embedded-Tools (read_file etc.) zu teuer. Daher: nur fs/child_process-Operationen werden ausgelagert; Vault-API-Calls bleiben im Plugin.

## Setup-UX

Das ist die haerteste Designfrage in Weg B. Die Optionen, nach Komplexitaet:

### Option B.1: Manueller Companion-Download

Plugin zeigt beim ersten Start: "Companion installation required. Download from https://github.com/pssah4/vault-operator-companion/releases". User laedt manuell .dmg/.exe/.AppImage, installiert, gibt Token im Plugin ein. Schlechte UX, akzeptabel fuer Power-User.

### Option B.2: Plugin-getriebener Download

Plugin laedt den Companion-Binary beim ersten Start ueber GitHub-Releases-API, validiert SHA256, kopiert nach `<vault>/.obsidian/plugins/vault-operator/companion/`. Startet den Binary via... `child_process.spawn`. Damit ist das Plugin nicht mehr `fs`/`child_process`-frei und wir landen bei den gleichen Findings wie heute. **B.2 funktioniert nicht ohne erneutes Reviewer-Problem.**

### Option B.3: Native Messaging Host (wie Browser-Extensions)

Companion ist ein Native Messaging Host, registriert sich beim System (registry auf Windows, plist auf macOS, .desktop auf Linux). Das Plugin spricht ueber `chrome.runtime.connectNative` mit ihm. Funktioniert nicht: Obsidian ist Electron-Renderer, hat keinen Native-Messaging-Pfad ausser ueber `child_process.spawn` (siehe B.2).

### Option B.4: System Service / Daemon

Companion ist ein System-Daemon (systemd auf Linux, LaunchAgent auf macOS, Windows-Service). Installiert sich beim ersten Run als Service. Plugin sieht ihn nur via HTTP. **Auch hier: der erste Run muss irgendwie passieren. Entweder via separater Installer-App (B.4a) oder via `child_process.spawn` im Plugin (B.4b).** B.4a ist die einzige saubere Variante, kostet aber einen separaten Installer-Workflow pro Plattform.

### Option B.5: Hybrid -- Plugin macht den ersten Start

Plugin enthaelt einen kleinen Bootstrap (~50 LOC), der den Companion via `child_process.spawn` startet. Der spawn ist whitelist-gegated (nur der Companion-Pfad), `safeFs`-gegated (nur in Plugin-Daten-Dir). Damit hat das Plugin EINEN `child_process.spawn`-Call und EINEN `fs`-Call -- der Maintainer kann das in 5 Minuten reviewen. Alle anderen Capabilities liegen im Companion (nicht im Store).

**Pragmatisch ist B.5 die einzige Option, die das Plugin tatsaechlich im Fast-Track-Tier halten koennte.** Es hat _eine_ fs- und _eine_ spawn-Operation, beide auf einem fest definierten Binary-Pfad. Das ist deutlich weniger als die heutigen 15+ fs- und 7+ spawn-Stellen.

## Migrationspfad fuer existierende Installs

Mit ~unbekannte Anzahl BRAT-User. Migration muss schmerzlos sein:

1. **Version v3.0.0 = Plugin-Companion-Split.** Major-Bump, BRAT-Release-Notes mit Anleitung.
2. **Vor-Update-Snapshot.** Das v2.11.x-Plugin macht beim Update einen vollstaendigen Snapshot von `.obsidian/plugins/vault-operator/` nach `<vault>/.obsidian-agent/legacy-v2-backup/2026-MM-DD/`.
3. **Companion-Bootstrap-Modal.** Beim ersten v3-Start zeigt das Plugin einen Modal: "Companion required. Install now?" mit Buttons "Download and install" (lade .dmg/.exe/.AppImage von GitHub), "Skip (read-only mode)".
4. **Read-only-Mode-Fallback.** Wenn der Companion fehlt, laeuft das Plugin im read-only-Mode: kein Memory, keine Semantic Search, keine Office, keine Checkpoints, kein Sandbox. Nur Chat + Vault-Read. So bleibt das Plugin nutzbar auch ohne Companion.
5. **State-Migration.** Companion uebernimmt KnowledgeDB und SemanticIndex aus dem alten Plugin-Daten-Dir (`<vault>/.obsidian/plugins/vault-operator/knowledge.db`, `semantic-index/`).
6. **Settings-Migration.** Plugin-Settings (Provider, Skills, Modes) bleiben im data.json.

## Trade-offs Companion-Architektur

### Pro

- Plugin bekommt deutlich weniger Behavior-Findings (oder beim B.5-Hybrid genau zwei statt fuenf)
- Companion-App ist staerker isolierbar (eigener Prozess, eigene Daten, kein Renderer-Shared-State)
- Companion kann staerkere Capabilities einfuehren ohne Plugin-Review zu beeintraechtigen (z.B. Container-Sandboxing, gVisor, Wasm-Runtime-Hosting)
- Plugin-Bundle wird kleiner (~1.2 MB statt 4.3 MB), schnellere Loading-Zeit
- Bessere Trennung Concerns / Testbarkeit

### Contra

- Setup-Komplexitaet steigt drastisch (zweistufige Installation)
- BRAT-Userbase muss migriert werden; einige werden den Companion-Download nicht machen
- Operational Cost: zwei Release-Pipelines (Plugin via Obsidian-Store, Companion via GitHub-Releases mit drei Binaries je Release)
- Plattform-Coverage: Companion muss fuer darwin-x64/arm64, win32-x64, linux-x64 gebaut werden
- Local HTTP-Server ist neuer Attack-Vector (auch wenn loopback-only und token-gated)
- Companion-Updates muessen mit Plugin-Updates synchronisiert werden (API-Versionierung)
- Mobile-Obsidian-Support: das Plugin ist heute Desktop-Only (`isDesktopOnly: true`); Companion-Architektur zementiert das, mobile bleibt aussen vor

### Risiken bei der Umsetzung

- Round-trip-Latenz fuer haeufig genutzte Operationen (Memory-Recall, Semantic-Search) koennte UX-Regression bedeuten
- HTTP-Server-Crash im Companion = Plugin-Failure-Mode neu zu denken (heute crasht das Plugin gar nicht, weil alles in-renderer)
- Token-Management muss Plugin-Reload und Companion-Restart ueberleben
- Cross-Origin-Loopback-Restrictions koennten in zukuenftigen Chromium-Versionen einschraenken (vgl. CORS-fuer-private-network-Diskussion)

## Aufwandsschaetzung

Vollzeit-Mannwochen, grobe Schaetzung:

| Phase | Aufwand |
|-------|---------|
| Companion-Skeleton (Electron-Shell, HTTP-Server, Token-Gen, Bootstrap-CLI) | 1 Woche |
| Migration KnowledgeDB + WriterLock + Snapshots nach Companion (API + Tests) | 1 Woche |
| Migration SemanticIndex + Embedding-Provider-Calls nach Companion | 0.5 Woche |
| Migration Office-Pipeline nach Companion (LibreOffice-Setup, Binary-Download in Companion) | 1 Woche |
| Migration Sandbox-Worker + AST-Validator + EsbuildWasmManager nach Companion | 1 Woche |
| Migration Checkpoints + shadow-git nach Companion | 0.5 Woche |
| Migration MCP-stdio + Cloudflare-Tunnel nach Companion | 0.5 Woche |
| Plugin-seitiger CompanionClient + Read-only-Fallback + Setup-UX | 1 Woche |
| Migration-Pfad fuer existierende v2.11.x-Installs + State-Migration | 1 Woche |
| Release-Pipeline Companion (GitHub-Releases, Auto-Update-Check, Signing) | 0.5 Woche |
| Testing (alle Tools, alle Plattformen) + Beta-Phase | 1 Woche |
| Documentation, Security-Audit des Companion + Plugin-Refresh, Store-Submission | 0.5 Woche |
| **Gesamt** | **9.5 Wochen** |

Bei Halbzeit-Engagement (parallel zur normalen Plugin-Wartung): 4-6 Monate.

## Empfehlung

Weg B ist die architektonisch sauberste Antwort auf das Plugin-Store-Listing-Problem. Aber er hat hohen Setup-Friction-Preis und kostet Monate Entwicklung. Solange Weg C (Disclosure + safeFs + spawn-Allowlist aus EPIC-28) den manuellen Maintainer-Review erfolgreich passieren laesst, ist Weg B nicht noetig.

Trigger fuer einen Switch zu Weg B:

- Manuelle Maintainer-Reviews scheitern wiederholt trotz Weg C
- Plugin wird im Community-Store nach 6+ Monaten Submission nicht aufgenommen
- Sicherheits-Incident im Plugin-Kontext (Path-Traversal-Bug, Sandbox-Escape) zeigt, dass die heutige Trust-Boundary nicht ausreicht
- Neue Capabilities erfordern Process-Isolation, die in Electron-Renderer nicht moeglich ist (z.B. Container-Sandboxing)

Bis dahin: dieses Dokument bleibt Draft, EPIC-28 setzt Weg C um, und die Companion-Frage wird beim naechsten strategischen Review (Q4 2026 oder bei Trigger-Event) re-evaluiert.

## Offene Fragen fuer eine spaetere Phase

1. Welche Companion-Sprache? Electron mit shared Codebase (TypeScript, Wiederverwendung der Plugin-Module) oder eigenstaendig in Rust/Go fuer kleineren Binary?
2. Wie wird das Companion-Binary signiert (macOS Codesign, Windows Authenticode)?
3. Auto-Update des Companion: Plugin triggert oder Companion-eigener Updater?
4. Mobile-Strategie: bleibt Vault Operator Desktop-Only oder gibt es eine mobile-only Lite-Variante?
5. Companion als shared Service zwischen mehreren Vaults: ein Companion-Process kann mehrere Vaults bedienen, oder pro Vault einen Process?

Diese Fragen werden im EPIC-Spec geklaert, wenn der Switch zu Weg B beschlossen wird.
