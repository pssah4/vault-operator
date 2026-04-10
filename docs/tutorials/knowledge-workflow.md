---
title: Your First Knowledge Workflow
description: Set up semantic search, discover hidden connections, and check your vault's health.
---

# Your first knowledge workflow

By the end of this tutorial you will have:

- Set up an embedding model for meaning-based search
- Run your first semantic search
- Found notes connected through the knowledge graph
- Discovered implicit connections between unlinked notes
- Checked your vault for structural issues

**Prerequisites:** Obsilo installed and a model configured. At least 20-30 notes in your vault. See [Getting Started](/tutorials/getting-started) if you haven't set up yet.

## Step 1: Configure an embedding model

Semantic search needs an embedding model to convert your notes into vectors. Open **Settings > Embeddings**.

**Recommended setup:**

| Option | Provider | Why |
|--------|----------|-----|
| Quickest | OpenAI `text-embedding-3-small` | Fast, cheap, good quality |
| Free | Google Gemini (if available) | No cost, decent quality |
| Local | Ollama `nomic-embed-text` | Private, no API key needed |

1. Select a provider and enter your API key (if needed)
2. Click **Test Connection** to verify it works
3. Leave the other settings at their defaults

## Step 2: Build the index

Still in **Settings > Embeddings**, click **Build Index**. Obsilo processes your notes in batches:

- Small vault (< 100 notes): Takes about a minute
- Medium vault (500 notes): A few minutes
- Large vault (2000+ notes): 10-20 minutes

The progress bar shows how many notes have been processed. You can keep working in Obsidian while it runs.

Once done, you will see a confirmation with the number of indexed notes.

## Step 3: Search by meaning

Open the Obsilo sidebar and try a semantic search:

> "What do I know about improving my morning routine?"

Instead of matching exact words, the agent finds notes whose meaning is related. A note titled "Sleep Habits" or "Daily Review Template" might show up, even though neither contains the words "morning routine".

Watch the activity block. You will see `semantic_search` being called. The results include a relevance score for each note.

## Step 4: Explore the knowledge graph

Now try a question that pulls in connections:

> "Find all notes related to productivity and show me how they connect to each other."

The agent uses graph expansion: after finding relevant notes via semantic search, it follows wikilinks, backlinks, and shared tags to discover related content. Notes that link to each other or share properties get pulled into the results.

## Step 5: Discover implicit connections

Go to **Settings > Embeddings** and enable **Implicit Connections**. This runs a background job that compares all your note vectors and flags pairs that are semantically similar but not linked.

After the analysis completes (this can take a few minutes on larger vaults), ask:

> "Are there notes in my vault that should be linked but aren't?"

The agent shows you note pairs that discuss similar topics without any wikilink between them. For each pair, you can decide whether to add a link or dismiss the suggestion.

## Step 6: Check your vault's health

Ask the agent to run a structural check:

> "Run a health check on my vault."

The agent calls `vault_health_check` and reports findings grouped by category:

- **Orphaned notes:** Notes with no incoming links
- **Missing backlinks:** One-directional MOC links
- **Broken links:** Wikilinks pointing to notes that do not exist
- **Weak clusters:** Semantically similar notes that are not linked
- **Inconsistent tags:** Spelling variants like `#meeting` vs `#meetings`

You can fix issues directly from the results modal, and every fix creates a checkpoint you can undo.

## Step 7: See what was remembered

After this session, Obsilo has learned something about you. Check what it remembers:

> "What do you remember about me?"

The agent pulls from its 3-tier memory: the current session summary, any long-term facts it extracted, and your user profile. Over time, it uses these memories to give better answers and skip questions it already knows the answer to.

## What you learned

You now have semantic search running, which means Obsilo can find notes by meaning rather than just keywords. You know how to explore connections, discover missing links, and keep your vault healthy.

**Next steps:**

- [Knowledge discovery](/guides/knowledge-discovery): All search and graph features in detail
- [Vault health check](/guides/vault-health): Regular maintenance for your vault
- [Memory and personalization](/guides/memory-personalization): How the agent builds your profile
