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
    }
}
