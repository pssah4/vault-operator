---
id: FIX-01-05-02
feature: FEAT-01-05
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-31
---

# FIX-01-05-02: EditFileTool fuzzy-match zerstoert globalen Whitespace der Datei

## Symptom

Code-Review 2026-05-31 (xhigh focused): bei `edit_file` mit nicht-exakt-matchendem `old_str` schaltet der Tool auf einen normalisierten Vergleich um. Match-Success fuehrt aber dazu, dass die **gesamte Datei** im normalisierten Format zurueckgeschrieben wird: multi-space runs zu single space kollabiert, alle CRLF zu LF konvertiert, leading/trailing whitespace `.trim()`-gestrippt.

Effekt: jede unberuehrte Code-Fence mit Tab-Indent, jede aligned Markdown-Table, jede YAML-Frontmatter-Einrueckung wird global ueberschrieben, obwohl der Agent nur einen punktuellen Edit angefordert hat. Diff ist riesig, Erfolgsmeldung zeigt nur die Line-Delta, Recovery nur ueber Checkpoint.

## Cause

[src/core/tools/vault/EditFileTool.ts:210-225](src/core/tools/vault/EditFileTool.ts#L210-L225) `tryNormalizedMatch`:

```ts
const normalize = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').trim();
const normContent = normalize(content);
const normOld = normalize(old);
const normNew = normalize(newStr);
...
const replaced = normContent.replace(normOld, normNew);
return replaced;
```

Die Normalisierung wird auf den **gesamten Content** angewandt, dann das normalisierte Resultat zurueckgeschrieben via [vault.modify](src/core/tools/vault/EditFileTool.ts#L111). Der Kommentar auf Zeile 221 ("whitespace is collapsed but the edit succeeds") dokumentiert das Verhalten als intentional, der Blast-Radius umfasst aber die gesamte Datei.

Root Cause: Funktion sucht den Match im normalisierten Raum, fuehrt das Replace aber nicht in den **originalen** Bereich der Datei zurueck.

## Fix

`tryNormalizedMatch` so umbauen, dass nur der Match-Bereich des **originalen** Inhalts ersetzt wird:

1. Normalisierten Such-Index im normContent bestimmen (`normContent.indexOf(normOld)`).
2. Diesen Index zurueck auf den **originalen** Content mappen: parallel durch beide Strings iterieren, Whitespace-Runs als 1 Character im normalisierten Raum zaehlen. Resultat ist `originalStart` und `originalEnd`.
3. Replace im originalen String: `content.slice(0, originalStart) + newStr + content.slice(originalEnd)`. Der Whitespace ausserhalb der Match-Region bleibt unangetastet.
4. Fallback wenn das Index-Mapping fehlschlaegt (z.B. Multi-Match-Ambiguitaet): hartes Error statt silent whole-file-rewrite. Der Agent kann dann mit `read_file` re-fetchen und retryen.

Optional (Phase 2): Ambiguitaet-Check -- wenn `normOld` mehrfach im `normContent` vorkommt, hartes Error mit Hinweis "old_str matches N times after normalization; provide more context".

## Regression test

In `src/core/tools/vault/__tests__/EditFileTool.test.ts`:

- **tabs preserved outside match:** Datei mit Tab-indented code fence, edit_file matched nur ein Wort innerhalb fence; die Tabs der anderen Code-Lines bleiben unveraendert.
- **CRLF preserved outside match:** Datei mit CRLF line endings, edit_file matched eine Zeile; CRLF aller anderen Zeilen bleibt.
- **leading/trailing newline preserved:** Datei beginnt mit Leerzeile und endet auf `\n\n`; nach edit_file bleibt beides erhalten.
- **multi-match rejected:** `old_str` matched 2x nach Normalisierung -> Error statt blinder Ersatz der ersten Stelle.
- **regression: existing fuzzy-match success cases** (whitespace-leniente Matches) liefern weiterhin korrektes Resultat im Match-Bereich.

## How tested

1. Vitest gruen.
2. Live-Smoke: edit_file auf eine Note mit YAML-Frontmatter + aligned table + tab-indented code block, old_str der nur in einem Section-Body matcht (normalisiert). Frontmatter/Tabelle/Code bleiben unangetastet.
