/**
 * CompositionStackService -- FEAT-29-10 Step A.
 *
 * Tracks the in-flight skill-to-skill / skill-to-mcp composition chain
 * for one AgentTask. invoke_skill / invoke_mcp_server push entries
 * before they spawn the sub-work; the same call pops on success or
 * failure. Cycle detection (same entry already in the stack) and
 * depth-limit checks happen at push time so the caller knows up-front
 * whether it can proceed.
 *
 * Lives per-AgentTask (one instance per top-level user turn). Reset
 * implicitly when a new turn begins.
 */

export interface CompositionEntry {
    /** Distinguishes skill calls from mcp-server calls so a skill and
     *  an mcp tool that share an id do not cross-trigger cycles. */
    type: 'skill' | 'mcp';
    /** Skill name or `{server-id}:{tool-name}`. */
    id: string;
}

export class CompositionCycleError extends Error {
    constructor(public readonly stack_chain: CompositionEntry[]) {
        const path = stack_chain.map((e) => `${e.type}:${e.id}`).join(' -> ');
        super(`Composition cycle detected: ${path}`);
        this.name = 'CompositionCycleError';
    }
}

export class CompositionDepthExceededError extends Error {
    constructor(
        public readonly maxDepth: number,
        public readonly stack_chain: CompositionEntry[],
    ) {
        const path = stack_chain.map((e) => `${e.type}:${e.id}`).join(' -> ');
        super(`Composition depth ${stack_chain.length} exceeds limit ${maxDepth}: ${path}`);
        this.name = 'CompositionDepthExceededError';
    }
}

export class CompositionStackService {
    private stack: CompositionEntry[] = [];

    constructor(private readonly maxDepth: number) {}

    /**
     * Push a new entry. Throws CompositionCycleError if the entry is
     * already in the stack (same type+id), or CompositionDepthExceededError
     * if the resulting stack would exceed maxDepth.
     */
    push(entry: CompositionEntry): void {
        if (this.contains(entry)) {
            throw new CompositionCycleError([...this.stack, entry]);
        }
        if (this.stack.length + 1 > this.maxDepth) {
            throw new CompositionDepthExceededError(this.maxDepth, [...this.stack, entry]);
        }
        this.stack.push(entry);
    }

    pop(): CompositionEntry | undefined {
        return this.stack.pop();
    }

    /** Returns a frozen snapshot so callers cannot mutate the stack. */
    current(): readonly CompositionEntry[] {
        return Object.freeze([...this.stack]);
    }

    contains(entry: CompositionEntry): boolean {
        return this.stack.some((e) => e.type === entry.type && e.id === entry.id);
    }

    depth(): number {
        return this.stack.length;
    }
}
