import { App, Notice, Setting, setIcon, type ButtonComponent } from 'obsidian';
import JSZip from 'jszip';
import type ObsidianAgentPlugin from '../../main';
import { DEFAULT_SETTINGS } from '../../types/settings';
import type { ObsidianAgentSettings } from '../../types/settings';
import type { GlobalFileService } from '../../core/storage/GlobalFileService';
import { getAgentFolderPath, getPluginSkillsDir, getVaultDnaPath } from '../../core/utils/agentFolder';
import { t } from '../../i18n';

// ── Backup category definitions ──────────────────────────────────────────────

interface BackupCategory {
    id: string;
    label: string;
    /**
     * 'global'  = ~/.obsidian-agent/ (via GlobalFileService)
     * 'vault'   = vault root (via vault.adapter) — per-vault data only
     * 'plugin'  = .obsidian/plugins/obsilo-agent/ (via vault.adapter) — legacy, kept for vault-local
     */
    root: 'global' | 'vault' | 'plugin';
    /** Directory relative to root (or null for settings/vault-dna which are handled specially) */
    dir: string | null;
    recursive: boolean;
    description: string;
    /**
     * Additional individual files to include, relative to root, even when
     * they live outside `dir`. Used for the SQLite databases that sit at
     * the agent-folder root (memory.db) or under a different subfolder
     * (knowledge.db). Saved into the ZIP under the same path so a restore
     * lands them back where they came from.
     */
    extraFiles?: string[];
}

/** Category IDs (stable, used for toggles and manifest keys) */
const CATEGORY_IDS = [
    'settings', 'memory', 'memory-v1-backup', 'history', 'workflows', 'rules',
    'skills', 'recipes', 'episodes', 'patterns', 'logs',
    'plugin-skills', 'vault-dna', 'semantic-index',
] as const;

/** Build categories with translated labels and the configured agent folder
 *  (FEATURE-0507). Called at render time so t() picks up the active locale and
 *  agentFolderPath changes take effect without a reload. */
function getCategories(plugin: ObsidianAgentPlugin): BackupCategory[] {
    const pluginSkillsDir = getPluginSkillsDir(plugin);
    return [
        {
            id: 'settings',
            label: t('settings.backup.catSettings'),
            root: 'global',
            dir: null,
            recursive: false,
            description: t('settings.backup.catSettingsDesc'),
        },
        {
            id: 'memory',
            label: t('settings.backup.catMemory'),
            root: 'global',
            dir: 'memory',
            recursive: true,
            description: t('settings.backup.catMemoryDesc'),
            // memory.db lives at the agent-folder root (vault-parent/.obsidian-agent/memory.db)
            // -- pick it up explicitly so the SQLite Memory v2 store survives a roundtrip.
            extraFiles: ['memory.db'],
        },
        {
            id: 'memory-v1-backup',
            // Untranslated for now -- this is a one-shot artefact that
            // existing v1 users will see once after the migration. Adding
            // it to all i18n bundles for that single window is overkill.
            label: 'Memory v1 backup (post-migration)',
            root: 'global',
            dir: 'memory-v1-backup',
            recursive: true,
            description:
                'Snapshots of your legacy v1 memory MD files (user-profile, projects, ' +
                'patterns, errors, custom-tools, soul) created automatically by the ' +
                'Memory v2 migration. Each run lands under a {timestamp}/ folder. ' +
                'Memory v2 is not backwards-compatible with v1 storage, so a "restore" ' +
                'is a manual file-copy back into the memory/ folder if you ever need to ' +
                'roll back. Safe to delete once you are confident with v2.',
        },
        {
            id: 'history',
            label: t('settings.backup.catHistory'),
            root: 'global',
            dir: 'history',
            recursive: false,
            description: t('settings.backup.catHistoryDesc'),
        },
        {
            id: 'workflows',
            label: t('settings.backup.catWorkflows'),
            root: 'global',
            dir: 'workflows',
            recursive: false,
            description: t('settings.backup.catWorkflowsDesc'),
        },
        {
            id: 'rules',
            label: t('settings.backup.catRules'),
            root: 'global',
            dir: 'rules',
            recursive: false,
            description: t('settings.backup.catRulesDesc'),
        },
        {
            id: 'skills',
            label: t('settings.backup.catSkills'),
            root: 'global',
            dir: 'skills',
            recursive: true,
            description: t('settings.backup.catSkillsDesc'),
        },
        {
            id: 'recipes',
            label: t('settings.backup.catRecipes') ?? 'Recipes',
            root: 'global',
            dir: 'recipes',
            recursive: false,
            description: t('settings.backup.catRecipesDesc') ?? 'Learned procedural recipes',
        },
        {
            id: 'episodes',
            label: t('settings.backup.catEpisodes') ?? 'Episodes',
            root: 'global',
            dir: 'episodes',
            recursive: false,
            description: t('settings.backup.catEpisodesDesc') ?? 'Task episode records',
        },
        {
            id: 'patterns',
            label: t('settings.backup.catPatterns') ?? 'Patterns',
            root: 'global',
            dir: 'patterns',
            recursive: false,
            description: t('settings.backup.catPatternsDesc') ?? 'Recipe promotion patterns',
        },
        {
            id: 'logs',
            label: t('settings.backup.catLogs'),
            root: 'global',
            dir: 'logs',
            recursive: false,
            description: t('settings.backup.catLogsDesc'),
        },
        {
            id: 'plugin-skills',
            label: t('settings.backup.catPluginSkills'),
            root: 'vault',
            dir: pluginSkillsDir,
            recursive: false,
            description: t('settings.backup.catPluginSkillsDesc'),
        },
        {
            id: 'vault-dna',
            label: t('settings.backup.catVaultDNA'),
            root: 'vault',
            dir: null,
            recursive: false,
            description: t('settings.backup.catVaultDNADesc'),
        },
        {
            id: 'semantic-index',
            label: t('settings.backup.catSemanticIndex'),
            // FEATURE-1508: knowledge.db is vault-local under the agent folder.
            root: 'vault',
            dir: null,
            recursive: false,
            description: t('settings.backup.catSemanticIndexDesc'),
            extraFiles: [`${getAgentFolderPath(plugin)}/knowledge.db`],
        },
    ];
}

// ── Backup manifest types ────────────────────────────────────────────────────

/**
 * v3 manifest (FEATURE-0319b): files live as separate entries inside the
 * surrounding ZIP, manifest only carries metadata. Old v1/v2 manifests
 * embedded file contents inline (string-only) and broke for binary
 * payloads like memory.db / knowledge.db. v3 stores everything binary
 * via JSZip so SQLite databases survive a roundtrip.
 */
interface BackupManifest {
    format: 'obsilo-backup';
    version: number;
    exportedAt: string;
    categories: Record<string, { files: Array<{ path: string; size: number }> }>;
}

const BACKUP_VERSION = 3;
const MANIFEST_NAME = 'manifest.json';
const FILES_PREFIX = 'files';

// Module-level state that survives tab rerenders (new BackupTab instances).
let _pendingImport: { manifest: BackupManifest; zip: JSZip } | null = null;
let _importToggles: Record<string, boolean> = {};
const _exportToggles: Record<string, boolean> = (() => {
    const toggles: Record<string, boolean> = {};
    for (const id of CATEGORY_IDS) toggles[id] = true;
    return toggles;
})();

// ── BackupTab ────────────────────────────────────────────────────────────────

export class BackupTab {
    constructor(
        private plugin: ObsidianAgentPlugin,
        private app: App,
        private rerender: () => void,
    ) {}

    private get globalFs(): GlobalFileService {
        return this.plugin.globalFs;
    }

    private buildIntroSection(containerEl: HTMLElement): void {
        const infoBanner = containerEl.createDiv('agent-settings-info-banner');
        const infoIcon = infoBanner.createSpan({ cls: 'agent-settings-info-icon' });
        setIcon(infoIcon, 'lightbulb');
        const infoText = infoBanner.createDiv({ cls: 'agent-settings-info-text' });
        infoText.createEl('strong', { text: t('settings.backup.introTitle') });
        infoText.createDiv({ text: t('settings.backup.introDesc') });
    }

    build(containerEl: HTMLElement): void {
        this.buildIntroSection(containerEl);
        containerEl.createEl('p', {
            cls: 'agent-settings-desc',
            text: t('settings.backup.desc'),
        });

        this.buildExportSection(containerEl);
        this.buildImportSection(containerEl);
        this.buildLegacyMigrationsSection(containerEl);
    }

    /**
     * One-time imports from legacy data formats. Lives here so the rest
     * of Memory settings stays focused on day-to-day operations.
     */
    private buildLegacyMigrationsSection(container: HTMLElement): void {
        const section = container.createDiv('agent-backup-section');
        section.createEl('h4', { text: 'Legacy migrations' });
        section.createEl('p', {
            cls: 'agent-settings-desc',
            text: 'One-time pulls from older data formats. Safe to run repeatedly, no duplicates are created.',
        });

        new Setting(section)
            .setName('Import legacy soul.md')
            .setDesc('Reads memory/soul.md and adds each bullet under Identity / Values / Anti-Patterns / Communication into Obsilo’s soul. Idempotent.')
            .addButton((b: ButtonComponent) => b
                .setButtonText('Import')
                .onClick(() => { void this.importLegacySoulMd(); }));
    }

    private async importLegacySoulMd(): Promise<void> {
        const memSvc = this.plugin.memoryService;
        const memDB = this.plugin.memoryDB;
        if (!memSvc || !memDB?.isOpen()) {
            new Notice('Memory not initialised.');
            return;
        }
        const content = await memSvc.readFile('soul.md').catch(() => '');
        if (!content || content.trim().length === 0) {
            new Notice('No soul.md found.');
            return;
        }
        const { parseSoulSections } = await import('../../core/memory/soulMdParser');
        const sections = parseSoulSections(content);
        const { OBSILO_PROFILE, SoulView } = await import('../../core/memory/SoulView');
        const { FactStore } = await import('../../core/memory/FactStore');
        const view = new SoulView(memDB);
        const factStore = new FactStore(memDB);
        const existingTexts = new Set<string>();
        const snap = view.snapshot();
        for (const f of snap.identity) existingTexts.add(f.text);
        for (const f of snap.values) existingTexts.add(f.text);
        for (const f of snap.antiPatterns) existingTexts.add(f.text);
        for (const f of snap.communication) existingTexts.add(f.text);

        let inserted = 0;
        const insertCategory = (cat: 'identity' | 'value' | 'anti_pattern' | 'communication', items: string[]) => {
            for (const item of items) {
                if (!item.trim() || existingTexts.has(item.trim())) continue;
                factStore.insert({
                    text: item.trim(),
                    topics: ['soul', cat],
                    kind: 'identity',
                    importance: 0.7,
                    profileId: OBSILO_PROFILE,
                    sourceInterface: 'obsilo-self',
                    metadata: { migratedFrom: 'soul.md' },
                });
                inserted += 1;
            }
        };
        insertCategory('identity', sections.identity);
        insertCategory('value', sections.values);
        insertCategory('anti_pattern', sections.antiPatterns);
        insertCategory('communication', sections.communication);

        await memDB.save().catch(() => undefined);
        new Notice(`Imported ${inserted} soul entries from soul.md`);
    }

    // ── Export ────────────────────────────────────────────────────────────────

    private buildExportSection(container: HTMLElement): void {
        const section = container.createDiv('agent-backup-section');
        section.createEl('h4', { text: t('settings.backup.headingExport') });

        const list = section.createDiv('agent-backup-category-list');
        for (const cat of getCategories(this.plugin)) {
            const row = list.createDiv('agent-backup-category-row');
            const label = row.createEl('label', { cls: 'agent-backup-label' });

            const cb = label.createEl('input', { type: 'checkbox' });
            cb.checked = _exportToggles[cat.id] ?? true;
            cb.addEventListener('change', () => {
                _exportToggles[cat.id] = cb.checked;
            });

            const textWrap = label.createSpan({ cls: 'agent-backup-label-text' });
            textWrap.createSpan({ text: cat.label, cls: 'agent-backup-label-name' });
            textWrap.createSpan({ text: ` (${cat.description})`, cls: 'agent-backup-label-desc' });

            void this.loadCategoryStats(cat).then((info) => {
                textWrap.createSpan({
                    text: ` (${info})`,
                    cls: 'agent-backup-label-stats',
                });
            });
        }

        const btnRow = section.createDiv('agent-backup-row');
        const exportBtn = btnRow.createEl('button', { text: t('settings.backup.export'), cls: 'mod-cta' });
        exportBtn.addEventListener('click', () => void this.doExport(exportBtn));
    }

    private async loadCategoryStats(cat: BackupCategory): Promise<string> {
        try {
            if (cat.id === 'settings') {
                const size = JSON.stringify(this.plugin.settings).length;
                return this.formatSize(size);
            }
            if (cat.id === 'vault-dna') {
                const path = getVaultDnaPath(this.plugin);
                const exists = await this.app.vault.adapter.exists(path);
                if (!exists) return '0 files';
                const stat = await this.app.vault.adapter.stat(path);
                return `1 file, ${this.formatSize(stat?.size ?? 0)}`;
            }

            let count = 0;
            let size = 0;

            if (cat.dir) {
                const adapter = this.adapterFor(cat);
                if (await adapter.exists(cat.dir)) {
                    const stats = await this.countAndSizeFromAdapter(adapter, cat.dir, cat.recursive);
                    count += stats.count;
                    size += stats.size;
                }
            }

            for (const filePath of cat.extraFiles ?? []) {
                const adapter = this.adapterFor(cat);
                if (!(await adapter.exists(filePath))) continue;
                count += 1;
                if (cat.root === 'global') {
                    const data = await this.globalFs.readBinary(filePath);
                    size += data.byteLength;
                } else {
                    const stat = await this.app.vault.adapter.stat(filePath);
                    size += stat?.size ?? 0;
                }
            }

            return `${count} file${count !== 1 ? 's' : ''}, ${this.formatSize(size)}`;
        } catch {
            return '0 files';
        }
    }

    private async doExport(btn: HTMLElement): Promise<void> {
        btn.addClass('is-loading');
        btn.setText(t('settings.backup.exporting'));

        try {
            const zip = new JSZip();
            const manifest: BackupManifest = {
                format: 'obsilo-backup',
                version: BACKUP_VERSION,
                exportedAt: new Date().toISOString(),
                categories: {},
            };

            let totalFiles = 0;
            let selectedCount = 0;

            for (const cat of getCategories(this.plugin)) {
                if (!_exportToggles[cat.id]) continue;
                selectedCount++;

                const fileEntries: Array<{ path: string; size: number }> = [];
                const addToZip = (relPath: string, data: Uint8Array): void => {
                    zip.file(`${FILES_PREFIX}/${cat.id}/${relPath}`, data);
                    fileEntries.push({ path: relPath, size: data.byteLength });
                };

                if (cat.id === 'settings') {
                    const json = JSON.stringify(this.stripSensitiveFields(this.plugin.settings), null, 2);
                    addToZip('data.json', new TextEncoder().encode(json));
                } else if (cat.id === 'vault-dna') {
                    const path = getVaultDnaPath(this.plugin);
                    if (await this.app.vault.adapter.exists(path)) {
                        const buf = await this.app.vault.adapter.readBinary(path);
                        addToZip('vault-dna.json', new Uint8Array(buf));
                    }
                } else if (cat.dir) {
                    const exists = cat.root === 'global'
                        ? await this.globalFs.exists(cat.dir)
                        : await this.app.vault.adapter.exists(cat.dir);
                    if (exists) {
                        const files = await this.collectBinaryFiles(cat, cat.dir, cat.dir, cat.recursive);
                        for (const [relPath, data] of files) {
                            addToZip(relPath, data);
                        }
                    }
                }

                // Individual files outside the main dir (e.g. SQLite DBs).
                if (cat.extraFiles) {
                    for (const filePath of cat.extraFiles) {
                        try {
                            const exists = cat.root === 'global'
                                ? await this.globalFs.exists(filePath)
                                : await this.app.vault.adapter.exists(filePath);
                            if (!exists) continue;
                            const data = cat.root === 'global'
                                ? await this.globalFs.readBinary(filePath)
                                : new Uint8Array(await this.app.vault.adapter.readBinary(filePath));
                            addToZip(filePath, data);
                        } catch (e) {
                            console.warn(`[BackupTab] extraFile skipped: ${filePath}`, e);
                        }
                    }
                }

                manifest.categories[cat.id] = { files: fileEntries };
                totalFiles += fileEntries.length;
            }

            zip.file(MANIFEST_NAME, JSON.stringify(manifest, null, 2));

            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 },
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().split('T')[0];
            a.download = `obsilo-backup-${date}.zip`;
            a.click();
            URL.revokeObjectURL(url);

            new Notice(t('settings.backup.exported', { files: totalFiles, categories: selectedCount, size: this.formatSize(blob.size) }));
        } catch (e) {
            new Notice(t('settings.backup.exportFailed', { error: (e as Error).message }));
        } finally {
            btn.removeClass('is-loading');
            btn.setText(t('settings.backup.export'));
        }
    }

    /**
     * Walk a category directory and return [relativePath, bytes] pairs.
     * Adapter-agnostic helper that reads via readBinary for SQLite-safety.
     */
    private async collectBinaryFiles(
        cat: BackupCategory, dir: string, baseDir: string, recursive: boolean,
    ): Promise<Array<[string, Uint8Array]>> {
        const out: Array<[string, Uint8Array]> = [];
        try {
            const listed = cat.root === 'global'
                ? await this.globalFs.list(dir)
                : await this.app.vault.adapter.list(dir);
            for (const filePath of listed.files) {
                try {
                    const data = cat.root === 'global'
                        ? await this.globalFs.readBinary(filePath)
                        : new Uint8Array(await this.app.vault.adapter.readBinary(filePath));
                    const relative = filePath.startsWith(baseDir)
                        ? filePath.slice(baseDir.length + 1)
                        : filePath;
                    out.push([relative, data]);
                } catch { /* skip unreadable */ }
            }
            if (recursive) {
                for (const subDir of listed.folders) {
                    const subFiles = await this.collectBinaryFiles(cat, subDir, baseDir, true);
                    out.push(...subFiles);
                }
            }
        } catch { /* directory missing */ }
        return out;
    }

    // ── Import ───────────────────────────────────────────────────────────────

    private buildImportSection(container: HTMLElement): void {
        const section = container.createDiv('agent-backup-section');
        section.createEl('h4', { text: t('settings.backup.headingImport') });

        if (!_pendingImport) {
            const btnRow = section.createDiv('agent-backup-row');
            const importBtn = btnRow.createEl('button', { text: t('settings.backup.selectFile') });
            importBtn.addEventListener('click', () => this.pickImportFile());
        } else {
            this.buildImportConfirmation(section);
        }
    }

    private pickImportFile(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,application/zip';
        input.addEventListener('change', () => { void (async () => {
            const file = input.files?.[0];
            if (!file) return;
            try {
                const buf = await file.arrayBuffer();
                const zip = await JSZip.loadAsync(buf);
                const manifestEntry = zip.file(MANIFEST_NAME);
                if (!manifestEntry) {
                    new Notice(t('settings.backup.invalidFile'));
                    return;
                }
                const manifestText = await manifestEntry.async('string');
                const parsed: unknown = JSON.parse(manifestText);
                if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
                    new Notice(t('settings.backup.invalidFile'));
                    return;
                }
                const obj = parsed as Record<string, unknown>;
                if (obj.format !== 'obsilo-backup' || typeof obj.version !== 'number') {
                    new Notice(t('settings.backup.invalidFile'));
                    return;
                }

                _pendingImport = { manifest: obj as unknown as BackupManifest, zip };
                _importToggles = {};
                for (const catId of Object.keys(_pendingImport.manifest.categories)) {
                    _importToggles[catId] = true;
                }

                this.rerender();
            } catch (e) {
                new Notice(t('settings.backup.importFailed', { error: (e as Error).message }));
            }
        })(); });
        input.click();
    }

    private buildImportConfirmation(container: HTMLElement): void {
        const data = _pendingImport!.manifest;
        const dateStr = data.exportedAt
            ? new Date(data.exportedAt).toLocaleDateString('de-DE', {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit',
            })
            : 'Unknown date';

        container.createEl('p', {
            cls: 'agent-backup-import-info',
            text: t('settings.backup.backupFrom', { date: dateStr, version: data.version }),
        });

        const categories = getCategories(this.plugin);
        const list = container.createDiv('agent-backup-category-list');
        for (const [catId, catData] of Object.entries(data.categories)) {
            const catDef = categories.find((c) => c.id === catId);
            const fileCount = catData.files.length;
            const totalSize = catData.files.reduce((sum, f) => sum + f.size, 0);

            const row = list.createDiv('agent-backup-category-row');
            const label = row.createEl('label', { cls: 'agent-backup-label' });

            const cb = label.createEl('input', { type: 'checkbox' });
            cb.checked = _importToggles[catId] ?? true;
            cb.addEventListener('change', () => {
                _importToggles[catId] = cb.checked;
            });

            const textWrap = label.createSpan({ cls: 'agent-backup-label-text' });
            textWrap.createSpan({
                text: catDef?.label ?? catId,
                cls: 'agent-backup-label-name',
            });
            textWrap.createSpan({
                text: ` (${fileCount} file${fileCount !== 1 ? 's' : ''}, ${this.formatSize(totalSize)})`,
                cls: 'agent-backup-label-stats',
            });
        }

        container.createEl('p', {
            cls: 'agent-backup-warning',
            text: t('settings.backup.overwriteWarning'),
        });

        const btnRow = container.createDiv('agent-backup-row');

        const confirmBtn = btnRow.createEl('button', { text: t('settings.backup.confirmImport'), cls: 'mod-cta' });
        confirmBtn.addEventListener('click', () => void this.doImport(confirmBtn));

        const cancelBtn = btnRow.createEl('button', { text: t('settings.backup.cancel') });
        cancelBtn.addEventListener('click', () => {
            _pendingImport = null;
            _importToggles = {};
            this.rerender();
        });
    }

    private async doImport(btn: HTMLElement): Promise<void> {
        if (!_pendingImport) return;
        btn.addClass('is-loading');
        btn.setText(t('settings.backup.importing'));

        try {
            let totalFiles = 0;
            let selectedCount = 0;
            const { manifest, zip } = _pendingImport;

            for (const [catId, catData] of Object.entries(manifest.categories)) {
                if (!_importToggles[catId]) continue;
                selectedCount++;

                const readEntry = async (relPath: string): Promise<Uint8Array | null> => {
                    const entry = zip.file(`${FILES_PREFIX}/${catId}/${relPath}`);
                    if (!entry) return null;
                    return entry.async('uint8array');
                };

                if (catId === 'settings') {
                    const data = await readEntry('data.json');
                    if (data) {
                        const text = new TextDecoder().decode(data);
                        const raw: unknown = JSON.parse(text);
                        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
                            console.warn('[BackupTab] Settings import: not a valid object, skipping');
                            continue;
                        }
                        const imported = this.sanitizeSettings(raw as Record<string, unknown>);
                        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS, imported);
                        await this.plugin.saveSettings();
                        totalFiles++;
                    }
                } else if (catId === 'vault-dna') {
                    const data = await readEntry('vault-dna.json');
                    if (data) {
                        const dir = getAgentFolderPath(this.plugin);
                        if (!(await this.app.vault.adapter.exists(dir))) {
                            await this.app.vault.adapter.mkdir(dir);
                        }
                        await this.app.vault.adapter.writeBinary(getVaultDnaPath(this.plugin), data.buffer);
                        totalFiles++;
                    }
                } else {
                    const catDef = getCategories(this.plugin).find((c) => c.id === catId);
                    if (!catDef) continue;
                    const extraFileSet = new Set(catDef.extraFiles ?? []);
                    for (const fileEntry of catData.files) {
                        const data = await readEntry(fileEntry.path);
                        if (!data) continue;
                        // extraFiles store the full path verbatim; dir-walked
                        // files are relative to catDef.dir and need re-prefixing.
                        const fullPath = extraFileSet.has(fileEntry.path)
                            ? fileEntry.path
                            : (catDef.dir ? `${catDef.dir}/${fileEntry.path}` : fileEntry.path);
                        if (catDef.root === 'global') {
                            await this.globalFs.writeBinary(fullPath, data);
                        } else {
                            const dirPath = fullPath.includes('/') ? fullPath.slice(0, fullPath.lastIndexOf('/')) : '';
                            if (dirPath && !(await this.app.vault.adapter.exists(dirPath))) {
                                await this.app.vault.adapter.mkdir(dirPath);
                            }
                            await this.app.vault.adapter.writeBinary(fullPath, data.buffer);
                        }
                        totalFiles++;
                    }
                }
            }

            _pendingImport = null;
            _importToggles = {};
            new Notice(t('settings.backup.imported', { files: totalFiles, categories: selectedCount }));
            this.rerender();
        } catch (e) {
            new Notice(t('settings.backup.importFailed', { error: (e as Error).message }));
        } finally {
            btn.removeClass('is-loading');
            btn.setText(t('settings.backup.confirmImport'));
        }
    }

    // ── Generic file helpers (work with any FileAdapter-compatible adapter) ──

    private adapterFor(cat: BackupCategory): { list(p: string): Promise<{files: string[], folders: string[]}>; read(p: string): Promise<string>; write(p: string, d: string): Promise<void>; exists(p: string): Promise<boolean>; mkdir(p: string): Promise<void> } {
        return cat.root === 'global' ? this.globalFs : this.app.vault.adapter;
    }

    private async countAndSizeFromAdapter(
        adapter: { list(p: string): Promise<{files: string[], folders: string[]}>; read(p: string): Promise<string> },
        dir: string, recursive: boolean,
    ): Promise<{ count: number; size: number }> {
        let count = 0;
        let size = 0;
        try {
            const listed = await adapter.list(dir);
            for (const filePath of listed.files) {
                try {
                    const content = await adapter.read(filePath);
                    count++;
                    size += content.length;
                } catch { /* skip */ }
            }
            if (recursive) {
                for (const subDir of listed.folders) {
                    const sub = await this.countAndSizeFromAdapter(adapter, subDir, true);
                    count += sub.count;
                    size += sub.size;
                }
            }
        } catch { /* directory doesn't exist */ }
        return { count, size };
    }

    // ── Settings sanitization ──────────────────────────────────────────────

    /**
     * Strip API keys and tokens before export (AUDIT-006 H-4).
     * Same field inventory as encryptSettingsForSave() in main.ts.
     */
    private stripSensitiveFields(settings: ObsidianAgentSettings): ObsidianAgentSettings {
        const copy = JSON.parse(JSON.stringify(settings)) as ObsidianAgentSettings;
        for (const model of copy.activeModels ?? []) {
            if (model.apiKey) model.apiKey = '';
        }
        for (const model of copy.embeddingModels ?? []) {
            if (model.apiKey) model.apiKey = '';
        }
        if (copy.webTools) {
            copy.webTools.braveApiKey = '';
            copy.webTools.tavilyApiKey = '';
        }
        copy.githubCopilotAccessToken = '';
        copy.githubCopilotToken = '';
        copy.kiloToken = '';
        copy.cloudflareApiToken = '';
        copy.relayToken = '';
        copy.mcpServerToken = '';
        return copy;
    }

    /**
     * Sanitize imported settings: only copy known keys from DEFAULT_SETTINGS,
     * skip internal flags, and validate critical field types.
     */
    private sanitizeSettings(raw: Record<string, unknown>): Record<string, unknown> {
        const allowedKeys = new Set(Object.keys(DEFAULT_SETTINGS));
        // Internal flags that must never be imported
        const blockedKeys = new Set(['_encrypted', '_globalStorageMigrated', '_syncDirMigrated']);

        const result: Record<string, unknown> = {};
        let skippedCount = 0;

        for (const [key, value] of Object.entries(raw)) {
            if (blockedKeys.has(key)) {
                skippedCount++;
                continue;
            }
            if (!allowedKeys.has(key)) {
                skippedCount++;
                continue;
            }
            result[key] = value;
        }

        // Validate autoApproval sub-fields are booleans
        if (typeof result.autoApproval === 'object' && result.autoApproval !== null) {
            const approval = result.autoApproval as Record<string, unknown>;
            for (const [k, v] of Object.entries(approval)) {
                if (typeof v !== 'boolean') {
                    delete approval[k];
                }
            }
        }

        // Validate provider fields are strings
        if (typeof result.defaultProvider !== 'string') {
            delete result.defaultProvider;
        }

        if (skippedCount > 0) {
            console.debug(`[BackupTab] Settings import: skipped ${skippedCount} unknown/blocked keys`);
        }

        return result;
    }

    // ── Formatting ───────────────────────────────────────────────────────────

    private formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
}
