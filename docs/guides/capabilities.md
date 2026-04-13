---
title: What Obsilo Can Do
description: A quick look at what makes Obsilo different and how it can help you work with your vault.
---

# What Obsilo can do

Most AI tools sit outside your knowledge base and wait for you to copy-paste. Obsilo lives inside it. It reads your notes, understands how they connect, learns your habits, and acts on your behalf. Here is what that means in practice.

## An AI that understands your vault

Obsilo does not just access your files. It understands the structure: wikilinks, frontmatter properties, tags, folder hierarchies, and the graph that ties them together.

When you ask "what do I know about X?", it does not grep through filenames. It searches by meaning, walks the knowledge graph, and finds connections you may have missed.

> **Example prompt:** "Find all notes related to behavioral economics and show me how they connect."

[Set up semantic search](/guides/knowledge-discovery) | [How the knowledge layer works](/concepts/knowledge-layer)

## It discovers what you missed

Your vault grows organically. Notes pile up in different folders. Over time, related ideas drift apart without anyone linking them.

Obsilo runs implicit connection analysis in the background. It finds note pairs that are semantically similar but have no wikilink between them. The vault health check goes further: it flags orphaned notes, broken links, inconsistent tags, missing backlinks, and "god nodes" (notes with so many connections that they become bottlenecks rather than useful hubs). It also compares your folder and tag structure against the topic clusters it detects in the knowledge graph.

> **Example prompt:** "Run a health check on my vault and tell me what needs fixing."

[Vault health check](/guides/vault-health) | [Knowledge discovery](/guides/knowledge-discovery)

## It learns how you work

When the agent completes a task successfully, it remembers the tool sequence. After a few repetitions, it builds a "recipe" and runs similar tasks 10x faster, using 90% fewer tokens.

It also remembers your preferences, your writing style, and your projects. Not just within one chat, but across sessions. It builds a profile over time and adapts to how you like things done.

> **Example prompt:** "Summarize this meeting note like last time." (It remembers your preferred format.)

[Memory and personalization](/guides/memory-personalization) | [How memory works](/concepts/memory-system)

## You stay in control

Every file change needs your approval. Every edit creates a git snapshot you can undo with one click. The operation log records everything the agent did.

You choose the AI model. You decide what gets sent to the cloud. You can run everything locally with Ollama or LM Studio if you want zero cloud dependency.

> **No surprises:** Obsilo cannot change a file without showing you the diff first.

[Safety and control](/guides/safety-control) | [How governance works](/concepts/governance)

## It works with your plugins

Obsilo scans your installed plugins at startup and generates skill files for each one. It can run Obsidian commands, call plugin APIs, and build workflows that combine multiple plugins.

Dataview queries, Kanban boards, Templater templates, Tasks plugin, Excalidraw drawings: if you have the plugin installed, the agent can use it.

> **Example prompt:** "Create a Kanban board from the open tasks in my project notes."

[Skills, rules, and workflows](/guides/skills-rules-workflows) | [How plugin discovery works](/concepts/vault-dna)

## It creates documents from your knowledge

Need a presentation for Monday? Obsilo turns your meeting notes into a PowerPoint. It creates Word documents from project notes and Excel sheets from structured data.

You can use your own PPTX templates. The agent analyzes the slide layouts and fills them with content from your vault. No manual copy-paste needed.

> **Example prompt:** "Create a presentation about Q2 results using the corporate template."

[Office documents guide](/guides/office-documents) | [How the office pipeline works](/concepts/office-pipeline)

## It connects to everything

Obsilo includes an MCP server. That means Claude Desktop, Claude Code, and any MCP-compatible tool can search your vault, read your notes, and create content through your vault's intelligence layer.

You can also connect Obsilo to external MCP servers for additional capabilities.

> **Example prompt:** In Claude Desktop: "Search my Obsidian vault for notes about the product launch."

[Connectors guide](/guides/connectors) | [MCP architecture](/concepts/mcp-architecture)

## It delegates complex work

For tasks that span multiple topics, Obsilo can spawn sub-agents. One researches meeting notes while another searches the web, and a third synthesizes both into a document.

Sub-agents run in isolation, each with their own conversation context. The main agent collects and combines their results.

> **Example prompt:** "Compare what my vault says about pricing strategy with the latest market research online, then write a recommendation note."

[Multi-agent guide](/guides/multi-agent)

## What it costs

Obsilo itself is free and open source. You pay only for the AI model you use.

| Option | Monthly cost |
|--------|-------------|
| Google Gemini (free tier) | Free |
| Ollama / LM Studio (local) | Free (your hardware) |
| OpenRouter (cloud) | Pay per token, typically $0.50-5 per day |
| Anthropic / OpenAI (direct) | Pay per token, typically $1-10 per day |
| GitHub Copilot (subscription) | Included with Copilot subscription |

Obsilo's token optimization (Fast Path, KV-cache alignment, context externalization) reduces costs by up to 90% compared to a naive agent loop.

[Choosing a model](/guides/choosing-a-model) | [Token optimization](/concepts/token-optimization)
