---
id: FIX-03-27-08
feature: FEAT-03-27
epic: EPIC-03
adr-refs: [ADR-137]
plan-refs: []
depends-on: []
created: 2026-06-22
---

# FIX-03-27-08: searchWithAdjacency mit pathPrefix-Filter testen

> Backlog row: `_devprocess/context/BACKLOG.md` -> FIX-03-27-08
> (status, phase, claim, last-change live there).

## Symptom

`VectorStore.searchWithAdjacency` (Zeile 519 in `src/core/knowledge/VectorStore.ts`) hat einen `pathPrefix`-Branch, der durch den Coverage-Lauf 2026-06-22 als ungetestet identifiziert wurde. VectorStore liegt aktuell bei 95.56% Line-Coverage. Die einzige ungetestete Zeile in der Domain-relevanten Surface ist der Prefix-Filter im Adjacency-Such-Pfad.

## Root cause

Die `searchWithAdjacency`-Tests in `src/core/knowledge/__tests__/VectorStore.test.ts` rufen die Methode ohne den optionalen `pathPrefix`-Parameter auf. Der Branch wird im PLAN-41-Testing-Pass nicht abgedeckt, weil er ausserhalb des FEAT-03-27-Kern-Scope (Domain-Diskriminator + Migration + Helper-Erweiterung) liegt.

## Fix

Einen einzelnen Unit-Test in `VectorStore.test.ts` ergaenzen:

```typescript
it('searchWithAdjacency filtert auf pathPrefix wenn gesetzt', () => {
  // Seed: Notes/A.md, Notes/B.md, fact:f-1, session:s-1
  // alle mit chunk_index 0 plus jeweils einem Adjacency-Edge
  const result = vectorStore.searchWithAdjacency(queryVector, {
    pathPrefix: 'fact:',
    topK: 10,
  });
  // Assert: nur fact:f-1 in results
});
```

## Regression test

Der oben skizzierte Unit-Test ist die Regression-Test-Form. Kein Code-Aenderung notwendig, nur Test-Hinzufuegung.

## Priority

P3. Defensive Code-Pfad, kein Drift-Risiko, kein User-sichtbares Symptom. Aufwand <10 Min. Hebt VectorStore.ts Line-Coverage von 95.56 auf ~96.
