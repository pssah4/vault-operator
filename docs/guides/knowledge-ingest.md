---
title: Knowledge Ingest
description: Integrate PDFs, web clips, and Office documents into your vault with block-level provenance and a triage step that filters before you read.
---

# Knowledge ingest

Adding a new source to a well-kept vault is more work than reading the source. You have to decide whether it is worth the effort, figure out where it belongs, link it to hubs that already exist, write a summary that does not lose nuance, and keep a way to trace any claim back to the paragraph that produced it. That is the bookkeeping layer that makes a vault useful six months later, and it is the part most people quietly skip until everything is a mess.

Vault Operator's ingest workflow does the bookkeeping with you. There are two paths: a quick single-pass `/ingest` for inbox capture, and a multi-turn `/ingest-deep` for sense-making on research papers, long reports, and anything that needs more than a summary.

Both paths share three rules:

1. Triage first, read later.
2. One source produces one or more notes that fit the vault, not a chat log.
3. Every key statement in the output ends with a `↗` link that resolves to the exact block in the source.

## Triage first

Before any deep reading, the skill calls `ingest_triage` against the vault's own ontology. Ten seconds, about $0.05 per pass.

Triage returns four things:

- **Cluster match**: does this source belong to a topic hub I already maintain, or is it new?
- **Tension hint**: does it confirm what I have, extend it, or contradict it?
- **Source diversity**: am I overloading one domain (echo-chamber warning)?
- **Recommendation**: ingest, later, or discard.

If the recommendation is *discard* or *later*, the workflow stops there. The decision is logged so the same source never triggers triage twice. This is the cheapest possible filter against vault bloat.

## /ingest: quick single-pass

For an inbox PDF, a webclip, or a meeting export. Drop the file into the chat or point the agent at a vault path:

> "Ingest this report."

The skill calls `ingest_document` once. The result is a single Markdown note containing:

- Frontmatter: source path, source type, ingest date, cluster, plus the fields your templates require (author, year, summary, tags).
- An overview section with two or three sentences capturing the core message.
- A `## Key Take-Aways` section with key statements, each ending with a position marker:
  - PDFs: `[[basename#Page N|↗]]`, where N matches a `## Page N` heading in the appended original text
  - Markdown / web clips: `[[basename#^block-N|↗]]`
  - PPTX: `[[basename#Slide N|↗]]`
  - XLSX: `[[basename#Sheet name|↗]]`
- The full original text, appended automatically by the tool. No LLM token cost for the body.

Click the `↗` and you land at the paragraph that produced the claim. The display text is just `↗`, no `[1]` style citations, no "see source" filler.

Use `/ingest` when you want the source captured in the vault for later, but do not need a structured sense-making session right now.

## /ingest-deep: multi-turn sense-making

For research papers, long reports, domain-specific DOCX/PPTX, anything that wants a real reading session. Five to fifteen minutes of dialog with the model.

The skill runs three steps:

1. **Triage**. Same as above. If you discard or defer, the workflow ends.
2. **Approval round**. The agent asks two questions: which focus areas to extract, and which output shape you want.
3. **Deep ingest**. The `ingest_deep` tool runs the actual pipeline.

For PDFs, deep ingest first converts the source into a Markdown mirror with block IDs. Each paragraph in the mirror gets an Obsidian `^block-N` anchor. Sense-making notes then reference these anchors instead of pages, so a click takes you to the exact paragraph rather than a vague page number.

### Output modes

- **`source-only`** (default). The triage card and a clean source note get written. Take-aways stay in the chat dialog. Per-aspect detail notes are created on demand later, when the dialog reveals what is worth a separate zettel.
- **`source-plus-summary`**. One dense sense-making note for the whole source. Each take-away ends with a block-ref to the mirror.
- **`source-plus-multi-zettel`**. One bibliography note plus N atomic zettel. For material that wants to be split Luhmann-style.

You pick the mode in the approval round. Defaults are conservative: for a typical inbox source, `source-only` with the dialog producing the take-aways works best. The skill does not push every reading session into a giant sense-making note unless you ask for it.

### Why block-level provenance matters

The most expensive failure mode in reading is not misunderstanding a source. It is forgetting, six months later, why you trusted a conclusion. A note without a path back decays. A vault full of decayed notes is a graveyard.

Block-level provenance solves the related risk that summarization patterns introduce: derived notes drop caveats, dates, minority views, and exact wording. Once you query the derived note instead of the original, those compressions become part of your knowledge base. With every claim wrapped in a `↗` link to the source paragraph, you can always re-verify against the original in two clicks.

## Stub notes are not empty

When the deep-ingest dialog identifies a new entity that deserves its own note, the agent does not just drop an empty file with a title. The stub note includes a short explanation of what the concept is, the key aspects the source surfaced, and a link back to the source that triggered its creation. It is a starting point for further thinking, not a dead-end link target.

## Configuration

Ingest reads its frontmatter templates and entity properties from settings.

In **Settings > Vault > Ingest**:

- `ingestNoteTemplate`: vault-relative path to the Markdown template used by `/ingest`. The skill reads the frontmatter block and fills it from the source.
- `ingestDeepNoteTemplate`: same idea for `/ingest-deep`.
- `meetingSummaryNoteTemplate`: same idea for `/meeting-summary`.
- `pdfStrategy`: `page-refs` (default for `/ingest`) or `markdown-mirror` (forced for `/ingest-deep`).

In **Settings > Embeddings > Knowledge Properties**:

- **Entity properties**: which frontmatter keys hold wikilinks to other notes (`Topics`, `Concepts`, `People`, `Projects`, `Sources`).
- **Category property**: which key defines the note type. Default `Category`.
- **Summary property**: which key holds the short summary. Default `Summary`.
- **Source naming convention**: the filename pattern for sources. Default `Author-Year_Title`.

Set these once to match what your vault already does. The agent uses them for every ingest run after that. See [Settings reference](/reference/settings) for the full list.

## Attachment lifetime

A chat attachment lives for **one turn only**. The parsed text from the file is available the same turn the user uploaded it. From the next turn on, `attachment_index` is gone.

For `/ingest`, this is fine: the skill calls `ingest_document` immediately on turn one. For `/ingest-deep`, the skill saves the attachment to the vault first (typically under `Attachements/`) and then runs triage and ingest against the vault path, not against the chat attachment. If the file is large, save it to the vault manually before starting the dialog.

## Attachment cleanup

For files like `IMG_20240412_183042.jpg` or `Scan_001.pdf`, the rename skill is separate:

> "Rename the attachments in this folder."

The agent proposes old-name to new-name mappings using your source naming convention, you confirm the list, and it renames in one batch while updating every wikilink and embed that referenced the old names.

## How this fits with vault health

Ingest is the write-path side of the same story that [Vault Health](/guides/vault-health) covers on the read side. Ingest prevents problems by adding new material cleanly, with provenance intact. The health check catches whatever slipped through or drifted over time. Together they keep the vault navigable without manual bookkeeping.

## Related

- [Knowledge discovery](/guides/knowledge-discovery): the semantic index and graph that ingest uses to find existing entities.
- [Vault health check](/guides/vault-health): repair work for entries that drifted.
- [Memory and personalization](/guides/memory-personalization): how Vault Operator remembers your preferred categories and conventions over time.
- [Tools reference](/reference/tools#knowledge-ingest-tools): the underlying `ingest_triage`, `ingest_document`, and `ingest_deep` tools.
