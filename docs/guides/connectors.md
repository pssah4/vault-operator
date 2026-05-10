---
title: Connectors
description: MCP client for external tools, MCP server for Claude Desktop and ChatGPT, and remote access via Cloudflare relay.
---

# Connectors

Obsilo can connect to external tools, expose your vault and memory layer to other AI applications, and let you reach it remotely. It does this through the Model Context Protocol (MCP) and a Cloudflare relay.

## MCP client: connect external tools

The MCP client lets Obsilo use tools that live in external MCP servers. You can extend what the agent can do without writing a plugin.

### What you can connect

Any MCP-compatible server works. A few common examples:
- Database tools (query SQLite, PostgreSQL, or other databases)
- Web services (call APIs, fetch data)
- Local tools (file system utilities, shell commands, custom scripts)
- Third-party integrations (GitHub, Slack, calendar services)

### Setup

1. Open **Settings > Obsilo Agent > MCP**
2. Click **"+ Add Server"**
3. Choose the transport type:

| Transport | When to use |
|-----------|------------|
| stdio | Local servers running as command-line processes |
| Streamable HTTP | Modern remote servers (recommended) |
| SSE | Older remote servers using Server-Sent Events (fallback) |

4. Enter the server command or URL
5. Save. The agent picks up available tools automatically.

Once connected, the agent calls external tools with `use_mcp_tool` and manages servers with `manage_mcp_server`.

:::tip Discovery is automatic
You don't need to tell the agent which tools are available. It reads the tool list from each connected MCP server and uses them when they fit your request.
:::

## MCP server: expose Obsilo to other AI clients

You can turn Obsilo into an MCP server so Claude Desktop, ChatGPT, Perplexity, or any other MCP client can read and write your vault, memory, and history layers.

### Why this matters

Most external AI clients cannot access your Obsidian notes on their own. With Obsilo's MCP server enabled, they get structured access to:

- The vault: search and read notes, run vault operations
- Persistent memory: cross-surface facts and preferences
- Conversation history: search past chats across surfaces

Each external call carries a `source_interface` tag (`claude`, `chatgpt`, `perplexity`, `obsilo`, `other`) so memory and history stay separable per surface. See [Unified Chat Memory](/concepts/unified-chat-memory) for the cross-surface UX.

### Available tools (four tiers)

| Tier | Tools | What they do |
|------|-------|-------------|
| Read | `get_context`, `search_vault`, `read_notes`, `get_vault_note_metadata`, `get_vault_implicit_edges` | Vault, ontology, structural information |
| Memory | `recall_memory`, `save_to_memory`, `update_memory` (deprecated) | Persistent facts and preferences across surfaces |
| History | `save_conversation`, `close_conversation`, `search_history`, `sync_session` | Conversations as living documents, plus full-text search |
| Write | `write_vault`, `execute_vault_op` | Create, edit, delete files; run any of ~60 vault operations |

`execute_vault_op` is the gateway to all vault operations. It lists about 60 available tools at runtime, including `vault_health_check`, `semantic_search`, `create_pptx`, and others. The list is generated from the plugin's tool registry, so new tools show up automatically without any config changes.

`get_context` is meant to be called first in every conversation. It returns user profile, memory, behavioral patterns, vault statistics, available skills, and rules.

### Strict source isolation

Sharing all of your memory layer with every external client is rarely what you want. **Settings > Memory > Cross-Surface Sync** has two switches:

- **Strict source isolation** (default for non-Obsilo callers): under strict mode, `get_context`, `recall_memory`, and `search_history` only return memory and history items tagged `source_interface = obsilo`. External clients see vault stats and structural info, but not your personal memory.
- **Per-surface sync mode**: opt specific surfaces into shared memory if you want unified behaviour across them.

The default is conservative. Loosen it deliberately, per surface, when the trade-off is worth it.

### Setup for Claude Desktop

1. Open **Settings > Obsilo Agent > MCP > Server** tab
2. Enable the MCP server
3. Click **"Configure Claude Desktop"**. This writes the configuration into Claude Desktop's config file for you.
4. Restart Claude Desktop

Claude Desktop now sees the vault, memory, and history as available tool sources.

### Setup for ChatGPT (custom connector)

1. In Obsilo, open **Settings > MCP > Remote** and copy the relay URL (see Remote access below).
2. In ChatGPT, open **Settings > Connectors > Create custom connector**.
3. Use the relay URL as the MCP server endpoint.
4. Authorize. ChatGPT now has the same four tiers available, gated by your strict-source-isolation setting.

### Setup for Perplexity

1. Same relay URL as ChatGPT.
2. Add it as an MCP server in Perplexity's connector settings.
3. Authorize.

:::warning Write access
The write tier lets external clients modify your vault. Enable per-surface write access only for clients you trust with file-level access. The read and history tiers are safe for everyday use.
:::

## Remote access via Cloudflare relay

Remote access lets you talk to your vault from anywhere, as long as Obsidian is running on your machine.

### How it works

A Cloudflare Workers relay acts as a bridge between your local Obsilo instance and remote clients. The RelayClient in Obsilo holds a persistent connection to the deployed worker. The relay uses HTTP long-polling. The client polls for incoming requests, processes them locally, and sends responses back. Authentication uses a token embedded in the URL. No data is stored on the relay. It is a passthrough.

### Setup

1. Deploy the Cloudflare Worker (see the relay deployment guide)
2. In **Settings > Obsilo Agent > MCP > Remote**, enter your worker URL
3. Authenticate with the provided token
4. The relay connects automatically when Obsidian is running

:::info Always-on requirement
Remote access requires Obsidian to be running on your machine. The relay forwards requests to your local instance. It does not store your vault data in the cloud.
:::

## Living documents and source-interface tagging

When you use Obsilo through Claude Desktop, ChatGPT, or Perplexity, every persisted message carries a `source_interface` tag. The history sidebar in Obsidian groups conversations by source so you can see what came in from which surface.

Multiple `save_conversation` calls within 30 minutes from the same source interface append to a single thread instead of creating new conversations. This is the living-document model. Memory extraction runs incrementally on the new turns rather than re-processing the whole thread.

`sync_session` is the legacy bulk path: an external client sends an entire transcript at the end of a conversation. It is kept for clients that do not yet support per-turn `save_conversation`.

## Provider overview

Obsilo supports 10+ AI providers. Most use a plain API key. A few use different auth flows.

| Provider | Auth method | Notes |
|----------|------------|-------|
| GitHub Copilot | OAuth device flow | Uses your existing GitHub Copilot subscription. No separate API key needed. |
| Kilo Gateway | Device auth + manual token | Community gateway with shared rate limits. |
| AWS Bedrock | AWS credential providers | Region-aware, supports Claude on Bedrock. Cache-points enabled per ADR-061. |
| Anthropic, OpenAI, Google, OpenRouter, etc. | API key | Paste your key in Settings > Models. |

### Setting up GitHub Copilot

1. Open **Settings > Obsilo Agent > Models > + Add Model**
2. Select **GitHub Copilot** as the provider
3. Click **"Sign in with GitHub"**. A device code appears.
4. Open the GitHub URL, enter the code, and authorize
5. Select a model (Claude or GPT via Copilot)

### Setting up Kilo Gateway

1. Select **Kilo Gateway** as the provider
2. Choose **Device Auth** (recommended) or **Manual Token**
3. For device auth: follow the on-screen flow to authenticate
4. For manual token: paste your token from the Kilo dashboard

:::tip Free access
GitHub Copilot works if you already have a Copilot subscription. Kilo Gateway offers community access with shared limits. Both are good ways to try Obsilo without buying a separate API key.
:::

## Next steps

- [Unified Chat Memory](/concepts/unified-chat-memory): How memory and history flow across surfaces.
- [MCP architecture](/concepts/mcp-architecture): The protocol details behind the connectors.
- [Skills, Rules & Workflows](/guides/skills-rules-workflows): Customize the agent's behavior.
- [Office Documents](/guides/office-documents): Create presentations and documents.
