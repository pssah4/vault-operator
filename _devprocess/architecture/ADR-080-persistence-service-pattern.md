---
id: ADR-080
title: Persistenz-Service-Pattern fuer Memory-v2-Setup-Klassen
status: Accepted (modified by Spike-1 + Code-Review)
phase: Building
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - ADR-077-memory-v2-storage-schema.md
  - ADR-079-knowledge-db-hardening.md
  - FEATURE-0319-living-document-ux.md
  - PLAN-001-memory-v2-master.md
triggers:
  - ASR-031 (Persistenz-Service-Pattern)
  - ASR-027 (Engine-Hosting-Neutralitaet)
  - ASR-030 (Plugin-Worker als gleichwertige Variante)
  - ASR-042 (Cross-Worker-Sync via Service-Pattern)
---

# ADR-080 -- Persistenz-Service-Pattern fuer Memory-v2-Setup-Klassen

## Status

Proposed -- final akzeptiert nach Phase-0-Spike "ATTACH+CTE-Performance".

## Spike-1-Findings (2026-04-26, /coding Phase 0)

**ATTACH DATABASE-Pfad: nicht produktionsreif in sql.js.** `SQL.FS` ist im Public-API nicht exposed. Multi-DB-Mounting wuerde undocumented Closure-Hack benoetigen.

**JS-Layer-BFS-Pfad: getestet mit Sebastians realer 207MB knowledge.db.**

- Cross-DB-JOIN p95: 1.2ms (167x unter dem 200ms-Target)
- 2-Hop-Walk p95: 0.3ms (1666x unter dem 500ms-Target)
- Peak RSS: 686MB (akzeptabel im Electron-Renderer)

**Konsequenz:** ADR-080 bleibt valide, aber Implementation wechselt:

- **Default-Implementation: UnifiedGraphService nutzt JS-Layer-BFS** ueber zwei separate sql.js-Database-Instanzen (memory.db und knowledge.db getrennt). Cross-DB-Queries werden in JavaScript orchestriert: erst memory-Side-Query, dann batch-Lookup auf kb-Side, dann Merge.
- **ATTACH DATABASE: Out-of-Scope** fuer MVP (nicht-existente FS-API in sql.js). Bei spaetereren sql.js-Versionen oder bei Wechsel auf anderen WASM-Wrapper kann ATTACH als Optimierung nachgereicht werden -- aber Performance-Margin ist so gross, dass es nicht noetig ist.
- Implementations-Aufwand reduziert um ~500-1000 LOC (kein Custom-WASM-FS-Mounting noetig).

Detail: `_devprocess/analysis/SPIKE-001-cross-db-performance.md`

## Code-Review-Findings (2026-04-26, /coding Phase 2)

**Existierende Storage-Location-Werte heute:** [KnowledgeDB.ts:151,161](../../src/core/knowledge/KnowledgeDB.ts#L151) hat schon drei Modi `'global' | 'local' | 'obsidian-sync'`. Mapping zu unseren neuen Setup-Klassen:

| Bestehender Modus | Neue Klasse | Bemerkung |
|---|---|---|
| `global` (`{vault-parent}/.obsidian-agent/`, fs.promises) | **Klasse A Single-Device** | Default. Atomic-Write ist heute schon implementiert. |
| `local` (`{vault}/.obsidian-agent/`, vault.adapter) | **Klasse A Single-Device (Variante)** | Im Vault-Verzeichnis aber nicht via Obsidian-Sync repliziert. Alternative zu global. |
| `obsidian-sync` (`{vault}/{pluginDir}/`, vault.adapter) | **Klasse B Vault-Sync** | Wird via Obsidian-Sync repliziert, Multi-Device. |
| (neu) `remote` (RPC zur Service-URL) | **Klasse C Central-Service** | Wird in FEATURE-0319 implementiert. |

**Settings-Migration-Implikation:** Der heutige Wert `storageLocation: 'global'` mappt auf K-A (`persistenceService='local'`, `dbLocation='plugin-local'`). Migration (FEATURE-0323) muss diese Werte beim Plugin-Update transformieren. `local` und `global` werden beide als K-A dargestellt; UI bietet einen vereinfachten Toggle "Plugin-Datenverzeichnis (extern)" vs "Im Vault" (entscheidet zwischen `global`/`local`).

**Wichtige Konsequenz:** MemoryDB ist heute eine Wrapper-Klasse um KnowledgeDB ([src/core/knowledge/MemoryDB.ts:64-70](../../src/core/knowledge/MemoryDB.ts#L64-L70)). Beide nutzen denselben Storage-Layer. Engine-Foundation (FEATURE-0315) muss diese Wrapper-Beziehung erhalten oder durch eigene Engine-Storage-Abstraktion ersetzen.

## Context

Memory v2 muss drei reale Setup-Szenarien abdecken: Single-Device-User (Default), Multi-Device-User mit Obsidian-Sync, Multi-Device-User mit eigenem Always-On-Server. Klassische Worker-vs-DB-Designs mit fest verdrahtetem Zusammenhang scheitern an dieser Bandbreite. Plus: UCM (separates Repo, Q3/Q4 2026) muss dieselbe Engine wiederverwenden, ohne Obsidian-Plugin-Kontext.

Triggernde Anforderungen: ASR-031 ("Persistenz-Service-Pattern"), ASR-027 ("Engine-Hosting-Neutralitaet"), ASR-030 ("Plugin-Worker als gleichwertige UCM-Worker-Variante"), ASR-042 ("Cross-Worker-Sync via Service-Pattern, kein Vector-Clock-Replication").

Konstante: Plugin-MCP laeuft immer fuer Vault-Tools (`semantic_search`, `read_file`, etc.), weil nur das Plugin Vault-Zugriff hat. knowledge.db bleibt Plugin-bedient.

## Decision Drivers

- **DD-1 Engine-Hosting-Neutralitaet:** Engine darf nicht wissen ob sie in Plugin-Renderer oder Standalone-Node-Service laeuft.
- **DD-2 Multi-Writer-Konsistenz:** Bei mehreren Workers (z.B. Plugin auf Notebook + Standalone auf Server) muss klare Schreib-Ordnung garantiert sein, ohne komplexe CRDT-Replikation.
- **DD-3 UCM-Reuse-Garantie:** Setup-Konzept muss UCM-Repo direkt bedienen, ohne Obsidian-Kopplung.
- **DD-4 User-Souveraenitaet ueber Persistenz-Standort:** User entscheidet wo seine Daten liegen.

## Considered Options

### Option 1: Single-Worker-Owner-Modell (verworfen)

Ein Worker schreibt, andere sind read-only Capture-Frontends. Konflikt-Vermeidung intrinsisch via Single-Writer.

- + Pro: Keine Race-Conditions auf DB-Ebene
- + Pro: Einfache Architektur
- - Con: Restriktiv, alle anderen Workers nur Capture-Quality. Sebastian's Anforderung "mehrere gleichwertige Workers" wird verfehlt.

### Option 2: Multi-Master-Replikation mit Vector-Clocks (verworfen)

Jeder Worker hat eigene DB, periodisches Sync, Conflict-Resolution via CRDTs.

- + Pro: Maximale Worker-Autonomie, Offline-faehig
- - Con: Vector-Clock-Komplexitaet erheblich. Konflikt-Resolution wird nicht-trivial. Out-of-Scope fuer MVP.
- - Con: Engine-API-Surface waechst um Sync-Operations.

### Option 3: Persistenz-Service-Pattern (Empfohlen)

Workers (Plugin oder Standalone) sind gleichwertig, schreiben aber via RPC zu einem **Persistenz-Service** (logische Rolle). Service serialisiert alle Writes intern. Pro Setup genau ein Service-Standort, alle Workers koordinieren ueber ihn.

- + Pro: DD-1 erfuellt -- Engine ist hosting-neutral, jede Instanz kann Service-Rolle uebernehmen
- + Pro: DD-2 erfuellt -- Service serialisiert intern via Async-Queue oder synchroner Lock
- + Pro: DD-3 erfuellt -- UCM importiert dieselbe Engine, registriert seine Worker-Rolle
- + Pro: DD-4 erfuellt -- drei Setup-Klassen (siehe unten) decken Single-Device, Multi-Device-Vault, Central-Server
- + Pro: Cross-Worker-Sync intrinsisch via Service, keine separate Replikation noetig
- - Con: Service ist Single-Point-of-Failure -- wenn Service-Geraet down, koennen Workers nicht schreiben
- - Con: Latenz-Aufschlag fuer Remote-Workers (~20-50ms LAN-RTT)
- - Con: Setup-Klassen-Komplexitaet in Settings + Validation-Logic

## Decision

**Persistenz-Service-Pattern (Option 3).**

Drei Setup-Klassen werden offiziell unterstuetzt. Settings haben drei Felder:

- `persistenceService`: `'local'` (dieses Plugin hostet) | `'remote'` (anderer Worker hostet)
- `persistenceServiceUrl`: URL + Bearer-Token wenn `'remote'`
- `dbLocation`: `'plugin-local'` | `'vault-resident'` (nur sichtbar wenn `local`)

Erlaubte Kombinationen:

| Klasse | persistenceService | dbLocation | Anwendung |
|---|---|---|---|
| **A. Single-Device** | local | plugin-local | Default, Single-User |
| **B. Vault-Sync** | local | vault-resident | Multi-Device ohne Server, Obsidian-Sync repliziert |
| **C. Central-Service** | remote | (n/a) | Multi-Device + dedizierter Always-On-Service |

Andere Kombinationen werden in Settings-UI als Validation-Error abgelehnt.

knowledge.db ist orthogonal zur Setup-Klasse: bleibt immer Plugin-bedient (siehe ADR-078, KnowledgeGraphAdapter zweistufig).

## Consequences

**Positiv:**

- Engine-Hosting-Neutralitaet erfuellt fuer UCM-Reuse
- Setup-Wechsel zwischen Klassen ist konfigurierbar (FEATURE-0319 MigrationService)
- Multi-Writer ohne CRDT-Komplexitaet
- Klar dokumentierte Validation-Logik in Settings

**Negativ:**

- Klasse C macht Service-Verfuegbarkeit zur Vorbedingung. Bei Service-Down koennen Workers nicht schreiben.
- Settings-UI braucht mehr Logic als plain dbLocation-Default
- Bei Klasse B (Vault-Sync) bleibt Single-Writer-Lock per PID noetig (siehe ADR-079), weil kein zentraler Service serialisiert

**Risks:**

- **R-1:** ATTACH+CTE-Performance auf Sebastian's realer DB-Groesse unbekannt. **Mitigation:** Phase-0-Spike (ASR-016). Falls Performance kippt, Fallback auf JS-BFS.
- **R-2:** Service-RPC-Multi-Client-Auth ist ein Angriffsvektor. **Mitigation:** Bearer-Token + HTTPS (siehe ADR-081).
- **R-3:** UCM-spezifische Worker-Use-Cases (z.B. mobile Capture via OpenClaw) noch nicht final spezifiziert. **Mitigation:** Engine-API ist multi-client-tauglich von Anfang an, konkrete UCM-Worker-Implementierungen kommen post-MVP.

## Alternatives Considered (zusammengefasst)

- Single-Worker-Owner-Modell verworfen, weil zu restriktiv
- Multi-Master-CRDT-Replikation verworfen, weil zu komplex fuer MVP

## Implementation-Bezug

- FEATURE-0319 (Living Document UX) implementiert die Settings + MCP-Tool-Routing
- FEATURE-0321 (Engine-Extract) frozen die Engine-API als Public-Vertrag
- ADR-079 (Knowledge-DB-Haertung) implementiert Multi-File-Atomic-Commit fuer 1-4 koordiniert geschriebene Files
- ADR-081 (MCP-Tool-Routing + RPC-Auth) konkretisiert die Plugin-Standalone-RPC

## Open Questions

- Service-RPC-Protokoll-Detail (HTTP/JSON-RPC vs MCP-Tunneling): siehe ADR-081
- Service-Failover-Strategie bei Service-Geraet-Crash: post-MVP
- Setup-Wechsel-Migration zwischen K-A/K-B/K-C: FEATURE-0319 MigrationService
