import { describe, it, expect } from 'vitest';
import { TaskRouter } from '../TaskRouter';

describe('TaskRouter.classifyByRegex', () => {
    const router = new TaskRouter();

    it('classifies office-creation prompts as simple', () => {
        expect(router.classifyByRegex('erstelle mir eine xlsx mit drei Zeilen')).toBe('simple');
        expect(router.classifyByRegex('Create a docx with title Test')).toBe('simple');
        expect(router.classifyByRegex('mach mir ein pptx ueber AI')).toBe('simple');
        expect(router.classifyByRegex('generate a drawing of the architecture')).toBe('simple');
    });

    it('classifies single-file ops as simple', () => {
        expect(router.classifyByRegex('lies meine letzte notiz.md')).toBe('simple');
        expect(router.classifyByRegex('schreibe Test.md mit Hallo Welt')).toBe('simple');
        expect(router.classifyByRegex('oeffne data.json')).toBe('simple');
    });

    it('classifies short imperatives as simple', () => {
        // Below 80 chars and no strong complex signal.
        expect(router.classifyByRegex('zeige mir die zeit')).toBe('simple');
        expect(router.classifyByRegex('Hallo')).toBe('simple');
    });

    it('classifies research / synthesis as complex', () => {
        expect(router.classifyByRegex('such mir alle notizen zum thema TDD')).toBe('complex');
        expect(router.classifyByRegex('fasse die letzten Meetings zusammen')).toBe('complex');
        expect(router.classifyByRegex('analysiere meine vault dna')).toBe('complex');
        expect(router.classifyByRegex('vergleich die beiden Ansaetze')).toBe('complex');
        expect(router.classifyByRegex('erklaer mir den BundleLoader')).toBe('complex');
        expect(router.classifyByRegex('warum hat das Plugin v2.10.0')).toBe('complex');
    });

    it('classifies multi-step prompts as complex', () => {
        expect(router.classifyByRegex('lies note A dann fasse zusammen')).toBe('complex');
        expect(router.classifyByRegex('first do X then do Y')).toBe('complex');
        expect(router.classifyByRegex('Schritt fuer Schritt durch die Doku')).toBe('complex');
    });

    it('classifies long prompts as complex', () => {
        const long = 'Bitte gehe meine letzten zehn Meetings durch, '.repeat(15);
        expect(router.classifyByRegex(long)).toBe('complex');
    });

    it('returns unknown for empty input', () => {
        expect(router.classifyByRegex('')).toBe('unknown');
        expect(router.classifyByRegex('   ')).toBe('unknown');
    });

    it('returns unknown for medium-length neutral prompts', () => {
        // Between 80 and 300 chars, no strong simple/complex signal.
        const neutral = 'Das ist ein recht neutraler Text der weder klar einfach noch komplex ist und keine Tool-Verben enthaelt sondern allgemein bleibt was passieren soll.';
        expect(router.classifyByRegex(neutral)).toBe('unknown');
    });

    it('respects complex signals even when office keyword is also present', () => {
        // "such" should win over "erstelle ... xlsx".
        expect(router.classifyByRegex('such mir alle xlsx dateien im vault')).toBe('complex');
    });

    /**
     * FEAT-29-05: skill-creation prompts always route to the main
     * (flagship) model. Skill-design is high-leverage and benefits from
     * the frontier model, so the regex flags these as `complex` even
     * when the short-prompt or simple-file fallbacks would have hit.
     */
    it('classifies skill-creation prompts as complex (FEAT-29-05 flagship escalation)', () => {
        // English trigger phrases
        expect(router.classifyByRegex('build me a skill')).toBe('complex');
        expect(router.classifyByRegex('create a skill that does X')).toBe('complex');
        expect(router.classifyByRegex('make this repeatable as a skill')).toBe('complex');
        // German trigger phrases
        expect(router.classifyByRegex('bau mir einen skill der das macht')).toBe('complex');
        expect(router.classifyByRegex('neuer skill fuer wochenreview')).toBe('complex');
        expect(router.classifyByRegex('kannst du das automatisieren?')).toBe('complex');
        // Even when wrapped in office-keywords (these would otherwise hit SIMPLE_OFFICE_RE)
        expect(router.classifyByRegex('erstelle einen skill der pptx baut')).toBe('complex');
    });

    it('does not over-match the bare word "skill" in unrelated contexts', () => {
        // "skill" alone should not flip a clearly research-y or simple prompt
        // into the wrong bucket. The trigger requires a verb + skill noun phrase.
        expect(router.classifyByRegex('zeig mir alle skills')).toBe('simple');
        // research stays research
        expect(router.classifyByRegex('analysiere meine skills')).toBe('complex');
    });

    it('strips <context> and <vault_context> blocks before classifying', () => {
        // Real prompts from AgentSidebarView include these blocks;
        // they routinely push the raw prompt past 300 chars.
        const promptWithContext =
            'erstelle mir eine xlsx mit zwei Spalten und drei Zeilen ' +
            '<context>\nActive file in editor: Inbox/Untitled.md\n</context>' +
            '<vault_context>\nNotes: 794\nTop-level folders: Attachements, Inbox, Notes, ' +
            'Templates, _devprocess, _global, _memory, .obsidian\n' +
            'Models: anthropic, openrouter, openai, gemini\n</vault_context>';
        // Without the strip, length > 300 -> 'complex'. With strip -> 'simple'.
        expect(router.classifyByRegex(promptWithContext)).toBe('simple');

        // Same for the docx case from Sebastian's smoke test.
        expect(router.classifyByRegex(
            'erstelle ein docx mit Titel Foo ' +
            '<context>\nActive file in editor: Inbox/Untitled.md\n</context>'
        )).toBe('simple');

        // And research stays complex even with the context block appended.
        expect(router.classifyByRegex(
            'such mir alle notizen zu TDD ' +
            '<context>\nActive file in editor: Inbox/Untitled.md\n</context>'
        )).toBe('complex');
    });
});

describe('TaskRouter.classifyWithFallback', () => {
    const router = new TaskRouter();

    it('returns simple/complex from stage-1 without calling helper', async () => {
        const helperCalled = { count: 0 };
        const fakeHelper = {
            createMessage: () => { helperCalled.count++; throw new Error('should not be called'); },
            getModel: () => ({ id: 'fake', info: {} as never }),
        } as unknown as Parameters<typeof router.classifyWithFallback>[1];

        expect(await router.classifyWithFallback('erstelle mir eine xlsx', fakeHelper)).toBe('simple');
        expect(await router.classifyWithFallback('analysiere die vault', fakeHelper)).toBe('complex');
        expect(helperCalled.count).toBe(0);
    });

    it('defaults to complex when no helper is provided and stage-1 is unknown', async () => {
        const neutral = 'Das ist ein recht neutraler Text der weder klar einfach noch komplex ist und keine Tool-Verben enthaelt sondern allgemein bleibt was passieren soll.';
        expect(await router.classifyWithFallback(neutral, null)).toBe('complex');
    });
});
