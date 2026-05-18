import { App, Modal, Notice, Setting } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ModeService } from '../../core/modes/ModeService';
import type { ModeConfig, ToolGroup } from '../../types/settings';
import { BUILT_IN_MODES } from '../../core/modes/builtinModes';
import { GlobalModeStore } from '../../core/modes/GlobalModeStore';
import { t } from '../../i18n';

export class NewModeModal extends Modal {
    private plugin: ObsidianAgentPlugin;
    private onSave: () => void;
    private modeService?: ModeService;

    constructor(app: App, plugin: ObsidianAgentPlugin, onSave: () => void, modeService?: ModeService) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
        this.modeService = modeService;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('new-mode-modal');
        contentEl.createEl('h2', { text: t('modal.newMode.title') });

        let slug = '';
        let name = '';
        const icon = 'sparkles';
        let description = '';
        let roleDefinition = '';
        let customInstructions = '';
        // New agents get the full toolset by default. Per-tool filtering
        // lives in the chat-header pocket knife and persists via
        // modeToolOverrides.
        const selectedGroups: Set<string> = new Set(['read', 'vault', 'edit', 'web', 'agent', 'mcp', 'skill']);
        let saveLocation: 'vault' | 'global' = 'vault';

        // ── Name ──────────────────────────────────────────────────────────────
        new Setting(contentEl)
            .setName(t('modal.newMode.name'))
            .setDesc(t('modal.newMode.nameDesc'))
            .addText((cb) => cb.onChange((v) => {
                name = v;
                slug = v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            }));

        // ── Short description ─────────────────────────────────────────────────
        contentEl.createEl('div', { cls: 'new-mode-field-label', text: t('modal.newMode.shortDesc') });
        contentEl.createEl('div', { cls: 'new-mode-field-desc', text: t('modal.newMode.shortDescHint') });
        const descTextarea = contentEl.createEl('textarea', {
            cls: 'new-mode-textarea',
            attr: { placeholder: t('modal.newMode.shortDescPlaceholder') },
        });
        descTextarea.rows = 2;
        descTextarea.addEventListener('input', () => { description = descTextarea.value; });

        // ── Role Definition ───────────────────────────────────────────────────
        contentEl.createEl('label', { cls: 'new-mode-field-label', text: t('modal.newMode.roleDefinition') });
        contentEl.createEl('div', { cls: 'new-mode-field-desc', text: t('modal.newMode.roleDefinitionHint') });
        const roleTextarea = contentEl.createEl('textarea', {
            cls: 'new-mode-textarea',
            attr: { placeholder: t('modal.newMode.roleDefinitionPlaceholder') },
        });
        roleTextarea.rows = 6;
        roleTextarea.addEventListener('input', () => { roleDefinition = roleTextarea.value; });

        // ── Custom Instructions ───────────────────────────────────────────────
        contentEl.createEl('label', { cls: 'new-mode-field-label', text: t('modal.newMode.customInstructions') });
        contentEl.createEl('div', { cls: 'new-mode-field-desc', text: t('modal.newMode.customInstructionsHint') });
        const ciTextarea = contentEl.createEl('textarea', {
            cls: 'new-mode-textarea',
            attr: { placeholder: t('modal.newMode.customInstructionsPlaceholder') },
        });
        ciTextarea.rows = 3;
        ciTextarea.addEventListener('input', () => { customInstructions = ciTextarea.value; });

        // ── Save Location ─────────────────────────────────────────────────────
        const locationWrap = contentEl.createDiv('new-mode-location');
        locationWrap.createEl('div', { cls: 'new-mode-field-label', text: t('modal.newMode.saveLocation') });
        locationWrap.createEl('div', { cls: 'new-mode-field-desc', text: t('modal.newMode.saveLocationHint') });
        const locGrid = locationWrap.createDiv('new-mode-loc-grid');

        for (const opt of [
            { value: 'vault' as const, label: t('modal.newMode.thisVault'), desc: t('modal.newMode.thisVaultHint') },
            { value: 'global' as const, label: t('modal.newMode.global'), desc: t('modal.newMode.globalHint') },
        ]) {
            const row = locGrid.createDiv('new-mode-loc-row');
            const radio = row.createEl('input', { type: 'radio', attr: { name: 'save-location', value: opt.value } });
            radio.checked = opt.value === saveLocation;
            radio.addEventListener('change', () => { if (radio.checked) saveLocation = opt.value; });
            const lbl = row.createEl('label');
            lbl.createEl('strong', { text: opt.label });
            lbl.createEl('span', { text: `, ${opt.desc}`, cls: 'modes-group-desc' });
        }

        // ── Actions ───────────────────────────────────────────────────────────
        const actions = contentEl.createDiv('new-mode-actions');
        const saveBtn = actions.createEl('button', { text: t('modal.newMode.create'), cls: 'mod-cta' });
        saveBtn.addEventListener('click', () => { void (async () => {
            if (!name.trim()) { new Notice(t('modal.newMode.nameRequired')); return; }
            if (!roleDefinition.trim()) { new Notice(t('modal.newMode.roleRequired')); return; }

            const allSlugs = [
                ...BUILT_IN_MODES.map((m) => m.slug),
                ...this.plugin.settings.customModes.map((m) => m.slug),
                ...(await GlobalModeStore.loadModes()).map((m) => m.slug),
            ];
            let finalSlug = slug.trim() || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            if (!finalSlug) finalSlug = `mode-${Date.now()}`;
            if (allSlugs.includes(finalSlug)) finalSlug = `${finalSlug}-${Date.now()}`;

            const newMode: ModeConfig = {
                slug: finalSlug,
                name: name.trim(),
                icon: icon.trim() || 'sparkles',
                description: description.trim(),
                roleDefinition: roleDefinition.trim(),
                customInstructions: customInstructions.trim() || undefined,
                toolGroups: Array.from(selectedGroups) as ToolGroup[],
                source: saveLocation,
            };

            if (saveLocation === 'global') {
                await GlobalModeStore.addMode(newMode);
                if (this.modeService) await this.modeService.reloadGlobalModes();
            } else {
                this.plugin.settings.customModes.push(newMode);
                await this.plugin.saveSettings();
            }

            this.onSave();
            this.close();
        })(); });

        const cancelBtn = actions.createEl('button', { text: t('modal.newMode.cancel') });
        cancelBtn.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
