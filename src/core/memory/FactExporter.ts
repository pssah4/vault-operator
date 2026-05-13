/**
 * FactExporter -- render facts as human-readable Markdown.
 *
 * Phase-2 deliverable from FEATURE-0316 (PLAN-005 task 2). Two purposes:
 *
 *   1. Backup safety: Sebastian can dump the live DB to a Markdown file
 *      before the v1 -> v2 migration cuts over (FEATURE-0316 SC-05).
 *   2. Inspection: a quick `cat memory.md`-style overview of what the
 *      engine actually stores, grouped by primary topic so categories
 *      stay readable even at 1000+ facts.
 *
 * Engine-Public utility: Constructor-Injection over FactStore, no
 * obsidian, no plugin globals (ADR-080). Read-only -- never writes to
 * the DB, so it is safe to call mid-migration.
 *
 * The Markdown layout is tuned to be easy on the eye AND easy to grep:
 *
 *   # Memory facts (exported 2026-04-27T12:00Z, 42 latest facts)
 *
 *   ## tools (5 facts)
 *
 *   - **Sebastian uses Obsidian as primary note app**
 *     `(importance: 0.85, kind: preference, source: session://abc)`
 *   - ...
 *
 *   ## identity (3 facts)
 *
 *   ...
 *
 * Facts without topics land under a synthetic "(no topic)" group so
 * they are still visible.
 */

import type { Fact } from './FactStore';
import { FactStore, type ListOptions } from './FactStore';

export interface ExportOptions {
    /** Pass false to include deprecated + non-latest facts. Default: true. */
    onlyLatest?: boolean;
    /** Optional kind filter, forwarded to FactStore.listLatest. */
    kind?: ListOptions['kind'];
    /** Maximum facts to export. Default: 10000 (effectively all for Sebastian). */
    limit?: number;
    /** Override the timestamp shown in the title (mostly for tests). */
    timestamp?: string;
}

export interface ExportResult {
    markdown: string;
    factCount: number;
    topicCount: number;
}

const NO_TOPIC = '(no topic)';

export class FactExporter {
    constructor(private readonly factStore: FactStore) {}

    export(opts: ExportOptions = {}): ExportResult {
        const facts = this.factStore.listLatest({
            onlyLatest: opts.onlyLatest ?? true,
            kind: opts.kind,
            limit: opts.limit ?? 10000,
            orderBy: 'importance',
        });
        const grouped = groupByPrimaryTopic(facts);
        const timestamp = opts.timestamp ?? new Date().toISOString();
        const markdown = renderMarkdown(grouped, facts.length, timestamp);
        return {
            markdown,
            factCount: facts.length,
            topicCount: grouped.size,
        };
    }
}

function groupByPrimaryTopic(facts: Fact[]): Map<string, Fact[]> {
    const groups = new Map<string, Fact[]>();
    for (const fact of facts) {
        const primary = fact.topics.length > 0 ? fact.topics[0] : NO_TOPIC;
        const list = groups.get(primary) ?? [];
        list.push(fact);
        groups.set(primary, list);
    }
    // Sort each group's facts by importance desc (FactStore already does it
    // globally, but the in-group order can drift after grouping).
    for (const list of groups.values()) {
        list.sort((a, b) => b.importance - a.importance);
    }
    return groups;
}

function renderMarkdown(
    groups: Map<string, Fact[]>,
    totalFacts: number,
    timestamp: string,
): string {
    const sortedTopics = sortTopicsByGroupSize(groups);

    const lines: string[] = [];
    lines.push(`# Memory facts (exported ${timestamp}, ${totalFacts} latest fact${totalFacts === 1 ? '' : 's'})`);
    lines.push('');

    if (totalFacts === 0) {
        lines.push('_No facts to export._');
        return lines.join('\n');
    }

    for (const topic of sortedTopics) {
        const groupFacts = groups.get(topic);
        if (!groupFacts || groupFacts.length === 0) continue;
        lines.push(`## ${topic} (${groupFacts.length} fact${groupFacts.length === 1 ? '' : 's'})`);
        lines.push('');
        for (const fact of groupFacts) {
            lines.push(`- **${escapeMarkdown(fact.text)}**`);
            lines.push(`  ${renderProvenance(fact)}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function sortTopicsByGroupSize(groups: Map<string, Fact[]>): string[] {
    return [...groups.keys()].sort((a, b) => {
        // (no topic) is always last
        if (a === NO_TOPIC) return 1;
        if (b === NO_TOPIC) return -1;
        const sizeDiff = (groups.get(b)!.length) - (groups.get(a)!.length);
        if (sizeDiff !== 0) return sizeDiff;
        return a.localeCompare(b);
    });
}

function renderProvenance(fact: Fact): string {
    const parts: string[] = [];
    parts.push(`importance: ${fact.importance.toFixed(2)}`);
    parts.push(`kind: ${fact.kind}`);
    if (fact.sourceUri) parts.push(`source_uri: ${fact.sourceUri}`);
    if (fact.sourceSessionId) parts.push(`session: session://${fact.sourceSessionId}`);
    if (fact.sourceThreadId) parts.push(`thread: thread://${fact.sourceThreadId}`);
    parts.push(`source_interface: ${fact.sourceInterface}`);
    return `\`(${parts.join(', ')})\``;
}

/**
 * Escape backslashes, backticks, and literal newlines so the bullet item
 * stays single-line and the surrounding inline-code span is not broken by
 * a stray backtick or backslash-backtick combination.
 *
 * AUDIT-023 L-4 (code-scanning #66): order matters. Escape backslashes
 * FIRST so the second pass cannot double-process the backslash we just
 * inserted in front of a backtick.
 */
function escapeMarkdown(text: string): string {
    return text
        .replace(/\r?\n/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`');
}
