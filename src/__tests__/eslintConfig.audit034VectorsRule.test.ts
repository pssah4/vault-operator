import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// PLAN-41 Wave 4 / ADR-137: Drift-Pin fuer den Layer-Guard auf der `vectors`-Tabelle.
// Wenn die Regel aus eslint.config.mjs verschwindet, faellt der einzige automatische
// Schutz gegen rohe `FROM vectors` Statements ausserhalb der Helfer-Heimat (VectorStore,
// KnowledgeDB, knowledgeDomains). Der Test liest die Config als Text -- die Config wird
// in ESM exportiert und laeuft im Vitest-Kontext nicht zuverlaessig auswertbar, ein
// Substring-Check reicht fuer die Drift-Pin-Absicht.
describe('PLAN-41 Wave 4 -- vectors-table lint guard', () => {
    it('keeps the no-restricted-syntax rule for the vectors table in eslint.config.mjs', () => {
        const configPath = resolve(__dirname, '../../eslint.config.mjs');
        const config = readFileSync(configPath, 'utf8');

        const hasRule = config.includes('no-restricted-syntax');
        const mentionsVectors = config.includes('vectors');
        const mentionsHelperHome = config.includes('VectorStore.ts');

        if (!hasRule || !mentionsVectors || !mentionsHelperHome) {
            throw new Error(
                'PLAN-41 Wave 4: the vectors-table lint guard is missing from eslint.config.mjs. See ADR-137.',
            );
        }

        expect(hasRule).toBe(true);
        expect(mentionsVectors).toBe(true);
        expect(mentionsHelperHome).toBe(true);
    });
});
