import { App, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ModeConfig } from '../../types/settings';
import { BUILT_IN_MODES } from '../../core/modes/builtinModes';
import { buildSystemPromptForMode } from '../../core/systemPrompt';
import { GlobalModeStore } from '../../core/modes/GlobalModeStore';
import { SystemPromptPreviewModal } from './SystemPromptPreviewModal';
import { NewModeModal } from './NewModeModal';
import { t } from '../../i18n';
import type { ModeService } from '../../core/modes/ModeService';

export class ModesTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void, private modeService?: ModeService) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.modes.introTitle') });
        infoText.createDiv({ text: t('settings.modes.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);
        // Collect all selectable modes (built-in + custom, not __custom instruction entries).
        // Vault entries with the same slug as a built-in are overrides — they are already
        // represented by the built-in entry in the dropdown, so exclude them here.
        const builtInSlugs = new Set(BUILT_IN_MODES.map((m) => m.slug));
        const getAllModes = (): ModeConfig[] => [
            ...BUILT_IN_MODES,
            ...(this.modeService?.getGlobalModes?.() ?? []),
            ...this.plugin.settings.customModes.filter(
                (m) => m.source === 'vault' && !m.slug.endsWith('__custom') && !builtInSlugs.has(m.slug),
            ),
        ];

        let selectedSlug = this.plugin.settings.currentMode;
        if (!getAllModes().find((m) => m.slug === selectedSlug)) {
            selectedSlug = BUILT_IN_MODES[0].slug;
        }

        // ── Top row: selector + action buttons ───────────────────────────────
        const topRow = containerEl.createDiv('modes-top-row');

        const select = topRow.createEl('select', { cls: 'modes-select' });
        const refreshSelect = () => {
            select.empty();
            const groups: { label: string; modes: ModeConfig[] }[] = [
                { label: t('settings.modes.groupBuiltIn'), modes: BUILT_IN_MODES },
                { label: t('settings.modes.groupGlobal'), modes: this.modeService?.getGlobalModes?.() ?? [] },
                { label: t('settings.modes.groupVault'), modes: this.plugin.settings.customModes.filter((m) => m.source === 'vault' && !m.slug.endsWith('__custom') && !builtInSlugs.has(m.slug)) },
            ];
            for (const group of groups) {
                if (group.modes.length === 0) continue;
                const optgroup = select.createEl('optgroup');
                optgroup.label = group.label;
                for (const m of group.modes) {
                    const opt = optgroup.createEl('option', { value: m.slug, text: m.name });
                    if (m.slug === selectedSlug) opt.selected = true;
                }
            }
        };
        refreshSelect();

        const btnGroup = topRow.createDiv('modes-btn-group');
        const newBtn = btnGroup.createEl('button', { text: t('settings.modes.newMode'), cls: 'mod-cta modes-top-btn' });
        const dupBtn = btnGroup.createEl('button', { text: t('settings.modes.duplicate'), cls: 'modes-top-btn' });
        const importBtn = btnGroup.createEl('button', { text: t('settings.modes.import'), cls: 'modes-top-btn' });

        // ── Form area ─────────────────────────────────────────────────────────
        const formArea = containerEl.createDiv('modes-form-area');

        const renderForm = (slug: string) => {
            formArea.empty();

            const builtIn = BUILT_IN_MODES.find((m) => m.slug === slug);
            // Vault override: same slug as built-in, stored in customModes with source 'vault'
            const vaultOverride = builtIn
                ? this.plugin.settings.customModes.find(
                      (m) => m.slug === slug && m.source === 'vault' && !m.slug.endsWith('__custom'),
                  )
                : undefined;
            // Vault custom mode (not a built-in at all)
            const vaultCustom = !builtIn
                ? this.plugin.settings.customModes.find(
                      (m) => m.slug === slug && m.source === 'vault',
                  )
                : undefined;
            // Global mode (not a built-in, not in customModes)
            const globalMode: ModeConfig | undefined = !builtIn && !vaultCustom
                ? (this.modeService?.getGlobalModes?.() ?? []).find(
                      (m: ModeConfig) => m.slug === slug,
                  )
                : undefined;

            // Effective mode for display: override > built-in > vault custom > global
            const mode = vaultOverride ?? builtIn ?? vaultCustom ?? globalMode;
            if (!mode) return;

            const isBuiltIn = !!builtIn;
            const isGlobal = !!globalMode;

            /**
             * Returns the mutable reference for this mode's edits.
             * For built-in modes this lazily creates a vault override entry so
             * that changes are persisted without mutating the constant.
             */
            const getOrCreateEditable = (): ModeConfig => {
                if (isBuiltIn) {
                    let ov = this.plugin.settings.customModes.find(
                        (m) => m.slug === slug && m.source === 'vault' && !m.slug.endsWith('__custom'),
                    );
                    if (!ov) {
                        ov = { ...builtIn, source: 'vault' };
                        this.plugin.settings.customModes.push(ov);
                    }
                    return ov;
                }
                if (isGlobal && globalMode) return globalMode;
                return vaultCustom ?? mode;
            };

            const saveMode = async () => {
                if (isGlobal && globalMode) {
                    await GlobalModeStore.updateMode(globalMode);
                    await this.modeService?.reloadGlobalModes?.();
                } else {
                    await this.plugin.saveSettings();
                }
            };

            // ── Customized badge (built-in modes that have been overridden) ────
            if (isBuiltIn && vaultOverride) {
                const badge = formArea.createDiv('modes-customized-badge');
                setIcon(badge.createSpan('modes-customized-icon'), 'pencil');
                badge.createEl('span', { cls: 'modes-customized-text', text: t('settings.modes.customized') });
            }

            // ── Name ─────────────────────────────────────────────────────────
            new Setting(formArea)
                .setName(t('settings.modes.name'))
                .addText((txt) => {
                    txt.setValue(mode.name);
                    // Name is read-only for built-in modes (slug must remain stable)
                    if (isBuiltIn) {
                        txt.inputEl.disabled = true;
                    } else {
                        txt.onChange(async (v) => {
                            getOrCreateEditable().name = v;
                            await saveMode();
                            refreshSelect();
                        });
                    }
                });

            // ── Short description ─────────────────────────────────────────────
            const descWrap = formArea.createDiv('modes-field');
            descWrap.createEl('div', { cls: 'modes-field-label', text: t('settings.modes.shortDesc') });
            descWrap.createEl('div', { cls: 'modes-field-desc', text: t('settings.modes.shortDescHint') });
            const descTextarea = descWrap.createEl('textarea', { cls: 'modes-textarea', attr: { placeholder: t('settings.modes.shortDescPlaceholder') } });
            descTextarea.value = mode.description || '';
            descTextarea.rows = 2;
            descTextarea.addEventListener('input', () => {
                const editable = getOrCreateEditable();
                editable.description = descTextarea.value;
                void saveMode();
            });

            // 2026-05-18: "When to use" field removed -- it was Kilo-Code
            // legacy, never consumed by the system prompt or any other path.

            // ── Role Definition ───────────────────────────────────────────────
            const roleWrap = formArea.createDiv('modes-field');
            roleWrap.createEl('div', { cls: 'modes-field-label', text: t('settings.modes.roleDefinition') });
            roleWrap.createEl('div', {
                cls: 'modes-field-desc',
                text: t('settings.modes.roleDefinitionHint'),
            });
            const roleTextarea = roleWrap.createEl('textarea', { cls: 'modes-textarea' });
            roleTextarea.value = mode.roleDefinition || '';
            roleTextarea.rows = 8;
            roleTextarea.addEventListener('input', () => {
                const editable = getOrCreateEditable();
                editable.roleDefinition = roleTextarea.value;
                mode.roleDefinition = editable.roleDefinition;
                void saveMode();
            });

            // ── Mode-specific Custom Instructions ─────────────────────────────
            const ciWrap = formArea.createDiv('modes-field');
            ciWrap.createEl('div', { cls: 'modes-field-label', text: t('settings.modes.customInstructions') });
            ciWrap.createEl('div', {
                cls: 'modes-field-desc',
                text: t('settings.modes.customInstructionsHint', { mode: mode.name }),
            });
            const ciTextarea = ciWrap.createEl('textarea', {
                cls: 'modes-textarea',
                attr: { placeholder: t('settings.modes.customInstructionsPlaceholder', { mode: mode.name }) },
            });
            // Read from override (preferred) or legacy __custom entry
            const legacyCi = this.plugin.settings.customModes.find((m) => m.slug === `${slug}__custom`);
            ciTextarea.value = isBuiltIn
                ? (vaultOverride?.customInstructions ?? legacyCi?.customInstructions ?? '')
                : (mode.customInstructions ?? '');
            ciTextarea.rows = 4;
            ciTextarea.addEventListener('input', () => {
                const value = ciTextarea.value.trim();
                const editable = getOrCreateEditable();
                editable.customInstructions = value || undefined;
                if (isBuiltIn) {
                    // Migrate away from legacy __custom entry
                    const legacyIdx = this.plugin.settings.customModes.findIndex((m) => m.slug === `${slug}__custom`);
                    if (legacyIdx >= 0) this.plugin.settings.customModes.splice(legacyIdx, 1);
                }
                void saveMode();
            });

            // ── Bottom action bar ─────────────────────────────────────────────
            const bottomBar = formArea.createDiv('modes-bottom-bar');

            // 2026-05-18: "Set active" button removed -- selecting an agent
            // in the dropdown at the top now activates it immediately. The
            // active badge stays as a visual marker.
            const isActive = this.plugin.settings.currentMode === slug;
            if (isActive) {
                bottomBar.createEl('span', { cls: 'modes-active-badge', text: t('settings.modes.activeMode') });
            }

            // Preview System Prompt
            // 2026-05-18: wire the full static context (skills, plugin
            // skills, rules, MCP servers) so the preview shows what the
            // LLM actually sees -- not just the skeleton. Dynamic
            // sections (Memory, Recipes, Advisor Hint) stay conversation-
            // dependent and are shown via inline stubs.
            const previewBtn = bottomBar.createEl('button', { text: t('settings.modes.previewPrompt'), cls: 'modes-preview-btn' });
            previewBtn.addEventListener('click', () => { void (async () => {
                const rulesLoader = this.plugin.rulesLoader;
                const rulesContent = rulesLoader
                    ? await rulesLoader.loadEnabledRules(this.plugin.settings.rulesToggles ?? {})
                    : undefined;
                const skillDirectorySection = await this.plugin.buildSkillDirectoryForMode(slug);
                const pluginSkillsSection = this.plugin.skillRegistry?.getPluginSkillsPromptSection();
                // Preview shows the unrestricted MCP catalogue; per-agent
                // filtering was removed (chat-header pocket knife now toggles
                // activeMcpServers globally instead).
                const allowedMcpServers: string[] | undefined = undefined;
                const memoryStub = '[Conversation-dependent: filled with relevant memory facts at runtime.]';
                const recipesStub = '[Conversation-dependent: filled with matched procedural recipes at runtime.]';
                const prompt = buildSystemPromptForMode({
                    mode,
                    globalCustomInstructions: this.plugin.settings.globalCustomInstructions || undefined,
                    configDir: this.app.vault.configDir,
                    rulesContent: rulesContent || undefined,
                    skillDirectorySection: skillDirectorySection || undefined,
                    pluginSkillsSection: pluginSkillsSection || undefined,
                    mcpClient: this.plugin.mcpClient,
                    allowedMcpServers,
                    memoryContext: memoryStub,
                    recipesSection: recipesStub,
                });
                new SystemPromptPreviewModal(this.app, mode.name, prompt).open();
            })(); });

            // Export
            const exportBtn = bottomBar.createEl('button', { text: t('settings.modes.export'), cls: 'modes-export-btn' });
            exportBtn.addEventListener('click', () => {
                const exportData: Partial<ModeConfig> = { ...mode };
                delete exportData.source;
                const json = JSON.stringify(exportData, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = activeDocument.createElement('a');
                a.href = url;
                a.download = `${mode.slug}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });

            // Restore defaults (built-in modes only — visible, disabled unless there is an override)
            if (isBuiltIn) {
                const hasOverride = !!this.plugin.settings.customModes.find(
                    (m) => (m.slug === slug && m.source === 'vault') || m.slug === `${slug}__custom`,
                );
                const restoreBtn = bottomBar.createEl('button', {
                    text: t('settings.modes.restoreDefaults'),
                    cls: 'modes-restore-btn',
                });
                if (!hasOverride) restoreBtn.disabled = true;
                restoreBtn.addEventListener('click', () => { void (async () => {
                    // Remove vault override + legacy __custom entry (restores role definition,
                    // tool groups, custom instructions, and agent instructions to built-in defaults)
                    this.plugin.settings.customModes = this.plugin.settings.customModes.filter(
                        (m) => !(m.slug === slug && m.source === 'vault') && m.slug !== `${slug}__custom`,
                    );
                    // Also clear the per-mode model override so global default is used again
                    if (this.plugin.settings.modeModelKeys) {
                        delete this.plugin.settings.modeModelKeys[slug];
                    }
                    await this.plugin.saveSettings();
                    new Notice(t('settings.modes.restored', { name: mode.name }));
                    renderForm(slug);
                })(); });
            }

            // Delete button: visible for every agent so the action surface
            // is consistent. Disabled for built-in agents (cannot remove
            // the default agent without breaking fallback paths).
            const deleteBtn = bottomBar.createEl('button', {
                text: t('settings.modes.delete'),
                cls: 'mod-warning modes-delete-btn',
            });
            if (isBuiltIn) {
                deleteBtn.disabled = true;
                deleteBtn.setAttribute('aria-disabled', 'true');
                deleteBtn.setAttribute('title', t('settings.modes.deleteBuiltInTooltip'));
            } else {
                deleteBtn.addEventListener('click', () => { void (async () => {
                    if (isGlobal) {
                        await GlobalModeStore.removeMode(slug);
                        await this.modeService?.reloadGlobalModes?.();
                    } else {
                        this.plugin.settings.customModes = this.plugin.settings.customModes.filter(
                            (m) => m.slug !== slug,
                        );
                        await this.plugin.saveSettings();
                    }
                    if (this.plugin.settings.currentMode === slug) {
                        this.plugin.settings.currentMode = 'agent';
                        await this.plugin.saveSettings();
                    }
                    new Notice(t('settings.modes.deleted', { name: mode.name }));
                    this.rerender();
                })(); });
            }
        };

        // Initial render
        renderForm(selectedSlug);

        // Selector change: activate the picked agent immediately and
        // re-render the form. No separate "Set active" button needed.
        select.addEventListener('change', () => { void (async () => {
            selectedSlug = select.value;
            this.plugin.settings.currentMode = selectedSlug;
            await this.plugin.saveSettings();
            renderForm(selectedSlug);
        })(); });

        // New Mode
        newBtn.addEventListener('click', () => {
            new NewModeModal(this.app, this.plugin, () => this.rerender(), this.modeService).open();
        });

        // Duplicate the currently selected agent. The duplicate is always
        // a `source: 'vault'` entry so it shows up under "Your agents" and
        // is freely editable.
        dupBtn.addEventListener('click', () => { void (async () => {
            const source = getAllModes().find((m) => m.slug === selectedSlug);
            if (!source) {
                new Notice(t('settings.modes.duplicateFailed'));
                return;
            }
            // If the user has previously edited a built-in agent, that
            // vault override holds the live customisation. Prefer it as
            // the duplicate source so edits do not disappear.
            const liveOverride = this.plugin.settings.customModes.find(
                (m) => m.slug === source.slug && m.source === 'vault' && !m.slug.endsWith('__custom'),
            );
            const effectiveSource = liveOverride ?? source;
            const baseSlug = `${source.slug}-copy`;
            const allSlugs = new Set([
                ...BUILT_IN_MODES.map((m) => m.slug),
                ...this.plugin.settings.customModes.map((m) => m.slug),
            ]);
            let newSlug = baseSlug;
            let n = 2;
            while (allSlugs.has(newSlug)) { newSlug = `${baseSlug}-${n++}`; }
            const dup: ModeConfig = {
                ...effectiveSource,
                slug: newSlug,
                name: `${effectiveSource.name} (copy)`,
                source: 'vault',
            };
            this.plugin.settings.customModes.push(dup);
            this.plugin.settings.currentMode = newSlug;
            await this.plugin.saveSettings();
            new Notice(t('settings.modes.duplicated', { name: dup.name }));
            this.rerender();
        })(); });

        // Import
        importBtn.addEventListener('click', () => {
            const input = activeDocument.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.addEventListener('change', () => { void (async () => {
                const file = input.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                    // M-1: Validate JSON size and structure before accepting imported mode
                    if (text.length > 500_000) {
                        new Notice(t('settings.modes.fileTooLarge'));
                        return;
                    }
                    let raw: unknown;
                    try {
                        raw = JSON.parse(text);
                    } catch {
                        new Notice(t('settings.modes.invalidJson'));
                        return;
                    }
                    if (!raw || typeof raw !== 'object' ||
                        typeof (raw as Record<string, unknown>).slug !== 'string' ||
                        typeof (raw as Record<string, unknown>).name !== 'string' ||
                        typeof (raw as Record<string, unknown>).roleDefinition !== 'string') {
                        new Notice(t('settings.modes.invalidMode'));
                        return;
                    }
                    const parsed = raw as ModeConfig;
                    parsed.source = 'vault';
                    const allSlugs = [
                        ...BUILT_IN_MODES.map((m) => m.slug),
                        ...this.plugin.settings.customModes.map((m) => m.slug),
                    ];
                    if (allSlugs.includes(parsed.slug)) {
                        parsed.slug = `${parsed.slug}-imported`;
                    }
                    this.plugin.settings.customModes.push(parsed);
                    await this.plugin.saveSettings();
                    this.rerender();
                    new Notice(t('settings.modes.importSuccess', { name: parsed.name }));
                } catch {
                    new Notice(t('settings.modes.parseFailed'));
                }
            })(); });
            input.click();
        });

        // ── Global Custom Instructions ────────────────────────────────────────
        const globalSection = containerEl.createDiv('modes-global-section');
        globalSection.createEl('h3', { text: t('settings.modes.globalCustomInstructions') });
        globalSection.createEl('p', {
            cls: 'modes-field-desc',
            text: t('settings.modes.globalCustomInstructionsDesc'),
        });
        const globalTextarea = globalSection.createEl('textarea', {
            cls: 'modes-textarea',
            attr: { placeholder: t('settings.modes.globalInstructionsPlaceholder') },
        });
        globalTextarea.value = this.plugin.settings.globalCustomInstructions ?? '';
        globalTextarea.rows = 5;
        globalTextarea.addEventListener('input', () => {
            this.plugin.settings.globalCustomInstructions = globalTextarea.value;
            void this.plugin.saveSettings();
        });
    }

    // ---------------------------------------------------------------------------
    // Models tab
    // ---------------------------------------------------------------------------

}
