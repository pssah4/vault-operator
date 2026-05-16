---
id: FIX-28-00-01
feature:
epic: EPIC-28
adr-refs: []
plan-refs: []
audit-refs: [AUDIT-027]
depends-on: []
created: 2026-05-16
---

# FIX-28-00-01: execSync mit Template-Literal -> spawnSync mit shell:false

## Symptom

Zwei Call-Sites verwendeten `cp.execSync(`${which} <binary>`)` mit Template-Literal:

- `src/core/sandbox/ProcessSandboxExecutor.ts:307` (Node-Binary-Discovery)
- `src/mcp/McpBridge.ts:468` (Cloudflared-Verfuegbarkeit-Probe)

`execSync` mit Shell-String ist die schlechteste verfuegbare Form: der Shell
interpretiert die Eingabe. Beide Stellen sind heute nicht exploitierbar
(`which` ist plattform-konstant `'which'` oder `'where'`), aber das
Pattern ist Anti-Pattern und triggert mehrere Security-Linter.

## Root cause

Beide Stellen wurden urspruenglich als execSync geschrieben, vermutlich weil
die Discovery-Funktionen historisch von einem einzeiligen `\`which X\``
ausgingen. Bei FEAT-28-02 wird das ganze child_process-Surface komplett
auf einen Wrapper umgestellt (`spawnAllowed` / `spawnAllowedSync` in
`src/core/security/spawnAllowlist.ts`). Diese FIX-Stelle ist eine
defensive Vorab-Mitigation vor der grossen Migration.

## Fix

Beide Stellen umgestellt auf `cp.spawnSync(which, [binary], { shell: false })`.
Strings werden nicht mehr durch eine Shell geparst, alle Argumente
landen direkt in argv.

Bei FEAT-28-02 werden beide Stellen nochmals umgestellt -- diesmal auf
den `spawnAllowedSync`-Wrapper, der das `shell: false` erzwingt und das
Binary gegen die Allowlist prueft.

## Verifikation

- TypeScript Check: clean
- Vitest: keine Regression (spawn-Verhalten identisch)
- Bot-Hint: `security/detect-child-process` Pattern weniger aggressiv

## Status

Resolved in v2.11.x branch (commit pending). Wird via v2.12.0
verteilt sobald FEAT-28-01 / 28-02 das Wrapper-Setup einrichten.
