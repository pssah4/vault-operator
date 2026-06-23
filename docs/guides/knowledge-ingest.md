---
title: Knowledge ingest
description: Pull PDFs, web clips, and Office documents into your vault with block-level provenance, a quick single-pass capture, and a five-step sense-making session for sources that deserve real reading.
---

# Knowledge ingest

Adding a new source to a well-kept vault is more work than reading the source. You decide whether it is worth the effort, figure out where it belongs, link it to hubs that already exist, write a summary that keeps the caveats, and keep a way to trace any claim back to the paragraph that produced it. That is the bookkeeping layer that makes a vault useful six months later, and most people quietly skip it until everything is a mess.

Vault Operator's ingest workflow does the bookkeeping with you. Two paths cover the daily cases: a single-pass `/ingest` for inbox capture, and a five-step `/ingest-deep` for sense-making on research papers, long reports, and anything that needs more than a summary.

Both paths share two rules:

1. One source produces one or more notes that fit the vault, not a chat log.
2. Every key statement in the output ends with a `↗` link that resolves to the exact block in the source. See [block-level provenance](/concepts/provenance) for the why.

## /ingest: single-pass capture

For an inbox PDF, a webclip, or a meeting export. Drop the file into the chat or point the agent at a vault path:

> "Ingest this report."

The skill makes one tool call (`ingest_document`). No triage card, no decision dialog. The result is a single Markdown note containing:

- Frontmatter: source path, source type, ingest date, plus the fields your template requires (author, year, summary, tags).
- An overview section with two or three sentences capturing the core message.
- A `## Key Take-Aways` section with key statements, each ending with a position marker (`↗` link, target shape depends on source type, see [provenance](/concepts/provenance)).
- The full original text, appended automatically by the tool. No LLM token cost for the body.

Click the `↗` and you land at the paragraph that produced the claim.

Use `/ingest` when you want the source captured in the vault for later, without a structured sense-making session right now. If you want to triage the source first (cluster match, source diversity, tension hint), use `/ingest-deep` instead, which starts with exactly that step.

## /ingest-deep: a guided five-step session

For research papers, long reports, domain-specific DOCX/PPTX, anything that wants a real reading session. Five to fifteen minutes of dialog with the model.

The /ingest-deep skill follows a strict five-step sequence. The agent will not improvise. You stay in control of every meaningful decision.

| Step | What the agent does | What you do |
|------|--------------------|-------------|
| 1 | Triage and decision: `ingest_triage` runs against the vault's ontology (cluster match, tension hint, source diversity, related notes, related facts, related history), then asks: ingest, defer, or discard? | Read the triage card, then choose. If you defer or discard, the workflow ends. |
| 2 | Output mode and topic selection: the agent reads the source, proposes a numbered topic table, then asks which topics to extract and which output mode to use. | Answer with "All" or a list of numbers, then pick an output mode. |
| 3 | `ingest_deep` sets block IDs in the source. | Wait. |
| 4 | The agent writes the sense-making note (one note or several zettel, depending on the chosen mode). | Review and approve. |
| 5 | A single `update_frontmatter` on the source links every new note via the `Notizen:` property (or whatever your `backlinksProperty` is set to). | Done. |

Behind the scenes that maps to nine tool calls. The user-visible plan is the five steps above. The agent stops at every `ask_followup_question` and waits for your answer. The stop sits at output-mode selection, not before it.

### The triage card (step 1)

Triage returns a single card with:

- **Cluster match.** Does this source belong to a topic hub you already maintain, or is it new?
- **Tension hint.** Does it confirm what you have, extend it, or contradict it?
- **Source diversity.** Are you overloading one domain (echo-chamber warning)?
- **Related notes from vault.** Semantic search inside the triage call, top hits returned in the card. Self-exclusion prevents the source matching itself.
- **Related facts from memory.** Token-overlap search across up to 5000 stored facts.
- **Related chat history.** Search across past conversation chunks that mention the same material.
- **Recommendation.** Ingest, defer to later, or discard.

About ten seconds, around $0.05 per pass. If the recommendation is *discard* or *later*, the workflow stops there and the decision is logged so the same source does not trigger triage twice.

The triage card stays in the chat for the whole session, so you can reread it before answering the output-mode question.

### Output modes (step 2)

- **One sense-making note** (`source-plus-summary`). One dense note covering all chosen topics. Each take-away ends with a block-ref to the source.
- **Multiple atomic zettel** (`source-plus-multi-zettel`). One bibliography note plus N atomic notes, Luhmann-style. For material that wants to be split.
- **Source-only with take-aways in chat** (`source-only`). The triage card and a clean source note get written. Take-aways stay in the chat dialog. Per-aspect detail notes are created on demand later, once the dialog reveals what is worth a separate zettel.
- **Stop.** You decided that none of the modes fit. Nothing further is written. The triage decision is still logged.

Defaults are conservative. For a typical inbox source, "source-only with take-aways in chat" works best. The skill does not push every reading session into a giant sense-making note unless you ask for it.

### Why block-level provenance matters

A note without a path back decays. A vault full of decayed notes is a graveyard.

Block-level provenance solves the related risk that summarization patterns introduce: derived notes drop caveats, dates, minority views, and exact wording. Once you query the derived note instead of the original, those compressions become part of your knowledge base. With every claim wrapped in a `↗` link to the source paragraph, you can always re-verify against the original in two clicks. See [block-level provenance](/concepts/provenance) for the full mechanism.

### PDF handling

For PDFs, deep ingest first converts the source into a Markdown mirror with block IDs. Each paragraph in the mirror gets an Obsidian block anchor. Sense-making notes then reference these anchors instead of pages, so a click takes you to the exact paragraph rather than a vague page number. The mirror lands in your inbox folder, not next to the original PDF.

## Stub notes are not empty

When the deep-ingest dialog identifies a new entity that deserves its own note, the agent does not drop an empty file with a title. The stub note includes a short explanation of what the concept is, the key aspects the source surfaced, and a link back to the source that triggered its creation. It is a starting point for further thinking, not a dead-end link target.

## Chat attachments and auto-save

Chat attachments behave the way you would expect.

When you drag a PDF (or DOCX, XLSX) into the chat, Vault Operator writes the binary to your Obsidian attachment folder (`attachmentFolderPath` from `.obsidian/app.json`, default `Attachments/`). The agent then references the file by its vault path, so follow-up turns can rename it, parse it, or ingest it without you re-uploading.

This means `/ingest-deep` works directly on a chat-dropped PDF. No manual "save to vault first" step. The vault path appears in the `<attached_document>` block the agent receives, and the rest of the skill operates against that path.

PPTX and POTX templates land in `Tools & Settings/Templates` instead, since that is where the office pipeline looks for them.

## Configuration {#frontmatter-template}

Ingest reads its frontmatter templates and entity properties from settings.

Under **Settings > Vault Operator > Vault > Vault**, in the Ingest section:

- `ingestNoteTemplate`: vault-relative path to the Markdown template used by `/ingest`. The skill reads the frontmatter block and fills it from the source. The First-Run Wizard preselects `Quelle Template.md` (German vaults) or `Source Template.md` (English vaults) inside the Templates folder configured in Obsidian's core Templates plugin (read from `.obsidian/templates.json`). Empty by default if the wizard was skipped.
- `ingestDeepNoteTemplate`: same idea for `/ingest-deep`. Same default behaviour from the wizard.
- `meetingSummaryTemplate`: same idea for `/meeting-summary`.
- `pdfStrategy`: `page-refs` (default for `/ingest`) or `markdown-mirror` (forced for `/ingest-deep`).

Under **Settings > Vault Operator > Providers > Embeddings**, in the Graph expansion section:

- **Map-of-content property names**: which frontmatter keys hold wikilinks to other notes. Default: `Themen, Konzepte, Personen, Notizen, Meeting-Notes, Quellen` (six keys, German). Edit the list to match your vault, for example `Topics, Concepts, People, Notes, Meeting-Notes, Sources` for an English vault.
- **Category property**: which key defines the note type. Default: `Kategorie`.
- **Backlinks property**: which key holds the reverse link from a source to its derived notes. Default: `Notizen`. Used by step 5 of `/ingest-deep` and by the vault health repair pass.
- **Summary property**: which key holds the short summary. Default: `Zusammenfassung`.
- **Source naming convention**: the filename pattern for sources. Default: `Autor-Jahr_Titel`.

These defaults reflect a German Zettelkasten vault. Translate them to match your vault once and the agent uses your conventions for every ingest run after that. See [Settings reference](/reference/settings) for the full list.

## Attachment cleanup

For files like `IMG_20240412_183042.jpg` or `Scan_001.pdf`, the rename skill is separate:

> "Rename the attachments in this folder."

The agent proposes old-name to new-name mappings using your source naming convention, you confirm the list, and it renames in one batch while updating every wikilink and embed that referenced the old names.

## How this fits with vault health

Ingest is the write-path side of the same story that [vault health](/guides/vault-health) covers on the read side. Ingest prevents problems by adding new material cleanly, with provenance intact. The health check catches whatever slipped through or drifted over time. Together they keep the vault navigable without manual bookkeeping.

## Related

- [Deep ingest tutorial](/tutorials/deep-ingest): walk through a complete `/ingest-deep` session step by step.
- [Quick ingest tutorial](/tutorials/quick-ingest): capture an inbox PDF in under a minute.
- [Block-level provenance](/concepts/provenance): the link system that ties take-aways to source paragraphs.
- [Knowledge discovery](/guides/knowledge-discovery): the semantic index and graph that ingest uses to find existing entities.
- [Vault health check](/guides/vault-health): repair work for entries that drifted.
- [Memory and personalization](/guides/memory-personalization): how Vault Operator remembers your preferred categories and conventions over time.
- [Tools reference](/reference/tools#knowledge-ingest): the underlying `ingest_triage`, `ingest_document`, and `ingest_deep` tools.
