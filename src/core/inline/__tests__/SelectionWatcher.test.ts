import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelectionWatcher } from '../SelectionWatcher';

interface FakeTarget {
    listeners: Map<string, EventListener[]>;
    addEventListener: (t: string, h: EventListener) => void;
    removeEventListener: (t: string, h: EventListener) => void;
    dispatch: (t: string, ev: unknown) => void;
    defaultView: { getSelection: () => { toString: () => string } | null };
    ownerDocument: { defaultView: { getSelection: () => { toString: () => string } | null } };
}

function makeTarget(selectionText: () => string): FakeTarget {
    const listeners = new Map<string, EventListener[]>();
    const target: FakeTarget = {
        listeners,
        addEventListener: (t, h) => {
            const arr = listeners.get(t) ?? [];
            arr.push(h);
            listeners.set(t, arr);
        },
        removeEventListener: (t, h) => {
            const arr = listeners.get(t) ?? [];
            const idx = arr.indexOf(h);
            if (idx >= 0) arr.splice(idx, 1);
        },
        dispatch: (t, ev) => { for (const h of listeners.get(t) ?? []) h(ev as Event); },
        defaultView: { getSelection: () => ({ toString: selectionText }) },
        ownerDocument: { defaultView: { getSelection: () => ({ toString: selectionText }) } } as any,
    };
    return target;
}

describe('SelectionWatcher', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('fires onSettled after debounce when selection length >= minLength', () => {
        const onSettled = vi.fn();
        const target = makeTarget(() => 'hello');
        const w = new SelectionWatcher({ target: target as any, onSettled, minLength: 2, debounceMs: 100 });
        w.start();
        target.dispatch('mouseup', {});
        expect(onSettled).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire when selection is too short', () => {
        const onSettled = vi.fn();
        const target = makeTarget(() => 'a');
        const w = new SelectionWatcher({ target: target as any, onSettled, minLength: 2, debounceMs: 50 });
        w.start();
        target.dispatch('mouseup', {});
        vi.advanceTimersByTime(50);
        expect(onSettled).not.toHaveBeenCalled();
    });

    it('does NOT fire when isEnabled returns false', () => {
        const onSettled = vi.fn();
        const target = makeTarget(() => 'hello');
        const w = new SelectionWatcher({ target: target as any, onSettled, isEnabled: () => false, debounceMs: 50 });
        w.start();
        target.dispatch('mouseup', {});
        vi.advanceTimersByTime(50);
        expect(onSettled).not.toHaveBeenCalled();
    });

    it('debounces multiple events into a single fire', () => {
        const onSettled = vi.fn();
        const target = makeTarget(() => 'hello');
        const w = new SelectionWatcher({ target: target as any, onSettled, debounceMs: 100 });
        w.start();
        target.dispatch('mouseup', {});
        vi.advanceTimersByTime(50);
        target.dispatch('mouseup', {});
        vi.advanceTimersByTime(50);
        target.dispatch('mouseup', {});
        vi.advanceTimersByTime(100);
        expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('arrow keys also trigger debounce', () => {
        const onSettled = vi.fn();
        const target = makeTarget(() => 'hello');
        const w = new SelectionWatcher({ target: target as any, onSettled, debounceMs: 50 });
        w.start();
        target.dispatch('keyup', { key: 'ArrowRight' });
        vi.advanceTimersByTime(50);
        expect(onSettled).toHaveBeenCalledTimes(1);
    });

    it('non-arrow keys do NOT trigger', () => {
        const onSettled = vi.fn();
        const target = makeTarget(() => 'hello');
        const w = new SelectionWatcher({ target: target as any, onSettled, debounceMs: 50 });
        w.start();
        target.dispatch('keyup', { key: 'a' });
        vi.advanceTimersByTime(50);
        expect(onSettled).not.toHaveBeenCalled();
    });

    it('stop() removes listeners and pending timers', () => {
        const onSettled = vi.fn();
        const target = makeTarget(() => 'hello');
        const w = new SelectionWatcher({ target: target as any, onSettled, debounceMs: 50 });
        w.start();
        target.dispatch('mouseup', {});
        w.stop();
        vi.advanceTimersByTime(100);
        expect(onSettled).not.toHaveBeenCalled();
        target.dispatch('mouseup', {});
        vi.advanceTimersByTime(50);
        expect(onSettled).not.toHaveBeenCalled();
    });

    it('start() is idempotent', () => {
        const target = makeTarget(() => 'hi');
        const w = new SelectionWatcher({ target: target as any, onSettled: vi.fn() });
        w.start();
        w.start();
        expect(target.listeners.get('mouseup')?.length).toBe(1);
    });
});
