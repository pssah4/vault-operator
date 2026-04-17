# IMPL-007: Community Feedback & Compliance Wave 1 -- Implementierungsplan

> Erstellt: 2026-04-17
> Branch-Vorschlag: `feature/community-wave-1` (alle Phasen darunter, dann via merge-to-dev.sh)
> Release-Ziel: v2.5.0
> Geschaetzter Aufwand: 1.5-2 Tage Implementation, plus Bot-Re-Scan-Wartezeiten
>
> **Hinweis zur Struktur:** Dieser IMPL-Plan buendelt sechs unterschiedlich-gerichtete Arbeitsstroeme zu einer Release-Wave, OHNE ein neues Epic zu erfinden. Die fachlichen Features sind in die bestehenden Epics einsortiert (siehe Mapping unten). Querschnittliche Compliance- und Security-Maintenance hat keinen Feature-Spec; sie ist nur in diesem IMPL-Plan, in den ADRs (ADR-073, ADR-074) und in `memory/review-bot-compliance.md` dokumentiert.

---

## 1. Kontext

Die Public-Submission (PR obsidianmd/obsidian-releases#11394) ist seit dem Bot-Roundtrip mit ModelConfigModal-Sentence-Case-Findings ausgesetzt. Parallel sind vier Community-Issues, eine Critical-Vulnerability und zwei Medium-Vulnerabilities offen. Wave 1 zielt auf vollstaendige Aufloesung dieser Punkte mit minimalem Risiko.

## 2. Mapping zu Epics, Features, Bugs, ADRs

| Arbeitsstrom | Issue | Epic | Feature-Spec | Bug-Analyse | ADR |
|--------------|-------|------|--------------|-------------|-----|
| OpenAI-kompatible Tool-Call-Robustheit | #30 | EPIC-004 (Providers, Web, Localization) | FEATURE-0409 | BUG-013 | -- |
| Cross-Platform TMP-Pfade | #29 | EPIC-018 (Token-Kostenreduktion) | FEATURE-1803 | BUG-014 | ADR-063 (bestehend) |
| Copilot max_completion_tokens | #28 | EPIC-012 (GitHub Copilot Provider) | FEATURE-1206 | BUG-015 | -- |
| Konfigurierbarer Agent-Folder | #26 | EPIC-005 (Self-Development & Sandbox) | FEATURE-0507 | -- | ADR-072 |
| Review-Bot Hardening | PR #11394 | (kein Epic, Querschnitt) | (kein Feature) | -- | ADR-073 |
| Dependency Patches | Dependabot #31 #32 #33 | (kein Epic, Querschnitt) | (kein Feature) | -- | ADR-074 |

**Strategie:** Sechs Arbeitsstroeme parallelisierbar, aber per Phasen-Reihenfolge geordnet (Security zuerst, dann Bug-Fixes, dann Feature, dann Compliance-Cleanup mit Re-Scan-Loop).

## 3. Phasen

### Phase 0 -- Vorbereitung

**Ziel:** Branch und Tooling bereit. Smoke-Tests definiert.

**Schritte:**
1. Branch `feature/community-wave-1` von `dev` erstellen.
2. Smoke-Test-Checkliste (siehe Abschnitt 5) im Branch hinterlegen oder als Hilfs-Datei im _devprocess.
3. Lokalen Lint-Run vor Start: `npm run lint -- --max-warnings=0`. Aktueller Stand notieren.

**Verifikation:** Branch existiert, Lint-Status dokumentiert.

---

### Phase 1 -- Dependency Vulnerabilities (ADR-074, kein Feature)

**Ziel:** Dependabot Critical+Medium = 0.

**Datei:** `package.json` (overrides-Block hinzufuegen).

**VORHER:**
```json
"dependencies": { ... }
```

**NACHHER:**
```json
"dependencies": { ... },
"overrides": {
  "protobufjs": "^7.5.5",
  "hono": "^4.12.14",
  "dompurify": "^3.4.0"
}
```

**Schritte:**
1. Override-Block in `package.json` einfuegen.
2. `rm -rf node_modules package-lock.json && npm install`.
3. `npm ls protobufjs hono dompurify` (alle drei muessen die Override-Version zeigen).
4. `npm audit --production` (0 Critical/Medium).
5. Smoke-Tests:
   - `npm run build` (esbuild laeuft durch).
   - Test-Vault: semantic_search ausfuehren -> Reranker laedt.
   - Test-Vault: MCP ueber Claude Desktop -> list_tools antwortet.
   - Test-Vault: Mermaid-Block in Chat-Nachricht senden -> rendert.
6. Nach Erfolg: commit mit `fix(security): override protobufjs/hono/dompurify to patched versions`. Co-Authored-By Claude.

**Risiko:** Niedrig. Patch-Versionen, semver-kompatibel.

**Anker im V-Model:** ADR-074 (Decision-Record), kein Feature-Spec (Maintenance-Aufgabe).

---

### Phase 2 -- BUG-013 OpenAI Tool-Call Flush (FEATURE-0409, EPIC-004)

**Ziel:** OpenRouter gpt-oss-120b und aehnliche Modelle fuehren Tools aus.

**Datei:** `src/api/providers/openai.ts`, `src/api/providers/github-copilot.ts` (gleicher Fix, weil dieselbe Streaming-Loop-Struktur).

**Schritte:**
1. Im Streaming-For-Loop hinter dem `for await`-Block: Akkumulator-Map auf nicht-leere Eintraege pruefen, jeweils `type: "tool_use"` Event yielden.
2. Type-Sicherheit: `acc.id`, `acc.name` muessen vorhanden sein, sonst Warnung loggen und ueberspringen.
3. Unit-Test in `tests/api/providers/openai.test.ts` (oder neue Datei): Mock-Stream mit `delta.tool_calls` und `finish_reason="stop"` muss mindestens einen `tool_use` Event produzieren.
4. Regression: Mock-Stream mit `finish_reason="tool_calls"` produziert genau einen Event pro Tool-Call (kein Doppel-Yield).
5. Live-Test: OpenRouter-Modell `openai/gpt-oss-120b` mit list_files-Aufruf in einem Test-Vault.
6. Commit: `fix(providers): flush accumulated tool calls when finish_reason is not 'tool_calls'`.

**Risiko:** Niedrig. Additiver Fix, alte Pfade unveraendert.

**Anker im V-Model:** FEATURE-0409 in EPIC-004, BUG-013.

---

### Phase 3 -- BUG-015 Copilot max_completion_tokens (FEATURE-1206, EPIC-012)

**Ziel:** Copilot gpt-5/o4-mini funktionieren.

**Datei:** `src/api/providers/github-copilot.ts:170`.

**VORHER:**
```typescript
max_tokens: effectiveMaxTokens,
```

**NACHHER:**
```typescript
max_completion_tokens: effectiveMaxTokens,
```

(Zeile in classifyText() bei Zeile 273 ebenfalls anpassen.)

**Schritte:**
1. Beide Stellen aendern (`createMessage` und `classifyText`).
2. Smoke-Test ueber `runTest()`: Copilot mit gpt-5 (oder dem Default-Modell des aktuellen Setups).
3. Live-Test in der Sidebar: User-Nachricht beantworten lassen.
4. Commit: `fix(copilot): use max_completion_tokens for all models`.

**Risiko:** Niedrig. Copilot-Gateway akzeptiert max_completion_tokens fuer alle Modelle (lt. GitHub Copilot Docs). Falls ein Modell sich beschwert: Fallback-Variante mit Try-with-fallback.

**Anker im V-Model:** FEATURE-1206 in EPIC-012, BUG-015.

---

### Phase 4 -- BUG-014 Cross-Platform TMP-Pfade (FEATURE-1803, EPIC-018)

**Ziel:** Windows-Test laeuft durch.

**Dateien:** `src/core/tool-execution/ResultExternalizer.ts`, `src/core/storage/VaultFileService.ts` (oder vergleichbar).

**Schritte:**
1. `normalizePath` aus `obsidian` importieren in ResultExternalizer.
2. `this.tmpDir = normalizePath(`tmp/${taskId}`)`.
3. `filePath = normalizePath(`${this.tmpDir}/${fileName}`)`.
4. `formatDefaultRef` und Konsorten: alle path-Argumente durch `normalizePath()` jagen.
5. mkdir-Pfad: pruefen ob `tmp` existiert, sonst zuerst anlegen, dann `tmp/task-X` (rekursive mkdir-Semantik nicht ueberall garantiert).
6. Im FileAdapter (VaultFileService) eine `join(...parts: string[])` Methode ergaenzen, die intern `normalizePath` verwendet.
7. Smoke-Test: macOS, semantic_search mit grossem Result, Folge-read_file.
8. Live-Test: Windows-VM oder GitHub-Actions Windows-Runner. Falls keine VM verfuegbar: User aus Issue #29 zur Verifikation kontaktieren oder Closed-Beta-Tester einbinden.
9. Commit: `fix(externalizer): normalize tmp paths and create tmp parent dir on Windows`.

**Risiko:** Mittel. Windows-Verhalten ohne Test-Host schwer zu validieren. Fallback: User aus dem Issue als Verifier einbinden.

**Anker im V-Model:** FEATURE-1803 in EPIC-018, BUG-014.

---

### Phase 5 -- FEATURE-0507 Konfigurierbarer Agent-Folder (EPIC-005)

**Ziel:** Setting `agentFolderPath` wirkt auf alle Konsumenten. KnowledgeDB.ts:154 Disable entfaellt.

**Dateien:**
- `src/types/AgentSettings.ts` (oder dort wo Settings definiert sind): neues Feld `agentFolderPath?: string`.
- `src/core/utils/agentFolder.ts` (NEU): Helper `getAgentFolderPath(plugin)` und `getPluginSkillsPath(plugin, pluginId)`.
- `src/core/knowledge/KnowledgeDB.ts:172`: `globalRoot` und `vaultRelativePath` aus Helper holen statt Hardcode. `eslint-disable obsidianmd/hardcoded-config-path` entfernen.
- `src/core/skills/SkillRegistry.ts:63`: Prompt-Section nutzt Helper-Pfad.
- `src/core/skills/VaultDNAScanner.ts`: Ablage- und Lese-Pfad ueber Helper.
- `src/ui/settings/GeneralTab.ts` (oder relevant): UI-Feld fuer `agentFolderPath` mit Default-Hint.
- `src/i18n/locales/*.ts`: i18n-Keys fuer das neue Setting.

**Schritte:**
1. Helper-Datei anlegen.
2. Setting-Feld + Default-Wert.
3. Settings-UI: Eingabefeld mit Description "Vault-relativer Pfad. Default: .obsidian-agent. Bestehende Dateien werden nicht migriert.".
4. Alle Hartcodierungen (`grep -rn "\\.obsidian-agent" src/`) durchgehen und auf Helper umstellen.
5. SkillRegistry-Prompt-Section: Pfad als Variable in den String einsetzen.
6. Smoke-Test mit Default-Pfad: Skills laden wie zuvor.
7. Smoke-Test mit Custom-Pfad `_skills/agent`: Skills muessen dort gefunden werden.
8. Bot-Compliance-Check: KnowledgeDB.ts:154 Disable ist weg, kein neues Finding.
9. Commit: `feat(settings): configurable agent folder path (resolves issue #26)`.

**Risiko:** Mittel. Viele Touch-Punkte. Risiko von Pfad-Drift wenn ein Konsument vergessen wird.

**Anker im V-Model:** FEATURE-0507 in EPIC-005, ADR-072.

---

### Phase 6 -- Review-Bot Hardening Wave 2 (ADR-073, kein Feature)

**Ziel:** Bot Required-Findings = 0.

**Dateien:**
- `src/ui/settings/ModelConfigModal.ts`: Sentence-Case-Strings (Bedrock-Setup-UI).
- `src/i18n/locales/en.ts`: verbliebene Sentence-Case-Reste, Disable-Direktiven entfernen.
- `src/ui/modals/VaultHealthRepairModal.ts`: Disable entfernen, Strings fixen, unused t-Variable entfernen.
- `src/ui/settings/EmbeddingsTab.ts:557`: Disable entfernen, Strings fixen.
- MCP-Code (siehe ADR-073): Helper `coerceStringArg` einfuehren, `no-explicit-any` Disables entfernen.
- `src/core/sandbox/EsbuildWasmManager.ts:223`: Implied-Eval bleibt mit Begruendung. `/skip`-Kommentar im PR vorbereiten.
- `src/core/AssetProvisioner.ts:61`, `src/core/semantic/SemanticIndexService.ts:983`: Unnecessary Type Assertions entfernen.
- `src/mcp/CloudflareDeployer.ts`, `src/mcp/McpBridge.ts`, `src/mcp/mcp-server-worker.ts`: Disable-Direktiven mit `-- reason` ergaenzen.

**Schritte:**
1. ADR-073-Helper `coerceStringArg`, `coerceNumberArg` in `src/mcp/tools/argHelpers.ts` anlegen.
2. Alle MCP-Tools auf Helper umstellen.
3. `no-explicit-any` Disables in MCP-Code entfernen.
4. Sentence-Case-Strings in `ModelConfigModal.ts` fixen.
5. `en.ts` Sentence-Case-Disables entfernen, Strings echt fixen.
6. VaultHealthRepairModal und EmbeddingsTab analog.
7. Unnecessary type assertions entfernen.
8. Eslint-disable-Direktiven mit `-- reason` ergaenzen.
9. Lokal `npm run lint -- --max-warnings=0` muss durchlaufen.
10. Build und Smoke-Tests.
11. Commit-Serie (klein gehalten):
   - `chore(mcp): introduce arg helpers for type-safe MCP tool inputs`
   - `chore(mcp): remove no-explicit-any disables now that helpers cover args`
   - `fix(review-bot): sentence-case in ModelConfigModal and en.ts`
   - `fix(review-bot): remove unnecessary type assertions`
   - `chore(eslint): annotate remaining disables with -- reason`

**Risiko:** Mittel. Viele kleine Aenderungen. Hauptrisiko: Sprache-Faux-Pas in i18n. Stichprobe pro Sprache.

**Anker im V-Model:** ADR-073 (Decision-Record), kein Feature-Spec. Begruendung: Wiederkehrende Compliance-Maintenance, kein fachliches Feature. Vorgehen analog zu IMPL-001 (Review-Bot-Fixes vor PR-Round 1).

**Memory-Verweis:** `memory/review-bot-compliance.md` enthaelt die kanonische Liste der Plugin-Review-Regeln.

---

### Phase 7 -- Release & Bot-Re-Scan

**Ziel:** v2.5.0 raus, Bot scannt clean.

**Schritte:**
1. `_devprocess/release-notes/v2.5.0.md` schreiben (kurz: 4 Bug-Fixes, 1 Feature, 1 Security-Patch, Compliance).
2. `version-bump.mjs` ausfuehren oder manuell `manifest.json` und `versions.json` updaten.
3. Merge `feature/community-wave-1` -> `dev` via `scripts/merge-to-dev.sh`.
4. Smoke-Test in Test-Vault.
5. Merge `dev` -> `main`.
6. `promote-to-test` Script falls noetig.
7. Sync-Public CI laeuft, Public-Repo bekommt den Commit.
8. Bot startet neuen Scan binnen 6h. Ergebnis abwarten.
9. Falls noch Findings: Phase 6 Sub-Iteration.
10. Falls Bot clean: GitHub-Release v2.5.0 publishen.
11. Issues #26 #28 #29 #30 schliessen mit Verweis auf Release-Tag.

**Risiko:** Niedrig wenn Phasen 0-6 sauber sind. Hoch wenn Bot neue, bisher unentdeckte Findings meldet (dann Phase 6 wiederholen).

---

## 4. Dateien-Zusammenfassung

| Datei | Aenderung | Risiko | Phase | Trace |
|-------|-----------|--------|-------|-------|
| `package.json` | overrides-Block | Niedrig | 1 | ADR-074 |
| `src/api/providers/openai.ts` | Post-Loop tool-call flush | Niedrig | 2 | FEATURE-0409 / BUG-013 |
| `src/api/providers/github-copilot.ts` | Flush + max_completion_tokens | Niedrig | 2, 3 | FEATURE-0409 + FEATURE-1206 / BUG-013, BUG-015 |
| `src/core/tool-execution/ResultExternalizer.ts` | normalizePath, mkdir-Parent-Check | Mittel | 4 | FEATURE-1803 / BUG-014 |
| `src/core/storage/VaultFileService.ts` | join()-Helper, normalizePath | Mittel | 4 | FEATURE-1803 |
| `src/types/AgentSettings.ts` | neues Feld agentFolderPath | Niedrig | 5 | FEATURE-0507 / ADR-072 |
| `src/core/utils/agentFolder.ts` (NEU) | Helper | Niedrig | 5 | FEATURE-0507 / ADR-072 |
| `src/core/knowledge/KnowledgeDB.ts` | Helper-Aufruf, Disable weg | Mittel | 5 | FEATURE-0507 / ADR-072 |
| `src/core/skills/SkillRegistry.ts` | Helper-Aufruf in Prompt | Niedrig | 5 | FEATURE-0507 |
| `src/core/skills/VaultDNAScanner.ts` | Helper-Aufruf | Niedrig | 5 | FEATURE-0507 |
| `src/ui/settings/GeneralTab.ts` | Settings-UI-Feld | Niedrig | 5 | FEATURE-0507 |
| `src/i18n/locales/*.ts` | Sentence-Case + neuer Setting-Key | Mittel | 5, 6 | FEATURE-0507 + ADR-073 |
| `src/ui/settings/ModelConfigModal.ts` | Sentence-Case in Bedrock-Setup | Niedrig | 6 | ADR-073 |
| `src/ui/modals/VaultHealthRepairModal.ts` | Sentence-Case, unused t weg | Niedrig | 6 | ADR-073 |
| `src/ui/settings/EmbeddingsTab.ts` | Sentence-Case Disable weg | Niedrig | 6 | ADR-073 |
| `src/mcp/tools/argHelpers.ts` (NEU) | Helper coerce* | Niedrig | 6 | ADR-073 |
| `src/mcp/tools/index.ts`, `searchVault.ts`, `syncSession.ts`, `updateMemory.ts` | Helper nutzen, Disables weg | Mittel | 6 | ADR-073 |
| `src/mcp/RelayClient.ts` | Stringification fixen | Niedrig | 6 | ADR-073 |
| `src/mcp/McpBridge.ts`, `CloudflareDeployer.ts`, `mcp-server-worker.ts` | Disables annotieren oder durch Typen ersetzen | Mittel | 6 | ADR-073 |
| `src/core/tool-execution/inputSchemaValidator.ts` | Stringification fixen | Niedrig | 6 | ADR-073 |
| `src/core/AssetProvisioner.ts:61` | Type-Assertion weg | Niedrig | 6 | ADR-073 |
| `src/core/semantic/SemanticIndexService.ts:983` | Type-Assertion weg | Niedrig | 6 | ADR-073 |
| `manifest.json`, `versions.json` | Version 2.5.0 | Niedrig | 7 | -- |
| `_devprocess/release-notes/v2.5.0.md` | Release-Doku | Niedrig | 7 | -- |

## 5. Smoke-Test-Matrix

| Schritt | Kriterium | Werkzeug |
|---------|-----------|----------|
| Build | `npm run build` ohne Fehler | esbuild |
| Lint | `npm run lint -- --max-warnings=0` ohne Fehler | eslint |
| Audit | `npm audit --production` -> 0 Critical/Medium | npm |
| Smoke 1 | OpenRouter gpt-oss-120b ruft Tool auf | Test-Vault |
| Smoke 2 | Copilot gpt-5 antwortet | Test-Vault |
| Smoke 3 | Windows: tmp-Files lesbar | VM oder Issue-Reporter |
| Smoke 4 | agentFolderPath wirkt | Test-Vault mit Custom-Pfad |
| Smoke 5 | Mermaid-Render | Test-Vault |
| Smoke 6 | MCP via Claude Desktop | Claude-App |
| Bot-Re-Scan | Bot Required = 0 | PR #11394 |
| Dependabot | 0 Critical/Medium auf main | GitHub Security |

## 6. Nicht betroffen (Blast-Radius-Begrenzung)

- AgentTask-Loop, Mode-System, Sandbox-Loader.
- Memory-System, Recipe-System.
- PPTX/DOCX/XLSX-Pipelines.
- Knowledge-Maintenance (EPIC-019).
- Self-Development-Tools (Code unveraendert, nur Storage-Pfad konfigurierbar).
- Web-Tools, Onboarding.

## 7. Rollback-Strategie

Falls eine Phase nach Merge in `dev` ausserhalb der Smoke-Tests Probleme zeigt:
- Phase 1 (Overrides): `git revert` des package.json-Commits, `npm install` rerun.
- Phase 2-3 (Provider): `git revert`, alte Provider-Logik wiederherstellen.
- Phase 4 (TMP): Rollback ist riskant, weil die alten Pfade auf macOS funktionieren. Stattdessen: Hotfix-Commit mit der minimalen Aenderung (nur normalizePath, ohne mkdir-Parent-Check).
- Phase 5 (Agent-Folder): Setting-Default unveraendert, also Rollback einfach via revert. KnowledgeDB-Disable muss gegebenenfalls wieder eingefuehrt werden.
- Phase 6 (Bot-Hardening): Pro Commit reverten. Sentence-Case-Reverts sind risikolos.
- Phase 7 (Release): Falls v2.5.0 Crashes meldet: hotfix-Branch von Tag, Patch-Release v2.5.1.

`scripts/merge-to-dev.sh` schreibt automatisch einen `dev-backup`-Snapshot, daher ist `git checkout dev && git reset --hard dev-backup` der Notfall-Hebel.

## 8. Backlog-Update (nach Release)

Wenn v2.5.0 raus ist, folgende Status-Updates:
- FEATURE-0409 (EPIC-004): Geplant -> Implementiert
- FEATURE-1206 (EPIC-012): Geplant -> Implementiert
- FEATURE-1803 (EPIC-018): Geplant -> Implementiert
- FEATURE-0507 (EPIC-005): Geplant -> Implementiert
- BUG-013, BUG-014, BUG-015: Resolved-Status setzen
- ADR-072, ADR-073, ADR-074: Status Proposed -> Accepted
- MEMORY: Eintrag fuer Wave 1 aktualisieren (Release-Datum, Lessons Learned)
- REQUIREMENTS-overview: Status der Features auf Implementiert
