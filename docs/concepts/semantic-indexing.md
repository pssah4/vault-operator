---
title: Semantic indexing
description: How Vault Operator chunks, embeds, and stores your notes for offline semantic search.
---

# Semantic indexing

Semantic search needs an index. Vault Operator builds one locally, embeds chunks of your notes into numerical vectors, and stores everything in a single SQLite database next to the plugin. This page covers how the index is built, how it stays current, and how it differs from the [knowledge layer](./knowledge-layer.md) on top of it.

## What the index holds

For every text file in your vault (Markdown by default, optionally PDF), the index stores:

- A row in the `documents` table with path, mtime, and file size.
- One row per chunk in the `vectors` table, with the chunk text, an offset, and a Float32Array BLOB for the embedding.
- Optional contextual prefix per chunk if contextual retrieval is enabled (see below).
- A staleness flag per chunk, set when the source file's mtime moves ahead of the row's mtime.

The database itself (`knowledge.db`) lives under the agent folder (default `.obsidian-agent`). It uses the same atomic-write and snapshot machinery described in the [Troubleshooting](/reference/troubleshooting#knowledge-database-errors) page: an `integrity_check` runs on open, daily snapshots land in `.bak/`, and a lock file prevents two Obsidian instances from corrupting the file.

## Chunking

Notes are split on heading boundaries with a soft cap of 2000 characters per chunk by default. A note longer than that gets multiple chunks; a short note becomes a single chunk. The chunk size is configurable in `SemanticIndexService`, but changing it forces a full rebuild because chunk offsets shift.

PDF indexing is off by default. Enabling it adds OCR for image-only PDFs, which is slower and error-prone.

## Embedding

Each chunk is embedded by whichever model you picked in **Settings > Embeddings**. The default is a local ONNX model (Xenova/all-MiniLM-L6-v2 via transformers.js), which downloads on first use and runs entirely on your machine. Cloud options (OpenAI `text-embedding-3-small`, Google, custom OpenAI-compatible endpoints) are available for higher quality at the price of API calls.

Embeddings are batched (16 chunks per call by default) and the database commits every 20 files. These numbers balance memory use against latency and are configurable in `SemanticIndexService`.

## Staying current

Three triggers update the index:

- **File-change listener.** Debounced. When you save a note, only that note's chunks are re-embedded. The rest of the index is untouched.
- **Stale flag.** Every chunk carries an mtime. If the source file's mtime moves ahead, the chunk is marked stale and re-embedded on the next pass.
- **Manual rebuild.** **Settings > Embeddings > Rebuild index** drops everything and starts over. Use it after changing the embedding model or the chunk size.

A queue serializes concurrent updates so the embedding API never gets pummeled.

## Contextual retrieval (opt-in)

Plain chunk embeddings sometimes miss domain-specific queries. Contextual retrieval prepends an LLM-generated summary of the chunk's context (the surrounding section, the note's topic) before embedding. The prepended context is short but disambiguates chunks that would otherwise read the same.

This is the Phase 2 stage from ADR-51. It adds latency and an LLM call per chunk to the build, so it is opt-in. If the context model fails mid-build, contextual retrieval silently disables for the session and falls back to plain chunks.

During context generation, chunks are also tagged volatile, evolving, or stable. Downstream features (freshness scoring, implicit-connection ranking) use these tags. See FEATURE-2006 for details.

## How this fits with the knowledge layer

Semantic indexing is the storage layer. The [knowledge layer](./knowledge-layer.md) sits on top:

- Stage 1 is a cosine-similarity search against the vector store. This page is about that store.
- Stage 2 is graph expansion (wikilinks, backlinks, tags). It reads vault structure, not the vector store.
- Stage 3 is implicit-connection mining, a background job that re-uses chunk embeddings to surface unlinked-but-related pairs.

Most retrieval calls hit Stage 1 only. The other two stages activate when the user asks for connections or for missing-link detection.

## Limits

- The Xenova model (~23 to 90 MB depending on variant) downloads once and caches locally. First indexing is slow.
- Changing the chunk size forces a full rebuild. It is deterministic but slow on large vaults.
- Contextual retrieval is on by default but silently disables if the context model fails. Check the logs if results feel weaker than expected.
- The index does not deduplicate near-identical notes. Two notes that say the same thing both appear in results.
- PDF indexing trades cost for coverage. Keep it off unless you actually need it.

## Related decisions

- ADR-03 (v2) and ADR-50 (v3): from vectra to KnowledgeDB
- ADR-51: contextual retrieval design
- FEATURE-2006: freshness tagging
- AUDIT-013: per-path exclusion via the `isIgnored` predicate

See also: [Knowledge layer](./knowledge-layer.md), [Knowledge discovery guide](/guides/knowledge-discovery), [Settings reference: Embeddings](/reference/settings#embeddings).
