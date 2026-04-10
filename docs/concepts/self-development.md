---
title: Self-development
description: How Obsilo extends its own capabilities at runtime through five tiers of increasing autonomy.
---

# Self-development

Most agents ship with a fixed set of tools. Obsilo can extend itself at runtime: writing new instructions, creating new tools, and in the most advanced tier, modifying its own source code.

This is powerful and risky. The system has clear boundaries between tiers. Each requires more trust than the last. Lower tiers are safe by default, higher tiers require explicit approval. No tier lets the agent do something you haven't agreed to.

## Five tiers

Tier 1: skill files. The agent writes Markdown files that contain instructions for itself. These are cheat sheets: "when the user asks for X, here's how to approach it." Skill files live in the vault and are loaded into the system prompt when relevant. Zero risk, since the agent is just writing notes. A skill file might say "when creating meeting notes, always include an action items section and tag attendees." The agent reads this on next conversation start and follows the instructions.

Tier 2: dynamic tools. The agent writes JavaScript code that runs in a sandboxed environment. Unlike skill files (which are instructions), dynamic tools are executable. The agent defines input parameters, writes the implementation, and registers the tool. Other conversations can then use it. The agent can create tools for tasks that come up repeatedly but aren't covered by built-in tools. If you frequently convert CSV data into a specific Markdown table format, the agent can write a dynamic tool for that transformation and reuse it.

Tier 3: source modification. The agent can read and modify its own TypeScript source code through the `EmbeddedSourceManager` (`src/core/self-development/EmbeddedSourceManager.ts`). At build time, an esbuild plugin encodes the entire source tree as base64 and embeds it into `main.js` as a constant. At runtime, the agent can decode it, search through files, make changes, and rebuild the plugin via `PluginBuilder` (`src/core/self-development/PluginBuilder.ts`) and `PluginReloader` (`src/core/self-development/PluginReloader.ts`). Every modification is validated with AST parsing (no syntax errors allowed) and the original source is backed up before changes are applied. This tier exists for advanced self-improvement scenarios and requires explicit user approval.

Tier 4: reserved. Intentionally left empty for future capabilities.

Tier 5: proactive improvement. The agent observes usage patterns across conversations and suggests new skills or tools without being asked. If it notices you regularly perform a sequence of steps that could be automated, it proposes a skill file or dynamic tool to handle it. You approve or reject the suggestion. The agent never acts on its own at this tier. It only proposes.

## Sandbox isolation

Dynamic tools (tier 2) run in a sandbox, not in the plugin's main process. The isolation strategy depends on the platform.

Desktop (Electron): `ProcessSandboxExecutor` (`src/core/sandbox/ProcessSandboxExecutor.ts`) spawns a separate Node.js child process with a 128 MB heap limit. The sandbox communicates with the main plugin through a message bridge. If the sandboxed code crashes or exceeds memory, the child process is killed and respawned (up to 3 times). After three failed respawns, the executor returns an error to the calling tool. The heap limit prevents a runaway script from consuming all system memory.

Mobile: `IframeSandboxExecutor` (`src/core/sandbox/IframeSandboxExecutor.ts`) creates a hidden iframe with restricted permissions. Communication happens via `postMessage`. Mobile sandboxes have tighter constraints: no filesystem access, no native modules. The iframe approach works on both iOS and Android versions of Obsidian.

Platform selection happens automatically in `createSandboxExecutor.ts`, which checks whether Electron is available and picks the right executor.

Both executors implement the same `ISandboxExecutor` interface, so dynamic tools don't need to care which platform they're running on.

The sandbox can do text processing, JSON manipulation, vault batch operations via the bridge, and HTTP requests via the bridge. It cannot do binary file generation (DOCX, PPTX, XLSX) because those require Buffer/stream/JSZip which aren't available in the sandboxed environment. Binary formats are handled by built-in tools in the plugin's main process.

## What the sandbox bridge exposes

Sandboxed code can't access the Obsidian API directly. Instead, it gets a `SandboxBridge` object with controlled methods:

- Read and write vault files
- Search the vault
- Make HTTP requests (routed through Obsidian's `requestUrl`)
- Import ESM modules from CDN (via esm.sh with jsdelivr fallback)

The bridge is the security boundary. Everything the sandbox does goes through it, and the bridge enforces path validation and rate limits.

CDN imports use esm.sh with the `?bundle` flag as the preferred source, falling back to jsdelivr. Transitive imports are resolved recursively. If you import a library that imports another library, both get downloaded and bundled. This allows substantial npm packages in sandbox code without pre-installing them.

## How tiers interact

Tier 1 and tier 2 feed into each other naturally. The agent might start by writing a skill file (tier 1) that describes a workflow. After using it several times, it might notice that part of the workflow could be automated with code, and propose a dynamic tool (tier 2) to handle that part. The skill file then references the dynamic tool instead of describing the manual steps.

Tier 5 (proactive improvement) draws on the memory system's pattern detection. When the `patterns` table in MemoryDB shows a recurring tool sequence with high success rates, tier 5 can propose turning it into a skill or dynamic tool. This closes the loop: usage patterns become automation proposals.

## Embedded source: how tier 3 works in detail

The `EmbeddedSourceManager` maintains an in-memory Map of file paths to source content. On plugin load, it checks for the `EMBEDDED_SOURCE` constant (injected at build time). If present, it decodes each file from base64 and populates the map. The agent can then:

- List all source files
- Read any file's content
- Search across files by regex
- Modify a file's content in memory

Modifications stay in memory until the agent triggers a rebuild. The `PluginBuilder` compiles the modified source into a new `main.js`, and the `PluginReloader` swaps the running plugin with the new build. The entire cycle (modify, build, reload) takes a few seconds on a typical machine.

If the rebuild fails (compilation error, validation failure), the original source is restored from backup and the plugin continues running with its previous code. The agent is told what went wrong so it can attempt a fix.

## Honest limitations

Self-modification is useful in practice, but the limits are real. Tier 3 (source modification) is experimental. AST validation catches syntax errors but not logic errors. A self-modification that introduces a subtle bug may not surface until something breaks. The backup-and-restore mechanism helps, but it doesn't replace reviewing changes.

Tier 5 (proactive suggestions) is conservative by design, with a high threshold before suggesting anything. Most users will use tier 1 and tier 2 regularly. Tiers 3 and 5 are for power users who want to push the boundaries.

Dynamic tools (tier 2) are the sweet spot for most use cases. They offer real programmability without the risks of source modification, and the sandbox isolation means a buggy tool can't crash the plugin. If you're exploring self-development capabilities, start with tier 1 skill files and graduate to tier 2 when you need actual code execution.
