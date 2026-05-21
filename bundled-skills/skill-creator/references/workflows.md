# Workflow patterns

Use these patterns when the skill body needs to describe a multi-step process.

## Sequential workflow

For procedures with a fixed order, number the steps and give each one a verb in imperative form. State the overview first so the agent does not have to read the whole body to know what is coming.

```markdown
Filling a PDF form involves five steps:

1. Analyze the form (run analyze_form.js)
2. Build the field mapping (write fields.json)
3. Validate the mapping (run validate_fields.js)
4. Fill the form (run fill_form.js)
5. Verify the output (run verify_output.js)
```

The numbered overview doubles as a table of contents -- the agent can pick the right step when the user supplies one partial input.

## Conditional workflow

For tasks with a branch in the middle, name the decision point and label each branch:

```markdown
1. Determine the modification type:
   - Creating new content -> follow the "Create workflow" below.
   - Editing existing content -> follow the "Edit workflow" below.

2. Create workflow: ...
3. Edit workflow: ...
```

Keep the branches in the same file when each is short (under 100 lines). Move them to separate references when one branch grows large.

## State-machine workflow

For long-running tasks with explicit states, name the states and the transitions. The agent treats the state as a checkpoint so an interrupted run can resume.

```markdown
States: draft -> reviewed -> published.

- draft -> reviewed: requires reviewer comment file.
- reviewed -> published: requires `publish.js` exit code 0.
```

## Anti-pattern: hidden ordering

Do NOT bury sequence-critical steps inside prose. The agent reads top-down and skipping a step that was implicit costs a tool round-trip to recover. If the order matters, list it explicitly.
