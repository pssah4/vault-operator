---
name: office-workflow
description: Professional workflow for creating Office documents (PPTX, DOCX, XLSX) with structured process, design principles, and quality standards
trigger: pr[aä]sentation.*erstell|erstell.*pr[aä]sentation|presentation.*creat|creat.*presentation|folie.*erstell|erstell.*folie|deck.*erstell|powerpoint|pptx|dokument.*erstell|erstell.*dokument|document.*creat|docx|word.*erstell|spreadsheet|tabelle.*erstell|xlsx|excel
source: bundled

---

# Office Document Workflow

Follow these 5 steps IN ORDER for presentations. Do NOT skip steps.

## Step 1: CONTEXT (ASK and STOP)

Ask the user:
- **Goal**: What should the audience learn, decide, or do?
- **Audience**: Who? What do they know?
- **Deck mode**: Speaker [S] (max 25 words/slide) or Reading [R] (max 170 words/slide)?
- **Material**: Which note or document contains the source content?

STOP. Wait for answer.

## Step 2: THEME

Pick a built-in theme: **Executive** (dark), **Modern** (light), or **Minimal** (b/w).
The plugin generates slides in adhoc mode (HTML 1280x720 canvas with data-object elements).

Corporate-template ingestion is currently not available -- if the user asks for a
specific corporate look, stick to one of the three built-in themes plus theme colors
adjusted in the `theme` argument of create_pptx.

## Step 3: PLAN

Use the presentation-design skill to outline the slides:
- One key message per slide
- Slide-type sequence (title, section, content, kpi, closing) tuned to the deck mode

Show the outline to the user before generating. Wait for feedback.

## Step 4: GENERATE

Call create_pptx with adhoc slides. Each slide carries title, subtitle, body or
bullets, plus optional table/image, and a layout hint (title/section/content/closing).

```
create_pptx(
  output_path: "presentations/output.pptx",
  title: "Q1 Review",
  theme: { primary_color: "#0A4D8C" },
  slides: [
    { layout: "title",   title: "Q1 Review", subtitle: "March 2026" },
    { layout: "section", title: "Highlights" },
    { layout: "content", title: "Top three results", bullets: ["...", "...", "..."] },
    { layout: "closing", title: "Thank you" }
  ]
)
```

## Step 5: DELIVER

Present the result. Offer a DOCX handout for reading decks. Ask if adjustments are needed.

## Anti-Patterns (NEVER)

- Skipping the outline and emitting create_pptx straight from raw source
- Leaving placeholder text ("Your slide title", "42%") from examples
- Same slide type twice in a row
- Promising a corporate-template render -- the template-ingest path is not wired today
