import { App, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { FolderInputSuggest } from './FolderInputSuggest';
import { OnboardingService } from '../../core/memory/OnboardingService';
import { t } from '../../i18n';
import { addSectionHeading } from './utils';


export class InterfaceTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.interface.introTitle') });
        infoText.createDiv({ text: t('settings.interface.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        addSectionHeading(
            containerEl,
            t('settings.interface.headingSetup'),
            { body: t('settings.interface.sectionSetupInfo') },
        );

        if (this.plugin.memoryService) {
            const onboarding = new OnboardingService(this.plugin.memoryService, this.plugin);
            const isComplete = !onboarding.needsOnboarding();

            const setupSetting = new Setting(containerEl)
                .setName(t('settings.interface.guidedSetup'))
                .setDesc(
                    isComplete
                        ? t('settings.interface.setupCompleted')
                        : t('settings.interface.setupNotStarted'),
                );

            setupSetting.addButton((b) =>
                b.setButtonText(isComplete ? t('settings.interface.restartSetup') : t('settings.interface.startSetup')).onClick(async () => {
                    // Reset only the onboarding flags (completed, currentStep, skippedSteps,
                    // startedAt). Configured models and memory facts are NOT touched -- the
                    // FirstRunWizardModal is add-only (push-into-array for models, set-if-empty
                    // for templates and active-model keys).
                    await onboarding.reset();
                    // Also clear the wizard-modal-completion flag so the wizard re-opens
                    // cleanly. Without this, finishAndStartChat / finishWithoutChat may have
                    // marked it true on a previous run.
                    this.plugin.settings.onboarding.modalCompleted = false;
                    await this.plugin.saveSettings();
                    this.app.setting?.close();
                    const { FirstRunWizardModal } = await import('../modals/FirstRunWizardModal');
                    new FirstRunWizardModal(this.app, this.plugin).open();
                }),
            );

            if (!isComplete) {
                setupSetting.addButton((b) =>
                    b.setButtonText(t('settings.interface.skipSetup')).onClick(async () => {
                        await onboarding.markCompleted();
                        new Notice(t('settings.interface.setupSkipped'));
                        this.rerender();
                    }),
                );
            }
        } else {
            new Setting(containerEl)
                .setName(t('settings.interface.guidedSetup'))
                .setDesc(t('settings.interface.memoryNotAvailable'));
        }

        addSectionHeading(
            containerEl,
            t('settings.interface.headingInterface'),
            { body: t('settings.interface.sectionInterfaceInfo') },
        );
        new Setting(containerEl)
            .setName(t('settings.interface.autoAddActiveNote'))
            .setDesc(t('settings.interface.autoAddActiveNoteDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.autoAddActiveFileContext).onChange(async (v) => {
                    this.plugin.settings.autoAddActiveFileContext = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.interface.resolveEmbeds'))
            .setDesc(t('settings.interface.resolveEmbedsDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.resolveEmbedsInAttachments).onChange(async (v) => {
                    this.plugin.settings.resolveEmbedsInAttachments = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.interface.sendWithEnter'))
            .setDesc(t('settings.interface.sendWithEnterDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.sendWithEnter ?? true).onChange(async (v) => {
                    this.plugin.settings.sendWithEnter = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.interface.persistChatModel'))
            .setDesc(t('settings.interface.persistChatModelDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.persistChatModel ?? true).onChange(async (v) => {
                    this.plugin.settings.persistChatModel = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName(t('settings.interface.includeTime'))
            .setDesc(t('settings.interface.includeTimeDesc'))
            .addToggle((tog) =>
                tog.setValue(this.plugin.settings.includeCurrentTimeInContext ?? false).onChange(async (v) => {
                    this.plugin.settings.includeCurrentTimeInContext = v;
                    await this.plugin.saveSettings();
                }),
            );

        // FEAT-30-07: "Show context progress" entfernt. Das Setting war tot,
        // die Ziel-Komponente ContextDisplay wurde nie instanziiert.

        new Setting(containerEl)
            .setName(t('settings.interface.autoOpenSidebar'))
            .setDesc(t('settings.interface.autoOpenSidebarDesc'))
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.autoOpenSidebarOnStart ?? true)
                    .onChange(async (value) => {
                        this.plugin.settings.autoOpenSidebarOnStart = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // FEAT-30-07: Das "History folder"-Textfeld ist entfernt. Der Key
        // chatHistoryFolder ist seit der FEAT-29-01-Migration deprecated
        // (die Migration leert ihn und zeigt eine Removal-Notice); das Feld
        // reaktivierte den Legacy-ChatHistoryService entgegen der Migration.
        // Ersatz ist enableChatHistory im Memory-Tab.

        addSectionHeading(
            containerEl,
            t('settings.interface.headingChatLinking'),
            { body: t('settings.interface.sectionChatLinkingInfo') },
        );

        const cl = this.plugin.settings.chatLinking;

        new Setting(containerEl)
            .setName(t('settings.interface.chatLinkingToggle'))
            .setDesc(t('settings.interface.chatLinkingToggleDesc'))
            .addToggle((tog) =>
                tog.setValue(cl.enabled).onChange(async (v) => {
                    this.plugin.settings.chatLinking.enabled = v;
                    await this.plugin.saveSettings();
                }),
            );

        // FEAT-07-06 (Issue #72): exclude list. Notes whose frontmatter means
        // something to another tool -- Templater templates, Dataview-driven
        // notes, Bases -- are damaged by an injected `chats` property rather
        // than merely cluttered. Same chip widget and matcher as the semantic
        // exclude list, so there is one pattern dialect in the UI and in code.
        const excludedSetting = new Setting(containerEl)
            .setName(t('settings.interface.chatLinkingExcluded'))
            .setDesc(t('settings.interface.chatLinkingExcludedDesc'));

        const excludedListEl = containerEl.createDiv('excluded-folder-list');
        const currentExcluded = (): string[] => {
            const cl2 = this.plugin.settings.chatLinking;
            if (!cl2.excludedPaths) cl2.excludedPaths = [];
            return cl2.excludedPaths;
        };

        const renderExcludedList = (): void => {
            excludedListEl.empty();
            for (const folder of currentExcluded()) {
                const chip = excludedListEl.createDiv('excluded-folder-chip');
                chip.createSpan({ text: folder });
                const removeBtn = chip.createSpan({ cls: 'excluded-folder-remove' });
                setIcon(removeBtn, 'x');
                removeBtn.addEventListener('click', () => {
                    this.plugin.settings.chatLinking.excludedPaths =
                        currentExcluded().filter((f) => f !== folder);
                    void this.plugin.saveSettings();
                    renderExcludedList();
                });
            }
        };
        renderExcludedList();

        const folderInput = excludedSetting.controlEl.createEl('input', {
            cls: 'excluded-folder-input',
            attr: { type: 'text', placeholder: t('settings.interface.chatLinkingExcludedPlaceholder') },
        });

        const suggest = new FolderInputSuggest(this.app, folderInput, currentExcluded());
        suggest.onPick = (folderPath: string) => { void (async () => {
            const list = currentExcluded();
            const trimmed = folderPath.trim();
            if (trimmed && !list.includes(trimmed)) {
                list.push(trimmed);
                await this.plugin.saveSettings();
                renderExcludedList();
            }
            folderInput.value = '';
        })(); };

        folderInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = folderInput.value.trim();
                if (val) suggest.onPick(val);
            }
        });

        // FEAT-24-08 Welle A follow-up (2026-05-18): the explicit
        // titling-model dropdown was removed. `getTitlingModel()` falls
        // back to the active provider's fast tier when no override is
        // set; the legacy `activeModels[]` it used to enumerate from is
        // empty after the EPIC-26 migration. The setting field
        // `chatLinking.titlingModelKey` is preserved as a data field.
    }

}
