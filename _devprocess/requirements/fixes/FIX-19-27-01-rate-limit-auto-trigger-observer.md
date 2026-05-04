---
id: FIX-19-27-01
feature: FEAT-19-27
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-19-27-01: Rate-Limit fuer AutoTriggerObserver gegen vault.on-Storm

## Symptom

AUDIT-014 hat festgestellt, dass AutoTriggerObserver ohne Drosselung an `vault.on('create'|'modify'|'delete')` haengt. Ein Bulk-Import von 10k Files loest 10k Trigger-Pruefungen aus -- DoS-Vektor gegen den Trigger-Pfad.

## Fix

Sliding-Window Rate-Limit (max N Events pro Sekunde) im AutoTriggerObserver, ueberzaehlige Events werden gebatched verarbeitet.

## Verification

AUDIT-014 Re-Audit gruen. BACKLOG: Status Done.
