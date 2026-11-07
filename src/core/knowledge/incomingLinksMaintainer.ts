/**
 * incomingLinksMaintainer -- die reine Block-Update-Entscheidung fuer den
 * selbstbildenden Rueckverweis-Block einer Hub-Note (FEAT-19-04-01).
 *
 * Bekommt den aktuellen Notiz-Inhalt, die eingehenden Quellen (aus
 * GraphStore.getSourcesFor) und den Hub-Schwellenwert. Liefert den neuen
 * Inhalt oder null (nichts zu tun). Keine DB, kein Obsidian -- damit
 * deterministisch, idempotent (der djb2-sha der Auto-Block-Infra bleibt bei
 * gleichem Input stabil) und ohne Harness testbar.
 *
 * Faelle (FIX-19-07-05, USER 2026-07-20):
 *  - Block existiert bereits: IMMER aktualisieren, NIE entfernen -- auch wenn
 *    die Zahl der Backlinks unter den Threshold faellt. Der sichtbare Block ist
 *    die robuste Backlink-History; ihn zu entfernen wuerde die Info ins
 *    Frontmatter zwingen (zusaetzliche Fehlerquelle). Der Threshold steuert NUR
 *    die Erstanlage.
 *  - Kein Block, >= threshold Backlinks: Block am ENDE der Note anlegen.
 *  - Kein Block, < threshold: nichts tun (Note bleibt schlank). Ausnahme via
 *    Aufrufer: type:person -> threshold 1, damit jede Person ab dem ersten
 *    Backlink eine History bekommt.
 *  - Legacy-Aufraeumung: der alte "## Verlinkte Notizen" + .base-Embed-
 *    Abschnitt wird IMMER entfernt, egal ob Block oder nicht.
 *  - unveraendert oder vom Nutzer editiert: null.
 */

import { replaceOrInsertAutoBlock, removeAutoBlock, findAutoBlock } from '../ingest/MOCMaintainer';
import { buildIncomingLinksBody, selectIncomingSources, type IncomingSource, type IncomingLinksDisplayOptions } from './incomingLinksBlock';

/** Eigene Block-id, laeuft konfliktfrei neben 'moc-header'. */
export const INCOMING_BLOCK_ID = 'incoming-links';

/**
 * FEAT-19-04-01 W6: eigene Block-id fuer den lesbaren .base-Block (nur
 * strukturelle Hub-Typen). Getrennt vom incoming-links-Block, damit beide
 * unabhaengig verwaltet werden -- der .base steht sichtbar VOR dem zugeklappten
 * Wikilink-Callout.
 */
export const BACKLINKS_BASE_BLOCK_ID = 'backlinks-base';

/**
 * FEAT-19-04-01 W2: entfernt den Legacy-".base"-Abschnitt, den der fruehere
 * Repair angehaengt hat: "## Verlinkte Notizen\n\n![[<name>-Backlinks.base]]".
 * Matcht die Ueberschrift plus den folgenden Base-Embed, tolerant gegen
 * Leerzeilen. Beruehrt nichts anderes.
 */
function stripLegacyBaseSection(content: string): string {
    // Ueberschrift (## Verlinkte Notizen), dann bis zu 2 Leerzeilen, dann
    // ein ![[...-Backlinks.base]]-Embed, optional gefolgt von Leerzeile.
    const re = /\n*##\s+Verlinkte Notizen\s*\n+!\[\[[^\]]*-Backlinks\.base\]\]\s*\n?/g;
    return content.replace(re, '\n');
}

export function computeIncomingBlockUpdate(
    content: string,
    sources: readonly IncomingSource[],
    threshold: number,
    selfPath: string,
    // FEAT-19-04-01 W6: fertiger ```base-Codeblock fuer strukturelle Hub-Typen
    // (buildBacklinksBaseBlock). undefined = Nicht-Hub-Typ -> kein .base (ein
    // etwaiger alter .base-Block wird dann entfernt).
    baseBlock?: string,
    displayOptions?: IncomingLinksDisplayOptions,
): string | null {
    // 1. Legacy-Abschnitt immer bereinigen (unabhaengig vom Block-Status).
    let deLegacied = stripLegacyBaseSection(content);

    // FEAT-19-04-01 W6: den lesbaren .base-Block ZUERST verwalten, damit er --
    // wie der incoming-links-Callout per position:'bottom' -- oberhalb des
    // Callouts landet (Reihenfolge: sichtbare .base, dann zugeklappte Tabelle).
    // Hub-Typ (baseBlock gesetzt): einsetzen/aktualisieren. Nicht-Hub
    // (baseBlock undefined): etwaigen alten .base-Block entfernen.
    if (baseBlock !== undefined) {
        const res = replaceOrInsertAutoBlock(deLegacied, baseBlock, {
            blockId: BACKLINKS_BASE_BLOCK_ID, position: 'bottom', skipShaGuard: true,
        });
        if (res.written && res.newContent !== undefined) deLegacied = res.newContent;
    } else if (findAutoBlock(deLegacied, BACKLINKS_BASE_BLOCK_ID)) {
        const res = removeAutoBlock(deLegacied, BACKLINKS_BASE_BLOCK_ID, { force: true });
        if (res.written && res.newContent !== undefined) deLegacied = res.newContent;
    }

    const existing = findAutoBlock(deLegacied, INCOMING_BLOCK_ID);

    // FIX-19-07-05 (USER 2026-07-20): der Threshold steuert NUR die Erstanlage.
    // Existiert bereits ein Block, wird er IMMER aktualisiert und NIE entfernt,
    // auch wenn die Backlink-Zahl unter den Threshold faellt. Ohne existierenden
    // Block wird nur ab Threshold neu angelegt (der Aufrufer setzt threshold=1
    // fuer type:person, damit jede Person ab dem ersten Backlink eine History
    // bekommt).
    const selfFiltered = selectIncomingSources(sources, { selfPath });
    const shouldHaveBlock = existing !== null || selfFiltered.length >= threshold;

    let next: string;
    if (!shouldHaveBlock) {
        // Kein Block, zu wenige Backlinks fuer eine Erstanlage -> Note bleibt
        // schlank. (Ein etwaiger Block existiert hier per Definition nicht.)
        next = deLegacied;
    } else {
        // Block anlegen ODER vorhandenen aktualisieren. Body aus ALLEN Quellen
        // (kein Threshold-Gate mehr auf den Inhalt), Selbstlink ausgeschlossen.
        const body = buildIncomingLinksBody(selfFiltered, displayOptions);

        // FEAT-19-04-01 W2: Block ans ENDE der Note.
        //
        // replaceOrInsertAutoBlock ersetzt einen vorhandenen Block AN SEINER
        // STELLE und traegt dabei den no-change-Kurzschluss + den
        // user-edit-Schutz. Steht der Block schon (nahe) am Ende, genuegt
        // das -- so bleiben Idempotenz und Tamper-Schutz erhalten. Nur wenn
        // ein ALTER Block woanders sitzt (frueher nach dem Frontmatter),
        // wird er entfernt und unten neu eingesetzt (einmalige Migration).
        const totalLines = deLegacied.split('\n').length;
        // "am Ende": der Block-End-Marker liegt in den letzten 2 Zeilen.
        const alreadyAtBottom = existing !== null && existing.endLine >= totalLines - 2;

        // FIX-19-07-06: der incoming-links-Block ist maschinen-eigen; sein
        // Tamper-Guard wird ueberall uebersprungen (skipShaGuard/force), weil ein
        // Tabellen-Formatter die byte-exakte sha zerstoert und den Block sonst
        // einfriert. Der whitespace-tolerante no-change-Check in
        // replaceOrInsertAutoBlock verhindert unnoetige Rewrites.
        if (existing && !alreadyAtBottom) {
            // Alt-Block sitzt woanders (frueher nach dem Frontmatter) -> einmalig
            // an die richtige Stelle (Ende) migrieren. force=true, damit der
            // Tamper-Guard die Migration nicht blockiert.
            const removed = removeAutoBlock(deLegacied, INCOMING_BLOCK_ID, { force: true });
            const base = removed.written && removed.newContent !== undefined ? removed.newContent : deLegacied;
            const res = replaceOrInsertAutoBlock(base, body, {
                blockId: INCOMING_BLOCK_ID, position: 'bottom', skipShaGuard: true,
            });
            next = res.written && res.newContent !== undefined ? res.newContent : base;
        } else {
            const res = replaceOrInsertAutoBlock(deLegacied, body, {
                blockId: INCOMING_BLOCK_ID, position: 'bottom', skipShaGuard: true,
            });
            next = res.written && res.newContent !== undefined ? res.newContent : deLegacied;
        }
    }

    // FIX-19-09-06 (USER 2026-07-21): den Abstand zwischen dem .base-End-Marker
    // und dem incoming-links-Start-Marker entfernen -- die beiden Bloecke
    // stehen direkt untereinander (keine Leerzeilen dazwischen). Beide werden
    // per position:'bottom' angehaengt (content + '\n\n' + block), was sonst
    // zwei Leerzeilen laesst. Praeziser Regex NUR auf diese beiden Marker, damit
    // andere Auto-Bloecke (moc-header) unberuehrt bleiben.
    next = next.replace(
        /(<!--\s*\/vault-operator:backlinks-base(?:\s+sha="[^"]*")?\s*-->)\n\s*\n(<!--\s*vault-operator:incoming-links\s*-->)/,
        '$1\n$2',
    );

    // 3. Nur schreiben, wenn sich wirklich etwas geaendert hat.
    return next !== content ? next : null;
}
