import { Setting } from 'obsidian';
import { normalizeIncomingArchiveFolders } from '../../core/knowledge/incomingLinksBlock';
import { t } from '../../i18n';
import type { VaultIngestSettings } from '../../types/settings';

export function buildIncomingLinksDisplaySettings(
    container: HTMLElement,
    config: VaultIngestSettings['incomingLinksBlock'],
    save: () => Promise<void>,
): void {
    new Setting(container)
        .setName(t('settings.vault.incomingLinksMaxRows'))
        .setDesc(t('settings.vault.incomingLinksMaxRowsDesc', { command: t('plugin.commandUpdateHubs') }))
        .addText((text) => text.setValue(String(config.maxRows ?? 0)).onChange(async (value) => {
            if (!/^\d+$/.test(value.trim())) return;
            const limit = Number(value.trim());
            if (!Number.isSafeInteger(limit)) return;
            config.maxRows = limit;
            await save();
        }));
    new Setting(container)
        .setName(t('settings.vault.incomingLinksArchiveFolders'))
        .setDesc(t('settings.vault.incomingLinksArchiveFoldersDesc', { command: t('plugin.commandUpdateHubs') }))
        .addTextArea((text) => text.setValue(normalizeIncomingArchiveFolders(config.archiveFolders).join('\n')).onChange(async (value) => {
            config.archiveFolders = normalizeIncomingArchiveFolders(value.split('\n'));
            await save();
        }));
}
