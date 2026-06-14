/**
 * TaskRouter -- v2.10.0
 *
 * Classifies each user prompt at the start of a new agent task into
 * "simple" vs "complex". Simple tasks (office-file creation, single-file
 * read/write) get routed onto the helper model (typically Sonnet or
 * Haiku); complex tasks (research, multi-step synthesis) stay on the
 * main model.
 *
 * Two-stage design:
 *
 *   1. classifyByRegex(prompt): cheap regex scan that handles obvious
 *      cases. Returns 'simple' | 'complex' | 'unknown'.
 *
 *   2. classifyWithFallback(prompt): runs stage 1 first. When stage 1
 *      returns 'unknown', issues a one-shot LLM call to the helper
 *      model ("simple" vs "complex" -- one token answer). The fallback
 *      is opt-in via the second parameter so callers that cannot afford
 *      the latency (or have no helper model) stay regex-only.
 *
 * Out-of-scope: deciding WHICH helper model to use. The caller already
 * has a helperApi via getHelperApi(); TaskRouter only answers "should we
 * route this onto it or not".
 */

import type { ApiHandler } from '../../api/types';

export type TaskClassification = 'simple' | 'complex' | 'unknown';

/**
 * Office-file creation pattern. Matches German + English verbs followed
 * (in any order) by a known file format keyword. Lazy spacing tolerates
 * arbitrary words in between.
 */
const SIMPLE_OFFICE_RE = /\b(erstelle|create|mach(?:e)?|generate|build)\b.*\b(xlsx|excel|tabelle|spreadsheet|docx|word|pptx|presentation|drawing|excalidraw|canvas|drawio)\b/i;

/**
 * Single-file read / write pattern. Matches when the prompt is a short
 * imperative ending in a filename with a known extension.
 */
const SIMPLE_FILE_OP_RE = /^\s*(lies|read|schreibe?|write|oeffne|open)\b.*\.(md|txt|json|yaml|yml|csv)\b/i;

/**
 * Research / synthesis / explanation verbs. Strong "complex" signal.
 */
/**
 * Research / synthesis / explanation verbs (German + English). Word
 * stems matched loosely so inflected forms still trigger -- "analysiere",
 * "analysierst", "analysiert" all hit `analysier`. The "fasse ...
 * zusammen" idiom needs its own clause since it splits the verb.
 */
const COMPLEX_RESEARCH_RE = /\b(such\w*|finde|find|summari[sz]e\w*|analysier\w*|analyse\w*|erklaer\w*|explain\w*|recherchier\w*|research\w*|vergleich\w*|compare\w*|warum|why|wie funktioniert|how does)\b|\bfasse\b.*\bzusammen\b/i;

/**
 * Multi-step indicators. When the user explicitly chains steps, the
 * task is multi-turn by definition -- main model.
 */
const COMPLEX_MULTISTEP_RE = /\b(dann|danach|nachdem|sobald|first.*then|step by step|schritt fuer schritt)\b/i;

/**
 * FEAT-29-05: skill-creation prompts always route to the main
 * (flagship) model. Triggers cover the verb + "skill" noun pattern in
 * both English and German, plus the open-ended "kannst du das
 * automatisieren" phrasing. Matches BEFORE the simple/short-prompt
 * fallbacks so a short "build me a skill" still escalates.
 */
const COMPLEX_SKILL_CREATION_RE =
    /\b(build|create|make|baue?|bau|erstelle?|generate|neuer|new)\b[^.\n]*\bskills?\b|\b(kannst du|can you)\b[^.\n]*\b(automatisier\w*|automate)\b/i;

/**
 * FEAT-29-08: skill-translation prompts always route to the main
 * (flagship) model. Python-to-JavaScript code translation requires
 * the strongest model, otherwise subtle semantic bugs leak into the
 * generated code. Triggers cover the verb + "skill" / "anthropic skill"
 * noun pattern in EN+DE plus the import/clone wording often used.
 */
const COMPLEX_SKILL_TRANSLATION_RE =
    /\b(translate|convert|port|uebersetze?|konvertier\w*|portier\w*)\b[^.\n]*\b(skills?|anthropic\s+skills?|python\s+skills?)\b|\b(import|hole|clone)\b[^.\n]*\banthropic\b[^.\n]*\bskills?/i;

const SHORT_PROMPT_CHARS = 80;
const LONG_PROMPT_CHARS = 300;

/**
 * Gate for the auto-routing entry in AgentTask.run() (issue #44).
 *
 * The TaskRouter only ever runs for the top-level task (subtasks inherit
 * the parent's api) AND only when no manual model override is active. A
 * manual chat-header model pick is a hard override that wins over
 * auto-routing for the whole conversation: VO manual override > TaskRouter.
 * Without this gate, a short/simple prompt under a manual override was
 * silently swapped onto the helper (budget) model, defeating the user's
 * explicit choice. Mirrors the already-gated mode-model path and the
 * consult_flagship suppression that also honour the override flag.
 */
export function shouldRunTaskRouter(depth: number, modelOverrideActive: boolean): boolean {
    return depth === 0 && !modelOverrideActive;
}

export class TaskRouter {
    /**
     * Stage-1 regex classifier. Pure function over the prompt text. Returns
     * 'unknown' for prompts that match neither side cleanly so the caller
     * can decide whether to invoke the (slower) LLM fallback.
     */
    classifyByRegex(prompt: string): TaskClassification {
        // AgentSidebarView appends <context>...</context> and
        // <vault_context>...</vault_context> blocks to every user message
        // (active file, vault stats). Those blocks routinely push the
        // raw prompt past 300 chars and contain words like "files",
        // "folder" that have nothing to do with intent. Strip them and
        // classify only what the user actually typed.
        const userTextOnly = prompt
            .replace(/<context>[\s\S]*?<\/context>/gi, '')
            .replace(/<vault_context>[\s\S]*?<\/vault_context>/gi, '')
            // Also strip an unterminated tag opening, in case the
            // appended block was truncated.
            .replace(/<(?:context|vault_context)>[\s\S]*$/i, '');
        const text = userTextOnly.trim();
        if (text.length === 0) return 'unknown';

        // Strong complex signals win first
        if (COMPLEX_SKILL_CREATION_RE.test(text)) return 'complex';
        if (COMPLEX_SKILL_TRANSLATION_RE.test(text)) return 'complex';
        if (COMPLEX_MULTISTEP_RE.test(text)) return 'complex';
        if (COMPLEX_RESEARCH_RE.test(text)) return 'complex';
        if (text.length > LONG_PROMPT_CHARS) return 'complex';

        // Strong simple signals
        if (SIMPLE_OFFICE_RE.test(text)) return 'simple';
        if (SIMPLE_FILE_OP_RE.test(text)) return 'simple';

        // Short prompts that did not match anything obvious are usually
        // small one-off tool calls. "Erstelle test.md" / "show vault stats".
        if (text.length < SHORT_PROMPT_CHARS) return 'simple';

        return 'unknown';
    }

    /**
     * Stage-2 LLM fallback. Issues a tiny classification request against
     * the supplied helper handler and parses the response.
     *
     * Returns 'simple' or 'complex' (never 'unknown'). On any error the
     * fallback defaults to 'complex' so the main model handles the task,
     * which is the safer side to fail toward.
     */
    async classifyWithFallback(prompt: string, helperApi: ApiHandler | null): Promise<'simple' | 'complex'> {
        const stage1 = this.classifyByRegex(prompt);
        if (stage1 === 'simple' || stage1 === 'complex') return stage1;

        if (!helperApi) {
            // No fallback available -- default to safe side.
            return 'complex';
        }

        try {
            const systemPrompt =
                'You are a task complexity classifier. Reply with exactly one word: ' +
                '"simple" for tasks that fit in 1-3 tool calls (single file create or read, ' +
                'short note write, format conversion), or "complex" for tasks that require ' +
                'research, multi-step reasoning, comparing several sources, or generating long ' +
                'structured output. Reply only with simple or complex.';
            const stream = helperApi.createMessage(
                systemPrompt,
                [{ role: 'user', content: prompt.slice(0, 1000) }],
                [],
            );
            let answer = '';
            for await (const chunk of stream) {
                if (chunk.type === 'text') answer += chunk.text;
                if (answer.length > 50) break;
            }
            const normalised = answer.toLowerCase().trim();
            if (normalised.startsWith('simple')) return 'simple';
            return 'complex';
        } catch (e) {
            console.warn('[TaskRouter] classifyWithFallback failed, defaulting to complex:', e);
            return 'complex';
        }
    }
}
