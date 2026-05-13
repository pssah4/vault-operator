/**
 * Mode Definition Section
 *
 * Injects the active mode's name and role definition.
 *
 * FEAT-24-04 / ADR-113: when `roleOverride` is set (subagent profile path),
 * it REPLACES `mode.roleDefinition` so the spawned subagent gets a lean
 * profile prompt instead of inheriting the parent's full mode role. The
 * mode header stays so the agent can still tell it is in Agent mode; only
 * the role body changes.
 */

import type { ModeConfig } from '../../../types/settings';

export function getModeDefinitionSection(mode: ModeConfig, roleOverride?: string): string {
    return [
        '',
        '====',
        '',
        `MODE: ${mode.name.toUpperCase()}`,
        '',
        roleOverride ?? mode.roleDefinition,
    ].join('\n');
}
