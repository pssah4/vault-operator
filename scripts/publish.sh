#!/bin/bash
# publish.sh — Build and push clean public release to vault-operator
# Usage: bash _devprocess/scripts/publish.sh [--dry-run]
#
# What this does:
#   1. Runs npm build
#   2. Pushes current branch to vault-operator/main
#
# Private files (_devprocess/, .claude/, forked-kilocode/)
# are gitignored and will NOT appear in the public repo.

set -e

DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[dry-run] No changes will be pushed"
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Current branch: $CURRENT_BRANCH"

# Verify no private files are staged
PRIVATE_STAGED=$(git diff --cached --name-only | grep -E '^_devprocess/' || true)
if [[ -n "$PRIVATE_STAGED" ]]; then
  echo "ERROR: Private files are staged for commit:"
  echo "$PRIVATE_STAGED"
  exit 1
fi

# Build
echo ""
echo "Building plugin..."
npm run build
echo "Build complete."

# Show what will be published
echo ""
echo "Files that will be in vault-operator/main:"
git ls-files | head -60
echo ""

# Push
if [[ "$DRY_RUN" == "false" ]]; then
  echo "Pushing to vault-operator/main..."
  git push --force vault-operator "${CURRENT_BRANCH}:main"
  echo ""
  echo "Done. vault-operator/main updated from branch: $CURRENT_BRANCH"
else
  echo "[dry-run] Would run: git push --force vault-operator ${CURRENT_BRANCH}:main"
fi
