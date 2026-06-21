---
id: FIX-04-99-01
epic: EPIC-04
feature: FEAT-04-03
adr-refs: []
plan-refs: []
depends-on: []
audit-refs: [STABILITY-AUDIT-v2.14.0-2026-06-21]
created: 2026-06-21
---

# FIX-04-99-01: Provider + Sandbox Cluster (ChatGPT-OAuth Vision, SemanticSearch Ignore, Iframe vault.list/mkdir)

## Symptom

Stabilitaets-Audit 2026-06-21 fand vier verwandte Defekte am
Provider- und Sandbox-Layer:

1. **ChatGPT-OAuth (Codex) droppt Image-Blocks.** Vision-Queries gegen
   GPT-5 / o-series ueber den OAuth-Pfad bekamen nur Text -- der
   Image-Block wurde im `convertMessages`-User-Branch nicht behandelt
   (nur 'text' und 'tool_result'). Modell antwortet "I don't see an
   image". Gleiche Klasse wie FIX-04-03-09, die das fuer openai /
   copilot / kilo gefixt hatte; chatgpt-oauth wurde uebersehen.
2. **SemanticSearchTool umgeht IgnoreService.** Der semantische Arm
   liest aus dem Vektor-Index ohne `.obsidian-agentignore`-Filter.
   Tests dafuer existieren in `searchVault.ts` (read-Pfad), aber das
   semantische Pendant fehlte. Daten, die VOR einem ignore-Eintrag
   indiziert wurden, leaken durch.
3. **IframeSandboxExecutor.vaultList ohne await.** Der Bridge-Call
   `this.bridge.vaultList(path)` returnt eine Promise. Pre-fix wurde
   die Promise als Message-Payload direkt zurueck postMessage'd.
   structuredClone schluckt Promises nicht -> Mobile-Sandbox bekommt
   einen ungueltigen Wert (leer). Andere Bridge-Calls in derselben
   Switch sind `await`ed.
4. **Iframe-Sandbox kennt kein `vault.mkdir`.** `SandboxBridge.vaultMkdir`
   ist implementiert (rekursive Folder-Erzeugung), aber die Iframe-
   Bridge hatte weder einen `vault.mkdir`-Proxy noch ein passendes
   Message-Type-Routing. skill-creator-Skills, die einen neuen Folder
   anlegen wollen, scheitern auf Mobile.

## Fix

### FIX-04-03-11 (ChatGPT-OAuth Image)

- `ResponsesContentBlock` um `{ type: 'input_image'; image_url: string; detail?: ... }` erweitert (Responses-API-Format).
- User-Branch in `convertMessages` baut jetzt einen content-array: text-Parts werden vorangestellt, image-Blocks gerendert als `{ type: 'input_image', image_url: 'data:<mime>;base64,<data>' }`. tool_result bleibt unveraendert in separate `function_call_output`-Items.

### FIX-29-99-02 (SemanticSearchTool IgnoreService)

- Neuer `ignoreService`-Filter direkt nach dem Fetch im Tool: `results = results.filter((r) => !ignoreService.isIgnored(r.path))`. Defense in depth zur Build-Time-Filterung in `SemanticIndexOptions.isIgnored`.

### FIX-29-99-03 (Iframe-Bridge vault.list + mkdir)

- `IframeSandboxExecutor`-Switch `vault-list`-Branch jetzt `await`ed.
- Neues `vault-mkdir` Message-Type plus Switch-Branch, routed an `bridge.vaultMkdir`.
- `sandboxHtml.ts` `vault`-Proxy um `mkdir: function(path) { return bridgeCall('vault-mkdir', { path: path }); }` erweitert.

## Tests

Keine neuen Unit-Tests in dieser Welle (4 isolierte Diff-Loci, jeder unter ~30 LOC). Volle Suite 2963 + 1 expected fail, tsc clean, build clean.
