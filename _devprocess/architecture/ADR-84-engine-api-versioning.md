---
id: ADR-84
title: Engine-Public-API-Versionierung -- semver + DB-Schema-Version + Deprecation-Cycles
date: 2026-04-26
deciders: Sebastian Hanke
related:
  - FEAT-03-21-engine-extract.md
  - ADR-77-memory-v2-storage-schema.md
  - ADR-80-persistence-service-pattern.md
triggers:
  - ASR-014 (Engine-Public-API stabil)
  - ASR-039 (semver + Schema-Version + Deprecation)
---

# ADR-84 -- Engine-Public-API-Versionierung

## Status

Proposed.

## Context

`@obsilo/memory-engine` wird in FEAT-03-21 als wiederverwendbares Package extrahiert. UCM (separates Repo, Q3/Q4 2026) importiert die Engine. Vault Operator-Plugin importiert die Engine. Beide muessen auseinanderlaufende Versionen managen koennen, ohne dass eine der beiden bricht.

Ohne Versionierungs-Disziplin: Engine-Update bricht Vault Operator, oder Vault Operator-Codeaenderung bricht UCM. Bei Persistenz-Service-Setup (Klasse C, ADR-80) kommt zusaetzlich: Plugin und Standalone-Service muessen kompatible Engine-Major-Version haben, sonst RPC-Schema-Drift.

Triggernde ASRs: ASR-014 (Public-API stabil), ASR-039 (semver-Disziplin).

## Decision Drivers

- **DD-1 Konsumenten-Sicherheit:** Vault Operator und UCM koennen unterschiedliche Engine-Versionen pinnen
- **DD-2 Schema-Migration sauber:** DB-Schema-Aenderungen erfordern explizite Major-Bumps
- **DD-3 Deprecation-Pfad:** API-Symbole koennen entfernt werden, aber nicht ohne Vorwarnung
- **DD-4 RPC-Kompatibilitaet:** Plugin und Service in Klasse C muessen Schema-kompatibel sein

## Considered Options

### Option 1: Strict semver mit DB-Schema-Version + Deprecation-Cycles (Empfohlen)

Engine-Package folgt strict semver. DB-Schema hat eigene `user_version`-Pragma. API-Aenderungen mit @deprecated-Marker fuer 1 Minor-Release vor Removal.

- + Pro: DD-1, DD-2, DD-3 erfuellt
- + Pro: Klar dokumentierte Disziplin
- - Con: Aufwand pro Update -- Major-Bump bei jeder Schema-Aenderung kann sich schnell anhaeufen

### Option 2: Engine als internes Package mit Sebastian-controlled Updates (verworfen)

Sebastian entscheidet pro Update, ob breaking. Keine semver-Disziplin.

- + Pro: Einfacher
- - Con: UCM-Konsumenten-Sicherheit nicht garantiert (DD-1)
- - Con: Bei Multi-User-Open-Source-Adoption nicht skalierbar

### Option 3: Compat-Layer mit hard-coded Migrationspfaden (verworfen)

Engine v2 unterstuetzt v1-Schema via On-Open-Migration. Keine Konsumenten-Breaking-Changes je.

- + Pro: Maximale Konsumenten-Sicherheit
- - Con: Code-Bloat -- N Versionen exponentielles Test-Volumen
- - Con: Verstoesst gegen DD-3 (kein Deprecation-Pfad, sondern Forever-Compat)

## Decision

**Option 1 -- Strict semver + DB-Schema-Version + Deprecation-Cycles.**

**semver-Disziplin:**

- **MAJOR.MINOR.PATCH** im Package
- **PATCH:** Bug-Fixes, keine API-Aenderung, keine Schema-Aenderung
- **MINOR:** Neue Public-API-Symbole, neue optionale Schema-Spalten (additive Migration), kein Breaking
- **MAJOR:** API-Symbol entfernt/umbenannt, Schema-Format-Aenderung (z.B. Tabelle umstrukturiert), RPC-Schema-Aenderung

**DB-Schema-Version:**

- `PRAGMA user_version` pro DB (memory.db, history.db)
- Schema-Version-Bump = MAJOR-Bump im Package
- Engine prueft beim Open: Schema-Version kompatibel? Wenn nein: Migration-Pflicht oder Error
- Forward-Migration nur innerhalb der gleichen MAJOR-Version automatisch. Major-Wechsel erfordert User-Confirmation (Migration-Wizard, FEAT-03-19)

**Deprecation-Cycles:**

- API-Symbol `@deprecated` markiert fuer 1 Minor-Release
- Removal erst im naechsten MAJOR
- Beispiel: `factStore.queryByImportance` deprecated in v1.5, removed in v2.0
- Konsumenten haben in MINOR-Range Zeit zu migrieren
- TypeScript JSDoc + ESLint-Regel zeigen Warnings bei Nutzung deprecated APIs

**RPC-Schema-Versioning (Persistenz-Service-Pattern, ADR-80):**

- RPC-Header traegt `engine-version: <major>.<minor>`
- Service prueft: kompatible MAJOR? Wenn nein -> Error
- Plugin-Standalone-Mismatch: User wird informiert, Migration-Pfad: beide auf gleiche Engine-Version updaten
- Innerhalb einer MAJOR-Version: MINOR-Mismatch ist tolerable, additive Felder werden ignoriert

**Konsumenten-Pin-Strategie:**

- Vault Operator-Plugin pinnt Engine-Major (z.B. `"@obsilo/memory-engine": "^1.0.0"`)
- UCM-Repo pinnt eigene Engine-Major
- Beide koennen unterschiedliche MAJOR haben, aber dann nicht im Persistenz-Service-Setup gemischt

## Consequences

**Positiv:**

- Klare Disziplin, Konsumenten wissen was sie erwarten koennen
- Schema-Migrations sind explizite Major-Bumps, nicht versteckt
- RPC-Kompatibilitaet abgedeckt durch Engine-Version-Header

**Negativ:**

- Disziplin-Aufwand: jede Aenderung muss kategorisiert werden
- Bei aktiver Entwicklung viele MAJOR-Bumps -- konfusion fuer Konsumenten
- Deprecation-Cycle hat Code-Bloat-Phase (alte und neue API koexistieren)

**Risks:**

- **R-1:** Sebastian-Solo-Maintenance -- semver-Disziplin braucht Reviewer-Disziplin. **Mitigation:** Pre-Release-Checklist + Eval-Test-Set + ggf. ChangeLog-Auto-Generation.
- **R-2:** Engine-MAJOR-Bumps stapeln sich, wenn Schema oft aendert. **Mitigation:** Schema-Aenderungen poolen pro Quartal, nicht pro Feature.
- **R-3:** RPC-Header-Mismatch erzwingt Up-/Downgrade vor Memory-Operations. **Mitigation:** Plugin und Service teilen Lockstep-Update-Strategie.

## Implementation-Bezug

- FEAT-03-21 frozen Public-API + dokumentiert semver-Vertrag
- ADR-80 Persistenz-Service nutzt Engine-Version-Header in RPC
- Eval-Test-Set (FEAT-03-18) wird Pre-Release-Quality-Gate, deckt API-Stabilitaet mit ab

## Open Questions

- LTS-Strategie post-v1.0: 1 Major aktiv supportet, oder 2? Default 1 fuer Sebastian-Solo, 2 wenn Open-Source-Adoption.
- Schema-Migration-Tooling: pure-SQL-Migrations vs CodemoD-Style. Default SQL.
- ChangeLog-Format: keep-a-changelog.com oder custom. Default keep-a-changelog.
