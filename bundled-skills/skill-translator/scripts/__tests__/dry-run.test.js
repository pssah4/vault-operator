/**
 * Tests for the skill-translator dry-run pass (FEAT-29-08 Task B).
 *
 * The script lives under bundled-skills/ and is shipped as JS, so the
 * tests import it directly with the .js extension. The runtime
 * `execute` path uses ctx.vault and is exercised once with a fake ctx;
 * the rest of the suite hits the pure helpers (extractImports,
 * extractBashCommands, classifyImports, classifyBashCommands, dryRun).
 */

import { describe, it, expect } from 'vitest';
import {
    extractImports,
    extractBashCommands,
    classifyImports,
    classifyBashCommands,
    dryRun,
    execute,
} from '../dry-run.js';

const MINIMAL_MAPPING = {
    schemaVersion: 1,
    modules: {
        json: { jsEquivalent: 'JSON', via: 'stdlib', notes: '...' },
        pandas: { jsEquivalent: 'manual + danfojs', via: 'partial', limitations: ['no HDF5'] },
        scipy: { jsEquivalent: null, via: 'unmappable', notes: 'no JS analogue' },
        requests: { jsEquivalent: 'ctx.requestUrl', via: 'built-in-tool' },
        'python-pptx': { jsEquivalent: 'create_pptx', via: 'built-in-tool' },
    },
    bashCommands: {
        curl: { jsEquivalent: 'ctx.requestUrl', via: 'built-in-tool' },
        python: { jsEquivalent: null, via: 'unmappable' },
    },
};

describe('extractImports', () => {
    it('returns an empty list when no imports are present', () => {
        expect(extractImports('print("hi")')).toEqual([]);
    });

    it('extracts a plain "import foo"', () => {
        expect(extractImports('import json')).toEqual(['json']);
    });

    it('extracts a "from X import Y"', () => {
        expect(extractImports('from json import loads')).toEqual(['json']);
    });

    it('reduces dotted imports to the top-level package name', () => {
        expect(extractImports('from os.path import join')).toEqual(['os']);
    });

    it('deduplicates repeated imports', () => {
        expect(extractImports('import json\nimport json')).toEqual(['json']);
    });

    it('handles multiple imports in one source', () => {
        const src = 'import json\nfrom os.path import join\nimport requests';
        expect(extractImports(src)).toEqual(['json', 'os', 'requests']);
    });

    it('ignores commented-out imports', () => {
        // Our regex is line-anchored on whitespace; a leading "# " makes
        // the line a comment so the regex must NOT match it.
        const src = '# import scipy\nimport json';
        const imports = extractImports(src);
        expect(imports).toEqual(['json']);
    });
});

describe('extractBashCommands', () => {
    it('returns an empty list when no bash blocks are present', () => {
        expect(extractBashCommands('# heading\nplain text only')).toEqual([]);
    });

    it('extracts the first word from each command line in a bash fence', () => {
        const md = '```bash\ncurl https://example.com\ngrep foo file\n```';
        expect(extractBashCommands(md)).toEqual(['curl', 'grep']);
    });

    it('also accepts ```sh and ```shell fences', () => {
        const md = '```sh\nawk \'{print $1}\' file\n```\n```shell\nsed -i s/a/b/ file\n```';
        const cmds = extractBashCommands(md);
        expect(cmds).toEqual(['awk', 'sed']);
    });

    it('skips comments and variable assignments inside the fence', () => {
        const md = '```bash\n# install\nPATH=/foo\ncurl https://example.com\n```';
        expect(extractBashCommands(md)).toEqual(['curl']);
    });

    it('deduplicates repeated commands', () => {
        const md = '```bash\ncurl a\ncurl b\n```';
        expect(extractBashCommands(md)).toEqual(['curl']);
    });
});

describe('classifyImports', () => {
    it('puts stdlib-mapped modules into mappable', () => {
        const out = classifyImports(['json'], MINIMAL_MAPPING, 'foo.py');
        expect(out.mappable).toHaveLength(1);
        expect(out.mappable[0]).toEqual({
            source: 'foo.py',
            module: 'json',
            jsEquivalent: 'JSON',
            via: 'stdlib',
        });
        expect(out.partial).toHaveLength(0);
        expect(out.unmappable).toHaveLength(0);
    });

    it('puts via=partial modules into partial', () => {
        const out = classifyImports(['pandas'], MINIMAL_MAPPING, 'foo.py');
        expect(out.partial).toHaveLength(1);
        expect(out.partial[0].limitations).toEqual(['no HDF5']);
        expect(out.mappable).toHaveLength(0);
    });

    it('puts via=unmappable modules into unmappable with a reason', () => {
        const out = classifyImports(['scipy'], MINIMAL_MAPPING, 'foo.py');
        expect(out.unmappable).toHaveLength(1);
        expect(out.unmappable[0].module).toBe('scipy');
        expect(out.unmappable[0].reason).toMatch(/no JS analogue/i);
    });

    it('puts unknown modules (not in mapping) into unmappable', () => {
        const out = classifyImports(['totally_made_up'], MINIMAL_MAPPING, 'foo.py');
        expect(out.unmappable).toHaveLength(1);
        expect(out.unmappable[0].module).toBe('totally_made_up');
        expect(out.unmappable[0].reason).toMatch(/not in mapping table/i);
    });

    it('treats via=built-in-tool as mappable (translator reroutes the call)', () => {
        const out = classifyImports(['python-pptx'], MINIMAL_MAPPING, 'foo.py');
        expect(out.mappable).toHaveLength(1);
        expect(out.mappable[0].via).toBe('built-in-tool');
    });

    it('handles a mixed batch correctly', () => {
        const out = classifyImports(['json', 'pandas', 'scipy', 'unknown'], MINIMAL_MAPPING, 'foo.py');
        expect(out.mappable.map((m) => m.module)).toEqual(['json']);
        expect(out.partial.map((m) => m.module)).toEqual(['pandas']);
        expect(out.unmappable.map((m) => m.module).sort()).toEqual(['scipy', 'unknown']);
    });
});

describe('classifyBashCommands', () => {
    it('maps known bash commands by via', () => {
        const out = classifyBashCommands(['curl'], MINIMAL_MAPPING, 'SKILL.md');
        expect(out).toEqual([
            { source: 'SKILL.md', command: 'curl', via: 'built-in-tool', jsEquivalent: 'ctx.requestUrl' },
        ]);
    });

    it('marks unknown bash commands as unmappable', () => {
        const out = classifyBashCommands(['foobar'], MINIMAL_MAPPING, 'SKILL.md');
        expect(out[0].via).toBe('unmappable');
        expect(out[0].jsEquivalent).toBe(null);
    });

    it('via=unmappable from the table also surfaces correctly', () => {
        const out = classifyBashCommands(['python'], MINIMAL_MAPPING, 'SKILL.md');
        expect(out[0].via).toBe('unmappable');
    });
});

describe('dryRun verdict precedence', () => {
    it("status 'full' when everything maps", () => {
        const result = dryRun({
            skillBody: '',
            scripts: [{ path: 'a.py', source: 'import json' }],
            mapping: MINIMAL_MAPPING,
        });
        expect(result.status).toBe('full');
        expect(result.summary.totalImports).toBe(1);
        expect(result.summary.partialCount).toBe(0);
        expect(result.summary.unmappableCount).toBe(0);
    });

    it("status 'partial' when there is at least one partial and no unmappable", () => {
        const result = dryRun({
            skillBody: '',
            scripts: [{ path: 'a.py', source: 'import json\nimport pandas' }],
            mapping: MINIMAL_MAPPING,
        });
        expect(result.status).toBe('partial');
        expect(result.summary.partialCount).toBe(1);
        expect(result.summary.unmappableCount).toBe(0);
    });

    it("status 'unmappable' wins over partial when any unmappable is present", () => {
        const result = dryRun({
            skillBody: '',
            scripts: [{ path: 'a.py', source: 'import pandas\nimport scipy' }],
            mapping: MINIMAL_MAPPING,
        });
        expect(result.status).toBe('unmappable');
        expect(result.summary.partialCount).toBe(1);
        expect(result.summary.unmappableCount).toBe(1);
    });

    it('aggregates across multiple scripts', () => {
        const result = dryRun({
            skillBody: '',
            scripts: [
                { path: 'a.py', source: 'import json' },
                { path: 'b.py', source: 'import pandas' },
                { path: 'c.py', source: 'import scipy' },
            ],
            mapping: MINIMAL_MAPPING,
        });
        expect(result.status).toBe('unmappable');
        expect(result.mappable.map((m) => m.source)).toEqual(['a.py']);
        expect(result.partial.map((m) => m.source)).toEqual(['b.py']);
        expect(result.unmappable.map((m) => m.source)).toEqual(['c.py']);
    });

    it('classifies bash commands in the skill body and surfaces unmappable ones', () => {
        const result = dryRun({
            skillBody: '```bash\npython script.py\n```',
            scripts: [],
            mapping: MINIMAL_MAPPING,
        });
        expect(result.bashCommands).toHaveLength(1);
        expect(result.bashCommands[0].command).toBe('python');
        // bash-level unmappable should also flip the overall verdict.
        expect(result.status).toBe('unmappable');
    });

    it("returns 'no-source' on an empty input (live test 2026-05-21 regression)", () => {
        // Live test: skill-translator subskill blocked with 'unmappable'
        // because the source files had not been cloned into the local
        // tmp folder yet. An empty input means there's literally nothing
        // to translate, which is distinct from 'full' (everything maps)
        // and from 'unmappable' (something tried to map but failed).
        // The skill body branches on this and prompts the agent to
        // fetch the source first.
        const result = dryRun({ skillBody: '', scripts: [], mapping: MINIMAL_MAPPING });
        expect(result.status).toBe('no-source');
        expect(result.summary.totalImports).toBe(0);
    });

    it("returns 'no-source' when both scripts and body are empty even if mapping is rich", () => {
        const result = dryRun({ scripts: [], mapping: MINIMAL_MAPPING });
        expect(result.status).toBe('no-source');
    });

    it("returns 'full' when there is a non-empty body but no scripts (docs-only skill)", () => {
        // Docs-only skills are legitimate -- they have no scripts to
        // translate. Status 'full' is correct; the bashCommands check
        // still flips it if commands inside the body are unmappable.
        const result = dryRun({
            skillBody: '# A pure documentation skill\n\nNothing to run.',
            scripts: [],
            mapping: MINIMAL_MAPPING,
        });
        expect(result.status).toBe('full');
    });
});

describe('execute (runtime entry, fake ctx)', () => {
    function makeCtx(files) {
        return {
            vault: {
                read: async (p) => {
                    if (!(p in files)) throw new Error(`not found: ${p}`);
                    return files[p];
                },
                list: async (folder) => {
                    return Object.keys(files).filter((p) => p.startsWith(folder + '/') && !p.slice(folder.length + 1).includes('/'));
                },
            },
        };
    }

    it('reads the mapping and the skill body, returns a verdict', async () => {
        const ctx = makeCtx({
            '.vault-operator/data/skills/skill-translator/references/mapping.json': JSON.stringify(MINIMAL_MAPPING),
            'tmp/anthropic-pdf/SKILL.md': '# pdf skill body',
            'tmp/anthropic-pdf/scripts/extract.py': 'import json',
        });
        const out = await execute({ skillPath: 'tmp/anthropic-pdf' }, ctx);
        expect(out.status).toBe('full');
        expect(out.summary.mappableCount).toBe(1);
    });

    it('throws when skillPath is missing', async () => {
        const ctx = makeCtx({});
        await expect(execute({}, ctx)).rejects.toThrow(/skillPath is required/i);
    });

    it('throws a clear error when mapping cannot be loaded', async () => {
        const ctx = makeCtx({});
        await expect(execute({ skillPath: 'tmp/foo' }, ctx)).rejects.toThrow(/mapping table/i);
    });
});
