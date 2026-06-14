---
title: Power Features
description: "Advanced tools for research, automation, and self-introspection: anti-echo search, sandbox code execution, and self-development."
---

# Power features

A small set of tools sits outside the everyday read-write-search loop. They are powerful, sometimes risky, and reward a bit of upfront understanding. This guide covers three: anti-echo search for breaking confirmation bias, sandbox code execution for batch jobs that built-in tools cannot do alone, and self-development tools that let the agent inspect and patch itself.

**You will need:** an agent that already works for the day-to-day cases. None of these features is required for normal use.

**Use this guide when:** you keep getting "yes" answers from semantic search and suspect you are echoing yourself; you want to run a transformation across 50 files; or you want the agent to answer "how does feature X work?" by reading its own source.

**You will know it works when:** anti-echo search returns sources that argue against your current note, the sandbox runs a script across a folder and reports a real result, and the agent can describe its own code paths instead of guessing.

## Anti-echo search

`anti_echo_search` is a research tool that looks for sources that **contradict or extend** the current note instead of confirming it. Regular `semantic_search` ranks results by similarity, so a note about "remote work boosts productivity" pulls in more sources saying the same thing. Anti-echo flips the prompt: it asks for the counter-position.

### When to use it

- You are about to act on a claim and want a quick sanity check from the opposite side.
- A note feels too clean and you want a stress test.
- You are writing something opinionated and want to surface the strongest counterargument first.

> **Example prompt:** "Find sources in my vault that argue against what this note says about remote work."

The agent then runs `anti_echo_search`, returns sources that frame the topic differently, and shows them in the activity block. You decide whether the counterpoints are real or noise.

### Limits

- Anti-echo is a prompt-level steer, not a separate algorithm. If your vault genuinely has no counterpoints, you get no counterpoints.
- It works inside your vault. For external counterpoints, ask the agent to combine anti-echo with `web_search`.

## Sandbox code execution

`evaluate_expression` runs a snippet of TypeScript in an isolated sandbox with vault access. It is the right answer when a task needs a loop, a computation, or a transformation that would otherwise mean calling `edit_file` 50 times.

### When to use it

- Batch operations across many files (5 or more): rename, retag, normalize frontmatter, count, audit.
- Data transforms that built-in tools do not cover: convert CSV blocks inside notes to tables, generate a report from frontmatter, compute statistics.
- HTTP API calls beyond `web_fetch`: hitting a JSON endpoint, posting to a webhook.
- Pulling an npm package from a CDN for one-off use (zod, date-fns, marked, jsdom).

### What the sandbox can do

- Read and write text and JSON files in the vault via a bridge that honors your permission settings.
- Read and write binary data through `ctx.vault.readBinary` and `ctx.vault.writeBinary`.
- Make HTTP requests via `ctx.requestUrl` (the Obsidian-safe wrapper, not raw `fetch`).
- Import ESM packages from a CDN. The plugin bundles transitive dependencies automatically.

### What the sandbox cannot do

- Spawn shells or run system binaries.
- Generate binary office formats (DOCX, PPTX, XLSX, PDF). For those, use the built-in `create_docx`, `create_pptx`, `create_xlsx` tools.
- Use Node-only APIs (`require`, `fs`, `child_process`, `Buffer`).

> **Example prompt:** "Count the open tasks across all notes in `Projects/`."
>
> The agent calls `evaluate_expression`, reads the folder, scans each file for `- [ ]` patterns, sums them, and returns one number instead of touching the files.

### Approval and audit

Sandbox runs need approval like any other write tool, even when the script does not write anything. The approval card shows the full source code before it runs. Sandbox execution is logged in the audit trail (**Settings > Log**) just like any other tool call.

## Self-development tools

A handful of tools let the agent inspect and modify itself. They are optional and switched off by default.

### `inspect_self`

Read the agent's own runtime state: active settings, available tools, configured agents, active rules. The output is a Markdown summary of what is actually loaded, separate from what the docs claim.

> **Example prompt:** "What tools do you have right now?" or "Are my approval settings actually set the way I think they are?"

This is the right tool when you suspect a config drift or want to verify a recent setting change.

### `read_agent_logs`

Read the plugin's own console logs (debug, warn, error) from the in-memory ring buffer. Filter by level, time window, or pattern.

> **Example prompt:** "Look at your logs from the last 10 minutes. Anything that looks wrong?"

Useful when something behaved oddly and you want the agent to introspect what happened, instead of asking the user to copy-paste logs.

### `manage_source`

Read the plugin's own TypeScript source code so the agent can answer "how does feature X work?" questions and propose code patches.

**Setup:** This tool needs an optional source bundle (~5 MB) that ships outside the main plugin to keep Obsidian Sync fast for users who do not need it. Install it from **Settings > Optional Assets > Self-Development source > Install**. The bundle is verified by SHA256 against the plugin's GitHub release.

> **Example prompt:** "Show me how `semantic_search` picks the embedding model" or "Propose a patch that lowers the default chunk size."

Without the source bundle installed, `manage_source` is disabled and the agent will say so when asked.

### Safety notes

- These tools read state and source; they do not modify the running plugin. Code patches are written to disk for you to review, not hot-loaded.
- All three respect the regular approval and audit pipeline.
- If you want to keep the plugin fully sealed, leave the source bundle uninstalled and disable `inspect_self` and `read_agent_logs` in your active agent.

## Where to go next

- [Tools reference](/reference/tools) has the full signature for each tool.
- [Self-development concept](/concepts/self-development) covers the architecture behind `manage_source`.
- [Knowledge discovery](/guides/knowledge-discovery) covers regular semantic search for comparison with anti-echo.
