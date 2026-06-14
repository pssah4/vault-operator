---
title: Search Your Vault by Meaning
description: Set up an embedding model, build the semantic index, and run your first meaning-based search across your vault.
---

# Search your vault by meaning

This tutorial gets semantic search running. Twenty minutes if you have an OpenAI key handy, longer if you index a big vault.

**Before you start:**

- Vault Operator installed and one model configured. If not, do [Installation and Quick Start](/tutorials/getting-started) first.
- At least twenty notes in your vault. Fewer than that and semantic search has nothing meaningful to compare.

## Step 1: Pick an embedding model

Semantic search needs an embedding model to convert your notes into vectors. Open **Settings > Embeddings** and pick one:

| Option | Provider | Why |
|--------|----------|-----|
| Default | OpenRouter `qwen/qwen3-embedding-8b` | Strong quality, one API key covers chat and embeddings |
| Cheapest | OpenAI `text-embedding-3-small` | Fast, low cost, good quality |
| Local | Ollama `nomic-embed-text` | Private, no API key needed |

Enter your API key if the provider needs one, click **Test connection** to verify it works, and leave the other settings at their defaults.

## Step 2: Build the index

Still in **Settings > Embeddings**, click **Build index**. Vault Operator processes your notes in batches. A small vault (under 100 notes) finishes in about a minute, 500 notes take a few minutes, 2000+ notes run for ten to twenty minutes.

The progress bar shows how many notes have been processed. You can keep editing notes in Obsidian while it runs. Changed files get re-indexed automatically.

Wait for the confirmation that the first build is done before running the next step.

## Step 3: Run your first meaning-based search

Open the Vault Operator sidebar and ask a question that does not match any exact filename:

> "What do I know about improving my morning routine?"

Instead of matching exact words, the agent finds notes whose meaning is related. A note titled "Sleep Habits" or "Daily Review Template" might show up, even though neither contains the words "morning routine".

Watch the activity block. You will see `semantic_search` being called. The results include a relevance score for each note.

## Step 4: Try a graph-walking question

Once semantic search finds the relevant notes, the agent can follow wikilinks, backlinks, and shared tags to pull in related content. Ask something that benefits from connections:

> "Find all notes related to productivity and show me how they connect to each other."

In the activity block you will see semantic search first, then `get_linked_notes` or `search_by_tag` follow-ups. Notes that link to each other or share properties get added to the result set.

## Step 5: Surface implicit connections (optional)

Go to **Settings > Embeddings** and enable **Implicit connections**. This runs a background job that compares all your note vectors and flags pairs that are semantically similar but not linked.

After the analysis completes (a few minutes on larger vaults), ask:

> "Are there notes in my vault that should be linked but aren't?"

The agent shows you note pairs that discuss similar topics without any wikilink between them. For each pair, you can decide whether to add a link or dismiss the suggestion.

This is the moment most vaults reveal hidden structure. Notes you wrote months apart turn out to be on the same topic.

## What you learned

You now have semantic search running and can find notes by meaning rather than keywords. You have also seen the graph-walking behavior and the implicit connections analysis.

## Next steps

Now that the index exists, two natural next moves:

- [Capture a PDF with `/ingest`](./quick-ingest) to add new material to the vault with provenance intact.
- [Make sense of a research paper with `/ingest-deep`](./deep-ingest) for material that deserves a guided reading session.

For the full picture of how search and the knowledge graph fit together, see [knowledge discovery](/guides/knowledge-discovery).
