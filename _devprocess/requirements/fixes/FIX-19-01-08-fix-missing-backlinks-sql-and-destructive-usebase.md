---
id: FIX-19-01-08
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FIX-19-01-06, FIX-19-01-07]
created: 2026-06-20
---

# FIX-19-01-08, fixMissingBacklinks ignorierte Property-Filter und löschte manuelle Backlinks

## Symptom

Nach FIX-19-01-06 + FIX-19-01-07 zeigte der Live-Lauf:

```
[VaultHealth] fixMissingBacklinks summary: 128 entities iterated, 0 frontmatter
              links written, 0 new bases, 129 skipped (Base existed),
              6 skipped (YAML error)
```

27 Findings vorher, 25 Findings nachher. 7 high blieben 7 high. Der User-Wunsch
"Auto-fix für triviale Backlink-Regeln, ohne pro-row Klick und mit echtem Effekt"
war damit weiter unerfüllt.

## Root Cause

Drei kausale Defekte in `fixMissingBacklinks`:

### 1. SQL-Inkonsistenz gegen `checkMissingBacklinks`

`checkMissingBacklinks` (Detection) hatte:
- `e1.property_name = ?` Filter
- Pre-Filter "Drop targets mit existierender Sibling-Base"
- Pre-Filter "Nur strukturelle Kategorien (Thema, Konzept, Person, Projekt)"

`fixMissingBacklinks` (Repair) hatte: **nichts davon**. Die SQL hat jede
einseitige Frontmatter-Edge aus der `edges`-Tabelle geholt, egal welche
Property, egal welche Kategorie. Resultat: 128 strukturelle Hub-Notes wurden
iteriert, obwohl die Findings nur ~7 echte Targets unter `Notizen` betrafen.

### 2. `useBase`-Branch war destruktiv

Für jeden hub-Note (Thema/Konzept-Kategorie ODER >10 Sources) lief:

```ts
const created = await this.ensureBacklinksBase(file, properties);
// ... entitiesWithExistingBase++ wenn nicht created ...
await this.app.fileManager.processFrontMatter(file, (fm) => {
    const existing = fm[backlinksProperty];
    if (Array.isArray(existing) && existing.length > 0) {
        fm[backlinksProperty] = null;
    }
});
```

Die destruktive Schreibe lief auch wenn die Base bereits existierte (129 mal!).
Der Effekt: die manuell gepflegten Wikilinks im `Notizen`-Property aller 128
Hub-Notes wurden auf `null` gesetzt. Da die SQL nicht nach Property filterte,
traf das auch Property-Namen die der User in anderem Kontext benutzt.

### 3. Folgefehler: Graph-Korruption verursachte Re-Detection

Nach der Massen-Mutation lief `graphExtractor.extractAll()` und sah die
Hub-Notes mit leerem `Notizen`. Die ausgehenden Edges der Hubs verschwanden
aus der `edges`-Tabelle. Beim nächsten `checkMissingBacklinks` zeigte die SQL
NEUE einseitige Edges (jetzt die Sources zu den Hubs, denen die rückwärts
gerichtete Antwort fehlte) als Findings. Die Findings tauchten also wieder
auf, nur in anderer Konstellation.

## Fix

### A. SQL aligned mit checkMissingBacklinks

```sql
SELECT e1.target_path, e1.source_path, e1.property_name
FROM edges e1
WHERE e1.link_type = 'frontmatter'
  AND e1.target_path LIKE '%.md'
  AND e1.source_path LIKE '%.md'
  AND e1.property_name = ?              -- NEU
  AND NOT EXISTS (
      SELECT 1 FROM edges e2
      WHERE e2.source_path = e1.target_path
        AND e2.target_path = e1.source_path
        AND e2.link_type = 'frontmatter'
        AND e2.property_name = ?         -- NEU
  )
ORDER BY e1.target_path
```

Parameter: `[backlinksProperty, backlinksProperty]`. Damit iteriert der
Repair exakt die Edges unter der konfigurierten `backlinksProperty`, sonst
nichts.

### B. Base-Existence + Category Pre-Filter

Nach `missingByTarget` Mapping laufen jetzt die zwei Filter aus
`checkMissingBacklinks`:

1. Drop wenn `${targetDir}/${targetBaseName}-Backlinks.base` existiert.
2. Drop wenn `category` gesetzt und NICHT in `{Thema, Konzept, Person,
   Projekt, Topic, Concept, Project}`.

Damit ist `missingByTarget` nach den Filtern identisch zu der Menge die der
User im Modal sieht.

### C. useBase-Branch ist NON-destruktiv

```ts
if (useBase) {
    const created = await this.ensureBacklinksBase(file, properties);
    if (created) basesCreated++;
    else entitiesWithExistingBase++;
    // KEIN fm[backlinksProperty] = null mehr.
}
```

Die Base ist dynamisch und liest den Graph live. Es gibt keinen Grund die
Frontmatter-Property anzufassen. Manuelle Backlinks des Users bleiben
unberührt.

## Acceptance Criteria

| AC | Description |
|---|---|
| AC-01 | `fixMissingBacklinks` SQL filtert auf `e1.property_name = ?` und `e2.property_name = ?`. |
| AC-02 | `missingByTarget` durchläuft die Sibling-Base- und Category-Filter aus checkMissingBacklinks. |
| AC-03 | Der useBase-Branch enthält keinen `fm[backlinksProperty] = null` Write mehr. |
| AC-04 | Nach Auto-fix sinkt die Findings-Anzahl bei einem Vault mit Sibling-Bases auf den Hubs auf ≤ vorhandene non-base-cases. |
| AC-05 | Bestehende User-Backlinks im Frontmatter werden durch den Repair nicht überschrieben. |
| AC-06 | Test-Suite (2928 Tests) bleibt grün. |

## Out of Scope

- Detection-Bug "Findings erscheinen nach erfolgreichem Fix wieder" für
  Targets OHNE Base (passiert nur wenn `ensureBacklinksBase` keine erzeugt,
  was bei sources.length > MAX_FRONTMATTER_BACKLINKS auf wirklich
  non-strukturellen Targets passieren könnte). Wenn das auftritt: separater
  FIX-19-01-09.

## References

- `src/core/knowledge/VaultHealthService.ts:833-861` (FIX-19-01-08 SQL)
- `src/core/knowledge/VaultHealthService.ts:879-921` (Pre-Filter Mirror)
- `src/core/knowledge/VaultHealthService.ts:891-908` (Non-destructive useBase)
- Diagnose: Live-Log User 2026-06-20 (128 entities, 0 links, 129 skipped Base existed)
