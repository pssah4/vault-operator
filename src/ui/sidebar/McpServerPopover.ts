import { Notice, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';

/**
 * McpServerPopover — checkbox picker for MCP servers, opened from the
 * chat-header "+" menu. Persists the per-server active state to
 * settings.activeMcpServers (the same source of truth the runtime uses
 * to filter the MCP catalogue passed to the agent).
 *
 * Convention shared with ToolPickerPopover:
 *   activeMcpServers === [] (or absent)  -> all configured servers active
 *   non-empty array                      -> only those listed are active
 */
export class McpServerPopover {
    private popoverEl: HTMLElement | null = null;
    private closeHandler: ((e: MouseEvent) => void) | null = null;
    private resizeHandler: (() => void) | null = null;

    constructor(private plugin: ObsidianAgentPlugin) {}

    show(_event: MouseEvent, anchorBtn: HTMLElement, containerEl: HTMLElement): void {
        this.close();
        try {
            this.renderPopover(anchorBtn, containerEl);
        } catch (err) {
            console.error('[McpPicker] failed to open:', err);
            new Notice(t('ui.mcpPicker.openFailed'));
            this.close();
        }
    }

    private renderPopover(anchorBtn: HTMLElement, containerEl: HTMLElement): void {
        const servers = Object.keys(this.plugin.settings.mcpServers ?? {});

        const popover = activeDocument.createElement('div');
        popover.className = 'tool-picker-popover';
        this.popoverEl = popover;

        // ── Header ───────────────────────────────────────────────────────────
        const headerEl = popover.createDiv('tool-picker-header');
        headerEl.createSpan({ cls: 'tool-picker-title', text: t('ui.mcpPicker.title') });
        const countBadge = headerEl.createSpan('tool-picker-count');

        const isServerActive = (name: string): boolean => {
            const active: string[] = this.plugin.settings.activeMcpServers ?? [];
            return active.length === 0 || active.includes(name);
        };

        const updateCount = () => {
            const active = servers.filter(isServerActive).length;
            countBadge.setText(t('ui.toolPicker.selected', { count: active }));
        };

        // ── Body ─────────────────────────────────────────────────────────────
        const scrollEl = popover.createDiv('tool-picker-scroll');

        if (servers.length === 0) {
            scrollEl.createEl('span', {
                cls: 'tp-empty-hint',
                text: t('ui.mcpPicker.empty'),
            });
        } else {
            const serverCbs: HTMLInputElement[] = [];
            for (const serverName of servers) {
                const row = scrollEl.createDiv('tp-item-row');
                row.setAttribute('data-label', serverName.toLowerCase());
                const cb = row.createEl('input', { type: 'checkbox' });
                cb.className = 'tp-item-cb';
                cb.checked = isServerActive(serverName);
                serverCbs.push(cb);
                const iconEl = row.createSpan('tp-item-icon');
                setIcon(iconEl, 'plug-2');
                row.createSpan({ cls: 'tp-item-name', text: serverName });
                cb.addEventListener('change', () => { void (async () => {
                    const cur: string[] = this.plugin.settings.activeMcpServers ?? [];
                    if (cur.length === 0) {
                        // All-active state: flipping a single server requires
                        // materialising the explicit allow-list.
                        this.plugin.settings.activeMcpServers = servers.filter((s) =>
                            s === serverName ? cb.checked : true,
                        );
                    } else if (cb.checked) {
                        this.plugin.settings.activeMcpServers = [...cur, serverName];
                    } else {
                        this.plugin.settings.activeMcpServers = cur.filter((s) => s !== serverName);
                    }
                    await this.plugin.saveSettings();
                    updateCount();
                })(); });
            }
        }

        // ── Position (clamped to container bounds) ──────────────────────────
        const positionPopover = () => {
            const br = anchorBtn.getBoundingClientRect();
            const cr = containerEl.getBoundingClientRect();
            const pad = 8;
            popover.setCssProps({ '--tp-pos': 'fixed' });

            const popWidth = Math.min(400, cr.width - pad * 2);
            popover.setCssProps({
                '--tp-w': `${popWidth}px`,
                '--tp-min-w': `${Math.min(320, popWidth)}px`,
                '--tp-max-w': `${popWidth}px`,
            });

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

            let left = Math.max(br.left, cr.left + pad);
            if (left + popWidth > cr.right - pad) left = cr.right - pad - popWidth;
            left = Math.max(left, cr.left + pad);
            popover.setCssProps({ '--tp-left': `${left}px` });
        };
        activeDocument.body.appendChild(popover);
        positionPopover();

        this.resizeHandler = positionPopover;
        window.addEventListener('resize', this.resizeHandler);

        updateCount();

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
