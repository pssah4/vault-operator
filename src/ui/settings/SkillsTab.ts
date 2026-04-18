import { App, Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { ContentEditorModal } from './ContentEditorModal';
import type { PluginSkillMeta } from '../../core/skills/types';
import type { SelfAuthoredSkill } from '../../core/skills/SelfAuthoredSkillLoader';
import { getPluginSkillsDir, getSelfAuthoredSkillsDir } from '../../core/utils/agentFolder';
import { importSkill, detectSourceFromFile } from '../../core/skills/SkillImportRouter';
import { t } from '../../i18n';

interface ElectronDialog {
    showOpenDialog(options: {
        title?: string;
        defaultPath?: string;
        properties?: string[];
        filters?: { name: string; extensions: string[] }[];
    }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

function resolveElectronDialog(): ElectronDialog | null {
    let electronModule: { remote?: { dialog?: ElectronDialog }; dialog?: ElectronDialog } | null = null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Electron only reachable via dynamic require in the renderer
        electronModule = require('electron');
    } catch { return null; }
    const direct = electronModule?.dialog;
    if (direct?.showOpenDialog) return direct;
    const legacy = electronModule?.remote?.dialog;
    if (legacy?.showOpenDialog) return legacy;
    return null;
}


/**
 * Unified skill entry for the merged skill list.
 * Combines data from SkillsManager (global) and SelfAuthoredSkillLoader (plugin-local).
 */
interface UnifiedSkill {
    name: string;
    description: string;
    source: 'bundled' | 'learned' | 'user';
    /** Path in global storage (SkillsManager) -- used for toggles */
    globalPath?: string;
    /** SelfAuthoredSkill reference (plugin-local) */
    selfAuthored?: SelfAuthoredSkill;
    /** Has code modules */
    hasCodeModules: boolean;
    codeToolNames: string[];
}


export class SkillsTab {
    /** FEATURE-0507: resolved on demand so the configurable agent folder takes effect immediately. */
    private get skillsDir(): string {
        return getPluginSkillsDir(this.plugin);
    }

    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    build(containerEl: HTMLElement): void {
        // -- Introduction: What are Skills? --
        this.buildIntroSection(containerEl);

        // -- Unified Skills Section (merged Manual + Vault Skills) --
        this.buildUnifiedSkillsSection(containerEl);

        // -- Separator --
        containerEl.createEl('hr');

        // -- Obsidian Plugin Skills (PAS-1) --
        this.buildPluginSkillsSection(containerEl);
    }

    // -- Introduction --

    private buildIntroSection(containerEl: HTMLElement): void {
        const intro = containerEl.createDiv('agent-settings-info-banner');
        const infoIcon = intro.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = intro.createDiv({ cls: 'agent-settings-info-text' });
        infoText.createEl('strong', { text: t('settings.skills.introTitle') });
        infoText.createEl('p', { text: t('settings.skills.introDesc') });
        infoText.createEl('p', { text: t('settings.skills.introDiff') });
    }

    // -- Unified Skills Section --

    private buildUnifiedSkillsSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: t('settings.skills.headingManual') });

        const skillsManager = this.plugin.skillsManager;

        // -- Create new skill --
        const createRow = containerEl.createDiv({ cls: 'agent-rules-create-row' });
        const nameInput = createRow.createEl('input', {
            type: 'text', placeholder: t('settings.skills.placeholder'),
            cls: 'agent-rules-name-input',
        });
        const createBtn = createRow.createEl('button', { text: t('settings.skills.create'), cls: 'mod-cta' });

        // FEATURE-2202: universal import button. Accepts single .md, .skill/.zip
        // or a folder via native picker. Format detection in SkillImportRouter.
        const importSkillBtn = createRow.createEl('button', {
            text: t('settings.skills.import'),
            cls: 'agent-rules-import-btn',
        });
        importSkillBtn.addEventListener('click', () => {
            void this.runUniversalImport(refreshList);
        });

        // -- Skill list --
        const listEl = containerEl.createDiv({ cls: 'agent-rules-list' });

        const refreshList = async () => {
            listEl.empty();

            // Collect and merge skills from both sources
            const unified = await this.collectUnifiedSkills();

            if (unified.length === 0) {
                listEl.createEl('p', { cls: 'agent-empty-state', text: t('settings.skills.empty') });
                return;
            }

            const table = listEl.createEl('table', { cls: 'agent-skill-table' });
            const thead = table.createEl('thead');
            const hr = thead.createEl('tr');
            hr.createEl('th', { text: '', cls: 'agent-skill-th-status' });
            hr.createEl('th', { text: t('settings.skills.headerSkill') });
            hr.createEl('th', { text: 'Source', cls: 'agent-skill-th-cmds' });
            hr.createEl('th', { text: '', cls: 'agent-skill-th-actions' });
            hr.createEl('th', { text: t('settings.skills.headerAgent'), cls: 'agent-skill-th-toggle' });

            const tbody = table.createEl('tbody');

            for (const skill of unified) {
                this.plugin.settings.manualSkillToggles ??= {};
                const toggleKey = skill.globalPath ?? skill.selfAuthored?.filePath ?? skill.name;
                const isActive = this.plugin.settings.manualSkillToggles[toggleKey] !== false;

                const tr = tbody.createEl('tr', {
                    cls: isActive ? '' : 'agent-skill-disabled',
                });

                // Status dot
                const statusTd = tr.createEl('td', { cls: 'agent-skill-status-cell' });
                const dot = statusTd.createSpan({ cls: 'agent-skill-dot' });
                dot.addClass(isActive ? 'agent-skill-dot-on' : 'agent-skill-dot-off');

                // Name + description
                const nameTd = tr.createEl('td', { cls: 'agent-skill-name-cell' });
                nameTd.createDiv({ text: skill.name, cls: 'agent-skill-name' });
                if (skill.description) {
                    nameTd.createDiv({ text: skill.description, cls: 'agent-skill-desc agent-skill-desc-clamped' });
                }

                // Source label
                const sourceLabel = this.getSourceLabel(skill);
                const sourceTd = tr.createEl('td', { cls: 'agent-skill-cmd-cell' });
                const badge = sourceTd.createSpan({ text: sourceLabel, cls: 'agent-skill-source-badge' });
                badge.addClass(`agent-skill-source-${skill.source}`);

                // Actions (edit, export, delete)
                const actionsTd = tr.createEl('td', { cls: 'agent-skill-actions-cell' });

                // Edit
                const editBtn = actionsTd.createEl('button', {
                    cls: 'agent-skill-action-btn', attr: { 'aria-label': t('settings.skills.edit') },
                });
                setIcon(editBtn, 'pencil');
                editBtn.addEventListener('click', () => { void this.editSkill(skill); });

                // Export
                const exportBtn = actionsTd.createEl('button', {
                    cls: 'agent-skill-action-btn', attr: { 'aria-label': t('settings.skills.export') },
                });
                setIcon(exportBtn, 'download');
                exportBtn.addEventListener('click', () => { void this.exportSkill(skill); });

                // Delete (not for bundled skills)
                if (skill.source !== 'bundled') {
                    const delBtn = actionsTd.createEl('button', {
                        cls: 'agent-skill-action-btn', attr: { 'aria-label': t('settings.skills.delete') },
                    });
                    setIcon(delBtn, 'trash-2');
                    delBtn.addEventListener('click', () => { void (async () => {
                        await this.deleteSkill(skill);
                        await refreshList();
                    })(); });
                }

                // Toggle
                const toggleTd = tr.createEl('td', { cls: 'agent-skill-toggle-cell' });
                const toggleContainer = toggleTd.createDiv({
                    cls: `checkbox-container agent-skill-toggle${isActive ? ' is-enabled' : ''}`,
                });
                toggleContainer.addEventListener('click', () => {
                    this.plugin.settings.manualSkillToggles ??= {};
                    const current = this.plugin.settings.manualSkillToggles[toggleKey] !== false;
                    this.plugin.settings.manualSkillToggles[toggleKey] = !current;
                    void this.plugin.saveSettings();
                    toggleContainer.toggleClass('is-enabled', !current);
                    dot.removeClass(current ? 'agent-skill-dot-on' : 'agent-skill-dot-off');
                    dot.addClass(current ? 'agent-skill-dot-off' : 'agent-skill-dot-on');
                    tr.toggleClass('agent-skill-disabled', current);
                });
            }
        };

        createBtn.addEventListener('click', () => { void (async () => {
            const name = nameInput.value.trim();
            if (!name || !skillsManager) return;
            const safeName = name.replace(/[^a-zA-Z0-9_ -]/g, '').trim();
            const dir = `${skillsManager.skillsDir}/${safeName}`;
            const skillPath = `${dir}/SKILL.md`;
            const template = `---\nname: ${safeName}\ndescription: Describe when this skill applies\nkeywords: []\n---\n\n# ${safeName}\n\n<!-- Describe what this skill does and when to use it. The agent reads this file when the skill is relevant. -->\n\n`;
            try {
                await skillsManager.createSkill(dir, template);
                nameInput.value = '';
                await refreshList();
                new ContentEditorModal(this.app, t('settings.skills.editSkill', { name: safeName }), template, (content) => {
                    return skillsManager.writeFile(skillPath, content);
                }).open();
            } catch {
                new Notice(t('settings.skills.createFailed'));
            }
        })(); });

        void refreshList();
    }

    // -- Helpers for unified skills --

    /**
     * Collect skills from both SkillsManager (global) and SelfAuthoredSkillLoader (plugin-local),
     * deduplicate by name, and return a unified list sorted by source priority.
     */
    private async collectUnifiedSkills(): Promise<UnifiedSkill[]> {
        const byName = new Map<string, UnifiedSkill>();

        // 1. SelfAuthoredSkillLoader (plugin-local: bundled + agent + template)
        const loader = this.plugin.selfAuthoredSkillLoader;
        if (loader) {
            for (const skill of loader.getAllSkills()) {
                byName.set(skill.name, {
                    name: skill.name,
                    description: skill.description,
                    source: skill.source,
                    selfAuthored: skill,
                    hasCodeModules: skill.codeModules.length > 0,
                    codeToolNames: skill.codeModuleInfos.map(m => m.name),
                });
            }
        }

        // 2. SkillsManager (global storage: user-created, synced)
        const skillsManager = this.plugin.skillsManager;
        if (skillsManager) {
            const globalSkills = await skillsManager.discoverSkills();
            for (const skill of globalSkills) {
                if (!byName.has(skill.name)) {
                    // Only add if not already present from SelfAuthoredSkillLoader
                    byName.set(skill.name, {
                        name: skill.name,
                        description: skill.description ?? '',
                        source: (skill.source as UnifiedSkill['source']) ?? 'user',
                        globalPath: skill.path,
                        hasCodeModules: false,
                        codeToolNames: [],
                    });
                } else {
                    // Merge: add global path reference for toggle compatibility
                    const existing = byName.get(skill.name);
                    if (existing) {
                        existing.globalPath = skill.path;
                    }
                }
            }
        }

        // Sort: bundled first, then user/template, then agent-created
        const order: Record<string, number> = { bundled: 0, user: 1, learned: 2 };
        return [...byName.values()].sort((a, b) => {
            const oa = order[a.source] ?? 1;
            const ob = order[b.source] ?? 1;
            if (oa !== ob) return oa - ob;
            return a.name.localeCompare(b.name);
        });
    }

    private getSourceLabel(skill: UnifiedSkill): string {
        switch (skill.source) {
            case 'bundled': return 'Built-in';
            case 'learned': return 'Agent';
            case 'user': return 'Template';
            default: return skill.source;
        }
    }

    private async editSkill(skill: UnifiedSkill): Promise<void> {
        try {
            if (skill.selfAuthored) {
                const adapter = this.plugin.app.vault.adapter;
                const content = await adapter.read(skill.selfAuthored.filePath);
                new ContentEditorModal(this.app, t('settings.skills.editSkill', { name: skill.name }), content, async (newContent) => {
                    await adapter.write(skill.selfAuthored!.filePath, newContent);
                }).open();
            } else if (skill.globalPath && this.plugin.skillsManager) {
                const mgr = this.plugin.skillsManager;
                const gPath = skill.globalPath;
                const content = await mgr.readFile(gPath);
                new ContentEditorModal(this.app, t('settings.skills.editSkill', { name: skill.name }), content, (newContent) => {
                    return mgr.writeFile(gPath, newContent);
                }).open();
            }
        } catch (e) {
            new Notice('Failed to edit skill');
            console.error('[SkillsTab] Edit failed:', e);
        }
    }

    private async exportSkill(skill: UnifiedSkill): Promise<void> {
        try {
            let content: string;
            if (skill.selfAuthored) {
                content = await this.plugin.app.vault.adapter.read(skill.selfAuthored.filePath);
            } else if (skill.globalPath && this.plugin.skillsManager) {
                content = await this.plugin.skillsManager.readFile(skill.globalPath);
            } else {
                return;
            }
            const blob = new Blob([content], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `SKILL-${skill.name}.md`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            new Notice('Failed to export skill');
            console.error('[SkillsTab] Export failed:', e);
        }
    }

    private async deleteSkill(skill: UnifiedSkill): Promise<void> {
        if (skill.source === 'bundled') return; // Never delete bundled skills

        try {
            const adapter = this.plugin.app.vault.adapter;
            const loader = this.plugin.selfAuthoredSkillLoader;

            // Delete from plugin-local (SelfAuthoredSkillLoader)
            if (skill.selfAuthored && loader) {
                loader.unregisterCodeTools(skill.selfAuthored);
                const skillDir = skill.selfAuthored.filePath.replace(/\/SKILL\.md$/, '');
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
                loader.removeSkill(skill.name);
            }

            // Delete from global storage (SkillsManager)
            if (skill.globalPath && this.plugin.skillsManager) {
                try {
                    await this.plugin.skillsManager.deleteSkill(skill.globalPath);
                } catch {
                    // Non-fatal if already deleted
                }
            } else if (this.plugin.skillsManager && skill.selfAuthored) {
                // Try to find and delete from global by folder name
                const skillDir = skill.selfAuthored.filePath.replace(/\/SKILL\.md$/, '');
                const skillFolderName = skillDir.split('/').pop();
                if (skillFolderName) {
                    try {
                        await this.plugin.skillsManager.deleteSkill(`skills/${skillFolderName}/SKILL.md`);
                    } catch {
                        // Non-fatal
                    }
                }
            }

            // Clean up toggle
            const toggleKey = skill.globalPath ?? skill.selfAuthored?.filePath ?? skill.name;
            this.plugin.settings.manualSkillToggles ??= {};
            delete this.plugin.settings.manualSkillToggles[toggleKey];
            await this.plugin.saveSettings();

            // Reload if loader available
            if (loader) await loader.loadAll();

            new Notice(`Skill "${skill.name}" deleted`);
        } catch (e) {
            new Notice(t('settings.skills.deleteFailed'));
            console.error('[SkillsTab] Delete failed:', e);
        }
    }

    // -- Obsidian Plugin Skills (PAS-1) --

    private buildPluginSkillsSection(containerEl: HTMLElement): void {
        const scanner = this.plugin.vaultDNAScanner;
        const registry = this.plugin.skillRegistry;

        if (!scanner || !registry) {
            containerEl.createEl('h3', { text: t('settings.skills.headingPlugin') });
            containerEl.createEl('p', {
                cls: 'agent-settings-desc',
                text: t('settings.skills.pluginDisabled'),
            });
            return;
        }

        const activeSkills = registry.getActivePluginSkills();
        const disabledSkills = registry.getDisabledPluginSkills();
        const allSkills = scanner.getAllPluginSkills();

        // Header with stats
        containerEl.createEl('h3', { text: t('settings.skills.headingPlugin') });
        const statsEl = containerEl.createEl('p', { cls: 'agent-settings-desc' });
        statsEl.setText(
            t('settings.skills.pluginStats', { active: activeSkills.length, disabled: disabledSkills.length, total: allSkills.length }),
        );

        // Controls row
        const controlsRow = containerEl.createDiv({ cls: 'agent-skill-controls' });
        const rescanBtn = controlsRow.createEl('button', { text: t('settings.skills.rescan'), cls: 'mod-cta' });
        rescanBtn.addEventListener('click', () => { void (async () => {
            rescanBtn.disabled = true;
            rescanBtn.setText(t('settings.skills.scanning'));
            try {
                await scanner.fullScan();
                registry.updateToggles(this.plugin.settings.vaultDNA.skillToggles);
                new Notice(t('settings.skills.scanComplete', { count: scanner.getAllPluginSkills().length }));
                this.rerender();
            } catch (e) {
                new Notice(t('settings.skills.scanFailed'));
                console.error('[VaultDNA] Rescan failed:', e);
            } finally {
                rescanBtn.disabled = false;
                rescanBtn.setText(t('settings.skills.rescan'));
            }
        })(); });

        // Core Skills section (collapsible)
        const coreSkills = allSkills.filter((s) => s.source === 'core');
        if (coreSkills.length > 0) {
            this.buildCollapsibleSkillGroup(containerEl, t('settings.skills.corePlugins', { count: coreSkills.length }), coreSkills);
        }

        // Community Skills section (collapsible)
        const communitySkills = allSkills.filter((s) => s.source !== 'core');
        if (communitySkills.length > 0) {
            this.buildCollapsibleSkillGroup(containerEl, t('settings.skills.communityPlugins', { count: communitySkills.length }), communitySkills);
        }
    }

    private buildCollapsibleSkillGroup(containerEl: HTMLElement, title: string, skills: PluginSkillMeta[]): void {
        const header = containerEl.createDiv({ cls: 'agent-skill-group-header' });
        const chevron = header.createSpan({ cls: 'agent-skill-group-chevron' });
        setIcon(chevron, 'chevron-down');
        header.createSpan({ text: title, cls: 'agent-skill-group-title' });

        const content = containerEl.createDiv({ cls: 'agent-skill-group-content' });
        this.buildCompactSkillList(content, skills);

        header.addEventListener('click', () => {
            const collapsed = content.classList.toggle('agent-skill-group-collapsed');
            chevron.empty();
            setIcon(chevron, collapsed ? 'chevron-right' : 'chevron-down');
        });
    }

    private buildCompactSkillList(containerEl: HTMLElement, skills: PluginSkillMeta[]): void {
        const table = containerEl.createEl('table', { cls: 'agent-skill-table' });

        // Header
        const thead = table.createEl('thead');
        const hr = thead.createEl('tr');
        hr.createEl('th', { text: '', cls: 'agent-skill-th-status' }); // installed dot
        hr.createEl('th', { text: t('settings.skills.headerPlugin') });
        hr.createEl('th', { text: t('settings.skills.headerCommands'), cls: 'agent-skill-th-cmds' });
        hr.createEl('th', { text: '', cls: 'agent-skill-th-actions' }); // view buttons
        hr.createEl('th', { text: t('settings.skills.headerAgent'), cls: 'agent-skill-th-toggle' }); // agent toggle

        const tbody = table.createEl('tbody');

        // Sort: enabled first, then alphabetical
        const sorted = [...skills].sort((a, b) => {
            if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        for (const skill of sorted) {
            const tr = tbody.createEl('tr', {
                cls: skill.enabled ? '' : 'agent-skill-disabled',
            });

            // Status dot (installed in Obsidian?)
            const statusTd = tr.createEl('td', { cls: 'agent-skill-status-cell' });
            const dot = statusTd.createSpan({ cls: 'agent-skill-dot' });
            dot.addClass(skill.enabled ? 'agent-skill-dot-on' : 'agent-skill-dot-off');
            dot.setAttribute('aria-label', skill.enabled ? t('settings.skills.installed') : t('settings.skills.disabled'));

            // Name + description
            const nameTd = tr.createEl('td', { cls: 'agent-skill-name-cell' });
            nameTd.createDiv({ text: skill.name, cls: 'agent-skill-name' });
            if (skill.description) {
                nameTd.createDiv({ text: skill.description, cls: 'agent-skill-desc' });
            }

            // Command count
            tr.createEl('td', { text: String(skill.commands.length), cls: 'agent-skill-cmd-cell' });

            // Actions (view buttons)
            const actionsTd = tr.createEl('td', { cls: 'agent-skill-actions-cell' });

            // Edit skill file
            const editSkillBtn = actionsTd.createEl('button', {
                cls: 'agent-skill-action-btn', attr: { 'aria-label': t('settings.skills.editFile') },
            });
            setIcon(editSkillBtn, 'pencil');
            editSkillBtn.addEventListener('click', () => void this.openSkillFile(skill));

            // View README (if exists)
            const docsBtn = actionsTd.createEl('button', {
                cls: 'agent-skill-action-btn', attr: { 'aria-label': t('settings.skills.viewReadme') },
            });
            setIcon(docsBtn, 'book-open');
            void this.checkReadmeExists(skill.id).then((exists) => {
                if (!exists) {
                    docsBtn.addClass('agent-skill-action-btn-faint');
                    docsBtn.setAttribute('aria-label', t('settings.skills.noReadme'));
                }
            });
            docsBtn.addEventListener('click', () => void this.openReadmeFile(skill));

            // Toggle -- for ALL plugins (controls whether agent may use this skill)
            const toggleTd = tr.createEl('td', { cls: 'agent-skill-toggle-cell' });
            const isActive = this.plugin.settings.vaultDNA.skillToggles[skill.id] !== false;
            const toggleContainer = toggleTd.createDiv({
                cls: `checkbox-container agent-skill-toggle${isActive ? ' is-enabled' : ''}`,
            });
            toggleContainer.addEventListener('click', () => {
                const current = this.plugin.settings.vaultDNA.skillToggles[skill.id] !== false;
                this.plugin.settings.vaultDNA.skillToggles[skill.id] = !current;
                this.plugin.skillRegistry?.updateToggles(this.plugin.settings.vaultDNA.skillToggles);
                void this.plugin.saveSettings();
                toggleContainer.toggleClass('is-enabled', !current);
            });
        }
    }

    private async openSkillFile(skill: PluginSkillMeta): Promise<void> {
        const path = `${this.skillsDir}/${skill.id}.skill.md`;
        try {
            const content = await this.app.vault.adapter.read(path);
            new ContentEditorModal(this.app, t('settings.skills.skillDetail', { name: skill.name }), content, (updated) => {
                return this.app.vault.adapter.write(path, updated);
            }).open();
        } catch {
            new Notice(t('settings.skills.fileNotFound', { id: skill.id }));
        }
    }

    private async openReadmeFile(skill: PluginSkillMeta): Promise<void> {
        const path = `${this.skillsDir}/${skill.id}.readme.md`;
        try {
            const content = await this.app.vault.adapter.read(path);
            new ContentEditorModal(this.app, t('settings.skills.readme', { name: skill.name }), content, (updated) => {
                return this.app.vault.adapter.write(path, updated);
            }).open();
        } catch {
            new Notice(t('settings.skills.noReadmeAvailable', { name: skill.name }));
        }
    }

    private async checkReadmeExists(pluginId: string): Promise<boolean> {
        try {
            return await this.app.vault.adapter.exists(`${this.skillsDir}/${pluginId}.readme.md`);
        } catch {
            return false;
        }
    }

    /**
     * FEATURE-2202: universal skill import. Opens the native picker if
     * available (lets the user pick either a file or a directory), falls
     * back to an HTML file input otherwise. The router detects the type and
     * dispatches to the right sub-importer.
     */
    private async runUniversalImport(refreshList: () => Promise<void>): Promise<void> {
        const targetSkillsDir = getSelfAuthoredSkillsDir(this.plugin);
        const adapter = this.app.vault.adapter;
        const dialog = resolveElectronDialog();

        if (dialog) {
            await this.runElectronImport(dialog, targetSkillsDir, adapter, refreshList);
            return;
        }

        this.runHtmlFileImport(targetSkillsDir, adapter, refreshList);
    }

    private async runElectronImport(
        dialog: ElectronDialog,
        targetSkillsDir: string,
        adapter: import('obsidian').DataAdapter,
        refreshList: () => Promise<void>,
    ): Promise<void> {
        const pick = await dialog.showOpenDialog({
            title: 'Import skill',
            properties: ['openFile', 'openDirectory'],
            filters: [
                { name: 'Skill files', extensions: ['md', 'zip', 'skill'] },
                { name: 'All files', extensions: ['*'] },
            ],
        });
        if (pick.canceled || pick.filePaths.length === 0) return;

        const chosen = pick.filePaths[0];
        try {
            const result = await this.runImportForPath(chosen, targetSkillsDir, adapter);
            await this.finishImport(result, refreshList);
        } catch (e) {
            new Notice(`Skill import failed: ${this.errorMessage(e)}`, 8000);
        }
    }

    private async runImportForPath(
        absolutePath: string,
        targetSkillsDir: string,
        adapter: import('obsidian').DataAdapter,
    ): Promise<Awaited<ReturnType<typeof importSkill>>> {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node fs only reachable via dynamic require
        const fs: typeof import('fs/promises') = require('fs/promises');
        const stat = await fs.stat(absolutePath);

        if (stat.isDirectory()) {
            return await importSkill({
                adapter,
                targetSkillsDir,
                source: { kind: 'directory', absolutePath },
            });
        }

        // File on disk -- load it as a Web File so the router can reuse the
        // existing .md/.zip handlers.
        const buffer = await fs.readFile(absolutePath);
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- Node path only reachable via dynamic require
        const nodePath: typeof import('path') = require('path');
        const filename = nodePath.basename(absolutePath);
        const fileLike = new File([new Uint8Array(buffer)], filename);
        return await importSkill({
            adapter,
            targetSkillsDir,
            source: detectSourceFromFile(fileLike),
        });
    }

    private runHtmlFileImport(
        targetSkillsDir: string,
        adapter: import('obsidian').DataAdapter,
        refreshList: () => Promise<void>,
    ): void {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.md,.txt,.zip,.skill';
        fileInput.addEventListener('change', () => { void (async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            try {
                const result = await importSkill({
                    adapter,
                    targetSkillsDir,
                    source: detectSourceFromFile(file),
                });
                await this.finishImport(result, refreshList);
            } catch (e) {
                new Notice(`Skill import failed: ${this.errorMessage(e)}`, 8000);
            }
        })(); });
        fileInput.click();
    }

    private async finishImport(
        result: Awaited<ReturnType<typeof importSkill>>,
        refreshList: () => Promise<void>,
    ): Promise<void> {
        const loader = this.plugin.selfAuthoredSkillLoader;
        if (loader) await loader.refresh();
        await refreshList();
        const written = result.writtenFiles.length;
        const kindLabel = result.kind === 'zip'
            ? 'skill package'
            : result.kind === 'folder'
                ? 'skill folder'
                : 'single-file skill';
        new Notice(`Imported ${kindLabel} "${result.slug}" (${written} file${written === 1 ? '' : 's'}).`);
    }

    private errorMessage(e: unknown): string {
        const raw = (e as { message?: unknown })?.message;
        if (typeof raw === 'string') return raw;
        if (typeof e === 'string') return e;
        return 'unknown error';
    }
}
