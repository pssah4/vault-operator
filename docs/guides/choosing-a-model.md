---
title: Choosing a Model
description: Understand AI providers, how to configure them, and what matters for a good Vault Operator experience.
---

# Choosing a model

Vault Operator works with many providers and models. Not all of them are equally good at being agents.

**You will need:** an account at the provider of your choice and an API key (or a local model server running). The [Tutorial](/tutorials/getting-started#before-you-start) lists the most common providers and where to grab a key.

**Use this guide when:** you are setting up a new provider, deciding between cloud and local, picking a cheaper helper model for background tasks, or you need to understand the trade-offs.

**You will know it works when:** you have at least one provider configured with a populated Main tier (and ideally a Frontier slot for the on-demand `consult_flagship` escalation), and the **Test connection** button reports success.

## Provider-first, not model-first

Vault Operator's setup is provider-centric, not model-centric. You configure a provider once (API key or OAuth). The plugin discovers the available models and sorts them into three tiers automatically.

- **Budget tier** — cheap fast models for routine work. Also used as the fallback helper model.
- **Main tier** — the default for chat.
- **Frontier tier** — used on demand by the `consult_flagship` tool when the agent hits a hard synthesis step (max 3 calls per task, capped at 3000 output tokens per call).

If your active provider has no Frontier-tier model, the escalation tool is filtered out of the schema. The agent runs Main-only and never knows the escalation tool existed.

## What makes a good model for Vault Operator

Vault Operator is an agent, not a chat assistant. The Main-tier model needs to:

- Support tool use (function calling). It has to call Vault Operator's 60+ tools.
- Follow instructions precisely. The system prompt is dense with rules, skills, and mode definitions.
- Reason about multi-step tasks. Reading files, searching, editing, and verifying takes planning.

The Frontier tier exists exactly because some steps need the absolute strongest model and the rest do not. Routing Frontier-class work to one tool call instead of the whole loop keeps cost predictable.

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

1. Open **Settings > Vault Operator > Providers**
2. Click **"+ Add provider"**
3. Select a **provider type** from the dropdown
4. Follow the provider-specific instructions:
   - API key providers: Paste your key
   - GitHub Copilot: Click "Sign in with GitHub", complete the device flow
   - ChatGPT (OAuth): Click "Sign in with ChatGPT", complete the browser PKCE flow
   - Kilo Gateway: Click "Sign in" or paste a token
   - Local providers (Ollama, LM Studio): the Base URL pre-fills with the default port; adjust if needed
5. Click **"Refresh"** to discover the provider's model list. Vault Operator classifies each model into one of three tiers (Budget / Main / Frontier) automatically; you can override the tier mapping per slot.
6. Optionally pick a display name. The active provider radio drives chat by default; the chat-header model picker can override per-task.
6. Click **Add**

:::info Quick pick
For API-key providers, the "Quick pick" dropdown shows popular models with pre-filled IDs. For Ollama and LM Studio, the "Browse installed/available models" button fetches what is running on your local server.
:::

## Using different models for different tasks

You don't have to use the same model everywhere. Vault Operator splits model usage across the provider's three tier slots, plus per-mode and per-conversation overrides:

1. **Budget tier:** the cheapest slot. It doubles as the "helper" model used for context condensing, fast-path planning, `plan_presentation`, and recipe promotion, and the task router sends simple prompts here. Configure it in the provider's Budget tier slot. Pick the cheapest model that still understands the prompts (Claude Haiku, GPT-4o-mini, Gemini Flash, a local Ollama or MLX model).
2. **Main tier (chat loop):** the default for every conversational turn. The active provider's Main slot.
3. **Frontier tier (`consult_flagship`):** the on-demand escalation. The active provider's Frontier slot.
4. **Per-mode overrides:** Ask mode can run on a tiny model, Agent mode on the main one. Settings > Modes.

Automatic routing to the Budget tier is controlled by **Settings > Agent behaviour > Loop > Task routing**. Turn that toggle off if you want every turn to use the Main tier instead. (Earlier docs called the Budget tier a separate "Helper model" setting; it is now the provider's Budget slot, and the Loop section is named "Task routing".)

You can also pin a specific model for a single conversation through the chat-header model picker (shown as `mode=override` in the cost log). A pinned model always wins over the task router, so it will not be swapped to the Budget tier. The same picker has a per-conversation thinking on/off toggle.

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
