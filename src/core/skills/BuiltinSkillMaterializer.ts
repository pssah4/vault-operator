/**
 * BuiltinSkillMaterializer
 *
 * FEAT-29-11 Step B. Writes the esbuild-generated `BUNDLED_SKILLS` constant
 * to disk under `<agent-folder>/data/skills/{name}/` so built-in skills live
 * side-by-side with user-authored and plugin-managed skills (Sebastian's
 * "Skill ist Skill" decision). Runs on every plugin onload BEFORE the
 * SelfAuthoredSkillLoader scans the skills directory, so the materialized
 * skills become visible without a second loadAll() pass.
 *
 * Contract:
 *   - SKILL.md is written with `source: builtin` in frontmatter, regardless
 *     of what the bundle's own frontmatter said (single normalization point).
 *   - Nested files (scripts/, references/, assets/) are written verbatim.
 *     Binary files use the `__b64__` key suffix from esbuild and get
 *     decoded + writeBinary'd here.
 *   - User-override wins: when the existing SKILL.md has `source: user`
 *     or `source: <plugin-id>`, the bundle is skipped with a notice.
 *   - On re-materialization, the previous builtin folder is wiped so a
 *     bundled-skill file that disappeared between releases is gone.
 */

import { normalizePath } from 'obsidian';
import { isSafePathSegment } from '../utils/safePathName';

interface AdapterLike {
    exists(p: string): Promise<boolean>;
    mkdir(p: string): Promise<void>;
    read(p: string): Promise<string>;
    write(p: string, content: string): Promise<void>;
    writeBinary(p: string, data: ArrayBuffer): Promise<void>;
    remove(p: string): Promise<void>;
    rmdir(p: string, recursive: boolean): Promise<void>;
    list(p: string): Promise<{ files: string[]; folders: string[] }>;
}

export interface MaterializeReport {
    written: string[];
    skipped: Array<{ name: string; reason: 'user-override' | 'plugin-override' }>;
    errors: Array<{ name: string; reason: string }>;
}

const BINARY_SUFFIX = '__b64__';

export class BuiltinSkillMaterializer {
    constructor(private adapter: AdapterLike, private skillsRoot: string) {}

    async materializeAll(bundle: Record<string, Record<string, string>>): Promise<MaterializeReport> {
        const report: MaterializeReport = { written: [], skipped: [], errors: [] };

        for (const [skillName, files] of Object.entries(bundle)) {
            try {
                if (!isSafePathSegment(skillName)) {
                    report.errors.push({ name: skillName, reason: 'unsafe-name' });
                    continue;
                }

                const targetDir = normalizePath(`${this.skillsRoot}/${skillName}`);
                const skillMdPath = `${targetDir}/SKILL.md`;

                if (await this.adapter.exists(skillMdPath)) {
                    const existing = await this.adapter.read(skillMdPath);
                    const existingSource = this.extractSource(existing);
                    // FEAT-29-13: also protect `agent`-tagged skills
                    // (skill-creator output) and the legacy `learned`
                    // discriminator from being wiped by a same-named
                    // bundled-skills entry on plugin reload.
                    if (
                        existingSource === 'user'
                        || existingSource === 'agent'
                        || existingSource === 'learned'
                    ) {
                        report.skipped.push({ name: skillName, reason: 'user-override' });
                        continue;
                    }
                    if (existingSource && existingSource !== 'builtin' && existingSource !== 'bundled') {
                        // Plugin-id source (e.g. "dataview"). Plugin-managed
                        // skills win over builtin materialization.
                        report.skipped.push({ name: skillName, reason: 'plugin-override' });
                        continue;
                    }
                }

                // Wipe previous builtin materialization so a removed-from-bundle
                // file does not linger on disk.
                if (await this.adapter.exists(targetDir)) {
                    await this.removeFolderRecursive(targetDir);
                }
                await this.ensureDir(targetDir);

                for (const [rawRelPath, content] of Object.entries(files)) {
                    let relPath = rawRelPath;
                    let binary = false;
                    if (relPath.endsWith(BINARY_SUFFIX)) {
                        relPath = relPath.slice(0, -BINARY_SUFFIX.length);
                        binary = true;
                    }
                    // FEAT-29-11 AUDIT L-1 defense-in-depth: refuse relPaths
                    // that escape the skill folder via `..` segments or that
                    // try to write under an absolute path. Bundle is built
                    // from the local bundled-skills/ tree at compile time so
                    // the risk is theoretical, but enforcing containment
                    // closes the path-traversal class outright.
                    if (
                        relPath.includes('..')
                        || relPath.startsWith('/')
                        || relPath.startsWith('\\')
                        || relPath.includes('\0')
                    ) {
                        report.errors.push({
                            name: skillName,
                            reason: `unsafe relpath rejected: ${relPath}`,
                        });
                        continue;
                    }
                    const fullPath = normalizePath(`${targetDir}/${relPath}`);
                    if (!fullPath.startsWith(`${targetDir}/`) && fullPath !== targetDir) {
                        report.errors.push({
                            name: skillName,
                            reason: `path escapes skill folder: ${relPath}`,
                        });
                        continue;
                    }
                    const parent = fullPath.slice(0, fullPath.lastIndexOf('/'));
                    if (parent && parent !== targetDir) {
                        await this.ensureDir(parent);
                    }

                    if (binary) {
                        const bytes = this.decodeBase64(content);
                        await this.adapter.writeBinary(fullPath, bytes);
                    } else if (relPath === 'SKILL.md') {
                        await this.adapter.write(fullPath, this.ensureBuiltinSource(content));
                    } else {
                        await this.adapter.write(fullPath, content);
                    }
                }

                report.written.push(skillName);
            } catch (e) {
                report.errors.push({ name: skillName, reason: (e as Error).message ?? String(e) });
            }
        }

        return report;
    }

    private extractSource(content: string): string | null {
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) return null;
        const fmLine = match[1].split('\n').find((line) => /^\s*source\s*:/.test(line));
        if (!fmLine) return null;
        const value = fmLine.slice(fmLine.indexOf(':') + 1).trim();
        return value.replace(/^['"]|['"]$/g, '');
    }

    private ensureBuiltinSource(content: string): string {
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) {
            // No frontmatter at all -- prepend a minimal block. Should not
            // happen for bundled skills but the guard keeps the contract.
            return `---\nsource: builtin\n---\n\n${content}`;
        }
        const fm = fmMatch[1];
        const lines = fm.split('\n');
        const sourceIdx = lines.findIndex((line) => /^\s*source\s*:/.test(line));
        if (sourceIdx >= 0) {
            lines[sourceIdx] = 'source: builtin';
        } else {
            lines.push('source: builtin');
        }
        const newFm = lines.join('\n');
        return content.replace(fmMatch[0], `---\n${newFm}\n---`);
    }

    private decodeBase64(b64: string): ArrayBuffer {
        // Buffer is available in Electron's Node integration, but to stay
        // portable for tests in jsdom we fall back to atob.
        const binStr =
            typeof Buffer !== 'undefined'
                ? Buffer.from(b64, 'base64').toString('binary')
                : atob(b64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
        return bytes.buffer;
    }

    private async ensureDir(p: string): Promise<void> {
        if (await this.adapter.exists(p)) return;
        const parent = p.slice(0, p.lastIndexOf('/'));
        if (parent && !(await this.adapter.exists(parent))) {
            await this.ensureDir(parent);
        }
        await this.adapter.mkdir(p);
    }

    private async removeFolderRecursive(dir: string): Promise<void> {
        const { files, folders } = await this.adapter.list(dir);
        for (const f of files) {
            await this.adapter.remove(f);
        }
        for (const sub of folders) {
            await this.removeFolderRecursive(sub);
        }
        await this.adapter.rmdir(dir, true);
    }
}
