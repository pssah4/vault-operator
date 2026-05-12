# BA-21: Skill-Package Ecosystem (Anthropic-kompatibel)

> Erstellt: 2026-04-17
> Status: Draft, ready for RE
> Quelle: User-Anforderung + Recherche Anthropic Skills Format (late 2025)

---

## Problem-Kontext

Vault Operator hat heute ein funktionierendes Skill-System: Markdown-Dateien mit
YAML-Frontmatter, geladen vom `SelfAuthoredSkillLoader`. Jeder Skill ist
**eine** `SKILL.md`-Datei in einem Unterordner von `bundled-skills/` oder
der User-Skills-Dir.

Gleichzeitig hat Anthropic im Spaetsommer 2025 einen offenen Standard
etabliert ([agentskills.io](https://agentskills.io/specification)):
Skills sind **Ordner** mit `SKILL.md` plus optionalen `scripts/`,
`references/` und `assets/` Unterordnern. Claude Code, Claude Desktop
und die Claude API akzeptieren dieses Format. Zusaetzlich: `.skill`-Zip
als Distribution (offiziell via Claude.ai Upload).

Drei Probleme fallen zusammen:

1. **User-Erwartung verschoben.** Wer Claude Skills kennt, erwartet
   dieses Format auch in Vault Operator. Single-File-Skills fuehlen sich
   limitiert an, besonders wenn der Skill Scripts oder grosse
   Referenz-Dokumente braucht.
2. **Skill-Sharing bricht.** Im Anthropic-Oekosystem existieren schon
   17+ offizielle Skills (pdf, pptx, skill-creator, mcp-builder, ...)
   plus third-party-Sammlungen. Vault Operator kann sie nicht einlesen weil
   der Loader keine Sub-Files kennt.
3. **Coordinator-Pattern fehlt.** Der User wuenscht sich explizit einen
   Skill der andere Skills im selben Ordner orchestriert. Das geht ueber
   die Anthropic-Spec hinaus (dort gibt es das nicht formell), ist aber
   in Vault Operators Agent-Loop sinnvoll: ein Meta-Skill kann Sub-Tasks
   delegieren, analog zu `new_task` aber mit feineren Rollen-Definitionen
   pro Sub-Skill.

## Stakeholder

| Stakeholder | Interesse | Einfluss |
|-------------|-----------|----------|
| Power-User (Sebastian) | Skills aus eigenem Git-Repo nutzen, inkl. Scripts und Templates | Hoch (Anforderung) |
| Skill-Autoren (extern) | Vault Operator soll Anthropic-kompatible Skills akzeptieren, damit bestehende Packages wiederverwendet werden koennen | Mittel (Community-Wachstum) |
| Agent-Loop | Skills muessen weiterhin schnell geladen werden, System-Prompt nicht aufblaehen | Hoch (Performance) |
| Security | Scripts im Skill-Ordner sind Code-Ausfuehrung — braucht Sandbox / Opt-in / Signatur-Check | Hoch (Safety) |
| Community-Plugin-Reviewer | Keine neuen `obsidianmd/*` Review-Bot-Verletzungen | Hoch (Release-Approval) |

## As-Is Analyse

### Aktueller Skill-Aufbau (Vault Operator v2.5.2)

- **Bundled-Skills:** `bundled-skills/<slug>/SKILL.md` (9 Stueck, beim Build mit eingebettet).
- **User-Skills:** `<agent-folder>/skills/<slug>/SKILL.md` (vom User selbst angelegt oder via `manage_skill` Tool).
- **Frontmatter-Schema:** `name`, `description`, `trigger` (regex), `source` (bundled/user/plugin), `requiredTools` (Liste).
- **Loader:** `SelfAuthoredSkillLoader` laedt alle `SKILL.md` Files, fuellt Cache, injiziert Name+Description in System-Prompt, volle Content bei Trigger-Match.

### Funktionsluecken

| Luecke | Auswirkung |
|--------|-----------|
| Kein `scripts/` Folder-Support | Skills koennen keine `.py`/`.js`/`.sh` bundeln, die der Sandbox-Executor ausfuehren koennte |
| Kein `references/` Folder-Support | Lange Skills koennen nicht in Unter-Docs aufgeteilt werden (System-Prompt-Pollution) |
| Kein `assets/` Folder-Support | Templates (Mermaid-Diagramme, JSON-Schemas) muessen aktuell in der SKILL.md inline stehen |
| Kein Zip-Import | User muss jedes File manuell anlegen; kein Teilen eines Skill-Packages |
| Kein Coordinator-Pattern | User-Anforderung: Haupt-Skill delegiert an Sub-Skills im selben Ordner |
| Fremd-Frontmatter nicht akzeptiert | Anthropic-Skills (mit `license`, `compatibility`, `metadata`) werden nicht korrekt interpretiert |

### Was heute schon passt

- Ordner-pro-Skill-Struktur ist bereits da (`bundled-skills/<slug>/`).
- Loader laeuft lazy (nur on-demand voll gelesen).
- User kann Skills via `manage_skill` anlegen/editieren.

## To-Be (gewuenschter Zustand)

1. Ein Vault Operator-Skill ist ein **Ordner** mit `SKILL.md` plus optionalen
   `scripts/`, `references/`, `assets/` Subfolders.
2. Das Frontmatter ist zu Anthropic **rueckwaerts-kompatibel** (akzeptiert
   `license`, `compatibility`, `metadata` zusaetzlich zu unseren eigenen
   Feldern).
3. **`.skill`-Zip-Import**: User klickt "Import Skill", waehlt eine Zip,
   das Plugin entpackt sie nach `<agent-folder>/skills/<name>/`.
4. **Scripts** werden im Skill-Ordner unter `scripts/` abgelegt. Ein Skill
   kann auf ein Script verweisen; der Agent fuehrt es ueber den existierenden
   `evaluate_expression` Sandbox-Tool aus (nur nach explizitem User-Approval,
   analog zu allen Write-Operationen).
5. **References** werden nur bei Bedarf geladen. Skill-Text verweist auf
   `references/FOO.md`, Agent liest on-demand mit `read_file`. Kein
   System-Prompt-Bloat.
6. **Coordinator-Pattern** (Vault Operator-Erweiterung): ein Skill-Ordner kann
   mehrere `*.skill.md` Sub-Files enthalten. Das Haupt-`SKILL.md`
   koordiniert, Sub-Skills sind spezialisierte Rollen (z.B. `writer.skill.md`,
   `reviewer.skill.md`). Der Coordinator kann per Text-Instruktion
   zwischen Sub-Rollen wechseln.

## Gap Analyse

| Bereich | Heute | Soll | Loesungs-Pfad |
|---------|-------|------|----------------|
| Folder-Struktur | 1 SKILL.md pro Ordner | SKILL.md + scripts/ + references/ + assets/ | FEAT-22-01 |
| Zip-Import | nicht moeglich | `.skill` Zip via UI-Button | FEAT-22-02 |
| Scripts | nicht vorhanden | `scripts/` wird via Sandbox-Executor lesbar | FEAT-22-03 |
| Coordinator | ein Skill = eine Rolle | Haupt-Skill + Sub-`.skill.md` im selben Ordner | FEAT-22-04 |
| Anthropic-Frontmatter | ignoriert Anthropic-only Felder | parst `license`/`compatibility`/`metadata` additiv | FEAT-22-01 |

## Nicht im Scope

- Eigener Online-Registry ("Vault Operator Skill Store"). User muss Zips manuell
  per URL / File-Import installieren.
- Auto-Update von Skills aus externen Quellen. Zip-Import ist einmalig.
- Signatur-Verifikation bei Zip-Imports. Fuer Version 1 verlassen wir uns
  auf die bestehende Approval-Kette: Scripts laufen in Sandbox und
  brauchen `evaluate_expression` Approval.
- Vollstaendiger Anthropic-SDK-Integration (Claude API `/v1/skills`
  Endpoint). Wir konsumieren das Format, beta'en aber keine eigene
  Server-API.

## Erfolgskriterien (messbar)

| ID | Kriterium | Messung |
|----|-----------|---------|
| BA021-SC-01 | User kann Skill aus Anthropic `skills` Repo (z.B. `pdf`, `skill-creator`) via `.skill` Zip importieren und nutzen | Manueller Test: ein Zip aus [anthropics/skills](https://github.com/anthropics/skills) laden, Skill triggern, Ergebnis verifizieren |
| BA021-SC-02 | `references/` Unter-Dateien werden beim Trigger-Match nicht in den System-Prompt geladen, sondern nur via `read_file` on-demand | Token-Differenz Test: Skill mit 5KB Referenz-Doku vs ohne |
| BA021-SC-03 | Scripts im `scripts/` Ordner koennen vom Agent ueber Sandbox aufgerufen werden, ohne dass der Skill-Inhalt als Prompt-Text interpretiert wird | Manueller Test: Python-Script im Skill, Agent fuehrt es aus |
| BA021-SC-04 | Coordinator-Skill mit 2+ Sub-Rollen funktioniert: User-Anfrage triggert Coordinator, der delegiert an Sub-Rolle | Manueller Test: Writer+Reviewer Coordinator-Skill |
| BA021-SC-05 | Bestehende Single-File-Skills (v2.5.x) funktionieren weiter ohne Migration | Regression: bundled-skills alle weiter aktiv |
| BA021-SC-06 | Security: Scripts werden nicht automatisch ausgefuehrt, sondern erfordern Approval | Code-Review |

## Innovations-Phasen

- **EXPLORATION:** abgeschlossen. Anthropic-Spec recherchiert, Vault Operator-Stand
  ausgewertet, Gaps klar.
- **IDEATION:** vier abgrenzbare Features (Folder + Zip + Scripts +
  Coordinator). Reihenfolge nicht blockierend — jeder Feature-Commit
  kann fuer sich released werden.
- **VALIDATION:** Wave 3 Sprint (v2.6.0 oder v2.5.3), mit klarem
  Handoff-Point nach jedem Feature.
