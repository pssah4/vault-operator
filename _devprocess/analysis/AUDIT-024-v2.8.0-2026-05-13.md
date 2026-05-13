---
id: AUDIT-024
project: vault-operator
date: 2026-05-13
scope: Vollstaendige Codebase nach v2.8.0 Release (Community-Plugin-Directory Readiness, sechs Phasen)
overall-risk: Low
predecessor: AUDIT-023 (EPIC-24 Wave 2/3, 2026-05-12)
release-recommendation: Green
---

# AUDIT-024: Vollstaendige Codebase nach v2.8.0 Release

## Executive Summary

Geprueft wurden 399 .ts-Files (91k LOC) nach dem v2.8.0-Release, der die Community-Plugin-Directory-Konformitaet abdeckt. Im Fokus standen die neuen Code-Pfade: OptionalAssetManager (Asset-Download mit SHA-Verifikation), runtimeWorker (Worker-Materialisierung im Vault), PluginPatchModal (Self-Modify ohne Plugin-Folder-Write), GlobalFileService (Legacy-Folder-Fallback) sowie das Removal von AssetProvisioner und PluginReloader.writeBundle.

Ergebnis: 0 Critical, 0 High, 1 Medium, 3 Low, 2 Info. Die zwei groessten Risiken aus dem Pre-v2.8.0-Stand (Self-Update via AssetProvisioner, Self-Update via PluginReloader) sind ersatzlos entfernt. Alle neuen Asset-Schreibpfade gehen ueber SHA-256-Verifikation und landen ausserhalb des pluginDir. npm audit meldet 0 Vulnerabilities in allen Severities.

Release-Empfehlung: **Green**. Die eine Medium-Finding (runtimeWorker Cache-Validierung per Byte-Length) ist Defense-in-Depth, nicht akut ausnutzbar, und kann ueber FIX-Item im Backlog landen.

## Scope der Iteration seit AUDIT-023

Sechs Commits im community-plugin-readiness Branch plus Merge:

- bccfad6 Phase 1+2+4+5a foundation
- 0b8f646 Wizard UI restructure + chat auto-start fix + package.json sync
- 585c5ca Phase 3 self-modify via download modal
- 2fb7262 source-hash race fix
- 974edc0 Install button UX
- ff20105 file-picker fallback
- 101bad4 Release v2.8.0

Neue Surfaces (security-relevant):

- src/core/assets/OptionalAssetManager.ts (Asset-Download, SHA-Verify, Vault-Storage)
- src/core/assets/assetHashes.ts (Pinned SHA-Konstanten)
- src/core/utils/runtimeWorker.ts (Worker-Code zu Vault-Datei materialisiert)
- src/ui/modals/PluginPatchModal.ts (Patch als Download statt Auto-Write)
- src/ui/settings/installFromFile.ts (Local-File-Picker mit Hash-Check)
- src/core/storage/GlobalFileService.ts (Legacy-Folder-Fallback ergaenzt)
- src/_generated/source-hash.ts (Build-time generierter SHA)

Entfernt:

- src/core/AssetProvisioner.ts (war Self-Update-Pattern)
- PluginReloader.writeBundle/deployAndReload/createBackup/rollback (war Self-Update-Pattern)
- vault-operator-assets.tar.gz aus Release-Pipeline

## Audit-Phasen

### Phase 1: Reconnaissance

Stack: Obsidian Plugin (TypeScript strict, Electron Runtime, ESBuild Bundler). Code 91376 LOC ueber 399 .ts-Files. 23 Runtime-Dependencies, 21 Dev-Dependencies. Plugin-Version 2.8.0, manifest.json + package.json + versions.json synchron.

Existierende Schutzmechanismen: AstValidator fuer Sandbox-Code, McpRateLimiter (AUDIT-015 H-1), pathValidation Helper (AUDIT-016 L-5), HTTPS-only via requestUrl, SafeStorage fuer API-Keys (ADR-019), PRIVACY.md mit Disclosure aller System-Identitaets-Reads.

### Phase 2: SAST

Geprueft per Grep-Pattern fuer CWE-Kategorien gegen die in v2.8.0 geaenderten Pfade.

| Check | Treffer | Status |
|-------|---------|--------|
| eval / new Function | 2 (Sandbox + AstValidator) | Bekannt, by design, AstValidator schuetzt |
| child_process | 2 (ProcessSandboxExecutor + McpTab) | spawnSync mit shell:false, AUDIT-007 M-5 fix bestaetigt |
| innerHTML | 0 (nur outerHTML als Read) | Sauber |
| Hardcoded secrets | 0 | Sauber |
| adapter.write nach pluginDir | 0 | AssetProvisioner-Removal vollstaendig |
| Path-Traversal in path.join mit user input | 0 | Sauber |

Findings siehe Abschnitt unten.

### Phase 3: OWASP Top 10

Per Kategorie:

| OWASP | Befund |
|-------|--------|
| A01 Broken Access Control | manage_source ist 'self-modify' approval-required. ToolExecutionPipeline gated ueber UI-Confirm. |
| A02 Cryptographic Failures | SHA-256 fuer Asset-Verifikation. Keine eigene Krypto. requestUrl ueber HTTPS hardcoded. |
| A03 Injection | Prompt Injection bekannt (AUDIT-003 H-1, by design bei permissive). SQL-Queries in MemoryDB escapen LIKE-Wildcards (AUDIT-016 M-2 fix). |
| A04 Insecure Design | Setup-Wizard fragt explizit User-Consent vor jedem Step. Default-Toggles fuer Provider auf OFF. |
| A05 Security Misconfiguration | webTools.enabled default off. vaultIngest.autoTrigger default off. Permissions default 'restrictive'. |
| A06 Vulnerable Components | siehe Phase 5 (SCA). 0 Findings. |
| A07 Authentication Failures | API-Keys via Electron SafeStorage encrypted (ADR-019). Sebastian's data.json zeigt _encrypted true. |
| A08 Software & Data Integrity | SHA-256 pinned fuer beide optional assets. GitHub Artifact Attestation generiert im Release-Workflow (verifiziert in 2.8.0 Release). |
| A09 Logging Monitoring | console.debug throughout, OperationLogger fuer agent actions, McpAuditLog fuer MCP-Calls. |
| A10 SSRF | requestUrl + hardcoded GitHub URL fuer Asset-Downloads. Web-Search-Tools nur ueber konfigurierte Provider (Tavily, Brave). |

### Phase 4: OWASP LLM Top 10

| LLM | Befund |
|-----|--------|
| LLM01 Prompt Injection | Bekannt, by design bei permissive Mode (AUDIT-003 H-1). 'balanced' und 'restrictive' Modes mitigieren ueber Tool-Approval. |
| LLM02 Insecure Output Handling | Tool-Outputs gehen direkt an LLM, nicht direkt ausgefuehrt. manage_source generierte main.js geht durch PluginPatchModal-User-Confirm (nicht auto-exec). |
| LLM03 Training Data Poisoning | N/A, Plugin trainiert nichts. |
| LLM04 Model DoS | API-Provider haben eigene Rate-Limits. consecutiveMistakeLimit (default 3) stoppt Loops. |
| LLM05 Supply Chain | SHA-pinned Optional-Downloads. npm-Dependencies via SCA (0 Findings). |
| LLM06 Sensitive Information Disclosure | Vault-Content geht an konfigurierten Provider (per Design). Notice 'Cloud provider selected' bei nicht-lokalen Providern. |
| LLM07 Insecure Plugin Design | manage_source action build/reload getrennt, jedes Mal User-Approval. PluginPatchModal verlangt manuellen File-Replace. |
| LLM08 Excessive Agency | Modes (Ask read-only, Agent full), permissions per category. consecutiveMistakeLimit. |
| LLM09 Overreliance | Neuer AI-Disclaimer unter dem Chat-Input ('Vault Operator is AI and can make mistakes'). |
| LLM10 Model Theft | N/A. |

### Phase 5: SCA

npm audit gibt 0 Findings in allen Severities (info / low / moderate / high / critical). 23 direct runtime deps, 21 dev deps. Override-Konstrukte in package.json fuer protobufjs, hono, dompurify (ADR-074) sind aktiv.

### Phase 6: Zero Trust + Code Quality

- **Input Validation an Trust-Boundaries**: OptionalAssetManager verifiziert SHA vor write. installFromBuffer ebenso. WriterLock validiert PID + Hostname. McpRateLimiter pro Token + Source-Interface.
- **Least Privilege**: ProcessSandboxExecutor uebergibt minimale env (PATH, HOME, USERPROFILE, LANG, NODE_PATH; APPDATA/LOCALAPPDATA/SYSTEMROOT nur auf Windows). Sandbox-Code ohne require, fs, fetch.
- **Defense in Depth**: SHA-pinned downloads + GitHub-attestation + manual user click fuer Asset-Install.
- **Fail-Closed Defaults**: enableMcpServer default false, webTools.enabled default false, autoTrigger.enabled default false.
- **Audit Trail**: OperationLogger persistiert in global-fs. McpAuditLog persistiert. consoleLogger fuer interne Events.
- **Resource Management**: ConsecutiveMistakeLimit, rate-limits in McpRateLimiter, content-cap in write_vault (AUDIT-016 M-1), per-message-cap in save_conversation (AUDIT-015 H-1).
- **Race Conditions**: WriterLock mit PID+Hostname (AUDIT-Klasse-B), atomic write in KnowledgeDB (FIX-12).
- **Hardcoded Credentials**: keine gefunden.
- **Debug Code in Production**: console.debug throughout, gated ueber debugMode-Setting an einigen Stellen.

## Findings

### M-1 (Medium): runtimeWorker Cache-Validierung per Byte-Length

**Severity**: Medium
**CWE-ID**: CWE-345 (Insufficient Verification of Data Authenticity)
**Location**: src/core/utils/runtimeWorker.ts:48-54
**Status**: Confirmed

**Risiko**: Die Cache-Invalidierung in ensureRuntimeWorker prueft nur die Datei-Byte-Length. Ein anderer Process mit Schreibzugriff auf den Vault-Pfad (anderes Obsidian-Plugin, externe Prozesse, OS-Level-Aktoren) koennte die Datei mit gleicher Byte-Length aber anderem Inhalt ueberschreiben. Beim naechsten Plugin-Start wuerde cp.spawn() den forge-code ausfuehren mit den Privilegien des Obsidian-Prozesses.

Sebastian dokumentiert die Limitierung explizit im File-Header ('It is not a content hash; a forged file of the same size would survive'). Praktische Ausnutzbarkeit ist niedrig, weil andere Plugins ohnehin im gleichen Trust-Level laufen.

**Remediation**: SHA-256-Hash des inlined Codes berechnen, in einem Sidecar `.sha256` neben der Datei persistieren, vor jeder Wiederverwendung verifizieren. Pattern identisch zu OptionalAssetManager. Aufwand: S (etwa 20 Zeilen Code).

**Code-Diff (Vorschlag)**:

```ts
import * as crypto from 'crypto';

export function ensureRuntimeWorker(plugin: Plugin, name: string, code: string): string {
    const adapter = plugin.app.vault.adapter as { getBasePath?: () => string };
    if (!adapter.getBasePath) {
        throw new Error('ensureRuntimeWorker requires a FileSystemAdapter (Desktop only)');
    }
    const basePath = adapter.getBasePath();
    const dirAbs = path.join(basePath, RUNTIME_DIR);
    const fileAbs = path.join(dirAbs, name);
    const sidecarAbs = fileAbs + '.sha256';

    const expectedSha = crypto.createHash('sha256').update(code, 'utf-8').digest('hex');

    try {
        const installedSha = fs.readFileSync(sidecarAbs, 'utf-8').trim();
        if (installedSha === expectedSha && fs.existsSync(fileAbs)) {
            return fileAbs;
        }
    } catch {
        // sidecar fehlt oder Hash mismatch -> rewrite
    }

    fs.mkdirSync(dirAbs, { recursive: true });
    fs.writeFileSync(fileAbs, code, 'utf-8');
    fs.writeFileSync(sidecarAbs, expectedSha, 'utf-8');
    return fileAbs;
}
```

### L-1 (Low): runtimeWorker Path-Traversal Defense-in-Depth fehlt

**Severity**: Low
**CWE-ID**: CWE-22 (Path Traversal)
**Location**: src/core/utils/runtimeWorker.ts:46
**Status**: Confirmed

**Risiko**: `path.join(dirAbs, name)` ohne Path-Traversal-Check. Aktuell wird `name` immer mit den Konstanten 'sandbox-worker.js' und 'mcp-server-worker.js' aufgerufen. Bei einem zukuenftigen Refactor, der `name` aus User-Input oder Plugin-Settings bildet, koennte ein Pfad wie '../etc/passwd' aus RUNTIME_DIR ausbrechen.

**Remediation**: Whitelist der erlaubten Worker-Namen oder Pruefung dass der resolved Pfad mit `dirAbs + path.sep` startet (analog zu GlobalFileService.resolvePath). Aufwand: XS (3 Zeilen).

### L-2 (Low): OptionalAssetManager Path-Traversal Defense-in-Depth fehlt

**Severity**: Low
**CWE-ID**: CWE-22 (Path Traversal)
**Location**: src/core/assets/OptionalAssetManager.ts:63-69
**Status**: Confirmed

**Risiko**: `filePath()` und `shaSidecarPath()` bilden den Pfad via Template-String mit `spec.filename`. Aktuell wird filename in buildRerankerSpec/buildSelfDevSourceSpec hardcoded als 'ort-wasm-simd-threaded.wasm' und 'plugin-source.json'. Bei einem zukuenftigen Refactor, der spec.filename dynamisch bildet, koennte '../../etc/passwd' aus dem assets-Folder ausbrechen.

**Remediation**: Pruefen dass `spec.filename` keine Path-Separator enthaelt, oder analog zu GlobalFileService.resolvePath() einen startsWith-Check ergaenzen. Aufwand: XS.

### L-3 (Low): OptionalAssetManager installFromBuffer ohne Size-Cap

**Severity**: Low
**CWE-ID**: CWE-400 (Resource Exhaustion)
**Location**: src/core/assets/OptionalAssetManager.ts:199
**Status**: Confirmed

**Risiko**: installFromBuffer akzeptiert beliebig grosse ArrayBuffer. Bei sehr grossen Files (z.B. 1 GB) wuerde der SHA-256-Digest viel Memory belegen und das Plugin lange blockieren. Aktuell trigger nur File-Picker, der User waehlt die Datei selbst, also kein hostiler Vektor.

**Remediation**: Optionaler Size-Cap (z.B. 50 MB) als zusaetzlicher Parameter. Bei Ueberschreitung freundlicher Error 'Datei zu gross, vermutlich falsche Auswahl'. Aufwand: XS.

### I-1 (Info): 404-Error-Handler in OptionalAssetManager.install ist redundant

**Severity**: Info
**Location**: src/core/assets/OptionalAssetManager.ts:148-171

**Beobachtung**: requestUrl wirft bei non-2xx eine Exception, plus es gibt ein zweiten 404-Check nach `response.status`. Beide werfen die gleiche Notice. Kein Bug, nur unnoetige Redundanz.

**Empfehlung**: Eine der beiden Stellen entfernen oder eine typisierte `AssetNotPublishedError`-Klasse einfuehren (was schon einmal in Arbeit war, dann revertet). Niedrige Prioritaet.

### I-2 (Info): PluginPatchModal compiledJs ist agent-controlled

**Severity**: Info
**Location**: src/ui/modals/PluginPatchModal.ts:19

**Beobachtung**: Der Modal nimmt einen vom Agent kompilierten JavaScript-String als `compiledJs` und bietet ihn dem User als Download an. Wenn der Agent durch Prompt-Injection kompromittiert ist, koennte beliebiger Code dem User als 'main.js' angeboten werden.

**Mitigation bereits vorhanden**: Info-Banner 'You replace main.js manually' plus Safety-Net-Hinweis 'before you replace main.js, copy your current main.js to main.js.bak somewhere safe'. User muss aktiv klicken und manuell ersetzen. Plus PluginPatchModal ist nur erreichbar nach `manage_source` Tool-Approval, der als 'self-modify' immer User-Approval verlangt.

Per Design akzeptiert. Restrisiko liegt beim User, der den Patch reviewen muss. Im PRIVACY.md ergaenzen waere sinnvoll.

## Positive Findings (was bereits gut umgesetzt ist)

- AssetProvisioner als Hauptursache des Self-Update-Errors **vollstaendig entfernt**. Kein Code-Pfad schreibt mehr in pluginDir.
- PluginReloader.deployAndReload + writeBundle + createBackup + rollback **vollstaendig entfernt**. PluginReloader.reload() bleibt als sauberer disable/enable-Wrapper.
- OptionalAssetManager.install verifiziert SHA-256 **vor** persist. Hash-Mismatch wirft, schreibt nichts.
- installFromBuffer hat die gleiche SHA-Verifikation, kein Bypass via Local-File.
- GitHub Artifact Attestation im Release-Workflow generiert fuer main.js, styles.css, ort-wasm und plugin-source.json (verifiziert in v2.8.0).
- PRIVACY.md dokumentiert os.hostname, process.env-Reads, setInterval+Network in Stufe3PeriodicJob, Third-Party-Services.
- Help-Tab in Settings verlinkt zur Doku, Disclosure pro Step im Setup-Wizard.
- AI-Disclaimer 'Vault Operator is AI and can make mistakes' unter Chat-Input (LLM09-Mitigation).
- GlobalFileService Legacy-Folder-Fallback erlaubt Bestandsuser-Daten ohne Migration zu behalten.
- 0 npm audit Findings ueber alle Severities.
- 0 hardcoded credentials in der Codebase.
- esbuild Build-Order-Race (Source-Hash) gefixt: source-bundle wird vor main bundle generiert.

## Fix-Loop Result

Pre-Audit Stand (committed in 2.8.0):
- 0 Critical
- 0 High
- 1 Medium (M-1 runtimeWorker cache)
- 3 Low (L-1, L-2, L-3)
- 2 Info (I-1, I-2)

Fix-Empfehlung an User: Option B (Fix nur P1, defer P2/P3 zu Backlog). P1 ist hier 0, also keine sofortigen Fixes noetig. M-1 als Backlog-Item, L-1/L-2/L-3 als Backlog-Items (Defense-in-Depth, nicht akut), I-1/I-2 als Doku-Hinweise.

## Release-Empfehlung

**Green** fuer v2.8.0 Public Release / Community-Plugin-Directory Submission.

Die zwei Hauptblocker aus dem ersten Review-Bot-Scan (Self-Update via Archive, fehlende Attestation, additional file) sind alle behoben. Die verbleibenden Bot-Warnings (os.hostname, process.env, setInterval+network, main.js >5MB) sind ueber PRIVACY.md disclosed und gehoeren zu legitimen Funktionsbereichen. Die Audit-Findings sind alle Defense-in-Depth, kein akuter Exploit-Vektor.

## Empfohlene Backlog-Items

| ID | Severity | Titel | Effort | Branch-Vorschlag |
|----|----------|-------|--------|------------------|
| FIX (von M-1) | Medium | runtimeWorker SHA-Cache statt Byte-Length | S | fix/runtime-worker-sha-cache |
| FIX (von L-1) | Low | runtimeWorker Path-Traversal Check | XS | fix/runtime-worker-traversal |
| FIX (von L-2) | Low | OptionalAssetManager Path-Traversal Check | XS | fix/asset-manager-traversal |
| FIX (von L-3) | Low | OptionalAssetManager Size-Cap fuer installFromBuffer | XS | fix/asset-manager-size-cap |
| DOC (von I-2) | Info | PRIVACY.md ergaenzen um Self-Modify-Patch-Risiko | XS | docs/privacy-self-modify |
