# Output patterns

Use these patterns when the skill produces a structured output that the agent should match consistently.

## Template pattern (strict)

When the consumer depends on an exact shape (API response, downstream parser, report schema), give a literal template and use absolute language:

```markdown
## Report structure

ALWAYS use this exact template:

# {Analysis Title}

## Executive summary

{One paragraph}

## Key findings

- {Finding 1}
- {Finding 2}
- {Finding 3}

## Recommendations

1. {Specific action}
2. {Specific action}
```

The skill body MUST include the placeholders the agent fills. "Use your best judgement" pollutes the output when the structure has to be parseable.

## Template pattern (flexible)

When the shape can adapt to the input, mark sections as adjustable:

```markdown
## Report structure

Use this as a sensible default. Adjust sections to fit the actual finding.

# {Analysis Title}

## Executive summary
## Key findings (adapt sub-sections per discovery)
## Recommendations (tailor to context)
```

The agent reads "adapt" as permission to merge or split sections, but the top-level skeleton stays.

## Example pattern

When output quality depends on tone and detail rather than structure, give input-output pairs:

```markdown
## Commit message format

Generate commit messages following these examples.

**Example 1**
Input: Added user authentication with JWT tokens.
Output:

    feat(auth): implement JWT-based authentication

    Add login endpoint and token validation middleware.

**Example 2**
Input: Fixed bug where dates displayed incorrectly in reports.
Output:

    fix(reports): correct date formatting in timezone conversion

    Use UTC timestamps consistently across report generation.

Follow this style: type(scope): brief description, blank line, detailed body.
```

Two or three pairs cover most variation. More than five pairs usually hides a missing rule that should be stated explicitly instead.

## Anti-pattern: implicit format

"Write a professional summary" leaves the agent guessing. "Write a 3-bullet summary, each bullet 15-30 words, present tense" gives a target the agent can verify before emitting.
