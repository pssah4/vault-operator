# ADR-57: Informationsarchitektur & Seitenstruktur

**Date:** 2026-04-01
**Deciders:** Sebastian Hanke

## Context

Die bestehende Website hat eine flache, feature-orientierte Struktur: 13 User-Seiten und 11 Dev-Seiten in einer einzigen Sidebar. Bei 30+ geplanten Seiten wird diese Struktur unuebersichtlich. Die neue Architektur muss Progressive Disclosure umsetzen (Basics -> Intermediate -> Advanced) und zwei getrennte Zielgruppen bedienen (Non-Tech User "Alex" und Curious Engineer "Jordan").

Gleichzeitig muessen die Markdown-Quellen des User Guides als Vault Operator-Skill funktionieren (Dual-Use). Das beeinflusst die Granularitaet und Struktur der Seiten.

**Triggering ASR:**
- ASR-2: Progressive Disclosure in Navigation (FEAT-17-01)
- ASR-3: Dual-Use Markdown (FEAT-17-00, FEAT-17-02)
- ASR-4: Token-Budget Doku-Skill (FEAT-17-02)
- Quality Attributes: Usability, Wartbarkeit

## Decision Drivers

- **Progressive Disclosure:** User sollen stufenweise von einfach zu komplex gefuehrt werden
- **Zwei Zielgruppen:** User Guide und Dev Docs muessen klar getrennt sein
- **Findbarkeit:** Konkrete Fragen muessen ueber Suche oder max. 2 Klicks erreichbar sein
- **Token-Effizienz:** Doku-Skill darf nicht den gesamten Guide laden (~50k Tokens), muss selektiv sein
- **Wartbarkeit:** Seitenstruktur soll sich aus der Ordnerstruktur ergeben (kein manuelles sidebar.json)
- **URL-Kompatibilitaet:** Bestehende Pfade sollen moeglichst erhalten bleiben

## Considered Options

### Option 1: Themen-basierte Gruppierung (empfohlen)

4 Gruppen im User Guide, Seiten nach Themen-Cluster statt nach Features:

```
guide/
  getting-started.md          -- Installation, erstes Modell, erster Chat
  first-conversation.md       -- Chat-Grundlagen, Modes, Kontext verstehen
  choosing-a-model.md         -- Provider-Uebersicht, Empfehlungen, Kosten

  working-with-obsilo/
    chat-interface.md          -- Attachments, @-Mentions, Tool-Picker, History
    vault-operations.md        -- Lesen, Schreiben, Suchen, Frontmatter, Backlinks
    knowledge-discovery.md     -- Semantic Search, Knowledge Graph, Implicit Connections
    memory-personalization.md  -- 3-Tier Memory, Onboarding, Chat-Linking
    safety-control.md          -- Permissions, Checkpoints, Approvals, Audit Log

  advanced/
    skills-rules-workflows.md  -- Eigene Verhaltensregeln und Automatisierungen
    office-documents.md        -- PPTX, DOCX, XLSX aus dem Chat (+ Templates)
    connectors.md              -- MCP Client, MCP Server, Remote Access
    multi-agent.md             -- Sub-Tasks, Task Extraction
    self-development.md        -- Sandbox, Dynamic Tools, Plugin API

  reference/
    tools.md                   -- Alle Tools tabellarisch
    providers.md               -- Alle Provider mit Setup-Anleitung
    settings.md                -- Alle Einstellungen erklaert
    troubleshooting.md         -- FAQ, haeufige Probleme

dev/
  index.md                     -- Architecture Overview (Diagramm)
  agent-loop.md
  tool-pipeline.md
  system-prompt.md
  knowledge-layer.md           -- NEU: SQLite, Vector, Graph, Reranking
  memory-system.md
  office-pipeline.md           -- NEU: PPTX Template Engine, plan_presentation
  provider-auth.md             -- NEU: Copilot OAuth, Kilo Device Auth
  mcp-architecture.md          -- NEU: McpBridge, Tool-Tier-Mapping, Server
  governance.md
  self-development.md          -- NEU: 5 Stufen, Sandbox, Dynamic Tools
  mode-system.md
  ui-architecture.md
  vault-dna.md
```

- Pro: Progressive Disclosure natuerlich abgebildet (3 Ordner = 3 Schwierigkeitsgrade)
- Pro: Themen-Cluster sind intuitiver als Feature-Namen ("Knowledge Discovery" statt "FEAT-15-00")
- Pro: VitePress generiert Sidebar automatisch aus Ordnerstruktur
- Pro: Doku-Skill kann pro Ordner/Seite selektiv laden (Token-Budget)
- Con: Bestehende URLs aendern sich (getting-started.html -> guide/getting-started)

### Option 2: Flache Struktur mit manuellen Gruppen

Alle Seiten in einem Ordner, Gruppierung nur via Sidebar-Config:

```
guide/
  getting-started.md
  first-conversation.md
  chat-interface.md
  vault-operations.md
  ... (20+ Dateien flach)
```

- Pro: Einfachste Dateistruktur
- Pro: URLs kuerzer (/guide/getting-started statt /guide/working-with-obsilo/chat-interface)
- Con: Sidebar muss manuell gruppiert werden (sidebar.ts Konfiguration)
- Con: 20+ Dateien in einem Ordner ist unuebersichtlich im Filesystem
- Con: Keine natuerliche Abbildung von Progressive Disclosure

### Option 3: Feature-orientiert (Status Quo)

Seiten direkt nach Features benannt, wie bisher:

```
guide/
  semantic-search.md
  memory.md
  modes.md
  permissions.md
  mcp-servers.md
  ...
```

- Pro: 1:1 Mapping zu bestehender Struktur (minimale URL-Aenderungen)
- Con: Keine Progressive Disclosure
- Con: Neue User wissen nicht wo sie anfangen sollen
- Con: "mcp-servers" sagt einem Non-Tech-User nichts

## Decision

**Vorgeschlagene Option:** Option 1 -- Themen-basierte Gruppierung

**Begruendung:**

Die Themen-basierte Gruppierung loest alle drei Kernprobleme gleichzeitig:

1. **Progressive Disclosure:** Die Ordnerstruktur (getting-started -> working-with -> advanced -> reference) bildet den Lernpfad natuerlich ab.
2. **Findbarkeit:** Themen-Cluster ("Knowledge Discovery", "Office Documents") sind fuer Non-Tech-User intuitiver als Feature-Namen.
3. **Dual-Use (Skill):** Der Doku-Skill kann gezielt einzelne Seiten laden (z.B. nur `knowledge-discovery.md` bei einer Frage zu Semantic Search), statt den gesamten Guide zu injizieren. ~2000-4000 Tokens pro Seite vs. ~50.000 fuer den gesamten Guide.

Die URL-Aenderungen werden durch Redirect-Mappings abgefangen (getting-started.html -> /guide/getting-started).

**Doku-Skill-Strategie:**

Ein uebergeordneter Skill (`vault-operator-guide`) mit Keyword-Trigger-Sets pro Seite:
```yaml
name: vault-operator-guide
description: Answers questions about Vault Operator usage, setup, and features
keywords: [help, how to, setup, configure, getting started, ...]
sections:
  - file: getting-started.md
    triggers: [install, setup, getting started, first, begin]
  - file: knowledge-discovery.md
    triggers: [semantic search, graph, connections, knowledge, find notes]
  - file: office-documents.md
    triggers: [pptx, docx, xlsx, presentation, document, office]
```

Der SkillsManager laedt nur die zum Query passende Sektion (~2000-4000 Tokens) in den System-Prompt. Das bestehende Keyword-Matching-System reicht dafuer aus.

**Diagramm-Strategie (ASR-5):**

Mermaid fuer Dev Docs. VitePress rendert Mermaid nativ via Plugin zu SVG beim Build. Vorteile:
- Diagramme in Markdown (wartbar, versionierbar)
- Kein externer Tool-Chain
- Dark/Light Theme automatisch unterstuetzt

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- User werden stufenweise durch die Doku gefuehrt (keine Ueberforderung)
- Dev Docs klar getrennt (eigener Bereich /dev/)
- Doku-Skill kann Token-effizient arbeiten (selektives Laden)
- VitePress generiert Sidebar automatisch aus Ordnerstruktur

### Negative
- Alle bestehenden URLs aendern sich (Redirects noetig)
- Bestehende 13 User-Seiten muessen in die neue Struktur umgemappt werden (manche werden zusammengefuehrt, manche gesplittet)

### Risks
- URL-Redirects koennten SEO-Impact haben. Mitigation: Saubere 301 Redirects, Google Search Console aktualisieren.
- Themen-Zuschnitt koennte sich als falsch erweisen. Mitigation: VitePress erlaubt Umstrukturierung durch Dateien verschieben.

## Implementation Notes

### URL-Redirect-Strategie

Fuer jeden alten Pfad wird eine minimale HTML-Datei mit `<meta http-equiv="refresh">` im VitePress `public/`-Verzeichnis platziert. VitePress rewrites funktionieren nur im Dev-Server, nicht im Static Build auf GitHub Pages.

### URL-Redirect-Mapping (Alt -> Neu)

| Alter Pfad | Neuer Pfad |
|------------|------------|
| /getting-started.html | /guide/getting-started |
| /chat-interface.html | /guide/working-with-obsilo/chat-interface |
| /memory.html | /guide/working-with-obsilo/memory-personalization |
| /modes.html | /guide/first-conversation (integriert) |
| /permissions.html | /guide/working-with-obsilo/safety-control |
| /rules-skills-workflows.html | /guide/advanced/skills-rules-workflows |
| /semantic-search.html | /guide/working-with-obsilo/knowledge-discovery |
| /tools.html | /guide/reference/tools |
| /providers.html | /guide/reference/providers |
| /mcp-servers.html | /guide/advanced/connectors |
| /remote-access.html | /guide/advanced/connectors (integriert) |
| /checkpoints.html | /guide/working-with-obsilo/safety-control (integriert) |
| /settings-reference.html | /guide/reference/settings |
| /dev/*.html | /dev/* (Pfade bleiben aehnlich) |

### VitePress Config Skeleton

```typescript
// docs/.vitepress/config.ts
export default defineConfig({
  title: 'Vault Operator',
  description: 'Agentic AI for Obsidian',
  locales: {
    root: { label: 'English', lang: 'en' },
    de: { label: 'Deutsch', lang: 'de' },
  },
  themeConfig: {
    sidebar: {
      '/guide/': [
        { text: 'Getting Started', items: [...] },
        { text: 'Working with Vault Operator', items: [...] },
        { text: 'Advanced', items: [...] },
        { text: 'Reference', items: [...] },
      ],
      '/dev/': [
        { text: 'Architecture', items: [...] },
      ],
    },
    search: { provider: 'local' },
  },
})
```

## Related Decisions

- ADR-56: SSG Selection (VitePress)

## References

- FEAT-17-01-user-guide.md
- FEAT-17-02-doku-skill.md
- FEAT-17-03-developer-docs.md
- BA-10-website-documentation.md
