/**
 * EPIC-26 / FEAT-26-04 -- one-shot notification modal shown after the
 * automatic activeModels[] -> providerConfigs[] migration. Summarises
 * what was migrated and lists anomalies the user should review.
 */

import { App, Modal, setIcon } from 'obsidian';
import type { MigrationSummary } from '../../core/settings/migrations/activeModelsToProviders';

export interface MigrationModalCallbacks {
    onOpenSettings: () => void;
    onDismiss: () => void;
}

export class MigrationNotificationModal extends Modal {
    constructor(
        app: App,
        private readonly summary: MigrationSummary,
        private readonly callbacks: MigrationModalCallbacks,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, summary } = this;
        contentEl.empty();

        // Header
        const header = contentEl.createDiv({ cls: 'mig-modal-header' });
        const icon = header.createSpan({ cls: 'mig-modal-icon' });
        setIcon(icon, 'sparkles');
        header.createEl('h2', { text: 'Setup migrated to the new provider format' });

        // Body summary
        const body = contentEl.createDiv({ cls: 'mig-modal-body' });
        body.createEl('p', {
            text: `We migrated your setup to the new provider-only format. `
                + `${summary.providersCreated} provider${summary.providersCreated === 1 ? '' : 's'}, `
                + `${summary.modelsClassified} model${summary.modelsClassified === 1 ? '' : 's'} classified.`,
        });

        if (!summary.activeProviderResolved) {
            const warning = body.createDiv({ cls: 'mig-modal-warning' });
            warning.createEl('strong', { text: 'No active provider was resolved. ' });
            warning.appendText('Pick one in Settings -> Providers before sending a message.');
        }

        if (summary.anomalies.length > 0) {
            body.createEl('h3', { text: 'Things to review' });
            const list = body.createEl('ul', { cls: 'mig-modal-anomalies' });
            for (const anomaly of summary.anomalies) {
                const item = list.createEl('li');
                const label = item.createEl('strong');
                label.setText(`${anomalyLabel(anomaly.kind)}: `);
                item.appendText(anomaly.detail);
            }
        } else {
            body.createEl('p', {
                cls: 'mig-modal-allgood',
                text: 'No anomalies detected. Your setup is ready.',
            });
        }

        body.createEl('p', {
            cls: 'mig-modal-backup-note',
            text: 'Your original setup is preserved in data.json under '
                + 'legacy_active_models_backup for at least 30 days.',
        });

        // Buttons
        const buttons = contentEl.createDiv({ cls: 'mig-modal-buttons' });
        const openBtn = buttons.createEl('button', {
            cls: 'mod-cta',
            text: 'Open settings',
        });
        openBtn.addEventListener('click', () => {
            this.callbacks.onOpenSettings();
            this.close();
        });

        const okBtn = buttons.createEl('button', { text: 'OK' });
        okBtn.addEventListener('click', () => {
            this.close();
        });
    }

    onClose(): void {
        this.contentEl.empty();
        this.callbacks.onDismiss();
    }
}

function anomalyLabel(kind: string): string {
    switch (kind) {
        case 'multi-auth':
            return 'Multiple auth configurations';
        case 'missing-flagship':
            return 'No flagship-tier model';
        case 'manual-tier-required':
            return 'Manual tier assignment needed';
        case 'no-active-model':
            return 'No active provider';
        default:
            return kind;
    }
}
