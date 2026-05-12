---
title: What Vault Operator Can Do
description: A quick look at what makes Vault Operator different and how it can help you work with your vault.
---

# What Vault Operator can do

Most AI tools sit outside your knowledge base and wait for you to copy-paste. Vault Operator lives inside it. It reads your notes, knows how they connect, picks up your habits, and acts on your behalf.

## An AI that understands your vault

Vault Operator does not just access your files. It reads the structure too: wikilinks, frontmatter properties, tags, folder hierarchies, and the graph that ties them together.

When you ask "what do I know about X?", it does not grep through filenames. It searches by meaning, walks the knowledge graph, and finds connections you may have missed.

> **Example prompt:** "Find all notes related to behavioral economics and show me how they connect."

[Set up semantic search](/guides/knowledge-discovery) | [How the knowledge layer works](/concepts/knowledge-layer)

## It discovers what you missed

Your vault grows organically. Notes pile up in different folders. Over time, related ideas drift apart without anyone linking them.

Vault Operator runs implicit connection analysis in the background and finds note pairs that are semantically similar but have no wikilink between them. The vault health check goes further: it flags orphaned notes, broken links, inconsistent tags, missing backlinks, and "god nodes" (notes with so many connections they become bottlenecks instead of useful hubs). It also compares your folder and tag structure against the topic clusters it detects in the knowledge graph.

> **Example prompt:** "Run a health check on my vault and tell me what needs fixing."

[Vault health check](/guides/vault-health) | [Knowledge discovery](/guides/knowledge-discovery)

## It learns how you work

When the agent completes a task successfully, it remembers the tool sequence. After a few repetitions, it builds a "recipe" and runs similar tasks 10x faster using 90% fewer tokens.

It also remembers your preferences, your writing style, and your projects, not just within one chat but across sessions. It builds a profile over time and adapts to how you like things done.

> **Example prompt:** "Summarize this meeting note like last time." (It remembers your preferred format.)

[Memory and personalization](/guides/memory-personalization) | [How memory works](/concepts/memory-system)

## You stay in control

Every file change needs your approval. Every edit creates a git snapshot you can undo with one click. The operation log records everything the agent did.

You pick the AI model. You decide what gets sent to the cloud. If you want zero cloud dependency, you can run everything locally with Ollama or LM Studio.

> **No surprises:** Vault Operator cannot change a file without showing you the diff first.

[Safety and control](/guides/safety-control) | [How governance works](/concepts/governance)

## It works with your plugins

Vault Operator scans your installed plugins at startup and generates a skill file for each one. It can run Obsidian commands, call plugin APIs, and build workflows that combine multiple plugins.

Dataview queries, Kanban boards, Templater templates, Tasks plugin, Excalidraw drawings: if you have the plugin installed, the agent can use it.

> **Example prompt:** "Create a Kanban board from the open tasks in my project notes."

[Skills, rules, and workflows](/guides/skills-rules-workflows) | [How plugin discovery works](/concepts/vault-dna)

## It creates documents from your knowledge

Need a presentation for Monday? Vault Operator turns your meeting notes into a PowerPoint. It also creates Word documents from project notes and Excel sheets from structured data.

You can bring your own PPTX templates. The agent reads the slide layouts and fills them with content from your vault, so you skip the manual copy-paste.

> **Example prompt:** "Create a presentation about Q2 results using the corporate template."

[Office documents guide](/guides/office-documents) | [How the office pipeline works](/concepts/office-pipeline)

## It works across your AI tools

Vault Operator includes an MCP server. That means Claude Desktop, ChatGPT, Perplexity, Claude Code, and any MCP-compatible tool can read your vault, retrieve facts from your memory layer, and append to your conversation history.

Every external call carries a `source_interface` tag, so memory and history stay separable per surface. Strict source isolation is on by default for non-Vault Operator callers; you decide which surfaces share the full memory layer.

You can also point Vault Operator at external MCP servers for extra capabilities.

> **Example prompt:** In ChatGPT: "Recall what my Vault Operator memory says about pricing strategy."

[Connectors guide](/guides/connectors) | [Unified Chat Memory](/concepts/unified-chat-memory) | [MCP architecture](/concepts/mcp-architecture)

## It ingests sources with provenance

Drop a PDF, web clip, or Office file into the chat and Vault Operator runs a 10-second triage against your vault's ontology before any deep reading. If it survives triage, the agent runs a multi-turn dialog and produces a sense-making note where every claim ends with a `↗` link to the exact paragraph in the source. No more "I have a note about this somewhere" without a path back to where the claim came from.

> **Example prompt:** "Deep-ingest this research paper. Focus on the methodology section."

[Knowledge ingest guide](/guides/knowledge-ingest)

## It delegates complex work

For tasks that span multiple topics, Vault Operator can spawn sub-agents. One can research meeting notes while another searches the web. A third stitches both into a document.

Sub-agents run in isolation, each with their own conversation context. The main agent collects and combines their results.

> **Example prompt:** "Compare what my vault says about pricing strategy with the latest market research online, then write a recommendation note."

[Multi-agent guide](/guides/multi-agent)

## What it costs

Vault Operator itself is free and open source. You pay only for the AI model you use.

| Option | Monthly cost |
|--------|-------------|
| Google Gemini (free tier) | Free |
| Ollama / LM Studio (local) | Free (your hardware) |
| OpenRouter (cloud) | Pay per token, typically $0.50-5 per day |
| Anthropic / OpenAI (direct) | Pay per token, typically $1-10 per day |
| GitHub Copilot (subscription) | Included with Copilot subscription |

Vault Operator's token optimization (Fast Path, KV-cache alignment, context externalization) cuts costs by up to 90% compared to a naive agent loop.

[Choosing a model](/guides/choosing-a-model) | [Token optimization](/concepts/token-optimization)
