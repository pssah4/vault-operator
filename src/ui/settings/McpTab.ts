import { App, Modal, Notice, Setting, setIcon } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

export class McpTab {
    constructor(private plugin: ObsidianAgentPlugin, private app: App, private rerender: () => void) {}

    build(containerEl: HTMLElement): void {
        // One intro banner for the page
        const intro = containerEl.createDiv('agent-settings-info-banner');
        const introIcon = intro.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(introIcon, 'link');
        const introText = intro.createDiv({ cls: 'agent-settings-info-text' });
        introText.createEl('strong', { text: 'Connections' });

        introText.createDiv({ text: 'Connect Vault Operator to AI assistants like Claude, or extend Vault Operator with external tool servers. All connections use the open MCP standard.' });

        this.buildConnectorSection(containerEl);
        this.buildExternalServersSection(containerEl);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Connectors
    // ─────────────────────────────────────────────────────────────────────────

    private buildConnectorSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'Connectors' });
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: 'Let AI assistants access your vault. Enable a connector, then configure the assistant to connect.',
        });

        // ── Claude Desktop / Claude Code ──────────────────────────────────
        containerEl.createEl('h4', { text: 'Local connector' });

        const mcpBridge = this.plugin.mcpBridge;
        const isEnabled = this.plugin.settings.enableMcpServer ?? false;

        new Setting(containerEl)
            .setName('Enable local connector')
            .setDesc('Obsidian must be running for the connection to work.')
            .addToggle((toggle) =>
                toggle.setValue(isEnabled).onChange(async (v) => {
                    this.plugin.settings.enableMcpServer = v;
                    await this.plugin.saveSettings();
                    if (v && !this.plugin.mcpBridge) {
                        const { McpBridge } = await import('../../mcp/McpBridge');
                        this.plugin.mcpBridge = new McpBridge(this.plugin);
                        void this.plugin.mcpBridge.start().catch((e: unknown) =>
                            console.warn('[McpTab] Start failed:', e)
                        );
                    } else if (!v && this.plugin.mcpBridge) {
                        this.plugin.mcpBridge.stop();
                        this.plugin.mcpBridge = null;
                    }
                    this.rerender();
                }),
            );

        if (isEnabled) {
            new Setting(containerEl)
                .setName('Configure desktop client')
                .setDesc('Writes the connection config for your desktop client. Restart the client after.')
                .addButton((btn) => {
                    btn.setButtonText('Configure').onClick(() => {
                        void this.writeClaudeDesktopConfig();
                    });
                });
        }

        // ── Remote access ─────────────────────────────────────────────────
        containerEl.createEl('h4', { text: 'Remote access' });

        const remoteEnabled = this.plugin.settings.enableRemoteRelay ?? false;
        const remoteConnected = (mcpBridge as { remoteConnected?: boolean })?.remoteConnected ?? false;

        new Setting(containerEl)
            .setName('Enable remote access')
            .setDesc('Connect to a relay server so AI assistants on any device can reach your vault.')
            .addToggle((toggle) =>
                toggle.setValue(remoteEnabled).onChange(async (v) => {
                    this.plugin.settings.enableRemoteRelay = v;
                    await this.plugin.saveSettings();
                    if (v && this.plugin.mcpBridge && this.plugin.settings.relayUrl) {
                        void this.plugin.mcpBridge.connectRelay();
                    } else if (!v) {
                        this.plugin.mcpBridge?.disconnectRelay();
                    }
                    this.rerender();
                }),
            );

        if (remoteEnabled) {
            const hasRelay = !!this.plugin.settings.relayUrl;

            if (!hasRelay) {
                // ── Info banner: setup flow ───────────────────────────────
                const remoteInfo = containerEl.createDiv('agent-settings-info-banner');
                const remoteInfoIcon = remoteInfo.createSpan({ cls: 'agent-settings-info-icon' });
                setIcon(remoteInfoIcon, 'globe');
                const remoteInfoText = remoteInfo.createDiv({ cls: 'agent-settings-info-text' });
                remoteInfoText.createDiv({ text: 'A relay server on your own Cloudflare account connects your vault to AI assistants from any device. Your data stays on your infrastructure.' });
                const steps = remoteInfoText.createEl('ol');

                steps.createEl('li').createEl('a', {
                    text: 'Create a free account at cloudflare.com',
                    href: 'https://dash.cloudflare.com/sign-up',
                });
                const step2 = steps.createEl('li');
                step2.appendText('Go to ');

                step2.createEl('a', {
                    text: 'API tokens',
                    href: 'https://dash.cloudflare.com/profile/api-tokens',
                });
                step2.appendText(' and click "Create Token".');
                const step3 = steps.createEl('li');

                step3.appendText('Scroll to the bottom and click "Create Custom Token". Add two permissions: Account / Workers Scripts / Edit and Account / Account Settings / Read. Under "Account Resources", select "All accounts". Remove "Zone Resources".');
                steps.createEl('li', { text: 'Click "continue to summary", then "create token". Copy the token and paste it below.' });

                // ── API Token + Deploy ────────────────────────────────────
                new Setting(containerEl)

                    .setName('Cloudflare API token')
                    .setDesc('Paste the token you created in step 2 above.')
                    .addText((text) => {
                        text.setValue(this.plugin.settings.cloudflareApiToken ?? '');
                        text.setPlaceholder('Paste your API token');
                        text.inputEl.type = 'password';
                        text.onChange(async (v) => {
                            this.plugin.settings.cloudflareApiToken = v.trim();
                            await this.plugin.saveSettings();
                        });
                    });

                // Deploy button
                const deploySetting = new Setting(containerEl)
                    .setName('Deploy relay server')
                    .setDesc('Deploys the relay to your account. Takes about 10 seconds.');

                const deployStatusEl = containerEl.createDiv('setting-item-description');

                deploySetting.addButton((btn) => {
                    btn.setButtonText('Deploy').setCta().onClick(async () => {
                        const apiToken = this.plugin.settings.cloudflareApiToken;
                        if (!apiToken) {
                            new Notice('Please enter your API token first.');
                            return;
                        }

                        btn.setDisabled(true);
                        btn.setButtonText('Deploying...');

                        try {
                            const { CloudflareDeployer } = await import('../../mcp/CloudflareDeployer');
                            const deployer = new CloudflareDeployer(apiToken);

                            // Reuse existing token if available, otherwise generate new one
                            // AUDIT-007 L-1: Use relay_ prefix instead of sk- to avoid confusion with API keys
                            const relayToken = this.plugin.settings.relayToken
                                || ('relay_' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
                                    .map(b => b.toString(16).padStart(2, '0')).join(''));

                            const result = await deployer.deploy(relayToken, (step) => {
                                deployStatusEl.setText(step);
                            });

                            // Save results
                            this.plugin.settings.relayUrl = result.url;
                            this.plugin.settings.relayToken = relayToken;
                            this.plugin.settings.cloudflareAccountId = result.accountId;
                            await this.plugin.saveSettings();

                            // Connect immediately
                            if (this.plugin.mcpBridge) {
                                void this.plugin.mcpBridge.connectRelay();
                            }

                            new Notice('Relay deployed! Add the URL as a connector in your AI assistant.');
                            this.rerender();
                        } catch (e) {
                            const msg = e instanceof Error ? e.message : String(e);
                            deployStatusEl.setText(`Deploy failed: ${msg}`);
                            new Notice(`Deploy failed: ${msg}`);
                            btn.setDisabled(false);
                            btn.setButtonText('Deploy');
                        }
                    });
                });
            } else {
                // ── Already deployed ────────────────────────────────────────
                const baseUrl = this.plugin.settings.relayUrl.replace(/\/$/, '');
                const token = this.plugin.settings.relayToken;
                const mcpUrl = `${baseUrl}/${token}/mcp`;

                new Setting(containerEl)
                    .setName('Connector URL')
                    .setDesc('Use this URL in your AI assistant. It includes the auth token. Do not share it.')
                    .addButton((btn) => {
                        btn.setButtonText('Copy URL').onClick(() => {
                            void navigator.clipboard.writeText(mcpUrl);
                            new Notice('URL copied');
                        });
                    });

                new Setting(containerEl)
                    .setName(remoteConnected ? 'Connected' : 'Connection')
                    .setDesc(remoteConnected
                        ? 'Relay connected. Your vault is accessible remotely.'
                        : 'Click to connect to your relay.')
                    .addButton((btn) => {
                        btn.setButtonText(remoteConnected ? 'Disconnect' : 'Connect').onClick(() => {
                            if (remoteConnected) {
                                this.plugin.mcpBridge?.disconnectRelay();
                            } else if (this.plugin.mcpBridge) {
                                void this.plugin.mcpBridge.connectRelay();
                            }
                            setTimeout(() => this.rerender(), 1000);
                        });
                    });

                // Usage instructions
                const usage = containerEl.createDiv('agent-settings-desc');
                usage.createEl('strong', { text: 'Add the URL above as connector in your AI assistant:' });
                const usageList = usage.createEl('ul');
                usageList.createEl('li', { text: 'Web clients: add a custom connector in the settings' });
                usageList.createEl('li', { text: 'In desktop clients, add a remote server in settings' });

                // Troubleshooting hint
                const troubleshoot = containerEl.createDiv('setting-item-description');
                troubleshoot.appendText('Not working? Make sure Obsidian is running and the toggle above is enabled. The connector URL does not change between restarts. ');
                troubleshoot.createEl('a', {
                    text: 'Troubleshooting guide',
                    href: 'https://pssah4.github.io/vault-operator/guides/connectors',
                });

                // Redeploy + Reset
                const redeployStatusEl = containerEl.createDiv('setting-item-description');

                new Setting(containerEl)
                    .setName('Update relay server')
                    .setDesc('Push the latest relay code to your account. The connector URL stays the same.')
                    .addButton((btn) => {
                        btn.setButtonText('Redeploy').onClick(async () => {
                            const apiToken = this.plugin.settings.cloudflareApiToken;
                            const accountId = this.plugin.settings.cloudflareAccountId;
                            const relayToken = this.plugin.settings.relayToken;
                            if (!apiToken || !accountId) {
                                new Notice('Missing API token or account ID. Try reset and redeploy.');
                                return;
                            }
                            btn.setDisabled(true);
                            btn.setButtonText('Updating...');
                            try {
                                const { CloudflareDeployer } = await import('../../mcp/CloudflareDeployer');
                                const deployer = new CloudflareDeployer(apiToken);
                                await deployer.redeploy(accountId, relayToken, (step) => {
                                    redeployStatusEl.setText(step);
                                });
                                new Notice('Relay updated.');
                                btn.setDisabled(false);
                                btn.setButtonText('Redeploy');
                            } catch (e) {
                                const msg = e instanceof Error ? e.message : String(e);
                                redeployStatusEl.setText(`Update failed: ${msg}`);
                                new Notice(`Update failed: ${msg}`);
                                btn.setDisabled(false);
                                btn.setButtonText('Redeploy');
                            }
                        });
                    });

                new Setting(containerEl)
                    .setName('Reset relay')
                    .setDesc('Remove the relay configuration. You will need to update the connector URL in your AI assistant after redeploying.')
                    .addButton((btn) => {
                        btn.setButtonText('Reset').setWarning().onClick(async () => {
                            this.plugin.mcpBridge?.disconnectRelay();
                            this.plugin.settings.relayUrl = '';
                            this.plugin.settings.relayToken = '';
                            this.plugin.settings.cloudflareAccountId = '';
                            await this.plugin.saveSettings();
                            this.rerender();
                        });
                    });
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // External tool servers
    // ─────────────────────────────────────────────────────────────────────────

    private buildExternalServersSection(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { cls: 'agent-settings-section', text: 'External tool servers' });
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: 'Connect external tool servers for web search, databases, and more. These work in standalone mode.',
        });

        const mcpClient = this.plugin.mcpClient;
        const addBtn = containerEl.createEl('button', { text: t('settings.mcp.addServer'), cls: 'mod-cta agent-mcp-add-btn' });
        const listEl = containerEl.createDiv({ cls: 'agent-mcp-list' });

        const renderList = () => {
            listEl.empty();
            const servers = this.plugin.settings.mcpServers ?? {};
            const names = Object.keys(servers);
            if (names.length === 0) {
                listEl.createEl('p', { cls: 'agent-settings-desc', text: t('settings.mcp.empty') });
                return;
            }
            for (const name of names) {
                const config = servers[name];
                const conn = mcpClient?.getConnection(name);
                const status = conn?.status ?? 'disconnected';

                const row = listEl.createDiv({ cls: 'agent-mcp-server-row' });
                const dot = row.createSpan({ cls: `agent-mcp-status-dot ${status}` });
                dot.setAttribute('title', status === 'error' ? (conn?.error ?? 'error') : status);

                const info = row.createDiv({ cls: 'agent-mcp-server-info' });
                info.createSpan({ cls: 'agent-mcp-server-name', text: name });
                info.createSpan({ cls: 'agent-mcp-server-type', text: config.type });
                if (config.isBuiltIn) info.createSpan({ cls: 'agent-mcp-server-badge', text: 'built-in' });
                if (config.isBuiltIn && config.disabled && status !== 'connected') {
                    info.createSpan({ cls: 'agent-mcp-server-hint', text: t('settings.mcp.builtInDisabledHint') });
                } else if (status === 'error' && conn?.error) {
                    info.createSpan({ cls: 'agent-mcp-server-error', text: conn.error });
                } else if (status === 'connected') {
                    info.createSpan({ cls: 'agent-mcp-server-tools', text: t('settings.mcp.toolCount', { count: conn?.tools.length ?? 0 }) });
                }

                const actions = row.createDiv({ cls: 'agent-rules-actions' });
                if (status === 'connected') {
                    const btn = actions.createEl('button', { text: t('settings.mcp.disconnect') });
                    btn.addEventListener('click', () => { void (async () => { await mcpClient?.disconnect(name); renderList(); })(); });
                } else if (status !== 'connecting') {
                    const btn = actions.createEl('button', { text: status === 'error' ? t('settings.mcp.retry') : t('settings.mcp.connect') });
                    btn.addEventListener('click', () => { void (async () => { if (mcpClient) { await mcpClient.connect(name, config); renderList(); } })(); });
                }
                const editBtn = actions.createEl('button', { cls: 'agent-rules-edit-btn' });
                setIcon(editBtn, 'pencil');
                editBtn.setAttribute('aria-label', t('settings.mcp.edit'));
                editBtn.addEventListener('click', () => openAddModal(name, config));
                if (!config.isBuiltIn) {
                    const delBtn = actions.createEl('button', { cls: 'agent-rules-delete-btn' });
                    setIcon(delBtn, 'trash-2');
                    delBtn.setAttribute('aria-label', t('settings.mcp.delete'));
                    delBtn.addEventListener('click', () => { void (async () => { if (mcpClient) await mcpClient.disconnect(name); delete this.plugin.settings.mcpServers[name]; await this.plugin.saveSettings(); renderList(); })(); });
                }
            }
        };

        const openAddModal = (editName?: string, editConfig?: import('../../types/settings').McpServerConfig) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText(editName ? t('settings.mcp.editServer', { name: editName }) : t('settings.mcp.addServerTitle'));
            const { contentEl } = modal;

            const nameInput = contentEl.createEl('input', { type: 'text', placeholder: t('settings.mcp.namePlaceholder'), cls: 'agent-mcp-modal-input' });
            nameInput.value = editName ?? '';
            if (editName) nameInput.disabled = true;

            const typeSelect = contentEl.createEl('select', { cls: 'agent-mcp-modal-input' });
            for (const opt of ['sse', 'streamable-http']) {
                const o = typeSelect.createEl('option', { text: opt, value: opt });
                if (opt === (editConfig?.type ?? 'sse')) o.selected = true;
            }

            contentEl.createEl('label', { text: t('settings.mcp.labelUrl') });
            const urlInput = contentEl.createEl('input', { type: 'text', placeholder: t('settings.mcp.urlPlaceholder'), cls: 'agent-mcp-modal-input' });
            urlInput.value = editConfig?.url ?? '';

            contentEl.createEl('label', { text: t('settings.mcp.labelHeaders') });
            const headersInput = contentEl.createEl('textarea', { cls: 'agent-mcp-modal-input' });
            headersInput.rows = 3;
            headersInput.value = Object.entries(editConfig?.headers ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');

            contentEl.createEl('label', { text: t('settings.mcp.labelTimeout') });
            const timeoutInput = contentEl.createEl('input', { type: 'number', placeholder: t('settings.mcp.timeoutPlaceholder'), cls: 'agent-mcp-modal-input' });
            timeoutInput.value = String(editConfig?.timeout ?? 60);

            const saveBtn = contentEl.createEl('button', { text: t('settings.mcp.saveConnect'), cls: 'mod-cta agent-mcp-modal-save' });
            saveBtn.addEventListener('click', () => { void (async () => {
                const serverName = (editName ?? nameInput.value.trim());
                if (!serverName) return;
                const type = typeSelect.value as 'sse' | 'streamable-http';
                const parseKV = (text: string): Record<string, string> => {
                    const result: Record<string, string> = {};
                    for (const line of text.split('\n')) { const eqIdx = line.indexOf('='); if (eqIdx > 0) result[line.slice(0, eqIdx).trim()] = line.slice(eqIdx + 1).trim(); }
                    return result;
                };
                const newConfig: import('../../types/settings').McpServerConfig = { type, url: urlInput.value.trim(), headers: parseKV(headersInput.value), timeout: parseInt(timeoutInput.value) || 60, disabled: false, ...(editConfig?.isBuiltIn ? { isBuiltIn: true } : {}) };
                this.plugin.settings.mcpServers ??= {};
                this.plugin.settings.mcpServers[serverName] = newConfig;
                await this.plugin.saveSettings();
                if (mcpClient) { await mcpClient.disconnect(serverName); await mcpClient.connect(serverName, newConfig); }
                modal.close();
                renderList();
            })(); });

            modal.open();
        };

        addBtn.addEventListener('click', () => openAddModal());
        renderList();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Claude Desktop Config
    // ─────────────────────────────────────────────────────────────────────────

    private writeClaudeDesktopConfig(): void {
        try {
            const platform = os.platform();
            let configDir: string;
            if (platform === 'darwin') configDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
            else if (platform === 'win32') configDir = path.join(process.env['APPDATA'] ?? os.homedir(), 'Claude');
            else configDir = path.join(os.homedir(), '.config', 'Claude');

            const configPath = path.join(configDir, 'claude_desktop_config.json');
            let config: Record<string, unknown> = {};
            try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>; } catch { /* new file */ }

            const servers = (config['mcpServers'] ?? {}) as Record<string, unknown>;
            servers['Vault Operator'] = { command: this.findNodePath(), args: [this.getWorkerPath()] };
            config['mcpServers'] = servers;

            fs.mkdirSync(configDir, { recursive: true });
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
            new Notice('Configuration saved. Restart your desktop client to connect.');
        } catch (e) {
            new Notice(`Failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private getWorkerPath(): string {
        const adapter = this.plugin.app.vault.adapter as { getBasePath?: () => string };
        return path.join(adapter.getBasePath?.() ?? '', this.plugin.app.vault.configDir, 'plugins', this.plugin.manifest.id, 'mcp-server-worker.js');
    }

    private findNodePath(): string {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, security/detect-child-process -- child_process needed for node path discovery in Electron
        const cp = require('child_process') as typeof import('child_process');
        const which = process.platform === 'win32' ? 'where' : 'which';
        const candidates: string[] = [];
        try {
            // AUDIT-007 M-5: Use spawnSync with args array instead of execSync shell string
            const result = cp.spawnSync(which, ['node'], { encoding: 'utf-8', timeout: 3000, shell: false });
            if (result.status === 0 && result.stdout) {
                candidates.push(result.stdout.trim().split('\n')[0].trim());
            }
        } catch { /* fallback */ }
        if (process.platform === 'win32') {
            candidates.push('C:\\Program Files\\nodejs\\node.exe');
            candidates.push(`${process.env['APPDATA'] ?? ''}\\nvm\\current\\node.exe`);
        } else {
            candidates.push('/usr/local/bin/node', '/opt/homebrew/bin/node', `${os.homedir()}/.nvm/current/bin/node`);
        }
        for (const c of candidates) {
            if (!c || !fs.existsSync(c)) continue;
            // M-6: Validate the binary is actually Node.js
            try {
                // AUDIT-007 M-5: Use spawnSync instead of execSync
                const versionResult = cp.spawnSync(c, ['--version'], { encoding: 'utf-8', timeout: 3000, shell: false });
                const version = versionResult.stdout?.trim() ?? '';
                if (version.startsWith('v')) return c;
            } catch { /* not a valid node binary */ }
        }
        return 'node';
    }
}
