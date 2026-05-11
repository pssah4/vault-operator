---
title: Self-development
description: How Obsilo extends its own capabilities at runtime through five tiers of increasing autonomy.
---

# Self-development

Most agents ship with a fixed set of tools. Obsilo can extend itself at runtime by writing new instructions, creating new tools, and in the highest tier, modifying its own source code.

This is useful and risky, so the system has hard boundaries between tiers. Each tier requires more trust than the last: lower tiers are safe by default, higher tiers need explicit approval. No tier lets the agent do something you haven't agreed to.

## Five tiers

Tier 1 is skill files. The agent writes Markdown files that contain instructions for itself. These are cheat sheets: "when the user asks for X, here's how to approach it." Skill files live in the vault and are loaded into the system prompt when relevant. Zero risk, since the agent is just writing notes. A skill file might say "when creating meeting notes, always include an action items section and tag attendees." The agent reads this on next conversation start and follows the instructions.

Tier 2 is dynamic tools. The agent writes JavaScript code that runs in a sandboxed environment. Unlike skill files (which are instructions), dynamic tools are executable. The agent defines input parameters, writes the implementation, and registers the tool. Other conversations can then use it. If you frequently convert CSV data into a specific Markdown table format, the agent can write a dynamic tool for that transformation and reuse it.

Tier 3 is source modification. The agent can read and modify its own TypeScript source code through `EmbeddedSourceManager` (`src/core/self-development/EmbeddedSourceManager.ts`). At build time, an esbuild plugin encodes the entire source tree as base64 and embeds it into `main.js` as a constant. At runtime, the agent decodes it, searches through files, makes changes, and rebuilds the plugin via `PluginBuilder` (`src/core/self-development/PluginBuilder.ts`) and `PluginReloader` (`src/core/self-development/PluginReloader.ts`). Every modification is validated with AST parsing (no syntax errors allowed) and the original source is backed up before changes are applied. This tier is experimental and requires explicit user approval.

Tier 4 is reserved. Empty for now.

Tier 5 is proactive improvement. The agent observes usage patterns across conversations and suggests new skills or tools without being asked. If it notices you regularly perform a sequence of steps that could be automated, it proposes a skill file or dynamic tool to handle it. You approve or reject the suggestion. The agent never acts on its own at this tier, it only proposes.

## Self-introspection tools

Alongside the five tiers, four tools let the agent reason about its own state and capabilities at runtime:

- `inspect_self`: read the agent's own configuration, tool list, active modes, skills, and rules. Used when the user asks "what can you do?" or when the agent needs to plan against its current capabilities.
- `find_tool`: search the registry (built-in, dynamic, plugin) for a tool that fits a task description. Useful when the agent is unsure which tool to call.
- `update_soul`: update the user's long-term identity layer (values, working style). Slow-changing, deliberate, and gated.
- `anti_echo_search`: find sources that contradict or extend the current note instead of confirming it. A small lever against confirmation bias when researching a topic.

These tools sit in the `agent` and `vault` groups, depending on what they touch. They are not a separate tier; they support tier 1 (skill self-authoring) and tier 5 (pattern detection) by giving the agent a way to look in the mirror without a user prompt asking it to.

## Sandbox isolation

Dynamic tools (tier 2) run in a sandbox, not in the plugin's main process. The isolation strategy depends on the platform.

On desktop (Electron), `ProcessSandboxExecutor` (`src/core/sandbox/ProcessSandboxExecutor.ts`) spawns a separate Node.js child process with a 128 MB heap limit. The sandbox communicates with the main plugin through a message bridge. If the sandboxed code crashes or exceeds memory, the child process is killed and respawned (up to 3 times). After three failed respawns, the executor returns an error to the calling tool. The heap limit prevents a runaway script from consuming all system memory.

On mobile, `IframeSandboxExecutor` (`src/core/sandbox/IframeSandboxExecutor.ts`) creates a hidden iframe with restricted permissions. Communication happens via `postMessage`. Mobile sandboxes have tighter constraints: no filesystem access, no native modules. The iframe approach works on both iOS and Android versions of Obsidian.

Platform selection happens automatically in `createSandboxExecutor.ts`, which checks whether Electron is available and picks the right executor. Both executors implement the same `ISandboxExecutor` interface, so dynamic tools don't need to care which platform they're running on.

The sandbox can do text processing, JSON manipulation, vault batch operations via the bridge, and HTTP requests via the bridge. It cannot do binary file generation (DOCX, PPTX, XLSX) because those require Buffer/stream/JSZip, which aren't available in the sandboxed environment. Binary formats are handled by built-in tools in the plugin's main process.

## What the sandbox bridge exposes

Sandboxed code can't access the Obsidian API directly. Instead, it gets a `SandboxBridge` object with a controlled surface: reading and writing vault files, searching the vault, making HTTP requests routed through Obsidian's `requestUrl`, and importing ESM modules from CDN (esm.sh with a jsdelivr fallback).

The bridge is the security boundary. Everything the sandbox does goes through it, and the bridge enforces path validation and rate limits.

CDN imports use esm.sh with the `?bundle` flag as the preferred source, falling back to jsdelivr. Transitive imports are resolved recursively. If you import a library that imports another library, both get downloaded and bundled. This lets you use substantial npm packages in sandbox code without pre-installing them.

## How tiers interact

Tier 1 and tier 2 feed into each other naturally. The agent might start by writing a skill file (tier 1) that describes a workflow. After using it several times, it might notice that part of the workflow could be automated with code and propose a dynamic tool (tier 2) to handle that part. The skill file then references the dynamic tool instead of describing the manual steps.

Tier 5 draws on the memory system's pattern detection. When the `patterns` table in MemoryDB shows a recurring tool sequence with high success rates, tier 5 can propose turning it into a skill or dynamic tool. That closes the loop: usage patterns become automation proposals.

## Embedded source: tier 3 in detail

`EmbeddedSourceManager` maintains an in-memory Map of file paths to source content. On plugin load, it checks for the `EMBEDDED_SOURCE` constant (injected at build time). If present, it decodes each file from base64 and populates the map. The agent can then list all source files, read any file's content, search across files by regex, and modify a file's content in memory.

Modifications stay in memory until the agent triggers a rebuild. `PluginBuilder` compiles the modified source into a new `main.js`, and `PluginReloader` swaps the running plugin with the new build. The full modify-build-reload cycle takes a few seconds on a typical machine.

If the rebuild fails (compilation error, validation failure), the original source is restored from backup and the plugin keeps running with its previous code. The agent is told what went wrong so it can attempt a fix.

## Honest limitations

Self-modification is useful in practice, but the limits are real. Tier 3 is experimental. AST validation catches syntax errors but not logic errors, and a self-modification that introduces a subtle bug may not surface until something breaks. The backup-and-restore mechanism helps, but it doesn't replace reviewing changes.

Tier 5 is conservative by design, with a high threshold before suggesting anything. Most users will use tier 1 and tier 2 regularly, while tiers 3 and 5 are for power users who want to push the boundaries.

Dynamic tools (tier 2) are the sweet spot for most use cases. They give you real programmability without the risks of source modification, and the sandbox isolation means a buggy tool can't crash the plugin. If you're exploring self-development, start with tier 1 skill files and move to tier 2 when you need actual code execution.
