/**
 * UpdateTodoListTool - Maintain a visible task plan during a long task (Phase 1.3)
 *
 * The agent calls this to publish its current plan as a Markdown checklist.
 * The UI renders it as a persistent Todo-Box in the chat — updating live.
 *
 * Checklist format:
 *   - [ ] pending
 *   - [~] in progress
 *   - [x] done
 *
 * Adapted from Kilo Code's UpdateTodoListTool.ts pattern.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { extractWikilinkTargets, pathsToBasenames, stripWikilinkExtension } from '../../utils/wikilinks';

interface UpdateTodoListInput {
    todos: string;
}

export class UpdateTodoListTool extends BaseTool<'update_todo_list'> {
    readonly name = 'update_todo_list' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'update_todo_list',
            description:
                'Publish your task plan as a visible checklist in the chat. ' +
                'ONLY use this for complex tasks that require 3 or more distinct steps. ' +
                'For simple tasks (answering a question, reading a file, making a single edit, ' +
                'or any task you can complete in one or two tool calls), ' +
                'execute directly WITHOUT creating a plan first. ' +
                'Format: one item per line using - [ ] (pending), - [~] (in progress), - [x] (done). ' +
                'Update after each step completes.',
            input_schema: {
                type: 'object',
                properties: {
                    todos: {
                        type: 'string',
                        description:
                            'Markdown checklist. Each line must start with "- [ ]", "- [~]", or "- [x]". ' +
                            'Example:\n- [x] Read existing notes\n- [~] Create summary\n- [ ] Add tags',
                    },
                },
                required: ['todos'],
            },
        };
    }

    execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { todos } = input as unknown as UpdateTodoListInput;
        const { callbacks } = context;

        if (!todos || typeof todos !== 'string') {
            callbacks.pushToolResult(this.formatError(new Error('todos parameter is required')));
            return Promise.resolve();
        }

        // Parse and validate
        const items = this.parseTodos(todos);
        if (items.length === 0) {
            callbacks.pushToolResult(
                this.formatError(new Error('No valid todo items found. Use - [ ], - [~], or - [x] format.'))
            );
            return Promise.resolve();
        }

        // Notify UI via context callback
        if (context.updateTodos) {
            context.updateTodos(items);
        }

        const done = items.filter((i) => i.status === 'done').length;
        const total = items.length;

        // FIX-H (ADR-090 follow-up): two-tier verification of done items.
        // Wrapped in try/catch so a verification bug never blocks the tool.
        const warnings: string[] = [];
        let unreadCount = 0;
        let quantViolCount = 0;
        try {
            const readFiles = context.getReadFiles?.() ?? new Set<string>();
            const readBasenames = pathsToBasenames(readFiles);

            // Tier 1: explicit file references in todo text -- must be read.
            // Combines wikilink parsing (shared util) with quoted ".md"
            // mentions (rare in todo text but legitimate).
            const unreadReferences: string[] = [];
            const QUOTED_MD_RE = /"([^"\n]{1,200}\.md)"/g;
            const extractFileRefs = (text: string): string[] => {
                const out = extractWikilinkTargets(text);
                for (const m of text.matchAll(QUOTED_MD_RE)) out.push(m[1].trim());
                return out;
            };
            for (const item of items) {
                if (item.status !== 'done') continue;
                for (const ref of extractFileRefs(item.text)) {
                    if (!ref) continue;
                    if (!readBasenames.has(stripWikilinkExtension(ref))) {
                        unreadReferences.push(`"${ref}" in todo "${item.text.slice(0, 60)}…"`);
                    }
                }
            }
            unreadCount = unreadReferences.length;

            // Tier 2: collective-coverage todos. Two flavours:
            //   (a) Explicit quantifier: "alle / all / every / each / jede / sämtlich"
            //   (b) Plural collective noun without an explicit count:
            //       "Notes finden und lesen", "die Interviews durchgehen",
            //       "alle Notizen sichten" -- when no number is given the agent
            //       implicitly claims completeness.
            // Skip if explicit file refs exist (tier 1 covers it).
            const explicitQuantifierRe = /\b(alle|all|every|each|jede|s(ä|ae)mtlich|complete|vollst(ä|ae)ndig)\b/i;
            // Plural collective nouns -- if ANY of these appears in a done todo
            // with read count <2 and no explicit small count, treat as a
            // quantifier violation. The pattern matches German + English.
            const collectiveNounRe = /\b(notes?|files?|documents?|dokumente|notizen|interviews?|meetings?|berichte|reports?|use ?cases|use-?cases|protokolle|protocols)\b/i;
            // If the todo names a small explicit count ("3 notes", "die ersten 5"),
            // skip the plural-noun trigger (the user/agent quantified themselves).
            const explicitCountRe = /\b(\d+|ein|eine|einen|eines|two|drei|vier|fünf|funf|sechs|sieben|acht|neun|zehn|few|zwei)\b/i;
            const quantifierViolations: string[] = [];
            for (const item of items) {
                if (item.status !== 'done') continue;
                if (extractFileRefs(item.text).length > 0) continue; // tier-1 territory
                const hasExplicit = explicitQuantifierRe.test(item.text);
                const hasPlural = collectiveNounRe.test(item.text);
                const hasCount = explicitCountRe.test(item.text);
                // Trigger if: explicit quantifier, OR plural collective without an explicit count.
                const triggers = hasExplicit || (hasPlural && !hasCount);
                if (!triggers) continue;
                if (readFiles.size < 2) quantifierViolations.push(item.text.slice(0, 80));
            }
            quantViolCount = quantifierViolations.length;

            if (unreadReferences.length > 0) {
                warnings.push(
                    `[VERIFICATION WARNING] You marked todos as done but the following file references have NOT been read in this task:\n  - ${unreadReferences.join('\n  - ')}\nEither read those files now (read_file) or rewrite the todo to reflect what you actually did. Do NOT write a synthesis claiming sources you have not read -- that is hallucination.`
                );
            }
            if (quantifierViolations.length > 0) {
                warnings.push(
                    `[VERIFICATION WARNING] You marked done a todo with a quantifier ("alle / all / jede / every") but only ${readFiles.size} file(s) have been read in this task. That is implausible for a collective claim. Either:\n  1. Read more files now, OR\n  2. Rewrite the todo with the SPECIFIC files you actually processed (e.g. "Read X, Y, Z"), OR\n  3. Demote the todo back to "[~] in_progress" and finish the work.\nAffected todos:\n  - ${quantifierViolations.join('\n  - ')}`
                );
            }
        } catch (e) {
            console.warn('[TodoVerification] check failed (non-fatal, skipping):', e);
        }
        const warning = warnings.length > 0 ? '\n' + warnings.join('\n\n') : '';

        callbacks.pushToolResult(
            `<todo_update items="${total}" done="${done}">Todo list updated (${done}/${total} complete)</todo_update>${warning}`
        );
        const flagSummary = [
            unreadCount > 0 ? `${unreadCount} unread refs` : null,
            quantViolCount > 0 ? `${quantViolCount} quantifier violations` : null,
        ].filter(Boolean).join(', ');
        callbacks.log(`Todo list updated: ${done}/${total} done${flagSummary ? ` (${flagSummary})` : ''}`);
        return Promise.resolve();
    }

    private parseTodos(markdown: string): TodoItem[] {
        return markdown
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.startsWith('- ['))
            .map((line) => {
                const match = line.match(/^- \[([x~\s])\]\s*(.+)$/i);
                if (!match) return null;
                const statusChar = match[1].toLowerCase();
                const text = match[2].trim();
                const status: TodoItem['status'] =
                    statusChar === 'x' ? 'done' :
                    statusChar === '~' ? 'in_progress' :
                    'pending';
                return { text, status };
            })
            .filter((item): item is TodoItem => item !== null);
    }
}

export interface TodoItem {
    text: string;
    status: 'pending' | 'in_progress' | 'done';
}
