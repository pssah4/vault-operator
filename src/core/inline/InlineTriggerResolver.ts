/**
 * InlineTriggerResolver -- builds InlineTriggerContext from selection events.
 *
 * FEAT-33-01 TR-1.2 (EPIC-33). The Resolver is the single source for
 * turning a CodeMirror selection event (or a hotkey-without-selection
 * trigger) into the typed InlineTriggerContext that every action
 * dispatcher consumes.
 *
 * Settings snapshot is pulled via a lazy callback so the caller
 * controls when settings are read (ADR-140 Hybrid Cache+Frisch).
 * The Resolver itself stays synchronous and side-effect free, so
 * the per-event overhead stays well under the <5ms budget.
 *
 * Architecture-map concept: inline-trigger-resolver
 * Related: ADR-138 (Sidebar-Independence), ADR-140 (Settings-Snapshot)
 */

import type { EditorMode, InlineSettingsSnapshot, InlineTriggerContext } from './InlineTriggerContext';

/** Input from the CodeMirror / Obsidian event layer. */
export interface SelectionTriggerInput {
    selectionText: string;
    editorMode: EditorMode;
    cursorPos: number;
    notePath: string;
}

export interface InlineTriggerResolverOptions {
    /**
     * Callback invoked exactly once per trigger to fetch the active
     * settings snapshot (modelId, provider, skillIds, customPromptIds).
     *
     * Per ADR-140 the caller should return a cached snapshot for the
     * stable parts (model + provider) and read skills/prompts fresh
     * inside this callback. The Resolver does not cache the result.
     */
    getSettingsSnapshot: () => InlineSettingsSnapshot;
}

export class InlineTriggerResolver {
    private readonly getSettingsSnapshot: () => InlineSettingsSnapshot;

    constructor(options: InlineTriggerResolverOptions) {
        this.getSettingsSnapshot = options.getSettingsSnapshot;
    }

    /**
     * Build a fresh InlineTriggerContext from a selection input.
     * Pulls a settings snapshot via the constructor callback.
     */
    resolveFromSelection(input: SelectionTriggerInput): InlineTriggerContext {
        return {
            selectionText: input.selectionText,
            editorMode: input.editorMode,
            cursorPos: input.cursorPos,
            notePath: input.notePath,
            settingsSnapshot: this.getSettingsSnapshot(),
        };
    }
}
