/**
 * InlineToSidebarTransferService contract tests (FEAT-33-12).
 *
 * Verifies the four reachable outcomes:
 *   ok                            inline idle + sidebar idle
 *   inline-busy                   inline still streaming
 *   sidebar-busy                  sidebar currently streaming
 *   no-sidebar                    activateView could not surface a leaf
 *
 * Plus: importConversation receives the snapshot verbatim, the
 * onTransferred hook fires only on success, and the notify channel
 * carries human-readable messages tailored to the reason.
 */

import { describe, it, expect, vi } from 'vitest';
import { InlineToSidebarTransferService } from '../InlineToSidebarTransferService';

interface FakeSidebar {
    isBusy: boolean;
    importConversation: ReturnType<typeof vi.fn>;
}

function buildFakeSidebar(opts: { busy?: boolean } = {}): FakeSidebar {
    return {
        isBusy: opts.busy === true,
        importConversation: vi.fn().mockResolvedValue(undefined),
    };
}

function buildFakePlugin(opts: { sidebar?: FakeSidebar | null; activateOk?: boolean } = {}): unknown {
    const sidebar = opts.sidebar === undefined ? buildFakeSidebar() : opts.sidebar;
    return {
        activateView: vi.fn(async () => {
            if (opts.activateOk === false) throw new Error('activate failed');
        }),
        app: {
            workspace: {
                getLeavesOfType: () => sidebar === null ? [] : [{ view: sidebar }],
            },
        },
    };
}

const emptyState = { conversationId: 'c1', history: [], uiMessages: [] };
const stableProvider = (isRunning = false, state = emptyState) => () => ({ state, isRunning });

describe('InlineToSidebarTransferService', () => {
    it('refuses while the inline turn is still running', async () => {
        const notify = vi.fn();
        const svc = new InlineToSidebarTransferService({ plugin: buildFakePlugin() as never, notify });
        const out = await svc.transfer({ inlineRunning: true, snapshotProvider: stableProvider() });
        expect(out).toEqual({ ok: false, reason: 'inline-busy' });
        expect(notify).toHaveBeenCalledWith('Waiting for the current response to finish.');
    });

    it('refuses with sidebar-busy notice when sidebar is mid-stream', async () => {
        const notify = vi.fn();
        const sidebar = buildFakeSidebar({ busy: true });
        const svc = new InlineToSidebarTransferService({ plugin: buildFakePlugin({ sidebar }) as never, notify });
        const out = await svc.transfer({ inlineRunning: false, snapshotProvider: stableProvider() });
        expect(out).toEqual({ ok: false, reason: 'sidebar-busy' });
        expect(notify.mock.calls[0]?.[0]).toContain('Sidebar chat is busy');
        expect(sidebar.importConversation).not.toHaveBeenCalled();
    });

    it('returns no-sidebar when activateView throws', async () => {
        const notify = vi.fn();
        const svc = new InlineToSidebarTransferService({
            plugin: buildFakePlugin({ sidebar: null, activateOk: false }) as never,
            notify,
        });
        const out = await svc.transfer({ inlineRunning: false, snapshotProvider: stableProvider() });
        expect(out).toEqual({ ok: false, reason: 'no-sidebar' });
    });

    it('returns no-sidebar when no AgentSidebarView leaf is open', async () => {
        const notify = vi.fn();
        const svc = new InlineToSidebarTransferService({
            plugin: buildFakePlugin({ sidebar: null }) as never,
            notify,
        });
        const out = await svc.transfer({ inlineRunning: false, snapshotProvider: stableProvider() });
        expect(out).toEqual({ ok: false, reason: 'no-sidebar' });
        expect(notify).toHaveBeenCalledWith('Sidebar chat is not available.');
    });

    it('hands the LIVE snapshot to importConversation and fires onTransferred on success', async () => {
        const sidebar = buildFakeSidebar();
        const onTransferred = vi.fn();
        const svc = new InlineToSidebarTransferService({
            plugin: buildFakePlugin({ sidebar }) as never,
            onTransferred,
        });
        const liveState = {
            conversationId: 'abc',
            history: [{ role: 'user' as const, content: 'hi' }],
            uiMessages: [{ role: 'user' as const, text: 'hi', ts: '2026-06-24T00:00:00Z' }],
        };
        const out = await svc.transfer({
            inlineRunning: false,
            snapshotProvider: () => ({ state: liveState, isRunning: false }),
        });
        expect(out).toEqual({ ok: true });
        expect(sidebar.importConversation).toHaveBeenCalledWith(liveState);
        expect(onTransferred).toHaveBeenCalledOnce();
    });

    it('aborts when snapshotProvider reports a new running turn (race fix)', async () => {
        const sidebar = buildFakeSidebar();
        const notify = vi.fn();
        const svc = new InlineToSidebarTransferService({
            plugin: buildFakePlugin({ sidebar }) as never,
            notify,
        });
        // Click-time: idle. After the activateView await: a steering
        // message started a new turn -> snapshotProvider returns
        // isRunning=true. Transfer MUST abort with inline-busy.
        // Verify-finding follow-up: spy on the provider so a future
        // regression that skips the live re-check fails this test
        // instead of silently passing on the canTransfer pre-check.
        const snapshotSpy = vi.fn(() => ({ state: emptyState, isRunning: true }));
        const out = await svc.transfer({
            inlineRunning: false,
            snapshotProvider: snapshotSpy,
        });
        expect(out).toEqual({ ok: false, reason: 'inline-busy' });
        expect(sidebar.importConversation).not.toHaveBeenCalled();
        expect(notify).toHaveBeenCalledWith('Waiting for the current response to finish.');
        expect(snapshotSpy).toHaveBeenCalledOnce();
    });

    it('aborts when sidebar becomes busy between click and live re-check', async () => {
        // Sidebar is idle at click-time but flips busy during the
        // activateView await. The fresh check inside transfer() catches this.
        const sidebar = buildFakeSidebar({ busy: false });
        const svc = new InlineToSidebarTransferService({
            plugin: {
                activateView: vi.fn(async () => { sidebar.isBusy = true; }),
                app: { workspace: { getLeavesOfType: () => [{ view: sidebar }] } },
            } as never,
        });
        const out = await svc.transfer({
            inlineRunning: false,
            snapshotProvider: () => ({ state: emptyState, isRunning: false }),
        });
        expect(out).toEqual({ ok: false, reason: 'sidebar-busy' });
        expect(sidebar.importConversation).not.toHaveBeenCalled();
    });

    it('canTransfer mirrors transfer pre-check without side effects', () => {
        const sidebar = buildFakeSidebar({ busy: true });
        const svc = new InlineToSidebarTransferService({ plugin: buildFakePlugin({ sidebar }) as never });
        expect(svc.canTransfer({ inlineRunning: false })).toEqual({ ok: false, reason: 'sidebar-busy' });
        expect(svc.canTransfer({ inlineRunning: true })).toEqual({ ok: false, reason: 'inline-busy' });
        expect(sidebar.importConversation).not.toHaveBeenCalled();
    });
});
