---
title: Security Audit AUDIT-025 -- Vault Operator 2.12.0 Delta
date: 2026-05-22
auditor: claude-code
scope: 2.12.0 diff against tag 2.11.8 (commit 194cec6b)
prev_audit: AUDIT-024-vault-operator-full-2026-05-21.md
risk_verdict: Low-Medium
release_recommendation: green
---

# AUDIT-025 -- Vault Operator 2.12.0 Delta-Audit

## Scope

Delta-Audit ueber den 2.12.0-Release. Geprueft werden ausschliesslich die
Dateien, die seit Tag 2.11.8 (commit 194cec6b) geaendert wurden. Vorgaenger:
gestern hat AUDIT-024 einen Full-Codebase-Audit produziert; dieser Audit
schliesst die Luecke fuer die Aenderungen der letzten 24 Stunden.

Geaendert seit 2.11.8:

| Datei | Aenderung |
|---|---|
| `src/ui/sidebar/AttachmentHandler.ts` | Auto-Save fuer PDF/DOCX/XLSX in attachmentFolderPath |
| `src/ui/AgentSidebarView.ts` | Slash-Command-Expansion vor Block-Build |
| `src/core/tools/vault/IngestTriageTool.ts` | Vault/Memory/History-Search in Tool integriert |
| `src/core/tools/vault/IngestDeepTool.ts` | block_anchors Input + Unmatched-Warning |
| `src/core/ingest/BlockIdSetter.ts` | 4-pass fuzzy matching (LCS) |
| `src/core/ingest/OutputModeGenerator.ts` | notesFolder collapse, in-place modify |
| `src/core/ingest/PdfMarkdownMirror.ts` | mirrorFolder option |
| `src/core/ingest/DeepIngestPipeline.ts` | anchorToBlockId pass-through |
| `src/core/tool-execution/ResultExternalizer.ts` | ingest_triage skip-set |
| `src/types/settings.ts` | costWarnThresholdEur default 0 |
| `bundled-skills/ingest-deep/SKILL.md` | Workflow-Rebuild |
| `bundled-skills/ingest/SKILL.md` | Frontmatter-Hygiene + Naming |

## Phase 1 -- Recon

- Sprache: TypeScript (strict)
- Framework: Obsidian Plugin API
- Build: esbuild + tsc no-emit
- Runtime: Electron via Obsidian
- AI-Surface: Anthropic SDK, OpenAI SDK, Bedrock, OpenRouter (unchanged in delta)
- Bestehende Schutzmassnahmen aus AUDIT-024: WriterLock, path-validation
  Helper, atomic writes mit Lock-File, prompt-injection-by-design Akzeptanz
  bei permissive mode, attempt_completion-Approval-Gates

## Phase 2 -- SAST

Befunde der statischen Analyse ueber den 2.12.0-Diff.

### M-1 (Mitigated bei normaler Browser-Nutzung) -- CWE-22 Defense-in-Depth in `saveExternalBinaryToAttachments`

**Location**: `src/ui/sidebar/AttachmentHandler.ts:444-471`

**Risk**: `targetPath = ${folder}/${fileName}` ohne expliziten Path-Traversal-
Check auf `fileName`. `fileName` ist das `name`-Property eines
DOM-`File`-Objekts -- Browser und Electron filtern Path-Komponenten beim
File-Drop normalerweise raus. Aber: kein expliziter Validierungslayer im
Code. Ein praeparierter Electron-Drop (per drag-and-drop API mit
File-Konstruktor und gebauter `name: '../escape/path.pdf'`) koennte das
umgehen.

**Practical exploit**: nur ueber gezielten Eingabevektor (z.B. ein
boesartiges Browser-Extension das einen File mit manipuliertem name
einsetzt). Der typische Drag-and-Drop-Use-Case liefert sanitisierte Namen.

**Status**: Confirmed -- defensive Pruefung fehlt

**Remediation**:

```ts
const safeName = fileName.replace(/[\\/]/g, '_').replace(/^\.+/, '');
if (safeName.includes('..')) {
    throw new Error(`Invalid attachment name: ${fileName}`);
}
const targetPath = `${folder}/${safeName}`;
```

Ergaenze identischen Layer in `saveExternalTemplateToVault` (Zeile 423).

### L-1 -- CWE-538 Information Exposure via console.debug

**Location**: `src/ui/sidebar/AttachmentHandler.ts:140, 142, 152, 155, 159, 459` plus
`src/core/tools/vault/IngestTriageTool.ts:317, 348, 376`

**Risk**: `console.debug` logs enthalten File-Namen, vault-relative Pfade,
Byte-Sizes und Vault-Settings (attachmentFolderPath). Bei Screenshot-Sharing
oder Bug-Reports werden potentiell sensitive Vault-Strukturen geleakt
(z.B. interne Namen wie "vertrauliches-Memo.pdf").

**Status**: Confirmed -- nicht-blockierend

**Remediation**: console.debug Calls in den Auto-Save-Pfaden auf log-level
"verbose" reduzieren oder hinter ein Setting `advancedApi.verboseAttachmentLogs`
stellen. Default off.

### L-2 -- CWE-770 Resource Exhaustion in `IngestTriageTool.searchMemory`

**Location**: `src/core/tools/vault/IngestTriageTool.ts:296-336`

**Risk**: `LIMIT 5000` plus pro-Fact Loop ueber `tokens` (typisch 5-15)
ergibt im worst case 75.000 substring-Vergleiche auf den Fact-Texten. Bei
sehr langen Fact-Texten (max nicht enforced -- prinzipiell 50k+ chars) und
einer 50-Token-Query sind das ~250.000 Vergleiche, jeder `.includes(t)`
ist O(N). Bei einem hypothetischen Fact-Store mit 5000 langen Facts und
einer breiten Query laeuft das in den Sekunden-Bereich.

**Practical exploit**: nicht boeswillig ausnutzbar (Tool laeuft nur per
User-Trigger). Aber bei wachsendem Memory-Store potentiell spuerbar.

**Status**: Confirmed -- Performance-Hinweis fuer >1000 Facts

**Remediation**: Token-Loop frueh abbrechen wenn score eine Schwelle
ueberschreitet, oder Cosine-Pfad mit precomputed Embeddings (analog
RecallMemoryTool) statt Token-Overlap. Niedrige Prioritaet -- erstmal
Bestand abwarten.

### I-1 -- Markdown-Rendering von DB-Strings im Triage-Output

**Location**: `src/core/tools/vault/IngestTriageTool.ts:357-400`

**Risk**: `searchMemory` und `searchHistory` lesen `text` und `topics` aus
SQLite und rendern sie direkt in die Triage-Karte (`renderSearchSection`).
Obsidian's Markdown-Renderer sanitised normalerweise raw HTML/JS, aber
Markdown-Image-Links auf externe URLs werden geladen (Tracking-Pixel-
Vektor). DB-Inhalt ist intern, normalerweise vom User selbst eingegeben,
also Low-Trust ist gegeben.

**Status**: Info -- by design, sollte aber im Hinterkopf bleiben wenn
Memory v2 externe Sync-Quellen bekommt.

**Remediation**: keine im 2.12.0-Scope. Wenn spaeter MCP oder Federated
Memory landet, eine Escape-Layer ergaenzen.

### Positives Finding -- SQL Prepared Statements

`searchMemory` und `searchHistory` nutzen Prepared Statements via `?`-
Binding (`db.exec(sql, params)`). Kein String-Concat von User-Input in
SQL. ✓

### Positives Finding -- Path-Validation in IngestTriageTool

`validateVaultPath` rejected `../`, NUL-Chars und absolute-Path-Marker
schon im Boundary-Layer (AUDIT-014 H-1, weiterhin im Code). ✓

### Positives Finding -- file:// URIs werden abgelehnt

`ingest_triage` lehnt `file://`-URIs explizit ab (BUG-029) mit klarer
Fehlermeldung an den Agent. Kein Stale-Mirror-Workaround moeglich. ✓

## Phase 3 -- OWASP Top 10

| Kategorie | Status im 2.12.0-Diff |
|---|---|
| A01 Broken Access Control | Unchanged. Tool-Layer prueft Pfade via validateVaultPath. ✓ |
| A02 Cryptographic Failures | Nicht relevant im Diff (keine neue Crypto). |
| A03 Injection | SQL via Prepared Statements ✓. Markdown-Output sanitized by Obsidian-Renderer (siehe I-1 fuer Image-URL-Hinweis). |
| A04 Insecure Design | OutputModeGenerator: no-duplicate Pfad ist Defense-in-Depth gegen versehentliches Ueberschreiben. ✓ |
| A05 Security Misconfiguration | `costWarnThresholdEur` Default-Flip ist eine UX-Aenderung, kein Security-Impact. |
| A06 Vulnerable Components | Siehe Phase 5 (SCA). |
| A07 Identification & Authentication | Unchanged. |
| A08 Software & Data Integrity | `vault.modify` in modifySourceInPlace -- splitFrontmatter preservation ist sauber, Frontmatter bleibt unangetastet. ✓ |
| A09 Logging Failures | console.debug-Verbosity siehe L-1 (Information Exposure). |
| A10 Server-Side Request Forgery | Keine neuen Network-Calls im Diff. ✓ |

## Phase 4 -- OWASP LLM Top 10

| Kategorie | Status |
|---|---|
| LLM01 Prompt Injection | Bekannte by-design Akzeptanz (AUDIT-003 H-1, AUDIT-024). PDF-Content geht in `<attached_document>`-Block. Boesartige PDFs koennen Instruktionen einfuehren. Skill-Body warnt nicht explizit davor -- aber das ist Vault-globale Limitation, kein 2.12.0-Regression. |
| LLM02 Insecure Output Handling | Triage-Karte wird in Markdown an Agent zurueckgegeben. Ingest_triage ist jetzt skip-externalize -- Inhalt landet direkt im Context. Obsidian-Markdown sanitized HTML. ✓ |
| LLM03 Training Data Poisoning | Nicht relevant. |
| LLM04 Model DoS | `searchMemory` (siehe L-2) limit-protected. ingest_triage laeuft einmal pro Ingest, nicht pro Turn. ✓ |
| LLM05 Supply Chain | Siehe Phase 5 (uuid CVE). |
| LLM06 Sensitive Info Disclosure | console.debug-Leaks siehe L-1. |
| LLM07 Insecure Plugin Design | `ingest_deep` als `isWriteOperation = true` -- triggert User-Approval bei nicht-auto-approve. ✓ |
| LLM08 Excessive Agency | `modifySourceInPlace` schreibt direkt ins Vault. Geschuetzt durch Approval-Gate (write_op flag) und durch atomic vault.modify. Frontmatter wird preserved -- existing user-edits bleiben. ✓ |
| LLM09 Overreliance | Triage-Empfehlung ist klar als "Empfehlung" gekennzeichnet, User entscheidet via ask_followup_question. ✓ |
| LLM10 Model Theft | Nicht relevant. |

## Phase 5 -- SCA (Software Composition Analysis)

`npm audit` Ergebnis:

```
2 vulnerabilities (0 critical, 0 high, 2 moderate, 0 low)
total dependencies: 1007 (prod 377, dev 590, optional 119, peer 23)
```

### M-2 -- CWE-787/CWE-1285 uuid Missing Buffer Bounds Check (transitiv via exceljs)

**Advisory**: https://github.com/advisories/GHSA-w5hq-g745-h8pq
**CVSS**: 7.5 (HIGH base score) -- als CVSS-Score, aber im Plugin-Kontext
ist Exploitability lower.
**Affected**: `uuid <11.1.1` -- transitiv ueber `exceljs` (direct dep).

**Risk im Plugin-Kontext**: uuid wird nur intern von exceljs benutzt (Office-
Bundle, XLSX-Export). Keine direkten User-controlled buffer inputs zu
uuid-Funktionen. Plugin-Surface ist klein.

**Status**: Confirmed -- runtime dependency, Moderate (CVSS herabgestuft
im Plugin-Kontext)

**Remediation**: `exceljs` Major-Bump auf 3.4.0 (semver-major). Alternativ
`npm overrides` fuer uuid auf >=11.1.1 ergaenzen wie schon fuer
protobufjs/hono/dompurify in package.json (ADR-074).

```json
"overrides": {
    ...,
    "uuid": "^11.1.1"
}
```

Letzteres ist niedriger-Aufwand als ein exceljs-Major-Bump und sollte
unter Tests verifiziert werden (XLSX-Generation-Pfad).

## Phase 6 -- Zero Trust & Code Quality

| Bereich | Status |
|---|---|
| Input validation an Trust-Boundary | validateVaultPath ✓, file://-Reject ✓, fileName-Validation fehlt (siehe M-1). |
| Least Privilege | `isWriteOperation = true` korrekt gesetzt fuer alle Tools die schreiben. ✓ |
| Defense in Depth | OutputModeGenerator: uniquePath plus existingFile-Check. ✓ |
| Fail-Closed Defaults | `skip_search: false` (full triage by default), `output_mode: 'source-only'` (kein naive Multi-Zettel). ✓ |
| Audit Trail | `triageStore.record` + `updateDecision` persistieren jede Triage-Decision. ✓ |
| Error Handling | catch-Bloecke logging + Notice an User. Keine silent failures im UI. ✓ |
| Resource Management | Memory-Search LIMIT 5000 (siehe L-2 fuer Edge-Case). ✓ |
| Race Conditions | Atomic vault.modify (durch Obsidian managed). ✓ |
| Hardcoded Credentials | Keine im Diff. ✓ |
| Debug code in production | console.debug-Calls in Auto-Save-Pfad (siehe L-1). |

## Zusammenfassung

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | -- |
| High | 0 | -- |
| Medium | 2 | M-1 Resolved (2.12.1), M-2 Resolved (2.12.1) |
| Low | 2 | L-1 Resolved (2.12.1), L-2 Deferred to backlog |
| Info | 1 | I-1 Deferred (by design) |

### Resolution-Sweep (2.12.1)

- **M-1**: `sanitiseAttachmentFileName(raw)` exportiert in
  `src/ui/sidebar/AttachmentHandler.ts` ergaenzt. Beide Save-Helfer
  (`saveExternalTemplateToVault`, `saveExternalBinaryToAttachments`)
  routen den `fileName`-Eingang durch die Sanitisation -- Path-
  Separator-Strip, NUL- und `..`-Reject, leading-dot-Trim. Bei leerem
  Output: Save bricht ab + User-Notice.
- **M-2**: `npm overrides` ergaenzt um `"uuid": ">=11.1.1"`. Post-`npm
  install` zeigt `npm audit` 0 Vulnerabilities ueber alle Tiers.
- **L-1**: Diagnose-`console.debug`-Calls aus `processFile` und
  `saveExternalBinaryToAttachments` entfernt. Die User-Notice ("Attachment
  saved to vault: ...") bleibt fuer den UX-Pfad, kein Verbose-Setting
  noetig.
- **L-2**: searchMemory Token-Loop bleibt vorerst -- Backlog-Item
  FIX-25-04 fuer den Edge-Case >1000 Facts.
- **I-1**: by-design, bleibt offen bis Federated Memory landet.

Positive Findings:

1. SQL Prepared Statements ueberall im neuen Code
2. validateVaultPath als Boundary-Layer
3. file://-URI-Reject (BUG-029 weiterhin enforced)
4. Slash-Command-Expansion-Fix schliesst die fruehere Sub-Skill-Fallback-Luecke
5. modifySourceInPlace preserved Frontmatter sauber
6. Tests fuer IngestTriageTool, BlockIdSetter, ResultExternalizer ergaenzt

## Risk Verdict

**Low-Medium**. Keine Critical/High Findings im 2.12.0-Diff. Die zwei
Moderate sind:

- M-1: defensive Pruefung, kein praktischer Exploit-Pfad ueber den
  normalen UI-Flow.
- M-2: SCA-Befund, transitiv, Plugin-Kontext stuft das CVSS-7.5 deutlich
  herab. `npm overrides`-Pfad ist 5-Minuten-Fix.

## Release Recommendation

**Green** fuer 2.12.0 -- Release ist bereits ueber main gegangen und im
Public-Repo veroeffentlicht. Empfohlene Follow-ups landen via Backlog im
naechsten Patch-Release.

## Empfohlene Follow-ups

1. **FIX-25-01 (M-1)**: `saveExternalBinaryToAttachments` Path-Traversal-
   Sanitisation. AttachmentHandler.ts:444-471.
2. **FIX-25-02 (M-2)**: `npm overrides` fuer uuid >=11.1.1 in
   package.json. XLSX-Test-Pfad verifizieren.
3. **FIX-25-03 (L-1)**: console.debug-Calls in Attachment- und
   IngestTriageTool-Save-Pfaden hinter ein Verbose-Setting stellen.
4. **FIX-25-04 (L-2)**: searchMemory Token-Loop Early-Exit oder Cosine-
   Pfad. Niedrige Prioritaet, abwarten bis Memory-Store >1000 Facts.

## Co-Autorenschaft

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
