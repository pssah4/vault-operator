---
id: AUDIT-024
date: 2026-05-21
scope: Full-codebase delta audit (since AUDIT-016, 2026-05-03)
auditor: sebastian-claude-opus-4-7
audit-type: periodic-full (branch feature/audit-2026-05-21)
---

# Security Audit Report

| Field | Value |
|---|---|
| **Project** | vault-operator (Obsidian plugin) |
| **Date** | 2026-05-21 |
| **Auditor** | Security Audit skill |
| **Scan Scope** | Full delta since 2026-05-03 (AUDIT-016), SAST + OWASP Top 10 + OWASP LLM Top 10 + SCA + Zero Trust |
| **Risk Rating** | **LOW** (post fix-loop, all 8 findings resolved) |
| **Languages** | TypeScript (458 source files, ~105 kLOC, no tests counted) |
| **Previous Full Audit** | AUDIT-016-obsilo-2026-05-03 (clean release of v2.11.6) |
| **Branch** | feature/audit-2026-05-21 on dev @ 992dab5f |

---

## Executive Summary

| Analysis Domain | Critical | High | Medium | Low | Info |
|---|---|---|---|---|---|
| SAST | 0 | 0 | 2 | 3 | 1 |
| OWASP Top 10 | 0 | 0 | 0 | 0 | 1 |
| OWASP LLM Top 10 | 0 | 0 | 1 | 1 | 0 |
| Zero Trust | 0 | 0 | 0 | 1 | 0 |
| Code Quality | 0 | 0 | 0 | 0 | 0 |
| SCA | 0 | 0 | 0 | 0 | 0 |
| License Compliance | 0 | 0 | 0 | 0 | 0 |
| **Total** | **0** | **0** | **2** | **4** | **2** |

**Overall risk after fix-loop: LOW, release-ready.** All 8 findings (2 Medium + 4 Low + 2 Info) resolved on 2026-05-21. The original assessment ("Overall risk: LOW-MEDIUM, release-ready") preceded the fix-loop. Delta-audit since AUDIT-016 (2026-05-03, baseline for v2.11.6 release) covers 18 days, 493 commits, the EPIC-29 wave (FEAT-29-01 to FEAT-29-15) plus the bot-compliance pass and the audit-close-out fix-loop. Per-feature audits in this period (AUDIT-FEAT-29-01, -02, -03, -04, -05, -06, -09, -11, -EPIC-29) resolved 1 HIGH, 4 MEDIUM, 14 LOW findings. This delta finds 2 new MEDIUM + 4 LOW + 2 INFO, all in code added since AUDIT-016 by FEAT-29-14 (templates setup). Zero Critical, zero High, npm audit clean (0 vulnerabilities across 1007 deps).

### Delta from Previous Audits

| Finding | Previous Audit | Status |
|---|---|---|
| AUDIT-016 H-1 strict-source-isolation | 2026-05-03 | Confirmed-resolved (recall_memory + search_history default-on) |
| AUDIT-016 M-3 hub-block consent | 2026-05-03 | Confirmed-resolved (privacy notice + opt-in toggle) |
| AUDIT-FEAT-29-01 to -11 findings | 2026-05-20/21 | All resolved per-feature |
| AUDIT-EPIC-29 H-1 BackupSecretFilter | 2026-05-21 | Resolved |
| AUDIT-EPIC-29 M-1 validateJs heuristic | 2026-05-21 | Resolved (doc-fix) |
| AUDIT-EPIC-29 M-2 writeTranslation path-traversal | 2026-05-21 | Resolved |
| AUDIT-EPIC-29 L-1 to L-6 | 2026-05-21 | Resolved |
| New: M-1 LLM template-translation privacy | (this audit) | Open |
| New: M-2 TemplateMaterializer filename validation | (this audit) | Open |
| New: L-1 to L-4 + I-1, I-2 | (this audit) | Open |

---

## Findings

### P2: Should Fix (Medium)

#### M-1 (MEDIUM): Template-translation sends vault frontmatter to external LLM without explicit consent

- **CWE-200** Exposure of Sensitive Information to an Unauthorized Actor
- **OWASP LLM06** Sensitive Information Disclosure
- **Location:** [src/core/templates/translateTemplate.ts:26-29](src/core/templates/translateTemplate.ts#L26)
- **Status:** Resolved (fix-loop 2026-05-21)

**Risk.** The First-Run wizard step "Templates" (FEAT-29-14) lets the user pick a custom language. For any language outside DE/EN, `makeTemplateTranslator(plugin)` builds an API handler from the active model and sends every bundled template's full content to the provider as a translation prompt. The active provider can be Anthropic, OpenAI, Bedrock, OpenRouter, or any custom endpoint. The wizard step shows no banner that this transmits text to the provider; the helper sentence under the language dropdown only mentions LLM-translation in passing.

Bundled templates contain only structural YAML keys ("Zusammenfassung:", "Autor:") and category-list values, not user data, so the direct privacy impact is bounded. The concerning case is downstream: a future code path could pass *user vault content* through the same `makeTemplateTranslator` builder (the wrapper takes any source string). There is no `redact` step that strips sensitive frontmatter keys before transmission.

**Remediation.**

1. Add a consent banner in the FirstRunWizardModal Templates step that is visible whenever the language dropdown is "Other": `"Translation sends the template structure to your active LLM provider (<provider name>). Bundled templates contain only frontmatter keys, no vault content."`
2. Document the contract of `makeTemplateTranslator` in the JSDoc: "Designed for bundled-template structure only. Do not pass user vault content through this translator without redaction."
3. Add a defensive size cap on the source content sent (e.g. 4 KB per template) so a future caller cannot accidentally exfiltrate a large vault note.

```typescript
// src/core/templates/translateTemplate.ts:25
return async (lang: string, name: string, sourceContent: string): Promise<string> => {
    if (sourceContent.length > 4096) {
        console.warn('[templates] refusing to translate content larger than 4 KB:', name);
        return sourceContent;
    }
    // ... rest unchanged
};
```

---

#### M-2 (MEDIUM): TemplateMaterializer writes bundle filenames without path-segment validation (defense-in-depth)

- **CWE-22** Improper Limitation of a Pathname to a Restricted Directory
- **Location:** [src/core/templates/TemplateMaterializer.ts:82-104](src/core/templates/TemplateMaterializer.ts#L82)
- **Status:** Resolved (fix-loop 2026-05-21)

**Risk.** `materialize()` iterates `Object.entries(this.bundle[lang])` and composes the write path as `${targetFolder}/${filename}` without checking that `filename` is a safe path segment. The bundle is generated at build-time from `bundled-templates/notes/{de,en}/*.md` and the esbuild generator (esbuild.config.mjs:182) does NOT sanitise filenames either. The current bundle is safe (controlled directory layout), but a supply-chain compromise or a future generator change that walks a wider directory could introduce traversal segments.

This is a defense-in-depth gap: the live exploit requires the build pipeline to be compromised first, which is itself a higher-severity event. Worth fixing for symmetry with `BuiltinSkillMaterializer.ts:96-107` which already runs the same containment check on bundled-skill filenames.

**Remediation.** Add a containment check before each write:

```typescript
// src/core/templates/TemplateMaterializer.ts:83
for (const [filename, sourceContent] of Object.entries(templates)) {
    if (
        filename.includes('..')
        || filename.startsWith('/')
        || filename.startsWith('\\')
        || filename.includes('\0')
        || filename.includes('/')
    ) {
        result.failed.push({ path: filename, reason: `unsafe path segment rejected: ${filename}` });
        continue;
    }
    const path = `${targetFolder}/${filename}`;
    // ... rest unchanged
}
```

Pin via test: pass `{ 'de': { '../evil.md': '...' } }` as bundle, assert the entry lands in `failed` and not in `written`.

---

### P3: Consider (Low + Info)

#### L-1 (LOW): TOCTOU window between exists() check and write() in TemplateMaterializer

- **CWE-367** Time-of-Check Time-of-Use (TOCTOU) Race Condition
- **Location:** [src/core/templates/TemplateMaterializer.ts:85-104](src/core/templates/TemplateMaterializer.ts#L85)
- **Status:** Resolved (fix-loop 2026-05-21)

**Risk.** The skip-existing path checks `await adapter.exists(path)` and then calls `await adapter.write(path, content)`. A concurrent process or a second Obsidian instance could create the file in the window between the two awaits. The actual blast radius is limited: the materializer only runs in the FirstRun wizard step or via the "Re-materialize templates" button, both single-user actions. Two concurrent re-materialize calls would silently overwrite each other, no data corruption beyond what the user explicitly asked for.

Not worth fixing unless we observe multi-instance reports.

**Remediation.** Two options:

- (a) Document the assumption: single-user, single-instance. Add to JSDoc.
- (b) Use a per-folder lock or rely on the adapter's write-with-noOverwrite path if it exposes one. Obsidian's vault adapter does not, so this would require a custom lock under `<configDir>/.locks/`.

Recommend (a) until we have evidence of multi-instance use.

---

#### L-2 (LOW): VaultTab templates settings init is asymmetric across change handlers

- **CWE-665** Improper Initialization
- **Location:** [src/ui/settings/VaultTab.ts:601-651](src/ui/settings/VaultTab.ts#L601)
- **Status:** Resolved (fix-loop 2026-05-21)

**Risk.** Each of the four template-path `.onChange` handlers defensively initialises `cfg.templates` if it is undefined (left over from old settings layouts). The init list is duplicated four times across the file. If a future contributor adds a fifth template field, they must remember to add the field to all four init objects. Drift between handlers means a partial settings migration could silently miss the new field.

**Remediation.** Extract the default into a helper:

```typescript
// src/types/settings.ts or near DEFAULT_VAULT_INGEST_SETTINGS
export const DEFAULT_INGEST_TEMPLATES = {
    ingestNoteTemplate: '',
    ingestDeepNoteTemplate: '',
    meetingSummaryTemplate: '',
    quellenNotizTemplate: '',
    templatesLanguage: '',
};

// VaultTab.ts onChange handlers
cfg.templates = cfg.templates ?? { ...DEFAULT_INGEST_TEMPLATES };
```

---

#### L-3 (LOW): translator falls back to first-enabled model when activeModelKey is null

- **CWE-1188** Insecure Default Initialization of Resource
- **Location:** [src/core/templates/translateTemplate.ts:42-55](src/core/templates/translateTemplate.ts#L42)
- **Status:** Resolved as accepted-by-design (JSDoc clarifies fallback contract, 2026-05-21)

**Risk.** `pickActiveModel` returns the first enabled model in `activeModels[]` when the user has not set `activeModelKey`. Combined with M-1, this means content can leak to an unexpected provider if the user has multiple models enabled and assumes a specific one. The fallback exists to keep the FirstRun wizard usable before the user picks an active model.

**Remediation.** Document the fallback in the JSDoc. The First-Run wizard should ideally not invoke translation until an active model is picked; the current flow does the LLM step BEFORE the model-picker step. Reorder or gate the translation step on `!!activeModelKey`. Low priority because the fallback is offline-safe (translator returns source unchanged on any provider error).

---

#### L-4 (LOW): User-written ingest templates can inject content into the translation prompt

- **CWE-94** Improper Control of Generation of Code
- **OWASP LLM01** Prompt Injection
- **Location:** [src/core/templates/translateTemplate.ts:58-77](src/core/templates/translateTemplate.ts#L58)
- **Status:** Resolved (fix-loop 2026-05-21) (low: user-content trust boundary)

**Risk.** If a user replaces their vault template (e.g. `Quelle Template.md`) with attacker-crafted YAML that breaks out of the frontmatter (e.g. duplicate `---` markers, embedded prompt-injection strings), and then triggers re-materialize with a custom language, the translation prompt contains the malicious content. The LLM might follow the injected instructions instead of translating.

Trust boundary: the template files live in the user's own vault. If an attacker can write to the user's vault, they have already compromised it. The risk only applies if the user imports a template from an untrusted source.

**Remediation.** Add a defensive content check in `buildTranslationPrompt`: reject sources with more than 2 `---` lines or non-YAML content between the frontmatter markers. Surface a Notice and skip translation for that template.

---

#### I-1 (INFO): Ingest skills do not require source-note re-validation before backlink update

- **OWASP LLM02** Insecure Output Handling
- **Location:** [bundled-skills/ingest/SKILL.md:Step-5](bundled-skills/ingest/SKILL.md) + [bundled-skills/ingest-deep/SKILL.md:Step-5](bundled-skills/ingest-deep/SKILL.md)
- **Status:** Resolved (skill-instruction polish, 2026-05-21)

**Risk.** Step 5 in both skills says "Lade die Quelle-Note via read_file ... update_frontmatter mit Notizen: [[note1]], ..." but does not require the agent to verify that the loaded file is the source it just ingested (versus a hallucinated path). An agent error or adversarial chat input could cause the backlink-update to land on the wrong note.

**Remediation.** Skill-doc polish in `bundled-skills/ingest/SKILL.md` Step 5: add a sentence "Before update_frontmatter, verify the loaded note's frontmatter has the `Kategorie: - Quelle` (or `- Source`) marker. If not, the path is wrong - stop and ask the user." Same in ingest-deep.

---

#### I-2 (INFO): `npm audit` runs on local install; CI does not pin the audit run

- **Location:** No CI hook for `npm audit`
- **Status:** Resolved (new CI workflow `.github/workflows/security-audit.yml`, 2026-05-21)

**Risk.** Dependency-vulnerability surveillance relies on the developer running `npm audit` manually. A future CVE published between audits could land in a release without being caught.

**Remediation.** Add a CI step in `.github/workflows/sync-public.yml` (or a new workflow) that runs `npm audit --audit-level=high` on every push to dev. Fail the workflow on high-severity findings. Low priority because the current cadence (manual audit per release) caught all findings in the AUDIT-EPIC-29 cycle.

---

## Remediation Plan

| Priority | Finding | Remediation | Effort |
|---|---|---|---|
| P2 | M-1 LLM-translation privacy disclosure | Consent banner + 4 KB cap + JSDoc warning | S |
| P2 | M-2 TemplateMaterializer filename validation | Add path-segment check + test pin | XS |
| P3 | L-1 TOCTOU TemplateMaterializer | JSDoc note (single-user assumption) | XS |
| P3 | L-2 VaultTab template defaults asymmetric | Extract DEFAULT_INGEST_TEMPLATES helper | XS |
| P3 | L-3 translator fallback to first-enabled | JSDoc + reorder wizard step | XS |
| P3 | L-4 user-template prompt-injection guard | Reject sources with > 2 `---` markers | S |
| P3 | I-1 ingest backlink source re-validation | Skill-doc polish (ingest + ingest-deep) | XS |
| P3 | I-2 CI npm-audit | New CI step in workflow | M |

Total estimated effort: ~1 day for all P2 + P3.

---

## Positive Findings

The codebase has matured substantially since AUDIT-016. Notable defenses already in place:

- **Path-traversal containment** in `BuiltinSkillMaterializer.ts:96-115`, `SkillsTab.addFolderToZip:529-557`, `skill-translator/scripts/translate.js:69-77` (M-2 above is the one remaining gap for symmetry).
- **Secret-stripping unified** across manual + auto-backup (AUDIT-EPIC-29 H-1 fix).
- **MCP-server whitelist fail-closed** (AUDIT-EPIC-29 fix, was bypassable for empty whitelist).
- **Approval-key collision guard** via `isSafePathSegment` in `pluginApiAdaptive.ts` (AUDIT-EPIC-29 fix).
- **validateJs heuristic explicitly documented as defense-in-depth, not boundary** (AUDIT-EPIC-29 M-1 doc-fix).
- **TRANSLATION.json URL credential stripping** via `sanitizeRepoUrl` (AUDIT-EPIC-29 L-3).
- **Bot-compliance pass** (just-merged) closed 33 obsidianmd-ESLint errors including `window.confirm`/`window.prompt` in SkillVersionsModal, replaced by the Obsidian-native confirmModal/promptModal helpers.
- **Zero npm-audit vulnerabilities** across 1007 deps. License compliance OK (MIT/Apache/BSD/ISC majority, no GPL conflicts).

---

## SCA Details

### Vulnerable Dependencies

None. `npm audit --production` returns "found 0 vulnerabilities" across 1007 dependencies (377 prod, 590 dev, 119 optional).

### License Compliance

| Category | Count | Risk |
|---|---|---|
| MIT, Apache-2.0, BSD-2/3, ISC, 0BSD | majority | OK |
| `Unlicense`, `BlueOak-1.0.0`, `CC0-1.0` (in OR-clauses) | a few | OK (public-domain-equivalent) |
| GPL, AGPL | 0 in production | OK |

No license issues identified.

---

## Appendix

### A. Tools Used

- `npm audit --production --json` (SCA)
- `npx license-checker --production --json` (License Compliance)
- `npx eslint src/` (Code quality - 182 errors, all in `__tests__/` or pre-existing baseline post-bot-compliance-pass)
- `grep -rE` patterns from `references/cwe-patterns.md` for SAST sweep
- Two parallel Explore agents for OWASP Top 10 + LLM Top 10 + SAST on the FEAT-29-13/14/15 + bot-compliance delta
- Manual code review of the new files: `src/core/templates/{TemplateMaterializer,translateTemplate}.ts`, `src/core/utils/templatesFolder.ts`, `src/ui/modals/{FirstRunWizardModal,SkillVersionsModal,PartialTranslationModal}.ts`, `bundled-skills/{ingest,ingest-deep}/SKILL.md`

### B. Files Analyzed

Delta scope since AUDIT-016 (2026-05-03):

- `src/core/templates/` (3 new files)
- `src/core/utils/templatesFolder.ts` (new)
- `src/ui/modals/FirstRunWizardModal.ts` (Templates step added)
- `src/ui/modals/SkillVersionsModal.ts` (bot-compliance rewrite)
- `src/ui/modals/PartialTranslationModal.ts` (bot-compliance rewrite)
- `src/ui/settings/VaultTab.ts` (Templates fields + re-materialize)
- `src/ui/settings/SkillsTab.ts` (source-label trichotomy)
- `src/ui/settings/userSkillSource.ts` (testable helpers)
- `src/core/skills/BuiltinSkillMaterializer.ts` (override-check extended)
- `bundled-skills/skill-creator/scripts/init_skill.js` (source: agent)
- `bundled-skills/ingest/SKILL.md` + `bundled-skills/ingest-deep/SKILL.md` (Step 4+5)

Per-feature audits in the period covered the rest: AUDIT-FEAT-29-01 (folder consolidation), -02 (plugin-skill format), -03+-04 (discovery + notice capture), -05 (skill-creator), -06 (sandbox first-class), -09 (skill versioning), -11 (skill layout), -EPIC-29 (close-out for 29-07, -08, -10, -12).

### C. Excluded from Analysis

- `src/**/__tests__/` (19 obsidianmd-rule violations in tests, bot ignores)
- `src/_generated/**` (build-generated, gitignored)
- `forked-kilocode/` (reference-only, not deployed)
- Public docs (`docs/`): only the VitePress CSS subset is in the public release pipeline, no source-code execution
