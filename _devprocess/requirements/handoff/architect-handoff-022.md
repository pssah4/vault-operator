# Architect Handoff: EPIC-022 Skill-Package Ecosystem

> **Epic**: EPIC-022
> **BA Reference**: `_devprocess/analysis/BA-021-skill-package-ecosystem.md`
> **Features**: FEATURE-2201 bis FEATURE-2204
> **Date**: 2026-04-17

---

## 1. Executive Context

Obsilo akzeptiert Skills heute als einzelne `SKILL.md` Files. Anthropic hat
im Spaetsommer 2025 auf [agentskills.io](https://agentskills.io/specification)
einen offenen Skill-Standard etabliert: **Ordner** mit `SKILL.md` plus
optionalen `scripts/`, `references/`, `assets/` Subfolders, verteilt als
`.skill` Zip. Claude Code, Claude Desktop und die Claude API konsumieren
dieses Format; es gibt 17+ offizielle Skills im Repo
[anthropics/skills](https://github.com/anthropics/skills).

EPIC-022 macht Obsilo zu diesem Format **rueckwaerts-kompatibel** (alte
Single-File-Skills funktionieren weiter) und fuegt eine Obsilo-spezifische
**Coordinator-Erweiterung** hinzu: ein Skill-Ordner kann mehrere `*.skill.md`
Sub-Rollen enthalten, orchestriert durch die Haupt-`SKILL.md`. Das geht
ueber die Anthropic-Spec hinaus, passt aber zu Obsilos Agent-Loop mit
`new_task` / Mode-Switching.

Kern-Design-Prinzipien:

1. **Additiv, keine Breaking Changes:** Bestehende 9 bundled-skills und
   alle User-Skills laufen unveraendert.
2. **Security first:** Scripts laufen nur ueber die bestehende Sandbox
   (`evaluate_expression`) mit Approval. Zip-Imports werden Whitelist-
   basiert entpackt, mit Size-Limit und Path-Traversal-Schutz.
3. **Token-Budget:** Sub-Dokumente in `references/` / `assets/` werden
   nicht in den System-Prompt geladen, sondern on-demand via `read_file`.
4. **Eine Quelle der Wahrheit:** Der Loader-Umbau passiert einmalig im
   `SelfAuthoredSkillLoader`, kein paralleler Code-Pfad.

---

## 2. Aggregierte ASRs

### Critical ASRs

| ASR | Feature | Qualitaets-Attribut | Impact |
|-----|---------|---------------------|--------|
| Loader muss Ordner-Layout mit Sub-Dirs erkennen und Single-File-Skills weiter akzeptieren | 2201 | Rueckwaerts-Kompatibilitaet | Zentrale Loader-Logik |
| `references/*.md` duerfen NIE in den System-Prompt | 2201 | Token-Budget, Performance | Strikte Trennung zwischen "im Prompt" und "on-demand" |
| Zip-Import muss Pfad-Traversal, Zip-Bomben und fremde Dateien ablehnen | 2202 | Security | Whitelist-Extraktion + normalisierte Pfade + Size-Limit |
| Skript-Ausfuehrung ausschliesslich ueber Sandbox mit Approval | 2203 | Security | Kein Auto-Run, keine neue Runtime (kein Python / Bash im Plugin) |
| Coordinator darf Sub-Rollen-Content nicht automatisch in den System-Prompt laden | 2204 | Token-Budget | Coordinator referenziert Sub-Rolle nur per Name + Kurzbeschreibung |
| `name`-Frontmatter muss mit Ordner-Name uebereinstimmen (Anthropic-Regel) | 2201 | Konsistenz | Validierung im Loader, Fehler statt stille Abweichung |

### Moderate ASRs

| ASR | Feature | Qualitaets-Attribut |
|-----|---------|---------------------|
| JSZip schon als Dependency vorhanden (PPTX/DOCX) -- kein neuer Bundle-Overhead | 2202 | Maintainability |
| Neue Frontmatter-Felder (`license`, `compatibility`, `metadata`, `type: coordinator`) muessen additiv geparst werden | 2201, 2204 | Maintainability |
| UI-Button "Import skill package" folgt `AgentFolderPickerModal`-Pattern (Settings > Skills Tab) | 2202 | Konsistenz, UX |
| Sub-Skill-Filename-Pattern `*.skill.md` unterscheidet klar von Haupt-`SKILL.md` | 2204 | Maintainability |

---

## 3. Aggregierte NFRs

### Performance

| Anforderung | Feature | Ziel |
|-------------|---------|------|
| Skill-Load fuer 20+ Skills beim Plugin-Start | 2201 | <200ms zusaetzlich ggue. heute |
| System-Prompt-Bloat bei 5KB `references/*.md` | 2201 | Null -- Referenzen bleiben on-demand |
| Zip-Extraktion | 2202 | <2s fuer Skill bis 10MB |

### Security

| Anforderung | Feature | Ziel |
|-------------|---------|------|
| Whitelist-Pfade beim Unzip | 2202 | Nur `SKILL.md`, `scripts/**`, `references/**`, `assets/**`, `*.skill.md` |
| Zip-Bomb-Limit | 2202 | Abbruch ab 100MB entpackt (konfigurierbar) |
| Path-Traversal | 2202 | Alle `../` / absolute Pfade ablehnen |
| Script-Approval | 2203 | 100% -- keine Umgehung moeglich |

### Storage

| Anforderung | Feature | Ziel |
|-------------|---------|------|
| Skills liegen unter `<agent-folder>/skills/<slug>/` | 2201 | Ein einziger Skill-Root, vom Setting `agentFolderPath` abgeleitet |
| Bundled Skills bleiben im Plugin-Asset | 2201 | `bundled-skills/<slug>/SKILL.md` unveraendert |

### Observability

| Anforderung | Feature | Ziel |
|-------------|---------|------|
| Import-Errors loggen an Obsidian Notices + console.warn | 2202 | Klarer User-Fehler, kein stilles Verwerfen |
| Coordinator-Dispatch in Konversation erkennbar | 2204 | Log-Line "activating sub-role: writer" in Operation-Log |

---

## 4. Constraints

| Constraint | Quelle | Impact |
|------------|--------|--------|
| Obsidian Plugin API (Electron Renderer) | Plattform | Kein `child_process` fuer Script-Execution; Sandbox-Executor bleibt einziger Pfad |
| Review-Bot: kein `require()`, kein `fetch()`, kein `innerHTML` | Community | UI-Button ueber `createEl` / `createDiv`, Zip-Read ueber `FileSystemAdapter.readBinary` |
| Review-Bot: kein hartcodierter `.obsidian-agent` Pfad | Community | Skill-Root ueber `getAgentFolderPath(plugin)` aus FEATURE-0507 |
| JSZip-API synchron genug | Lib | Async-Reads akzeptabel, aber 100MB-Limit vor Extraktion einchecken |
| `manage_skill` Tool existiert und arbeitet mit Single-File-Skills | Bestand | Erweiterung muss Tool nicht brechen |
| Bestehende 9 bundled-skills muessen gruen bleiben | Regression | Smoke-Test mit jedem PR |

---

## 5. Technology Decisions Needed

| Entscheidung | Optionen | Empfehlung | Feature |
|--------------|----------|------------|---------|
| Loader-Scan-Strategie | (a) Glob `*/SKILL.md` (b) Walk mit Sub-Dir-Erkennung | (b), weil Scripts/References in einem Pass erfasst werden | 2201 |
| Frontmatter-Parser | Bestehende `parseYaml` | Bestehende Lib, additive Felder akzeptieren, unbekannte nicht erroren | 2201, 2204 |
| Zip-Lib | JSZip (vorhanden) vs. `fflate` | JSZip, weil schon gebundled und getestet | 2202 |
| Script-Inventar-Format | Dateinamen + erste Docstring-Zeile | Kompakt im Prompt, voller Content on-demand | 2203 |
| Coordinator-Syntax | `type: coordinator` Frontmatter-Flag | Explizit (nicht nur via Existenz von `*.skill.md`) | 2204 |
| Script-Sprachen-Support im MVP | TS/JS (via Sandbox) vs. auch Python/Bash | TS/JS only (Anthropic-Skills mit `.py` werden als Referenz-Text gelistet, nicht ausgefuehrt) | 2203 |
| Import-Duplikat-Verhalten | Replace / Rename / Abort | Confirm-Modal mit 3 Optionen | 2202 |

---

## 6. Open Questions

### Architektur

1. Wie geht der Loader mit einem Mismatch zwischen `name`-Frontmatter und
   Ordner-Name um? Harte Ablehnung oder Warn + Rename? (Anthropic-Spec:
   harte Ablehnung.)
2. Wenn ein Zip-Import einen Skill mit identischem Slug trifft, aber
   unterschiedlichem Inhalt -- wird der alte nach `skills/.trash/<slug>-<ts>/`
   verschoben oder ueberschrieben?
3. Sub-Rolle (`*.skill.md`) ausserhalb eines Coordinator-Ordners: als
   eigenstaendiger Skill loaden oder ignorieren? (Empfehlung: eigenstaendig
   fuer Backward-Compat, aber Warnung "Filename sieht nach Sub-Rolle aus".)
4. Wie wird ein Sub-Skill im Prompt identifiziert? Ueber Dateinamen
   (`writer.skill.md` -> sub-role: writer) oder ueber Frontmatter-Feld
   `role:`?

### Security

5. Soll der Zip-Import optional einen SHA-256 Hash gegen eine lokal
   gepflegte Allowlist checken (spaeter)?
6. Gibt es einen Weg, dass ein User versehentlich ein Script automatisch
   triggert (z.B. durch `trigger: ".*"` im Skill)? Mitigation:
   Script-Call immer separater Approval-Schritt.

### UX

7. Wo zeigen wir Scripts / References / Assets eines Skills in der UI an?
   Eigener Sub-Tab im Settings-Skills-Tab oder Expand-View pro Skill?
8. Fuer Coordinator-Skills: brauchen wir eine UI-Anzeige "X hat 3
   Sub-Rollen"? (MVP: nein, nur Loader + Prompt-Text.)

---

## 7. Implementierungs-Reihenfolge (Vorschlag)

```
Phase 1: FEATURE-2201 (Skill-Folder-Struktur)
         Fundament -- Loader-Umbau, Frontmatter erweitern,
         Sub-Dir-Inventar. Alle anderen Features bauen darauf auf.
         Effort: M (1-2 Sprints)

Phase 2: FEATURE-2202 (.skill Zip-Import)
         UI-Button + Entpack-Helper. Unabhaengig von 2203/2204, kann
         direkt nach 2201 geshippt werden.
         Effort: S (1 Sprint)

Phase 3: FEATURE-2203 (Scripts-im-Skill)
         Nur Script-Inventar + Agent-Dispatch ueber evaluate_expression.
         Kein Runtime-Neubau.
         Effort: M (1 Sprint)

Phase 4: FEATURE-2204 (Coordinator-Skill)
         Obsilo-Extension. Neues Frontmatter-Flag, Sub-Rollen-Parsing,
         Prompt-Integration ("Available sub-roles: ...").
         Effort: M (1-2 Sprints)
```

Release-Strategie: Phase 1+2 bilden das Anthropic-kompatible Minimum
und koennen zusammen als v2.6.0 raus. Phase 3+4 sind additiv (v2.6.1 /
v2.6.2).

---

## 8. Bestehende Komponenten zum Erweitern

| Komponente | Pfad | Erweiterung |
|------------|------|-------------|
| SelfAuthoredSkillLoader | `src/core/skills/SelfAuthoredSkillLoader.ts` | Ordner-Scan + Sub-Dir-Erkennung + Frontmatter erweitert |
| SkillFrontmatter | `src/core/skills/SkillFrontmatter.ts` oder vergleichbar | Additive Felder `license`, `compatibility`, `metadata`, `type: coordinator`, optional `role` |
| SkillRegistry | `src/core/skills/SkillRegistry.ts` | Metadata-Objekt um `scripts: string[]`, `references: string[]`, `assets: string[]`, `subRoles?: SubRoleMeta[]` erweitern |
| ManageSkillTool | `src/core/tools/skills/ManageSkillTool.ts` | Validierung: Ordner-Skill akzeptiert, Sub-Rollen-Schreiben optional |
| SettingsTab Skills | `src/ui/settings/SkillsTab.ts` | Neuer Button "Import skill package" |
| AgentFolderPickerModal | `src/ui/settings/AgentFolderPickerModal.ts` | Pattern fuer Import-Confirm-Modal |
| `getAgentFolderPath` | `src/core/utils/agentFolder.ts` | Skills-Root ableiten |
| EvaluateExpressionTool | `src/core/tools/evaluate/EvaluateExpressionTool.ts` | Script-Content aus Skill-Ordner einreichen (keine Code-Aenderung, nur Nutzungs-Pattern) |
| Obsidian-DOM-API / Notices | Plattform | Fehler-UX beim Zip-Import |

---

## 9. Neue Komponenten

| Komponente | Pfad | Zweck |
|------------|------|-------|
| SkillPackageImporter | `src/core/skills/SkillPackageImporter.ts` | `.skill` Zip entpacken, Whitelist + Size-Limit |
| SkillFolderScanner | `src/core/skills/SkillFolderScanner.ts` (optional, oder inline im Loader) | Sub-Dir-Inventar (scripts/references/assets/sub-roles) |
| CoordinatorPromptBuilder | im SelfAuthoredSkillLoader oder SystemPromptBuilder | Sub-Rollen-Liste im System-Prompt fuer Coordinator-Skills |

---

## 10. Risk Register (fuer Architektur-Entscheidungen)

| Risiko | Feature | Mitigation | ADR noetig? |
|--------|---------|-----------|-------------|
| Loader-Refactor bricht bestehende Skills | 2201 | 9 bundled-skills als Smoke-Test + Fixture-Suite | Ja (Teil ADR-075) |
| Zip-Import gibt Angreifer Vault-Schreibzugriff | 2202 | Whitelist + Path-Normalisierung + Size-Limit | Ja (Teil ADR-075) |
| Script-Ausfuehrung umgeht Approval | 2203 | Harte Kopplung an `evaluate_expression`-Pipeline; kein eigener Exec-Pfad | Nein (fuellt ADR-021) |
| Coordinator-Pattern divergiert dauerhaft von Anthropic | 2204 | `type: coordinator` als explizites Obsilo-Flag dokumentieren; kann spaeter in Anthropic-Spec backportet werden falls dort eingefuehrt | Ja (Teil ADR-075) |
| Frontmatter-Parser rejects Anthropic-Felder | 2201 | Additive Parsing-Strategie -- unbekannte Felder werden gespeichert aber nicht validiert | Nein |
| JSZip-API asynchron, Fehler schwer zu propagieren | 2202 | Try/Catch um Entpacken + klare Notice | Nein |

---

## 11. Nicht-Ziele

- **Kein eigener Skill-Registry-Server.** Skills werden per URL-Download
  (manuell) oder via `manage_skill` angelegt, dann importiert.
- **Keine Signatur-Verifikation im MVP.** Kann spaeter als eigener Feature-
  Stream nachgezogen werden.
- **Keine Python/Bash-Runtime im Plugin.** Python-Scripts werden nur als
  Referenz-Text gelistet, nicht ausgefuehrt -- der User kann sie manuell
  oder per externen Tools nutzen.
- **Keine parallele Sub-Rollen-Ausfuehrung.** Coordinator delegiert
  sequentiell; Parallelisierung kommt, wenn ueberhaupt, als Folge-Epic.
- **Kein Anthropic `/v1/skills` API-Client.** Wir konsumieren das Format,
  bieten aber keine serverseitige Skills-Host-Integration.

---

## 12. Naechste Schritte

```
Architekt:
1. ADR-075 schreiben -- Skill-Package-Architektur
   - Ordner-Layout (finale Pfad-Konvention)
   - Loader-Umbau (Scan-Strategie, Frontmatter-Schema-Erweiterung)
   - Zip-Import-Security-Modell (Whitelist, Size-Limit, Path-Traversal)
   - Coordinator-Prompt-Schema (wie Sub-Rollen im System-Prompt erscheinen)
   - Backward-Compat-Strategie (Single-File-Skills weiter akzeptiert)
2. plan-context-022.md als Bridge zu /coding generieren
3. Task-Breakdown pro Feature ableiten

Danach: /coding nimmt plan-context-022.md + Feature-Specs als Input.
```

---

## 13. Traceability

```
BA-021 (Why)
  -> EPIC-022 (What strategisch)
    -> FEATURE-2201 (Folder-Struktur, P0, M)
    -> FEATURE-2202 (Zip-Import, P0, S)
    -> FEATURE-2203 (Scripts, P1, M)
    -> FEATURE-2204 (Coordinator, P1, M)
      -> ADR-075 (Architektur-Entscheidung, TBD)
        -> plan-context-022.md (TBD)
          -> Implementierung (v2.6.x)
            -> Tests (Loader-Regression + Fixture-Suite)
              -> Security-Audit (Zip-Import Path-Traversal, Script-Sandbox)
```
