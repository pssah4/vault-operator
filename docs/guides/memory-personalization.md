---
title: Memory & Personalization
description: How Obsilo remembers your preferences, projects, and patterns, and how memory works across your other AI tools.
---

# Memory & Personalization

Obsilo remembers what you care about, how you like to work, and what you have discussed before. The same memory store also takes input from the other AI tools you use, so a fact learned in Claude Code can surface in an Obsilo conversation.

The mechanics behind this are explained in [Memory](../concepts/memory-system) and [Unified Chat Memory](../concepts/unified-chat-memory). This page covers how to use it day to day.

## How it remembers

Memory v2 stores everything as **facts**. A fact is a single short statement with metadata: when it was learned, which AI tool produced it, how often it has been confirmed, which topics it belongs to. Old fixed-category files (`user-profile.md`, `projects.md`, `patterns.md`, `soul.md`) are gone. The fact store handles all of those at once.

Three things happen automatically:

- **At the start of each conversation**, Obsilo picks the facts that match what the conversation is about and includes them in the system prompt. A coding chat sees coding facts; a personal chat sees identity and preference facts.
- **At the end of each conversation**, Obsilo extracts new facts from the transcript in a single LLM call. Facts that re-appear get a confirmation boost. Facts that contradict existing ones produce an edge so you keep the history.
- **In the background**, importance scores age based on how often a fact gets used. Identity-level facts decay slowly (months). Event facts decay quickly (weeks). Nothing gets deleted; it sinks down the ranking until something more relevant takes its place.

You can browse, edit, or soft-delete individual facts. **Settings > Memory > View memory** opens a viewer with a list of facts, edges, and the active communication style.

:::tip You are in control
Memory is just a SQLite file (`memory.db`). The viewer lets you remove anything that is wrong. Auto-extraction never overwrites a fact in place, so the original is always recoverable through the audit log.
:::

## Three layers, one store

The internal architecture is the **Three-Layer Memory Architecture (3LMA)**:

| Layer | What it does |
|-------|--------------|
| **Facts** | Stores facts, edges, and communication styles |
| **Retrieval** | Picks the right facts for the current conversation using topic inference and hybrid search |
| **Updates** | Extracts new facts, resolves conflicts, ages importance over time |

You will rarely need to think about which layer does what. The viewer shows facts; the agent retrieves and updates them. The full breakdown lives in [Memory](../concepts/memory-system).

## Memory across your other AI tools

If you use Claude Desktop, Claude Code, ChatGPT, or Perplexity alongside Obsilo, memory can flow between them via the MCP server.

The shared layer is called **Unified Chat Memory (UCM)**. From your side, here is what it gives you:

- Conversations from those tools land in Obsilo's history sidebar, in a tab named after the source (Claude.ai, Claude Code, ChatGPT, Perplexity).
- Facts saved in those tools end up in the same store as Obsilo's own facts, with a `source_interface` tag.
- The other tool can call `recall_memory` and `search_history` to read what Obsilo knows.
- A topic that crosses tools (start in Claude.ai, continue in Claude Code) can be linked into a single cross-interface thread.

To set this up, see [Connectors](./connectors).

### Sync modes per tool

Family-shared accounts are a real concern. ChatGPT and Perplexity ship with **Manual** sync mode by default, which means saved conversations stay in history but do not flow into memory until you confirm. Your personal Claude tools default to **Auto**, where extraction runs immediately.

Override per source in **Settings > Memory > Cross-Surface Sync**.

### Living documents

The other tools usually save the same conversation more than once as it grows. UCM treats those repeated saves as a living document: new turns get appended to the existing conversation instead of creating duplicates. The 30-minute window per MCP session keeps it predictable. **Settings > Memory > Living-Document by default** controls the global setting.

## Chat history

Chat history is on by default. Every conversation, both Obsilo's own and those saved from other tools, lives in `history.db` and shows up in the sidebar.

To open the history:

1. Click the clock icon in the chat toolbar.
2. The panel groups conversations by date (Today, Yesterday, This Week, Older).
3. Source tabs above the list let you filter to one tool at a time.
4. Click any conversation to restore it and pick up where you left off.

If you have a small, fast titling model configured (Haiku, Flash, or GPT-4o mini work well), Obsilo titles conversations automatically. Without one, it falls back to the first 60 characters.

## Chat-Linking

When Obsilo creates or edits a note, it can add a link back to the conversation in the note's frontmatter. Anyone reading the note later can jump straight to the chat that produced it.

How it works:

- A `obsilo-chat` field is added to the note's YAML frontmatter
- The value is a clickable link in the format `obsidian://obsilo-chat?id=...`
- Clicking the link opens Obsilo and jumps straight to that conversation

To configure Chat-Linking, go to **Settings > Obsilo Agent > Interface** and look for the "Auto-link chats in frontmatter" toggle.

:::info Cost saving
Use a cheap, fast model for titling, separate from your main model. Even small models handle short titles well.
:::

## Onboarding wizard

When you first install Obsilo, a conversational setup wizard walks you through the basics:

1. Introduction: Obsilo introduces itself and asks your name
2. Naming: rename the agent if you prefer a different name
3. Backup reminder: a prompt to back up your vault before you let the agent write
4. Permissions: pick your comfort level for automatic approvals
5. Profile: tell it what you use your vault for so it can tailor its help

Your answers go straight into the fact store as identity-kind facts with a high initial importance and a long half-life. Obsilo is personalized from the first real task.

## Vault notes as memory sources

You can mark any vault note as a memory source. Obsilo runs the same extraction pipeline against it that runs after a conversation, with `source_uri='vault://...'`. Edits to the note retrigger extraction in the background. Long-form documents like `personal-profile.md` or `project-roadmap.md` become structured facts without losing the original.

To mark a note, open the note in Obsidian and use the command **Obsilo: Mark as memory source**. The note shows up in **Settings > Memory > Memory source notes** with the count of facts it has produced.

## Memory settings

Open **Settings > Obsilo Agent > Memory** to configure:

| Setting | What it does | Default |
|---------|--------------|---------|
| Enable memory | Master toggle for the entire memory system | On |
| Auto-extract sessions | Run the single-call extractor when a conversation ends | On |
| Memory model | Which AI model runs extraction (pick a cheap one) | Your first model |
| Atomiser model | The model that turns transcripts into atomic facts | Same as Memory model |
| Minimum messages | Conversations shorter than this threshold are skipped (range: 2 to 20) | 4 |
| Chat history | Save conversations so you can browse and restore them | On |
| Cross-Surface Sync > Default sync-mode | Auto or Manual when a source has no override | Auto |
| Cross-Surface Sync > Living-Document by default | Treat repeated `save_conversation` calls as appends | On |
| Cross-Surface Sync > Sync mode per provider | Override Auto vs Manual per source | Defaults above |
| View memory | Browse facts, edges, communication styles | n/a |
| Delete all memory | Wipe the entire fact store and audit log (requires typing DELETE) | n/a |

:::warning Pick a cheap memory model
Single-call extraction runs after every qualifying conversation. A small model (Haiku, Flash, or GPT-4o mini) keeps the cost low. The task is structured and does not need a large model.
:::

## Tips

1. Have real conversations. The more you interact, the more the fact store learns. One-off lookups produce little memory.

2. Correct the agent. If a fact is wrong, tell it. Corrections produce an edge of kind `update` and the new fact takes precedence in retrieval.

3. Skim the memory viewer now and then. Soft-delete anything outdated. The audit log keeps a record so you can recover if you remove something by mistake.

4. Tune the minimum messages threshold to your habits. Short chats not worth remembering? Raise it. Every conversation matters? Lower it.

5. Use sync mode per source if you share an AI account with family. Manual mode keeps the conversation in history but holds extraction back until you confirm.

6. Keep Chat-Linking on. The frontmatter links give you an audit trail across notes, conversations, and tools.
