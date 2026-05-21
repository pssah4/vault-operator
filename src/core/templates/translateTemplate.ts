/**
 * FEAT-29-14: LLM-translator for the FirstRun/Re-materialize Template
 * workflow. Wraps `buildApiHandlerForModel(activeModel)` and returns
 * the translated template content as a string.
 *
 * Returns the source content unchanged if no active model is available
 * (offline-safe) -- the materializer reports `fallbackLanguage: 'en'`
 * in that case so the wizard can surface a Notice.
 *
 * The prompt is deterministic and includes:
 * - The exact frontmatter the caller wants to keep structurally intact.
 * - A "translate keys and list values, NOT the YAML structure" instruction.
 * - A "preserve `Permanent`, `tags`, `uid` and `Category:` list marker `- `" hint.
 */

import type ObsidianAgentPlugin from '../../main';
import { buildApiHandlerForModel } from '../../api/index';
import { getModelKey } from '../../types/settings';

export function makeTemplateTranslator(plugin: ObsidianAgentPlugin) {
    return async (lang: string, name: string, sourceContent: string): Promise<string> => {
        const model = pickActiveModel(plugin);
        if (!model) return sourceContent;
        try {
            const handler = buildApiHandlerForModel(model);
            const prompt = buildTranslationPrompt(lang, name, sourceContent);
            // Prefer the lightweight classifyText path when the provider
            // exposes it (single-shot, no streaming overhead). Otherwise
            // fall back to createMessage and concatenate the text chunks.
            if (typeof handler.classifyText === 'function') {
                const out = await handler.classifyText(prompt);
                return cleanResponse(out, sourceContent);
            }
            const stream = handler.createMessage(prompt, [{ role: 'user', content: 'Translate now.' }], []);
            let text = '';
            for await (const chunk of stream) {
                if (chunk.type === 'text') text += chunk.text;
            }
            return cleanResponse(text, sourceContent);
        } catch (e) {
            console.warn('[templates] translation failed, keeping EN source:', e);
            return sourceContent;
        }
    };
}

function pickActiveModel(plugin: ObsidianAgentPlugin) {
    const key = plugin.settings.activeModelKey;
    if (key) {
        const found = plugin.settings.activeModels.find((m) => getModelKey(m) === key);
        if (found?.enabled !== false) return found ?? null;
    }
    // Fall back to the first enabled model so the wizard works even
    // when the user has not picked an active key yet.
    return plugin.settings.activeModels.find((m) => m.enabled !== false) ?? null;
}

function buildTranslationPrompt(lang: string, name: string, source: string): string {
    return [
        `You are translating an Obsidian note template into ${lang}.`,
        '',
        'Rules:',
        '- Translate frontmatter keys (left side of ":") into idiomatic ' + lang + '.',
        '- Translate list values under "Category:" or equivalent.',
        '- DO NOT change the YAML structure (indentation, dashes, colons).',
        '- DO NOT translate the key names "tags", "uid", or "Permanent".',
        '- DO NOT translate the literal value `false`.',
        '- DO NOT add commentary, code fences, or explanations -- output ONLY the translated file content.',
        '',
        `Template filename: ${name}`,
        '',
        'Source content:',
        '---BEGIN---',
        source,
        '---END---',
    ].join('\n');
}

function cleanResponse(raw: string, source: string): string {
    let s = raw.trim();
    // Some providers wrap text in ```markdown ... ``` even though we
    // told them not to. Strip a single leading/trailing fence.
    s = s.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');
    s = s.replace(/^---BEGIN---\n/, '').replace(/\n---END---$/, '');
    if (s.length === 0) return source;
    if (!s.endsWith('\n')) s += '\n';
    return s;
}
