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
export const RERANKER_WASM_SHA256 = '06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3';

// SELF_DEV_SOURCE_SHA256 lives in src/_generated/source-hash.ts,
// regenerated on every build by generateSourceBundle().

// OFFICE_BUNDLE_SHA256 + PDFJS_BUNDLE_SHA256 live in
// src/_generated/asset-bundle-hashes.ts, regenerated on every build by
// generateOfficeBundles(). The generated file is gitignored, so the
// bot's fresh-clone lint pass sees the imports widen to an error-typed
// alias. The castGenerated helper routes the value through an `unknown`
// parameter, making the downstream `string` cast genuinely necessary in
// local TS too -- no eslint-disable directive needed in either context.
import {
    OFFICE_BUNDLE_SHA256 as _OFFICE_BUNDLE_SHA256,
    PDFJS_BUNDLE_SHA256 as _PDFJS_BUNDLE_SHA256,
    RERANKER_JS_BUNDLE_SHA256 as _RERANKER_JS_BUNDLE_SHA256,
} from '../../_generated/asset-bundle-hashes';
import { castGenerated } from '../utils/runtime';
export const OFFICE_BUNDLE_SHA256 = castGenerated<string>(_OFFICE_BUNDLE_SHA256);
export const PDFJS_BUNDLE_SHA256 = castGenerated<string>(_PDFJS_BUNDLE_SHA256);
export const RERANKER_JS_BUNDLE_SHA256 = castGenerated<string>(_RERANKER_JS_BUNDLE_SHA256);
