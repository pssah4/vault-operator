# Security policy and threat model

This document describes what Vault Operator does on your machine, the trust
boundaries that govern its behaviour, and the mitigations in place for each
capability the Obsidian community plugin scanner flags. It is written for two
audiences: the community plugin reviewer who has to decide whether the plugin
behaves as advertised, and the security-aware user who wants to verify before
installing.

The reviewer-oriented short version: there is no path from chat output (LLM
text) to `fs.*` or `child_process.spawn`. Filesystem access goes through
[src/core/security/safeFs.ts](src/core/security/safeFs.ts) with a hard
allowlist of five root directories; process spawning goes through
[src/core/security/spawnAllowlist.ts](src/core/security/spawnAllowlist.ts)
with a hard list of seven binaries. Dynamic code execution lives only inside
two layered sandboxes (Chromium iframe and Node `vm.runInNewContext`) with an
AST allowlist gate in front. Internal audit history is summarised in the
"Audit history" section below; the audit reports themselves live in a
private development tree and can be shared with the community plugin
maintainer on request.

## Threat model

### Actors and trust assumptions

| Actor | Trust level | Why |
|------|-------------|-----|
| The user | Trusted | Configures providers, approves writes, installs the plugin |
| The Obsidian host | Trusted | Plugin runs in the same renderer process |
| The LLM provider (Anthropic, OpenAI, etc.) | Untrusted output | LLM responses are treated as adversarial input |
| Third-party MCP servers | Untrusted | The user can configure arbitrary MCP servers; their responses are treated as adversarial |
| npm packages loaded from `esm.sh` | Untrusted | User-initiated; mitigated by sandbox + integrity pinning |
| Local files outside the vault and outside the plugin data dir | Out of scope | The plugin must never read or write them |

### Primary trust boundaries

1. **Plugin <-> LLM provider.** Every byte of LLM output is treated as
   untrusted. Tool arguments parsed from LLM output are JSON-schema-validated
   before any operation. The LLM cannot reference filesystem paths outside
   the vault (the vault tool API only accepts vault-relative paths).
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
startup, `safeFs.initialize(allowlist)` is called with five root
directories:

```
1. <vault>                                      -- the Obsidian vault root
2. <vault>/.obsidian/plugins/vault-operator/    -- plugin data dir
3. <vault>/.obsidian-agent/                     -- agent config dir
4. <os.tmpdir()>                                -- system temp dir
5. ~/.config/Claude/, ~/Library/Application Support/Claude/,
   %APPDATA%\Claude\, ~/.obsidian-agent/        -- desktop config dirs
```

Every read and write goes through `assertAllowed(path)`, which uses
`path.resolve(path)` (lexical, no symlink resolution) and `path.relative(root,
path)` to verify the path falls under exactly one of the five roots. Paths
that escape via `..` or absolute paths outside the allowlist throw
`SafeFsViolation` and the operation is rejected.

**Why this is enough.** The LLM cannot construct an `fs` call directly. Tools
that take vault paths (`read_file`, `write_file`, `edit_file`, etc.) use the
Obsidian `vault.*` API, not `fs`. The only paths that ever reach `fs` are
hard-coded by the plugin author at compile time (database filenames, index
filenames, checkpoint subfolder, etc.) or constructed from the vault path
plus a fixed suffix.

**What would break this.** A new feature that takes a user-controlled path
and passes it to `safeFs` without confining it to a fixed subdirectory. The
test suite includes path-traversal cases and a CI grep step against new
`import 'fs'` outside the wrapper.

### Shell execution (`child_process`)

**Why we use it.** The Node-based sandbox worker spawns a child process for
isolation (`evaluate_expression` runs there, not in the Obsidian renderer).
The shadow-git for vault checkpoints calls `git`. The remote-MCP feature
spawns a Cloudflare Tunnel (`cloudflared`) for inbound HTTPS exposure. The
office pipeline spawns LibreOffice (`soffice`) for headless conversion.
Binary discovery uses `which`/`where`.

**Mitigation.** Every spawn goes through
[src/core/security/spawnAllowlist.ts](src/core/security/spawnAllowlist.ts).
The allowlist is hard-coded:

```
node, node.exe        -- sandbox worker process
which, where, where.exe -- binary discovery
git, git.exe          -- shadow git for vault checkpoints
soffice, soffice.bin, libreoffice -- LibreOffice conversion
cloudflared, cloudflared.exe       -- remote MCP tunnel
```

`spawnAllowed(command, args, options)` rejects:

- A `command` whose `path.basename` is not on the allowlist
- A `command` containing shell metacharacters (`;`, `&`, `|`, `>`, `<`,
  backtick, `$()`, `\`, newline)
- An `options.shell` set to `true` or any truthy value

`cp.exec` and `cp.execSync` are not re-exported. Shell-string interfaces
have no place in this codebase.

**Why this is enough.** The LLM cannot construct a spawn directly. Recipes
(`ExecuteRecipeTool`) only execute from a fixed in-bundle `BUILT_IN_RECIPES`
list; recipe parameters are whitelist-validated against a per-recipe schema
before substitution; custom recipes are not user-configurable today. MCP
servers can be configured by the user with arbitrary commands -- this is the
single user-controlled spawn entry point and is documented separately below.

**What would break this.** A new feature that takes a user-controlled binary
name and passes it to `spawnAllowed`. The allowlist is small enough that
every addition is a deliberate diff and visible in code review.

**Open caveat: user-configured MCP servers.** A user who configures a local
stdio MCP server in settings provides its command line directly. This is
the same trust profile as Claude Desktop or Codex: the user is trusted to
configure their own MCP servers. We do not gate this behind the
spawn-allowlist because doing so would defeat the purpose of MCP. Users who
want to harden this further can disable stdio MCP in settings and use HTTP
or SSE transports only.

### Vault enumeration

**Why we use it.** Semantic search builds an index over every markdown file
in the vault. `list_files` lets the user inspect vault structure. Map-of-
Content (MOC) generation and ingest-workflow tools iterate vault contents.

**Mitigation.** All vault enumeration goes through Obsidian's `vault.*` API.
The plugin only sees file paths and their contents on demand; it does not
upload the vault. Network usage is documented separately in the README.

### Clipboard access

**Why we use it.** The "Copy" buttons in chat and the system-prompt preview
allow the user to copy generated content. An optional clipboard-paste flow
is used for the @-mention attachment feature.

**Mitigation.** Clipboard access is only triggered from user UI actions
(button clicks). There is no background clipboard monitoring and no
automatic clipboard reads on plugin startup.

### Dynamic code execution

**Why we use it.** The `evaluate_expression` tool runs LLM-generated
JavaScript inside a sandboxed runtime. This is a deliberate feature: it lets
the agent perform bulk transformations, generate office documents, and call
npm utilities from `esm.sh`.

**Mitigation.** Generated code never executes directly in the plugin
context. Two layers stand between LLM output and code execution:

```
LLM output (untrusted)
  -> JSON-schema validate tool args
  -> AstValidator.ts -- regex deny-list (no eval, no Function constructor,
                        no require, no dynamic import, no process,
                        no __proto__, no constructor chain traversal,
                        no globalThis)
  -> esbuild transform with sandboxed module resolution
  -> ProcessSandboxExecutor (Node child process)
       -> vm.runInNewContext with frozen globals
       -> only ctx.vault and ctx.requestUrl exposed
       -> 30-second timeout
       -> 128 MB heap limit
       -> output size limit, write rate limit, HTTP rate limit
   OR
  -> iframe sandbox (Chromium browser sandbox)
       -> postMessage bridge to plugin for vault and HTTP only
```

npm packages from `esm.sh` are version-pinned (URLs include the package
version) and resolved through `EsbuildWasmManager.ts`. The CDN domain is
documented in README.

The `Function()` constructor literal `new Function(...)` appears in the
build twice: once inside the sandbox iframe (executes only LLM-validated
code in a Chromium-sandboxed origin), once in `EsbuildWasmManager.ts` to
load the esbuild-wasm CommonJS bundle from `esm.sh`. The second use bypasses
the AST literal-match by accessing the constructor through
`Object.getPrototypeOf(function(){}).constructor`. The loaded esbuild bundle
is also version-pinned and integrity-checked.

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
  |  vault + http via |                               |  vm.runInNewContext |
  |  postMessage      |                               |  frozen globals     |
  |                   |                               |  AST allowlist      |
  +-------------------+                               +---------------------+
            |                                                  |
            v                                                  v
       Chromium SOP                                  Process isolation
                                                     (own PID, no IPC
                                                      except stdio bridge)
```

Both sandboxes share the same bridge protocol exposed as `ctx.vault` and
`ctx.requestUrl`. Both reject the same AST patterns (`eval`, `new Function`,
`require`, dynamic `import`, `process`, `__proto__`,
`constructor.constructor`, `globalThis`). Both have output-size and rate
limits.

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

Audit reports live in a private development tree and are not part of the
public release output by design (they reference internal incidents and
mitigations not yet shipped). Summaries can be requested by the community
plugin maintainer. The full archive is markdown only and contains no
binaries.

Dependency audit (`npm audit --omit=dev`) reports zero vulnerabilities
across all production packages as of 2026-05-16.

## Reporting vulnerabilities

Please email security findings to `sh.hanke@gmail.com` rather than opening a
public issue. Expected response time: under 7 days for acknowledgement, under
30 days for a fix or a documented decision to defer.

If a vulnerability is exploitable today and you can provide a reproducer, we
will prioritise it ahead of feature work.

## Compliance notes

Mapping of community plugin scanner findings (Obsidian Releases v2.11.x) to
the mitigations in this document:

| Scanner finding | Severity | Mitigation in this document |
|-----------------|----------|----------------------------|
| Direct filesystem access | Warning | "Direct filesystem access (`fs`)" section above, `safeFs` wrapper |
| Shell execution | Warning | "Shell execution (`child_process`)" section above, `spawnAllowlist` |
| Vault enumeration | Recommendation | "Vault enumeration" section, Obsidian `vault.*` API only |
| Clipboard access | Recommendation | "Clipboard access" section, user-trigger only |
| Dynamic code execution | Recommendation | "Dynamic code execution" section, two-layer sandbox + AST allowlist |
| Vault read / vault write | Pass | Standard `vault.read` / `vault.modify` API |
