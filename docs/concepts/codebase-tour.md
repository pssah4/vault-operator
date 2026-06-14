---
title: Codebase Tour
description: Where the code lives, what depends on what, and where to start reading. Written for developers who want to extend Vault Operator or learn from it.
---

# Codebase tour

This page is for developers. If you only use Vault Operator, you can skip it. The user-facing concept pages cover everything you need to know to work effectively with the plugin.

If you want to read the source, build a plugin on top, or just learn how an agentic loop is wired into Obsidian, this page is the map.

## Directory structure

| Directory | What lives there |
|-----------|------------------|
| `src/core/` | AgentTask, pipeline, system prompt, modes, governance, checkpoints |
| `src/core/tools/` | All built-in tool implementations (vault, web, agent, memory, MCP, dynamic) |
| `src/core/tool-execution/` | Execution pipeline, repetition detector, result externalizer, input schema validator |
| `src/core/governance/` | Approval flow plumbing, operation logger, ignore-list service |
| `src/core/prompts/sections/` | Modular prompt section builders (one per stable block of the system prompt) |
| `src/core/memory/` | Memory v2 layer: FactStore, EdgeStore, SingleCallExtractor/Processor, ContextComposer, soul, source-interface tagging |
| `src/core/mastery/` | Recipe storage, matching, and semantic promotion (RecipeStore, RecipeMatchingService, RecipePromotionService) |
| `src/core/stigmergy/` | Pheromone-based recall adapter that observes tool, skill, and MCP usage (StigmergyAdapter, precedence resolver) |
| `src/core/knowledge/` | KnowledgeDB (sql.js), VectorStore, graph store, ontology, vault-health checks, reranker |
| `src/core/ingest/` | Karpathy-style deep ingest pipeline, triage, block-id mirror, source-position annotator, tension detection, MOC maintainer |
| `src/mcp/` | MCP server (cross-surface read/write to memory, history, vault) and the Cloudflare relay |
| `src/api/` | AI provider abstraction for 12 provider types (Anthropic, OpenAI, Gemini, Bedrock, GitHub Copilot, Kilo Gateway, OpenRouter, Azure, Ollama, LM Studio, custom OpenAI-compatible, ChatGPT OAuth) |
| `src/ui/` | Sidebar, settings, modals, onboarding wizard |
| `src/i18n/` | Internationalization (EN, DE) |
| `src/types/` | Shared TypeScript types and settings |

## Reading order

If you are reading the source for the first time, this order keeps the surprise factor low:

1. `src/core/AgentTask.ts`. The whole loop is one file. Open it, scroll to `run()`, follow the streaming + tool-call cycle. The [agent loop concept page](./agent-loop) maps to this file one to one.
2. `src/core/tool-execution/ToolExecutionPipeline.ts`. Every tool call goes through here. Validation, approval, checkpoint, execute, log. No tool bypasses this pipeline, not even MCP tools from external servers.
3. `src/core/tools/`. Open three or four tools to see the shape: a class with a JSON schema, an `execute` method, and a `Tool` registration. The simplest are `read_file` and `list_files`. The most involved are `ingest_deep` and `create_pptx`.
4. `src/core/prompts/sections/`. Each section builder owns one stable block of the system prompt. The order matters for KV cache stability. The [token optimization concept page](./token-optimization) explains why.

## Kilo Code heritage

Vault Operator's core loop and tool architecture are adapted from Kilo Code, an open-source AI coding agent. The adaptation replaces filesystem operations with Obsidian's vault API, adds governance layers for approval and checkpointing, and introduces domain-specific tools for knowledge management.

When you read a file in `src/core/` that looks weirdly close to a coding agent, that is why. The `forked-kilocode/` folder in the repository keeps the original Kilo Code source as a reference. If you are adding a new feature and want to know "how did the original solve this?", that is where to look first.

## Build and deploy

The repository ships with two npm scripts that cover the daily loop:

```bash
npm run dev      # watch mode, rebuilds and deploys on every save
npm run build    # production build, single-shot
npm run deploy   # build + deploy to the path in .env
```

The deploy target is `PLUGIN_DIR` in `.env`. Point it at your vault's `.obsidian/plugins/vault-operator/` folder for local testing.

## Extending Vault Operator

There are three integration surfaces, ranked by stability:

| Surface | Stability | Use when |
|---------|-----------|----------|
| **Skills** (Markdown files in `.vault-operator/data/skills/`) | High, user-facing | You want to teach the agent a new workflow without writing code |
| **MCP servers** (external processes) | High, public protocol | You want to add tools the agent can call across multiple AI clients |
| **Tools** (TypeScript in `src/core/tools/`) | Medium, internal API | You want to add a native tool with full access to vault, settings, and helpers |

The first two work without forking the repository. Tools require a fork, a rebuild, and a custom plugin install. Most extension ideas fit into skills or MCP.

## Where to file issues and ideas

GitHub issues on the public repository are read regularly. For larger contributions, open a discussion first so we can agree on the shape before code lands. The plugin is one developer's project, so response time varies.

## Further reading for developers

- [Agent loop](./agent-loop): the full loop with iteration limits, repetition detection, condensing, power steering, multi-agent spawning, and advisor escalation.
- [Tool system](./tool-system): how tools are registered, validated, and executed through the pipeline.
- [Governance](./governance): the approval and safety model in detail.
- [MCP](./mcp-architecture): the cross-surface protocol that lets external clients read your memory and history.
- [UI architecture](./ui-architecture): how the sidebar, settings, and modals are wired into Obsidian.
