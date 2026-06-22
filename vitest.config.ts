import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        include: [
            'src/**/__tests__/**/*.test.ts',
            'src/**/*.test.ts',
            // FEAT-29-08: skill-translator ships its dry-run + translate
            // helpers as plain .js under bundled-skills/. Tests live next
            // to the scripts so the rule for new bundled-skill helpers is
            // visible from one place.
            'bundled-skills/**/__tests__/**/*.test.js',
        ],
        globals: false,
        setupFiles: [path.resolve(__dirname, 'tests/stubs/safeFsSetup.ts')],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary'],
            include: ['src/**/*.ts'],
            exclude: [
                'src/_generated/**',
                'src/**/__tests__/**',
                'src/**/*.test.ts',
                'src/**/*.d.ts',
                'src/types/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            // vitest stub for obsidian types (import type only — no runtime import)
            'obsidian': path.resolve(__dirname, 'tests/stubs/obsidian.ts'),
        },
    },
});
