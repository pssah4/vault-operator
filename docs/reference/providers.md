---
title: Providers and models
description: Setup reference for supported AI providers and authentication methods. Anthropic, OpenAI, Google Gemini, ChatGPT-OAuth, GitHub Copilot, Kilo Gateway, Amazon Bedrock, Azure, OpenRouter, Ollama, LM Studio, and Custom.
---

# Providers and models

Vault Operator ships with 12 provider types. This page is the canonical reference for picking, authenticating, and tuning each one. The MCP relay and Connectors tab are covered in [Connectors](/guides/connectors); model selection strategy in [Choosing a model](/guides/choosing-a-model).

## How to add a provider

1. Open **Settings > Vault Operator > Providers > Providers**.
2. Click **"+ Add provider"** and pick the provider type.
3. Authenticate (API key, OAuth, or CLI login, see the matrix below).
4. Click **Refresh** to discover the provider's model list.
5. Map the three tier slots (Budget, Main, Frontier) or accept the auto-classification.
6. Pick a display name and click **Add**.

If **Refresh** returns no models (some OpenAI-compatible endpoints do not implement `/v1/models`), type the model ID into the **Model ID** field and save. A provider works fine with a manually entered model ID.

## Tier mapping

Vault Operator classifies every discovered model into one of three tiers:

- **Budget**: cheap fast models for routine work
- **Main**: the default tier for chat
- **Frontier**: reserved for the on-demand `consult_flagship` escalation

You can override the auto-classification per tier slot. If the active provider has no Frontier-tier model, the `consult_flagship` tool is removed from the agent's schema entirely.

## Provider matrix

| Provider | Auth | Caching | Notes |
|---|---|---|---|
| Anthropic | API key | explicit (`cache_control` blocks) | Best tool-use reliability. No native embeddings. |
| OpenAI | API key | openai-implicit (gpt-4o, gpt-4.1, o1, o3, o4) | Native embeddings via `text-embedding-3-small`. |
| Google Gemini | API key | none (TTL context caching is deferred) | Existing OpenAI-compatible Gemini connection. |
| Google Gemini (OAuth) | Your Google Cloud Desktop OAuth client | no explicit cache controls | Native streaming, tools, images and embeddings. Uses project quota, not Gemini app subscriptions. [Setup](/concepts/provider-auth#google-gemini-authentication). |
| OpenRouter | API key | none | Searchable model marketplace. Pricing-based tier classifier. |
| Azure OpenAI | API key plus endpoint | openai-implicit on OpenAI-family deployments | Enterprise tenant. Native embeddings via deployed model. |
| Amazon Bedrock | IAM access key (optional session token) | bedrock-cachepoint on Claude family | EU residency via `eu.` cross-region inference profiles. No embeddings in phase 1. |
| ChatGPT (OAuth) | OAuth (PKCE loopback) | none (Codex backend) | Covered by Plus/Pro subscription. No per-token cost. |
| GitHub Copilot | OAuth (device flow) | none | Covered by Copilot subscription. Unofficial API, models may change. |
| Kilo Gateway | Device auth or manual token | none | Organization-scoped gateway. Dynamic model list. |
| Ollama | none (local) | none | Fully offline. Pick a model that supports tool use. |
| LM Studio | none (local) | none | Visual model browser. OpenAI-compatible server. |
| Custom | API key (optional) | depends on server | Any OpenAI-compatible endpoint. vLLM, LocalAI, self-hosted. |

Caching values come from `src/api/capabilities.ts`. "openai-implicit" means the provider applies a prefix cache automatically when the same prefix repeats. "explicit" means Vault Operator inserts `cache_control` markers into the prompt. "bedrock-cachepoint" is the Bedrock equivalent of explicit caching.

## Cloud providers

### Anthropic

| | |
|---|---|
| What you need | API key from [console.anthropic.com](https://console.anthropic.com) |
| Tier mapping (auto) | Frontier: Claude Opus 4.6/4.7. Main: Claude Sonnet 4.5. Budget: Claude Haiku 4.5. |
| Caching | explicit, via `cache_control` blocks |
| Embedding | not available natively, use OpenAI for embeddings |

Setup:
1. Create an account at [console.anthropic.com](https://console.anthropic.com).
2. Go to **API Keys** and create a new key.
3. In Vault Operator, open **Settings > Vault Operator > Providers > Providers**, add **Anthropic**, paste the key, and pick a model.

:::tip Best tool use
Anthropic models are the most reliable at calling Vault Operator's tools correctly. If quality matters most, start here.
:::

### OpenAI

| | |
|---|---|
| What you need | API key from [platform.openai.com](https://platform.openai.com) |
| Tier mapping (auto) | Frontier: GPT-5, GPT-5-pro. Main: GPT-5.1, GPT-4.1. Budget: GPT-4o-mini, GPT-5-mini. |
| Caching | openai-implicit on gpt-4o, gpt-4.1, o1, o3, o4 families |
| Embedding | native support, `text-embedding-3-small` recommended |

Setup:
1. Create an account at [platform.openai.com](https://platform.openai.com).
2. Go to **API Keys** and generate a new key.
3. In Vault Operator, add an **OpenAI** provider, paste the key, and pick a model.

:::info Embedding models
An OpenAI key also gives you access to embedding models for semantic search. Configure in **Settings > Vault Operator > Providers > Embeddings**.
:::

### Google Gemini

| | |
|---|---|
| What you need | API key from [Google AI Studio](https://aistudio.google.com/app/apikey) |
| Tier mapping (auto) | Frontier: Gemini 2.5 Pro. Main: Gemini 2.5 Flash. Budget: Gemini 2.5 Flash-Lite. |
| Caching | none (TTL context caching is deferred) |
| Embedding | not available natively |

Setup:
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and sign in with your Google account.
2. Click **Create API Key** and copy it.
3. In Vault Operator, add a **Google Gemini** provider and paste the key.
4. Browse available models or pick from the pre-configured list.

:::tip Free tier
Google Gemini has a free tier with reasonable rate limits. Good starting point if you want to try Vault Operator without paying.
:::

### OpenRouter

| | |
|---|---|
| What you need | API key from [openrouter.ai](https://openrouter.ai) |
| Tier mapping (auto) | Pricing-based: > $50/M completion = Frontier, $5 to $50 = Main, < $5 = Budget. Family patterns override pricing where possible. |
| Caching | none |
| Embedding | not available |

Setup:
1. Create an account at [openrouter.ai](https://openrouter.ai).
2. Go to **Keys** and create a new API key.
3. In Vault Operator, add an **OpenRouter** provider and paste the key.
4. Click **Refresh**. The model picker is searchable, type "opus", "gpt-5", or any pattern to find a specific model.

### Azure OpenAI

| | |
|---|---|
| What you need | Azure subscription, a deployed model, API key, and endpoint URL |
| Recommended models | GPT-4o (deployed in your Azure region) |
| Caching | openai-implicit on OpenAI-family deployments |
| Embedding | native support via deployed embedding model |

Setup:
1. Deploy a model in your Azure OpenAI resource.
2. Copy the **endpoint URL**, **API key**, and **deployment name**.
3. In Vault Operator, add an **Azure OpenAI** provider and fill in all three fields.

:::info Enterprise use
Azure OpenAI fits organizations with compliance requirements. Data stays inside your Azure tenant.
:::

### Amazon Bedrock

| | |
|---|---|
| What you need | AWS account with Bedrock enabled, IAM user with invoke permissions, access key ID plus secret access key |
| Tier mapping (auto) | Frontier: Claude Opus 4.x. Main: Claude Sonnet 4.x. Budget: Claude Haiku, Amazon Nova Lite. |
| Caching | bedrock-cachepoint on Claude family |
| Embedding | not supported in phase 1, use OpenAI or Ollama for embeddings |
| Regions | eu-central-1, eu-west-1, eu-west-2, eu-west-3, eu-north-1, us-east-1, us-east-2, us-west-2, plus Asia Pacific |

Setup:
1. In the AWS console, open Bedrock in your preferred region. For the EU, Frankfurt (`eu-central-1`) is the most common choice.
2. Go to **Model access** and request access to the model families you want to use. Approval is usually instant for the major foundation models.
3. Create an IAM user (or role) with a policy that allows these actions:
    ```json
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "*"
    }
    ```
4. For EU cross-region inference profiles (recommended), the resource ARN pattern covers all EU regions. For a more restricted policy, scope it to the specific inference profile ARNs you use.
5. Generate an **access key ID** and **secret access key** for the user and copy both.
6. In Vault Operator, add an **Amazon Bedrock** provider, pick your region, and paste the credentials. Use the quick pick dropdown to select a model.

:::tip Cross-region inference profiles
Model IDs prefixed with `eu.` or `us.` are cross-region inference profiles. They route requests across the regions in that geography for higher availability. In Europe, `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` is the recommended default. It works from any EU region and keeps data inside the EU.

Direct regional model IDs (without a prefix) only work in the specific region that hosts the model. Frankfurt supports a smaller direct model list than the EU inference profiles do.
:::

:::info Temporary credentials
For AWS SSO or STS-issued credentials, fill the **session token** field as well. Long-lived IAM user credentials don't need it.
:::

:::warning Billing
Bedrock bills per-token directly through your AWS account. There is no free tier for most foundation models. Check the AWS Bedrock pricing page before heavy use.
:::

## Gateway providers

### ChatGPT (OAuth)

| | |
|---|---|
| What you need | An active ChatGPT Plus or Pro subscription |
| Available models | gpt-5.6, gpt-5.5, gpt-5.4, gpt-5.4-mini (static Codex-backend fallback lineup; the live `/codex/models` fetch supersedes it when reachable) |
| Caching | none (Codex backend does not expose caching) |
| Embedding | not available |

Setup (OAuth PKCE loopback flow, desktop only):
1. In Vault Operator, add a **ChatGPT (OAuth)** provider.
2. Click **"Sign in with ChatGPT"**. The browser opens with `auth.openai.com`.
3. Sign in with the same account that holds your ChatGPT Plus or Pro subscription.
4. After approval the browser redirects to a `localhost` callback the plugin opened for the duration of the flow. The tab closes itself.
5. Click **"Refresh"** to load the Codex model lineup, then map the tiers (Budget, Main, Frontier).

Behind the scenes the plugin routes requests through `chatgpt.com/backend-api/codex/responses`, the same endpoint that the Codex CLI uses. Tokens are stored encrypted via your OS keychain (`safeStorage`). Refresh tokens auto-renew before expiry.

:::tip Covered by your subscription
ChatGPT-OAuth bills against your existing Plus or Pro plan, not against an OpenAI API key. There is no per-token cost, rate limits follow the subscription tier. The plugin still tracks the equivalent API cost in the sidebar footer for transparency.
:::

:::info Reasoning effort
GPT-5 family models require a `reasoning` block on every request. The default effort is `low` (the narrowest value accepted across the family) to minimise latency and cost. Since v2.14 you can override it per pinned model via the **Reasoning effort** slider (`minimal`, `low`, `medium`, `high`) in the model config modal.
:::

### GitHub Copilot

| | |
|---|---|
| What you need | An active GitHub Copilot subscription (Individual, Business, or Enterprise) |
| Tier mapping (auto) | Frontier: Claude Opus (when entitled), GPT-5. Main: Claude Sonnet, GPT-4.1. Budget: GPT-4o-mini. |
| Caching | none |
| Embedding | not available |

Setup (OAuth device flow):
1. In Vault Operator, add a **GitHub Copilot** provider.
2. Click **"Sign in with GitHub"**. A device code appears.
3. Open [github.com/login/device](https://github.com/login/device) in your browser.
4. Enter the code and authorize the app.
5. Vault Operator automatically detects your available models.

:::tip No extra cost
If you already pay for GitHub Copilot, this costs nothing extra. The models come with your subscription. The API is unofficial, so models may change without notice.
:::

### Kilo Gateway

| | |
|---|---|
| What you need | A Kilo Code account with gateway access |
| Recommended models | Centralized gateway to multiple frontier models, organization-scoped |
| Caching | none |
| Embedding | not available |

Setup (device auth, recommended):
1. In Vault Operator, add a **Kilo Gateway** provider.
2. Click **"Sign in"**. A device code and URL appear.
3. Open the URL in your browser, enter the code, and authorize.
4. Models are loaded dynamically from your organization.

Setup (manual token):
1. Obtain a gateway token from your Kilo Code admin.
2. In Vault Operator, add a **Kilo Gateway** provider and choose **"Manual Token"**.
3. Paste the token. Models load automatically.

## Local providers

### Ollama

| | |
|---|---|
| What you need | Ollama installed on your machine |
| Tier mapping (auto) | All models classified as Budget unless you override per slot. Pick the largest model you can run locally as your Main override. |
| Caching | none |
| Embedding | supported via `nomic-embed-text` or similar |

Setup:
1. Install Ollama from [ollama.ai](https://ollama.ai).
2. Pull a model: `ollama pull qwen2.5:7b`.
3. In Vault Operator, add an **Ollama** provider. No API key needed.
4. The Base URL field pre-fills with `http://localhost:11434`, adjust only if you run Ollama on a non-default port.
5. Click **"Refresh"** to populate the model list from Ollama's native `/api/tags` endpoint.

:::tip Privacy
With Ollama, no data leaves your machine. Good for sensitive vaults.
:::

### LM Studio

| | |
|---|---|
| What you need | LM Studio installed with a model loaded |
| Recommended models | Any GGUF model from the built-in catalog |
| Caching | none |
| Embedding | supported for compatible models |

Setup:
1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai).
2. Download a model from the catalog and load it.
3. Start the **local server** (LM Studio > Developer tab).
4. In Vault Operator, add an **LM Studio** provider. No API key needed.
5. The Base URL field pre-fills with `http://localhost:1234`, adjust only if you changed the server port.

### Custom endpoint

| | |
|---|---|
| What you need | Any OpenAI-compatible API endpoint |
| Recommended models | depends on the server |
| Caching | depends on the server |
| Embedding | depends on the server |

Setup:
1. In Vault Operator, add a **Custom** provider.
2. Enter the **base URL** (for example, `http://localhost:8080/v1`).
3. Enter an **API key** if your server requires one.
4. Type the **model name** exactly as the server expects.

This works with any server that implements the OpenAI chat completions API: vLLM, text-generation-inference, LocalAI, and self-hosted endpoints.

## Migrating from the old "Models" tab

Before v2.11 the plugin tracked one row per model in a flat `activeModels[]` list. v2.11 replaces that with `providerConfigs[]`, one row per provider with the discovered model list and tier mapping attached. A one-shot migration on first load groups your existing models by provider type, picks the first enabled model's credentials as the provider's auth, and classifies each enabled model into a tier.

A one-shot notification modal summarises the result and flags anomalies (multi-auth setups, missing Frontier slot, custom endpoints that need manual tier assignment). The original list lives at `legacy_active_models_backup` for 30 days in case you want to roll back.

The Models tab is hidden from the provider sub-tab navigation; provider setup and OAuth sign-in now happen inline in the provider detail modal.

## Provider comparison

| Provider | Auth | Caching | Cost | Privacy | Embedding | Best for |
|---|---|---|---|---|---|---|
| Anthropic | API key | explicit | pay-per-use | cloud | no | best quality |
| OpenAI | API key | openai-implicit | pay-per-use | cloud | yes | structured output, embeddings |
| Google Gemini | API key | none | free tier plus pay | cloud | no | free starting point |
| Google Gemini (OAuth) | Your Cloud Desktop client | none | API project quota | cloud (your Google project) | yes | separate Google API accounts |
| OpenRouter | API key | none | pay-per-use | cloud | no | model variety |
| Azure OpenAI | API key plus endpoint | openai-implicit | enterprise | enterprise tenant | yes | compliance |
| Amazon Bedrock | IAM access key | bedrock-cachepoint | pay-per-use via AWS | cloud (your AWS account) | no | EU data residency via `eu-central-1` |
| ChatGPT (OAuth) | OAuth (PKCE) | none | Plus/Pro subscription | cloud | no | existing ChatGPT subscribers, Codex-line models |
| GitHub Copilot | OAuth (device) | none | subscription | cloud | no | existing Copilot subscribers |
| Kilo Gateway | device auth or token | none | organization | cloud | no | team deployments |
| Ollama | none | none | free | fully local | yes | privacy, offline |
| LM Studio | none | none | free | fully local | yes | visual model browser |
| Custom | varies | depends on server | varies | varies | varies | self-hosted setups |
