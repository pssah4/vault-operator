// src/core/sandbox/sandbox-worker.ts
var import_vm = require("vm");
var import_node_timers = require("node:timers");
process.on("uncaughtException", (err) => {
  process.stderr.write(`[sandbox-worker] Uncaught: ${err.message}
${err.stack ?? ""}
`);
  process.exit(1);
});
var pendingCalls = /* @__PURE__ */ new Map();
var callCounter = 0;
function bridgeCall(type, payload) {
  return new Promise((resolve, reject) => {
    const callId = "bc_" + ++callCounter;
    const timeout = (0, import_node_timers.setTimeout)(() => {
      pendingCalls.delete(callId);
      reject(new Error("Bridge call timeout (15s)"));
    }, 15e3);
    pendingCalls.set(callId, { resolve, reject, timeout });
    process.send({ ...payload, type, callId });
  });
}
var vault = Object.freeze({
  read: (path) => bridgeCall("vault-read", { path }),
  readBinary: (path) => bridgeCall("vault-read-binary", { path }),
  list: (path) => bridgeCall("vault-list", { path }),
  write: (path, content) => bridgeCall("vault-write", { path, content }),
  writeBinary: (path, content) => bridgeCall("vault-write-binary", { path, content }),
  // FEAT-29-05: parent-folder creation. Obsidian's vault adapter does not
  // auto-create parents on write, so init_skill needs an explicit mkdir
  // call. Idempotent: silently succeeds when the folder already exists.
  mkdir: (path) => bridgeCall("vault-mkdir", { path })
});
var requestUrlProxy = Object.freeze(
  (url, options) => bridgeCall("request-url", { url, options })
);
var contextGlobals = {
  vault,
  requestUrl: requestUrlProxy,
  console: Object.freeze({
    log: () => {
    },
    debug: () => {
    },
    warn: () => {
    },
    error: () => {
    }
  }),
  setTimeout,
  clearTimeout,
  Promise,
  JSON,
  Math,
  Date,
  // M-4: Full Object — npm packages need create/defineProperty/getPrototypeOf etc.
  Object,
  Array,
  Map,
  Set,
  RegExp,
  Error,
  TypeError,
  RangeError,
  Number,
  String,
  Boolean,
  Symbol,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  TextEncoder,
  TextDecoder,
  // L-3: TypedArrays + ArrayBuffer for binary data processing
  Uint8Array,
  Int8Array,
  Uint16Array,
  Int16Array,
  Uint32Array,
  Int32Array,
  Float32Array,
  Float64Array,
  ArrayBuffer,
  DataView
};
var vmContext = (0, import_vm.createContext)(contextGlobals);
async function executeInSandbox(id, code, input) {
  try {
    const escapedCode = JSON.stringify(code);
    const wrappedCode = '(function() {\n    var exports = {};\n    var __fn = new Function("exports", ' + escapedCode + ");\n    __fn(exports);\n    return exports;\n})()";
    const moduleExports = (0, import_vm.runInNewContext)(wrappedCode, vmContext, {
      timeout: 3e4,
      filename: "sandbox-module.js"
    });
    const result = await moduleExports.execute(input, { vault, requestUrl: requestUrlProxy });
    process.send({ type: "result", id, value: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    process.send({ type: "error", id, message });
  }
}
process.on("message", (msg) => {
  if (!msg || typeof msg !== "object") return;
  const m = msg;
  if (typeof m["callId"] === "string" && pendingCalls.has(m["callId"])) {
    const callId = m["callId"];
    const p = pendingCalls.get(callId);
    (0, import_node_timers.clearTimeout)(p.timeout);
    pendingCalls.delete(callId);
    if (typeof m["error"] === "string") {
      p.reject(new Error(m["error"]));
    } else {
      p.resolve(m["result"]);
    }
    return;
  }
  if (m["type"] === "execute" && typeof m["id"] === "string" && typeof m["code"] === "string") {
    void executeInSandbox(
      m["id"],
      m["code"],
      m["input"] ?? {}
    );
  }
});
process.send({ type: "sandbox-ready" });
