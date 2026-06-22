/**
 * Canonical list of knowledge domains the tracing layer separates on.
 *
 * Order is stable and part of the contract: serializers, dashboards
 * and audit dumps iterate this list directly.
 */
export const KNOWLEDGE_DOMAINS = [
	'note',
	'session',
	'episode',
	'fact',
	'mention',
	'thread',
	'entity',
] as const;

export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

const PREFIX_TO_DOMAIN: ReadonlyArray<readonly [string, KnowledgeDomain]> = [
	['session:', 'session'],
	['episode:', 'episode'],
	['fact:', 'fact'],
	['mention:', 'mention'],
	['thread:', 'thread'],
	['entity:', 'entity'],
];

/**
 * Resolve the domain of a path by its colon-prefix.
 *
 * Strict colon match: 'session:abc' -> 'session', but 'session_intro.md'
 * stays a regular 'note'. The previous backfill used a LIKE 'session%'
 * pattern, which mis-classified vault notes whose filename started with
 * a domain keyword.
 */
export function pathPrefixToDomain(path: string): KnowledgeDomain {
	for (const [prefix, domain] of PREFIX_TO_DOMAIN) {
		if (path.startsWith(prefix)) {
			return domain;
		}
	}
	return 'note';
}

/**
 * URI scheme for a given domain.
 *
 * Facts use the bare 'fact:' scheme (no double-slash) to stay consistent
 * with the existing RecallHit.uri convention. Every other domain uses
 * '<domain>://'.
 */
export function domainToUriScheme(domain: KnowledgeDomain): string {
	if (domain === 'fact') {
		return 'fact:';
	}
	return `${domain}://`;
}
