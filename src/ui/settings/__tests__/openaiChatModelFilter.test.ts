/**
 * Guards isOpenAIChatCompletionModel against pollution from non-chat
 * modalities in OpenAI's `/v1/models` response. Bug: the previous,
 * loose filter let Realtime / TTS / Image / *-pro / *-codex variants
 * through, so the tier classifier mapped e.g. `gpt-5.5-pro-...` as
 * flagship -- which then 400'd on Test Connection because *-pro
 * variants only work via `/v1/responses`, not `/v1/chat/completions`.
 */
import { describe, expect, it } from 'vitest';
import { isOpenAIChatCompletionModel } from '../testModelConnection';

describe('isOpenAIChatCompletionModel', () => {
    it('accepts real chat-completion models', () => {
        const keep = [
            'gpt-5',
            'gpt-5-2025-08-07',
            'gpt-5-mini',
            'gpt-5-nano',
            'gpt-5-chat-latest',
            'gpt-5.1',
            'gpt-5.1-2025-11-13',
            'gpt-5.1-chat-latest',
            'gpt-5.2',
            'gpt-5.2-chat-latest',
            'gpt-5.3-chat-latest',
            'gpt-5.4',
            'gpt-5.4-mini',
            'gpt-5.4-nano',
            'gpt-5.5',
            'gpt-4.1',
            'gpt-4.1-mini',
            'gpt-4.1-nano',
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4o-2024-11-20',
            'gpt-4-turbo',
            'gpt-4',
            'gpt-3.5-turbo',
            'o1',
            'o1-mini',
            'o3',
            'o3-mini',
            'o4-mini',
        ];
        for (const id of keep) {
            expect(isOpenAIChatCompletionModel(id), `should keep ${id}`).toBe(true);
        }
    });

    it('rejects non-chat modalities and Responses-API-only variants', () => {
        const drop = [
            // Realtime API
            'gpt-realtime',
            'gpt-realtime-whisper',
            'gpt-realtime-2',
            'gpt-realtime-mini',
            'gpt-4o-realtime-preview',
            'gpt-4o-realtime-preview-2024-12-17',
            // Audio
            'gpt-audio',
            'gpt-audio-1.5',
            'gpt-audio-mini',
            'gpt-4o-audio-preview',
            'gpt-4o-mini-audio-preview',
            // TTS / Transcribe / Whisper
            'gpt-4o-mini-tts',
            'gpt-4o-mini-tts-2025-12-15',
            'gpt-4o-transcribe',
            'gpt-4o-mini-transcribe',
            'gpt-4o-transcribe-diarize',
            // Image
            'gpt-image-1',
            'gpt-image-1-mini',
            'gpt-image-2',
            'chatgpt-image-latest',
            // Search variants
            'gpt-4o-search-preview',
            'gpt-4o-search-preview-2025-03-11',
            'gpt-4o-mini-search-preview',
            'gpt-5-search-api',
            'gpt-5-search-api-2025-10-14',
            // Deep Research (Responses API)
            'o3-deep-research',
            'o4-mini-deep-research-2025-06-26',
            // *-pro (Responses API only)
            'gpt-5-pro',
            'gpt-5-pro-2025-10-06',
            'gpt-5.2-pro',
            'gpt-5.2-pro-2025-12-11',
            'gpt-5.4-pro',
            'gpt-5.5-pro',
            'gpt-5.5-pro-2026-04-23',
            'o1-pro',
            'o1-pro-2025-03-19',
            'o3-pro',
            'o3-pro-2025-06-10',
            // Codex (different endpoint)
            'gpt-5-codex',
            'gpt-5.1-codex',
            'gpt-5.1-codex-mini',
            'gpt-5.1-codex-max',
            'gpt-5.2-codex',
            'gpt-5.3-codex',
            // Legacy excludes
            'gpt-3.5-turbo-instruct',
            'gpt-4-32k',
            'gpt-4-0314',
        ];
        for (const id of drop) {
            expect(isOpenAIChatCompletionModel(id), `should drop ${id}`).toBe(false);
        }
    });

    it('rejects empty / non-OpenAI ids', () => {
        expect(isOpenAIChatCompletionModel('')).toBe(false);
        expect(isOpenAIChatCompletionModel('text-embedding-3-small')).toBe(false);
        expect(isOpenAIChatCompletionModel('claude-sonnet-4-6')).toBe(false);
    });
});
