---
title: Installation & Quick Start
description: Install Vault Operator and start your first conversation in under 3 minutes.
---

# Installation & quick start

This takes about 3 minutes if your API key is already handy.

## Before you start

- **Obsidian 1.4 or later** on macOS, Windows, or Linux. Vault Operator is desktop-only.
- **An internet connection** if you plan to use a cloud model. If you want everything offline, install [Ollama](https://ollama.ai) or [LM Studio](https://lmstudio.ai) first.
- **One AI provider API key**. Free options exist (Google Gemini, Ollama). API keys look like `sk-ant-...` for Anthropic, `sk-...` for OpenAI, or a long random string for Google. Get one from the provider's dashboard before you start.
- **About 100 MB of disk space** for the plugin, the embedding model, and the knowledge database. Large vaults add more.

If something goes wrong, the [Troubleshooting](/reference/troubleshooting) page covers the common failures (connection errors, semantic search not working, agent stuck in a loop).

## Install the plugin

Vault Operator is available in the official Obsidian Community Plugins directory.

1. Open **Obsidian Settings** > **Community Plugins** > **Browse**
2. Search for **"Vault Operator"**
3. Click **Install**, then **Enable**

The Vault Operator icon appears in the left sidebar.

:::tip Shortcuts
- Direct deep link (opens Obsidian): [obsidian://show-plugin?id=vault-operator](obsidian://show-plugin?id=vault-operator)
- Community page: [community.obsidian.md/plugins/vault-operator](https://community.obsidian.md/plugins/vault-operator)
:::

:::tip BRAT (Beta Testing)
For the latest beta version (pre-release, ahead of the public store), install via [BRAT](https://github.com/TfTHacker/obsidian42-brat): Add `pssah4/vault-operator` as a beta plugin.
:::

## Add your first model

Vault Operator needs an AI model to work. Open **Settings > Vault Operator > Models** and click **"+ add model"**.

### Free option (no credit card)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in and click **"Create API Key"**
3. Copy the key and paste it into Vault Operator

Google Gemini has a free tier with reasonable rate limits, which is enough to try everything out before paying anyone.

### Best quality

| Provider | Model | Strengths |
|----------|-------|-----------|
| Anthropic | Claude Sonnet 4.6 | Best overall quality, excellent tool use |
| OpenAI | GPT-4o | Fast, good at structured output |
| Google | Gemini 2.5 Pro | Free tier, large context window |

### Local & private

If you want no data leaving your machine, run a model locally:

- Install [Ollama](https://ollama.ai), then run `ollama pull llama3.2`
- Or download [LM Studio](https://lmstudio.ai), install a model, and start the server

:::info Multiple providers
Vault Operator supports 10+ providers. You can switch models mid-conversation, so it's fine to configure several and pick per task.
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

## What happens behind the scenes

When you send a message, Vault Operator reads it and decides which tools to use. It then calls those tools (read files, search, write) while you see each call in the activity block. Before any write operation it asks for your approval, unless you've enabled auto-approve for that category. Then it returns a response.

Every write operation creates a checkpoint, so you can undo any change with one click.

## Next steps

From here, read [Your first conversation](/tutorials/first-conversation) for modes and context, [Choosing a model](/guides/choosing-a-model) to pick a model for your workflow, and [Safety & control](/guides/safety-control) for how permissions and checkpoints work.

If something does not work as described above, check the [Troubleshooting](/reference/troubleshooting) page first.
