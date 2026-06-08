import { App, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import { addSectionHeading } from './utils';
// Top-level imports for the three committed modules. Avoids the
// dynamic-import-derived "Unsafe object destructuring" warnings the review
// bot reported in v2.13.0 when the promise's resolved type widened to
// `error`. The OptionalAssetManager + assetHashes + renderOptionalAssetBlock
// modules are part of the regular source tree and import cost is bounded
// to one extra eager load per Settings open.
import {
    buildOfficeBundleSpec,
    buildPdfjsBundleSpec,
    buildSelfDevSourceSpec,
} from '../../core/assets/OptionalAssetManager';
import {
    OFFICE_BUNDLE_SHA256,
    PDFJS_BUNDLE_SHA256,
} from '../../core/assets/assetHashes';
import { renderOptionalAssetBlock } from './renderOptionalAssetBlock';


export class OptionalAssetsTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.optionalAssets.introTitle') });
        infoText.createDiv({ text: t('settings.optionalAssets.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        addSectionHeading(
            containerEl,
            t('settings.optionalAssets.headingOffice'),
            { body: t('settings.optionalAssets.sectionOfficeInfo') },
        );
        this.renderOfficeBundle(containerEl);

        addSectionHeading(
            containerEl,
            t('settings.optionalAssets.headingPdf'),
            { body: t('settings.optionalAssets.sectionPdfInfo') },
        );
        this.renderPdfjsBundle(containerEl);

        addSectionHeading(
            containerEl,
            t('settings.optionalAssets.headingSelfDev'),
            { body: t('settings.optionalAssets.sectionSelfDevInfo') },
        );
        void this.renderSelfDevSource(containerEl);
    }

    private renderOfficeBundle(containerEl: HTMLElement): void {
        const version = this.plugin.manifest.version;
        renderOptionalAssetBlock({
            plugin: this.plugin,
            containerEl,
            spec: buildOfficeBundleSpec(version, OFFICE_BUNDLE_SHA256),
            notInstalledStatus: t('settings.optionalAssets.officeNotInstalled'),
            onPostInstall: async () => {
                this.plugin.bundleLoader?.reset();
                await Promise.resolve();
            },
        });
    }

    private renderPdfjsBundle(containerEl: HTMLElement): void {
        const version = this.plugin.manifest.version;
        renderOptionalAssetBlock({
            plugin: this.plugin,
            containerEl,
            spec: buildPdfjsBundleSpec(version, PDFJS_BUNDLE_SHA256),
            notInstalledStatus: t('settings.optionalAssets.pdfNotInstalled'),
            onPostInstall: async () => {
                this.plugin.bundleLoader?.reset();
                await Promise.resolve();
            },
        });
    }

    private async renderSelfDevSource(containerEl: HTMLElement): Promise<void> {
        // _generated/source-hash is gitignored: the file only exists after
        // `npm run build` produces it. Use Pattern H (explicit shape cast)
        // so ESLint trusts the destructured type even when the file is not
        // present at lint time.
        const sourceHashMod = (await import('../../_generated/source-hash')) as { SELF_DEV_SOURCE_SHA256: string };
        const { SELF_DEV_SOURCE_SHA256 } = sourceHashMod;
        const version = this.plugin.manifest.version;
        renderOptionalAssetBlock({
            plugin: this.plugin,
            containerEl,
            spec: buildSelfDevSourceSpec(version, SELF_DEV_SOURCE_SHA256),
            notInstalledStatus: t('settings.optionalAssets.selfDevNotInstalled'),
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
