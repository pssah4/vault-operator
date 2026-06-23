import { describe, it, expect, vi } from 'vitest';
import { InlineActionService, type EditorSelectionProbe } from '../InlineActionService';
import { InlineActionRegistry, type InlineAction } from '../InlineActionRegistry';
import { InlineTriggerResolver } from '../InlineTriggerResolver';
import type { InlineFloatingMenu, MenuPosition } from '../InlineFloatingMenu';
import type { InlineSettingsSnapshot, InlineTriggerContext } from '../InlineTriggerContext';

function snapshot(): InlineSettingsSnapshot {
    return { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] };
}

function makeAction(id: string, exec?: () => Promise<void>): InlineAction {
    return {
        id,
        label: id,
        isEligible: () => true,
        execute: vi.fn(exec ?? (async () => { /* no-op */ })),
    };
}

interface FakeMenu {
    open: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    isOpen: boolean;
    onPick: (action: InlineAction, ctx: InlineTriggerContext) => void;
}

function makeFakeMenu(): FakeMenu {
    const fake = {
        open: vi.fn(),
        close: vi.fn(),
        dispose: vi.fn(),
        isOpen: false,
        onPick: () => { /* set by factory */ },
    } as FakeMenu;
    return fake;
}

function makeProbe(input: ReturnType<EditorSelectionProbe['probe']>, position: MenuPosition = { x: 10, y: 20 }): EditorSelectionProbe {
    const containerEl = { tagName: 'DIV' } as unknown as HTMLElement;
    return {
        probe: vi.fn(() => input),
        getMenuContainer: vi.fn(() => containerEl),
        getMenuPosition: vi.fn(() => position),
    };
}

function makeService(opts: {
    probe?: EditorSelectionProbe;
    registry?: InlineActionRegistry;
    menu?: FakeMenu;
    isEnabled?: () => boolean;
    onActionError?: (action: InlineAction, err: Error) => void;
    actionCallbacks?: (action: InlineAction, ctx: InlineTriggerContext) => Parameters<InlineAction['execute']>[1];
} = {}) {
    const registry = opts.registry ?? new InlineActionRegistry();
    const probe = opts.probe ?? makeProbe({
        selectionText: 'hi',
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'a.md',
    });
    const resolver = new InlineTriggerResolver({ getSettingsSnapshot: () => snapshot() });
    const menu = opts.menu ?? makeFakeMenu();
    const service = new InlineActionService({
        editorProbe: probe,
        registry,
        resolver,
        menuFactory: (onPick) => {
            menu.onPick = onPick;
            return menu as unknown as InlineFloatingMenu;
        },
        isEnabled: opts.isEnabled,
        onActionError: opts.onActionError,
        buildActionCallbacks: opts.actionCallbacks ?? (() => ({
            onText: () => {},
            onToolStart: () => {},
            onToolResult: () => {},
            onComplete: () => {},
            onError: () => {},
        })),
    });
    return { service, probe, registry, menu };
}

describe('InlineActionService', () => {
    it('triggerMenu opens the menu with TriggerContext and position', () => {
        const { service, menu } = makeService();
        service.actions.register(makeAction('lookup'));
        service.triggerMenu();
        expect(menu.open).toHaveBeenCalledTimes(1);
        expect(menu.open).toHaveBeenCalledWith(
            expect.objectContaining({ selectionText: 'hi', editorMode: 'source' }),
            { x: 10, y: 20 },
        );
    });

    it('triggerMenu is no-op when isEnabled returns false', () => {
        const { service, menu, probe } = makeService({ isEnabled: () => false });
        service.actions.register(makeAction('lookup'));
        service.triggerMenu();
        expect(menu.open).not.toHaveBeenCalled();
        expect(probe.probe).not.toHaveBeenCalled();
    });

    it('triggerMenu is no-op when probe returns null', () => {
        const { service, menu } = makeService({ probe: makeProbe(null) });
        service.actions.register(makeAction('lookup'));
        service.triggerMenu();
        expect(menu.open).not.toHaveBeenCalled();
    });

    it('triggerMenu is no-op when container is null', () => {
        const probe = makeProbe({ selectionText: 'hi', editorMode: 'source', cursorPos: 0, notePath: 'a.md' });
        (probe.getMenuContainer as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
        const { service, menu } = makeService({ probe });
        service.actions.register(makeAction('lookup'));
        service.triggerMenu();
        expect(menu.open).not.toHaveBeenCalled();
    });

    it('Menu onPick callback dispatches action with built callbacks', async () => {
        const action = makeAction('lookup');
        const cbs = { onText: vi.fn(), onToolStart: vi.fn(), onToolResult: vi.fn(), onComplete: vi.fn(), onError: vi.fn() };
        const { service, menu } = makeService({ actionCallbacks: () => cbs });
        service.actions.register(action);
        service.triggerMenu();
        // Simulate the user picking the action via the menu
        await menu.onPick(action, {
            selectionText: 'hi',
            editorMode: 'source',
            cursorPos: 0,
            notePath: 'a.md',
            settingsSnapshot: snapshot(),
        });
        expect(action.execute).toHaveBeenCalledTimes(1);
        expect(action.execute).toHaveBeenCalledWith(expect.objectContaining({ selectionText: 'hi' }), cbs);
    });

    it('dispatch(actionId) runs the action directly without opening the menu', async () => {
        const action = makeAction('rewrite');
        const { service, menu } = makeService();
        service.actions.register(action);
        await service.dispatch('rewrite');
        expect(action.execute).toHaveBeenCalledTimes(1);
        expect(menu.open).not.toHaveBeenCalled();
    });

    it('dispatch unknown id is a no-op', async () => {
        const { service } = makeService();
        await expect(service.dispatch('nope')).resolves.toBeUndefined();
    });

    it('dispatch respects isEligible (skips action if not eligible)', async () => {
        const action: InlineAction = { id: 'rewrite', label: 'Rewrite', isEligible: () => false, execute: vi.fn(async () => {}) };
        const { service } = makeService();
        service.actions.register(action);
        await service.dispatch('rewrite');
        expect(action.execute).not.toHaveBeenCalled();
    });

    it('routes execute errors to onActionError sink when provided', async () => {
        const onErr = vi.fn();
        const action = makeAction('lookup', async () => { throw new Error('boom'); });
        const { service } = makeService({ onActionError: onErr });
        service.actions.register(action);
        await service.dispatch('lookup');
        expect(onErr).toHaveBeenCalledTimes(1);
        expect(onErr.mock.calls[0][0]).toBe(action);
        expect(onErr.mock.calls[0][1].message).toBe('boom');
    });

    it('dispose disposes the menu (if one was created)', () => {
        const { service, menu } = makeService();
        service.actions.register(makeAction('lookup'));
        service.triggerMenu();
        service.dispose();
        expect(menu.dispose).toHaveBeenCalledTimes(1);
    });

    it('actions getter returns the registry', () => {
        const reg = new InlineActionRegistry();
        const { service } = makeService({ registry: reg });
        expect(service.actions).toBe(reg);
    });
});
