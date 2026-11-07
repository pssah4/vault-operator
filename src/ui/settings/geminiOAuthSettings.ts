/** Provider draft ownership and embedding account selection (FEAT-04-14). */
import type { ProviderConfig } from '../../types/settings';
export interface GeminiOAuthDraft { clientId: string; clientSecret: string; projectId: string }
export function geminiOAuthDraftChanged(provider: ProviderConfig, draft: GeminiOAuthDraft): boolean {
    return provider.geminiOAuthClientId !== (draft.clientId.trim() || undefined)
        || provider.geminiOAuthClientSecret !== (draft.clientSecret.trim() || undefined)
        || provider.geminiOAuthProjectId !== (draft.projectId.trim() || undefined);
}
export function applyGeminiOAuthDraft(provider: ProviderConfig, draft: GeminiOAuthDraft): ProviderConfig {
    const next = { ...provider, apiKey: undefined, baseUrl: undefined, geminiOAuthClientId: draft.clientId.trim() || undefined, geminiOAuthClientSecret: draft.clientSecret.trim() || undefined, geminiOAuthProjectId: draft.projectId.trim() || undefined };
    if (geminiOAuthDraftChanged(provider, draft)) {
        delete next.geminiOAuthRefreshToken; delete next.geminiOAuthSessionId;
        next.discoveredModels = []; next.lastRefreshAt = 0; next.tierMapping = {}; next.tierOverrides = {};
    }
    return next;
}
export function geminiOAuthChoices(providers: ProviderConfig[]): Array<{ id: string; label: string }> {
    return providers.filter(provider => provider.type === 'gemini-oauth' && provider.enabled && !!provider.geminiOAuthRefreshToken)
        .map(provider => ({ id: provider.id, label: provider.displayName || provider.id }));
}
