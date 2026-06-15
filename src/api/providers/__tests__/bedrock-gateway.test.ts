/**
 * FEAT-26-07 -- Bedrock-gateway auth mode.
 *
 * Two layers under test:
 *   1. The pure header-transform helper `applyGatewayHeaderTransform` --
 *      replaces AWS-signing headers with the configured custom header.
 *   2. The provider constructor wiring -- in gateway mode it must accept a
 *      non-AWS HTTPS endpoint, validate the required fields, and register a
 *      finalizeRequest middleware on the BedrockRuntimeClient.
 */

import { describe, it, expect } from 'vitest';
import { BedrockProvider, applyGatewayHeaderTransform } from '../bedrock';
import type { LLMProvider } from '../../../types/settings';

function makeGatewayConfig(overrides: Partial<LLMProvider> = {}): LLMProvider {
    return {
        type: 'bedrock',
        model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
        awsAuthMode: 'gateway',
        awsRegion: 'eu-central-1',
        baseUrl: 'https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock',
        gatewayHeaderName: 'Ocp-Apim-Subscription-Key',
        gatewayHeaderValue: 'super-secret-subscription-key',
        ...overrides,
    } as LLMProvider;
}

describe('applyGatewayHeaderTransform (FEAT-26-07 pure helper)', () => {
    it('replaces Authorization with the configured custom header', () => {
        const headers: Record<string, string> = {
            authorization: 'AWS4-HMAC-SHA256 Credential=AKIA.../...',
            'content-type': 'application/json',
        };
        applyGatewayHeaderTransform({ headers }, 'Ocp-Apim-Subscription-Key', 'key123');
        expect(headers).not.toHaveProperty('authorization');
        expect(headers).not.toHaveProperty('Authorization');
        expect(headers['Ocp-Apim-Subscription-Key']).toBe('key123');
        expect(headers['content-type']).toBe('application/json');
    });

    it('strips every x-amz-* header (case-insensitive)', () => {
        const headers: Record<string, string> = {
            'x-amz-date': '20260615T120000Z',
            'X-Amz-Security-Token': 'session-token',
            'x-amz-content-sha256': 'abc',
            'X-Amz-Target': 'BedrockRuntime.ConverseStream',
            'content-type': 'application/json',
        };
        applyGatewayHeaderTransform({ headers }, 'api-key', 'k');
        for (const key of Object.keys(headers)) {
            expect(key.toLowerCase().startsWith('x-amz-')).toBe(false);
        }
        expect(headers['api-key']).toBe('k');
        expect(headers['content-type']).toBe('application/json');
    });

    it('leaves non-AWS headers untouched', () => {
        const headers: Record<string, string> = {
            accept: 'application/json',
            'user-agent': 'vault-operator/x.y.z',
        };
        applyGatewayHeaderTransform({ headers }, 'X-API-Key', 'k');
        expect(headers.accept).toBe('application/json');
        expect(headers['user-agent']).toBe('vault-operator/x.y.z');
    });
});

describe('BedrockProvider constructor in gateway mode (FEAT-26-07)', () => {
    it('accepts a non-AWS HTTPS endpoint when awsAuthMode is gateway', () => {
        expect(() => new BedrockProvider(makeGatewayConfig())).not.toThrow();
    });

    it('throws when gatewayHeaderValue is missing', () => {
        expect(() => new BedrockProvider(makeGatewayConfig({ gatewayHeaderValue: '' }))).toThrow(
            /gateway/i,
        );
        expect(() =>
            new BedrockProvider(makeGatewayConfig({ gatewayHeaderValue: undefined as unknown as string })),
        ).toThrow(/gateway/i);
    });

    it('defaults gatewayHeaderName to Ocp-Apim-Subscription-Key when omitted', () => {
        // Implementation defaults the header name at construction time;
        // missing-value still throws (see above), missing-name is fine.
        expect(() =>
            new BedrockProvider(makeGatewayConfig({ gatewayHeaderName: undefined as unknown as string })),
        ).not.toThrow();
    });

    it('throws when awsRegion is missing -- region is required for the SDK client', () => {
        expect(() => new BedrockProvider(makeGatewayConfig({ awsRegion: '' }))).toThrow(/awsRegion/i);
    });

    it('rejects a baseUrl that is plain HTTP (gateway URL guard enforces HTTPS)', () => {
        expect(() =>
            new BedrockProvider(
                makeGatewayConfig({ baseUrl: 'http://gateway.integration-apihub.enbw-az.cloud/bedrock' }),
            ),
        ).toThrow(/HTTPS/);
    });

    it('rejects an AWS IMDS baseUrl even in gateway mode', () => {
        expect(() =>
            new BedrockProvider(makeGatewayConfig({ baseUrl: 'https://169.254.169.254/bedrock' })),
        ).toThrow();
    });

    it('registers a finalizeRequest middleware so the SDK does not sign with AWS', () => {
        const provider = new BedrockProvider(makeGatewayConfig());
        const stack = (provider as unknown as {
            client: { middlewareStack: { identify: () => string[] } };
        }).client.middlewareStack;
        const identified = stack.identify();
        // The middleware name we wire in -- locks the registration so a refactor
        // cannot silently drop the AWS-signing replacement.
        expect(identified.some((entry) => entry.includes('vault-operator-gateway-auth'))).toBe(true);
    });

    // Regression: api-key and access-key paths still construct cleanly.
    it('regression: awsAuthMode=api-key still works with awsApiKey', () => {
        expect(
            () =>
                new BedrockProvider({
                    type: 'bedrock',
                    model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
                    awsAuthMode: 'api-key',
                    awsRegion: 'eu-central-1',
                    awsApiKey: 'aws-bearer-key',
                } as LLMProvider),
        ).not.toThrow();
    });

    it('regression: awsAuthMode=access-key still works with accessKey + secretKey', () => {
        expect(
            () =>
                new BedrockProvider({
                    type: 'bedrock',
                    model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
                    awsAuthMode: 'access-key',
                    awsRegion: 'eu-central-1',
                    awsAccessKey: 'AKIA',
                    awsSecretKey: 'secret',
                } as LLMProvider),
        ).not.toThrow();
    });
});
