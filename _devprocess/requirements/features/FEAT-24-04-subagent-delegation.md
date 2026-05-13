---
id: FEAT-24-04
title: Subagent-Delegation: profile='research' + Per-Call-Token-Budget
epic: EPIC-24
priority: P1
date: 2026-05-12
updated: 2026-05-13
related: RESEARCH-36
adr-refs: [ADR-113, ADR-090]
plan-refs: [PLAN-22]
depends-on: []
---

# FEAT-24-04: Subagent-Delegation

## Description

`new_task` um einen optionalen `profile`-Parameter erweitern. Wenn
`profile='research'` gesetzt ist, laeuft der Subagent mit einem schlanken
Profile-System-Prompt + read-only-Tool-Liste; die ADR-090-Tier-4-Justification
entfaellt (Profile-Wahl ist die Entscheidung selbst). Wenn `profile` nicht
gesetzt ist, bleibt der heutige Tier-4-Pfad unveraendert. Per-Call-Token-Budget
(Default 8000, Setting `subtaskTokenBudget`) gilt fuer beide Pfade. Prompt-
Leitplanke in `toolDecisionGuidelines` instruiert das Modell, `profile='research'`
fuer multi-step-Recherche zu nutzen.

Quelle: RESEARCH-36 Abschnitt 8 Hebel E. Architektur: ADR-113 (Amendment 2026-05-13:
additiv zu ADR-090). Umsetzung: PLAN-22.

## Success Criteria

1. **`new_task` akzeptiert `profile='research'`** als optionalen Parameter.
   Wenn gesetzt, sind `justification_category`/`justification_reason` nicht
   required.
2. **Profile-Spawn schlank:** der Subagent laeuft mit dem Profile-spezifischen
   `roleDefinition` (statt Mode-roleDefinition) und einer reduzierten
   Tool-Liste (Profile.allowedTools). Rules, MCP-Listung und Plugin-Skills
   des Parents werden NICHT durchgereicht.
3. **Per-Call-Token-Budget greift** fuer profile- und non-profile-Spawns:
   wenn `Math.ceil(message.length / 4) > settings.subtaskTokenBudget`,
   bekommt das Modell einen `formatError` mit ist/soll und einer
   Aufforderung, die Message zu kuerzen. Default-Budget 8000.
4. **Non-profile-Pfad unveraendert:** ohne `profile`-Parameter gelten die
   heutigen ADR-090-Regeln (Tier-4-Justification, 3 Kategorien) weiter.
5. **Profile-Registry erweiterbar:** mindestens ein Profile (`research`)
   in `src/core/agent/subagent-profiles.ts`. `listSubagentProfileNames`
   gibt die verfuegbaren Namen zurueck.
6. **Live-Messlauf `[AWAITING RE]`:** eine Vault-Session-Frage, die N>3
   read/search-Aufrufe braucht, fuehrt zu einem `new_task(profile='research', ...)`-
   Call; das `[InputBreakdown]`-Log zeigt den Parent-Kontext nach Subtask-
   Abschluss nur um die verdichtete Antwort gewachsen, nicht um die N
   Zwischen-Tool-Results. Funktions-, keine Sicherheitsfrage; nicht
   autonom pruefbar.
