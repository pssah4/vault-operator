import { describe, it, expect, vi } from 'vitest';
import { SendToMainChatAction, type ChatSidebarController } from '../SendToMainChatAction';
import type { InlineTriggerContext } from '../../InlineTriggerContext';
import type { AgentTaskCallbacks } from '../../../AgentTask';

function makeCtx(overrides: Partial<InlineTriggerContext> = {}): InlineTriggerContext {
    return {
        selectionText: 'hello world',
        editorMode: 'source',
        cursorPos: 0,
        notePath: 'Notes/test.md',
        settingsSnapshot: { modelId: 'm', provider: 'p', skillIds: [], customPromptIds: [] },
        ...overrides,
    };
}

function makeCallbacks(): AgentTaskCallbacks {
    return {
        onText: vi.fn(),
        onToolStart: vi.fn(),
        onToolResult: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
    };
}

function makeController(isOpenInitially = true): ChatSidebarController {
    return {
        isOpen: vi.fn(() => isOpenInitially),
        open: vi.fn(async () => {}),
        insertContextChip: vi.fn(async () => {}),
    };
}

describe('SendToMainChatAction', () => {
    it('exposes stable id and label by default', () => {
        const action = new SendToMainChatAction({ controller: makeController() });
        expect(action.id).toBe('send-to-main-chat');
        expect(action.label).toBe('Send to chat');
    });

    it('honors custom id and label', () => {
        const action = new SendToMainChatAction({ controller: makeController(), id: 'sendx', label: 'Custom' });
        expect(action.id).toBe('sendx');
        expect(action.label).toBe('Custom');
    });

    it('is eligible in every editor mode', () => {
        const action = new SendToMainChatAction({ controller: makeController() });
        expect(action.isEligible(makeCtx({ editorMode: 'source' }))).toBe(true);
        expect(action.isEligible(makeCtx({ editorMode: 'live-preview' }))).toBe(true);
        expect(action.isEligible(makeCtx({ editorMode: 'reading' }))).toBe(true);
    });

    it('does NOT call controller.open() when sidebar is already open', async () => {
        const ctrl = makeController(true);
        const action = new SendToMainChatAction({ controller: ctrl });
        const cb = makeCallbacks();
        await action.execute(makeCtx(), cb);
        expect(ctrl.open).not.toHaveBeenCalled();
        expect(ctrl.insertContextChip).toHaveBeenCalledTimes(1);
    });

    it('calls controller.open() when sidebar is closed', async () => {
        const ctrl = makeController(false);
        const action = new SendToMainChatAction({ controller: ctrl });
        const cb = makeCallbacks();
        await action.execute(makeCtx(), cb);
        expect(ctrl.open).toHaveBeenCalledTimes(1);
        expect(ctrl.insertContextChip).toHaveBeenCalledTimes(1);
    });

    it('passes selection text and note path to insertContextChip', async () => {
        const ctrl = makeController();
        const action = new SendToMainChatAction({ controller: ctrl });
        const cb = makeCallbacks();
        await action.execute(makeCtx({ selectionText: 'foo', notePath: 'bar.md' }), cb);
        expect(ctrl.insertContextChip).toHaveBeenCalledWith({ text: 'foo', notePath: 'bar.md' });
    });

    it('calls onComplete on success', async () => {
        const action = new SendToMainChatAction({ controller: makeController() });
        const cb = makeCallbacks();
        await action.execute(makeCtx(), cb);
        expect(cb.onComplete).toHaveBeenCalledTimes(1);
        expect(cb.onError).not.toHaveBeenCalled();
    });

    it('routes thrown errors to onError', async () => {
        const ctrl: ChatSidebarController = {
            isOpen: () => true,
            open: async () => {},
            insertContextChip: async () => { throw new Error('chip-fail'); },
        };
        const action = new SendToMainChatAction({ controller: ctrl });
        const cb = makeCallbacks();
        await action.execute(makeCtx(), cb);
        expect(cb.onError).toHaveBeenCalledTimes(1);
        expect((cb.onError as ReturnType<typeof vi.fn>).mock.calls[0][0].message).toBe('chip-fail');
        expect(cb.onComplete).not.toHaveBeenCalled();
    });
});
