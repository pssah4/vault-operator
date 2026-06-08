/**
 * FindToolTool — FEATURE-1600 (Deferred Tool Loading)
 *
 * Meta-tool for on-demand activation of deferred tools. Only core tools
 * (read / edit / search / agent-control) are in the default system prompt;
 * specialised tools (office formats, diagram creators, base queries,
 * self-development) live in DEFERRED_TOOL_NAMES and are loaded by this
 * tool the first time they are needed.
 *
 * Usage pattern from the LLM:
 *   find_tool({ query: "pptx" })
 *   -> matches create_pptx + plan_presentation, activates both, returns
 *      names + descriptions. Next turn the full schemas are in the prompt.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { DEFERRED_TOOL_NAMES, TOOL_METADATA } from '../toolMetadata';

const MAX_MATCHES = 5;

export class FindToolTool extends BaseTool<'find_tool'> {
    readonly name = 'find_tool' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'find_tool',
            description:
                'Discover and activate specialised tools not loaded in the default schema. '
                + 'Use this when the user asks for something the core tools do not cover '
                + '(office document creation, diagrams, base queries, expression evaluation, '
                + 'skill/source management, vault-health). The tool searches by keyword '
                + 'and injects the matching tool schemas for the rest of the session — '
                + 'after calling find_tool, the activated tools appear in the next turn\'s tool list.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'Keyword(s) describing the capability you need, e.g. "pptx", "canvas", "diagram", "excel", "freshness". Case-insensitive substring match over tool names, labels, and descriptions.',
                    },
                },
                required: ['query'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const rawQuery = ((input.query as string) ?? '').trim().toLowerCase();

        if (!rawQuery) {
            callbacks.pushToolResult(this.formatError(new Error('query is required')));
            return;
        }

        // BUG-021 / Wave-4 finding: the LLM phrases the query as
        // "vault health check" but the tool name is `vault_health_check`
        // and the label is just "Health Check". Pure substring match
        // scores 0 in every haystack and falls through to the
        // "no deferred tools matched" branch.
        //
        // Fix: (1) normalise underscores to spaces in all haystacks,
        // (2) tokenise the query on whitespace and score per-word
        // matches so multi-word queries still rank above stray hits.
        // Minimum 3 chars: shorter tokens like "no", "at", "is" explode into
        // false positives (e.g. "no" matches "note" in every vault-note tool).
        const queryTokens = Array.from(new Set(
            rawQuery.split(/[\s_-]+/).filter((t) => t.length >= 3),
        ));
        const queryPhrase = rawQuery.replace(/[_\s-]+/g, ' ').trim();

        type Match = { name: string; label: string; description: string; score: number };
        const matches: Match[] = [];

        const normalise = (s: string) => s.toLowerCase().replace(/[_-]+/g, ' ');

        for (const name of DEFERRED_TOOL_NAMES) {
            const meta = TOOL_METADATA[name];
            if (!meta) continue;
            const nameN = normalise(name);
            const labelN = normalise(meta.label ?? '');
            const descN = normalise(meta.description ?? '');

            let score = 0;
            let strongHit = false; // phrase-level, name-token, or label-token hit

            if (nameN.includes(queryPhrase)) { score += 200; strongHit = true; }
            if (labelN.includes(queryPhrase)) { score += 100; strongHit = true; }
            if (descN.includes(queryPhrase)) score += 20;

            for (const token of queryTokens) {
                if (nameN.includes(token)) { score += 30; strongHit = true; }
                if (labelN.includes(token)) { score += 15; strongHit = true; }
                if (descN.includes(token)) score += 3;
            }

            // Description-only token hits are noisy (common words like "tool",
            // "note", "file" appear everywhere). Require at least one strong
            // hit (phrase anywhere, or token on name / label) before the tool
            // is considered a match.
            if (score > 0 && strongHit) {
                matches.push({ name, label: meta.label, description: meta.description, score });
            }
        }

        matches.sort((a, b) => b.score - a.score);
        const top = matches.slice(0, MAX_MATCHES);

        if (top.length === 0) {
            callbacks.pushToolResult(
                `No deferred tools matched "${rawQuery}". If you need a capability that does not map to an available tool, ask the user to install the relevant Obsidian plugin, or try a core tool (read_file, edit_file, semantic_search).`,
            );
            return;
        }

        // Activate the matches for the rest of the session.
        if (!context.activateDeferredTool) {
            callbacks.pushToolResult(
                this.formatError(new Error('Tool activation callback not available — find_tool can only run inside a regular agent loop.')),
            );
            return;
        }

        // ADR-26 Recall-feeds-Retrieval: the discovery edge (this turn's
        // task -> this tool) is the lesson Stigmergy needs to learn so a
        // future repeat of the same task can pre-activate the tool via
        // pathGuidance.path without going through find_tool. Emit the
        // capability_invoked + capability_returned(success=true) pair on
        // the active turn for each tool we just activated. Gated on
        // turn.enabled (NOOP_TURN fast-paths skip the await), non-fatal
        // (the adapter swallows transport errors). The id matches what
        // the tool registers with the daemon (the bare tool name), so
        // no phantom nodes appear in the substrate.
        const stigmergyTurn = context.stigmergyTurn;
        const stigmergyOn = stigmergyTurn?.enabled === true;
        for (const match of top) {
            context.activateDeferredTool(match.name);
            if (stigmergyOn) {
                try {
                    await stigmergyTurn.emitInvoked(match.name);
                    await stigmergyTurn.emitReturned(match.name, true);
                } catch (e) {
                    // Non-fatal by contract -- adapter already wraps the
                    // raw emit; a thrown error here means the adapter
                    // itself misbehaved. Log and continue.
                    console.debug(
                        `[find_tool] stigmergy emit for "${match.name}" failed (non-fatal):`,
                        e instanceof Error ? e.message : e,
                    );
                }
            }
        }

        const lines = top.map((m) => `- ${m.name}: ${m.description}`);
        callbacks.pushToolResult(
            this.formatSuccess(
                `Activated ${top.length} tool${top.length === 1 ? '' : 's'} for this session:\n`
                    + lines.join('\n')
                    + '\n\nTheir full schemas are now in the tool list — call them directly in your next step.',
            ),
        );
        callbacks.log(`find_tool: activated [${top.map((m) => m.name).join(', ')}] for query "${rawQuery}"`);
    }
}
