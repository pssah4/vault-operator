import { describe, it, expect } from 'vitest';
import { formatHotkeyHint } from '../HotkeyHint';

describe('formatHotkeyHint', () => {
    it('macOS: returns the Apple-style glyph string', () => {
        expect(formatHotkeyHint({ isMacOS: true, isWin: false, isLinux: false })).toBe('⌘⇧I');
    });
    it('Windows: returns Ctrl+Shift+I', () => {
        expect(formatHotkeyHint({ isMacOS: false, isWin: true, isLinux: false })).toBe('Ctrl+Shift+I');
    });
    it('Linux: returns Ctrl+Shift+I', () => {
        expect(formatHotkeyHint({ isMacOS: false, isWin: false, isLinux: true })).toBe('Ctrl+Shift+I');
    });
    it('unknown platform: falls back to Ctrl+Shift+I', () => {
        expect(formatHotkeyHint({ isMacOS: false, isWin: false, isLinux: false })).toBe('Ctrl+Shift+I');
    });
});
