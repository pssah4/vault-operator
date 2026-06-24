---
title: Settings reference
description: Every Vault Operator setting, organized by the six setting groups in Obsidian.
---

# Settings reference

All Vault Operator settings live under **Settings > Vault Operator**. The settings tab has six groups: Providers, Agents, Customize, Vault, Advanced, and Help. Each group has sub-tabs. This page walks every sub-tab in the order they appear.

UI paths in this page use the format `Settings > Vault Operator > {Group} > {Sub-tab}` in sentence case, matching the labels in `src/i18n/locales/en.ts`.

## Providers group

### Providers

`Settings > Vault Operator > Providers > Providers`

Configure AI providers. Each provider exposes its own model list and is mapped to three tiers (Budget, Main, Frontier) that the agent picks from based on the current task.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Provider list | All configured providers with type, display name, sign-in status, and tier mapping | Empty | `src/types/settings.ts` (`providerConfigs[]`) |
| Active provider | The provider used for chat by default | First added | `settings.activeProviderId` |
| Add provider | Opens the provider detail modal | n/a | `ProviderDetailModal.ts` |
| Refresh (in modal) | Pulls the provider's model list and auto-classifies models into tiers | n/a | `ProviderDetailModal.ts:985-993` |
| Tier mapping | Manual override for Budget / Main / Frontier slots | Auto-classified | `model-registry.ts` |
| Test connection | Verifies the provider's credentials and endpoint with a minimal request | n/a | `testModelConnection.ts` |

The provider modal supports twelve provider types: Anthropic, OpenAI, Gemini, Ollama, LM Studio, OpenRouter, Azure, Custom (OpenAI-compatible), GitHub Copilot, Kilo Gateway, AWS Bedrock, and ChatGPT (OAuth). Ollama and LM Studio prefill their Base URL with the local default port. ChatGPT (OAuth) bills against your existing Plus or Pro subscription instead of a per-token key.

:::tip Tiers and overrides
The Main tier drives chat by default. The agent escalates to Frontier on hard synthesis steps via the `consult_flagship` tool (budget: 3 calls per task, 3000 tokens per call). The chat-header model picker lets you pin a specific provider and model for a single task without changing the active provider.
:::

:::warning Plaintext API key warning banner (v3.0.0)
If the OS keychain is unavailable (for example a Linux install without `libsecret-1-0`), the Providers tab shows a persistent banner titled "API keys stored as plaintext" above the provider list. In this state, API keys, OAuth tokens, and MCP secrets are written as plain strings to `data.json` and are visible to any process that can read the vault. A button labeled "I understand, dismiss this warning" sets `settings.safeStoragePlaintextFallbackAcknowledged` and fires a one-time confirmation toast. The banner itself stays visible after dismissal so the degraded state remains clear. Source: [src/ui/settings/ProvidersTab.ts](src/ui/settings/ProvidersTab.ts#L101).
:::

#### Per-model reasoning and thinking

Each model row in the provider modal exposes reasoning controls when the underlying model supports them. Pin a specific model in the chat-header picker to use these. Auto mode uses the model's default.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Extended thinking | Enables Claude budget-token thinking on Sonnet 4.6, Opus 4.6 and older, Haiku, and 3.x models | Off | `BUILT_IN_MODELS` in `settings.ts` |
| Thinking budget (tokens) | Token budget reserved for the model's internal reasoning before visible output | 10000 (Sonnet/Opus), 5000 (Haiku) | `BUILT_IN_MODELS` |
| Reasoning effort | Effort level for adaptive Claude (Opus 4.7+, Fable, Mythos) and GPT-5 / o-series. Claude: Low, Medium, High, XHigh, Max. OpenAI: Minimal, Low, Medium, High | Model default | `model-registry.ts` |
| Max output tokens | Output budget. Auto clamps to the model ceiling and remaining context room | Auto | `resolveOutputBudget` in `model-registry.ts` |

:::info Caching reality
Anthropic uses explicit `cache_control` blocks. Bedrock Claude uses explicit `bedrock-cachepoint`. OpenAI gpt-4o, 4.1, o1, o3, and o4 use implicit prefix caching. Gemini has no prefix caching in v2.14 (TTL context caching is deferred). DeepSeek is not a registered provider type.
:::

### Models (legacy)

`Settings > Vault Operator > Providers > Models`

Legacy view kept for back-compat. New work happens in the Providers sub-tab via provider modals. Use this only if you need to inspect or remove a model entry that predates the provider-only refactor.

### Embeddings

`Settings > Vault Operator > Providers > Embeddings`

Configure the semantic index for meaning-based vault search. The Embeddings sub-tab has four sections: Embedding models, Semantic index, Index configuration, Graph expansion.

#### Embedding models

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Embedding model list | Configured embedding models with provider, model id, and API key | Empty | `settings.embeddingModels` |
| Add embedding model | Opens the embedding model modal | n/a | `EmbeddingsTab.ts` |

The first-run wizard suggests OpenAI `text-embedding-3-small` or Google `text-embedding-004`. Other choices are fine if you bring your own provider.

#### Semantic index

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Enable semantic index | Master toggle. Build index is blocked until this is on | Off | `settings.semanticIndexEnabled` |
| Build index | Indexes the vault | n/a | `EmbeddingsTab.ts:230` |
| Force rebuild | Deletes the index and re-indexes from scratch. Cancel keeps progress | n/a | `EmbeddingsTab.ts:294` |
| Auto-index trigger | When to re-index automatically: never, on startup, on agent switch | `never` | `settings.semanticAutoIndex` (`settings.ts:1709`) |
| Auto-reindex on change | Re-index when files change | `false` | `settings.semanticAutoIndexOnChange` (`settings.ts:1720`) |

:::warning Build index is gated
The Build index button shows "Enable semantic index first." until you turn the master toggle on. Re-indexing on change is off by default. You stay in manual mode unless you opt in.
:::

#### Index configuration

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Chunk size | Chunk size for embedding. Small 800, Medium 1200, Standard 2000, Large 3000 | Standard (2000) | `EmbeddingsTab.ts:394-400`, `en.ts:117-120` |
| Local reranking | Re-rank semantic search results with a local cross-encoder model | On | `settings.enableReranking` (`settings.ts:905`, `EmbeddingsTab.ts:669`) |

:::info Reranker model
The reranker uses `Xenova/ms-marco-MiniLM-L-6-v2` and is delivered as an optional asset. If the asset is not installed, the agent falls back silently to the vector score. Install under `Settings > Vault Operator > Advanced > Optional assets`.
:::

#### Implicit connections

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Implicit connections | Compute cosine-similarity edges between notes for discovery and suggestion-banner | On | `settings.enableImplicitConnections` (`EmbeddingsTab.ts:623`) |
| Similarity threshold | Minimum cosine similarity to count as an implicit connection (0.5 loose, 0.9 strict) | 0.7 | `settings.implicitThreshold` (`EmbeddingsTab.ts:634`) |
| Suggestion banner | Show implicit-connection suggestions in the sidebar | On | `settings.enableSuggestionBanner` (`EmbeddingsTab.ts:646`) |

#### Knowledge properties

Vault conventions used by the knowledge ingest workflow and vault health check. Set these once to match your vault's schema.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Category property | Frontmatter key that holds the note's type or category | `Kategorie` | `settings.knowledgeIngestProperties.categoryProperty` (`settings.ts:1723-1730`) |
| Summary property | Frontmatter key for the short note summary | `Zusammenfassung` | `settings.knowledgeIngestProperties.summaryProperty` |
| Source naming convention | Filename pattern for source notes created by ingest | `Autor-Jahr_Titel` | `settings.knowledgeIngestProperties.sourceNamingConvention` |
| MOC properties | Extra frontmatter keys that participate in Maps of Content | Empty | `settings.knowledgeIngestProperties.mocProperties` |

:::info Built-in defaults are German
The built-in templates ship with German defaults (Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen). Adapt them in the same panel to match your vault's language and naming.
:::

### Web search

`Settings > Vault Operator > Providers > Web search`

Enable tools for accessing the internet.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Enable web tools | Allow the agent to use `web_fetch` and `web_search` | Off | `settings.webToolsEnabled` |
| Search provider | Which search API to use | Brave | `settings.webSearchProvider` |
| API key | Key for the selected search provider | None | `settings.webSearchApiKey` |

## Agents group

### Agents

`Settings > Vault Operator > Agents > Agents`

Configure agents. One built-in agent ships: **Default agent**. You can add custom agents with their own system prompt, tool sets, and per-agent model overrides.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Default agent | The single built-in agent. All built-in tool groups are available | Built-in | `builtinModes.ts:58` |
| Custom agents | User-defined agents with custom tool sets and system prompts | Empty | `settings.customModes` |
| Per-agent model | Override which model an agent uses | Active provider's Main tier | `settings.modeModelKeys` |
| Per-agent tool overrides | Restrict tool groups for an agent (`modeToolOverrides`) | None | `settings.modeToolOverrides` |
| Per-agent skills | Attach specific skills to an agent | None | `settings.modeSkillKeys` |

:::info There is only one built-in agent
The earlier Ask + Agent split was removed in v2.11. For read-only behaviour, either restrict a custom agent's tool groups to `read` and `vault`, or set Auto-approve to "ask every time" for the write groups. The mid-conversation mode switcher was removed from the chat header in v2.11.
:::

### Auto-approve

`Settings > Vault Operator > Agents > Auto-approve`

Control what the agent can do without asking. See the [safety and control guide](/guides/safety-control) for details.

The seven approval categories map to the seven `ToolGroup` values in `TOOL_GROUP_MAP` (`builtinModes.ts`).

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Read | Auto-approve file reads, searches, listings, checkpoint inspectors | Off | `read` group: `read_file`, `read_document`, `list_files`, `search_files`, `list_checkpoints`, `read_checkpoint`, `diff_checkpoint` |
| Vault | Auto-approve vault intelligence (semantic search, frontmatter, daily note, memory recall) | Off | `vault` group: `semantic_search`, `query_base`, `get_frontmatter`, `search_by_tag`, `vault_health_check`, `recall_memory`, `mark_for_memory`, `search_history`, etc. |
| Edit | Auto-approve writes (file create, edit, append, move, delete, frontmatter update, ingest, checkpoint restore) | Off | `edit` group: `write_file`, `edit_file`, `append_to_file`, `create_folder`, `delete_file`, `move_file`, `update_frontmatter`, `generate_canvas`, `create_excalidraw`, `create_base`, `create_pptx`, `create_docx`, `create_xlsx`, `ingest_document`, `ingest_deep`, `ingest_triage`, `restore_checkpoint` |
| Web | Auto-approve `web_fetch`, `web_search`, `anti_echo_search` | Off | `web` group |
| Agent | Auto-approve agent control (followup questions, completion, todo updates, sub-tasks, agent switches, settings updates, skill invocation) | Off | `agent` group |
| MCP | Auto-approve calls to external MCP servers (`use_mcp_tool`, `read_mcp_tool`) | Off | `mcp` group |
| Skill | Auto-approve plugin command execution, recipes, plugin API calls, sandbox scripts | Off | `skill` group: `execute_command`, `execute_recipe`, `call_plugin_api`, `resolve_capability_gap`, `enable_plugin`, `probe_plugin`, `run_skill_script` |

:::warning Permissive combination warning
Turning on **Web** together with **Edit** (or **Vault** writes) triggers a security warning. That combination lets the agent fetch internet content and write it into your vault without asking.
:::

### Loop

`Settings > Vault Operator > Agents > Loop`

Control how the agent loop runs.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Consecutive error limit | How many consecutive tool errors before the agent stops | 3 | `settings.consecutiveMistakeLimit` |
| Rate limit | Minimum milliseconds between API calls | 0 | `settings.rateLimitMs` |
| Max iterations | Maximum tool calls per conversation turn | 25 | `settings.maxIterations` |
| Context condensing | Summarize older messages when context gets long | On | `settings.condensingEnabled` |
| Condensing threshold | Percentage of context window before condensing triggers | 80 | `settings.condensingThreshold` (`settings.ts:1769`) |
| Microcompaction | Compact older tool results in place when their token cost exceeds a threshold | On | `settings.microcompactionEnabled` |
| Rolling-summary threshold | Percentage of the condensing threshold at which a rolling summary is folded in | 50 | `settings.rollingSummaryThreshold` (`settings.ts:1775`) |
| Power steering | Re-inject key instructions every N assistant turns (0 disables) | 0 | `settings.powerSteeringFrequency` (`settings.ts:1770`) |
| Subtask depth | Maximum nesting depth for sub-agents | 2 | `settings.maxSubtaskDepth` (`settings.ts:1772`) |
| Subtask token budget | Token budget per `new_task` spawn message | 8000 | `settings.subtaskTokenBudget` (`settings.ts:1773`) |
| Cost-warn threshold | EUR cost threshold per task that triggers a warning (0 disables) | 0 | `settings.costWarnThresholdEur` (`settings.ts:1776`) |
| Default main-tier model | Which tier the chat loop uses by default | `mid` (Main) | `settings.defaultMainTier` |
| Task routing (Helper model) | Model used for context condensing, fast-path planning, `plan_presentation`, and recipe promotion | Falls back to active provider's Budget tier | `settings.helperModelKey` |

### Memory

`Settings > Vault Operator > Agents > Memory`

Configure how the agent remembers across conversations.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Chat history | Save conversation history for future reference | On | `settings.chatHistoryEnabled` |
| Chat history folder | Where to store conversation files in the vault | `Vault Operator/Chats` | `settings.chatHistoryFolder` |
| Memory extraction | Automatically extract key facts from conversations | On | `settings.memoryExtractionEnabled` |
| Memory threshold | Minimum relevance score for a memory to be saved | 0.7 | `settings.memoryThreshold` |

:::info Memory model picker removed in FEAT-24-08
The separate "Memory model" dropdown is gone. The Task routing helper model runs memory extraction.
:::

## Customize group

### Rules

`Settings > Vault Operator > Customize > Rules`

Persistent instructions that guide the agent in every conversation.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Rule list | All active rules injected into the system prompt | Empty | `settings.rules` |
| Add rule | Create a new rule (plain text or Markdown) | n/a | `RulesTab.ts` |
| Import | Import rules from a file | n/a | `RulesTab.ts` |

### Workflows

`Settings > Vault Operator > Customize > Workflows`

Slash-command triggered instruction sequences. Type `/` in chat to invoke.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Workflow list | All workflows with name, trigger, and body | Built-in defaults | `settings.workflows` |
| Add workflow | Create a new workflow | n/a | `WorkflowsTab.ts` |

### Skills

`Settings > Vault Operator > Customize > Skills`

Persistent instruction sets matched by keywords. Like mini-manuals the agent follows.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Skill list | All skills with name, trigger pattern, and body | Built-in bundled skills | `settings.skills` and `bundled-skills/` |
| Add skill | Create a new skill | n/a | `SkillsTab.ts` |

### Prompts

`Settings > Vault Operator > Customize > Prompts`

Reusable message templates with optional variables.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Prompt list | All prompts | Empty | `settings.customPrompts` |
| Add prompt | Create a new prompt | n/a | `PromptsTab.ts` |

### Connectors

`Settings > Vault Operator > Customize > Connectors`

Connect external tool servers and expose Vault Operator as a server. The Connectors sub-tab has three sections: Local connector, Remote access, External tool servers.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Local connector | Vault Operator as MCP server for desktop clients (Claude Desktop, ChatGPT, Perplexity) | Off | `settings.mcpServerEnabled` |
| Remote access | Cloudflare-tunnelled long-polling endpoint with token-in-URL auth | Off | `settings.remoteTransportEnabled` |
| External tool server list | MCP servers the agent can call tools on | Empty | `settings.mcpServers` |
| Add server | Configure a new MCP server connection. Transport types: SSE, streamable-http | n/a | `ManageMcpServerTool.ts:7,51`, `McpTab.ts:372` |
| Allow local network addresses (per server) | Permit this server to connect to `localhost` or RFC 1918 private network addresses. Off by default. With this off, saving rejects loopback or private-network URLs with a Notice | Off | `mcpServers.<name>.allowLocalUrls`, [src/ui/settings/McpTab.ts](src/ui/settings/McpTab.ts#L386) |
| Test server | Verify connectivity to a configured server | n/a | `McpTab.ts` |

:::info Transport limitation
Vault Operator runs inside Electron (Obsidian's runtime), so only SSE and streamable-http transports are supported. Stdio-based MCP servers do not work. To bridge a stdio-only server (for example Playwright MCP), run it locally with an HTTP wrapper such as `npx @playwright/mcp@latest --port 3001`.
:::

## Vault group

### Vault

`Settings > Vault Operator > Vault > Vault`

Vault-level settings, including the agent folder, default output folder, and checkpoint behaviour.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Agent folder | Vault-relative folder where Vault Operator keeps plugin skills, vault-dna snapshot, externalised tmp results, cache, and the local knowledge database | `.vault-operator` | `DEFAULT_AGENT_FOLDER` (`agentFolder.ts:38`) |
| Pick folder | Fuzzy-picker to choose an existing folder. Type a new path to create on next use | n/a | `VaultTab.ts` |
| Default output folder | Where the agent writes new notes (including `/ingest` source notes) | `Inbox/` | `settings.defaultOutputFolder` (`settings.ts:1950`) |
| Show health badge | Stethoscope icon in the sidebar changes colour when findings exist | On | `AgentSidebarView.ts:287-298` |
| Auto-apply rule repairs | Auto-fix deterministic rule findings (missing backlinks, category mismatch, inconsistent tags) when the modal opens | Off | `settings.vaultHealth.autoApplyRuleRepairs` (`settings.ts:1565`) |
| Orphans target folder | Folder for moved orphan notes | `Inbox/Orphans` | `settings.vaultHealth.orphansTargetFolder` (`settings.ts:1574`) |
| Silence with-context orphans | Hide orphan findings whose only signal is a property-only edge | On | `settings.vaultHealth.silenceWithContextOrphans` (`settings.ts:1587`) |
| Enable checkpoints | Create snapshots before file modifications | On | `settings.checkpointsEnabled` |
| Snapshot timeout (s) | Maximum seconds to wait for a checkpoint snapshot to complete | 30 | `settings.checkpointTimeoutSeconds` (`settings.ts:1820`) |
| Auto-cleanup | Automatically remove old checkpoints | On | `settings.checkpointAutoCleanup` (`settings.ts:1821`) |

:::info Agent folder layout
The agent folder contains `data/` (skills, logs, telemetry, knowledge.db), `cache/` (backups, checkpoints, externalised tmp), and `assets/` (optional assets like the reranker model). Existing files are not auto-migrated when you change the path. The legacy name `.obsidian-agent` is still accepted for back-compat (upgraded in v2.13).
:::

### Backup

`Settings > Vault Operator > Vault > Backup`

Export and import your Vault Operator configuration. Useful when moving to a new device, sharing settings with a team, or restoring after a bad change.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Export categories | Checkboxes for each settings category (providers, rules, skills, workflows, prompts, agents, soul, memory) | All on | `BackupTab.ts` |
| Export | Bundle the selected categories into a JSON file | n/a | `BackupTab.ts` |
| Select file (Import) | Pick a previously exported JSON file | n/a | `BackupTab.ts` |
| Import categories | Pick which categories from the file to import | All on | `BackupTab.ts` |
| Confirm import | Apply the imported settings. Existing settings in the selected categories are overwritten | n/a | `BackupTab.ts` |
| Import legacy `soul.md` | Read `memory/soul.md` and add each bullet under Identity / Values / Anti-Patterns / Communication into the soul store. Idempotent | n/a | One-off migration from older plugin versions |

:::warning API keys travel with the export
A full export includes provider API keys. Treat the JSON file like a password vault: never commit it, never share it publicly. Uncheck **Providers** before sharing if you want to keep keys private.
:::

## Advanced group

### Interface

`Settings > Vault Operator > Advanced > Interface`

Appearance, input behaviour, and first-run setup. Inline editor AI actions live in a separate sub-tab (see [Inline AI](#inline-ai) below).

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Auto-add active file | Include the currently open note as context | On | `settings.autoAddActiveFile` |
| Send with enter | Enter sends the message. Off means Ctrl/Cmd+Enter sends | On | `settings.sendWithEnter` (`settings.ts:1793`) |
| Show date/time | Display timestamps in the chat | Off | `settings.showTimestamps` |
| Chat linking | Link chat sessions to notes for traceability | Off | `settings.chatLinkingEnabled` |
| Task extraction | Detect and extract tasks from agent responses | Off | `settings.taskExtractionEnabled` |
| Restart setup | Re-runs the first-run wizard. Under the Setup section | n/a | `InterfaceTab.ts:42` |

### Shell

`Settings > Vault Operator > Advanced > Shell`

Plugin API, command allowlist, and CLI recipes.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Plugin API | Allow the agent to call JavaScript APIs on other plugins (Dataview, Omnisearch, etc.) | Off | `settings.pluginApiEnabled` |
| Command allowlist | Which Obsidian commands the agent can execute | Empty | `settings.allowedCommands` |
| Recipes | Pre-validated CLI tool recipes (for example Pandoc export) | Built-in | `settings.recipes` |

### Log

`Settings > Vault Operator > Advanced > Log`

Daily audit trail of every tool call. Each tool invocation is appended to a JSONL log file with timestamp, tool name, arguments, result status, and approval decision.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Date selector | Pick which day's log to load | Today | `LogTab.ts` |
| Load | Render the selected day's log as a table | n/a | `LogTab.ts` |
| Download | Save the raw JSONL log for the selected day | n/a | `LogTab.ts` |
| Clear all | Delete every log file from disk | n/a | `LogTab.ts` |

:::info Where logs live
Logs are stored at `<vault>/.vault-operator/data/logs/<YYYY-MM-DD>.jsonl` (one file per day). Retention is 30 days. Logs do not contain conversation content, only tool calls.
:::

:::warning Audit log write failures banner (v3.0.0)
When the OperationLogger fails to persist a log entry, the Log tab shows a persistent banner titled "Audit log write failures" at the top of the tab. It reports the count of failed writes since plugin start (operations continued, but the audit trail has a gap) and prints the last error message, truncated to 200 characters. A "Clear notice" button resets the logger's failure state and hides the banner until the next failure. Source: [src/ui/settings/LogTab.ts](src/ui/settings/LogTab.ts#L25).
:::

### Debug

`Settings > Vault Operator > Advanced > Debug`

Internal diagnostics.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Debug mode | Enable verbose logging to the developer console | Off | `settings.debugMode` |

:::tip Inspecting the running state
Use the `inspect_self` tool from chat ("inspect your tools" or "show me your current settings") to see live introspection of the running plugin. It returns a Markdown summary of the actual runtime state.
:::

### Optional assets

`Settings > Vault Operator > Advanced > Optional assets`

One-time downloads stored under `.vault-operator/assets/`. Install only what you need.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Reranker model | `Xenova/ms-marco-MiniLM-L-6-v2` cross-encoder for semantic re-ranking | Not installed | `OptionalAssetManager` |
| Self-development source | One-time download (~5 MB) of the plugin's TypeScript source. Required for the `manage_source` tool, so the agent can answer "how does feature X work?" questions and propose patches. Downloaded from the plugin's GitHub release, verified by SHA256 | Not installed | `OptionalAssetManager` |
| Office assets | Bundled fonts and theme assets used by `create_pptx`, `create_docx`, `create_xlsx` | Not installed | `OptionalAssetManager` |

### Inline AI

`Settings > Vault Operator > Advanced > Inline AI`

Inline editor AI actions run on a marked selection directly in the editor. Open the menu via the inline-AI command (bind a hotkey in Obsidian's hotkey settings, for example Cmd+K). New in v3.0.0. See the [inline chat guide](/guides/inline-chat) for the workflow.

| Setting | What it does | Default | Source |
|---------|--------------|---------|--------|
| Inline editor AI actions enabled | Master toggle for the inline menu, hotkey, and command-palette entry | On | `settings.inlineActions.enabled`, [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L44) |
| Auto-open floating menu on selection | When on, the menu pops up automatically after you finish selecting text. When off, only the hotkey or command palette opens it | On | `settings.inlineActions.floatingMenuEnabled`, [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L52) |
| Use vault knowledge in lookup | Augment the lookup action with semantic-search hits from your vault | On | `settings.inlineActions.vaultRagInLookup`, [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L60) |
| Vault knowledge confidence threshold | Cosine similarity slider, range 0 to 1, step 0.05. Lookup falls back to LLM-only when no vault hit meets this threshold | 0.7 | `settings.inlineActions.vaultRagConfidenceThreshold`, [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L67) |
| Show vault source links in lookup tooltip | When on, the lookup preview block lists the wiki-links of the vault notes used | On | `settings.inlineActions.showVaultSourcesInTooltip`, [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L78) |
| Skills in floating menu (top N) | Maximum number of inline-eligible skills to list in the floating menu. Set to 0 to hide all skills | 10 | `settings.inlineActions.skillsTopN`, [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L86) |
| Refresh settings view | Re-renders this tab. Useful after changing pins to see the updated state | n/a | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L136) |

#### Per-action model pin

Pin a specific model per action; this overrides the main-chat default for inline actions only. Leave an entry empty to use the main-chat default. Model ids come from your configured providers.

| Action | Action id | Source |
|--------|-----------|--------|
| Lookup | `lookup` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Rewrite | `rewrite` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Send to chat | `send-to-main-chat` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Translate to English | `translate:english` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Translate to German | `translate:german` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Summarize (short) | `summarize:short` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Summarize (medium) | `summarize:medium` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Find action items | `find-action-items` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |
| Chat about this | `inline-chat` | [InlineActionsTab.ts](src/ui/settings/InlineActionsTab.ts#L101) |

Pins are stored in `settings.inlineActions.actionPins` as a record from action id to model id (or `null` to use the main-chat default). The confidence threshold is clamped to the range 0 to 1 and the skill cap is clamped to a non-negative integer at load time (see [src/core/inline/inlineSettings.ts](src/core/inline/inlineSettings.ts#L25)).

:::info Plugin reload may be needed
Some changes (action registration in particular) only take effect after reloading the plugin. The tab includes a footer note to this effect.
:::

:::warning Auto-approve still gates write tools
The Auto-approve groups still gate the write tools the inline panel invokes. Rewrite and Translate route the proposed change through the EditReviewModal (Änderungen prüfen) instead of the auto-approve pipeline, so you confirm the edit even when Edit auto-approve is on. See the [safety and control guide](/guides/safety-control) for how the approval groups interact with inline actions.
:::

### Language

`Settings > Vault Operator > Advanced > Language`

Set the agent's response language. The setting follows Obsidian's language by default. UI strings (settings labels, modals, errors) follow the Obsidian language separately.

## Help group

`Settings > Vault Operator > Help`

The Help group is not a content tab. It opens the public documentation in a new window. Use the in-app `Restart setup` button under Interface to re-run the first-run wizard.
