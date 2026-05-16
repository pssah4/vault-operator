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
// ignoreWords does not apply to the first token of a sentence (the rule's
// firstAlpha branch only consults acronyms + brands), so anchor terms that
// must keep their casing at sentence start go into brands instead.
const VAULT_OPERATOR_BRANDS = [
    ...DEFAULT_BRANDS,
    'Amazon Bedrock', 'Bedrock', 'ChatGPT', 'Vault Operator', 'KnowledgeDB', 'Markdown',
    // Hyphenated nouns that appear at sentence start in German UI strings
    'Living-Document', 'Cross-surface', 'Top-Hub-Block', 'Top-Hub-Generator',
    'Marker-Block', 'Frontmatter-Backfill-Job', 'Inbox-Triage', 'MOC-Pflege',
    'MOC-Marker', 'Auto-Trigger-Property', 'Cluster-Kandidaten',
];
// EPIC-26: not adding provider names like OpenAI / OpenRouter / Ollama /
// Anthropic to the brand list -- the rule does CASE-INSENSITIVE matching
// (collectBrandMatches uses /gi), so "openai.com" in a URL would be flagged
// as needing brand-canonical "OpenAI" casing. Pre-existing locale strings
// reference these names via lowercase domains (openai.com, ollama.ai,
// openrouter.ai). EPIC-26 strings avoid mid-sentence brand mentions instead.
const VAULT_OPERATOR_ACRONYMS = [...DEFAULT_ACRONYMS, 'AWS', 'IAM', 'SSO', 'STS', 'EU', 'US', 'OS', 'VPC', 'ARN', 'MOC', 'MOCs', 'BA-25', 'BA-26', 'MCP', 'DB',
    // EPIC-26 -- AI provider acronyms referenced in the new UI copy.
    'LLM', 'SDK',
];
// Proper nouns that should keep their casing in Bedrock-related UI copy but
// don't belong in the general brand list (they are not branded products).
// Includes German technical compound nouns (German grammar capitalises all
// nouns) so the English-centric sentence-case rule does not flag them.
const VAULT_OPERATOR_IGNORE_WORDS = [
    'Europe', 'Frankfurt', 'Frontmatter', 'Backfill', 'Inbox', 'Triage',
    'Stores', 'Konsole', 'Cluster', 'Ontologie', 'Settings', 'Plugin',
    'Off', 'On', 'Toggle', 'Refresh', 'Plus', 'Pro',
    'Days', 'Map', 'I', 'DELETE',
    // EPIC-26: AWS region identifiers used as placeholders.
    'eu-central-1', 'us-east-1', 'us-west-2',
];

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
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
            // for the Bedrock provider. VAULT_OPERATOR_BRANDS/ACRONYMS extend the obsidianmd defaults
            // (not replace them), so existing strings in locale files keep passing.
            'obsidianmd/ui/sentence-case-locale-module': ['error', {
                enforceCamelCaseLower: true,
                brands: VAULT_OPERATOR_BRANDS,
                acronyms: VAULT_OPERATOR_ACRONYMS,
                ignoreWords: VAULT_OPERATOR_IGNORE_WORDS,
            }],
            'obsidianmd/ui/sentence-case': ['error', {
                enforceCamelCaseLower: true,
                brands: VAULT_OPERATOR_BRANDS,
                acronyms: VAULT_OPERATOR_ACRONYMS,
                ignoreWords: VAULT_OPERATOR_IGNORE_WORDS,
            }],
        },
    },
    {
        // Test files use async mock callbacks to match async interfaces; the
        // body often returns a literal so there is nothing to await. The
        // Review Bot does not flag this in test files in practice, but the
        // local check would, so relax the rule for tests only.
        files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
        rules: {
            '@typescript-eslint/require-await': 'off',
        },
    },
    {
        ignores: ['node_modules/', 'main.js', 'forked-kilocode/', '_devprocess/', 'docs/'],
    }
);
