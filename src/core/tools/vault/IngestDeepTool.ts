/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * IngestDeepTool (FEAT-19-22/23/24/26/30 + 19-13 Caller)
 *
 * Ruft die DeepIngestPipeline auf einer Vault-Note auf. Modus
 * (dialog/auto) plus Output-Modus (source-only/source-plus-summary/
 * source-plus-multi-zettel) sind Tool-Inputs. Optional cluster-hint;
 * sonst aus Ontologie ermittelt.
 *
 * Plan-Generation passiert via LLM (CallerHook im Pipeline). Hier:
 * minimaler "default planner" der Take-Aways aus dem Note-Body als
 * erste 5 Absaetze extrahiert. Echter Multi-Turn-Dialog kann spaeter
 * via Conversation-Loop kommen; Hook bleibt offen.
 */

import { TFile, Notice } from 'obsidian';
import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { DeepIngestPipeline, type DeepIngestPlan, type IngestMode } from '../../ingest/DeepIngestPipeline';
import { TensionDetector } from '../../ingest/TensionDetector';
import type { OutputMode } from '../../ingest/OutputModeGenerator';
import { normalizeDomain } from '../../knowledge/ClusterSourceStatsStore';
import { PdfMarkdownMirror } from '../../ingest/PdfMarkdownMirror';
import { readSourceAsMarkdown } from '../../ingest/SourceReader';

interface IngestDeepInput {
    /** Vault-relative path of the source note (or PDF). */
    source_path: string;
    /** Default 'dialog'. Auto = no user-interaction. */
    mode?: IngestMode;
    /** Default 'source-only' (FIX-19-28, 2026-05-08). */
    output_mode?: OutputMode;
    /** Optional cluster hint. */
    cluster?: string;
    /**
     * Optional list of anchor texts that should receive a `^block-N`
     * suffix in the source note. The agent passes the exact wording of
     * each take-away source line; the tool sets a stable block-id on
     * each matching line so downstream zettel notes can link to the
     * exact position with `[[<Source>#^block-N|↗]]`. When omitted, the
     * tool falls back to the legacy naive paragraph-picker (5 first
     * paragraphs >20 chars) -- pass anchors explicitly for any real
     * sense-making run.
     */
    block_anchors?: string[];
}

function validateVaultPath(rawPath: string): string | null {
    if (!rawPath || typeof rawPath !== 'string') return null;
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (normalized.split('/').some((s) => s === '..' || s === '.')) return null;
    if (normalized.includes('\0')) return null;
    return normalized;
}

export class IngestDeepTool extends BaseTool<'ingest_deep'> {
    readonly name = 'ingest_deep' as const;
    readonly isWriteOperation = true;

    constructor(plugin: ObsidianAgentPlugin) { super(plugin); }

    getDefinition(): ToolDefinition {
        return {
            name: 'ingest_deep',
            description:
                'Source-Pass fuer Deep-Ingest: setzt Block-IDs in der Source-Note, aktualisiert '
                + 'den Source-Diversity-Counter, triggert MOC-Page-Refresh und fuehrt optional '
                + 'Tension-Detection durch. Die Original-Source bleibt in place -- es entsteht '
                + 'keine duplizierte Note. \n\n'
                + 'Rufe IMMER mit `output_mode="source-only"` auf. Sense-Making oder Multi-Zettel '
                + 'erstellt der Skill anschliessend via write_file mit echter LLM-Synthese: '
                + 'aussagekraeftige, eigenstaendige Konzept-Titel (kein Source-Prefix), ein Gedanke '
                + 'pro Zettel sauber ausformuliert, Frontmatter-Template verbatim. Die Modi '
                + '"source-plus-summary" und "source-plus-multi-zettel" sind technisch erhalten, '
                + 'erzeugen aber via internem Stub naive Transkript-Splitter und werden vom '
                + 'Skill nicht genutzt.',
            input_schema: {
                type: 'object',
                properties: {
                    source_path: { type: 'string', description: 'Vault-Pfad der Source-Note (md oder pdf).' },
                    mode: { type: 'string', enum: ['dialog', 'auto'], description: 'Default dialog.' },
                    output_mode: {
                        type: 'string',
                        enum: ['source-only', 'source-plus-summary', 'source-plus-multi-zettel'],
                        description: 'Empfohlen: "source-only". Die anderen Modi produzieren via '
                            + 'naivem Default-Stub Transkript-Splitter -- nicht fuer Sense-Making nutzen.',
                    },
                    cluster: { type: 'string', description: 'Optional: Cluster-Hint, sonst aus Ontologie.' },
                    block_anchors: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            'Optional: konkrete Anchor-Texte aus dem Source-Body, an die `^block-N`-Suffix '
                            + 'gesetzt werden soll. Eine Position pro Take-Away. Beispiel: ["Karpathy nennt '
                            + 'LLMs Ghosts", "Jagged Intelligence ist die punktuelle Spitzenleistung..."]. '
                            + 'Wenn nicht angegeben, faellt der Tool auf den naiven Paragraph-Picker zurueck '
                            + '(erste 5 Absaetze) -- nicht fuer Sense-Making nutzen.',
                    },
                },
                required: ['source_path'],
            },
        };
    }

    async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<void> {
        // FIX-19-28: Default auf 'source-only' umgestellt. User-Praeferenz
        // 2026-05-08: keine aggregierte Sense-Making-Note, Take-Aways nur im
        // Chat-Dialog, Detail-Notes pro Aspekt on-demand im Dialog.
        const {
            source_path,
            mode = 'dialog',
            output_mode = 'source-only',
            cluster: clusterHint,
            block_anchors: explicitAnchors,
        } = input as unknown as IngestDeepInput;

        const safePath = validateVaultPath(source_path);
        if (!safePath) {
            ctx.callbacks.pushToolResult(this.formatError(`Ungueltiger Vault-Pfad: ${source_path}`));
            return;
        }
        const file = this.plugin.app.vault.getAbstractFileByPath(safePath);
        if (!(file instanceof TFile)) {
            ctx.callbacks.pushToolResult(this.formatError(`Datei nicht im Vault: ${safePath}`));
            return;
        }

        // Single notes folder for every ingest output. Strips trailing
        // slash so path joins (`${folder}/${name}.md`) stay clean.
        const notesFolder = (this.plugin.settings.defaultOutputFolder ?? 'Inbox/').replace(/\/+$/, '') || 'Inbox';

        // FEAT-19-29: PDF-Markdown-Mirror wenn Setting opt-in plus PDF.
        // Mirror landet im notesFolder (Inbox/) statt im PDF-Folder --
        // so wird die PDF im Attachments-Folder belassen, die Markdown-
        // Arbeitsdatei lebt im Inbox.
        let actualSource: TFile = file;
        if (file.extension === 'pdf'
            && this.plugin.settings.vaultIngest?.pdfStrategy === 'markdown-mirror') {
            const mirror = new PdfMarkdownMirror(this.plugin.app, { mirrorFolder: notesFolder });
            const result = await mirror.createMirror(file);
            if (result) {
                actualSource = result.mirrorFile;
                new Notice(`PDF-Mirror erstellt: ${actualSource.path}`, 4000);
            }
        }

        // Cluster aus Ontologie ableiten wenn nicht gegeben
        let cluster = clusterHint ?? '';
        if (!cluster && this.plugin.knowledgeDB?.isOpen()) {
            const db = this.plugin.knowledgeDB.getDB();
            const r = db.exec(`SELECT cluster FROM ontology WHERE entity_path = ? ORDER BY confidence DESC LIMIT 1`,
                [actualSource.path]);
            cluster = (r[0]?.values?.[0]?.[0] as string) ?? '_unsorted_';
        }

        // Source-Domain aus Frontmatter
        const cache = this.plugin.app.metadataCache.getFileCache(actualSource);
        const fmSource = cache?.frontmatter?.source ?? cache?.frontmatter?.url ?? '';
        const sourceDomain = typeof fmSource === 'string' ? normalizeDomain(fmSource) : undefined;

        // PlanGenerator: minimaler Default. Liefert die ersten 5 nicht-leeren
        // Absaetze als Take-Aways mit block-anchor-Position (FIX-19-28-01
        // PLAN-15: vorher hat der Stub `cachedRead(f)` aufgerufen, was bei
        // PDFs binaeren Garbage liefert. SourceReader liest jetzt einheitlich
        // ueber parseDocument bei Office/PDF-Formaten. Take-Aways tragen
        // kind='block-anchor' mit dem Anchor-Text aus dem Source-Markdown,
        // damit die Pipeline via BlockIdSetter Block-IDs setzen und im
        // Sense-Making-Body inline ↗-Marker rendern kann (ADR-103 Amendment
        // 2026-05-07). summaryBody bewusst nicht gesetzt: die Pipeline
        // generiert ihn ueber SummaryPositionAnnotator mit Markern.)
        // Power-User koennen den Hook spaeter via Plugin-Settings durch
        // echten LLM-Call austauschen (PlanGeneratorRegistry, IMP-19-22-01).
        const planGenerator = async (f: TFile, _m: IngestMode, om: OutputMode): Promise<DeepIngestPlan> => {
            let sourceMd = '';
            try {
                sourceMd = await readSourceAsMarkdown(this.plugin.app, f);
            } catch (err) {
                console.warn(`[IngestDeepTool] readSourceAsMarkdown failed for ${f.path}:`, err);
            }
            // Explicit anchors take precedence -- the agent passed exact
            // take-away source lines, we set stable block-IDs on those.
            // Fallback to naive paragraph-picker only when no anchors
            // were provided (legacy auto-trigger path).
            const anchorsFromAgent = (explicitAnchors ?? []).filter((a) => typeof a === 'string' && a.trim().length > 0);
            const paragraphs = anchorsFromAgent.length > 0
                ? anchorsFromAgent
                : sourceMd
                    .split(/\n{2,}/)
                    .map((p) => p.trim())
                    .filter((p) => p.length > 20)
                    .filter((p) => !/^#{1,6}\s/.test(p)) // skip heading-only paragraphs
                    .slice(0, 5);
            const takeAways = paragraphs.map((p) => ({
                text: p.length > 200 ? `${p.slice(0, 200)}...` : p,
                position: { kind: 'block-anchor' as const, anchorText: p },
            }));
            if (om === 'source-plus-multi-zettel') {
                return {
                    takeAways,
                    multiZettel: {
                        bibliographyTitle: f.basename + ' - Bibliografie',
                        bibliographyBody: `Bibliografie zu [[${f.basename}]].\n\nAbstract:\n${paragraphs[0] ?? ''}`,
                        bibliographyFrontmatter: {
                            source_type: f.extension,
                            ingested_at: new Date().toISOString(),
                            cluster,
                        },
                        zettel: paragraphs.map((p, i) => ({
                            title: `${f.basename} - Zettel ${i + 1}`,
                            body: p,
                            frontmatter: { cluster, ingested_at: new Date().toISOString() },
                        })),
                    },
                };
            }
            // summaryBody NICHT setzen: Pipeline annotiert die Take-Aways
            // mit ↗-Markern via SummaryPositionAnnotator.
            return { takeAways };
        };

        // TensionDetector mit Cosine-Pre-Filter via Vault-Search wuerde echten
        // SemanticIndex-Hook erfordern. Vereinfacht: optional spaeter wenn
        // SemanticIndex bereitgestellt; hier null.
        const tensionDetector: TensionDetector | undefined = undefined;

        // FEAT-19-26: MOC-Update-Hook beim Cluster-Match aufrufen
        const onMOCPageUpdated = async (clusterName: string) => {
            // Suche MOC-Page des Clusters und aktualisiere ihren Marker-Block
            const mocPath = `${clusterName}.md`;
            const mocFile = this.plugin.app.vault.getAbstractFileByPath(mocPath);
            if (mocFile instanceof TFile) {
                const { findAutoBlock, replaceOrInsertAutoBlock } = await import('../../ingest/MOCMaintainer');
                const content = await this.plugin.app.vault.read(mocFile);
                if (findAutoBlock(content, 'moc-header')) {
                    const newBody = await this.buildMOCBody(clusterName);
                    const r = replaceOrInsertAutoBlock(content, newBody, { blockId: 'moc-header' });
                    if (r.written && r.newContent) {
                        await this.plugin.app.vault.modify(mocFile, r.newContent);
                    }
                }
            }
        };

        const pipeline = new DeepIngestPipeline(this.plugin.app, {
            folderConfig: { notesFolder },
            tensionDetector,
            sourceStats: this.plugin.clusterSourceStatsStore ?? undefined,
            planGenerator,
            onMOCPageUpdated,
        });

        try {
            const result = await pipeline.run({
                sourceFile: actualSource,
                mode,
                outputMode: output_mode,
                cluster,
                sourceDomain,
            });
            const lines = [
                `## Deep-Ingest erfolgreich (${output_mode}, ${mode})`,
                `- Source: [[${result.sourceFile.basename}]]`,
                `- Cluster: ${cluster}`,
            ];
            // Block-Anchor-Map: liste explizit auf, welche Block-IDs jetzt
            // in der Source verfuegbar sind, damit der Agent korrekte
            // [[<Source>#^block-N|↗]]-Links in den Zetteln rendern kann.
            const anchorEntries = Object.entries(result.anchorToBlockId ?? {});
            const requestedAnchors = (explicitAnchors ?? []).filter((a) => typeof a === 'string' && a.trim().length > 0);
            const matchedSet = new Set(anchorEntries.map(([anchor]) => anchor.trim()));
            const unmatchedAnchors = requestedAnchors
                .map((a) => a.trim())
                .filter((a) => !matchedSet.has(a));

            if (anchorEntries.length > 0) {
                lines.push('', '**Block-IDs in der Source (fuer ↗-Refs):**');
                for (const [anchorText, blockId] of anchorEntries) {
                    const preview = anchorText.length > 80 ? anchorText.slice(0, 80) + '...' : anchorText;
                    lines.push(`- \`#^${blockId}\` -> "${preview}"`);
                }
                lines.push('');
                lines.push(`_Nutze in den Zetteln: \`[[${result.sourceFile.basename}#^block-N|↗]]\` (N siehe oben)._`);
            }

            if (unmatchedAnchors.length > 0) {
                lines.push('', `**WARNUNG: ${unmatchedAnchors.length} Anchor(s) wurden nicht in der Source gefunden:**`);
                for (const anchor of unmatchedAnchors) {
                    const preview = anchor.length > 100 ? anchor.slice(0, 100) + '...' : anchor;
                    lines.push(`- "${preview}"`);
                }
                lines.push('');
                lines.push(
                    '_Diese Anchors waren keine wortwoertliche Phrase aus dem Source-Markdown -- '
                    + 'wahrscheinlich eine semantische Beschreibung statt eines Quote-Snippets. '
                    + 'Fuer die betroffenen Themen: oeffne die Source per `read_file`, suche eine '
                    + 'wortwoertliche 5-10-Wort-Phrase und ruf `ingest_deep` erneut mit den korrekten '
                    + '`block_anchors` auf -- ODER referenziere in den Zetteln nur `[[<Source>]]` '
                    + 'ohne `#^block`-Suffix. Niemals den falschen Block-Ref (z.B. `^block-1`) als '
                    + 'Ersatz nehmen._',
                );
            }
            if (result.generated.senseMakingFile) lines.push(`- Sense-Making: [[${result.generated.senseMakingFile.basename}]]`);
            if (result.generated.bibliographyFile) lines.push(`- Bibliografie: [[${result.generated.bibliographyFile.basename}]]`);
            if (result.generated.zettelFiles?.length) lines.push(`- ${result.generated.zettelFiles.length} Zettel erstellt`);
            if (result.tensionMarkers.length) lines.push(`- ${result.tensionMarkers.length} Tension-Marker analysiert`);
            if (sourceDomain) lines.push(`- Source-Domain ${sourceDomain} fuer Cluster ${cluster} gezaehlt`);
            // Ergebnis dem User-side: pending in triage_log auf 'ingest' update wenn vorhanden
            const sourceUri = `vault://${actualSource.path}`;
            this.plugin.ingestTriageLogStore?.updateDecision(sourceUri, 'ingest', `deep-ingest ${output_mode}`);
            ctx.callbacks.pushToolResult(this.formatSuccess(lines.join('\n')));
        } catch (err) {
            ctx.callbacks.pushToolResult(this.formatError(`Deep-Ingest fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`));
        }
    }

    // eslint-disable-next-line @typescript-eslint/require-await -- async kept for symmetry with future LLM-backed body composition
    private async buildMOCBody(cluster: string): Promise<string> {
        const stats = this.plugin.clusterSourceStatsStore?.getStatsForCluster(cluster) ?? [];
        const conc = this.plugin.clusterSourceStatsStore?.concentrationScore(cluster) ?? 0;
        const meta = this.plugin.clusterMetadataStore?.get(cluster);
        const lines = [`_BA-25 MOC-Pflege ${new Date().toISOString().split('T')[0]}_`, ''];
        if (meta?.halfLifeDays) lines.push(`- Halbwertszeit: ${meta.halfLifeDays} Tage`);
        if (stats.length) {
            lines.push(`- Source-Domains: ${stats.length} distinct, top: ${stats[0].sourceDomain} (${stats[0].noteCount}x)`);
            lines.push(`- Concentration: ${(conc * 100).toFixed(0)}%${conc >= 0.7 ? ' Bias-Warnung' : ''}`);
        }
        return lines.join('\n');
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
