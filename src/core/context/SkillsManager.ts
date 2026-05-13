/**
 * SkillsManager - Discover and read skills from global storage (Sprint 3.4).
 *
 * Skills are stored as Markdown files at:
 *   ~/.obsidian-agent/skills/{name}/SKILL.md
 *
 * SKILL.md frontmatter (required):
 *   name: string        -- short identifier (lowercase, hyphens)
 *   description: string -- what the skill is for
 *
 * SKILL.md body -- instructions the agent should follow when using this skill.
 *
 * Since FEAT-24-09 / ADR-116 the agent picks a skill itself from the stable
 * SKILLS directory in the system prompt and loads its body on demand via
 * the read_skill tool. The legacy per-message keyword classifier
 * (getRelevantSkills) was removed in IMP-24-09-01 (AUDIT-019 F-1):
 * the classifier path in AgentSidebarView had already been deleted as
 * part of FEAT-24-09, leaving the method as orphan dead code that risked
 * a silent re-injection of body content into the cached system-prompt
 * prefix if a future change ever re-wired it.
 */

import type { FileAdapter } from '../storage/types';

export interface SkillMeta {
    /** Path relative to FileAdapter root (e.g. "skills/my-skill/SKILL.md") */
    path: string;
    /** Short name (from frontmatter or directory name) */
    name: string;
    /** Description used for keyword matching */
    description: string;
    /** Source: 'learned' (agent-created), 'user' (manual), or undefined (legacy) */
    source?: 'learned' | 'user' | 'bundled';
    /** Optional trigger regex for fast-path matching */
    trigger?: string;
}

export class SkillsManager {
    private readonly fs: FileAdapter;
    readonly skillsDir: string;

    constructor(fs: FileAdapter) {
        this.fs = fs;
        this.skillsDir = 'skills';
    }

    async initialize(): Promise<void> {
        try {
            const exists = await this.fs.exists(this.skillsDir);
            if (!exists) {
                await this.fs.mkdir(this.skillsDir);
            }
        } catch {
            // Non-fatal
        }
    }

    /**
     * Discover all skills by scanning for SKILL.md files.
     */
    async discoverSkills(): Promise<SkillMeta[]> {
        try {
            const exists = await this.fs.exists(this.skillsDir);
            if (!exists) return [];
            const listed = await this.fs.list(this.skillsDir);
            const skills: SkillMeta[] = [];
            for (const folder of listed.folders) {
                const skillPath = `${folder}/SKILL.md`;
                const fileExists = await this.fs.exists(skillPath);
                if (!fileExists) continue;
                try {
                    const content = await this.fs.read(skillPath);
                    const meta = this.parseFrontmatter(content, folder, skillPath);
                    if (meta) skills.push(meta);
                } catch {
                    // Skip unreadable skill files
                }
            }
            return skills;
        } catch {
            return [];
        }
    }

    /**
     * Read a skill file's content (for UI editing).
     */
    readFile(path: string): Promise<string> {
        return this.fs.read(path);
    }

    /**
     * Write a skill file's content (for UI editing).
     */
    async writeFile(path: string, content: string): Promise<void> {
        await this.fs.write(path, content);
    }

    /**
     * Create a skill directory and file.
     */
    async createSkill(dirPath: string, content: string): Promise<void> {
        await this.fs.mkdir(dirPath);
        await this.fs.write(`${dirPath}/SKILL.md`, content);
    }

    /**
     * Delete a skill file and its parent directory if empty afterward.
     */
    async deleteSkill(path: string): Promise<void> {
        try {
            await this.fs.remove(path);
        } catch {
            // Non-fatal: file may already be gone
        }
        // Clean up empty parent directory (e.g. skills/my-skill/)
        const parentDir = path.substring(0, path.lastIndexOf('/'));
        if (parentDir) {
            try {
                const listing = await this.fs.list(parentDir);
                if (listing.files.length === 0 && listing.folders.length === 0) {
                    await this.fs.remove(parentDir);
                }
            } catch {
                // Non-fatal: directory may not exist
            }
        }
    }

    /**
     * Check if a path exists in global storage.
     */
    fileExists(path: string): Promise<boolean> {
        return this.fs.exists(path);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private parseFrontmatter(content: string, folder: string, skillPath: string): SkillMeta | null {
        // Extract YAML frontmatter between --- delimiters
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) return null;
        const yaml = match[1];

        const nameMatch = yaml.match(/^name:\s*(.+)$/m);
        const descMatch = yaml.match(/^description:\s*(.+)$/m);
        const sourceMatch = yaml.match(/^source:\s*(.+)$/m);
        const triggerMatch = yaml.match(/^trigger:\s*(.+)$/m);

        const name = nameMatch?.[1]?.trim() ?? folder.split('/').pop() ?? 'unknown';
        const description = descMatch?.[1]?.trim() ?? '';
        const source = sourceMatch?.[1]?.trim() as SkillMeta['source'];
        const trigger = triggerMatch?.[1]?.trim();

        if (!description) return null;

        return { path: skillPath, name, description, source, trigger };
    }
}
