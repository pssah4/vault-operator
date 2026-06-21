import { describe, it, expect } from 'vitest';
import { parseDocument } from '../parseDocument';
import type ObsidianAgentPlugin from '../../../main';

// Tests cover CSV/JSON/XML/unsupported paths -- none touch parsePdf so an
// empty stub satisfies the required-plugin contract (FIX-06-01-01).
const stubPlugin = {} as ObsidianAgentPlugin;

function toArrayBuffer(text: string): ArrayBuffer {
    return new TextEncoder().encode(text).buffer;
}

describe('parseDocument', () => {
    describe('routing', () => {
        it('should throw for unsupported extensions', async () => {
            await expect(parseDocument(toArrayBuffer('data'), 'xyz', stubPlugin))
                .rejects.toThrow('Unsupported document format: .xyz');
        });

        it('should route csv to CSV parser', async () => {
            const result = await parseDocument(toArrayBuffer('A,B\n1,2'), 'csv', stubPlugin);
            expect(result.metadata.format).toBe('csv');
        });

        it('should handle case-insensitive extensions', async () => {
            const result = await parseDocument(toArrayBuffer('A,B\n1,2'), 'CSV', stubPlugin);
            expect(result.metadata.format).toBe('csv');
        });
    });

    describe('JSON parsing', () => {
        it('should parse valid JSON object', async () => {
            const data = JSON.stringify({ name: 'test', value: 42 });
            const result = await parseDocument(toArrayBuffer(data), 'json', stubPlugin);
            expect(result.text).toContain('JSON Object');
            expect(result.text).toContain('2 key(s)');
            expect(result.text).toContain('name');
            expect(result.metadata.format).toBe('json');
        });

        it('should parse valid JSON array', async () => {
            const data = JSON.stringify([1, 2, 3]);
            const result = await parseDocument(toArrayBuffer(data), 'json', stubPlugin);
            expect(result.text).toContain('JSON Array');
            expect(result.text).toContain('3 element(s)');
        });

        it('should handle JSON parse errors', async () => {
            const result = await parseDocument(toArrayBuffer('{invalid json'), 'json', stubPlugin);
            expect(result.text).toContain('parse error');
        });

        it('should handle JSON primitive values', async () => {
            const result = await parseDocument(toArrayBuffer('"hello"'), 'json', stubPlugin);
            expect(result.text).toContain('JSON string');
        });

        it('should show first 10 keys for large objects', async () => {
            const obj: Record<string, number> = {};
            for (let i = 0; i < 15; i++) obj[`key${i}`] = i;
            const result = await parseDocument(toArrayBuffer(JSON.stringify(obj)), 'json', stubPlugin);
            expect(result.text).toContain('...');
        });
    });

    describe('XML parsing', () => {
        it('should detect root element name', async () => {
            const xml = '<catalog><item>Test</item></catalog>';
            const result = await parseDocument(toArrayBuffer(xml), 'xml', stubPlugin);
            expect(result.text).toContain('root: <catalog>');
            expect(result.metadata.format).toBe('xml');
        });

        it('should handle XML declaration', async () => {
            const xml = '<?xml version="1.0"?>\n<root><child/></root>';
            const result = await parseDocument(toArrayBuffer(xml), 'xml', stubPlugin);
            expect(result.text).toContain('root: <root>');
        });

        it('should handle BOM in XML', async () => {
            const xml = '\uFEFF<data><item/></data>';
            const result = await parseDocument(toArrayBuffer(xml), 'xml', stubPlugin);
            expect(result.text).toContain('root: <data>');
        });

        it('should count child elements', async () => {
            // Regex requires [\s>] after tag name, so use non-self-closing tags
            const xml = '<root><item>A</item><item>B</item><item>C</item></root>';
            const result = await parseDocument(toArrayBuffer(xml), 'xml', stubPlugin);
            expect(result.text).toContain('3 element(s)');
        });
    });
});
