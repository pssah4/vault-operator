/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * SelfAuthoredSkillLoader
 *
 * Loads and manages agent-created SKILL.md files with YAML frontmatter.
 * Skills are stored in the plugin data directory under skills/.
 * Hot-reload via Vault events.
 *
 * Skills can optionally contain code modules (TypeScript files in code/)
 * that are compiled and registered as dynamic tools. This unifies the
 * former "Skills" and "Dynamic Tools" concepts into a single abstraction.
 *
 * Part of Self-Development Phase 2+3: Skill Self-Authoring + Code Modules.
 */

import { TFile, TFolder } from 'obsidian';
import { safeRegex } from '../utils/safeRegex';
import { getSelfAuthoredSkillsDir } from '../utils/agentFolder';
import type ObsidianAgentPlugin from '../../main';
import type { EsbuildWasmManager } from '../sandbox/EsbuildWasmManager';
import type { ISandboxExecutor } from '../sandbox/ISandboxExecutor';
import type { ToolRegistry } from '../tools/ToolRegistry';
import { DynamicToolFactory } from '../tools/dynamic/DynamicToolFactory';
import type { CodeModuleInfo, DynamicToolDefinition } from '../tools/dynamic/types';
import type { ToolName } from '../tools/types';
import type {
    SkillInventory,
    SkillScriptLanguage,
    SkillSubRole,
} from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SelfAuthoredSkill {
    name: string;
    description: string;
    trigger: RegExp;
    triggerSource: string;
    source: 'learned' | 'user' | 'bundled';
    requiredTools: string[];
    /** Code module filenames (without .ts) listed in frontmatter */
    codeModules: string[];
    /** Loaded code module metadata (populated after loading compiled JS) */
    codeModuleInfos: CodeModuleInfo[];
    createdAt: Date;
    successCount: number;
    body: string;
    filePath: string;
    /**
     * Content sidecars in the skill folder (`scripts/`, `references/`,
     * `assets/`, sub-role `*.skill.md`). Empty for flat single-file skills.
     * EPIC-022 / ADR-075.
     */
    inventory: SkillInventory;
    /** `type: coordinator` frontmatter flag. Empty inventory.subRoles if false. */
    isCoordinator: boolean;
}

// ---------------------------------------------------------------------------
// SelfAuthoredSkillLoader
// ---------------------------------------------------------------------------

export class SelfAuthoredSkillLoader {
    private skills = new Map<string, SelfAuthoredSkill>();
    private readonly skillsDir: string;
    /**
     * User/learned skills dir. Computed on each loadAll() so a change to
     * the agent-folder setting (ADR-072) is picked up without plugin reload.
     * FEATURE-2201 Decision 2026-04-18: moved from hardcoded `.obsilo-sync/skills/`
     * to `getSelfAuthoredSkillsDir(plugin)`.
     */
    private getUserSkillsDir(): string {
        return getSelfAuthoredSkillsDir(this.plugin);
    }
    private esbuildManager: EsbuildWasmManager | null;
    private sandboxExecutor: ISandboxExecutor | null;
    private toolRegistry: ToolRegistry | null;
    /** Debounce timers for hot-reload per file path */
    private recompileTimers = new Map<string, number>();
    /** Serialize compilation to prevent concurrent builds for the same module */
    private compileQueue = Promise.resolve();

    constructor(
        private plugin: ObsidianAgentPlugin,
        esbuildManager?: EsbuildWasmManager | null,
        sandboxExecutor?: ISandboxExecutor | null,
        toolRegistry?: ToolRegistry | null,
    ) {
        this.skillsDir = `${this.plugin.app.vault.configDir}/plugins/${this.plugin.manifest.id}/skills`;
        this.esbuildManager = esbuildManager ?? null;
        this.sandboxExecutor = sandboxExecutor ?? null;
        this.toolRegistry = toolRegistry ?? null;
    }

    /**
     * Late-bind dependencies that are not available at construction time.
     * Called from main.ts after ToolRegistry is created.
     */
    setDependencies(
        esbuildManager: EsbuildWasmManager,
        sandboxExecutor: ISandboxExecutor,
        toolRegistry: ToolRegistry,
    ): void {
        this.esbuildManager = esbuildManager;
        this.sandboxExecutor = sandboxExecutor;
        this.toolRegistry = toolRegistry;
    }

    /**
     * Scan skills directories and load all SKILL.md files.
     * Bundled skills come from the inlined BUNDLED_SKILLS constant
     * (no disk access), user/learned skills from the configured
     * agent folder in the vault. For skills with code modules,
     * loads cached compiled JS and registers tools.
     */
    async loadAll(): Promise<void> {
        this.skills.clear();

        // 1. Bundled skills from the inlined constant (Phase 1: no
        //    more pluginDir reads).
        await this.scanBundledSkillsFromConstant();
        // 2. User/learned skills from the configured agent folder
        await this.scanSkillsFrom(this.getUserSkillsDir());

        // After all skills are loaded, load cached code modules and register tools
        for (const skill of this.skills.values()) {
            if (skill.codeModules.length > 0) {
                await this.loadCodeModules(skill);
                this.registerCodeTools(skill);
            }
        }

        console.debug(`[SelfAuthoredSkillLoader] Loaded ${this.skills.size} skill(s)`);
    }

    /**
     * Re-run the full scan. Called after a skill import or migration so the
     * new skills become visible without reloading the plugin.
     * FEATURE-2201 / FEATURE-2202.
     */
    async refresh(): Promise<void> {
        await this.loadAll();
    }

    /**
     * Load all bundled skills from the inlined BUNDLED_SKILLS constant.
     * Bundled skills ship as a flat Record<skillName, Record<file, content>>
     * generated by esbuild from `bundled-skills/` at build time. No disk
     * access -- avoids the Obsidian "self-update" pattern match.
     */
    private async scanBundledSkillsFromConstant(): Promise<void> {
        const { BUNDLED_SKILLS } = await import('../../_generated/bundled-skills');
        for (const [skillName, files] of Object.entries(BUNDLED_SKILLS)) {
            const skillMd = files['SKILL.md'];
            if (!skillMd) continue;
            // Synthetic path so parseSkillMd and downstream code have
            // a stable identifier; not a real adapter path.
            const skillPath = `<bundled>/${skillName}/SKILL.md`;
            const parsed = this.parseSkillMd(skillMd, skillPath);
            if (!parsed) continue;
            // Inventory is empty by design: today no bundled skill ships
            // scripts/, references/, assets/, or sub-roles. If that changes,
            // extend BUNDLED_SKILLS to include nested paths and rebuild
            // inventory from the const here.
            this.skills.set(parsed.name, parsed);
        }
    }

    /**
     * Scan a single skills directory for SKILL.md files in subfolders.
     */
    private async scanSkillsFrom(dir: string): Promise<void> {
        const adapter = this.plugin.app.vault.adapter;
        const dirExists = await adapter.exists(dir);
        if (!dirExists) return;

        try {
            const entries = await adapter.list(dir);
            for (const subfolderPath of entries.folders) {
                const skillPath = `${subfolderPath}/SKILL.md`;
                if (await adapter.exists(skillPath)) {
                    const content = await adapter.read(skillPath);
                    const parsed = this.parseSkillMd(content, skillPath);
                    if (!parsed) continue;
                    // FEATURE-2201: populate inventory from scripts/, references/,
                    // assets/, and sub-role *.skill.md files next to SKILL.md.
                    parsed.inventory = await this.loadSkillInventory(subfolderPath, parsed.isCoordinator);
                    this.skills.set(parsed.name, parsed);
                }
            }
        } catch (e) {
            console.warn(`[SelfAuthoredSkillLoader] Failed to scan ${dir}:`, e);
        }
    }

    /**
     * Scan the Anthropic sub-directories under a skill folder and, for
     * coordinator skills, gather sub-role frontmatter. Errors during a
     * subfolder scan are logged and treated as empty -- the skill still
     * loads without its sidecars.
     * FEATURE-2201 / ADR-075.
     */
    private async loadSkillInventory(skillFolder: string, isCoordinator: boolean): Promise<SkillInventory> {
        const adapter = this.plugin.app.vault.adapter;
        const inventory: SkillInventory = {
            scripts: [],
            references: [],
            assets: [],
            subRoles: [],
        };

        const scriptsDir = `${skillFolder}/scripts`;
        if (await adapter.exists(scriptsDir)) {
            try {
                const entries = await adapter.list(scriptsDir);
                for (const filePath of entries.files) {
                    const filename = filePath.slice(skillFolder.length + 1); // include "scripts/"
                    const language = this.detectScriptLanguage(filePath);
                    const stat = await adapter.stat(filePath).catch(() => null);
                    inventory.scripts.push({
                        path: filename,
                        language,
                        sizeBytes: stat?.size ?? 0,
                    });
                }
            } catch (e) {
                console.warn(`[SelfAuthoredSkillLoader] Failed to scan ${scriptsDir}:`, e);
            }
        }

        const referencesDir = `${skillFolder}/references`;
        if (await adapter.exists(referencesDir)) {
            try {
                const entries = await adapter.list(referencesDir);
                for (const filePath of entries.files) {
                    inventory.references.push(filePath.slice(skillFolder.length + 1));
                }
            } catch (e) {
                console.warn(`[SelfAuthoredSkillLoader] Failed to scan ${referencesDir}:`, e);
            }
        }

        const assetsDir = `${skillFolder}/assets`;
        if (await adapter.exists(assetsDir)) {
            try {
                const entries = await adapter.list(assetsDir);
                for (const filePath of entries.files) {
                    inventory.assets.push(filePath.slice(skillFolder.length + 1));
                }
            } catch (e) {
                console.warn(`[SelfAuthoredSkillLoader] Failed to scan ${assetsDir}:`, e);
            }
        }

        if (isCoordinator) {
            try {
                const entries = await adapter.list(skillFolder);
                for (const filePath of entries.files) {
                    const filename = filePath.slice(skillFolder.length + 1);
                    if (!filename.endsWith('.skill.md')) continue;
                    const subRole = await this.parseSubRole(filePath, filename);
                    if (subRole) inventory.subRoles.push(subRole);
                }
            } catch (e) {
                console.warn(`[SelfAuthoredSkillLoader] Failed to scan sub-roles in ${skillFolder}:`, e);
            }
        }

        return inventory;
    }

    private detectScriptLanguage(path: string): SkillScriptLanguage {
        const lower = path.toLowerCase();
        if (lower.endsWith('.ts')) return 'ts';
        if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'js';
        if (lower.endsWith('.py')) return 'py';
        if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'sh';
        if (lower.endsWith('.md')) return 'md';
        return 'other';
    }

    private async parseSubRole(filePath: string, filename: string): Promise<SkillSubRole | null> {
        const adapter = this.plugin.app.vault.adapter;
        try {
            const content = await adapter.read(filePath);
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
            if (!fmMatch) return null;
            const fm = this.parseFrontmatter(fmMatch[1]);
            const stem = filename.replace(/\.skill\.md$/, '');
            return {
                role: fm.role ?? stem,
                name: fm.name ?? stem,
                description: fm.description ?? '',
                filePath: filename,
            };
        } catch (e) {
            console.warn(`[SelfAuthoredSkillLoader] Failed to parse sub-role ${filePath}:`, e);
            return null;
        }
    }

    /**
     * Set up hot-reload watchers for skill file changes.
     * Code file changes are debounced (500ms) and serialized to prevent
     * race conditions during rapid edits.
     */
    setupWatcher(): void {
        this.plugin.registerEvent(
            this.plugin.app.vault.on('modify', (file) => {
                if (file instanceof TFile && this.isSkillFile(file)) {
                    void this.loadSkillFile(file);
                } else if (file instanceof TFile && this.isCodeFile(file)) {
                    this.debouncedCodeRecompile(file);
                }
            })
        );
        this.plugin.registerEvent(
            this.plugin.app.vault.on('create', (file) => {
                if (file instanceof TFile && this.isSkillFile(file)) {
                    void this.loadSkillFile(file);
                }
            })
        );
        this.plugin.registerEvent(
            this.plugin.app.vault.on('delete', (file) => {
                if (file instanceof TFile && this.isSkillFile(file)) {
                    this.removeSkillByPath(file.path);
                }
            })
        );
    }

    /**
     * Debounce code file recompilation (500ms) to avoid rapid-fire compilation
     * during incremental saves. Each file path gets its own timer.
     */
    private debouncedCodeRecompile(file: TFile): void {
        const existing = this.recompileTimers.get(file.path);
        if (existing) window.clearTimeout(existing);

        const timer = window.setTimeout(() => {
            this.recompileTimers.delete(file.path);
            // Serialize: queue behind any in-flight compilation
            this.compileQueue = this.compileQueue
                .then(() => this.handleCodeFileChange(file))
                .catch(e => console.warn(`[SelfAuthoredSkillLoader] Queued recompile failed for ${file.path}:`, e));
        }, 500);

        this.recompileTimers.set(file.path, timer);
    }

    /**
     * Get metadata summary for the SKILLS directory in the system prompt
     * (Progressive Disclosure / ADR-116: metadata only -- the body is loaded
     * on demand via the `read_skill` tool).
     *
     * For skills that ship a FEATURE-2201 inventory (scripts/references/assets)
     * or a FEATURE-2204 coordinator, this method appends a nested block with
     * the filenames and sub-roles so the agent knows what to `read_file` or
     * execute via the sandbox.
     *
     * `allowedNames` is the optional FEAT-24-09 filter: when set, only skills
     * whose name is in the set are rendered (used by per-mode allow-lists and
     * manual toggles in AgentSidebarView).
     */
    getMetadataSummary(allowedNames?: ReadonlySet<string>): string {
        if (this.skills.size === 0) return '';
        const skills = [...this.skills.values()].filter(
            s => !allowedNames || allowedNames.has(s.name),
        );
        if (skills.length === 0) return '';
        return skills.map(s => this.renderSkillSummary(s)).join('\n');
    }

    private renderSkillSummary(s: SelfAuthoredSkill): string {
        // FEAT-24-09: trigger removed from the head -- in the on-demand model
        // the LLM picks a skill by description, not by regex match.
        const codeBadge = s.codeModules.length > 0
            ? ` [code: ${s.codeModuleInfos.map(m => m.name).join(', ')}]`
            : '';
        const coordinatorBadge = s.isCoordinator ? ' (coordinator)' : '';
        const head = `- ${s.name}${coordinatorBadge}: ${s.description}${codeBadge}`;
        const inventoryLines = this.renderInventoryLines(s);
        return inventoryLines.length === 0 ? head : [head, ...inventoryLines].join('\n');
    }

    private renderInventoryLines(s: SelfAuthoredSkill): string[] {
        const { scripts, references, assets, subRoles } = s.inventory;
        const lines: string[] = [];

        if (scripts.length > 0) {
            const rendered = scripts.map(sc => {
                const execTag = sc.language === 'ts' || sc.language === 'js'
                    ? 'sandbox-executable'
                    : `${sc.language}, reference-only`;
                return `${sc.path} (${execTag})`;
            }).join(', ');
            lines.push(`  Scripts: ${rendered}`);
        }

        if (references.length > 0) {
            lines.push(`  References (on-demand via read_file): ${references.join(', ')}`);
        }

        if (assets.length > 0) {
            lines.push(`  Assets: ${assets.join(', ')}`);
        }

        if (s.isCoordinator && subRoles.length > 0) {
            const rendered = subRoles.map(r => `${r.filePath} (${r.role}: ${r.description})`).join(', ');
            lines.push(`  Sub-roles (read on demand): ${rendered}`);
        }

        return lines;
    }

    /**
     * Get full skill body for activation (Progressive Disclosure: full content).
     */
    getSkillBody(name: string): string | undefined {
        return this.skills.get(name)?.body;
    }

    /**
     * Match a user message against skill triggers. Returns matching skills.
     */
    matchSkills(userMessage: string): SelfAuthoredSkill[] {
        const matches: SelfAuthoredSkill[] = [];
        for (const skill of this.skills.values()) {
            if (skill.trigger.test(userMessage)) {
                matches.push(skill);
            }
        }
        return matches;
    }

    /**
     * Get all loaded skills.
     */
    getAllSkills(): SelfAuthoredSkill[] {
        return [...this.skills.values()];
    }

    /**
     * Get a skill by name.
     */
    getSkill(name: string): SelfAuthoredSkill | undefined {
        return this.skills.get(name);
    }

    /**
     * Increment the success count for a skill.
     */
    async incrementSuccess(name: string): Promise<void> {
        const skill = this.skills.get(name);
        if (!skill) return;
        skill.successCount++;
        // Update the file
        await this.updateFrontmatterField(skill.filePath, 'successCount', String(skill.successCount));
    }

    /**
     * Get the skills directory path for new user/learned skills. Resolves to
     * `<agent-folder>/skills/` per ADR-072 (configurable root). Historical
     * location `.obsilo-sync/skills/` is migrated on plugin start.
     */
    getSkillsDir(): string {
        return this.getUserSkillsDir();
    }

    // -----------------------------------------------------------------------
    // Code Module Management (public, used by ManageSkillTool)
    // -----------------------------------------------------------------------

    /**
     * Compile a TypeScript code module for a skill.
     * Reads source from code/{moduleName}.ts, compiles via esbuild,
     * and caches the result in code-compiled/{moduleName}.js.
     *
     * @returns The CodeModuleInfo with compiledJs populated.
     */
    async compileCodeModule(
        skillName: string,
        moduleName: string,
        dependencies?: string[],
    ): Promise<CodeModuleInfo> {
        if (!this.esbuildManager) {
            throw new Error('EsbuildWasmManager not available. Cannot compile code modules.');
        }

        const skill = this.skills.get(skillName);
        if (!skill) throw new Error(`Skill "${skillName}" not found.`);

        const skillDir = skill.filePath.replace(/\/SKILL\.md$/, '');
        const sourceFile = this.plugin.app.vault.getAbstractFileByPath(
            `${skillDir}/code/${moduleName}.ts`
        );
        if (!(sourceFile instanceof TFile)) {
            throw new Error(`Source file not found: ${skillDir}/code/${moduleName}.ts`);
        }

        const sourceCode = await this.plugin.app.vault.read(sourceFile);

        // Compile
        let compiledJs: string;
        if (dependencies && dependencies.length > 0) {
            compiledJs = await this.esbuildManager.build(sourceCode, dependencies);
        } else {
            compiledJs = await this.esbuildManager.transform(sourceCode);
        }

        // Cache compiled JS
        const compiledDir = `${skillDir}/code-compiled`;
        const compiledPath = `${compiledDir}/${moduleName}.js`;

        // Ensure code-compiled directory exists
        const compiledFolder = this.plugin.app.vault.getAbstractFileByPath(compiledDir);
        if (!(compiledFolder instanceof TFolder)) {
            await this.plugin.app.vault.createFolder(compiledDir);
        }

        // Write compiled JS
        const existingCompiled = this.plugin.app.vault.getAbstractFileByPath(compiledPath);
        if (existingCompiled instanceof TFile) {
            await this.plugin.app.vault.modify(existingCompiled, compiledJs);
        } else {
            await this.plugin.app.vault.create(compiledPath, compiledJs);
        }

        // Parse the definition from the source code
        const moduleInfo = this.parseCodeModuleDefinition(sourceCode, moduleName);
        moduleInfo.compiledJs = compiledJs;

        // Update skill's codeModuleInfos
        const existingIdx = skill.codeModuleInfos.findIndex(m => m.file === moduleName);
        if (existingIdx >= 0) {
            skill.codeModuleInfos[existingIdx] = moduleInfo;
        } else {
            skill.codeModuleInfos.push(moduleInfo);
        }

        // Ensure codeModules list includes this module
        if (!skill.codeModules.includes(moduleName)) {
            skill.codeModules.push(moduleName);
        }

        return moduleInfo;
    }

    /**
     * Register all code module tools for a skill with the ToolRegistry.
     */
    registerCodeTools(skill: SelfAuthoredSkill): void {
        if (!this.toolRegistry || !this.sandboxExecutor) return;

        for (const moduleInfo of skill.codeModuleInfos) {
            if (!moduleInfo.compiledJs) continue;

            const definition: DynamicToolDefinition = {
                name: moduleInfo.name,
                description: moduleInfo.description,
                input_schema: moduleInfo.inputSchema,
                isWriteOperation: moduleInfo.isWriteOperation,
                dependencies: moduleInfo.dependencies,
            };

            const tool = DynamicToolFactory.create(
                definition,
                moduleInfo.compiledJs,
                this.sandboxExecutor,
                this.plugin,
            );
            this.toolRegistry.register(tool);
            console.debug(`[SelfAuthoredSkillLoader] Registered code tool: ${moduleInfo.name}`);
        }
    }

    /**
     * Unregister all code module tools for a skill from the ToolRegistry.
     */
    unregisterCodeTools(skill: SelfAuthoredSkill): void {
        if (!this.toolRegistry) return;

        for (const moduleInfo of skill.codeModuleInfos) {
            this.toolRegistry.unregister(moduleInfo.name as ToolName);
            console.debug(`[SelfAuthoredSkillLoader] Unregistered code tool: ${moduleInfo.name}`);
        }
    }

    /**
     * Write a TypeScript source file into a skill's code/ directory.
     */
    async writeCodeModuleSource(
        skillName: string,
        moduleName: string,
        sourceCode: string,
    ): Promise<void> {
        const skill = this.skills.get(skillName);
        if (!skill) throw new Error(`Skill "${skillName}" not found.`);

        const skillDir = skill.filePath.replace(/\/SKILL\.md$/, '');
        const codeDir = `${skillDir}/code`;
        const filePath = `${codeDir}/${moduleName}.ts`;

        // Ensure code directory exists
        const codeFolder = this.plugin.app.vault.getAbstractFileByPath(codeDir);
        if (!(codeFolder instanceof TFolder)) {
            await this.plugin.app.vault.createFolder(codeDir);
        }

        // Write the source file
        const existing = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (existing instanceof TFile) {
            await this.plugin.app.vault.modify(existing, sourceCode);
        } else {
            await this.plugin.app.vault.create(filePath, sourceCode);
        }
    }

    /**
     * Delete code module files (source + compiled) for a skill.
     */
    async deleteCodeModules(skill: SelfAuthoredSkill): Promise<void> {
        const skillDir = skill.filePath.replace(/\/SKILL\.md$/, '');

        // Delete code-compiled/ files
        for (const moduleName of skill.codeModules) {
            const compiledPath = `${skillDir}/code-compiled/${moduleName}.js`;
            const compiledFile = this.plugin.app.vault.getAbstractFileByPath(compiledPath);
            if (compiledFile instanceof TFile) {
                await this.plugin.app.fileManager.trashFile(compiledFile);
            }

            const sourcePath = `${skillDir}/code/${moduleName}.ts`;
            const sourceFile = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
            if (sourceFile instanceof TFile) {
                await this.plugin.app.fileManager.trashFile(sourceFile);
            }
        }

        // Try to remove empty directories
        const compiledDir = this.plugin.app.vault.getAbstractFileByPath(`${skillDir}/code-compiled`);
        if (compiledDir instanceof TFolder && compiledDir.children.length === 0) {
            await this.plugin.app.fileManager.trashFile(compiledDir);
        }
        const codeDir = this.plugin.app.vault.getAbstractFileByPath(`${skillDir}/code`);
        if (codeDir instanceof TFolder && codeDir.children.length === 0) {
            await this.plugin.app.fileManager.trashFile(codeDir);
        }
    }

    /**
     * Read source code of a code module.
     */
    async readCodeModuleSource(skillName: string, moduleName: string): Promise<string | null> {
        const skill = this.skills.get(skillName);
        if (!skill) return null;

        const skillDir = skill.filePath.replace(/\/SKILL\.md$/, '');
        const sourcePath = `${skillDir}/code/${moduleName}.ts`;
        const sourceFile = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
        if (!(sourceFile instanceof TFile)) return null;

        return await this.plugin.app.vault.read(sourceFile);
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private async loadSkillFile(file: TFile): Promise<void> {
        try {
            const content = await this.plugin.app.vault.read(file);
            const parsed = this.parseSkillMd(content, file.path);
            if (parsed) {
                const skillFolder = file.path.replace(/\/SKILL\.md$/, '');
                parsed.inventory = await this.loadSkillInventory(skillFolder, parsed.isCoordinator);
                this.skills.set(parsed.name, parsed);
            }
        } catch (e) {
            console.warn(`[SelfAuthoredSkillLoader] Failed to load ${file.path}:`, e);
        }
    }

    /**
     * Load cached compiled JS for a skill's code modules.
     * This does NOT trigger compilation — only loads from code-compiled/ cache.
     */
    private async loadCodeModules(skill: SelfAuthoredSkill): Promise<void> {
        const skillDir = skill.filePath.replace(/\/SKILL\.md$/, '');

        for (const moduleName of skill.codeModules) {
            try {
                // Try to load compiled JS from cache
                const compiledPath = `${skillDir}/code-compiled/${moduleName}.js`;
                const compiledFile = this.plugin.app.vault.getAbstractFileByPath(compiledPath);
                if (!(compiledFile instanceof TFile)) {
                    console.debug(`[SelfAuthoredSkillLoader] No cached compiled JS for ${moduleName} in skill "${skill.name}"`);
                    continue;
                }

                const compiledJs = await this.plugin.app.vault.read(compiledFile);

                // Try to read source to get definition metadata
                const sourcePath = `${skillDir}/code/${moduleName}.ts`;
                const sourceFile = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
                let moduleInfo: CodeModuleInfo;

                if (sourceFile instanceof TFile) {
                    const sourceCode = await this.plugin.app.vault.read(sourceFile);
                    moduleInfo = this.parseCodeModuleDefinition(sourceCode, moduleName);
                } else {
                    // Fallback: minimal info from module name
                    moduleInfo = {
                        name: `custom_${moduleName.replace(/-/g, '_')}`,
                        file: moduleName,
                        description: `Code module: ${moduleName}`,
                        inputSchema: { type: 'object', properties: {} },
                        isWriteOperation: false,
                        dependencies: [],
                    };
                }

                moduleInfo.compiledJs = compiledJs;
                skill.codeModuleInfos.push(moduleInfo);
            } catch (e) {
                console.warn(`[SelfAuthoredSkillLoader] Failed to load code module ${moduleName}:`, e);
            }
        }
    }

    /**
     * Parse the `export const definition = {...}` from a TypeScript source file.
     * Uses safe field extraction — NO code evaluation (no eval/new Function).
     * Extracts individual fields via regex to avoid executing untrusted code
     * in the plugin context.
     */
    private parseCodeModuleDefinition(sourceCode: string, moduleName: string): CodeModuleInfo {
        const defaults: CodeModuleInfo = {
            name: `custom_${moduleName.replace(/-/g, '_')}`,
            file: moduleName,
            description: `Code module: ${moduleName}`,
            inputSchema: { type: 'object', properties: {} },
            isWriteOperation: false,
            dependencies: [],
        };

        try {
            // Extract the definition block (between export const definition = { ... };)
            const defMatch = sourceCode.match(
                /export\s+const\s+definition\s*=\s*(\{[\s\S]*?\n\});/
            );
            if (!defMatch) return defaults;
            const block = defMatch[1];

            // Safe field extractors — only parse string/boolean/array literals
            const name = this.extractStringField(block, 'name') ?? defaults.name;
            const description = this.extractStringField(block, 'description') ?? defaults.description;
            const isWriteOperation = this.extractBooleanField(block, 'isWriteOperation') ?? false;
            const dependencies = this.extractStringArrayField(block, 'dependencies') ?? [];

            // Extract input_schema as JSON — it's a nested object, parse carefully
            let inputSchema = defaults.inputSchema;
            const schemaMatch = block.match(/input_schema\s*:\s*(\{[\s\S]*?\n\s{4}\})/);
            if (schemaMatch) {
                try {
                    // Normalize JS object literal to valid JSON:
                    // - single quotes → double quotes (for string values)
                    // - unquoted keys → quoted keys
                    // - trailing commas removed
                    const jsonStr = schemaMatch[1]
                        .replace(/'/g, '"')
                        .replace(/(\w+)\s*:/g, '"$1":')
                        .replace(/,(\s*[}\]])/g, '$1');
                    const raw: unknown = JSON.parse(jsonStr);
                    if (
                        raw !== null && typeof raw === 'object' &&
                        'type' in raw && (raw as Record<string, unknown>).type === 'object'
                    ) {
                        const candidate = raw as Record<string, unknown>;
                        if (!candidate.properties || typeof candidate.properties === 'object') {
                            inputSchema = raw as CodeModuleInfo['inputSchema'];
                        }
                    }
                } catch {
                    // Schema parsing failed — use defaults
                }
            }

            return { name, file: moduleName, description, inputSchema, isWriteOperation, dependencies };
        } catch (e) {
            console.warn(`[SelfAuthoredSkillLoader] Failed to parse definition from ${moduleName}.ts:`, e);
            return defaults;
        }
    }

    /** Escape regex metacharacters in a string (AUDIT-007 M-2). */
    private escapeForRegex(s: string): string {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /** Extract a string field value from a JS object literal block. */
    private extractStringField(block: string, field: string): string | undefined {
        // Matches: field: 'value' or field: "value"
        // AUDIT-007 M-2: Escape field name to prevent ReDoS
        const match = block.match(new RegExp(`${this.escapeForRegex(field)}\\s*:\\s*['"]([^'"]*?)['"]`));
        return match ? match[1] : undefined;
    }

    /** Extract a boolean field value from a JS object literal block. */
    private extractBooleanField(block: string, field: string): boolean | undefined {
        const match = block.match(new RegExp(`${this.escapeForRegex(field)}\\s*:\\s*(true|false)`));
        return match ? match[1] === 'true' : undefined;
    }

    /** Extract a string array field from a JS object literal block. */
    private extractStringArrayField(block: string, field: string): string[] | undefined {
        const match = block.match(new RegExp(`${this.escapeForRegex(field)}\\s*:\\s*\\[([^\\]]*)\\]`));
        if (!match) return undefined;
        if (!match[1].trim()) return [];
        return match[1].split(',')
            .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
    }

    /**
     * Handle changes to .ts files in code/ directories.
     * Re-compiles and re-registers the affected code module.
     */
    private async handleCodeFileChange(file: TFile): Promise<void> {
        // Find which skill this code file belongs to
        const skill = this.findSkillByCodeFile(file.path);
        if (!skill) return;

        const moduleName = file.basename; // filename without extension

        try {
            // Find dependencies from existing module info
            const existingInfo = skill.codeModuleInfos.find(m => m.file === moduleName);
            const dependencies = existingInfo?.dependencies;

            // Unregister old tool
            if (existingInfo && this.toolRegistry) {
                this.toolRegistry.unregister(existingInfo.name as ToolName);
            }

            // Recompile and register
            await this.compileCodeModule(skill.name, moduleName, dependencies);
            this.registerCodeTools(skill);
            console.debug(`[SelfAuthoredSkillLoader] Hot-reloaded code module: ${moduleName} in skill "${skill.name}"`);
        } catch (e) {
            console.warn(`[SelfAuthoredSkillLoader] Failed to hot-reload ${file.path}:`, e);
        }
    }

    private findSkillByCodeFile(filePath: string): SelfAuthoredSkill | undefined {
        for (const skill of this.skills.values()) {
            const skillDir = skill.filePath.replace(/\/SKILL\.md$/, '');
            if (filePath.startsWith(`${skillDir}/code/`)) {
                return skill;
            }
        }
        return undefined;
    }

    private parseSkillMd(content: string, filePath: string): SelfAuthoredSkill | null {
        // Accept two metadata shapes:
        //   1) YAML frontmatter at the top (Vault Operator + Anthropic standard).
        //   2) HTML-comment metadata block anywhere in the file (real-world
        //      Anthropic skills sometimes ship this form -- EPIC-022 beta
        //      feedback 2026-04-19).
        let frontmatter: string | null = null;
        let body: string | null = null;

        const yaml = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (yaml) {
            frontmatter = yaml[1];
            body = yaml[2].trim();
        } else {
            const html = content.match(/<!--\s*(?:Metadata|metadata|SKILL|skill)\s*\n([\s\S]*?)\n-->/);
            if (html) {
                frontmatter = html[1];
                // Body = full content WITHOUT the metadata block so the skill
                // markdown the user wrote still reaches the prompt.
                body = content.replace(html[0], '').trim();
            }
        }

        if (frontmatter === null || body === null) return null;

        // Parse frontmatter key-value pairs
        const fm = this.parseFrontmatter(frontmatter);
        if (!fm.name || !fm.description) return null;

        const triggerSource = fm.trigger ?? fm.name.toLowerCase();
        // M-3: Use safeRegex to prevent ReDoS from malicious trigger patterns
        const trigger = safeRegex(triggerSource, 'i');

        return {
            name: fm.name,
            description: fm.description,
            trigger,
            triggerSource,
            source: (fm.source as SelfAuthoredSkill['source']) ?? 'user',
            requiredTools: fm.requiredTools ? this.parseArray(fm.requiredTools) : [],
            codeModules: fm.codeModules ? this.parseArray(fm.codeModules) : [],
            codeModuleInfos: [],
            createdAt: fm.createdAt ? new Date(fm.createdAt) : new Date(),
            successCount: fm.successCount ? parseInt(fm.successCount, 10) : 0,
            body,
            filePath,
            // FEATURE-2201: inventory gets populated by scanSkillsFrom() after parse.
            inventory: { scripts: [], references: [], assets: [], subRoles: [] },
            isCoordinator: fm.type === 'coordinator',
        };
    }

    private parseFrontmatter(text: string): Record<string, string> {
        const result: Record<string, string> = {};
        for (const line of text.split('\n')) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;
            const key = line.slice(0, colonIdx).trim();
            let value = line.slice(colonIdx + 1).trim();
            // Strip quotes
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            result[key] = value;
        }
        return result;
    }

    private parseArray(value: string): string[] {
        // Support [a, b, c] format
        const match = value.match(/^\[(.*)]$/);
        if (match) {
            return match[1].split(',').map(s => s.trim()).filter(Boolean);
        }
        return value.split(',').map(s => s.trim()).filter(Boolean);
    }

    private isSkillFile(file: TFile): boolean {
        const userDir = this.getUserSkillsDir();
        return (file.path.startsWith(this.skillsDir) || file.path.startsWith(userDir))
            && file.name === 'SKILL.md';
    }

    private isCodeFile(file: TFile): boolean {
        const userDir = this.getUserSkillsDir();
        return (file.path.startsWith(this.skillsDir) || file.path.startsWith(userDir))
            && file.extension === 'ts'
            && file.path.includes('/code/');
    }

    /**
     * Remove a skill from the in-memory map by name.
     * Does NOT delete files -- caller is responsible for file cleanup.
     */
    removeSkill(name: string): void {
        const skill = this.skills.get(name);
        if (skill) {
            this.unregisterCodeTools(skill);
            this.skills.delete(name);
            console.debug(`[SelfAuthoredSkillLoader] Removed skill: ${name}`);
        }
    }

    private removeSkillByPath(path: string): void {
        for (const [name, skill] of this.skills) {
            if (skill.filePath === path) {
                // Unregister code tools before removing
                this.unregisterCodeTools(skill);
                this.skills.delete(name);
                console.debug(`[SelfAuthoredSkillLoader] Removed skill: ${name}`);
                return;
            }
        }
    }

    private async updateFrontmatterField(filePath: string, key: string, value: string): Promise<void> {
        // Use adapter — vault API doesn't index .obsidian/ paths
        const adapter = this.plugin.app.vault.adapter;
        if (!(await adapter.exists(filePath))) return;
        const content = await adapter.read(filePath);
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) return;

        const fm = fmMatch[1];
        // AUDIT-007 M-2: Escape key to prevent ReDoS
        const regex = new RegExp(`^${this.escapeForRegex(key)}:.*$`, 'm');
        const updated = regex.test(fm)
            ? fm.replace(regex, `${key}: ${value}`)
            : fm + `\n${key}: ${value}`;

        const newContent = content.replace(fmMatch[0], `---\n${updated}\n---`);
        await adapter.write(filePath, newContent);
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
