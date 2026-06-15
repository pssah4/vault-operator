/**
 * FEAT-26-07 -- settings-layer contract for the Bedrock API-Gateway auth mode.
 * Locks the additive shape of CustomModel/LLMProvider/ProviderConfig so a
 * future refactor cannot silently drop the gateway fields on the pass-through
 * from settings to the API handler.
 */

import { describe, it, expect } from 'vitest';
import { modelToLLMProvider } from '../settings';
import type { CustomModel } from '../settings';

function makeBedrockGatewayModel(overrides: Partial<CustomModel> = {}): CustomModel {
    return {
        name: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
        provider: 'bedrock',
        enabled: true,
        awsAuthMode: 'gateway',
        awsRegion: 'eu-central-1',
        baseUrl: 'https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock',
        gatewayHeaderName: 'Ocp-Apim-Subscription-Key',
        gatewayHeaderValue: 'secret-subscription-key',
        ...overrides,
    };
}

describe('modelToLLMProvider bedrock gateway pass-through (FEAT-26-07)', () => {
    it('forwards awsAuthMode=gateway verbatim', () => {
        const provider = modelToLLMProvider(makeBedrockGatewayModel());
        expect(provider.awsAuthMode).toBe('gateway');
    });

    it('forwards gatewayHeaderName and gatewayHeaderValue verbatim', () => {
        const provider = modelToLLMProvider(makeBedrockGatewayModel());
        expect(provider.gatewayHeaderName).toBe('Ocp-Apim-Subscription-Key');
        expect(provider.gatewayHeaderValue).toBe('secret-subscription-key');
    });

    it('keeps the gateway URL on baseUrl (no path mangling)', () => {
        const provider = modelToLLMProvider(makeBedrockGatewayModel());
        expect(provider.baseUrl).toBe(
            'https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock',
        );
    });

    it('keeps awsRegion separate from baseUrl (gateway mode does not parse region from URL)', () => {
        const provider = modelToLLMProvider(makeBedrockGatewayModel());
        expect(provider.awsRegion).toBe('eu-central-1');
    });

    it('still allows omitted gateway fields (model in non-gateway mode is unaffected)', () => {
        const provider = modelToLLMProvider({
            name: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
            provider: 'bedrock',
            enabled: true,
            awsAuthMode: 'api-key',
            awsRegion: 'eu-central-1',
            awsApiKey: 'aws-bearer-key',
        });
        expect(provider.awsAuthMode).toBe('api-key');
        expect(provider.gatewayHeaderName).toBeUndefined();
        expect(provider.gatewayHeaderValue).toBeUndefined();
    });
});
