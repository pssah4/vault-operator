#!/usr/bin/env bash
# AUDIT-037 I-2: refresh the SHA-256 integrity hashes used by
# EsbuildWasmManager so a stale hash does not silently disable the
# sandbox-CDN pipeline.
#
# Reads the ESBUILD_VERSION constant from
# src/core/sandbox/EsbuildWasmManager.ts, downloads the matching artefacts
# from jsdelivr, and prints the current hashes alongside the values
# currently committed in the source. Exits non-zero if either hash
# differs so CI can fail loudly on a missed bump.

set -euo pipefail

SRC=src/core/sandbox/EsbuildWasmManager.ts

if [[ ! -f "$SRC" ]]; then
    echo "ERROR: $SRC not found. Run from repo root." >&2
    exit 2
fi

VERSION=$(grep -E "^const ESBUILD_VERSION" "$SRC" | sed -E "s/.*'([0-9]+\.[0-9]+\.[0-9]+)'.*/\1/")
if [[ -z "$VERSION" ]]; then
    echo "ERROR: could not parse ESBUILD_VERSION from $SRC" >&2
    exit 2
fi

JS_KEY="esbuild-browser-$VERSION.js"
WASM_KEY="esbuild-$VERSION.wasm"
JS_URL="https://cdn.jsdelivr.net/npm/esbuild-wasm@$VERSION/lib/browser.js"
WASM_URL="https://cdn.jsdelivr.net/npm/esbuild-wasm@$VERSION/esbuild.wasm"

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

curl -fsSL "$JS_URL"  -o "$TMP/browser.js"
curl -fsSL "$WASM_URL" -o "$TMP/esbuild.wasm"

LIVE_JS=$(shasum -a 256 "$TMP/browser.js"  | awk '{print $1}')
LIVE_WASM=$(shasum -a 256 "$TMP/esbuild.wasm" | awk '{print $1}')

COMMITTED_JS=$(grep -E "\[JS_CACHE_FILE\]" "$SRC" | sed -E "s/.*'([0-9a-f]{64})'.*/\1/")
COMMITTED_WASM=$(grep -E "\[WASM_CACHE_FILE\]" "$SRC" | sed -E "s/.*'([0-9a-f]{64})'.*/\1/")

echo "esbuild-wasm version: $VERSION"
echo "  $JS_KEY"
echo "    live      : $LIVE_JS"
echo "    committed : $COMMITTED_JS"
echo "  $WASM_KEY"
echo "    live      : $LIVE_WASM"
echo "    committed : $COMMITTED_WASM"

DRIFT=0
if [[ "$LIVE_JS" != "$COMMITTED_JS" ]]; then
    echo "  DRIFT: browser.js hash does not match" >&2
    DRIFT=1
fi
if [[ "$LIVE_WASM" != "$COMMITTED_WASM" ]]; then
    echo "  DRIFT: esbuild.wasm hash does not match" >&2
    DRIFT=1
fi

if [[ $DRIFT -ne 0 ]]; then
    echo
    echo "Update the INTEGRITY_HASHES block in $SRC with the live values, then re-run." >&2
    exit 1
fi

echo "OK: integrity hashes match upstream."
