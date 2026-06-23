---
id: ADR-139
title: CodeMirror-6 Inline-Diff-Renderer mit Per-Hunk Accept/Reject
date: 2026-06-22
deciders: [Sebastian Hanke, Architecture Agent (Claude Opus 4.7)]
asr-refs: [ASR-EPIC-33-02]
feature-refs: [FEAT-33-03, FEAT-33-06]
related-adrs: []
supersedes: null
superseded-by: null
---

# ADR-139: CodeMirror-6 Inline-Diff-Renderer mit Per-Hunk Accept/Reject

## Context

FEAT-33-03 (Rewrite-Action) und FEAT-33-06 (Translate-Action) verlangen einen Inline-Diff direkt im Obsidian-Editor. Der User markiert einen Textbereich, loest die Aktion aus, und das Modell streamt einen Vorschlag in den Editor. Aenderungen sollen pro Hunk angenommen oder verworfen werden koennen. Die Marktrecherche zu EPIC-33 zeigt, dass sechs von acht untersuchten Tools (Cursor, Continue, GitHub Copilot, Zed, Cline, Aider) genau dieses Inline-Diff-Pattern als SOTA umsetzen.

Spike B (Inventory CodeMirror-6 Decoration-API plus Best-Practice-Plugins) hat das InlineAI-Plugin als Obsidian-Vorbild und @codemirror/merge als Library-Option untersucht. Das Latenz-Budget zwischen Token-Arrival und Render liegt bei rund 100 Millisekunden. Editor-State-Korruption durch fehlerhafte Decoration-Updates ist das Hauptrisiko und kann den Editor temporaer unbenutzbar machen.

**Triggering ASR:** ASR-EPIC-33-02 verlangt Inline-Diff im Editor mit Per-Hunk Accept/Reject als zentrales Bedienelement der Rewrite-Action.

**Quality attribute:** Usability (per-Hunk-Granularitaet als Diff-Norm der Branche) und Performance (Streaming unter 100 Millisekunden Render-Latenz).

## Decision drivers

- **Streaming-Echtzeit-Rendering:** Token-by-Token-Updates muessen mit weniger als 100 Millisekunden Latenz im Editor erscheinen, sonst wirkt die Aktion zaeh und der User verliert das Vertrauen in die Live-Vorschau.
- **Per-Hunk-Kontrolle:** Cursor, Continue und Copilot setzen Cmd+Opt+Y/N als De-facto-Standard fuer atomare Accept/Reject pro Hunk. Das Pattern muss sich direkt abbilden lassen.
- **Editor-State-Robustheit:** Out-of-Range-Decorations, falsche RangeSetBuilder-Reihenfolge oder unabgefangene Composition-Events koennen das Editor-Dokument korrumpieren. Die Loesung muss diese Faelle sauber kapseln.
- **Obsidian-Plugin-Constraint:** Obsidian liefert eine eigene CodeMirror-6-Instanz. Doppelte CM-Instanzen durch falsch gebundelte Dependencies brechen jeden Decoration-Versuch.
- **Wartungsaufwand vs. Flexibilitaet:** Eigene Pipeline kostet mehr Code, fertige Library spart Aufwand. Der Trade-off muss zur Streaming-Anforderung passen.

## Considered options

### Option 1: Custom mark+widget Pattern mit StateField und StateEffect

Decoration.mark() liefert rot/gruen-Highlighting fuer entfernte und hinzugefuegte Bereiche, Decoration.widget() bringt Accept/Reject-Buttons in den Editor. Ein StateField speichert ein Tupel aus Decorations (RangeSet) und Hunks (Map mit Metadaten pro Hunk). StateEffects (updateDiffEffect, acceptHunkEffect, rejectHunkEffect) treiben die Updates. RangeSetBuilder baut Decorations in aufsteigender Range-Reihenfolge auf, jsdiff berechnet das Diff. Ein 80-Millisekunden-Debounce auf dem Token-Strom haelt die Render-Last in Grenzen.

**Pros:**
- Voll kontrollierbare Streaming-UX inklusive Token-by-Token-Rendering.
- Per-Hunk-Accept-Hotkeys (Cmd+Opt+Y/N) lassen sich direkt im @codemirror/view-Keymap binden.
- jsdiff ist bereits als transitive Dependency in node_modules vorhanden, keine neue Top-Level-Abhaengigkeit.
- Das Pattern ist im InlineAI-Obsidian-Plugin nachweislich produktionsfaehig.
- Klare Trennung zwischen State (Decorations plus Hunks) und Effect (Dispatch-Trigger).

**Cons:**
- Hoeherer Initial-Code-Aufwand von rund 300 bis 400 Zeilen TypeScript fuer Decoration-Pipeline, Streaming-Handler und Per-Hunk-Logik.
- Editor-State-Gotchas (Out-of-Range, RangeSetBuilder-Reihenfolge, Composition-Events) muessen explizit behandelt werden.

### Option 2: @codemirror/merge Library

Die offizielle CodeMirror-Library bietet unifiedMergeView mit allowInlineDiffs und einer acceptChunk/rejectChunk-API.

**Pros:**
- Fertige Loesung mit rund 50 Zeilen Glue-Code.
- Vom CodeMirror-Team gepflegt, hohe Code-Qualitaet.
- Gutter-basierte Accept/Reject-Buttons bereits eingebaut.

**Cons:**
- Nicht fuer Streaming-UX entworfen, der Diff-Rebuild laeuft gegen einen festen Originaltext statt inkrementell.
- Render-Pipeline ist weniger flexibel, Gutter-Pflicht und feste UI-Komponenten widersprechen dem geplanten Inline-Hunk-Banner.
- Latenz-Verhalten bei haeufigen Update-Cycles ist unklar und nicht durch Benchmarks belegt.
- Inline-Diff-Modus ist juenger als der Block-Modus und hat weniger Community-Referenzen.

### Option 3: codemirror-ai Library (marimo)

Eine NPM-Library speziell fuer AI-Inline-Edits, die das mark+widget-Pattern abstrahiert.

**Pros:**
- Speziell fuer AI-Inline-Diff entworfen.
- Streaming-Support ist bereits Teil des Designs.

**Cons:**
- Externe Dependency mit eigenem Lifecycle und API-Drift-Risiko.
- Wenig Community-Signal und unklare Stabilitaets-Garantien.
- Anpassung an die Obsidian-Constraints (external @codemirror/*) ist unklar dokumentiert.

## Decision

Custom mark+widget Pattern mit StateField und StateEffect (Option 1).

Begruendung: Die Streaming-Realtime-Anforderung schliesst @codemirror/merge faktisch aus, weil dort der Diff gegen einen festen Originaltext rebuildet wird und das Latenz-Budget bei haeufigen Token-Updates nicht belegbar haelt. codemirror-ai bringt zu wenig Community-Signal und einen unklaren Lifecycle, der bei einem Editor-Kern-Feature ein zu hohes Risiko traegt. Das InlineAI-Obsidian-Plugin liefert ein konkretes Vorbild fuer das Custom-Pattern im selben Ecosystem und beweist die Tragfaehigkeit.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Voll kontrollierbares Streaming-Diff-Rendering im Editor, inklusive Token-by-Token-Updates.
- Per-Hunk-Accept-Pattern (Cmd+Opt+Y/N) direkt umsetzbar wie in Continue.
- Keine zusaetzliche externe Library-Abhaengigkeit ueber jsdiff hinaus.
- Das Pattern bleibt wiederverwendbar fuer kuenftige Inline-Operationen wie FEAT-33-06 Translate, sofern dort ebenfalls ein Diff-Default sinnvoll wird.

### Negative

- Initial-Aufwand von 300 bis 400 Zeilen TypeScript fuer Decoration-Pipeline, Streaming-Handler und Per-Hunk-Logik.
- Editor-State-Gotchas verlangen sorgfaeltige Behandlung: Range-Validation, aufsteigende Reihenfolge im RangeSetBuilder, Composition-Events.
- @codemirror/state und @codemirror/view muessen im esbuild-Bundle als external markiert bleiben, sonst laedt das Plugin eine zweite CM-Instanz und Decorations greifen nicht.

### Risks

- Das Latenz-Budget von 80 bis 150 Millisekunden wird eng, wenn das Dokument sehr gross wird (mehr als 10.000 Zeilen). Mitigation: nur Decorations im Viewport rendern und Token-Streams partial diffen, statt das ganze Dokument neu zu rechnen.
- Bei Multi-Hunk-Diffs kann der User die Granularitaet missverstehen. Mitigation: zusaetzlich Cmd+Return fuer Accept all und Cmd+Backspace fuer Reject all anbieten und die Hunk-Numerierung im Banner ausweisen.
- IME-Composition-Events koennen Decorations korrumpieren, falls Updates waehrend einer Composition dispatched werden. Mitigation: tr.isUserEvent("input.composition") pruefen und Updates in Composition-Phasen aussetzen.

## Implementation Notes

Empfohlene Modulstruktur:

- `src/core/inline/diff/InlineDiffStateField.ts` (NEU): StateField mit Shape `{ decorations: RangeSet, hunks: Map<HunkId, HunkInfo> }`.
- `src/core/inline/diff/InlineDiffEffects.ts` (NEU): StateEffects `updateDiffEffect`, `acceptHunkEffect`, `rejectHunkEffect`.
- `src/core/inline/diff/InlineDiffRenderer.ts` (NEU): RangeSetBuilder-Logik plus Decoration-Definitionen fuer mark (add/remove) und widget (Accept/Reject-Banner).
- `src/core/inline/diff/InlineDiffStreamHandler.ts` (NEU): 80-Millisekunden-Debounce, jsdiff-Aufrufe (`diffLines`, optional `diffWordsWithSpace`), Effect-Dispatch.
- `src/ui/inline/InlineDiffKeymap.ts` (NEU): Cmd+Opt+Y/N Hotkey-Bindings via `@codemirror/view` keymap. Zusaetzlich Cmd+Return (Accept all) und Cmd+Backspace (Reject all).

Bundle-Konfiguration:

- `esbuild.config.mjs`: `external: ['@codemirror/state', '@codemirror/view', '@codemirror/language', 'obsidian']` (bereits gesetzt, beim Coding verifizieren).

Pattern-Referenzen:

- github.com/FBarrca/obsidian-inlineAI (Inline-Diff-UX im Obsidian-Editor, Cursor-Style).
- cursor.com/docs/inline-edit (Per-Hunk-Pattern als Vorbild).
- docs.continue.dev/edit (Cmd+Opt+Y/N Hotkey-Bindings).

Dependencies:

- jsdiff: bereits transitive in node_modules. `diffLines()` fuer Line-Level-Diff, `diffWordsWithSpace()` fuer Char-Level innerhalb veraenderter Linien.

Gotcha-Checkliste fuer /coding:

- RangeSetBuilder strikt in aufsteigender `from`-Reihenfolge fuellen, sonst wirft CM einen RangeError.
- Decorations VOR Effects via `tr.changes` mappen, nicht umgekehrt.
- Composition-Events ausblenden: `if (tr.isUserEvent("input.composition")) return field;` vor Effect-Apply.
- Out-of-Range-Positionen vor Builder-Aufruf auf `[0, state.doc.length]` clampen.
- Overlapping Mark-Decorations gleicher Klasse vermeiden, sonst Render-Artefakte.
