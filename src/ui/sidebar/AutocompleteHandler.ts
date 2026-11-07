import type { App, TFile, TFolder } from 'obsidian';
import { TFile as TFileCtor, TFolder as TFolderCtor } from 'obsidian';
import type ObsidianAgentPlugin from '../../main';
import { t } from '../../i18n';
import { resolvePromptContent } from '../../core/context/SupportPrompts';
import {
    buildSlashEntries,
    filterSlashEntries,
    type SlashKind,
    type SlashSources,
} from './slashRegistry';
import type { WorkflowMeta } from '../../core/context/WorkflowLoader';

interface AutocompleteItem {
    label: string;
    sub?: string;
    tag?: string;
    /**
     * FEAT-02-11: CSS variant for the tag pill. `file` = light grey,
     * `folder` = darker grey. Skills/prompts/workflows omit this so their
     * pill keeps the accent colour.
     */
    tagVariant?: 'file' | 'folder';
    onSelect: () => void;
}

/**
 * `onSelect` is a void-returning property, but inserting a file or folder
 * reference is async. Wrapping keeps the click handler synchronous (no
 * misused promise) while surfacing a rejection instead of dropping it.
 */
function fireAndForget(run: () => Promise<void>): () => void {
    return () => {
        void run().catch((err: unknown) => {
            console.error('Autocomplete selection failed', err);
        });
    };
}

/**
 * FEAT-02-11: separate caps for file and folder rows so a query that hits many
 * markdown files (e.g. "Acme") does not push the matching folders out of the
 * popup entirely. Unused slots on one side flow to the other.
 */
const AUTOCOMPLETE_MAX_FILE_ROWS = 5;
const AUTOCOMPLETE_MAX_FOLDER_ROWS = 5;
const AUTOCOMPLETE_MAX_TOTAL_ROWS = 10;

/**
 * Compute a match-quality rank for a candidate against the lowercased query.
 * Lower = better. Ties are broken by path length (shorter = better) so a
 * parent folder always outranks a sub-folder for the same substring match.
 */
function matchRank(name: string, path: string, query: string): number {
    const n = name.toLowerCase();
    const p = path.toLowerCase();
    if (query === '') return 0;
    if (n === query) return 0;             // exact name match
    if (n.startsWith(query)) return 1;     // name prefix
    if (n.includes(query)) return 2;       // name substring
    if (p.startsWith(query)) return 3;     // path prefix (rare)
    if (p.includes(query)) return 4;       // path substring
    return 99;
}

/**
 * AutocompleteHandler — manages the / and @ autocomplete dropdown.
 *
 * Extracted from AgentSidebarView to reduce file size.
 */
export class AutocompleteHandler {
    private items: AutocompleteItem[] = [];
    private selectedIndex = 0;
    private dropdownEl: HTMLElement | null = null;

    constructor(
        private plugin: ObsidianAgentPlugin,
        private app: App,
        private getTextarea: () => HTMLTextAreaElement | null,
        private getInputArea: () => HTMLElement | null,
        private addVaultFile: (file: TFile) => Promise<void>,
        /**
         * FEAT-02-11: folder-mention callback. Attaches the folder as a
         * manifest attachment (path list, lazy-read via read_file /
         * read_document). Called by the suggest rows tagged 'Folder'.
         */
        private addVaultFolder: (folder: TFolder, opts: { recursive: boolean }) => Promise<void>,
        /**
         * FEAT-55-02 (ADR-170): resolves THIS view's active mode slug so the
         * slash-source prompt filter matches the per-view mode, not the
         * global settings.currentMode scalar. Defaults to the global scalar
         * for callers that do not pass it (keeps existing behaviour).
         */
        private getActiveModeSlug: () => string = () => this.plugin.settings.currentMode,
    ) {}

    async handleInput(): Promise<void> {
        const textarea = this.getTextarea();
        if (!textarea) return;
        const value = textarea.value;

        // FEAT-02-13: ein Praefix fuer alles. Frueher trennten '/' (Skills),
        // '#' (Prompts) und '\u00a7' (Workflows); die Typ-Entscheidung fiel damit
        // vor dem Tippen des Namens, und '\u00a7' braucht auf jeder Tastatur
        // einen Modifier. Das Typ-Label in der Zeile leistet die Unterscheidung.
        if (value[0] === '/') {
            // FIX-02-13-01 (Issue #66): the menu used to stay open for as long
            // as the line began with '/', so Enter kept being consumed as
            // "accept suggestion" and the user could never send. Keep it open
            // only while the caret is still inside the command token; once it
            // sits past the separator the command is chosen and Enter means
            // send again. Moving the caret back into the token reopens it, so
            // swapping a command with a prompt already typed still works.
            const caret = textarea.selectionStart ?? value.length;
            const firstWs = value.search(/\s/);
            if (firstWs !== -1 && caret > firstWs) { this.hide(); return; }
            const query = value.slice(1).split(' ')[0].toLowerCase();
            const items = await this.buildPrefixItems(query, value);
            if (items.length === 0) { this.hide(); return; }
            this.items = items;
            this.selectedIndex = 0;
            this.render();
            return;
        }

        // @ anywhere in the text → file mention autocomplete
        const cursorPos = textarea.selectionStart ?? value.length;
        const beforeCursor = value.slice(0, cursorPos);
        const atIdx = beforeCursor.lastIndexOf('@');
        if (atIdx !== -1 && (atIdx === 0 || /\s/.test(beforeCursor[atIdx - 1]))) {
            const query = beforeCursor.slice(atIdx + 1).toLowerCase();

            const makeFileOnSelect = (f: TFile) => async () => {
                const ta = this.getTextarea();
                if (!ta) return;
                // FEATURE-2206: keep the @-reference inline so the sentence
                // reads naturally ("Lese @Referenznote und ..."). The file is
                // still added as an attachment; the inline text is just a
                // human-readable anchor.
                const inlineRef = `@${f.basename}`;
                const before = value.slice(0, atIdx);
                const after = value.slice(atIdx + 1 + query.length);
                const needsTrailingSpace = after.length === 0 || !after.startsWith(' ');
                const replacement = `${inlineRef}${needsTrailingSpace ? ' ' : ''}`;
                const newValue = before + replacement + after;
                ta.value = newValue;
                // Put the cursor just after the inlined reference so typing continues naturally.
                const newCursor = (before + replacement).length;
                ta.setSelectionRange(newCursor, newCursor);
                this.hide();
                await this.addVaultFile(f);
                ta.focus();
            };

            const currentFile = this.app.workspace.getActiveFile();
            const activeOption: AutocompleteItem[] = (currentFile && (query === '' || 'active'.startsWith(query)))
                ? [{ label: t('ui.sidebar.autocompleteActiveNote'), sub: `@active → ${currentFile.basename}`, onSelect: fireAndForget(makeFileOnSelect(currentFile)) }]
                : [];

            // FEAT-02-11: rank-sort files by match quality so an exact-name
            // match ("Ledger.md") ranks above a deep path substring
            // ("Notes/2026/Ledger/journal.md") for a short query like "ledger".
            const rankedFiles = this.app.vault.getMarkdownFiles()
                .map((f) => ({ f, rank: matchRank(f.basename, f.path, query) }))
                .filter((r) => r.rank < 99)
                .sort((a, b) => a.rank - b.rank || a.f.path.length - b.f.path.length);
            const fileItems: AutocompleteItem[] = rankedFiles.map(({ f }) => ({
                label: f.basename,
                sub: f.path,
                tag: t('ui.sidebar.autocompleteFileTag'),
                tagVariant: 'file' as const,
                onSelect: fireAndForget(makeFileOnSelect(f)),
            }));

            // FEAT-02-11: folder rows. One row per match by default (recursive);
            // a second "top-level only" row is emitted when the folder has any
            // sub-folder so the alternative is discoverable without a modifier
            // key.
            const folderItems: AutocompleteItem[] = this.buildFolderItems(query, atIdx, query.length, value);

            // FEAT-02-11: separate slot caps so a query that lights up many
            // files (like "Acme" against a project folder full of markdown)
            // never drops the matching folders out entirely. Ungenutzte
            // Datei-Slots wandern in den Ordner-Bereich und umgekehrt.
            const activeSlots = activeOption.length;
            const remainingAfterActive = Math.max(0, AUTOCOMPLETE_MAX_TOTAL_ROWS - activeSlots);
            const desiredFiles = Math.min(fileItems.length, AUTOCOMPLETE_MAX_FILE_ROWS);
            const desiredFolders = Math.min(folderItems.length, AUTOCOMPLETE_MAX_FOLDER_ROWS);
            let takeFiles = desiredFiles;
            let takeFolders = desiredFolders;
            if (takeFiles + takeFolders > remainingAfterActive) {
                // Distribute the deficit proportionally; folders win a tie.
                const deficit = takeFiles + takeFolders - remainingAfterActive;
                const fileHead = Math.max(0, takeFiles - Math.ceil(deficit / 2));
                takeFiles = fileHead;
                takeFolders = Math.max(0, remainingAfterActive - takeFiles);
            } else {
                // Fill unused folder slots with more files, or vice versa.
                const spare = remainingAfterActive - takeFiles - takeFolders;
                if (spare > 0) {
                    const extraFiles = Math.min(spare, fileItems.length - takeFiles);
                    takeFiles += extraFiles;
                    const remainingSpare = remainingAfterActive - takeFiles - takeFolders;
                    if (remainingSpare > 0) takeFolders += Math.min(remainingSpare, folderItems.length - takeFolders);
                }
            }

            this.items = [
                ...activeOption,
                ...fileItems.slice(0, takeFiles),
                ...folderItems.slice(0, takeFolders),
            ];
            if (this.items.length === 0) { this.hide(); return; }
            this.selectedIndex = 0;
            this.render();
            return;
        }

        this.hide();
    }

    /**
     * FEAT-02-11: build the folder rows for the @ autocomplete. Emits one row
     * per matching folder (recursive), plus a second row per folder that has
     * sub-folders (top-level only). Rows are ranked after files by the caller.
     */
    private buildFolderItems(
        query: string,
        atIdx: number,
        queryLen: number,
        value: string,
    ): AutocompleteItem[] {
        const allFolders: TFolder[] = this.app.vault.getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolderCtor);
        // Rank folders by match quality then path length. This is the fix for
        // the "parent folder disappears" bug the user hit with
        // `Desks/Acme Hub` vs `Desks/Acme Hub/Insights`:
        // a shorter path (parent) now always outranks a sub-folder for the
        // same substring hit, and the parent survives the popup slot cap.
        const matches = allFolders
            .map((f) => ({ f, rank: matchRank(f.name, f.path, query) }))
            .filter((r) => r.f.path && r.rank < 99)
            .sort((a, b) => a.rank - b.rank || a.f.path.length - b.f.path.length)
            .map((r) => r.f);

        const items: AutocompleteItem[] = [];
        for (const fld of matches) {
            const fileChildren = (fld.children ?? []).filter((c): c is TFile => c instanceof TFileCtor);
            const hasSubfolders = (fld.children ?? []).some((c) => c instanceof TFolderCtor);
            const shortName = fld.name || fld.path;

            const makeFolderOnSelect = (recursive: boolean) => async () => {
                const ta = this.getTextarea();
                if (!ta) return;
                const inlineRef = `@${shortName}`;
                const before = value.slice(0, atIdx);
                const after = value.slice(atIdx + 1 + queryLen);
                const needsTrailingSpace = after.length === 0 || !after.startsWith(' ');
                const replacement = `${inlineRef}${needsTrailingSpace ? ' ' : ''}`;
                ta.value = before + replacement + after;
                const newCursor = (before + replacement).length;
                ta.setSelectionRange(newCursor, newCursor);
                this.hide();
                await this.addVaultFolder(fld, { recursive });
                ta.focus();
            };

            items.push({
                label: `${shortName}/`,
                sub: t('ui.sidebar.autocompleteFolderRecursive', {
                    path: fld.path,
                    count: String(fileChildren.length),
                }),
                tag: t('ui.sidebar.autocompleteFolderTag'),
                tagVariant: 'folder' as const,
                onSelect: fireAndForget(makeFolderOnSelect(true)),
            });
            if (hasSubfolders) {
                items.push({
                    label: `${shortName}/`,
                    sub: t('ui.sidebar.autocompleteFolderTopLevel', {
                        path: fld.path,
                        count: String(fileChildren.length),
                    }),
                    tag: t('ui.sidebar.autocompleteFolderTag'),
                    tagVariant: 'folder' as const,
                    onSelect: fireAndForget(makeFolderOnSelect(false)),
                });
            }
        }
        return items;
    }

    /** Typ-Label der Zeile. Als Funktion, damit ein Sprachwechsel greift. */
    private static kindTag(kind: SlashKind): string {
        if (kind === 'skill') return t('ui.sidebar.autocompleteSkillTag');
        if (kind === 'prompt') return t('ui.sidebar.autocompletePromptTag');
        return t('ui.sidebar.autocompleteWorkflowTag');
    }

    private async buildPrefixItems(query: string, value: string): Promise<AutocompleteItem[]> {
        const makeSwap = (slug: string) => () => {
            const ta = this.getTextarea();
            if (!ta) return;
            // FIX-02-13-01 (Issue #66): ALWAYS emit the separator, even when
            // nothing follows yet. The old form only added a space when a rest
            // already existed, so selecting on an empty tail produced "/slug"
            // with the caret glued to the last character; whatever the user
            // typed next fused into the slug ("/videogomach mir ein Video")
            // and no command resolved any more -- silently, as plain text.
            // Same shape as insertPrefixedCommand (the + button's picker),
            // which has always done this correctly.
            const rest = value.includes(' ') ? value.slice(value.indexOf(' ') + 1) : '';
            const head = `/${slug} `;
            ta.value = head + rest;
            this.hide();
            ta.focus();
            // Caret behind the separator, where the user continues writing.
            ta.setSelectionRange(head.length, head.length);
        };

        const sources = await this.collectSlashSources();
        const entries = filterSlashEntries(buildSlashEntries(sources), query);
        const insertPrompt = (slug: string) => () => {
            const ta = this.getTextarea();
            const prompt = sources.prompts.find((p) => p.slug === slug);
            if (!ta || !prompt) return;
            const rest = value.includes(' ') ? value.slice(value.indexOf(' ') + 1).trim() : '';
            const resolved = resolvePromptContent(prompt.content, {
                userInput: rest,
                activeFile: this.app.workspace.getActiveFile()?.path,
            });
            const hasInputPlaceholder = /\{\{userInput\}\}|\$\{userInput\}/.test(prompt.content);
            ta.value = rest && !hasInputPlaceholder ? `${resolved}\n\n${rest}` : resolved;
            this.hide();
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
        };

        return entries.map((e) => ({
            label: e.label,
            // Ein verdeckter Eintrag bleibt sichtbar, statt still zu
            // verschwinden: sonst sucht der Nutzer einen Prompt, der
            // wegen eines gleichnamigen Skills nie auftaucht.
            sub: e.shadowed
                ? t('ui.sidebar.autocompleteShadowed', { slug: e.slug })
                : `/${e.slug}`,
            tag: AutocompleteHandler.kindTag(e.kind),
            onSelect: e.shadowed ? () => { /* nicht ausloesbar */ }
                : e.kind === 'prompt' ? insertPrompt(e.slug) : makeSwap(e.slug),
        }));
    }

    /**
     * Sammelt die drei Quellen fuer das `/`-Menue. Dieselbe Funktion
     * versorgt den Send-Time-Resolver in AgentSidebarView, damit die
     * Liste und die Aufloesung nicht auseinanderlaufen koennen.
     */
    async collectSlashSources(): Promise<SlashSources> {
        const activeMode = this.getActiveModeSlug();
        const skills = (this.plugin.selfAuthoredSkillLoader?.getAllSkills() ?? [])
            .map((s) => ({ name: s.name, slug: slugifySkillName(s.name) }));
        const prompts = (this.plugin.settings.customPrompts ?? [])
            .filter((p) => p.enabled !== false && (!p.mode || p.mode === activeMode));

        let workflows: WorkflowMeta[] = [];
        const loader = this.plugin.workflowLoader;
        if (loader) {
            const toggles = this.plugin.settings.workflowToggles ?? {};
            workflows = (await loader.discoverWorkflows()).filter((w) => toggles[w.path] !== false);
        }
        return { skills, prompts, workflows };
    }

    /** Returns true if the event was consumed by the autocomplete. */
    handleKeyDown(e: KeyboardEvent): boolean {
        if (!this.dropdownEl) return false;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedIndex = Math.min(this.selectedIndex + 1, this.items.length - 1);
            this.render();
            return true;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
            this.render();
            return true;
        }
        // Issue #54.1: a modifier+Enter (Ctrl/Cmd) is the composer's send
        // accelerator, not a suggestion-accept. Let it fall through so the
        // keydown handler can send instead of picking a suggestion.
        // FIX-02-13-01 (Issue #66): Shift+Enter is the composer's newline
        // (composerKeymap), and an open dropdown must not eat it either.
        if ((e.key === 'Tab' || e.key === 'Enter') && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            this.items[this.selectedIndex]?.onSelect();
            return true;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            this.hide();
            return true;
        }
        return false;
    }

    hide(): void {
        this.dropdownEl?.remove();
        this.dropdownEl = null;
        this.items = [];
        this.selectedIndex = 0;
    }

    /** Re-slugifies a skill name to a URL-safe slash command token. Public so
     * the send-message pipeline can re-run the same transformation when it
     * resolves `/skill-slug`. */
    static slugifySkillName(name: string): string {
        return slugifySkillName(name);
    }

    private render(): void {
        const inputArea = this.getInputArea();
        if (!inputArea) return;

        if (!this.dropdownEl) {
            this.dropdownEl = inputArea.createDiv('autocomplete-dropdown');
            activeDocument.addEventListener('click', (e) => {
                if (this.dropdownEl && !this.dropdownEl.contains(e.target as Node)) {
                    this.hide();
                }
            }, { once: true });
        }

        this.dropdownEl.empty();
        this.items.forEach((item, idx) => {
            // FEAT-02-11: two-line layout so the file/folder name is legible
            // even when the path is long. Top row: name (bold) + tag pill.
            // Bottom row: path in a smaller muted line, wrapping under both
            // above elements.
            const row = this.dropdownEl!.createDiv({
                cls: `autocomplete-item${idx === this.selectedIndex ? ' active' : ''}`,
            });
            const topRow = row.createDiv('autocomplete-top');
            topRow.createSpan({ cls: 'autocomplete-label', text: item.label });
            if (item.tag) {
                const variantCls = item.tagVariant ? ` tag-${item.tagVariant}` : '';
                topRow.createSpan({ cls: `autocomplete-tag${variantCls}`, text: item.tag });
            }
            if (item.sub) row.createDiv({ cls: 'autocomplete-sub', text: item.sub });
            row.addEventListener('mousedown', (e) => {
                e.preventDefault();
                item.onSelect();
            });
        });
    }
}

function slugifySkillName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
