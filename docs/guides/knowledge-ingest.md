---
title: Knowledge Ingest
description: Integrate new notes, PDFs, and whole folders into your existing knowledge graph through a confirmation-based workflow.
---

# Knowledge ingest

Adding a new note to a well-kept vault is more work than writing the note. You have to figure out which topics it belongs to, link it back to the hubs that already exist, pick a category, write a short summary, maybe rename the attachment it came from, possibly create a stub for a genuinely new concept you noticed. That's the bookkeeping layer that makes a vault useful six months later, and it's the part most people quietly skip until everything's a mess.

Knowledge ingest is the workflow where Obsilo does the bookkeeping with you. You ask it to integrate a note, it reads the content, searches your vault for existing topics and concepts that match, and proposes the full set of changes before touching anything. You approve, it writes.

The single most important thing about how ingest thinks: few strong hubs, not many weak ones. When the agent recognizes a topic in a new note, it hunts for an existing hub note before it considers creating one. If you already have `[[Deep Work]]`, it isn't going to create `[[Focus]]` as a parallel entity.

## Integrating a single note

With a note open, or by naming the file:

> "Integrate this note into my vault."

The agent reads the note and pulls out the entities it finds: topics, concepts, people, projects, organizations. For each one, it runs a semantic search against your vault to see whether something already exists. Then it shows you a proposal. Which properties to set, which wikilinks to add to the body, which MOC entries to update, and which stub notes to create for things that are genuinely new. Nothing happens until you say yes. When you do, the changes go through the checkpoint system, so the whole ingest can be undone as one operation if you look at it later and change your mind.

You can edit any individual item in the proposal before approving. If the agent wants to create a `[[Motivation]]` stub but you know that's really the same as `[[Drive]]`, say so, and it uses the existing note instead.

## Stub notes aren't empty

When ingest does decide to create a new entity note, it doesn't just drop an empty file with a title. The stub includes a short explanation of what the concept is, a few key aspects, and a link back to the source that triggered its creation. It's a starting point for further thinking, not a target for links that points nowhere.

## Integrating a PDF or source document

Attach a PDF or Office document to the chat and ask:

> "Integrate this paper into my vault."

The agent switches into source-ingest mode. The PDF itself doesn't get copied into the vault. Instead, Obsilo creates a Markdown source note that represents the document, and that source note is what shows up in search, backlinks, and the graph.

While ingesting a source, the agent also extracts author, year, and title from the document, proposes a filename based on your [source naming convention](/reference/settings#knowledge-properties) (for example `Author-Year_Title.md`), populates frontmatter like `Autor`, `Jahr`, `Titel`, `Quelle`, `Zusammenfassung`, `Kategorie: Quelle`, and links the source to the topic and concept hubs it discovered along the way.

If the PDF is scanned and has no extractable text layer, Obsilo falls back to the Obsidian Text Extractor plugin's OCR cache. Anything you've already processed with Text Extractor is searchable here too, with no additional API calls.

## Integrating a whole folder

When you have a pile of imports to work through (a folder of meeting notes, exported bookmarks, migrated content from another tool), you don't have to do it one file at a time:

> "Integrate all notes in my imports/ folder."

Batch mode groups files by topic and shows proposals per group, not per file. The workflow is the same as single-note ingest: the agent reads, searches for existing entities, shows you what it wants to do, waits for approval. It's noticeably cheaper than running single ingests in a loop because the agent reuses topic searches across related files.

## Configuration

Ingest reads a few settings from [Settings > Embeddings > Knowledge Properties](/reference/settings#knowledge-properties):

- Category property: which frontmatter key holds the note's type. Default `Kategorie`.
- Summary property: which frontmatter key holds the short summary. Default `Zusammenfassung`.
- Source naming convention: the filename pattern for PDFs and other source documents. Default `Autor-Jahr_Titel`.
- MOC properties: any additional frontmatter keys that participate in your Maps of Content.

Set these once to match whatever your vault already does. The agent uses them for every ingest run after that.

## Attachment cleanup

There's a sibling skill for the attachments themselves. If your vault has files called things like `IMG_20240412_183042.jpg` or `Scan_001.pdf`, ask:

> "Rename the attachments in this folder."

The agent proposes a list of old-name to new-name mappings using your source naming convention, you confirm the list, and it renames them in one batch while updating every wikilink and embed that referenced the old names.

## How this fits with the health check

Ingest is the write-path side of the same story that [Vault Health](/guides/vault-health) covers on the read side. Ingest prevents problems by adding new material cleanly. The health check catches whatever slipped through or drifted over time. If you use both, the vault stays navigable without any real manual bookkeeping.

## Related

- [Knowledge discovery](/guides/knowledge-discovery): The semantic index and graph that ingest uses when it searches for existing entities.
- [Vault health check](/guides/vault-health): Repair work for the bookkeeping that drifted.
- [Memory and personalization](/guides/memory-personalization): How Obsilo remembers your preferred categories and conventions over time.
