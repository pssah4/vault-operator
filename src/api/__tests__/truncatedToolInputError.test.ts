import { describe, it, expect } from 'vitest';
import { truncatedToolInputError } from '../types';

describe('truncatedToolInputError', () => {
    it('includes the raw parser error', () => {
        const msg = truncatedToolInputError('write_file', "Expected ',' or '}' after property value in JSON at position 65");
        expect(msg).toContain("Expected ',' or '}' after property value in JSON at position 65");
    });

    it('tells the model not to retry and how to split the write', () => {
        const msg = truncatedToolInputError('write_file', 'bad json');
        expect(msg).toContain('Do NOT retry the same call');
        expect(msg).toContain('write_file');
        expect(msg).toContain('append_to_file');
        // The double-emit guardrail must be present.
        expect(msg.toLowerCase()).toContain('do not also print');
    });

    it('names the cause as a max_tokens cutoff when flagged', () => {
        const truncated = truncatedToolInputError('write_file', 'x', true);
        const malformed = truncatedToolInputError('write_file', 'x', false);
        expect(truncated).toContain('max output token limit');
        expect(malformed).not.toContain('max output token limit');
        expect(malformed).toContain('truncated or malformed');
    });

    it('mentions the offending tool name', () => {
        expect(truncatedToolInputError('create_pptx', 'oops')).toContain('"create_pptx"');
    });
});
