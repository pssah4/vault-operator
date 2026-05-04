/**
 * API Handler Factory
 *
 * Adapted from Kilo Code's src/api/index.ts (buildApiHandler)
 */

import type { LLMProvider, CustomModel } from '../types/settings';
import { modelToLLMProvider } from '../types/settings';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAiProvider } from './providers/openai';
import { GitHubCopilotProvider } from './providers/github-copilot';
import { KiloGatewayProvider } from './providers/kilo-gateway';
import { BedrockProvider } from './providers/bedrock';
import { ChatGptOAuthProvider } from './providers/chatgpt-oauth';

export type { ApiHandler, ApiStream, ApiStreamChunk, MessageParam, ContentBlock, ModelInfo } from './types';

/**
 * Build an ApiHandler from a CustomModel (new path)
 */
export function buildApiHandlerForModel(model: CustomModel) {
    return buildApiHandler(modelToLLMProvider(model));
}

/**
 * Build an ApiHandler from a LLMProvider config (legacy / internal path)
 */
export function buildApiHandler(config: LLMProvider) {
    const providerType = config.type;
    switch (providerType) {
        case 'anthropic':
            return new AnthropicProvider(config);
        case 'github-copilot':
            return new GitHubCopilotProvider(config);
        case 'kilo-gateway':
            return new KiloGatewayProvider(config);
        case 'bedrock':
            return new BedrockProvider(config);
        case 'chatgpt-oauth':
            return new ChatGptOAuthProvider(config);
        case 'openai':
        case 'gemini':
        case 'ollama':
        case 'lmstudio':
        case 'openrouter':
        case 'azure':
        case 'custom':
            return new OpenAiProvider(config);
        default: {
            const _exhaustive: never = providerType;
            throw new Error(`Unknown provider type: ${String(_exhaustive)}`);
        }
    }
}
