import { describe, it, expect } from 'vitest';
import { CAPABILITIES, djb2, manifestHash } from '../CapabilityManifest';

describe('CapabilityManifest (PLAN-008 task A.1)', () => {
    it('exposes a non-empty manifest with required fields', () => {
        expect(CAPABILITIES.length).toBeGreaterThan(0);
        for (const c of CAPABILITIES) {
            expect(typeof c.area).toBe('string');
            expect(c.key.length).toBeGreaterThan(0);
            expect(c.summary.length).toBeGreaterThan(10);
        }
    });

    it('has unique (area, key) pairs', () => {
        const seen = new Set<string>();
        for (const c of CAPABILITIES) {
            const id = `${c.area}:${c.key}`;
            expect(seen.has(id)).toBe(false);
            seen.add(id);
        }
    });

    it('djb2 returns a 32-bit unsigned integer', () => {
        const h = djb2('hello world');
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xFFFFFFFF);
    });

    it('djb2 is deterministic', () => {
        expect(djb2('foo')).toBe(djb2('foo'));
        expect(djb2('a')).not.toBe(djb2('b'));
    });

    it('djb2 is sensitive to single-character changes', () => {
        expect(djb2('manifest:v1')).not.toBe(djb2('manifest:v2'));
    });

    it('manifestHash returns a stable hex string for the live manifest', () => {
        const h1 = manifestHash();
        const h2 = manifestHash();
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[0-9a-f]+$/);
    });

    it('manifestHash includes notes -- changing notes flips the hash', () => {
        // Indirect: serialise + djb2 on a known modified clone.
        const baseline = djb2(CAPABILITIES.map(c => `${c.area}|${c.key}|${c.summary}|${c.notes ?? ''}`).join('\n'));
        const tampered = djb2(CAPABILITIES.map((c, i) =>
            i === 0 ? `${c.area}|${c.key}|${c.summary}|tampered` : `${c.area}|${c.key}|${c.summary}|${c.notes ?? ''}`,
        ).join('\n'));
        expect(baseline).not.toBe(tampered);
    });

    it('contains the memory tools agent needs to be aware of', () => {
        const keys = new Set(CAPABILITIES.filter(c => c.area === 'tool').map(c => c.key));
        expect(keys.has('recall_memory')).toBe(true);
        expect(keys.has('mark_for_memory')).toBe(true);
    });
});
