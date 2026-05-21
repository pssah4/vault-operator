/**
 * FEAT-29-09 Step C: SkillVersionsModal.
 *
 * Lists snapshot history for a single skill. User can restore an old
 * version, tag a version with a name (so it survives prune), or remove
 * a tag. Restore always creates a pre-restore snapshot first so the
 * operation is reversible from within the modal.
 */

import { App, Modal, Notice, setIcon } from 'obsidian';
import type { SkillSnapshotService, SnapshotMetadata } from '../../core/skills/SkillSnapshotService';

export class SkillVersionsModal extends Modal {
    constructor(
        app: App,
        private skillName: string,
        private snapshotService: SkillSnapshotService,
        private onAfterChange?: () => void,
    ) {
        super(app);
    }

    async onOpen(): Promise<void> {
        this.titleEl.setText(`Skill versions: ${this.skillName}`);
        await this.render();
    }

    private async render(): Promise<void> {
        this.contentEl.empty();
        const snapshots = await this.snapshotService.list(this.skillName);

        if (snapshots.length === 0) {
            const empty = this.contentEl.createDiv({ cls: 'mod-muted' });
            empty.setText('No snapshots yet. Snapshots are taken automatically on every change to the skill folder.');
            return;
        }

        const intro = this.contentEl.createEl('p', { cls: 'mod-muted' });
        intro.setText(`${snapshots.length} snapshot(s), newest first. Restore reverts the skill to the chosen version (a pre-restore snapshot is taken first).`);

        const list = this.contentEl.createDiv({ cls: 'skill-versions-list' });
        for (const snap of snapshots) {
            this.renderSnapshotRow(list, snap);
        }
    }

    private renderSnapshotRow(parent: HTMLElement, snap: SnapshotMetadata): void {
        const row = parent.createDiv({ cls: 'skill-version-row' });
        row.style.setProperty('display', 'flex');
        row.style.setProperty('align-items', 'center');
        row.style.setProperty('gap', '8px');
        row.style.setProperty('padding', '6px 0');
        row.style.setProperty('border-bottom', '1px solid var(--background-modifier-border)');

        const info = row.createDiv();
        info.style.setProperty('flex', '1');
        const when = new Date(snap.createdAt).toLocaleString();
        const fileText = snap.fileCount === 1 ? '1 file' : `${snap.fileCount} files`;
        info.createEl('div', { text: when });
        const meta = info.createEl('div', { cls: 'mod-muted' });
        meta.style.setProperty('font-size', '12px');
        const labelBadge = snap.label === 'pre-restore' ? '[pre-restore] ' : '';
        const tagText = snap.tags.length > 0 ? ` · tags: ${snap.tags.join(', ')}` : '';
        meta.setText(`${labelBadge}${fileText}, ${this.formatBytes(snap.totalBytes)}${tagText}`);

        const actions = row.createDiv();
        actions.style.setProperty('display', 'flex');
        actions.style.setProperty('gap', '4px');

        const restoreBtn = actions.createEl('button', { cls: 'mod-cta' });
        setIcon(restoreBtn, 'rotate-ccw');
        restoreBtn.setAttribute('aria-label', 'Restore this version');
        restoreBtn.addEventListener('click', () => { void this.handleRestore(snap); });

        const tagBtn = actions.createEl('button');
        setIcon(tagBtn, 'tag');
        tagBtn.setAttribute('aria-label', 'Add or remove tag');
        tagBtn.addEventListener('click', () => { void this.handleTag(snap); });
    }

    private async handleRestore(snap: SnapshotMetadata): Promise<void> {
        const ok = window.confirm(
            `Restore ${this.skillName} to the version from ${new Date(snap.createdAt).toLocaleString()}? ` +
            `A pre-restore snapshot of the current state is taken first.`,
        );
        if (!ok) return;

        try {
            await this.snapshotService.restore(this.skillName, snap.id);
            new Notice(`Restored ${this.skillName} to ${snap.id}`);
            this.onAfterChange?.();
            await this.render();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`Restore failed: ${msg}`, 10_000);
        }
    }

    private async handleTag(snap: SnapshotMetadata): Promise<void> {
        const existing = snap.tags.join(', ');
        const input = window.prompt(
            `Tags for this snapshot (comma-separated). Tagged snapshots survive prune.`,
            existing,
        );
        if (input === null) return;

        const newTags = input
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        try {
            // Remove tags that were dropped
            for (const oldTag of snap.tags) {
                if (!newTags.includes(oldTag)) {
                    await this.snapshotService.untag(this.skillName, snap.id, oldTag);
                }
            }
            // Add new tags
            for (const newTag of newTags) {
                if (!snap.tags.includes(newTag)) {
                    await this.snapshotService.tag(this.skillName, snap.id, newTag);
                }
            }
            new Notice('Tags updated.');
            await this.render();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            new Notice(`Tag update failed: ${msg}`, 10_000);
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }
}
