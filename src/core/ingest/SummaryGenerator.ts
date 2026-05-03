/**
 * SummaryGenerator (FEAT-19-09 wiring helper) -- konkrete LLM-basierte
 * Summary-Generierung als SummaryGeneratorFn-Implementation fuer
 * FrontmatterIndexer.
 *
 * Nutzt den vom Plugin konfigurierten Memory-Model-Key (oder einen
 * expliziten Override aus VaultIngestSettings.summaryPrompt.modelOverride).
 * Trunkiert Note-Content auf max. 8k Zeichen um Token-Kosten zu deckeln.
 */

import type { ApiHandler, MessageParam } from '../../api/types';

const MAX_INPUT_CHARS = 8_000;

export interface BuildSummaryGeneratorOpts {
    /** Multi-Line-Prompt aus Settings (Default = Sebastians Wortlaut). */
    promptTemplate: string;
    /** Factory: gibt einen ApiHandler oder null wenn Modell fehlt. */
    apiHandlerFactory: () => ApiHandler | null;
    /** Optional: Hard-Cap fuer Tokens pro Generierung (Default 1500). */
    maxTokens?: number;
}

export interface SummaryGenerationResult {
    summary: string;
    modelUsed: string;
}

/** SummaryGeneratorFn-Builder. Returns null wenn keine Modell-Konfig. */
export function buildSummaryGenerator(opts: BuildSummaryGeneratorOpts) {
    return async (input: { notePath: string; content: string }): Promise<SummaryGenerationResult | null> => {
        const handler = opts.apiHandlerFactory();
        if (!handler) {
            console.debug('[SummaryGenerator] no API handler configured, skipping');
            return null;
        }

        const truncated = input.content.length > MAX_INPUT_CHARS
            ? input.content.slice(0, MAX_INPUT_CHARS) + '\n\n[...truncated...]'
            : input.content;

        const userMessage = `Note path: ${input.notePath}\n\nNote content:\n${truncated}\n\nGib NUR die Zusammenfassung als einen Satz (max 25 Woerter, deutsch) zurueck. Keine Erklaerungen, keine Vorrede, keine Anfuehrungszeichen.`;
        const messages: MessageParam[] = [{ role: 'user', content: userMessage }];

        try {
            const stream = handler.createMessage(opts.promptTemplate, messages, []);
            let collected = '';
            for await (const event of stream) {
                if (event.type === 'text') collected += event.text;
            }
            const summary = collected.trim().split('\n')[0].trim();
            if (!summary) return null;

            const modelUsed = handler.getModel?.()?.id ?? 'unknown';
            return { summary, modelUsed };
        } catch (err) {
            console.warn(`[SummaryGenerator] failed for ${input.notePath}:`, err);
            return null;
        }
    };
}
