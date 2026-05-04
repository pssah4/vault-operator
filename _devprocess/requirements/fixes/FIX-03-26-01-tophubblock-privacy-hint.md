---
id: FIX-03-26-01
feature: FEAT-03-26
epic: EPIC-03
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-03-26-01: Settings-UI-Hinweis fuer Top-Hub-Block Privacy-Trade-Off

## Symptom

AUDIT-014 hat moniert, dass der Top-Hub-Block-Toggle ohne Privacy-Hinweis aktivierbar ist. User wissen nicht, dass die obersten Hubs als persistenter Markdown-Block in den Vault geschrieben werden und damit ueber Cloud-Sync sichtbar werden.

## Fix

In VaultTab vor dem Toggle einen Hinweis-Block plus eine Privacy-Acknowledgement-Checkbox; Toggle ist erst nach Acknowledgement aktivierbar.

## Verification

AUDIT-014 Re-Audit gruen. BACKLOG: Status Done.
