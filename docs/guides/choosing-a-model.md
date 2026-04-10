---
title: Choosing a Model
description: Understand AI providers, how to configure them, and what matters for a good Obsilo experience.
---

# Choosing a model

Obsilo works with many providers and models. Not all are equally good at being agents.

## What makes a good model for Obsilo

Obsilo is an agent, not a chat assistant. The model needs to:

- Support tool use (function calling). It must call Obsilo's 49 tools.
- Follow instructions precisely. The system prompt is complex, with rules, skills, and mode definitions.
- Reason about multi-step tasks. Reading files, searching, editing, and verifying requires planning.

:::tip Use the latest, most capable models
Obsilo works best with strong frontier models that excel at tool use and reasoning. Older or smaller models may struggle with complex tasks, skip approval steps, or call the wrong tools. Testing has been done primarily with Anthropic Claude models.
:::

For background tasks like memory extraction, chat titling, or contextual retrieval, a cheap model is fine. These tasks are simple and don't require tool use.

## Provider categories

Obsilo supports three categories of providers, each with different trade-offs.

### Cloud providers (API key)

You create an account, get an API key, and pay per usage. Best quality and reliability.

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

## How to add a model in Obsilo

1. Open **Settings > Obsilo Agent > Models**
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

You don't have to use the same model everywhere. Obsilo lets you assign models per context:

- **Per-mode models:** In Settings > Modes, each mode can override the default model. Use a strong model for Agent mode and a cheaper one for Ask mode.
- **Memory model:** In Settings > Memory, pick a small model for background extraction (it only summarizes conversations).
- **Chat titling model:** In Settings > Interface > Chat Linking, pick a small model for generating conversation titles.
- **Contextual retrieval model:** In Settings > Embeddings, pick a cheap model for enriching search chunks in the background.

A typical setup: one frontier model for interactive work, one lightweight model for everything in the background.

## Embedding models

Semantic search needs a separate embedding model. This specialized model converts text into vectors for similarity search.

Configure it in **Settings > Embeddings > add embedding model**. Popular choices:
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

- [Chat interface](/guides/chat-interface): Deep dive into the chat experience
- [Knowledge discovery](/guides/knowledge-discovery): Set up semantic search (needs an embedding model)
- [Providers reference](/reference/providers): Detailed step-by-step setup for each provider
