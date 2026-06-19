---
id: IMP-19-01-01
feature: FEAT-19-01
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: [FEAT-19-01]
created: 2026-06-20
---

# IMP-19-01-01, Auto-batch fix for deterministic rule-based health findings

## Context

The Vault Health Check produces nine finding types. Three of them are deterministic reciprocity / consistency rules that the user never wants to evaluate one-by-one:

- `missing_backlinks` — Note A links to Note B via a frontmatter MOC property, but B does not link back. Always fixable (push the reverse wikilink).
- `category_mismatch` — Note categorized as `Thema` is referenced via the wrong frontmatter property (e.g. `Konzepte:` instead of `Themen:`). Always fixable (move to the right property).
- `inconsistent_tags` — Tags that differ only in case. Always fixable (normalize to the canonical case).

Today these three findings are already in `REPAIRABLE_CHECKS`. The modal pre-checks them, the user clicks "Repair selected (N)" at the **bottom** of the Findings tab, and the batch runs through `VaultHealthService.fixMissingBacklinks()` / `cleanupInvalidBacklinks()`.

User pain (2026-06-20): with 100+ trivial findings the user still scrolls through the whole list to verify nothing else is selected, never sees the bottom button immediately, and the deterministic findings clutter the modal where real decisions live.

User quote: *"Das wir gegenseitige Backlinks haben möchten ist eine Regel, keine Entscheidung."*

## Goal

Reduce the click count and the cognitive load to zero for the three rule-based finding types while preserving safety (Checkpoint + Undo).

## Acceptance criteria

| AC | Description |
|---|---|
| AC-01 | A "Auto-fix N trivial issues" CTA banner renders at the **top** of the Findings tab when at least one finding is in REPAIRABLE_CHECKS. |
| AC-02 | The CTA shows the count of REPAIRABLE findings, not the total finding count. |
| AC-03 | Clicking the CTA selects every REPAIRABLE finding (regardless of current severity filter), invokes the existing `runRepair()` path, and re-renders the results screen. |
| AC-04 | The existing "Repair selected (N)" button at the bottom of the Findings tab stays unchanged for selective repairs. |
| AC-05 | A new settings flag `vaultHealth.autoApplyRuleRepairs: boolean` is added under the Vault Health sub-section, default OFF. |
| AC-06 | When the flag is ON: opening the health modal via the sidebar badge triggers `runRepair()` on every REPAIRABLE finding **before** the modal is shown, then opens the modal with the remaining (non-repairable) findings only. |
| AC-07 | The auto-apply path creates the same `GitCheckpointService.snapshot()` checkpoint the manual path creates; Undo via the post-repair screen works the same way. |
| AC-08 | When the flag is ON and zero non-repairable findings remain after the auto-apply, a Notice surfaces ("Auto-fixed N issues, nothing left to review") and the modal does not open. |
| AC-09 | When the auto-apply runs but no REPAIRABLE findings exist, the modal opens as today without surfacing the auto-fix code path. |
| AC-10 | The settings UI explicitly lists the three rule types covered ("missing backlinks, category mismatches, inconsistent tags") so the user knows what gets auto-applied. |

## Binding constraints

| C | Description |
|---|---|
| C-01 | NO new repair logic. The auto-fix uses the existing `runRepair()` method verbatim; only the trigger surface is new. |
| C-02 | Default OFF for the auto-apply setting. Verhaltensändernde Defaults are not acceptable without explicit user opt-in. |
| C-03 | Checkpoint runs before any repair, identical to the manual path. Auto-apply is NOT a "skip safety" shortcut. |
| C-04 | The CTA banner respects the existing severity filter UI: it always reflects the total REPAIRABLE count across all severities, not the filtered subset. Selective-repair via the bottom button stays the per-filter path. |
| C-05 | The "broken_links" and "weak_clusters" checks are explicitly NOT in scope. They need user decisions (create stub vs remove / link vs ignore) and stay manual. |
| C-06 | The mobile guard for non-desktop devices must not break: the CTA is allowed on mobile because the repair already works (FrontmatterWriter is desktop-safe). |
| C-07 | If the auto-apply triggers during opening but the checkpoint creation fails, the auto-apply still proceeds with a `console.warn` (same fallback as the manual path). |
| C-08 | The CTA text and severity styling reuse the existing `.vault-health-section` / `.vault-health-severity.severity-low` / `.mod-cta` CSS so it visually anchors above the filter pills without new CSS. |

## Out of scope

- Auto-fix for `broken_links` (needs decision).
- Auto-fix for `weak_clusters` (needs decision).
- Auto-fix for `cluster_freshness` (cluster-level freshness lint, lives in Knowledge review).
- Per-check auto-fix toggles (one flag covers all three rule types).
- A scheduler that runs auto-fix on a timer without user trigger.

## Component sketch

```
VaultHealthRepairModal.showFindings (top of method, before severity-filter)
└── if repairableCount > 0:
    └── renderAutoFixBanner(contentEl, repairableCount)
        └── single button "Auto-fix N trivial issues"
        └── click -> selectAllRepairable() + runRepair()

AgentSidebarView.openHealthModal
├── findings = getFindings()
├── if settings.vaultHealth.autoApplyRuleRepairs && repairableCount > 0:
│   ├── runAutoApply(findings)
│   │   ├── snapshot()
│   │   └── per check type: call existing repair method
│   ├── refreshFindings()
│   └── if remaining === 0: Notice; return
└── new VaultHealthRepairModal(...).open()

src/types/settings.ts
└── PluginSettings.vaultHealth.autoApplyRuleRepairs: boolean (default false)

src/ui/settings/VaultTab.ts
└── new Setting in the existing Vault Health subsection
```

## References

- `src/ui/modals/VaultHealthRepairModal.ts:65-68` -- REPAIRABLE_CHECKS source of truth
- `src/ui/modals/VaultHealthRepairModal.ts:664-678` -- existing "Repair selected" button
- `src/ui/modals/VaultHealthRepairModal.ts:923+` -- `runRepair()` batch implementation
- `src/core/knowledge/VaultHealthService.ts:680-786` -- `fixMissingBacklinks()` repair logic
- `src/ui/AgentSidebarView.ts:1374-1383` -- `openHealthModal()` call site
