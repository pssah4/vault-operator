// Replacement for the `immediate` npm package (transitive via jszip -> lie),
// aliased in esbuild.config.mjs. The upstream package picks one of four
// microtask-scheduling strategies at runtime, including a legacy
// `document.createElement("script") + onreadystatechange` fallback for
// IE 6/7 that the Obsidian review bot's bundle heuristic flags as
// "dynamic script element creation". The branch is dead code in Electron
// but esbuild cannot prove it statically.
//
// Modern Electron has native queueMicrotask, which already gives us the
// microtask semantics `immediate` is trying to emulate.

module.exports = function immediate(task) {
    queueMicrotask(task);
};
