import { describe, it, expect } from 'vitest';
import {
    SOURCE_INTERFACES,
    validateSourceInterface,
    resolveSyncMode,
    DEFAULT_CROSS_SURFACE_SETTINGS,
} from '../SourceInterface';
import type { CrossSurfaceSettings } from '../SourceInterface';

describe('SourceInterface (BA-26 / ADR-108)', () => {
    describe('validateSourceInterface', () => {
        it('accepts every value in the whitelist', () => {
            for (const v of SOURCE_INTERFACES) {
                expect(validateSourceInterface(v)).toBe(v);
            }
        });

        it('falls back to "unknown" for non-string input', () => {
            expect(validateSourceInterface(undefined)).toBe('unknown');
            expect(validateSourceInterface(null)).toBe('unknown');
            expect(validateSourceInterface(42)).toBe('unknown');
            expect(validateSourceInterface({})).toBe('unknown');
        });

        it('falls back to "unknown" for unknown strings', () => {
            expect(validateSourceInterface('chatgpt-plus')).toBe('unknown');
            expect(validateSourceInterface('CLAUDE-AI')).toBe('unknown'); // case-sensitive
            expect(validateSourceInterface('')).toBe('unknown');
        });
    });

    describe('resolveSyncMode', () => {
        it('default settings: claude-ai/claude-code resolve to auto, chatgpt/perplexity/unknown to manual', () => {
            const s = DEFAULT_CROSS_SURFACE_SETTINGS;
            expect(resolveSyncMode('claude-ai', s)).toBe('auto');
            expect(resolveSyncMode('claude-code', s)).toBe('auto');
            expect(resolveSyncMode('obsilo', s)).toBe('auto');
            expect(resolveSyncMode('chatgpt', s)).toBe('manual');
            expect(resolveSyncMode('perplexity', s)).toBe('manual');
            expect(resolveSyncMode('unknown', s)).toBe('manual');
        });

        it('per-provider override beats global default', () => {
            const s: CrossSurfaceSettings = {
                defaultSyncMode: 'manual',
                perProvider: { 'chatgpt': 'auto' },
            };
            expect(resolveSyncMode('chatgpt', s)).toBe('auto');
            // unset providers fall through to global
            expect(resolveSyncMode('claude-ai', s)).toBe('manual');
        });

        it('"global" override falls through to default', () => {
            const s: CrossSurfaceSettings = {
                defaultSyncMode: 'auto',
                perProvider: { 'chatgpt': 'global' },
            };
            expect(resolveSyncMode('chatgpt', s)).toBe('auto');
        });

        it('changing global default flips all "global" providers', () => {
            const s1: CrossSurfaceSettings = {
                defaultSyncMode: 'auto',
                perProvider: { 'claude-ai': 'global', 'chatgpt': 'manual' },
            };
            const s2: CrossSurfaceSettings = {
                defaultSyncMode: 'manual',
                perProvider: { 'claude-ai': 'global', 'chatgpt': 'manual' },
            };
            expect(resolveSyncMode('claude-ai', s1)).toBe('auto');
            expect(resolveSyncMode('claude-ai', s2)).toBe('manual');
            // explicit override stays
            expect(resolveSyncMode('chatgpt', s1)).toBe('manual');
            expect(resolveSyncMode('chatgpt', s2)).toBe('manual');
        });
    });
});
