---
id: FEAT-29-16
epic: EPIC-29
adr-refs: [ADR-135]
plan-refs: []
depends-on: [FEAT-29-08, FEAT-29-10]
created: 2026-06-18
external-repo: pssah4/mcp-python-runner-dev
---

# FEAT-29-16: MCP-Python-Runner Anschluss (Plugin-Side)

## Pointer

Die vollstaendige Spezifikation lebt im separaten Repo [pssah4/mcp-python-runner-dev](https://github.com/pssah4/mcp-python-runner-dev):

- `_devprocess/requirements/features/FEAT-29-16-python-mcp-runner.md` -- 6 Stories, 7 Architektur-Entscheidungen.
- `_devprocess/architecture/ADR-135-mcp-python-runner-architecture.md` -- externer Server statt Pyodide/in-Plugin-Subprocess, sandbox-runtime + 5 EnBW-Patterns.

## Plugin-Side-Scope (zusammengefasst)

Wenn das Runner-Skeleton im externen Repo MVP erreicht hat, kommt der Plugin-Side-Anteil hier:

- Settings-Tab `McpPythonRunnerTab`.
- Drei Modals: `RunnerSetupModal`, `RunnerInstallApprovalModal`, `AddSkillModal`.
- Auto-Install via `uv tool install mcp-python-runner` nach Approval.
- Auto-Start des Runner-Prozesses in `onload()`.
- MCP-Connector-Anschluss.
- `system-instructions`-Prompt via `prompts/list` auto-pollen und in System-Prompt-Builder mergen.

## Plugin-Side-PLAN braucht spaeter

- Settings-UI-Wireframe.
- MCP-Tool-Schema fuer Skill-Tools.
- Plugin-Pre-Flight-Check (uv >= 0.5 erkennen).

## Status

Open. P2. Welle 5 nach FIX-29-08-02 (Mapping) und Pyodide (verworfen). Vorgehen: zuerst Runner-Skeleton in `mcp-python-runner-dev` voranbringen (ADR-135 Accepted, MVP-Spike), erst dann Plugin-Anschluss-PLAN.
