/**
 * DeepIngestPipeline -- orchestriert die FEAT-19-22 (Dialog-Modus),
 * FEAT-19-23 (Auto-Modus), FEAT-19-24 (Output-Modi), FEAT-19-26
 * (Dialog-MOC-Update), FEAT-19-29 (PDF-Strategie), FEAT-19-30
 * (Bibliographische Summary-Note) plus FEAT-19-13 (Tension-Detection).
 *
 * Service-Layer fuer den eigentlichen Ingest-Workflow nach Triage-
 * Decision "ingest". Wird vom IngestTriageTool oder vom
 * AutoTriggerObserver-Wiring aufgerufen.
 *
 * FIX-19-28-01 PLAN-15: Source-Note-Body wird via SourceReader aus
 * der Source-File gelesen (statt hardcoded leer). Block-IDs werden im
 * Pre-Pass via markBlockIds gesetzt; die anchorToBlockId-Map wird an
 * den SummaryPositionAnnotator weitergegeben, der pro Take-Away einen
 * inline ↗-Marker am Bullet-Ende rendert (ADR-103-Amendment 2026-05-07).
 *
 * Pragmatisch: dieser Pipeline-Service buendelt die existierenden
 * Generator-Klassen plus Helpers in einem Aufruf-Pfad. Konkrete
 * LLM-Calls fuer Take-Aways und Cross-Links werden vom Caller per
 * Hook injiziert (kein direktes LLM-Coupling).
 */

import { TFile, type App } from 'obsidian';
import {
    OutputModeGenerator,
    type OutputMode,
    type OutputFolderConfig,
    type SourceContent,
    type SenseMakingContent,
    type MultiZettelContent,
    type GenerateResult,
} from './OutputModeGenerator';
import { TensionDetector, type TensionResult } from './TensionDetector';
import type { ClusterSourceStatsStore } from '../knowledge/ClusterSourceStatsStore';
import { readSourceAsMarkdown } from './SourceReader';
import { markBlockIds } from './BlockIdSetter';
import {
    annotateTakeAways,
    type DeepIngestTakeAway,
} from './SummaryPositionAnnotator';

export type IngestMode = 'dialog' | 'auto';

export interface DeepIngestInput {
    sourceFile: TFile;
    mode: IngestMode;
    outputMode: OutputMode;
    cluster: string;
    /** optionaler Source-Domain fuer Diversity-Stats. */
    sourceDomain?: string;
}

/**
 * Plan-Schema (FIX-19-28-01 PLAN-15 Step 3): take-Aways akzeptieren
 * sowohl die Legacy-Form (string[]) als auch die neue Position-tragende
 * Form (DeepIngestTakeAway[]). Pipeline normalisiert intern.
 */
export type LegacyOrNewTakeAway = string | DeepIngestTakeAway;

export interface DeepIngestPlan {
    /**
     * Take-Aways. Legacy: string[] (kein Position-Marker). Neu:
     * DeepIngestTakeAway[] (mit optionaler Position pro Take-Away).
     */
    takeAways: LegacyOrNewTakeAway[];
    /**
     * Sense-Making-Body fuer Modus 2. Wenn weggelassen UND Modus
     * source-plus-summary, wird der Body aus den take-Aways via
     * SummaryPositionAnnotator generiert (mit ↗-Markern).
     */
    summaryBody?: string;
    /** Bibliografie + Zettel-Liste fuer Modus 3. */
    multiZettel?: {
        bibliographyTitle: string;
        bibliographyBody: string;
        bibliographyFrontmatter: Record<string, unknown>;
        zettel: Array<{ title: string; body: string; frontmatter: Record<string, unknown> }>;
    };
}

/** Hook: Caller (Plugin) liefert konkreten Plan basierend auf LLM-Output. */
export type PlanGeneratorFn = (file: TFile, mode: IngestMode, outputMode: OutputMode) => Promise<DeepIngestPlan>;

export interface DeepIngestPipelineOpts {
    folderConfig: OutputFolderConfig;
    /** Optional: TensionDetector Hook fuer FEAT-19-13. */
    tensionDetector?: TensionDetector;
    /** Optional: ClusterSourceStats fuer FEAT-15-11/19-14 Diversity. */
    sourceStats?: ClusterSourceStatsStore;
    /** PlanGeneratorFn (LLM-driven). Caller liefert. */
    planGenerator: PlanGeneratorFn;
    /** Optional: MOC-Page-Aktualisierung nach Ingest (FEAT-19-26 Wiring). */
    onMOCPageUpdated?: (cluster: string) => Promise<void>;
}

export interface DeepIngestResult {
    generated: GenerateResult;
    tensionMarkers: TensionResult[];
    sourceFile: TFile;
}

/**
 * Normalisiert Legacy-string[] auf DeepIngestTakeAway[].
 * String -> { text: string } ohne Position.
 */
function normalizeTakeAways(takeAways: LegacyOrNewTakeAway[]): DeepIngestTakeAway[] {
    return takeAways.map((t) => (typeof t === 'string' ? { text: t } : t));
}

export class DeepIngestPipeline {
    constructor(
        private readonly app: App,
        private readonly opts: DeepIngestPipelineOpts,
    ) {}

    async run(input: DeepIngestInput): Promise<DeepIngestResult> {
        // 1. Plan via Caller-Hook (Dialog-Multi-Turn ODER Auto-Default)
        const rawPlan = await this.opts.planGenerator(input.sourceFile, input.mode, input.outputMode);
        const takeAways = normalizeTakeAways(rawPlan.takeAways);
        const takeAwayTexts = takeAways.map((t) => t.text);

        // 2. Source-Markdown lesen (FIX-19-28-01 PLAN-15: ersetzt
        //    hardcoded body: '' -- ohne diesen Lesevorgang setzt
        //    BlockIdSetter keine Anchors).
        let sourceMarkdown = '';
        try {
            sourceMarkdown = await readSourceAsMarkdown(this.app, input.sourceFile);
        } catch (err) {
            console.warn('[DeepIngest] readSourceAsMarkdown failed, falling back to empty body:', err);
        }

        // 3. Pre-Pass: Block-IDs in Source-Markdown setzen (idempotent).
        //    Anchor-Texte kommen aus Take-Aways mit kind='block-anchor'.
        //    Fallback: alle Take-Away-Texte als Anchor versuchen, damit
        //    der Legacy-Pfad (string[]) auch Block-IDs bekommt wenn die
        //    Texte im Source-Body vorkommen.
        const blockAnchors = takeAways
            .filter((t) => !t.position || t.position.kind === 'block-anchor')
            .map((t) => t.position?.kind === 'block-anchor' ? t.position.anchorText : t.text);

        const { content: markedSource, anchorToBlockId } = markBlockIds(sourceMarkdown, blockAnchors);

        // 4. Tension-Detection (FEAT-19-13) falls Detector verfuegbar
        let tensionMarkers: TensionResult[] = [];
        if (this.opts.tensionDetector && takeAways.length > 0) {
            try {
                tensionMarkers = await this.opts.tensionDetector.detect(takeAwayTexts);
            } catch (err) {
                console.warn('[DeepIngest] tension detection failed:', err);
            }
        }

        // 5. Markdown-Body anreichern mit Tension-Markern (Inline-Callouts)
        const tensionFooter = tensionMarkers
            .filter((t) => TensionDetector.markerWorthy(t))
            .map((t) => TensionDetector.renderMarker(t))
            .filter(Boolean)
            .join('\n\n');

        // 6. SourceContent vorbereiten -- Body kommt jetzt aus dem
        //    Pre-Pass (mit Block-IDs gesetzt). blockAnchors=[] weil
        //    die IDs schon im Body stehen; OutputModeGenerator's
        //    markBlockIds-Aufruf ist damit ein No-Op.
        const sourceContent: SourceContent = {
            suggestedFilename: input.sourceFile.basename + '.md',
            body: markedSource,
            frontmatter: {
                source_path: `[[${input.sourceFile.basename}]]`,
                ingested_at: new Date().toISOString(),
                ingest_mode: input.outputMode,
            },
            blockAnchors: [],
        };

        // 7. Sense-Making je nach Output-Modus
        const sourceBasename = input.sourceFile.basename;
        const sourceExtension = input.sourceFile.extension.toLowerCase();
        let senseMaking: SenseMakingContent | MultiZettelContent | undefined;
        if (input.outputMode === 'source-plus-summary') {
            // Bevorzugt: vom Plan gelieferter Body. Sonst: aus Take-Aways
            // mit Position-Markern via SummaryPositionAnnotator (FIX-19-28-01
            // PLAN-15 -- Default-Pfad enthielt vorher keine Marker).
            const summaryBody = rawPlan.summaryBody
                ?? annotateTakeAways(
                    takeAways,
                    { sourceBasename, sourceExtension },
                    anchorToBlockId,
                );
            const fullBody = tensionFooter
                ? `${summaryBody}\n\n## Tension-Marker\n\n${tensionFooter}`
                : summaryBody;
            senseMaking = {
                cluster: input.cluster,
                title: input.sourceFile.basename + ' (Sense-Making)',
                body: fullBody,
                frontmatter: { cluster: input.cluster, ingested_at: new Date().toISOString() },
            };
        } else if (input.outputMode === 'source-plus-multi-zettel' && rawPlan.multiZettel) {
            senseMaking = {
                cluster: input.cluster,
                title: input.sourceFile.basename + ' (Bibliografie)',
                body: rawPlan.multiZettel.bibliographyBody,
                frontmatter: rawPlan.multiZettel.bibliographyFrontmatter,
                bibliographyTitle: rawPlan.multiZettel.bibliographyTitle,
                bibliographyFrontmatter: rawPlan.multiZettel.bibliographyFrontmatter,
                bibliographyBody: tensionFooter
                    ? `${rawPlan.multiZettel.bibliographyBody}\n\n## Tension-Marker\n\n${tensionFooter}`
                    : rawPlan.multiZettel.bibliographyBody,
                zettel: rawPlan.multiZettel.zettel,
            } as MultiZettelContent;
        }

        // 8. OutputModeGenerator schreibt Notes
        const generator = new OutputModeGenerator(this.app, this.opts.folderConfig);
        const generated = await generator.generate(input.outputMode, sourceContent, senseMaking);

        // 9. Source-Diversity-Counter (FEAT-15-11/19-14)
        if (this.opts.sourceStats && input.sourceDomain) {
            this.opts.sourceStats.incrementCount(input.cluster, input.sourceDomain);
        }

        // 10. MOC-Page-Update-Hook (FEAT-19-26)
        if (this.opts.onMOCPageUpdated) {
            try { await this.opts.onMOCPageUpdated(input.cluster); }
            catch (err) { console.warn('[DeepIngest] MOC page update failed:', err); }
        }

        return { generated, tensionMarkers, sourceFile: input.sourceFile };
    }
}
