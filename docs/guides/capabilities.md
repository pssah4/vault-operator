---
title: What Vault Operator can do
description: A quick look at what Vault Operator actually does inside your vault and how it helps you work.
---

# What Vault Operator can do

Most AI tools sit outside your knowledge base and wait for you to copy and paste. Vault Operator lives inside it. It reads your notes, follows the graph that ties them together, picks up your habits, and acts on your behalf.

This page is the short tour. Each section links out to the guide that goes deep.

## Inline AI chat in the editor

*Available since v3.0.0.*

You can run a chat directly on the note you are reading. Select text, press Cmd+Shift+I (Ctrl+Shift+I on Windows and Linux) or right-click and pick "Inline AI chat", and a floating panel opens over the editor. From there you ask a question about the selection, look something up, rewrite, translate, summarize, or extract action items without leaving the note.

When the panel proposes a change to the file, the Änderungen prüfen modal opens first. You review each edit, apply only the ones you want, and the agent writes a checkpoint marker into the chat so you can undo the change later through the same checkpoint system used elsewhere in Vault Operator.

[Inline chat guide](/guides/inline-chat) | [Chat interface](/guides/chat-interface) | [Safety and control](/guides/safety-control)

## Capture sources with block-level provenance

Drop a PDF, web clip, or Office file into the chat. Vault Operator runs a fast triage against your vault's ontology and, if you choose to ingest, walks you through a short dialog before it writes anything.

The resulting sense-making note carries a `↗` link at the end of every claim. The link jumps back to the exact block in the source. No more "I have a note about this somewhere" without a path back to where the claim came from.

You drive this from chat with `/ingest` (single-pass capture) or `/ingest-deep` (triage, topic pick, source markup, sense-making note, backlinks). The five-step `/ingest-deep` flow stops at each question and waits for you.

> **Example prompt:** "Deep-ingest this research paper. Focus on the methodology section."

[Quick ingest tutorial](/tutorials/quick-ingest) | [Deep ingest tutorial](/tutorials/deep-ingest) | [Knowledge ingest guide](/guides/knowledge-ingest) | [Block-level provenance](/concepts/provenance)

## Three-layer memory across sessions

Vault Operator remembers what matters across chats, not only inside one chat.

- **Soul** holds long-lived preferences (writing style, project conventions, recurring choices).
- **Facts** hold structured statements about people, projects, and topics.
- **History** is a searchable transcript of past conversations.

The agent retrieves from all three layers when a new chat starts, and you can mark any note as a memory source so its content stays in scope.

> **Example prompt:** "Summarize this meeting note like last time." (It remembers your preferred format.)

[Memory and personalization](/guides/memory-personalization) | [How memory works](/concepts/memory-system) | [Mastery and recipes](/concepts/mastery)

## Find notes by meaning

When you ask "what do I know about X?", Vault Operator does not grep filenames. It searches by meaning over a local semantic index, walks wikilinks and frontmatter, and surfaces connections you may have missed.

The semantic index is opt-in. Turn it on once and pick when it builds: never (default), on startup, or on agent switch. After that, search behaves like a librarian who has read every note.

> **Example prompt:** "Find all notes related to behavioral economics and show me how they connect."

[Search by meaning tutorial](/tutorials/search-by-meaning) | [Knowledge discovery](/guides/knowledge-discovery) | [How the knowledge layer works](/concepts/knowledge-layer)

## Build Word, Excel, and PowerPoint files (PPTX in beta)

Vault Operator writes `.docx`, `.xlsx`, and `.pptx` files from your vault content.

DOCX and XLSX output is clean and reliable for everyday use. PPTX runs as a single pipeline: the agent first calls `plan_presentation` to turn your source notes into a constrained outline, then `create_pptx` builds the deck. PPTX is in beta, treat the output as a draft you finish manually for client-facing decks.

> **Example prompts:** "Turn this note into a Word document with proper headings and a table of contents." "Build a five-slide internal status presentation from my meeting notes."

[Office documents guide (beta details)](/guides/office-documents) | [How the office pipeline works](/concepts/office-pipeline)

## Keep the vault navigable with Vault Health

Vaults drift. Notes pile up in different folders, related ideas stop linking to each other, tags fork.

Vault Operator runs implicit connection analysis in the background and surfaces note pairs that are semantically close but have no wikilink. The vault health check goes further: it flags orphaned notes, broken links, inconsistent tags, missing backlinks, and "god nodes" (notes with so many connections they become bottlenecks instead of useful hubs). It also compares your folder and tag structure against the topic clusters it detects in the knowledge graph.

> **Example prompt:** "Run a health check on my vault and tell me what needs fixing."

[Vault health check](/guides/vault-health) | [Knowledge discovery](/guides/knowledge-discovery)

## Run as an MCP server for your other AI tools

Vault Operator ships an MCP server. Claude Desktop, ChatGPT, Perplexity, Claude Code, and any MCP-compatible client can read your vault, retrieve from the memory layer, and append to your conversation history.

Every external call carries a `source_interface` tag, so memory and history stay separable per surface. Strict source isolation is off by default. You opt in per surface under Settings > Vault Operator > Agents > Memory if you want a surface walled off from the rest.

You can also point Vault Operator at external MCP servers when you need extra tools.

> **Example prompt:** In ChatGPT: "Recall what my Vault Operator memory says about pricing strategy."

[Connectors guide](/guides/connectors) | [Unified chat memory](/concepts/unified-chat-memory) | [MCP architecture](/concepts/mcp-architecture)

## Discover and use your installed plugins

Vault Operator scans your installed plugins at startup and generates a skill file for each one. It can run Obsidian commands, call plugin APIs, and stitch multiple plugins into one workflow.

Dataview queries, Kanban boards, Templater templates, Tasks, Excalidraw: if you have the plugin installed, the agent can use it.

> **Example prompt:** "Create a Kanban board from the open tasks in my project notes."

[Skills, rules, and workflows](/guides/skills-rules-workflows) | [How plugin discovery works](/concepts/vault-dna)

## Stay in control via the auto-approval surface

Every file change asks for your approval. Every edit creates a snapshot you can undo with one click. The operation log records every step.

Under Settings > Vault Operator > Agents > Auto-approve you decide which categories run silently and which keep asking: read, write, web, vault, plugin API reads, plugin API writes, recipes, and MCP calls. You can also keep "ask every time" everywhere if you want every action to surface.

You pick the AI model. You decide what gets sent to the cloud. If you want zero cloud dependency, run everything locally with Ollama or LM Studio.

> **No surprises:** Vault Operator cannot change a file without showing you the diff first.

[Safety and control](/guides/safety-control) | [How governance works](/concepts/governance)

## It learns how you work

When the agent completes a task successfully, it remembers the tool sequence. After a few repetitions, the helper model plans a single deterministic execution from the matching recipe and skips most of the iterative reasoning. The same task drops from eight LLM calls to two, and from hundreds of thousands of tokens to tens.

[Mastery and recipes](/concepts/mastery)

## It delegates complex work

For tasks that span multiple topics, Vault Operator can spawn sub-agents. One can research meeting notes while another searches the web. A third stitches both into a document. Sub-agents run in isolation, each with their own conversation context. The main agent collects and combines their results.

> **Example prompt:** "Compare what my vault says about pricing strategy with the latest market research online, then write a recommendation note."

[Multi-agent guide](/guides/multi-agent)

## It runs the right model at the right time

You configure a provider once. Vault Operator discovers its models, sorts them into Budget, Main, and Frontier, and runs the chat loop on Main by default. The `consult_flagship` tool escalates one synthesis step to Frontier when the agent struggles, capped at three calls per task and 3000 output tokens. Cheap background work (context condensing, fast-path planning, presentation planning, recipe promotion) routes to a separate helper model you pick once.

[Choosing a model](/guides/choosing-a-model) | [Providers reference](/reference/providers)

## What it costs

Vault Operator itself is free and open source. You pay only for the AI model you use.

| Option | Monthly cost |
|--------|-------------|
| Google Gemini (free tier) | Free |
| Ollama / LM Studio (local) | Free (your hardware) |
| OpenRouter (cloud) | Pay per token, typically $0.50 to $5 per day |
| Anthropic / OpenAI (direct) | Pay per token, typically $1 to $10 per day |
| GitHub Copilot (subscription) | Included with Copilot subscription |
| ChatGPT Plus / Pro (OAuth) | Included with the existing subscription |

The cost-aware loop (advisor pattern, helper-model routing, KV-cache alignment, context externalization, prompt slim-down) keeps token use low. On simple search-and-summarize tasks the same workload drops from around 634K tokens to around 60K.

[Choosing a model](/guides/choosing-a-model) | [Token optimization](/concepts/token-optimization)
