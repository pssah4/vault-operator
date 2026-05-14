/**
 * ConversationStore
 *
 * Persistence layer for chat conversations.
 * Stores conversations as JSON files in global storage with an in-memory index
 * for fast listing (no disk I/O for list operations).
 *
 * Storage: ~/.obsidian-agent/history/
 *   - index.json         — conversation metadata index
 *   - {id}.json          — individual conversation data
 */

import type { FileAdapter } from '../../core/storage/types';
import type { MessageParam } from '../../api/types';
import type { SourceInterface } from '../memory/SourceInterface';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationMeta {
    id: string;
    title: string;
    created: string;
    updated: string;
    messageCount: number;
    mode: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    /**
     * BA-26 / FEAT-23-04: chat surface this conversation came from.
     * Optional for backward-compat with conversations created before
     * Cross-Surface MCP. Reads default to 'obsilo' when missing.
     */
    sourceInterface?: SourceInterface;
    /**
     * BA-26 / FEAT-23-04: gating state for Manual-Sync-Mode.
     * 'pending' conversations are visible in the History sidebar but
     * not picked up by the ExtractionQueue until they get confirmed
     * (Star-click, mark_for_memory, save_to_memory parallel call).
     * Default 'confirmed' for backward-compat.
     */
    syncState?: 'pending' | 'confirmed' | 'rejected';
    /**
     * FIX-23-01-01 / ADR-110 -- Cross-Interface-Thread-Klammer.
     * Identifier (`thread-${YYYY-MM-DD}-${6-hex}`) der mehrere
     * Conversations ueber source_interface-Grenzen hinweg verbindet.
     * Optional: Conversations ohne ID sind nicht Teil eines
     * Cross-Interface-Threads.
     */
    crossInterfaceThreadId?: string;
}

export interface UiMessage {
    role: 'user' | 'assistant';
    text: string;
    ts: string;
    /**
     * Serialised HTML of the assistant's collapsed "Steps" block (tool
     * calls + grouped operations) captured when the turn finished.
     * Re-injected on conversation reload so the user can still expand
     * the actions even after switching chats. Optional -- older
     * messages and turns without tool calls omit it.
     */
    toolStepsHtml?: string;
}

export interface ConversationData {
    meta: ConversationMeta;
    messages: MessageParam[];
    uiMessages: UiMessage[];
}

interface ConversationIndex {
    version: number;
    conversations: ConversationMeta[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
    // AUDIT-016 M-4: crypto.randomUUID() liefert 122 Bits Entropie statt
    // Math.random()s 24 Bits. Birthday-Collision damit praktisch
    // ausgeschlossen, ID-Predictability verschwindet. Wir behalten den
    // YYYY-MM-DD-Prefix fuer Sortier-/Browse-Komfort und nehmen die
    // ersten 12 hex-chars der UUID (48 Bit Entropie pro Tag, > 16M
    // mehr als die alte Variante).
    //
    // AUDIT-025 H-2 (GitHub code-scanning alert #67): Math.random()-Fallback
    // entfernt. Obsidian laeuft auf Electron (Chromium >= v85), wo
    // crypto.randomUUID() Teil der Standard Web Crypto API ist und immer
    // verfuegbar. Der Fallback war defensive coding gegen ein Szenario,
    // das in dieser Runtime nicht eintritt; CodeQL flagged ihn trotzdem
    // als js/insecure-randomness in einem security context.
    const date = new Date().toISOString().slice(0, 10);
    const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    return `${date}-${uuid}`;
}

// ---------------------------------------------------------------------------
// ConversationStore
// ---------------------------------------------------------------------------

export class ConversationStore {
    private dir: string;
    private indexPath: string;
    private index: ConversationIndex = { version: 1, conversations: [] };

    constructor(private fs: FileAdapter) {
        this.dir = 'history';
        this.indexPath = 'history/index.json';
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    async initialize(): Promise<void> {
        await this.ensureDir();
        await this.loadIndex();
    }

    // -----------------------------------------------------------------------
    // CRUD
    // -----------------------------------------------------------------------

    /**
     * Create a new conversation and return its id.
     *
     * BA-26 / FEAT-23-04: optional source-tagging + sync-state for
     * Cross-Surface MCP. Default values keep backward-compat with
     * Vault Operator-internal call sites that pass only mode + model.
     */
    async create(
        mode: string,
        model: string,
        opts?: { sourceInterface?: SourceInterface; syncState?: 'pending' | 'confirmed' | 'rejected' },
    ): Promise<string> {
        const id = generateId();
        const now = new Date().toISOString();
        const meta: ConversationMeta = {
            id,
            title: 'New Conversation',
            created: now,
            updated: now,
            messageCount: 0,
            mode,
            model,
            inputTokens: 0,
            outputTokens: 0,
            sourceInterface: opts?.sourceInterface,
            syncState: opts?.syncState,
        };
        this.index.conversations.unshift(meta);
        await this.saveIndex();
        return id;
    }

    /**
     * BA-26 / FEAT-23-03: list conversations filtered by source.
     * Pass `undefined` to get the full list. Conversations without an
     * explicit sourceInterface tag are treated as 'obsilo'.
     */
    listBySource(source: SourceInterface | undefined): ConversationMeta[] {
        if (!source) return this.list();
        return this.index.conversations.filter((c) =>
            (c.sourceInterface ?? 'obsilo') === source
        );
    }

    /**
     * BA-26 / FEAT-23-04: confirm a pending conversation. Idempotent.
     * Returns true on a state change (pending -> confirmed), false
     * if the row was already confirmed or unknown.
     */
    async confirm(id: string): Promise<boolean> {
        const meta = this.getMeta(id);
        if (!meta) return false;
        if ((meta.syncState ?? 'confirmed') === 'confirmed') return false;
        meta.syncState = 'confirmed';
        await this.saveIndex();
        return true;
    }

    /**
     * FIX-23-01-01 / ADR-110: append delta messages to an existing
     * conversation. Living-Document-Pfad fuer Cross-Surface MCP.
     *
     * Reads the existing data, concatenates apiMessages + uiMessages,
     * writes the combined set back. Updates meta.updated +
     * messageCount. Returns the new total messageCount.
     *
     * Returns -1 if the conversation does not exist (caller should
     * fall back to create).
     */
    async appendMessages(
        id: string,
        deltaApiMessages: MessageParam[],
        deltaUiMessages: UiMessage[],
    ): Promise<number> {
        const meta = this.getMeta(id);
        if (!meta) return -1;
        const data = await this.load(id);
        if (!data) return -1;

        const combinedApi = [...data.messages, ...deltaApiMessages];
        const combinedUi = [...data.uiMessages, ...deltaUiMessages];

        meta.updated = new Date().toISOString();
        meta.messageCount = combinedUi.length;

        const merged: ConversationData = { meta, messages: combinedApi, uiMessages: combinedUi };
        const filePath = `${this.dir}/${id}.json`;
        await this.fs.write(filePath, JSON.stringify(merged));
        await this.saveIndex();
        return combinedUi.length;
    }

    /**
     * FIX-23-01-01: list conversations sharing a Cross-Interface
     * Thread. Returns members across all source interfaces (so
     * History UI can group them).
     */
    listByThread(threadId: string): ConversationMeta[] {
        return this.index.conversations.filter((c) =>
            c.crossInterfaceThreadId === threadId
        );
    }

    /** Save (overwrite) full conversation data. */
    async save(id: string, messages: MessageParam[], uiMessages: UiMessage[]): Promise<void> {
        const meta = this.getMeta(id);
        if (!meta) return;

        meta.updated = new Date().toISOString();
        meta.messageCount = uiMessages.length;

        const data: ConversationData = { meta, messages, uiMessages };
        const filePath = `${this.dir}/${id}.json`;
        await this.fs.write(filePath, JSON.stringify(data));
        await this.saveIndex();
    }

    /** Update metadata fields (e.g., title, token counts). */
    async updateMeta(id: string, patch: Partial<ConversationMeta>): Promise<void> {
        const meta = this.getMeta(id);
        if (!meta) return;
        Object.assign(meta, patch, { updated: new Date().toISOString() });
        await this.saveIndex();
    }

    /** Load full conversation from disk. */
    async load(id: string): Promise<ConversationData | null> {
        const filePath = `${this.dir}/${id}.json`;
        try {
            const raw = await this.fs.read(filePath);
            return JSON.parse(raw) as ConversationData;
        } catch {
            return null;
        }
    }

    /** Return cached index (no disk I/O). Newest first. */
    list(): ConversationMeta[] {
        return this.index.conversations;
    }

    /** Delete a single conversation. */
    async delete(id: string): Promise<void> {
        this.index.conversations = this.index.conversations.filter((c) => c.id !== id);
        await this.saveIndex();
        const filePath = `${this.dir}/${id}.json`;
        try {
            await this.fs.remove(filePath);
        } catch { /* non-fatal */ }
    }

    /** Delete all conversations. */
    async deleteAll(): Promise<void> {
        for (const c of this.index.conversations) {
            try {
                await this.fs.remove(`${this.dir}/${c.id}.json`);
            } catch { /* non-fatal */ }
        }
        this.index.conversations = [];
        await this.saveIndex();
    }

    /** Get count of stored conversations. */
    count(): number {
        return this.index.conversations.length;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private getMeta(id: string): ConversationMeta | undefined {
        return this.index.conversations.find((c) => c.id === id);
    }

    private async ensureDir(): Promise<void> {
        const exists = await this.fs.exists(this.dir);
        if (!exists) {
            await this.fs.mkdir(this.dir);
        }
    }

    private async loadIndex(): Promise<void> {
        try {
            const raw = await this.fs.read(this.indexPath);
            this.index = JSON.parse(raw) as ConversationIndex;
        } catch {
            // No index yet — start fresh
            this.index = { version: 1, conversations: [] };
        }
    }

    private async saveIndex(): Promise<void> {
        await this.fs.write(this.indexPath, JSON.stringify(this.index, null, 2));
    }
}
