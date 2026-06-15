/**
 * SSRF guard contract for provider baseUrl / endpoint values
 * (AUDIT-037 H-1, H-2).
 *
 * Locks the allow-list, blocked-host set and local-IP detection so a future
 * refactor cannot silently re-open the SSRF surface.
 */

import { describe, it, expect } from 'vitest';
import { validateProviderUrl, isPrivateIpHostname, isLocalHostname } from '../providerUrlGuard';

describe('validateProviderUrl', () => {
    describe('happy paths (allow-listed cloud providers)', () => {
        it('accepts api.openai.com for openai', () => {
            expect(() => validateProviderUrl('openai', 'https://api.openai.com/v1')).not.toThrow();
        });
        it('accepts api.anthropic.com for anthropic', () => {
            expect(() => validateProviderUrl('anthropic', 'https://api.anthropic.com')).not.toThrow();
        });
        it('accepts openrouter.ai for openrouter', () => {
            expect(() => validateProviderUrl('openrouter', 'https://openrouter.ai/api/v1')).not.toThrow();
        });
        it('accepts generativelanguage.googleapis.com for gemini', () => {
            expect(() => validateProviderUrl('gemini', 'https://generativelanguage.googleapis.com')).not.toThrow();
        });
        it('accepts a regional bedrock-runtime endpoint', () => {
            expect(() => validateProviderUrl('bedrock', 'https://bedrock-runtime.eu-central-1.amazonaws.com')).not.toThrow();
            expect(() => validateProviderUrl('bedrock', 'https://bedrock.us-east-1.amazonaws.com')).not.toThrow();
        });
        // Permissive policy for OpenAI-compatible types: a user pointing
        // type=openai at DeepSeek / Together / Groq must keep working.
        it('accepts api.deepseek.com when openai is used as a generic OpenAI-compatible alias', () => {
            expect(() => validateProviderUrl('openai', 'https://api.deepseek.com')).not.toThrow();
        });
        it('accepts api.groq.com on openai-type config', () => {
            expect(() => validateProviderUrl('openai', 'https://api.groq.com/openai/v1')).not.toThrow();
        });
        it('requires HTTPS for permissive cloud types', () => {
            expect(() => validateProviderUrl('openai', 'http://api.example.com')).toThrow(/HTTPS/);
        });
    });

    describe('local-by-design providers', () => {
        it('allows localhost for ollama', () => {
            expect(() => validateProviderUrl('ollama', 'http://localhost:11434')).not.toThrow();
        });
        it('allows 127.0.0.1 for lmstudio', () => {
            expect(() => validateProviderUrl('lmstudio', 'http://127.0.0.1:1234/v1')).not.toThrow();
        });
        it('allows 10.0.0.5 for ollama', () => {
            expect(() => validateProviderUrl('ollama', 'http://10.0.0.5:11434')).not.toThrow();
        });
    });

    describe('SSRF blocks for cloud providers', () => {
        it('refuses 127.0.0.1 on openai (impersonation of api.openai.com)', () => {
            expect(() => validateProviderUrl('openai', 'http://127.0.0.1:8080/v1')).toThrow(/local or private/);
        });
        it('refuses 10.0.0.5 on openai', () => {
            expect(() => validateProviderUrl('openai', 'http://10.0.0.5/v1')).toThrow(/local or private/);
        });
        it('refuses 192.168.x.y on bedrock', () => {
            expect(() => validateProviderUrl('bedrock', 'https://192.168.1.10/bedrock')).toThrow(/local or private/);
        });
        it('refuses 169.254.169.254 (AWS IMDS) on every provider type', () => {
            for (const t of ['openai', 'bedrock', 'anthropic', 'custom', 'ollama']) {
                expect(() => validateProviderUrl(t, 'http://169.254.169.254/latest/meta-data/'),
                    `provider type "${t}" must refuse AWS IMDS`).toThrow();
            }
        });
        it('refuses metadata.google.internal everywhere', () => {
            expect(() => validateProviderUrl('custom', 'http://metadata.google.internal')).toThrow(/metadata/);
        });
        it('refuses a non-allow-listed host for bedrock', () => {
            expect(() => validateProviderUrl('bedrock', 'https://attacker.example/bedrock')).toThrow(/allow-list/);
        });
        it('refuses non-amazonaws-host for bedrock even if it contains amazonaws', () => {
            expect(() => validateProviderUrl('bedrock', 'https://amazonaws.com.attacker.example')).toThrow(/allow-list/);
        });
    });

    describe('custom provider type', () => {
        it('allows any HTTPS host', () => {
            expect(() => validateProviderUrl('custom', 'https://api.example.com/v1')).not.toThrow();
        });
        it('allows http://localhost for self-hosted gateways (opencode go etc)', () => {
            expect(() => validateProviderUrl('custom', 'http://localhost:1234/v1')).not.toThrow();
        });
        it('refuses HTTP to a non-loopback host', () => {
            expect(() => validateProviderUrl('custom', 'http://api.example.com/v1')).toThrow(/HTTPS/);
        });
        it('still refuses AWS IMDS', () => {
            expect(() => validateProviderUrl('custom', 'http://169.254.169.254')).toThrow();
        });
    });

    describe('bedrock gatewayMode (FEAT-26-07)', () => {
        it('accepts an enterprise APIM host like enbw-az.cloud when gatewayMode is true', () => {
            expect(() =>
                validateProviderUrl(
                    'bedrock',
                    'https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock',
                    { gatewayMode: true },
                ),
            ).not.toThrow();
        });
        it('accepts a generic Azure APIM host when gatewayMode is true', () => {
            expect(() =>
                validateProviderUrl('bedrock', 'https://apimgmt-x-prd.azure-api.net/anthropic', { gatewayMode: true }),
            ).not.toThrow();
        });
        it('still rejects plain HTTP in gatewayMode (no plaintext keys off-box)', () => {
            expect(() =>
                validateProviderUrl('bedrock', 'http://gateway.example.com/bedrock', { gatewayMode: true }),
            ).toThrow(/HTTPS/);
        });
        it('still rejects AWS IMDS in gatewayMode', () => {
            expect(() =>
                validateProviderUrl('bedrock', 'https://169.254.169.254/bedrock', { gatewayMode: true }),
            ).toThrow();
        });
        it('still rejects RFC1918 private IPs in gatewayMode', () => {
            expect(() =>
                validateProviderUrl('bedrock', 'https://10.0.0.5/bedrock', { gatewayMode: true }),
            ).toThrow(/local or private/);
        });
        it('still rejects metadata.google.internal in gatewayMode', () => {
            expect(() =>
                validateProviderUrl('bedrock', 'https://metadata.google.internal/bedrock', { gatewayMode: true }),
            ).toThrow(/metadata/);
        });
        it('regression: without gatewayMode, enbw-az.cloud still fails the strict bedrock allow-list', () => {
            expect(() =>
                validateProviderUrl(
                    'bedrock',
                    'https://gateway.integration-apihub.enbw-az.cloud/genai/cowork/bedrock',
                ),
            ).toThrow(/allow-list/);
        });
    });

    describe('malformed input', () => {
        it('throws on garbage URL', () => {
            expect(() => validateProviderUrl('openai', 'not a url')).toThrow(/not a valid URL/);
        });
        it('throws on ftp:// scheme', () => {
            expect(() => validateProviderUrl('openai', 'ftp://api.openai.com')).toThrow(/http\(s\)/);
        });
        it('passes undefined and empty string through unchanged', () => {
            expect(validateProviderUrl('openai', undefined)).toBeUndefined();
            expect(validateProviderUrl('openai', '')).toBeUndefined();
            expect(validateProviderUrl('openai', '   ')).toBeUndefined();
        });
    });
});

describe('isLocalHostname / isPrivateIpHostname (white-box)', () => {
    it('catches loopback IPv4 + IPv6 + localhost names', () => {
        expect(isLocalHostname('localhost')).toBe(true);
        expect(isLocalHostname('127.0.0.1')).toBe(true);
        expect(isLocalHostname('::1')).toBe(true);
        expect(isLocalHostname('mac.local')).toBe(true);
        expect(isLocalHostname('foo.localhost')).toBe(true);
    });
    it('catches every RFC 1918 + link-local + AWS IMDS + CGNAT range', () => {
        expect(isPrivateIpHostname('10.0.0.1')).toBe(true);
        expect(isPrivateIpHostname('172.16.0.1')).toBe(true);
        expect(isPrivateIpHostname('172.31.255.254')).toBe(true);
        expect(isPrivateIpHostname('192.168.1.1')).toBe(true);
        expect(isPrivateIpHostname('169.254.169.254')).toBe(true);
        expect(isPrivateIpHostname('100.64.0.1')).toBe(true);
        expect(isPrivateIpHostname('0.0.0.0')).toBe(true);
    });
    it('does NOT match public IPs', () => {
        expect(isPrivateIpHostname('8.8.8.8')).toBe(false);
        expect(isPrivateIpHostname('1.1.1.1')).toBe(false);
        expect(isPrivateIpHostname('172.32.0.1')).toBe(false); // just outside 172.16/12
        expect(isPrivateIpHostname('11.0.0.1')).toBe(false);   // just outside 10/8
    });
});
