import { App, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { BUILT_IN_RECIPES } from '../../core/tools/agent/recipeRegistry';
import { PLUGIN_API_ALLOWLIST } from '../../core/tools/agent/pluginApiAllowlist';
import { t } from '../../i18n';
import { addSectionHeading } from './utils';


export class ShellTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('vault-op-box vault-op-box--intro');
        const infoIcon = infoBanner.createSpan({ cls: 'vault-op-box__icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'vault-op-box__text' });
        infoText.createEl('strong', { text: t('settings.shell.introTitle') });
        infoText.createDiv({ text: t('settings.shell.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);

        // ── Plugin API Section ──────────────────────────────────────────────
        addSectionHeading(
            containerEl,
            t('settings.shell.headingPluginApi'),
            { body: t('settings.shell.sectionPluginApiInfo') },
        );

        new Setting(containerEl)
            .setName(t('settings.shell.enablePluginApi'))
            .setDesc(t('settings.shell.enablePluginApiDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.pluginApi?.enabled ?? true).onChange(async (v) => {
                    if (!this.plugin.settings.pluginApi) {
                        this.plugin.settings.pluginApi = { enabled: true, safeMethodOverrides: {} };
                    }
                    this.plugin.settings.pluginApi.enabled = v;
                    await this.plugin.saveSettings();
                    this.rerender();
                }),
            );

        if (this.plugin.settings.pluginApi?.enabled !== false) {
            addSectionHeading(
                containerEl,
                t('settings.shell.headingAllowlist'),
                { body: t('settings.shell.sectionAllowlistInfo') },
            );

            const byPlugin = new Map<string, typeof PLUGIN_API_ALLOWLIST>();
            for (const entry of PLUGIN_API_ALLOWLIST) {
                const list = byPlugin.get(entry.pluginId) ?? [];
                list.push(entry);
                byPlugin.set(entry.pluginId, list);
            }

            for (const [pluginId, methods] of byPlugin) {
                for (const m of methods) {
                    const badge = m.isWrite ? t('settings.shell.badgeWrite') : t('settings.shell.badgeRead');
                    new Setting(containerEl)
                        .setName(`${pluginId}.${m.method}`)
                        .setDesc(`${m.description}${badge}`);
                }
            }

            const overrides = this.plugin.settings.pluginApi?.safeMethodOverrides ?? {};
            const overrideKeys = Object.keys(overrides).filter((k) => overrides[k]);
            if (overrideKeys.length > 0) {
                addSectionHeading(
                    containerEl,
                    t('settings.shell.headingUserSafe'),
                    { body: t('settings.shell.sectionUserSafeInfo') },
                );
                for (const key of overrideKeys) {
                    new Setting(containerEl)
                        .setName(key)
                        .setDesc(t('settings.shell.markedSafe'))
                        .addButton((btn) =>
                            btn.setButtonText(t('settings.shell.remove')).onClick(async () => {
                                delete this.plugin.settings.pluginApi.safeMethodOverrides[key];
                                await this.plugin.saveSettings();
                                this.rerender();
                            }),
                        );
                }
            }

            // FEAT-29-07: adaptive timeout + auto-promotion controls.
            this.buildAdaptivePluginApiSection(containerEl);
        }

        // ── Recipe Section ──────────────────────────────────────────────────
        addSectionHeading(
            containerEl,
            t('settings.shell.headingRecipes'),
            { body: t('settings.shell.sectionRecipesInfo') },
        );

        new Setting(containerEl)
            .setName(t('settings.shell.enableRecipes'))
            .setDesc(t('settings.shell.enableRecipesDesc'))
            .addToggle((t) =>
                t.setValue(this.plugin.settings.recipes?.enabled ?? false).onChange(async (v) => {
                    if (!this.plugin.settings.recipes) {
                        this.plugin.settings.recipes = { enabled: false, recipeToggles: {}, customRecipes: [] };
                    }
                    this.plugin.settings.recipes.enabled = v;
                    await this.plugin.saveSettings();
                    this.rerender();
                }),
            );

        if (this.plugin.settings.recipes?.enabled) {
            this.buildBuiltinRecipesSection(containerEl);
        }
    }

    private buildBuiltinRecipesSection(containerEl: HTMLElement): void {
        addSectionHeading(containerEl, t('settings.shell.headingBuiltinRecipes'));

        const toggles = this.plugin.settings.recipes?.recipeToggles ?? {};

        for (const recipe of BUILT_IN_RECIPES) {
            const isEnabled = toggles[recipe.id] !== false;
            new Setting(containerEl)
                .setName(recipe.name)
                .setDesc(`${recipe.description} (binary: ${recipe.binary})`)
                .addToggle((t) =>
                    t.setValue(isEnabled).onChange(async (v) => {
                        if (!this.plugin.settings.recipes) {
                            this.plugin.settings.recipes = { enabled: true, recipeToggles: {}, customRecipes: [] };
                        }
                        this.plugin.settings.recipes.recipeToggles[recipe.id] = v;
                        await this.plugin.saveSettings();
                    }),
                );
        }
    }

    /**
     * FEAT-29-07: adaptive timeout + auto-promotion UI section.
     *   - Default timeout (ms) for every plugin
     *   - Per-plugin timeout override (free-form key/value editor)
     *   - Auto-promotion toggle + threshold
     *   - Approval-count readout for transparency
     * No new translation keys; keeps the section English to ship fast.
     */
    private buildAdaptivePluginApiSection(containerEl: HTMLElement): void {
        addSectionHeading(
            containerEl,
            'Timeouts and auto-promotion',
            { body: 'Tune call_plugin_api latency limits and let the plugin learn which Tier-2 methods are safe reads.' },
        );

        const api = this.plugin.settings.pluginApi;
        if (!api) return;

        new Setting(containerEl)
            .setName('Default timeout (ms)')
            .setDesc('Applied when no per-plugin override is set. Hard cap 300000 (5 min).')
            .addText((tx) => tx
                .setValue(String(api.defaultTimeoutMs ?? 10000))
                .onChange(async (v) => {
                    const n = parseInt(v, 10);
                    if (!Number.isFinite(n) || n < 1000) return;
                    api.defaultTimeoutMs = Math.min(n, 5 * 60 * 1000);
                    await this.plugin.saveSettings();
                }));

        // Per-plugin overrides: simple list view with add + remove.
        const perPlugin = api.pluginTimeoutMs ?? (api.pluginTimeoutMs = {});
        const overrideKeys = Object.keys(perPlugin).sort();
        if (overrideKeys.length > 0) {
            containerEl.createEl('p', {
                cls: 'agent-settings-desc',
                text: 'Per-plugin overrides:',
            });
            for (const pluginId of overrideKeys) {
                new Setting(containerEl)
                    .setName(pluginId)
                    .setDesc(`Custom timeout in ms (currently ${perPlugin[pluginId]})`)
                    .addText((tx) => tx
                        .setValue(String(perPlugin[pluginId]))
                        .onChange(async (v) => {
                            const n = parseInt(v, 10);
                            if (!Number.isFinite(n) || n < 1000) return;
                            perPlugin[pluginId] = Math.min(n, 5 * 60 * 1000);
                            await this.plugin.saveSettings();
                        }))
                    .addButton((b) => b
                        .setButtonText('Remove')
                        .onClick(async () => {
                            delete perPlugin[pluginId];
                            await this.plugin.saveSettings();
                            this.rerender();
                        }));
            }
        }

        // Add a new per-plugin override (two-input row).
        let newPluginId = '';
        let newTimeout = '30000';
        new Setting(containerEl)
            .setName('Add per-plugin override')
            .setDesc('Plugin ID and timeout in ms.')
            .addText((tx) => tx
                .setPlaceholder('Dataview')
                .onChange((v) => { newPluginId = v.trim(); }))
            .addText((tx) => tx
                .setPlaceholder('30000')
                .onChange((v) => { newTimeout = v; }))
            .addButton((b) => b
                .setButtonText('Add')
                .onClick(async () => {
                    const n = parseInt(newTimeout, 10);
                    if (!newPluginId || !Number.isFinite(n) || n < 1000) return;
                    perPlugin[newPluginId] = Math.min(n, 5 * 60 * 1000);
                    await this.plugin.saveSettings();
                    this.rerender();
                }));

        new Setting(containerEl)
            .setName('Auto-promote tier-2 methods')
            .setDesc('When a dynamically discovered method is approved enough times and its name looks like a read (get, list, find, query and so on), add it to the user-safe list so future calls are auto-approved.')
            .addToggle((tg) => tg
                .setValue(api.autoPromotionEnabled !== false)
                .onChange(async (v) => {
                    api.autoPromotionEnabled = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-promotion threshold')
            .setDesc('Number of user approvals before auto-promotion fires.')
            .addText((tx) => tx
                .setValue(String(api.autoPromotionThreshold ?? 3))
                .onChange(async (v) => {
                    const n = parseInt(v, 10);
                    if (!Number.isFinite(n) || n < 1) return;
                    api.autoPromotionThreshold = n;
                    await this.plugin.saveSettings();
                }));

        // Approval counts readout (top 10).
        const counts = api.approvalCounts ?? {};
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (sorted.length > 0) {
            containerEl.createEl('p', {
                cls: 'agent-settings-desc',
                text: `Top approval counts (tier-2 methods, max 10 shown):`,
            });
            for (const [key, count] of sorted) {
                const safe = (this.plugin.settings.pluginApi?.safeMethodOverrides ?? {})[key];
                new Setting(containerEl)
                    .setName(key)
                    .setDesc(`Approved ${count} time(s)${safe ? ' — auto-promoted, future calls skip approval' : ''}`);
            }
        }
    }
}
