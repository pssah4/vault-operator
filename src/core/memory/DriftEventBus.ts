/**
 * DriftEventBus -- minimal pub-sub for topic-drift signalling between
 * the read side (ContextComposer) and the write side (FactExtractor /
 * ExtractionQueue).
 *
 * ContextComposer emits when it detects mid-conversation drift; the
 * extractor subscribes and schedules a re-extract job that bypasses
 * the standard 60s throttle. ExtractionQueue / SingleCallExtractor in
 * turn can emit when they discover a brand-new topic that the read
 * side should pick up next turn.
 *
 * This is a deliberately tiny bus -- no priorities, no async error
 * handling, no event types beyond `drift`. Phase 4 only needs the
 * one channel; if more event categories appear later we promote it
 * to a typed dispatcher.
 *
 * No obsidian, no plugin globals -- engine-public, ADR-080.
 *
 * FEATURE-0318 / PLAN-007 task A.5.
 */

export interface DriftEvent {
    sessionId: string;
    previousTopic: string | null;
    newTopic: string | null;
    /** Cosine score against the new topic centroid (0 when no match). */
    score: number;
    /** Source of the event. */
    source: 'context-composer' | 'fact-extractor';
    timestamp: string;
}

export type DriftHandler = (event: DriftEvent) => void;

export class DriftEventBus {
    private readonly handlers: Set<DriftHandler> = new Set();

    /** Register a handler. Returns an unsubscribe function. */
    subscribe(handler: DriftHandler): () => void {
        this.handlers.add(handler);
        return () => this.handlers.delete(handler);
    }

    /** Fire a drift event to every handler. Errors are isolated per handler. */
    emit(event: DriftEvent): void {
        for (const handler of this.handlers) {
            try {
                handler(event);
            } catch (e) {
                console.warn('[DriftEventBus] handler threw, suppressed:', e);
            }
        }
    }

    /** Diagnostics. */
    handlerCount(): number {
        return this.handlers.size;
    }

    /** Drop all handlers. Used on plugin unload. */
    clear(): void {
        this.handlers.clear();
    }
}
