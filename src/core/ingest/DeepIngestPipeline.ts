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

export type IngestMode = 'dialog' | 'auto';

export interface DeepIngestInput {
    sourceFile: TFile;
    mode: IngestMode;
    outputMode: OutputMode;
    cluster: string;
    /** optionaler Source-Domain fuer Diversity-Stats. */
    sourceDomain?: string;
}

export interface DeepIngestPlan {
    /** Take-Aways die als Block-Anker verwendet werden. */
    takeAways: string[];
    /** Sense-Making-Body (fuer Modus 2). */
    summaryBody?: string;
    /** Bibliografie + Zettel-Liste (fuer Modus 3). */
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

export class DeepIngestPipeline {
    constructor(
        private readonly app: App,
        private readonly opts: DeepIngestPipelineOpts,
    ) {}

    async run(input: DeepIngestInput): Promise<DeepIngestResult> {
        // 1. Plan via Caller-Hook (Dialog-Multi-Turn ODER Auto-Default)
        const plan = await this.opts.planGenerator(input.sourceFile, input.mode, input.outputMode);

        // 2. Tension-Detection (FEAT-19-13) falls Detector verfuegbar
        let tensionMarkers: TensionResult[] = [];
        if (this.opts.tensionDetector && plan.takeAways.length > 0) {
            try {
                tensionMarkers = await this.opts.tensionDetector.detect(plan.takeAways);
            } catch (err) {
                console.warn('[DeepIngest] tension detection failed:', err);
            }
        }

        // 3. Markdown-Body anreichern mit Tension-Markern (Inline-Callouts)
        const tensionFooter = tensionMarkers
            .filter((t) => TensionDetector.markerWorthy(t))
            .map((t) => TensionDetector.renderMarker(t))
            .filter(Boolean)
            .join('\n\n');

        // 4. SourceContent vorbereiten
        const sourceContent: SourceContent = {
            suggestedFilename: input.sourceFile.basename + '.md',
            body: '',
            frontmatter: {
                source_path: `[[${input.sourceFile.basename}]]`,
                ingested_at: new Date().toISOString(),
                ingest_mode: input.outputMode,
            },
            blockAnchors: plan.takeAways,
        };

        // 5. SenseMaking je nach Output-Modus
        let senseMaking: SenseMakingContent | MultiZettelContent | undefined;
        if (input.outputMode === 'source-plus-summary' && plan.summaryBody) {
            const fullBody = tensionFooter
                ? `${plan.summaryBody}\n\n## Tension-Marker\n\n${tensionFooter}`
                : plan.summaryBody;
            senseMaking = {
                cluster: input.cluster,
                title: input.sourceFile.basename + ' (Sense-Making)',
                body: fullBody,
                frontmatter: { cluster: input.cluster, ingested_at: new Date().toISOString() },
            };
        } else if (input.outputMode === 'source-plus-multi-zettel' && plan.multiZettel) {
            senseMaking = {
                cluster: input.cluster,
                title: input.sourceFile.basename + ' (Bibliografie)',
                body: plan.multiZettel.bibliographyBody,
                frontmatter: plan.multiZettel.bibliographyFrontmatter,
                bibliographyTitle: plan.multiZettel.bibliographyTitle,
                bibliographyFrontmatter: plan.multiZettel.bibliographyFrontmatter,
                bibliographyBody: tensionFooter
                    ? `${plan.multiZettel.bibliographyBody}\n\n## Tension-Marker\n\n${tensionFooter}`
                    : plan.multiZettel.bibliographyBody,
                zettel: plan.multiZettel.zettel,
            } as MultiZettelContent;
        }

        // 6. OutputModeGenerator schreibt Notes
        const generator = new OutputModeGenerator(this.app, this.opts.folderConfig);
        const generated = await generator.generate(input.outputMode, sourceContent, senseMaking);

        // 7. Source-Diversity-Counter (FEAT-15-11/19-14)
        if (this.opts.sourceStats && input.sourceDomain) {
            this.opts.sourceStats.incrementCount(input.cluster, input.sourceDomain);
        }

        // 8. MOC-Page-Update-Hook (FEAT-19-26)
        if (this.opts.onMOCPageUpdated) {
            try { await this.opts.onMOCPageUpdated(input.cluster); }
            catch (err) { console.warn('[DeepIngest] MOC page update failed:', err); }
        }

        return { generated, tensionMarkers, sourceFile: input.sourceFile };
    }
}
