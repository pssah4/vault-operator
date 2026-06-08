import { App, Modal, Setting } from 'obsidian';

export interface PromptOptions {
    title: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    submitLabel?: string;
    cancelLabel?: string;
}

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
}

class PromptModalImpl extends Modal {
    private value: string;
    private submitted = false;

    constructor(
        app: App,
        private opts: PromptOptions,
        private resolve: (value: string | null) => void,
    ) {
        super(app);
        this.value = opts.defaultValue ?? '';
    }

    onOpen(): void {
        const { contentEl, opts } = this;
        contentEl.empty();

        contentEl.createEl('h3', { text: opts.title });

        if (opts.message) {
            const desc = contentEl.createEl('p');
            for (const line of opts.message.split('\n')) {
                if (desc.childNodes.length > 0) desc.createEl('br');
                desc.appendText(line);
            }
        }

        new Setting(contentEl).addText((text) => {
            text.setPlaceholder(opts.placeholder ?? '');
            text.setValue(this.value);
            text.onChange((v) => { this.value = v; });
            text.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submit();
                }
            });
            window.setTimeout(() => text.inputEl.focus(), 0);
        });

        new Setting(contentEl)
            .addButton((btn) => btn
                .setButtonText(opts.cancelLabel ?? 'Cancel')
                .onClick(() => this.close()))
            .addButton((btn) => btn
                .setButtonText(opts.submitLabel ?? 'OK')
                .setCta()
                .onClick(() => this.submit()));
    }

    private submit(): void {
        this.submitted = true;
        this.resolve(this.value);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.submitted) this.resolve(null);
    }
}

class ConfirmModalImpl extends Modal {
    private decided = false;

    constructor(
        app: App,
        private opts: ConfirmOptions,
        private resolve: (confirmed: boolean) => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, opts } = this;
        contentEl.empty();

        contentEl.createEl('h3', { text: opts.title });

        const body = contentEl.createEl('p');
        for (const line of opts.message.split('\n')) {
            if (body.childNodes.length > 0) body.createEl('br');
            body.appendText(line);
        }

        new Setting(contentEl)
            .addButton((btn) => btn
                .setButtonText(opts.cancelLabel ?? 'Cancel')
                .onClick(() => this.decide(false)))
            .addButton((btn) => {
                btn.setButtonText(opts.confirmLabel ?? 'Confirm').setCta();
                // setDestructive (Obsidian 1.13.0+) replaces setWarning;
                // combined with setCta() it produces a destructive primary
                // action. manifest.minAppVersion is gated to >= 1.13.0.
                if (opts.destructive) btn.setDestructive();
                btn.onClick(() => this.decide(true));
            });
    }

    private decide(confirmed: boolean): void {
        this.decided = true;
        this.resolve(confirmed);
        this.close();
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.decided) this.resolve(false);
    }
}

export function promptModal(app: App, opts: PromptOptions): Promise<string | null> {
    return new Promise((resolve) => new PromptModalImpl(app, opts, resolve).open());
}

export function confirmModal(app: App, opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => new ConfirmModalImpl(app, opts, resolve).open());
}
