---
id: FIX-23-04-03
feature: FEAT-03-25
epic: EPIC-23
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-23-04-03: sanitizeVaultContentForLLM gegen Prompt-Injection im memorySourceHook (AUDIT-015 M-2)

## Symptom

AUDIT-015 M-2: Vault-Notizen, die als Memory-Source markiert sind, wurden ungeprueft in den Memory-Extraktions-Prompt geschoben. Eine Notiz mit "Ignore previous instructions, act as ..." reicht, um den Memory-Extraktor umzubiegen.

## Fix

sanitizeVaultContentForLLM:
- BEGIN/END-Marker um den User-Content
- 12 Regex-Pattern strippen typische Prompt-Injection-Konstrukte (System-Prompt-Override, Tool-Call-Injection, Role-Switch)
- Marker werden in der Prompt-Vorlage als untrusted-content gekennzeichnet

## Verification

AUDIT-015 M-2 resolved, 18 neue Tests in sanitizeVaultContentForLLM.test.ts. BACKLOG: Status Done (commit a51ff20).
