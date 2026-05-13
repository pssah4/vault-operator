---
title: Choosing a Model
description: Understand AI providers, how to configure them, and what matters for a good Vault Operator experience.
---

# Choosing a model

Vault Operator works with many providers and models. Not all of them are equally good at being agents.

**You will need:** an account at the provider of your choice and an API key (or a local model server running). The [Tutorial](/tutorials/getting-started#before-you-start) lists the most common providers and where to grab a key.

**Use this guide when:** you are setting up a new model, deciding between cloud and local, picking a cheaper model for background tasks, or you need to understand the trade-offs to make this decision.

**You will know it works when:** you have at least one frontier model configured for primary use, optionally a cheaper model for background work (memory extraction, embeddings), and the **Test connection** button reports success for both.

## What makes a good model for Vault Operator

Vault Operator is an agent, not a chat assistant. The model needs to:

- Support tool use (function calling). It has to call Vault Operator's 60+ tools.
- Follow instructions precisely. The system prompt is dense with rules, skills, and mode definitions.
- Reason about multi-step tasks. Reading files, searching, editing, and verifying takes planning.

:::tip Use the latest, most capable models
Vault Operator works best with strong frontier models that are good at tool use and reasoning. Older or smaller models may struggle with bigger tasks, skip approval steps, or call the wrong tools. Most of the testing has been done with Anthropic Claude models.
:::

For background tasks like memory extraction, chat titling, or contextual retrieval, a cheap model is fine. Those tasks are simple and don't need tool use.

## Provider categories

Vault Operator supports three categories of providers, each with different trade-offs.

### Cloud providers (API key)

Create an account, get an API key, pay per usage. Best quality and reliability.

| Provider | How to get started | What you get |
|----------|--------------------|--------------|
| **Anthropic** | Create account at [console.anthropic.com](https://console.anthropic.com), generate API key (starts with `sk-ant-...`) | Claude model family. Best tool use in testing. |
| **OpenAI** | Create account at [platform.openai.com](https://platform.openai.com), generate API key (starts with `sk-...`) | GPT model family. Fast, good structured output. |
| **OpenRouter** | Create account at [openrouter.ai](https://openrouter.ai), generate API key (starts with `sk-or-...`) | 100+ models from many providers with a single key. Some free tiers. |
| **Azure OpenAI** | Enterprise deployment through Azure portal | OpenAI models with enterprise compliance and private endpoints. |

### Gateway providers (login-based)

No API key needed. You sign in with an existing account.

| Provider | How to get started | What you get |
|----------|--------------------|--------------|
| **GitHub Copilot** | Click "Sign in with GitHub" in the model config. A device code appears; enter it at github.com/login/device. Requires an active Copilot subscription. | Multiple frontier models through your existing Copilot subscription. No separate API key. Uses an unofficial API (models may change). |
| **Kilo Gateway** | Click "Sign in" in the model config, or paste an API token directly. | Centralized gateway to multiple frontier models. Organization context, dynamic model listing, managed access. |

### Local providers (free, private)

Models run on your machine. No data leaves your device. Free, but needs decent hardware (8GB+ RAM recommended).

| Provider | How to get started | What you get |
|----------|--------------------|--------------|
| **Ollama** | Install from [ollama.ai](https://ollama.ai). Pull a model: `ollama pull llama3.2`. The server starts automatically at `http://localhost:11434`. | Many open-source models. Best local experience. Pick a model that supports tool use. |
| **LM Studio** | Install from [lmstudio.ai](https://lmstudio.ai). Download a model in the app, then start the local server from the Developer tab. | Visual model browser, easy setup. Default URL: `http://localhost:1234`. |
| **Custom** | Any server with an OpenAI-compatible API. Enter the base URL (with `/v1` suffix) and optional API key. | For self-hosted inference servers, corporate proxies, or any compatible endpoint. |

## How to add a model in Vault Operator

1. Open **Settings > Vault Operator > Models**
2. Click **"+ add model"**
3. Select a **provider** from the dropdown
4. Follow the provider-specific instructions:
   - API key providers: Paste your key, select or enter a model ID
   - GitHub Copilot: Click "Sign in with GitHub", complete the device flow
   - Kilo Gateway: Click "Sign in" or paste a token
   - Local providers: Enter the base URL, click "Browse installed models" to pick one
5. Optionally set a display name and adjust temperature and max tokens
6. Click **Add**

:::info Quick pick
For API-key providers, the "Quick pick" dropdown shows popular models with pre-filled IDs. For Ollama and LM Studio, the "Browse installed/available models" button fetches what is running on your local server.
:::

## Using different models for different tasks

You don't have to use the same model everywhere. Vault Operator lets you assign models per context. In Settings > Modes, each mode can override the default model: a strong model for Agent mode and a cheaper one for Ask mode works well. Settings > Memory lets you pick a small model for background memory extraction (it only summarizes conversations). Settings > Interface > Chat Linking has its own model for generating conversation titles. Settings > Embeddings lets you pick a cheap model for enriching search chunks in the background.

A typical setup is one frontier model for interactive work and one lightweight model for everything in the background.

## Embedding models

Semantic search needs a separate embedding model. This is a specialized model that converts text into vectors for similarity search.

Configure it in **Settings > Embeddings > add embedding model**. Common choices:
- Any OpenAI-compatible embedding endpoint
- Local embedding models via Ollama (e.g., `nomic-embed-text`)
- GitHub Copilot and Kilo Gateway also support embedding models

The embedding model only affects search quality. It has no effect on chat responses.

## Cost considerations

| Approach | Monthly cost | Notes |
|----------|-------------|-------|
| Local only (Ollama/LM Studio) | Free | Requires capable hardware. Quality depends on model size. |
| Free tiers (OpenRouter, Google) | Free | Rate-limited. Good for light usage. |
| GitHub Copilot | Included in subscription | If you already pay for Copilot, no extra cost. |
| Cloud API (light usage) | $5--15 | A few conversations per day. |
| Cloud API (heavy usage) | $20--50+ | Daily power user with complex tasks. |

## Next steps

- [Chat interface](/guides/chat-interface): How the chat experience works in detail
- [Knowledge discovery](/guides/knowledge-discovery): Set up semantic search (needs an embedding model)
- [Providers reference](/reference/providers): Step-by-step setup for each provider
