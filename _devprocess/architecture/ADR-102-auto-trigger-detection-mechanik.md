---
id: ADR-102
title: Auto-Trigger-Detection-Mechanik (vault.on-Listener)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-27
---

# ADR-102: Auto-Trigger-Detection-Mechanik (vault.on-Listener)

## Context

Konfigurierbarer Auto-Trigger (FEAT-19-27) startet Triage-Pass automatisch, wenn eine Vault-Note die User-konfigurierte Frontmatter-Property mit dem konfigurierten Wert traegt. Drei Detection-Mechanismen: Vault-Event-Listener, periodisches Polling, Hybrid.

## Decision Drivers

- Latenz (User droppt Note -> Triage startet)
- CPU-Last (Polling vs Event-driven)
- Robustheit gegen Missed-Events
- iCloud-Sync-Faehigkeit

## Considered Options

### Option A: vault.on('create') plus vault.on('modify') Listener

Pros:
- Native Obsidian-API.
- Event-driven, keine CPU-Last bei Idle.
- Trigger sofort nach Create/Modify.

Cons:
- iCloud-Sync triggert vault.on('create') auf Empfaenger-Geraet (ggf doppelter Trigger).
- Race-Condition wenn User schreibt waehrend Listener feuert.

### Option B: Periodisches Polling alle X Minuten

Pros:
- Robust gegen Missed-Events.
- Einfache Implementation.

Cons:
- Latenz hoch.
- CPU-Last bei jedem Poll.

### Option C: Hybrid Listener plus Backup-Poll

Pros:
- Robust.

Cons:
- Komplex.
- Doppel-Trigger-Logik.

## Decision

**Option A**: vault.on('create') plus vault.on('modify') Listener mit Doppel-Trigger-Schutz via `triaged_at`-Tracking.

Begruendung:
- Latenz ist Primaer-Kriterium (User-Erwartung "Note erstellt -> sofort Triage-Karte verfuegbar").
- Doppel-Trigger via iCloud-Sync wird durch Tracking abgefangen: pro Note `triaged_at`-Eintrag in `ingest_triage_log`-Tabelle. Listener prueft vor Trigger ob Eintrag existiert.
- Cooldown: max 1 Trigger pro Note pro Stunde (gegen Schreib-Storm-Szenarien).

## Consequences

### Positive
- Niedrige Latenz.
- Keine Hintergrund-CPU-Last.
- Robust gegen iCloud-Sync-Doppel-Trigger.

### Negative
- Wenn Plugin offline war als Note erstellt wurde, wird sie nicht auto-triggert. Mitigation: Inbox-Workflow (FEAT-19-15) zeigt manuell triagable Notes.

### Risks
- Vault-Event-Spec-Aenderungen in Obsidian-Updates. Mitigation: Listener in Helper kapseln, leicht anpassbar.

## Implementation Notes

Listener-Setup im Plugin onload():
```
plugin.registerEvent(vault.on('create', (file) => maybeAutoTriage(file)))
plugin.registerEvent(vault.on('modify', (file) => maybeAutoTriage(file)))
```

`maybeAutoTriage(file)`:
1. Frontmatter-Property-Match check.
2. SQL-Query auf `ingest_triage_log` ob Eintrag existiert.
3. Cooldown-Check (last trigger > 1h ago).
4. Wenn alle 3 OK: Tool-Call `ingest_triage` ausloesen, Eintrag in `ingest_triage_log` schreiben.

Settings-Schema:
- `vaultIngest.autoTrigger.enabled: boolean`, default false
- `vaultIngest.autoTrigger.propertyName: string`, default leer
- `vaultIngest.autoTrigger.propertyValue: string | string[]`, default leer
- `vaultIngest.autoTrigger.notification: boolean`, default false
