/**
 * Live-Bug 2026-05-04: Settings shallow-merge ueberschreibt
 * Sub-Objekte komplett wenn der persistente data.json sie hat
 * (auch wenn neue Felder fehlen).
 *
 * Reproduziert den Bug: vaultIngest.topHubBlock fehlt -> Toggle
 * "Enable top-hub block" reagiert nicht (TypeError beim Click).
 *
 * Test exportiert die deepMergeSettings-Logik nicht direkt, aber
 * prueft das Verhalten via lokaler Re-Implementation. Eigentlicher
 * Code ist in main.ts.
 */

import { describe, it, expect } from 'vitest';

// Re-Implement der Funktion fuer den Test (main.ts importiert obsidian
// und kann nicht direkt importiert werden -- duplizieren ist hier OK).
function deepMergeSettings<T extends Record<string, unknown>>(defaults: T, saved: Partial<T>): T {
    if (!saved || typeof saved !== 'object') return { ...defaults };
    const merged = { ...defaults } as Record<string, unknown>;
    for (const [key, savedValue] of Object.entries(saved)) {
        const defaultValue = (defaults as Record<string, unknown>)[key];
        if (
            savedValue !== null
            && typeof savedValue === 'object'
            && !Array.isArray(savedValue)
            && defaultValue !== null
            && typeof defaultValue === 'object'
            && !Array.isArray(defaultValue)
        ) {
            merged[key] = deepMergeSettings(
                defaultValue as Record<string, unknown>,
                savedValue as Record<string, unknown>,
            );
        } else {
            merged[key] = savedValue;
        }
    }
    return merged as T;
}

describe('deepMergeSettings (Live-Bug 2026-05-04)', () => {
    it('preserves saved primitive values', () => {
        const r = deepMergeSettings({ a: 1, b: 'x' }, { a: 2 });
        expect(r).toEqual({ a: 2, b: 'x' });
    });

    it('REPRODUCES BUG: shallow merge would lose new sub-fields when saved has the parent object', () => {
        const defaults = {
            vaultIngest: {
                autoSummary: { enabled: false, writeFrontmatter: false },
                topHubBlock: { enabled: false, privacyAcknowledged: false }, // NEW field
            },
        };
        // Old saved data.json: vaultIngest exists but no topHubBlock key
        const saved = {
            vaultIngest: {
                autoSummary: { enabled: true, writeFrontmatter: false },
            },
        };
        const merged = deepMergeSettings(defaults, saved as typeof defaults);
        // The deep merge MUST preserve topHubBlock from defaults
        expect((merged.vaultIngest as Record<string, unknown>).topHubBlock).toEqual({
            enabled: false,
            privacyAcknowledged: false,
        });
        // And keep saved autoSummary
        expect((merged.vaultIngest as { autoSummary: { enabled: boolean } }).autoSummary.enabled).toBe(true);
    });

    it('saved sub-fields override defaults', () => {
        const r = deepMergeSettings(
            { memory: { crossSurface: { livingDocumentByDefault: true, strictSourceIsolation: false } } },
            { memory: { crossSurface: { strictSourceIsolation: true } } } as Record<string, unknown>,
        );
        expect(r).toEqual({
            memory: {
                crossSurface: {
                    livingDocumentByDefault: true,
                    strictSourceIsolation: true,
                },
            },
        });
    });

    it('arrays from saved replace arrays from defaults (no element merge)', () => {
        const r = deepMergeSettings({ list: [1, 2, 3] }, { list: [9] });
        expect(r.list).toEqual([9]);
    });

    it('null in saved replaces object in defaults', () => {
        const r = deepMergeSettings({ x: { a: 1 } }, { x: null } as Record<string, unknown>);
        expect(r.x).toBeNull();
    });

    it('handles empty saved input', () => {
        const r = deepMergeSettings({ a: 1, b: { c: 2 } }, {});
        expect(r).toEqual({ a: 1, b: { c: 2 } });
    });

    it('handles deeply nested objects (3 levels)', () => {
        const r = deepMergeSettings(
            { l1: { l2: { l3: { keep: 'default', overridden: 'default' } } } },
            { l1: { l2: { l3: { overridden: 'saved', added: 'saved' } } } } as Record<string, unknown>,
        );
        expect((r.l1 as Record<string, unknown>).l2).toEqual({
            l3: { keep: 'default', overridden: 'saved', added: 'saved' },
        });
    });
});
