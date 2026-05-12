/**
 * Date/Time Header Section
 *
 * Tells the model what day it is. Placed LAST in the system prompt and AFTER
 * the cache breakpoint (ADR-62 amendment) — the date changes daily, so it must
 * sit in the volatile tail, never in the cached prefix.
 *
 * Default granularity is the calendar date only (`includeTime` defaults to
 * false): a date-only line is stable for a whole day, so it does not poison
 * the KV-cache mid-session. The time-of-day line is opt-in (`includeTime` /
 * the `includeCurrentTimeInContext` setting) for the rare task that needs it,
 * at the cost of a cache miss on every call.
 */

export function getDateTimeSection(includeTime = false): string {
    const now = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const isoDate = now.toISOString().slice(0, 10);
    const humanDate = new Intl.DateTimeFormat('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz,
    }).format(now);

    let timeLine = '';
    if (includeTime) {
        const humanTime = new Intl.DateTimeFormat('en-US', {
            hour: '2-digit', minute: '2-digit', timeZoneName: 'short', hour12: false, timeZone: tz,
        }).format(now);
        timeLine = `Local time: ${humanTime} [${tz}]\n`;
    }

    return (
        `TODAY IS: ${humanDate} (${isoDate})\n` +
        timeLine +
        `IMPORTANT: Always use the date above (${isoDate}) for any notes, frontmatter dates, or timestamps you create. ` +
        `Do not infer or guess a different date.\n\n====\n\n`
    );
}
