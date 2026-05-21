/**
 * skill-translator dry-run pass -- FEAT-29-08 Task B.
 *
 * Analyzes a Python-based Anthropic skill against the translator mapping
 * table and produces a verdict the agent uses to decide whether to write
 * the translation directly, prompt the user for partial-acceptance, or
 * stop and fall back to skill-creator.
 *
 * Pure analysis: reads files via ctx.vault, does NOT call the LLM and
 * does NOT write anything. Result shape:
 *
 *   {
 *     status: 'full' | 'partial' | 'unmappable' | 'no-source',
 *     mappable: [{ source: string, module: string, jsEquivalent: string, via: string }],
 *     partial:  [{ source: string, module: string, jsEquivalent: string, via: string, limitations: string[] }],
 *     unmappable: [{ source: string, module: string, reason: string }],
 *     bashCommands: [{ source: string, command: string, via: string, jsEquivalent: string | null }],
 *     summary: { totalImports, mappableCount, partialCount, unmappableCount }
 *   }
 *
 * status precedence:
 *   - 'no-source' wins when there are no scripts AND no body (nothing
 *     to translate; the skill body branches to "fetch the source first")
 *   - 'unmappable' wins when there is at least one unmappable entry
 *   - 'partial' wins when there is at least one partial entry and no unmappable
 *   - 'full' otherwise
 */

// Importing the mapping table at runtime via ctx.vault keeps the script
// portable for tests: tests pass an explicit mapping argument and skip
// the ctx.vault read path.

const IMPORT_LINE_RE = /^\s*(?:from\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s+import\s+|import\s+([a-zA-Z_][a-zA-Z0-9_.]*))/gm;
const BASH_FENCE_RE = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
const BASH_INLINE_CMD_RE = /^\s*([a-zA-Z][a-zA-Z0-9_-]*)\b/m;

/**
 * Extract every imported top-level module from a Python source string.
 * Returns top-level package names (the part before the first dot in
 * dotted imports), deduplicated, in first-seen order.
 */
export function extractImports(source) {
    if (!source || typeof source !== 'string') return [];
    const seen = new Set();
    const out = [];
    let match;
    const re = new RegExp(IMPORT_LINE_RE.source, 'gm');
    while ((match = re.exec(source)) !== null) {
        const raw = match[1] || match[2];
        if (!raw) continue;
        const top = raw.split('.')[0];
        if (!top || seen.has(top)) continue;
        seen.add(top);
        out.push(top);
    }
    return out;
}

/**
 * Extract every bash command leading word from fenced blocks AND inline
 * commands inside a Markdown body. Returns top-level command names,
 * deduplicated.
 */
export function extractBashCommands(markdown) {
    if (!markdown || typeof markdown !== 'string') return [];
    const seen = new Set();
    const out = [];
    let m;
    const fenceRe = new RegExp(BASH_FENCE_RE.source, 'g');
    while ((m = fenceRe.exec(markdown)) !== null) {
        const block = m[1];
        for (const line of block.split('\n')) {
            const cmd = line.trim().split(/\s+/)[0];
            if (!cmd || cmd.startsWith('#')) continue;
            // Drop variable assignments and shell-control words.
            if (/^[A-Z_][A-Z0-9_]*=/.test(cmd)) continue;
            if (['if', 'then', 'fi', 'else', 'for', 'do', 'done', 'while', 'case', 'esac'].includes(cmd)) continue;
            if (seen.has(cmd)) continue;
            seen.add(cmd);
            out.push(cmd);
        }
    }
    return out;
}

/**
 * Classify a list of import names against the mapping table. Each entry
 * goes into one of mappable / partial / unmappable. Unknown modules
 * (not in the table at all) count as unmappable with reason "not in
 * mapping table".
 */
export function classifyImports(imports, mapping, sourceFile = 'unknown') {
    const mappable = [];
    const partial = [];
    const unmappable = [];
    const modulesTable = mapping?.modules ?? {};
    for (const mod of imports) {
        const entry = modulesTable[mod];
        if (!entry) {
            unmappable.push({ source: sourceFile, module: mod, reason: 'not in mapping table' });
            continue;
        }
        const item = {
            source: sourceFile,
            module: mod,
            jsEquivalent: entry.jsEquivalent,
            via: entry.via,
        };
        if (entry.via === 'unmappable') {
            unmappable.push({ source: sourceFile, module: mod, reason: entry.notes || 'unmappable' });
            continue;
        }
        if (entry.via === 'partial' || (Array.isArray(entry.limitations) && entry.limitations.length > 0)) {
            partial.push({ ...item, limitations: entry.limitations ?? [] });
            continue;
        }
        mappable.push(item);
    }
    return { mappable, partial, unmappable };
}

/**
 * Classify bash commands. Same shape as classifyImports but uses the
 * bashCommands subtable in the mapping.
 */
export function classifyBashCommands(commands, mapping, sourceFile = 'unknown') {
    const bashTable = mapping?.bashCommands ?? {};
    const out = [];
    for (const cmd of commands) {
        const entry = bashTable[cmd];
        if (!entry) {
            out.push({ source: sourceFile, command: cmd, via: 'unmappable', jsEquivalent: null });
            continue;
        }
        out.push({
            source: sourceFile,
            command: cmd,
            via: entry.via,
            jsEquivalent: entry.jsEquivalent,
        });
    }
    return out;
}

/**
 * Pure orchestration: given the assembled inputs, produce the dry-run
 * verdict. Side-effect-free, easy to test.
 *
 *   inputs.skillBody        -- contents of SKILL.md (string, optional)
 *   inputs.scripts          -- [{ path: string, source: string }]
 *   inputs.mapping          -- the parsed mapping.json object
 */
export function dryRun(inputs) {
    const mapping = inputs.mapping ?? { modules: {}, bashCommands: {} };
    const skillBody = inputs.skillBody ?? '';
    const scripts = inputs.scripts ?? [];

    const allMappable = [];
    const allPartial = [];
    const allUnmappable = [];

    for (const script of scripts) {
        const imports = extractImports(script.source);
        const { mappable, partial, unmappable } = classifyImports(imports, mapping, script.path);
        allMappable.push(...mappable);
        allPartial.push(...partial);
        allUnmappable.push(...unmappable);
    }

    const bashCmds = extractBashCommands(skillBody);
    const bashClassified = classifyBashCommands(bashCmds, mapping, 'SKILL.md');
    for (const b of bashClassified) {
        if (b.via === 'unmappable') {
            allUnmappable.push({ source: b.source, module: `bash:${b.command}`, reason: 'no JavaScript equivalent' });
        }
    }

    let status = 'full';
    // Live test 2026-05-21 regression: when the agent asks for a
    // dry-run before cloning the source into the local tmp folder,
    // dryRun used to return 'full' (totalImports=0). The subskill
    // then translated nothing and wrote nothing. 'no-source' makes
    // that situation explicit so the skill body can branch to
    // "fetch the source files first" instead of silently completing.
    const hasNoBody = !skillBody || skillBody.trim().length === 0;
    if (scripts.length === 0 && hasNoBody) {
        status = 'no-source';
    } else if (allUnmappable.length > 0) {
        status = 'unmappable';
    } else if (allPartial.length > 0) {
        status = 'partial';
    }

    return {
        status,
        mappable: allMappable,
        partial: allPartial,
        unmappable: allUnmappable,
        bashCommands: bashClassified,
        summary: {
            totalImports: allMappable.length + allPartial.length + allUnmappable.length,
            mappableCount: allMappable.length,
            partialCount: allPartial.length,
            unmappableCount: allUnmappable.length,
        },
    };
}

/**
 * Runtime entry called by run_skill_script.
 *
 *   args.skillPath  -- vault-relative folder where the source skill
 *                      lives (its SKILL.md + scripts/*.py).
 *   args.mappingPath -- optional override; defaults to this skill's
 *                       references/mapping.json.
 *
 * Returns the dry-run object above.
 */
export async function execute(args, ctx) {
    const skillPath = (args && args.skillPath) || '';
    if (!skillPath) {
        throw new Error('skillPath is required (folder of the Python-based skill to translate)');
    }
    const mappingPath = (args && args.mappingPath) || '.vault-operator/data/skills/skill-translator/references/mapping.json';

    let mapping;
    try {
        const raw = await ctx.vault.read(mappingPath);
        mapping = JSON.parse(raw);
    } catch (e) {
        throw new Error(`Failed to load mapping table from ${mappingPath}: ${e instanceof Error ? e.message : String(e)}`);
    }

    let skillBody = '';
    try {
        skillBody = await ctx.vault.read(`${skillPath}/SKILL.md`);
    } catch {
        // SKILL.md is allowed to be absent (some Anthropic packages only
        // ship scripts); we still classify imports from the scripts.
    }

    // List scripts under the skill folder. Anthropic skills typically
    // put helpers under scripts/, but we also include any .py at root.
    const scripts = [];
    const candidatePaths = await listPythonFiles(ctx, skillPath);
    for (const p of candidatePaths) {
        try {
            const source = await ctx.vault.read(p);
            scripts.push({ path: p, source });
        } catch {
            // Skip unreadable; the verdict will reflect what we could read.
        }
    }

    return dryRun({ skillBody, scripts, mapping });
}

async function listPythonFiles(ctx, root) {
    // ctx.vault.list returns paths (string[] in the sandbox bridge).
    const allPaths = [];
    try {
        const direct = await ctx.vault.list(root);
        if (Array.isArray(direct)) allPaths.push(...direct);
    } catch {
        // empty root or not listable
    }
    try {
        const scripts = await ctx.vault.list(`${root}/scripts`);
        if (Array.isArray(scripts)) allPaths.push(...scripts);
    } catch {
        // no scripts/ subfolder is fine
    }
    return allPaths.filter((p) => typeof p === 'string' && p.toLowerCase().endsWith('.py'));
}
