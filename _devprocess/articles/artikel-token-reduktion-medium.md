# From 634,000 to 60,000 Tokens: How I Cut My AI Agent's Costs by 90%

*A practical guide to token cost reduction in agentic systems through learned recipes, KV-cache-aware prompt design, and context externalization.*

---

I build an Obsidian plugin called Vault Operator. It's an AI agent with over 40 tools that operates directly inside a user's vault: searching notes, summarizing content, linking documents, creating canvases. The agent uses a ReAct loop, meaning it iterates between reasoning and tool calls until a task is complete.

In early April 2026, I ran a system test with a standard task: "Search my notes on Kant and write a summary." The result was 634,000 input tokens, eight LLM iterations, and a cost of roughly $2 per execution. On GitHub Copilot's gateway (which routes to Claude Sonnet with a 168k context limit), the agent crashed outright at 183,000 tokens.

Two dollars per summary is not a viable product. This article describes the three architectural changes that brought that number down to 60,000 tokens, and why a learning system was the prerequisite for the most impactful one.

## Anatomy of a 634,000-token task

Before optimizing anything, I instrumented a single task execution and broke down where the tokens actually go. The results were not what I expected.

| Cost block | Tokens | Share | Cost (~$3/MTok) |
|---|---|---|---|
| System prompt (25k x 8 iterations) | 200,000 | 32% | $0.60 |
| Tool definitions (10k x 8 iterations) | 80,000 | 13% | $0.24 |
| Tool results in history | 250,000 | 39% | $0.75 |
| Assistant responses in history | 100,000 | 16% | $0.30 |

My assumption going in was that the system prompt was the main offender. It wasn't. The single largest cost block, at 39%, was accumulated tool results. A semantic search returns ten excerpts at around 2,000 characters each. Reading a single note can produce up to 20,000 characters. These results get written into the conversation history and resent with every subsequent API call. After eight iterations, the history carries over 250,000 tokens of tool output that the agent has already processed.

The second observation was that eight iterations for a "search and summarize" task is excessive. The agent has all the information it needs after three calls. But the ReAct loop has no mechanism to recognize that. It keeps reasoning, keeps calling tools, keeps accumulating context.

These two problems, unnecessary iterations and unbounded result accumulation, became the primary targets.

## The learning system: Episodes, recipes, and long-term memory

The most effective optimization didn't come from compressing prompts or truncating results. It came from giving the agent the ability to learn from past executions.

The core insight is simple: If the agent has solved the same kind of task successfully three times, it should not need to figure out the approach from scratch on the fourth attempt. Implementing that insight required a three-layer memory system.

### Layer 1: Episodes

An episode is a recording of a single task execution. It captures the user message, the sequence of tools the agent used, and whether the task completed successfully. The agent records an episode for every interaction that involves at least two tool calls. Storage is a SQLite database with FIFO eviction at 500 entries.

### Layer 2: Recipes

Recipes are generalized, reusable procedures that are promoted from episodes. When the system detects that three or more similar episodes were all successful, it triggers a promotion: a single LLM call receives the concrete episodes as examples and generates an abstracted recipe, specifying which steps to execute in which order, with which parameters.

I ship eight static recipes for common vault operations (creating canvases, reorganizing notes by tag, linking related documents, etc.). Learned recipes are generated automatically and capped at 50 to prevent unbounded growth. Each recipe includes a trigger (a set of keywords for fast matching) and a step list.

### Layer 3: Long-term memory

Long-term memory stores cross-session insights about the user: work patterns, preferences, project context. It consists of seven markdown files (user profile, projects, patterns, knowledge, soul, errors, custom tools), each with a hard character budget of 800. An extractor LLM decides on every update which entries are still relevant and which should be replaced by newer information. Every entry carries a recency tag (`[YYYY-MM]`) so the extractor can make informed decisions about what to cut.

The budget constraint is the interesting part. Without it, memory files grow indefinitely, and since only the first 800 characters per file get injected into the system prompt, newer entries get pushed below the cutoff and become invisible. The extractor has to actively manage a fixed-size window. Whether it makes good enough prioritization decisions over months of use is still an open question, but the hard constraint forces the right trade-off.

### Why intent matching, not sequence matching

The first version of the recipe promotion system tried to detect recurring tasks by matching tool sequences. The logic: If the agent uses the sequence `search -> read -> write` three times, it's the same pattern. Promote it to a recipe.

This never worked in practice. I ran three functionally identical tasks: "search my notes on Kant and summarize", "find everything on Hegel and create an overview", "what do I have on Nietzsche, write a summary." Each produced a different tool sequence. LLMs don't choose tools deterministically. Sometimes a todo list update gets inserted between search and read. Sometimes three files get read instead of five. The result was three separate patterns with one observation each. Not a single promotion.

I held on to the sequence-based approach for weeks because the logic felt airtight. It wasn't. The fundamental error was treating the execution trace as stable when only the user's intent is stable.

The fix was intent matching on user messages instead of tool sequences. The recipe matching service tokenizes the user message and scores it against each recipe's keyword triggers, with a description-overlap fallback when fewer than three candidates pass the keyword phase. "Search Kant notes and summarize" and "Find Hegel material and create overview" match the same recipe because they share the relevant intent keywords, regardless of how different the execution paths look. After three similar successful episodes, a recipe gets generated.

## Measure 1: Fast path execution

The fast path is where the learning system pays off in token savings. When a recipe exists, the agent can skip the iterative reasoning loop for most of the task.

The flow works like this:

1. The user message arrives. The system checks for a matching recipe using keyword scoring with a description-based fallback.
2. If a match is found, execution proceeds in two planner stages. The first planner call generates search and discovery tool calls (semantic search, file search, tag search). These run in parallel, and their results feed into a second planner call that generates the read operations (which files to open based on what the search found).
3. Both stages execute deterministically, without further LLM calls. Read operations run in parallel, writes run sequentially.
4. After execution, the normal agent loop takes over for one or two final iterations to formulate the response and present the result.

Instead of eight LLM calls: three to four. Instead of 634,000 tokens: approximately 70,000.

The fast path has guardrails. Only recipes with at least three successful uses qualify. If the planner produces invalid output, the system falls back to the standard ReAct loop. All tool invocations still pass through the same execution pipeline with approval checks and logging. No governance shortcuts, even though it would have been easy to skip them for "known-good" recipes.

## Measure 2: KV-cache-aware prompt structure

Modern LLM APIs cache the key-value state of the prompt prefix. As long as the beginning of the prompt stays identical across calls, the cached tokens don't need to be recomputed. Anthropic's API offers this explicitly with a cache control parameter. OpenAI and DeepSeek do automatic prefix caching.

My system prompt had a bug that made caching impossible: The very first section was the current date and time. Every API call has a different timestamp. A single changed token at the beginning of the prompt invalidates the entire KV cache for everything after it. That's 25,000 tokens, computed from scratch eight times per task, with zero cache hits. I burned money on this for weeks before I understood why.

The fix was to reorder prompt sections by stability:

**Stable prefix (cached across iterations):** Mode definition, capabilities, platform conventions, tool definitions (~8,000 tokens, the largest stable block), tool routing rules, objective, response format, security boundaries.

**Dynamic suffix (changes per message or session):** Plugin skills, active skills, memory context, recipes, custom instructions, vault context, and at the very end: the timestamp.

The stable prefix is over 20,000 tokens. With caching, those get computed once per session. Over eight iterations, that reduces actual computation from 8 x 25,000 = 200,000 tokens to approximately 25,000 + 7 x 5,000 = 60,000 tokens.

There is a trade-off. Reordering pushed certain instructions (particularly active skill descriptions) from position 3 to position 10 in the prompt. LLMs exhibit a well-documented primacy effect: instructions near the beginning of the context get followed more reliably. My countermeasure is borrowed from Manus' context engineering paper: The current task list gets appended as the final user message before every LLM call, exploiting recency bias to compensate for the lost primacy. Whether this fully compensates in practice still needs more testing.

## Measure 3: Context externalization

Every tool result gets written in full into the conversation history and sent along with every subsequent API call. A semantic search with ten hits produces about 20,000 characters. A read operation on a single note can return up to 20,000 characters. After eight iterations, accumulated tool results account for over 250,000 tokens.

Context externalization intercepts tool results before they enter the history. When a result exceeds a threshold (currently 2,000 characters), the full content gets written to a temporary file. The history receives only a compact reference: What was found, how many results, the top entries with their relevance scores, and the file path where the full data is stored.

For example, instead of 50 search results in the history, the agent sees: "50 matches found. Top 5 most relevant: [path and score]. Full results saved to .obsidian-agent/tmp/{taskId}/search.md." That's enough information for the agent to decide which notes to read next, without the history growing by 20,000 characters per step.

An important implementation detail: Externalization happens at result creation time, not retroactively. The history is strictly append-only. Deterministic file paths (no timestamps, no random values) ensure no cache invalidation from changing references. This append-only principle turned out to be a design constraint that benefits multiple systems simultaneously: KV caching, externalization, and the existing context condensing mechanism (which summarizes older conversation segments when the context grows too large) all rely on the history not being modified after the fact.

During fast path execution, externalization is selectively controlled. Search results (stage 1) are externalized normally since the presenter doesn't need them. Read results (stage 2) keep their full content because the final LLM call needs it to produce a good summary. With only two to three iterations after the fast path, the accumulation is minimal anyway.

## Combined effect

| Measure | Primary effect | Secondary effect |
|---|---|---|
| Fast path | 8 to 2-3 iterations | Less history accumulation |
| Prompt reordering | ~90% cache hit on system prompt | Compounds with fewer iterations |
| Externalization | Tool results -80% in history | Context condensing triggered less often |

For the standard "search and summarize" task:
- Before: 8 iterations, 634,000 tokens, ~$2.00, crashes on GitHub Copilot
- After: 2-3 iterations, ~60,000 tokens, ~$0.15, works on all providers

For complex tasks with many tool invocations:
- Before: over 800,000 tokens
- After: ~257,000 tokens

## Takeaways

**Measure before optimizing.** I would have started by shortening the system prompt. The data showed 39% of tokens went to accumulated tool results. Measuring first would have saved me weeks of misdirected effort.

**Learning is the highest-leverage optimization.** The fast path delivers the largest reduction, and it only works because the agent knows from experience which steps a task requires. Without the recipe system, the only option would have been making the existing loop more efficient, which might yield 20-30% savings, not 90%.

**Intent is stable, execution is not.** The failed sequence matching taught me something that generalizes beyond this project: LLMs are not deterministic, and any system that relies on stable tool sequences will eventually break. The fix didn't even require embeddings. Simple keyword matching on user messages works because intent vocabulary is far more stable than execution traces. Whether this holds for all agent architectures, I'm not sure. For ReAct loops with many tools, it definitely does.

**Prompt section order is architecture, not an implementation detail.** A single timestamp at the wrong position in the prompt made 200,000 tokens per task uncacheable. The ordering of prompt sections determines whether the KV cache can do its job.

**Append-only as a design principle.** Multiple optimizations benefit from the same constraint: the conversation history is never modified after the fact, only extended. KV caching, context externalization, and context condensing all rely on this. Adopting append-only early makes later optimizations composable.

## Open questions

The 90% reduction applies to tasks where a recipe exists. New, unseen tasks still go through the full ReAct loop. But every such task feeds the learning system. After three successful runs, a recipe is ready, and the next identical task gets the fast path.

Whether the learning behavior holds up over months of use, whether the long-term memory extractor makes good enough prioritization decisions, whether 50 learned recipes are sufficient or it needs to be 200: I don't have answers to these yet. The first weeks look promising. But I would have said the same about the sequence-based pattern matching before it failed.

---

*Sebastian Hanke builds Vault Operator, an AI agent plugin for Obsidian. The architectural decisions referenced in this article are documented as ADRs 058-063 in the project's development process archive.*
