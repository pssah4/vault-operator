/**
 * quick_validate -- runs the frontmatter + naming rules against an
 * existing skill folder.
 *
 * Returns { valid: boolean, errors: string[], warnings: string[] }.
 *
 * The rules mirror what the SkillRegistry / SelfAuthoredSkillLoader
 * enforce at load time. Running this script before saving catches the
 * common mistakes (wrong name shape, missing description, extra
 * frontmatter keys) without a plugin reload.
 */

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const RESERVED = ['anthropic', 'claude'];
const MAX_NAME_LEN = 64;
const MAX_DESC_LEN = 1024;
const ALLOWED_KEYS = new Set([
    'name',
    'description',
    // Read-tolerant fields the validator accepts but flags as warning-only.
    'source',
    'trigger',
    'license',
    'allowed-tools',
    'metadata',
    'compatibility',
    'model',
    'requiredTools',
    'codeModules',
    'createdAt',
    'successCount',
    'type',
]);

function parseFrontmatter(content) {
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    if (!m) return null;
    const body = m[1];
    const result = {};
    for (const line of body.split('\n')) {
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const key = line.slice(0, colon).trim();
        let value = line.slice(colon + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}

export async function execute(args, ctx) {
    // Accept either `name` or `skill_name` -- the agent's intuition flips
    // between the two depending on the surrounding tool schema.
    const name = ((args && (args.name || args.skill_name)) || '').trim();
    const errors = [];
    const warnings = [];

    if (!name) {
        return {
            valid: false,
            errors: ['args.name (or args.skill_name) is required'],
            warnings: [],
        };
    }

    const skillMdPath = `.vault-operator/data/skills/${name}/SKILL.md`;
    let content;
    try {
        content = await ctx.vault.read(skillMdPath);
    } catch {
        return {
            valid: false,
            errors: [`SKILL.md not found at ${skillMdPath}`],
            warnings: [],
        };
    }

    const fm = parseFrontmatter(content);
    if (!fm) {
        return {
            valid: false,
            errors: ['no YAML frontmatter found (must start with ---)'],
            warnings: [],
        };
    }

    // Required: name
    const fmName = fm.name;
    if (!fmName) {
        errors.push('frontmatter is missing required field: name');
    } else {
        if (fmName !== name) {
            warnings.push(`frontmatter name "${fmName}" does not match folder "${name}"`);
        }
        if (fmName.length > MAX_NAME_LEN) {
            errors.push(`name too long (${fmName.length}, max ${MAX_NAME_LEN})`);
        }
        if (!NAME_PATTERN.test(fmName)) {
            errors.push(
                `name must be kebab-case (lowercase letters/digits/hyphens, no leading/trailing hyphen). Got: ${JSON.stringify(fmName)}`,
            );
        }
        if (fmName.includes('--')) {
            errors.push('name cannot contain consecutive hyphens');
        }
        const lower = fmName.toLowerCase();
        for (const word of RESERVED) {
            if (lower.includes(word)) {
                errors.push(`name cannot contain reserved word "${word}"`);
            }
        }
    }

    // Required: description
    const desc = fm.description;
    if (!desc) {
        errors.push('frontmatter is missing required field: description');
    } else {
        if (desc.length > MAX_DESC_LEN) {
            errors.push(`description too long (${desc.length}, max ${MAX_DESC_LEN})`);
        }
        if (desc.includes('<') || desc.includes('>')) {
            errors.push('description cannot contain angle brackets (< or >)');
        }
        if (desc.startsWith('[TODO')) {
            warnings.push('description still contains [TODO placeholder -- replace before declaring the skill done');
        }
    }

    // Forbid surprising frontmatter keys.
    for (const key of Object.keys(fm)) {
        if (!ALLOWED_KEYS.has(key)) {
            warnings.push(`unexpected frontmatter key "${key}" -- discovery layer will ignore it`);
        }
    }

    // Anti-pattern files at the root.
    const list = await ctx.vault.list(`.vault-operator/data/skills/${name}`).catch(() => []);
    const blacklist = ['README.md', 'INSTALLATION_GUIDE.md', 'QUICK_REFERENCE.md', 'CHANGELOG.md'];
    for (const path of list) {
        const basename = path.split('/').pop();
        if (blacklist.includes(basename)) {
            warnings.push(`anti-pattern file at skill root: ${basename} -- skills should not ship meta-documentation`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}
