import { describe, it, expect, vi } from 'vitest';
import { DriftEventBus, type DriftEvent } from '../DriftEventBus';

const event: DriftEvent = {
    sessionId: 'sess-1',
    previousTopic: 'coding',
    newTopic: 'cooking',
    score: 0.82,
    source: 'context-composer',
    timestamp: '2026-04-28T12:00:00Z',
};

describe('DriftEventBus (PLAN-007 task A.5)', () => {
    it('starts with zero handlers', () => {
        expect(new DriftEventBus().handlerCount()).toBe(0);
    });

    it('subscribe / emit delivers the event to every handler', () => {
        const bus = new DriftEventBus();
        const a = vi.fn();
        const b = vi.fn();
        bus.subscribe(a);
        bus.subscribe(b);
        bus.emit(event);
        expect(a).toHaveBeenCalledWith(event);
        expect(b).toHaveBeenCalledWith(event);
    });

    it('unsubscribe via returned function removes the handler', () => {
        const bus = new DriftEventBus();
        const handler = vi.fn();
        const off = bus.subscribe(handler);
        bus.emit(event);
        off();
        bus.emit(event);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('isolates a throwing handler -- others still fire', () => {
        const bus = new DriftEventBus();
        const bad = vi.fn(() => { throw new Error('boom'); });
        const good = vi.fn();
        bus.subscribe(bad);
        bus.subscribe(good);
        bus.emit(event);
        expect(bad).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
    });

    it('clear() drops all handlers', () => {
        const bus = new DriftEventBus();
        bus.subscribe(() => undefined);
        bus.subscribe(() => undefined);
        bus.clear();
        expect(bus.handlerCount()).toBe(0);
    });
});
