import { describe, it, expect } from 'vitest';
import { VaultHealthService, type HealthFinding } from '../VaultHealthService';
import type { KnowledgeDB } from '../KnowledgeDB';
import type { App } from 'obsidian';

/**
 * formatFindings()-Tests: stellt sicher dass die BA-25-Check-Types
 * cluster_freshness, source_concentration sowie god_nodes korrekt
 * im Tool-Output erscheinen, mit Cluster-Snippets und Hinweis auf
 * web_search fuer Stufe-2.
 */

function makeMockApp(): App { return {} as App; }
function makeMockKnowledgeDB(): KnowledgeDB { return { isOpen: () => true } as unknown as KnowledgeDB; }

function makeService(): VaultHealthService {
    return new VaultHealthService(makeMockApp(), makeMockKnowledgeDB());
}

describe('VaultHealthService.formatFindings', () => {
    it('renders empty findings message', () => {
        const svc = makeService();
        expect(svc.formatFindings([])).toBe('Vault health check: No issues found.');
    });

    it('renders cluster_freshness with description snippets', () => {
        const svc = makeService();
        const findings: HealthFinding[] = [
            {
                check: 'cluster_freshness',
                severity: 'high',
                paths: [],
                cluster: 'Tech',
                description: 'Cluster "Tech": Freshness-Score 25/100 (avg-Age 200d, Halbwertszeit 180d, 5 Notes, 4 ueber Halbwertszeit)',
                metadata: { score: 25, avgAge: 200, halfLife: 180, totalNotes: 5, staleCount: 4 },
            },
        ];
        const out = svc.formatFindings(findings);
        expect(out).toContain('Cluster Freshness [high]');
        expect(out).toContain('Cluster "Tech": Freshness-Score 25/100');
        expect(out).toContain('Karpathy-Lint');
        expect(out).toContain('web_search-Tool');
    });

    it('renders source_concentration with anti-echo-hint', () => {
        const svc = makeService();
        const findings: HealthFinding[] = [
            {
                check: 'source_concentration',
                severity: 'high',
                paths: [],
                cluster: 'Knowledge Management',
                description: 'Cluster "Knowledge Management": 9 von 12 Notes (75%) aus medium.com. Suche aktiv Gegenpositionen.',
                metadata: { dominantDomain: 'medium.com', dominantCount: 9, total: 12, concentrationScore: 0.75 },
            },
        ];
        const out = svc.formatFindings(findings);
        expect(out).toContain('Source Concentration [high]');
        expect(out).toContain('medium.com');
        expect(out).toContain('Bias-Warnung');
    });

    it('renders god_nodes finding', () => {
        const svc = makeService();
        const findings: HealthFinding[] = [
            {
                check: 'god_nodes',
                severity: 'medium',
                paths: ['Hub.md'],
                description: '[[Hub.md]] has 80 incoming connections (threshold: 50)',
            },
        ];
        const out = svc.formatFindings(findings);
        expect(out).toContain('God Nodes [medium]');
    });

    it('groups findings by check type and limits to 3 snippets per type', () => {
        const svc = makeService();
        const findings: HealthFinding[] = [];
        for (let i = 0; i < 5; i++) {
            findings.push({
                check: 'cluster_freshness',
                severity: 'medium',
                paths: [],
                cluster: `Cluster${i}`,
                description: `Cluster "Cluster${i}": Freshness-Score 40/100`,
            });
        }
        const out = svc.formatFindings(findings);
        // 5 Cluster-Findings, aber nur 3 Snippets im Output
        const snippetCount = (out.match(/Cluster "Cluster\d+":/g) ?? []).length;
        expect(snippetCount).toBe(3);
    });

    it('mixes existing checks with BA-25 checks', () => {
        const svc = makeService();
        const findings: HealthFinding[] = [
            {
                check: 'orphans',
                severity: 'medium',
                paths: ['A.md', 'B.md'],
                description: 'orphans found',
            },
            {
                check: 'cluster_freshness',
                severity: 'high',
                paths: [],
                cluster: 'Tech',
                description: 'Cluster "Tech": Freshness-Score 20/100',
            },
        ];
        const out = svc.formatFindings(findings);
        expect(out).toContain('Orphans');
        expect(out).toContain('Cluster Freshness [high]');
        expect(out).toContain('Vault Health: 2 finding(s)');
    });
});
