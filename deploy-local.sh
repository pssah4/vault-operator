#!/bin/bash

# Deploy to local Obsidian vault
# Usage: ./deploy-local.sh
#
# Requires a .env file with:
#   PLUGIN_DIR=/path/to/your/obsidian/vault/.obsidian/plugins/vault-operator

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/.env" ]; then
  source "$SCRIPT_DIR/.env"
fi

if [ -z "$PLUGIN_DIR" ]; then
  echo "Error: PLUGIN_DIR not set. Create a .env file with:"
  echo "  PLUGIN_DIR=/path/to/.obsidian/plugins/vault-operator"
  exit 1
fi

echo "Deploying Obsidian Agent to: $PLUGIN_DIR"

# Create plugin directory if it doesn't exist (quotes handle spaces in iCloud paths)
mkdir -p "$PLUGIN_DIR"

# Copy only essential files
cp manifest.json "$PLUGIN_DIR/"
cp main.js "$PLUGIN_DIR/"
cp styles.css "$PLUGIN_DIR/"
[ -f sandbox-worker.js ] && cp sandbox-worker.js "$PLUGIN_DIR/"
[ -f mcp-server-worker.js ] && cp mcp-server-worker.js "$PLUGIN_DIR/"
[ -f src/assets/logo.png ] && cp src/assets/logo.png "$PLUGIN_DIR/"
[ -f node_modules/sql.js/dist/sql-wasm.wasm ] && cp node_modules/sql.js/dist/sql-wasm.wasm "$PLUGIN_DIR/"
[ -f node_modules/sql.js/dist/sql-wasm-browser.wasm ] && cp node_modules/sql.js/dist/sql-wasm-browser.wasm "$PLUGIN_DIR/"

# Copy bundled skills (and remove stale ones)
if [ -d "bundled-skills" ]; then
  # Build list of current bundled skill names
  bundled_names=()
  for skill_dir in bundled-skills/*/; do
    skill_name=$(basename "$skill_dir")
    bundled_names+=("$skill_name")
    mkdir -p "$PLUGIN_DIR/skills/$skill_name"
    cp "$skill_dir"* "$PLUGIN_DIR/skills/$skill_name/" 2>/dev/null
  done

  # Remove deployed bundled skills that no longer exist in source
  if [ -d "$PLUGIN_DIR/skills" ]; then
    for deployed_dir in "$PLUGIN_DIR/skills"/*/; do
      [ -d "$deployed_dir" ] || continue
      deployed_name=$(basename "$deployed_dir")
      # Check if this deployed skill has source: bundled in its SKILL.md
      skill_md="$deployed_dir/SKILL.md"
      if [ -f "$skill_md" ] && grep -q "^source: bundled" "$skill_md"; then
        # It's a bundled skill -- check if it still exists in source
        found=false
        for bn in "${bundled_names[@]}"; do
          if [ "$bn" = "$deployed_name" ]; then
            found=true
            break
          fi
        done
        if [ "$found" = false ]; then
          rm -rf "$deployed_dir"
          echo "Removed stale bundled skill: $deployed_name"
        fi
      fi
    done
  fi

  echo "Copied bundled skills."
fi

echo "Deployment complete."
echo ""
echo "Next steps:"
echo "1. Reload Obsidian (Cmd/Ctrl + R)"
echo "2. Or disable/enable the plugin in Settings"
