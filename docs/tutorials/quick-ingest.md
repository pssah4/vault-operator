---
title: Capture a PDF with /ingest
description: Drop a PDF into the chat and end up with a clean source note that links every claim back to the right page.
---

# Capture a PDF with /ingest

This tutorial shows the fastest ingest path: drop a single PDF into the chat, get a clean source note with page-level links back to the original.

About three minutes per source. Use `/ingest` when you want the material captured for later, without spending a full reading session on it right now.

**Before you start:**

- Vault Operator installed, a model configured, semantic search built. If not, do [Search your vault by meaning](./search-by-meaning) first.
- One PDF you actually want in your vault. A short paper or a meeting export works best for the first run.

## Step 1: Drop the PDF into the chat

Drag the PDF onto the chat input. The file uploads, and Vault Operator writes it into your Obsidian attachment folder (whatever you set in Obsidian's File and Links settings). The chat shows a file chip with the saved vault path. You did not need to save the PDF manually first.

## Step 2: Ask for the ingest

Type:

> "Ingest this report."

Or just `/ingest` and pick the workflow from the picker.

The agent calls `ingest_triage` against your vault's ontology. Ten seconds, about $0.05 in tokens. The triage card appears in the chat with:

- Cluster match (does this fit a topic hub you already maintain?)
- Tension hint (does it confirm, extend, or contradict what you have?)
- Source diversity (are you overloading one domain?)
- Related notes from your vault, memory, and chat history
- A recommendation: ingest, defer, or discard

## Step 3: Confirm the ingest

If the recommendation is *ingest*, approve and the agent calls `ingest_document`. One Markdown note is written into your sources folder (set in **Settings > Vault > Ingest**). The note contains:

- Frontmatter with source path, type, ingest date, cluster, plus your template fields (author, year, summary, tags).
- A two-or-three-sentence overview.
- A `## Key Take-Aways` section. Each take-away ends with a `↗` link that resolves to the exact page of the source.
- The full original PDF text, appended automatically.

If the recommendation is *defer* or *discard*, the workflow stops. The decision is logged, so the same source will not trigger triage again.

## Step 4: Click a take-away

Open the new source note. Click any `↗` link next to a take-away. You land at the matching `## Page N` heading further down in the same file. The original wording is right there.

This is the value: six months from now, when you ask yourself "where did this claim come from?", the answer is one click away.

## Step 5: See the source in semantic search

Ask the agent something the source is relevant to:

> "What do I know about [topic from the PDF]?"

The new source note appears in the semantic search results, often near the top. The take-aways and the embedded text both feed the index.

## What you learned

You now know the quick ingest path. One drop, one approval, one source note with provenance. The PDF lives in your attachment folder and the searchable note lives in your sources folder.

## Next steps

For material that deserves a real reading session (a research paper, a long report, a domain-specific Office document), use the deep path:

- [Make sense of a research paper with `/ingest-deep`](./deep-ingest)

For the full reference on both paths, including configuration:

- [Knowledge ingest guide](/guides/knowledge-ingest)

For the why behind the `↗` links:

- [Block-level provenance concept](/concepts/provenance)
