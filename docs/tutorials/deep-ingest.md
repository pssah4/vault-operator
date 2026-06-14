---
title: Sense-making with /ingest-deep
description: Walk through a guided seven-step reading session that turns a research paper into sense-making notes with block-level provenance.
---

# Sense-making with /ingest-deep

`/ingest-deep` is the deep path: a guided, seven-step dialog that turns a serious source into one or more sense-making notes. Five to fifteen minutes per source, including reading time.

Use it for research papers, long reports, domain-specific PPTX or DOCX, or anything where the answer to "what did this source actually say?" matters more than capture speed.

**Before you start:**

- Vault Operator installed, a model configured, semantic search built, and the quick ingest path tried at least once. If not, do [Capture a PDF with /ingest](./quick-ingest) first. The deep path builds on the same building blocks.
- One source you genuinely want to read. The output is only as useful as the source.

## The seven steps in one paragraph

The skill calls `ingest_triage`, displays the triage card, asks whether to ingest, reads the source, proposes a numbered topic table, asks which topics you want extracted, asks which output mode you want, then runs `ingest_deep` with the chosen topics, writes the derived notes one by one, and finally updates the source note's frontmatter to link to every new note. The agent stops and waits for your answer at three points: after triage, after the topic table, and before output mode selection.

Now the same flow, step by step, with what you see and what to do.

## Step 1: Drop the source

Drag the source into the chat. PDF, DOCX, PPTX, XLSX, or a Markdown file already in the vault all work.

If you drag a file from outside the vault, Vault Operator saves it to your attachment folder first and points the skill at the vault path. You do not need to do anything manually.

## Step 2: Trigger the skill

Type `/ingest-deep` (or "Deep-ingest this paper" works too). The agent calls `ingest_triage`, the same triage tool the quick ingest uses, with one difference: deep ingest will not start the longer pipeline until step 7, so triage is cheap insurance against opening a long session on the wrong source.

## Step 3: Read the triage card

The card appears in the chat. It shows:

- Cluster match, tension hint, source diversity, recommendation.
- Related notes from your vault. Semantic search hits, top results.
- Related facts from memory. What you have remembered about this topic.
- Related chat history. Past conversations that touched this material.

Take a minute to read the card. The related notes and facts often surface context you forgot you had.

## Step 4: Answer: ingest, defer, or discard

The agent asks you directly. If you choose *defer* or *discard*, the workflow ends here. The decision is logged so the same source will not trigger triage twice. Time invested: about thirty seconds.

If you choose *ingest*, the agent reads the source (this is the only long-running step you cannot speed up) and produces the topic table.

## Step 5: Pick topics from the numbered table

The topic table looks something like this:

```
1. The empirical setup and sample
2. The behavioral nudge mechanism
3. Cross-cultural replication results
4. Limitations and unaddressed confounders
5. Implications for policy design
```

Answer with "All", "1,2,4", or "skip" if you decided you do not want to extract anything. The agent only writes notes for the topics you picked.

## Step 6: Pick the output mode

The agent asks which shape you want:

- **One sense-making note.** All chosen topics in one dense Markdown note, each take-away with a `↗` link to the source. Good for papers you will reference as one unit.
- **Multiple atomic zettel.** One bibliography note plus N atomic notes, Luhmann-style. Good for material with several distinct ideas that should each be linkable on their own.
- **Source-only with take-aways in chat.** The triage card and a clean source note get written. The take-aways stay in the chat dialog. Per-aspect detail notes are created on demand later, once the dialog reveals what is worth a separate zettel. This is the default and works for most cases.
- **Stop.** None of the modes fit. Nothing further is written.

The choice is yours. The agent will not push you into a giant sense-making note unless you ask for it.

## Step 7: Approve and review the writes

The agent calls `ingest_deep` with the chosen topics and explicit block anchors. The tool returns the anchor-to-block-id mapping, then the agent writes the derived notes one by one, asking for approval on each write. The last action is a single `update_frontmatter` on the source note that links every newly created note via the `Notizen:` property.

You can review each proposed write before approving. The approval cards show full content. If a take-away references a source paragraph the matcher could not locate, you will see it called out in the tool result so you can either rerun with corrected anchor text or accept the take-away without a block reference. Silent skips do not happen.

## What you have after the session

- One source note in your sources folder with frontmatter linking to every derived note.
- N derived notes (zero to many depending on your choices in step 5 and 6), each with `↗` links back to the source paragraph for every key statement.
- One or more stub notes for new entities the deep ingest identified (a person, concept, or project). Each stub includes a short explanation and a link back to the source that triggered its creation, so the stub is a real starting point rather than an empty file.
- The triage decision logged, so the same source will not be re-triaged.

## Click a take-away to feel the value

Open one of the derived notes. Click any `↗`. You land directly at the source paragraph, with no page to scan. That is the payoff: six months from now you can re-verify any claim in two clicks.

## Try it again with a different output mode

The seven-step flow is the same every time. Try a second source with a different output mode (zettel instead of single note, for example) to see which shape matches your reading style.

## What you learned

You ran a full sense-making session on a serious source. You picked the topics, picked the output shape, approved the writes, and ended up with a small graph of notes that all trace back to the original source with paragraph-level precision.

## Next steps

- [Knowledge ingest guide](/guides/knowledge-ingest): the full reference, including configuration and edge cases.
- [Block-level provenance concept](/concepts/provenance): the link system and why blocks beat pages.
- [Vault health check guide](/guides/vault-health): catches drifted entries, including notes whose source links no longer resolve.
- [Memory and personalization guide](/guides/memory-personalization): how Vault Operator remembers your preferred topics, categories, and output modes over time.
