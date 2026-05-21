/**
 * Tool Routing Section
 *
 * Domain-specific routing rules that the cost-heuristics section doesn't
 * cover (web vs vault, format routing, plugin routing, citation rules).
 * General "use cheap tool first / no sub-agents / stop when done" guidance
 * lives in `cost-aware/` (ADR-090) -- DO NOT duplicate it here.
 *
 * Target: <=2,000 chars (down from 4,500).
 */

export function getToolRoutingSection(configDir: string): string {
    return `TOOL ROUTING (domain-specific; general cost rules are in COST-AWARE EXECUTION above)

1. WEB vs VAULT -- check the request before any tool: keywords "im Internet", "online", "aktuell", "neueste", "latest", "current", "recherchiere" -> web_search (enable via update_settings if unavailable). NEVER use vault tools for external info.
2. CHECK CONTEXT FIRST. <vault_context> shows vault structure; <context> in the user message has the active file path. Use them before list_files / get_vault_stats / asking the user.
3. PARALLEL BY DEFAULT. Independent reads in one step.
4. NO REDUNDANT READS. Don't read_file for files already in conversation.
5. READ BEFORE EDIT. Always read_file before edit_file / write_file on existing files.
6. DEDICATED FORMAT TOOLS. Never use write_file / evaluate_expression for:
   .pptx -> create_pptx | .docx -> create_docx | .xlsx -> create_xlsx
   .canvas -> generate_canvas | .base -> create_base | .excalidraw.md -> create_excalidraw
   .pdf export -> workspace:export-pdf (Tier 1) or pandoc-pdf recipe (Tier 2). Never write raw .pdf.
7. PLUGIN ROUTING:
   (a) External CLI (Pandoc, Mermaid, ffmpeg, LaTeX) -> execute_recipe
   (b) Obsidian-native commands (templates, daily notes) -> execute_command
   (c) Plugin JS API (Dataview, Omnisearch, MetaEdit) -> call_plugin_api
   (d) Unsure? Read the plugin's SKILL.md (in the plugin's skill folder). Disabled? Call enable_plugin yourself.
   Plugin config: check the plugin's SKILL.md for the settings schema, then write ${configDir}/plugins/{id}/data.json directly.
8. SEARCH PICK (when Tier 2/3 search is justified):
   external/current -> web_search | topical vault -> semantic_search | tag filter -> search_by_tag | exact text -> search_files | structured .base -> query_base
9. CITE WITH WIKILINKS [[Note Name]]. update_frontmatter > edit_file for YAML.
10. attempt_completion ONLY for multi-step write tasks (questions/read-only: just write the answer).
11. EXTERNALIZED RESULTS. Large tool results are saved to temp files; the compact summary in the result is often sufficient. Only read the full file when you need details.`;
}
