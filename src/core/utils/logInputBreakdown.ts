/**
 * logInputBreakdown -- per-API-call diagnostic to see WHERE the input
 * tokens go. Triggered when total input crosses a threshold so noisy
 * subtasks stay quiet.
 *
 * Run once per `api.createMessage(...)` call, BEFORE the call. Logs:
 *  - system prompt size (chars / approx tokens)
 *  - tools count
 *  - history: N messages, total chars
 *  - top-3 messages by char count, with role + short content preview
 *
 * Token estimate uses chars / 4 -- close enough for ranking. The point
 * is to identify the dominant section, not bill against a budget.
 */

import type { MessageParam, ContentBlock } from '../../api/types';

const THRESHOLD_CHARS = 60_000; // ~15k tokens -- fires once we are above the
                                 // routine "small turn" envelope.

interface MessageStat {
    index: number;
    role: string;
    chars: number;
    blockCount: number;
    blockTypes: string[];
    preview: string;
}

function blockChars(block: ContentBlock): number {
    if (typeof (block as { text?: unknown }).text === 'string') {
        return ((block as { text: string }).text).length;
    }
    if (typeof (block as { content?: unknown }).content === 'string') {
        return ((block as { content: string }).content).length;
    }
    if (Array.isArray((block as { content?: unknown }).content)) {
        let total = 0;
        for (const c of (block as { content: ContentBlock[] }).content) {
            total += blockChars(c);
        }
        return total;
    }
    if ((block as { input?: unknown }).input) {
        try { return JSON.stringify((block as { input: unknown }).input).length; }
        catch { return 0; }
    }
    return 0;
}

function blockType(block: ContentBlock): string {
    return (block as { type?: string }).type ?? 'unknown';
}

function messageChars(msg: MessageParam): { chars: number; blockCount: number; blockTypes: string[]; preview: string } {
    if (typeof msg.content === 'string') {
        return {
            chars: msg.content.length,
            blockCount: 1,
            blockTypes: ['text'],
            preview: msg.content.slice(0, 80).replace(/\s+/g, ' '),
        };
    }
    let chars = 0;
    const types: string[] = [];
    let preview = '';
    if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
            chars += blockChars(b);
            const t = blockType(b);
            types.push(t);
            if (!preview && (t === 'text' || t === 'tool_result')) {
                const text = (b as { text?: string }).text ?? '';
                const tr = (b as { content?: unknown }).content;
                preview = (text || (typeof tr === 'string' ? tr : '')).slice(0, 80).replace(/\s+/g, ' ');
            }
        }
    }
    return {
        chars,
        blockCount: Array.isArray(msg.content) ? msg.content.length : 0,
        blockTypes: types,
        preview,
    };
}

export function logInputBreakdown(
    label: string,
    systemPrompt: string,
    history: MessageParam[],
    toolCount: number,
): void {
    const sysChars = systemPrompt.length;
    const stats: MessageStat[] = history.map((m, i) => {
        const s = messageChars(m);
        return { index: i, role: m.role, chars: s.chars, blockCount: s.blockCount, blockTypes: s.blockTypes, preview: s.preview };
    });
    const historyChars = stats.reduce((acc, s) => acc + s.chars, 0);
    const totalChars = sysChars + historyChars;
    if (totalChars < THRESHOLD_CHARS) return;

    const totalTok = Math.round(totalChars / 4);
    const sysTok = Math.round(sysChars / 4);
    const historyTok = Math.round(historyChars / 4);

    const top = [...stats].sort((a, b) => b.chars - a.chars).slice(0, 3);
    const topLine = top.map(s => {
        const blocks = s.blockTypes.length > 0 ? `[${s.blockTypes.slice(0, 3).join(',')}${s.blockTypes.length > 3 ? '...' : ''}]` : '';
        const tok = Math.round(s.chars / 4);
        const prev = s.preview ? ` "${s.preview}${s.preview.length >= 80 ? '…' : ''}"` : '';
        return `#${s.index} ${s.role}${blocks}=${tok}t${prev}`;
    }).join(' | ');

    console.debug(
        `[InputBreakdown:${label}] total=~${totalTok}t (sys=${sysTok}t hist=${historyTok}t over ${stats.length} msgs, ${toolCount} tools). ` +
        `Top msgs: ${topLine}`,
    );
}
