---
title: Token Optimization
description: How Obsilo reduces token costs by up to 90% through fast paths, cache alignment, and context externalization.
---

# Token optimization

A naive agent loop is expensive. The agent sends a system prompt, all tool definitions, the full conversation history, and every tool result to the LLM on every turn. For a simple "find and summarize" task, that can add up to 634,000 input tokens.

Obsilo uses three complementary strategies that brought this down to 60,000 tokens for the same task, a 90% reduction.

## The cost problem

Without optimization:

1. The system prompt includes 60+ tool definitions (each with input schemas, descriptions, examples).
2. Every tool result stays in the conversation history.
3. The LLM re-reads everything on every turn, even parts that haven't changed.
4. A task that could be done in 2 tool calls takes 8 because the agent plans one step at a time.

With models like GitHub Copilot's Sonnet that have a 168K context limit, complex tasks would simply fail because the context overflowed.

## Strategy 1: Fast path execution

When the agent has seen a similar task before, it skips the iterative loop entirely:

1. `FastPathExecutor` checks if any learned recipe matches the current request.
2. If a match is found, it makes one planning call to the LLM with the recipe and the specific inputs.
3. The LLM returns a batch of tool calls (all at once, not one at a time).
4. Obsilo executes them deterministically without further LLM calls.
5. One final LLM call formats the result.

That's 2-3 LLM calls instead of 8. The agent learns new recipes automatically from successful task completions.

If the fast path fails or no recipe matches, Obsilo falls back to the normal agent loop. Nothing breaks.

## Strategy 2: KV-cache-aligned prompt

LLM providers cache the key-value pairs computed from the prompt prefix. If the same prefix appears again, those computations are reused and you pay less.

Obsilo arranges the system prompt so stable content comes first and volatile content comes last. The stable prefix (positions 1-8) covers the role definition, tool definitions, rules, capabilities, mode instructions, and shared safety language. These rarely change inside a session. The volatile tail (positions 9-16) is active file context, retrieved memory, recipes, soul snippets, and the current date and time, which change every turn.

Because tools, rules, and mode definitions don't change between turns, the LLM can cache them. This is provider-agnostic: Anthropic uses explicit cache markers, while OpenAI and Gemini do implicit prefix caching.

## Strategy 3: Context externalization

When a tool returns a large result (say, the content of a 200-line note), keeping it in the conversation history means the LLM re-reads it on every subsequent turn.

`ResultExternalizer` catches results larger than 4,000 characters, writes them to a temporary file in `.obsidian-agent/context/`, and replaces the result with a compact reference:

```
<context_ref path=".obsidian-agent/context/abc123.md" lines="215"/>
```

If the agent needs the content later, it reads it with `read_file`. Most of the time it doesn't need to, because it already processed the result on the turn it was generated.

## Combined effect

| Scenario | Before | After | Reduction |
|----------|--------|-------|-----------|
| Simple task (search + summarize) | 634K tokens | 60K tokens | 90% |
| Complex task (multi-step vault work) | 800K+ tokens | 257K tokens | 68% |
| GitHub Copilot (168K limit) | Overflow error | Works | N/A |

## Trade-offs

- Fast path requires learning time. New task patterns run through the normal loop until a recipe is built.
- Externalized results add file I/O. For very short conversations (1-2 turns), the overhead isn't worth it.
- KV-cache hits depend on the provider. Some providers don't support caching at all. The prompt structure still works, it just doesn't save money.

## Related

- [The agent loop](/concepts/agent-loop): How the core loop works and where fast path fits in
- [System prompt](/concepts/system-prompt): The prompt section ordering in detail
- [Memory system](/concepts/memory-system): How recipes are learned and matched
