/**
 * CodeModuleCompiler
 *
 * @deprecated FEAT-29-06 (2026-05-20): use `run_skill_script` instead.
 *
 * This class compiled inline TypeScript code modules embedded in SKILL.md
 * frontmatter and registered them as `custom_*`-tools on the live tool
 * registry. The pattern bloated the tool registry, prevented portable
 * Anthropic-style skills, and forced an editing path that lived in the
 * tool surface instead of the filesystem.
 *
 * The replacement is `RunSkillScriptTool`: scripts live as plain `.js`
 * files under `{skill-folder}/scripts/` and are executed via
 * `run_skill_script(skill_name, script_name, args)`. No tool registry
 * entries, no compilation at create-time.
 *
 * This file is kept (not deleted) so the bestand of already-compiled
 * `custom_*`-tools from previous skill-creates keeps loading via
 * `DynamicToolLoader`. New skills must NOT use it; `ManageSkillTool` no
 * longer instantiates this class as of FEAT-29-06.
 *
 * Part of Self-Development Phase 3 (legacy). To be removed entirely once
 * the in-vault custom_*-bestand is migrated to scripts/.
 */

import { AstValidator } from '../sandbox/AstValidator';
import type { SelfAuthoredSkillLoader } from './SelfAuthoredSkillLoader';
import type { ISandboxExecutor } from '../sandbox/ISandboxExecutor';
import type { CodeModuleInfo } from '../tools/dynamic/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeModuleInput {
    name: string;
    source_code: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
    is_write_operation?: boolean;
    dependencies?: string[];
}

// ---------------------------------------------------------------------------
// CodeModuleCompiler
// ---------------------------------------------------------------------------

/** @deprecated FEAT-29-06: use RunSkillScriptTool. See file-header. */
export class CodeModuleCompiler {
    constructor(
        private skillLoader: SelfAuthoredSkillLoader,
        private sandboxExecutor: ISandboxExecutor | null,
    ) {}

    /**
     * Validate code module names: all must start with "custom_".
     */
    validateNames(modules: CodeModuleInput[]): void {
        for (const cm of modules) {
            if (!cm.name.startsWith('custom_')) {
                throw new Error(`Code module name "${cm.name}" must start with "custom_" prefix.`);
            }
        }
    }

    /**
     * Process a single code module: validate AST, write source, compile, dry-run, register.
     * @returns Human-readable status line for the module.
     */
    async processModule(skillName: string, cm: CodeModuleInput): Promise<string> {
        // AST validation
        const validation = AstValidator.validate(cm.source_code);
        if (!validation.valid) {
            throw new Error(`Code module "${cm.name}" validation failed:\n${validation.errors.join('\n')}`);
        }

        // Build full source with definition export wrapper
        const fullSource = this.buildSource(cm);
        const fileName = CodeModuleCompiler.toolNameToFileName(cm.name);

        // Write source file
        await this.skillLoader.writeCodeModuleSource(skillName, fileName, fullSource);

        // Compile
        const moduleInfo = await this.skillLoader.compileCodeModule(
            skillName, fileName, cm.dependencies,
        );

        // Dry-run test in sandbox
        await this.dryRun(cm.name, moduleInfo);

        // Register the tool
        const skill = this.skillLoader.getSkill(skillName);
        if (skill) {
            this.skillLoader.registerCodeTools(skill);
        }

        return `- ${cm.name}: compiled and registered`;
    }

    /**
     * Build TypeScript source file with definition + execute exports.
     * If the source already has `export const definition`, use it as-is.
     */
    buildSource(cm: CodeModuleInput): string {
        if (cm.source_code.includes('export const definition')) {
            return cm.source_code;
        }

        const schemaStr = JSON.stringify(cm.input_schema, null, 4);
        const depsStr = cm.dependencies?.length
            ? JSON.stringify(cm.dependencies)
            : '[]';

        // Escape strings for safe embedding in generated TypeScript literals (CWE-116 fix)
        const esc = (s: string): string =>
            s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');

        return `export const definition = {
    name: '${esc(cm.name)}',
    description: '${esc(cm.description)}',
    input_schema: ${schemaStr},
    isWriteOperation: ${cm.is_write_operation ?? false},
    dependencies: ${depsStr},
};

${cm.source_code}
`;
    }

    /**
     * Convert tool name to file name: custom_pptx_generator -> pptx-generator
     */
    static toolNameToFileName(toolName: string): string {
        return toolName.replace(/^custom_/, '').replace(/_/g, '-');
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    /**
     * Dry-run test: load the compiled module in the sandbox.
     * Throws on structural errors (broken module, syntax issues).
     * Input-related errors (expected when no real input is provided) are tolerated.
     */
    private async dryRun(moduleName: string, moduleInfo: CodeModuleInfo): Promise<void> {
        if (!this.sandboxExecutor || !moduleInfo.compiledJs) return;

        try {
            await this.sandboxExecutor.execute(moduleInfo.compiledJs, {});
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            const isInputError = /required|missing|undefined is not|cannot read/i.test(errMsg);
            if (!isInputError) {
                throw new Error(
                    `Code module "${moduleName}" dry-run failed: ${errMsg}. ` +
                    `The module could not be loaded in the sandbox. Fix the code and retry.`
                );
            }
            console.debug(`[CodeModuleCompiler] Dry-run for ${moduleName}: input-related error (expected): ${errMsg}`);
        }
    }
}
