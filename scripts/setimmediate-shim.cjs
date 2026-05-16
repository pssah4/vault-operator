// Replacement for the `setimmediate` npm package, aliased in
// esbuild.config.mjs. The upstream polyfill ships a legacy
// `document.createElement("script") + onreadystatechange` branch for IE 6/7
// Promise-scheduling that the Obsidian review bot's bundle heuristic flags
// as "dynamic script element creation". The branch is dead code in
// Electron, but esbuild cannot prove it statically.
//
// jszip / exceljs / pptxgenjs require("setimmediate") purely for the side
// effect of installing a global setImmediate. Obsidian's renderer ships
// Node integration which already provides setImmediate, so in practice
// this shim does nothing -- the early return below mirrors the upstream
// polyfill's first check. The fallback uses queueMicrotask so the shim
// still works in stripped-down contexts.

if (typeof globalThis.setImmediate === "undefined") {
    globalThis.setImmediate = function setImmediate(callback) {
        const args = Array.prototype.slice.call(arguments, 1);
        const fn = typeof callback === "function"
            ? callback
            : Function("" + callback);
        queueMicrotask(function () { fn.apply(undefined, args); });
        return 0;
    };
    globalThis.clearImmediate = function clearImmediate() { /* no-op: microtask handle is not cancellable */ };
}
