/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * TemplateCatalog — loads and resolves template catalogs and .pptx template files.
 *
 * Catalogs are JSON files stored alongside .pptx templates in the vault under
 * `.obsilo/themes/{theme_name}/`. Each catalog describes available layouts,
 * their shapes, and content capacity.
 *
 * Default themes (executive, modern, minimal) are bundled with the plugin
 * and loaded from the plugin's assets directory.
 */

import * as crypto from 'crypto';
import type { Vault } from 'obsidian';
import type ObsidianAgentPlugin from '../../../main';
import type { TemplateCatalog, SlideType, SlideTypeShape } from './types';

/** Theme storage paths within the vault. */
const THEME_BASE_DIR = '.obsilo/themes';

/** Resolved template ready for use. */
export interface ResolvedTemplate {
    /** The .pptx template file as ArrayBuffer. */
    buffer: ArrayBuffer;
    /** The catalog describing layouts and shapes. */
    catalog: TemplateCatalog;
    /** Where this template came from. */
    source: 'bundled' | 'user';
    /** Warnings about catalog staleness or incompleteness. */
    warnings?: string[];
}

/** Names of built-in default themes. */
export const DEFAULT_THEMES = ['executive', 'modern', 'minimal'] as const;
export type DefaultThemeName = typeof DEFAULT_THEMES[number];

export class TemplateCatalogLoader {
    private vault: Vault;
    private plugin: ObsidianAgentPlugin;

    constructor(plugin: ObsidianAgentPlugin) {
        this.plugin = plugin;
        this.vault = plugin.app.vault;
    }

    /**
     * Load a template by theme name.
     * Checks user themes first, then bundled defaults.
     */
    async loadTemplate(themeName: string): Promise<ResolvedTemplate> {
        // Try user theme first
        const userTemplate = await this.loadUserTheme(themeName);
        if (userTemplate) return userTemplate;

        // Try bundled default
        if (this.isDefaultTheme(themeName)) {
            return this.loadBundledTheme(themeName as DefaultThemeName);
        }

        throw new Error(
            `Template "${themeName}" not found. ` +
            `Available defaults: ${DEFAULT_THEMES.join(', ')}. ` +
            `For corporate templates, run ingest_template first.`,
        );
    }

    /**
     * Load a user-ingested corporate theme from the vault.
     */
    private async loadUserTheme(themeName: string): Promise<ResolvedTemplate | null> {
        const configDir = this.vault.configDir;
        const themeDir = `${configDir}/${THEME_BASE_DIR}/${themeName}`;
        const catalogPath = `${themeDir}/catalog.json`;
        const templatePath = `${themeDir}/template.pptx`;

        // Use vault.adapter since files inside .obsidian/ are not indexed by Obsidian
        const adapter = this.vault.adapter;

        const catalogExists = await adapter.exists(catalogPath);
        if (!catalogExists) return null;

        const templateExists = await adapter.exists(templatePath);
        if (!templateExists) return null;

        try {
            // Read catalog JSON
            const catalogContent = await adapter.read(catalogPath);
            const catalog: TemplateCatalog = JSON.parse(catalogContent);

            // Read template binary
            const buffer = await adapter.readBinary(templatePath);

            // Check for stale or incomplete catalog
            const warnings: string[] = [];

            // Migration: catalogs from before ADR-046 have no slide_types
            if (!catalog.slide_types) {
                catalog.slide_types = [];
                warnings.push(
                    'Catalog veraltet (vor ADR-046, kein slide_types). ' +
                    'Bitte ingest_template mit force: true erneut ausführen.',
                );
            }

            if (catalog.template_hash) {
                const currentHash = crypto.createHash('sha256')
                    .update(Buffer.from(buffer))
                    .digest('hex');
                if (currentHash !== catalog.template_hash) {
                    warnings.push(
                        `Template file has changed since ingestion. ` +
                        `Run ingest_template again to update the catalog.`,
                    );
                }
            }

            if (catalog.analyzed_slides != null && catalog.total_slides != null && catalog.total_slides > 0) {
                const ratio = catalog.analyzed_slides / catalog.total_slides;
                if (ratio < 0.5) {
                    warnings.push(
                        `Only ${catalog.analyzed_slides} of ${catalog.total_slides} slides were analyzed. ` +
                        `Run ingest_template again with more sample_slides for better coverage.`,
                    );
                }
            }

            return { buffer, catalog, source: 'user', warnings: warnings.length > 0 ? warnings : undefined };
        } catch (e) {
            console.warn(`[TemplateCatalog] Failed to load user theme "${themeName}":`, (e as Error).message);
            return null;
        }
    }

    /**
     * Load a bundled default theme from the inlined PPTX templates.
     * Source is `src/_generated/bundled-templates.ts` (generated by esbuild
     * at build time). Decoded base64 -> ArrayBuffer held in memory.
     */
    private async loadBundledTheme(themeName: DefaultThemeName): Promise<ResolvedTemplate> {
        const { PPTX_TEMPLATES_BASE64 } = await import('../../../_generated/bundled-templates');
        const b64 = PPTX_TEMPLATES_BASE64[themeName];
        if (!b64) {
            throw new Error(`Bundled template not found: ${themeName}`);
        }
        const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const catalog = this.getDefaultCatalog(themeName);
        return { buffer, catalog, source: 'bundled' };
    }

    /**
     * Save a catalog and template for a user theme.
     * Called by IngestTemplateTool after analysis.
     *
     * Uses vault.adapter directly because theme files live inside .obsidian/
     * which is not indexed by Obsidian's vault API.
     */
    async saveTheme(
        themeName: string,
        templateBuffer: ArrayBuffer,
        catalog: TemplateCatalog,
    ): Promise<string> {
        const configDir = this.vault.configDir;
        const themeDir = `${configDir}/${THEME_BASE_DIR}/${themeName}`;
        const adapter = this.vault.adapter;

        // Ensure directory exists
        const dirExists = await adapter.exists(themeDir);
        if (!dirExists) {
            await adapter.mkdir(themeDir);
        }

        // Save catalog (JSON text)
        const catalogPath = `${themeDir}/catalog.json`;
        const catalogContent = JSON.stringify(catalog, null, 2);
        await adapter.write(catalogPath, catalogContent);

        // Save template (binary)
        const templatePath = `${themeDir}/template.pptx`;
        await adapter.writeBinary(templatePath, templateBuffer);

        return themeDir;
    }

    /**
     * List all available theme names (bundled + user).
     */
    async listThemes(): Promise<Array<{ name: string; source: 'bundled' | 'user' }>> {
        const themes: Array<{ name: string; source: 'bundled' | 'user' }> = [];

        // Add defaults
        for (const name of DEFAULT_THEMES) {
            themes.push({ name, source: 'bundled' });
        }

        // Scan user themes via vault.adapter (files inside .obsidian/ are not indexed)
        const configDir = this.vault.configDir;
        const themesDir = `${configDir}/${THEME_BASE_DIR}`;
        const adapter = this.vault.adapter;

        const dirExists = await adapter.exists(themesDir);
        if (dirExists) {
            const listing = await adapter.list(themesDir);
            for (const folder of listing.folders) {
                // folder is a full path like ".obsidian/.obsilo/themes/enbw"
                const catalogPath = `${folder}/catalog.json`;
                const hasCatalog = await adapter.exists(catalogPath);
                if (hasCatalog) {
                    // Extract theme name from folder path
                    const name = folder.split('/').pop() || '';
                    if (name) {
                        themes.push({ name, source: 'user' });
                    }
                }
            }
        }

        return themes;
    }

    /**
     * Format the slide-type guide for agent consumption (ADR-046).
     * Shows slide types grouped by PowerPoint layout name, with direct shape names.
     */
    static formatSlideTypeGuide(catalog: TemplateCatalog): string {
        const types: SlideType[] = catalog.slide_types ?? [];
        if (types.length === 0) {
            return '**Keine Slide-Typen gefunden.** Führe `ingest_template` mit `force: true` erneut aus.';
        }

        const lines: string[] = [
            `**${catalog.name}** — ${types.length} Slide-Typen aus ${catalog.total_slides ?? '?'} Slides\n`,
        ];

        for (const st of types) {
            const alts = st.alternate_slides.length > 0
                ? `, auch: ${st.alternate_slides.slice(0, 5).join(', ')}` +
                  (st.alternate_slides.length > 5 ? ' ...' : '')
                : '';
            lines.push(`### ${st.id} (Slide ${st.representative_slide}${alts})`);
            lines.push(`**${st.description}**`);
            if (st.semantic_family) lines.push(`Familie: ${st.semantic_family}`);
            if (st.warning_flags?.length) {
                lines.push(`Achtung: ${st.warning_flags.map(flag => this.formatWarningFlag(flag)).join('; ')}`);
            }
            if (st.visual_description) lines.push(`Visual: ${st.visual_description}`);
            if (st.use_when) lines.push(`Verwenden für: ${st.use_when}`);
            lines.push('Shapes:');

            let lastGroupHint = '';
            for (const sh of st.shapes) {
                // Print group header when group changes
                if (sh.group_hint && sh.group_hint !== lastGroupHint) {
                    lines.push(`  [${sh.group_hint}]`);
                    lastGroupHint = sh.group_hint;
                } else if (!sh.group_hint) {
                    lastGroupHint = '';
                }

                const key = sh.duplicate_index != null && sh.duplicate_index > 0
                    ? `${sh.name}#${sh.duplicate_index}` : sh.name;
                const req = sh.required ? 'REQUIRED' : 'optional';
                const specialTag = sh.special_role ? ` [${sh.special_role}]` : '';
                const groupTag = sh.group_id ? ` {group:${sh.group_id}}` : '';
                const chars = sh.max_chars ? ` (max ${sh.max_chars} chars)` : '';
                const pos = sh.position_hint ? ` -- ${sh.position_hint}` : '';
                // semantic_hint (vision) takes precedence over raw sample_text
                const annotation = sh.semantic_hint
                    ? ` -> ${sh.semantic_hint}`
                    : sh.sample_text
                        ? ` | "${sh.sample_text.substring(0, 50).trim()}"`
                        : '';
                lines.push(`  - \`${key}\` [${req}] ${sh.role}${specialTag}${groupTag}${chars}${pos}${annotation}`);
            }

            // Add copy-paste JSON example (ADR-047)
            const example = this.generateSlideExample(st);
            lines.push(`Example: \`${example}\``);
            lines.push('');
        }

        lines.push('---');
        lines.push('**Verwendung:** Kopiere das JSON-Beispiel pro Slide-Typ und ersetze die Platzhalter mit echtem Content.');
        lines.push('REQUIRED-Shapes MUESSEN immer befuellt werden -- das Tool validiert dies vor der Generierung.');
        lines.push('Optionale Shapes verschwinden automatisch wenn leer (Auto-Remove).');
        lines.push('Zuerst `Familie` + `Verwenden fuer` pruefen, dann den konkreten Slide-Typ auswaehlen.');

        return lines.join('\n');
    }

    /**
     * Generate a compact JSON example for a slide type (ADR-048).
     * ALL non-decorative shapes get role-based placeholder values
     * so the agent/LLM sees what content goes into every shape.
     */
    private static generateSlideExample(st: SlideType): string {
        const content: Record<string, string> = {};
        for (const sh of st.shapes) {
            const key = sh.duplicate_index != null && sh.duplicate_index > 0
                ? `${sh.name}#${sh.duplicate_index}` : sh.name;
            content[key] = this.exampleValueForRole(sh);
        }
        const obj: Record<string, unknown> = {
            source_slide: st.representative_slide,
            content,
        };
        return JSON.stringify(obj);
    }

    /**
     * Generate a realistic placeholder value based on shape role and content type.
     */
    private static exampleValueForRole(sh: SlideTypeShape): string {
        // ADR-048: Special roles take precedence
        if (sh.special_role === 'section_number') return '1';

        switch (sh.role) {
            case 'title': return 'Your slide title';
            case 'subtitle': return 'Subtitle or context line';
            case 'kpi_value': return '42%';
            case 'kpi_label': return 'Metric name';
            case 'step_label': return 'Step name';
            case 'step_desc': return 'Brief description';
            case 'body': return 'Main content paragraph';
            case 'image': return '{"type":"image","vault_path":"path/to/image.png"}';
            case 'chart': return '{"type":"chart","series":[{"name":"Series","values":[10,20,30]}],"categories":["A","B","C"]}';
            case 'table': return '{"type":"table","body":[{"values":["A","B"]},{"values":["C","D"]}]}';
            default: return 'Content here';
        }
    }

    private static formatWarningFlag(flag: string): string {
        switch (flag) {
            case 'possible-style-guide':
                return 'wahrscheinlich Styleguide-/Regelfolie';
            case 'possible-component-library':
                return 'wahrscheinlich Komponenten-/Icon-Bibliothek';
            case 'image-dependent':
                return 'benötigt echtes Bildmaterial';
            default:
                return flag;
        }
    }

    private isDefaultTheme(name: string): boolean {
        return (DEFAULT_THEMES as readonly string[]).includes(name.toLowerCase());
    }

    /**
     * Generate a minimal catalog for default themes.
     * Default templates have a fixed set of simple layouts.
     */
    private getDefaultCatalog(themeName: DefaultThemeName): TemplateCatalog {
        return {
            name: `Default ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}`,
            version: '1.0',
            slide_size: { width: 1280, height: 720 },
            layouts: {
                1: {
                    name: 'title',
                    description: 'Title slide with main title and subtitle',
                    narrative_phase: 'hook',
                    shapes: [
                        { name: 'Title 1', role: 'title', content_type: 'text', max_chars: 60 },
                        { name: 'Subtitle 2', role: 'subtitle', content_type: 'text', max_chars: 120 },
                    ],
                },
            },
            slide_types: [],
        };
    }
}

/* eslint-enable */
