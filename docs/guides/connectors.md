---
title: Connectors
description: MCP client for external tools, MCP server for Claude Desktop, and remote access.
---

# Connectors

Obsilo can connect to external tools, expose your vault to other AI applications, and provide remote access from anywhere, using the Model Context Protocol (MCP) and a Cloudflare relay.

## MCP client: connect external tools

The MCP client lets Obsilo use tools provided by external MCP servers. You can extend the agent's capabilities without writing plugins.

### What you can connect

Any MCP-compatible server works. Common examples:
- Database tools (query SQLite, PostgreSQL, or other databases)
- Web services (interact with APIs, fetch data)
- Local tools (file system utilities, shell commands, custom scripts)
- Third-party integrations (GitHub, Slack, calendar services)

### Setup

1. Open **Settings > Obsilo Agent > MCP**
2. Click **"+ Add Server"**
3. Choose the transport type:

| Transport | When to use |
|-----------|------------|
| stdio | Local servers running as command-line processes |
| SSE | Remote servers using Server-Sent Events (legacy) |
| Streamable HTTP | Modern remote servers (recommended for remote) |

4. Enter the server command or URL
5. Save. The agent discovers available tools automatically.

Once connected, the agent can call external tools using `use_mcp_tool` and manage servers with `manage_mcp_server`.

:::tip Discovery is automatic
You don't need to tell the agent which tools are available. It reads the tool list from each connected MCP server and uses them when relevant to your request.
:::

## MCP server: expose your vault to Claude Desktop

You can turn Obsilo into an MCP server, letting Claude Desktop (or any MCP client) read and write your Obsidian vault.

### Why this matters

Claude Desktop cannot access your Obsidian notes on its own. With Obsilo's MCP server enabled, it gets structured access to your vault: searching, reading, and writing notes through a controlled interface.

### Available tools (3 tiers)

| Tier | Tools | What they do |
|------|-------|-------------|
| Read | `read_notes`, `search_vault`, `get_context` | Search and read vault content |
| Session | `sync_session`, `update_memory` | Synchronize conversation context and memory |
| Write | `write_vault` | Create and modify notes in your vault |

### Setup

1. Open **Settings > Obsilo Agent > MCP > Server** tab
2. Enable the MCP server
3. Click **"Configure Claude Desktop"**. This automatically adds the configuration to Claude Desktop's config file.
4. Restart Claude Desktop

Done. Claude Desktop now sees your vault as an available tool source.

:::warning Write access
The write tier lets Claude Desktop modify your vault. Enable it only if you trust the prompts you send through Claude Desktop. The read and session tiers are safe for everyday use.
:::

## Remote access via Cloudflare relay

Remote access lets you interact with your vault from anywhere, as long as Obsidian is running on your machine.

### How it works

A Cloudflare Workers relay acts as a bridge between your local Obsilo instance and remote clients. The RelayClient in Obsilo maintains a persistent connection to the deployed worker.

### Setup

1. Deploy the Cloudflare Worker (see the relay deployment guide)
2. In **Settings > Obsilo Agent > MCP > Remote**, enter your worker URL
3. Authenticate with the provided token
4. The relay connects automatically when Obsidian is running

:::info Always-on requirement
Remote access requires Obsidian to be running on your machine. The relay forwards requests to your local instance. It does not store your vault data in the cloud.
:::

## Provider overview

Obsilo supports 10+ AI providers. Most use a simple API key, but two have alternative authentication:

| Provider | Auth method | Notes |
|----------|------------|-------|
| GitHub Copilot | OAuth device flow | Uses your existing GitHub Copilot subscription. No separate API key needed. You sign in with your GitHub account. |
| Kilo Gateway | Device auth + manual token | Community gateway with shared rate limits. Device authentication or paste a token manually. |
| Anthropic, OpenAI, Google, etc. | API key | Paste your key in Settings > Models. |

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
GitHub Copilot works if you already have a Copilot subscription. Kilo Gateway offers community access with shared limits. Both are good options to try Obsilo without purchasing a separate API key.
:::

## Next steps

- [Skills, Rules & Workflows](/guides/skills-rules-workflows): Customize the agent's behavior
- [Office Documents](/guides/office-documents): Create presentations and documents
- [Multi-Agent & Tasks](/guides/multi-agent): Delegate work to sub-agents
