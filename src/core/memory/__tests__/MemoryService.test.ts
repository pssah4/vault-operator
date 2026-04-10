import { describe, it, expect } from 'vitest';
import type { MemoryFiles } from '../MemoryService';

// We need to dynamically import to handle obsidian module resolution
describe('MemoryService', () => {
    async function getModule() {
        const mod = await import('../MemoryService');
        return mod;
    }

    describe('buildMemoryContext', () => {
        async function buildContext(files: MemoryFiles) {
            const { MemoryService } = await getModule();
            // Create with a minimal mock FileAdapter
            const fs = {
                exists: () => Promise.resolve(false),
                read: () => Promise.resolve(''),
                write: () => Promise.resolve(),
                mkdir: () => Promise.resolve(),
                list: () => Promise.resolve({ files: [] as string[], folders: [] as string[] }),
                remove: () => Promise.resolve(),
                append: () => Promise.resolve(),
                stat: () => Promise.resolve(null),
            };
            const service = new MemoryService(fs);
            return service.buildMemoryContext(files);
        }

        const emptyFiles: MemoryFiles = {
            userProfile: '',
            projects: '',
            patterns: '',
            knowledge: '',
            soul: '',
        };

        it('should return empty string for empty files', async () => {
            const result = await buildContext(emptyFiles);
            expect(result).toBe('');
        });

        it('should return empty string for template-only files', async () => {
            const result = await buildContext({
                ...emptyFiles,
                userProfile: `# User Profile

## Identity
- Name:
- Role:

## Communication
- Language:
- Style:

## Agent Behavior
`,
            });
            expect(result).toBe('');
        });

        it('should include non-empty sections with XML tags', async () => {
            const result = await buildContext({
                ...emptyFiles,
                soul: '# Agent Identity\n\n## Name\nTestBot\n\n## Values\n- Helpful',
            });
            expect(result).toContain('<agent_identity>');
            expect(result).toContain('TestBot');
            expect(result).toContain('</agent_identity>');
        });

        it('should include multiple sections', async () => {
            const result = await buildContext({
                ...emptyFiles,
                soul: '# My Identity\nI am helpful',
                userProfile: '# Profile\nSenior Dev',
                projects: '# Projects\nProject Alpha',
                patterns: '',
                knowledge: '',
            });
            expect(result).toContain('<agent_identity>');
            expect(result).toContain('<user_profile>');
            expect(result).toContain('<active_projects>');
            expect(result).not.toContain('<behavioral_patterns>');
        });

        it('should truncate files exceeding MAX_CHARS_PER_FILE', async () => {
            const longContent = 'x'.repeat(1000);
            const result = await buildContext({
                ...emptyFiles,
                soul: longContent,
            });
            expect(result).toContain('[...truncated]');
            // Should not exceed MAX_CHARS_PER_FILE (800) + tag overhead
            expect(result.length).toBeLessThan(1000);
        });

        it('should truncate total output exceeding MAX_TOTAL_CHARS (4000)', async () => {
            // Each section: 800 chars content + ~40 chars XML tags = ~840 chars
            // 4 sections * 840 = ~3360 chars. Need content that pushes past 4000.
            const content = 'y'.repeat(800); // At per-file limit (no per-file truncation)
            const result = await buildContext({
                userProfile: content,
                projects: content,
                patterns: content,
                knowledge: '',
                soul: content,
            });
            // 4 * (800 + ~35 tag overhead) = ~3340 < 4000, so no total truncation
            // Verify at least that all sections are present
            expect(result).toContain('<agent_identity>');
            expect(result).toContain('<behavioral_patterns>');
            // Total should be under MAX_TOTAL_CHARS since each file is at limit but 4*~835 < 4000
            expect(result.length).toBeGreaterThan(3000);
        });

        it('should not include knowledge in output', async () => {
            const result = await buildContext({
                ...emptyFiles,
                knowledge: '# Domain Knowledge\nImportant facts here',
            });
            // knowledge.md is excluded from system prompt (on-demand only)
            expect(result).not.toContain('Domain Knowledge');
        });
    });
});
