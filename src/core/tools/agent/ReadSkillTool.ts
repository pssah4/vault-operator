/**
 * ReadSkillTool — FEAT-24-09 / ADR-116 (Active Skills on-demand).
 *
 * Loads the full SKILL.md body of a skill listed in the SKILLS directory of
 * the system prompt. The body is returned as a tool result (lives in the
 * message stream, falls under microcompaction per FEAT-24-02), not injected
 * into the system prompt.
 *
 * Replaces the previous per-message LLM classifier in
 * AgentSidebarView.classifySkillsWithLlm: the model now picks the skill
 * itself based on the directory's name+description and loads the body
 * via this tool. This saves one LLM round-trip per user message and keeps
 * the system-prompt prefix cache-stable.
 *
 * NOT in DEFERRED_TOOL_NAMES — must be available immediately so loading a
 * skill is a single tool call.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { SelfAuthoredSkillLoader, SelfAuthoredSkill } from '../../skills/SelfAuthoredSkillLoader';
import { stigmergySkillId } from '../../stigmergy/StigmergyAdapter';
import { emitStigmergyInvoked, emitStigmergyReturned } from '../../stigmergy/stigmergyEmitGate';

/**
 * Hard cap on the body returned to the LLM. Skills above this size point to
 * their reference files in the inventory section instead of being inlined.
 */
const MAX_SKILL_BODY_CHARS = 24_000;

export class ReadSkillTool extends BaseTool<'read_skill'> {
    readonly name = 'read_skill' as const;
    readonly isWriteOperation = false;

    private readonly skillLoader: SelfAuthoredSkillLoader | null;

    constructor(plugin: ObsidianAgentPlugin, skillLoader: SelfAuthoredSkillLoader | null) {
        super(plugin);
        this.skillLoader = skillLoader;
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'read_skill',
            description:
                'Load the full step-by-step instructions of a skill listed in the '
                + 'SKILLS directory of your system prompt. Call this BEFORE doing the '
                + "work when the user's task matches a skill's purpose, then follow "
                + 'the returned workflow exactly. Returns an error (with the list of '
                + 'available skill names) if the name is not in the directory.',
            input_schema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Exact skill name as it appears in the SKILLS directory.',
                    },
                },
                required: ['name'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const rawName = typeof input.name === 'string' ? input.name.trim() : '';

        if (!rawName) {
            callbacks.pushToolResult(this.formatError(new Error('name is required')));
            return;
        }

        // Stigmergy: emit at the inner dispatch with a namespaced skill id
        // so the substrate sees `skill:<name>` directly. Both branches
        // (success path, not-found path) emit the returned event with the
        // right success flag. The pipeline still emits `read_skill`
        // invoked/returned around this whole call.
        // FEAT-32-01 PR 1.2 / ADR-131: gate inner skill emit on dispatchSource.
        const stigmergyTurn = context.stigmergyTurn;
        const dispatchSource = context.dispatchSource;
        const capId = stigmergySkillId(rawName);
        await emitStigmergyInvoked(stigmergyTurn, capId, dispatchSource);
        let loaded = false;
        try {
            // 1. Try self-authored / bundled skills (carries inventory + code modules).
            const selfAuthored = this.skillLoader?.getSkill(rawName);
            if (selfAuthored) {
                callbacks.pushToolResult(this.formatSuccess(this.renderSelfAuthored(selfAuthored)));
                loaded = true;
                return;
            }

            // 2. Try user skills from the SkillsManager (markdown-only, no inventory).
            const skillsManager = this.plugin.skillsManager;
            if (skillsManager) {
                try {
                    const all = await skillsManager.discoverSkills();
                    const meta = all.find(s => s.name === rawName);
                    if (meta) {
                        const raw = await skillsManager.readFile(meta.path);
                        callbacks.pushToolResult(
                            this.formatSuccess(this.renderUserSkill(rawName, meta.description, raw)),
                        );
                        loaded = true;
                        return;
                    }
                } catch (e) {
                    callbacks.pushToolResult(
                        this.formatError(new Error(`Failed to read skill "${rawName}": ${(e as Error).message}`)),
                    );
                    return;
                }
            }

            // 3. Not found -> list everything we know so the model can recover.
            const available = await this.collectAvailableNames();
            const list = available.length > 0
                ? available.join(', ')
                : '(no skills installed)';
            callbacks.pushToolResult(
                this.formatError(new Error(
                    `Skill "${rawName}" not found. Available skills: ${list}. `
                    + 'Check the SKILLS directory in your system prompt.',
                )),
            );
        } finally {
            await emitStigmergyReturned(stigmergyTurn, capId, loaded, dispatchSource);
        }
    }

    // -----------------------------------------------------------------------
    // Renderers
    // -----------------------------------------------------------------------

    private renderSelfAuthored(skill: SelfAuthoredSkill): string {
        const body = this.capBody(skill.body);
        const inventory = this.renderInventoryHints(skill);
        const codeNote = skill.codeModuleInfos.length > 0
            ? `\n**Code modules registered as tools:** ${skill.codeModuleInfos.map(m => m.name).join(', ')}`
            : '';
        return [
            `## SKILL: ${skill.name} -- follow this workflow for the current task.`,
            'It OVERRIDES default tool selection and general guidelines.',
            '',
            `**Description:** ${skill.description}`,
            `**Source:** ${skill.source}${codeNote}`,
            inventory,
            '',
            '---',
            '',
            body,
        ].filter(line => line !== '').join('\n');
    }

    private renderUserSkill(name: string, description: string, raw: string): string {
        // Strip YAML frontmatter -- the SKILLS directory already carries the
        // metadata, the LLM only needs the workflow body here.
        const stripped = raw.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
        const body = this.capBody(stripped);
        return [
            `## SKILL: ${name} -- follow this workflow for the current task.`,
            'It OVERRIDES default tool selection and general guidelines.',
            '',
            `**Description:** ${description}`,
            '**Source:** user',
            '',
            '---',
            '',
            body,
        ].join('\n');
    }

    private renderInventoryHints(skill: SelfAuthoredSkill): string {
        const { scripts, references, assets, subRoles } = skill.inventory;
        const lines: string[] = [];
        if (scripts.length > 0) {
            lines.push(`**Scripts:** ${scripts.map(s => s.path).join(', ')}`);
        }
        if (references.length > 0) {
            lines.push(`**References (read with read_file when needed):** ${references.join(', ')}`);
        }
        if (assets.length > 0) {
            lines.push(`**Assets:** ${assets.join(', ')}`);
        }
        if (subRoles.length > 0) {
            lines.push(`**Sub-roles (read on demand):** ${subRoles.map(r => `${r.filePath} (${r.role})`).join(', ')}`);
        }
        return lines.join('\n');
    }

    private capBody(body: string): string {
        if (body.length <= MAX_SKILL_BODY_CHARS) return body;
        return body.slice(0, MAX_SKILL_BODY_CHARS)
            + `\n\n...(truncated; this skill is ${body.length} chars total. `
            + 'For long skills, read the reference files listed in the inventory '
            + 'with read_file instead of calling read_skill again.)';
    }

    private async collectAvailableNames(): Promise<string[]> {
        const names = new Set<string>();
        if (this.skillLoader) {
            for (const s of this.skillLoader.getAllSkills()) names.add(s.name);
        }
        const skillsManager = this.plugin.skillsManager;
        if (skillsManager) {
            try {
                for (const s of await skillsManager.discoverSkills()) names.add(s.name);
            } catch {
                /* tolerate listing failures -- the not-found error still helps */
            }
        }
        return [...names].sort();
    }
}
