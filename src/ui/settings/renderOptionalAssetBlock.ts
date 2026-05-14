/**
 * Render a Settings UI block for one Optional Asset.
 *
 * Status display (installed / outdated / missing / error), Install /
 * Re-install / Remove buttons, with sensible default behaviour. Callers can
 * pass `onPostInstall` to wire a post-install side effect (e.g. reload a
 * service that depends on the freshly installed bundle).
 *
 * Extracted from DebugTab's renderSourceAssetBlock so the same pattern can
 * be reused for the office-bundle, pdfjs-bundle, and self-development
 * Optional Assets without duplicating ~80 lines of UI plumbing.
 */

import { Notice, Setting } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { AssetSpec } from '../../core/assets/OptionalAssetManager';
import { OptionalAssetManager } from '../../core/assets/OptionalAssetManager';

export interface OptionalAssetBlockOptions {
    /** Plugin instance for OptionalAssetManager. */
    plugin: ObsidianAgentPlugin;
    /** Container element to append the block into. */
    containerEl: HTMLElement;
    /** Asset spec from one of the buildXxxSpec() factories. */
    spec: AssetSpec;
    /** Optional summary shown above the buttons (overrides spec.description). */
    description?: string;
    /** Status line shown when the asset is not installed. */
    notInstalledStatus?: string;
    /** Called after a successful install, before the status refreshes. */
    onPostInstall?: () => Promise<void>;
    /**
     * Show an "Install from file" extra button next to the regular Install
     * button. Useful in local plugin-dev workflows when the GitHub release
     * has not been published yet.
     */
    allowInstallFromFile?: boolean;
}

export function renderOptionalAssetBlock(opts: OptionalAssetBlockOptions): void {
    const { plugin, containerEl, spec, onPostInstall } = opts;
    const manager = new OptionalAssetManager(plugin);
    const description = opts.description ?? spec.description;
    const notInstalledStatus = opts.notInstalledStatus ?? 'Status: not installed';

    if (!spec.expectedSha256) {
        new Setting(containerEl)
            .setName(`${spec.label} (~${spec.sizeMb} MB)`)
            .setDesc(`${description} (Not available in this development build, will ship in the next release.)`);
        return;
    }

    const setting = new Setting(containerEl)
        .setName(`${spec.label} (~${spec.sizeMb} MB)`)
        .setDesc(
            `${description} Stored in <vault>/.vault-operator/assets/. ` +
            'Downloaded from this plugin\'s GitHub release, verified by SHA256.',
        );

    const statusEl = setting.descEl.createDiv({ cls: 'optional-asset-status' });
    let installBtn: HTMLButtonElement | null = null;
    let removeBtn: HTMLButtonElement | null = null;

    const renderStatus = async (): Promise<void> => {
        const snap = await manager.snapshot(spec);
        statusEl.empty();
        if (snap.status === 'installed') {
            statusEl.setText('Status: installed');
            statusEl.setAttr('data-status', 'installed');
            if (installBtn) installBtn.setCssStyles({ display: 'none' });
            if (removeBtn) removeBtn.setCssStyles({ display: '' });
        } else if (snap.status === 'outdated') {
            statusEl.setText('Status: installed but hash differs, re-install to update');
            statusEl.setAttr('data-status', 'outdated');
            if (installBtn) { installBtn.setCssStyles({ display: '' }); installBtn.setText('Re-install'); }
            if (removeBtn) removeBtn.setCssStyles({ display: '' });
        } else if (snap.status === 'error') {
            statusEl.setText(`Status: error - ${snap.errorMessage ?? 'unknown'}`);
            statusEl.setAttr('data-status', 'error');
            if (installBtn) installBtn.setCssStyles({ display: '' });
            if (removeBtn) removeBtn.setCssStyles({ display: 'none' });
        } else {
            statusEl.setText(notInstalledStatus);
            statusEl.setAttr('data-status', 'not-installed');
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
                    if (onPostInstall) {
                        await onPostInstall();
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
                btn.setDisabled(true);
                try {
                    await manager.remove(spec);
                    new Notice(`${spec.label} removed.`);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    new Notice(`Remove failed: ${msg}`, 10_000);
                } finally {
                    btn.setDisabled(false);
                    await renderStatus();
                }
            });
    });

    if (opts.allowInstallFromFile) {
        setting.addExtraButton((btn) => {
            btn.setIcon('upload')
                .setTooltip('Install from local file (fallback if download fails)')
                .onClick(async () => {
                    const { pickAndInstallAsset } = await import('./installFromFile');
                    pickAndInstallAsset(manager, spec, async () => {
                        if (onPostInstall) {
                            await onPostInstall();
                        }
                        await renderStatus();
                    });
                });
        });
    }

    void renderStatus();
}
