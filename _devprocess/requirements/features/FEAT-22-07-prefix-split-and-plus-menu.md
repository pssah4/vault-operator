# Feature: Prefix Split + `+` Menu Integration

> **Feature ID**: FEAT-22-07
> **Epic**: EPIC-22 (Skill-Package Ecosystem)
> **Priority**: P1
> **Effort Estimate**: S
> **Note**: Released v2.6.0 (2026-04-19)

## Feature Description

Splits the single `/` slash-command namespace into three category-specific
prefixes, and surfaces all three categories under the `+` toolbar button
below the chat input.

**Decision 2026-04-19 (user):**

| Prefix | Category | Rationale |
|--------|----------|-----------|
| `/` | Skills | Primary action. Matches Claude Code muscle memory. |
| `#` | Prompts | Template-snippet feel; echoes emoji-shortcode conventions. |
| `\u00a7` | Workflows | Unambiguous, rare in natural prose, easy to reach on DE keyboard (Shift+3 on macOS DE). |

The `+` button menu now lists, in this order: Attach file, Add vault file,
Skills, Prompts, Workflows. Picking any skill/prompt/workflow prefixes
the textarea with the corresponding trigger and focuses the input so the
user can continue typing free text after the command.

## User Stories

### Story 1: Unambiguous categories
**As** a user
**I want** `/` to strictly list skills and `#` to strictly list prompts
**so that** I can scan the autocomplete dropdown without guessing which
entries belong to which concept.

### Story 2: Touch-free discoverability
**As** a user who forgets the prefix characters
**I want** to click the `+` button and see every runnable thing (skills,
prompts, workflows)
**so that** I never need to memorise the trigger set.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Typing `/` shows only skills | 100% | UI inspection |
| SC-02 | Typing `#` shows only custom prompts | 100% | UI inspection |
| SC-03 | Typing `\u00a7` shows only workflows | 100% | UI inspection |
| SC-04 | `+` menu lists all three categories with icons and labels | 100% | UI inspection |
| SC-05 | Selecting an item from the `+` menu inserts `<prefix><slug> ` into the textarea | 100% | Handler inspection |
| SC-06 | Send-resolver dispatches `/slug`, `#slug`, `\u00a7slug` to the correct handler | 100% | Resolver inspection |

## Architektur-Hinweise

- [src/ui/sidebar/AutocompleteHandler.ts](../../../src/ui/sidebar/AutocompleteHandler.ts):
  `buildPrefixItems()` branches on the first character; one source per prefix.
- [src/ui/AgentSidebarView.ts](../../../src/ui/AgentSidebarView.ts):
  `showPlusMenu()` renders the combined menu, `insertPrefixedCommand()`
  handles textarea swap, send-resolver splits by prefix.

## Migration

- Existing workflows invoked via `/workflow-slug` no longer resolve --
  users must retype with the new prefix `\u00a7`. Documented in the beta
  release notes.
- Existing custom prompts invoked via `/prompt-slug` likewise move to `#`.
- Skills keep `/` so Claude-Code-trained fingers are unchanged.

## Out of Scope

- Configurable prefix mapping (hardcoded for now).
- Fuzzy search within the `+` menu (could come later if the list grows).
