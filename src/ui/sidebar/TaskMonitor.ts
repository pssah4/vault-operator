/**
 * TaskMonitor -- per-task cost display + telemetry persistence.
 *
 * Encapsulates the two pieces of behaviour that AgentSidebarView would
 * otherwise inline as 50+ lines of bookkeeping inside its callback hash:
 *
 *   1. onUsage -> compute EUR cost, render the footer.
 *   2. onTaskTelemetry -> persist a JSON-Lines entry for offline analysis.
 *
 * The view stays a view; this service knows the model lookup, pricing,
 * subscription detection, and telemetry I/O.
 *
 * FEATURE-1804 / ADR-090.
 */

import type { App } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import type { ApiHandler } from '../../api/types';
import { getModelKey } from '../../types/settings';
import { computeCost } from '../../core/pricing/ModelPricing';
import { TaskTelemetry, formatTelemetryFooter } from '../../core/telemetry/TaskTelemetry';
import { VaultDataFileAdapter } from '../../core/storage/VaultDataFileAdapter';

export interface TaskMonitorOptions {
    plugin: ObsidianAgentPlugin;
    app: App;
    /** Resolved API handler for the current task. Provides the actual model id. */
    apiHandler: ApiHandler | null;
    /** Footer element rendered next to the chat input. */
    footerEl: HTMLElement;
    /** Function returning the currently effective model key, used for provider detection. */
    getEffectiveModelKey: () => string;
    /** First 200 chars of the user message, captured at task start. */
    promptPreview: string;
    /** Mode slug the task is running in (ask / agent / ...). */
    mode: string;
    /** Optional context tracker hook -- forwarded usage updates so condensing logic stays accurate. */
    contextTracker?: { updateUsage: (input: number, output: number) => void };
}

export interface TaskTelemetryData {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    toolSequence: string[];
    iterations: number;
    outcome: 'completed' | 'aborted' | 'error';
    errorMessage?: string;
}

const SUBSCRIPTION_PROVIDERS = new Set(['github-copilot', 'chatgpt-oauth']);

export class TaskMonitor {
    constructor(private opts: TaskMonitorOptions) {}

    /**
     * Live usage update -- compute cost, render footer. Called per turn.
     *
     * v2.10.2: the optional `actualModelId` argument lets the caller report
     * the model that *actually* served the call. Without it we fall back
     * to the configured main-model id, which is wrong when TaskRouter has
     * routed the task onto the helper model and the call actually ran on
     * Haiku or Sonnet. The footer now prices the call on the correct
     * model and resolves provider / subscription state from the same id.
     */
    onUsage(
        inputTokens: number,
        outputTokens: number,
        cacheReadTokens?: number,
        cacheCreationTokens?: number,
        actualModelId?: string,
    ): void {
        const cR = cacheReadTokens ?? 0;
        const cW = cacheCreationTokens ?? 0;
        const modelId = actualModelId ?? this.modelIdForCost();
        const provider = this.providerFor(modelId);
        const cost = computeCost(modelId, inputTokens, outputTokens, cR, cW);
        const isSubscription = provider !== undefined && SUBSCRIPTION_PROVIDERS.has(provider);

        console.debug(
            `[Cost] model="${modelId}" provider=${provider ?? '?'} ` +
            `in=${inputTokens} out=${outputTokens} cacheR=${cR} cacheW=${cW} ` +
            `usd=${cost.totalUsd.toFixed(4)} eur=${cost.totalEur.toFixed(4)} subscription=${isSubscription}`,
        );

        this.opts.footerEl.setText(formatTelemetryFooter({
            inputTokens,
            outputTokens,
            cacheReadTokens: cR,
            cacheCreationTokens: cW,
            costEur: cost.totalEur,
            isSubscription,
        }));
        this.opts.footerEl.classList.remove('agent-u-hidden');

        // FEAT-24-05: visible signal when the task's running cost crosses the
        // warn threshold (the would-be API spend is worth flagging even on
        // subscription providers). 0 disables the warning.
        const warnEur = this.opts.plugin.settings.advancedApi.costWarnThresholdEur ?? 0;
        this.opts.footerEl.classList.toggle('agent-cost-warn', warnEur > 0 && cost.totalEur >= warnEur);

        if (this.opts.contextTracker) {
            this.opts.contextTracker.updateUsage(inputTokens, outputTokens);
        }
    }

    /**
     * Persist one telemetry entry for the completed task. Best-effort,
     * never throws; failures are logged at warn level.
     */
    onTaskTelemetry(data: TaskTelemetryData): void {
        // Run in background -- the view should not wait on filesystem.
        void this.persist(data).catch((e) =>
            console.warn('[Telemetry] record failed (non-fatal):', e),
        );
    }

    private async persist(data: TaskTelemetryData): Promise<void> {
        const fs = new VaultDataFileAdapter(this.opts.app.vault.adapter);
        const telemetry = new TaskTelemetry(fs);
        // AUDIT-013 M-2: promptPreview is opt-in. Vault sync may share the
        // telemetry file, so user prompts only land on disk if the user
        // explicitly enables the flag.
        const recordPreview = this.opts.plugin.settings.advancedApi.telemetryRecordPromptPreview ?? false;
        await telemetry.record({
            promptPreview: recordPreview ? this.opts.promptPreview : '',
            modelId: this.modelIdForCost(),
            mode: this.opts.mode,
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
            cacheReadTokens: data.cacheReadTokens,
            cacheCreationTokens: data.cacheCreationTokens,
            outcome: data.outcome,
            errorMessage: data.errorMessage,
        });
    }

    private modelIdForCost(): string {
        return this.opts.apiHandler?.getModel().id ?? '';
    }

    /**
     * Resolve provider from a model id. v2.10.2: looks the model up by its
     * concrete id (the `id` field on CustomModel, after normalisation)
     * rather than via getEffectiveModelKey(). When TaskRouter has routed
     * to the helper model, the model id we see at usage-report time
     * belongs to the helper, not to the user-selected main model.
     */
    private providerFor(modelId: string): string | undefined {
        if (!modelId) {
            return this.opts.plugin.settings.activeModels.find(
                (m) => getModelKey(m) === this.opts.getEffectiveModelKey(),
            )?.provider;
        }
        const idLower = modelId.toLowerCase();
        const match = this.opts.plugin.settings.activeModels.find((m) => {
            // Match if the provider's runtime id equals or substring-matches
            // the configured model name (provider id strings differ across
            // vendors, e.g. bedrock prefixes with "eu.anthropic.").
            const candidate = (m.name || '').toLowerCase();
            return candidate.length > 0 && (
                idLower === candidate ||
                idLower.endsWith(candidate) ||
                candidate.endsWith(idLower) ||
                idLower.includes(candidate)
            );
        });
        return match?.provider;
    }
}
