---
id: FEAT-23-05
title: update_memory V1-Deprecation + Migrations-Helper
epic: EPIC-23
priority: P0
date: 2026-05-03
related-bas: BA-26
adr-refs: [ADR-107]
plan-refs: []
depends-on: [FEAT-23-01]
---

# FEAT-23-05: update_memory V1-Deprecation + Migrations-Helper

## Description

Das bestehende `update_memory`-MCP-Tool schreibt heute in
V1-Legacy-MD-Files (`memory/user-profile.md` etc.) via
`MemoryService.appendToFile`. Das Tool wird:

1. Auf den v2-Pfad gemappt (intern aufruf von
   `save_to_memory(content, tags=[category], source_interface='unknown')`).
2. In Tool-Description als `[deprecated, use save_to_memory]`
   markiert.
3. Telemetrie-Eintrag bei jeder Nutzung, damit Sebastian sieht,
   wer das Tool noch ruft.
4. Settings-Tab "Memory" bekommt einen "Migrate Legacy MD-Files"-
   Button, der die V1-Files in den FactStore migriert (One-Shot,
   idempotent).

## Benefits Hypothesis

Wenn V1-Aufrufe transparent in v2 landen und V1-Files migriert
werden, dann gibt es keinen toten Memory-Speicher mehr und externe
Clients funktionieren ohne Konfigurationsaenderung weiter.

## User Stories

**US-01** -- Backward-Compat:
- **As** Sebastian
- **I want to** dass meine bestehenden Claude-Desktop-Konfigurationen
  (die `update_memory` rufen) ohne Aenderung weiter funktionieren,
- **so that** ich nicht 4 Konfigurationsdateien anfassen muss.

**US-02** -- Visibility:
- **As** Sebastian
- **I want to** sehen, wie oft `update_memory` noch genutzt wird,
- **so that** ich entscheiden kann, wann das Legacy-Tool entfernt
  werden kann.

**US-03** -- Migrations-Klarheit:
- **As** Sebastian
- **I want to** meine bestehenden V1-MD-Files (user-profile.md
  etc.) per Klick in v2 migrieren,
- **so that** kein Insight verloren bleibt.

## Success Criteria

| ID | Criterion | Measurement | Method |
|----|-----------|-------------|--------|
| SC-01 | update_memory routet 100% auf v2-Pfad, kein appendToFile mehr | Code-Audit | Grep |
| SC-02 | Tool-Description traegt [deprecated]-Marker | MCP-Manifest-Check | Manuell |
| SC-03 | Telemetrie-Counter pro update_memory-Aufruf | Telemetrie-File | Test |
| SC-04 | Settings-Button "Migrate Legacy MD-Files" funktioniert idempotent | UAT | Manuell |
| SC-05 | Migrations-Notice zeigt Anzahl migrierter Items | UI-Sicht | Manuell |

## Technical NFRs

- **Idempotenz**: Migration kann mehrfach ausgefuehrt werden ohne
  Doppel-Schreibung (Hash-basierter Dedup auf (content, fileName)).
- **Backup**: Vor Migration werden V1-Files nach
  `memory-v1-backup/{ISO}/` kopiert (analog zu FEAT-03-16
  Migration-Pattern).
- **No-Schema-Change**: Legacy-Pfad nutzt v2-Schema, kein neues
  Storage.

## ASRs

- **ASR-1 (Moderate)**: V1-MD-Files-Reader fuer Migration nutzt
  bestehenden `MemoryAtomizer` (FEAT-03-16).
- **ASR-2 (Low)**: Telemetrie ueber `MemoryV2Telemetry`-Channel
  `legacy_update_memory_called`.

## Definition of Done

- [ ] update_memory MCP-Tool routet auf save_to_memory
- [ ] [deprecated]-Marker im Tool-Description
- [ ] Telemetrie-Counter aktiv
- [ ] Settings-Button "Migrate Legacy MD-Files"
- [ ] Migrations-Idempotenz-Test
- [ ] V1-MD-Backup vor Migration
- [ ] Tests gruen

## Out of Scope

- Loeschung der V1-MD-Files (User entscheidet manuell nach Verify)
- Auto-Loeschung des Legacy-Tools nach N Tagen
