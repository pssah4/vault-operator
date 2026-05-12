From 634,000 to 60,000 tokens: How I cut my AI agent's costs by 90%

My Obsidian plugin "Vault Operator" is an AI agent with over 40 tools that works directly inside the vault: searching notes, summarizing, linking, creating canvases. A simple task like "Search my notes on Kant and write a summary" cost $2 and consumed 634,000 input tokens. On GitHub Copilot, the agent crashed at 183,000 tokens because the context limit there is 168,000.

Two dollars for a summary. That's when I stopped building features.


Where the tokens went

I ran a system test and broke down the token distribution:

- System prompt (25k x 8 iterations): 200,000 tokens, 32%, ~$0.60
- Tool definitions (10k x 8 iterations): 80,000 tokens, 13%, ~$0.24
- Tool results in history: 250,000 tokens, 39%, ~$0.75
- Assistant responses in history: 100,000 tokens, 16%, ~$0.30

I would have bet the system prompt was the problem. It wasn't. The biggest cost block was accumulated tool results: 39%. A semantic search returns ten excerpts at 2,000 characters each, reading a single note up to 20,000 characters. After eight iterations, that's over 250,000 tokens for results the agent has long since processed but keeps sending along with every call.

And eight iterations for "search and summarize" is just too many. The agent knows what to do after the third call. But the ReAct loop keeps asking five more times.


An agent that learns from experience

The most effective measure didn't come from prompt optimization. It came from a system that lets the agent remember.

If the agent has already solved the same kind of task three times successfully, it doesn't need to figure it out from scratch every time. For that it needs a memory that works in three layers.
  
Episodes are recordings of individual task executions. What did the user ask, which tools did the agent use in which order, was the result any good? The agent records every interaction that involved at least two tools. The last 500 episodes are kept, older ones discarded.

Recipes are abstracted instructions that emerge from episodes. When three or more similar episodes were successful, a single LLM call generates a generalized procedure from the concrete examples: which steps in which order, with which parameters. I ship eight static recipes for common vault operations as the plugin author. Learned recipes are generated automatically, capped at 50.

Long-term memory stores insights about the user: work patterns, preferences, project context. Six markdown files, each with a hard budget of 800 characters. An extractor LLM decides on every update what stays and what gets replaced by newer information. Without the budget, the file grows indefinitely, and after a year the visible 800 characters are full of stale entries. Whether the extractor actually prioritizes well enough remains to be seen, but setting the budget as a hard constraint was the right call.


Why intent matching instead of sequence matching

The first version of the promotion system cost me months and never worked.

The logic was: If the agent uses the same sequence of tools three times (first search, then read, then write), it's the same pattern. Turn it into a recipe. The problem is that LLMs don't choose their tools deterministically. Three functionally identical tasks ("search my notes on Kant and summarize", "find everything on Hegel and create an overview", "what do I have on Nietzsche, write a summary") produced three different tool sequences. Sometimes a todo list update gets inserted in between, sometimes different numbers of files get read. Three separate patterns with one observation each, not a single promotion to recipe. I held on to the sequence idea for too long because it sounded so plausible.

The fix was a switch to semantic intent matching via embeddings. Instead of comparing tool sequences, the system now compares user messages by cosine similarity. "Search Kant notes and summarize" and "Find Hegel material and create overview" score high on similarity even though the execution paths look completely different. It's not the action that defines repetition, it's the intent. After three similar successful episodes, a recipe gets generated.


Fast path: A shortcut for known tasks

When a recipe exists, the agent no longer needs to reason iteratively.

The user message comes in and the system checks whether a matching recipe exists. If so, a single LLM call receives the message plus the recipe and produces a concrete execution plan. Which tools to call, with which parameters, in which order. The plan then gets executed deterministically, no further LLM calls needed. Read operations run in parallel, writes sequentially. After that, the normal agent loop takes over for one or two final iterations: formulate the result, open the file.

Instead of eight LLM calls: two or three. Instead of 634,000 tokens: about 70,000.

The fast path has guardrails. Only recipes that have been used successfully at least three times qualify. If the planner call produces an invalid plan, the system falls back to the normal ReAct loop. All tool invocations still go through the same pipeline with approval checks and logging. I deliberately didn't want a shortcut around governance, even though it was tempting.


Cache-optimized prompt structure

Modern LLM APIs cache the KV state of the prompt prefix. As long as the beginning of the prompt stays identical, the cached tokens don't need to be recomputed. The Anthropic API offers this explicitly, with OpenAI and DeepSeek it happens automatically.

My system prompt had a stupid bug: The current timestamp sat at position one. Every API call has a different timestamp. A single changed token at the beginning invalidates the entire KV cache for everything after it. 25,000 tokens, computed eight times, zero cache hits. I burned money for months because a date line was in the wrong place.

The fix: Sort prompt sections by stability. Everything that doesn't change within a session (mode definition, tool descriptions, rules, security constraints) goes at the top. Everything dynamic (active instructions, memory context, vault information) goes at the bottom. The timestamp now sits at the very end.

The stable 20,000+ tokens at the beginning get computed once and then served from cache. Over eight iterations, that's 25,000 + 7 x 5,000 = 60,000 actually computed tokens instead of 8 x 25,000 = 200,000.

A side effect I didn't expect: Some instructions get pushed further down by the reordering and lose the primacy effect, the tendency of LLMs to weigh instructions at the beginning of the context more heavily. Whether that's a real problem in practice, I'm not sure yet. My countermeasure: The current task list gets appended as the last user message before every LLM call, which exploits recency bias. The idea comes from Manus' context engineering paper, where they describe task lists as a "recency anchor."


Context externalization: Offloading large results

Every tool result gets written in full into the conversation history and sent along with every subsequent iteration. A semantic search with ten hits: 20,000 characters. A note that was read: up to 20,000 characters. After eight iterations, that adds up to over 250,000 tokens for results the agent has long since processed.

The idea: When a tool result exceeds 2,000 characters, the full result gets written to a temporary file. The history only gets a compact reference: what was found, how many hits, the most relevant entries with their scores, and where the full data lives.

Concrete example: Instead of 50 search results in the history, you get: "50 matches found. Top 5: [path and score]. Full results at [file path]." The agent has enough information to decide which notes to read next without the history growing by 20,000 characters with every step.

One detail that's easy to miss: The offloading happens when the result is created, not retroactively. The history stays append-only, never modified after the fact, only extended. Deterministic file paths without timestamps make sure no cache invalidation occurs. This append-only principle runs through all the measures: KV caching, externalization, and the existing context condensing (a kind of summarization of older conversation segments) all benefit from it.

During the fast path, externalization is disabled. The final LLM call needs the full content for a good summary, and with only two or three calls the accumulation is minimal anyway.


How they work together

- Fast path: 8 to 2-3 iterations. Side effect: less history accumulation.
- Prompt reordering: ~90% cache hit on system prompt. Side effect: saves per remaining iteration.
- Externalization: Tool results -80% in history. Side effect: condensing needed less often.

For the standard task "search and summarize": before 8 iterations, 634,000 tokens, ~$2.00, GitHub Copilot crashes. After 2-3 iterations, ~60,000 tokens, ~$0.15, works everywhere.

For complex tasks with many tool invocations: before over 800,000 tokens, after ~257,000.


What I learned

I would have intuitively shortened the system prompt first. The data showed that 39% of tokens go to accumulated tool results. Measuring would have saved me weeks.

The fast path delivers the biggest reduction, and it only works because the agent knows from experience which steps it needs. Without the recipe system, the only option would have been to make the existing loop more efficient. That might have gotten 20-30%, not 90%.

The failed sequence matching taught me something that goes beyond this project: LLMs are not deterministic, and any system built on stable tool sequences will eventually break on that. The intent is stable, the execution is not. I'm not sure whether this holds for every agent architecture, but for ReAct loops with many tools it definitely does.

And finally: A single date line in the wrong place in the prompt made 200,000 tokens per task uncacheable. The order of prompt sections is not an implementation detail. It's architecture.


Outlook

The 90% reduction applies to tasks for which a recipe exists. New tasks go through the full ReAct loop. But every one of those tasks feeds the system. After three successful runs, a recipe is ready, and the next identical task costs 90% less.

Whether the learning behavior holds up long-term, whether the extractor prioritizes the right entries, whether 50 recipes are enough or it needs to be 200: I don't know yet. The first weeks look good. But I would have said the same about the sequence-based pattern matching.
