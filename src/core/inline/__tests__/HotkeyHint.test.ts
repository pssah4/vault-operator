import { describe, it, expect } from 'vitest';
import { formatHotkeyHint, formatSendSelectionToSidebarHotkeyHint } from '../HotkeyHint';

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

describe('formatSendSelectionToSidebarHotkeyHint (Ctrl held + i pressed twice)', () => {
    it('macOS: Apple control glyph followed by doubled i', () => {
        expect(formatSendSelectionToSidebarHotkeyHint({ isMacOS: true, isWin: false, isLinux: false }))
            .toBe('⌃ii');
    });
    it('Windows: Ctrl+ii', () => {
        expect(formatSendSelectionToSidebarHotkeyHint({ isMacOS: false, isWin: true, isLinux: false }))
            .toBe('Ctrl+ii');
    });
    it('Linux: Ctrl+ii', () => {
        expect(formatSendSelectionToSidebarHotkeyHint({ isMacOS: false, isWin: false, isLinux: true }))
            .toBe('Ctrl+ii');
    });
});
