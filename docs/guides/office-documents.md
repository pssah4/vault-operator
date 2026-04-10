---
title: Office Documents
description: Create PPTX, DOCX, and XLSX presentations and documents from your notes.
---

# Office documents

Obsilo can create PowerPoint presentations, Word documents, and Excel spreadsheets directly inside your vault. It can also read existing office files and use them as context in conversations.

## What you can create

| Format | Tool | What it produces |
|--------|------|-----------------|
| PPTX | `create_pptx` | PowerPoint presentations with slides, text, images, and layouts |
| DOCX | `create_docx` | Word documents with headings, paragraphs, lists, tables, and images |
| XLSX | `create_xlsx` | Excel spreadsheets with multiple sheets, formatting, and formulas |

## Simple creation

The easiest way is to describe what you want:

- *"Create a presentation about our Q1 results based on my notes in Reports/"*
- *"Turn this note into a Word document with proper headings and a table of contents"*
- *"Create a spreadsheet tracking my reading list with columns for title, author, status, and rating"*

The agent reads the relevant notes, structures the content, and generates the file in your vault.

:::tip Start simple
You don't need to specify exact slide layouts or cell formatting. The agent makes reasonable choices. You can refine afterwards by saying "make the title slide more prominent" or "add a chart for the monthly data."
:::

## Template workflow for presentations

For professional or corporate presentations, Obsilo supports a template-based pipeline. This is the best way to create presentations that match your organization's design.

### How it works

1. You provide a `.pptx` template file in your vault
2. The agent scans every slide layout, placeholder, and shape in the template (stored as a TemplateCatalog)
3. An internal LLM call maps your source material to the template's structure, planning content for each slide and shape
4. The final presentation is built using your template's exact design

### Step by step

1. Attach or mention your template: *"Use @corporate-template.pptx to create a presentation about our product roadmap"*
2. The agent runs `plan_presentation` internally. You'll see it in the activity block.
3. It creates the final `.pptx` file with your content in your template's design

### The 6-step office workflow

For best results, Obsilo follows a built-in workflow:

1. Context: Gather source material from your vault
2. Template: Analyze the provided template (or use ad-hoc mode)
3. Plan: Map content to slides and shapes
4. Generate: Build the document
5. Verify: Check for missing placeholders or layout issues
6. Deliver: Save to your vault and confirm

:::info Two modes
Ad-hoc mode creates presentations from scratch without a template (using PptxGenJS). Template mode uses your corporate `.pptx` file to maintain brand consistency. The agent picks the right mode based on whether you provide a template.
:::

## Reading office documents

Obsilo can parse existing office files and use their content in conversations:

- PPTX: Extracts text from all slides
- DOCX: Extracts headings, paragraphs, tables
- XLSX: Extracts sheet data and formulas
- PDF: Extracts text content
- CSV: Reads structured data

How to use it:
- Drag and drop an office file into the chat
- Use `@filename.pptx` to mention it
- Ask: *"Summarize the attached spreadsheet"* or *"What are the key points in this presentation?"*

The agent uses the `read_document` tool to parse the file, then works with the extracted content like any other note.

## Visual QA with LibreOffice

If you have LibreOffice installed on your system, Obsilo can render your generated presentations as images for a visual quality check.

The `render_presentation` tool converts each slide to an image so the agent can review layouts, text overflow, and visual consistency before you open the file yourself.

:::warning LibreOffice required
Visual QA only works if LibreOffice is installed and accessible from the command line. Without it, the agent skips the visual check and relies on structural validation only.
:::

## Tips for better documents

1. Provide source material. The more context you give (notes, data, outlines), the better the output.
2. Be specific about structure. "5 slides with an intro, 3 content slides, and a summary" gives better results than "make a presentation."
3. Use templates for consistency. If you create presentations regularly, invest in a good template. The agent reuses it perfectly every time.
4. Iterate. After the first version, ask the agent to adjust specific slides or sections rather than regenerating everything.
5. Check the activity block. It shows the plan the agent created, so you can understand its choices.

## Next steps

- [Skills, Rules & Workflows](/guides/skills-rules-workflows): Automate your document creation process
- [Connectors](/guides/connectors): Connect external tools and data sources
- [Multi-Agent & Tasks](/guides/multi-agent): Delegate document tasks to sub-agents
