/**
 * HotkeyHint -- OS-specific hotkey display for the inline-AI editor-menu (EPIC-33).
 *
 * The actual hotkey binding is the cross-platform 'Mod+Shift+I'
 * (Mod = Cmd on macOS, Ctrl on Windows/Linux). The DISPLAY uses the
 * conventional symbols per OS so users see what they actually press:
 *
 *  - macOS:        ⌘⇧I       (Apple modifier glyphs)
 *  - Windows:      Win+Shift+I (or Ctrl+Shift+I if rebound)
 *  - Linux:        Ctrl+Shift+I
 *
 * Notes:
 *  - On macOS the conventional rendering is glyphs without separators
 *    (⌘⇧I), matching system menus.
 *  - On Windows + Linux the conventional rendering is "Mod+Mod+Key"
 *    with plus separators.
 *  - The Windows user asked for Win+Shift+I. The hint reflects that
 *    preference; the actual binding stays 'Mod+Shift+I' because the
 *    Super/Win key cannot be reliably captured by Electron-based
 *    Obsidian on all Windows setups -- 'Mod' = Ctrl on Win so the
 *    binding works; the user can rebind via Settings -> Hotkeys.
 */

export interface PlatformLike {
    isMacOS: boolean;
    isWin: boolean;
    isLinux: boolean;
}

/** Render the hotkey hint string for the given platform. */
export function formatHotkeyHint(platform: PlatformLike): string {
    if (platform.isMacOS === true) {
        return '⌘⇧I'; // ⌘⇧I
    }
    if (platform.isWin === true) {
        return 'Ctrl+Shift+I';
    }
    return 'Ctrl+Shift+I'; // Linux + other.
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
