/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/restrict-template-expressions, @typescript-eslint/unbound-method -- File-level disable: interacts with external SDK / JSON / Obsidian internals where untyped 'any' values are unavoidable. Inputs are validated at boundaries via type guards or schema checks where security-relevant. */
/**
 * VaultHealthService -- Background vault health checks via SQL queries.
 *
 * Runs on vault open (0 token cost -- pure DB queries) and caches findings.
 * Provides data for the health badge in the sidebar header and
 * the vault_health_check tool (agent-callable).
 *
 * ADR-067: Lint Architecture
 * FEATURE-1901: Vault Health Check
 */

import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { KnowledgeDB, SqlJsDatabase } from './KnowledgeDB';
import { cosineSimilarity } from './ImplicitConnectionService';
import { clusterFreshnessScore } from '../health/clusterFreshnessScore';
import { deriveClusterDomainStats } from './ClusterSourceStatsStore';
import { OKF_DEFAULTS } from '../../types/settings';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HealthCheckType =
    | 'orphans'
    | 'missing_backlinks'
    | 'broken_links'
    | 'weak_clusters'
    | 'inconsistent_tags'
    | 'category_mismatch'
    | 'god_nodes'
    // BA-25 PLAN-11 Lint-Foundation:
    | 'cluster_freshness'   // FEAT-19-16, ADR-94
    | 'source_concentration'; // FEAT-19-17, ADR-93

export interface OrphanLinkCandidate {
    path: string;
    similarity: number;
}

export interface OrphanLinkProposal {
    orphanPath: string;
    candidates: OrphanLinkCandidate[];
}

export interface HealthFinding {
    check: HealthCheckType;
    severity: 'high' | 'medium' | 'low';
    paths: string[];
    description: string;
    /** Optional: cluster name for ba25-checks. */
    cluster?: string;
    /** Optional: structured payload for UI action buttons (FEAT-19-18, ADR-106). */
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// VaultHealthService
// ---------------------------------------------------------------------------

/**
 * ADR-167 Stufe 1: die Check-Options als eigener Typ. Die FELDER bleiben
 * optional (Tests pinnen gezielt einzelne Aspekte), der PARAMETER von
 * runChecks ist Pflicht: ein Options-loser Aufruf ist ein Compile-Fehler.
 * Genau zwei solcher Callsites erzeugten die S2-Drift (andere Findingmenge
 * je nach Klickpfad).
 */
export interface HealthCheckOptions {
    backlinksProperty?: string;
    categoryProperty?: string;
    silenceWithContextOrphans?: boolean;
    orphanExcludePathPrefixes?: string[];
    reciprocalProperties?: ReadonlyArray<readonly [string, string]>;
    /**
     * FEAT-19-05-01: Anzeige-Deckel der Klasse weak_clusters fuer DIESEN
     * Lauf. Default 20 (Alltags-Findings-Liste). Der Batch-Modus hebt ihn
     * auf ~250 (= Checkpoint-Cap/2), damit ein Klick 250 Paare statt 20
     * abarbeitet. Bewusst per-Lauf statt globaler Default, damit die
     * normale Liste kurz bleibt.
     */
    weakClusterLimit?: number;
}

/** Settings-Sicht des Builders; strukturell kompatibel zum Plugin-Settings-Objekt. */
export interface HealthCheckSettingsSource {
    backlinksProperty?: string;
    categoryProperty?: string;
    vaultHealth?: {
        silenceWithContextOrphans?: boolean;
        orphanExcludePathPrefixes?: string[];
        reciprocalProperties?: Array<[string, string]>;
    };
}

/**
 * ADR-167: der EINZIGE Erzeuger von HealthCheckOptions. Repliziert die
 * Semantik der bisher Options-fuehrenden Callsites (silence ?? true) und
 * loest backlinksProperty mit demselben OKF-Fallback auf wie die
 * Repair-Schreibpfade und die Graph-Extraktion (FIX-19-01-15-Muster).
 */
/**
 * FEAT-19-05-01: Batch-Deckel fuer weak_clusters. Checkpoint-Cap (500) / 2,
 * weil ein weak-Paar zwei Dateien schreibt -- so bleibt ein Batch genau
 * innerhalb der undo-baren Schreibmenge.
 */
export const WEAK_CLUSTER_BATCH_LIMIT = 250;

export function buildHealthCheckOptions(
    source: HealthCheckSettingsSource,
    /** FEAT-19-05-01: Override des weak_clusters-Deckels fuer den Batch-Pfad. */
    weakClusterLimit?: number,
): HealthCheckOptions {
    return {
        backlinksProperty: source.backlinksProperty ?? OKF_DEFAULTS.backlinksProperty,
        categoryProperty: source.categoryProperty ?? OKF_DEFAULTS.categoryProperty,
        silenceWithContextOrphans: source.vaultHealth?.silenceWithContextOrphans ?? true,
        orphanExcludePathPrefixes: source.vaultHealth?.orphanExcludePathPrefixes ?? [],
        reciprocalProperties: source.vaultHealth?.reciprocalProperties ?? [],
        ...(weakClusterLimit !== undefined ? { weakClusterLimit } : {}),
    };
}

/**
 * W4 (IMP-19-01-03): der EINZIGE Bauplan fuer den Dismiss-Pfadteil.
 * Cluster-Name vor erstem Pfad vor stabilem Beschreibungs-Hash; nie der
 * leere String. Vorher kollabierten pfadlose Findings auf `check:` und
 * ein Dismiss versteckte den ganzen Typ, waehrend der Cluster-Vergleich
 * nie matchte. Alt-Zeilen mit path='' matchen kuenftig nichts mehr und
 * heilen sich damit selbst aus.
 */
export function dismissKeyPathFor(finding: Pick<HealthFinding, 'paths' | 'cluster' | 'description'>): string {
    if (finding.paths[0]) return finding.paths[0];
    if (finding.cluster) return `cluster:${finding.cluster}`;
    let h = 0;
    for (let i = 0; i < finding.description.length; i++) {
        h = (h * 31 + finding.description.charCodeAt(i)) | 0;
    }
    return `desc:${(h >>> 0).toString(16)}`;
}

/**
 * FIX-19-02-03: eine Wahrheit fuer den Wikilink-Vergleich.
 *
 * Die drei Helfer lagen bisher zweimal inline im File und ein drittes Mal
 * gar nicht (fixCategoryMismatches verglich roh). Genau daran ist
 * FIX-19-01-19 entstanden: die eine Kopie wurde geheilt, die andere nicht.
 * Wer den Vergleich aendert, muss ihn ab jetzt nur hier aendern.
 */
export function stripBrackets(s: string): string {
    return s.replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
}

export function stripAlias(s: string): string {
    const pipe = s.indexOf('|');
    return pipe >= 0 ? s.slice(0, pipe).trim() : s;
}

export function lastSegment(s: string): string {
    const seg = s.split('/').pop() ?? s;
    return seg.replace(/\.md$/, '');
}

/** Normalisierte Sicht auf eine Link-Liste, gegen die verglichen wird. */
export interface LinkIndex {
    /** Volle Pfade, mit und ohne .md. */
    exact: Set<string>;
    /**
     * Letzte Segmente NUR der pfadlosen Eintraege. [[Meeting]] darf als
     * Duplikat zu Notes/Meeting.md gelten, [[Archiv/Meeting]] nicht.
     */
    pathlessSegments: Set<string>;
}

export function buildLinkIndex(
    links: readonly string[],
    /**
     * FIX-19-02-12: loest einen pfadlosen Eintrag zu seinem echten Ziel auf.
     * In der Regel `metadataCache.getFirstLinkpathDest`, gebunden an die
     * Datei, in der der Link steht.
     */
    resolve?: (linkText: string) => string | null,
): LinkIndex {
    const exact = new Set<string>();
    const pathlessSegments = new Set<string>();
    for (const l of links) {
        if (typeof l !== 'string') continue;
        const bare = stripAlias(stripBrackets(l));
        if (!bare) continue;
        exact.add(bare);
        exact.add(bare.replace(/\.md$/, ''));
        if (bare.includes('/')) continue;

        // FIX-19-02-12: wer aufloesen kann, muss nicht raten.
        //
        // FIX-19-01-19 hatte den Segment-Vergleich auf pfadlose Eintraege
        // eingeschraenkt, aber dort raet er weiter: ein vorhandenes
        // [[Meeting]] blockierte JEDES Ziel namens Meeting, egal in welchem
        // Ordner. Obsidian weiss, welche Notiz gemeint ist -- dieselbe API,
        // aus der auch die Kanten stammen. Die Heuristik bleibt nur fuer
        // Eintraege, die zu nichts aufloesen (kaputte oder noch nicht
        // angelegte Links); dort ist Raten das Beste, was zur Verfuegung
        // steht, und die Zusicherung aus FIX-19-01-19 haelt.
        const dest = resolve?.(bare.replace(/\.md$/, '')) ?? null;
        if (dest) {
            exact.add(dest);
            exact.add(dest.replace(/\.md$/, ''));
        } else {
            pathlessSegments.add(lastSegment(bare));
        }
    }
    return { exact, pathlessSegments };
}

/** true, wenn targetPath in der Liste bereits vertreten ist. */
export function linkIndexHas(index: LinkIndex, targetPath: string): boolean {
    const normalized = targetPath.replace(/\.md$/, '');
    return index.exact.has(targetPath)
        || index.exact.has(normalized)
        || index.pathlessSegments.has(lastSegment(normalized));
}

/**
 * true, wenn ein einzelner Eintrag genau dieses Ziel meint. Gegenstueck zu
 * linkIndexHas fuer die Entfernen-Richtung (Filter ueber eine Liste).
 */
export function linkEntryMatches(entry: string, targetPath: string): boolean {
    const bare = stripAlias(stripBrackets(entry));
    if (!bare) return false;
    const normalized = targetPath.replace(/\.md$/, '');
    if (bare === targetPath || bare.replace(/\.md$/, '') === normalized) return true;
    // Pfadlose Eintraege duerfen ueber das Segment matchen, Pfade nicht.
    return !bare.includes('/') && lastSegment(bare) === lastSegment(normalized);
}

/**
 * FIX-19-02-10: die Cleanup-Regel als reine Funktion.
 *
 * Objektiver Muell in einer Backlink-Property sind genau zwei Dinge: leere
 * Eintraege und exakte Duplikate. Unaufgeloeste Wikilinks und Verweise auf
 * Anhaenge bleiben (FIX-19-01-16).
 *
 * Die Funktion existiert, damit Plan-Seite (entscheidet auf dem
 * metadataCache) und Schreib-Seite (arbeitet auf dem Live-Frontmatter)
 * dieselbe Regel benutzen, ohne dass die eine der anderen ihre Liste
 * aufdraengt.
 */
export function dedupeBacklinkEntries(items: readonly unknown[]): { kept: string[]; removed: number } {
    const kept: string[] = [];
    const seen = new Set<string>();
    let removed = 0;
    for (const raw of items) {
        const link = String(raw);
        const cleaned = stripBrackets(link);
        if (!cleaned) { removed++; continue; }
        if (seen.has(cleaned)) { removed++; continue; }
        seen.add(cleaned);
        kept.push(link);
    }
    return { kept, removed };
}

export class VaultHealthService {
    private app: App;
    private knowledgeDB: KnowledgeDB;
    private findings: HealthFinding[] = [];
    private running = false;
    /**
     * FIX-19-01-06: was `private cancelled`. Made public so the modal
     * can defensively reset the flag before driving runRepair. The
     * service's own runChecks resets it at the top, but no fix-method
     * does, so a stuck-true flag from a prior path would silently
     * short-circuit every fix loop on iteration 0.
     */
    cancelled = false;
    /** Incoming-connection threshold above which a note is flagged as god node (FEATURE-2003). */
    godNodeThreshold = 50;
    /** Callback to notify UI of updated findings (e.g. badge refresh). */
    onFindingsUpdated: ((findings: HealthFinding[]) => void) | null = null;
    /**
     * FIX-19-01-12: Vektor-Quelle fuer die Orphan-Verknuepfungs-Vorschlaege.
     * Wird von main.ts gesetzt (dieselbe Instanz wie der Semantik-Index), damit
     * kein zweiter 200k-Vektor-Cache entsteht. Null = keine Vorschlaege.
     */
    vectorStore: { getNoteVectors(): Map<string, Float32Array> } | null = null;

    /**
     * SEC M-2 (Audit 2026-07-19): kein Schreibpfad der Welle konsultierte
     * den IgnoreService. planRepairTargets iteriert roh ueber
     * getMarkdownFiles, die Modals rufen den Service direkt (an der
     * ToolExecutionPipeline vorbei), und der Tool-Pfad hat kein
     * path-Input, an dem validatePaths greifen koennte. Ergebnis: der
     * Mass-Repair schrieb auch in Notizen, die der Nutzer per
     * .agentignore ausgenommen oder als protected markiert hat.
     *
     * Injiziert (Muster vectorStore), damit der Service testbar bleibt.
     * Nicht gesetzt = kein Ausschluss (Tests, frueher Boot).
     */
    ignoreGate: { isIgnored(path: string): boolean; isProtected(path: string): boolean } | null = null;

    /** True, wenn in den Pfad geschrieben werden darf. */
    private mayWrite(path: string): boolean {
        const g = this.ignoreGate;
        if (!g) return true;
        try {
            return !g.isIgnored(path) && !g.isProtected(path);
        } catch {
            return true; // Gate defekt: nicht haerter als vorher blockieren
        }
    }

    constructor(app: App, knowledgeDB: KnowledgeDB) {
        this.app = app;
        this.knowledgeDB = knowledgeDB;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Run all health checks (or a subset). Returns findings sorted by severity.
     *
     * FIX-19-01-01: accepts an `options.backlinksProperty` so the
     * `missing_backlinks` check only fires on edges that live under
     * the configured property. Without this filter the SQL flagged
     * every one-sided frontmatter edge regardless of property, which
     * caused the repair to write into the wrong key and the same
     * finding to reappear on the next run.
     */
    async runChecks(
        checks: HealthCheckType[] | undefined,
        options: HealthCheckOptions,
    ): Promise<HealthFinding[]> {
        // ADR-167: Promise-Sharing. Ein ueberlappender Aufruf bekommt das
        // laufende Promise und damit das VOLLSTAENDIGE Ergebnis. Der alte
        // Guard gab die Live-Referenz auf this.findings zurueck, also die
        // teilbefuellte Liste des laufenden Runs (leere Sidebar-Notice,
        // ignorierte Options des zweiten Aufrufers).
        if (this.inFlight) return this.inFlight;
        this.inFlight = this.executeChecks(checks, options).finally(() => {
            this.inFlight = null;
        });
        return this.inFlight;
    }

    private inFlight: Promise<HealthFinding[]> | null = null;

    private async executeChecks(
        checks: HealthCheckType[] | undefined,
        options: HealthCheckOptions,
    ): Promise<HealthFinding[]> {
        if (!this.knowledgeDB.isOpen()) return [];

        this.running = true;
        this.cancelled = false;
        this.findings = [];

        const backlinksProperty = options?.backlinksProperty;
        // 'Kategorie' war der historische Hardcode beider Seiten; der Builder
        // liefert das Settings-Property, hier gilt nur noch der Not-Fallback.
        const categoryProperty = options?.categoryProperty ?? 'Kategorie';
        const silenceWithContextOrphans = options?.silenceWithContextOrphans ?? false;
        const orphanExcludePathPrefixes = options?.orphanExcludePathPrefixes ?? [];
        const reciprocalProperties = options?.reciprocalProperties ?? [];
        // FEAT-19-05-01: Batch-Deckel, Default 20.
        const weakClusterLimit = options?.weakClusterLimit ?? 20;

        let savesSuspended = false;
        try {
            const db = this.getDB();
            // ADR-167 Stufe 2: fixierter Tabellenstand fuer die Laufdauer.
            // Die Checks yielden zwischen den Einzelpruefungen an die UI;
            // in diesen Fenstern schreiben Hintergrund-Jobs (extractFile,
            // recomputeForPath, Index-Writes) die Tabellen um. Live belegt:
            // kompletter implicit_edges-Rebuild zwischen zwei Nutzer-Runs.
            // SEC M-5: sql.js db.export() ist close+reopen und wuerde die
            // TEMP-Tabellen mitten im Lauf entfernen. Der Save wird fuer die
            // Laufdauer aufgeschoben (nicht verworfen).
            this.knowledgeDB.suspendSaves?.();
            savesSuspended = true;
            this.createCheckSnapshot(db);
            const checksToRun = checks ?? [
                'orphans',
                'missing_backlinks',
                'broken_links',
                'weak_clusters',
                'inconsistent_tags',
                'category_mismatch',
                'god_nodes',
                // BA-25 PLAN-11 additive Checks:
                'cluster_freshness',
                'source_concentration',
            ];

            for (const check of checksToRun) {
                if (this.cancelled) break;
                switch (check) {
                    case 'orphans': this.checkOrphans(db, {
                        silenceWithContext: silenceWithContextOrphans,
                        excludePathPrefixes: orphanExcludePathPrefixes,
                    }); break;
                    case 'missing_backlinks': this.checkMissingBacklinks(db, backlinksProperty, reciprocalProperties, categoryProperty); break;
                    case 'broken_links': this.checkBrokenLinks(db); break;
                    case 'weak_clusters': this.checkWeakClusters(db, weakClusterLimit); break;
                    case 'inconsistent_tags': this.checkInconsistentTags(db); break;
                    case 'category_mismatch': this.checkCategoryMismatch(db, categoryProperty); break;
                    case 'god_nodes': this.checkGodNodes(db); break;
                    case 'cluster_freshness': this.checkClusterFreshness(db); break;
                    case 'source_concentration': this.checkSourceConcentration(db); break;
                }
                // Yield to UI thread between checks
                await new Promise<void>(r => window.setTimeout(r, 0));
            }

            // Filter out dismissed findings
            const dismissed = new Set<string>();
            try {
                const db = this.getDB();
                const rows = db.exec('SELECT check_type, path FROM dismissed_health_findings');
                if (rows.length > 0) {
                    for (const row of rows[0].values) {
                        dismissed.add(`${String(row[0])}:${String(row[1])}`);
                    }
                }
            } catch { /* non-fatal */ }
            if (dismissed.size > 0) {
                this.findings = this.findings.filter(
                    f => !dismissed.has(`${f.check}:${dismissKeyPathFor(f)}`),
                );
            }

            // Sort: high -> medium -> low
            const severityOrder = { high: 0, medium: 1, low: 2 };
            this.findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

            if (this.findings.length > 0) {
                console.debug(`[VaultHealth] ${this.findings.length} findings (${this.findings.filter(f => f.severity === 'high').length} high, ${this.findings.filter(f => f.severity === 'medium').length} medium, ${this.findings.filter(f => f.severity === 'low').length} low)`);
            }

            this.lastRunStatus = 'ok';
            this.lastRunAt = this.nowFn();
            this.onFindingsUpdated?.(this.findings);
            return this.findings;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('database is closed')) {
                console.debug('[VaultHealth] DB closed during check, aborting gracefully');
            } else {
                console.warn('[VaultHealth] Health check failed:', e);
            }
            // FIX-19-02-21: das leere Array ist die Antwort auf ZWEI Fragen.
            //
            // "Dein Vault ist in Ordnung" und "die Pruefung ist abgestuerzt"
            // sahen fuer jeden Aufrufer identisch aus. Der Ergebnis-Screen
            // meldete deshalb "Remaining: 0 finding(s)" direkt unter "24
            // target(s) still report the finding" -- die beruhigendste
            // Meldung ausgerechnet dann, wenn das Werkzeug versagt hat.
            // Der Status ist das zweite Signal; die Oberflaeche muss es
            // lesen, bevor sie Entwarnung gibt.
            this.lastRunStatus = 'failed';
            // FIX-19-05-04: auch ein Abbruch bekommt einen Zeitstempel -- der
            // Findings-Tab zeigt "zuletzt geprueft" und darf nach einem Fehler
            // nicht so tun, als haette nie ein Lauf stattgefunden.
            this.lastRunAt = this.nowFn();
            // FIX-19-02-27: auch die Ueberhang-Zahlen sind jetzt ungueltig.
            // Sie ueberlebten den Abbruch und der Hinweis behauptete danach
            // "20 von 1217" auf Basis eines Laufs, den es in diesem Zustand
            // nicht mehr gibt -- dieselbe stille Falschauskunft wie das
            // leere Findings-Array.
            this.weakClusterTotals = { shown: 0, total: 0 };
            // Und der Badge darf nicht auf 0 fallen: das waere dieselbe
            // stille Luege an der prominentesten Stelle.
            return [];
        } finally {
            try { this.dropCheckSnapshot(this.getDB()); } catch { /* non-fatal */ }
            if (savesSuspended) this.knowledgeDB.resumeSaves?.();
            this.running = false;
        }
    }

    /**
     * FIX-19-02-21: hat der letzte Lauf wirklich stattgefunden?
     *
     * 'failed' heisst: die zurueckgegebene Befundliste ist LEER, weil die
     * Pruefung abgebrochen ist, nicht weil nichts zu finden war. Wer
     * Entwarnung anzeigen will, muss das hier zuerst fragen.
     */
    getLastRunStatus(): 'ok' | 'failed' {
        return this.lastRunStatus;
    }

    private lastRunStatus: 'ok' | 'failed' = 'ok';

    /**
     * FIX-19-05-04: Wall-clock-Zeit (ms) des letzten runChecks-Laufs, oder
     * null vor dem ersten Lauf. Speist die "zuletzt geprueft"-Anzeige im
     * Findings-Tab, damit der Nutzer das Alter der Befunde kennt.
     */
    getLastRunAt(): number | null {
        return this.lastRunAt;
    }

    private lastRunAt: number | null = null;

    /** FIX-19-05-04: injizierbare Uhr fuer deterministische Tests. */
    nowFn: () => number = () => Date.now();

    /** Get cached findings from the last run. */
    getFindings(): HealthFinding[] {
        return this.findings;
    }

    /**
     * ADR-167: kopiert die vier beweglichen Lese-Tabellen der Checks in
     * TEMP-Tabellen (ohne die BLOB-Spalten von vectors). cluster_metadata
     * und cluster_source_stats bleiben bewusst live (nutzergepflegte bzw.
     * ingest-seitige Statistik, akzeptierte Restbewegung).
     */
    private createCheckSnapshot(db: SqlJsDatabase): void {
        this.dropCheckSnapshot(db);
        // Gestaffelte Fallbacks statt harter Projektion: aeltere DB-Staende
        // (vor der ADR-137-domain-Spalte) duerfen den Lauf nicht abbrechen.
        // SEC L-3: der frueher stille Leer-Fallback ist raus. Ein leeres
        // hc_edges bei intaktem hc_vectors haette JEDE Notiz als Orphan
        // gemeldet -- eine plausibel aussehende Massen-Findingliste ohne
        // jeden Hinweis. Schlaegt eine Quelle komplett fehl, wirft die
        // Erzeugung und der Lauf endet ohne Ergebnis (fail-closed).
        this.snapshotTable(db, 'hc_edges',
            ['SELECT source_path, target_path, link_type, property_name, confidence FROM edges']);
        // FIX-19-01-21: der Layer-Filter sitzt HIER, nicht bei den Konsumenten.
        // Der ADR-167-Umbau hat die Rohlesungen in diesen Snapshot gezogen und
        // die Tabelle dabei auf hc_vectors umbenannt -- womit die ADR-137-
        // Lint-Regel (sie matcht nur `FROM vectors`) alle vier Konsumenten aus
        // den Augen verlor. Zwei filterten danach nicht mehr auf domain, und
        // reportMtimeDegeneration zaehlte Tracing-Zeilen als Notizen mit.
        // Statt den Filter in jedem Konsumenten zu wiederholen, traegt der
        // Snapshot jetzt physisch nur note-Zeilen: das ist die Build-Zeit-
        // Garantie aus ADR-136 Option 1 ("kein Filter im Code noetig, kein
        // Drift-Pfad moeglich"), die dort nur am Re-Index-Preis gescheitert
        // ist. Den gibt es hier nicht, der Snapshot wird pro Lauf neu gebaut.
        /* eslint-disable no-restricted-syntax -- reason: ADR-137-Ausnahme. Einzige Direktlesung von vectors auf der Check-Seite; sie stellt die note-only-Eigenschaft von hc_vectors ueberhaupt erst her. */
        this.snapshotTable(db, 'hc_vectors',
            [
                "SELECT path, chunk_index, domain, mtime FROM vectors WHERE domain = 'note'",
                // Schema-Fallback fuer DB-Staende vor der domain-Spalte: dort
                // gibt es nichts zu filtern, die Spalte wird synthetisiert.
                "SELECT path, chunk_index, 'note' AS domain, mtime FROM vectors",
            ]);
        /* eslint-enable no-restricted-syntax -- Ende der ADR-137-Ausnahme */
        this.snapshotTable(db, 'hc_implicit_edges',
            ['SELECT source_path, target_path, similarity FROM implicit_edges']);
        this.snapshotTable(db, 'hc_tags',
            ['SELECT path, tag FROM tags']);

        // SEC H-1: CREATE TABLE AS SELECT kopiert keine Indizes. Ohne sie
        // degradieren die korrelierten NOT-EXISTS-Praedikate zu Full-Scans
        // pro aeusserer Zeile (gemessen 178x langsamer; bei 5x Vaultgroesse
        // ein 44-Sekunden-Freeze im Boot-Check). Der Indexbau kostet ~15ms.
        for (const ddl of [
            'CREATE INDEX IF NOT EXISTS hc_idx_edges_source ON hc_edges(source_path)',
            'CREATE INDEX IF NOT EXISTS hc_idx_edges_target ON hc_edges(target_path)',
            'CREATE INDEX IF NOT EXISTS hc_idx_edges_pair ON hc_edges(source_path, target_path)',
            'CREATE INDEX IF NOT EXISTS hc_idx_vectors_path ON hc_vectors(path)',
            'CREATE INDEX IF NOT EXISTS hc_idx_implicit_source ON hc_implicit_edges(source_path)',
            'CREATE INDEX IF NOT EXISTS hc_idx_tags_tag ON hc_tags(tag)',
        ]) {
            db.run(ddl);
        }
    }

    /**
     * Erzeugt EINE Snapshot-Tabelle. Die Varianten sind Schema-Fallbacks
     * (alte DB-Staende ohne domain-Spalte); scheitern ALLE, wirft die
     * Methode -- siehe SEC L-3 oben.
     */
    private snapshotTable(db: SqlJsDatabase, name: string, selects: string[]): void {
        let lastError: unknown;
        for (const sel of selects) {
            try {
                db.run(`CREATE TEMP TABLE ${name} AS ${sel}`);
                return;
            } catch (e) { lastError = e; }
        }
        throw new Error(
            `[VaultHealth] Snapshot-Tabelle ${name} konnte nicht erzeugt werden: ${String(lastError)}`,
        );
    }

    private dropCheckSnapshot(db: SqlJsDatabase): void {
        for (const t of ['hc_edges', 'hc_vectors', 'hc_implicit_edges', 'hc_tags']) {
            db.run(`DROP TABLE IF EXISTS ${t}`);
        }
    }

    /** Total number of findings. */
    getFindingCount(): number {
        return this.findings.length;
    }

    /** Highest severity among findings (for badge color). */
    getMaxSeverity(): 'high' | 'medium' | 'low' | null {
        if (this.findings.length === 0) return null;
        if (this.findings.some(f => f.severity === 'high')) return 'high';
        if (this.findings.some(f => f.severity === 'medium')) return 'medium';
        return 'low';
    }

    /** Whether a check is currently running. */
    get isRunning(): boolean {
        return this.running;
    }

    /** Cancel an in-progress check. */
    cancel(): void {
        this.cancelled = true;
    }

    /** Dismiss a finding so it won't appear in future checks. */
    dismissFinding(checkType: string, path: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.getDB();
        db.run(
            'INSERT OR REPLACE INTO dismissed_health_findings (check_type, path, dismissed_at) VALUES (?, ?, ?)',
            [checkType, path, new Date().toISOString()],
        );
        this.knowledgeDB.markDirty();
        // Remove from cached findings
        // SEC Info-2: derselbe Key wie Persistenz und Lauf-Filter. Seit W4
        // schreibt der Modal-Dismiss den kanonischen Key (cluster:X /
        // desc:<hash>), der Cache-Filter verglich aber weiter paths[0] --
        // ein cluster_freshness-Dismiss verschwand erst nach Neustart.
        this.findings = this.findings.filter(
            f => !(f.check === checkType && dismissKeyPathFor(f) === path),
        );
        // FIX-19-02-07: den Badge mitziehen. Seit updateBadge im Modal zur
        // leeren Huelle wurde, kommt die Zahl ausschliesslich ueber diesen
        // Push (main.ts). Ohne ihn blieb der Stethoskop-Badge nach jedem
        // Ausblenden auf dem alten, zu hohen Stand stehen -- eine falsche
        // Zahl an der prominentesten Stelle der UI.
        this.onFindingsUpdated?.(this.findings);
    }

    /** Clear all dismissed findings. */
    restoreDismissed(): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.getDB();
        db.run('DELETE FROM dismissed_health_findings');
        this.knowledgeDB.markDirty();
    }

    /** Restore a single dismissed finding. */
    restoreDismissedFinding(checkType: string, path: string): void {
        if (!this.knowledgeDB.isOpen()) return;
        const db = this.getDB();
        db.run('DELETE FROM dismissed_health_findings WHERE check_type = ? AND path = ?', [checkType, path]);
        this.knowledgeDB.markDirty();
    }

    /** Number of dismissed findings. */
    getDismissedCount(): number {
        if (!this.knowledgeDB.isOpen()) return 0;
        const db = this.getDB();
        const result = db.exec('SELECT COUNT(*) FROM dismissed_health_findings');
        return result.length > 0 ? Number(result[0].values[0][0]) : 0;
    }

    /** Get all dismissed findings. */
    getDismissedFindings(): Array<{ checkType: string; path: string; dismissedAt: string }> {
        if (!this.knowledgeDB.isOpen()) return [];
        const db = this.getDB();
        const result = db.exec('SELECT check_type, path, dismissed_at FROM dismissed_health_findings ORDER BY dismissed_at DESC');
        if (result.length === 0) return [];
        return result[0].values.map(row => ({
            checkType: row[0] as string,
            path: row[1] as string,
            dismissedAt: row[2] as string,
        }));
    }

    /**
     * Format findings as ultra-compact summary for the agent.
     * MUST stay under 2000 chars to avoid context externalization (ADR-063).
     */
    formatFindings(findings?: HealthFinding[]): string {
        const f = findings ?? this.findings;
        if (f.length === 0) return 'Vault health check: No issues found.';

        const grouped = new Map<HealthCheckType, HealthFinding[]>();
        for (const finding of f) {
            const existing = grouped.get(finding.check) ?? [];
            existing.push(finding);
            grouped.set(finding.check, existing);
        }

        const lines: string[] = [`Vault Health: ${f.length} finding(s)`];

        for (const [check, checkFindings] of grouped) {
            const totalPaths = checkFindings.reduce((sum, cf) => sum + cf.paths.length, 0);
            const severity = checkFindings[0].severity;

            switch (check) {
                case 'orphans':
                    lines.push(`- Orphans [${severity}]: ${totalPaths} notes without incoming links`);
                    break;
                case 'missing_backlinks':
                    lines.push(`- Missing Backlinks [${severity}]: ${checkFindings.length} entities not linking back`);
                    break;
                case 'broken_links':
                    lines.push(`- Broken Links [${severity}]: ${checkFindings.length} targets don't exist`);
                    break;
                case 'weak_clusters':
                    lines.push(`- Weak Clusters [${severity}]: ${checkFindings.length} similar-but-unlinked pairs`);
                    break;
                case 'inconsistent_tags':
                    lines.push(`- Inconsistent Tags [${severity}]: ${checkFindings.length} spelling variants`);
                    break;
                case 'category_mismatch':
                    lines.push(`- Category Mismatch [${severity}]: ${checkFindings.length} notes referenced in wrong property`);
                    break;
                case 'god_nodes':
                    lines.push(`- God Nodes [${severity}]: ${checkFindings.length} notes with too many incoming links`);
                    break;
                // BA-25 PLAN-11 Lint-Foundation
                case 'cluster_freshness':
                    lines.push(`- Cluster Freshness [${severity}]: ${checkFindings.length} cluster(s) ueber Halbwertszeit (Karpathy-Lint)`);
                    for (const cf of checkFindings.slice(0, 3)) {
                        lines.push(`    - ${cf.description}`);
                    }
                    break;
                case 'source_concentration':
                    lines.push(`- Source Concentration [${severity}]: ${checkFindings.length} cluster(s) mit dominanter Source-Domain (Bias-Warnung)`);
                    for (const cf of checkFindings.slice(0, 3)) {
                        lines.push(`    - ${cf.description}`);
                    }
                    break;
            }
        }

        lines.push('');
        lines.push('Use EXISTING entities. In batch: fix autonomously. In interactive: ask first. All reversible via Undo.');
        lines.push('BA-25-Findings (cluster_freshness, source_concentration): nutze Stufe-2-Web-Search via web_search-Tool fuer Update-Recherche oder Anti-Echo-Suche.');
        // FIX-19-16-06: der eingebaute Check misst Struktur und Dateialter.
        // Die inhaltliche Ebene (stimmt eine Notiz noch, was widerspricht ihr,
        // Echokammer-Messung ueber Quellen) ist der Auftrag der
        // daily-briefing-Skill; der Agent soll dorthin verweisen statt sie
        // aus dem Check heraus zu improvisieren.
        lines.push('Content-level freshness (does a note still hold, contradictions, echo-chamber measurement) is the daily-briefing skill\'s job: it reads dated sources daily and records per-note verdicts. Point the user there; this check covers structure and file age only.');

        return lines.join('\n');
    }

    // -----------------------------------------------------------------------
    // Individual checks
    // -----------------------------------------------------------------------

    private checkOrphans(
        db: SqlJsDatabase,
        opts?: { silenceWithContext?: boolean; excludePathPrefixes?: string[] },
    ): void {
        // FIX-19-01-05: build the user-defined excludePathPrefixes
        // into the SQL pre-filter. The hardcoded Templates / Daily
        // Notes / Attachements stay as default excludes; the user
        // setting adds further folder prefixes (e.g. TaskNotes/).
        const userExcludes = opts?.excludePathPrefixes ?? [];
        const userExcludeClauses = userExcludes
            .filter((p) => p.length > 0)
            .map(() => `AND v.path NOT LIKE ?`)
            .join('\n               ');
        const userExcludeParams = userExcludes
            .filter((p) => p.length > 0)
            .map((p) => `${p}%`);

        // PLAN-41 Wave 2 / ADR-137: orphan-Check arbeitet ausschließlich auf der
        // note-Layer. Ohne den domain-Filter wuerden session-/episode-/fact-Zeilen
        // (URI-Pfade wie session:..., episode:...) als Pseudo-Orphans gemeldet,
        // weil sie nie Ziel einer edges-Zeile sind.
        const result = db.exec(
            `SELECT DISTINCT v.path FROM hc_vectors v
             WHERE v.chunk_index = 0
               AND v.domain = 'note'
               AND v.path NOT IN (SELECT DISTINCT target_path FROM hc_edges)
               AND v.path NOT LIKE '%Templates%'
               AND v.path NOT LIKE '%Daily Notes%'
               AND v.path NOT LIKE '%Attachements%'
               ${userExcludeClauses}`,
            userExcludeParams,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        const paths = result[0].values.map(row => row[0] as string);
        if (paths.length === 0) return;

        // Enrich orphans with their outgoing MOC links (they link TO entities but nobody links back)
        // This helps the agent understand WHERE these notes belong instead of creating new entities
        const outgoingEdges = db.exec(
            `SELECT source_path, target_path, property_name FROM hc_edges
             WHERE link_type = 'frontmatter'
               AND source_path IN (${paths.map(() => '?').join(',')})`,
            paths,
        );

        const orphanContext = new Map<string, string[]>();
        if (outgoingEdges.length > 0) {
            for (const row of outgoingEdges[0].values) {
                const source = row[0] as string;
                const target = row[1] as string;
                const prop = row[2] as string;
                const existing = orphanContext.get(source) ?? [];
                existing.push(`${prop}: [[${target}]]`);
                orphanContext.set(source, existing);
            }
        }

        // Also check ontology clusters for unlinked orphans
        const orphanClusters = db.exec(
            `SELECT entity_path, cluster, role FROM ontology
             WHERE entity_path IN (${paths.map(() => '?').join(',')})`,
            paths,
        );

        const clusterInfo = new Map<string, string[]>();
        if (orphanClusters.length > 0) {
            for (const row of orphanClusters[0].values) {
                const path = row[0] as string;
                const cluster = row[1] as string;
                const existing = clusterInfo.get(path) ?? [];
                existing.push(cluster);
                clusterInfo.set(path, existing);
            }
        }

        // Split into: orphans with context (easier to fix) vs. truly isolated
        const withContext: string[] = [];
        const isolated: string[] = [];
        for (const p of paths) {
            if (orphanContext.has(p) || clusterInfo.has(p)) {
                withContext.push(p);
            } else {
                isolated.push(p);
            }
        }

        // FIX-19-01-04: split the two orphan kinds via metadata so
        // the modal can offer the move-to-folder repair only for
        // truly isolated orphans. with_context notes have outgoing
        // edges and BELONG to a cluster; moving them to Inbox/Orphans/
        // would destroy that context. They surface as findings (so
        // the user can add the missing backlink) but they are not
        // auto-repairable.
        // FIX-19-01-05: respect the silenceWithContextOrphans setting.
        // Users with embedded-Base hub notes get a visual backlink via
        // the Base filter and do not need a Findings entry telling them
        // to add a reciprocal wikilink. Default in the calling settings
        // is silent; users who rely on property-reciprocity flip it off.
        if (withContext.length > 0 && !opts?.silenceWithContext) {
            const details = withContext.slice(0, 20).map(p => {
                const ctx = orphanContext.get(p);
                const clusters = clusterInfo.get(p);
                let detail = p;
                if (ctx) detail += ` (links to: ${ctx.join(', ')})`;
                if (clusters) detail += ` (clusters: ${clusters.map(c => `[[${c}]]`).join(', ')})`;
                return detail;
            });
            this.findings.push({
                check: 'orphans',
                severity: 'medium',
                paths: withContext,
                description: `${withContext.length} note(s) link to existing entities but are not linked back. These notes BELONG to existing clusters -- add backlinks from the target entities, do NOT create new entities.\n\nExamples:\n${details.join('\n')}`,
                metadata: { orphanKind: 'with_context' },
            });
        }

        if (isolated.length > 0) {
            this.findings.push({
                check: 'orphans',
                severity: 'medium',
                paths: isolated,
                description: `${isolated.length} note(s) have no links at all (neither outgoing MOC properties nor incoming links). Use semantic_search to find where they belong before creating new entities.`,
                metadata: { orphanKind: 'isolated' },
            });
        }
    }

    private checkMissingBacklinks(
        db: SqlJsDatabase,
        backlinksProperty: string | undefined,
        reciprocalProperties: ReadonlyArray<readonly [string, string]>,
        categoryProperty: string,
    ): void {
        // ADR-164: der Check ist Consumer des Praedikats, keine eigene
        // Selektion mehr. Vier historische Divergenzen (Reziprok nur im
        // Check, 'Kategorie' hardcoded, .md-Filter nur im Repair, LIMIT
        // nur im Check) sind damit strukturell weg. Der fruehere stille
        // LIMIT-200-Cap entfaellt: ein Cap, der Findings verschweigt,
        // war eine Transparenz-Luecke (FIX-19-01-06-Klasse).
        if (!backlinksProperty) return;
        void db;
        const targets = this.computeMissingBacklinkTargets(
            backlinksProperty, categoryProperty, reciprocalProperties, 'hc_',
        );
        for (const [target, { sources }] of targets) {
            this.findings.push({
                check: 'missing_backlinks',
                severity: 'high',
                paths: [target, ...sources],
                description: `[[${target}]] is linked from ${sources.length} note(s) via MOC properties but does not link back`,
            });
        }
    }

    private checkBrokenLinks(db: SqlJsDatabase): void {
        // FIX-19-01-02: the `vectors` table is the embedding index,
        // not the vault filesystem. A note can legitimately exist on
        // disk without ever being embedded (embeddings disabled, the
        // path is excluded from indexing, the note was just created,
        // or it is empty). Using vectors as the "exists" predicate
        // produced false-positive broken-link findings where the
        // modal would render `[[X]]` as a clickable wikilink (Obsidian
        // resolves it because the file exists) while the description
        // claimed the note does not exist.
        //
        // The SQL stays the same (cheap pre-filter to keep the
        // candidate set small), but every candidate is now verified
        // against the vault filesystem and Obsidian's linkpath
        // resolver before it becomes a finding.
        // PLAN-41 Wave 2: Der Vektor-Index enthält auch Tracing-Einträge
        // (domain in 'session'/'episode'/'fact'/...). Für die Cluster-
        // Mitgliedschaft -- also "existiert der Pfad als echte Note?" --
        // zählen nur Zeilen mit domain='note'. Ohne diesen Filter würden
        // Tracing-Einträge fälschlich als "im Vault vorhanden" gewertet
        // und broken_link-Befunde maskieren.
        const result = db.exec(
            `SELECT DISTINCT source_path, target_path FROM hc_edges
             WHERE target_path LIKE '%.md'
               AND target_path NOT IN (
                   SELECT DISTINCT path FROM hc_vectors WHERE chunk_index = 0 AND domain = 'note'
               )
             ORDER BY source_path, target_path
             LIMIT 200`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        const pairs = result[0].values.map(row => ({
            source: row[0] as string,
            target: row[1] as string,
        }));

        const byTarget = new Map<string, string[]>();
        for (const p of pairs) {
            // Skip targets that look like external references or non-vault paths.
            if (p.target.includes('://') || p.target.startsWith('http')) continue;

            // Verify against the vault filesystem. A direct path hit
            // confirms the file exists; if the edge stored a wikilink
            // basename rather than the full path, ask Obsidian's
            // linkpath resolver from the source-note's directory.
            if (this.existsInVault(p.target, p.source)) continue;

            const existing = byTarget.get(p.target) ?? [];
            existing.push(p.source);
            byTarget.set(p.target, existing);
        }

        // Cap the surfaced set at 50 to keep the modal readable.
        let surfaced = 0;
        for (const [target, sources] of byTarget) {
            if (surfaced >= 50) break;
            this.findings.push({
                check: 'broken_links',
                severity: 'medium',
                paths: [target, ...sources],
                description: `[[${target}]] is referenced from ${sources.length} note(s) but does not exist in the vault`,
            });
            surfaced++;
        }
    }

    /**
     * FIX-19-01-02: vault-filesystem existence check for the
     * broken-links predicate. Returns true when the target resolves
     * to a real `TFile` either via direct path lookup or via
     * Obsidian's linkpath resolver from the source-note's directory.
     * Both lookups respect Obsidian's case rules and folder layout.
     */
    private existsInVault(targetPath: string, sourcePath: string): boolean {
        const direct = this.app.vault.getAbstractFileByPath(targetPath);
        if (direct instanceof TFile) return true;

        // Try variants the graph extractor might have stored. Some
        // extractors normalize wikilinks to bare basenames before
        // writing to edges; others store full paths.
        const withoutExt = targetPath.replace(/\.md$/, '');
        const direct2 = this.app.vault.getAbstractFileByPath(withoutExt + '.md');
        if (direct2 instanceof TFile) return true;

        // Linkpath resolver respects Obsidian's "shortest path when
        // unambiguous" rule. Resolves `[[Note]]` against any vault
        // file named `Note.md` regardless of folder, with the
        // source-note's directory as the resolution context.
        const resolved = this.app.metadataCache.getFirstLinkpathDest(withoutExt, sourcePath);
        return resolved instanceof TFile;
    }

    /**
     * Check for god nodes: notes with excessive incoming connections.
     * Analogous to "god classes" in software -- overloaded hubs reduce
     * signal-to-noise in the graph. FEATURE-2003, EPIC-020.
     */
    private checkGodNodes(db: SqlJsDatabase): void {
        const threshold = this.godNodeThreshold ?? 50;
        const result = db.exec(
            // FEAT-19-04-01 W3: backlink-block-Kanten (Hub->Quelle, vom
            // selbstbildenden Rueckverweis-Block) NICHT mitzaehlen. Sonst
            // blaeht eine in vielen Hub-Bloecken gelistete Quelle ihren
            // in_degree kuenstlich auf und wird faelschlich als god_node
            // gemeldet. Nur echte body/frontmatter-Kanten zaehlen.
            `SELECT target_path, COUNT(*) AS in_degree
             FROM hc_edges
             WHERE link_type != 'backlink-block'
             GROUP BY target_path
             HAVING COUNT(*) > ?
             ORDER BY in_degree DESC, target_path
             LIMIT 20`,
            [threshold],
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        for (const row of result[0].values) {
            const path = row[0] as string;
            const degree = row[1] as number;

            this.findings.push({
                check: 'god_nodes',
                severity: 'medium',
                paths: [path],
                description: `[[${path}]] has ${degree} incoming connections (threshold: ${threshold}) -- consider splitting into sub-topics`,
            });
        }
    }

    /**
     * ADR-164: DIE Kandidaten-Selektion der Klasse weak_clusters,
     * konsumiert vom Check (Snapshot) und von verifyWeakClusterPairs (live).
     */
    private selectWeakClusterCandidates(
        tablePrefix: '' | 'hc_',
        limit = 20,
    ): Array<{ source: string; target: string; similarity: number }> {
        const db = this.getDB();
        const result = db.exec(
            `SELECT ie.source_path, ie.target_path, ie.similarity
             FROM ${tablePrefix}implicit_edges ie
             WHERE ie.similarity > 0.8
               -- FIX-19-02-24: nur Markdown. Ein Anhang (PDF, PPTX, DOCX)
               -- kann kein Frontmatter tragen, also kann der Repair dort
               -- nichts schreiben. Live standen 74 solcher Paare in der
               -- Menge: sie wurden geplant, still uebergangen und danach
               -- als "meldet den Befund weiterhin" aufgelistet -- die
               -- Liste im Ergebnis-Screen bestand ueberwiegend aus PDFs.
               AND ie.source_path LIKE '%.md'
               AND ie.target_path LIKE '%.md'
               AND NOT EXISTS (
                   SELECT 1 FROM ${tablePrefix}edges e
                   WHERE (e.source_path = ie.source_path AND e.target_path = ie.target_path)
                      OR (e.source_path = ie.target_path AND e.target_path = ie.source_path)
               )
             ORDER BY ie.similarity DESC, ie.source_path, ie.target_path
             LIMIT ${limit}`,
        );
        if (result.length === 0) return [];
        return result[0].values.map((row) => ({
            source: row[0] as string,
            target: row[1] as string,
            similarity: row[2] as number,
        }));
    }

    /**
     * FIX-19-02-04: wie viele Kandidaten es WIRKLICH gibt, unabhaengig vom
     * Anzeige-Deckel. Ohne diese Zahl luegt die Liste durch Auslassung: der
     * Nutzer repariert 20 von 1217, die naechsten 20 ruecken nach, und die
     * Anzeige steht scheinbar still.
     */
    private countWeakClusterCandidates(tablePrefix: '' | 'hc_'): number {
        const db = this.getDB();
        const result = db.exec(
            `SELECT COUNT(*)
             FROM ${tablePrefix}implicit_edges ie
             WHERE ie.similarity > 0.8
               -- FIX-19-02-24: gleicher Filter wie in der Auswahl, sonst
               -- verspricht die Gesamtzahl mehr, als je reparierbar ist.
               AND ie.source_path LIKE '%.md'
               AND ie.target_path LIKE '%.md'
               AND NOT EXISTS (
                   SELECT 1 FROM ${tablePrefix}edges e
                   WHERE (e.source_path = ie.source_path AND e.target_path = ie.target_path)
                      OR (e.source_path = ie.target_path AND e.target_path = ie.source_path)
               )`,
        );
        if (!result.length || !result[0].values.length) return 0;
        return Number(result[0].values[0][0] ?? 0);
    }

    /** FIX-19-02-04: Anzeige-Deckel gegen tatsaechlichen Bestand. */
    getCheckTotals(): { weakClusters: { shown: number; total: number } } {
        return { weakClusters: { ...this.weakClusterTotals } };
    }

    private weakClusterTotals = { shown: 0, total: 0 };

    private checkWeakClusters(db: SqlJsDatabase, limit = 20): void {
        void db;
        const rows = this.selectWeakClusterCandidates('hc_', limit);
        this.weakClusterTotals = {
            shown: rows.length,
            total: this.countWeakClusterCandidates('hc_'),
        };
        for (const { source, target, similarity: sim } of rows) {
            this.findings.push({
                check: 'weak_clusters',
                severity: 'medium',
                paths: [source, target],
                description: `[[${source}]] and [[${target}]] are semantically similar (${sim.toFixed(2)}) but not linked`,
            });
        }
    }

    private checkInconsistentTags(db: SqlJsDatabase): void {
        const result = db.exec(
            // Materialize one row per spelling before joining. SQLite can then
            // index the normalized column instead of evaluating LOWER over a
            // Cartesian product of every note-tag occurrence (#84).
            `WITH tag_counts AS MATERIALIZED (
                 SELECT tag, LOWER(tag) AS normalized, COUNT(DISTINCT path) AS uses
                 FROM hc_tags GROUP BY tag
             )
             SELECT t1.tag, t2.tag, t1.uses + t2.uses AS total_uses
             FROM tag_counts t1 JOIN tag_counts t2 ON t1.normalized = t2.normalized
             WHERE t1.tag < t2.tag AND t1.uses + t2.uses > 1
             ORDER BY t1.tag, t2.tag
             LIMIT 20`,
        );
        if (result.length === 0 || result[0].values.length === 0) return;

        for (const row of result[0].values) {
            const tag1 = row[0] as string;
            const tag2 = row[1] as string;

            this.findings.push({
                check: 'inconsistent_tags',
                severity: 'low',
                paths: [],
                description: `Tags "#${tag1}" and "#${tag2}" differ only in capitalization -- consider unifying`,
            });
        }
    }

    /**
     * Check for category mismatches: a note with Kategorie "Thema" should only
     * appear in the "Themen" property of other notes, not in "Konzepte" etc.
     */
    /**
     * ADR-164: DIE Selektion der Klasse category_mismatch, konsumiert vom
     * Check (Snapshot) und von computeCategoryMismatchFixes (live).
     * Dismiss-Filter auf dem Target lebt hier, damit auch der Repair-Plan
     * dismisste Findings respektiert.
     */
    private selectCategoryMismatchRows(
        tablePrefix: '' | 'hc_',
    ): Array<{ target: string; prop: string; source: string }> {
        const db = this.getDB();
        const props = Array.from(VaultHealthService.CATEGORY_PROPERTIES);
        const placeholders = props.map(() => '?').join(',');
        const result = db.exec(
            `SELECT DISTINCT target_path, property_name, source_path
             FROM ${tablePrefix}edges
             WHERE link_type = 'frontmatter'
               AND property_name IN (${placeholders})
               AND NOT EXISTS (
                   SELECT 1 FROM dismissed_health_findings d
                   WHERE d.check_type = 'category_mismatch'
                     AND d.path = target_path
               )
             ORDER BY target_path, property_name, source_path`,
            props,
        );
        if (result.length === 0) return [];
        return result[0].values.map((row) => ({
            target: row[0] as string,
            prop: row[1] as string,
            source: row[2] as string,
        }));
    }

    private checkCategoryMismatch(db: SqlJsDatabase, categoryProperty: string): void {
        void db;
        const rows = this.selectCategoryMismatchRows('hc_');
        if (rows.length === 0) return;

        const edgesByTarget = new Map<string, { property: string; source: string }[]>();
        for (const r of rows) {
            const list = edgesByTarget.get(r.target) ?? [];
            list.push({ property: r.prop, source: r.source });
            edgesByTarget.set(r.target, list);
        }

        for (const [targetPath, edges] of edgesByTarget) {
            const file = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(file instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(file);
            const category = this.getNoteCategory(cache, categoryProperty);
            if (!category) continue;

            const expectedProperty = VaultHealthService.STRICT_CATEGORY_TO_PROPERTY[category];
            if (!expectedProperty) continue;

            const mismatched = edges.filter(e => e.property !== expectedProperty);
            if (mismatched.length === 0) continue;

            const byProp = new Map<string, string[]>();
            for (const m of mismatched) {
                const list = byProp.get(m.property) ?? [];
                list.push(m.source);
                byProp.set(m.property, list);
            }

            for (const [wrongProp, sources] of byProp) {
                this.findings.push({
                    check: 'category_mismatch',
                    severity: 'medium',
                    // FIX-19-01-19: KEINE Kappung mehr. Seit die Auswahl
                    // den Plan bindet, ist paths die Autorisierungsmenge --
                    // eine auf 5 gekappte Liste hat bei einem Befund ueber
                    // 23 Quellen 18 davon still aus dem Plan geworfen,
                    // obwohl der Nutzer den Befund approved hatte. Die
                    // Anzeige kuerzt weiterhin (Modal), die Daten nicht.
                    paths: [targetPath, ...sources],
                    description: `[[${targetPath}]] has Kategorie "${category}" but is referenced via "${wrongProp}" (should be "${expectedProperty}") in ${sources.length} note(s)`,
                });
            }
        }
    }

    // -----------------------------------------------------------------------
    // Batch fix operations (run in code, no LLM calls)
    // -----------------------------------------------------------------------

    /**
     * ADR-164: EINE Quelle fuer die Kategorie-Zuordnung. Vorher hielten
     * checkCategoryMismatch und computeCategoryMismatchFixes je eigene
     * Kopien dieser Konstanten -- die Duplikat-Klasse, aus der die
     * Check/Repair-Drift entsteht.
     */
    private static readonly STRICT_CATEGORY_TO_PROPERTY: Record<string, string> = {
        'Thema': 'Themen', 'Konzept': 'Konzepte',
        'Topic': 'Topics', 'Concept': 'Concepts',
    };
    private static readonly CATEGORY_PROPERTIES = new Set(['Themen', 'Konzepte', 'Topics', 'Concepts']);

    // FEAT-19-04-01 W2c: Schwelle, oberhalb derer ein Hub NICHT mehr als
    // missing_backlinks gefuehrt wird (Filter 3 in computeMissingBacklinkTargets).
    // Frueher war das die Grenze zum .base-Zweig; die .base-Automatik ist
    // abgeschaltet, die Reziprozitaet grosser Hubs traegt der Rueckverweis-Block.
    private static readonly MAX_FRONTMATTER_BACKLINKS = 10;

    /**
     * FEAT-19-04-01 W2c: sibling .base path for a hub note
     * ("Notes/T.md" -> "Notes/T-Backlinks.base"). Nur noch fuer Filter 1
     * (Alt-.base-Existenz) gebraucht, solange die 144 Alt-.base im Vault
     * liegen. Faellt mit 2d als toter Code weg.
     */
    private backlinksBasePathFor(target: string): string {
        const targetBaseName = target.replace(/\.md$/, '').split('/').pop() ?? '';
        const baseFileName = `${targetBaseName}-Backlinks.base`;
        const targetDir = target.includes('/') ? target.split('/').slice(0, -1).join('/') : '';
        return targetDir ? `${targetDir}/${baseFileName}` : baseFileName;
    }

    /**
     * Target selection for fixMissingBacklinks, extracted so the plan
     * (FEAT-44-02b approval scope) and the repair iterate the SAME set. Pure
     * reads: SQL + metadata cache, no mutation.
     *
     * FIX-19-01-08: SQL aligned with checkMissingBacklinks. Both the outer
     * edge and the searched-for reverse edge are pinned to
     * backlinksProperty. The previous query iterated EVERY one-sided
     * frontmatter edge regardless of property (incl. Themen / Konzepte /
     * Personen / ...), which mutated ~130 hub notes per run even though
     * checkMissingBacklinks only surfaces a handful of findings under the
     * configured property. The useBase branch's `fm['Notizen'] = null` (now
     * removed) was destructive, so the wider iteration corrupted reverse
     * edges across the entire graph. Single source of truth now: the repair
     * touches the same edges that checkMissingBacklinks reports.
     *
     * FIX-19-01-09: also exclude targets that the user (or FIX-19-01-06's
     * auto-dismiss) already marked as dismissed for missing_backlinks.
     * Without this filter the repair loop re-iterates YAML-broken targets
     * every run, processFrontMatter throws YAMLParseError every run, and
     * the result modal re-renders the "X notes have broken YAML" section
     * for the exact same notes again and again.
     */
    private computeMissingBacklinkTargets(
        backlinksProperty: string,
        categoryProperty: string,
        reciprocalProperties: ReadonlyArray<readonly [string, string]>,
        tablePrefix: '' | 'hc_' = '',
    ): Map<string, { sources: string[]; properties: Set<string> }> {
        const db = this.getDB();
        // ADR-164: DAS Praedikat der Klasse missing_backlinks. Drei Consumer:
        // checkMissingBacklinks (tablePrefix 'hc_', Snapshot), planRepairTargets
        // und verifyRepairTargets (live). Reziprok-Expansion und Dismiss-Filter
        // leben hier und nur hier.
        // FIX-19-02-30: der Rueck-Link zaehlt im GRAPHEN, nicht in einer
        // bestimmten Property.
        //
        // Vorher akzeptierte das Praedikat den Gegen-Link nur, wenn er unter
        // backlinksProperty (oder einem explizit konfigurierten reziproken
        // Paar) UND als link_type='frontmatter' stand. Ein sachlich
        // richtiger resource:-Rueckverweis oder ein Inline-Link im
        // Fliesstext galt als "verlinkt nicht zurueck". Der Repair schrieb
        // daraufhin [[X]] zusaetzlich in related -- obwohl X schon in
        // resource stand -- und erzeugte ein Duplikat (live an 8 Notizen).
        //
        // Neue Regel: existiert IRGENDEINE Kante von target zurueck auf
        // source (jede Property, auch body), ist die Beziehung reziprok.
        // reciprocalProperties wird damit fuer diese Klasse bedeutungslos
        // und bleibt nur aus Signatur-Kompatibilitaet erhalten.
        void reciprocalProperties;
        const tp = tablePrefix;
        const result = db.exec(
            `SELECT e1.target_path, e1.source_path, e1.property_name
             FROM ${tp}edges e1
             WHERE e1.link_type = 'frontmatter'
               AND e1.target_path LIKE '%.md'
               AND e1.source_path LIKE '%.md'
               AND e1.property_name = ?
               AND NOT EXISTS (
                   SELECT 1 FROM ${tp}edges e2
                   WHERE e2.source_path = e1.target_path
                     AND e2.target_path = e1.source_path
               )
               AND NOT EXISTS (
                   SELECT 1 FROM dismissed_health_findings d
                   WHERE d.check_type = 'missing_backlinks'
                     AND d.path = e1.target_path
               )
             ORDER BY e1.target_path, e1.source_path`,
            [backlinksProperty],
        );

        const missingByTarget = new Map<string, { sources: string[]; properties: Set<string> }>();
        if (result.length === 0 || result[0].values.length === 0) {
            return missingByTarget;
        }

        // Group by target entity
        for (const row of result[0].values) {
            const target = row[0] as string;
            const source = row[1] as string;
            const prop = row[2] as string;
            const existing = missingByTarget.get(target) ?? { sources: [], properties: new Set() };
            existing.sources.push(source);
            existing.properties.add(prop);
            missingByTarget.set(target, existing);
        }

        // FIX-19-01-08: Mirror checkMissingBacklinks's pre-filters so the
        // repair loop iterates the exact same target set the user sees in
        // the findings.
        //
        // Filter 1: drop targets whose sibling Base file exists. The Base
        // is dynamic and covers backlinks for free.
        //
        // FEAT-19-04-01 W2c/2d: die .base-AUTOMATIK ist abgeschaltet und die
        // Alt-.base sind aufgeraeumt -- der Repair legt also keine .base mehr
        // an. Filter 1 bleibt trotzdem, aber mit gedrehter Bedeutung: er
        // respektiert eine vom NUTZER von Hand behaltene/gepflegte .base
        // (z.B. Mobilfunk-Backlinks.base mit custom sort/columnSize). Solange
        // der Nutzer so eine .base fuehrt, ist der Hub bewusst per .base
        // abgedeckt und soll nicht als missing_backlinks feuern. Kein toter
        // Code, sondern der "manuelle .base"-Sonderfall.
        for (const [target] of missingByTarget) {
            if (this.app.vault.getAbstractFileByPath(this.backlinksBasePathFor(target))) {
                missingByTarget.delete(target);
            }
        }

        // Filter 2: only structural entities need backlinks
        // (Thema/Konzept/Person/Projekt). Content notes (Quelle, Notiz,
        // Zettel, ...) are sources, not hubs.
        // FIX-19-02-05: Vergleich case-insensitiv und getrimmt. Der Vault
        // fuehrt 'quelle' neben 'Quelle' und 'thema' neben 'Thema'; der
        // exakte Vergleich verwarf die kleingeschriebenen Varianten
        // stillschweigend als "nicht strukturell". Gemessen an der echten
        // DB fielen so 91 von 93 missing_backlinks-Zielen weg.
        // FIX-19-09-01: deckungsgleich mit HUB_TYPES (hubTypeThreshold.ts).
        // Beide Mengen muessen synchron bleiben: was hier als struktureller Hub
        // gilt, bekommt dort Threshold 1. 'organisation' 2026-07-21 ergaenzt.
        const structuralCategories = new Set([
            'thema', 'konzept', 'person', 'projekt',
            'topic', 'concept', 'project',
            'organisation', 'organization',
        ]);
        for (const [target, data] of missingByTarget) {
            const file = this.app.vault.getAbstractFileByPath(target);
            if (!(file instanceof TFile)) { missingByTarget.delete(target); continue; }
            const cache = this.app.metadataCache.getFileCache(file);
            const category = this.getNoteCategory(cache, categoryProperty);
            if (category && !structuralCategories.has(category.trim().toLowerCase())) {
                missingByTarget.delete(target);
                continue;
            }

            // FEAT-19-04-01 W2c: Filter 3 -- genuine Overload-Hubs
            // ausschliessen. Die .base-Automatik ist abgeschaltet; frueher
            // legte der useBase-Zweig fuer Ziele mit
            // > MAX_FRONTMATTER_BACKLINKS Quellen eine .base an, statt
            // hunderte Eintraege ins Frontmatter zu schreiben. Ohne .base
            // waere der Repair fuer diese Menge ein No-op -- also gehoert
            // sie nicht mehr in die Finding-Menge.
            //
            // NUR die Anzahl entscheidet, NICHT die Kategorie: ein kleiner
            // Thema/Konzept-Hub (<= MAX Quellen) bekommt weiter den
            // gedeckelten Frontmatter-Rueck-Link (kein Overload, Reziprozitaet
            // bleibt erhalten). Das haelt die Parity-Zusage (ein einseitig
            // verlinktes Thema IST ein Finding) und deckt sich mit der
            // count-basierten Hub-Definition des Rueckverweis-Blocks
            // (isHubNote). Die Reziprozitaet grosser Hubs uebernimmt der
            // Block (echte [[Wikilinks]] im Body -> body-Kante -> reziprok).
            //
            // ADR-164: Der Ausschluss gehoert ins PRAEDIKAT, nicht in den
            // Repair-Zweig. Wuerde der Check die Ziele weiter melden und der
            // Repair sie nur als No-op behandeln, entstuende die "Repair tat
            // nichts"-Optik (FIX-19-01-06), und die Korrektheit haenge am
            // optionalen, asynchronen Block-Feature (abschaltbar, eigene
            // Schwelle, laeuft nach dem Check, nicht im Repair). Als
            // Praedikat-Ausschluss ist die Aussage self-contained: ein
            // grosser struktureller Hub ist ein legitimer Senke-Knoten,
            // kein Defekt.
            if (data.sources.length > VaultHealthService.MAX_FRONTMATTER_BACKLINKS) {
                missingByTarget.delete(target);
            }
        }

        return missingByTarget;
    }

    /**
     * FEAT-44-02b / FIX-44-13b: the file paths a repair action WOULD touch,
     * computed without touching them. The approval gate presents this as the
     * operation's scope; the repair shares the same selection code (pinned
     * by parity tests), and FIX-44-56 additionally pins it against STATE
     * drift: the Pipeline passes the approved plan back as the fix methods'
     * targetFilter, so files that drifted into the selection while the card
     * was open are skipped, not silently written.
     *
     * Per-note diffs are deliberately NOT computed: the fix methods decide
     * their exact mutation inside processFrontMatter at write time, and a
     * simulated diff that can drift from the write is worse than an honest
     * path list.
     *
     * FEAT-19-04-01 W2c: fix_backlinks plant nur noch .md-Ziele. Grosse Hubs
     * (> MAX_FRONTMATTER_BACKLINKS Quellen) sind gar nicht mehr in der
     * Finding-Menge (Praedikat-Filter 3); die .base-Automatik ist weg.
     */
    planRepairTargets(
        action: 'fix_backlinks' | 'cleanup' | 'fix_categories',
        backlinksProperty = 'Notizen',
        categoryProperty = 'Kategorie',
        reciprocalProperties: ReadonlyArray<readonly [string, string]> = [],
    ): string[] {
        if (action === 'fix_backlinks') {
            // FEAT-19-04-01 W2c: kein .base mehr im Plan. Das Praedikat
            // (computeMissingBacklinkTargets, Filter 3) schliesst Overload-
            // Hubs bereits aus, sodass hier nur noch Ziele ankommen, die den
            // gedeckelten Frontmatter-Rueck-Link bekommen. Der frueher hier
            // angehaengte '<name>-Backlinks.base'-Pfad entfaellt -- die
            // .base-Automatik ist abgeschaltet.
            const targets = this.computeMissingBacklinkTargets(backlinksProperty, categoryProperty, reciprocalProperties);
            const paths: string[] = [];
            for (const [target] of targets) {
                if (!this.mayWrite(target)) continue; // SEC M-2
                paths.push(target);
            }
            return paths;
        }
        if (action === 'cleanup') {
            const paths: string[] = [];
            for (const file of this.app.vault.getMarkdownFiles()) {
                if (!this.mayWrite(file.path)) continue; // SEC M-2
                if (this.evaluateBacklinkCleanup(file, backlinksProperty, categoryProperty) !== null) {
                    paths.push(file.path);
                }
            }
            return paths;
        }
        return [...this.computeCategoryMismatchFixes(categoryProperty).keys()].filter((p) => this.mayWrite(p));
    }

    /**
     * ADR-166: vom Plugin injizierter Extraktions-Zugang (Muster
     * vectorStore). Nur extractFile wird gebraucht; der schmale Typ haelt
     * Tests und Kopplung klein.
     *
     * FEAT-19-04-01 W3: extractFile ist async (selektiver Datei-Read fuer die
     * Block-Kanten-Klassifikation), der applyAndVerify-Pfad awaitet es.
     */
    graphExtractor: { extractFile(file: TFile): Promise<void> } | null = null;

    /**
     * ADR-166: wartet event-basiert auf den metadataCache-Reparse GENAU
     * der uebergebenen Pfade. Kein pauschales Timeout als Erfolg: was bis
     * zum Limit nicht gemeldet wurde, kommt als timedOut zurueck und wird
     * vom Aufrufer sichtbar gemacht.
     */
    private waitForCacheReparse(paths: readonly string[], timeoutMs: number): Promise<string[]> {
        // FIX-19-01-17: nur Markdown-Dateien senden ein metadataCache-
        // 'changed'-Event. Ein .md-Filter ist trotzdem noetig: der Plan kann
        // Nicht-.md-Pfade enthalten (historisch die .base-Geschwister, heute
        // z.B. kuenftige Nicht-Markdown-Ziele), die nie ein 'changed'-Event
        // senden. Ohne Filter liefe der Lauf garantiert in den vollen Timeout
        // und meldete danach ALLE Pfade als "failed", obwohl die Reparatur
        // erfolgreich war -- die Ursache fuer "0 von N verifiziert behoben".
        const pending = new Set(paths.filter((p) => p.endsWith('.md')));
        if (pending.size === 0) return Promise.resolve([]);
        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this.app.metadataCache.offref(ref);
                window.clearTimeout(timer);
                resolve(Array.from(pending).sort());
            };
            const ref = this.app.metadataCache.on('changed', (file: TFile) => {
                pending.delete(file.path);
                if (pending.size === 0) finish();
            });
            const timer = window.setTimeout(finish, timeoutMs);
        });
    }

    /**
     * ADR-166: DIE Sequenz fuer jeden Health-Schreibpfad.
     * schreiben -> auf Reparse der geschriebenen Pfade warten ->
     * genau diese Pfade extrahieren -> Praedikat verifizieren.
     * Alle drei bisherigen Varianten (3s/2s-Timeouts im Sammel-Repair,
     * kein Warten im Orphan-Flow, Cleanup vor dem Settle) laufen ueber
     * diesen einen Helper.
     */
    async applyAndVerify(
        paths: readonly string[],
        write: () => Promise<void>,
        verify: () => string[],
        opts?: { reparseTimeoutMs?: number },
    ): Promise<{ stillFiring: string[]; timedOutPaths: string[] }> {
        const timeoutMs = opts?.reparseTimeoutMs ?? 10000;
        const waiter = this.waitForCacheReparse(paths, timeoutMs);
        await write();
        const timedOutPaths = await waiter;

        const extractor = this.graphExtractor;
        if (extractor) {
            for (const p of paths) {
                const file = this.app.vault.getAbstractFileByPath(p);
                // FEAT-19-04-01 W3: awaiten -- extractFile ist async
                // (selektiver Read fuer die Block-Kanten). Die Kanten muessen
                // in der DB stehen, BEVOR verify() das Praedikat auswertet.
                if (file instanceof TFile) await extractor.extractFile(file);
            }
        }
        return { stillFiring: verify(), timedOutPaths };
    }

    /**
     * ADR-164: dritter Consumer des Praedikats. Liefert die Teilmenge der
     * uebergebenen Pfade, fuer die das Praedikat NOCH feuert (live-Tabellen,
     * also nach Extraktion aufrufen). Leer = alle Ziele verifiziert gefixt.
     * W3 baut den Ergebnis-Screen auf diesem Delta auf.
     */
    verifyRepairTargets(
        action: 'fix_backlinks' | 'cleanup' | 'fix_categories',
        paths: readonly string[],
        opts: {
            backlinksProperty: string;
            categoryProperty: string;
            reciprocalProperties: ReadonlyArray<readonly [string, string]>;
        },
    ): string[] {
        const still = new Set(
            this.planRepairTargets(action, opts.backlinksProperty, opts.categoryProperty, opts.reciprocalProperties),
        );
        return paths.filter((p) => still.has(p));
    }

    /** ADR-164: Verify fuer weak_clusters (paarweise, live-Tabellen). */
    verifyWeakClusterPairs(
        pairs: ReadonlyArray<{ a: string; b: string }>,
    ): Array<{ a: string; b: string }> {
        const candidates = this.selectWeakClusterCandidates('', 10000);
        const open = new Set(candidates.map((c) => `${c.source}\u0000${c.target}`));
        return pairs.filter(({ a, b }) =>
            open.has(`${a}\u0000${b}`) || open.has(`${b}\u0000${a}`),
        ).map(({ a, b }) => ({ a, b }));
    }

    /**
     * Per-file decision of cleanupInvalidBacklinks, extracted so plan and
     * repair share it. Pure reads (metadata cache + link resolution); the
     * write itself stays in cleanupInvalidBacklinks. Returns null when the
     * file needs no change.
     */
    private evaluateBacklinkCleanup(
        file: TFile,
        backlinksProperty: string,
        categoryProperty: string,
    ): { clearAll: true } | { clearAll: false; validLinks: string[]; removed: number } | null {
        void categoryProperty;
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return null;

        const existing = cache.frontmatter[backlinksProperty];
        if (!existing || (Array.isArray(existing) && existing.length === 0)) return null;

        // FIX-19-01-16: der Cleanup entfernt nur noch objektiven Muell.
        //
        // Live-Vorfall 2026-07-19: 201 Wikilinks auf noch nicht angelegte
        // Notizen wurden geloescht ([[Miles Gibson]], [[Birgitta
        // Boeckeler]], ...). Ein unaufgeloester Wikilink ist in Obsidian
        // kein Defekt, sondern ein erstklassiger Zustand: er markiert eine
        // Notiz, die noch fehlt, und erscheint in der Graph-Ansicht als
        // offener Knoten. Ihn zu loeschen vernichtet die Absicht des
        // Nutzers, nicht seinen Muell.
        //
        // Ebenfalls entfernt: die Existenzpruefung gegen .md/.canvas.
        // Verweise auf Anhaenge (PDF, Bild, Office) sind legitim.
        //
        // Und der clearAll-Zweig ist weg: er leerte bei Thema/Konzept die
        // GANZE Property mit der Begruendung, eine Base uebernehme das.
        // Eine Massenloeschung auf Verdacht ist keine Reparatur; wer die
        // Base nutzt, braucht die Property nicht geleert zu bekommen.
        const items: string[] = Array.isArray(existing) ? existing.map(String) : [String(existing)];
        if (items.length === 0) return null;

        // FIX-19-02-10: geteilte Regel. Diese Seite entscheidet nur, OB die
        // Datei in den Plan gehoert; was genau geschrieben wird, entscheidet
        // die Schreib-Seite noch einmal auf dem Live-Frontmatter.
        const { kept, removed } = dedupeBacklinkEntries(items);
        if (removed === 0) return null;
        return { clearAll: false, validLinks: kept, removed };
    }

    /**
     * Source-note selection for fixCategoryMismatches, extracted so plan and
     * repair share it. Pure reads: SQL + metadata cache.
     */
    private computeCategoryMismatchFixes(
        categoryProperty = 'Kategorie',
    ): Map<string, { targetPath: string; wrongProp: string; rightProp: string }[]> {
        const fixesBySource = new Map<string, { targetPath: string; wrongProp: string; rightProp: string }[]>();
        // ADR-164: gleiche Selektion wie der Check (selectCategoryMismatchRows),
        // gleiche Konstanten, gleiches categoryProperty. Nur die Gruppierung
        // unterscheidet sich (Repair schreibt in die QUELLE).
        const rows = this.selectCategoryMismatchRows('');
        if (rows.length === 0) return fixesBySource;

        for (const row of rows) {
            const targetPath = row.target;
            const prop = row.prop;
            const sourcePath = row.source;

            const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(targetFile instanceof TFile)) continue;
            const cache = this.app.metadataCache.getFileCache(targetFile);
            const category = this.getNoteCategory(cache, categoryProperty);
            if (!category) continue;

            const expectedProp = VaultHealthService.STRICT_CATEGORY_TO_PROPERTY[category];
            if (!expectedProp) continue;
            if (prop === expectedProp) continue; // Correct -- no fix needed

            // FIX-19-02-03: den VOLLEN Pfad durchreichen. Der Basename
            // allein liess gleichnamige Notizen aus verschiedenen Ordnern
            // verschmelzen.
            const fixes = fixesBySource.get(sourcePath) ?? [];
            fixes.push({ targetPath, wrongProp: prop, rightProp: expectedProp });
            fixesBySource.set(sourcePath, fixes);
        }

        return fixesBySource;
    }

    /**
     * Fix missing backlinks in batch. For each entity that is referenced via MOC
     * properties but doesn't link back, adds the source notes to the entity's
     * "Notizen" (or equivalent) frontmatter property.
     *
     * Runs entirely in code -- 0 LLM tokens. Uses Obsidian's processFrontMatter
     * which is atomic and preserves existing frontmatter.
     *
     * @returns Number of entities updated and total backlinks added
     */
    /**
     * Fix missing backlinks using a two-tier strategy:
     *
     * - **Thema/Konzept notes**: Create an embedded Base (.base file) that dynamically
     *   shows all notes linking to this entity. No frontmatter changes needed.
     * - **Other categories (Person, Projekt, etc.)**: Add backlinks to frontmatter,
     *   but only up to MAX_FRONTMATTER_BACKLINKS. If exceeded, create a Base instead.
     *
     * This avoids overloading hub notes with hundreds of frontmatter entries.
     *
     * FIX-44-56: `targetFilter` pins the repair to the plan the approval gate
     * showed. The selection code is shared with planRepairTargets, but only
     * for IDENTICAL vault state -- while the card is open the state can drift
     * (user edits, metadata-cache refresh, a concurrent task). With a filter,
     * a target (or a derived .base file) that was not on the approved list is
     * skipped instead of silently written. Callers with their own consent
     * surface (the repair modal) omit it and keep the full selection.
     */
    async fixMissingBacklinks(
        backlinksProperty: string,
        categoryProperty: string,
        reciprocalProperties: ReadonlyArray<readonly [string, string]>,
        // ADR-165: Pflicht. Jeder Mass-Write ist an eine approvte Zielliste
        // gebunden; ein Aufruf ohne Bindung ist ein Compile-Fehler.
        targetFilter: ReadonlySet<string>,
    ): Promise<{
        entitiesFixed: number;
        linksAdded: number;
        yamlErrorPaths: string[];
    }> {
        // FEAT-19-04-01 W2c: basesCreated / entitiesWithExistingBase entfernt.
        // Die .base-Automatik ist weg, beide waren strukturell immer 0.
        const db = this.getDB();
        let entitiesFixed = 0;
        let linksAdded = 0;
        const yamlErrorPaths: string[] = [];

        const missingByTarget = this.computeMissingBacklinkTargets(backlinksProperty, categoryProperty, reciprocalProperties);
        if (missingByTarget.size === 0) {
            return { entitiesFixed: 0, linksAdded: 0, yamlErrorPaths: [] };
        }

        for (const [targetPath, { sources }] of missingByTarget) {
            if (this.cancelled) break;

            // FIX-44-56: skip targets outside the approved plan (state drift
            // between gate and repair).
            if (targetFilter !== undefined && !targetFilter.has(targetPath)) continue;

            const file = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(file instanceof TFile)) continue;

            try {
                // FEAT-19-04-01 W2c: nur noch der Frontmatter-Rueck-Link. Der
                // fruehere useBase-Zweig (ensureBacklinksBase) ist entfernt --
                // die .base-Automatik ist abgeschaltet. Das Praedikat
                // (computeMissingBacklinkTargets, Filter 3) schliesst
                // Overload-Hubs (> MAX_FRONTMATTER_BACKLINKS Quellen) bereits
                // aus, sodass hier nur Ziele ankommen, fuer die eine kleine
                // Zahl Frontmatter-Eintraege angemessen ist. Die
                // Reziprozitaet grosser Hubs uebernimmt der selbstbildende
                // Rueckverweis-Block.
                await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                    const existing = fm[backlinksProperty];
                    const currentLinks: string[] = Array.isArray(existing)
                        ? existing.map(String)
                        : (typeof existing === 'string' && existing.trim()) ? [existing] : [];

                    // FIX-19-01-01: strip aliases (`[[Foo|Bar]]`) and
                    // path-segments so a wikilink like `[[Notes/A|A]]`
                    // matches both the bare name `A` and the full
                    // path `Notes/A.md`. The previous dedup only
                    // stripped the brackets, which let the same edge
                    // get written twice as `[[Source]]` next to an
                    // existing `[[Source|Alias]]`.
                    // FIX-19-01-19: zweite Dedupe-Stelle, gleiche Regel
                    // wie in insertBacklink -- der Segment-Vergleich gilt
                    // nur fuer PFADLOSE Eintraege. Vorher blockierte ein
                    // vorhandenes [[Archiv/Meeting]] den neuen Link
                    // [[Notes/Meeting]] und der Repair schrieb nichts.
                    // FIX-19-02-12: geteilter Index MIT Aufloesung
                    // pfadloser Eintraege (siehe buildLinkIndex).
                    const index = buildLinkIndex(
                        currentLinks,
                        (text) => this.app.metadataCache
                            .getFirstLinkpathDest(text, file.path)?.path ?? null,
                    );

                    let added = 0;
                    for (const sourcePath of sources) {
                        if (linkIndexHas(index, sourcePath)) continue;
                        const sourceNormalized = sourcePath.replace(/\.md$/, '');
                        currentLinks.push(`[[${sourceNormalized}]]`);
                        index.exact.add(sourceNormalized);
                        index.exact.add(sourcePath);
                        added++;
                    }

                    if (added > 0) {
                        fm[backlinksProperty] = currentLinks;
                        linksAdded += added;
                    }
                });
                entitiesFixed++;

                if (entitiesFixed % 10 === 0) {
                    await new Promise<void>(r => window.setTimeout(r, 0));
                }
            } catch (e) {
                console.warn(`[VaultHealth] Failed to fix backlinks for ${targetPath}:`, e);
                // FIX-19-01-06: track YAML errors explicitly so the
                // result screen surfaces them. Most "the repair did
                // nothing" reports trace back to user notes with
                // broken frontmatter that processFrontMatter cannot
                // touch.
                //
                // FIX-19-01-09: robust YAMLParseError detection.
                // Previous predicate used case-sensitive substring
                // matches that missed "Implicit map keys need to be
                // followed by map values" (because 'Map keys' has
                // capital M while the message is lowercase). Two
                // user notes (Differenzierung..., Udemy Agent
                // Course) leaked past the auto-dismiss every run.
                // The constructor-name check is the canonical YAML
                // lib signal; the lowercase substrings cover any
                // future message variants without regressions.
                const errName = (e as { constructor?: { name?: string } })?.constructor?.name ?? '';
                const msg = e instanceof Error ? e.message : String(e);
                const lower = msg.toLowerCase();
                const isYamlError = errName === 'YAMLParseError'
                    || errName === 'YAMLWarning'
                    || lower.includes('yaml')
                    || lower.includes('map keys')
                    || lower.includes('map values')
                    || lower.includes('seq-item-ind')
                    || lower.includes('flow-map-end')
                    || lower.includes('unexpected scalar')
                    || lower.includes('block scalar');
                if (isYamlError) {
                    yamlErrorPaths.push(targetPath);
                }
            }
        }

        // FIX-19-01-06: auto-dismiss YAML-broken notes so they do not
        // re-appear as auto-fixable missing_backlinks on every run.
        // The user must fix the YAML manually; until then we should
        // not propose a repair that we know will fail.
        //
        // FIX-19-01-09: only surface NEWLY dismissed paths to the
        // modal. Otherwise the user sees the same "X notes have
        // broken YAML" list every Apply click and reads it as
        // "nothing happened, same notes still broken". Pre-existing
        // dismissals stay silent in the modal but the SQL filter
        // above already keeps them out of the iteration anyway.
        let yamlErrorPathsForModal: string[] = [];
        if (yamlErrorPaths.length > 0) {
            const alreadyDismissed = new Set<string>();
            try {
                const checkRows = db.exec(
                    `SELECT path FROM dismissed_health_findings
                     WHERE check_type = 'missing_backlinks'`,
                );
                if (checkRows.length > 0) {
                    for (const r of checkRows[0].values) {
                        alreadyDismissed.add(String(r[0]));
                    }
                }
            } catch { /* non-fatal */ }
            yamlErrorPathsForModal = yamlErrorPaths.filter(p => !alreadyDismissed.has(p));

            let dismissedCount = 0;
            try {
                for (const p of yamlErrorPaths) {
                    db.run(
                        `INSERT OR REPLACE INTO dismissed_health_findings (check_type, path, dismissed_at)
                         VALUES ('missing_backlinks', ?, ?)`,
                        [p, new Date().toISOString()],
                    );
                    dismissedCount++;
                }
                this.knowledgeDB.markDirty();
                console.warn(`[VaultHealth] FIX-19-01-06: auto-dismissed ${dismissedCount} missing_backlinks findings for YAML-broken notes (${yamlErrorPathsForModal.length} new this run):`, yamlErrorPaths);
            } catch (e) {
                console.warn(`[VaultHealth] FIX-19-01-06: failed to auto-dismiss after ${dismissedCount}/${yamlErrorPaths.length} paths`, e);
            }
        }

        console.warn(`[VaultHealth] fixMissingBacklinks summary: ${entitiesFixed} entities iterated, ${linksAdded} frontmatter links written, ${yamlErrorPaths.length} skipped (YAML error), ${yamlErrorPathsForModal.length} new YAML dismissals`);
        return { entitiesFixed, linksAdded, yamlErrorPaths: yamlErrorPathsForModal };
    }

    /**
     * Clean up invalid backlinks from frontmatter Notizen properties.
     * Removes links that:
     * - Point to non-.md files (PDFs, images, external URLs)
     * - Point to notes that don't exist in the vault
     * - Are duplicates
     *
     * Also clears Notizen property for Thema/Konzept notes (Bases handle those).
     */
    async cleanupInvalidBacklinks(
        backlinksProperty: string,
        categoryProperty: string,
        // ADR-165: Pflicht, siehe fixMissingBacklinks.
        targetFilter: ReadonlySet<string>,
    ): Promise<{ notesProcessed: number; linksRemoved: number }> {
        let notesProcessed = 0;
        let linksRemoved = 0;

        const allFiles = this.app.vault.getMarkdownFiles();

        for (const file of allFiles) {
            if (this.cancelled) break;

            // FIX-44-56: only rewrite notes the approval gate showed.
            if (targetFilter !== undefined && !targetFilter.has(file.path)) continue;

            // FEAT-44-02b: the per-file decision is shared with
            // planRepairTargets, so the approval scope and the repair walk
            // the same selection. Only the write stays here.
            const decision = this.evaluateBacklinkCleanup(file, backlinksProperty, categoryProperty);
            if (decision === null) continue;

            // FIX-19-02-10: die Entscheidung oben stammt aus dem
            // metadataCache und dient nur der Vorauswahl. Geschrieben wird
            // gegen das LIVE-Frontmatter, sonst kassiert dieser Schritt die
            // Backlinks, die Stufe A im selben Lauf gerade geschrieben hat
            // und die der Cache noch nicht kennt.
            let removedHere = 0;
            await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
                const live = fm[backlinksProperty];
                if (!Array.isArray(live) || live.length === 0) return;
                const { kept, removed } = dedupeBacklinkEntries(live);
                if (removed === 0) return;
                fm[backlinksProperty] = kept.length > 0 ? kept : null;
                removedHere = removed;
            });
            if (removedHere === 0) continue;
            linksRemoved += removedHere;
            notesProcessed++;

            if (notesProcessed % 20 === 0) {
                await new Promise<void>(r => window.setTimeout(r, 0));
            }
        }

        console.debug(`[VaultHealth] cleanupInvalidBacklinks: ${notesProcessed} notes, ${linksRemoved} links removed`);
        return { notesProcessed, linksRemoved };
    }

    /**
     * Fix category mismatches: move values from wrong property to correct one.
     * E.g., if "Agentic AI" has Kategorie "Thema" but a note has it in
     * Konzepte: [[Agentic AI]], move it to Themen: [[Agentic AI]].
     */
    async fixCategoryMismatches(
        categoryProperty: string,
        // ADR-165: Pflicht, siehe fixMissingBacklinks.
        targetFilter: ReadonlySet<string>,
    ): Promise<{ notesFixed: number; valuesMovied: number }> {
        let notesFixed = 0;
        let valuesMovied = 0;

        // FEAT-44-02b: selection shared with planRepairTargets so the
        // approval scope and the repair walk the same source notes.
        const fixesBySource = this.computeCategoryMismatchFixes(categoryProperty);
        if (fixesBySource.size === 0) {
            return { notesFixed: 0, valuesMovied: 0 };
        }

        // Apply fixes
        for (const [sourcePath, fixes] of fixesBySource) {
            if (this.cancelled) break;

            // FIX-44-56: only rewrite source notes the approval gate showed.
            if (targetFilter !== undefined && !targetFilter.has(sourcePath)) continue;
            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
            if (!(sourceFile instanceof TFile)) continue;

            // FIX-19-02-03: erst fragen, dann anfassen. processFrontMatter
            // serialisiert das Frontmatter auch dann neu, wenn der Callback
            // nichts aendert -- das setzt mtime, weckt Obsidian Sync und
            // macht aus einem No-op eine sichtbare Dateiaenderung.
            const preCache = this.app.metadataCache.getFileCache(sourceFile);
            const preFm = (preCache?.frontmatter ?? {}) as Record<string, unknown>;
            const wouldChange = fixes.some(({ targetPath, wrongProp, rightProp }) => {
                const wrongArr = Array.isArray(preFm[wrongProp]) ? (preFm[wrongProp] as string[]) : [];
                const removes = wrongArr.some((v) => linkEntryMatches(v, targetPath));
                const rightArr = Array.isArray(preFm[rightProp]) ? (preFm[rightProp] as string[]) : [];
                const adds = !linkIndexHas(buildLinkIndex(rightArr), targetPath);
                return removes || adds;
            });
            if (!wouldChange) continue;

            try {
                let changedInThisNote = 0;
                await this.app.fileManager.processFrontMatter(sourceFile, (fm: Record<string, unknown>) => {
                    for (const { targetPath, wrongProp, rightProp } of fixes) {
                        // FIX-19-02-03 (1): NUR anfassen, was es gibt. Vorher
                        // schrieb der Code fm[wrongProp] = null auch in
                        // Notizen, die die Property nie hatten, und erzeugte
                        // so erfundene Leerzeilen im Frontmatter.
                        const hadWrong = Array.isArray(fm[wrongProp]);
                        const wrongArr = hadWrong ? (fm[wrongProp] as string[]) : [];
                        // FIX-19-02-03 (2)+(3): geteilte Vergleichsregel statt
                        // rohem Klammerinhalt. Faengt Alias-Links ab und
                        // verwechselt Archiv/Ziel nicht mehr mit Notes/Ziel.
                        const filtered = wrongArr.filter((v) => !linkEntryMatches(v, targetPath));
                        const removed = wrongArr.length - filtered.length;
                        if (hadWrong && removed > 0) {
                            fm[wrongProp] = filtered.length > 0 ? filtered : null;
                        }

                        const rightArr = Array.isArray(fm[rightProp]) ? (fm[rightProp] as string[]) : [];
                        const added = linkIndexHas(buildLinkIndex(rightArr), targetPath) ? 0 : 1;
                        if (added) {
                            rightArr.push(`[[${targetPath.replace(/\.md$/, '')}]]`);
                            fm[rightProp] = rightArr;
                        }

                        // FIX-19-02-03 (4): nur zaehlen, was wirklich passiert
                        // ist. Der Ergebnis-Screen meldete sonst Verschiebungen,
                        // die es nie gab.
                        if (removed > 0 || added > 0) {
                            valuesMovied++;
                            changedInThisNote++;
                        }
                    }
                });
                if (changedInThisNote === 0) continue;
                notesFixed++;

                if (notesFixed % 10 === 0) {
                    await new Promise<void>(r => window.setTimeout(r, 0));
                }
            } catch (e) {
                console.warn(`[VaultHealth] Failed to fix category mismatch in ${sourcePath}:`, e);
            }
        }

        console.debug(`[VaultHealth] fixCategoryMismatches: ${notesFixed} notes, ${valuesMovied} values moved`);
        return { notesFixed, valuesMovied: valuesMovied };
    }

    /**
     * IMP-19-01-02: move orphan notes (no incoming, no outgoing edges)
     * into a configured target folder. Folder is created if missing.
     * Idempotent: already-relocated notes are skipped.
     *
     * The caller hands in the list of orphan note paths and the target
     * folder; we keep this method ignorant of the rest of the
     * repair-selection state.
     */
    // FIX-19-01-12: moveOrphansToFolder wurde entfernt. Der "Repair" verschob
    // isolierte Orphans nach Inbox/Orphans, ohne einen einzigen eingehenden
    // Link zu erzeugen -- die Note blieb per Definition ein Orphan und wurde
    // beim naechsten Check erneut gemeldet, waehrend echte Nutzer-Notes
    // umsortiert wurden. Der Ersatz erzeugt Verknuepfungen statt Ordner
    // (siehe linkWeakClusters als Vorbild).


    /**
     * IMP-19-01-02: link semantically similar notes (weak_clusters)
     * by inserting a mutual wikilink under the configured backlinks
     * property in BOTH notes. Mirrors the dedup/alias rules of
     * `fixMissingBacklinks`.
     */
    /**
     * Schreibt einen Wikilink auf `otherPath` in die Backlinks-Property von
     * `fileA`, wenn er dort nicht schon (in irgendeiner Schreibweise) steht.
     * Rueckgabe: 1 wenn geschrieben, 0 wenn schon vorhanden.
     *
     * FIX-19-01-12: aus linkWeakClusters hochgezogen, weil der neue
     * Orphan-Verknuepfungs-Fix denselben Schreibpfad braucht -- dort
     * allerdings EINSEITIG (nur die Kandidaten-Note bekommt den Link,
     * denn nur das erzeugt einen EINGEHENDEN Link auf den Orphan).
     */
    /**
     * FIX-19-02-15: wuerde insertBacklink hier tatsaechlich schreiben?
     *
     * Dieselbe Bedingung, dieselbe Quelle (Frontmatter, nicht die
     * edges-Tabelle) und derselbe Index wie der Write -- deshalb koennen
     * Plan und Ausfuehrung nicht auseinanderlaufen (ADR-164-Chokepoint).
     */
    private wouldInsertBacklink(file: TFile, otherPath: string, backlinksProperty: string): boolean {
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const existing = fm?.[backlinksProperty];
        const links: string[] = Array.isArray(existing)
            ? existing.map(String)
            : (typeof existing === 'string' && existing.trim()) ? [existing] : [];
        const index = buildLinkIndex(
            links,
            (text) => this.app.metadataCache.getFirstLinkpathDest(text, file.path)?.path ?? null,
        );
        return !linkIndexHas(index, otherPath);
    }

    /**
     * FIX-19-02-15: die weak-Paare, an denen wirklich etwas zu tun ist.
     *
     * Der Plan uebernahm die Paare bisher roh aus dem Snapshot -- eine
     * Zeile "A <-> B" auch dann, wenn A und B sich laengst gegenseitig
     * verlinken. Der Nutzer gab Schreibvorgaenge frei, die es nicht gab,
     * und las danach "0 links added". Genau die Sorte Zahl, die Vertrauen
     * kostet.
     *
     * Hier sitzt auch der Ignore-Gate fuer diese Aktion, analog zu den drei
     * anderen in planRepairTargets.
     */
    planWeakPairTargets(
        pairs: ReadonlyArray<{ a: string; b: string }>,
        backlinksProperty: string,
    ): Array<{ a: string; b: string }> {
        const out: Array<{ a: string; b: string }> = [];
        for (const { a, b } of pairs) {
            if (!this.mayWrite(a) || !this.mayWrite(b)) continue;
            const fileA = this.app.vault.getAbstractFileByPath(a);
            const fileB = this.app.vault.getAbstractFileByPath(b);
            if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) continue;
            // Ein Paar bleibt, sobald EINE Richtung schreiben wuerde -- der
            // Repair schreibt beide und die andere Seite ist dann ein
            // gezaehlter No-op, kein Fehler.
            if (this.wouldInsertBacklink(fileA, b, backlinksProperty)
                || this.wouldInsertBacklink(fileB, a, backlinksProperty)) {
                out.push({ a, b });
            }
        }
        return out;
    }

    /**
     * FIX-19-02-26: Gegenstueck zu insertBacklink fuer den Rollback einer
     * halb geschriebenen Paar-Verlinkung. Entfernt genau den einen Eintrag,
     * der auf otherPath zeigt, und laesst alles andere unberuehrt.
     */
    private async removeBacklink(
        fileA: TFile,
        otherPath: string,
        backlinksProperty: string,
    ): Promise<void> {
        await this.app.fileManager.processFrontMatter(fileA, (fm: Record<string, unknown>) => {
            const existing = fm[backlinksProperty];
            if (!Array.isArray(existing)) return;
            const kept = existing
                .map(String)
                .filter((entry) => !linkEntryMatches(entry, otherPath));
            if (kept.length === existing.length) return;
            if (kept.length > 0) {
                fm[backlinksProperty] = kept;
            } else {
                // Zuruecknehmen heisst: den Zustand VORHER wiederherstellen.
                // Eine leere Property zurueckzulassen waere eine eigene
                // Aenderung an der Notiz, obwohl der Repair gescheitert ist.
                delete fm[backlinksProperty];
            }
        });
    }

    private async insertBacklink(
        fileA: TFile,
        otherPath: string,
        backlinksProperty: string,
    ): Promise<number> {
        {
            const otherNormalized = otherPath.replace(/\.md$/, '');
            let added = 0;
            await this.app.fileManager.processFrontMatter(fileA, (fm: Record<string, unknown>) => {
                const existing = fm[backlinksProperty];
                const links: string[] = Array.isArray(existing)
                    ? existing.map(String)
                    : (typeof existing === 'string' && existing.trim()) ? [existing] : [];
                // FIX-19-01-19: der Segment-Vergleich gilt nur fuer
                // PFADLOSE Eintraege.
                //
                // Die Heuristik soll [[Meeting]] als Duplikat zu
                // Notes/Meeting.md erkennen. Vorher wurde aber JEDER
                // Eintrag auf sein letztes Segment reduziert, wodurch
                // [[Archiv/Meeting]] den Link [[Notes/Meeting]] blockierte
                // -- zwei verschiedene Notizen, ein stiller No-op. Genau
                // das erzeugte "1 entity iterated, 0 links written": der
                // Repair lief, schrieb nichts, und der Befund kam
                // unveraendert zurueck.
                // FIX-19-02-12: geteilter Index MIT Aufloesung.
                const index = buildLinkIndex(
                    links,
                    (text) => this.app.metadataCache
                        .getFirstLinkpathDest(text, fileA.path)?.path ?? null,
                );
                if (!linkIndexHas(index, otherPath)) {
                    links.push(`[[${otherNormalized}]]`);
                    fm[backlinksProperty] = links;
                    added = 1;
                }
            });
            return added;
        }
    }

    /**
     * FIX-19-01-12 Ersatz fuer den geloeschten Move-Repair: schlaegt fuer jede
     * isolierte Orphan-Note die semantisch naechsten Notes als Verknuepfungs-
     * Quelle vor.
     *
     * Quelle sind die Note-Vektoren, NICHT implicit_edges: dessen Producer
     * kappt bei similarity >= 0.7 und laeuft unter einem 60s-Cap, sodass genau
     * die isolierten Notes dort typischerweise fehlen. Der Orphan-Check
     * selektiert dagegen aus `vectors`, ein gemeldeter Orphan hat also
     * garantiert einen Vektor.
     *
     * Kandidaten sind nie andere Orphans aus derselben Menge (die brauchen
     * selbst einen eingehenden Link) und nie die Note selbst.
     */
    /**
     * SEC H-1: Kandidaten muessen dieselben Ausschluesse respektieren wie der
     * Orphan-CHECK. Der Check filtert Templates, Daily Notes, Attachements und
     * die Nutzer-Prefixes bereits im SQL; die Kandidatenliste zieht dagegen roh
     * aus dem VectorStore. Ohne diesen Filter koennte der Flow einen Backlink
     * in eine TEMPLATE-Datei schreiben, und der landet danach in jeder Notiz,
     * die aus dem Template entsteht. Ausserdem waere es ein Schreibzugriff in
     * genau die Ordner, die der Nutzer explizit ausgenommen hat.
     */
    private isEligibleLinkSource(path: string, excludePathPrefixes: string[]): boolean {
        if (!path.endsWith('.md')) return false;
        if (!this.mayWrite(path)) return false; // SEC M-2
        // Nicht-Datei-Layer aus dem Vektor-Cache (session:, episode:, fact:).
        if (path.includes(':')) return false;
        if (path.includes('Templates')) return false;
        if (path.includes('Daily Notes')) return false;
        if (path.includes('Attachements')) return false;
        return !excludePathPrefixes.some((prefix) => prefix.length > 0 && path.startsWith(prefix));
    }

    proposeOrphanLinks(
        orphanPaths: string[],
        opts?: { topK?: number; minSimilarity?: number; excludePathPrefixes?: string[] },
    ): OrphanLinkProposal[] {
        const topK = opts?.topK ?? 3;
        const minSimilarity = opts?.minSimilarity ?? 0.35;
        const excludePathPrefixes = opts?.excludePathPrefixes ?? [];
        const vs = this.vectorStore;
        if (!vs) return orphanPaths.map((p) => ({ orphanPath: p, candidates: [] }));

        let vectors: Map<string, Float32Array>;
        try {
            vectors = vs.getNoteVectors();
        } catch (e) {
            console.warn('[VaultHealth] proposeOrphanLinks: getNoteVectors failed', e);
            return orphanPaths.map((p) => ({ orphanPath: p, candidates: [] }));
        }

        const orphanSet = new Set(orphanPaths);
        const out: OrphanLinkProposal[] = [];
        for (const orphan of orphanPaths) {
            const own = vectors.get(orphan);
            if (!own) { out.push({ orphanPath: orphan, candidates: [] }); continue; }
            const scored: OrphanLinkCandidate[] = [];
            for (const [path, vec] of vectors) {
                if (path === orphan || orphanSet.has(path)) continue;
                if (!this.isEligibleLinkSource(path, excludePathPrefixes)) continue;
                const similarity = cosineSimilarity(own, vec);
                if (similarity >= minSimilarity) scored.push({ path, similarity });
            }
            scored.sort((a, b) => b.similarity - a.similarity);
            out.push({ orphanPath: orphan, candidates: scored.slice(0, topK) });
        }
        return out;
    }

    /**
     * FIX-19-01-12: schreibt EINSEITIG einen Wikilink auf die Orphan-Note in
     * die Backlinks-Property der gewaehlten Kandidaten-Note. Nur diese
     * Richtung beendet den Orphan-Status; ein Link IN der Orphan-Note waere
     * ein ausgehender Link und wuerde am Befund nichts aendern (genau der
     * Denkfehler des alten Move-Repairs).
     */
    async linkOrphansFromCandidates(
        pairs: Array<{ orphan: string; candidate: string }>,
        backlinksProperty: string,
        excludePathPrefixes: string[] = [],
    ): Promise<{ orphansLinked: number; linksAdded: number; failedPaths: string[] }> {
        let orphansLinked = 0;
        let linksAdded = 0;
        const failedPaths: string[] = [];

        for (const { orphan, candidate } of pairs) {
            if (this.cancelled) break;
            // SEC H-1: derselbe Filter wie beim Vorschlagen. Ein Aufrufer, der
            // die Paare selbst zusammenstellt, darf den Ausschluss nicht umgehen.
            if (!this.isEligibleLinkSource(candidate, excludePathPrefixes)) {
                failedPaths.push(candidate);
                continue;
            }
            const candidateFile = this.app.vault.getAbstractFileByPath(candidate);
            if (!(candidateFile instanceof TFile)) { failedPaths.push(candidate); continue; }
            try {
                const added = await this.insertBacklink(candidateFile, orphan, backlinksProperty);
                linksAdded += added;
                if (added > 0) orphansLinked++;
            } catch (e) {
                console.warn(`[VaultHealth] linkOrphansFromCandidates: ${candidate} -> ${orphan} failed`, e);
                failedPaths.push(candidate);
            }
        }
        return { orphansLinked, linksAdded, failedPaths };
    }

    async linkWeakClusters(
        pairs: Array<{ a: string; b: string }>,
        backlinksProperty: string,
    ): Promise<{ pairsLinked: number; linksAdded: number; failedPairs: Array<{ a: string; b: string }> }> {
        let pairsLinked = 0;
        let linksAdded = 0;
        // FIX-19-02-26: Paare, bei denen der Schreibvorgang scheiterte.
        // Der Ergebnis-Screen soll sie benennen koennen, statt sie als
        // "nichts passiert" zu verbuchen.
        const failedPairs: Array<{ a: string; b: string }> = [];
        const insertLink = (f: TFile, other: string) => this.insertBacklink(f, other, backlinksProperty);

        for (const { a, b } of pairs) {
            if (this.cancelled) break;
            // FIX-19-02-09: die Ignore-Sperre gilt auch hier.
            //
            // SEC M-2 hatte den Gate in planRepairTargets gezogen, aber
            // link_weak lief daran vorbei: die Paare kamen aus dem
            // Snapshot, nicht aus dem Plan. Der Repair schrieb damit in
            // Notizen, die per .agentignore ausgenommen oder als protected
            // markiert sind, und in Templates. Beide Seiten muessen
            // schreibbar sein -- ein Paar ist eine wechselseitige
            // Verlinkung, halb ausgefuehrt waere sie inkonsistent.
            if (!this.mayWrite(a) || !this.mayWrite(b)) continue;

            const fileA = this.app.vault.getAbstractFileByPath(a);
            const fileB = this.app.vault.getAbstractFileByPath(b);
            if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) continue;

            // FIX-19-02-26: beide Seiten oder keine.
            //
            // Vorher: A wurde geschrieben, B warf (kaputtes YAML), der
            // catch verschluckte es -- und `linksAdded += addedA + addedB`
            // wurde nie erreicht, der Erfolg der A-Seite verschwand also
            // auch aus der Zaehlung. Zurueck blieb: A verlinkt auf B, B
            // nicht auf A. Das IST der Zustand, den weak_clusters als
            // Befund meldet. Der Repair erzeugte ihn neu, meldete nichts,
            // und der naechste Lauf fand ihn wieder -- eine Zahl, die nicht
            // sinkt, weil das Werkzeug gegen sich selbst arbeitet.
            let addedA = 0;
            try {
                addedA = await insertLink(fileA, b);
                const addedB = await insertLink(fileB, a);
                linksAdded += addedA + addedB;
                if (addedA + addedB > 0) pairsLinked++;
            } catch (e) {
                console.warn(`[VaultHealth] linkWeakClusters: pair (${a}, ${b}) failed`, e);
                failedPairs.push({ a, b });
                // Die A-Seite zuruecknehmen, damit kein halbes Paar
                // zurueckbleibt. Schlaegt auch das fehl, ist der Zustand
                // nicht schlechter als vorher, aber der Nutzer erfaehrt es
                // ueber failedPairs.
                if (addedA > 0) {
                    try {
                        await this.removeBacklink(fileA, b, backlinksProperty);
                    } catch (rollbackError) {
                        console.warn(`[VaultHealth] linkWeakClusters: rollback for ${a} failed`, rollbackError);
                    }
                }
            }
            if (pairsLinked % 10 === 0) {
                await new Promise<void>(r => window.setTimeout(r, 0));
            }
        }

        console.debug(`[VaultHealth] linkWeakClusters: ${pairsLinked} pairs linked, ${linksAdded} links added, ${failedPairs.length} failed`);
        return { pairsLinked, linksAdded, failedPairs };
    }

    /** Get the Kategorie value from a note's frontmatter cache. */
    private getNoteCategory(cache: ReturnType<typeof this.app.metadataCache.getFileCache>, categoryProperty: string): string {
        if (!cache?.frontmatter) return '';
        const cat = cache.frontmatter[categoryProperty];
        if (Array.isArray(cat)) return (cat[0] ?? '').toString().trim();
        return (cat ?? '').toString().trim();
    }

    // FEAT-19-04-01 W2c: ensureBacklinksBase / ensureBaseEmbed entfernt. Sie
    // legten die '<name>-Backlinks.base'-Dateien an und betteten sie via
    // '## Verlinkte Notizen'-Abschnitt ein. Die .base-Automatik ist
    // abgeschaltet; den sichtbaren Rueckverweis uebernimmt der selbstbildende
    // Block (incomingLinksMaintainer), die Reziprozitaet dessen Body-Kanten.

    /**
     * Remove edges from/to notes that no longer exist in the vault.
     * This cleans up ghost edges from deleted/trashed notes.
     * Must run inside Obsidian (not external sqlite3) because the DB is in-memory.
     */
    cleanupOrphanedEdges(): { edgesRemoved: number } {
        const db = this.getDB();

        // Get all paths that have vectors (= exist in vault)
        const vectorPaths = new Set<string>();
        // eslint-disable-next-line no-restricted-syntax -- reason: ADR-137 exception, layer guard via domain filter, edges-join needs raw SQL
        const vResult = db.exec('SELECT DISTINCT path FROM vectors WHERE chunk_index = 0');
        if (vResult.length > 0) {
            for (const row of vResult[0].values) {
                vectorPaths.add(row[0] as string);
            }
        }

        // Find and delete edges where source or target is not in vectors
        const edgeResult = db.exec('SELECT DISTINCT source_path FROM edges UNION SELECT DISTINCT target_path FROM edges');
        if (edgeResult.length === 0) return { edgesRemoved: 0 };

        const orphanedPaths = new Set<string>();
        for (const row of edgeResult[0].values) {
            const path = row[0] as string;
            if (!vectorPaths.has(path)) {
                orphanedPaths.add(path);
            }
        }

        let edgesRemoved = 0;
        for (const path of orphanedPaths) {
            const r1 = db.exec('SELECT COUNT(*) FROM edges WHERE source_path = ?', [path]);
            const r2 = db.exec('SELECT COUNT(*) FROM edges WHERE target_path = ?', [path]);
            const count = ((r1[0]?.values[0]?.[0] as number) ?? 0) + ((r2[0]?.values[0]?.[0] as number) ?? 0);
            if (count > 0) {
                db.run('DELETE FROM edges WHERE source_path = ?', [path]);
                db.run('DELETE FROM edges WHERE target_path = ?', [path]);
                edgesRemoved += count;
            }
        }

        if (edgesRemoved > 0) {
            this.knowledgeDB.markDirty();
            console.debug(`[VaultHealth] cleanupOrphanedEdges: ${edgesRemoved} edges from ${orphanedPaths.size} orphaned paths`);
        }

        return { edgesRemoved };
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private getDB(): SqlJsDatabase {
        return this.knowledgeDB.getDB();
    }

    // -----------------------------------------------------------------------
    // BA-25 PLAN-11 Lint-Foundation Checks
    // -----------------------------------------------------------------------

    /**
     * cluster_freshness (FEAT-19-16, ADR-94 + FEAT-19-16 ADR-106 Severity).
     *
     * Pro Cluster: avg-Note-Age aus letzter Modification, Coverage-Drift
     * (Anteil verlinkter Notes ueber Halbwertszeit). Score via
     * FreshnessScorer-Konvention inline berechnet, weil VaultHealthService
     * keine Service-Injection-Pflicht hat (analog zu anderen Checks).
     *
     * Liest cluster_metadata (Halbwertszeit) und ontology (Cluster-Membership).
     * Ohne Cluster-Metadata werden Defaults aus ADR-94 angewendet (180 Tage Tech).
     */
    private checkClusterFreshness(db: SqlJsDatabase): void {
        try {
            // FIX-19-16-06: erst pruefen, ob mtime ueberhaupt ein Signal
            // traegt. Nach einer Massenoperation (Migration, Format-Sweep,
            // Sync-Restore) ist jede mtime jung und jeder Score liegt
            // strukturell ueber der Schwelle -- der Check meldet dann nichts,
            // was wie Gesundheit aussieht und Blindheit ist. Der Live-Vault
            // stand am 21.08.2026 genau so da: 750 Notizen, aelteste mtime
            // 53 Tage, Halbwertszeit 180, Stufe 2 nie gefeuert.
            if (this.reportMtimeDegeneration(db)) return;

            // 1. Sammle alle Cluster aus ontology, mit Member-Pfaden.
            const clusterMembersRaw = db.exec(
                `SELECT cluster, entity_path FROM ontology ORDER BY cluster`,
            );
            if (clusterMembersRaw.length === 0) return;

            const membersByCluster = new Map<string, string[]>();
            for (const row of clusterMembersRaw[0].values) {
                const cluster = row[0] as string;
                const path = row[1] as string;
                if (!membersByCluster.has(cluster)) membersByCluster.set(cluster, []);
                membersByCluster.get(cluster)!.push(path);
            }

            // 2. Lookup cluster_metadata (half_life_days). Default 180 Tage Tech-Fallback.
            const metaRaw = db.exec(`SELECT cluster, half_life_days FROM cluster_metadata`);
            const halfLifeByCluster = new Map<string, number>();
            if (metaRaw.length > 0) {
                for (const row of metaRaw[0].values) {
                    halfLifeByCluster.set(row[0] as string, row[1] as number);
                }
            }
            const DEFAULT_HALF_LIFE = 180;

            const now = Date.now();
            const dayMs = 86_400_000;

            for (const [cluster, paths] of membersByCluster.entries()) {
                if (paths.length === 0) continue;

                const halfLife = halfLifeByCluster.get(cluster) ?? DEFAULT_HALF_LIFE;
                if (halfLife <= 0) continue; // Personal-Cluster, statisch

                // mtime aus vectors (latest pro path)
                const placeholders = paths.map(() => '?').join(',');
                const mtimeRaw = db.exec(
                    `SELECT path, MAX(mtime) FROM hc_vectors WHERE path IN (${placeholders}) GROUP BY path`,
                    paths,
                );
                if (mtimeRaw.length === 0 || mtimeRaw[0].values.length === 0) continue;

                let totalAgeDays = 0;
                let staleCount = 0;
                let counted = 0;
                for (const row of mtimeRaw[0].values) {
                    const mtime = row[1] as number;
                    if (!mtime) continue;
                    const ageDays = (now - mtime) / dayMs;
                    totalAgeDays += ageDays;
                    if (ageDays > halfLife) staleCount++;
                    counted++;
                }
                if (counted === 0) continue;

                const avgAge = totalAgeDays / counted;
                const coverageDrift = staleCount / counted;

                // FIX-19-16-05: geteilte Formel. Die alte Inline-Kopie trug
                // `w3 * 1` -- die Stale-Reference-Rate aus BA-25 12.1 wurde
                // nie gebaut, der konstante Term hob jeden Score um bis zu
                // 10 Punkte. Renormalisiert auf die zwei echten Terme; die
                // Stale-Reference-Pipeline bekommt bei Bau ihren Platz in
                // clusterFreshnessScore, nicht hier.
                const score = clusterFreshnessScore(avgAge, halfLife, coverageDrift);

                if (score < 70) {
                    const sev: 'high' | 'medium' | 'low' =
                        score < 30 ? 'high' : score < 50 ? 'medium' : 'low';
                    this.findings.push({
                        check: 'cluster_freshness',
                        severity: sev,
                        paths: [],
                        cluster,
                        description: `Cluster "${cluster}": Freshness-Score ${score}/100 (avg-Age ${Math.round(avgAge)}d, Halbwertszeit ${halfLife}d, ${counted} Notes, ${staleCount} ueber Halbwertszeit)`,
                        metadata: { score, avgAge: Math.round(avgAge), halfLife, totalNotes: counted, staleCount },
                    });
                }
            }
        } catch (err) {
            console.warn('[VaultHealth] cluster_freshness check failed:', err);
        }
    }

    /**
     * FIX-19-16-06: detect a degenerated mtime distribution and say so.
     *
     * Returns true (and pushes ONE finding) when enough notes exist and
     * their newest-chunk mtimes are compressed into a window too narrow to
     * carry an age signal: P95 minus P5 under 90 days across 200+ notes is
     * the signature of a mass operation, not of a vault whose notes all
     * happen to be young. In that state every cluster score is an artifact,
     * so the per-cluster findings are skipped for this run instead of
     * standing next to a warning that disowns them.
     */
    private reportMtimeDegeneration(db: SqlJsDatabase): boolean {
        const MIN_NOTES = 200;
        const WINDOW_DAYS = 90;
        try {
            const raw = db.exec(
                `SELECT MAX(mtime) AS m FROM hc_vectors GROUP BY path ORDER BY m`,
            );
            if (raw.length === 0) return false;
            const mtimes = raw[0].values.map((r) => r[0] as number).filter((m) => !!m);
            if (mtimes.length < MIN_NOTES) return false;
            const p5 = mtimes[Math.floor(mtimes.length * 0.05)];
            const p95 = mtimes[Math.floor(mtimes.length * 0.95)];
            const windowDays = (p95 - p5) / 86_400_000;
            if (windowDays >= WINDOW_DAYS) return false;
            this.findings.push({
                check: 'cluster_freshness',
                severity: 'medium',
                paths: [],
                description: `mtime carries no age signal in this vault: ${mtimes.length} notes, `
                    + `95% of last-modified times inside ${Math.round(windowDays)} days (mass operation detected). `
                    + `Freshness scoring is skipped for this run; content-level freshness needs an external `
                    + `time signal such as the daily-briefing skill provides.`,
                metadata: { degenerate: true, notes: mtimes.length, windowDays: Math.round(windowDays) },
            });
            return true;
        } catch (err) {
            console.warn('[VaultHealth] mtime degeneration probe failed:', err);
            return false;
        }
    }

    /**
     * source_concentration (FEAT-19-17, ADR-93).
     *
     * Pro Cluster: top-source-domain anteil > 0.7 plus min 5 Notes
     * -> Warning mit Anti-Echo-Vorschlag.
     */
    private checkSourceConcentration(db: SqlJsDatabase): void {
        const THRESHOLD = 0.7;
        const MIN_NOTES = 5;
        try {
            const totalsRaw = db.exec(
                `SELECT cluster, SUM(note_count) FROM cluster_source_stats GROUP BY cluster HAVING SUM(note_count) >= ?`,
                [MIN_NOTES],
            );
            if (totalsRaw.length === 0) {
                // FIX-19-16-10: die Tabelle fuellt nur der Deep-Ingest. Ein
                // Vault ohne Ingest-Historie (Live-Vault: 0 Zeilen gegen 1446
                // ontology-Mitglieder) liess den Check auf ewig stumm. Die
                // Frontmatter-URLs der Mitglieder tragen dasselbe Signal.
                this.checkSourceConcentrationFromFrontmatter(db, THRESHOLD, MIN_NOTES);
                return;
            }

            for (const row of totalsRaw[0].values) {
                const cluster = row[0] as string;
                const total = row[1] as number;

                const topRaw = db.exec(
                    `SELECT source_domain, note_count FROM cluster_source_stats WHERE cluster = ? ORDER BY note_count DESC LIMIT 1`,
                    [cluster],
                );
                if (topRaw.length === 0 || topRaw[0].values.length === 0) continue;
                const dominantDomain = topRaw[0].values[0][0] as string;
                const dominantCount = topRaw[0].values[0][1] as number;
                const score = dominantCount / total;
                if (score < THRESHOLD) continue;

                const pct = Math.round(score * 100);
                this.findings.push({
                    check: 'source_concentration',
                    severity: score >= 0.85 ? 'high' : 'medium',
                    paths: [],
                    cluster,
                    description: `Cluster "${cluster}": ${dominantCount} von ${total} Notes (${pct}%) aus ${dominantDomain}. Suche aktiv Gegenpositionen.`,
                    metadata: { dominantDomain, dominantCount, total, concentrationScore: score },
                });
            }
        } catch (err) {
            console.warn('[VaultHealth] source_concentration check failed:', err);
        }
    }

    /** FIX-19-16-10: same thresholds, frontmatter-derived counts. */
    private checkSourceConcentrationFromFrontmatter(db: SqlJsDatabase, threshold: number, minNotes: number): void {
        const clustersRaw = db.exec(`SELECT DISTINCT cluster FROM ontology`);
        if (clustersRaw.length === 0) return;
        for (const row of clustersRaw[0].values) {
            const cluster = row[0] as string;
            const stats = deriveClusterDomainStats(db, cluster);
            const total = stats.reduce((sum, s) => sum + s.noteCount, 0);
            if (total < minNotes || stats.length === 0) continue;
            const top = stats[0];
            const score = top.noteCount / total;
            if (score < threshold) continue;
            const pct = Math.round(score * 100);
            this.findings.push({
                check: 'source_concentration',
                severity: score >= 0.85 ? 'high' : 'medium',
                paths: [],
                cluster,
                description: `Cluster "${cluster}": ${top.noteCount} von ${total} Notes (${pct}%) aus ${top.sourceDomain} (abgeleitet aus Frontmatter-URLs). Suche aktiv Gegenpositionen.`,
                metadata: {
                    dominantDomain: top.sourceDomain,
                    dominantCount: top.noteCount,
                    total,
                    concentrationScore: score,
                    derivedFrom: 'frontmatter',
                },
            });
        }
    }
}

/* eslint-enable -- end of file-level disable for boundary code (SDK/JSON/Obsidian internals) */
