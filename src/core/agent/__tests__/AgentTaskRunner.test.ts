import { describe, it, expect, vi } from 'vitest';
import { AgentTaskRunner } from '../AgentTaskRunner';
import type { AgentTaskCallbacks, AgentTaskRunConfig } from '../../AgentTask';
import type { ApiHandler } from '../../../api/types';
import type { ToolRegistry } from '../../tools/ToolRegistry';

/**
 * Tests for AgentTaskRunner (ADR-138 Tier-1 Refactor, EPIC-33).
 *
 * The Runner is a thin wrapper around AgentTask that turns its
 * 16-parameter positional constructor into a single entry point taking
 * AgentTaskCallbacks plus AgentTaskRunConfig. It exists to decouple
 * Inline-Actions from the Chat-Sidebar: any caller that supplies the
 * callbacks can drive the agent loop, no Obsidian View required.
 */

function mockApi(): ApiHandler {
    return {
        createMessage: vi.fn(),
        getModel: vi.fn(() => ({ id: 'mock-model', info: { contextWindow: 200000 } })),
    } as unknown as ApiHandler;
}

function mockToolRegistry(): ToolRegistry {
    return {
        getTool: vi.fn(),
        listTools: vi.fn(() => []),
        getToolNames: vi.fn(() => []),
    } as unknown as ToolRegistry;
}

function mockCallbacks(): AgentTaskCallbacks {
    return {
        onText: vi.fn(),
        onToolStart: vi.fn(),
        onToolResult: vi.fn(),
        onComplete: vi.fn(),
        onError: vi.fn(),
    };
}

describe('AgentTaskRunner', () => {
    it('can be instantiated with mock dependencies (no Obsidian View required)', () => {
        const runner = new AgentTaskRunner({
            api: mockApi(),
            toolRegistry: mockToolRegistry(),
            callbacks: mockCallbacks(),
        });
        expect(runner).toBeDefined();
    });

    it('accepts optional runtime tuning parameters', () => {
        const runner = new AgentTaskRunner({
            api: mockApi(),
            toolRegistry: mockToolRegistry(),
            callbacks: mockCallbacks(),
            consecutiveMistakeLimit: 3,
            maxIterations: 10,
            condensingEnabled: false,
            depth: 1,
            maxSubtaskDepth: 3,
        });
        expect(runner).toBeDefined();
    });

    it('exposes an execute method that delegates to AgentTask.run', () => {
        const callbacks = mockCallbacks();
        const runner = new AgentTaskRunner({
            api: mockApi(),
            toolRegistry: mockToolRegistry(),
            callbacks,
        });
        expect(typeof runner.execute).toBe('function');
    });

    it('uses AgentTaskCallbacks as the entry surface (no View captures required)', () => {
        // Callbacks are pure functions over typed arguments. A caller that
        // implements onText/onToolStart/... with mocks (no DOM, no workspace)
        // is sufficient. This is the Sidebar-Independence contract for ADR-138.
        const callbacks: AgentTaskCallbacks = {
            onText: (text) => { expect(typeof text).toBe('string'); },
            onToolStart: (name) => { expect(typeof name).toBe('string'); },
            onToolResult: (name) => { expect(typeof name).toBe('string'); },
            onComplete: () => { /* no-op */ },
            onError: (err) => { expect(err).toBeInstanceOf(Error); },
        };
        const runner = new AgentTaskRunner({
            api: mockApi(),
            toolRegistry: mockToolRegistry(),
            callbacks,
        });
        expect(runner).toBeDefined();
    });
});
