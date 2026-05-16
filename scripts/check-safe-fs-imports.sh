#!/usr/bin/env bash
#
# check-safe-fs-imports.sh -- pre-push gate
#
# Verifies that no source file outside the security wrappers imports
# `fs` or `child_process` directly. Every fs operation must go through
# src/core/security/safeFs.ts; every spawn must go through
# src/core/security/spawnAllowlist.ts. See SECURITY.md and EPIC-28 for
# the why.
#
# Exits 0 if clean, 1 if violations found.
#
# Allowed exceptions (require justification):
#   - src/core/security/safeFs.ts                  (owns the fs wrapper)
#   - src/core/security/spawnAllowlist.ts           (owns the child_process wrapper)
#   - src/mcp/mcp-server-worker.ts                  (standalone Node worker, not bundled)
#   - src/__test-stubs__/safeFsSetup.ts             (test setup)
#   - src/core/checkpoints/GitCheckpointService.ts  (isomorphic-git fs plugin; safeFs
#                                                    causes an indefinite hang on
#                                                    iCloud-backed vaults; repo scope
#                                                    is confined to <vault>/.obsidian/
#                                                    plugins/<id>/checkpoints)
#
# Tests under src/**/__tests__/ are not part of the production bundle and
# are not checked.

set -euo pipefail

cd "$(dirname "$0")/.."

EXIT=0
ALLOW=(
    "src/core/security/safeFs.ts"
    "src/core/security/spawnAllowlist.ts"
    "src/mcp/mcp-server-worker.ts"
    "src/__test-stubs__/safeFsSetup.ts"
    "src/core/checkpoints/GitCheckpointService.ts"
)

is_allowed() {
    local f="$1"
    for a in "${ALLOW[@]}"; do
        if [[ "$f" == "$a" ]]; then return 0; fi
    done
    return 1
}

echo "[check-safe-fs] Scanning src/ for direct fs and child_process imports..."

# Find every source file with a direct fs import (excluding tests + allowlist).
fs_hits_raw=$(grep -rnE "^[[:space:]]*import[[:space:]].*from[[:space:]]+['\"]fs['\"]|^[[:space:]]*import[[:space:]].*from[[:space:]]+['\"]node:fs['\"]|require\(['\"]fs['\"]\)|require\(['\"]node:fs['\"]\)" src/ --include='*.ts' \
    | grep -v "__tests__" | grep -v "_generated" || true)
IFS=$'\n' read -d '' -r -a fs_hits <<< "$fs_hits_raw" || true

for line in "${fs_hits[@]}"; do
    [[ -z "$line" ]] && continue
    file=$(echo "$line" | cut -d: -f1)
    if ! is_allowed "$file"; then
        echo "  ERROR: direct fs import outside safeFs:"
        echo "    $line"
        EXIT=1
    fi
done

# Same for child_process.
cp_hits_raw=$(grep -rnE "^[[:space:]]*import[[:space:]].*from[[:space:]]+['\"]child_process['\"]|^[[:space:]]*import[[:space:]].*from[[:space:]]+['\"]node:child_process['\"]|require\(['\"]child_process['\"]\)|require\(['\"]node:child_process['\"]\)" src/ --include='*.ts' \
    | grep -v "__tests__" | grep -v "_generated" || true)
IFS=$'\n' read -d '' -r -a cp_hits <<< "$cp_hits_raw" || true

for line in "${cp_hits[@]}"; do
    [[ -z "$line" ]] && continue
    file=$(echo "$line" | cut -d: -f1)
    # `import type { ChildProcess } from 'child_process'` is type-only and
    # produces no runtime import. Allow it.
    if echo "$line" | grep -qE "^[^:]+:[0-9]+:[[:space:]]*import[[:space:]]+type[[:space:]]"; then
        continue
    fi
    if ! is_allowed "$file"; then
        echo "  ERROR: direct child_process import outside spawnAllowlist:"
        echo "    $line"
        EXIT=1
    fi
done

if [[ $EXIT -eq 0 ]]; then
    echo "[check-safe-fs] OK -- no direct fs or child_process imports outside the security wrappers."
else
    echo ""
    echo "[check-safe-fs] FAIL"
    echo ""
    echo "  Every fs operation must go through src/core/security/safeFs.ts."
    echo "  Every spawn must go through src/core/security/spawnAllowlist.ts."
    echo "  See SECURITY.md for the threat model and the documented exceptions."
fi

exit $EXIT
