---
title: Rules
description: How always-on instructions get loaded from disk and injected into the system prompt.
---

# Rules

Rules are short Markdown files that get injected into the system prompt and always apply. Unlike skills (which only activate when a keyword matches) and workflows (which run on `/slash` invocation), rules constrain every conversation. They are the right place for style preferences, vault conventions, hard restrictions, and any standing instruction the agent should never forget.

## Where rules live

Rules sit in a per-vault folder: **`.vault-operator/rules/`** by default. The agent folder path is configurable in **Settings > Vault > Agent folder**; if you change it, rules move with it.

Each rule is one file, `.md` or `.txt`. There is no schema, no required frontmatter, no naming convention. The filename is just the rule's identifier in the UI and in the toggles record.

Two kinds of files end up here:

- Rules you create through **Settings > Rules > Create**.
- Rules you import or drop in manually.

Both are picked up the same way.

## How rules reach the agent

`RulesLoader` (in `src/core/context/RulesLoader.ts`) discovers all `.md` and `.txt` files in the rules directory at plugin start and whenever you open the Rules settings tab. Each file is read, truncated at 50,000 characters (to prevent runaway payloads), and held in memory.

At system-prompt build time, every enabled rule is concatenated into a single block and wrapped in `<user_defined_rules>` tags. The block is appended after the core sections (instructions, tools, skills, memory) so the agent treats rules as the user's word, not as core plugin behavior.

Toggle state is stored per file path in the plugin settings (`rulesToggles` record). The default for a new rule is on; toggling off sets `rulesToggles[path] = false`.

## When rules update

Rules are loaded at plugin init and reloaded when you open the Rules settings tab. They are **not** hot-reloaded mid-conversation. If you edit a rule file directly in your vault while a chat is running, the change takes effect on the next conversation or the next plugin reload.

This is intentional: rules are part of the system prompt, and changing the system prompt mid-turn would invalidate the prompt cache and confuse the model.

## How rules differ from skills and workflows

| Trait | Rules | Skills | Workflows |
|-------|-------|--------|-----------|
| Activation | Always on | Keyword trigger | Slash command |
| Where injected | System prompt | System prompt (when matched) | User prompt (when invoked) |
| Format | Free Markdown | Markdown with trigger keywords | Markdown with optional variables |
| Scope | Global | Can be agent-specific | One-shot |
| Hot-reload | No | No | No |

A common confusion: putting a "follow these steps for X" instruction in a rule means the agent reads those steps every turn, even when X is not on the table. That eats tokens. Put step-by-step instructions in a skill (with a trigger keyword), not a rule.

## Practical patterns

Things rules are good at:

- Style and tone: "Write in plain English, no jargon."
- Vault conventions: "All meeting notes live under `Meetings/YYYY/MM-Topic.md`."
- Hard restrictions: "Never create files outside `Inbox/` without asking."
- Stable preferences: "When listing tasks, always show due date and assignee."

Things rules are bad at:

- Anything specific to one task type. Use a skill.
- Anything that runs on demand. Use a workflow.
- Anything that depends on time, agent, or context. Use a skill, or write the agent a conditional.

## Limits

- No syntax check. Contradictory rules (rule A says "always use bullet points", rule B says "always use prose") are both injected, and the agent decides on the fly.
- No per-agent rules. Every rule applies regardless of which agent is active.
- 50,000 character cap per file. To work around, split into smaller files. Each becomes a separate toggle in the UI.
- No conflict surfacing. The plugin does not flag a rule that contradicts another rule, or a rule that contradicts a skill.

## Related decisions

No dedicated ADR yet. The current implementation traces back to the Kilo Code rules pattern referenced at the top of `src/core/context/RulesLoader.ts`.

See also: [Skills, rules, and workflows guide](/guides/skills-rules-workflows), [Settings reference: Rules](/reference/settings#rules), [System prompt](./system-prompt.md).
