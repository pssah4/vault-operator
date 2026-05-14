/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * RecipeStore — Persistence layer for Procedural Recipes.
 *
 * Combines static (bundled) and learned (DB-persisted) recipes into
 * a single queryable store.
 *
 * FEATURE-1505: Migrated from JSON files to MemoryDB (SQLite).
 * On first start after migration, existing JSON files are imported into the DB.
 */

import type { FileAdapter } from '../storage/types';
import type { MemoryDB } from '../knowledge/MemoryDB';
import type { ProceduralRecipe } from './types';
import { STATIC_RECIPES, SCHEMA_VERSION } from './staticRecipes';

export class RecipeStore {
    private staticRecipes: ProceduralRecipe[];
    private learnedRecipes: ProceduralRecipe[] = [];
    private memoryDB: MemoryDB | null;
    private fs: FileAdapter;
    private recipesDir: string;
    private getLearnedEnabled: () => boolean;

    constructor(fs: FileAdapter, getLearnedEnabled?: () => boolean, memoryDB?: MemoryDB | null) {
        this.fs = fs;
        this.memoryDB = memoryDB ?? null;
        this.recipesDir = 'recipes';
        this.staticRecipes = STATIC_RECIPES;
        this.getLearnedEnabled = getLearnedEnabled ?? (() => true);
    }

    /**
     * Load learned recipes from DB (or legacy JSON files).
     * Performs one-time migration from JSON -> DB if needed.
     */
    async initialize(): Promise<void> {
        try {
            if (this.memoryDB?.isOpen()) {
                this.loadFromDB();
                // One-time migration: if DB is empty but JSON files exist, import them
                if (this.learnedRecipes.length === 0) {
                    await this.migrateFromFiles();
                }
            } else {
                // Fallback: load from files (legacy path)
                await this.loadFromFiles();
            }
        } catch (e) {
            console.warn('[RecipeStore] Failed to initialize:', e);
        }
    }

    /** Get all recipes (static + learned), optionally filtered by mode. */
    getAll(mode?: string): ProceduralRecipe[] {
        const base = this.getLearnedEnabled()
            ? [...this.staticRecipes, ...this.learnedRecipes]
            : [...this.staticRecipes];
        if (!mode) return base;
        return base.filter((r) => r.modes.length === 0 || r.modes.includes(mode));
    }

    /** Get a recipe by ID. */
    getById(id: string): ProceduralRecipe | undefined {
        return this.staticRecipes.find((r) => r.id === id)
            ?? this.learnedRecipes.find((r) => r.id === id);
    }

    /** Save a learned recipe. */
    async save(recipe: ProceduralRecipe): Promise<void> {
        recipe.source = 'learned';
        recipe.schemaVersion = SCHEMA_VERSION;

        if (this.memoryDB?.isOpen()) {
            this.saveToDB(recipe);
        } else {
            await this.saveToFile(recipe);
        }

        // Update in-memory
        const idx = this.learnedRecipes.findIndex((r) => r.id === recipe.id);
        if (idx >= 0) {
            this.learnedRecipes[idx] = recipe;
        } else {
            this.learnedRecipes.push(recipe);
        }
    }

    /** Delete a learned recipe. */
    async delete(id: string): Promise<void> {
        const idx = this.learnedRecipes.findIndex((r) => r.id === id);
        if (idx >= 0) this.learnedRecipes.splice(idx, 1);

        if (this.memoryDB?.isOpen()) {
            this.memoryDB.getDB().run('DELETE FROM recipes WHERE id = ?', [id]);
            this.memoryDB.markDirty();
        } else {
            const filePath = `${this.recipesDir}/${id}.json`;
            const exists = await this.fs.exists(filePath);
            if (exists) await this.fs.remove(filePath);
        }
    }

    /** Increment success count and update lastUsed. */
    incrementSuccess(id: string): void {
        const recipe = this.getById(id);
        if (recipe) {
            recipe.successCount++;
            recipe.lastUsed = new Date().toISOString();
            if (recipe.source === 'learned') {
                this.save(recipe).catch((e) =>
                    console.warn(`[RecipeStore] Failed to persist success count for ${id}:`, e)
                );
            }
        }
    }

    // -----------------------------------------------------------------------
    // DB operations
    // -----------------------------------------------------------------------

    private loadFromDB(): void {
        const db = this.memoryDB!.getDB();
        const result = db.exec('SELECT id, name, description, trigger_keywords, steps, source, schema_version, success_count, last_used, modes FROM recipes WHERE source = ?', ['learned']);
        if (result.length === 0) { this.learnedRecipes = []; return; }

        this.learnedRecipes = result[0].values
            .map((row) => {
                try {
                    return {
                        id: row[0] as string,
                        name: row[1] as string,
                        description: (row[2] as string) ?? '',
                        trigger: (row[3] as string) ?? '',
                        steps: JSON.parse((row[4] as string) ?? '[]'),
                        source: row[5] as 'static' | 'learned',
                        schemaVersion: row[6] as number,
                        successCount: (row[7] as number) ?? 0,
                        lastUsed: row[8] as string | null,
                        modes: JSON.parse((row[9] as string) ?? '[]'),
                    } satisfies ProceduralRecipe;
                } catch {
                    return null;
                }
            })
            .filter((r): r is ProceduralRecipe => r !== null && r.schemaVersion === SCHEMA_VERSION);
    }

    private saveToDB(recipe: ProceduralRecipe): void {
        const db = this.memoryDB!.getDB();
        db.run(
            `INSERT OR REPLACE INTO recipes (id, name, description, trigger_keywords, steps, source, schema_version, success_count, last_used, modes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                recipe.id,
                recipe.name,
                recipe.description ?? '',
                recipe.trigger ?? '',
                JSON.stringify(recipe.steps),
                recipe.source,
                recipe.schemaVersion,
                recipe.successCount,
                recipe.lastUsed,
                JSON.stringify(recipe.modes),
            ],
        );
        this.memoryDB!.markDirty();
    }

    // -----------------------------------------------------------------------
    // Legacy file operations (fallback + migration)
    // -----------------------------------------------------------------------

    private async loadFromFiles(): Promise<void> {
        const exists = await this.fs.exists(this.recipesDir);
        if (!exists) return;
        const files = await this.fs.list(this.recipesDir);
        const jsonFiles = files.files.filter((f: string) => f.endsWith('.json'));

        this.learnedRecipes = [];
        for (const file of jsonFiles) {
            try {
                const raw = await this.fs.read(file);
                const recipe = JSON.parse(raw) as ProceduralRecipe;
                if (recipe.schemaVersion === SCHEMA_VERSION && recipe.source === 'learned') {
                    this.learnedRecipes.push(recipe);
                }
            } catch (e) {
                console.warn(`[RecipeStore] Failed to load recipe ${file}:`, e);
            }
        }
    }

    private async saveToFile(recipe: ProceduralRecipe): Promise<void> {
        const exists = await this.fs.exists(this.recipesDir);
        if (!exists) await this.fs.mkdir(this.recipesDir);
        const filePath = `${this.recipesDir}/${recipe.id}.json`;
        await this.fs.write(filePath, JSON.stringify(recipe, null, 2));
    }

    /** One-time migration: import existing JSON recipe files into DB. */
    private async migrateFromFiles(): Promise<void> {
        try {
            const exists = await this.fs.exists(this.recipesDir);
            if (!exists) return;
            const files = await this.fs.list(this.recipesDir);
            const jsonFiles = files.files.filter((f: string) => f.endsWith('.json'));
            if (jsonFiles.length === 0) return;

            let migrated = 0;
            for (const file of jsonFiles) {
                try {
                    const raw = await this.fs.read(file);
                    const recipe = JSON.parse(raw) as ProceduralRecipe;
                    if (recipe.schemaVersion === SCHEMA_VERSION && recipe.source === 'learned') {
                        this.saveToDB(recipe);
                        this.learnedRecipes.push(recipe);
                        migrated++;
                    }
                } catch { /* skip corrupt files */ }
            }

            if (migrated > 0) {
                await this.memoryDB!.save();
                console.debug(`[RecipeStore] Migrated ${migrated} recipes from JSON files to DB`);
            }
        } catch (e) {
            console.warn('[RecipeStore] Migration from files failed (non-fatal):', e);
        }
    }
}
