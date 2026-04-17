/**
 * AgentFolderService — FEATURE-0508
 *
 * Orchestrates agent-folder change handling:
 *   P0: user-facing notice after a save
 *   P1: live re-target of SkillRegistry + VaultDNAScanner (no plugin reload)
 *   P2: optional migration of existing data (plugin-skills, vault-dna,
 *       knowledge.db, memory.db) from the old path to the new path
 *
 * Not handled live: the SQLite databases (KnowledgeDB, MemoryDB). Their
 * sql.js handles point at a concrete file; re-opening mid-session is risky
 * because background enrichment / extraction queues could be writing. Users
 * get a clear notice to reload Obsidian when DB files have moved.
 */

import { Notice, normalizePath } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import {
    DEFAULT_AGENT_FOLDER,
    getAgentFolderPath,
    getPluginSkillsDir,
    isAbsoluteAgentFolder,
} from './agentFolder';

export interface MigrationPreview {
    pluginSkills: string[];
    vaultDnaExists: boolean;
    knowledgeDbExists: boolean;
    memoryDbExists: boolean;
    totalBytes: number;
}

export interface MigrationResult {
    movedPluginSkills: number;
    movedVaultDna: boolean;
    movedKnowledgeDb: boolean;
    movedMemoryDb: boolean;
    errors: string[];
}

export class AgentFolderService {
    constructor(private plugin: ObsidianAgentPlugin) {}

    /**
     * P0: show a clear notice after a setting change. Idempotent — safe to
     * call on every save. Skips the message when the path hasn't actually
     * moved (e.g. whitespace-only edits).
     */
    showChangeNotice(previousPath: string, newPath: string): void {
        const prev = normalizePath(previousPath || DEFAULT_AGENT_FOLDER);
        const next = normalizePath(newPath || DEFAULT_AGENT_FOLDER);
        if (prev === next) return;

        new Notice(
            `Agent folder set to "${newPath}". Existing files at "${previousPath}" are NOT moved automatically — use "Migrate data" below to carry them over. `
                + `Reload Obsidian once migration is done so the knowledge and memory databases open at the new location.`,
            12_000,
        );
    }

    /**
     * P1: notify in-memory components that the agent folder moved. They pick
     * up the new path on the next read/write without requiring a full plugin
     * reload. Safe to call on every save — setters are idempotent.
     *
     * Not covered: KnowledgeDB / MemoryDB. Their sql.js handle is tied to the
     * open file; mid-session re-open is unsafe. Users reload Obsidian after
     * migration so the DBs open at the new path fresh.
     */
    async retargetLiveComponents(): Promise<void> {
        const newSkillsDir = getPluginSkillsDir(this.plugin);

        // SkillRegistry caches skillsDir in its constructor — bump it in place.
        this.plugin.skillRegistry?.setSkillsDir(newSkillsDir);

        // VaultDNAScanner caches skillsDir AND dnaPath. Its setter re-runs the
        // initialize() scan so plugin skills move to the new location on the
        // next run and the prompt hint updates.
        const scanner = this.plugin.vaultDNAScanner;
        if (scanner) {
            scanner.setAgentFolder(getAgentFolderPath(this.plugin));
            // Re-scan so .skill.md files land at the new path
            await scanner.initialize().catch((e) =>
                console.warn('[AgentFolderService] Re-scan after folder change failed (non-fatal):', e),
            );
        }
    }

    /**
     * P2: read the old path and return a summary of what would be migrated.
     * Uses vault.adapter so it works regardless of whether the path is
     * vault-relative or (future) absolute. For absolute paths currently
     * outside the vault, returns an empty preview because vault.adapter
     * cannot list them — the full cross-vault migration will arrive when
     * Phase 2 lands.
     */
    async previewMigration(oldPath: string): Promise<MigrationPreview> {
        const preview: MigrationPreview = {
            pluginSkills: [],
            vaultDnaExists: false,
            knowledgeDbExists: false,
            memoryDbExists: false,
            totalBytes: 0,
        };

        if (!oldPath || isAbsoluteAgentFolder(oldPath)) return preview;
        const base = normalizePath(oldPath);
        const adapter = this.plugin.app.vault.adapter;

        // plugin-skills/
        const skillsDir = `${base}/plugin-skills`;
        if (await adapter.exists(skillsDir)) {
            const listing = await adapter.list(skillsDir);
            preview.pluginSkills = listing.files;
            for (const f of listing.files) {
                const stat = await adapter.stat(f);
                if (stat) preview.totalBytes += stat.size;
            }
        }

        // vault-dna.json
        const dnaPath = `${base}/vault-dna.json`;
        if (await adapter.exists(dnaPath)) {
            preview.vaultDnaExists = true;
            const stat = await adapter.stat(dnaPath);
            if (stat) preview.totalBytes += stat.size;
        }

        // knowledge.db / memory.db (only meaningful in local storage mode)
        const knowledgePath = `${base}/knowledge.db`;
        if (await adapter.exists(knowledgePath)) {
            preview.knowledgeDbExists = true;
            const stat = await adapter.stat(knowledgePath);
            if (stat) preview.totalBytes += stat.size;
        }
        const memoryPath = `${base}/memory.db`;
        if (await adapter.exists(memoryPath)) {
            preview.memoryDbExists = true;
            const stat = await adapter.stat(memoryPath);
            if (stat) preview.totalBytes += stat.size;
        }

        return preview;
    }

    /**
     * P2: copy data from oldPath to newPath. Keeps originals in place
     * (defensive — user deletes manually after verifying). Closes KnowledgeDB
     * and MemoryDB before copying so the files are not locked / mid-write.
     * Returns a result summary with per-file errors (non-fatal, caller shows
     * them).
     */
    async migrate(oldPath: string, newPath: string): Promise<MigrationResult> {
        const result: MigrationResult = {
            movedPluginSkills: 0,
            movedVaultDna: false,
            movedKnowledgeDb: false,
            movedMemoryDb: false,
            errors: [],
        };

        if (isAbsoluteAgentFolder(oldPath) || isAbsoluteAgentFolder(newPath)) {
            result.errors.push('Cross-vault migration is not supported in this release. Move files manually.');
            return result;
        }

        const src = normalizePath(oldPath);
        const dst = normalizePath(newPath);
        if (src === dst) return result;

        const adapter = this.plugin.app.vault.adapter;

        // Close databases so we do not copy a locked file mid-write.
        await this.plugin.knowledgeDB?.close().catch(() => { /* non-fatal */ });
        await this.plugin.memoryDB?.close().catch(() => { /* non-fatal */ });

        // Ensure destination exists
        if (!(await adapter.exists(dst))) {
            await adapter.mkdir(dst);
        }

        // plugin-skills (folder)
        const srcSkills = `${src}/plugin-skills`;
        if (await adapter.exists(srcSkills)) {
            const dstSkills = `${dst}/plugin-skills`;
            if (!(await adapter.exists(dstSkills))) await adapter.mkdir(dstSkills);
            const listing = await adapter.list(srcSkills);
            for (const f of listing.files) {
                try {
                    const filename = f.split('/').pop() ?? f;
                    const destFile = `${dstSkills}/${filename}`;
                    if (await adapter.exists(destFile)) continue; // do not overwrite
                    const content = await adapter.read(f);
                    await adapter.write(destFile, content);
                    result.movedPluginSkills++;
                } catch (e) {
                    result.errors.push(`plugin-skills: ${(e as Error).message}`);
                }
            }
        }

        // vault-dna.json
        try {
            const srcDna = `${src}/vault-dna.json`;
            const dstDna = `${dst}/vault-dna.json`;
            if ((await adapter.exists(srcDna)) && !(await adapter.exists(dstDna))) {
                await adapter.write(dstDna, await adapter.read(srcDna));
                result.movedVaultDna = true;
            }
        } catch (e) {
            result.errors.push(`vault-dna.json: ${(e as Error).message}`);
        }

        // knowledge.db and memory.db are binary — use readBinary/writeBinary
        const binaryCandidates: Array<[string, (r: MigrationResult) => void]> = [
            [`knowledge.db`, (r) => { r.movedKnowledgeDb = true; }],
            [`memory.db`, (r) => { r.movedMemoryDb = true; }],
        ];
        for (const [filename, markResult] of binaryCandidates) {
            try {
                const srcFile = `${src}/${filename}`;
                const dstFile = `${dst}/${filename}`;
                if ((await adapter.exists(srcFile)) && !(await adapter.exists(dstFile))) {
                    const buf = await adapter.readBinary(srcFile);
                    await adapter.writeBinary(dstFile, buf);
                    markResult(result);
                }
            } catch (e) {
                result.errors.push(`${filename}: ${(e as Error).message}`);
            }
        }

        return result;
    }
}

/** Helper: read the persisted setting (pre-save value). */
export function readStoredAgentFolder(plugin: ObsidianAgentPlugin): string {
    return plugin.settings.agentFolderPath?.trim() || DEFAULT_AGENT_FOLDER;
}
