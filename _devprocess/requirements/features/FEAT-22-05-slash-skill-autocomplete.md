# Feature: Slash Skill Autocomplete

> **Feature ID**: FEAT-22-05
> **Epic**: EPIC-22 (Skill-Package Ecosystem)
> **Priority**: P1
> **Effort Estimate**: XS
> **Note**: Released v2.6.0 (2026-04-19)

## Feature Description

Pressing `/` in the chat input now shows self-authored skills in the
autocomplete dropdown alongside the existing workflows and custom prompts.
Selecting a skill inserts `/skill-slug` into the input; sending the message
resolves the slug to the skill's body and injects it as an
`<explicit_instructions>` block -- the same pattern already used by
workflows and custom prompts. Aligns the UX with Claude Code's slash menu.

## User Stories

### Story 1: Activate a skill explicitly
**As** a user
**I want** to press `/` and pick a skill from the list
**so that** I can activate its instructions without crafting a trigger
sentence that happens to match the skill's regex.

### Story 2: Discoverability
**As** a new user
**I want** to see every available skill in the same place as workflows
**so that** I don't need to open Settings to learn which skills exist.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Typing `/` shows skills tagged "Skill" in the dropdown | 100% | UI test |
| SC-02 | Selecting a skill inserts `/skill-slug` into the textarea | 100% | Handler test |
| SC-03 | Sending `/skill-slug` resolves to the skill's body wrapped in `<explicit_instructions skill="...">` | 100% | Resolver test |
| SC-04 | Slug generation is stable: the autocomplete and the resolver share a single helper | 100% | Unit test |
| SC-05 | Unknown `/slug` passes through unchanged (no regression for workflows / prompts) | 100% | Integration test |

## Architektur-Hinweise

- [src/ui/sidebar/AutocompleteHandler.ts](../../../src/ui/sidebar/AutocompleteHandler.ts):
  third data source next to workflows + custom prompts. Public static
  `AutocompleteHandler.slugifySkillName()` exposes the single truth about
  slug generation.
- [src/ui/AgentSidebarView.ts](../../../src/ui/AgentSidebarView.ts):
  third fallback in the slash-command resolver that matches on slug,
  pulls the skill body, and wraps it as `<explicit_instructions skill=...>`.

## Out of Scope

- Slash-command aliases for skills (only auto-slugified name).
- Fuzzy matching (prefix match only, same as workflows).
