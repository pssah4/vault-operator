# Feature: Remote Approval Pipeline

> **Feature ID**: FEAT-14-08
> **Epic**: EPIC-14 - MCP Connector
> **Priority**: P2-Medium
> **Effort Estimate**: M

## Feature Description

Write-Operationen im Remote-Modus erfordern eine Bestaetigung durch den User. Da der User nicht vor Obsidian sitzt, wird ein Push-basierter Approval-Mechanismus implementiert.

## User Stories

### Story 1: Sichere Remote-Writes
**Als** User der remote auf den Vault zugreift
**moechte ich** Write-Operationen bestaetigen koennen
**um** unbeabsichtigte Aenderungen zu verhindern

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Write-Ops erfordern Bestaetigung | 100% der Write-Tools | Security-Test |
| SC-02 | User wird benachrichtigt | Push oder Obsidian-Notification | UX-Test |
| SC-03 | Timeout bei fehlender Antwort | Auto-Reject nach 60s | Timeout-Test |

---

## Definition of Done

- [x] Approval-Mechanismus fuer Remote-Writes: Obsidian-Notice mit Approve/Reject Buttons
- [x] Timeout-Handling (60s Auto-Reject)
- [ ] Approval-Whitelist fuer vertrauenswuerdige Operationen (optional, spaeter)
- [x] Status-Rueckmeldung an Client bei Reject ("Operation rejected by user")
- [x] Settings-Toggle: "Approve remote writes" (default: true)

## How It Works

- Setting `remoteWriteApproval` (default: `true`) in settings.ts
- Write-Tools (`write_vault`, `update_memory`, `execute_vault_op`) zeigen eine Obsidian-Notice
- Notice hat "Approve" und "Reject" Buttons
- 60s Timeout -> Auto-Reject
- Bei Reject: MCP Error-Response an AI-Client ("Operation rejected by user")
- Toggle in Settings unter Remote Access
- Key Files: `src/mcp/tools/index.ts`, `src/ui/settings/McpTab.ts`

---

## Dependencies
- **FEAT-14-03**: Remote Transport
