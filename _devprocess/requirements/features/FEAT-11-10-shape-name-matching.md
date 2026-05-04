# Feature: Shape-Name-Matching (Strategy S0)

> **Feature ID**: FEAT-11-10
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P0-Critical
> **Effort Estimate**: S (1-2 Tage)
> **Note**: **DEPRECATED** -- S0-S6 Strategie-Flow durch direkte Shape-Namen ersetzt (ADR-46)

## Feature Description

Neue hoechste Matching-Strategie (S0) in PptxTemplateCloner die Shapes ueber ihren OOXML-Namen (`<p:cNvPr name="TextBox 5">`) identifiziert statt ueber mehrdeutigen Platzhalter-Text.

## Problem

Text-basierte Keys ("Lorem ipsum dolor sit amet") kommen in dutzenden Shapes vor und sind nicht eindeutig. Shape-Namen hingegen sind pro Slide einzigartig und stabil.

## Technical Design

### Neue Strategie S0 in `PptxTemplateCloner.ts`

```typescript
// Strategy S0: Shape-Name-Matching (hoechste Prioritaet)
// Key = Shape-Name aus <p:cNvPr name="...">
// Wenn Key exakt einem Shape-Namen entspricht, wird dieser Shape ersetzt
function replaceByShapeName(xml: string, key: string, value: string): string {
    // 1. Finde <p:cNvPr ... name="KEY"> im XML
    // 2. Navigiere zum umgebenden <p:sp> Element
    // 3. Ersetze allen Text in diesem Shape durch value
    // 4. Behalte Formatierung bei (nur <a:t> Inhalte ersetzen)
}
```

### Prioritaet im Matching-Flow

```
S0: Shape-Name-Match  (NEU, hoechste Prio)
S1: Exact <a:t> match
S2: Cross-run paragraph match
S3: Shape-level text match
S4: Substring match
S5: Placeholder type+idx match
S6: Positional fallback
```

### Integration

- `replaceSlideContent()` prueft zuerst S0 fuer jeden Key
- Wenn S0 matched: Key wird als "matched" markiert, naechster Key
- Wenn S0 nicht matched: Fallback auf S1-S6 (bestehend)

## Definition of Done

- [ ] Strategy S0 implementiert in PptxTemplateCloner.ts
- [ ] Shape-Name-Keys wie "TextBox 5" matchen zuverlaessig
- [ ] Bestehende S1-S6 Strategien bleiben als Fallback
- [ ] Diagnostik zeigt S0-Matches im Tool-Result
- [ ] Bestehende Tests weiterhin gruen

## Dependencies

- **PptxTemplateCloner.ts**: Bestehende 6-Strategie-Engine
- **FEAT-11-08**: Template-Analyse liefert die Shape-Namen fuer den Agent
