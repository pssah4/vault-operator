---
id: AUDIT-025
project: vault-operator
date: 2026-05-14
scope: v2.9.0-Delta seit AUDIT-024 (BundleLoader Pattern G eval, Optional-Asset-Loading-Chain) plus zwei GitHub Code-Scanning Findings (Alert #67, #68)
overall-risk: Low
predecessor: AUDIT-024 (v2.8.0, 2026-05-13, Green)
release-recommendation: Green
fix-status: 3 Findings (1 H, 2 H) resolved im selben Lauf; 0 deferred.
---

## Fix-Loop Result (2026-05-14)

| Finding | Severity | Resolution |
|---------|----------|------------|
| H-1 OptionalAssetManager.load sidecar-only verification | High | Resolved -- load() berechnet jetzt zusaetzlich die SHA256 ueber den binary content und vergleicht direkt mit spec.expectedSha256. Sidecar bleibt als Pre-Filter. OptionalAssetManager.ts:103-130. |
| H-2 GitHub code-scanning #67 Insecure Randomness | High | Resolved -- Math.random()-Fallback in ConversationStore.generateConversationId entfernt. crypto.randomUUID() ist in Obsidian/Electron immer verfuegbar. ConversationStore.ts:91-98. |
| H-3 GitHub code-scanning #68 URL Substring Sanitization | High | Resolved -- Test stub-canHandle nutzt jetzt URL().hostname statt String.startsWith. AdapterRegistry.test.ts:77-89. |

Re-Audit: tsc clean, build clean (main.js 4.2 MB), Tests gruen (15/15 in den betroffenen Files), npm audit weiter 0 Findings in allen Severities.

Release-Empfehlung bleibt: **Green**.

---

# AUDIT-025: v2.9.0 Delta plus GitHub Code-Scanning Triage

## Executive Summary

Geprueft wurden 408 .ts-Files (92k LOC) nach dem v2.9.0-Release, der die Office- und PDF-Libraries als Optional Assets aus dem main.js externalisiert hat (main.js 7.3 MB -> 4.2 MB). Im Fokus standen drei Surfaces:

1. **BundleLoader Pattern G eval** -- der indirekte Function-Konstruktor evaluiert CommonJS-Bundles aus dem Vault zur Laufzeit.
2. **Optional-Asset-Loading-Chain** -- die SHA-verifizierte Asset-Mechanik in OptionalAssetManager.
3. Zwei GitHub Code-Scanning-Findings aus dem CodeQL-Run gegen Tag 2.9.0 (Alert #67 Insecure Randomness, Alert #68 URL Substring Sanitization).

Ergebnis: 0 Critical, 3 High, 0 Medium, 0 Low, 0 Info. Alle drei High-Findings wurden im selben Lauf gefixt. Eine TOCTOU-Luecke in der Sidecar-only-SHA-Verifikation (H-1) wurde durch eine zusaetzliche Content-Hash-Verifikation geschlossen. Die zwei CodeQL-Findings (H-2, H-3) wurden durch Entfernen eines defensiven aber-cryptographisch-unsicheren Fallbacks und einen Wechsel von Substring- auf URL-parser-basierte Hostname-Pruefung im Testcode geloest.

npm audit meldet weiterhin 0 Vulnerabilities in allen Severities.

Release-Empfehlung: **Green**. Patch-Release v2.9.1 mit den drei Fixes empfohlen.

## Scope der Iteration seit AUDIT-024

v2.8.x bis v2.9.0 hat folgende relevante Changes gebracht:

- v2.8.2 bis v2.8.7: Review-Bot-Compliance-Wellen (eslint-Direktiven, popout-window-compat, sentence-case, no-explicit-any-Disables entfernt). Keine security-relevanten Code-Aenderungen.
- v2.9.0: Office-Bundle und PDF-Bundle als Optional Assets ausgelagert. Neue Files:
  - `src/core/assets/BundleLoader.ts` (130 LOC) -- Singleton mit Pattern G eval und Fail-Once-Guard
  - `src/core/assets/bundle-entries/office-entry.ts` + `pdfjs-entry.ts` (Re-Export-Stubs fuer den separaten Bundle-Build)
  - `src/ui/settings/renderOptionalAssetBlock.ts` (generischer UI-Helper, ersetzt das bespoke renderSourceAssetBlock aus AUDIT-024-Scope)
- BundleLoader-Caller: CreateXlsxTool, CreateDocxTool, CreatePptxTool, PdfParser, parseDocument, AttachmentHandler -- alle mit type-only Library-Imports plus lazy load in der execute-Methode.
- `OptionalAssetManager.AssetSpec.id` Union um `'office-bundle' | 'pdfjs-bundle'` erweitert.

Neue Security-Surfaces:

- `BundleLoader.evalCommonJsBundle` (Pattern G) verarbeitet beliebigen JS-Code aus dem Vault. Trust-Argument: jsCode ist SHA256-verifizierter Asset-Content.
- `OptionalAssetManager.load` Pfad wird jetzt von zwei JS-Bundles plus dem bestehenden WASM- und Source-Bundle bedient.

## Findings

### H-1 OptionalAssetManager.load verifiziert nur das Sidecar, nicht den Binary-Content

- **Status:** Resolved
- **Severity:** High
- **CWE:** CWE-367 Time-of-check Time-of-use plus CWE-345 Insufficient Verification
- **Location:** `src/core/assets/OptionalAssetManager.ts:103-115` (vor Fix)
- **Risk:** Die SHA256-Verifikation auf dem Load-Pfad las das Sidecar `<asset>.sha256` und verglich gegen den build-time-pinned `spec.expectedSha256`. Der Binary selbst wurde nach dem Sidecar-Match nur gelesen, nicht erneut gehasht. Ein Angreifer mit Vault-Schreibrechten konnte den Binary tauschen und das Sidecar unveraendert lassen; der Load-Pfad lieferte dann den manipulierten Binary an `BundleLoader.evalCommonJsBundle`, das ihn als Code ausgefuehrt haette. Die `install`-Mechanik prueft den Binary direkt vor dem Schreiben, aber `load` umgeht diesen Check.

  Threat-Model in der Praxis: ein bereits kompromittiertes User-System hat schon vollen Zugriff und bringt keine zusaetzliche Eskalation. Ein remote Angreifer mit Sync-Provider-Zugriff (Obsidian Sync, iCloud) koennte aber Vault-Files manipulieren ohne das pluginDir zu touchen; dann waere genau das die Eskalationsstelle.

- **Remediation:** `load` berechnet jetzt zusaetzlich `crypto.subtle.digest('SHA-256', buffer)` und vergleicht das Ergebnis mit `spec.expectedSha256`. Bei Mismatch wird mit `console.warn` geloggt und `null` zurueckgegeben. Der Sidecar-Check bleibt als billige Pre-Filter-Stufe (Sidecar !== expected -> kein Hash-Compute noetig). Code:

  ```ts
  const buffer = await adapter.readBinary(path);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const contentSha = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  if (contentSha !== spec.expectedSha256) return null;
  return buffer;
  ```

### H-2 Insecure Randomness Fallback in ConversationStore (GitHub Alert #67)

- **Status:** Resolved
- **Severity:** High (per GitHub CodeQL classification)
- **CWE:** CWE-338 Use of Cryptographically Weak Pseudo-Random Number Generator
- **Location:** `src/core/history/ConversationStore.ts:92-94` (vor Fix)
- **Risk:** AUDIT-016 hatte bereits den Wechsel von `Math.random()` auf `crypto.randomUUID()` durchgezogen. Der `Math.random()`-Pfad blieb als ternary-Fallback, falls `crypto` oder `crypto.randomUUID` fehlt. CodeQL meldet diesen Pfad als `js/insecure-randomness` in einem security context. In der Obsidian-Runtime (Electron mit Chromium >= v85) ist `crypto.randomUUID` Teil der Standard Web Crypto API und immer verfuegbar; der Fallback ist toter Defensive-Code, fuer dessen Pfad CodeQL aber Code-Flow durchspielt.

- **Remediation:** Fallback entfernt. `crypto.randomUUID().replace(/-/g, '').slice(0, 12)` direkt verwendet. Inline-Kommentar dokumentiert die Entscheidung mit AUDIT-016-Querverweis und GitHub-Alert-ID.

### H-3 Incomplete URL Substring Sanitization in Adapter-Registry-Test (GitHub Alert #68)

- **Status:** Resolved
- **Severity:** High (per GitHub CodeQL classification)
- **CWE:** CWE-20 Improper Input Validation plus CWE-918 Server-Side Request Forgery (potentiell)
- **Location:** `src/core/memory/__tests__/AdapterRegistry.test.ts:79` (vor Fix)
- **Risk:** Der Test-Stub-Adapter pruefte ein URI per `uri.startsWith('https://allowed.com')`. Die Pattern erlaubt host-substring-attacks wie `https://denied.com.allowed.com/x`, die zwar im Test selbst keinen Schaden anrichten (die URL wird ja explizit als denied geprueft), aber CodeQL flagged den Substring-Match als Anti-Pattern unabhaengig vom Test-vs-Production-Kontext. Wenn jemand den Stub in Production-Code copy-pasted, waere er real SSRF-anfaellig.

- **Remediation:** Stub-Adapter nutzt jetzt `new URL(uri).hostname === 'allowed.com'` mit `try/catch` fuer malformed URLs. Inline-Kommentar dokumentiert die Entscheidung und das Anti-Pattern.

## Was bereits gut implementiert ist

- **Pattern G eval Trust-Chain:** `BundleLoader.evalCommonJsBundle` nimmt nur Bundle-Content, der vorher durch `OptionalAssetManager.load` verifiziert wurde. Trust-Boundary ist explizit und durch den H-1-Fix geschlossen.
- **Fail-Once-Guard:** BundleLoader cached pro Bundle den Fail-State. Kein Retry-Spinning bei missing Asset.
- **Type-only Imports im Tool-Layer:** Die drei Office-Tools importieren `exceljs`/`docx`/`pptxgenjs` nur als type, der eigentliche Code kommt zur Laufzeit aus dem Bundle. Keine Build-Time-Coupling auf nicht-vorhandene Libraries.
- **Tool-Reaction auf Asset-Missing:** Alle vier Tool-Callsites (CreateXlsxTool, CreateDocxTool, CreatePptxTool, PdfParser) geben strukturierte "not installed" Errors zurueck und crashen nicht.
- **Defense-in-Depth Aufruf-Kette:** `bundleLoader?.loadOfficeBundle()` mit optional chaining schuetzt gegen frueh-onload-Aufrufe vor BundleLoader-Init.
- **SHA-Pinning Build-Time:** `src/_generated/asset-bundle-hashes.ts` ist gitignored und wird von esbuild pro Build neu geschrieben; main.js sieht damit immer den freshen Hash.
- **Release-Pipeline-Attestierung:** `actions/attest-build-provenance@v2` signiert alle vier Optional Assets plus main.js und styles.css.
- **npm audit 0 findings:** Alle Severities. 22 Runtime-Deps, 20 Dev-Deps.

## SCA Status

```json
{"vulnerabilities": {"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0}}
```

Keine Vulnerabilities in der Runtime- oder Dev-Dependency-Chain.

## Zero-Trust Validation

Die Vault-Boundary ist die wichtigste Trust-Boundary:

- **Plugin -> Vault-Write:** `OptionalAssetManager.install` macht SHA-Verify VOR dem Schreiben. `installFromBuffer` (file-picker-Fallback) ebenfalls. `assertSafeFilename` schuetzt gegen Path-Traversal (AUDIT-024 L-2 fix).
- **Plugin -> Vault-Read:** `OptionalAssetManager.load` macht jetzt SHA-Verify NACH dem Lesen (H-1 fix), sodass der Vault als untrusted-store behandelt wird.
- **Plugin -> Pattern-G-Eval:** Nur ueber `OptionalAssetManager.load`. Kein anderer Pfad fuettert `evalCommonJsBundle`.

## OWASP LLM Top 10 Status

- **LLM01 Prompt Injection:** Vault-Content fliesst in den Prompt, das ist by design. Tool-Inputs vom LLM gehen NICHT in den Prompt zurueck (sie steuern Tool-Aufrufe).
- **LLM02 Insecure Output:** Tool-Writes haben Approval-Modal-Gate (AUDIT-023 reviewed).
- **LLM05 Supply Chain:** SCA clean. Optional-Asset-Bundles haben SHA-Pinning. Build-Provenance-Attestierung im Release.
- **LLM06 Sensitive Info Disclosure:** SafeStorage fuer API-Keys (AUDIT-016 confirmed).
- **LLM07 Insecure Plugin Design:** MCP-Plugins via Tool-Approval, BundleLoader via SHA-Verify.
- **LLM08 Excessive Agency:** Tool-Approval-Gate, ConsoleRingBuffer, manuelle User-Action fuer Optional-Asset-Install.

## Empfehlung

Patch-Release **v2.9.1** mit den drei Fixes. Tag-Konvention `2.9.1` (ohne v-Prefix, per Obsidian-Standard). GitHub Code-Scanning-Alerts #67 und #68 sollten nach dem Push auf den main-Branch automatisch auf "fixed" wechseln; falls nicht, manuell schliessen mit Verweis auf Commit-SHA.
