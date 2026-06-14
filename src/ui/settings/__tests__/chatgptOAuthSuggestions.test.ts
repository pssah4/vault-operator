/**
 * BUG-3-CODEX-OAUTH-MODEL-MISMATCH
 *
 * The legacy ModelConfigModal Quick Pick sources its chatgpt-oauth model
 * options from MODEL_SUGGESTIONS['chatgpt-oauth'] (constants.ts), while the
 * provider only accepts ids in KNOWN_MODELS (chatgpt-oauth.ts, surfaced via
 * listKnownChatGptOAuthModels()). The two had drifted: the suggestion list
 * offered `gpt-5.5` as the first entry labelled "recommended for Pro" -- a
 * model the Codex backend rejects with HTTP 400
 * ("not supported when using Codex with a ChatGPT account").
 *
 * These tests pin the static suggestion list to the static fallback allowlist
 * so the two cannot drift. The live "Fetch" path (fetchChatGptOAuthModels)
 * queries the real /codex/models endpoint and is authoritative; KNOWN_MODELS
 * is the offline fallback. Adding an id to KNOWN_MODELS must be mirrored here.
 *
 * Update 2026-06: the backend retired gpt-5/5.1/5.2 and the -codex variants;
 * the current lineup is gpt-5.4, gpt-5.4-mini, gpt-5.5 (confirmed against a
 * live account's /codex/models cache), so gpt-5.5 is now a VALID Codex model.
 */
import { describe, expect, it } from 'vitest';
import { MODEL_SUGGESTIONS } from '../constants';
import { listKnownChatGptOAuthModels, parseCodexModelsResponse } from '../../../api/providers/chatgpt-oauth';

describe('MODEL_SUGGESTIONS chatgpt-oauth alignment with KNOWN_MODELS', () => {
    const suggestions = MODEL_SUGGESTIONS['chatgpt-oauth'] ?? [];
    const knownIds = new Set(listKnownChatGptOAuthModels().map((m) => m.id));

    it('offers at least one model', () => {
        expect(suggestions.length).toBeGreaterThan(0);
    });

    it('offers the current frontier model gpt-5.5', () => {
        const ids = suggestions.map((s) => s.id);
        expect(ids).toContain('gpt-5.5');
    });

    it('no longer offers retired ids (gpt-5, gpt-5-codex)', () => {
        const ids = suggestions.map((s) => s.id);
        expect(ids).not.toContain('gpt-5');
        expect(ids).not.toContain('gpt-5-codex');
    });

    it('every suggested id is in the static fallback (subset of KNOWN_MODELS)', () => {
        for (const s of suggestions) {
            expect(knownIds.has(s.id), `suggested id ${s.id} is not in KNOWN_MODELS`).toBe(true);
        }
    });

    it('no label steers the user toward an unsupported model (no "recommended for Pro")', () => {
        for (const s of suggestions) {
            expect(s.label.toLowerCase()).not.toContain('recommended for pro');
        }
    });
});

describe('parseCodexModelsResponse', () => {
    it('maps slug/display_name and drops hidden + slugless entries', () => {
        const body = {
            models: [
                { slug: 'gpt-5.5', display_name: 'GPT-5.5', visibility: 'list' },
                { slug: 'gpt-5.4-mini', display_name: 'GPT-5.4 mini' },
                { slug: 'internal-x', display_name: 'Internal', visibility: 'hidden' },
                { display_name: 'No slug' },
            ],
        };
        expect(parseCodexModelsResponse(body)).toEqual([
            { id: 'gpt-5.5', label: 'GPT-5.5' },
            { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini' },
        ]);
    });

    it('returns empty for a malformed body', () => {
        expect(parseCodexModelsResponse(null)).toEqual([]);
        expect(parseCodexModelsResponse({})).toEqual([]);
        expect(parseCodexModelsResponse({ models: 'nope' })).toEqual([]);
    });
});
