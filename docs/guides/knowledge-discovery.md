---
title: Knowledge Discovery
description: Semantic search, knowledge graph, implicit connections, and local reranking.
---

# Knowledge Discovery

Most search tools match exact words. Obsilo understands meaning. A search for "improving focus" can find a note titled "Deep Work Techniques" even though the words do not overlap.

## What is semantic search?

Traditional keyword search looks for exact text matches. Semantic search converts your notes into numerical vectors (embeddings) that represent their meaning. Your query is converted the same way, and the system finds notes whose vectors are closest to yours.

This means:
- *"recipes for pasta"* finds notes about Italian cooking, even if they never say "pasta"
- *"how to sleep better"* finds your note titled "Evening Wind-Down Routine"
- *"budget planning"* finds notes about financial forecasting and expense tracking

## Setup

Semantic search requires an embedding model to convert text into embeddings. You set this up once; Obsilo handles the rest.

1. Open **Settings > Obsilo Agent > Embeddings**
2. Choose an embedding model from the dropdown
3. Click **Build Index** to process your vault

:::tip Which embedding model?
Any configured provider that supports embeddings will work. If you are using OpenAI or a compatible API, the default embedding model is a good starting point. Local models via Ollama work well if you want everything to stay on your machine.
:::

### Building the index

The first build processes every note in your vault. This can take a few minutes for large vaults (1000+ notes). After that, the index updates automatically:

- On startup: new or changed files are re-indexed
- On file changes: edits trigger re-indexing after a short delay
- Manually: use the Rebuild Index button in settings at any time

:::info Your notes stay local
Embeddings are stored in a local database inside your vault. If you use a cloud embedding model, note content is sent to the provider for processing, but the resulting embeddings live only on your machine. With a local model, nothing leaves your device.
:::

## How search works under the hood

When you or the agent run a semantic search, Obsilo combines multiple retrieval strategies:

### 1. BM25 (keyword matching)

A fast, traditional ranking algorithm. It finds notes that contain your search terms and ranks them by relevance. Good for specific terms like names, dates, or technical jargon.

### 2. Semantic similarity (embedding matching)

Compares the meaning of your query against the embeddings of every chunk in your vault. Finds conceptually related notes even without keyword overlap.

### 3. Reciprocal rank fusion (RRF)

Combines the results from BM25 and semantic search into a single ranked list. Notes that score well on both methods rise to the top. This hybrid ranking beats either method alone.

## The knowledge graph

Beyond search, Obsilo builds a knowledge graph from the structure already in your vault:

- **Wikilinks:** `[[note]]` connections between your notes
- **Tags:** shared tags create implicit groupings
- **MOC properties:** Maps of Content link related topics

When the agent searches, it can expand results through the graph. If a search finds Note A, and Note A links to Note B, the agent can follow that link to pull in related content. You configure how many hops the graph expansion follows in settings.

**Example:** Searching for "machine learning" finds your note on Neural Networks. Graph expansion then follows its wikilinks to your notes on Training Data and Model Evaluation, notes that search alone would miss.

## Implicit connections

Obsilo can find notes that are semantically similar but not linked to each other: two notes about closely related topics, written months apart, that you never connected.

When it finds them, a suggestion banner appears in the sidebar offering to show you the discovered relationships.

:::tip Scales with vault size
The larger your vault, the more useful implicit connections get.
:::

## Local reranking

After the initial search returns candidates, Obsilo can run a second pass using a cross-encoder model to improve result quality. This model runs entirely on your device via WebAssembly. No data is sent anywhere.

The reranker (based on ms-marco-MiniLM) reads each candidate alongside your query and produces a more accurate relevance score. False positives get pushed down; actually relevant results move up.

Toggle it in **Settings > Obsilo Agent > Embeddings > Local Reranking**.

## Contextual retrieval

When enabled, Obsilo enriches each chunk with surrounding context before creating its embedding. It reads the note around a chunk and adds a brief description of what that chunk covers. This improves search accuracy for short or ambiguous passages.

For example, a chunk containing just a table of numbers becomes much more findable when the system adds context like "quarterly revenue figures from the 2025 financial review."

## Confidence scoring

Not all links are equal. A wikilink you typed by hand is a stronger signal than a similarity score computed in the background. The graph tracks this difference.

Wikilinks get the highest confidence. MOC property links (`related`, `parent`, and similar frontmatter fields) get medium confidence. Implicit connections from semantic similarity get the lowest. When search results include graph-expanded notes, these scores affect ranking, so a note reached through a direct wikilink outranks one reached through a weak implicit connection.

## Knowledge freshness

Search results include a freshness signal based on file modification time. Notes you edited recently get a small relevance boost. A note you updated yesterday about "project status" will rank above one you haven't touched in six months on the same topic. Older notes still appear, they just don't get the boost.

## Community detection

The knowledge graph often contains natural clusters: groups of notes that link to each other frequently but have few connections to the rest of the vault. Obsilo runs the Louvain algorithm at startup to find these clusters. The results feed into vault health checks, where they help spot notes whose category tag doesn't match the cluster they actually belong to.

## Configuration

| Setting | Where | Recommendation |
|---------|-------|----------------|
| **Embedding model** | Settings > Embeddings | Choose based on your privacy needs and provider |
| **Chunk size** | Settings > Embeddings > Advanced | Default works well for most vaults. Smaller chunks (256 tokens) for short notes, larger (1024) for long-form writing |
| **Excluded folders** | Settings > Embeddings > Excluded | Exclude templates, archive, or attachment folders to keep the index focused |
| **Auto-index** | Settings > Embeddings | Keep enabled for automatic updates on file changes |
| **Graph hops** | Settings > Embeddings > Graph | 1-2 hops is usually enough. More hops find broader connections but may include noise |
| **Local reranking** | Settings > Embeddings | Enable for better result quality at minimal performance cost |

:::warning Large vaults
For vaults with 5000+ notes, the initial index build may take 10-20 minutes depending on your embedding model. After that, incremental updates are fast. Consider excluding attachment folders or archives you rarely search.
:::

## Examples

- *"Find notes related to my goals for this year"* (semantic search finds notes about resolutions, plans, and objectives)
- *"What do I know about distributed systems?"* (searches by meaning across your vault)
- *"Show me notes similar to @architecture-decisions"* (finds thematically related notes)
- *"Are there any notes I should link together?"* (triggers implicit connection discovery)

## Next steps

- [Vault Operations](/guides/vault-operations): Reading, writing, and organizing your files
- [Memory & Personalization](/guides/memory-personalization): How Obsilo remembers your preferences
- [Settings Reference](/reference/settings): All embedding and search settings explained
