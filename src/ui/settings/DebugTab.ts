/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
import { App, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import { BUNDLE_FILENAME } from '../../util/pluginFiles';


export class DebugTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('agent-settings-info-banner');
        const infoIcon = infoBanner.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'agent-settings-info-text' });
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

        // ── Self-Development (Phase 2.2: optional source bundle) ────────────
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'Self-development' });
        const intro = containerEl.createDiv();
        intro.setCssStyles({ fontSize: '0.85em' });
        intro.setCssStyles({ opacity: '0.8' });
        intro.setCssStyles({ marginBottom: '8px' });
        intro.setText(
            'Lets the manage_source tool read the plugin\'s own TypeScript source so the agent can answer ' +
            `"how does feature X work?" questions and propose code patches. The source bundle is an ` +
            `optional one-time download (~5 MB), kept out of ${BUNDLE_FILENAME} so the plugin stays under Obsidian Sync's ` +
            'size threshold for users who do not need this feature.',
        );

        void this.renderSourceAssetBlock(containerEl);
    }

    private async renderSourceAssetBlock(containerEl: HTMLElement): Promise<void> {
        const { OptionalAssetManager, buildSelfDevSourceSpec } = await import('../../core/assets/OptionalAssetManager');
        const { SELF_DEV_SOURCE_SHA256 } = await import('../../_generated/source-hash');

        if (!SELF_DEV_SOURCE_SHA256) {
            new Setting(containerEl)
                .setName('Self-development source bundle')
                .setDesc('Not available in this development build (no SHA compiled in). Will be available in the next release.');
            return;
        }

        const manager = new OptionalAssetManager(this.plugin);
        const spec = buildSelfDevSourceSpec(this.plugin.manifest.version, SELF_DEV_SOURCE_SHA256);

        const setting = new Setting(containerEl)
            .setName(`${spec.label} (~${spec.sizeMb} MB)`)
            .setDesc(
                spec.description +
                ' Stored in <vault>/.vault-operator/assets/. Downloaded from this plugin\'s GitHub release, verified by SHA256.',
            );

        const statusEl = setting.descEl.createDiv({ cls: 'selfdev-asset-status' });
        statusEl.setCssStyles({ marginTop: '6px' });
        statusEl.setCssStyles({ fontSize: '0.85em' });
        let installBtn: HTMLButtonElement | null = null;
        let removeBtn: HTMLButtonElement | null = null;

        const renderStatus = async (): Promise<void> => {
            const snap = await manager.snapshot(spec);
            statusEl.empty();
            if (snap.status === 'installed') {
                statusEl.setText('Status: installed');
                statusEl.setCssStyles({ color: 'var(--text-success)' });
                if (installBtn) installBtn.setCssStyles({ display: 'none' });
                if (removeBtn) removeBtn.setCssStyles({ display: '' });
            } else if (snap.status === 'outdated') {
                statusEl.setText('Status: installed but hash differs, re-install to update');
                statusEl.setCssStyles({ color: 'var(--text-warning)' });
                if (installBtn) { installBtn.setCssStyles({ display: '' }); installBtn.setText('Re-install'); }
                if (removeBtn) removeBtn.setCssStyles({ display: '' });
            } else if (snap.status === 'error') {
                statusEl.setText(`Status: error - ${snap.errorMessage ?? 'unknown'}`);
                statusEl.setCssStyles({ color: 'var(--text-error)' });
                if (installBtn) installBtn.setCssStyles({ display: '' });
                if (removeBtn) removeBtn.setCssStyles({ display: 'none' });
            } else {
                statusEl.setText('Status: not installed - manage_source tool stays disabled');
                statusEl.setCssStyles({ color: 'var(--text-muted)' });
                if (installBtn) { installBtn.setCssStyles({ display: '' }); installBtn.setText('Install'); }
                if (removeBtn) removeBtn.setCssStyles({ display: 'none' });
            }
        };

        setting.addButton((btn) => {
            installBtn = btn.buttonEl;
            btn.setButtonText('Install')
                .setCta()
                .onClick(async () => {
                    btn.setDisabled(true);
                    btn.setButtonText('Downloading...');
                    try {
                        await manager.install(spec);
                        new Notice(`${spec.label} installed.`);
                        if (this.plugin.embeddedSourceManager) {
                            const { EmbeddedSourceManager } = await import('../../core/self-development/EmbeddedSourceManager');
                            this.plugin.embeddedSourceManager = new EmbeddedSourceManager(this.plugin);
                            void this.plugin.embeddedSourceManager.load();
                        }
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        new Notice(`Install failed: ${msg}`, 10_000);
                    } finally {
                        btn.setDisabled(false);
                        await renderStatus();
                    }
                });
        });

        setting.addButton((btn) => {
            removeBtn = btn.buttonEl;
            btn.setButtonText('Remove')
                .setWarning()
                .onClick(async () => {
                    try {
                        await manager.remove(spec);
                        new Notice('Self-development source removed.');
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        new Notice(`Remove failed: ${msg}`);
                    } finally {
                        await renderStatus();
                    }
                });
        });

        // File-picker fallback: useful when the GitHub release does not
        // ship the asset yet (e.g. local plugin-dev workflow).
        setting.addExtraButton((btn) => {
            btn.setIcon('upload')
                .setTooltip('Install from local file (fallback if download fails)')
                .onClick(async () => {
                    const { pickAndInstallAsset } = await import('./installFromFile');
                    pickAndInstallAsset(manager, spec, async () => {
                        if (this.plugin.embeddedSourceManager) {
                            const { EmbeddedSourceManager } = await import('../../core/self-development/EmbeddedSourceManager');
                            this.plugin.embeddedSourceManager = new EmbeddedSourceManager(this.plugin);
                            void this.plugin.embeddedSourceManager.load();
                        }
                        await renderStatus();
                    });
                });
        });

        await renderStatus();
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
