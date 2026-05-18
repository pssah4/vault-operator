/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
import { App, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import { addSectionHeading } from './utils';


export class DebugTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.debug.introTitle') });
        infoText.createDiv({ text: t('settings.debug.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        new Setting(containerEl)
            .setName(t('settings.debug.debugMode'))
            .setDesc(t('settings.debug.debugModeDesc'))
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.debugMode).onChange(async (v) => {
                    this.plugin.settings.debugMode = v;
                    await this.plugin.saveSettings();
                }),
            );

        addSectionHeading(
            containerEl,
            t('settings.debug.optionalAssetsHeading'),
            { body: t('settings.debug.optionalAssetsInfo') },
        );

        void this.renderOptionalAssetSections(containerEl);
    }

    private async renderOptionalAssetSections(containerEl: HTMLElement): Promise<void> {
        const {
            buildSelfDevSourceSpec,
            buildOfficeBundleSpec,
            buildPdfjsBundleSpec,
        } = await import('../../core/assets/OptionalAssetManager');
        const { OFFICE_BUNDLE_SHA256, PDFJS_BUNDLE_SHA256 } = await import('../../core/assets/assetHashes');
        const { SELF_DEV_SOURCE_SHA256 } = await import('../../_generated/source-hash');
        const { renderOptionalAssetBlock } = await import('./renderOptionalAssetBlock');

        const version = this.plugin.manifest.version;

        renderOptionalAssetBlock({
            plugin: this.plugin,
            containerEl,
            spec: buildOfficeBundleSpec(version, OFFICE_BUNDLE_SHA256),
            notInstalledStatus: 'Status: not installed - create_docx / create_xlsx / create_pptx tools stay disabled',
            onPostInstall: async () => {
                this.plugin.bundleLoader?.reset();
                await Promise.resolve();
            },
        });

        renderOptionalAssetBlock({
            plugin: this.plugin,
            containerEl,
            spec: buildPdfjsBundleSpec(version, PDFJS_BUNDLE_SHA256),
            notInstalledStatus: 'Status: not installed - PDF files are skipped during ingestion',
            onPostInstall: async () => {
                this.plugin.bundleLoader?.reset();
                await Promise.resolve();
            },
        });

        renderOptionalAssetBlock({
            plugin: this.plugin,
            containerEl,
            spec: buildSelfDevSourceSpec(version, SELF_DEV_SOURCE_SHA256),
            notInstalledStatus: 'Status: not installed - manage_source tool stays disabled',
            allowInstallFromFile: true,
            onPostInstall: async () => {
                if (this.plugin.embeddedSourceManager) {
                    const { EmbeddedSourceManager } = await import('../../core/self-development/EmbeddedSourceManager');
                    this.plugin.embeddedSourceManager = new EmbeddedSourceManager(this.plugin);
                    void this.plugin.embeddedSourceManager.load();
                }
            },
        });
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
