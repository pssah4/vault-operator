/**
 * Incoming-links regeneration, globally or for a fixed set of approved notes.
 * ADR-96 preserves the block format; ADR-165 binds every agent write to its
 * preview and checkpoint. Main owns startup/command callers, the health tool
 * supplies the explicit scope and checkpoint callback. See ARCHITECTURE.map.
 */
import { TFile } from 'obsidian';
import type Plugin from '../../main';
import { INCOMING_LINKS_DEFAULT_THRESHOLD, OKF_DEFAULTS } from '../../types/settings';
import { isDeniedPath } from '../tools/vault/denyZoneFilter';
import { validateVaultRelativePath } from '../tools/vault/pathValidation';
import { computeIncomingBlockUpdate, INCOMING_BLOCK_ID } from './incomingLinksMaintainer';
import { frontmatterCellText, normalizeIncomingArchiveFolders, selectIncomingSources, type IncomingLinksDisplayOptions } from './incomingLinksBlock';
import { buildBacklinksBaseBlock } from './backlinksBaseBlock';
import { effectiveHubThreshold, isHubType } from './hubTypeThreshold';
import { findAutoBlock } from '../ingest/MOCMaintainer';

/** Exact vault identity, with the current read AND write policies applied. */
export function incomingRefreshFile(plugin: Plugin, path: string): TFile | null {
    if (!path || path.startsWith('/') || validateVaultRelativePath(path) !== path
        || isDeniedPath(plugin, path) || plugin.ignoreService.isProtected(path)) return null;
    const file = plugin.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && file.extension === 'md' && file.path === path ? file : null;
}

export interface IncomingRefreshResult {
    status: 'disabled' | 'unavailable' | 'busy' | 'ok' | 'cancelled';
    written: number;
    hubs: number;
    failed: number;
}

const runningRefreshes = new WeakSet<Plugin>();

export async function refreshIncomingLinksBlocks(
    plugin: Plugin,
    paths?: readonly string[],
    beforeWrite?: (paths: readonly string[]) => Promise<void>,
    signal?: AbortSignal,
): Promise<IncomingRefreshResult> {
    const result: IncomingRefreshResult = { status: 'ok', written: 0, hubs: 0, failed: 0 };
    const cfg = plugin.settings.vaultIngest?.incomingLinksBlock;
    if (!cfg?.enabled) return { ...result, status: 'disabled' };
    const graph = plugin.graphStore;
    if (!graph || !plugin.knowledgeDB?.isOpen()) return { ...result, status: 'unavailable' };
    if (plugin.vaultHealthRepairInProgress || runningRefreshes.has(plugin)) return { ...result, status: 'busy' };
    if (signal?.aborted) return { ...result, status: 'cancelled' };
    const thresholdSetting = cfg.threshold ?? INCOMING_LINKS_DEFAULT_THRESHOLD;
    const summaryProp = plugin.settings.summaryProperty ?? OKF_DEFAULTS.summaryProperty;
    const typeProp = plugin.settings.categoryProperty ?? OKF_DEFAULTS.categoryProperty;
    const displayOptions: IncomingLinksDisplayOptions = {
        maxRows: cfg.maxRows,
        archiveFolders: normalizeIncomingArchiveFolders(cfg.archiveFolders),
        typeForPath: path => {
            const source = plugin.app.vault.getAbstractFileByPath(path);
            return source instanceof TFile
                ? frontmatterCellText(plugin.app.metadataCache.getFileCache(source)?.frontmatter?.[typeProp])
                : undefined;
        },
    };
    // The health flag also suppresses the modify extractor: honour it, never
    // own it. A separate mutex serializes refreshes without changing that flow.
    runningRefreshes.add(plugin);
    const targetPaths = paths === undefined ? new Set<string>() : new Set(paths);
    try {
        const vault = plugin.app.vault;
        if (paths === undefined) {
            for (const path of graph.getHubTargets(1, { excludeLinkTypes: ['backlink-block'] })) targetPaths.add(path);
            for (const file of vault.getMarkdownFiles()) {
                if (signal?.aborted) return { ...result, status: 'cancelled' };
                if (!incomingRefreshFile(plugin, file.path)) continue;
                try {
                    const content = await vault.read(file);
                    if (findAutoBlock(content, INCOMING_BLOCK_ID)) targetPaths.add(file.path);
                } catch { /* Existing global discovery skips unreadable notes. */ }
            }
        }
        const targets = new Map<string, TFile>();
        for (const path of targetPaths) {
            const file = incomingRefreshFile(plugin, path);
            if (file) targets.set(path, file);
        }
        result.hubs = targets.size;
        if (targets.size === 0) return result;
        if (beforeWrite) await beforeWrite([...targets.keys()]);
        const baseBlock = buildBacklinksBaseBlock(summaryProp, typeProp);
        for (const [path, file] of targets) {
            if (signal?.aborted) return { ...result, status: 'cancelled' };
            // A TFile is mutable: a rename while the checkpoint was running
            // must not turn approval for A.md into permission for Moved.md.
            if (plugin.vaultHealthRepairInProgress || file.path !== path || incomingRefreshFile(plugin, path) !== file) { result.failed++; continue; }
            const noChange = new Error('unchanged incoming-links block');
            const cancelled = new Error('incoming-links refresh cancelled');
            let changed = false;
            try {
                await vault.process(file, content => {
                    if (signal?.aborted) throw cancelled;
                    if (plugin.vaultHealthRepairInProgress || file.path !== path || incomingRefreshFile(plugin, path) !== file) throw new Error('Refresh target changed or is no longer writable');
                    const sources = selectIncomingSources(graph.getSourcesFor(path, { excludeLinkTypes: ['backlink-block'] }), {
                        selfPath: path,
                        exists: source => !isDeniedPath(plugin, source) && vault.getAbstractFileByPath(source) instanceof TFile,
                    });
                    const type = frontmatterCellText(plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[typeProp]);
                    const threshold = effectiveHubThreshold(type, thresholdSetting);
                    const useBase = isHubType(type) && sources.length > 0 ? baseBlock : undefined;
                    const updated = computeIncomingBlockUpdate(content, sources, threshold, path, useBase, displayOptions);
                    if (updated === null || updated === content) throw noChange;
                    changed = true;
                    return updated;
                });
                if (changed) result.written++;
            } catch (error) {
                if (error === cancelled) return { ...result, status: 'cancelled' };
                if (error === noChange) continue;
                result.failed++;
                console.debug('[IncomingLinks] regen failed for', path, error);
            }
        }
        return signal?.aborted ? { ...result, status: 'cancelled' } : result;
    } finally {
        runningRefreshes.delete(plugin);
    }
}
