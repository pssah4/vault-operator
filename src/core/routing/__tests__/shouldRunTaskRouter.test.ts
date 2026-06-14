import { describe, it, expect } from 'vitest';
import { shouldRunTaskRouter } from '../TaskRouter';

/**
 * shouldRunTaskRouter gate (issue #44).
 *
 * The TaskRouter only runs for the top-level task (depth 0) AND only when
 * no manual model override is active. A manual chat-header model pick is a
 * hard override: VO manual override > TaskRouter auto-routing. Without this
 * gate, a short/simple prompt under a manual override was silently swapped
 * onto the helper (budget) model, defeating the user's explicit choice.
 */
describe('shouldRunTaskRouter', () => {
    it('runs for the top-level task when no override is active', () => {
        expect(shouldRunTaskRouter(0, false)).toBe(true);
    });

    it('does NOT run when a manual model override is active (issue #44)', () => {
        // The reported bug: a manual pick + a short/simple prompt must not
        // be re-routed onto the helper/budget model.
        expect(shouldRunTaskRouter(0, true)).toBe(false);
    });

    it('never runs for subtasks regardless of the override flag', () => {
        expect(shouldRunTaskRouter(1, false)).toBe(false);
        expect(shouldRunTaskRouter(1, true)).toBe(false);
        expect(shouldRunTaskRouter(2, false)).toBe(false);
    });
});
