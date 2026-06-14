---
title: Block-Level Provenance
description: Why every claim in a Vault Operator note ends with a link back to the exact paragraph it came from, and how the link is built.
---

# Block-level provenance

A note without a path back to its source decays. Six months from now you read "Pricing should be value-based, not cost-plus" in a derived note and ask yourself: where did I get this? If you cannot answer that in under a minute, the note has lost most of its value.

Vault Operator solves this by wrapping every key statement in a link that resolves to the exact source paragraph. The link looks like `↗`. One click takes you to the place the claim came from.

## What the link looks like

In a derived note, a typical take-away reads:

```
Behavioral nudges work best when the default option matches
the desired outcome, because most users never change defaults.
[[Thaler-2008_Nudge#^block-42|↗]]
```

The `↗` is an Obsidian wikilink with a custom display text. The link target is one of five shapes, depending on the source type:

| Source type | Link target |
|-------------|-------------|
| Markdown / web clip | `[[basename#^block-N|↗]]` |
| PDF (quick ingest) | `[[basename#Page N|↗]]` (matches a `## Page N` heading in the appended original text) |
| PDF (deep ingest) | `[[basename#^block-N|↗]]` (matches a block ID in the generated Markdown mirror) |
| PPTX | `[[basename#Slide N|↗]]` |
| XLSX | `[[basename#Sheet name|↗]]` |

The display text stays uniform across all five. No `[1]` style citations, no "see source" filler. Visual minimalism keeps the reading flow intact.

## Why blocks, not pages

A page reference points to a region. A block reference points to a paragraph. For a 30-page paper, "page 18" leaves you scanning. "The third paragraph on page 18" leaves you reading.

For PDFs, deep ingest first builds a Markdown mirror of the source. Each paragraph in the mirror gets an Obsidian block anchor (`^block-N`). Derived notes then reference these anchors instead of pages. The result: one click lands you at the paragraph, not at a page you have to scan.

For Markdown notes and web clips, the same mechanism applies directly. The `BlockIdSetter` walks the source on first ingest and assigns block anchors where the agent needs them, without disturbing existing IDs.

## The failure mode this prevents

There are two compression patterns that quietly erode a vault:

1. **Summary drift.** The first derived note keeps caveats, dates, and minority views. The second derived note (built from the first) drops them. The third loses the original wording entirely. By the time you query the third note, the original nuance is gone and unreachable.

2. **Confidence inflation.** Without a quick check-back, claims feel more certain over time than they were in the source. A "preliminary finding" reads as a fact six months later.

With every claim wrapped in a `↗` link, you can always re-verify in two clicks. The original survives every layer of derivation.

## Anchor matching

Anchors are matched fuzzy, not exact. The matcher runs four passes in order:

1. Exact substring match
2. Whitespace-normalised match
3. Punctuation-tolerant match (smart quotes, en/em dashes, parentheses stripped)
4. Longest-contiguous-token-overlap fallback (requires the anchor to cover at least half its tokens)

If all four fail, the ingest tool surfaces the unmatched anchor in the result so you can either rerun with corrected anchor text or accept the take-away without a block reference. Silent skips never happen.

## Stub notes carry provenance too

When deep ingest identifies a new entity that deserves its own note (a person, a concept, a project), the agent does not just drop an empty file with a title. The stub note includes a short explanation of what the concept is, the key aspects the source surfaced, and a link back to the source that triggered its creation. It is a starting point for further thinking, with provenance intact from day one.

## How it integrates with the rest of the system

The provenance layer sits between [knowledge ingest](/guides/knowledge-ingest) (writes the links) and [knowledge discovery](/guides/knowledge-discovery) (uses them when you ask the agent to dig deeper). The [vault health check](/concepts/vault-health) flags notes that reference source IDs which no longer resolve, so broken provenance is caught early.

If you need to inspect the source positions directly, the `ingest_triage` and `ingest_deep` tools both return their anchor-to-block-id maps in the tool result, visible in the activity block.

## Further reading

- [Knowledge ingest guide](/guides/knowledge-ingest): the workflow that produces these links.
- [Deep ingest tutorial](/tutorials/deep-ingest): a full walkthrough of a research-paper ingest with the seven-step skill.
- [Tools reference](/reference/tools): the `ingest_triage`, `ingest_document`, and `ingest_deep` tools that build and store the links.
