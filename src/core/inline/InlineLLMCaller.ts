/**
 * InlineLLMCaller -- single-turn LLM helper for Inline-Actions (EPIC-33).
 *
 * Most Inline-Actions (Lookup, Rewrite, Translate, Summarize) do NOT
 * need the full agent loop. They are single-turn LLM calls without
 * tools. This helper abstracts the provider-API call so each action
 * can be unit-tested against a mock caller and the plugin entry-point
 * supplies the live implementation (built on src/api/buildApiHandlerForModel).
 *
 * For multi-turn agentic actions (Inline-Chat FEAT-33-05) the action
 * uses AgentTaskRunner directly instead of this helper.
 *
 * Architecture-map concept: inline-llm-caller (Provider-Probe-Layer)
 * Related: ADR-138, ADR-140, FEAT-33-02, FEAT-33-03, FEAT-33-06, FEAT-33-07.
 */

export interface InlineLLMStreamArgs {
    /** System prompt the action wants to apply (action-specific verb + persona). */
    systemPrompt: string;
    /** User message body. Typically the selection + an instruction. */
    userMessage: string;
    /**
     * Optional model id override (FEAT-33-10 Per-Action-Pin) or
     * tier-routing hint (Haiku for Lookup/Translate/Summarize). When
     * undefined the caller uses the main-chat default.
     */
    modelOverride?: string;
    /** Abort signal so the menu close / dispose can cancel the stream. */
    abortSignal?: AbortSignal;
}

export interface InlineLLMStreamCallbacks {
    /** Called for each streamed text chunk. */
    onText: (chunk: string) => void;
    /** Called once the stream completes successfully. */
    onComplete: () => void;
    /** Called on any error. */
    onError: (error: Error) => void;
}

export interface InlineLLMCaller {
    stream(args: InlineLLMStreamArgs, callbacks: InlineLLMStreamCallbacks): Promise<void>;
}
