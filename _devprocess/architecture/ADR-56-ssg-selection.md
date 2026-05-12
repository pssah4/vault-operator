# ADR-56: Static Site Generator fuer Website-Dokumentation

**Date:** 2026-04-01
**Deciders:** Sebastian Hanke

## Context

Die bestehende Vault Operator-Website besteht aus ~30 handgeschriebenen HTML-Dateien mit einem eigenen i18n-System (JSON-Locales, Client-Side-Rendering). Bei wachsendem Content-Umfang (15+ neue Seiten geplant, EN+DE) wird raw HTML unwartbar. Die Migration zu einem Static Site Generator ermoeglicht Markdown-Authoring und schafft die Grundlage fuer Dual-Use der Inhalte als Vault Operator-Skill.

**Triggering ASR:**
- ASR-1: SSG-Auswahl (FEAT-17-00)
- Quality Attribute: Wartbarkeit, Developer Experience

## Decision Drivers

- **Markdown-First:** Authoring muss in Markdown passieren (kein MDX/JSX-Zwang)
- **GitHub Pages:** Static Output, kostenlos deployen, CNAME pssah4.github.io/vault-operator beibehalten
- **i18n (EN+DE):** Native Unterstuetzung fuer zwei Sprachen mit Fallback
- **Sidebar Auto-Generation:** Navigation aus Dateistruktur/Config, nicht manuell pro Seite
- **Suche:** Eingebaute Volltextsuche ohne externe Services
- **Dark/Light Theme:** Muss unterstuetzt werden (toggle, persistent)
- **Mermaid-Support:** Fuer Architektur-Diagramme in Dev Docs
- **Minimaler Overhead:** Ein-Personen-Projekt, kein komplexes Build-Setup
- **Bestehendes CSS:** 1426 Zeilen Custom CSS migrierbar

## Considered Options

### Option 1: VitePress

Vue-basierter SSG, speziell fuer Dokumentation. Markdown-First mit Vue-SFC-Erweiterungen. Bekannt durch Vue.js Docs, Vite Docs, Rollup Docs.

- Pro: Markdown-First, exzellentes Default-Theme mit Sidebar/Search/i18n/Dark-Light out of the box
- Pro: Mermaid-Support via Plugin (vitepress-plugin-mermaid)
- Pro: Schnellster Build (~5s fuer 50 Seiten), minimaler Output
- Pro: Sehr gutes Default-Design (aehnlich den Vorbildern Stripe/Tailwind)
- Pro: i18n nativ (locale-basierte Ordnerstruktur /de/, /en/)
- Pro: Frontmatter-basierte Seiten-Konfiguration (titel, description, sidebar)
- Pro: GitHub Pages Support via vitepress build + deploy
- Con: Vue-Ecosystem (nicht relevant da kein Custom-Code geplant, nur Markdown)
- Con: Weniger flexibel als Astro fuer Non-Docs-Seiten (Homepage)

### Option 2: Astro Starlight

Astro-basiertes Doku-Framework. Content Collections, Islands Architecture. Bekannt durch Astro Docs, Starlight Docs.

- Pro: Astro Islands fuer interaktive Elemente (falls spaeter benoetigt)
- Pro: Gutes Default-Design mit Sidebar/Search/i18n
- Pro: Content Collections mit Type-Safety
- Pro: Sehr flexibel fuer Custom-Seiten (Homepage, About, Roadmap)
- Con: Komplexerer Setup als VitePress (astro.config.mjs + starlight plugin)
- Con: Langsamerer Build als VitePress (~15-20s)
- Con: i18n-Setup aufwaendiger (nicht so nativ wie VitePress)
- Con: Mermaid braucht separates Rehype-Plugin + Konfiguration

### Option 3: Docusaurus

React-basierter SSG von Meta. Markdown + MDX. Bekannt durch React Docs, viele OSS-Projekte.

- Pro: Sehr ausgereift, grosse Community
- Pro: Versioning eingebaut (irrelevant fuer Vault Operator)
- Pro: i18n eingebaut (Crowdin-Integration)
- Con: React-Overhead im Output (groesseres Bundle)
- Con: Langsamster Build der drei Optionen (~30s+)
- Con: Opinionated Struktur (sidebars.js, docusaurus.config.js) -- mehr Boilerplate
- Con: Design weniger modern als VitePress/Starlight (erfordert mehr Custom CSS)
- Con: Schwerster Output (React Runtime im Client)

## Decision

**Vorgeschlagene Option:** VitePress

**Begruendung:**

VitePress ist die beste Wahl fuer Vault Operator weil:

1. **Minimaler Overhead:** Schnellster Build, kleinstes Output, einfachstes Setup. Perfekt fuer Ein-Personen-Projekt.
2. **Best-in-Class Default-Design:** Das Default-Theme sieht bereits sehr nah an den Vorbildern aus (Stripe, Tailwind). Wenig Custom CSS noetig.
3. **Alle Features out of the box:** Sidebar, Suche (MiniSearch), i18n, Dark/Light, Frontmatter -- alles nativ, keine Plugin-Jagd.
4. **Markdown-First:** Kein MDX/JSX-Zwang. Plain Markdown mit optionalem Vue fuer Sonderfaelle.
5. **Homepage-Flexibilitaet:** VitePress unterstuetzt Custom Layouts fuer die Homepage (hero, features, roadmap) neben dem Standard-Docs-Layout.
6. **Mermaid:** vitepress-plugin-mermaid ist ausgereift und weit verbreitet.

Astro Starlight waere die zweite Wahl -- flexibler, aber komplexer. Docusaurus ist zu schwer und zu opinionated.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Content-Aenderungen in Minuten statt Stunden (Markdown statt HTML)
- Professionelles Design out of the box
- i18n, Suche, Navigation ohne Custom-Code
- Dual-Use: Markdown-Quellen direkt als Vault Operator-Skill nutzbar

### Negative
- Migration der 30 bestehenden HTML-Seiten zu Markdown (einmaliger Aufwand)
- Bestehendes Custom CSS (1426 Zeilen) muss adaptiert werden (VitePress hat eigenes CSS-System)
- Vue-Dependency im Build-Tooling (irrelevant fuer Content-Authoring)

### Risks
- URL-Migration: VitePress generiert Clean URLs (/getting-started/ statt getting-started.html). Bestehende .html-Links brauchen Redirects. Mitigation: 404.html Fallback + meta-refresh Redirects.

## Implementation Notes

- `docs/` Verzeichnis wird zu VitePress-Projekt (docs/.vitepress/config.ts)
- Bestehende HTML-Seiten werden zu Markdown konvertiert
- CNAME (pssah4.github.io/vault-operator) bleibt erhalten
- GitHub Actions Workflow fuer automatischen Build + Deploy
- Custom CSS wird in docs/.vitepress/theme/custom.css migriert

## Related Decisions

- ADR-57: Informationsarchitektur (Seitenstruktur)

## References

- https://vitepress.dev
- FEAT-17-00-ssg-migration.md
- BA-10-website-documentation.md
