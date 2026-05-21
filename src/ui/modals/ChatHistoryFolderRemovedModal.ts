/**
 * ChatHistoryFolderRemovedModal -- one-shot notice after the storage layout
 * migration removes the chatHistoryFolder setting.
 *
 * Triggered from `main.ts` ON FIRST PLUGIN LOAD after the layout migration
 * has finished and `settings._chatHistoryFolderLegacy` carries the previous
 * vault-relative path that was in use. Acknowledging clears the field so
 * the modal does not reappear.
 */

import { App, Modal, Setting } from 'obsidian';

export interface ChatHistoryFolderRemovedModalOptions {
    /** The previous chatHistoryFolder value the user had configured. */
    legacyPath: string;
}

class ChatHistoryFolderRemovedModalImpl extends Modal {
    constructor(
        app: App,
        private opts: ChatHistoryFolderRemovedModalOptions,
        private resolve: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Chat history folder setting removed' });

        const intro = contentEl.createEl('p');
        intro.appendText(
            'The chat history folder setting has been retired. Conversations are now '
            + 'stored in the plugin sidebar history panel only. You no longer need a '
            + 'separate JSON-export folder inside the vault.',
        );

        const previous = contentEl.createEl('p');
        previous.createEl('strong', { text: 'Previous path: ' });
        previous.createEl('code', { text: this.opts.legacyPath });

        const cleanup = contentEl.createEl('p');
        cleanup.appendText(
            'The old folder is left in place. Delete it manually inside your vault if '
            + 'you no longer need the JSON conversation exports.',
        );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Got it')
                    .onClick(() => {
                        this.resolve();
                        this.close();
                    }),
            );
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/**
 * Open the modal. Resolves when the user acknowledges (button or X). Caller
 * should clear `settings._chatHistoryFolderLegacy` after the resolve so the
 * modal does not appear again on the next plugin reload.
 */
export function openChatHistoryFolderRemovedModal(
    app: App,
    opts: ChatHistoryFolderRemovedModalOptions,
): Promise<void> {
    return new Promise<void>((resolve) => {
        new ChatHistoryFolderRemovedModalImpl(app, opts, resolve).open();
    });
}
