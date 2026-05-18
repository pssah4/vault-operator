/**
 * Onboarding flow detection -- FIX-24-09-01.
 *
 * The previous check `!settings.onboarding.completed` was ambiguous: it
 * returned true both for users currently in the first-time wizard AND
 * for users who abandoned the wizard early but then used the plugin
 * productively (the wizard's `completed` flag stays `false` forever in
 * that case). The system prompt's onboarding-aware sections
 * (skill-directory, plugin-skills) treated both cases the same way and
 * suppressed the sections for productive users.
 *
 * `isActiveOnboardingFlow` adds an empirical disambiguation: a user who
 * has configured at least one model is no longer in the first-time
 * wizard, regardless of the `completed` flag. The wizard itself sets
 * `completed=true` when finished; users who abandoned it leave
 * `completed=false` but have at least one model in `activeModels`.
 *
 * This helper is read-only and does NOT auto-flip `completed=true` on
 * its own. The wizard remains the single writer of that flag (see
 * `OnboardingService.markCompleted`).
 *
 * Other callers of `onboarding.completed` (e.g.
 * `OnboardingService.needsOnboarding`, the wizard flow itself,
 * `UpdateSettingsTool` writability list) keep their semantics; they
 * answer a different question ("should we offer onboarding?") which
 * is NOT what the system-prompt gates need.
 */

import type { ObsidianAgentSettings } from '../types/settings';

export function isActiveOnboardingFlow(settings: ObsidianAgentSettings): boolean {
    if (settings.onboarding.completed) return false;
    // EPIC-26 follow-up: post-migration `activeModels[]` is empty even for
    // productive users; the new tier surface lives in `providerConfigs[]`.
    // Treat "has any provider OR has any legacy model" as "no longer in
    // first-time wizard".
    if (settings.activeModels.length > 0) return false;
    if ((settings.providerConfigs ?? []).length > 0) return false;
    return true;
}
