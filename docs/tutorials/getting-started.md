---
title: Installation & Quick Start
description: Install Obsilo and start your first conversation in under 3 minutes.
---

# Installation & quick start

Get Obsilo running in your Obsidian vault in under 3 minutes.

## Install the plugin

1. Open **Obsidian Settings** > **Community Plugins** > **Browse**
2. Search for **"Obsilo Agent"**
3. Click **Install**, then **Enable**

The Obsilo icon appears in the left sidebar.

:::tip BRAT (Beta Testing)
For the latest beta version, install via [BRAT](https://github.com/TfTHacker/obsidian42-brat): Add `pssah4/obsilo` as a beta plugin.
:::

## Add your first model

Obsilo needs an AI model to work. Open **Settings > Obsilo Agent > Models** and click **"+ add model"**.

### Free option (no credit card)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in and click **"Create API Key"**
3. Copy the key and paste it into Obsilo

Google Gemini has a free tier with reasonable rate limits. Good enough to try everything out.

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

:::info No lock-in
Obsilo supports 10+ providers. You can switch models anytime, even mid-conversation. Configure multiple models and pick the right one for each task.
:::

## Your first chat

1. Click the **Obsilo icon** in the left sidebar
2. Type a message and press **Enter**
3. Watch the agent work. It shows every tool call in real time

### Try these prompts

- *"What notes do I have about [any topic]?"*
- *"Summarize the note I'm currently viewing"*
- *"Create a new note with a summary of my last 3 daily notes"*
- *"Find all notes tagged with #project and create a canvas showing their connections"*

## What happens behind the scenes

When you send a message, Obsilo:

1. Reads your message and decides which tools to use
2. Calls tools (read files, search, write), and you see each call in the activity block
3. Asks for your approval before any write operation (unless you enable auto-approve)
4. Returns a response with the result

Every write operation creates a checkpoint. You can undo any change with one click.

## Next steps

- [Your first conversation](/tutorials/first-conversation): Learn about modes, context, and how the agent thinks
- [Choosing a model](/guides/choosing-a-model): Find the best model for your workflow
- [Safety & control](/guides/safety-control): Understand permissions and checkpoints
