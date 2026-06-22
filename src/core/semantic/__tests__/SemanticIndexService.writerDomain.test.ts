/**
 * PLAN-41 Wave 3: SemanticIndexService writer-site migration.
 *
 * Hintergrund: VectorStore.insertChunks() ist nur intern in VectorStore.ts
 * vorgesehen. Aufrufer ausserhalb sollen die domaenenspezifischen Helfer
 * (insertNoteVector, insertSessionVector, insertEpisodeVector) benutzen,
 * weil diese den Discriminator (note/session/episode) explizit setzen
 * und damit Stigmergy-Recall-Layer sauber separieren.
 *
 * Diese Source-Level-Probe sichert ab, dass SemanticIndexService.ts
 * keinen direkten vectorStore.insertChunks(...)-Aufruf mehr enthaelt.
 * Jeder neue Aufruf gilt als Bug und faellt hier rot.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

describe("SemanticIndexService writer-domain migration", () => {
    it("does not call vectorStore.insertChunks() directly", () => {
        const filePath = resolve(__dirname, "../SemanticIndexService.ts");
        const source = readFileSync(filePath, "utf8");

        expect(source.includes("vectorStore.insertChunks(")).toBe(false);
    });

    it("uses domain-specific writer helpers", () => {
        const filePath = resolve(__dirname, "../SemanticIndexService.ts");
        const source = readFileSync(filePath, "utf8");

        // Mindestens ein Aufruf pro Domaene (Notes, Sessions, Episoden).
        expect(source.includes("vectorStore.insertNoteVector(")).toBe(true);
        expect(source.includes("vectorStore.insertSessionVector(")).toBe(true);
        expect(source.includes("vectorStore.insertEpisodeVector(")).toBe(true);
    });
});
