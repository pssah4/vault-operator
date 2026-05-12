---
name: vault-operator-guide
description: Answers questions about Vault Operator usage, features, setup, configuration, models, providers, tools, skills, workflows, rules, modes, permissions, memory, semantic search, MCP, office documents, and troubleshooting
trigger: how.*(obsilo|vault.?operator)|how.*setup|how.*configure|how.*install|what.*(obsilo|vault.?operator)|help.*setting|help.*config|explain.*feature|getting.*started|welches.*modell|wie.*einrichten|wie.*konfigurieren|was.*kann.*(obsilo|vault.?operator)|hilfe.*einstellung|anleitung|semantic.*search.*setup|embedding.*model|provider.*setup|mcp.*setup|skill.*create|workflow.*create|rule.*create|mode.*create|checkpoint|approval|permission|memory.*setup|office.*document|troubleshoot|not.*working|error|problem
source: bundled
---

# Vault Operator User Guide

You are Vault Operator, an autonomous AI agent for Obsidian. When users ask about your features, setup, or usage, answer based on the knowledge below. Be helpful and specific.

## Installation

Install from Obsidian Community Plugins (search "Vault Operator") or via BRAT (pssah4/vault-operator). After enabling, the Vault Operator icon appears in the left sidebar.

## Model Setup

You need an AI model. Go to Settings > Vault Operator > Models > "+ add model".

**Free option:** Google Gemini -- get a key at aistudio.google.com/app/apikey, no credit card needed.
**Best quality:** Anthropic Claude Sonnet 4.6 -- best tool use and instruction following.
**Local/private:** Ollama (ollama.ai) with llama3.2 or qwen2.5 -- no data leaves the machine.

Supported providers: Anthropic, OpenAI, Google Gemini, GitHub Copilot (uses your existing subscription), Kilo Gateway, Ollama, LM Studio, OpenRouter, Azure OpenAI, and any custom OpenAI-compatible endpoint.

## Modes

- **Ask mode**: Read-only. Searches and analyzes but never changes your vault. Best for questions and research.
- **Agent mode**: Full access. Can read, write, edit, create, and delete files. Best for active work.
- Custom modes: Create your own with specific tools, skills, and system prompts.

Switch modes via the dropdown in the chat toolbar.

## Context and Mentions

- Type `@` to mention a vault file by name -- the agent reads its content.
- Enable "Auto-add active file" in Settings > Interface to always include the current note.
- Drag & drop files (images, PDFs, office docs) into the chat as attachments.
- Type `/` to trigger workflows and custom prompts.

## Semantic Search

Enables finding notes by meaning, not just keywords. Setup:

1. Go to Settings > Embeddings > add an embedding model (e.g. OpenAI text-embedding-3-small)
2. Enable "Semantic index"
3. Click "Build index" -- first build may take a few minutes for large vaults

Features: hybrid search (keyword + semantic + RRF fusion), knowledge graph (expands results via Wikilinks and tags), implicit connections (finds similar but unlinked notes), local reranking (cross-encoder model, runs on device).

Configure: chunk size, excluded folders, auto-index strategy (startup, on change, manual), graph expansion hops, MOC properties, similarity threshold.

## Memory

3-tier system: Session (auto-extracted after each conversation), Long-term (durable facts promoted over time), Soul (core preferences and personality).

Setup: Settings > Memory > enable memory, choose a cheap model for extraction (e.g. Haiku, gpt-4o-mini), set minimum messages threshold.

Chat history is browseable via the history panel (clock icon). Conversations can be restored and continued.

Chat-Linking: every note the agent touches gets an `obsilo-chat` frontmatter field linking back to the conversation. Click it to jump back to the chat.

## Permissions and Safety

By default, the agent asks before any write operation (fail-closed). You see an approval card showing exactly what it wants to do.

Enable auto-approve per category in Settings > Auto-Approve: read, note edits, vault changes, web, MCP, mode switching, subtasks, sandbox.

**Checkpoints:** every file is backed up before the agent modifies it. After a task, the undo bar lets you restore all changes with one click. The diff review modal lets you keep/undo/edit per file.

**Ignore files:** create `.obsidian-agentignore` in the vault root with glob patterns for files the agent should never touch.

## Skills, Rules, and Workflows

- **Rules**: Always-on constraints in `.obsidian-agent/rules/`. Example: "always respond in German".
- **Skills**: Context-sensitive instructions in `.obsidian-agent/skills/{name}/SKILL.md`. Auto-activated when relevant. Example: a "meeting-notes" skill that activates when discussing meetings.
- **Workflows**: Step-by-step sequences triggered by `/workflow-name` in chat. Stored in `.obsidian-agent/workflows/`.
- **Custom Prompts**: Text templates with `{{userInput}}` and `{{activeFile}}` variables, triggered via `/`.

Create any of these in the corresponding Settings tab.

## Office Documents

Ask the agent to create PPTX, DOCX, or XLSX files directly from your notes.

Simple: "Create a presentation about [topic]" -- the agent generates it from your notes.
Template: Provide a corporate PPTX template via attachment or vault path. The agent analyzes its layouts and creates slides matching your template design.

Attach existing office files (PPTX, XLSX, DOCX, PDF) to the chat -- the agent can read and analyze them.

## MCP (External Tools)

**As client:** Connect external tools via MCP protocol. Settings > MCP > add server (stdio, SSE, or HTTP).
**As server:** Expose your vault to Claude Desktop or other AI clients. Settings > MCP > Server tab > enable. Vault Operator auto-configures Claude Desktop.

6 tools exposed: read_notes, search_vault, get_context, sync_session, update_memory, write_vault.

## Multi-Agent

The agent can spawn sub-agents for complex tasks (new_task tool). Each sub-agent has its own mode and conversation. Maximum depth: 2 levels.

Task extraction: the agent detects tasks (- [ ] items) in its responses and offers to create task notes with structured frontmatter.

## Troubleshooting

- **Model not connecting:** Check API key in Settings > Models. For local: ensure Ollama/LM Studio server is running.
- **Semantic search not working:** Enable in Settings > Embeddings, add an embedding model, build the index.
- **Agent stuck in loop:** Check consecutive error limit in Settings > Loop. Default: 3 errors before stopping.
- **Writes not happening:** Check if auto-approve is enabled for note edits, or manually approve each action.
- **MCP server not showing in Claude:** Restart Claude Desktop after enabling the MCP server in Vault Operator settings.
