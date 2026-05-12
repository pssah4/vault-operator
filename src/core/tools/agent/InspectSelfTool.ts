/**
 * inspect_self -- live introspection of the running plugin (L4).
 *
 * Self-Awareness for the agent: instead of guessing what tools/settings/
 * capabilities Vault Operator currently has, the agent calls inspect_self with
 * a specific area and gets back a Markdown summary of the live runtime
 * state. Counters the hallucination class observed 2026-04-28 (agent
 * invented a Star button that didn't exist yet).
 *
 * Areas (Phase 1):
 *   - settings        plugin.settings, sensitive keys redacted
 *   - tools           ToolRegistry.getAllTools() with name + description
 *   - capabilities    SoulView.getCapabilities() pretty-printed
 *   - code            forward-compat enum, returns "not yet implemented"
 *
 * FEATURE-0319b / PLAN-008 task B.5.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { SoulView } from '../../memory/SoulView';

const ALLOWED_AREAS = ['settings', 'tools', 'capabilities', 'code'] as const;
type InspectArea = typeof ALLOWED_AREAS[number];

const SENSITIVE_KEY_REGEX = /(api[_-]?key|token|secret|password|credential)/i;
const MAX_OUTPUT_CHARS = 8000;

export class InspectSelfTool extends BaseTool<'inspect_self'> {
    readonly name = 'inspect_self' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'inspect_self',
            description:
                'Inspect the running Vault Operator plugin\'s live state. Use when uncertain about ' +
                'your own features rather than guessing. Returns a Markdown summary of one area:\n' +
                '- settings: current configuration values (sensitive keys redacted)\n' +
                '- tools: all currently registered tools with descriptions\n' +
                '- capabilities: agent-self capability snapshot from Memory v2\n' +
                '- code: not yet implemented (Phase 2)',
            input_schema: {
                type: 'object',
                properties: {
                    area: {
                        type: 'string',
                        enum: ['settings', 'tools', 'capabilities', 'code'],
                        description: 'Which slice of the runtime state to inspect.',
                    },
                    topic: {
                        type: 'string',
                        description: 'Optional sub-topic. Used by area=code (Phase 2). Ignored for other areas.',
                    },
                },
                required: ['area'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const area = input.area;
        if (typeof area !== 'string' || !(ALLOWED_AREAS as readonly string[]).includes(area)) {
            callbacks.pushToolResult(this.formatError(
                new Error(`area must be one of ${ALLOWED_AREAS.join(', ')}`),
            ));
            return;
        }
        try {
            const md = await this.renderArea(area as InspectArea);
            callbacks.pushToolResult(truncate(md, MAX_OUTPUT_CHARS));
        } catch (e) {
            callbacks.pushToolResult(this.formatError(e));
        }
    }

    private async renderArea(area: InspectArea): Promise<string> {
        switch (area) {
            case 'settings': return this.renderSettings();
            case 'tools': return this.renderTools();
            case 'capabilities': return this.renderCapabilities();
            case 'code': return Promise.resolve(
                '## inspect_self area=code\n\nCode introspection is not yet implemented (deferred to Phase 2). ' +
                'For tool descriptions use area=tools, for settings use area=settings.',
            );
        }
    }

    private renderSettings(): Promise<string> {
        const lines = ['## Current settings (sensitive values redacted)\n'];
        const redacted = redactSettings(this.plugin.settings as unknown as Record<string, unknown>);
        lines.push('```json');
        lines.push(JSON.stringify(redacted, null, 2));
        lines.push('```');
        return Promise.resolve(lines.join('\n'));
    }

    private renderTools(): Promise<string> {
        const lines = ['## Registered tools\n'];
        const tools = this.plugin.toolRegistry.getAllTools();
        const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
        lines.push(`Total: ${sorted.length}\n`);
        for (const tool of sorted) {
            const def = tool.getDefinition();
            const writeFlag = tool.isWriteOperation ? ' (write)' : '';
            lines.push(`- **${tool.name}**${writeFlag}: ${oneLine(def.description)}`);
        }
        return Promise.resolve(lines.join('\n'));
    }

    private renderCapabilities(): Promise<string> {
        const memDB = this.plugin.memoryDB;
        if (!memDB?.isOpen()) {
            return Promise.resolve(
                '## Capabilities\n\nMemory v2 database is not open. ' +
                'Capability snapshot unavailable until plugin onload completes.',
            );
        }
        const facts = new SoulView(memDB).getCapabilities();
        const lines = ['## Capabilities (Memory v2 snapshot)\n'];
        if (facts.length === 0) {
            lines.push('No capability facts in memory yet. Plugin may need to run onload sync.');
            return Promise.resolve(lines.join('\n'));
        }
        const byArea = new Map<string, typeof facts>();
        for (const f of facts) {
            const area = f.topics.find(t => t !== 'capability') ?? 'misc';
            const bucket = byArea.get(area) ?? [];
            bucket.push(f);
            byArea.set(area, bucket);
        }
        for (const [area, bucket] of [...byArea.entries()].sort()) {
            lines.push(`### ${area}\n`);
            for (const f of bucket) {
                lines.push(`- ${f.text}`);
            }
            lines.push('');
        }
        return Promise.resolve(lines.join('\n'));
    }
}

function redactSettings(obj: Record<string, unknown>, depth = 0): unknown {
    if (depth > 5) return '<truncated>';
    if (Array.isArray(obj)) {
        return (obj as unknown[]).map(item =>
            typeof item === 'object' && item !== null
                ? redactSettings(item as Record<string, unknown>, depth + 1)
                : item,
        );
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEY_REGEX.test(key)) {
            out[key] = typeof value === 'string' && value.length > 0 ? '<redacted>' : value;
            continue;
        }
        if (value !== null && typeof value === 'object') {
            out[key] = redactSettings(value as Record<string, unknown>, depth + 1);
        } else {
            out[key] = value;
        }
    }
    return out;
}

function oneLine(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max) + `\n\n... [truncated at ${max} chars]`;
}
