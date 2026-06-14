/**
 * ChatGptOAuthService: account-id recovery from stored tokens.
 *
 * Sign-ins captured before the nested-claim fix stored an empty accountId
 * (the old parser looked for a flat dotted key instead of descending into the
 * nested `https://api.openai.com/auth` object). Without accountId the
 * chatgpt-account-id header is dropped and the Codex backend rejects every
 * model. loadFromSettings must re-derive accountId from the tokens it already
 * holds, no re-login required.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../security/SafeStorageService', () => ({
    SafeStorageService: class {
        isAvailable(): boolean { return true; }
    },
}));

import { ChatGptOAuthService } from '../ChatGptOAuthService';
import type { ObsidianAgentSettings } from '../../../types/settings';

function makeJwt(payload: Record<string, unknown>): string {
    const b64 = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'none' })}.${b64(payload)}.`;
}

const OPENAI_AUTH = 'https://api.openai.com/auth';

describe('ChatGptOAuthService account-id recovery', () => {
    it('recovers accountId and planTier from the access token when settings stored them empty', () => {
        const accessToken = makeJwt({
            [OPENAI_AUTH]: { chatgpt_account_id: 'acct-789', chatgpt_plan_type: 'pro' },
            email: 'codex@example.com',
        });
        const settings = {
            chatgptOAuthAccessToken: accessToken,
            chatgptOAuthRefreshToken: 'rt',
            chatgptOAuthIdToken: '',
            chatgptOAuthAccountId: '',   // lost by the old flat-key parser
            chatgptOAuthEmail: '',
            chatgptOAuthPlanTier: '',
            chatgptOAuthExpiresAt: Date.now() + 3_600_000,
        } as unknown as ObsidianAgentSettings;

        const svc = ChatGptOAuthService.getInstance();
        svc.loadFromSettings(settings);

        const info = svc.getAccountInfo();
        expect(info.accountId).toBe('acct-789');
        expect(info.planTier).toBe('pro');
        expect(svc.getAccountId()).toBe('acct-789');
    });

    it('keeps an existing non-empty accountId untouched', () => {
        const settings = {
            chatgptOAuthAccessToken: makeJwt({ [OPENAI_AUTH]: { chatgpt_account_id: 'from-token' } }),
            chatgptOAuthRefreshToken: 'rt',
            chatgptOAuthIdToken: '',
            chatgptOAuthAccountId: 'already-set',
            chatgptOAuthEmail: '',
            chatgptOAuthPlanTier: '',
            chatgptOAuthExpiresAt: Date.now() + 3_600_000,
        } as unknown as ObsidianAgentSettings;

        const svc = ChatGptOAuthService.getInstance();
        svc.loadFromSettings(settings);
        expect(svc.getAccountId()).toBe('already-set');
    });
});
