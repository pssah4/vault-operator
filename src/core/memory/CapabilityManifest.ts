/**
 * CapabilityManifest -- single source of truth for what Vault Operator can do.
 *
 * The plugin maintains a curated list of features (tools, UI elements,
 * settings, modes) here. On every onload the plugin hashes the manifest
 * (djb2 sync) and compares against `settings.memory.lastCapabilityHash`.
 * On mismatch, the agent's L3 capability snapshot in the Memory v2 store
 * (profile_id='_obsilo', topics CONTAINS 'capability') is replaced --
 * old entries deprecated, new ones inserted.
 *
 * Why a hardcoded manifest? Capabilities are code-derived facts that
 * change with the plugin version, not with user actions. Putting them
 * in code keeps the source of truth next to the implementation; the
 * hash-sync ensures the agent never lies about features that no longer
 * exist or features that were just added.
 *
 * FEATURE-0319b / PLAN-008 task A.1.
 */

export interface Capability {
    /** Coarse area; used as topics[1] when stored as a fact. */
    area: 'tool' | 'ui' | 'setting' | 'mode' | 'command';
    /** Stable identifier (tool-name, settings-key, mode-slug, etc.). */
    key: string;
    /** Short, agent-readable description. Single sentence preferred. */
    summary: string;
    /** Optional longer note (when context matters for usage). */
    notes?: string;
}

/**
 * The manifest. Edit this array whenever Vault Operator gains, loses, or
 * changes a feature the agent should know about. The hash will pick
 * up the change automatically; the next plugin onload will sync.
 *
 * Keep entries terse. The agent retrieves them via recall_memory or
 * inspect_self -- long prose belongs in docs, not here.
 */
export const CAPABILITIES: ReadonlyArray<Capability> = [
    // --- Memory v2 tools (FEATURE-0317 + 0318) -------------------------
    {
        area: 'tool', key: 'recall_memory',
        summary: 'Search Memory v2 facts by meaning + topics. Returns URI-typed hits.',
        notes: 'Use profile=\'_obsilo\' to search Vault Operator\'s own soul/capabilities.',
    },
    {
        area: 'tool', key: 'mark_for_memory',
        summary: 'Save the active sidebar conversation to memory immediately, bypassing throttle + threshold.',
        notes: 'Trigger when the user says "remember this" / "merk dir das" / "save to memory".',
    },

    // --- Memory v2 UI -------------------------------------------------
    {
        area: 'ui', key: 'memory-star-header',
        summary: 'Star icon in the chat header toggles save/unsave for the active conversation.',
        notes: 'Filled = facts present in Memory v2 with source_session_id matching the conversation.',
    },
    {
        area: 'ui', key: 'memory-star-history',
        summary: 'Star icon per row in the history panel pins/unpins individual past chats.',
        notes: 'Click "..." on the history row -- toggle pins; un-pin deprecates all facts from that conversation.',
    },
    {
        area: 'ui', key: 'save-to-memory-menu',
        summary: 'Chat input "..." menu has a "Save conversation to memory" item with a star icon.',
    },

    // --- Memory v2 settings (FEATURE-0318) ----------------------------
    {
        area: 'setting', key: 'memory.enabled',
        summary: 'Master toggle. When false, no memory extraction happens at all.',
    },
    {
        area: 'setting', key: 'memory.autoExtractSessions',
        summary: 'Auto-extract on conversation end. Manual paths (Star + mark_for_memory) work regardless of this setting.',
    },
    {
        area: 'setting', key: 'memory.extractionThreshold',
        summary: 'Minimum number of messages before auto-extract triggers (slider 2-20). Only relevant when autoExtractSessions=true.',
    },
    {
        area: 'setting', key: 'memory.memoryModelKey',
        summary: 'Model used for the Single-Call memory extraction LLM.',
    },

    // --- Agents (FEATURE-0317; formerly "Modes") ----------------------
    {
        area: 'mode', key: 'agent',
        summary: 'Default agent: read, vault, edit, web, mcp, skill, and agent tool groups.',
    },
];

/**
 * djb2 string hash, 32-bit unsigned. Sync, no crypto import. Sufficient
 * collision resistance for ~100 curated manifest entries.
 *
 * Algorithm: hash(0) = 5381; hash(i) = hash(i-1) * 33 + char_code.
 * Trimmed to unsigned 32-bit via `>>> 0`.
 */
export function djb2(input: string): number {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return hash >>> 0;
}

/**
 * Stable hash over the current manifest. Order-sensitive; if you reorder
 * entries the hash changes -- which is fine because reorders don't
 * happen often and a re-sync is cheap.
 */
export function manifestHash(): string {
    const serialised = CAPABILITIES.map(c => `${c.area}|${c.key}|${c.summary}|${c.notes ?? ''}`).join('\n');
    return djb2(serialised).toString(16);
}
