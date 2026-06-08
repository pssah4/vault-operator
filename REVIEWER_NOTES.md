# Reviewer notes

This document describes what Vault Operator does on your machine, the trust
boundaries that govern its behaviour, and the mitigations in place for each
capability the Obsidian community plugin scanner flags. It is written for two
audiences: the community plugin reviewer who has to decide whether the plugin
behaves as advertised, and the security-aware user who wants to verify before
installing.

Vulnerability reporting contact and SLA: see [SECURITY.md](SECURITY.md).

The reviewer-oriented short version: there is no path from chat output (LLM
text) to `fs.*` or `child_process.spawn`. Filesystem access goes through
[src/core/security/safeFs.ts](src/core/security/safeFs.ts) with a hard
root-directory allowlist; process spawning goes through
[src/core/security/spawnAllowlist.ts](src/core/security/spawnAllowlist.ts)
with a hard binary allowlist (six logical binaries plus their platform
variants). Dynamic code execution lives only inside one of two sandboxes
(Chromium iframe or Node `vm.runInNewContext` worker process) with a
supplementary regex deny-list as a pre-compile filter. Internal audit
history is summarised in the "Audit history" section below; the audit
reports themselves live in a private development tree and can be shared
with the community plugin maintainer on request.

## Threat model

### Actors and trust assumptions

| Actor | Trust level | Why |
|------|-------------|-----|
| The user | Trusted | Configures providers, approves writes, installs the plugin |
| The Obsidian host | Trusted | Plugin runs in the same renderer process |
| The LLM provider (Anthropic, OpenAI, etc.) | Untrusted output | LLM responses are treated as adversarial input |
| Third-party MCP servers | Untrusted | The user can configure remote MCP servers (HTTP / SSE only -- see "Shell execution"); their responses are treated as adversarial |
| npm packages loaded from `esm.sh` / `cdn.jsdelivr.net` / `unpkg.com` / `registry.npmjs.org` | Untrusted | User-initiated; mitigated by sandbox + SHA-256 integrity pinning (TOFU + build-time) |
| Local files outside the vault and outside the plugin data dir | Out of scope | The plugin must never read or write them |

### Primary trust boundaries

1. **Plugin <-> LLM provider.** Every byte of LLM output is treated as
   untrusted. Tool arguments parsed from LLM output are checked against each
   tool's declared `input_schema` before execution (required fields, declared
   types, enum constraints) via a lightweight in-tree validator
   ([src/core/tool-execution/inputSchemaValidator.ts](src/core/tool-execution/inputSchemaValidator.ts),
   no `ajv`/`zod` dependency; defense-in-depth only, not a full JSON Schema
   validator -- no nested-object / `pattern` / `oneOf` / `min`/`max` checks).
   Path-traversal and write-target governance are enforced separately
   (see "Direct filesystem access" and "Vault enumeration" below). The
   vault tool API only accepts vault-relative paths.
2. **Plugin <-> vault.** Vault reads and writes go through the Obsidian
   `vault.*` API. The community plugin scanner correctly marks Vault Read
   and Vault Write as Pass.
3. **Plugin <-> sandbox.** Code executed via `evaluate_expression` runs in
   one of two isolated layers: a Chromium iframe (browser sandbox, no Node)
   or a Node `vm.runInNewContext` worker (no `require`, no `process`, no
   filesystem unless explicitly bridged).
4. **Plugin <-> system.** Everything outside the vault, including the system
   temp directory, the user-home Claude/Codex desktop config directories,
   and the plugin data directory, is gated by `safeFs` and `spawnAllowlist`.

## Capability disclosure

The Obsidian community plugin scanner reports five behaviour findings on the
v2.11.x release. Each is necessary for a specific plugin feature; each is
gated by a specific mitigation.

### Direct filesystem access (`fs`)

**Why we use it.** The plugin maintains a local knowledge database, a
semantic search index, a shadow-git checkpoint store, an office document
pipeline (PPTX, DOCX, XLSX, PDF), a persistence layer with atomic writes and
daily snapshots, and a token store for OAuth and MCP credentials. None of
these can be implemented through the Obsidian vault API alone (sql.js needs
deterministic file handles for WAL-style writes; office tools need temp
files for binary pipelines; checkpoints need a git binary which itself needs
a real filesystem).

**Mitigation.** Every `fs` operation in the plugin goes through
[src/core/security/safeFs.ts](src/core/security/safeFs.ts). At plugin
startup, `safeFs.initialize(allowlist)` is called with the following root
directories:

```
1. <vault>                                      -- the Obsidian vault root
2. <vault>/.obsidian/plugins/vault-operator/    -- plugin data dir
3. <vault>/.obsilo-vault/                       -- agent config dir
                                                   (default, user-configurable)
4. <os.tmpdir()>                                -- system temp dir
5. Desktop config dirs (MCP / OAuth):
   ~/.config/Claude/, ~/Library/Application Support/Claude/,
   %APPDATA%\Claude\, ~/.obsidian-agent/
6. <vault-parent>/obsilo-shared/                -- cross-vault shared dir
                                                   (optional, only when enabled)
```

Every read and write goes through `assertAllowed(path)`, which uses
`path.resolve(path)` (lexical, no symlink resolution) and `path.relative(root,
path)` to verify the path falls under at least one of the roots. Paths
that escape via `..` or absolute paths outside the allowlist throw
`SafeFsViolation` and the operation is rejected.

**Why this is enough.** The LLM cannot construct an `fs` call directly. Tools
that take vault paths (`read_file`, `write_file`, `edit_file`, etc.) use the
Obsidian `vault.*` API, not `fs`. The only paths that ever reach `fs` are
hard-coded by the plugin author at compile time (database filenames, index
filenames, checkpoint subfolder, etc.) or constructed from the vault path
plus a fixed suffix.

**What would break this.** A new feature that takes a user-controlled path
and passes it to `safeFs` without confining it to a fixed subdirectory, or
a new `import 'fs'` outside the wrapper. The test suite includes
path-traversal cases against `assertAllowed` (see
[src/core/security/__tests__/safeFs.test.ts](src/core/security/__tests__/safeFs.test.ts));
the "one file owns the wrapper" rule is enforced by code-review discipline
plus the file-header comment in `safeFs.ts`, not by an automated CI grep.

### Shell execution (`child_process`)

**Why we use it.** The Node-based sandbox worker spawns a child process for
isolation (`evaluate_expression` runs there, not in the Obsidian renderer).
The shadow-git for vault checkpoints calls `git`. The remote-MCP-server
feature spawns a Cloudflare Tunnel (`cloudflared`) for inbound HTTPS
exposure. The office pipeline spawns LibreOffice (`soffice`) for headless
conversion. The optional document-conversion recipes spawn `pandoc`. Binary
discovery uses `which`/`where`.

**Mitigation.** Every spawn goes through
[src/core/security/spawnAllowlist.ts](src/core/security/spawnAllowlist.ts).
The allowlist is hard-coded; below are the six logical binaries and their
platform variants:

```
node, node.exe                                   -- sandbox worker process
which, where, where.exe                          -- binary discovery
git, git.exe                                     -- shadow git for vault checkpoints
soffice, soffice.exe, soffice.bin,
libreoffice, libreoffice.exe                     -- LibreOffice headless conversion
cloudflared, cloudflared.exe                     -- remote MCP server tunnel
pandoc, pandoc.exe                               -- ExecuteRecipeTool document conversion
```

`spawnAllowed(command, args, options)` rejects:

- A `command` whose `path.basename` is not on the allowlist
- A `command` containing shell metacharacters (regex
  `/[;&|`$<>(){}\\\n\r]/` -- covers `;`, `&`, `|`, backtick, `$`, `<`, `>`,
  `(`, `)`, `{`, `}`, `\`, CR, LF)
- An `options.shell` set to `true` or any truthy value; `options.shell` is
  unconditionally overwritten to `false` for both `spawn` and `spawnSync`

`cp.exec` and `cp.execSync` are not re-exported. Shell-string interfaces
have no place in this codebase.

**Why this is enough.** The LLM cannot construct a spawn directly.
`ExecuteRecipeTool` only resolves recipes from a fixed in-bundle
`BUILT_IN_RECIPES` list plus a user-editable `customRecipes` list
([Settings > Advanced > Shell](src/ui/settings/ShellTab.ts)); both kinds run
through the same parameter validator (`validateRecipeParams` against the
recipe's typed `parameters` schema -- types include `vault-file`,
`vault-output`, `enum`, `safe-string` with regex `pattern`, `number` with
`min`/`max`) before substitution. The recipe binary is always resolved via
the spawn allowlist, so a custom recipe with a non-allowlisted binary
(e.g. `rm`) cannot spawn. Recipe execution has a master toggle plus a
per-recipe toggle in settings (default: disabled).

The MCP **client** (`McpClient`) connects only via Streamable-HTTP or SSE
transports -- there is no stdio-spawn path in the plugin today. Users who
want to use stdio-only MCP servers (e.g. Playwright MCP) must run them
externally and connect via their HTTP gateway.

**What would break this.** A new feature that takes a user-controlled binary
name and passes it to `spawnAllowed`, or a new entry in `ALLOWED_BINARIES`
that is not strictly necessary. The allowlist is small enough that every
addition is a deliberate diff and visible in code review.

### Vault enumeration

**Why we use it.** Semantic search builds an index over every markdown file
in the vault. `list_files` lets the user inspect vault structure. Map-of-
Content (MOC) generation and ingest-workflow tools iterate vault contents.

**Mitigation.** All vault enumeration goes through Obsidian's `vault.*` API.
The plugin only sees file paths and their contents on demand; it does not
upload the vault. Network usage is documented separately in the README.

### Clipboard access

**Why we use it.** Several "Copy" buttons across the UI (chat reply,
system-prompt preview, history-panel markdown link, MCP token, plugin path,
soak-report JSON) write generated text to the clipboard via
`navigator.clipboard.writeText`. The chat textarea also has a standard
browser `paste` event listener that captures images pasted from the
clipboard (e.g. screenshots) and attaches them to the next message.

**Mitigation.** Clipboard access is only triggered from user UI actions
(button clicks for writes; the `paste` listener only fires when the user
explicitly pastes into the chat textarea). `navigator.clipboard.readText()`
is **never** called -- the plugin does not poll or background-read the
clipboard.

### Dynamic code execution

**Why we use it.** The `evaluate_expression` tool runs LLM-generated
JavaScript inside a sandboxed runtime. This is a deliberate feature: it
lets the agent perform bulk transformations, generate office documents,
and call utility code -- optionally pulling npm packages from the
documented CDN allowlist (`esm.sh`, `cdn.jsdelivr.net`, `unpkg.com`,
`registry.npmjs.org`).

**Mitigation.** Generated code never executes directly in the plugin
context. Multiple layers stand between LLM output and code execution:

```
LLM output (untrusted)
  -> Tool input_schema check (inputSchemaValidator.ts -- required/type/enum;
                              defense-in-depth, see Threat-model boundary 1)
  -> AstValidator.ts -- supplementary regex deny-list applied to the source
                        BEFORE compilation. Patterns: eval (literal,
                        indirect (0,eval), computed ["eval"]),
                        new Function, require(), dynamic import(),
                        process, __proto__, .constructor.constructor,
                        arguments.callee, globalThis, child_process,
                        execSync, spawnSync, setTimeout/setInterval with
                        string argument, .prototype.constructor,
                        [].constructor, WebAssembly. Comments are stripped
                        first. Self-characterised as "supplementary, NOT
                        the primary security boundary" -- the boundary is
                        the sandbox itself.
  -> esbuild transform (TypeScript -> ES2022 IIFE) or esbuild bundle for
     npm imports
  -> ONE of:
     ProcessSandboxExecutor (Desktop, ADR-021)
       -> child_process.spawn (via spawnAllowlist) of `node` with
          --max-old-space-size=128, ELECTRON_RUN_AS_NODE=1, minimal env
          (PATH, LANG, NODE_PATH, HOME/USERPROFILE/APPDATA only -- the
          parent's secrets in process.env do not propagate)
       -> vm.createContext + vm.runInNewContext (separate V8 realm,
          no `process` / `require` / `fs`)
       -> realm globals expose only language primitives (JSON, Math,
          Object, Array, typed arrays, ...) plus the bridge proxies
          `vault` and `requestUrl` (both `Object.freeze()`-d). The user
          code's `.execute(input, ctx)` is called with `ctx = { vault,
          requestUrl }`.
       -> 30 s execution timeout (process side); 15 s bridge-call timeout
          (worker side)
     IframeSandboxExecutor (Mobile / fallback)
       -> sandboxed iframe in the renderer (CSP `default-src 'none';
          script-src 'unsafe-inline' 'unsafe-eval'`); same bridge
          protocol via `postMessage` instead of IPC; relies on the
          parent-side SandboxBridge for all security checks.

  Both sandboxes share the parent-side SandboxBridge:
   -> URL allowlist (`unpkg.com`, `cdn.jsdelivr.net`, `registry.npmjs.org`,
      `esm.sh`); HTTPS-only; no IP literals / `localhost`; no non-443 ports
   -> Vault write path validation (rejects `..`, leading `/`, leading `\`,
      and any path under `vault.configDir/`)
   -> Prototype-pollution check on request payloads (rejects keys
      `__proto__`, `constructor`, `prototype`)
   -> Per-write size limit: 10 MB
   -> Per-minute rate limits: 10 writes/min, 5 outbound HTTP requests/min
   -> Circuit breaker: 20 consecutive errors trips the bridge for 30 s
```

npm packages used inside the sandbox are resolved by
`EsbuildWasmManager.ts`. Versions come from `https://registry.npmjs.org/`,
content is fetched from `esm.sh` or `cdn.jsdelivr.net`, and every fetched
artifact is SHA-256-hashed: the hash of an esbuild-wasm asset is matched
against a build-time pinned constant
(`INTEGRITY_HASHES` in `EsbuildWasmManager.ts`); the hashes of npm packages
are persisted on first download (TOFU) in `dev-env/package-hashes.json`
and re-checked on every subsequent load.

`new Function(...)` appears in plugin source in four well-scoped places:

1. [src/core/sandbox/sandbox-worker.ts:112](src/core/sandbox/sandbox-worker.ts#L112)
   -- inside `vm.runInNewContext`; the constructed function inherits the
   vm-realm scope (no `process`, no `require`).
2. [src/core/sandbox/sandboxHtml.ts:74](src/core/sandbox/sandboxHtml.ts#L74)
   -- inside the iframe runtime, executing the LLM-supplied code after
   the regex deny-list and esbuild transform have run.
3. [src/core/sandbox/EsbuildWasmManager.ts:238](src/core/sandbox/EsbuildWasmManager.ts#L238)
   -- loads the SHA-256-verified esbuild-wasm CommonJS bundle, via the
   indirect form `Object.getPrototypeOf(function(){}).constructor` so the
   literal does not appear in the file.
4. [src/core/assets/BundleLoader.ts:128](src/core/assets/BundleLoader.ts#L128)
   -- loads SHA-256-verified optional asset bundles (e.g. office, pdfjs),
   same indirect form, same trust argument (hash-verified before
   loading).

## Sandbox architecture

```
                        +-----------------------------+
                        |  Obsidian renderer process  |
                        |                             |
   chat input  -------->|  AgentTask + tool registry  |
                        |                             |
                        +--+----------------------+---+
                           |                      |
            +--------------+                      +------------+
            |                                                  |
            v                                                  v
  +-------------------+                               +---------------------+
  |  iframe sandbox   |                               |  ProcessSandbox     |
  |  (Chromium SOP +  |                               |  Executor           |
  |   in-process)     |                               |  (Node child proc)  |
  |                   |                               |                     |
  |  vault + http via |                               |  vm.createContext + |
  |  postMessage      |                               |  vm.runInNewContext |
  |                   |                               |  (isolated V8 realm)|
  +-------------------+                               +---------------------+
            |                                                  |
            v                                                  v
       Chromium SOP                                  Process isolation
                                                     (own PID, no IPC
                                                      except stdio bridge)
```

Both sandboxes share the parent-side `SandboxBridge` and expose the same
two bridge proxies to user code: `ctx.vault` and `ctx.requestUrl` (both
`Object.freeze()`-d). The pre-compile regex deny-list (`AstValidator`,
patterns listed under "Dynamic code execution" above) is applied to the
user source in both paths. Per-write size limits, per-minute rate limits,
and the circuit breaker live in `SandboxBridge` and apply to both sandboxes
identically.

## Audit history

| Audit | Date | Scope | Verdict |
|-------|------|-------|---------|
| AUDIT-001 | 2026-03-01 | Initial baseline | Green |
| AUDIT-002 | 2026-03-04 | Pre-release sanity | Green |
| AUDIT-003 | 2026-03-06 | First public-release audit (full SAST + OWASP Top 10 + OWASP LLM Top 10) | Green |
| AUDIT-004 | 2026-03-23 | Office pipeline addition | Green |
| AUDIT-005 | 2026-04-01 | Remote MCP transport | Green |
| AUDIT-006 | 2026-04-02 | MCP token encryption hardening | Green |
| AUDIT-007 | 2026-04-09 | Knowledge maintenance epic delta | Green |
| AUDIT-008 | 2026-04-11 | Ingest workflow delta | Green |
| AUDIT-009 | 2026-04-12 | Plugin-source self-development | Green |
| AUDIT-027 | 2026-05-16 | EPIC-26 advisor-pattern + provider-only setup | Green (after H-1 plaintext credential fix) |
| AUDIT-028 | 2026-05-16 | v2.11.2 delta (FIX-28 safeFs hang) | Green |
| AUDIT-029 | 2026-05-16 | v2.11.3 delta (provider polish + GPT-5 reasoning + security tightening) | Green |
| AUDIT-030 | 2026-05-19 | v2.11.5 full re-audit baseline | Green |
| AUDIT-031 | 2026-05-24 | v2.12.3 targeted (qs DoS override + FIX-01-07-03 editor-refresh surface) | Green |
| AUDIT-032 | 2026-05-29 | v2.12.5 targeted (tmp symlink CVE override + FIX-04-03-07 reasoning passback) | Green |
| AUDIT-033 | 2026-05-30 | v2.12.6 / v2.12.7 delta (Review-bot ESLint cleanup pass + i18n hint update) | Green |

Audit reports live in a private development tree and are not part of the
public release output by design (they reference internal incidents and
mitigations not yet shipped). Summaries can be requested by the community
plugin maintainer. The full archive is markdown only and contains no
binaries.

Dependency audit (`npm audit --omit=dev`) reports zero vulnerabilities
across all production packages as of 2026-05-30.

Vulnerability reporting contact and SLA: see [SECURITY.md](SECURITY.md).

## Compliance notes

Mapping of community plugin scanner findings (Obsidian Releases v2.11.x and
v2.12.x) to the mitigations in this document:

| Scanner finding | Severity | Mitigation in this document |
|-----------------|----------|----------------------------|
| Direct filesystem access (`fs`) | Warning | "Direct filesystem access (`fs`)" section above, `safeFs` wrapper |
| Shell execution (`child_process`) | Warning | "Shell execution (`child_process`)" section above, `spawnAllowlist` |
| Vault enumeration | Recommendation | "Vault enumeration" section, Obsidian `vault.*` API only |
| Clipboard access | Recommendation | "Clipboard access" section, user-trigger only |
| Dynamic code execution | Recommendation | "Dynamic code execution" section, two-layer sandbox + AST allowlist |
| Vault read / vault write | Pass | Standard `vault.read` / `vault.modify` API |
| `uuid` reachable through `exceljs` (GHSA-w5hq-g745-h8pq) | Warning | False positive. Installed `uuid@14.0.0` is past the advisory's vulnerable ranges (`< 11.1.1`, `>= 12.0.0 < 12.0.1`, `>= 13.0.0 < 13.0.1`), pinned via `"uuid": ">= 11.1.1"` in `package.json#overrides`. The advisory affects `v3()`/`v5()`/`v6()` with a caller-provided `buf`; `exceljs` only calls `v4()`, which the advisory explicitly excludes. `npm audit` confirms zero. |
| `tmp` reachable through `exceljs` (GHSA-ph9p-34f9-6g65) | Warning | Resolved. `"tmp": ">= 0.2.6"` override in place, resolves to `tmp@0.2.7`. The vulnerable code path is the streaming `WorkbookReader` (with caller-controlled `prefix`/`postfix`/`dir`); the plugin only uses the writer side of `exceljs` (`create_xlsx`). See AUDIT-032. |
| `authorUrl` not reachable | Warning | Transient. `https://github.com/pssah4` returns HTTP 200 in live checks; the bot occasionally hits a GitHub Pages or CDN 5xx during its scan. No code change resolves a transient probe; the warning is expected to disappear on the next scan. |
| `display()` is deprecated (10 sites in `src/ui/AgentSettingsTab.ts`) | Warning | Accepted by design. The plugin ships a custom-built tabbed settings UI (5 main tabs, 20 sub-tab modules in `src/ui/settings/`, custom widgets for provider cards, skill buckets, backup wizard, optional-asset download with progress bars, deep-linkable via `openAt(tab, subTab)`). Obsidian 1.13.0 introduced `getSettingDefinitions` as a declarative alternative that does not support custom tabbed structure, custom widgets, or imperative re-render. Migrating would force a massive UX regression with no functional gain. `display()` remains supported by Obsidian and is the correct fit for our settings surface. The deprecation tag is informational, not a blocker. Re-evaluate if Obsidian extends `getSettingDefinitions` with native tab support in a future API version. |
