/**
 * LlmVerifierProvider -- concrete VerifierProvider backed by the
 * plugin's existing apiHandler.classifyText path.
 *
 * IMP-20-06-01 W2-T5. Builds a structured prompt for the mid-tier
 * model (and optional frontier model). Expects strict JSON output;
 * fail-closes to `verdict=no_external_source` on parse errors or
 * provider exceptions.
 *
 * ZDR capability is reported by a caller-supplied resolver. Wave 4
 * wires that into the model registry; for now main.ts passes a
 * conservative `() => false` so frontier escalation stays off.
 */

import type {
    RawVerdict,
    VerifierInput,
    VerifierProvider,
} from './FreshnessVerifier';
import type { VerdictLiteral } from './types';

export interface ClassifyApi {
    classifyText?(prompt: string, abortSignal?: AbortSignal): Promise<string>;
}

export interface LlmVerifierProviderOptions {
    midApi: ClassifyApi;
    midModelId: string;
    frontierApi?: ClassifyApi;
    frontierModelId?: string;
    hasZdr: () => boolean;
}

const ALLOWED_VERDICTS: readonly VerdictLiteral[] = [
    'deckt-sich',
    'ergaenzt',
    'widerspricht',
    'outdated',
    'no_external_source',
];

const FAIL_CLOSED: RawVerdict = {
    verdict: 'no_external_source',
    confidence: 0,
    summary: '',
    sources: [],
    tokensUsed: 0,
};

export class LlmVerifierProvider implements VerifierProvider {
    readonly midModelId: string;
    readonly frontierModelId: string;

    constructor(private readonly opts: LlmVerifierProviderOptions) {
        this.midModelId = opts.midModelId;
        this.frontierModelId = opts.frontierModelId ?? opts.midModelId;
    }

    hasZdrCapability(): boolean {
        return this.opts.hasZdr();
    }

    async callMidTier(input: VerifierInput): Promise<RawVerdict> {
        return this.callTier(input, this.opts.midApi);
    }

    async callFrontier(input: VerifierInput): Promise<RawVerdict> {
        const api = this.opts.frontierApi ?? this.opts.midApi;
        return this.callTier(input, api);
    }

    private async callTier(input: VerifierInput, api: ClassifyApi): Promise<RawVerdict> {
        if (!api.classifyText) return FAIL_CLOSED;
        try {
            const raw = await api.classifyText(this.buildPrompt(input));
            const parsed = parseVerdictJson(raw);
            return parsed ?? FAIL_CLOSED;
        } catch (error) {
            console.warn('[LlmVerifierProvider] classifyText failed', error);
            return FAIL_CLOSED;
        }
    }

    private buildPrompt(input: VerifierInput): string {
        const sources = (input.cluster.sources ?? []).slice(0, 8).map((s, i) => `${i + 1}. ${s}`).join('\n');
        const noteBody = input.note.body.slice(0, 4000);
        return [
            'You are a fact-freshness reviewer.',
            'Compare a Markdown note against recent external sources and return a single JSON object.',
            'Allowed verdicts (use exact strings):',
            '- deckt-sich: note agrees with the external sources, no update needed.',
            '- ergaenzt: external sources add detail the note could absorb.',
            '- widerspricht: external sources contradict the note.',
            '- outdated: note describes a state that no longer applies.',
            '- no_external_source: not enough external evidence to judge.',
            '',
            'Confidence is a number in [0.0, 1.0].',
            'Summary is one sentence; sources is the URL subset that backs the verdict.',
            '',
            `Cluster: ${input.cluster.cluster}`,
            `Note path: ${input.note.path}`,
            'Note body (truncated):',
            '"""',
            noteBody,
            '"""',
            '',
            'External sources:',
            sources || '(none)',
            '',
            'Reply with ONLY a JSON object of shape:',
            '{"verdict":"...","confidence":0.0,"summary":"...","sources":["..."]}',
        ].join('\n');
    }
}

export function parseVerdictJson(raw: string): RawVerdict | null {
    const trimmed = raw.trim();
    const jsonStart = trimmed.indexOf('{');
    const jsonEnd = trimmed.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
    const json = trimmed.slice(jsonStart, jsonEnd + 1);

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(json) as Record<string, unknown>;
    } catch {
        return null;
    }

    const verdict = parsed.verdict as VerdictLiteral | undefined;
    if (!verdict || !ALLOWED_VERDICTS.includes(verdict)) return null;

    const confidence = clamp01(Number(parsed.confidence));
    if (Number.isNaN(confidence)) return null;

    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const sources = Array.isArray(parsed.sources)
        ? parsed.sources.filter((s): s is string => typeof s === 'string').slice(0, 16)
        : [];

    return {
        verdict,
        confidence,
        summary,
        sources,
        tokensUsed: Math.ceil(json.length / 4),
    };
}

function clamp01(n: number): number {
    if (!Number.isFinite(n)) return NaN;
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}
