---
title: Troubleshooting
description: Common issues and how to fix them.
---

# Troubleshooting

Fixes for the most common Vault Operator issues. If your problem is not listed here, open Settings > Vault Operator > Advanced > Debug and check the latest log entries, or ask in the community forum.

:::info Plugin name in Obsidian
The plugin is called **Vault Operator** in Obsidian (Settings > Community plugins). It is not listed as "Obsidian Agent". The plugin id is `vault-operator`.
:::

## Model connection issues

Symptom: "Connection failed" or "API key invalid" when testing a model.

| Cause | Solution |
|-------|----------|
| Wrong API key | Re-enter the key in Settings > Vault Operator > Providers > Providers. Regenerate it at the provider's website if unsure. |
| Expired key | Some providers expire keys after inactivity. Generate a new one. |
| Wrong base URL | For Azure and custom endpoints, verify the full URL including `/v1` if required. |
| Rate limited | Wait a few minutes and try again. Consider setting a rate limit in Settings > Vault Operator > Advanced > Loop. |
| Firewall or proxy | Obsidian uses Electron's network stack. Check that your firewall allows outbound HTTPS. |

:::tip Test connection
After adding or changing a model, use the **Test connection** action on the model row. It verifies the key, endpoint, and model id in one step.
:::

## Semantic search not working

Symptom: `semantic_search` returns no results, or the agent says the index is not available.

| Cause | Solution |
|-------|----------|
| No embedding model configured | Go to Settings > Vault Operator > Providers > Embeddings and set up an embedding model (for example OpenAI `text-embedding-3-small`). |
| Semantic index disabled | The **Build index** button stays greyed out until the semantic index is enabled. Turn on Settings > Vault Operator > Providers > Embeddings > Semantic index first. |
| Index not built | Once enabled, click **Build index** in Settings > Vault Operator > Providers > Embeddings > Semantic index. The first build can take a few minutes for large vaults. |
| Embedding API key missing | The embedding model may need its own API key. Check the embeddings settings. |
| Auto-index off | The default for `semanticAutoIndex` is `never`. Pick `startup` or `mode-switch` in Settings > Vault Operator > Providers > Embeddings > Index configuration, or rebuild manually after changes. |
| Vault too large | For vaults with 10,000 or more notes, the initial build takes a while. Let it finish before searching. |

:::warning Force rebuild deletes the index
**Force rebuild** drops the existing vectors before re-indexing. **Cancel** during a normal build keeps the partial progress. Only use force rebuild after a schema change or a corrupted index.
:::

## Agent stuck in a loop

Symptom: The agent keeps calling tools repeatedly without making progress, or hits the iteration limit.

| Cause | Solution |
|-------|----------|
| Weak model | Smaller or older models sometimes repeat themselves. Switch to a flagship model (Claude Sonnet, GPT-4o, GPT-5-class). |
| Consecutive error limit too high | Lower it in Settings > Vault Operator > Advanced > Loop > Consecutive error limit (default: 3). |
| Max iterations too high | Set a reasonable cap in Settings > Vault Operator > Advanced > Loop > Max iterations (default: 25). |
| Approval pending | The agent paused on an approval and is waiting for you. Approve or deny in the chat to let it continue. |
| Context overflow | Enable **context condensing** in Settings > Vault Operator > Advanced > Loop. Lower the condensing threshold if you see 400-errors. |

:::info Emergency stop
Click the **Stop** button in the chat toolbar at any time to halt the agent. You can undo any changes already made via the checkpoint system.
:::

## Permission issues

Symptom: The agent says it cannot perform an action, or approvals keep appearing for routine tasks.

| Cause | Solution |
|-------|----------|
| Auto-approve not enabled | Go to Settings > Vault Operator > Agents > Auto-approve and enable the categories you trust. |
| File is in the ignore list | Check `.obsidian-agentignore` in your vault root. Remove the path if the agent should access it. |
| File is protected | Check `.obsidian-agentprotected`. The agent can read but not write these files. |
| Custom agent restricts tools | The active custom agent may not include the needed tool group. Switch to the **Default agent**, or edit the custom agent's tool groups in Settings > Vault Operator > Agents > Agents. |

## MCP server not connecting

Symptom: "Failed to connect" or "Server unreachable" when adding or using an MCP server.

| Cause | Solution |
|-------|----------|
| Wrong transport type | Only **SSE** and **streamable-http** are supported. Stdio does not work in Obsidian's Electron runtime. |
| Server not running | Verify the MCP server is running and reachable at the configured URL. |
| Wrong URL | Check the server URL. Common format: `http://localhost:3000/sse` or `http://localhost:3000/mcp`. |
| CORS issues | If the MCP server runs locally, it may need CORS headers. Check the server's documentation. |
| Network timeout | Increase the connection timeout on the server entry in Settings > Vault Operator > Customize > Connectors, or check your network. |

## Performance problems

Symptom: Obsidian feels slow, the agent takes a long time, or the UI lags.

| Cause | Solution |
|-------|----------|
| Large vault indexing | The semantic index build runs in the background. Wait for it to finish. |
| Too many concurrent sub-agents | Lower the subtask depth cap in Settings > Vault Operator > Advanced > Loop (default: 2). |
| Large context window | Enable context condensing to keep the conversation from growing too large. |
| Many MCP servers | Each connected server maintains an active connection. Remove unused servers in Settings > Vault Operator > Customize > Connectors. |
| Slow model | Local models on limited hardware can be slow. Try a smaller model or switch to a cloud provider. |

## Knowledge database errors

Symptom: The plugin logs "knowledge.db is corrupt", "database is locked", "integrity check failed", or semantic search and memory tools return nothing after a crash or sudden Obsidian quit.

| Cause | Solution |
|-------|----------|
| Corrupt write after a crash or power loss | The plugin runs an `integrity_check` and auto-recovers from the last good state on the next open. Reopen Obsidian. If recovery does not succeed, restore from `.bak/{db-name}/{YYYY-MM-DD}.db` next to the active database (daily snapshots, 7-day retention). The active path depends on the storage mode: `~/.vault-operator/` (global), `{vault}/.vault-operator/` (local), or `{vault}/{pluginDir}/` (obsidian-sync). The folder is `.obsidian-agent/` on installs upgraded from v2.12 or earlier. |
| Another Obsidian window has the database open | A second running instance holds a lock file. Close the other window or restart Obsidian. |
| Storage mode mismatch after switching `global`, `local`, or `obsidian-sync` | A switch resets the active database. Set the desired mode in Settings > Vault Operator > Providers > Embeddings > Index configuration and rebuild the index. |
| Database wedged after a failed upgrade | Quit Obsidian. Move `knowledge.db` and `knowledge.db-journal` aside and copy the most recent file from the `.bak/` snapshot folder into place. Reopen. |
| Semantic index missing after restoring a vault from backup | The index lives outside the vault. Open Settings > Vault Operator > Providers > Embeddings > Semantic index and click **Build index**. |

:::warning Do not delete `knowledge.db` while Obsidian is running
The lock file is held by the live process. Quit Obsidian first, then move or restore the file. Deleting it mid-run drops all embeddings, the memory store, and the conversation history index, and forces a full reindex.
:::

## `write_file` is truncated mid-output

Symptom: The agent calls `write_file`, but the file ends mid-sentence or shows a JSON parse error in the activity block. Often followed by repeated retry loops and a final 400 context-overflow error.

| Cause | Solution |
|-------|----------|
| `max_tokens` too low for the model | Open Settings > Vault Operator > Providers > Providers, edit the active model, and turn on **Automatic (recommended)** for max output tokens. The plugin then clamps the output budget to the model's real ceiling minus the estimated input. |
| Manual `max_tokens` plus a large thinking budget | For Anthropic and Bedrock, `max_tokens` covers the thinking budget AND the visible output. A configured `max_tokens=8192` with a `thinking_budget=10000` leaves nothing for the visible tool call. Switch to **Automatic**, or raise `max_tokens` well above the thinking budget. |
| Very long file in a single call | Ask the agent to split the file: `write_file` for the head section, then `append_to_file` calls for the following sections. The built-in prompt already nudges the model to do this for content above 2000 words. |
| Repeated parse-error loop after a truncation | The agent reports the real provider error back into the tool result and trips the consecutive-mistake circuit breaker after three retries (default). If the loop survives, click **Stop** and start a fresh conversation. |

## Context overflow on long conversations

Symptom: A 400 error with `context_length_exceeded`, `prompt is too long`, or the conversation suddenly stops responding.

| Cause | Solution |
|-------|----------|
| Conversation too long for the model's context window | Enable **Context condensing** in Settings > Vault Operator > Advanced > Loop. The plugin keeps a stable cache-aligned prefix and condenses older turns. |
| Threshold set too high | Lower **Condensing threshold** to 0.6 or 0.7. The plugin also runs an emergency condensing pass on any 400 context-overflow error. |
| Very large @-mention attached to the chat | Plaintext, Markdown, and XML attachments are capped at 80,000 characters with a `read_file path=...` hint. Older builds injected the full text. Update the plugin, or split the source into smaller notes. |
| Long tool output filling the context | Enable **Context externalization** in Settings > Vault Operator > Advanced > Loop. Large tool outputs are written to a temp file and the conversation keeps a compact reference (`read_file path=...`) instead of the full payload. |

## Inline AI chat

Symptom: The inline chat introduced in v3.0 does not open, returns no vault context, stops accepting input, or writes the result back to the wrong place. See [guides/inline-chat.md](../guides/inline-chat.md) for the canonical walkthrough.

| Cause | Solution |
|-------|----------|
| Cmd+Shift+I (or Ctrl+Shift+I) does nothing | Open Settings > Vault Operator and confirm `inlineActions.enabled` is on. The chord is registered on the Obsidian app scope, and the same surface is bound to the command **Open inline AI chat**. Re-bind the command in Settings > Hotkeys if another plugin owns the chord. See [PanelChatController.ts](../../src/core/inline/chat/PanelChatController.ts) and [main.ts:2219](../../src/main.ts#L2219). |
| Floating menu does not appear on selection | The selection-watcher is no longer wired by default. Use the hotkey, or right-click the selection and pick **Inline AI chat**. The `inlineActions.floatingMenuEnabled` toggle stays available for callers that opt back in. See [PluginWiring.ts:893](../../src/core/inline/PluginWiring.ts#L893). |
| Lookup returns no vault sources | Build the semantic index first (Settings > Vault Operator > Providers > Embeddings > Semantic index). Confirm `inlineActions.vaultRagInLookup` is on. If the floor is too strict, lower `inlineActions.vaultRagConfidenceThreshold` (defaults to 0.7, clamped to 0..1). See [inlineSettings.ts](../../src/core/inline/inlineSettings.ts) and [PluginWiring.ts:586](../../src/core/inline/PluginWiring.ts#L586). |
| Lookup web fallback never runs | Web fallback only runs when vault hits are not classified as strong AND the web provider is configured. Set Settings > Vault Operator > Customize > Web tools > Provider to `brave` or `tavily` and enter the matching API key. See [InlineWebLookup.ts:66](../../src/core/inline/lookup/InlineWebLookup.ts#L66). |
| Notice: `Inline chat reached 20-turn cap` | The panel caps each session at 20 user/assistant turns. Open the sidebar and continue the same conversation there. See [PanelChatController.ts:139](../../src/core/inline/chat/PanelChatController.ts#L139). |
| Rewrite landed in the wrong note or did not show up | Rewrite needs an editable target. Reading mode is read-only and the action is skipped. Keep the source note open in Source or Live-Preview mode while the rewrite runs. The write-back walks all open markdown leaves for the captured selection range; if none is found, the file on disk is patched and the open buffer refreshed. See [RewriteAction.ts:65](../../src/core/inline/actions/RewriteAction.ts#L65) and [PluginWiring.ts:663](../../src/core/inline/PluginWiring.ts#L663). |
| Steering message looks ignored | Steering text typed during a running turn is queued and drained at the next iteration boundary. A long-running tool call finishes first, then the queued message is appended as a user-role turn. See [PanelChatController.ts:150](../../src/core/inline/chat/PanelChatController.ts#L150) and [PanelChatController.ts:469](../../src/core/inline/chat/PanelChatController.ts#L469). |
| Checkpoint markers missing after reopening from history | Each panel session uses a stable task id stamped on every checkpoint and on the persisted assistant message, so reopening the conversation rehydrates the markers. Conversations created before v3.0 predate this stamp and will not show inline markers on reopen. See [PanelChatController.ts:47](../../src/core/inline/chat/PanelChatController.ts#L47). |

:::tip Related
[guides/inline-chat.md](../guides/inline-chat.md), [guides/safety-control.md](../guides/safety-control.md), [reference/settings.md](settings.md).
:::

## Memory not extracting

Symptom: The agent does not remember things from previous conversations.

| Cause | Solution |
|-------|----------|
| Memory extraction disabled | Enable it in Settings > Vault Operator > Agents > Memory > Memory extraction. |
| Chat history disabled | Memory extraction requires saved conversations. Enable **Chat history** first. |
| Threshold too high | Lower the **Memory threshold** in Settings > Vault Operator > Agents > Memory (default: 0.7). A value of 0.5 captures more memories. |
| Wrong memory model | If the memory model is not configured or is offline, extraction silently fails. Check Settings > Vault Operator > Agents > Memory > Memory model. |
| Short conversations | Very brief exchanges may not contain extractable facts. This is normal. |

## Common error messages

| Error | Meaning | Fix |
|-------|---------|-----|
| `400: context_length_exceeded` | The conversation is too long for the model's context window. | Enable context condensing. Start a new chat for fresh context. |
| `400: tool_use ids were found without tool_result` | Anthropic or Claude-via-Copilot rejected the request because the conversation history had an orphan tool call. Usually caused by an aborted stream or a resumed crashed conversation. | v2.5.0 sanitises the history automatically on every API call, so this should no longer surface. If it does, start a new conversation. |
| `400: Unsupported parameter: 'max_tokens' is not supported` | Old Copilot code path sending the wrong token-limit parameter. | v2.5.0 sends `max_completion_tokens` for every Copilot model. Update Vault Operator. |
| `401: Unauthorized` | Invalid or expired API key. | Re-enter the key in Settings > Vault Operator > Providers > Providers. |
| `429: Rate limit exceeded` | Too many API calls in a short time. | Set a rate limit in Settings > Vault Operator > Advanced > Loop, or wait and retry. |
| `ECONNREFUSED` | Local server (Ollama, LM Studio) is not running. | Start the local server, then retry. |
| `Checkpoint failed` | Could not create a file snapshot before editing. | Check disk space. Adjust the snapshot timeout in Settings > Vault Operator > Vault > Vault. |
| Drawio or Diagrams plugin says "Not a diagram file" when opening a file the agent wrote | Hand-authored `.drawio.svg` without a valid mxfile wrapper. | Delete the broken file. Ask the agent again. v2.5.0 blocks direct `write_file` for `.drawio.svg` and routes to the built-in `create_drawio` tool, which writes a plugin-compatible format. |

:::tip Debug surface
Settings > Vault Operator > Advanced > Debug shows the agent's internal ring buffer (last 100 log entries), the generated system prompt, and connection status for each provider. Start here when something behaves unexpectedly.
:::
