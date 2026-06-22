/**
 * LookupAction -- explain selected term via LLM (FEAT-33-02 baseline, EPIC-33).
 *
 * Single-turn LLM call: "Explain this selection". Output streams to
 * callbacks.onText so the plugin entry-point can render it in a
 * Preview-Block under the selection (Notion-Pattern).
 *
 * Vault-Knowledge integration (FEAT-33-09) extends this action via
 * the optional `vaultRagPipeline` field. When present and enabled,
 * the action queries the semantic index, augments the system prompt
 * with hits above the confidence threshold, and prepends source links
 * to the streamed output. Without the pipeline it falls back to a
 * pure LLM-only lookup.
 *
 * Tier-routing (cost-aware): default model-override is "haiku-tier"
 * because lookups are short and frequent. The plugin entry-point
 * resolves the hint to a concrete model id; the action itself stays
 * tier-agnostic.
 *
 * Related: FEAT-33-02, FEAT-33-09, ADR-138, ADR-142.
 */

import type { AgentTaskCallbacks } from '../../AgentTask';
import type { InlineAction } from '../InlineActionRegistry';
import type { InlineTriggerContext } from '../InlineTriggerContext';
import type { InlineLLMCaller } from '../InlineLLMCaller';

export interface LookupRagSource {
    /** Vault-relative note path. */
    notePath: string;
    /** Optional short excerpt (40-200 chars) shown in the tooltip. */
    excerpt?: string;
    /** Cosine-similarity 0..1. Filtered by confidenceThreshold. */
    confidence: number;
}

export interface LookupRagResult {
    sources: LookupRagSource[];
    /** Augmentation block that prepends to the LLM system prompt. */
    promptAugmentation: string;
}

export interface VaultRagPipeline {
    /**
     * Run the RAG pipeline for the given selection. Returns null when
     * no source crosses the confidence threshold (caller falls back
     * to LLM-only).
     */
    augment(args: {
        selectionText: string;
        confidenceThreshold: number;
        topN: number;
    }): Promise<LookupRagResult | null>;
}

export interface LookupActionOptions {
    /** LLM caller (single-turn provider stream). */
    caller: InlineLLMCaller;
    /**
     * Optional Vault-RAG pipeline. When undefined the action behaves
     * as LLM-only (FEAT-33-02 baseline).
     */
    vaultRagPipeline?: VaultRagPipeline;
    /**
     * Settings probe -- read at trigger-time to honour live setting
     * changes. The plugin entry-point passes a function that reads
     * plugin.settings.inlineActions.
     */
    getRagSettings?: () => { enabled: boolean; confidenceThreshold: number; showSourcesInTooltip: boolean; topN: number };
    /** Optional id/label override for the action. */
    id?: string;
    label?: string;
}

const DEFAULT_SYSTEM_PROMPT = `You explain terms or short phrases. The user has selected text in a note and wants a clear, concise explanation. Reply in the language of the selection. Use 2-4 sentences. If the selection is an acronym, expand it and explain. If it is a name, identify the person/concept. Avoid speculation -- say "unclear" when honest.`;

const DEFAULT_VAULT_AUGMENT_PREFIX = `\n\nThe user's own vault contains the following relevant notes. Use them as primary source when they cover the selection; otherwise rely on general knowledge:\n`;

export class LookupAction implements InlineAction {
    readonly id: string;
    readonly label: string;
    readonly description: string;

    private readonly caller: InlineLLMCaller;
    private readonly vaultRagPipeline?: VaultRagPipeline;
    private readonly getRagSettings: () => { enabled: boolean; confidenceThreshold: number; showSourcesInTooltip: boolean; topN: number };

    constructor(options: LookupActionOptions) {
        this.caller = options.caller;
        this.vaultRagPipeline = options.vaultRagPipeline;
        this.getRagSettings = options.getRagSettings ?? (() => ({ enabled: true, confidenceThreshold: 0.7, showSourcesInTooltip: true, topN: 5 }));
        this.id = options.id ?? 'lookup';
        this.label = options.label ?? 'Lookup';
        this.description = 'Explain the selected term';
    }

    /**
     * Eligible whenever there is a non-empty selection. Reading-Mode
     * is fine -- Lookup is read-only on the note.
     */
    isEligible(ctx: InlineTriggerContext): boolean {
        return ctx.selectionText.trim().length > 0;
    }

    async execute(ctx: InlineTriggerContext, callbacks: AgentTaskCallbacks): Promise<void> {
        let systemPrompt = DEFAULT_SYSTEM_PROMPT;
        let sourcesHeader = '';

        // FEAT-33-09: Vault-RAG augmentation when enabled and pipeline present.
        if (this.vaultRagPipeline !== undefined) {
            const settings = this.getRagSettings();
            if (settings.enabled === true) {
                try {
                    const rag = await this.vaultRagPipeline.augment({
                        selectionText: ctx.selectionText,
                        confidenceThreshold: settings.confidenceThreshold,
                        topN: settings.topN,
                    });
                    if (rag !== null) {
                        systemPrompt = `${DEFAULT_SYSTEM_PROMPT}${DEFAULT_VAULT_AUGMENT_PREFIX}${rag.promptAugmentation}`;
                        if (settings.showSourcesInTooltip === true && rag.sources.length > 0) {
                            sourcesHeader = renderSourcesHeader(rag.sources);
                        }
                    }
                } catch (e) {
                    // RAG failures fall back to LLM-only; do not block the lookup.
                    console.debug('[LookupAction] vault-rag augment failed (fallback to LLM-only):', e);
                }
            }
        }

        const userMessage = `Selection:\n\n${ctx.selectionText.trim()}`;

        if (sourcesHeader !== '') {
            callbacks.onText(sourcesHeader);
        }

        await this.caller.stream(
            { systemPrompt, userMessage },
            {
                onText: (chunk) => callbacks.onText(chunk),
                onComplete: () => callbacks.onComplete(),
                onError: (err) => callbacks.onError(err),
            },
        );
    }
}

/**
 * Builds a markdown-formatted source header. Lists each vault source
 * as a wikilink with a short excerpt and the confidence rounded to
 * two decimals. Empty when no sources exist.
 */
function renderSourcesHeader(sources: LookupRagSource[]): string {
    if (sources.length === 0) return '';
    const lines: string[] = ['**From your vault:**'];
    for (const s of sources) {
        const display = s.notePath.replace(/\.md$/, '');
        const conf = Math.round(s.confidence * 100) / 100;
        const excerpt = s.excerpt !== undefined && s.excerpt.length > 0
            ? ` -- ${truncate(s.excerpt, 120)}`
            : '';
        lines.push(`- [[${display}]] (${conf})${excerpt}`);
    }
    lines.push('');
    return lines.join('\n');
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).trimEnd()}…`;
}
