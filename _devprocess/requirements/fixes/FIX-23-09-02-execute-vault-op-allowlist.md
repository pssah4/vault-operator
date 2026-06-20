---
id: FIX-23-09-02
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: [FIX-23-09-01]
created: 2026-06-20
---

# FIX-23-09-02: execute_vault_op deny-list expansion

## Symptom

In GitHub-Issue [#46](https://github.com/pssah4/vault-operator/issues/46) flaggte der MCP-Client zusaetzlich zu FIX-23-09-01 die Tool-Liste von `execute_vault_op`:

> "The full execute_vault_op catalog includes things like execute_command, invoke_mcp_server, use_mcp_tool, update_soul, and search_history, far beyond anything a note-renaming task needs."

Die genannten Tools sind polymorphic-dispatch-Surfaces (`execute_command` ruft beliebige Obsidian-Commands, `use_mcp_tool` und `invoke_mcp_server` rufen beliebige MCP-Tools weiter, `invoke_skill` und `run_skill_script` fuehren beliebigen Skill-Code aus, `evaluate_expression` evaluiert beliebiges JS in der Sandbox) oder Identitaets-Mutationen (`update_soul`). Sie waren im AGENT_INTERNAL_TOOLS-Deny-Set NICHT enthalten und wurden ueber `execute_vault_op` an externe MCP-Clients exponiert.

## Root Cause

`src/mcp/McpBridge.ts:30` `AGENT_INTERNAL_TOOLS` enthielt nur 14 Eintraege. Die sieben oben genannten Tools waren entstanden ohne dass dieser Filter mitgewachsen ist. Per Discovery (Workflow `wq1b52nca`) standen sie alle auf "Available operations" und konnten ueber `execute_vault_op` vom Modell aufgerufen werden.

## Fix

Surgical: `AGENT_INTERNAL_TOOLS` um die sieben Eintraege erweitert. Sowohl `getToolsWithContext()` als auch `execute_vault_op` selbst filtern den Catalog ueber dieses Set, also wirkt der Fix sofort in allen Pfaden:

1. `tools/list` zeigt `execute_vault_op` ohne diese Tools in der "Available"-Auflistung.
2. `execute_vault_op` weist Calls fuer diese Tools an der Boundary ab ("agent-internal and not callable via MCP").
3. `get_context` filtert die Available-Vault-Operations ebenfalls.

Der groessere "per-op typed schema"-Redesign (eigene MCP-Tool-Definition pro Op mit echtem JSON-Schema statt eines Catch-All) wurde bewusst NICHT mitgemacht. Begruendung: Pipeline-Fail-Closed-Approval blockt Writes von extern bereits zuverlaessig, und die akute Issue-#46-Beschwerde war "ich sehe execute_command in der Liste" -- das ist mit der Deny-Liste-Erweiterung weg. Wenn ein typed-schema-Redesign spaeter notwendig wird, kommt es als separates Item.

## Tests

`src/mcp/__tests__/McpBridge.hygiene.test.ts` -- neuer Block "AGENT_INTERNAL_TOOLS deny-list (FIX-23-09-02)" mit sieben einzelnen Test-Cases, einem pro neu hinzugefuegtem Eintrag. Das Test-Set haelt zukuenftiges Regression-Drift fest (jemand entfernt einen Eintrag versehentlich).

Adversarial verify in `Workflow wwzd6yqj0` bestaetigt: kein verbleibender Pfad ueber den eine der sieben Ops von extern erreichbar bleibt. `tools/list`, `tools/call`, `prompts/list`, `resources/list`, `get_context` -- alle filtern korrekt.

## Verification

Full vitest: 2955 passed, 0 Regressionen. Type-Check: clean.
