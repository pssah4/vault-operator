import { describe, it, expect } from 'vitest';
import {
	KNOWLEDGE_DOMAINS,
	pathPrefixToDomain,
	domainToUriScheme,
	type KnowledgeDomain,
} from '../knowledgeDomains';

describe('knowledgeDomains', () => {
	it('exposes the canonical seven-domain list in stable order', () => {
		expect(KNOWLEDGE_DOMAINS).toEqual([
			'note',
			'session',
			'episode',
			'fact',
			'mention',
			'thread',
			'entity',
		]);
	});

	it('maps colon-prefixed paths to their domain', () => {
		expect(pathPrefixToDomain('session:abc-123')).toBe('session');
		expect(pathPrefixToDomain('episode:42')).toBe('episode');
		expect(pathPrefixToDomain('fact:xyz')).toBe('fact');
		expect(pathPrefixToDomain('mention:m-1')).toBe('mention');
		expect(pathPrefixToDomain('thread:t-1')).toBe('thread');
		expect(pathPrefixToDomain('entity:e-1')).toBe('entity');
	});

	it('falls back to note for vault file paths', () => {
		expect(pathPrefixToDomain('Notes/Daily/2026-06-22.md')).toBe('note');
		expect(pathPrefixToDomain('readme.md')).toBe('note');
	});

	it('does not LIKE-match: session_intro.md must be a note', () => {
		// Audit pathology: the previous backfill used LIKE 'session%'
		// which swallowed regular notes whose filename started with
		// "session". Strict colon match prevents that.
		expect(pathPrefixToDomain('session_intro.md')).toBe('note');
		expect(pathPrefixToDomain('episodes-overview.md')).toBe('note');
		expect(pathPrefixToDomain('facts.md')).toBe('note');
	});

	it('returns the fact: scheme without double slash', () => {
		// RecallHit.uri convention: facts use the bare "fact:" scheme,
		// other domains use "<domain>://".
		expect(domainToUriScheme('fact')).toBe('fact:');
	});

	it('returns <domain>:// for every non-fact domain', () => {
		const nonFact: KnowledgeDomain[] = [
			'note',
			'session',
			'episode',
			'mention',
			'thread',
			'entity',
		];
		for (const domain of nonFact) {
			expect(domainToUriScheme(domain)).toBe(`${domain}://`);
		}
	});
});
