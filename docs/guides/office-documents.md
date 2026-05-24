---
title: Office Documents (Beta)
description: Create PPTX, DOCX, and XLSX files from your notes. Read existing Office files as conversation context. The creation side is still maturing.
---

# Office documents

:::warning Beta feature
Office document creation is a beta feature. Reading existing Office files (the parsing side used by `/ingest`, `@`-mentions, and chat attachments) is solid and production-ready. Creation produces working files, but the visual quality is closer to a clean default deck than to a brand-matched corporate output. Read the [What works today](#what-works-today) and [What does not work yet](#what-does-not-work-yet) sections before relying on it for client deliverables.
:::

Vault Operator can read existing Office files (PPTX, DOCX, XLSX, PDF, CSV, JSON) and use their content as context in conversations. It can also create PPTX, DOCX, and XLSX files from structured input.

## Reading Office files (production-ready)

Drop a file into the chat, mention it with `@filename.pptx`, or ask the agent to read a vault file. Parsing happens automatically:

- **PPTX**: text from all slides plus speaker notes
- **DOCX**: headings, paragraphs, tables
- **XLSX**: sheet names, cell data, formulas
- **PDF**: page text with structure preserved
- **CSV / JSON**: structured data

Once parsed, the content behaves like any other note in the conversation. The agent can summarize it, extract action items, compare it to other material, or feed it into an ingest workflow.

For deeper capture into the vault, see [Knowledge ingest](/guides/knowledge-ingest). PDFs and Office files are first-class sources for `/ingest` and `/ingest-deep`.

## Creating Office files (beta)

### What works today

The plugin ships three creation tools:

- **`create_pptx`** writes a `.pptx` file. It uses PptxGenJS internally and supports five fixed layouts: title, section, content, two-column, closing. You can theme the deck with colors and fonts (primary, accent, background, text colors plus a font family). Bullets, tables, images, and speaker notes are supported.
- **`create_docx`** writes a `.docx` file with headings, paragraphs, bullet lists, numbered lists, and tables. Output is clean, readable, and reliable.
- **`create_xlsx`** writes an `.xlsx` file with sheets, headers, data rows, formulas, and column widths.

A planning helper, `plan_presentation`, runs an internal AI call that analyzes source material and proposes a complete deck plan (titles, content per slide, layout choices) before generation. You review the plan in the chat, request adjustments, and then `create_pptx` consumes the plan.

Three default themes ship with the plugin: **executive** (dark), **modern** (light), **minimal** (black and white). Pick one in the agent's planning step.

### What does not work yet

The plugin does not clone real PowerPoint templates. Earlier versions tried this with the `pptx-automizer` library; after extensive iteration the approach was dropped in favor of the simpler PptxGenJS path. Practical consequences for you:

- Corporate `.pptx` templates with custom slide masters, branded layouts, and complex shape arrangements are not reproduced. The output uses one of the five built-in layouts with your chosen theme colors and fonts.
- Visual rendering of the generated PPTX for layout verification (the `render_presentation` step you may see referenced in some skills) is not active in this version. The library code for it exists, but no tool exposes it yet.
- A template ingest workflow (`ingest_template`) for deriving custom themes from a `.pptx` is referenced in the bundled office workflow skill, but the tool is not present in the current build. Stick with the three default themes.

For brand-critical decks, the realistic recipe today is:

1. Generate a draft with `create_pptx` using the closest default theme.
2. Open the file in PowerPoint or Keynote.
3. Apply your real template via PowerPoint's "Reset Layout" or by copying slides into a template file.

This works, but it adds manual steps. If brand-perfect output matters, expect to spend time on the polish pass.

### Tips for getting useful output

1. **Provide a real source.** The deeper your source material (notes, data, an outline), the better the plan and the result.
2. **Be explicit about structure.** "Five slides: intro, three content slides, summary" beats "make a presentation."
3. **Use `plan_presentation` first.** It surfaces the deck structure before you commit to a file. You can correct course before any binary is written.
4. **Iterate per slide.** After the first version, ask the agent to adjust specific slides instead of regenerating the whole deck.
5. **Keep expectations matched to the tool.** Use this for internal docs, drafts, agenda decks, structured handouts. For external pitch decks and client deliverables, treat the generated file as a starting point you finish manually.

## Example prompts

The honest happy path looks like this:

- "Create a Word document from this note with headings for each section and a table at the end."
- "Turn the data in `Reports/Q1.md` into an Excel file with one sheet per region and a total row at the bottom."
- "Build a five-slide internal status presentation about the EnBW project from my meeting notes. Use the modern theme."

## How to read the activity block

When the agent runs the office workflow, the activity block shows the steps in order: source reading, `plan_presentation` (for decks), the create tool, and any self-check output. The self-check is a structural pass (are required fields filled, no empty slides, no stray placeholder text). It is not a visual render. Reviewing the file after writing is still your job.

## Where this is going

The creation side is a work in progress. Two paths are open: invest further in real template cloning (re-attempting `pptx-automizer` or moving to a different engine), or stay on the PptxGenJS path and grow the layout library to cover more design patterns. Direction depends on user feedback. If brand-matched output is your blocker, open an issue or discussion on GitHub.

## Related

- [Knowledge ingest guide](/guides/knowledge-ingest): the reading side, where PPTX, DOCX, XLSX, and PDF feed structured notes back into the vault.
- [Tools reference](/reference/tools): the full input schema for `create_pptx`, `create_docx`, `create_xlsx`, and `plan_presentation`.
- [Office pipeline concept](/concepts/office-pipeline): the architecture of the creation pipeline and why template cloning was hard.
