# Vault Operator Template Analyzer

Analyzes a PPTX template and generates a Visual Design Language (VDL) Skill document for use in Vault Operator.

## Prerequisites

- Python 3.11+
- LibreOffice (for slide rendering)
- OpenRouter API Key (openrouter.ai/keys)

### macOS

```bash
brew install --cask libreoffice
```

### Linux (Ubuntu/Debian)

```bash
sudo apt install libreoffice
```

## Setup

```bash
cd tools/template-analyzer
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Usage

### Web UI (Streamlit)

```bash
streamlit run app.py
```

Opens a browser with:
1. OpenRouter API Key input
2. Model Picker (curated suggestions + live fetch from OpenRouter)
3. File upload for .pptx
4. Analyze button
5. Download the generated SKILL.md

### CLI

```bash
python analyze.py path/to/template.pptx --api-key sk-or-... --output skill.md
```

Options:
- `--api-key` (required): Your OpenRouter API key
- `--model`: OpenRouter model ID (default: `anthropic/claude-sonnet-4.5`)
- `--output` / `-o`: Output file path (default: `{template-name}-skill.md`)

## How It Works

1. **python-pptx**: Extracts shapes, positions, text, placeholders, theme colors, fonts
2. **LibreOffice headless**: Renders each slide to PNG for visual analysis
3. **Heuristic classification**: Pre-classifies slides by shape patterns (chevrons, grids, etc.)
4. **Claude Vision** (via OpenRouter): Analyzes slide images + structural data for semantic interpretation
5. **VDL generation**: Produces a SKILL.md with compositions, brand DNA, and shape mappings

## Output Format

The generated SKILL.md follows the Visual Design Language format:

```
---
name: template-name
description: Template Name -- N Slides, M Compositions
trigger: template|name
source: user
requiredTools: [create_pptx]
---

# Template Name -- Visual Design Language

## Brand-DNA
- Primary: #hex | Accent: #hex, #hex
- Heading: Font | Body: Font

## Compositions
### Composition Name (Slides 1, 5, 12)
**Meaning**: What this layout communicates
**Use when**: Content scenario

## Compositions by Narrative Phase
| Phase | Compositions | Rationale |
...

## Design Rules
...
```

Import the generated file as a User Skill in Vault Operator (Settings > Skills > Import).

## Customization

The Claude Vision prompt is in `prompts/vision-prompt.md`. Edit it to adjust how slides are interpreted -- for example, to add domain-specific composition types or refine classification criteria.
