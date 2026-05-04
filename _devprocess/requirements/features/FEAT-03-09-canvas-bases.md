# FEATURE: Canvas & Bases Tools

**Source:** `src/core/tools/vault/GenerateCanvasTool.ts`, `CreateBaseTool.ts`, `QueryBaseTool.ts`, `UpdateBaseTool.ts`

## Summary
Four tools for Obsidian's visual/database features: `generate_canvas` creates `.canvas` files visualizing note relationships; `create_base` / `update_base` create and manage `.base` database view files; `query_base` reads the notes matched by a Bases filter.

---

## generate_canvas

### Purpose
Create an Obsidian Canvas (`.canvas`) file that visualizes notes and their wikilink connections as a spatial graph.

### Parameters
- `output_path: string` — path for the `.canvas` file
- `mode: 'folder' | 'tag' | 'backlinks' | 'files'`
- `source?: string` — folder path (mode=folder), tag (mode=tag), or note path (mode=backlinks)
- `files?: string[]` — explicit file list (mode=files)
- `max_notes?: number` — cap on notes in canvas (default varies by mode)
- `draw_edges?: boolean` — whether to draw wikilink arrows (default true)

### Modes
| Mode | Source Selection | Use Case |
|------|-----------------|----------|
| `folder` | All notes in a folder | Map a project or topic area |
| `tag` | All notes with a specific tag | Visualize a topic cluster |
| `backlinks` | All notes linking to source | See what references a note |
| `files` | Explicit list | Custom canvas from specific notes |

### Layout
- Grid layout: 4 columns, 250×80px cards, 40px horizontal gap, 100px vertical gap
- `x, y` coordinates calculated per grid position
- Canvas JSON format: `{ nodes: [...], edges: [...] }` (Obsidian Canvas spec)

### Edge Drawing
When `draw_edges=true`: scans each note's wikilinks (via `MetadataCache.resolvedLinks`), draws arrows between nodes that are both in the canvas. Only draws edges for notes already in the canvas (no out-of-canvas references).

### Output Format
Standard Obsidian `.canvas` JSON:
```json
{
  "nodes": [{"id": "...", "type": "file", "file": "path.md", "x": 0, "y": 0, "width": 250, "height": 80}],
  "edges": [{"id": "...", "fromNode": "...", "toNode": "..."}]
}
```

---

## create_base

### Purpose
Create an Obsidian Bases (`.base`) database view file that shows notes matching filter conditions.

### Parameters
- `path: string` — output path for `.base` file
- `view_name: string` — name of the view
- `filter_property?: string` — frontmatter property to filter on
- `filter_values?: string[]` — values to match (containsAny logic)
- `columns?: string[]` — frontmatter properties to show as columns
- `sort_property?: string` — property to sort by
- `sort_direction?: 'asc' | 'desc'`
- `exclude_templates?: boolean` — exclude notes with `template: true` frontmatter

### Output Format
YAML-based `.base` format (Obsidian Bases spec):
```yaml
version: 1
views:
  - name: "My View"
    type: table
    filter:
      conditions:
        - property: status
          operator: containsAny
          value: ["active", "in-progress"]
    columns:
      - property: title
      - property: status
      - property: due
    sort:
      - property: due
        direction: asc
```

---

## update_base

### Purpose
Add a new view or replace a named view in an existing `.base` file.

### Parameters
Same as `create_base` minus `path` (file must already exist).

### Behavior
- Reads existing `.base` file
- Finds view block matching `view_name` using regex
- Replaces it (or appends new view if name not found)
- Writes back

---

## query_base

### Purpose
Execute a Bases filter against the vault and return the matching notes with their frontmatter.

### Parameters
- `path: string` — path to `.base` file
- `view_name?: string` — specific view to query (defaults to first view)
- `limit?: number` — max notes to return (default 50)

### Implementation
1. Parses `.base` YAML (text-based regex parsing, not full YAML parser)
2. Evaluates filter conditions against all vault notes:
   - `containsAny` — frontmatter property value matches any of the list
   - `contains` — string contains match
   - `==` — exact match
   - `file.name.contains` — filename contains string
   - Negation `!` prefix on operator
3. Reads frontmatter of matched notes
4. Returns formatted result: `path | property1 | property2 | ...`

---

## Key Files
- `src/core/tools/vault/GenerateCanvasTool.ts` — 267 lines
- `src/core/tools/vault/CreateBaseTool.ts` — 152 lines
- `src/core/tools/vault/QueryBaseTool.ts` — 265 lines
- `src/core/tools/vault/UpdateBaseTool.ts` — 155 lines

## Dependencies
- `ToolExecutionPipeline` — all classified as `vault-change` (require approval unless `autoApproval.vaultChanges = true`)
- `app.metadataCache.resolvedLinks` — used by `generate_canvas` for edge detection
- `app.vault.getMarkdownFiles()` — used by `query_base` and canvas modes
- `create_base` / `update_base` require Obsidian Bases plugin (built into Obsidian 1.6+)

## Configuration
No specific settings — inherits vault-change approval settings.

## Known Limitations / Edge Cases
- `query_base` uses regex-based YAML parsing (not a real YAML parser) — complex filter expressions may not parse correctly.
- `generate_canvas` grid layout is static — no force-directed or hierarchical layout. For large note sets, layout can be unwieldy.
- `update_base` view block detection uses regex on raw text — fragile if YAML formatting differs from expected.
- Canvas edge drawing only draws edges between notes already in the canvas — notes outside the canvas that link to canvas nodes are not shown.
- `query_base` filter evaluation is a custom implementation, not the official Obsidian Bases engine — results may differ from what Obsidian's UI shows.
