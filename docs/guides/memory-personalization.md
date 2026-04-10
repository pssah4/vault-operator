---
title: Memory & Personalization
description: How Obsilo remembers your preferences, projects, and patterns across conversations.
---

# Memory & Personalization

Obsilo remembers what you care about, how you like to work, and what you have discussed before.

## How it remembers

Obsilo uses a three-tier memory system:

| Tier | What it stores | How it works |
|------|---------------|-------------|
| **Session memory** | Summary of each conversation: what was accomplished, decisions made, open questions | Created automatically when a conversation ends |
| **Long-term memory** | Durable facts promoted from sessions: your preferences, active projects, workflow patterns | Extracted in the background by comparing session summaries against existing memory |
| **Soul** | Core understanding of you: communication style, personality preferences, how you want the agent to behave | Updated when sessions reveal new preferences or corrections |

All memory files are stored in `.obsidian-agent/memory/` inside your vault's plugin directory. They are plain Markdown files you can read, edit, or delete at any time.

:::tip You are in control
Memory files are just text. Open them in any editor to see what Obsilo remembers. Delete a file to make it forget that category entirely.
:::

## Chat history

Every conversation is saved automatically (when chat history is enabled). You can browse, restore, and continue past conversations.

To access your chat history:

1. Click the clock icon in the chat toolbar
2. A sliding panel shows all past conversations grouped by date (Today, Yesterday, This Week, Older)
3. Click any conversation to restore it and continue where you left off

Conversations show the time they started and a short title. If you have a titling model configured (see Chat-Linking below), titles are generated automatically from the conversation content.

## Chat-Linking

When Obsilo creates or edits a note, it can add a link back to the conversation in the note's frontmatter. This lets you trace any change back to the conversation that caused it.

How it works:

- An `obsilo-chat` field is added to the note's YAML frontmatter
- The value is a clickable link in the format `obsidian://obsilo-chat?id=...`
- Clicking the link opens Obsilo and jumps straight to that conversation

Semantic titling: If you configure a small, fast model (like Haiku or GPT-4o mini) as the titling model, Obsilo generates meaningful conversation titles automatically. Without a titling model, the first 60 characters of the conversation are used instead.

To configure Chat-Linking: Go to **Settings > Obsilo Agent > Interface** and look for the "Auto-link chats in frontmatter" toggle. You can also select your preferred titling model there.

:::info Cost saving
Use a cheap, fast model for titling (separate from your main model). It only needs to generate a short title, so even the smallest models work fine.
:::

## Onboarding wizard

When you first install Obsilo, a conversational setup wizard walks you through the basics:

1. Introduction: Obsilo introduces itself and asks your name
2. Naming: you can rename the agent if you prefer a different name
3. Backup reminder: a prompt to back up your vault before letting the agent write
4. Permissions: choose your comfort level for automatic approvals
5. Profile: share what you use your vault for so Obsilo can tailor its help

The wizard runs as a normal chat conversation, not a form or popup. Your answers are saved to memory right away, so Obsilo starts personalized from the first real task.

## Memory settings

Open **Settings > Obsilo Agent > Memory** to configure:

| Setting | What it does | Default |
|---------|-------------|---------|
| **Enable memory** | Master toggle for the entire memory system | On |
| **Auto-extract sessions** | Automatically create a session summary when a conversation ends | On |
| **Auto-update long-term** | Promote durable facts from sessions to long-term memory | On |
| **Memory model** | Which AI model runs the extraction (pick a cheap one) | Your first model |
| **Minimum messages** | Conversations shorter than this threshold are skipped (range: 2-20) | 4 |
| **Chat history** | Save conversations so you can browse and restore them | On |

:::warning Pick a cheap memory model
Memory extraction runs after every qualifying conversation. Use a small model (Haiku, Flash, or GPT-4o mini) to keep costs low. The extraction task is simple and does not need a large model.
:::

## User profile

As you work with Obsilo, it builds a profile of your preferences in `user-profile.md`:

- Your name and how you prefer to be addressed
- Topics and projects you work on
- Communication style preferences (brief vs. detailed, formal vs. casual)
- Tools and workflows you use frequently

The agent reads this profile at the start of each conversation to personalize its responses. You can edit the file directly to correct or add information.

## Tips

1. Have real conversations. The more you interact, the better Obsilo understands your preferences. Short one-off questions do not generate much memory.

2. Correct the agent. If Obsilo gets a preference wrong, tell it. Corrections are prioritized in memory extraction.

3. Review your memory files occasionally. Open `.obsidian-agent/memory/` and scan the files. Remove anything outdated or incorrect.

4. Use the minimum messages threshold wisely. If you often have short chats that are not worth remembering, raise the threshold. If every conversation matters, lower it.

5. Keep Chat-Linking enabled. The frontmatter links create an audit trail. You can always find *why* a note was changed and *what was discussed*.
