/**
 * PerActionPin -- per-action model override (FEAT-33-10, EPIC-33).
 *
 * Reads `plugin.settings.inlineActions.actionPins` and supplies the
 * resolved model id for a given InlineAction. Returns null when no
 * pin is set so the caller falls back to the active main-chat model.
 *
 * The plugin entry-point injects this helper into action callbacks
 * via the snapshot.modelId field (the snapshot is built per-trigger
 * by InlineTriggerResolver) -- the pin is the override layer above
 * the snapshot's main-chat default.
 *
 * Related: ADR-140 (Settings-Snapshot-Lifecycle Section 'Per-Action-Pin').
 */

export interface PerActionPinReader {
    getModelOverride(actionId: string): string | null;
}

export interface PerActionPinOptions {
    /** Live-callback so changes via the Settings UI take effect immediately. */
    getPins: () => Record<string, string | null | undefined> | undefined;
    /**
     * Optional validator. Returns true when the given model id is
     * currently configured (e.g. is in plugin.settings.activeModels).
     * When omitted no validation runs (backwards compatible).
     * Audit ref: AUDIT-EPIC-33 M-01.
     */
    isValidModelId?: (modelId: string) => boolean;
    /** Logger seam for tests; defaults to console.warn. */
    warn?: (msg: string) => void;
}

export class PerActionPin implements PerActionPinReader {
    private readonly getPins: () => Record<string, string | null | undefined> | undefined;
    private readonly isValidModelId?: (modelId: string) => boolean;
    private readonly warn: (msg: string) => void;

    constructor(options: PerActionPinOptions) {
        this.getPins = options.getPins;
        this.isValidModelId = options.isValidModelId;
        this.warn = options.warn ?? ((msg) => console.warn(msg));
    }

    /**
     * Returns the pinned model id for the given action, or null when
     * no pin is set. Pinned-to-null (explicit clear via UI) and
     * not-present both return null. When `isValidModelId` is supplied
     * and the configured pin is unknown (e.g. user removed the model
     * from settings.activeModels), the pin is treated as missing and a
     * one-shot warning is emitted so the caller falls back to the
     * main-chat default instead of sending an unbacked model id to the
     * provider router.
     */
    getModelOverride(actionId: string): string | null {
        const pins = this.getPins() ?? {};
        const v = pins[actionId];
        if (v === undefined || v === null || v === '') return null;
        if (this.isValidModelId !== undefined && this.isValidModelId(v) !== true) {
            this.warn(`[PerActionPin] pinned model '${v}' for action '${actionId}' is not in active models; falling back to default.`);
            return null;
        }
        return v;
    }
}
