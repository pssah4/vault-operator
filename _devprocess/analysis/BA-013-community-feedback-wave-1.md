# BA-013: Community Feedback Wave 1 (Issues #26 #28 #29 #30, Review-Bot, Dependabot)

> Erstellt: 2026-04-17
> Status: Draft, ready for RE
> Quelle: Public-Repo Issues seit Plugin-Submission, Obsidian Review-Bot PR #11394, GitHub Dependabot Alerts #31 #32 #33

---

## Problem-Kontext

Mit der oeffentlichen Submission an die Obsidian Community Plugin Liste (PR #11394) und dem Wechsel auf das Public-Repo `pssah4/obsilo` ist Obsilo erstmals fuer externe Tester sichtbar. Innerhalb weniger Tage sind vier Community-Issues entstanden, der Review-Bot meldet noch offene Findings, und die GitHub Security-Pipeline hat drei transitive Dependency-Vulnerabilities markiert (eine davon Critical).

Der Plugin-Approval-Prozess der Obsidian Community blockiert solange weitere Findings offen sind. Solange der Bot rote Findings hat, wird das Plugin nicht in den Public-Katalog aufgenommen, also bleibt die Reichweite auf BRAT-Nutzer beschraenkt.

Gleichzeitig zeigt das Community-Feedback echte Funktionsluecken: Die Provider-Schicht funktioniert auf Mac/Linux mit Anthropic/OpenRouter, aber bricht auf Windows (Pfad-Trennzeichen), bei GitHub Copilot (max_tokens vs. max_completion_tokens) und bei OpenRouter Modellen, die finish_reason="stop" statt "tool_calls" senden. Issue #26 ist kein Bug, sondern eine valide Feature-Anfrage zur Erweiterung der Speicherorte fuer Skills, Agent-Definitionen und Tasks.

## Stakeholder

| Stakeholder | Interesse | Einfluss |
|-------------|-----------|----------|
| Obsidian Community Reviewer | Plugin entspricht Developer Policies und Bot-Findings sind null | Hoch (Approval-Gate) |
| Plugin-Tester (BRAT) | Plugin laeuft auf Windows, Copilot funktioniert, OpenRouter-Tool-Calls werden nicht verschluckt | Hoch (Bug-Reports, Word-of-Mouth) |
| Power-User (FolderBridge, Templates) | Skills/Tasks/Agents in versionierbarem Pfad ablegen koennen | Mittel (Issue #26, einer aktiv, andere implizit) |
| GitHub Security | Critical-Vulnerabilities werden zeitnah gepatcht | Hoch (Dependabot blockiert merges/Releases) |
| Sebastian (Maintainer) | Stabile Public-Release-Pipeline, klar dokumentierter Fix-Workflow | Hoch |

## As-Is Analyse

### Bug-Klasse 1: OpenRouter gpt-oss-120b Tool-Calls werden verschluckt (#30)

`src/api/providers/openai.ts` (Streaming-Loop, Zeile ca. 250-330) akkumuliert Tool-Call-Deltas in `toolCallAccumulators`. Die Akkumulatoren werden nur ausgegeben, wenn `finish_reason === "tool_calls"`. OpenRouter (und andere kompatible Provider) liefern fuer einige Modelle (gpt-oss-120b) jedoch `finish_reason === "stop"` mit Tool-Call-Deltas im Stream. Folge: Der Agent sieht Tool-Calls als JSON-Text statt als ausgefuehrte Tools.

Nicholas Leonard hat den Fix bereits in seinem Fork (`fix/openai-tool-call-flush`, Commit 1fffe76) demonstriert. Wir muessen ihn in unsere Codebase uebernehmen.

### Bug-Klasse 2: TMP-Pfade nicht Windows-kompatibel (#29)

`src/core/tool-execution/ResultExternalizer.ts` schreibt `tmp/${taskId}/${toolName}-${counter}.md` ueber den `FileAdapter`. Auf Windows funktioniert das Schreiben, aber der Agent erhaelt die Empfehlung `read_file("tmp/task-1776202886104/use_mcp_tool-1.md")` mit Forward-Slashes. `read_file` schlaegt fehl, vermutlich weil das vault.adapter-API auf Windows die Pfad-Normalisierung anders handhabt oder weil die Vault-Wurzel nicht uebereinstimmt.

Wir nutzen aktuell weder `normalizePath` aus dem Obsidian-API noch das Node-`path`-Modul. Der Code geht implizit davon aus, dass Forward-Slashes ueberall funktionieren.

### Bug-Klasse 3: GitHub Copilot lehnt max_tokens ab (#28)

`src/api/providers/github-copilot.ts:170` sendet `max_tokens` im Request-Body. Neuere Copilot-Modelle (z.B. die o1-Familie via Copilot-Gateway) lehnen diesen Parameter ab und verlangen `max_completion_tokens`. `src/api/providers/openai.ts:227-251` hat dieses Branching bereits korrekt fuer `type === "openai" || type === "azure"`. Der Copilot-Provider hat es nicht.

### Feature-Anfrage: Konfigurierbarer Agent-Folder (#26)

Der Pfad `.obsidian-agent/` ist hartcodiert (siehe SkillRegistry-Prompt-Section "read_file('.obsidian-agent/plugin-skills/{plugin-id}.skill.md')", Vault-DNA-Scanner, GlobalFileService Default). User mit Workflows wie FolderBridge oder versionierten Vault-Skills wollen den Pfad selbst waehlen, etwa um Skills in einem privaten Submodule zu halten oder um mehrere Vaults dieselbe Skills-Bibliothek zu teilen.

### Review-Bot Findings (PR #11394, letzte Scans)

1. Sentence-Case-Verstoesse in `src/ui/settings/ModelConfigModal.ts` (Bedrock-Setup-UI) und einigen verbliebenen `en.ts`-Strings. Der letzte Scan zeigt 8 verbliebene Stellen in `ModelConfigModal.ts` (Zeilen 771, 774, 777, 780, 783, 1208, 1248, 1281).
2. Implied eval in `src/core/sandbox/EsbuildWasmManager.ts:223` (`new Function(...)`). Wir haben die Regel mit ausfuehrlicher Begruendung deaktiviert, aber der Bot meldet weiterhin. Wir muessen entweder eine echte Alternative finden (z.B. via Web Worker mit `eval` im Worker-Scope, oder vorab-kompiliertes esbuild-bundle) oder den `/skip`-Workflow nutzen mit deutlicher Sicherheits-Begruendung.
3. Hartcodierter `.obsidian` Pfad disable in `src/core/knowledge/KnowledgeDB.ts:154`. Hier haben wir die Regel deaktiviert. Mit FEATURE-0507 (konfigurierbarer Agent-Folder, EPIC-005) loesen wir die zugrundeliegende Konstante sauber auf, sodass der Disable nicht mehr noetig ist.
4. `@typescript-eslint/no-explicit-any` Disables in MCP-Code (`RerankerService.ts`, `SemanticIndexService.ts`, `CloudflareDeployer.ts`, `McpBridge.ts`). Wir muessen die Typen schaerfer fassen (statt `any` z.B. `unknown` mit Type-Guards oder explizite Interface-Typen aus dem MCP-SDK).
5. Object-Stringification Warnings in `src/mcp/tools/*` und `src/core/tool-execution/inputSchemaValidator.ts:75`. `args.query ?? ''` etc. werden in Templates als `[object Object]` ausgegeben, wenn `args.query` keine String ist. Fix: Type-Narrowing per `String(value)` oder `JSON.stringify` mit Guards.
6. Unbeschriebene `eslint-disable`-Direktiven in MCP-Worker und CloudflareDeployer.
7. Kleinere Findings: Unnecessary type assertions, unused `t`-Variable in VaultHealthRepairModal.

### Dependabot Vulnerabilities

| Alert | Paket | Severity | Pfad | Fix |
|-------|-------|----------|------|-----|
| #33 | protobufjs (transitiv via `@huggingface/transformers > onnxruntime-web`) | Critical (CVSS 9.4, RCE) | `>= 7.5.5` | `npm overrides` auf `7.5.5+` |
| #31 | hono (transitiv via `@modelcontextprotocol/sdk > @hono/node-server`) | Medium (CVSS 4.3, XSS) | `>= 4.12.14` | `npm overrides` auf `4.12.14+`, falls SDK kompatibel |
| #32 | dompurify (transitiv via `mermaid`, dev-dependency) | Medium (CVSS 5.3, FORBID_TAGS-Bypass) | `>= 3.4.0` | `npm overrides` auf `3.4.0+`, oder mermaid hochziehen |

Wir nutzen `protobufjs` nicht direkt im Plugin-Code. Es ist nur Teil der ONNX-Runtime, die fuer den Reranker geladen wird. Trotz Critical CVSS ist das praktische Risiko bei uns gering, da wir keine externen protobuf-Definitionen entgegennehmen. Trotzdem zwingt GitHub uns zum Patch.

## To-Be (gewuenschter Zustand)

1. Alle vier Community-Issues (#26 #28 #29 #30) sind geschlossen.
2. Review-Bot meldet null Required-Findings auf den naechsten Scan (Optional-Findings sind toleriert).
3. Dependabot zeigt null offene Critical/Medium Alerts.
4. Skill- und Agent-Definitionen koennen in einem konfigurierbaren Pfad liegen (per Setting).
5. Cross-Platform-Pfad-Handling ist konsistent ueber den `FileAdapter` abstrahiert (Forward-Slash, normalisiert).
6. Provider-Schicht hat einen einheitlichen Branch fuer `max_tokens` vs. `max_completion_tokens`, der auch fuer Copilot greift.
7. Tool-Call-Streaming ist resilient gegen alle drei `finish_reason` Werte (`tool_calls`, `stop`, `length`).

## Gap Analyse

| Bereich | Heute | Soll | Loesungs-Pfad |
|---------|-------|------|----------------|
| OpenAI Tool-Stream | nur `finish_reason === "tool_calls"` flush | post-loop flush fuer alle finish_reasons | FEATURE-0409 (EPIC-004) |
| TMP-Paths | implizite Forward-Slash-Annahme | `normalizePath` + Path-Adapter im FileAdapter | FEATURE-1803 (EPIC-018) |
| Copilot Body | `max_tokens` immer | branch wie OpenAI: `max_completion_tokens` fuer neuere Modelle | FEATURE-1206 (EPIC-012) |
| Agent-Folder | `.obsidian-agent/` hartcodiert | Setting `agentFolderPath`, default unveraendert | FEATURE-0507 (EPIC-005) + ADR-072 |
| Review-Bot | 4 Disable-Klassen + Sentence-Case-Reste | null Disables mit Begruendung, alle Findings sauber | ADR-073 (Querschnitt, IMPL-007 Phase 6) |
| Dependencies | 1 Critical + 2 Medium offen | npm overrides + Smoke-Tests | ADR-074 (Querschnitt, IMPL-007 Phase 1) |

## Nicht im Scope (Wave 1)

- Tiefere MCP-Worker-Refactorings ueber das Type-Tightening hinaus.
- Migration auf eine andere ONNX-Runtime (z.B. native node-onnxruntime). Wenn der protobufjs-Patch via `overrides` reicht, bleiben wir bei transformers.js.
- Multi-Vault-Skills-Sharing (Issue #26 erwaehnt das implizit). Erst wenn FEATURE-0507 stabil ist, evaluieren wir Symlink/Submodule-Patterns.
- Aenderungen am Sandbox-Loader (`new Function`). Wenn der `/skip` mit Begruendung akzeptiert wird, bleibt der Code unveraendert.

## Erfolgskriterien (messbar)

| ID | Kriterium | Messung |
|----|-----------|---------|
| BA013-SC-01 | Issues #26 #28 #29 #30 sind geschlossen | GitHub-Status |
| BA013-SC-02 | Review-Bot Required-Findings = 0 | Bot-Kommentar im PR #11394 |
| BA013-SC-03 | Dependabot Critical/Medium = 0 | GitHub Security-Tab |
| BA013-SC-04 | `agentFolderPath` Setting wirkt auf Skills, Tasks, Plugin-Skills, KnowledgeDB | Manueller Test in zwei Vaults mit unterschiedlichen Pfaden |
| BA013-SC-05 | Copilot-Modell aus dem Konfig-UI laesst sich erfolgreich aufrufen | Test mit `runTest()` plus echter Chat-Nachricht |
| BA013-SC-06 | OpenRouter gpt-oss-120b Tool-Call wird ausgefuehrt (nicht als Text geliefert) | Manueller Test mit list_files Tool |
| BA013-SC-07 | Auf Windows gespeicherte tmp-Files lassen sich vom Agent re-lesen | Test in Windows-VM, Test-Vault |

## Innovations-Phasen

- **EXPLORATION:** abgeschlossen, Issues und Bot-Findings sind durchanalysiert (siehe BUG-013/014/015 und Review-Bot-Comments oben).
- **IDEATION:** alle Loesungswege sind technisch klar, keine offenen Hypothesen mehr.
- **VALIDATION:** Wave 1 wird per V-Model umgesetzt (siehe IMPL-007).
