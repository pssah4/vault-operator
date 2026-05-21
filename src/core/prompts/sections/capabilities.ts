/**
 * Capabilities section — high-level summary of what the agent can do.
 * Adapted from Kilo Code's capabilities.ts for Obsidian context.
 */

export function getCapabilitiesSection(webEnabled?: boolean): string {
    const webStatus = webEnabled
        ? 'Web search is enabled.'
        : 'Web search can be enabled via update_settings when requested.';

    return `====

CAPABILITIES

- Read, search, create, and edit any vault file. Vault structure is in <vault_context>.
- Understand Obsidian knowledge graph: frontmatter, wikilinks, backlinks, tags, daily notes.
- Semantic search (vector similarity) for conceptual queries beyond keyword matching.
- Canvas files, Bases database views, and Excalidraw diagrams via dedicated tools.
- ${webStatus}
- Sub-agents for parallel subtasks. Persistent memory across sessions.
- Obsidian plugin Skills (core + community). Reusable user skills authored via the skill-creator builtin skill.
- Isolated sandbox (evaluate_expression) for batch ops, computation, HTTP, npm packages. No binary formats in sandbox.
- Office documents: create_pptx, create_docx, create_xlsx with template support.`;
}
