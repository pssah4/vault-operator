---
id: FIX-03-25-01
feature: FEAT-03-25
epic: EPIC-03
adr-refs: [ADR-109]
plan-refs: []
depends-on: []
created: 2026-05-03
---

# FIX-03-25-01: FEAT-03-25 falsch auf Done -- VaultMemorySourceService fehlt komplett

## Symptom

FEAT-03-25 "Vault-Note-zu-Fact-Extraction" stand im Backlog auf
`Done/Released`. Audit (REFLECTION-2026-05-03) zeigte:

- `memory_source_notes`-Tabelle existiert in
  [src/core/knowledge/MemoryDB.ts](../../../src/core/knowledge/MemoryDB.ts)
  (Schema v2, Zeile 119).
- Sonst ist **nichts** implementiert: kein VaultMemorySourceService,
  kein vault.on-Hook, keine Agent-Tools `mark_note_as_memory_source`
  / `unmark_note` / `list_memory_source_notes`, keine Settings,
  kein Frontmatter-Marker-Erkenner.
- Alle Success Criteria SC-01..SC-06 missing.

## Was bekannt ist

- BA-25 hat einen voll funktionierenden `FrontmatterIndexer` mit
  vault.on-Listener fuer Frontmatter-Properties.
- Doppel-Listener-Risk + LLM-Cost-Doppelung wenn FEAT-03-25 eigenen
  Service bekommt.
- ADR-109 (im aktuellen RE-Pass entstehend) loest die Bruecke
  architektonisch ueber **eine** Vault-Watch-Pipeline mit drei Sinks.

## Fix

Korrektur in zwei Schritten:

1. **Sofort**: Backlog-Status auf `Active/Building` (im aktuellen
   RE-Pass geschehen). Spec-Update FEAT-03-25 fuer das
   Single-Listener-Pattern (siehe Track 2 RE).
2. **Implementierung** als separate Coding-Session
   (`feature/feat-03-25-vault-memory-bridge`-Branch): nach ADR-109,
   Erweiterung BA-25 FrontmatterIndexer + drei kleine BaseTools.

## Regressions-Test

- BA-25 FrontmatterIndexer-Tests bleiben gruen.
- Neuer Test: bei `memory-source: true` wird Note an
  SingleCallProcessor uebergeben.
- Cascade-Delete-Test: Note geloescht -> verknuepfte Facts
  deprecated_at gesetzt.

## Definition of Done

- Backlog korrigiert.
- ADR-109 final.
- VaultMemorySourceService **NICHT** als eigener Service, sondern
  als Indexer-Erweiterung implementiert.
- Drei Vault-Tools registriert + getestet.
- FIX-Row auf Done sobald SC-01..SC-04 geliefert; SC-05 (Dirty-Limit)
  + SC-06 als IMP-Followup wenn Live-Use es zeigt.
