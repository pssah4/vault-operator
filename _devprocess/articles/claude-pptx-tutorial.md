erstelle eine Präsentation für diesen Inhale und nutze diese Vorlagen.

20:43
Ich schaue mir zuerst die SKILL.md und die hochgeladenen Dateien an.

Use this skill any time a .pptx file is involved in any way — as input, output, or both. This includes: creating slide decks, pitch decks, or presentations; reading, parsing, or extracting text from any .pptx file (even if the extracted content will be used elsewhere, like in an email or summary); editing, modifying, or updating existing presentations; combining or splitting slide files; working with templates, layouts, speaker notes, or comments. Trigger whenever the user mentions "deck," "slides," "presentation," or references a .pptx filename, regardless of what they plan to do with the content afterward. If a .pptx file needs to be opened, created, or touched, use this skill.LicenseProprietary. LICENSE.txt has complete termsPPTX Skill
Quick Reference
TaskGuideRead/analyze contentpython -m markitdown presentation.pptxEdit or create from templateRead editing.mdCreate from scratchRead pptxgenjs.md

Reading Content
bash# Text extraction
python -m markitdown presentation.pptx

# Visual overview
python scripts/thumbnail.py presentation.pptx

# Raw XML
python scripts/office/unpack.py presentation.pptx unpacked/

Editing Workflow
Read editing.md for full details.

Analyze template with thumbnail.py
Unpack → manipulate slides → edit content → clean → pack


Creating from Scratch
Read pptxgenjs.md for full details.
Use when no template or reference presentation is available.

Design Ideas
Don't create boring slides. Plain bullets on a white background won't impress anyone. Consider ideas from this list for each slide.
Before Starting

Pick a bold, content-informed color palette: The palette should feel designed for THIS topic. If swapping your colors into a completely different presentation would still "work," you haven't made specific enough choices.
Dominance over equality: One color should dominate (60-70% visual weight), with 1-2 supporting tones and one sharp accent. Never give all colors equal weight.
Dark/light contrast: Dark backgrounds for title + conclusion slides, light for content ("sandwich" structure). Or commit to dark throughout for a premium feel.
Commit to a visual motif: Pick ONE distinctive element and repeat it — rounded image frames, icons in colored circles, thick single-side borders. Carry it across every slide.

Color Palettes
Choose colors that match your topic — don't default to generic blue. Use these palettes as inspiration:
ThemePrimarySecondaryAccentMidnight Executive1E2761 (navy)CADCFC (ice blue)FFFFFF (white)Forest & Moss2C5F2D (forest)97BC62 (moss)F5F5F5 (cream)Coral EnergyF96167 (coral)F9E795 (gold)2F3C7E (navy)Warm TerracottaB85042 (terracotta)E7E8D1 (sand)A7BEAE (sage)Ocean Gradient065A82 (deep blue)1C7293 (teal)21295C (midnight)Charcoal Minimal36454F (charcoal)F2F2F2 (off-white)212121 (black)Teal Trust028090 (teal)00A896 (seafoam)02C39A (mint)Berry & Cream6D2E46 (berry)A26769 (dusty rose)ECE2D0 (cream)Sage Calm84B59F (sage)69A297 (eucalyptus)50808E (slate)Cherry Bold990011 (cherry)FCF6F5 (off-white)2F3C7E (navy)
For Each Slide
Every slide needs a visual element — image, chart, icon, or shape. Text-only slides are forgettable.
Layout options:

Two-column (text left, illustration on right)
Icon + text rows (icon in colored circle, bold header, description below)
2x2 or 2x3 grid (image on one side, grid of content blocks on other)
Half-bleed image (full left or right side) with content overlay

Data display:

Large stat callouts (big numbers 60-72pt with small labels below)
Comparison columns (before/after, pros/cons, side-by-side options)
Timeline or process flow (numbered steps, arrows)

Visual polish:

Icons in small colored circles next to section headers
Italic accent text for key stats or taglines

Typography
Choose an interesting font pairing — don't default to Arial. Pick a header font with personality and pair it with a clean body font.
Header FontBody FontGeorgiaCalibriArial BlackArialCalibriCalibri LightCambriaCalibriTrebuchet MSCalibriImpactArialPalatinoGaramondConsolasCalibri
ElementSizeSlide title36-44pt boldSection header20-24pt boldBody text14-16ptCaptions10-12pt muted
Spacing

0.5" minimum margins
0.3-0.5" between content blocks
Leave breathing room—don't fill every inch

Avoid (Common Mistakes)

Don't repeat the same layout — vary columns, cards, and callouts across slides
Don't center body text — left-align paragraphs and lists; center only titles
Don't skimp on size contrast — titles need 36pt+ to stand out from 14-16pt body
Don't default to blue — pick colors that reflect the specific topic
Don't mix spacing randomly — choose 0.3" or 0.5" gaps and use consistently
Don't style one slide and leave the rest plain — commit fully or keep it simple throughout
Don't create text-only slides — add images, icons, charts, or visual elements; avoid plain title + bullets
Don't forget text box padding — when aligning lines or shapes with text edges, set margin: 0 on the text box or offset the shape to account for padding
Don't use low-contrast elements — icons AND text need strong contrast against the background; avoid light text on light backgrounds or dark text on dark backgrounds
NEVER use accent lines under titles — these are a hallmark of AI-generated slides; use whitespace or background color instead


QA (Required)
Assume there are problems. Your job is to find them.
Your first render is almost never correct. Approach QA as a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.
Content QA
bashpython -m markitdown output.pptx
Check for missing content, typos, wrong order.
When using templates, check for leftover placeholder text:
bashpython -m markitdown output.pptx | grep -iE "\bx{3,}\b|lorem|ipsum|\bTODO|\[insert|this.*(page|slide).*layout"
If grep returns results, fix them before declaring success.
Visual QA
⚠️ USE SUBAGENTS — even for 2-3 slides. You've been staring at the code and will see what you expect, not what's there. Subagents have fresh eyes.
Convert slides to images (see Converting to Images), then use this prompt:
Visually inspect these slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images — run `ls -1 "$PWD"/slide-*.jpg` and use the exact absolute paths it prints:
1. <absolute-path>/slide-N.jpg — (Expected: [brief description])
2. <absolute-path>/slide-N.jpg — (Expected: [brief description])
...

Report ALL issues found, including minor ones.
Verification Loop

Generate slides → Convert to images → Inspect
List issues found (if none found, look again more critically)
Fix issues
Re-verify affected slides — one fix often creates another problem
Repeat until a full pass reveals no new issues

Do not declare success until you've completed at least one fix-and-verify cycle.

Converting to Images
Convert presentations to individual slide images for visual inspection:
bashpython scripts/office/soffice.py --headless --convert-to pdf output.pptx
rm -f slide-*.jpg
pdftoppm -jpeg -r 150 output.pdf slide
ls -1 "$PWD"/slide-*.jpg
Pass the absolute paths printed above directly to the view tool. The rm clears stale images from prior runs. pdftoppm zero-pads based on page count: slide-1.jpg for decks under 10 pages, slide-01.jpg for 10-99, slide-001.jpg for 100+.
After fixes, rerun all four commands above — the PDF must be regenerated from the edited .pptx before pdftoppm can reflect your changes.

Dependencies

pip install "markitdown[pptx]" - text extraction
pip install Pillow - thumbnail grids
npm install -g pptxgenjs - creating from scratch
LibreOffice (soffice) - PDF conversion (auto-configured for sandboxed environments via scripts/office/soffice.py)
Poppler (pdftoppm) - PDF to images

Editing Presentations
Template-Based Workflow
When using an existing presentation as a template:

Analyze existing slides:

bash   python scripts/thumbnail.py template.pptx
   python -m markitdown template.pptx
Review thumbnails.jpg to see layouts, and markitdown output to see placeholder text.

Plan slide mapping: For each content section, choose a template slide.
⚠️ USE VARIED LAYOUTS — monotonous presentations are a common failure mode. Don't default to basic title + bullet slides. Actively seek out:

Multi-column layouts (2-column, 3-column)
Image + text combinations
Full-bleed images with text overlay
Quote or callout slides
Section dividers
Stat/number callouts
Icon grids or icon + text rows

Avoid: Repeating the same text-heavy layout for every slide.
Match content type to layout style (e.g., key points → bullet slide, team info → multi-column, testimonials → quote slide).
Unpack: python scripts/office/unpack.py template.pptx unpacked/
Build presentation (do this yourself, not with subagents):

Delete unwanted slides (remove from <p:sldIdLst>)
Duplicate slides you want to reuse (add_slide.py)
Reorder slides in <p:sldIdLst>
Complete all structural changes before step 5


Edit content: Update text in each slide{N}.xml.
Use subagents here if available — slides are separate XML files, so subagents can edit in parallel.
Clean: python scripts/clean.py unpacked/
Pack: python scripts/office/pack.py unpacked/ output.pptx --original template.pptx


Scripts
ScriptPurposeunpack.pyExtract and pretty-print PPTXadd_slide.pyDuplicate slide or create from layoutclean.pyRemove orphaned filespack.pyRepack with validationthumbnail.pyCreate visual grid of slides
unpack.py
bashpython scripts/office/unpack.py input.pptx unpacked/
Extracts PPTX, pretty-prints XML, escapes smart quotes.
add_slide.py
bashpython scripts/add_slide.py unpacked/ slide2.xml      # Duplicate slide
python scripts/add_slide.py unpacked/ slideLayout2.xml # From layout
Prints <p:sldId> to add to <p:sldIdLst> at desired position.
clean.py
bashpython scripts/clean.py unpacked/
Removes slides not in <p:sldIdLst>, unreferenced media, orphaned rels.
pack.py
bashpython scripts/office/pack.py unpacked/ output.pptx --original input.pptx
Validates, repairs, condenses XML, re-encodes smart quotes.
thumbnail.py
bashpython scripts/thumbnail.py input.pptx [output_prefix] [--cols N]
Creates thumbnails.jpg with slide filenames as labels. Default 3 columns, max 12 per grid.
Use for template analysis only (choosing layouts). For visual QA, use soffice + pdftoppm to create full-resolution individual slide images—see SKILL.md.

Slide Operations
Slide order is in ppt/presentation.xml → <p:sldIdLst>.
Reorder: Rearrange <p:sldId> elements.
Delete: Remove <p:sldId>, then run clean.py.
Add: Use add_slide.py. Never manually copy slide files—the script handles notes references, Content_Types.xml, and relationship IDs that manual copying misses.

Editing Content
Subagents: If available, use them here (after completing step 4). Each slide is a separate XML file, so subagents can edit in parallel. In your prompt to subagents, include:

The slide file path(s) to edit
"Use the Edit tool for all changes"
The formatting rules and common pitfalls below

For each slide:

Read the slide's XML
Identify ALL placeholder content—text, images, charts, icons, captions
Replace each placeholder with final content

Use the Edit tool, not sed or Python scripts. The Edit tool forces specificity about what to replace and where, yielding better reliability.
Formatting Rules

Bold all headers, subheadings, and inline labels: Use b="1" on <a:rPr>. This includes:

Slide titles
Section headers within a slide
Inline labels like (e.g.: "Status:", "Description:") at the start of a line


Never use unicode bullets (•): Use proper list formatting with <a:buChar> or <a:buAutoNum>
Bullet consistency: Let bullets inherit from the layout. Only specify <a:buChar> or <a:buNone>.


Common Pitfalls
Template Adaptation
When source content has fewer items than the template:

Remove excess elements entirely (images, shapes, text boxes), don't just clear text
Check for orphaned visuals after clearing text content
Run visual QA to catch mismatched counts

When replacing text with different length content:

Shorter replacements: Usually safe
Longer replacements: May overflow or wrap unexpectedly
Test with visual QA after text changes
Consider truncating or splitting content to fit the template's design constraints

Template slots ≠ Source items: If template has 4 team members but source has 3 users, delete the 4th member's entire group (image + text boxes), not just the text.
Multi-Item Content
If source has multiple items (numbered lists, multiple sections), create separate <a:p> elements for each — never concatenate into one string.
❌ WRONG — all items in one paragraph:
xml<a:p>
  <a:r><a:rPr .../><a:t>Step 1: Do the first thing. Step 2: Do the second thing.</a:t></a:r>
</a:p>
✅ CORRECT — separate paragraphs with bold headers:
xml<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 1</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" .../><a:t>Do the first thing.</a:t></a:r>
</a:p>
<a:p>
  <a:pPr algn="l"><a:lnSpc><a:spcPts val="3919"/></a:lnSpc></a:pPr>
  <a:r><a:rPr lang="en-US" sz="2799" b="1" .../><a:t>Step 2</a:t></a:r>
</a:p>
<!-- continue pattern -->
Copy <a:pPr> from the original paragraph to preserve line spacing. Use b="1" on headers.
Smart Quotes
Handled automatically by unpack/pack. But the Edit tool converts smart quotes to ASCII.
When adding new text with quotes, use XML entities:
xml<a:t>the &#x201C;Agreement&#x201D;</a:t>
CharacterNameUnicodeXML Entity“Left double quoteU+201C&#x201C;”Right double quoteU+201D&#x201D;‘Left single quoteU+2018&#x2018;’Right single quoteU+2019&#x2019;
Other

Whitespace: Use xml:space="preserve" on <a:t> with leading/trailing spaces
XML parsing: Use defusedxml.minidom, not xml.etree.ElementTree (corrupts namespaces)

