import { describe, it, expect } from 'vitest';
import { withTimeout, TimeoutError } from '../withTimeout';

/**
 * FEAT-32-03 PR 3.1: discoverSkills() must not block the AgentTask loop when
 * the user vault contains a haengende plugin-skill folder. `withTimeout`
 * gives a hard ceiling on any single async operation.
 */
describe('withTimeout (FEAT-32-03 PR 3.1)', () => {
    it('resolves with the value when the promise wins the race', async () => {
        const value = await withTimeout(Promise.resolve(42), 500, 'test');
        expect(value).toBe(42);
    });

    it('throws TimeoutError when the timeout wins the race', async () => {
        const slow = new Promise<number>((resolve) => setTimeout(() => resolve(1), 100));
        await expect(withTimeout(slow, 10, 'slow op')).rejects.toBeInstanceOf(TimeoutError);
    });

    it('TimeoutError carries the label in its message', async () => {
        const slow = new Promise<void>(() => undefined);
        await expect(withTimeout(slow, 10, 'discoverSkills'))
            .rejects.toThrowError(/discoverSkills/);
    });

    it('rejects with the original error when the promise rejects fast', async () => {
        const failing = Promise.reject(new Error('underlying failure'));
        await expect(withTimeout(failing, 500, 'op')).rejects.toThrowError('underlying failure');
    });
});
