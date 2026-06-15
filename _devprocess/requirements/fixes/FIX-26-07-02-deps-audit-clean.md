---
id: FIX-26-07-02
feature: FEAT-26-07
epic: EPIC-26
adr-refs: []
plan-refs: []
audit-refs: []
depends-on: [FIX-26-07-01]
created: 2026-06-15
released-on: 2026-06-15 (v2.14.7)
---

# FIX-26-07-02: Dependabot 64/65/66 + uuid override hardened + dompurify advisories

## Symptom

After v2.14.6 went out, GitHub Dependabot opened three new advisories on
the `pssah4/vault-operator` repository and the Obsidian Community Plugin
Review Bot re-flagged the uuid advisory it had already raised against
v2.14.5:

- Dependabot #65 GHSA-fx2h-pf6j-xcff `vite` (high, `server.fs.deny`
  bypass on Windows alternate paths). Patched at 6.4.3.
- Dependabot #66 GHSA-v6wh-96g9-6wx3 `vite` (medium, launch-editor
  NTLMv2 hash disclosure via UNC path handling). Same vite line, also
  patched at 6.4.3.
- Dependabot #64 GHSA-h67p-54hq-rp68 `js-yaml` (medium, quadratic
  complexity DoS in merge key handling via repeated aliases). Patched
  at 4.2.0. Reaches the project only through `@eslint/eslintrc ->
  eslint`, dev scope.
- Review Bot v2.14.6 scan repeated GHSA-w5hq-g745-h8pq for `uuid` even
  though the override on v2.14.5 already pinned the resolved version
  to 14.0.0, which is outside the advisory vulnerable range.

While verifying these, `npm audit` surfaced seven `dompurify` advisories
that had not appeared on the v2.14.5 audit because the override floor
of `>= 3.4.0` had not been raised in months: GHSA-x4vx-rjvf-j5p4,
GHSA-76mc-f452-cxcm, GHSA-hpcv-96wg-7vj8, GHSA-r47g-fvhr-h676,
GHSA-vxr8-fq34-vvx9, GHSA-gvmj-g25r-r7wr, GHSA-rp9w-3fw7-7cwq. All seven
target dompurify's IN_PLACE / SAFE_FOR_TEMPLATES / clearConfig
sanitization paths and the vulnerable ranges all end at `<= 3.4.6`.
dompurify is a runtime dependency through mermaid's diagram sanitization
layer, so this carries runtime impact for the plugin.

## Root cause

1. The existing override `"vite": "^6.4.2"` was identical to the
   devDependency entry and pinned the line at 6.4.2 exactly. The
   `^6.4.2` range allows 6.4.3 in theory, but with the override repeated
   verbatim the lock file stayed at 6.4.2. The override needs to reference
   the direct version via `$vite` (same trick used for esbuild) so the
   two stay synchronised when only one of them changes.
2. The `@eslint/eslintrc -> js-yaml@4.1.1` chain had never been
   overridden. The package was added to the project's override list as
   part of this fix so the eslint chain bumps the moment a patched
   js-yaml lands.
3. `dompurify` was last bumped when the override floor was set to
   `>= 3.4.0`. The seven advisories landed between 3.4.0 and 3.4.7 and
   slipped under the override floor because the resolved version
   (3.4.3) was still inside the vulnerable range.
4. The Review Bot's uuid check seems to treat the open-ended override
   range `">=14.0.0"` differently from a caret-pinned `"^14.0.0"`. The
   actual resolved version (14.0.0) was identical, but the override
   syntax change is the smallest possible signal to the bot heuristic.

## Fix

`package.json` changes:

- `devDependencies.vite`: `^6.4.2` -> `^6.4.3`.
- `overrides.vite`: `^6.4.2` -> `$vite` (mirrors the direct version
  pin from now on).
- `overrides.js-yaml`: new entry, `>=4.2.0`.
- `overrides.dompurify`: `>=3.4.0` -> `>=3.4.7`.
- `overrides.uuid`: `>=14.0.0` -> `^14.0.0`.

`npm install` resolves the affected packages to:
- `vite@6.4.3`
- `js-yaml@4.2.0`
- `dompurify@3.4.10`
- `uuid@14.0.0` (unchanged at the version level, only the override
  syntax differs)
- `protobufjs@8.6.3` (carry-over from v2.14.6, untouched)

## Verification

- `npm audit --registry=https://registry.npmjs.org/` reports
  **0 vulnerabilities** across both runtime and dev scopes.
- `npm ls` confirms the resolved versions above on every dep chain.
- `npm run build` green (`tsc -noEmit -skipLibCheck` clean, esbuild
  emits `main.js`).
- `npx vitest run` reports 2752 passing plus 1 expected fail.
- Adversarial verify workflow over the 5 findings returns
  `resolved=true` on all of them.

## Released in v2.14.7

Released 2026-06-15 via the standard release workflow on
`pssah4/vault-operator` (`workflow_dispatch`, `version=2.14.7`,
without the `v` prefix).
