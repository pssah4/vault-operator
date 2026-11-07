---
name: sandbox-environment
description: Sandbox API reference, proven patterns, and library recommendations for evaluate_expression
trigger: sandbox|evaluate|pptx|xlsx|pdf|binary|generate|erstelle.*datei|code.*modul
source: bundled
requiredTools: [evaluate_expression]
---

# Sandbox Environment Reference

## Returning a result

`evaluate_expression` accepts an expression such as `2 + 2`, or statement-style code with an explicit `return`, such as `const total = 2 + 2; return total`. A declaration alone (`const total = 2 + 2`) is not an expression. A successful branch that never returns a value produces an `undefined` result with a hint to add `return`.

## Available APIs

### ctx.vault
- `ctx.vault.read(path: string): Promise<string>` -- Read text file
- `ctx.vault.readBinary(path: string): Promise<ArrayBuffer>` -- Read binary file
- `ctx.vault.write(path: string, content: string): Promise<void>` -- Write text (max 10MB, no writes to .obsidian/)
- `ctx.vault.writeBinary(path: string, content: ArrayBuffer): Promise<void>` -- Write binary (max 10MB)
- `ctx.vault.list(path: string): Promise<string[]>` -- List folder contents

### ctx.requestUrl
- `ctx.requestUrl(url: string, options?: {method?: string, body?: string}): Promise<{status: number, text: string}>`
- HTTPS only. Allowed domains: esm.sh, cdn.jsdelivr.net, unpkg.com, registry.npmjs.org
- Rate limit: 5 requests/minute

### Standard Globals
Promise, JSON, Math, Date, Object (full), Array, Map, Set, RegExp, Number, String, Boolean, Symbol, setTimeout, clearTimeout, TextEncoder, TextDecoder, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, Error, TypeError, RangeError

### TypedArrays (for binary data)
Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array, ArrayBuffer, DataView

## NOT Available (will cause errors)
Buffer (Node.js), require(), dynamic import(), process, fs, path, __dirname, __filename, child_process, WebAssembly, eval(), new Function()

`require`, `import()`, `process`, `globalThis`, `eval`, `new Function` and `WebAssembly` are not merely absent: the AstValidator rejects the script BEFORE it compiles if the source so much as contains them, and its comment stripper deliberately keeps string literals. A script that searches for these tokens must therefore assemble them at runtime (`'pro' + 'cess'`), or it rejects itself. `new RegExp` is allowed.

## The one rule that has no error message

**A skill script is a single, self-contained file. No `import`, no `require`.**

A static `import x from './y.js'` passes every check: the AstValidator only blocks `require(` and `import(`, and the repo has no other gate. But `esbuild.transform` (no bundling) rewrites it to `require()`, and there is no `require` here. The script dies on the user's first call, with an error that names none of this. Put everything in one file.

## What the environment actually is

A Chromium iframe (`sandbox="allow-scripts"`, no `allow-same-origin`, CSP `default-src 'none'`), NOT a Node vm. The `vm` worker was removed after a confirmed RCE; `sandbox-worker.js` in the repo root is a dead build artefact. Browser globals therefore exist in the usual browser sense, but the CSP gives them nothing to talk to: there is no network for `fetch`, and `document` belongs to a blank, origin-less frame. Do not build on them. `ctx.vault` and `ctx.requestUrl` are the entire surface you are given, and they are enough.

## The return value is the only transport

The agent sees exactly one thing: the value your `execute` returns, JSON-stringified. A thrown error becomes `Script execution error: {message}`, so put the recovery step in the message. Everything the agent must know goes in the return value.

`console.log` is not a no-op, despite what this file used to claim. It works, and the output is visible in the Electron DevTools console. It simply is not a transport: nothing can read a child realm's console from the parent, and across an opaque origin the parent cannot even patch it. Use it to debug with DevTools open; never to return a result.

## There is no network, and this one is absolute

`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `navigator.sendBeacon` all EXIST as globals. Every call fails. The CSP is `default-src 'none'` with no `connect-src`, `connect-src` falls back to `default-src` by spec, and `'none'` matches no URL at all: not a remote one, not a relative one, not a same-origin one. `fetch()` rejects with `TypeError: Failed to fetch` before a packet leaves the process. There is no URL, no retry and no fallback that changes this.

Dynamic `import('https://esm.sh/...')` is dead for the same reason: a script fetch falls to `script-src`, which grants `'unsafe-inline' 'unsafe-eval'` and **no URL sources**. `'unsafe-eval'` permits `new Function`; it does not permit loading code from a URL.

`ctx.requestUrl` is the only way out, and it works because the PARENT makes the request, not you.

## Storage throws, it does not fail softly

`localStorage`, `sessionStorage`, `document.cookie` and `indexedDB` are blocked by the opaque origin. Reading the property THROWS a `SecurityError`; even `typeof localStorage` throws. An unguarded reference kills the script at the point of access, which is harsher than the network case. Persist through `ctx.vault`.

## One fragility that is not ours to fix

A `srcdoc` iframe inherits the embedding document's CSP, and multiple policies are enforced as a conjunction: the meta CSP is a floor, never a ceiling. So `new Function` works only for as long as Obsidian's own renderer policy tolerates `unsafe-eval`. If Obsidian ever tightens it, this sandbox stops working and no change to the plugin can repair it.

## Proven Patterns

### Binary File Generation (PPTX, XLSX, DOCX, PDF)
IMPORTANT: Use the dedicated built-in tools instead of the sandbox for Office documents:
- **PPTX**: Use `create_pptx` tool (not evaluate_expression)
- **XLSX**: Use `create_xlsx` tool (not evaluate_expression)
- **DOCX**: Use `create_docx` tool (not evaluate_expression)
- **PDF**: Use `workspace:export-pdf` (Tier 1) or `pandoc-pdf` recipe (Tier 2)

These built-in tools run in the plugin context with full Node.js access and produce professional output.
The sandbox should NOT be used for binary file generation -- it lacks Buffer/Blob support.

If you need simple PDF generation from scratch (not conversion), pdf-lib remains available in the sandbox:
```typescript
import { PDFDocument, StandardFonts } from 'pdf-lib';
const doc = await PDFDocument.create();
const page = doc.addPage([595, 842]); // A4
const font = await doc.embedFont(StandardFonts.Helvetica);
page.drawText('Hello World', { x: 50, y: 750, size: 24, font });
const buf = await doc.save();
await ctx.vault.writeBinary('output.pdf', buf);
return 'Created output.pdf';
```

### Data Transformation
```typescript
const content = await ctx.vault.read('data.csv');
const rows = content.split('\n').map(r => r.split(','));
const markdown = '| ' + rows[0].join(' | ') + ' |\n| ' + rows[0].map(() => '---').join(' | ') + ' |\n' + rows.slice(1).map(r => '| ' + r.join(' | ') + ' |').join('\n');
await ctx.vault.write('data.md', markdown);
return 'Converted CSV to Markdown table';
```

### HTTP Request (CDN only)
```typescript
const resp = await ctx.requestUrl('https://esm.sh/lodash@4.17.21/package.json');
const pkg = JSON.parse(resp.text);
return pkg.version;
```

## Anti-Patterns (DO NOT USE)

- `new Blob([data])` -- Blob not available. Use `new Uint8Array(data)` or ArrayBuffer
- `Buffer.from(str)` -- Buffer not available. Use `new TextEncoder().encode(str)`
- `require('fs')` -- require not available. Use ctx.vault
- `fetch(url)` -- fetch not available. Use ctx.requestUrl
- `import('module')` -- dynamic import not available. Use static import + dependencies param
- `outputType: 'blob'` -- Blob not available. Use `outputType: 'arraybuffer'`
- `document.createElement()` -- DOM not available
- `window.crypto.getRandomValues()` -- crypto not available. Use Math.random()

## Library Recommendations

| Task | Recommended | Avoid | Reason |
|------|-------------|-------|--------|
| Excel | exceljs | sheetjs/xlsx | ExcelJS writeBuffer() returns ArrayBuffer natively |
| PDF | pdf-lib | jspdf | pdf-lib pure JS, no DOM dependency |
| PPTX | pptxgenjs (with caution) | officegen | pptxgenjs supports arraybuffer output |
| Images | sharp (if available) | canvas | canvas requires DOM |
| JSON/CSV | built-in | papaparse | papaparse works but unnecessary overhead |
| Dates | built-in Date | moment | moment too heavy for sandbox |

## Resource Limits
- Heap: 128 MB, sampled every 500 ms, then killed
- Execution timeout: 30 seconds
- Write size: max 10 MB per operation
- Write rate: max 10 writes/minute
- Request rate: max 5 HTTP requests/minute
- Writes to .obsidian/ blocked (security)
