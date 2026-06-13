/**
 * Per-conversation thinking on/off override for the chat model picker (issue #44).
 *
 * The chat-header picker lets a user pin extended thinking on or off for the
 * current conversation, independent of the active model's own configured
 * thinkingEnabled. The default is "follow", which keeps the model's own value
 * so untouched conversations behave exactly as before.
 *
 * This module owns only the pure decision logic so it stays unit-testable and
 * free of any Obsidian import.
 */

/**
 * Tri-state per-conversation thinking override.
 *  - 'follow': use the active model's own thinkingEnabled (no change)
 *  - 'on'    : force extended thinking on for this conversation
 *  - 'off'   : force extended thinking off for this conversation
 */
export type ThinkingOverride = 'follow' | 'on' | 'off';

/** The default override: follow the model's own setting. */
export const DEFAULT_THINKING_OVERRIDE: ThinkingOverride = 'follow';

/**
 * Resolve the effective thinkingEnabled for a conversation.
 *
 * In 'follow' mode the model's own value is returned untouched (including
 * undefined, which the provider layer treats as "model default"). 'on' and
 * 'off' force an explicit boolean that overrides the model value.
 */
export function resolveEffectiveThinkingEnabled(
    override: ThinkingOverride,
    modelThinkingEnabled: boolean | undefined,
): boolean | undefined {
    switch (override) {
        case 'on':
            return true;
        case 'off':
            return false;
        case 'follow':
        default:
            return modelThinkingEnabled;
    }
}

/**
 * Whether the override is an explicit on/off (i.e. it should be applied to the
 * built model). 'follow' leaves the model's own value in place.
 */
export function isExplicitThinkingOverride(override: ThinkingOverride): boolean {
    return override === 'on' || override === 'off';
}
