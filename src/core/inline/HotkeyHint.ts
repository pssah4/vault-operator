/**
 * HotkeyHint -- OS-specific hotkey display for the inline-AI editor-menu (EPIC-33).
 *
 * Actual hotkey binding (per user spec 2026-06-24):
 *   open inline chat -> Ctrl + i (lowercase)
 *
 * Uses the literal Control key on every platform (not the
 * platform-native command key) so the chord reads identically across
 * macOS, Windows, and Linux.
 *
 * Display convention:
 *   macOS  ->  ⌃i      (Apple control glyph, no separator)
 *   Win    ->  Ctrl+i
 *   Linux  ->  Ctrl+i
 */

export interface PlatformLike {
    isMacOS: boolean;
    isWin: boolean;
    isLinux: boolean;
}

/** Render the OPEN inline chat hotkey hint for the given platform. */
export function formatHotkeyHint(platform: PlatformLike): string {
    if (platform.isMacOS === true) {
        return '⌃i'; // ⌃ + lowercase i
    }
    return 'Ctrl+i';
}

/**
 * User feedback 2026-06-24 (revision): "Ctrl held, then i + i" sends the
 * selection straight to the sidebar chat without opening the inline
 * panel first. The display reads as a SINGLE chord with a doubled
 * letter (⌃ii / Ctrl+ii) rather than two separate Ctrl+i presses, to
 * match the modifier-held key sequence the user actually performs.
 *
 *   macOS  ->  ⌃ii
 *   Win    ->  Ctrl+ii
 *   Linux  ->  Ctrl+ii
 */
export function formatSendSelectionToSidebarHotkeyHint(platform: PlatformLike): string {
    if (platform.isMacOS === true) {
        return '⌃ii';
    }
    return 'Ctrl+ii';
}

/** Convenience wrapper that reads from Obsidian's Platform singleton. */
export function formatInlineAiHotkeyHint(): string {
    // Lazy require so unit tests can run without Obsidian. Wrap into a
    // small probe so the unsafe-any boundary stays in this function.
    /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- runtime probe for Obsidian Platform singleton; surface is intentionally untyped */
    const obsidianModule: { Platform?: PlatformLike } = (() => {
        try {
            return require('obsidian');
        } catch {
            return {};
        }
    })();
    /* eslint-enable -- end of Obsidian Platform probe */
    const platform: PlatformLike = obsidianModule.Platform ?? { isMacOS: false, isWin: false, isLinux: true };
    return formatHotkeyHint(platform);
}
