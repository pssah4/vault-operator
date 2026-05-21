/**
 * FIX-29-17 (Review-Bot CSS-lint, post v2.11.7 release).
 *
 * The Obsidian Community Plugin Review Bot warns on `:has()` selectors
 * because they trigger broad style-invalidation in Electron's rendering
 * engine. The existing pattern in styles.css (per the comments around
 * line 3562 and 4153) is to migrate `:has()` rules to an explicit class
 * that JS adds at render time.
 *
 * This helper does the same for the generic
 * `.agent-settings button:has(> svg):not(:has(> :not(svg))):not(.mod-cta)`
 * selector chain. It walks the rendered settings container, identifies
 * every <button> that is icon-only (single child, child is an <svg>,
 * not a CTA), and tags it with `.agent-icon-only-btn`. The CSS rules
 * then target that class.
 *
 * Run once at the end of each settings tab render. Dynamic re-renders
 * inside a tab are responsible for re-tagging via the same helper.
 */

const ICON_ONLY_CLASS = 'agent-icon-only-btn';

export function decorateIconOnlyButtons(root: HTMLElement): void {
    const buttons = root.querySelectorAll('button');
    buttons.forEach((btn) => {
        if (btn.classList.contains('mod-cta')) return;
        if (btn.children.length !== 1) return;
        const onlyChild = btn.firstElementChild;
        if (!onlyChild) return;
        if (onlyChild.tagName.toLowerCase() !== 'svg') return;
        btn.classList.add(ICON_ONLY_CLASS);
    });
}
