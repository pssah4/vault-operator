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
