---
title: Office Documents
description: Create PPTX, DOCX, and XLSX presentations and documents from your notes.
---

# Office documents

Vault Operator can create PowerPoint presentations, Word documents, and Excel spreadsheets directly inside your vault. It can also read existing office files and use them as context in conversations.

## What you can create

| Format | Tool | What it produces |
|--------|------|-----------------|
| PPTX | `create_pptx` | PowerPoint presentations with slides, text, images, layouts |
| DOCX | `create_docx` | Word documents with headings, paragraphs, lists, tables, images |
| XLSX | `create_xlsx` | Excel spreadsheets with multiple sheets, formatting, and formulas |

## Simple creation

The easiest path is to describe what you want:

- *"Create a presentation about our Q1 results based on my notes in Reports/"*
- *"Turn this note into a Word document with proper headings and a table of contents"*
- *"Create a spreadsheet tracking my reading list with columns for title, author, status, and rating"*

The agent reads the relevant notes, structures the content, and writes the file into your vault.

:::tip Start simple
You don't need to spell out exact slide layouts or cell formatting. The agent picks reasonable defaults. Refine afterwards by saying "make the title slide more prominent" or "add a chart for the monthly data."
:::

## Template workflow for presentations

For corporate decks, Vault Operator supports a template-based pipeline. This is the best way to create presentations that match your organization's design.

### How it works

1. You provide a `.pptx` template file in your vault
2. The agent scans every slide layout, placeholder, and shape in the template (stored as a TemplateCatalog)
3. An internal LLM call maps your source material to the template's structure, planning content for each slide and shape
4. The final presentation is built using your template's exact design

### Step by step

1. Attach or mention your template: *"Use @corporate-template.pptx to create a presentation about our product roadmap"*
2. The agent runs `plan_presentation` internally. You'll see it in the activity block.
3. It writes the final `.pptx` file with your content in your template's design

### The 6-step office workflow

For best results, Vault Operator follows a built-in workflow:

1. Context: gather source material from your vault
2. Template: analyze the provided template (or use ad-hoc mode)
3. Plan: map content to slides and shapes
4. Generate: build the document
5. Verify: check for missing placeholders or layout issues
6. Deliver: save to your vault and confirm

:::info Two modes
Ad-hoc mode creates presentations from scratch without a template (using PptxGenJS). Template mode uses your corporate `.pptx` file to keep brand consistency. The agent picks the right mode based on whether you provide a template.
:::

## Reading office documents

Vault Operator can parse existing office files and use their content in conversations:

- PPTX: text from all slides
- DOCX: headings, paragraphs, tables
- XLSX: sheet data and formulas
- PDF: text content
- CSV: structured data

How to use it:
- Drag and drop an office file into the chat
- Use `@filename.pptx` to mention it
- Ask *"Summarize the attached spreadsheet"* or *"What are the key points in this presentation?"*

The agent uses the `read_document` tool to parse the file, then works with the extracted content like any other note.

## Self-check after generation

After `create_pptx`, `create_docx`, or `create_xlsx` writes a file, the tool runs a structural validation pass: required shapes filled, no leftover placeholders, group consistency, no empty slides. The result comes back in the tool output so the agent can fix gaps in a follow-up edit before you open the file. This is a structural check, not a visual render.

## Tips for better documents

1. Provide source material. The more context you give (notes, data, outlines), the better the output.
2. Be specific about structure. "5 slides with an intro, 3 content slides, and a summary" gives much better results than "make a presentation."
3. Use templates for consistency. If you create presentations regularly, invest in a good template. The agent reuses it cleanly every time.
4. Iterate. After the first version, ask the agent to adjust specific slides or sections instead of regenerating everything.
5. Check the activity block. It shows the plan the agent built, so you can see why it made the choices it did.

## Next steps

- [Skills, Rules & Workflows](/guides/skills-rules-workflows): Automate your document creation process
- [Connectors](/guides/connectors): Hook up external tools and data sources
- [Multi-Agent & Tasks](/guides/multi-agent): Hand off document tasks to sub-agents
