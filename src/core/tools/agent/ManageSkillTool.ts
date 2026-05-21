/**
 * ManageSkillTool
 *
 * Allows the agent to create, update, delete, list, validate, and read
 * self-authored SKILL.md files. Skills are Markdown-based workflow
 * instructions with YAML frontmatter.
 *
 * FEAT-29-06 (2026-05-20): the legacy `code_modules` input parameter has
 * been REMOVED. TypeScript helper code now lives as plain `.js` files in
 * `{skill-folder}/scripts/` and is executed via the new `run_skill_script`
 * tool. The `CodeModuleCompiler` is deprecated (kept for the bestand of
 * already-compiled custom_*-tools, no new modules registered).
 *
 * Part of Self-Development Phase 2: Skill Self-Authoring.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import type { SelfAuthoredSkillLoader } from '../../skills/SelfAuthoredSkillLoader';
import type { ISandboxExecutor } from '../../sandbox/ISandboxExecutor';
import type { ToolRegistry } from '../ToolRegistry';
import { AstValidator } from '../../sandbox/AstValidator';
import { safeRegex } from '../../utils/safeRegex';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface ManageSkillInput {
    action: 'create' | 'update' | 'delete' | 'list' | 'validate' | 'read';
    name?: string;
    description?: string;
    trigger?: string;
    required_tools?: string[];
    body?: string;
    source?: string;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export class ManageSkillTool extends BaseTool<'manage_skill'> {
    readonly name = 'manage_skill' as const;
    readonly isWriteOperation = false;

    private skillLoader: SelfAuthoredSkillLoader;

    constructor(
        plugin: ObsidianAgentPlugin,
        skillLoader: SelfAuthoredSkillLoader,
        _esbuildManager?: unknown,
        _sandboxExecutor?: ISandboxExecutor | null,
        _toolRegistry?: ToolRegistry | null,
    ) {
        super(plugin);
        this.skillLoader = skillLoader;
        // FEAT-29-06: CodeModuleCompiler is no longer instantiated here.
        // The optional sandbox/registry parameters are kept for call-site
        // compatibility during the transition; they go unused.
    }

    getDefinition(): ToolDefinition {
        return {
            name: this.name,
            description: 'Manage self-authored skills (SKILL.md files). Skills are reusable workflow instructions that persist across sessions. Actions: create, update, delete, list, validate, read. For computational helpers (data processing, binary generation), drop a JavaScript file into the skill\'s scripts/ folder and call it via run_skill_script -- the legacy code_modules input was removed in FEAT-29-06. IMPORTANT: Active skills are already included (truncated) in your system prompt — do NOT call read for skills you can already see in <available_skills>. For corporate PPTX templates use ingest_template instead.',
            input_schema: {
                type: 'object',
                properties: {
                    action: {
                        type: 'string',
                        description: 'Action to perform.',
                        enum: ['create', 'update', 'delete', 'list', 'validate', 'read'],
                    },
                    name: {
                        type: 'string',
                        description: 'Skill name (required for create/update/delete/validate/read).',
                    },
                    description: {
                        type: 'string',
                        description: 'Short description of what the skill does (required for create).',
                    },
                    trigger: {
                        type: 'string',
                        description: 'Regex pattern for auto-triggering the skill from user messages (e.g. "daily|summary|zusammenfassung").',
                    },
                    required_tools: {
                        type: 'array',
                        description: 'List of tool names this skill needs.',
                        items: { type: 'string' },
                    },
                    body: {
                        type: 'string',
                        description: 'Markdown body with step-by-step instructions (required for create).',
                    },
                    source: {
                        type: 'string',
                        description: 'Skill source: "learned" (agent-created), "user" (user-created).',
                        enum: ['learned', 'user'],
                    },
                },
                required: ['action'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { callbacks } = context;
        const params = input as unknown as ManageSkillInput;
        const action = (params.action ?? '').trim();

        try {
            if (action === 'create') {
                await this.handleCreate(params, callbacks, context);
            } else if (action === 'update') {
                await this.handleUpdate(params, callbacks, context);
            } else if (action === 'delete') {
                await this.handleDelete(params, callbacks, context);
            } else if (action === 'list') {
                this.handleList(callbacks);
            } else if (action === 'validate') {
                await this.handleValidate(params, callbacks);
            } else if (action === 'read') {
                await this.handleRead(params, callbacks);
            } else {
                callbacks.pushToolResult(this.formatError(`Unknown action: "${action}". Use: create, update, delete, list, validate, read`));
            }
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }

    // -----------------------------------------------------------------------
    // Action handlers
    // -----------------------------------------------------------------------

    private async handleCreate(
        params: ManageSkillInput,
        callbacks: { pushToolResult(c: string): void },
        context: ToolExecutionContext,
    ): Promise<void> {
        if (!params.name) throw new Error('Missing "name" for create action.');
        if (!params.description) throw new Error('Missing "description" for create action.');
        if (!params.body) throw new Error('Missing "body" for create action.');

        const adapter = this.plugin.app.vault.adapter;
        const slug = this.slugify(params.name);
        const dirPath = `${this.skillLoader.getSkillsDir()}/${slug}`;
        const filePath = `${dirPath}/SKILL.md`;

        // Check if skill already exists (use adapter — vault API doesn't index .obsidian/)
        if (await adapter.exists(filePath)) {
            throw new Error(`Skill "${params.name}" already exists at ${filePath}. Use "update" action.`);
        }

        // Guard: reject manual creation of template/presentation skills.
        // Template skills MUST be created via ingest_template which generates
        // a layout catalog with shape names, content types, and dimensions.
        if (this.looksLikeTemplateSkill(params.body, params.required_tools)) {
            throw new Error(
                'Template presentation skills cannot be created manually via manage_skill. ' +
                'Use the ingest_template tool instead -- it analyzes the template and generates ' +
                'a layout catalog (catalog.json) with shape names and content types automatically.',
            );
        }

        // Ensure directory exists (adapter.mkdir works for .obsidian/ paths)
        await adapter.mkdir(dirPath);

        // Build SKILL.md content. FEAT-29-06: code_modules-Pfad entfernt.
        const content = this.buildSkillMd(params);
        // Use adapter.write — vault.create doesn't work reliably for .obsidian/ paths
        await adapter.write(filePath, content);

        // Also write to global storage immediately (don't wait for SyncBridge)
        if (this.plugin.skillsManager) {
            try {
                await this.plugin.skillsManager.createSkill(`skills/${slug}`, content);
            } catch {
                // Non-fatal: SyncBridge will catch up on next push
            }
        }

        // Reload skills so the new skill is immediately available in-memory
        // (vault events don't fire for .obsidian/ paths, so hot-reload won't trigger)
        await this.skillLoader.loadAll();

        callbacks.pushToolResult(this.formatSuccess(
            `Skill "${params.name}" created at ${filePath}. For helper scripts, drop JS files into scripts/ and call them via run_skill_script.`
        ));
    }

    private async handleUpdate(
        params: ManageSkillInput,
        callbacks: { pushToolResult(c: string): void },
        context: ToolExecutionContext,
    ): Promise<void> {
        if (!params.name) throw new Error('Missing "name" for update action.');

        const skill = this.skillLoader.getSkill(params.name);
        if (!skill) throw new Error(`Skill "${params.name}" not found. Use "list" to see available skills.`);
        if (skill.source === 'bundled') throw new Error(`Bundled skills cannot be updated.`);

        // Use adapter — vault API doesn't index .obsidian/ paths
        const adapter = this.plugin.app.vault.adapter;
        if (!(await adapter.exists(skill.filePath))) {
            throw new Error(`Skill file not found: ${skill.filePath}`);
        }

        // Preserve any code-module filenames the skill already has on disk
        // (kept in frontmatter for back-compat with older custom_*-bestand);
        // FEAT-29-06 no longer adds new ones.
        const existingCodeModules = skill.codeModules ?? [];

        // Merge updates
        const mergedDescription = params.description ?? skill.description;
        const mergedTrigger = params.trigger ?? skill.triggerSource;
        const mergedRequiredTools = params.required_tools ?? skill.requiredTools;
        const mergedBody = params.body ?? skill.body;

        if (this.isProtectedTemplateSkill(skill.filePath, mergedBody, mergedRequiredTools)) {
            throw new Error(
                `Template skill "${params.name}" cannot be updated via manage_skill. ` +
                'Re-run ingest_template to regenerate the layout catalog.',
            );
        }

        const content = this.buildSkillMd({
            name: params.name,
            description: mergedDescription,
            trigger: mergedTrigger,
            required_tools: mergedRequiredTools,
            body: mergedBody,
            source: skill.source,
        }, existingCodeModules);

        // Use adapter.write — vault.modify doesn't work reliably for .obsidian/ paths
        await adapter.write(skill.filePath, content);

        // Also write to global storage immediately (don't wait for SyncBridge)
        const slug = skill.filePath.split('/').slice(-2, -1)[0]; // extract slug from path
        if (this.plugin.skillsManager && slug) {
            try {
                await this.plugin.skillsManager.writeFile(`skills/${slug}/SKILL.md`, content);
            } catch {
                // Non-fatal: SyncBridge will catch up on next push
            }
        }

        // Reload skills so the updated skill is immediately available in-memory
        await this.skillLoader.loadAll();

        callbacks.pushToolResult(this.formatSuccess(`Skill "${params.name}" updated.`));
    }

    private async handleDelete(
        params: ManageSkillInput,
        callbacks: { pushToolResult(c: string): void },
        context: ToolExecutionContext,
    ): Promise<void> {
        if (!params.name) throw new Error('Missing "name" for delete action.');

        const skill = this.skillLoader.getSkill(params.name);
        if (!skill) throw new Error(`Skill "${params.name}" not found.`);
        if (skill.source === 'bundled') throw new Error(`Bundled skills cannot be deleted.`);

        // Unregister code tools first
        this.skillLoader.unregisterCodeTools(skill);

        // Delete code module files
        if (skill.codeModules.length > 0) {
            await this.skillLoader.deleteCodeModules(skill);
        }

        // Delete the entire skill directory (not just SKILL.md)
        const adapter = this.plugin.app.vault.adapter;
        const skillDir = skill.filePath.replace(/\/SKILL\.md$/, '');
        const exists = await adapter.exists(skillDir);
        if (exists) {
            const listing = await adapter.list(skillDir);
            for (const filePath of listing.files) {
                await adapter.remove(filePath);
            }
            for (const subdir of listing.folders) {
                const subdirListing = await adapter.list(subdir);
                for (const subfile of subdirListing.files) {
                    await adapter.remove(subfile);
                }
                if (subdirListing.folders.length === 0) {
                    await adapter.rmdir(subdir, false);
                }
            }
            await adapter.rmdir(skillDir, false);
        }

        // Also delete from global storage if available
        const skillFolderName = skillDir.split('/').pop();
        if (this.plugin.skillsManager && skillFolderName) {
            const globalPath = `skills/${skillFolderName}/SKILL.md`;
            try {
                await this.plugin.skillsManager.deleteSkill(globalPath);
            } catch {
                // Non-fatal if already deleted or not in global storage
            }
        }

        if (skill.codeModules.length > 0) {
            context.invalidateToolCache?.();
        }

        // Remove from in-memory map (loadAll would also work but is heavier)
        this.skillLoader.removeSkill(params.name ?? '');

        callbacks.pushToolResult(this.formatSuccess(`Skill "${params.name}" deleted.`));
    }

    private handleList(callbacks: { pushToolResult(c: string): void }): void {
        const skills = this.skillLoader.getAllSkills();
        if (skills.length === 0) {
            callbacks.pushToolResult(this.formatSuccess('No self-authored skills found. Use "create" to make one.'));
            return;
        }

        const lines = skills.map(s => {
            const success = s.successCount > 0 ? ` (used ${s.successCount}x)` : '';
            const codeInfo = s.codeModules.length > 0
                ? ` [code: ${s.codeModuleInfos.map(m => m.name).join(', ')}]`
                : '';
            return `- ${s.name}: ${s.description} [${s.source}]${success}${codeInfo}`;
        });

        callbacks.pushToolResult(this.formatSuccess(
            `${skills.length} skill(s):\n${lines.join('\n')}`
        ));
    }

    private async handleValidate(
        params: ManageSkillInput,
        callbacks: { pushToolResult(c: string): void },
    ): Promise<void> {
        if (!params.name) throw new Error('Missing "name" for validate action.');

        const skill = this.skillLoader.getSkill(params.name);
        if (!skill) throw new Error(`Skill "${params.name}" not found.`);

        const issues: string[] = [];

        if (!skill.description) issues.push('Missing description');
        if (!skill.body || skill.body.length < 10) issues.push('Body too short (should describe steps)');

        try {
            const compiled = safeRegex(skill.triggerSource, 'i');
            // safeRegex falls back to literal match for complex/ReDoS-prone patterns
            const literalEscaped = skill.triggerSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (compiled.source === literalEscaped && skill.triggerSource !== literalEscaped) {
                issues.push(`Trigger regex simplified to literal match (too complex): ${skill.triggerSource}`);
            }
        } catch {
            issues.push(`Invalid trigger regex: ${skill.triggerSource}`);
        }

        for (const tool of skill.requiredTools) {
            if (!this.plugin.toolRegistry.hasTool(tool as import('../types').ToolName)) {
                issues.push(`Required tool not found: ${tool}`);
            }
        }

        for (const moduleName of skill.codeModules) {
            const source = await this.skillLoader.readCodeModuleSource(skill.name, moduleName);
            if (!source) {
                issues.push(`Code module source not found: ${moduleName}.ts`);
                continue;
            }
            const validation = AstValidator.validate(source);
            if (!validation.valid) {
                issues.push(`Code module "${moduleName}" AST errors: ${validation.errors.join('; ')}`);
            }
            const moduleInfo = skill.codeModuleInfos.find(m => m.file === moduleName);
            if (!moduleInfo?.compiledJs) {
                issues.push(`Code module "${moduleName}" has no compiled cache`);
            }
        }

        if (issues.length === 0) {
            callbacks.pushToolResult(this.formatSuccess(`Skill "${params.name}" is valid.`));
        } else {
            callbacks.pushToolResult(this.formatSuccess(
                `Skill "${params.name}" has ${issues.length} issue(s):\n${issues.map(i => `- ${i}`).join('\n')}`
            ));
        }
    }

    private async handleRead(
        params: ManageSkillInput,
        callbacks: { pushToolResult(c: string): void },
    ): Promise<void> {
        if (!params.name) throw new Error('Missing "name" for read action.');

        const skill = this.skillLoader.getSkill(params.name);
        if (!skill) throw new Error(`Skill "${params.name}" not found.`);

        let codeSection = '';
        if (skill.codeModules.length > 0) {
            const codeParts: string[] = [];
            for (const moduleName of skill.codeModules) {
                const source = await this.skillLoader.readCodeModuleSource(skill.name, moduleName);
                const moduleInfo = skill.codeModuleInfos.find(m => m.file === moduleName);
                const status = moduleInfo?.compiledJs ? 'compiled' : 'not compiled';
                codeParts.push(`### ${moduleInfo?.name ?? moduleName} (${status})\n\`\`\`typescript\n${source ?? '(source not found)'}\n\`\`\``);
            }
            codeSection = `\n\n## Code Modules\n\n${codeParts.join('\n\n')}`;
        }

        // FEAT-24-09 / ADR-116: skill bodies are no longer in the system prompt.
        // manage_skill read is the EDITING/inspection path; the loading path for
        // applying a skill to a task is the always-available read_skill tool.
        const BODY_LIMIT = 4000;
        const bodyDisplay = skill.body.length > BODY_LIMIT
            ? skill.body.slice(0, BODY_LIMIT) +
              `\n\n...(body truncated -- this skill is ${skill.body.length} chars total. ` +
              `If you wanted to APPLY the skill, call read_skill({ name: "${skill.name}" }) ` +
              `instead of manage_skill read; for the full source open the file with read_file.)`
            : skill.body;
        callbacks.pushToolResult(this.formatSuccess(
            `# ${skill.name}\n\n**Description**: ${skill.description}\n**Trigger**: ${skill.triggerSource}\n**Source**: ${skill.source}\n**Used**: ${skill.successCount} time(s)\n**Tools**: ${skill.requiredTools.join(', ') || '(none)'}\n**Code Modules**: ${skill.codeModules.length > 0 ? skill.codeModules.join(', ') : '(none)'}\n\n---\n\n${bodyDisplay}${codeSection}`
        ));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private buildSkillMd(
        params: Omit<ManageSkillInput, 'action'>,
        codeModuleNames?: string[],
    ): string {
        const tools = params.required_tools?.length
            ? `[${params.required_tools.join(', ')}]`
            : '[]';

        const codeModulesLine = codeModuleNames?.length
            ? `\ncodeModules: [${codeModuleNames.join(', ')}]`
            : '';

        return `---
name: ${params.name}
description: ${params.description ?? ''}
trigger: "${params.trigger ?? params.name?.toLowerCase() ?? ''}"
source: ${params.source ?? 'learned'}
requiredTools: ${tools}${codeModulesLine}
createdAt: ${new Date().toISOString()}
successCount: 0
---
${params.body ?? ''}
`;
    }

    private slugify(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    /**
     * Detect if the user is trying to manually create a template/presentation skill
     * that should be auto-generated by ingest_template instead.
     * Heuristic: body mentions template_slide/template_file AND required_tools include create_pptx.
     */
    private looksLikeTemplateSkill(body: string, requiredTools?: string[]): boolean {
        const hasCreatePptx = requiredTools?.includes('create_pptx') ?? false;
        if (!hasCreatePptx) return false;

        const templatePatterns = [
            /template_slide/i,
            /template_file/i,
            /\.pptx.*vorlage|vorlage.*\.pptx/i,
            /slide.katalog|folienbibliothek/i,
            /brand.dna.*color|color.*brand.dna/i,
        ];
        return templatePatterns.some(p => p.test(body));
    }

    private isProtectedTemplateSkill(
        _skillFilePath: string,
        body: string,
        requiredTools?: string[],
    ): boolean {
        return this.looksLikeTemplateSkill(body, requiredTools);
    }
}
