/**
 * FIX-04-03-09 regression: OpenAI / Copilot / Kilo-Gateway used to silently
 * drop `{type:'image', source:{base64,...}}` user blocks because their
 * convertMessages loop only branched on text and tool_result. AttachmentHandler
 * + AgentSidebarView push these blocks for every PNG/JPEG/GIF/WEBP the user
 * drags in; without this mapping gpt-4o / Gemini-via-OpenAI / OpenRouter
 * vision models received text only and answered "I don't see an image".
 *
 * Each provider must now emit the OpenAI ChatCompletion vision format:
 *   { role: 'user', content: [{type:'image_url', image_url:{url:'data:<mt>;base64,<data>'}}, ...] }
 */

import { describe, it, expect } from 'vitest';
import { OpenAiProvider } from '../openai';
import { GitHubCopilotProvider } from '../github-copilot';
import { KiloGatewayProvider } from '../kilo-gateway';
import type { LLMProvider } from '../../../types/settings';
import type { MessageParam } from '../../types';

interface OpenAiUserMessage {
    role: 'user' | 'system' | 'assistant' | 'tool';
    content: string | null | Array<unknown>;
}

const openAiConfig: LLMProvider = {
    id: 'a', name: 'a', type: 'openai', apiKey: 'sk', model: 'gpt-4o',
} as LLMProvider;

const copilotConfig: LLMProvider = {
    id: 'b', name: 'b', type: 'github-copilot', apiKey: 'sk', model: 'gpt-4o',
} as LLMProvider;

const kiloConfig: LLMProvider = {
    id: 'c', name: 'c', type: 'kilo-gateway', apiKey: 'sk', model: 'claude-sonnet-4-5',
} as LLMProvider;

function convert(
    provider: OpenAiProvider | GitHubCopilotProvider | KiloGatewayProvider,
    messages: MessageParam[],
): OpenAiUserMessage[] {
    return (provider as unknown as {
        convertMessages(sys: string, m: MessageParam[]): OpenAiUserMessage[];
    }).convertMessages('sys', messages);
}

describe.each([
    ['OpenAiProvider', () => new OpenAiProvider(openAiConfig)],
    ['GitHubCopilotProvider', () => new GitHubCopilotProvider(copilotConfig)],
    ['KiloGatewayProvider', () => new KiloGatewayProvider(kiloConfig)],
] as const)('FIX-04-03-09 image-block mapping (%s)', (_name, factory) => {
    it('emits image_url for an image-only user message', () => {
        const provider = factory();
        const out = convert(provider, [
            {
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' } },
                ],
            },
        ]);
        // First entry is the system message.
        const user = out.find((m) => m.role === 'user')!;
        expect(user).toBeDefined();
        expect(Array.isArray(user.content)).toBe(true);
        const content = user.content as Array<{ type: string; image_url?: { url: string } }>;
        expect(content[0]).toMatchObject({
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBOR' },
        });
    });

    it('emits a mixed text + image content array, preserving order', () => {
        const provider = factory();
        const out = convert(provider, [
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Beschreibe das Bild.' },
                    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
                ],
            },
        ]);
        const user = out.find((m) => m.role === 'user')!;
        expect(Array.isArray(user.content)).toBe(true);
        const content = user.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
        expect(content).toHaveLength(2);
        expect(content[0]).toMatchObject({ type: 'text', text: 'Beschreibe das Bild.' });
        expect(content[1]).toMatchObject({
            type: 'image_url',
            image_url: { url: 'data:image/jpeg;base64,AAAA' },
        });
    });

    it('keeps text-only user messages as a string (backwards-compat)', () => {
        const provider = factory();
        const out = convert(provider, [
            {
                role: 'user',
                content: [{ type: 'text', text: 'pure text question' }],
            },
        ]);
        const userMsgs = out.filter((m) => m.role === 'user');
        expect(userMsgs).toHaveLength(1);
        expect(userMsgs[0].content).toBe('pure text question');
    });

    it('roundtrips every supported media type into the data-URL prefix', () => {
        const provider = factory();
        const out = convert(provider, [
            {
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/gif', data: 'G' } },
                    { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: 'W' } },
                ],
            },
        ]);
        const user = out.find((m) => m.role === 'user')!;
        const content = user.content as Array<{ image_url?: { url: string } }>;
        expect(content[0].image_url!.url).toBe('data:image/gif;base64,G');
        expect(content[1].image_url!.url).toBe('data:image/webp;base64,W');
    });
});
