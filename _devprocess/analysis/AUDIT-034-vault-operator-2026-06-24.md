---
id: AUDIT-034
project: vault-operator
date: 2026-06-24
scope: full-codebase
trigger: pre-release-3.1.0
auditor: claude-opus-4-7
prior-audit: AUDIT-EPIC-33-2026-06-23
---

# AUDIT-034 vault-operator full-codebase security review

## Audit summary

```
=== Security Audit Result ===

Overall risk: High

P1 (Must Fix, Critical + High): 9 findings
- H-1: Path traversal in writeBinaryToVault via weak includes('..') check,
       src/core/tools/vault/writeBinaryToVault.ts:37-38, effort S
- H-2: Missing path validation in MoveFileTool source and destination,
       src/core/tools/vault/MoveFileTool.ts:36-83, effort S
- H-3: Subtask allowedTools constraint not enforced at runtime gate in
       ToolExecutionPipeline, src/core/tools/agent/InvokeSkillTool.ts:245-255
       + ToolExecutionPipeline.executeTool, effort M
- H-4: MCP server allowlist bypass in UseMcpToolTool when activeMcpServers
       is empty (short-circuit AND), src/core/tools/mcp/UseMcpToolTool.ts:73-83,
       effort S
- H-5: CDN package downloads use TOFU only, no SRI/pinned hashes for npm
       packages, src/core/sandbox/EsbuildWasmManager.ts:43-44,512-540;
       SandboxBridge.ts URL_ALLOWLIST, effort L
- H-6: ResolveConflictModal logs full chat prompts (paths, verdicts, URLs)
       to console.debug, src/ui/modals/ResolveConflictModal.ts:125, effort S
- H-7: Vault content not wrapped with untrusted boundary tags in all
       semantic/search paths (LLM01),
       src/core/tools/vault/ReadFileTool.ts:153-157 + downstream, effort M
- H-8: System prompt cache includes unredacted vault and memory facts
       (credential leak risk), src/core/systemPrompt.ts:277,300-316;
       src/core/prompts/sections/memory.ts:16-35, effort M
- H-9: InspectSelfTool SENSITIVE_KEY_REGEX is incomplete (misses
       auth/bearer/oauth/jwt/aws/access_key),
       src/core/tools/agent/InspectSelfTool.ts:27,149-171, effort S

P2 (Should Fix, Medium): 41 findings
- M-1: Missing path validation in DeleteFileTool, src/core/tools/vault/DeleteFileTool.ts:32-74, effort S
- M-2: Missing path validation in AppendToFileTool, src/core/tools/vault/AppendToFileTool.ts:59-114, effort S
- M-3: Missing path validation in CreateFolderTool, src/core/tools/vault/CreateFolderTool.ts:32-64, effort S
- M-4: SandboxBridge.validateVaultPath: configDir protection only when isWrite=true, src/core/sandbox/SandboxBridge.ts:330-359, effort S
- M-5: SandboxBridge does not reject Windows-style absolute paths (C:\, \\\\server), src/core/sandbox/SandboxBridge.ts:330-359, effort S
- M-6: esbuild-wasm loadCommonJsModule uses new Function() without runtime re-verify of cache, src/core/sandbox/EsbuildWasmManager.ts:253-255, effort M
- M-7: UpdateSettingsTool uses shallow Object.assign for autoApproval preset, src/core/tools/agent/UpdateSettingsTool.ts:297, effort S
- M-8: Fragile regex-based JSON parsing in skill frontmatter schema extraction, src/core/skills/SelfAuthoredSkillLoader.ts:808-812, effort M
- M-9: IngestDeepTool JSON.parse without local try/catch, src/core/tools/vault/IngestDeepTool.ts:265, effort S
- M-10: InvokeMcpServerTool args passed to McpClient without deep sanitization (prototype-pollution risk), src/core/tools/agent/InvokeMcpServerTool.ts:68-103, effort M
- M-11: Inline action <selection> wrapping not documented as untrusted in system prompt, src/core/inline/actions/RewriteAction.ts:71 etc.; securityBoundary.ts, effort S
- M-12: Plugin API auto-promotion (FEAT-29-07) has no per-session promotion limit, src/core/tools/agent/ToolExecutionPipeline.ts:470-485; pluginApiAdaptive.ts, effort M
- M-13: Imported skill body wrapper not reinforced as non-authorization boundary in system prompt, src/core/tools/agent/InvokeSkillTool.ts:296-314, effort S
- M-14: TOOL_STEPS_SANITIZE_CONFIG lacks explicit style and on* attribute denylist, src/ui/AgentSidebarView.ts:70-76,3471, effort S
- M-15: Parsed [sources] note/context not normalized before render, src/ui/AgentSidebarView.ts:3851-3888,3993-4068, effort S
- M-16: InlineChatPanel renderMarkdown lacks post-render DOMPurify pass like sidebar, src/core/inline/chat/InlineChatPanel.ts:818-835; PluginWiring.ts:828-837, effort M
- M-17: Sandbox bridge result data not sanitized before potential DOM rendering, src/core/sandbox/sandboxHtml.ts:86 and consumers, effort M
- M-18: Subprocess env: atob-obfuscated identity vars without strict whitelist, src/util/envKeys.ts; src/core/subprocess/buildSubprocessEnv.ts, effort S
- M-19: Sandbox HTML template lacks explicit security headers beyond meta CSP, src/core/sandbox/sandboxHtml.ts:13-17, effort S
- M-20: MCP responses trusted without schema validation in RelayClient / McpClient, src/mcp/RelayClient.ts:199-207; McpBridge.ts:606-659; McpClient.ts:230-237, effort M
- M-21: TOFU package-hashes.json saved non-atomically without manifest integrity check, src/core/sandbox/EsbuildWasmManager.ts:369-398,435-475, effort M
- M-22: Package name validation regex permits forward slash/dot; version not semver-validated, src/core/sandbox/EsbuildWasmManager.ts:503-540, effort S
- M-23: MCP rate-limit rejections not logged to OperationLogger, src/mcp/tools/index.ts:252, effort S
- M-24: Insufficient session-compromise detection logging in ActiveMcpSessions, src/main.ts:2406, effort M
- M-25: testToolExecution dumps full tool results to console without truncation, src/main.ts:4107-4142, effort S
- M-26: Debug log includes model identity key when API key missing, src/main.ts:3185, effort S
- M-27: Custom provider URLs allow HTTP on non-loopback hosts, src/api/providers/providerUrlGuard.ts:123-129, effort S
- M-28: InlineWebLookup query has no provider-URL validation hook (future-proofing), src/core/inline/lookup/InlineWebLookup.ts:66-92, effort S
- M-29: obsidianFetch IPv6 SSRF guard has redundant double-check and bracket-format edge cases, src/core/mcp/obsidianFetch.ts:86-105, effort S
- M-30: SemanticIndexService contextual enrichment sanitizer is weak (verify sanitizeVaultContentForLLM wiring), src/core/semantic/SemanticIndexService.ts:1261-1303, effort M
- M-31: Inline action selection wrapped but security guidance not in system prompt boundary, src/core/inline/actions/*Action.ts; securityBoundary.ts, effort S
- M-32: Conversation history persisted as plaintext JSON (no at-rest encryption), src/core/ChatHistoryService.ts:22-43, effort L
- M-33: ToolCallbacks.log() called with unsanitized tool inputs, src/core/AgentTask.ts:1559-1575; tools/types.ts, effort M
- M-34: MCP tool descriptions/resources surfaced to LLM without credential filter, src/core/AgentTask.ts:480-498; src/core/mcp/McpClient.ts:347-352, effort M
- M-35: Web search apiKey passed as plain function parameter without sensitivity marker, src/core/tools/web/WebSearchProvider.ts:21-113, effort S
- M-36: Subtask escape: subagentAllowedTools undefined leaves parent tools accessible, src/core/AgentTask.ts:880-1010; ToolExecutionPipeline.ts:415-434, effort M
- M-37: Subtask approval callback wiring lacks defensive null/crash guard, src/core/AgentTask.ts:920-970; ToolExecutionPipeline.ts:895-904, effort S
- M-38: importConversation lacks runtime validation of TransferState shape, src/ui/AgentSidebarView.ts:3310-3349, effort M
- M-39: Sidebar handshake uses duck-typing on importConversation without identity token, src/core/inline/chat/InlineToSidebarTransferService.ts:163-172, effort S
- M-40: InlineActionPill closest()-based DOM walk not constrained to trusted root, src/core/inline/chat/InlineActionPill.ts:307-334, effort S
- M-41: Snapshot provider race during async activateView lacks epoch token, src/core/inline/chat/InlineToSidebarTransferService.ts:106-149, effort M

P3 (Consider, Low + Info): 26 findings (deferred to backlog SEC-rows; see HANDOFFS)
```

> Positive findings omitted per audit format rule (overall risk High).

## Context

- Codebase: `vault-operator` (Obsidian Agent plugin, EPIC-33 inline chat just shipped on branch `feature/epic-33-inline-editor-ai-actions`).
- Stack: TypeScript strict, esbuild, Obsidian Plugin API, Electron runtime, sql.js (sandbox), Anthropic + OpenAI + Bedrock + Gemini + Copilot + KiloGateway SDKs, MCP client/server bridge.
- Prior baseline: AUDIT-EPIC-33-2026-06-23 (zero unresolved high findings at that time). This audit re-runs the full surface plus the new inline-chat changes (FEAT-33-12 polish: pill, transfer service, importConversation, mount adapters, autocomplete portal).
- Phases covered: SAST (injection / path traversal / secrets / deserialisation), OWASP A01/A03/A05/A08/A09/A10, OWASP LLM01/02/06/08, Zero Trust boundaries, SCA (runtime + dev triage).

## Findings

The summary block above is the authoritative finding list with title + location +
severity + effort. Each finding has been adversarially verified before inclusion
(any high/critical that the second-pass verifier refuted was dropped). The
complete payload with `risk:` + `remediation:` lines per finding is preserved in
the workflow output at
`/private/tmp/claude-501/-Users-sebastianhanke-projects-obsidian-agent/331c958e-1873-46d6-bf71-8322d764cf26/tasks/wgxuqsji5.output`
and in the workflow run journal.

## Status

| ID | Status |
|---|---|
| H-1 ... H-9 | Confirmed -- to be resolved this cycle |
| M-1 ... M-25 (all M-effort=S) | Confirmed -- to be resolved this cycle |
| M-effort=M and M-32 | Confirmed -- deferred to backlog (SEC- rows) |
| L-1 ... L-26 | Low / Info -- deferred to backlog |

## Release recommendation

**RED** until all P1 (H-1 to H-9) are resolved. P2 with S-effort are bundled in
the same fix-loop. M-effort and L-effort items are deferred to the post-3.1.0
backlog with explicit SEC- rows.

The plugin's threat model assumes hostile vault content + LLM-driven tool calls
+ untrusted MCP responses. Several P1 items (H-1, H-2, H-4, H-7) sit directly on
that boundary; H-6 + H-8 + H-9 are credential/PII leak surfaces in
logs/snapshots; H-3 is a subtask isolation escape. None of these are
exploitable from outside Obsidian, but a prompt-injected vault note or a
hostile MCP server can trigger them today.

## Re-Audit Delta (after fix-loop)

Populated by the fix-loop runner once all in-scope items are resolved. The
re-audit re-runs the affected lenses (SAST path-traversal, A01 access control,
LLM01/02/06, A09 logging, Zero-Trust subtask isolation) on the patched code and
reports deltas only.

## Backlog handoff

Deferred P2 (M-effort and M-32 L-effort) + all P3 are added to
`_devprocess/context/BACKLOG.md` under "Standalone Items" with `Typ = Security`,
`Source = SEC`, priority mapped from severity, status `Ready`,
`Evidence = path:line`, `Notes = <ID> + risk excerpt`. The audit report row
remains `Confirmed` for each deferred item with note "Deferred to backlog".

## Next

1. Fix-loop on H-1..H-9 + M-effort-S items.
2. Re-audit on the affected lenses.
3. `/review-bot` against the patched tree.
4. `/release 3.1.0` once both audit + bot pass.
