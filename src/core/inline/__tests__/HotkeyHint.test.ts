import { describe, it, expect } from 'vitest';
import { formatHotkeyHint } from '../HotkeyHint';

describe('formatHotkeyHint (open inline chat)', () => {
    it('macOS: returns the Apple-style control glyph + lowercase i', () => {
        expect(formatHotkeyHint({ isMacOS: true, isWin: false, isLinux: false })).toBe('⌃i');
    });
    it('Windows: returns Ctrl+i', () => {
        expect(formatHotkeyHint({ isMacOS: false, isWin: true, isLinux: false })).toBe('Ctrl+i');
    });
    it('Linux: returns Ctrl+i', () => {
        expect(formatHotkeyHint({ isMacOS: false, isWin: false, isLinux: true })).toBe('Ctrl+i');
    });
    it('unknown platform: falls back to Ctrl+i', () => {
        expect(formatHotkeyHint({ isMacOS: false, isWin: false, isLinux: false })).toBe('Ctrl+i');
    });
});
