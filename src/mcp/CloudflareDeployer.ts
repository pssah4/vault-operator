/**
 * CloudflareDeployer -- Deploy the Obsilo Relay Worker to Cloudflare via REST API.
 *
 * No CLI, no wrangler, no terminal. Uses Obsidian's requestUrl (Review-Bot compliant).
 * The user provides a Cloudflare API token, and this class handles:
 * 1. Account ID discovery
 * 2. Worker script upload with Durable Object bindings
 * 3. Secret (auth token) configuration
 *
 * FEATURE-1403: Remote Transport
 * ADR-055: Remote MCP Relay
 */

import { requestUrl } from 'obsidian';
import { RELAY_WORKER_CODE, RELAY_WORKER_METADATA } from './relayWorkerCode';

const CF_API = 'https://api.cloudflare.com/client/v4';
const WORKER_NAME = 'obsilo-relay';

export interface DeployResult {
    url: string;
    accountId: string;
}

export class CloudflareDeployer {
    constructor(private apiToken: string) {}

    /**
     * Deploy the relay worker to Cloudflare.
     * @param relaySecret - Shared secret for authenticating requests to the relay
     * @param onProgress - Progress callback for UI updates
     */
    async deploy(
        relaySecret: string,
        onProgress?: (step: string) => void,
    ): Promise<DeployResult> {
        // 0. Verify token is valid
        onProgress?.('Verifying API token...');
        await this.verifyToken();

        // 1. Get account ID
        onProgress?.('Detecting Cloudflare account...');
        const accountId = await this.getAccountId();

        // 2. Get workers.dev subdomain
        onProgress?.('Getting workers subdomain...');
        const subdomain = await this.getSubdomain(accountId);

        // 3. Delete existing worker (if any) to avoid migration conflicts
        onProgress?.('Removing old relay (if exists)...');
        try { await this.undeploy(accountId); } catch { /* not found is fine */ }

        // 4. Upload worker script with DO bindings
        onProgress?.('Uploading relay server...');
        await this.uploadWorker(accountId);

        // 4. Set the auth secret
        onProgress?.('Setting auth token...');
        await this.setSecret(accountId, 'RELAY_TOKEN', relaySecret);

        // 5. Ensure workers.dev route is enabled
        onProgress?.('Activating...');
        await this.enableWorkersDevRoute(accountId);

        const url = `https://${WORKER_NAME}.${subdomain}.workers.dev`;
        onProgress?.(`Done! Relay URL: ${url}`);

        return { url, accountId };
    }

    /**
     * Update the relay worker code without changing the token or deleting the DO.
     * Skips migration (DO already exists) and reuses the existing secret.
     */
    async redeploy(
        accountId: string,
        relaySecret: string,
        onProgress?: (step: string) => void,
    ): Promise<void> {
        onProgress?.('Verifying API token...');
        await this.verifyToken();

        onProgress?.('Uploading relay server...');
        await this.uploadWorkerUpdate(accountId);

        onProgress?.('Setting auth token...');
        await this.setSecret(accountId, 'RELAY_TOKEN', relaySecret);

        onProgress?.('Done!');
    }

    /** Upload worker code without migration metadata (for updates). */
    private async uploadWorkerUpdate(accountId: string): Promise<void> {
        const metadata = {
            main_module: RELAY_WORKER_METADATA.main_module,
            bindings: RELAY_WORKER_METADATA.bindings,
            compatibility_date: RELAY_WORKER_METADATA.compatibility_date,
            // No migrations -- DO already exists
        };

        const boundary = '----ObsiloRelayUpdate' + Date.now();
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="metadata"; filename="metadata.json"',
            'Content-Type: application/json',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            `Content-Disposition: form-data; name="worker.js"; filename="worker.js"`,
            'Content-Type: application/javascript+module',
            '',
            RELAY_WORKER_CODE,
            `--${boundary}--`,
        ].join('\r\n');

        const response = await requestUrl({
            url: `${CF_API}/accounts/${accountId}/workers/scripts/${WORKER_NAME}`,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.apiToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
            throw: false,
        });

        if (response.status >= 400) {
            let detail = `HTTP ${response.status}`;
            try {
                const data = response.json as { errors?: Array<{ message: string; code: number }> };
                if (data.errors?.length) {
                    detail = data.errors.map(err => err.message).join('; ');
                }
            } catch { /* response might not be JSON */ }
            throw new Error(`Worker update failed: ${detail}`);
        }
    }

    /** Delete the deployed relay worker. */
    async undeploy(accountId: string): Promise<void> {
        await this.cfRequest('DELETE', `/accounts/${accountId}/workers/scripts/${WORKER_NAME}`);
    }

    // -----------------------------------------------------------------------
    // Cloudflare API calls
    // -----------------------------------------------------------------------

    private async verifyToken(): Promise<void> {
        try {
            const data = await this.cfRequest('GET', '/user/tokens/verify');
            const result = data.result as { status?: string };
            if (result?.status !== 'active') {
                throw new Error(`API token is not active (status: ${result?.status ?? 'unknown'}). Please check your Cloudflare dashboard.`);
            }
        } catch (e) {
            if (e instanceof Error && e.message.includes('not active')) throw e;
            throw new Error(`API token verification failed. Make sure you copied the full token: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async getAccountId(): Promise<string> {
        const data = await this.cfRequest('GET', '/accounts?page=1&per_page=1');
        const accounts = data.result as Array<{ id: string }>;
        if (!accounts || accounts.length === 0) {
            throw new Error('No Cloudflare account found. Make sure your API token has account access.');
        }
        return accounts[0].id;
    }

    private async getSubdomain(accountId: string): Promise<string> {
        try {
            const data = await this.cfRequest('GET', `/accounts/${accountId}/workers/subdomain`);
            const subdomain = (data.result as { subdomain?: string })?.subdomain;
            if (subdomain) return subdomain;
        } catch {
            // Subdomain not set yet -- try to create one
        }

        // Create a subdomain if none exists
        const name = `obsilo-${accountId.slice(0, 8)}`;
        try {
            await this.cfRequest('PUT', `/accounts/${accountId}/workers/subdomain`, { subdomain: name });
            return name;
        } catch {
            throw new Error('Could not determine workers.dev subdomain. Please set one in the Cloudflare dashboard under Workers & Pages.');
        }
    }

    private async uploadWorker(accountId: string): Promise<void> {
        // Cloudflare Workers Script Upload uses multipart form data
        // with a metadata part (JSON) and a script part (JavaScript module)
        const metadata = {
            ...RELAY_WORKER_METADATA,
            // Bindings include the RELAY_TOKEN secret (will be set separately)
        };

        const boundary = '----ObsiloRelayUpload' + Date.now();
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="metadata"; filename="metadata.json"',
            'Content-Type: application/json',
            '',
            JSON.stringify(metadata),
            `--${boundary}`,
            `Content-Disposition: form-data; name="worker.js"; filename="worker.js"`,
            'Content-Type: application/javascript+module',
            '',
            RELAY_WORKER_CODE,
            `--${boundary}--`,
        ].join('\r\n');

        // Use throw:false so we can read the actual Cloudflare error response
        const response = await requestUrl({
            url: `${CF_API}/accounts/${accountId}/workers/scripts/${WORKER_NAME}`,
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.apiToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
            throw: false,
        });

        if (response.status >= 400) {
            let detail = `HTTP ${response.status}`;
            try {
                const data = response.json as { errors?: Array<{ message: string; code: number }> };
                if (data.errors?.length) {
                    detail = data.errors.map(err => err.message).join('; ');
                }
            } catch { /* response might not be JSON */ }
            throw new Error(`Worker upload failed: ${detail}`);
        }
    }

    private async setSecret(accountId: string, name: string, value: string): Promise<void> {
        await this.cfRequest('PUT', `/accounts/${accountId}/workers/scripts/${WORKER_NAME}/secrets`, {
            name,
            text: value,
            type: 'secret_text',
        });
    }

    private async enableWorkersDevRoute(accountId: string): Promise<void> {
        try {
            // Ensure the workers.dev route is enabled for the script
            await this.cfRequest('POST', `/accounts/${accountId}/workers/scripts/${WORKER_NAME}/subdomain`, {
                enabled: true,
            });
        } catch {
            // May already be enabled or not supported on this plan -- non-fatal
        }
    }

    // -----------------------------------------------------------------------
    // Generic API helper
    // -----------------------------------------------------------------------

    private async cfRequest(method: string, path: string, body?: unknown): Promise<{ result: unknown; success: boolean }> {
        const options: Parameters<typeof requestUrl>[0] = {
            url: `${CF_API}${path}`,
            method,
            headers: {
                'Authorization': `Bearer ${this.apiToken}`,
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        let response;
        try {
            response = await requestUrl(options);
        } catch (e: unknown) {
            // Obsidian's requestUrl throws on non-2xx with message "Request failed, status NNN"
            const msg = e instanceof Error ? e.message : String(e);
            const statusMatch = msg.match(/status\s+(\d+)/);
            const status = statusMatch ? parseInt(statusMatch[1]) : 0;
            if (status === 403) {
                throw new Error(`Permission denied (${method} ${path}). Your API token needs: Account / Workers Scripts / Edit and Account / Account Settings / Read, with "All accounts" selected.`);
            }
            throw new Error(`Cloudflare API error ${status}: ${msg}`);
        }

        const data = response.json as { result: unknown; success: boolean; errors?: Array<{ message: string }> };

        if (!data.success) {
            const errMsg = data.errors?.map(e => e.message).join(', ') ?? 'Unknown Cloudflare API error';
            throw new Error(errMsg);
        }

        return data;
    }
}
