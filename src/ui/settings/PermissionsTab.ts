import { App, Modal, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import { addSectionHeading } from './utils';


export class PermissionsTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        // 2026-05-18: this tab grants the agent the right to act without
        // asking. Render the intro as an orange warning callout instead
        // of the neutral blue one used on the rest of the tabs, and roll
        // up the individual per-row warnings into one explicit notice.
        const banner = containerEl.createDiv('vault-op-box vault-op-box--warning');
        const icon = banner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(icon, 'shield-alert');
        const text = banner.createDiv({ cls: 'vault-op-box__text' });
        text.createEl('strong', { text: t('settings.permissions.introTitle') });
        text.createDiv({ text: t('settings.permissions.introDesc') });

        // AUDIT-030 L-4: users who add a provider in settings but skip the
        // onboarding wizard never see the "consent to permissive defaults"
        // step. Master toggle ships off (fail-closed), so this is polish
        // not a security fix, but a one-line hint makes the posture explicit.
        if (this.plugin.settings.onboarding?.completed === false) {
            const hint = containerEl.createDiv('vault-op-box vault-op-box--info');
            const hintIcon = hint.createSpan({ cls: 'vault-op-box__icon' });
            setIcon(hintIcon, 'info');
            const hintText = hint.createDiv({ cls: 'vault-op-box__text' });
            hintText.setText(
                'Auto-approve is off by default. The first-run wizard explains the trade-offs; '
                + 'you can run it any time from Settings, General tab, Onboarding section.',
            );
        }
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        // ── Auto-approve master toggle + visibility helper ───────────────
        addSectionHeading(
            containerEl,
            t('settings.permissions.headingAutoApprove'),
            { body: t('settings.permissions.sectionAutoApproveInfo') },
        );

        let categoryContainer: HTMLDivElement;
        const refreshCategoryDisabled = (): void => {
            const masterOn = this.plugin.settings.autoApproval.enabled;
            categoryContainer.classList.toggle('agent-approval-categories--disabled', !masterOn);
            // Hard-disable every interactive control inside the category
            // block when the master is off. CSS opacity alone left toggles
            // clickable, so a user could "approve sandbox" while the master
            // gate silently overrode the choice in the pipeline.
            const inputs = categoryContainer.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
                'input, button',
            );
            inputs.forEach((el) => { el.disabled = !masterOn; });
        };

        new Setting(containerEl)
            .setName(t('settings.permissions.enableAutoApprove'))
            .setDesc(t('settings.permissions.enableAutoApproveDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.enabled).onChange(async (v) => {
                    this.plugin.settings.autoApproval.enabled = v;
                    await this.plugin.saveSettings();
                    refreshCategoryDisabled();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.permissions.showApprovalBar'))
            .setDesc(t('settings.permissions.showApprovalBarDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.showMenuInChat).onChange(async (v) => {
                    this.plugin.settings.autoApproval.showMenuInChat = v;
                    await this.plugin.saveSettings();
                }),
            );

        // ── Per-category toggles ─────────────────────────────────────────
        categoryContainer = containerEl.createDiv('agent-approval-categories');

        addSectionHeading(
            categoryContainer,
            t('settings.permissions.headingPerCategory'),
            { body: t('settings.permissions.sectionPerCategoryInfo') },
        );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.readOps'))
            .setDesc(t('settings.permissions.readOpsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.read).onChange(async (v) => {
                    this.plugin.settings.autoApproval.read = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.noteEdits'))
            .setDesc(t('settings.permissions.noteEditsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.noteEdits).onChange(async (v) => {
                    this.plugin.settings.autoApproval.noteEdits = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.vaultChanges'))
            .setDesc(t('settings.permissions.vaultChangesDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.vaultChanges).onChange(async (v) => {
                    this.plugin.settings.autoApproval.vaultChanges = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.webOps'))
            .setDesc(t('settings.permissions.webOpsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.web).onChange(async (v) => {
                    this.plugin.settings.autoApproval.web = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.mcpCalls'))
            .setDesc(t('settings.permissions.mcpCallsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.mcp).onChange(async (v) => {
                    this.plugin.settings.autoApproval.mcp = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.subtasks'))
            .setDesc(t('settings.permissions.subtasksDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.subtasks).onChange(async (v) => {
                    this.plugin.settings.autoApproval.subtasks = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.pluginSkills'))
            .setDesc(t('settings.permissions.pluginSkillsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.skills).onChange(async (v) => {
                    this.plugin.settings.autoApproval.skills = v;
                    await this.plugin.saveSettings();
                }),
            );

        addSectionHeading(
            categoryContainer,
            t('settings.permissions.headingPluginApi'),
            { body: t('settings.permissions.sectionPluginApiInfo') },
        );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.pluginApiReads'))
            .setDesc(t('settings.permissions.pluginApiReadsDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.pluginApiRead ?? true).onChange(async (v) => {
                    this.plugin.settings.autoApproval.pluginApiRead = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.pluginApiWrites'))
            .setDesc(t('settings.permissions.pluginApiWritesDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.pluginApiWrite ?? false).onChange(async (v) => {
                    this.plugin.settings.autoApproval.pluginApiWrite = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.recipes'))
            .setDesc(t('settings.permissions.recipesDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.autoApproval.recipes ?? false).onChange(async (v) => {
                    this.plugin.settings.autoApproval.recipes = v;
                    await this.plugin.saveSettings();
                }),
            );

        addSectionHeading(
            categoryContainer,
            t('settings.permissions.headingSandbox'),
            { body: t('settings.permissions.sectionSandboxInfo') },
        );

        new Setting(categoryContainer)
            .setName(t('settings.permissions.sandbox'))
            .setDesc(t('settings.permissions.sandboxDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoApproval.sandbox ?? false).onChange(async (v) => {
                    if (v) {
                        const confirmed = await this.confirmHighRisk(
                            t('settings.permissions.sandboxConfirmTitle'),
                            t('settings.permissions.sandboxConfirmMessage'),
                        );
                        if (!confirmed) {
                            toggle.setValue(false);
                            return;
                        }
                    }
                    this.plugin.settings.autoApproval.sandbox = v;
                    await this.plugin.saveSettings();
                }),
            );

        // Apply the initial disabled state (after every control exists).
        refreshCategoryDisabled();
    }

    /**
     * Show a confirmation dialog for high-risk settings.
     * Returns true if the user confirmed, false otherwise.
     */
    private confirmHighRisk(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new (class extends Modal {
                onOpen(): void {
                    const { contentEl } = this;
                    contentEl.createEl('h3', { text: title });
                    contentEl.createEl('p', { text: message, cls: 'agent-setting-confirm-message' });

                    const btnRow = contentEl.createDiv('agent-setting-confirm-buttons');
                    const cancelBtn = btnRow.createEl('button', { text: t('settings.permissions.sandboxConfirmCancel') });
                    const confirmBtn = btnRow.createEl('button', {
                        text: t('settings.permissions.sandboxConfirmAccept'),
                        cls: 'mod-warning',
                    });
                    cancelBtn.addEventListener('click', () => { this.close(); resolve(false); });
                    confirmBtn.addEventListener('click', () => { this.close(); resolve(true); });
                }
                onClose(): void {
                    resolve(false);
                }
            })(this.app);
            modal.open();
        });
    }
}
