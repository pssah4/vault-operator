/**
 * Expected SHA256 hashes for the optional asset downloads.
 *
 * These constants pin which binary the plugin trusts. The
 * OptionalAssetManager refuses to install a downloaded file unless
 * its computed SHA256 matches the value here. A new plugin version
 * that ships a different model or source bundle must update this file
 * and the GitHub release in lockstep.
 *
 * Lowercase hex, no leading 0x.
 */

/** ort-wasm-simd-threaded.wasm from onnxruntime-web (pinned). */
export const RERANKER_WASM_SHA256 = 'f4f290847a4df02d0b93cdbf39b4b0e71acefbe80573e7e6b9342a7abd7b290a';

// SELF_DEV_SOURCE_SHA256 lives in src/_generated/source-hash.ts,
// regenerated on every build by generateSourceBundle().

// OFFICE_BUNDLE_SHA256 + PDFJS_BUNDLE_SHA256 live in
// src/_generated/asset-bundle-hashes.ts, regenerated on every build by
// generateOfficeBundles(). Re-exported here with an explicit string
// annotation so the type stays sharp even when the generated file is
// absent at lint time (review-bot CI fresh-clone scenario).
import {
    OFFICE_BUNDLE_SHA256 as _OFFICE_BUNDLE_SHA256,
    PDFJS_BUNDLE_SHA256 as _PDFJS_BUNDLE_SHA256,
} from '../../_generated/asset-bundle-hashes';
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- pinned `string` keeps callers safe when _generated/ is absent at bot CI lint time
export const OFFICE_BUNDLE_SHA256: string = _OFFICE_BUNDLE_SHA256 as string;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- pinned `string` keeps callers safe when _generated/ is absent at bot CI lint time
export const PDFJS_BUNDLE_SHA256: string = _PDFJS_BUNDLE_SHA256 as string;
