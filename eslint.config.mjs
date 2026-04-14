import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import obsidianmd from 'eslint-plugin-obsidianmd';
import { DEFAULT_BRANDS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js';
import { DEFAULT_ACRONYMS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/acronyms.js';

// Brand + acronym allowlist for the Bedrock provider. These have to be merged
// with the obsidianmd defaults because passing a brands/acronyms option replaces
// the built-in list entirely instead of extending it.
// Kept minimal: only brands that appear in new Bedrock-specific UI text. Adding
// too many (Ollama, Azure, OpenAI...) would conflict with existing lowercase
// usages in src/i18n/locales/en.ts where those words refer to CLI commands or
// filenames, not branded products.
const OBSILO_BRANDS = [...DEFAULT_BRANDS, 'Amazon Bedrock', 'Bedrock'];
const OBSILO_ACRONYMS = [...DEFAULT_ACRONYMS, 'AWS', 'IAM', 'SSO', 'STS', 'EU', 'US', 'VPC', 'ARN'];
// Proper nouns that should keep their casing in Bedrock-related UI copy but
// don't belong in the general brand list (they are not branded products).
const OBSILO_IGNORE_WORDS = ['Europe', 'Frankfurt'];

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    security.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            'no-unsanitized': noUnsanitized,
            obsidianmd,
        },
        rules: {
            // TypeScript
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { args: 'none' }],
            '@typescript-eslint/no-explicit-any': 'warn',
            'no-prototype-builtins': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            // TypeScript strict rules (matched to ObsidianReviewBot config)
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-deprecated': 'warn',
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
            '@typescript-eslint/no-implied-eval': 'error',
            // Security
            'security/detect-child-process': 'error',
            'security/detect-eval-with-expression': 'error',
            'security/detect-non-literal-fs-filename': 'warn',
            'security/detect-non-literal-regexp': 'warn',
            'security/detect-possible-timing-attacks': 'warn',
            'security/detect-object-injection': 'warn',
            'no-unsanitized/method': 'error',
            'no-unsanitized/property': 'error',
            // Obsidian Community Plugin Review-Bot Rules
            ...obsidianmd.configs.recommended,
            // Bot-matching config: enforceCamelCaseLower plus merged brand/acronym allowlist
            // for the Bedrock provider. OBSILO_BRANDS/ACRONYMS extend the obsidianmd defaults
            // (not replace them), so existing strings in locale files keep passing.
            'obsidianmd/ui/sentence-case-locale-module': ['error', {
                enforceCamelCaseLower: true,
                brands: OBSILO_BRANDS,
                acronyms: OBSILO_ACRONYMS,
                ignoreWords: OBSILO_IGNORE_WORDS,
            }],
            'obsidianmd/ui/sentence-case': ['error', {
                enforceCamelCaseLower: true,
                brands: OBSILO_BRANDS,
                acronyms: OBSILO_ACRONYMS,
                ignoreWords: OBSILO_IGNORE_WORDS,
            }],
        },
    },
    {
        ignores: ['node_modules/', 'main.js', 'forked-kilocode/', '_devprocess/', 'docs/'],
    }
);
