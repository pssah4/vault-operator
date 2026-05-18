import { Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ModeService } from '../../core/modes/ModeService';
import type { ToolGroup } from '../../types/settings';
import { TOOL_METADATA, GROUP_META, getToolsForGroup } from '../../core/tools/toolMetadata';
import { t } from '../../i18n';

/**
 * ToolPickerPopover — manages the "pocket-knife" tool/skill/workflow picker.
 *
 * All changes are immediately persisted to settings (no session-only state).
 * Web tools are excluded — they are managed by a dedicated toggle in the toolbar.
 */
export class ToolPickerPopover {
    private popoverEl: HTMLElement | null = null;
    private closeHandler: ((e: MouseEvent) => void) | null = null;
    private resizeHandler: (() => void) | null = null;

    constructor(
        private plugin: ObsidianAgentPlugin,
        private modeService: ModeService,
    ) {}

    show(event: MouseEvent, anchorBtn: HTMLElement, containerEl: HTMLElement): void {
        this.close();
        try {
            this.renderPopover(anchorBtn, containerEl);
        } catch (err) {
            console.error('[ToolPicker] failed to open:', err);
            new Notice(t('ui.toolPicker.openFailed'));
            this.close();
        }
    }

    private renderPopover(anchorBtn: HTMLElement, containerEl: HTMLElement): void {
        const slug = this.plugin.settings.currentMode;
        let resolvedMode = this.modeService.getMode(slug);
        if (!resolvedMode) {
            console.warn(`[ToolPicker] currentMode "${slug}" is unknown, falling back to "agent".`);
            this.plugin.settings.currentMode = 'agent';
            void this.plugin.saveSettings();
            resolvedMode = this.modeService.getMode('agent');
            if (!resolvedMode) {
                console.error('[ToolPicker] default "agent" mode is missing; cannot open picker.');
                new Notice(t('ui.toolPicker.openFailed'));
                return;
            }
        }
        // Guard against half-migrated custom modes that lost their toolGroups
        // array (would crash .filter()/.flatMap() below).
        if (!Array.isArray(resolvedMode.toolGroups)) {
            console.warn(`[ToolPicker] mode "${resolvedMode.slug}" has no toolGroups; defaulting to read+vault+agent.`);
            resolvedMode = { ...resolvedMode, toolGroups: ['read', 'vault', 'agent'] };
        }
        const mode = resolvedMode;

        const popover = activeDocument.createElement('div');
        popover.className = 'tool-picker-popover';
        this.popoverEl = popover;

        // ── Header ───────────────────────────────────────────────────────────
        const headerEl = popover.createDiv('tool-picker-header');
        headerEl.createSpan({ cls: 'tool-picker-title', text: t('ui.toolPicker.title') });
        const countBadge = headerEl.createSpan('tool-picker-count');

        // ── Search ───────────────────────────────────────────────────────────
        const searchInput = popover.createEl('input', {
            cls: 'tool-picker-search',
            attr: { placeholder: t('ui.toolPicker.filter'), type: 'text', spellcheck: 'false' },
        });

        // ── Scroll container ─────────────────────────────────────────────────
        const scrollEl = popover.createDiv('tool-picker-scroll');

        // ── Data from central tool metadata (single source of truth) ────────
        const GROUP_TOOLS: Record<string, string[]> = {};
        for (const [group] of Object.entries(GROUP_META)) {
            GROUP_TOOLS[group] = getToolsForGroup(group as ToolGroup).map(([name]) => name);
        }

        // Excluded groups: 'web' (dedicated toggle), 'mcp' (own section)
        const EXCLUDED_GROUPS = new Set(['web', 'mcp']);

        // Current effective tools (settings → defaults)
        const effectiveTools = new Set(
            this.plugin.settings.modeToolOverrides?.[slug]
            ?? this.modeService.getEffectiveToolNames(mode)
        );
        const toolChecks = new Map<string, HTMLInputElement>();
        const allItemRows: HTMLElement[] = [];   // for search filtering

        // ── Helpers ──────────────────────────────────────────────────────────

        const applyToolOverride = async () => {
            const allGroupTools = mode.toolGroups
                .filter((g) => !EXCLUDED_GROUPS.has(g))
                .flatMap((g) => GROUP_TOOLS[g] ?? []);
            const selected = allGroupTools.filter((t) => toolChecks.get(t)?.checked ?? false);
            await this.modeService.setModeToolOverride(slug, selected);
        };

        const updateCount = () => {
            let n = 0;
            for (const cb of toolChecks.values()) { if (cb.checked) n++; }
            countBadge.setText(t('ui.toolPicker.selected', { count: n }));
        };

        // Create a top-level expandable category row
        const makeTopCat = (label: string, startOpen = true): { catRow: HTMLElement; catBody: HTMLElement } => {
            const catRow = scrollEl.createDiv('tp-cat-row');
            if (startOpen) catRow.addClass('is-open');
            catRow.createSpan('tp-cat-arrow').setText('▸');
            catRow.createSpan({ cls: 'tp-cat-label', text: label });
            const catBody = scrollEl.createDiv('tp-cat-body');
            catBody.classList.toggle('agent-u-hidden', !startOpen);
            catRow.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).tagName === 'INPUT') return;
                const open = catRow.classList.toggle('is-open');
                catBody.classList.toggle('agent-u-hidden', !open);
            });
            return { catRow, catBody };
        };

        // Create a sub-category row inside Built-In
        const makeSubCat = (
            parent: HTMLElement, label: string, iconName: string,
        ): { subRow: HTMLElement; subBody: HTMLElement; subGroupCb: HTMLInputElement } => {
            const subRow = parent.createDiv('tp-subcat-row');
            subRow.createSpan('tp-subcat-arrow').setText('▸');
            const subIconEl = subRow.createSpan('tp-subcat-icon');
            setIcon(subIconEl, iconName);
            subRow.createSpan({ cls: 'tp-subcat-label', text: label });
            const subGroupCb = subRow.createEl('input', { type: 'checkbox' });
            subGroupCb.className = 'tp-cat-group-cb';
            const subBody = parent.createDiv('tp-subcat-body');
            subBody.classList.add('agent-u-hidden');
            subRow.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).tagName === 'INPUT') return;
                const open = subRow.classList.toggle('is-open');
                subBody.classList.toggle('agent-u-hidden', !open);
            });
            return { subRow, subBody, subGroupCb };
        };

        // Create an item row with checkbox, name, description
        const makeItemRow = (
            parent: HTMLElement, label: string, desc: string, _iconName: string,
            checked: boolean, indentCls = 'tp-item-row',
        ): HTMLInputElement => {
            const row = parent.createDiv(indentCls);
            row.setAttribute('data-label', label.toLowerCase());
            row.setAttribute('data-desc', desc.toLowerCase());
            allItemRows.push(row);
            const cb = row.createEl('input', { type: 'checkbox' });
            cb.checked = checked;
            row.createSpan({ cls: 'tp-item-name', text: label });
            if (desc) row.createSpan({ cls: 'tp-item-desc', text: desc });
            return cb;
        };

        // ── Built-In section ─────────────────────────────────────────────────
        const { catRow: builtInCatRow, catBody: builtInCatBody } = makeTopCat(t('ui.toolPicker.builtIn'));
        const builtInGroupCb = builtInCatRow.createEl('input', { type: 'checkbox' });
        builtInGroupCb.className = 'tp-cat-group-cb';
        const allBuiltInTools = mode.toolGroups
            .filter((g) => !EXCLUDED_GROUPS.has(g))
            .flatMap((g) => GROUP_TOOLS[g] ?? []);
        const biAllEnabled = allBuiltInTools.every((t) => effectiveTools.has(t));
        const biSomeEnabled = allBuiltInTools.some((t) => effectiveTools.has(t));
        builtInGroupCb.checked = biAllEnabled;
        builtInGroupCb.indeterminate = !biAllEnabled && biSomeEnabled;

        for (const group of mode.toolGroups) {
            if (EXCLUDED_GROUPS.has(group)) continue;
            const tools = (GROUP_TOOLS[group] ?? []).filter((t) => {
                const modeTools = mode.toolGroups
                    .filter((g) => !EXCLUDED_GROUPS.has(g))
                    .flatMap((g) => GROUP_TOOLS[g] ?? []);
                return modeTools.includes(t);
            });
            if (tools.length === 0) continue;

            const { subBody, subGroupCb } = makeSubCat(
                builtInCatBody,
                GROUP_META[group]?.label ?? group,
                GROUP_META[group]?.icon ?? 'tool',
            );
            const grpAllEnabled = tools.every((t) => effectiveTools.has(t));
            const grpSomeEnabled = tools.some((t) => effectiveTools.has(t));
            subGroupCb.checked = grpAllEnabled;
            subGroupCb.indeterminate = !grpAllEnabled && grpSomeEnabled;

            for (const toolName of tools) {
                const meta = TOOL_METADATA[toolName];
                const cb = makeItemRow(
                    subBody,
                    meta?.label ?? toolName,
                    meta?.description ?? '',
                    meta?.icon ?? 'tool',
                    effectiveTools.has(toolName),
                );
                toolChecks.set(toolName, cb);
                cb.addEventListener('change', () => {
                    const allInGrp = tools.every((t) => toolChecks.get(t)?.checked);
                    const someInGrp = tools.some((t) => toolChecks.get(t)?.checked);
                    subGroupCb.checked = !!allInGrp;
                    subGroupCb.indeterminate = !allInGrp && !!someInGrp;
                    const allBI = allBuiltInTools.every((t) => toolChecks.get(t)?.checked);
                    const someBI = allBuiltInTools.some((t) => toolChecks.get(t)?.checked);
                    builtInGroupCb.checked = !!allBI;
                    builtInGroupCb.indeterminate = !allBI && !!someBI;
                    void applyToolOverride();
                    updateCount();
                });
            }
            subGroupCb.addEventListener('change', () => {
                for (const t of tools) { const cb = toolChecks.get(t); if (cb) cb.checked = subGroupCb.checked; }
                subGroupCb.indeterminate = false;
                void applyToolOverride();
                updateCount();
            });
        }
        builtInGroupCb.addEventListener('change', () => {
            for (const t of allBuiltInTools) { const cb = toolChecks.get(t); if (cb) cb.checked = builtInGroupCb.checked; }
            builtInGroupCb.indeterminate = false;
            void applyToolOverride();
            updateCount();
        });

        // ── MCP Servers section ───────────────────────────────────────────────
        if (mode.toolGroups.includes('mcp')) {
            const servers = Object.keys(this.plugin.settings.mcpServers ?? {});
            const { catRow: mcpCatRow, catBody: mcpCatBody } = makeTopCat(t('ui.toolPicker.mcpServers'), servers.length > 0);
            const mcpGroupCb = mcpCatRow.createEl('input', { type: 'checkbox' });
            mcpGroupCb.className = 'tp-cat-group-cb';
            const mcpChecks: HTMLInputElement[] = [];

            if (servers.length > 0) {
                const activeMcpServers: string[] = this.plugin.settings.activeMcpServers ?? [];
                for (const serverName of servers) {
                    const cb = makeItemRow(
                        mcpCatBody, serverName, t('ui.toolPicker.mcpServer'), 'plug-2',
                        activeMcpServers.length === 0 || activeMcpServers.includes(serverName),
                        'tp-item-row tp-item-indent-cat',
                    );
                    mcpChecks.push(cb);
                    cb.addEventListener('change', () => { void (async () => {
                        const cur: string[] = this.plugin.settings.activeMcpServers ?? [];
                        if (cur.length === 0) {
                            const all = Object.keys(this.plugin.settings.mcpServers ?? {});
                            this.plugin.settings.activeMcpServers = all.filter((s) => s !== serverName);
                        } else if (cb.checked) {
                            this.plugin.settings.activeMcpServers = [...cur, serverName];
                        } else {
                            this.plugin.settings.activeMcpServers = cur.filter((s) => s !== serverName);
                        }
                        await this.plugin.saveSettings();
                        const allCb = mcpChecks.every((c) => c.checked);
                        const someCb = mcpChecks.some((c) => c.checked);
                        mcpGroupCb.checked = allCb;
                        mcpGroupCb.indeterminate = !allCb && someCb;
                    })(); });
                }
                const allMcp = mcpChecks.every((c) => c.checked);
                const someMcp = mcpChecks.some((c) => c.checked);
                mcpGroupCb.checked = allMcp;
                mcpGroupCb.indeterminate = !allMcp && someMcp;
            } else {
                mcpCatBody.createEl('span', { cls: 'tp-empty-hint', text: t('ui.toolPicker.noMcpServers') });
                mcpGroupCb.checked = false;
                mcpGroupCb.disabled = true;
            }
            mcpGroupCb.addEventListener('change', () => { void (async () => {
                for (const cb of mcpChecks) cb.checked = mcpGroupCb.checked;
                mcpGroupCb.indeterminate = false;
                this.plugin.settings.activeMcpServers = mcpGroupCb.checked ? [] : [];
                await this.plugin.saveSettings();
            })(); });
        }

        // ── Workflows section (async) ─────────────────────────────────────────
        const { catRow: wfCatRow, catBody: wfCatBody } = makeTopCat(t('ui.toolPicker.workflows'), false);
        const wfGroupCb = wfCatRow.createEl('input', { type: 'checkbox' });
        wfGroupCb.className = 'tp-cat-group-cb';
        wfCatBody.createEl('span', { cls: 'tp-empty-hint', text: t('ui.toolPicker.loading') });

        // ── Position (clamped to container bounds) ──────────────────────────
        const positionPopover = () => {
            const br = anchorBtn.getBoundingClientRect();
            const cr = containerEl.getBoundingClientRect();
            const pad = 8;
            popover.setCssProps({ '--tp-pos': 'fixed' });

            // Constrain width to container
            const popWidth = Math.min(400, cr.width - pad * 2);
            popover.setCssProps({
                '--tp-w': `${popWidth}px`,
                '--tp-min-w': `${Math.min(320, popWidth)}px`,
                '--tp-max-w': `${popWidth}px`,
            });

            // Prefer opening upward; fall back to downward
            const spaceAbove = br.top - cr.top - pad;
            const spaceBelow = cr.bottom - br.bottom - pad;

            if (spaceAbove >= spaceBelow) {
                popover.setCssProps({
                    '--tp-bottom': (window.innerHeight - br.top + 4) + 'px',
                    '--tp-top': '',
                    '--tp-max-h': `${Math.max(spaceAbove, 200)}px`,
                });
            } else {
                popover.setCssProps({
                    '--tp-top': (br.bottom + 4) + 'px',
                    '--tp-bottom': '',
                    '--tp-max-h': `${Math.max(spaceBelow, 200)}px`,
                });
            }

            // Horizontal: keep inside container
            let left = Math.max(br.left, cr.left + pad);
            if (left + popWidth > cr.right - pad) left = cr.right - pad - popWidth;
            left = Math.max(left, cr.left + pad);
            popover.setCssProps({ '--tp-left': `${left}px` });
        };
        activeDocument.body.appendChild(popover);
        positionPopover();

        // Re-position on window resize so the popover tracks its anchor
        this.resizeHandler = positionPopover;
        window.addEventListener('resize', this.resizeHandler);

        updateCount();

        // ── Search filter ─────────────────────────────────────────────────────
        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase();
            for (const row of allItemRows) {
                const matches = !q
                    || (row.getAttribute('data-label') ?? '').includes(q)
                    || (row.getAttribute('data-desc') ?? '').includes(q);
                row.classList.toggle('agent-u-hidden', !matches);
            }
            if (q) {
                builtInCatRow.addClass('is-open');
                builtInCatBody.classList.remove('agent-u-hidden');
            }
        });

        // ── Async: workflows ──────────────────────────────────────────────────
        void (async () => {
            const workflowLoader = this.plugin.workflowLoader;
            if (workflowLoader) {
                wfCatBody.empty();
                try {
                    const workflows = await workflowLoader.discoverWorkflows();
                    if (workflows.length === 0) {
                        wfCatBody.createEl('span', { cls: 'tp-empty-hint', text: t('ui.toolPicker.noWorkflows') });
                        wfGroupCb.disabled = true;
                    } else {
                        const wfCbs: HTMLInputElement[] = [];
                        const activeWfSlug = this.plugin.settings.forcedWorkflow?.[slug] ?? '';
                        wfCatRow.addClass('is-open');
                        wfCatBody.classList.remove('agent-u-hidden');
                        for (const wf of workflows) {
                            const cb = makeItemRow(
                                wfCatBody, wf.displayName, `/${wf.slug}`, 'git-branch',
                                activeWfSlug === wf.slug, 'tp-item-row tp-item-indent-cat',
                            );
                            wfCbs.push(cb);
                            cb.addEventListener('change', () => { void (async () => {
                                if (!this.plugin.settings.forcedWorkflow) this.plugin.settings.forcedWorkflow = {};
                                if (cb.checked) {
                                    for (const other of wfCbs) { if (other !== cb) other.checked = false; }
                                    this.plugin.settings.forcedWorkflow[slug] = wf.slug;
                                } else {
                                    this.plugin.settings.forcedWorkflow[slug] = '';
                                }
                                await this.plugin.saveSettings();
                                wfGroupCb.checked = wfCbs.some((c) => c.checked);
                                wfGroupCb.indeterminate = false;
                                updateCount();
                            })(); });
                        }
                        wfGroupCb.checked = wfCbs.some((c) => c.checked);
                        wfGroupCb.addEventListener('change', () => { void (async () => {
                            if (!wfGroupCb.checked) {
                                for (const c of wfCbs) c.checked = false;
                                if (!this.plugin.settings.forcedWorkflow) this.plugin.settings.forcedWorkflow = {};
                                this.plugin.settings.forcedWorkflow[slug] = '';
                                await this.plugin.saveSettings();
                            }
                            updateCount();
                        })(); });
                    }
                } catch {
                    wfCatBody.createEl('span', { cls: 'tp-empty-hint', text: t('ui.toolPicker.errorWorkflows') });
                }
            } else {
                wfCatRow.remove();
                wfCatBody.remove();
            }
        })();

        // Close on outside click
        this.closeHandler = (e: MouseEvent) => {
            if (!this.popoverEl?.contains(e.target as Node) && e.target !== anchorBtn) {
                this.close();
            }
        };
        window.setTimeout(() => activeDocument.addEventListener('mousedown', this.closeHandler!), 50);
    }

    close(): void {
        if (this.closeHandler) {
            activeDocument.removeEventListener('mousedown', this.closeHandler);
            this.closeHandler = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        this.popoverEl?.remove();
        this.popoverEl = null;
    }

    isOpen(): boolean {
        return this.popoverEl !== null;
    }
}
