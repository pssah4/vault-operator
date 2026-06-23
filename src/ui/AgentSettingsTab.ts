import { App, PluginSettingTab, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../main';
import { t } from '../i18n';

// ─── Extracted modules ────────────────────────────────────────────────────────
import { ModelsTab }      from './settings/ModelsTab';
import { ProvidersTab }   from './settings/ProvidersTab';
import { EmbeddingsTab }  from './settings/EmbeddingsTab';
import { WebSearchTab }   from './settings/WebSearchTab';
import { ModesTab }       from './settings/ModesTab';
import { PermissionsTab } from './settings/PermissionsTab';
import { LoopTab }        from './settings/LoopTab';
import { RulesTab }       from './settings/RulesTab';
import { WorkflowsTab }   from './settings/WorkflowsTab';
import { SkillsTab }      from './settings/SkillsTab';
import { PromptsTab }     from './settings/PromptsTab';
import { McpTab }         from './settings/McpTab';
import { VaultTab }       from './settings/VaultTab';
import { InterfaceTab }   from './settings/InterfaceTab';
import { InlineActionsTab } from './settings/InlineActionsTab';
import { LogTab }         from './settings/LogTab';
import { DebugTab }       from './settings/DebugTab';
import { BackupTab }      from './settings/BackupTab';
import { MemoryTab }      from './settings/MemoryTab';
import { ShellTab }       from './settings/ShellTab';
import { OptionalAssetsTab } from './settings/OptionalAssetsTab';
import { decorateIconOnlyButtons } from './settings/decorateIconOnlyButtons';

// Re-export for backward compatibility (used in main.ts and other places)
export { ModelConfigModal } from './settings/ModelConfigModal';
export { ContentEditorModal } from './settings/ContentEditorModal';

// ---------------------------------------------------------------------------

export type TabId = 'providers' | 'agent-behaviour' | 'customize' | 'advanced' | 'help';

const HELP_URL = 'https://pssah4.github.io/vault-operator/';

export class AgentSettingsTab extends PluginSettingTab {
    plugin: ObsidianAgentPlugin;
    private activeTab: TabId = 'providers';
    private activeProvidersSubTab: string = 'providers';
    private activeAgentSubTab: string = 'modes';
    private activeCustomizeSubTab: string = 'skills';
    private activeAdvancedSubTab: string = 'interface';

    constructor(app: App, plugin: ObsidianAgentPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * FIX-26-99-03: locate the ModeService that the open AgentSidebarView
     * leaf already owns, so the settings ModesTab + NewModeModal can read
     * and write through it instead of receiving `undefined`. Returns null
     * when no sidebar leaf is open -- ModesTab degrades gracefully (the
     * tab still renders but enumerates only built-in modes). The
     * AgentSidebarView contract is `getModeServiceOrNull(): ModeService | null`.
     */
    private findActiveModeService(): import('../core/modes/ModeService').ModeService | undefined {
        const leaves = this.app.workspace.getLeavesOfType('obsidian-agent-sidebar');
        for (const leaf of leaves) {
            const view = leaf.view as unknown as { getModeServiceOrNull?: () => import('../core/modes/ModeService').ModeService | null };
            const ms = view.getModeServiceOrNull?.() ?? null;
            if (ms) return ms;
        }
        return undefined;
    }

    /**
     * Programmatically navigate to a specific tab/subtab and re-render.
     * Used by deep-links (obsidian://obsilo-settings) and plugin methods.
     */
    openAt(tab: TabId, subTab?: string): void {
        this.activeTab = tab;
        if (subTab) {
            if (tab === 'providers') this.activeProvidersSubTab = subTab;
            if (tab === 'agent-behaviour') this.activeAgentSubTab = subTab;
            if (tab === 'customize') this.activeCustomizeSubTab = subTab;
            if (tab === 'advanced') this.activeAdvancedSubTab = subTab;
        }
        this.redraw();
    }

    // Non-deprecated internal re-render entry. PluginSettingTab.display()
    // is marked as outdated since Obsidian 1.13.0 (the framework suggests
    // the new declarative getSettingDefinitions API, but our custom tabbed
    // UI does not fit that model -- see REVIEWER_NOTES.md Compliance notes).
    // This wrapper lets internal call sites stay free of the deprecation
    // warning. Obsidian itself still calls display() as the entry point,
    // which is the one acceptable use of the outdated method.
    // NOTE: this comment is NOT a JSDoc block (no `/**`). TSDoc parses
    // any literal `@deprecated` token inside a `/** ... */` block as a
    // tag on the documented symbol -- which would re-deprecate `redraw`
    // and undo the entire purpose of this wrapper.
    private redraw(): void {
        (this as { display(): void }).display();
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('agent-settings');

        this.buildTabNav(containerEl);
        this.buildTabContent(containerEl);
    }

    // ---------------------------------------------------------------------------
    // Tab nav
    // ---------------------------------------------------------------------------

    private buildTabNav(container: HTMLElement): void {
        const nav = container.createDiv('agent-settings-nav');
        const tabs: { id: TabId; label: string; icon: string }[] = [
            { id: 'providers',       label: t('settings.group.providers'),       icon: 'plug'         },
            { id: 'agent-behaviour', label: t('settings.group.agentBehaviour'), icon: 'users-round'  },
            { id: 'customize',       label: t('settings.group.customize'),       icon: 'toolbox'      },
            { id: 'advanced',        label: t('settings.group.advanced'),        icon: 'settings-2'   },
            { id: 'help',            label: t('settings.group.help'),            icon: 'help-circle'  },
        ];
        tabs.forEach(({ id, label, icon }) => {
            const btn = nav.createEl('button', {
                cls: `agent-settings-tab${this.activeTab === id ? ' active' : ''}`,
            });
            const iconEl = btn.createSpan({ cls: 'agent-settings-tab-icon' });
            setIcon(iconEl, icon);
            btn.createSpan({ cls: 'agent-settings-tab-label', text: label });
            btn.addEventListener('click', () => {
                if (id === 'help') {
                    openHelpUrl();
                    return;
                }
                this.activeTab = id;
                this.redraw();
            });
        });

        // Buy me a coffee link
        const coffeeLink = nav.createEl('a', {
            cls: 'agent-settings-coffee-btn',
            href: 'https://buymeacoffee.com/sebastianhanke',
        });
        coffeeLink.setAttr('target', '_blank');
        coffeeLink.setAttr('rel', 'noopener noreferrer');
        coffeeLink.createEl('img', {
            cls: 'bmc-header-btn',
            attr: {
                src: 'https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png',
                alt: 'Buy Me A Coffee',
            },
        });
    }

    // ---------------------------------------------------------------------------
    // Tab content router
    // ---------------------------------------------------------------------------

    private buildTabContent(container: HTMLElement): void {
        const content = container.createDiv('agent-settings-content');
        if (this.activeTab === 'providers')       this.buildProvidersTab(content);
        if (this.activeTab === 'agent-behaviour') this.buildAgentBehaviourTab(content);
        if (this.activeTab === 'customize')       this.buildCustomizeTab(content);
        if (this.activeTab === 'advanced')        this.buildAdvancedTab(content);

        // FIX-29-17 / Review-Bot AUDIT-031: replaced the CSS `:has()`
        // selector for icon-only buttons with an explicit class. The
        // bot warns that `:has()` triggers broad selector invalidation,
        // and the existing pattern in the codebase (per the comments
        // around styles.css line 3562 and 4153) is exactly this: tag
        // qualifying buttons in code, target the class in CSS.
        decorateIconOnlyButtons(content);
    }

    // ---------------------------------------------------------------------------
    // Sub-tab infrastructure
    // ---------------------------------------------------------------------------

    private buildSubTabNav(
        container: HTMLElement,
        tabs: { id: string; label: string; icon?: string }[],
        activeId: string,
        onSelect: (id: string) => void,
    ): void {
        const nav = container.createDiv({ cls: 'agent-settings-subnav' });
        for (const tab of tabs) {
            const btn = nav.createEl('button', {
                cls: `agent-settings-subtab${tab.id === activeId ? ' active' : ''}`,
            });
            if (tab.icon) {
                const iconEl = btn.createSpan({ cls: 'subtab-icon' });
                setIcon(iconEl, tab.icon);
            }
            btn.createSpan({ text: tab.label });
            btn.addEventListener('click', () => onSelect(tab.id));
        }
    }

    private renderComingSoon(
        container: HTMLElement,
        icon: string,
        title: string,
        description: string,
    ): void {
        const wrap = container.createDiv({ cls: 'agent-settings-coming-soon' });
        const iconEl = wrap.createDiv({ cls: 'agent-settings-coming-soon-icon' });
        setIcon(iconEl, icon);
        wrap.createDiv({ cls: 'agent-settings-coming-soon-title', text: title });
        wrap.createDiv({ cls: 'agent-settings-coming-soon-desc', text: description });
    }

    // ---------------------------------------------------------------------------
    // Providers tab (Models + Embeddings + Web Search)
    // ---------------------------------------------------------------------------

    private buildProvidersTab(container: HTMLElement): void {
        // 2026-05-18 restructure: MCP moves out of Providers (a "Connector"
        // is a tool surface for the agent, not a model/api provider) into
        // the new Customize tab.
        this.buildSubTabNav(
            container,
            [
                { id: 'providers',   label: t('settings.tab.providers') },
                { id: 'embeddings',  label: t('settings.tab.embeddings') },
                { id: 'web-search',  label: t('settings.tab.webSearch') },
            ],
            this.activeProvidersSubTab,
            (id) => { this.activeProvidersSubTab = id; this.redraw(); },
        );
        const content = container.createDiv({ cls: 'agent-settings-subcontent' });
        const rerender = () => this.redraw();
        if (this.activeProvidersSubTab === 'providers')   new ProvidersTab(this.plugin, this.app, rerender).build(content);
        if (this.activeProvidersSubTab === 'models')      new ModelsTab(this.plugin, this.app, rerender).build(content);
        if (this.activeProvidersSubTab === 'embeddings')  new EmbeddingsTab(this.plugin, this.app, rerender).build(content);
        if (this.activeProvidersSubTab === 'web-search')  new WebSearchTab(this.plugin, this.app, rerender).build(content);
    }

    // ---------------------------------------------------------------------------
    // Agent Behaviour tab (Modes + MCP + Rules + Workflows + Skills + …)
    // ---------------------------------------------------------------------------

    private buildAgentBehaviourTab(container: HTMLElement): void {
        // 2026-05-18 restructure: Loop -> Advanced (tech tuning),
        // Rules/Workflows/Skills/Prompts -> Customize (user-created
        // recipes), MCP renamed to Connectors -> Customize.
        const subTabs = [
            { id: 'modes',       label: t('settings.tab.modes')       },
            { id: 'permissions', label: t('settings.tab.autoApprove') },
            { id: 'memory',      label: t('settings.tab.memory')      },
        ];
        this.buildSubTabNav(container, subTabs, this.activeAgentSubTab,
            (id) => { this.activeAgentSubTab = id; this.redraw(); });
        const content = container.createDiv({ cls: 'agent-settings-subcontent' });
        const rerender = () => this.redraw();
        // FIX-26-99-03: pre-fix the ModeService was private to
        // AgentSidebarView, so the ModesTab + NewModeModal received
        // `undefined` and silently failed to enumerate or save custom
        // modes. AgentSidebarView now exposes the service via
        // `getModeServiceOrNull()` so the settings tab works whether
        // or not the sidebar leaf is currently open.
        const ms = this.findActiveModeService();
        if (this.activeAgentSubTab === 'modes')       new ModesTab(this.plugin, this.app, rerender, ms).build(content);
        if (this.activeAgentSubTab === 'permissions') new PermissionsTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAgentSubTab === 'memory')      new MemoryTab(this.plugin, this.app, rerender).build(content);
    }

    // ---------------------------------------------------------------------------
    // Customize tab (Skills + Connectors + Prompts + Workflows + Rules)
    // ---------------------------------------------------------------------------

    private buildCustomizeTab(container: HTMLElement): void {
        const subTabs = [
            { id: 'skills',     label: t('settings.tab.skills')     },
            { id: 'connectors', label: t('settings.tab.connectors') },
            { id: 'prompts',    label: t('settings.tab.prompts')    },
            { id: 'workflows',  label: t('settings.tab.workflows')  },
            { id: 'rules',      label: t('settings.tab.rules')      },
        ];
        this.buildSubTabNav(container, subTabs, this.activeCustomizeSubTab,
            (id) => { this.activeCustomizeSubTab = id; this.redraw(); });
        const content = container.createDiv({ cls: 'agent-settings-subcontent' });
        const rerender = () => this.redraw();
        if (this.activeCustomizeSubTab === 'skills')     new SkillsTab(this.plugin, this.app, rerender).build(content);
        if (this.activeCustomizeSubTab === 'connectors') new McpTab(this.plugin, this.app, rerender).build(content);
        if (this.activeCustomizeSubTab === 'prompts')    new PromptsTab(this.plugin, this.app, rerender).build(content);
        if (this.activeCustomizeSubTab === 'workflows')  new WorkflowsTab(this.plugin, this.app, rerender).build(content);
        if (this.activeCustomizeSubTab === 'rules')      new RulesTab(this.plugin, this.app, rerender).build(content);
    }

    // ---------------------------------------------------------------------------
    // Advanced tab (Loop + Interface + Vault + Shell + Log + Debug + Backup)
    // ---------------------------------------------------------------------------

    private buildAdvancedTab(container: HTMLElement): void {
        this.buildSubTabNav(
            container,
            [
                { id: 'loop',      label: t('settings.tab.loop')      },
                { id: 'interface', label: t('settings.tab.interface') },
                { id: 'vault',     label: t('settings.tab.vault')     },
                { id: 'shell',     label: t('settings.tab.shell')     },
                { id: 'log',       label: t('settings.tab.log')       },
                { id: 'debug',     label: t('settings.tab.debug')     },
                { id: 'backup',    label: t('settings.tab.backup')    },
                { id: 'optional-assets', label: t('settings.tab.optionalAssets') },
                { id: 'inline-actions', label: 'Inline AI' },
            ],
            this.activeAdvancedSubTab,
            (id) => { this.activeAdvancedSubTab = id; this.redraw(); },
        );
        const content = container.createDiv({ cls: 'agent-settings-subcontent' });
        const rerender = () => this.redraw();
        if (this.activeAdvancedSubTab === 'loop')      new LoopTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'interface') new InterfaceTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'vault')     new VaultTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'shell')     new ShellTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'log')       new LogTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'debug')     new DebugTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'backup')    new BackupTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'optional-assets') new OptionalAssetsTab(this.plugin, this.app, rerender).build(content);
        if (this.activeAdvancedSubTab === 'inline-actions') new InlineActionsTab(this.plugin, this.app, rerender).build(content);
    }
}

function openHelpUrl(): void {
    const electron = (window as unknown as {
        require?: (m: string) => { shell?: { openExternal(u: string): unknown } };
    }).require?.('electron');
    if (electron?.shell?.openExternal) {
        void electron.shell.openExternal(HELP_URL);
        return;
    }
    window.open(HELP_URL, '_blank', 'noopener,noreferrer');
}
