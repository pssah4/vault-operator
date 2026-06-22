/**
 * Drift-Pin fuer PLAN-41 Wave 2 Task 2.3 (ADR-137).
 *
 * Wave 1 Task 1.3 hat VectorStore.getStubCandidatePaths so umgebaut, dass
 * die SQL-Abfrage intern bereits auf domain='note' filtert. Damit ist die
 * Laufzeit-Pruefung `p.startsWith('session:')` bzw. `p.startsWith('episode:')`
 * in SemanticIndexService.cleanupStubVectors redundant geworden und wurde
 * entfernt.
 *
 * Dieser Test verhindert, dass die Pruefung versehentlich wieder eingefuehrt
 * wird (z.B. durch Cherry-Pick eines aelteren Branches).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('cleanupStubVectors drift pin (ADR-137 / PLAN-41 Task 2.3)', () => {
    it("contains no redundant startsWith('session:') guard", () => {
        const file = resolve(
            __dirname,
            '..',
            'SemanticIndexService.ts',
        );
        const source = readFileSync(file, 'utf8');

        const pattern = /startsWith\(['"]session:['"]\)/;
        const matched = pattern.test(source);

        expect(
            matched,
            "SemanticIndexService.ts darf keinen startsWith('session:')-Guard " +
                'mehr enthalten. Siehe ADR-137 und PLAN-41 Task 2.3: ' +
                'getStubCandidatePaths filtert bereits in SQL auf ' +
                "domain='note'.",
        ).toBe(false);
    });
});
