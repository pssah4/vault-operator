/**
 * PluginReloader -- Phase 3.
 *
 * Used to be a full self-update mechanism (backup, overwrite main.js,
 * hot-reload). That violated Obsidian's developer policy and triggered
 * the community-plugin review-bot's "self-update" error. The write
 * path was removed; the apply-patch flow now runs through
 * PluginPatchModal which hands the compiled main.js to the user as a
 * download. The user replaces the file manually.
 *
 * Only `reload()` is kept here -- the agent or the modal can call it
 * after the user has already swapped main.js in the plugin folder, so
 * Obsidian re-instantiates Vault Operator with the new code without
 * the user having to restart Obsidian itself.
 */

import type ObsidianAgentPlugin from '../../main';

export class PluginReloader {
    constructor(private plugin: ObsidianAgentPlugin) {}

    /**
     * Disable and re-enable the plugin so Obsidian reloads main.js
     * from disk. Intended to be called after the user has manually
     * replaced main.js with a compiled patch.
     */
    async reload(): Promise<void> {
        const id = this.plugin.manifest.id;
        const plugins = (this.plugin.app as unknown as Record<string, unknown>).plugins as
            { disablePlugin(id: string): Promise<void>; enablePlugin(id: string): Promise<void> } | undefined;

        if (!plugins) {
            throw new Error('Cannot access Obsidian plugin manager for reload');
        }

        await plugins.disablePlugin(id);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
        await plugins.enablePlugin(id);
    }
}
