---
title: Troubleshooting
description: Common issues and how to fix them.
---

# Troubleshooting

Solutions for the most common Obsilo issues. If your problem isn't listed here, check the **Debug** tab in settings or ask in the community forum.

## Model connection issues

Symptom: "Connection failed" or "API key invalid" when testing a model.

| Cause | Solution |
|-------|----------|
| Wrong API key | Double-check the key in **Settings > Models**. Regenerate it at the provider's website if unsure. |
| Expired key | Some providers expire keys after inactivity. Generate a new one. |
| Wrong base URL | For Azure and custom endpoints, verify the full URL including `/v1` if required. |
| Rate limited | Wait a few minutes and try again. Consider setting a rate limit in **Settings > Loop**. |
| Firewall or proxy | Obsidian uses Electron's network stack. Ensure your firewall allows outbound HTTPS. |

:::tip Test button
Always use the **Test connection** button after adding or changing a model. It verifies the key, endpoint, and model name in one step.
:::

## Semantic search not working

Symptom: `semantic_search` returns no results, or the agent says the index is not available.

| Cause | Solution |
|-------|----------|
| No embedding model configured | Go to **Settings > Embeddings** and set up an embedding model (e.g., OpenAI `text-embedding-3-small`). |
| Index not built | Click **Rebuild index** in **Settings > Embeddings**. First build can take a few minutes for large vaults. |
| Embedding API key missing | The embedding model may need its own API key. Check the embeddings settings. |
| Auto-index disabled | If auto-index is off, new or changed notes won't be indexed. Enable it or rebuild manually. |
| Vault too large | For vaults with 10,000+ notes, the initial build may take a while. Let it finish before searching. |

## Agent stuck in a loop

Symptom: The agent keeps calling tools repeatedly without making progress, or hits the iteration limit.

| Cause | Solution |
|-------|----------|
| Weak model | Smaller or older models sometimes repeat themselves. Switch to a stronger model (Claude Sonnet, GPT-4o). |
| Consecutive error limit too high | Lower it in **Settings > Loop > Consecutive error limit** (default: 3). |
| Max iterations too high | Set a reasonable cap in **Settings > Loop > Max iterations** (default: 25). |
| Tool permission denied repeatedly | The agent asks for approval but you haven't responded. Approve or deny to let it continue. |
| Context overflow | Enable **context condensing** in **Settings > Loop**. Lower the condensing threshold if you see 400-errors. |

:::info Emergency stop
Click the **Stop** button in the chat toolbar at any time to immediately halt the agent. Any changes already made can be undone via the checkpoint system.
:::

## Permission issues

Symptom: The agent says it cannot perform an action, or approvals keep appearing for routine tasks.

| Cause | Solution |
|-------|----------|
| Auto-approve not enabled | Go to **Settings > Permissions** and enable auto-approve for categories you trust. |
| File is in the ignore list | Check `.obsidian-agentignore` in your vault root. Remove the path if the agent should access it. |
| File is protected | Check `.obsidian-agentprotected`. The agent can read but not write these files. |
| Mode restricts tools | The current mode may not include the needed tool group. Switch to Agent mode or edit the mode's tools. |

## MCP server not connecting

Symptom: "Failed to connect" or "Server unreachable" when adding or using an MCP server.

| Cause | Solution |
|-------|----------|
| Wrong transport type | Only **SSE** and **streamable-http** are supported. Stdio doesn't work in Obsidian's Electron runtime. |
| Server not running | Verify the MCP server is running and accessible at the configured URL. |
| Wrong URL | Check the server URL. Common format: `http://localhost:3000/sse` or `http://localhost:3000/mcp`. |
| CORS issues | If the MCP server runs locally, it may need CORS headers. Check the server's documentation. |
| Network timeout | Increase the connection timeout in the MCP server settings, or check your network. |

## Performance problems

Symptom: Obsidian feels slow, the agent takes a long time, or the UI lags.

| Cause | Solution |
|-------|----------|
| Large vault indexing | The semantic index build runs in the background. Wait for it to finish. |
| Too many concurrent sub-agents | Limit subtask depth in **Settings > Loop** (default: 2). |
| Large context window | Enable context condensing to keep the conversation from growing too large. |
| Many MCP servers | Each connected server maintains an active connection. Remove unused servers. |
| Slow model | Local models on limited hardware can be slow. Try a smaller model or use a cloud provider. |

## Memory not extracting

Symptom: The agent doesn't remember things from previous conversations.

| Cause | Solution |
|-------|----------|
| Memory extraction disabled | Enable it in **Settings > Memory > Memory extraction**. |
| Chat history disabled | Memory extraction requires saved conversations. Enable **Chat history** first. |
| Threshold too high | Lower the **Memory threshold** in settings (default: 0.7). A value of 0.5 captures more memories. |
| Wrong memory model | If the memory model isn't configured or is offline, extraction silently fails. Check **Settings > Memory > Memory model**. |
| Short conversations | Very brief exchanges may not contain extractable facts. This is normal. |

## Common error messages

| Error | Meaning | Fix |
|-------|---------|-----|
| `400: context_length_exceeded` | The conversation is too long for the model's context window. | Enable context condensing. Start a new chat for fresh context. |
| `401: Unauthorized` | Invalid or expired API key. | Re-enter the key in Settings > Models. |
| `429: Rate limit exceeded` | Too many API calls in a short time. | Set a rate limit in Settings > Loop, or wait and retry. |
| `ECONNREFUSED` | Local server (Ollama, LM Studio) isn't running. | Start the local server, then retry. |
| `Checkpoint failed` | Could not create a file snapshot before editing. | Check disk space. Increase snapshot timeout in Settings > Vault. |

:::tip Debug tab
The **Debug** tab in settings shows the agent's internal ring buffer (last 100 log entries), the generated system prompt, and connection status for all providers. Start here when troubleshooting unexpected behavior.
:::
