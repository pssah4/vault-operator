---
id: FEAT-28-02
title: spawn-Allowlist for child_process binaries
epic: EPIC-28
priority: P0
date: 2026-05-16
related: AUDIT-027
adr-refs: []
plan-refs: []
depends-on: []
---

# FEAT-28-02: spawn-Allowlist for child_process binaries

## Description

Das Plugin verwendet `child_process.spawn` und `spawnSync` an heute 7 Stellen: ProcessSandboxExecutor (Node-Sandbox-Worker), McpBridge (Cloudflare-Tunnel), McpTab (Node-Path-Discovery, MCP-Config-Validation), libreOfficeDetector (LibreOffice-Discovery), pptxRenderer (LibreOffice-Konvertierung), ExecuteRecipeTool (built-in Recipes mit `which` plus binary). Die Audit-Analyse vom 2026-05-16 hat bestaetigt, dass alle Aufrufer feste Binary-Namen oder whitelist-aufgeloeste Pfade benutzen (kein LLM-Pfad zu spawn). Aber wie bei FEAT-28-01 fehlt eine einzige verifizierbare Stelle.

FEAT-28-02 fuehrt `src/core/security/spawnAllowlist.ts` mit einer harten Binary-Liste ein:

```typescript
const ALLOWED_BINARIES = {
    'node': { reason: 'Sandbox worker process (ProcessSandboxExecutor)' },
    'which': { reason: 'Binary discovery (Unix)' },
    'where': { reason: 'Binary discovery (Windows)' },
    'git': { reason: 'Shadow git for vault checkpoints (GitCheckpointService)' },
    'soffice': { reason: 'LibreOffice headless conversion (pptxRenderer)' },
    'libreoffice': { reason: 'LibreOffice headless conversion alias' },
    'cloudflared': { reason: 'Remote MCP tunnel (McpBridge.startTunnel)' },
} as const;
```

Plus die Whitelist der vollstaendigen Pfade fuer dieselben Binaries (`/usr/local/bin/node`, `/opt/homebrew/bin/git`, ...) wie sie in den Discovery-Funktionen heute schon hardcoded sind.

Der Wrapper:
- `spawnAllowed(command, args, options)` -- pruefe `path.basename(command)` gegen die Liste
- `spawnAllowedSync(command, args, options)` -- selbe Logik fuer sync
- wirft `SpawnNotAllowed` wenn `path.basename(command)` nicht in der Liste ist
- erzwingt `shell: false` in den options, ueberschreibt user-supplied `shell: true` mit Warning + Throw
- verbietet `command` mit Shell-Metacharakteren (`;`, `&`, `|`, `>`, `<`, `\``, `$()`) auch nach der basename-Pruefung

Alle 7 Stellen werden migriert. Die `cp.spawn(...)`-Aufrufe gehen durch `spawnAllowed(...)`. Wo dynamische Binary-Pfade aufgeloest werden (LibreOffice, Node), wird der Path-Resolver in den Wrapper integriert oder vor `spawnAllowed` aufgerufen und das Ergebnis durch den Wrapper geschickt.

Recipes (ExecuteRecipeTool) sind ein Sonderfall: built-in Recipes haben ihre Binary-Namen in einer eigenen festen Liste (`BUILT_IN_RECIPES`), die wird gegen die Allowlist gegengeprueft. Custom Recipes sind heute deaktiviert (auch bei diesem Refactor); falls sie in Zukunft aktiviert werden, geht ihr `binary`-Feld durch dieselbe Pruefung.

## Benefits Hypothesis

Maintainer kann an einer Stelle sehen, welche Binaries das Plugin spawnen kann. Ein versehentlicher neuer `spawn` mit einem nicht-allowlisted Binary wirft. Code-Reviewer sehen unmittelbar, wenn ein PR eine neue Binary einfuehrt (Diff in `spawnAllowlist.ts`).

## User Stories

- **US-28-02-01 (P0 Maintainer):** Als Obsidian-Community-Reviewer moechte ich an einer Stelle sehen, welche Binaries das Plugin starten darf, damit ich nicht 7 Call-Sites einzeln pruefen muss.
- **US-28-02-02 (P0 Plugin-Author):** Als Plugin-Author moechte ich, dass ein neuer spawn-Aufruf mit einem nicht-allowlisted Binary sofort wirft, damit ich keine Process-Injection-Bugs introduziere.
- **US-28-02-03 (P1 Power-User):** Als Power-User moechte ich sicher sein, dass das Plugin keine beliebigen Shell-Befehle ausfuehrt.

## Success Criteria

1. Jeder direkte `cp.spawn(...)`, `cp.spawnSync(...)`, `cp.exec(...)`, `cp.execSync(...)` im Bundle (ausserhalb von `spawnAllowlist.ts` und Tests) ist entfernt.
2. `spawnAllowed('node', [...])` funktioniert; `spawnAllowed('/usr/local/bin/node', [...])` funktioniert; `spawnAllowed('rm', ['-rf', '/'])` wirft `SpawnNotAllowed`.
3. `shell: true` wird vom Wrapper ueberschrieben oder geworfen.
4. Shell-Metacharakter im `command` (`bash -c "..."` als command) wirft.
5. `cp.exec` und `cp.execSync` sind komplett entfernt (kein shell-string-Interface mehr).
6. Bestehende Funktionalitaet (Sandbox-Worker, MCP-Tunnel, MCP-Config-Validation, LibreOffice-Konvertierung, shadow-git) ist nach der Migration vollstaendig funktional.
7. Test-Coverage fuer `spawnAllowlist.ts` mindestens 95%.

## Technical NFRs

- **Single-Source-of-Truth:** alle child_process-Spawns gehen ueber den Wrapper.
- **No-Shell:** der Wrapper erzwingt `shell: false`. `exec`/`execSync` werden nicht mehr verwendet.
- **Path-Resolution:** wenn ein full path uebergeben wird, geht nur `path.basename()` in die Pruefung.
- **Recipe-Integration:** built-in Recipes pruefen ihr `binary`-Feld gegen die Allowlist beim Plugin-Init, nicht erst bei der Ausfuehrung.

## ASRs

- **ASR-01:** Allowlist-Pruefung ist immutable nach Modul-Load. Kein User-Setting kann sie erweitern.
- **ASR-02:** Der Wrapper exportiert `spawn` und `spawnSync`. Keine `exec`/`execSync` (auch nicht intern).
- **ASR-03:** Argumente werden NICHT gepruefte (nur das command). Die Aufrufer sind selbst fuer args-Validierung verantwortlich (Whitelist, Schema, etc.). Der Wrapper sichert nur die Process-Boundary.

## Definition of Done

- [ ] `src/core/security/spawnAllowlist.ts` mit `ALLOWED_BINARIES`-Konstante und Wrapper-Funktionen
- [ ] `SpawnNotAllowed` Error-Klasse mit `attemptedBinary` und `allowedBinaries` Properties
- [ ] Alle 7 bestehenden spawn-Call-Sites migriert
- [ ] `cp.exec` und `cp.execSync` komplett entfernt
- [ ] grep-pre-push-Check oder ESLint-Regel gegen direkte `cp.spawn`-Imports ausserhalb des Wrappers
- [ ] Tests: Allowlist-Treffer (positiv), nicht-allowlisted Binary (negativ), Shell-Metacharakter (negativ), `shell: true` Override (negativ), Full-Path-Aufloesung (positiv)
- [ ] Live-Smoke-Test: Sandbox spawn, MCP-Tunnel, LibreOffice-Detection
- [ ] SECURITY.md Eintrag fuer spawn-Allowlist (kommt aus FEAT-28-03)

## Out-of-Scope

- Argument-Validierung im Wrapper (Aufrufer-Verantwortung)
- User-konfigurierbare Allowlist
- Binary-Signature-Verifikation (kein Code-Signing-Check)
- Sandbox-Worker-Args-Hardening (separates Item, EPIC-28 Welle 3)
