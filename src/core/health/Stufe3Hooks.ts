/**
 * REF-12: extract Stufe-3 hook construction out of main.ts.
 *
 * The four closures that the Stufe-3 Periodic Job needs -- a pre-filter
 * classifier, a web-update pass, a notification sink, a budget-exceeded
 * sink -- used to live as 120+ lines of inline lambdas in main.ts.
 * Lambda-wiring at that scale is hard to follow and impossible to unit
 * test in isolation. This module accepts a thin "host" interface and
 * returns the four hooks ready to pass to `new Stufe3PeriodicJob(...)`.
 *
 * The host abstraction stays narrow: only the four fields and one helper
 * Stufe-3 actually reads. Everything else stays in main.ts so the
 * extraction does not turn into a god-object refactor.
 */

import { Notice } from 'obsidian';
import type { ApiHandler } from '../../api/types';
import type { ClusterMetadataRecord } from '../knowledge/ClusterMetadataStore';
import type { FreshnessOrchestrator } from './FreshnessOrchestrator';
import type { UpdateFinding } from './Stufe3PeriodicJob';
import type { NoteVerdict } from './types';
import type { ToolCallbacks, ToolExecutionContext } from '../tools/types';
import type { BaseTool } from '../tools/BaseTool';

export interface Stufe3HostMinimal {
    /** Active API handler with classifyText support; nullable when no provider is configured. */
    apiHandler: ApiHandler | null;
    /** Returns the web_search tool when registered, otherwise null. */
    getWebSearchTool(): BaseTool | null;
    /** Plugin instance for the ToolExecutionContext shim. */
    plugin: unknown;
}

export interface Stufe3Hooks {
    preFilter: (cluster: ClusterMetadataRecord) =>
        Promise<{ decision: 'yes' | 'no' | 'unsure'; tokensUsed: number }>;
    webUpdatePass: (cluster: ClusterMetadataRecord) =>
        Promise<{ findings: UpdateFinding[]; tokensUsed: number }>;
    notificationSink: (findings: UpdateFinding[]) => void;
    budgetExceededSink: (info: { spentUsd: number; budgetUsd: number }) => void;
}

/** Extract HTTP(S) URLs from a free-form text. Mirrors main.ts:extractUrlsFromText. */
export function extractUrlsFromText(text: string): string[] {
    const matches = text.match(/https?:\/\/[^\s)\]<>"']+/g) ?? [];
    return Array.from(new Set(matches));
}

/** eTLD+1 surrogate -- mirrors main.ts:countIndependentDomains. */
export function countIndependentDomains(urls: string[]): number {
    const domains = new Set<string>();
    for (const u of urls) {
        try {
            const host = new URL(u).hostname;
            const parts = host.toLowerCase().split('.');
            const eTld1 = parts.length >= 2 ? parts.slice(-2).join('.') : host.toLowerCase();
            domains.add(eTld1);
        } catch {
            // unparseable URLs do not contribute to the signal
        }
    }
    return domains.size;
}

export function buildStufe3Hooks(
    host: Stufe3HostMinimal,
    orchestrator: FreshnessOrchestrator | null,
): Stufe3Hooks {
    const preFilter = async (cluster: ClusterMetadataRecord) => {
        if (!host.apiHandler?.classifyText) return { decision: 'no' as const, tokensUsed: 0 };
        const prompt =
            `Cluster "${cluster.cluster}" wurde zuletzt am ${cluster.lastExternalCheck ?? 'nie'} extern verifiziert. ` +
            `Halbwertszeit: ${cluster.halfLifeDays} Tage. Lohnt sich JETZT eine Web-Suche ` +
            `nach Updates? Antworte ausschliesslich mit "yes", "no" oder "unsure".`;
        try {
            const reply = (await host.apiHandler.classifyText(prompt)).toLowerCase().trim();
            const decision: 'yes' | 'no' | 'unsure' = reply.startsWith('yes') ? 'yes'
                : reply.startsWith('unsure') ? 'unsure' : 'no';
            return { decision, tokensUsed: prompt.length / 4 + 5 };
        } catch (e) {
            console.debug('[Stufe3] preFilter classify failed:', e);
            return { decision: 'no' as const, tokensUsed: 0 };
        }
    };

    const webUpdatePass = async (cluster: ClusterMetadataRecord) => {
        const tool = host.getWebSearchTool();
        if (!tool) return { findings: [], tokensUsed: 0 };
        const captured: string[] = [];
        const ctx = {
            plugin: host.plugin,
            callbacks: {
                pushToolResult: (r: string) => { captured.push(r); },
                say: () => Promise.resolve(),
                ask: () => Promise.resolve({ response: 'noButtonClicked' as const }),
                isParallelExecution: false,
                shouldUseImmediateApproval: () => false,
            } as unknown as ToolCallbacks,
        } as unknown as ToolExecutionContext;
        try {
            await tool.execute({
                query: `${cluster.cluster} latest update news`,
                max_results: 5,
            }, ctx);
        } catch (e) {
            console.debug('[Stufe3] webUpdatePass failed:', e);
            return { findings: [], tokensUsed: 0 };
        }
        const text = captured.join('\n');
        if (!text.trim()) return { findings: [], tokensUsed: 0 };

        let noteVerdicts: NoteVerdict[] = [];
        let verifierTokens = 0;
        try {
            const orchestrated = await orchestrator?.runForCluster(cluster.cluster);
            noteVerdicts = orchestrated?.verdicts ?? [];
            verifierTokens = orchestrated?.tokensUsed ?? 0;
        } catch (e) {
            console.debug('[Stufe3] verifier-pass failed:', e);
        }

        return {
            findings: [{
                cluster: cluster.cluster,
                title: `Updates fuer ${cluster.cluster}`,
                summary: text.slice(0, 600),
                sources: extractUrlsFromText(text).slice(0, 5),
                detectedAt: new Date().toISOString(),
                strongSignal: countIndependentDomains(extractUrlsFromText(text)) >= 3,
                ...(noteVerdicts.length ? { notes: noteVerdicts } : {}),
            }],
            tokensUsed: text.length / 4 + verifierTokens,
        };
    };

    const notificationSink = (findings: UpdateFinding[]) => {
        if (!findings.length) return;
        new Notice(`Stufe-3: ${findings.length} Update-Hinweise gefunden (siehe Console).`, 6_000);
        for (const f of findings) console.debug(`[Stufe3] ${f.cluster}: ${f.title}`);
    };

    const budgetExceededSink = (info: { spentUsd: number; budgetUsd: number }) => {
        new Notice(`Stufe-3 Budget bei ${(info.spentUsd / info.budgetUsd * 100).toFixed(0)}%.`, 5_000);
    };

    return { preFilter, webUpdatePass, notificationSink, budgetExceededSink };
}
