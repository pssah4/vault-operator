---
title: Your First Knowledge Workflow
description: Set up semantic search, discover hidden connections, and check your vault's health.
---

# Your first knowledge workflow

This tutorial walks you through setting up an embedding model, running semantic search, finding connections through the knowledge graph, surfacing unlinked-but-related notes, and running a vault health check.

**Prerequisites:** Vault Operator installed and a model configured, plus at least 20-30 notes in your vault. See [Getting Started](/tutorials/getting-started) if you haven't set up yet.

## Step 1: Configure an embedding model

Semantic search needs an embedding model to convert your notes into vectors. Open **Settings > Embeddings** and pick one:

| Option | Provider | Why |
|--------|----------|-----|
| Quickest | OpenAI `text-embedding-3-small` | Fast, cheap, good quality |
| Free | Google Gemini (if available) | No cost, decent quality |
| Local | Ollama `nomic-embed-text` | Private, no API key needed |

Enter your API key if the provider needs one, click **Test Connection** to verify it works, and leave the other settings at their defaults.

## Step 2: Build the index

Still in **Settings > Embeddings**, click **Build Index**. Vault Operator processes your notes in batches. A small vault (under 100 notes) finishes in about a minute, 500 notes take a few minutes, and 2000+ notes run for 10-20 minutes.

The progress bar shows how many notes have been processed. You can keep editing notes in Obsidian while it runs, and changed files get re-indexed automatically. Semantic search only returns useful results once the first build is done, so wait for the confirmation before running step 3.

## Step 3: Search by meaning

Open the Vault Operator sidebar and try a semantic search:

> "What do I know about improving my morning routine?"

Instead of matching exact words, the agent finds notes whose meaning is related. A note titled "Sleep Habits" or "Daily Review Template" might show up, even though neither contains the words "morning routine".

Watch the activity block. You will see `semantic_search` being called. The results include a relevance score for each note.

## Step 4: Explore the knowledge graph

Now try a question that pulls in connections:

> "Find all notes related to productivity and show me how they connect to each other."

The agent uses graph expansion. After finding relevant notes via semantic search, it follows wikilinks, backlinks, and shared tags to pull in related content. Notes that link to each other or share properties get added to the result set.

## Step 5: Discover implicit connections

Go to **Settings > Embeddings** and enable **Implicit Connections**. This runs a background job that compares all your note vectors and flags pairs that are semantically similar but not linked.

After the analysis completes (this can take a few minutes on larger vaults), ask:

> "Are there notes in my vault that should be linked but aren't?"

The agent shows you note pairs that discuss similar topics without any wikilink between them. For each pair, you can decide whether to add a link or dismiss the suggestion.

## Step 6: Check your vault's health

Ask the agent to run a structural check:

> "Run a health check on my vault."

The agent calls `vault_health_check` and reports findings grouped by type:

| Finding | What it means |
|---------|---------------|
| Orphaned notes | Notes with no incoming links |
| Missing backlinks | One-directional links where the target doesn't link back |
| Broken links | Wikilinks pointing to notes that no longer exist |
| Weak clusters | Semantically similar notes that aren't linked yet |
| Inconsistent tags | Spelling variants like `#meeting` vs `#meetings` |
| Category mismatches | Notes whose category property disagrees with the cluster they belong to |
| God nodes | Hub notes with too many connections to still act as useful indexes |

Open the repair modal from the sidebar badge to work through them. Findings have three actions: Repair applies a mechanical fix, Discuss opens a fresh agent chat that walks through the specific finding with you, and Dismiss hides a finding that's actually fine by design. Every repair creates a checkpoint you can undo.

## Step 7: See what was remembered

After this session, Vault Operator has learned something about you. Check what it remembers:

> "What do you remember about me?"

The agent pulls from its 3-tier memory: the current session summary, any long-term facts it extracted, and your user profile. Over time it uses these to give better answers and skip questions it already knows the answer to.

## Step 8: Integrate a note or a whole folder

Ingest is the other side of discovery. Instead of searching for something, you add new material to the vault in a way that keeps the graph intact. For a single note:

> "Integrate this note into my vault."

For a folder of imports, bookmarks, or meeting notes:

> "Integrate all notes in my imports/ folder."

The agent reads each note, searches for topics it already knows, and proposes the full set of changes (frontmatter, backlinks, MOC entries, any new stub notes) before writing anything. You confirm and it applies. Batch runs group thematically similar files and show proposals per group rather than per file.

See [Knowledge ingest](/guides/knowledge-ingest) for the full workflow.

## What you learned

You now have semantic search running, which means Vault Operator can find notes by meaning rather than just keywords. You also know how to walk the graph, surface missing links, run a health check, and bulk-import new content.

## Further reading

[Knowledge discovery](/guides/knowledge-discovery) covers the search and graph features in detail. [Knowledge ingest](/guides/knowledge-ingest) is the full workflow for adding new notes, PDFs, and folders. [Vault health check](/guides/vault-health) is worth running regularly. [Memory and personalization](/guides/memory-personalization) explains how the agent builds your profile.
