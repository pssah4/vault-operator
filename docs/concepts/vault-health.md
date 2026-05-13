---
title: Vault health
description: How Vault Operator monitors the structural integrity of your knowledge graph, scores cluster freshness, and surfaces problems through severity-tiered findings.
---

# Vault health

Vault Operator runs continuous structural checks on your vault and surfaces problems through a single repair modal. The system is distinct from the `vault_health_check` tool: the tool is one of three ways the checks fire, alongside a silent background pass and a periodic web-update pass.

## What gets checked

Nine classes of finding, computed against the [knowledge layer](./knowledge-layer.md):

| Check | What it finds |
|-------|---------------|
| Orphaned notes | Notes with zero inbound links |
| Broken links | Wikilinks pointing to files that no longer exist |
| Weak clusters | Semantically similar notes with no wikilink between them |
| God nodes | Hub notes with so many outbound links they stop being useful indexes |
| Stale clusters | Cluster freshness score below the configured threshold |
| Inconsistent tags | Spelling variants like `#meeting` vs `#meetings` |
| Category mismatches | A note's declared category does not match the cluster it actually sits in |
| Source concentration | A cluster draws too heavily from one source domain |
| Frontmatter conflicts | Conflicting or contradictory property values across a cluster |

The freshness score is the heart of the system. It runs per cluster, on a 0-100 scale, with three weighted inputs (see `src/core/health/FreshnessScorer.ts`):

- 60% content age, scaled against the cluster's half-life
- 30% coverage drift (how many linked notes have themselves gone stale)
- 10% stale-reference rate (broken external links)

Thresholds map to severity: under 30 is Critical, 30 to 50 is Warning, 50 to 70 is Hint, above 70 is fine.

## How checks fire

Three trigger paths:

**Stufe 1 (silent indexing pass).** The freshness scorer runs every time the semantic index updates. Findings are persisted to the cluster metadata table. No UI noise, no LLM call.

**Stufe 2 (activity-based hint).** When you open or edit a note in a cluster that scores below 70, the trigger may offer a subtle hint with a light web-update option. Each cluster is rate-limited to one hint per 7 days, and the global cap is 5 hints per day by default (configurable in `src/core/health/Stufe2ActivityTrigger.ts`).

**Stufe 3 (weekly periodic job).** A background job iterates the lowest-scoring clusters, runs a semantic pre-filter (a yes / no / unsure LLM call), and for "yes" clusters performs a light web search before generating findings. The job respects a weekly USD budget (default 2.00 USD, configurable), notifies you at 80% spend, and stops at the hard cap.

The `vault_health_check` tool is the user-triggered version of the same pipeline: it runs the structural checks on demand and returns a Markdown report.

## What you see

Findings land in the Vault Health Repair modal, grouped by severity. Each finding has up to three actions:

- **Repair** for the handful of checks the modal can fix mechanically: missing backlinks, category mismatches, inconsistent tags.
- **Discuss** to open a fresh chat scoped to that single finding.
- **Dismiss** to mark the finding as accepted by design.

A colored badge in the sidebar reflects the worst-severity finding. The badge is the primary entry point to the modal.

## Tunables

In **Settings > Embeddings > Vault health check**:

- **Enable vault health check** keeps the structural scans running on vault open.
- **Show health badge** toggles the sidebar badge.
- **God-node threshold** sets the connection count above which a hub is flagged. Default is 50; raise it for very large vaults.

Stufe 2 cooldowns and the Stufe 3 budget are currently code constants. ADR-106 and ADR-105 cover the design rationale.

## Limits

- Stufe 2 and 3 use LLM calls. If the API fails, the cluster is skipped without retry.
- Only three check types have mechanical repair. Broken links and god nodes need your judgement.
- The daily hint cap is global, so a noisy cluster can swallow the day's budget and block hints elsewhere.
- Freshness is computed at indexing time. Real-time edits to linked notes do not reflect until the next index pass.

See also: [Knowledge layer](./knowledge-layer.md), [Vault health guide](/guides/vault-health), [Tools reference](/reference/tools#vault-intelligence-tools).
