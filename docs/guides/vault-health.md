---
title: Vault Health Check
description: Find and fix structural problems in your vault like orphaned notes, broken links, and inconsistent tags.
---

# Vault health check

Large vaults accumulate structural problems over time. Notes get orphaned, links break, tags diverge in spelling, and MOC pages lose backlinks. The vault health check finds these issues so you can fix them.

## Running a health check

Ask the agent directly:

> "Check my vault for structural issues."

Or be specific about what you want to check:

> "Find all orphaned notes that have no incoming links."

The agent calls `vault_health_check`, which runs SQL queries against your knowledge database. No LLM tokens are used for the scan itself.

## What it checks

| Check | What it finds |
|-------|--------------|
| **Orphaned notes** | Notes with zero incoming wikilinks. Nobody links to them. |
| **Missing backlinks** | MOC or hub notes that link outward but are not linked back. |
| **Broken links** | Wikilinks pointing to notes that do not exist in your vault. |
| **Weak clusters** | Semantically similar note pairs with no link between them. |
| **Inconsistent tags** | Spelling variants of the same tag, like `#meeting` and `#meetings`. |
| **Category mismatches** | Notes whose folder or properties conflict with ontology categories. |

## Fixing issues

When the agent reports findings, you have two options:

**Option 1: Let the agent fix them.** Ask:

> "Fix the missing backlinks you found."

The agent adds wikilinks, renames tags, or moves notes as needed. Each change requires your approval and creates a checkpoint.

**Option 2: Use the repair modal.** The Vault Health Repair Modal shows all findings grouped by category. You select which ones to fix. Every fix is backed by a checkpoint, so you can undo individual changes.

## Requirements

The vault health check needs a built semantic index. If you haven't set one up yet, see [Your First Knowledge Workflow](/tutorials/knowledge-workflow).

Without an index, the check still finds broken links and orphaned notes, but cannot detect weak clusters or implicit connections.

## When to run it

There is no fixed schedule. Good times to run a check:

- After adding a batch of new notes (importing, migrating)
- After reorganizing your folder structure
- Once a month as general maintenance
- When search results feel incomplete

## Next steps

- [Knowledge discovery](/guides/knowledge-discovery): Semantic search and the knowledge graph
- [Safety and control](/guides/safety-control): How checkpoints protect your changes
