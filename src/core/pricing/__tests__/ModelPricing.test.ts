import { describe, it, expect } from 'vitest';
import { computeCost, formatEur, getModelPrice } from '../ModelPricing';

describe('ModelPricing', () => {
    it('matches exact model id case-insensitively', () => {
        const price = getModelPrice('claude-sonnet-4-6');
        expect(price.inputPerMillionUsd).toBe(3);
        expect(price.outputPerMillionUsd).toBe(15);
    });

    it('falls back to longest substring match', () => {
        const price = getModelPrice('claude-sonnet-4-6-20251101');
        expect(price.inputPerMillionUsd).toBe(3);
    });

    it('returns Haiku pricing for haiku models', () => {
        const price = getModelPrice('claude-haiku-4-5-20251001');
        expect(price.inputPerMillionUsd).toBe(1);
        expect(price.outputPerMillionUsd).toBe(5);
    });

    it('falls back gracefully for unknown models', () => {
        const price = getModelPrice('some-future-model');
        expect(price.inputPerMillionUsd).toBeGreaterThan(0);
    });

    it('computes total cost with cache rates', () => {
        const cost = computeCost('claude-sonnet-4-6', 100_000, 10_000, 50_000, 0);
        // input: 100k * 3$/M = $0.30
        // output: 10k * 15$/M = $0.15
        // cache read: 50k * 0.3$/M = $0.015
        // total USD: 0.465, EUR: ~0.432
        expect(cost.totalUsd).toBeCloseTo(0.465, 2);
        expect(cost.totalEur).toBeCloseTo(0.432, 2);
    });

    it('formats sub-cent amounts', () => {
        expect(formatEur(0.005)).toBe('<1¢');
    });

    it('formats cents with one decimal', () => {
        expect(formatEur(0.042)).toBe('4.2¢');
    });

    it('formats euros above one with two decimals', () => {
        expect(formatEur(1.234)).toBe('1.23€');
    });

    it('does not show free for zero', () => {
        expect(formatEur(0)).toBe('<1¢');
    });
});
