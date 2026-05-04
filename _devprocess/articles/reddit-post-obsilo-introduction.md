# Reddit Post: Obsilo Vorstellung auf r/ObsidianMD

> **Zweck:** Erstveroeffentlichung / Vorstellung von Obsilo auf Reddit
> **Ziel-Subreddit:** r/ObsidianMD (ggf. auch r/Zettelkasten, r/PKMS)
> **Ton:** Knapp, catchy, Neugier wecken. Details auf obsilo.ai.
> **Erstellt:** 2026-04-01
> **Aktualisiert:** 2026-04-02

---

## Post Title

**I built an AI agent that doesn't just chat with your vault -- it operates it. Open source, 47 tools, full undo. Meet Obsilo.**

---

## Post Body

Hey r/ObsidianMD,

Every AI plugin I've tried for Obsidian does the same thing: you ask a question, it sends your notes to an LLM, you get text back. That's useful. But it's not an agent.

I wanted something different. So I built Obsilo.

### The difference in one sentence

**You give it a task. It plans, searches, reads, writes, and connects -- across your entire vault -- while you watch and approve.**

"Map out everything in my vault related to Project X and show me what I'm missing" isn't a prompt that generates text. It's a task: the agent searches semantically, follows wikilinks, discovers implicit connections between notes you never linked, reads them, generates an Excalidraw diagram or Canvas with the relationships, and creates a summary note with all the gaps it found. One prompt, multiple tool calls, you approve each write.

### Why it's not just another chat sidebar

**It actually does things.** 47 tools across 7 groups: read, write, edit, search, generate Canvas and Excalidraw diagrams, create Bases, manage frontmatter, browse the web, spawn sub-agents -- plus 6 MCP server tools for remote access. Not text generation -- vault operations.

**It uses your plugins.** This is huge. Obsilo auto-discovers every active plugin in your vault -- community and core -- and teaches itself how to use them. Excalidraw, Kanban, Dataview, Templater, Calendar, whatever you have installed. The agent reads their commands, settings, and file formats, then generates skill files from that. Install a new plugin, Obsilo learns it. Your plugin ecosystem becomes the agent's toolkit -- its capabilities grow with yours.

**It has a Knowledge Layer that actually understands your vault.** Not just vector search over chunks. Obsilo builds a graph from your wikilinks, tags, and MOC properties, then runs a 4-stage retrieval pipeline: vector similarity, graph expansion, implicit connection discovery ("these notes talk about the same topic but you never linked them"), and local reranking with a cross-encoder. It doesn't just find what you searched for -- it finds what you should have connected.

**It learns and remembers.** Three-tier memory system: session context, long-term patterns promoted across conversations, and a persistent identity layer with your preferences. The agent learns your writing style, your naming conventions, your project structures. Every conversation builds on the last. It doesn't start from zero.

**It generates visual structures.** Canvas maps, Excalidraw drawings, Bases (Obsidian's new database views) -- the agent creates them from your vault content. Ask it to visualize a topic cluster or build a project board and it figures out the structure.

**It also reads and creates Office docs.** Drag PPTX, DOCX, XLSX, PDF, or CSV into the chat and the agent understands them. It can create Office files too -- but the real power is in what it does with your native Obsidian formats.

**Use it remotely from Claude, ChatGPT, or Cursor.** Obsilo runs as an MCP server -- your vault becomes an API. Work in Claude Desktop, ChatGPT, Cursor, or any MCP-compatible client. Obsilo is the operating layer that stays in Obsidian and executes actions on your vault. You chat in your favorite interface, Obsilo does the work: semantic search, file edits, document creation, memory access -- all remote, all governed. No need to switch to Obsidian.

**It extends itself.** The agent writes its own skills, runs sandboxed TypeScript, and -- with your approval -- can even modify its own source code and hot-reload.

### What about safety?

This is the part I care about most. Every write goes through approval. Every task creates an automatic git checkpoint before touching anything -- one click to undo. Full audit trail. `.agentignore` and `.agentprotected` files to control access. The agent can't do anything you don't allow.

### The basics

- **Open source** (Apache 2.0), free, no telemetry
- **Local-first** -- your data stays on your machine  
- **BYO model** -- Anthropic, OpenAI, Ollama, Gemini, Azure, OpenRouter, GitHub Copilot, LM Studio, or any OpenAI-compatible endpoint
- **Custom modes** -- create agent personas with different tool sets and instructions
- **Rules, Skills, Workflows** -- shape agent behavior with Markdown files, no code needed
- **2 languages** -- EN, DE

### Current state

v2.2.8, 47 tools, ~60k lines of TypeScript across 256 files. Includes a full Knowledge Layer (SQLite + graph + reranker), MCP server for remote access, and a self-development framework. Beta via BRAT, not yet in Community Plugins.

**Website:** [www.obsilo.ai](https://www.obsilo.ai)
**GitHub:** [github.com/pssah4/obsilo](https://github.com/pssah4/obsilo)
**Install:** BRAT > Add `https://github.com/pssah4/obsilo`

Would love to hear: What would you want an agent like this to handle in your vault? What concerns you?

---

## Kurzversion (fuer r/PKMS, r/Zettelkasten, Twitter/X)

**Title:** Open-source AI agent for Obsidian -- not a chat window, an operating layer. 47 tools, graph-aware knowledge retrieval, full undo.

Every Obsidian AI plugin I've tried is a chat sidebar that generates text. Obsilo is different: you give it a task, it plans and executes across your vault using 47 governed tools. It builds a Knowledge Layer that follows your wikilinks, tags, and MOCs to surface implicit connections you missed. It auto-learns all your installed plugins and uses them. It remembers across sessions. It generates Canvas maps, Excalidraw diagrams, and Bases. And it works remotely as an MCP server -- use it from Claude, ChatGPT, or Cursor without opening Obsidian. Every write needs your approval, every change has an undo checkpoint.

Open source. Local-first. No telemetry. Works with any LLM provider.

[www.obsilo.ai](https://www.obsilo.ai) | [GitHub](https://github.com/pssah4/obsilo)

What would you use a vault agent for?
