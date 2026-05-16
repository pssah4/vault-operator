import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
        globals: false,
        setupFiles: [path.resolve(__dirname, 'src/__test-stubs__/safeFsSetup.ts')],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // vitest stub for obsidian types (import type only — no runtime import)
            'obsidian': path.resolve(__dirname, 'src/__test-stubs__/obsidian.ts'),
        },
    },
});
