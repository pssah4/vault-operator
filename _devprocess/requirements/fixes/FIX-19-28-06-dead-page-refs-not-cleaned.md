---
id: FIX-19-28-06
feature: FEAT-19-28
epic: EPIC-19
adr-refs: [ADR-103]
plan-refs: []
depends-on: []
created: 2026-05-10
---

# FIX-19-28-06: Tote Page-Refs werden nicht erkannt und bleiben in der Note

**Prioritaet:** P1 (Provenance-Versprechen wird in Praxis gebrochen)
**Feature-Bezug:** FEAT-19-28 (Source-Position-Marker), EPIC-19 (Knowledge Maintenance)
**Verwandt:** ADR-103 (Block-Reference-Konvention), FIX-19-28-01 (gleicher Themen-Komplex)
**Entdeckt:** 2026-05-10 (User-Repro mit EnBW Geschaeftsbericht 2025)

## Symptom

Nach `ingest_document` mit `## Kernaussagen` und Page-Refs landet die
Sense-Making-Note mit toten Refs in der Vault. User-Beispiel:

```markdown
- **Nachhaltige Erzeugungsinfrastruktur**: 2.292,6 Mio. ... [[EnBW Geschaeftsbericht 2025#Page 87|↗]] ^seg-erzeugung
- **Systemkritische Infrastruktur**: 2.700,5 Mio. ... [[EnBW Geschaeftsbericht 2025#Page 87|↗]] ^seg-netz
- **Intelligente Infrastruktur fuer Kund*innen**: 353,1 Mio. ... [[EnBW Geschaeftsbericht 2025#Page 87|↗]] ^seg-kunden
```

Klick auf den `↗`-Link springt nicht zu Page 87. Erst auf User-
Nachfrage setzt der Agent korrekte Refs nach, die alten toten Refs
bleiben aber bestehen.

## Root Cause Analyse

Zwei verkettete Bugs im `IngestDocumentTool.checkPositionMarkers`-
Helper, beide mit derselben Wurzel: der Marker-Check zaehlt nur
**Anwesenheit** der Wikilink-Form, nicht **Korrektheit** der Ziel-
Position.

### Kette

**Bug 1: Regex matched Bullets mit Block-Anchor-Suffix nicht**

[IngestDocumentTool.ts:303](src/core/tools/vault/IngestDocumentTool.ts#L303)

```typescript
if (/\[\[[^\]]+\|↗\]\]\s*$/.test(line)) {
    withMarker++;
}
```

Die Regex erwartet, dass der Wikilink direkt vor dem Zeilenende steht
(`\s*$`). Bullets im Karpathy-Pattern enden aber haeufig mit einem
Block-Anchor `^seg-erzeugung` oder `^block-7` (Eigen-Anchor des
Bullets, damit andere Notes ihn referenzieren koennen). Der Anchor
ist Whitespace + `^` + slug, was die Regex nicht als `\s*$` matched.

Konsequenz: bei 3 Kernaussagen mit gueltigen Refs UND Block-Anchors
returnt das Tool `withMarker = 0`. Der Tool-Output an den Agent:
"0 of 3 Kernaussagen carry refs. 3 ohne Marker -- bitte ergaenzen."

Der Agent vertraut der Tool-Diagnose und ergaenzt zusaetzliche Refs
in einem Folge-Edit. Die alten Refs bleiben bestehen, weil sie
formell ja schon da sind. Die neuen werden meist neben den alten
eingefuegt -> Doppelung statt Reparatur. Das matcht die User-Beobachtung
"auf Nachfrage werden funktionierende Links gesetzt, die toten
bleiben aber".

**Bug 2: Page-Range wird nicht validiert**

[IngestDocumentTool.ts:191-198](src/core/tools/vault/IngestDocumentTool.ts#L191-L198)

```typescript
const markerCheck = checkPositionMarkers(header_content);
const pageCount = countPageHeadings(cleanedText);
const markerLine = markerCheck.kernaussagen === 0
    ? '...'
    : `Position-Marker check: ${markerCheck.withMarker} of ${markerCheck.kernaussagen} ...`;
```

Das Tool kennt `pageCount` (aus `countPageHeadings`), nutzt es aber
nicht zur Validation. Wenn der Agent Refs auf `#Page 87` setzt aber
das PDF nur 60 Pages hat, oder wenn er einen anderen Basename als
das Output-File nutzt, faellt das im Marker-Check nicht auf.

Konsequenz: Refs koennen auf nicht-existierende Pages zeigen oder
auf Files, die nicht existieren. Der Tool-Result meldet trotzdem
"X of Y Kernaussagen carry refs" -> grun. Der Agent ist zufrieden.
Erst wenn der User klickt und nichts passiert, faellt es auf.

### Zusammenfassung

```
Tool prueft: hat Bullet einen [[..|↗]]-Wikilink ganz am Ende?
Tool prueft NICHT:
  - ist der Block-Anchor `^slug` nach dem Ref erlaubt? (sollte er)
  - zeigt der Ref auf eine existierende Page im selben File?
  - matched der Basename im Ref dem Output-File?

Agent sieht "X of Y carry refs" und vertraut. Ist X < Y wegen
Bug 1, ergaenzt er Refs neben den existierenden -> Doppelung. Sind
die Refs tot wegen Bug 2, faellt es nicht auf.
```

## Scope dieses FIX

In-Scope:

1. `checkPositionMarkers`-Regex erweitern: erlaubt optionalen
   Block-Anchor `^slug` nach dem `[[..|↗]]`-Ref bis Zeilenende.
   Pattern: `\[\[[^\]]+\|↗\]\](?:\s+\^[a-z0-9-]+)?\s*$`.

2. Tool-Result um Dead-Ref-Check erweitern: parse alle
   `[[OUTPUT_BASENAME#Page N|↗]]`-Refs aus den Kernaussagen. Wenn
   `N > pageCount` oder Basename nicht zum Output-File matched:
   liste die Dead-Refs explizit im Tool-Result und melde sie als
   Warnung.

3. Bei `deadRefs > 0`: Tool-Output enthaelt Anweisung an den Agent,
   die toten Refs zu ENTFERNEN (nicht zu ergaenzen). Konkrete Liste
   der toten Refs.

4. Unit-Tests in `IngestDocumentTool.test.ts`:
   - Bullet mit `[[..|↗]] ^block-anchor` zaehlt als withMarker
   - Bullet mit `[[..|↗]]` ohne Block-Anchor zaehlt weiter als withMarker
   - Bullet ohne `↗`-Ref zaehlt nicht
   - Dead-Ref auf Page > pageCount wird gemeldet
   - Dead-Ref auf falschen Basename wird gemeldet

Out-of-Scope (separate FIXes / IMPs):

- `ingest_deep`-Pfad: Annotator-Validation gegen Mirror-Block-IDs
  -> separater FIX-19-28-07, sobald Live-Test diesen Pfad nochmal
  reproduziert.
- Skill-side Cleanup: `/ingest-deep` SKILL.md Step 4 so erweitern,
  dass tote Refs aktiv entfernt werden -> Skill-Update kann Tool-
  Side-Validation nutzen, also nach diesem FIX.
- LLM-side Determinismus: Refs deterministisch im Tool setzen statt
  vom Agent erwarten -> separates IMP unter FEAT-19-28.

## Reproduktion

1. PDF mit 60 Pages in den Vault legen.
2. Agent-Aufruf: `ingest_document` mit `header_content`, das
   `## Kernaussagen` mit drei Bullets der Form
   `- ... [[OUTPUT_BASENAME#Page 87|↗]] ^slug` enthaelt.
3. Erwartet: Tool meldet "Dead refs: Page 87 > pageCount 60".
4. Beobachtet: Tool meldet "0 of 3 Kernaussagen carry refs"
   (Regex-Bug) und ignoriert dass Page 87 nicht existiert.

## Akzeptanzkriterien

| ID | Criterion | Target |
|----|-----------|--------|
| AC-01 | Regex matched Bullet mit `[[..|↗]] ^slug`-Suffix | Unit-Test |
| AC-02 | Tool-Result meldet Dead-Refs explizit (Page > pageCount) | Unit-Test |
| AC-03 | Tool-Result meldet Dead-Refs bei Basename-Mismatch | Unit-Test |
| AC-04 | Tool-Result enthaelt bei Dead-Refs Anweisung "ENTFERNEN" | Unit-Test |
| AC-05 | Bei sauberen Refs bleibt Output rueckwaertskompatibel | Unit-Test |

## Files

- `src/core/tools/vault/IngestDocumentTool.ts`
  - `checkPositionMarkers`-Regex erweitern
  - Neue Funktion `findDeadPageRefs(headerContent, outputBasename, pageCount)`
  - Tool-Result-Bauer um Dead-Ref-Section erweitern
- `src/core/tools/vault/__tests__/IngestDocumentTool.test.ts`
  (oder neu, falls nicht vorhanden)

## Fix

[IngestDocumentTool.ts:303](src/core/tools/vault/IngestDocumentTool.ts#L303)
-- Regex in `checkPositionMarkers` erweitert um optionalen
Block-Anchor-Suffix:

```typescript
// vorher
/\[\[[^\]]+\|↗\]\]\s*$/.test(line)

// nachher
/\[\[[^\]]+\|↗\]\](?:\s+\^[A-Za-z0-9_-]+)?\s*$/.test(line)
```

[IngestDocumentTool.ts neu](src/core/tools/vault/IngestDocumentTool.ts)
-- `findDeadPageRefs(headerContent, outputBasename, pageCount)` neu.
Scant die Kernaussagen-Section, parsed alle `[[BASENAME#Page N|↗]]`-
Refs, meldet Dead-Refs bei zwei Failure-Modi:

- Page-Number > pageCount (Page existiert nicht im Originaltext)
- Basename matched nicht das Output-File (Ref zeigt auf falsches Note)

[IngestDocumentTool.ts:execute](src/core/tools/vault/IngestDocumentTool.ts)
-- Tool-Result um Dead-Refs-Section erweitert. Bei `deadRefs > 0` wird
die Dead-Ref-Liste explizit aufgefuehrt mit konkretem Reason und der
Anweisung "ENTFERNEN, nicht zusaetzliche Refs ergaenzen". Damit
laeuft der Agent nicht mehr in das Doppel-Edit-Pattern.

## Regression test

[IngestDocumentTool.test.ts](src/core/tools/vault/__tests__/IngestDocumentTool.test.ts)
-- Regression-Test verifiziert via red-green-Cycle am 2026-05-10:

1. Test "zaehlt Marker auch wenn ein Block-Anchor folgt" ergaenzt fuer
   den Karpathy-Pattern-Bullet `- ... [[X#Page 1|↗]] ^seg-a`.
2. 6 neue Tests fuer `findDeadPageRefs`: Page > pageCount,
   Basename-Mismatch, valide Refs, ausserhalb Section, Mehrfach-Dead,
   Skip von Block-/URL-Anchor-Refs.
3. `basenameOf`-Tests fuer Output-Path-Stem-Extraktion.

Red-Green-Cycle: Stash der `IngestDocumentTool.ts`-Aenderung, alle 9
neuen Tests rot. Stash pop, alle 17 Tests gruen. Backwards-Kompatibilitaet
der 8 bestehenden Tests intakt.
