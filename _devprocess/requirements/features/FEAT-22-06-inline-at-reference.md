# Feature: Inline @-Reference

> **Feature ID**: FEAT-22-06
> **Epic**: EPIC-22 (Skill-Package Ecosystem)
> **Priority**: P1
> **Effort Estimate**: XS
> **Note**: Released v2.6.0 (2026-04-19)

## Feature Description

When a user picks a vault note from the `@` autocomplete dropdown, the
`@` token now stays inline in the textarea as `@<basename>` instead of
being stripped. The file is still attached to the outgoing message as a
context block -- but the user's sentence keeps its flow
("Lese @Referenznote und ueberarbeite den Post.").

Before this change the text selection deleted the `@query` part and the
file only appeared as a chip above the textarea. That forced the user to
re-add the note's name manually whenever the sentence needed to name it.

## User Stories

### Story 1: Natural sentences with references
**As** a user
**I want** to type "Fasse @Spec und @Code zusammen"
**so that** the agent sees which references belong to which part of the
sentence without having to guess from an unordered chip list.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Selecting a note from `@`-autocomplete keeps `@<basename>` in the textarea | 100% | Handler test |
| SC-02 | A trailing space is inserted automatically if the next character is not whitespace | 100% | Handler test |
| SC-03 | The cursor is placed right after the inlined reference | 100% | Handler test |
| SC-04 | The file is still added as an attachment (no regression in context delivery) | 100% | Integration test |

## Architektur-Hinweise

- [src/ui/sidebar/AutocompleteHandler.ts](../../../src/ui/sidebar/AutocompleteHandler.ts)
  `makeFileOnSelect` replaces the `@query` span with `@<basename>` and
  continues to call `addVaultFile(f)`. Cursor is repositioned so typing
  continues naturally.

## Out of Scope

- Rewriting the inline text if the note is later renamed in the vault.
- Removing the note from the attachment list when the user deletes the
  inline `@basename` from the textarea (tracked separately if needed).
