# ADR-67: Lint-Architektur (Tool, UI und Trigger)

**Date:** 2026-04-08
**Deciders:** Sebastian Hanke

## Context

FEAT-19-01 (Vault Health Check) soll bei jedem Vault-Open automatisch strukturelle Inkonsistenzen erkennen und als Badge praesentieren. Der Scan selbst basiert auf DB-Queries (0 Token-Kosten), aber die Architektur muss entscheiden: Braucht der Lint ein dediziertes Tool oder reicht der Skill mit bestehenden Tools? Und wie wird das Badge-UI implementiert?

**Triggering ASRs:**
- ASR-3 (FEAT-19-01): Lint als Feature vs. Tool -- Performance
- ASR-4 (FEAT-19-01): Badge-UI + Event-Listener -- Usability

## Decision Drivers

- **Automatischer Trigger**: Muss bei Vault-Open laufen, nicht nur auf User-Anfrage
- **0 Token-Kosten fuer Scan**: Reine DB-Queries, kein LLM
- **Badge-UI**: User sieht Findings-Anzahl ohne Chat zu oeffnen
- **Toggle**: `enableVaultHealthCheck` in Settings
- **Effizienz**: Ein Tool-Call statt 5 sequenzielle list_files/read_file Calls

## Considered Options

### Option 1: Reiner Skill (kein neues Tool)

Lint als Skill-Anleitung die den Agent instruiert, bestehende Tools zu nutzen (list_files, read_file, semantic_search) um Findings zu sammeln.

- Pro: Keine neue Tool-Implementierung
- Pro: Flexible Checks (LLM kann beliebige Analysen machen)
- Con: Viele sequenzielle Tool-Calls (5-10 pro Lint-Durchlauf)
- Con: Braucht LLM fuer jeden Durchlauf (Token-Kosten auch fuer Scan)
- Con: Kann nicht automatisch bei Vault-Open laufen (Skill braucht User-Trigger)
- Con: Kein Badge moeglich (Skill laeuft nur im Chat)

### Option 2: Dediziertes `vault_health_check` Tool + Badge-Service

Ein neues Tool das alle Lint-Checks als DB-Queries ausfuehrt und Findings zurueckgibt. Dazu ein `VaultHealthService` der bei Vault-Open den Scan ausfuehrt und ein Badge-UI befuellt.

```
VaultHealthService (Hintergrund)
  → DB-Queries bei Vault-Open
  → Findings in Memory halten
  → Badge-UI aktualisieren

vault_health_check Tool (Chat)
  → Gleiche Queries, aber vom Agent aufrufbar
  → Findings als Tool-Result zurueckgeben
  → Agent formuliert Vorschlaege
```

- Pro: Automatischer Trigger bei Vault-Open (kein Chat noetig)
- Pro: 0 Token-Kosten fuer Scan (reine DB-Queries)
- Pro: Ein Tool-Call statt 5+ sequenzielle Calls
- Pro: Badge-UI unabhaengig vom Chat
- Pro: Agent kann Tool auch manuell nutzen (im Chat)
- Con: Neues Tool + neuer Service + UI-Komponente
- Con: Mehr Code zu maintainen

### Option 3: Nur Badge-Service (kein Tool)

Nur der Hintergrund-Service mit Badge. Wenn User auf Badge klickt, oeffnet sich der Chat und der Agent bekommt die Findings als Kontext injiziert.

- Pro: Kein neues Tool noetig
- Pro: Badge funktioniert
- Con: Agent kann Lint nicht selbst triggern (nur auf Badge-Klick)
- Con: Findings muessen als Kontext in den System-Prompt injiziert werden -- unelegant
- Con: Agent hat keine Moeglichkeit, gezielte Lint-Checks bei Ingest auszufuehren

## Decision

**Vorgeschlagene Option:** Option 2 -- `vault_health_check` Tool + Badge-Service

**Begruendung:**

1. **Automatischer Trigger ist ein Kern-Requirement**: Der User will Lint als taegliche Routine bei Vault-Open. Das geht nur mit einem Hintergrund-Service, nicht mit einem Skill.

2. **0 Token-Kosten fuer Scan sind nur mit einem dedizierten Tool moeglich**: Ein Skill muesste den Agent instruieren, was LLM-Tokens kostet. Ein Tool fuehrt DB-Queries direkt aus.

3. **Dual-Use**: Der VaultHealthService laeuft im Hintergrund (Badge), das Tool ist im Chat nutzbar (Agent kann Lint auch waehrend eines Ingest triggern, z.B. "pruefe ob diese Zuordnung konsistent ist").

### Architektur

```
main.ts
  └→ VaultHealthService (registriert bei onLayoutReady)
       ├→ runChecks() -- DB-Queries, alle Checks
       ├→ findings: Finding[] -- in Memory
       ├→ updateBadge() -- UI-Badge aktualisieren
       └→ getFindings() -- fuer Tool und Badge-Klick

vault_health_check Tool
  └→ ruft VaultHealthService.runChecks() auf
  └→ gibt findings als JSON zurueck

Badge-UI
  └→ Sidebar-Header oder Status-Bar
  └→ Klick → Chat oeffnen → Findings als Kontext
```

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Lint-Checks (SQL-Queries)

### Check 1: Verwaiste Notes (Orphans)
```sql
-- Notes die von keiner anderen Note referenziert werden
SELECT DISTINCT v.path FROM vectors v
WHERE v.chunk_index = 0
  AND v.path NOT IN (SELECT target_path FROM edges)
  AND v.path NOT LIKE '%/Templates/%'
  AND v.path NOT LIKE '%Daily Notes%'
```

### Check 2: Fehlende MOC-Eintraege
```sql
-- Notes mit Themen-Property die nicht in der Themen-Note verlinkt sind
SELECT e1.source_path, e1.target_path
FROM edges e1
WHERE e1.link_type = 'frontmatter'
  AND e1.property_name IN ('Themen', 'Konzepte')
  AND NOT EXISTS (
    SELECT 1 FROM edges e2
    WHERE e2.source_path = e1.target_path
      AND e2.target_path = e1.source_path
  )
```

### Check 3: Broken Links
```sql
-- Edges wo das Ziel nicht als Note existiert
SELECT source_path, target_path FROM edges
WHERE target_path NOT IN (SELECT DISTINCT path FROM vectors)
```

### Check 4: Schwache Cluster
```sql
-- ImplicitEdges mit hoher Similarity aber ohne explizite Verbindung
SELECT source_path, target_path, similarity
FROM implicit_edges
WHERE similarity > 0.8
  AND NOT EXISTS (
    SELECT 1 FROM edges
    WHERE (source_path = implicit_edges.source_path AND target_path = implicit_edges.target_path)
       OR (source_path = implicit_edges.target_path AND target_path = implicit_edges.source_path)
  )
ORDER BY similarity DESC
LIMIT 20
```

### Check 5: Inkonsistente Tags
```sql
-- Tags die sich nur in Schreibweise unterscheiden
SELECT t1.tag, t2.tag, COUNT(*) as overlap
FROM tags t1, tags t2
WHERE t1.tag < t2.tag
  AND (LOWER(t1.tag) = LOWER(t2.tag)
       OR t1.tag || 's' = t2.tag
       OR t1.tag = t2.tag || 's')
GROUP BY t1.tag, t2.tag
```

## Consequences

### Positive
- Taeglicher Vault-Check ohne Token-Kosten
- Badge gibt sofortigen Ueberblick
- Agent kann Lint auch proaktiv im Chat nutzen
- Alle Checks sind reine SQL -- schnell und deterministisch

### Negative
- Neues Tool erhoet die Tool-Anzahl (aktuell 43+)
- Badge-UI ist plattformspezifisch (Desktop vs. Mobile)
- VaultHealthService ist ein neuer Lifecycle-Service in main.ts

### Risks
- **False Positives bei Orphan-Check**: Notes in speziellen Ordnern (Templates, Daily Notes) sind absichtlich unverlinkt. Mitigation: Exclude-Patterns konfigurierbar.
- **Badge-Ueberlastung**: Bei vernachlaessigtem Vault koennte das Badge 100+ Findings zeigen. Mitigation: Badge zeigt nur Top-Severity, Details auf Klick.

## Implementation Notes

- `VaultHealthService` in `src/core/knowledge/VaultHealthService.ts`
- `VaultHealthCheckTool` in `src/core/tools/vault/VaultHealthCheckTool.ts`
- Badge-UI: Obsidians `addStatusBarItem()` oder Custom-Element im Sidebar-Header
- Findings-Interface: `{ check: string, severity: string, paths: string[], suggestion: string }`
- Toggle: `enableVaultHealthCheck` in Settings, steuert Service-Registrierung in main.ts

## Related Decisions

- ADR-50: SQLite Knowledge DB (Datenquelle fuer Queries)
- ADR-65: Ontologie-Schema (fuer Cluster-basierte Checks)
- FEAT-15-02: Graph Extraction (edges-Tabelle als Basis)
- FEAT-15-03: Implicit Connections (implicit_edges als Basis)
