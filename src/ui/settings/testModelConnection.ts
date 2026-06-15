/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
import { requestUrl } from 'obsidian';
import type { CustomModel, ProviderType } from '../../types/settings';
import { buildApiHandler } from '../../api/index';
import { modelToLLMProvider } from '../../types/settings';
import { GitHubCopilotAuthService } from '../../core/security/GitHubCopilotAuthService';
import { KiloAuthService } from '../../core/security/KiloAuthService';
import { KiloMetadataService } from '../../core/providers/KiloMetadataService';
import { extractRegionFromBedrockUrl } from '../../api/providers/bedrock';

/**
 * Bedrock-specific credentials for the Fetch Models button. Mirrors the form
 * fields from ModelConfigModal so the UI can hand them over as-is.
 */
export interface BedrockFetchCredentials {
    region?: string;
    /** FEAT-26-07 adds 'gateway' (enterprise APIM proxy). */
    authMode?: 'api-key' | 'access-key' | 'gateway';
    apiKey?: string;
    accessKey?: string;
    secretKey?: string;
    sessionToken?: string;
    endpoint?: string;
}


// ---------------------------------------------------------------------------
// Shared types for untyped provider API responses
// ---------------------------------------------------------------------------

/** Shape of a single entry returned by provider model-list APIs. */
interface ApiModelEntry {
    id?: string;
    model?: string;
    name?: string;
    display_name?: string;
    created?: number;
    supported_parameters?: string[];
}

/** Shape of a single Ollama model entry. */
interface OllamaModelEntry {
    name: string;
}

/** Shape of an Azure deployment entry. */
interface AzureDeploymentEntry {
    id?: string;
    model?: string;
}

// ---------------------------------------------------------------------------
// OpenAI chat-completion model filter
// ---------------------------------------------------------------------------

/**
 * OpenAI's `/v1/models` returns every model the account has access to,
 * including modalities that are NOT callable through `/v1/chat/completions`:
 *
 *   - Realtime / Audio / TTS / Transcribe (different endpoints + payloads)
 *   - Image generation (DALL-E, gpt-image-*)
 *   - Search-tuned variants (gpt-4o-search-preview, gpt-5-search-api)
 *   - Deep Research (Responses API)
 *   - Codex (legacy completions or Responses)
 *   - Pro variants (gpt-5-pro, gpt-5.x-pro, o1-pro, o3-pro) -- Responses API only
 *   - Embeddings (text-embedding-*) -- excluded by the prefix check
 *
 * Picking one of these for tier mapping leads to a Test-Connection failure
 * with a confusing "model not supported in v1/chat/completions" error.
 * Filter them out so the tier classifier only sees real chat models.
 */
const CHAT_PREFIX_RE = /^(gpt-|o[1-9]|chatgpt-|codex-)/;

const NONCHAT_EXCLUDE_RE = new RegExp([
    // Legacy / fine-tune / 32k variants
    String.raw`-(instruct|vision-preview|0314|0301|0613|0914|32k)$`,
    String.raw`:ft-`,
    // Non-chat modalities anywhere in the id (token-bounded by `-` or end)
    String.raw`(?:^|-)(?:realtime|audio|tts|transcribe|whisper|image|search-preview|search-api|deep-research)(?:-|$)`,
    // Responses-API-only "pro" variants: gpt-5-pro, gpt-5.2-pro, o3-pro-2025-..., o1-pro
    String.raw`(?:^|-)pro(?:-\d|$)`,
    // Codex models route through a different endpoint
    String.raw`-codex(?:-|$)`,
    // chatgpt-image-latest, chatgpt-realtime-*, etc.
    String.raw`^chatgpt-(?:image|realtime|audio|tts)`,
].join('|'), 'i');

export function isOpenAIChatCompletionModel(id: string): boolean {
    if (!id) return false;
    if (!CHAT_PREFIX_RE.test(id)) return false;
    if (NONCHAT_EXCLUDE_RE.test(id)) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

interface TestResult {
    ok: boolean;
    message: string;
    detail?: string;
}

async function testModelConnection(model: CustomModel): Promise<TestResult> {
    // Gemini: use requestUrl directly (bypasses CORS restrictions in Electron renderer)
    if (model.provider === 'gemini') {
        return testGeminiConnection(model);
    }
    // Bedrock: pre-validate required fields before instantiating the client so the user
    // gets a clear message instead of a low-level SDK throw.
    if (model.provider === 'bedrock') {
        // Region may come from the explicit field or be encoded in the endpoint URL
        // (e.g. https://bedrock-runtime.eu-central-1.amazonaws.com).
        const regionFromUrl = model.baseUrl?.match(/^https?:\/\/(?:[^.]+\.)?([a-z]{2}-[a-z]+-\d+)\.amazonaws\.com/i)?.[1]?.toLowerCase();
        if (!model.awsRegion && !regionFromUrl) {
            return {
                ok: false,
                message: 'AWS region required',
                detail: 'Pick a region in the dropdown, or enter an endpoint URL containing a region (e.g. bedrock-runtime.eu-central-1.amazonaws.com).',
            };
        }
        const authMode = model.awsAuthMode ?? 'api-key';
        if (authMode === 'api-key') {
            if (!model.awsApiKey) {
                return {
                    ok: false,
                    message: 'Bedrock API key required',
                    detail: 'Paste the bearer token from the Bedrock console or from the AWS_BEARER_TOKEN_BEDROCK environment variable.',
                };
            }
        } else if (authMode === 'access-key') {
            if (!model.awsAccessKey || !model.awsSecretKey) {
                return {
                    ok: false,
                    message: 'AWS credentials required',
                    detail: 'Fill both access key ID and secret access key, or switch to the Bedrock API key mode.',
                };
            }
        } else {
            // FEAT-26-07 gateway mode pre-flight
            if (!model.baseUrl) {
                return {
                    ok: false,
                    message: 'Gateway endpoint required',
                    detail: 'Enter the full gateway base URL (e.g. https://gateway.example.com/bedrock).',
                };
            }
            if (!model.gatewayHeaderValue) {
                return {
                    ok: false,
                    message: 'Gateway subscription key required',
                    detail: 'Paste the subscription key for the enterprise Bedrock gateway.',
                };
            }
        }
    }
    try {
        const lp = modelToLLMProvider({ ...model, maxTokens: 16 });
        const handler = buildApiHandler(lp);
        const abort = new AbortController();
        // Ollama needs to swap models into memory. allow up to 30 s; Copilot/Kilo/Bedrock may need extra time
        const timeoutMs = model.provider === 'ollama' ? 30000
            : (model.provider === 'github-copilot' || model.provider === 'kilo-gateway' || model.provider === 'bedrock') ? 15000
            : 8000;
        const timer = window.setTimeout(() => abort.abort(), timeoutMs);
        try {
            const stream = handler.createMessage(
                'You are a test.',
                [{ role: 'user', content: 'Hi' }],
                [],
                abort.signal,
            );
            for await (const chunk of stream) {
                if (chunk.type === 'text' || chunk.type === 'usage') break;
            }
            return { ok: true, message: 'Connection successful ✓' };
        } finally {
            window.clearTimeout(timer);
        }
    } catch (err: unknown) {
        const isOllama = model.provider === 'ollama';
        const errObj = err as { message?: string; status?: number; statusCode?: number; name?: string };
        const msg: string = errObj?.message ?? '';
        const s: number | undefined = errObj?.status;
        const isNetworkError = !s && (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ECONNREFUSED') || msg.includes('ERR_CONNECTION_REFUSED'));

        if (errObj?.name === 'AbortError') {
            return {
                ok: false,
                message: isOllama ? 'Connection timed out (30 s)' : 'Connection timed out (8 s)',
                detail: isOllama
                    ? 'Ollama did not respond in time. Two possible causes:\n\n1. Ollama is not running → start it: ollama serve\n2. The model is large and still loading into memory → wait a moment and try again.'
                    : 'The server did not respond in time. Check your Base URL.',
            };
        }

        if (isNetworkError) {
            return {
                ok: false,
                message: 'Cannot connect to server',
                detail: isOllama
                    ? 'Ollama is not reachable at the Base URL. Make sure Ollama is running. It should start automatically after installation. You can also start it manually: ollama serve'
                    : 'Check that the Base URL is correct and the server is running.',
            };
        }

        if (s === 401) {
            return {
                ok: false,
                message: 'Invalid API key (401)',
                detail: model.provider === 'anthropic'
                    ? 'The key should start with sk-ant-... Get it from console.anthropic.com → API Keys.'
                    : model.provider === 'openai'
                    ? 'The key should start with sk-... Get it from platform.openai.com → API Keys.'
                    : 'Check that you copied the full API key from your provider dashboard.',
            };
        }

        if (s === 404) {
            if (isOllama) {
                return {
                    ok: false,
                    message: `Model "${model.name}" not found in Ollama`,
                    detail: `The model name must match exactly what Ollama has installed.\n\n1. Open a Terminal and run: ollama list\n2. Copy the exact name shown (e.g. llama3.2:latest)\n3. Paste it into the Model ID field above.\n\nIf the model is not installed yet: ollama pull ${model.name}`,
                };
            }
            return {
                ok: false,
                message: 'Model not found (404)',
                detail: 'The Model ID does not exist for this provider. Check the exact model name in your provider\'s documentation.',
            };
        }

        if (s === 429) {
            return { ok: false, message: 'Rate limit reached (429)', detail: 'You\'ve sent too many requests. Wait a moment and try again.' };
        }

        if (s === 403) {
            return { ok: false, message: 'Access denied (403)', detail: 'Your API key may not have permission to use this model, or billing is required.' };
        }

        // Bedrock error name mapping. AWS SDK raises typed errors with a `name` field
        // instead of an HTTP status, so the generic 401/403/404 branches above do not
        // catch them. Map the common ones to user-actionable messages.
        if (model.provider === 'bedrock') {
            const name = errObj?.name ?? '';
            if (name === 'UnrecognizedClientException' || name === 'InvalidSignatureException') {
                return {
                    ok: false,
                    message: 'Invalid AWS credentials',
                    detail: 'Check that the Access key ID and Secret access key are correct and still active in IAM.',
                };
            }
            if (name === 'AccessDeniedException') {
                return {
                    ok: false,
                    message: 'Bedrock access denied',
                    detail: 'The IAM user lacks bedrock:InvokeModel / bedrock:InvokeModelWithResponseStream on this model, or the model is not enabled in Model Access for this region.',
                };
            }
            if (name === 'ValidationException') {
                return {
                    ok: false,
                    message: 'Invalid model or region',
                    detail: `The model ID is not valid in ${model.awsRegion ?? 'this region'}. For EU regions, try a cross-region inference profile ID like eu.anthropic.claude-sonnet-4-5-20250929-v1:0.`,
                };
            }
            if (name === 'ResourceNotFoundException') {
                return {
                    ok: false,
                    message: 'Model not found',
                    detail: 'The model ID does not exist in this region or is not enabled under Model access in the Bedrock console.',
                };
            }
            if (name === 'ThrottlingException') {
                return { ok: false, message: 'Throttled by Bedrock', detail: 'Too many requests. Retry in a moment.' };
            }
        }

        return { ok: false, message: 'Connection failed', detail: msg || 'Unknown error' };
    }
}

/**
 * Test a Gemini model connection using requestUrl (bypasses CORS in Electron).
 * Uses a non-streaming POST to the OpenAI-compatible chat/completions endpoint.
 */
async function testGeminiConnection(model: CustomModel): Promise<TestResult> {
    if (!model.apiKey) return { ok: false, message: 'API key required', detail: 'Get your API key from aistudio.google.com → API Keys.' };
    if (!model.name) return { ok: false, message: 'Model ID required' };

    const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const timeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('Connection timed out after 10s')), 10_000),
    );
    try {
        const res = await Promise.race([
            requestUrl({
                url,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${model.apiKey}`,
                },
                body: JSON.stringify({
                    model: model.name,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 16,
                }),
                throw: false,
            }),
            timeout,
        ]);
        if (res.status === 200) return { ok: true, message: 'Connection successful' };
        if (res.status === 401 || res.status === 403) {
            return { ok: false, message: `Invalid API key (${res.status})`, detail: 'Get your API key from aistudio.google.com → API Keys.' };
        }
        if (res.status === 404) {
            return { ok: false, message: `Model "${model.name}" not found (404)`, detail: 'Check the exact model name. Use the "Fetch Models" button to see available models.' };
        }
        if (res.status === 429) {
            return { ok: false, message: 'Rate limit reached (429)', detail: 'You\'ve sent too many requests. Wait a moment and try again.' };
        }
        const errText = (() => { try { return JSON.stringify(res.json); } catch { return res.text; } })();
        return { ok: false, message: `HTTP ${res.status}`, detail: errText };
    } catch (err: unknown) {
        const msg = (err as { message?: string })?.message ?? 'Unknown error';
        if (msg.includes('timed out')) return { ok: false, message: 'Connection timed out (10 s)' };
        return { ok: false, message: 'Connection failed', detail: msg };
    }
}

/**
 * Test an embedding model connection by calling the /embeddings endpoint.
 * Azure uses: {base}/deployments/{model}/embeddings?api-version={version}
 * OpenAI uses: https://api.openai.com/v1/embeddings
 */
async function testEmbeddingConnection(model: CustomModel): Promise<TestResult> {
    try {
        // Azure uses requestUrl (non-standard auth), all others use OpenAI SDK
        if (model.provider === 'azure') {
            return testEmbeddingViaRequestUrl(model);
        }
        return testEmbeddingViaSdk(model);
    } catch (err: unknown) {
        const msg: string = (err as { message?: string })?.message ?? String(err);
        return { ok: false, message: 'Connection failed', detail: msg };
    }
}

async function testEmbeddingViaSdk(model: CustomModel): Promise<TestResult> {
    const OpenAI = (await import('openai')).default;

    let baseURL: string;
    if (model.provider === 'openai') {
        baseURL = 'https://api.openai.com/v1';
    } else if (model.provider === 'openrouter') {
        baseURL = 'https://openrouter.ai/api/v1';
    } else if (model.provider === 'ollama' || model.provider === 'lmstudio') {
        const base = (model.baseUrl || (model.provider === 'lmstudio' ? 'http://localhost:1234' : 'http://localhost:11434'))
            .replace(/\/v1\/?$/, '').replace(/\/+$/, '');
        baseURL = `${base}/v1`;
    } else {
        const base = (model.baseUrl ?? '').replace(/\/+$/, '');
        baseURL = base.endsWith('/v1') ? base : `${base}/v1`;
    }

    const client = new OpenAI({
        apiKey: model.apiKey || 'unused',
        baseURL,
        dangerouslyAllowBrowser: true,
        timeout: 15_000,
    });

    const response = await client.embeddings.create({
        model: model.name,
        input: 'test',
    });

    const dims = response.data?.[0]?.embedding?.length;
    return { ok: true, message: 'Embedding successful' + (dims ? ` (${dims} dimensions)` : '') };
}

async function testEmbeddingViaRequestUrl(model: CustomModel): Promise<TestResult> {
    const base = (model.baseUrl ?? '').replace(/\/+$/, '');
    const apiVersion = model.apiVersion ?? '2024-10-21';
    const url = `${base}/deployments/${model.name}/embeddings?api-version=${apiVersion}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (model.apiKey) headers['api-key'] = model.apiKey;

    const TIMEOUT_MS = 15_000;
    const timeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error(`Embedding test timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS),
    );
    const res = await Promise.race([
        requestUrl({ url, method: 'POST', headers, body: JSON.stringify({ input: 'test' }), throw: false }),
        timeout,
    ]);

    if (res.status === 200) {
        const dims = res.json?.data?.[0]?.embedding?.length;
        return { ok: true, message: 'Embedding successful' + (dims ? ` (${dims} dimensions)` : '') };
    }
    if (res.status === 401) return { ok: false, message: 'Invalid API key (401)' };
    if (res.status === 404) return { ok: false, message: 'Deployment / model not found (404)', detail: 'Check that the Model ID matches the exact deployment name.' };
    const errText = (() => { try { return JSON.stringify(res.json); } catch { return res.text; } })();
    return { ok: false, message: `HTTP ${res.status}`, detail: errText };
}

/**
 * Fetch the current model list from a provider's API.
 * Returns { id, label } pairs for display in the Quick Pick dropdown.
 */
async function fetchProviderModels(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    apiVersion?: string,
    bedrockCreds?: BedrockFetchCredentials,
): Promise<{ id: string; label: string }[]> {
    if (provider === 'bedrock') {
        return fetchBedrockModels(bedrockCreds ?? {}, baseUrl);
    }
    // Helper: Obsidian's requestUrl throws on 4xx/5xx. use throw:false to always get response
    const req = async (url: string, headers: Record<string, string> = {}) => {
        const timeout = new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error('Model fetch timed out after 10s')), 10_000),
        );
        return Promise.race([
            requestUrl({ url, method: 'GET', headers, throw: false }),
            timeout,
        ]);
    };

    if (provider === 'azure') {
        if (!baseUrl) throw new Error('Base URL required for Azure');
        if (!apiKey) throw new Error('API key required for Azure');
        // Parser normalizes Azure URLs to end with /openai. strip it to get the endpoint root
        const endpoint = baseUrl.replace(/\/+$/, '').replace(/\/openai$/i, '');
        const ver = apiVersion ?? '2024-10-21';
        const headers = { 'api-key': apiKey };

        // Try /openai/deployments first. returns actual deployment names the user can call
        const deplRes = await req(`${endpoint}/openai/deployments?api-version=${ver}`, headers);
        if (deplRes.status === 200) {
            const deplData = deplRes.json;
            const deployments: AzureDeploymentEntry[] = deplData.data ?? deplData.value ?? [];
            if (deployments.length > 0) {
                return deployments
                    .map((d: AzureDeploymentEntry) => {
                        const id: string = d.id ?? d.model ?? '';
                        const model: string = d.model ?? d.id ?? '';
                        const label = id !== model ? `${id} (${model})` : id;
                        return { id, label };
                    })
                    .filter((m) => m.id)
                    .sort((a, b) => a.id.localeCompare(b.id));
            }
        }

        // Fallback: /openai/models. lists base models available in the region
        const modRes = await req(`${endpoint}/openai/models?api-version=${ver}`, headers);
        if (modRes.status === 401) throw new Error('Invalid API key (401 Unauthorized)');
        if (modRes.status !== 200) throw new Error(`HTTP ${modRes.status}. Could not list models or deployments`);
        const modData = modRes.json;
        const models: ApiModelEntry[] = modData.data ?? modData.value ?? [];
        return models
            .map((m: ApiModelEntry) => ({ id: m.id ?? m.model ?? '', label: m.id ?? m.model ?? '' }))
            .filter((m) => m.id)
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    if (provider === 'anthropic') {
        if (!apiKey) throw new Error('API key required for Anthropic');
        const res = await req('https://api.anthropic.com/v1/models',
            { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' });
        if (res.status === 401) throw new Error('Invalid API key (401 Unauthorized)');
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const data = res.json;
        const CHAT_RE = /^claude-/;
        return ((data.data ?? []) as ApiModelEntry[])
            .filter((m) => CHAT_RE.test(m.id ?? ''))
            .map((m) => ({ id: m.id as string, label: (m.display_name ?? m.id) as string }))
            .sort((a, b) => b.id.localeCompare(a.id));
    }

    if (provider === 'openai') {
        if (!apiKey) throw new Error('API key required for OpenAI');
        const res = await req('https://api.openai.com/v1/models',
            { 'Authorization': `Bearer ${apiKey}` });
        if (res.status === 401) throw new Error('Invalid API key (401 Unauthorized)');
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const data = res.json;
        return ((data.data ?? []) as ApiModelEntry[])
            .filter((m) => isOpenAIChatCompletionModel(m.id ?? ''))
            .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
            .map((m) => ({ id: m.id as string, label: m.id as string }));
    }

    if (provider === 'openrouter') {
        const headers: Record<string, string> = apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {};
        const res = await req('https://openrouter.ai/api/v1/models', headers);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const data = res.json;
        // Only include models that support tool calling (function calling)
        return ((data.data ?? []) as ApiModelEntry[])
            .filter((m) => {
                const caps: string[] = m.supported_parameters ?? [];
                // If the API doesn't expose capabilities, include all (older API format)
                if (caps.length === 0) return true;
                return caps.includes('tools') || caps.includes('tool_choice');
            })
            .map((m) => ({ id: m.id as string, label: (m.name ?? m.id) as string }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    // lmstudio. OpenAI-compatible local server, default port 1234
    if (provider === 'lmstudio') {
        const root = (baseUrl || 'http://localhost:1234').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
        const res = await req(`${root}/v1/models`);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}. Is LM Studio running with "Local Server" enabled?`);
        const data = res.json;
        return ((data.data ?? []) as ApiModelEntry[])
            .map((m) => ({ id: m.id as string, label: m.id as string }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    // ollama. native /api/tags lists locally installed models (preferred over
    // the OpenAI-compat /v1/models layer, which Ollama only serves when the
    // user has explicitly enabled it). Reuses fetchOllamaModels so the legacy
    // ModelConfigModal browser and the EPIC-26 discovery service stay aligned.
    if (provider === 'ollama') {
        const names = await fetchOllamaModels(baseUrl || 'http://localhost:11434');
        return names.map((id) => ({ id, label: id }));
    }

    // GitHub Copilot. uses auth service for token
    if (provider === 'github-copilot') {
        const authService = GitHubCopilotAuthService.getInstance();
        if (!authService.isAuthenticated()) throw new Error('Not authenticated. Sign in with GitHub first.');
        const models = await authService.listModels();
        return models.map((m) => ({ id: m.id, label: (m.name ?? m.id) }));
    }

    // ChatGPT OAuth (Codex backend). there is no `/v1/models` endpoint on
    // chatgpt.com/backend-api/codex, so the only authoritative source is the
    // static Codex CLI lineup the provider hardcodes. Without this branch the
    // generic "custom" fallback below tries http://localhost:1234/v1/models
    // (network error) and discovery returns empty; the test-connection then
    // falls back to a placeholder model id and the Codex backend 400s.
    if (provider === 'chatgpt-oauth') {
        // Live discovery from the Codex /codex/models endpoint (account- and
        // client-version-specific), with a static fallback baked in.
        const { fetchChatGptOAuthModels } = await import('../../api/providers/chatgpt-oauth');
        return fetchChatGptOAuthModels();
    }

    // Kilo Gateway. dynamic model list via KiloMetadataService
    if (provider === 'kilo-gateway') {
        if (!KiloAuthService.getInstance().isAuthenticated()) {
            throw new Error('Not signed in with Kilo. Open settings to connect.');
        }
        const models = await KiloMetadataService.getInstance().getModels(true);
        return models.map((m) => ({ id: m.id, label: m.id }));
    }

    // Gemini. OpenAI-compatible endpoint at Google
    // Uses requestUrl directly (not the req helper) to guarantee res.json is the parsed object,
    // not a Promise. Obsidian's RequestUrlResponsePromise.json is Promise<any>.
    if (provider === 'gemini') {
        if (!apiKey) throw new Error('API key required for Google Gemini');
        const res = await requestUrl({
            url: 'https://generativelanguage.googleapis.com/v1beta/openai/models',
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            throw: false,
        });
        if (res.status === 401 || res.status === 403) throw new Error('Invalid API key');
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        const data = res.json;
        return ((data.data ?? []) as ApiModelEntry[])
            .filter((m) => /gemini-/i.test(m.id ?? ''))
            .map((m) => {
                // Google returns IDs with "models/" prefix. strip it for OpenAI-compatible usage
                const id = (m.id as string).replace(/^models\//, '');
                return { id, label: (m.display_name as string) ?? id };
            })
            .sort((a, b) => b.id.localeCompare(a.id));
    }

    // custom. OpenAI-compatible /v1/models endpoint
    const root = (baseUrl || 'http://localhost:1234').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await requestUrl({ url: `${root}/v1/models`, method: 'GET', headers, throw: false });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = res.json;
    return ((data.data ?? []) as ApiModelEntry[])
        .map((m) => ({ id: m.id as string, label: m.id as string }))
        .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Fetch the list of text-capable foundation models and inference profiles
 * available to the caller on Amazon Bedrock. Uses the Bedrock control-plane
 * client (separate from the runtime client) because ListFoundationModels /
 * ListInferenceProfiles live on the `bedrock.{region}.amazonaws.com` endpoint,
 * not the `bedrock-runtime.*` one.
 *
 * Inference profiles are surfaced alongside the raw foundation IDs because
 * newer Anthropic models (Opus 4.7 etc.) in EU regions are only callable via
 * the cross-region profile ID (e.g. `eu.anthropic.claude-opus-4-7-...`).
 */
async function fetchBedrockModels(
    creds: BedrockFetchCredentials,
    baseUrl?: string,
): Promise<{ id: string; label: string }[]> {
    const region = creds.region?.trim() || extractRegionFromBedrockUrl(baseUrl) || '';
    if (!region) {
        throw new Error('AWS region required. pick a region or set an endpoint URL containing one.');
    }
    const authMode = creds.authMode ?? 'api-key';

    // FEAT-26-07: gateway mode terminates the AWS trust boundary at an
    // enterprise APIM that does NOT expose the Bedrock control plane
    // (`ListFoundationModels` / `ListInferenceProfiles` live elsewhere).
    // Return a curated list of EU cross-region inference profile IDs that
    // typical gateway deployments support so the dropdown is still useful.
    if (authMode === 'gateway') {
        return [
            { id: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Anthropic Claude Haiku 4.5 (EU profile)' },
            { id: 'eu.anthropic.claude-sonnet-4-6',              label: 'Anthropic Claude Sonnet 4.6 (EU profile)' },
            { id: 'eu.anthropic.claude-opus-4-7',                label: 'Anthropic Claude Opus 4.7 (EU profile)' },
            { id: 'eu.anthropic.claude-opus-4-8',                label: 'Anthropic Claude Opus 4.8 (EU profile)' },
        ];
    }

    // Dynamic import keeps the control-plane SDK out of the hot path. it's
    // only needed when the user actually clicks Fetch Models.
    const { BedrockClient, ListFoundationModelsCommand, ListInferenceProfilesCommand } =
        await import('@aws-sdk/client-bedrock');
    type BedrockClientConfig = ConstructorParameters<typeof BedrockClient>[0];

    const clientConfig: BedrockClientConfig = { region };
    // Custom endpoint for VPC/private access. swap `bedrock-runtime` for
    // `bedrock` since the control-plane lives on a different hostname.
    const customEndpoint = (creds.endpoint?.trim() || baseUrl?.trim() || '')
        .replace(/bedrock-runtime\./i, 'bedrock.');
    if (customEndpoint) clientConfig.endpoint = customEndpoint;

    if (authMode === 'api-key') {
        const apiKey = creds.apiKey?.trim();
        if (!apiKey) throw new Error('Bedrock API key required when auth mode is "API key".');
        clientConfig.token = { token: apiKey };
        clientConfig.authSchemePreference = ['httpBearerAuth'];
    } else {
        const accessKeyId = creds.accessKey?.trim();
        const secretAccessKey = creds.secretKey?.trim();
        if (!accessKeyId || !secretAccessKey) {
            throw new Error('Access key ID and secret access key required when auth mode is "Access key".');
        }
        clientConfig.credentials = {
            accessKeyId,
            secretAccessKey,
            ...(creds.sessionToken?.trim() ? { sessionToken: creds.sessionToken.trim() } : {}),
        };
    }

    const client = new BedrockClient(clientConfig);

    // Run both list calls in parallel. they hit different endpoints and
    // neither depends on the other.
    const [fmRes, ipRes] = await Promise.all([
        client.send(new ListFoundationModelsCommand({ byOutputModality: 'TEXT' })),
        client.send(new ListInferenceProfilesCommand({})).catch(() => ({ inferenceProfileSummaries: [] })),
    ]);

    const out: { id: string; label: string }[] = [];
    const seen = new Set<string>();

    for (const m of fmRes.modelSummaries ?? []) {
        const id = m.modelId?.trim();
        if (!id || seen.has(id)) continue;
        // Text-output only is already filtered via byOutputModality; skip models
        // that are provisioned-throughput-only. they're not usable without
        // extra capacity setup. Cross-region ones still surface below via the
        // inference-profile list.
        const inferTypes = m.inferenceTypesSupported ?? [];
        if (inferTypes.length > 0 && !inferTypes.includes('ON_DEMAND')) {
            continue;
        }
        const vendor = m.providerName ?? '';
        const name = m.modelName ?? id;
        const label = vendor ? `${vendor} ${name}` : name;
        seen.add(id);
        out.push({ id, label });
    }

    for (const p of ipRes.inferenceProfileSummaries ?? []) {
        const id = p.inferenceProfileId?.trim();
        if (!id || seen.has(id) || p.status !== 'ACTIVE') continue;
        const name = p.inferenceProfileName ?? id;
        seen.add(id);
        out.push({ id, label: `${name} [Cross-Region Profile]` });
    }

    return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Fetch model names installed in a local Ollama instance */
async function fetchOllamaModels(baseUrl: string): Promise<string[]> {
    // Native Ollama API is at root. strip /v1 suffix if present
    const root = (baseUrl || 'http://localhost:11434').replace(/\/v\d[^/]*\/?$/, '').replace(/\/+$/, '');
    const url = `${root}/api/tags`;
    const res = await requestUrl({ url, method: 'GET', throw: false });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}. Is Ollama running?`);
    const data = res.json;
    return ((data.models ?? []) as OllamaModelEntry[]).map((m) => m.name).sort();
}

/**
 * Fetch embedding models from a provider's API.
 * Filters to only embedding-capable models (no chat/TTS/image models).
 */
async function fetchEmbeddingModels(
    provider: ProviderType,
    apiKey: string,
    baseUrl?: string,
    apiVersion?: string,
): Promise<{ id: string; label: string }[]> {
    const req = async (url: string, headers: Record<string, string> = {}) => {
        const timeout = new Promise<never>((_, reject) =>
            window.setTimeout(() => reject(new Error('Model fetch timed out after 10s')), 10_000),
        );
        return Promise.race([
            requestUrl({ url, method: 'GET', headers, throw: false }),
            timeout,
        ]);
    };

    if (provider === 'openai') {
        // OpenAI's /v1/models requires auth. return the known stable embedding model list instead
        return [
            { id: 'text-embedding-3-small', label: 'text-embedding-3-small  (1 536 dims, recommended)' },
            { id: 'text-embedding-3-large', label: 'text-embedding-3-large  (3 072 dims, highest quality)' },
            { id: 'text-embedding-ada-002', label: 'text-embedding-ada-002  (1 536 dims, legacy)' },
        ];
    }

    if (provider === 'azure') {
        // Azure doesn't have a REST endpoint to list available deployments generically.
        // Suggest the known embedding model IDs (user fills in deployment name).
        throw new Error('Azure does not provide a model list API. use the Quick Pick suggestions or enter the deployment name manually.');
    }

    if (provider === 'ollama') {
        // Ollama API: filter model names that look like embedding models
        const root = (baseUrl || 'http://localhost:11434').replace(/\/v\d[^/]*\/?$/, '').replace(/\/+$/, '');
        const res = await req(`${root}/api/tags`);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}. Is Ollama running?`);
        const EMBED_NAMES = /embed|bge|minilm|arctic-embed|e5-|gte-/i;
        const all: string[] = ((res.json.models ?? []) as OllamaModelEntry[]).map((m) => m.name);
        const embeds = all.filter((n) => EMBED_NAMES.test(n));
        // If no matches, return all (user might have custom names)
        const list = embeds.length > 0 ? embeds : all;
        return list.sort().map((id) => ({ id, label: id }));
    }

    if (provider === 'lmstudio') {
        const root = (baseUrl || 'http://localhost:1234').replace(/\/v1\/?$/, '').replace(/\/+$/, '');
        const res = await req(`${root}/v1/models`);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}. Is LM Studio running?`);
        return ((res.json.data ?? []) as ApiModelEntry[])
            .map((m) => ({ id: m.id as string, label: m.id as string }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }

    if (provider === 'openrouter') {
        // OpenRouter has a dedicated embedding models endpoint (separate from /v1/models)
        const headers: Record<string, string> = {};
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        try {
            const res = await req('https://openrouter.ai/api/v1/embeddings/models', headers);
            if (res.status === 200 && Array.isArray(res.json?.data)) {
                return (res.json.data as ApiModelEntry[])
                    .map((m) => ({ id: m.id as string, label: (m.name as string) ?? (m.id as string) }))
                    .sort((a, b) => a.label.localeCompare(b.label));
            }
        } catch { /* fallback below */ }
        // Fallback if endpoint fails
        return [
            { id: 'openai/text-embedding-3-small', label: 'OpenAI: Text Embedding 3 Small' },
            { id: 'openai/text-embedding-3-large', label: 'OpenAI: Text Embedding 3 Large' },
        ];
    }

    // custom. OpenAI-compatible endpoint
    const base = (baseUrl || '').replace(/\/+$/, '');
    const headers: Record<string, string> = {};
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await req(`${base}/v1/models`, headers);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const EMBED_RE = /embed/i;
    const all = ((res.json.data ?? []) as ApiModelEntry[]).map((m) => ({ id: m.id as string, label: m.id as string }));
    const filtered = all.filter((m) => EMBED_RE.test(m.id));
    return (filtered.length > 0 ? filtered : all).sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Add / Configure Model Modal
// ---------------------------------------------------------------------------

/** Returns true for o-series models that enforce temperature=1.0 API-side */
function isTemperatureFixed(provider: ProviderType, modelName: string): boolean {
    if (provider === 'openai' || provider === 'azure' || provider === 'github-copilot') {
        return /^o[1-9]/.test(modelName);
    }
    return false;
}

/** Maximum temperature value accepted by provider */
function maxTemperature(provider: ProviderType): number {
    return provider === 'anthropic' ? 1.0 : 2.0;
}


export { testModelConnection, testEmbeddingConnection, fetchProviderModels, fetchOllamaModels, fetchEmbeddingModels, isTemperatureFixed, maxTemperature };

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
