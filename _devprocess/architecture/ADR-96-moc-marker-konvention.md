---
id: ADR-96
title: MOC-Marker-Konvention (HTML-Comment-Marker)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-11
  - FEAT-19-26
---

# ADR-96: MOC-Marker-Konvention (HTML-Comment-Marker)

## Context

Aktive MOC-Pflege (FEAT-19-11) und Dialog-getriebener MOC-Update (FEAT-19-26) muessen einen klar abgegrenzten Auto-Block in MOC-Pages schreiben, ohne User-edited Content zu zerstoeren. Drei Marker-Konventionen sind etabliert: HTML-Comments, Dataview-style Codeblocks, eigene Marker-Syntax.

## Decision Drivers

- Obsidian-Rendering-Vertraeglichkeit (Marker darf nicht im Lese-Modus sichtbar sein)
- Robustheit gegen User-Tippfehler (Marker darf nicht versehentlich gebrochen werden)
- Konsistenz mit existierenden Obsidian-Plugin-Patterns
- Sichtbarkeit fuer User wenn er es bewusst sehen will

## Considered Options

### Option A: HTML-Comments `<!-- obsilo:auto-start -->` ... `<!-- obsilo:auto-end -->`

Pros:
- Im Obsidian-Lese-Modus unsichtbar.
- Im Edit-Modus klar als System-Markierung erkennbar.
- Etabliert in Markdown-Tools (analog Linter/Formatter-Markers).
- Robust gegen Render-Aenderungen.

Cons:
- User koennte sie versehentlich loeschen.
- Bei Cut+Paste in andere Editoren bleiben sie erhalten.

### Option B: Dataview-style `~~~obsilo-auto~~~` Codeblock

Pros:
- Konsistent mit Dataview-Pattern.
- Im Lese-Modus sichtbar als Code-Block.

Cons:
- Sichtbarer Code-Block stoert visuelle MOC-Aesthetik.
- Bei deaktiviertem Plugin bleibt unschoener Block stehen.

### Option C: Eigene Marker-Syntax `{{obsilo-auto-start}}`

Pros:
- Eindeutig.

Cons:
- Im Lese-Modus sichtbar.
- Markdown-Konvention-Bruch.

## Decision

**Option A**: HTML-Comments mit Praefix `obsilo:`.

Konkretes Format:
```
<!-- obsilo:auto-start id="moc-header" generated-at="2026-05-03T..." -->
... auto-generierter Inhalt ...
<!-- obsilo:auto-end -->
```

Begruendung:
- Im Lese-Modus unsichtbar, also stoert es User-Aesthetik nicht.
- Im Edit-Modus klar als System-Block erkennbar.
- Praefix `obsilo:` verhindert Kollision mit anderen Plugin-Markern.
- Optional: id-Attribut erlaubt mehrere Auto-Bloecke pro Note (zB Header + Footer).
- generated-at-Timestamp macht Stale-Detection trivial.

## Consequences

### Positive
- User-Content bleibt visuell ungestoert.
- Marker-Detection ueber Regex robust.
- Mehrere Auto-Bloecke pro Note moeglich (id-Attribut).

### Negative
- Wenn User Marker versehentlich loescht, weiss System nicht wo Auto-Block neu hin soll. Mitigation: Skip plus Notification "Marker fehlt, Auto-Pflege pausiert fuer diese Note".
- HTML-Comments funktionieren nicht in allen Obsidian-Plugins (zB einige Renderer ignorieren sie).

### Risks
- Wenn User das Marker-Block-Inhalt manuell editiert, ueberschreibt naechster Auto-Update das User-Edit. Mitigation: System detected User-Modification (via SHA der ersten Zeile, vor letzter Auto-Pflege) und ueberspringt mit Warning.

## Implementation Notes

Marker-Helper:
- `findAutoBlock(content: string, blockId: string)` -> `{start: number, end: number, body: string} | null`
- `replaceAutoBlock(content: string, blockId: string, newBody: string)` -> updated content
- `injectAutoBlock(content: string, blockId: string, position: 'top' | 'after-frontmatter' | 'bottom', body: string)` -> content with new block

Bei User-Modifikation-Detection: SHA-256 der Block-Body wird in `generated-at`-Attribut neben Timestamp persistiert (Format `generated-at="...|sha=..."`). Beim Auto-Update wird SHA mit aktuellem Block-Body verglichen. Mismatch = User hat editiert = Skip.
