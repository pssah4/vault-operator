/**
 * InlineTriggerContext -- shared input for every Inline-Action (FEAT-33-01, EPIC-33).
 *
 * Built once by the InlineTriggerResolver when a selection event fires,
 * passed unchanged to every action dispatcher. Carries selection text,
 * editor mode, cursor position, note path, and a settings snapshot of
 * the active main-chat configuration at trigger time.
 *
 * Architecture-map concept: inline-trigger-resolver
 * Related: ADR-138 (Sidebar-Independence), ADR-140 (Settings-Snapshot)
 */

/** The CodeMirror / Obsidian editor mode the user is currently in. */
export type EditorMode = 'source' | 'live-preview' | 'reading';

/**
 * Snapshot of the main-chat settings at the moment the trigger fired.
 *
 * Modell and Provider land here gecached via InlineActionSettingsCache
 * (ADR-140 Hybrid Cache+Frisch). Skills and Prompts are read fresh per
 * trigger and merged into this snapshot.
 *
 * Optional Per-Action-Pin (FEAT-33-10) overrides modelId by replacing
 * it before the snapshot is built.
 */
export interface InlineSettingsSnapshot {
    modelId: string;
    provider: string;
    skillIds: string[];
    customPromptIds: string[];
}

export interface InlineTriggerContext {
    /**
     * User-selected text. May be empty when the user opens the menu via
     * hotkey without a selection (then only no-selection-actions are
     * available, e.g. "ask AI at cursor").
     */
    selectionText: string;
    /** Editor mode at trigger time. Determines which actions are eligible. */
    editorMode: EditorMode;
    /** Char-offset of the cursor (or selection-anchor) in the note buffer. */
    cursorPos: number;
    /** Vault-relative path of the active note. */
    notePath: string;
    /** Settings snapshot at trigger time. */
    settingsSnapshot: InlineSettingsSnapshot;
}

const VALID_EDITOR_MODES: ReadonlySet<EditorMode> = new Set(['source', 'live-preview', 'reading']);

/**
 * Type guard for InlineTriggerContext. Used at module boundaries
 * (event handlers, command-palette callbacks) where the input shape
 * cannot be guaranteed by the type system alone.
 */
export function isInlineTriggerContext(value: unknown): value is InlineTriggerContext {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    if (typeof v.selectionText !== 'string') return false;
    if (typeof v.editorMode !== 'string' || !VALID_EDITOR_MODES.has(v.editorMode as EditorMode)) return false;
    if (typeof v.cursorPos !== 'number') return false;
    if (typeof v.notePath !== 'string') return false;
    if (v.settingsSnapshot === null || typeof v.settingsSnapshot !== 'object') return false;

    const s = v.settingsSnapshot as Record<string, unknown>;
    if (typeof s.modelId !== 'string') return false;
    if (typeof s.provider !== 'string') return false;
    if (!Array.isArray(s.skillIds)) return false;
    if (!Array.isArray(s.customPromptIds)) return false;

    return true;
}
