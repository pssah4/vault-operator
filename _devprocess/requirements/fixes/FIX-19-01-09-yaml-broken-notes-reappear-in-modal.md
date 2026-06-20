---
id: FIX-19-01-09
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FIX-19-01-06, FIX-19-01-08]
created: 2026-06-21
---

# FIX-19-01-09, YAML-broken Notes erscheinen bei jedem Auto-fix-Klick neu im Modal

## Symptom

Nach Deployment von FIX-19-01-08 lief der User zwei Apply-Auto-fix-Klicks
hintereinander. Run 1 zeigte korrekt "13 entities: 21 backlinks, 1 base
created" plus eine Liste von 5 YAML-broken Notes. Run 2 zeigte die **gleichen
5 YAML-Notes wieder**, obwohl Run 1 sie schon in `dismissed_health_findings`
eingetragen hatte. Findings sanken zwar messbar (25 -> 22 -> 19), aber der
User las das Persistieren der gleichen Modal-Liste als "es funktioniert nicht".

Zusaetzlich tauchten im Log Failed-to-fix-Warnungen fuer 2 weitere Notes auf
(Differenzierung..., Udemy Agent Course...), die im Modal NICHT als YAML
gelistet wurden, also auch nicht auto-dismissed wurden. Diese 2 hingen in
jedem zukuenftigen Run im Repair-Loop fest.

## Root Cause

Zwei konvergierende Defekte:

### 1. `fixMissingBacklinks` SQL filtert dismissed_health_findings nicht

`checkMissingBacklinks` filtert dismissed Findings im Post-Checks-Loop bei
Zeile 141-156 (runChecks) -- deshalb sind die 5 YAML-Notes korrekt aus der
Findings-Liste raus (high sinkt 7 -> 1). Aber die SELECT-Query in
`fixMissingBacklinks` greift direkt auf die `edges`-Tabelle zu ohne
dismissed-Filter. Daher findet sie die 5 jedes Mal aufs Neue.

Konsequenz: processFrontMatter wird erneut aufgerufen, wirft YAMLParseError,
catch-Block pusht in `yamlErrorPaths`, Result-Screen rendert "X notes have
broken YAML and were skipped" mit derselben Liste. Da nur die `findings`
gefiltert sind, nicht die Repair-Iteration, persistiert die Modal-Liste.

### 2. YAML-Predicate hat Case-sensitive Substring-Match

Die alte Detection:
```ts
msg.includes('YAMLParseError') || msg.includes('YAML') ||
msg.includes('Map keys') || msg.includes('seq-item-ind')
```

Beobachtete YAMLParseError-Messages der 2 betroffenen Notes:
> "Implicit map keys need to be followed by map values at line 5, column 21:"

JavaScript `String.includes` ist case-sensitive: `'Implicit map keys'.includes('Map keys')`
ist `false` (kleines `m` in der Message vs grosses `M` im Pattern). Plus die
Message enthaelt weder "YAMLParseError" noch "seq-item-ind". Konsequenz: zwei
Notes wurden als generischer Failed-to-fix verbucht, nie auto-dismissed,
liefen bei jedem Run wieder in den Repair.

## Fix

### A. SQL-Filter in `fixMissingBacklinks`

Neue NOT EXISTS-Klausel:

```sql
AND NOT EXISTS (
    SELECT 1 FROM dismissed_health_findings d
    WHERE d.check_type = 'missing_backlinks'
      AND d.path = e1.target_path
)
```

Damit iteriert der Repair nur noch nicht-dismissed Targets. Die 5 YAML-
Notes aus Run 1 erscheinen ab Run 2 nicht mehr.

### B. Robuste YAML-Detection

Constructor-Name als kanonischer Check plus lowercased Substring-Fallbacks:

```ts
const errName = (e as { constructor?: { name?: string } })?.constructor?.name ?? '';
const msg = e instanceof Error ? e.message : String(e);
const lower = msg.toLowerCase();
const isYamlError = errName === 'YAMLParseError'
    || errName === 'YAMLWarning'
    || lower.includes('yaml')
    || lower.includes('map keys')         // Implicit map keys, Map keys must be unique
    || lower.includes('map values')       // needs to be followed by map values
    || lower.includes('seq-item-ind')
    || lower.includes('flow-map-end')
    || lower.includes('unexpected scalar')
    || lower.includes('block scalar');
```

Damit fangen wir alle 7 beobachteten Messages plus zukunftige Varianten der
gleichen YAML-Library (`yaml` 2.x in Obsidian).

### C. `yamlErrorPathsForModal`: nur NEU dismissed Pfade zurueck

Vor dem Auto-Dismiss-Loop wird die `dismissed_health_findings`-Tabelle gelesen
und ein `alreadyDismissed`-Set gebaut. Nur Pfade die **nicht** schon dort
stehen werden ins Modal zurueckgegeben. Pre-existing Dismissals bleiben
silent. Das Modal zeigt die Liste nur beim allerersten Auftreten, nicht bei
jedem Re-Klick.

Im Repair-Loop wird wie bisher ein INSERT OR REPLACE auf alle 7 gemacht
(idempotent), aber das Return-Array ist auf neue Eintraege gefiltert.

## Acceptance Criteria

| AC | Description |
|---|---|
| AC-01 | `fixMissingBacklinks` SQL enthaelt `NOT EXISTS dismissed_health_findings` Klausel. |
| AC-02 | YAML-Predicate matcht `constructor.name === 'YAMLParseError'` sowie lowercased Substrings inkl. "map keys", "map values", "seq-item-ind". |
| AC-03 | Beim ersten Apply-Klick auf einem Vault mit YAML-broken Notes: alle YAML-Pfade werden auto-dismissed UND im Modal angezeigt. |
| AC-04 | Beim zweiten Apply-Klick (selbe Session) erscheinen die gleichen YAML-Pfade NICHT mehr im Modal. |
| AC-05 | Die "Implicit map keys"-Notes (Differenzierung, Udemy) werden ab Run 1 als YAML erkannt und dismissed (nicht laenger als generischer Failed-to-fix verbucht). |
| AC-06 | Test-Suite (2928 Tests) bleibt gruen. |

## Out of Scope

- **Restore-on-YAML-fix**: Wenn der User die YAML manuell repariert, bleibt
  der Target in `dismissed_health_findings`. Ein automatischer Restore-
  Mechanismus (z.B. periodischer Re-Check ob die Note noch YAML-Error
  wirft) ist Out of Scope. Workaround: User kann ueber den Dismissal-
  Management-UI manuell restoren, sobald das implementiert ist.
- **TTL auf Auto-Dismissals**: Aehnlich Out of Scope; FIX-19-01-10 bei
  Bedarf.

## References

- `src/core/knowledge/VaultHealthService.ts:833-879` (FIX-19-01-09 SQL mit
  dismissed-Filter)
- `src/core/knowledge/VaultHealthService.ts:1021-1055` (Robuste YAML-Detection)
- `src/core/knowledge/VaultHealthService.ts:1057-1096` (yamlErrorPathsForModal Filter)
- Diagnose-Anchor: Workflow `wf_a7a549b7-854` (adversariale Verifikation)
- Live-Log User 2026-06-21 (Run 1 + Run 2 Diagrammnachweis)
