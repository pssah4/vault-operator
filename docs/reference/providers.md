---
title: Providers & Models
description: Setup guides for all supported AI providers. Anthropic, OpenAI, Google Gemini, ChatGPT-OAuth, Copilot, Kilo, Ollama, and more.
---

# Providers & models

Vault Operator supports 12 AI providers. Setup instructions for each one follow.

For all providers, open **Settings > Vault Operator > Providers**, click **"+ Add provider"**, and pick your provider type. After you authenticate, click **Refresh** to discover the model list. Vault Operator classifies every model into one of three tiers:

- **Budget** — cheap fast models for routine work
- **Main** — the default tier for chat
- **Frontier** — reserved for the on-demand `consult_flagship` escalation

You can override the auto-classification per tier slot. If your active provider has no Frontier-tier model, the `consult_flagship` tool is removed from the agent's schema entirely.

## Cloud providers

### Anthropic

| | |
|---|---|
| What you need | API key from [console.anthropic.com](https://console.anthropic.com) |
| Tier mapping (auto) | Frontier: Claude Opus 4.6/4.7. Main: Claude Sonnet 4.5. Budget: Claude Haiku 4.5. |
| Embedding | Not available natively. Use OpenAI for embeddings. |

Setup:
1. Create an account at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** and create a new key
3. In Vault Operator, select **Anthropic** as provider, paste the key, and pick a model

:::tip Best tool use
Anthropic models are the most reliable at calling Vault Operator's tools correctly. If quality matters most, start here.
:::

### OpenAI

| | |
|---|---|
| What you need | API key from [platform.openai.com](https://platform.openai.com) |
| Tier mapping (auto) | Frontier: GPT-5, GPT-5-pro. Main: GPT-5.1, GPT-4.1. Budget: GPT-4o-mini, GPT-5-mini. |
| Embedding | Native support. `text-embedding-3-small` recommended. |

Setup:
1. Create an account at [platform.openai.com](https://platform.openai.com)
2. Go to **API Keys** and generate a new key
3. In Vault Operator, select **OpenAI** as provider, paste the key, and pick a model

:::info Embedding models
An OpenAI key also gives you access to embedding models for semantic search. Configure in **Settings > Embeddings**.
:::

### Google Gemini

| | |
|---|---|
| What you need | API key from [Google AI Studio](https://aistudio.google.com/app/apikey) |
| Tier mapping (auto) | Frontier: Gemini 2.5 Pro. Main: Gemini 2.5 Flash. Budget: Gemini 2.5 Flash-Lite. |
| Embedding | Not available natively |

Setup:
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and sign in with your Google account
2. Click **Create API Key** and copy it
3. In Vault Operator, select **Google Gemini** as provider, paste the key
4. Browse available models or pick from the pre-configured list

:::tip Free tier
Google Gemini has a free tier with reasonable rate limits. Good starting point if you want to try Vault Operator without paying.
:::

### OpenRouter

| | |
|---|---|
| What you need | API key from [openrouter.ai](https://openrouter.ai) |
| Tier mapping (auto) | Pricing-based: > $50/M completion = Frontier, $5--50 = Main, < $5 = Budget. Family patterns override pricing where possible. |
| Embedding | Not available |

Setup:
1. Create an account at [openrouter.ai](https://openrouter.ai)
2. Go to **Keys** and create a new API key
3. In Vault Operator, select **OpenRouter** as provider, paste the key
4. Click **Refresh**. The model picker is searchable, so type "opus", "gpt-5", or any pattern to find a specific model

### Azure OpenAI

| | |
|---|---|
| What you need | Azure subscription, a deployed model, API key, and endpoint URL |
| Recommended models | GPT-4o (deployed in your Azure region) |
| Embedding | Native support via deployed embedding model |

Setup:
1. Deploy a model in your Azure OpenAI resource
2. Copy the **endpoint URL**, **API key**, and **deployment name**
3. In Vault Operator, select **Azure OpenAI** as provider and fill in all three fields

:::info Enterprise use
Azure OpenAI fits organizations with compliance requirements. Data stays inside your Azure tenant.
:::

### Amazon Bedrock

| | |
|---|---|
| What you need | AWS account with Bedrock enabled, IAM user with invoke permissions, access key ID + secret access key |
| Tier mapping (auto) | Frontier: Claude Opus 4.x. Main: Claude Sonnet 4.x. Budget: Claude Haiku, Amazon Nova Lite. |
| Embedding | Not supported in phase 1. Use OpenAI or Ollama for embeddings |
| Regions | eu-central-1, eu-west-1, eu-west-2, eu-west-3, eu-north-1, us-east-1, us-east-2, us-west-2, plus Asia Pacific |

Setup:
1. In the AWS console, open Bedrock in your preferred region. For the EU, Frankfurt (`eu-central-1`) is the most common choice
2. Go to **Model access** and request access to the model families you want to use. Approval is usually instant for the major foundation models
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
4. For EU cross-region inference profiles (recommended), the resource ARN pattern covers all EU regions. For a more restricted policy, scope it to the specific inference profile ARNs you use
5. Generate an **access key ID** and **secret access key** for the user and copy both
6. In Vault Operator, select **Amazon Bedrock** as provider, pick your region, and paste the credentials. Use the quick pick dropdown to select a model

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
| Available models | gpt-5, gpt-5.1, gpt-5.2, gpt-5-codex, gpt-5-codex-mini, gpt-5.1-codex variants, gpt-5.2-codex, gpt-5.3-codex (Codex-backend lineup) |
| Embedding | Not available |

Setup (OAuth PKCE loopback flow, desktop only):
1. In Vault Operator, select **ChatGPT (OAuth)** as provider
2. Click **"Sign in with ChatGPT"**. The browser opens with `auth.openai.com`.
3. Sign in with the same account that holds your ChatGPT Plus / Pro subscription
4. After approval the browser redirects to a `localhost` callback the plugin opened for the duration of the flow. The tab closes itself.
5. Click **"Refresh"** to load the Codex model lineup, then map the tiers (Budget / Main / Frontier)

Behind the scenes the plugin routes requests through `chatgpt.com/backend-api/codex/responses`, the same endpoint that the Codex CLI uses. Tokens are stored encrypted via your OS keychain (`safeStorage`). Refresh tokens auto-renew before expiry.

:::tip Covered by your subscription
ChatGPT-OAuth bills against your existing Plus / Pro plan, not against an OpenAI API key. There is no per-token cost; rate limits follow the subscription tier. The plugin still tracks the equivalent API cost in the sidebar footer for transparency.
:::

:::warning Reasoning effort fixed at `low`
GPT-5 family models require a `reasoning` block in every request. Vault Operator sends `reasoning: { effort: 'low' }`, the narrowest value accepted across the family. This minimises latency and cost. Higher reasoning effort is not currently exposed as a setting; if you need it for a specific task, use the OpenAI API provider with a `gpt-5*-pro` model via the standard `/v1/responses` endpoint.
:::

### GitHub Copilot

| | |
|---|---|
| What you need | An active GitHub Copilot subscription (Individual, Business, or Enterprise) |
| Tier mapping (auto) | Frontier: Claude Opus (when entitled), GPT-5. Main: Claude Sonnet, GPT-4.1. Budget: GPT-4o-mini. |
| Embedding | Not available |

Setup (OAuth device flow):
1. In Vault Operator, select **GitHub Copilot** as provider
2. Click **"Sign in with GitHub"**. A device code appears.
3. Open [github.com/login/device](https://github.com/login/device) in your browser
4. Enter the code and authorize the app
5. Vault Operator automatically detects your available models

:::tip No extra cost
If you already pay for GitHub Copilot, this costs nothing extra. The models come with your subscription.
:::

### Kilo Gateway

| | |
|---|---|
| What you need | A Kilo Code account with gateway access |
| Recommended models | Depends on your organization's available models |
| Embedding | Not available |

Setup (device auth, recommended):
1. In Vault Operator, select **Kilo Gateway** as provider
2. Click **"Sign in"**. A device code and URL appear.
3. Open the URL in your browser, enter the code, and authorize
4. Models are loaded dynamically from your organization

Setup (manual token):
1. Obtain a gateway token from your Kilo Code admin
2. In Vault Operator, select **Kilo Gateway** and choose **"Manual Token"**
3. Paste the token. Models load automatically.

## Local providers

### Ollama

| | |
|---|---|
| What you need | Ollama installed on your machine |
| Tier mapping (auto) | All models classified as Budget unless you override per slot. Pick the largest model you can run locally as your Main override. |
| Embedding | Supported via `nomic-embed-text` or similar |

Setup:
1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull a model: `ollama pull qwen2.5:7b`
3. In Vault Operator, select **Ollama** as provider. No API key needed.
4. The Base URL field pre-fills with `http://localhost:11434`; adjust only if you run Ollama on a non-default port.
5. Click **"Refresh"** to populate the model list from Ollama's native `/api/tags` endpoint.

:::tip Privacy
With Ollama, no data leaves your machine. Good for sensitive vaults.
:::

### LM Studio

| | |
|---|---|
| What you need | LM Studio installed with a model loaded |
| Recommended models | Any GGUF model from the built-in catalog |
| Embedding | Supported for compatible models |

Setup:
1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai)
2. Download a model from the catalog and load it
3. Start the **local server** (LM Studio > Developer tab)
4. In Vault Operator, select **LM Studio** as provider. No API key needed.
5. The Base URL field pre-fills with `http://localhost:1234`; adjust only if you changed the server port.

### Custom endpoint

| | |
|---|---|
| What you need | Any OpenAI-compatible API endpoint |
| Recommended models | Depends on the server |
| Embedding | Depends on the server |

Setup:
1. In Vault Operator, select **Custom** as provider
2. Enter the **base URL** (e.g., `http://localhost:8080/v1`)
3. Enter an **API key** if your server requires one
4. Type the **model name** exactly as the server expects

This works with any server that implements the OpenAI chat completions API: vLLM, text-generation-inference, LocalAI, and self-hosted endpoints.

## Migrating from the old "Models" tab

Before v2.11 the plugin tracked one row per model in a flat `activeModels[]` list. v2.11 replaces that with `providerConfigs[]`, one row per provider with the discovered model list and tier mapping attached. A one-shot migration on first load groups your existing models by provider type, picks the first enabled model's credentials as the provider's auth, and classifies each enabled model into a tier.

A one-shot notification modal summarises the result and flags anomalies (multi-auth setups, missing Frontier slot, custom endpoints that need manual tier assignment). The original list lives at `legacy_active_models_backup` for 30 days in case you want to roll back.

The Models tab is hidden from the navigation in v2.11. It re-appears for users who configure new OAuth providers until the inline OAuth flow lands in a later release.

## Provider comparison

| Provider | Auth | Cost | Privacy | Embedding | Best for |
|----------|------|------|---------|-----------|----------|
| Anthropic | API key | Pay-per-use | Cloud | No | Best quality |
| OpenAI | API key | Pay-per-use | Cloud | Yes | Structured output, embeddings |
| Google Gemini | API key | Free tier + pay | Cloud | No | Free starting point |
| OpenRouter | API key | Pay-per-use | Cloud | No | Model variety |
| Azure OpenAI | API key + endpoint | Enterprise | Enterprise tenant | Yes | Compliance |
| Amazon Bedrock | IAM access key | Pay-per-use via AWS | Cloud (your AWS account) | No | EU data residency via eu-central-1 |
| ChatGPT (OAuth) | OAuth (PKCE) | Plus / Pro subscription | Cloud | No | Existing ChatGPT subscribers, Codex-line models |
| GitHub Copilot | OAuth | Subscription | Cloud | No | Existing subscribers |
| Kilo Gateway | Device auth / token | Organization | Cloud | No | Team deployments |
| Ollama | None | Free | Fully local | Yes | Privacy, offline |
| LM Studio | None | Free | Fully local | Yes | Visual model browser |
| Custom | Varies | Varies | Varies | Varies | Self-hosted setups |
