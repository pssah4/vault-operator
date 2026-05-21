/**
 * SuggestionService
 *
 * Analyzes agent episodes and patterns to proactively suggest
 * self-improvement actions:
 * - Repeated workflows → suggest skill creation
 * - Repeated errors → suggest fix from errors.md
 * - Frequent tool sequences → suggest dynamic tool creation
 *
 * Part of Self-Development Phase 5: Proactive Self-Improvement.
 */

import type { FileAdapter } from '../storage/types';
import type { MemoryService } from '../memory/MemoryService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Suggestion {
    type: 'create-skill' | 'create-tool' | 'known-error' | 'pattern';
    title: string;
    description: string;
    /** Optional: pre-filled action data for the agent */
    actionHint?: string;
}

// ---------------------------------------------------------------------------
// SuggestionService
// ---------------------------------------------------------------------------

export class SuggestionService {
    private errorsContent = '';
    private customToolsContent = '';

    constructor(
        private fs: FileAdapter,
        private memoryService: MemoryService,
    ) {}

    /**
     * Load cached error and custom-tools data from memory.
     */
    async initialize(): Promise<void> {
        this.errorsContent = await this.memoryService.readFile('errors.md');
        this.customToolsContent = await this.memoryService.readFile('custom-tools.md');
    }

    /**
     * Check if a user message matches a known error pattern.
     * Returns relevant suggestions if found.
     */
    checkForKnownErrors(userMessage: string): Suggestion[] {
        if (!this.errorsContent.trim()) return [];

        const suggestions: Suggestion[] = [];
        const lines = this.errorsContent.split('\n');
        const lowerMsg = userMessage.toLowerCase();

        // Simple keyword-based matching against error entries
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            // Match lines that look like "- Error: ..." or "- Pattern: ..."
            if (trimmed.startsWith('- ')) {
                const entry = trimmed.slice(2).toLowerCase();
                // Check if any significant word from the error entry appears in the user message
                const keywords = entry.split(/\s+/).filter((w) => w.length > 4);
                const matchCount = keywords.filter((k) => lowerMsg.includes(k)).length;
                if (matchCount >= 2) {
                    suggestions.push({
                        type: 'known-error',
                        title: 'Known Error Pattern',
                        description: trimmed.slice(2),
                    });
                }
            }
        }

        return suggestions.slice(0, 3); // Limit to top 3
    }

    /**
     * Analyze a tool sequence for repeated patterns that could become
     * a skill or dynamic tool.
     */
    analyzeToolSequence(toolSequence: string[]): Suggestion[] {
        if (toolSequence.length < 3) return [];

        const suggestions: Suggestion[] = [];

        // Count repeated consecutive tool patterns (windows of 3)
        const patternCounts = new Map<string, number>();
        for (let i = 0; i <= toolSequence.length - 3; i++) {
            const pattern = toolSequence.slice(i, i + 3).join(' → ');
            patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
        }

        for (const [pattern, count] of patternCounts) {
            if (count >= 2) {
                suggestions.push({
                    type: 'create-skill',
                    title: 'Repeated Tool Pattern',
                    description: `The pattern "${pattern}" was repeated ${count} times in this session. Consider creating a skill to automate this workflow.`,
                    actionHint: `Activate the skill-creator builtin and run init_skill to capture the pattern: ${pattern}`,
                });
            }
        }

        return suggestions.slice(0, 2);
    }

    /**
     * Record an error into the errors.md memory file.
     */
    async recordError(errorMessage: string, resolution?: string): Promise<void> {
        const entry = resolution
            ? `- Error: ${errorMessage} → Fix: ${resolution}`
            : `- Error: ${errorMessage} → (unresolved)`;

        // Avoid duplicates
        if (this.errorsContent.includes(errorMessage)) return;

        await this.memoryService.appendToFile('errors.md', entry);
        this.errorsContent = await this.memoryService.readFile('errors.md');
    }

    /**
     * Record a newly created tool/skill in custom-tools.md.
     */
    async recordCustomTool(name: string, type: 'skill' | 'dynamic-tool', description: string): Promise<void> {
        const entry = `- ${name} (${type}): ${description}`;

        // Avoid duplicates
        if (this.customToolsContent.includes(name)) return;

        await this.memoryService.appendToFile('custom-tools.md', entry);
        this.customToolsContent = await this.memoryService.readFile('custom-tools.md');
    }

    /**
     * Get suggestions for the system prompt (brief, context-appropriate hints).
     */
    getSuggestionContext(): string {
        const sections: string[] = [];

        if (this.errorsContent.trim() && this.errorsContent.trim() !== '# Known Errors') {
            sections.push(
                '<known_errors>\n' +
                this.errorsContent.trim().slice(0, 500) +
                '\n</known_errors>'
            );
        }

        if (this.customToolsContent.trim() && this.customToolsContent.trim() !== '# Custom Tools & Skills') {
            sections.push(
                '<custom_tools>\n' +
                this.customToolsContent.trim().slice(0, 500) +
                '\n</custom_tools>'
            );
        }

        return sections.join('\n\n');
    }
}
