var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/mcp/mcp-server-worker.ts
var VAULT_OPERATOR_URL = "http://127.0.0.1:27182";
var mcpToken = "";
try {
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  mcpToken = fs.readFileSync(path.join(os.homedir(), ".obsidian-agent", "mcp-token"), "utf-8").trim();
} catch {
}
var buffer = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIdx).replace(/\r$/, "");
    buffer = buffer.slice(newlineIdx + 1);
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line);
      void forwardToVaultOperator(request, request.id !== void 0 && request.id !== null);
    } catch {
      process.stderr.write(`[mcp-proxy] Invalid JSON: ${line.slice(0, 100)}
`);
    }
  }
});
async function forwardToVaultOperator(request, expectResponse = true) {
  try {
    const http = await import("http");
    const body = JSON.stringify(request);
    const response = await new Promise((resolve, reject) => {
      const req = http.request(VAULT_OPERATOR_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...mcpToken ? { "Authorization": `Bearer ${mcpToken}` } : {}
        },
        timeout: 3e4
      }, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("timeout"));
      });
      req.write(body);
      req.end();
    });
    if (expectResponse && response.trim()) {
      process.stdout.write(response + "\n");
    }
  } catch (e) {
    const errorResponse = JSON.stringify({
      jsonrpc: "2.0",
      id: request?.id ?? null,
      error: {
        code: -32603,
        message: `Vault Operator not reachable. Is Obsidian running with the connector enabled? (${e instanceof Error ? e.message : String(e)})`
      }
    });
    process.stdout.write(errorResponse + "\n");
  }
}
process.stdin.resume();
process.stderr.write("[mcp-proxy] Vault Operator MCP proxy started\n");
