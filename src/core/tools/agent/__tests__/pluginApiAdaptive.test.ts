/**
 * Tests for pluginApiAdaptive helpers (FEAT-29-07 Task B).
 *
 * Three pure functions, every branch pinned:
 *   - classifyMethodIsWrite: read prefixes vs write
 *   - resolveTimeoutMs: per-plugin > default > fallback, clamped
 *   - recordApprovalAndMaybePromote: counter increment + threshold +
 *     heuristic + disabled-switch + already-promoted no-op
 */

import { describe, it, expect } from 'vitest';
import {
    classifyMethodIsWrite,
    resolveTimeoutMs,
    recordApprovalAndMaybePromote,
    approvalKey,
    DEFAULT_API_TIMEOUT_MS,
    MAX_API_TIMEOUT_MS,
    DEFAULT_AUTO_PROMOTION_THRESHOLD,
} from '../pluginApiAdaptive';
import type { PluginApiSettings } from '../../../../types/settings';

function pluginApiSettings(over: Partial<PluginApiSettings> = {}): PluginApiSettings {
    return {
        enabled: true,
        safeMethodOverrides: {},
        defaultTimeoutMs: DEFAULT_API_TIMEOUT_MS,
        pluginTimeoutMs: {},
        autoPromotionEnabled: true,
        autoPromotionThreshold: DEFAULT_AUTO_PROMOTION_THRESHOLD,
        approvalCounts: {},
        ...over,
    };
}

describe('classifyMethodIsWrite', () => {
    it('treats "get*" methods as read', () => {
        expect(classifyMethodIsWrite('getTasks')).toBe(false);
        expect(classifyMethodIsWrite('getPageInfo')).toBe(false);
        expect(classifyMethodIsWrite('get')).toBe(false);
    });

    it('treats "list*", "find*", "query*", "fetch*", "read*", "search*", "count*" as read', () => {
        expect(classifyMethodIsWrite('listPlugins')).toBe(false);
        expect(classifyMethodIsWrite('findByTag')).toBe(false);
        expect(classifyMethodIsWrite('query')).toBe(false);
        expect(classifyMethodIsWrite('fetchPage')).toBe(false);
        expect(classifyMethodIsWrite('readMetadata')).toBe(false);
        expect(classifyMethodIsWrite('search')).toBe(false);
        expect(classifyMethodIsWrite('countItems')).toBe(false);
    });

    it('treats "has*", "is*", "describe*" as read (predicates and introspection)', () => {
        expect(classifyMethodIsWrite('hasFile')).toBe(false);
        expect(classifyMethodIsWrite('isEnabled')).toBe(false);
        expect(classifyMethodIsWrite('describeSchema')).toBe(false);
    });

    it('treats other methods as write (default)', () => {
        expect(classifyMethodIsWrite('createPage')).toBe(true);
        expect(classifyMethodIsWrite('deleteFile')).toBe(true);
        expect(classifyMethodIsWrite('updateFrontmatter')).toBe(true);
        expect(classifyMethodIsWrite('mutateState')).toBe(true);
        expect(classifyMethodIsWrite('execute')).toBe(true);
    });

    it('does not over-match: "getter" alone is not "get*"', () => {
        // "getter" -- starts with "get" but followed by "t", which is lowercase.
        // Our regex requires the next char to be uppercase/digit/underscore OR
        // an s/es suffix OR end-of-string. "getter" stays a write.
        expect(classifyMethodIsWrite('getter')).toBe(true);
    });

    it('treats empty / non-string input as write (fail-safe)', () => {
        expect(classifyMethodIsWrite('')).toBe(true);
        // @ts-expect-error -- intentional misuse
        expect(classifyMethodIsWrite(undefined)).toBe(true);
        // @ts-expect-error -- intentional misuse
        expect(classifyMethodIsWrite(42)).toBe(true);
    });
});

describe('resolveTimeoutMs', () => {
    it('returns DEFAULT when settings is undefined', () => {
        expect(resolveTimeoutMs(undefined, 'dataview')).toBe(DEFAULT_API_TIMEOUT_MS);
    });

    it('returns defaultTimeoutMs when no per-plugin override', () => {
        const s = pluginApiSettings({ defaultTimeoutMs: 15_000 });
        expect(resolveTimeoutMs(s, 'dataview')).toBe(15_000);
    });

    it('returns per-plugin override when set', () => {
        const s = pluginApiSettings({
            defaultTimeoutMs: 10_000,
            pluginTimeoutMs: { dataview: 30_000 },
        });
        expect(resolveTimeoutMs(s, 'dataview')).toBe(30_000);
        // Other plugins still fall back to default
        expect(resolveTimeoutMs(s, 'omnisearch')).toBe(10_000);
    });

    it('clamps to MAX_API_TIMEOUT_MS (5 min)', () => {
        const s = pluginApiSettings({
            pluginTimeoutMs: { abuse: 999_999_999 },
        });
        expect(resolveTimeoutMs(s, 'abuse')).toBe(MAX_API_TIMEOUT_MS);
    });

    it('clamps to 1000 ms minimum', () => {
        const s = pluginApiSettings({
            pluginTimeoutMs: { tooFast: 50 },
        });
        expect(resolveTimeoutMs(s, 'tooFast')).toBe(1000);
    });

    it('treats invalid numbers as DEFAULT', () => {
        const s = pluginApiSettings({ defaultTimeoutMs: -1 });
        expect(resolveTimeoutMs(s, 'x')).toBe(DEFAULT_API_TIMEOUT_MS);
        const s2 = pluginApiSettings({ defaultTimeoutMs: NaN });
        expect(resolveTimeoutMs(s2, 'x')).toBe(DEFAULT_API_TIMEOUT_MS);
    });
});

describe('recordApprovalAndMaybePromote', () => {
    it('increments approval count on each call', () => {
        const s = pluginApiSettings();
        recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(s.approvalCounts!['dataview:getTasks']).toBe(2);
    });

    it('promotes a read-classified method on the 3rd approval (default threshold)', () => {
        const s = pluginApiSettings();
        let r = recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(r.promoted).toBe(false);
        expect(r.reason).toBe('below-threshold');
        r = recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(r.promoted).toBe(false);
        r = recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(r.promoted).toBe(true);
        expect(r.reason).toBe('promoted');
        expect(r.newCount).toBe(3);
        expect(s.safeMethodOverrides['dataview:getTasks']).toBe(true);
    });

    it('respects a custom threshold', () => {
        const s = pluginApiSettings({ autoPromotionThreshold: 5 });
        for (let i = 0; i < 4; i++) {
            const r = recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
            expect(r.promoted).toBe(false);
        }
        const r = recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(r.promoted).toBe(true);
        expect(r.newCount).toBe(5);
    });

    it('never promotes write-classified methods regardless of approvals', () => {
        const s = pluginApiSettings();
        for (let i = 0; i < 10; i++) {
            const r = recordApprovalAndMaybePromote(s, 'dataview', 'deleteFile');
            expect(r.promoted).toBe(false);
            expect(r.reason).toBe('write-method');
        }
        expect(s.safeMethodOverrides['dataview:deleteFile']).toBeUndefined();
    });

    it('returns disabled when autoPromotionEnabled is false', () => {
        const s = pluginApiSettings({ autoPromotionEnabled: false });
        const r = recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(r.promoted).toBe(false);
        expect(r.reason).toBe('disabled');
        expect(r.newCount).toBe(0);
        // Counts are NOT incremented when disabled (telemetry stops too).
        expect(s.approvalCounts?.['dataview:getTasks']).toBeUndefined();
    });

    it('no-ops when method is already promoted (keeps counting for the UI)', () => {
        const s = pluginApiSettings({
            safeMethodOverrides: { 'dataview:getTasks': true },
            approvalCounts: { 'dataview:getTasks': 3 },
        });
        const r = recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(r.promoted).toBe(false);
        expect(r.reason).toBe('already-promoted');
        expect(r.newCount).toBe(4);
        expect(s.safeMethodOverrides['dataview:getTasks']).toBe(true);
    });

    it('mutates settings in-place (caller persists once)', () => {
        const s = pluginApiSettings();
        const ref = s.approvalCounts;
        recordApprovalAndMaybePromote(s, 'dataview', 'getTasks');
        expect(s.approvalCounts).toBe(ref);
    });

    it('correct approvalKey format', () => {
        expect(approvalKey('dataview', 'getTasks')).toBe('dataview:getTasks');
    });

    it('AUDIT-EPIC-29 L-2: approvalKey rejects pluginId containing colon', () => {
        expect(() => approvalKey('foo:bar', 'baz')).toThrow(/Unsafe pluginId/i);
    });

    it('AUDIT-EPIC-29 L-2: approvalKey rejects method containing colon', () => {
        expect(() => approvalKey('foo', 'bar:baz')).toThrow(/Unsafe method/i);
    });

    it('AUDIT-EPIC-29 L-2: approvalKey rejects path-traversal in pluginId', () => {
        expect(() => approvalKey('../escape', 'getTasks')).toThrow(/Unsafe pluginId/i);
    });

    it('AUDIT-EPIC-29 L-4: recordApprovalAndMaybePromote silently skips unsafe input (no settings pollution)', () => {
        const s = pluginApiSettings();
        const before = JSON.stringify(s);
        const r = recordApprovalAndMaybePromote(s, '../escape', 'getTasks');
        expect(r.promoted).toBe(false);
        // No key was added to approvalCounts or safeMethodOverrides
        expect(JSON.stringify(s)).toBe(before);
    });

    it('AUDIT-EPIC-29 L-4: recordApprovalAndMaybePromote silently skips unsafe method', () => {
        const s = pluginApiSettings();
        const before = JSON.stringify(s);
        const r = recordApprovalAndMaybePromote(s, 'dataview', 'foo:bar');
        expect(r.promoted).toBe(false);
        expect(JSON.stringify(s)).toBe(before);
    });
});
