---
title: Installation and quick start
description: Install Vault Operator and start your first conversation in about 5 minutes.
---

# Installation and quick start

This takes about 5 minutes if your API key is already handy, 5 to 10 if you let Vault Operator download a local embedding model.

## Before you start

- **Obsidian 1.13 or later** on macOS, Windows, or Linux. Vault Operator is desktop-only. Earlier versions are blocked by `manifest.json`.
- **An internet connection** if you plan to use a cloud model. If you want everything offline, install [Ollama](https://ollama.ai) or [LM Studio](https://lmstudio.ai) first.
- **One AI provider API key**. Free options exist (Google Gemini, Ollama). API keys look like `sk-ant-...` for Anthropic, `sk-...` for OpenAI, or a long random string for Google. Get one from the provider's dashboard before you start.
- **About 100 MB of disk space** for the plugin, the embedding model, and the knowledge database. Large vaults add more.

If something goes wrong, the [Troubleshooting](/reference/troubleshooting) page covers the common failures (connection errors, semantic search not working, agent stuck in a loop).

## Install the plugin

Vault Operator is available in the official Obsidian Community Plugins directory.

1. Open **Settings > Community plugins > Browse**
2. Search for **Vault Operator** (plugin id `vault-operator`)
3. Click **Install**, then **Enable**

The Vault Operator icon appears in the left sidebar.

:::tip Shortcuts
- Direct deep link (opens Obsidian): [obsidian://show-plugin?id=vault-operator](obsidian://show-plugin?id=vault-operator)
- Community page: [community.obsidian.md/plugins/vault-operator](https://community.obsidian.md/plugins/vault-operator)
:::

## Run the first-run wizard

A seven-step setup wizard opens automatically the first three times you enable the plugin. The steps cover welcome, provider, model selection, embeddings, default folder, agent folder, and finish. It walks you through every step on this page.

To rerun the wizard later, open **Settings > Vault Operator > Advanced > Interface > Setup > Restart setup**.

If you prefer to set things up manually, read on.

## Add your first provider

Vault Operator needs an AI provider to work. Open **Settings > Vault Operator > Providers > Providers** and click **+ Add provider**. The Add provider modal opens.

### Free option (no credit card)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in and click **Create API key**
3. In the Add provider modal, pick **Google Gemini** as provider type and paste the key
4. Click **Refresh** next to the Models field. Vault Operator pulls Gemini's model list and sorts it into Budget, Main, and Frontier tiers.

Google Gemini has a free tier with reasonable rate limits, which is enough to try everything out before paying anyone.

### Best quality

| Provider | Default main | Default frontier | Notes |
|----------|--------------|------------------|-------|
| Anthropic | Claude Sonnet 4.5 | Claude Opus 4.6/4.7 | Best tool use in testing |
| OpenAI | GPT-5.1 / GPT-4.1 | GPT-5, GPT-5-pro | Fast, good at structured output |
| Google | Gemini 2.5 Flash | Gemini 2.5 Pro | Free tier, large context window |

### Local and private

If you want no data leaving your machine, run a model locally:

- Install [Ollama](https://ollama.ai), then run `ollama pull llama3.2`
- Or download [LM Studio](https://lmstudio.ai), install a model, and start the server

For local providers the Base URL field pre-fills with the default port. Click **Refresh** next to the Models field and you are done.

:::info Multiple providers
Vault Operator supports 12 providers. You can configure several and switch between them through the **Active provider** radio, or pin a specific model in the chat header for a single task.
:::

## Your first chat

1. Click the **Vault Operator icon** in the left sidebar
2. Type a message and press **Enter**
3. Watch the agent work. It shows every tool call in real time

### Try these prompts

- *"What notes do I have about [any topic]?"*
- *"Summarize the note I'm currently viewing"*
- *"Create a new note with a summary of my last 3 daily notes"*
- *"Find all notes tagged with #project and create a canvas showing their connections"*

:::tip Inline AI chat (v3.0.0)
Select text in any note and press **Cmd+Shift+I** (**Ctrl+Shift+I** on Windows and Linux) to open the inline AI chat panel directly over the selection. See [Inline chat](/guides/inline-chat) for details.
:::

## What happens behind the scenes

When you send a message, Vault Operator reads it and decides which tools to use. It then calls those tools (read files, search, write) while you see each call in the activity block. Before any write operation it asks for your approval, unless you've enabled auto-approve for that category. Then it returns a response.

Every write operation creates a checkpoint, so you can undo any change with one click.

By default the chat loop runs on the **Main tier** of your active provider. When the agent hits a hard synthesis step (cross-document reasoning, ambiguous instructions) it can escalate one step to the **Frontier tier** via `consult_flagship`, capped at three calls per task. The cost log in the developer console tags each turn with `mode=auto`, `mode=advisor`, `mode=override`, or `mode=subagent`. See [Advisor pattern](/concepts/advisor-pattern) for details.

## Next: Your first conversation

Continue with [Your first conversation](/tutorials/first-conversation) to learn context, approvals, and the activity block.

Then walk the knowledge tutorials in order:

1. [Search your vault by meaning](/tutorials/search-by-meaning)
2. [Capture a PDF with /ingest](/tutorials/quick-ingest)
3. [Sense-making with /ingest-deep](/tutorials/deep-ingest)

For deeper references, see [Choosing a model](/guides/choosing-a-model) and [Safety and control](/guides/safety-control).

If something does not work as described above, check the [Troubleshooting](/reference/troubleshooting) page first.
