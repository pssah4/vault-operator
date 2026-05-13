# PLAN-20: FEAT-24-09 / ADR-116 -- Active Skills model-getrieben on-demand

> Status: in Arbeit
> Branch: `feature/feat-24-09-active-skills-on-demand` (off `dev`)
> Refs: FEAT-24-09, ADR-116, ADR-62 (Amendment), ADR-12 (Amendment), ADR-09, RESEARCH-36 Abschnitt 8 (Hebel B)
> Vorgaenger: PLAN-18 (EPIC-24 Welle 1), PLAN-19 (FEAT-24-05)

---

## 1. Kontext

Skills (Markdown-Workflows) werden heute pro User-Message so eingebunden:
`AgentSidebarView.buildSkillsSection()` macht einen **LLM-Klassifikations-Call**
(`classifySkillsWithLlm` -> `handler.classifyText`), der gegen einen Katalog aus
User-Skills (`SkillsManager.discoverSkills()`) und self-authored/bundled Skills
(`SelfAuthoredSkillLoader.getAllSkills()`) entscheidet, welche Skills relevant sind;
der volle SKILL.md-Body der gewaehlten Skills wird in den System-Prompt injiziert
(Section 10 "ACTIVE SKILLS", `getSkillsSection(skillsSection)`, im **dynamischen**
Block nach dem `CACHE_BREAKPOINT_MARKER`). Zusaetzlich gibt es Section 13
"SELF-AUTHORED SKILLS" (`selfAuthoredSkillsSection` aus `getMetadataSummary()`) --
ein Verzeichnis nur der self-authored Skills, ebenfalls im dynamischen Block.

Zwei Probleme (RESEARCH-36 Abschnitt 8 / Abschnitt 3):

1. **Ein zusaetzlicher LLM-Roundtrip pro User-Message** -- der Klassifikator laeuft
   vor jeder Agent-Iteration, auch wenn am Ende kein Skill passt. Tokens + Latenz.
2. **Cache-Schaedlichkeit:** der Active-Skills-Body steht im System-Prompt und
   wechselt pro Message -> der gecachte Praefix bleibt instabil (ergaenzt den
   Befund aus ADR-62-Amendment: der volatile Tail liegt unterhalb des Breakpoints,
   aber der Active-Skills-Block sorgt dafuer, dass die Section ueberhaupt da ist).

Loesung (ADR-116, Option 3, Claude-Code-/Cowork-Pattern "progressive disclosure"):
Der Klassifikator-Call entfaellt. Der System-Prompt enthaelt nur noch ein **stabiles
Skill-Verzeichnis** (Name + Beschreibung je Skill, plus die schon vorhandenen
Inventory-Zeilen self-authored Skills) im gecachten Block **oberhalb** des
Breakpoints. Braucht das Modell eine Skill, laedt es deren vollen Body ueber ein
neues Tool `read_skill` als Tool-Result; der Body lebt im Message-Stream und
faellt danach unter Microcompaction (ADR-12-Amendment / FEAT-24-02) wie jedes
andere Tool-Result. Eine Prompt-Leitplanke instruiert, eine Skill nur bei
passender Aufgabe zu laden.

### Review der ADR-116-Vorschlaege gegen den realen Code -> Amendments

- ADR-116 laesst offen, ob `manage_skill` um eine Lade-Aktion erweitert oder ein
  schlankes `read_skill`/`load_skill`-Tool gebaut wird. **Befund:** `manage_skill`
  steht in `DEFERRED_TOOL_NAMES` (toolMetadata.ts) -- es ist erst nach einem
  `find_tool`-Roundtrip aufrufbar. Ein Skill ueber `manage_skill read` zu laden
  kostet damit **zwei** Roundtrips und macht den eingesparten Klassifikator-Call
  zunichte. **Entscheidung: neues, NICHT-deferred Tool `read_skill`** (Gruppe
  `read`, read-only), das in jedem Mode (der die `read`-Gruppe hat) sofort
  verfuegbar ist. `manage_skill` bleibt fuer das Self-Authoring/Editing.
- ADR-116 sagt "Verzeichnis = Name + Beschreibung je Skill, plus die schon
  vorhandene Plugin-Skill-Listung". **Befund:** Die "Plugin-Skill-Listung"
  (`pluginSkillsSection`, Section 9) ist ein anderes Konzept (Obsidian-Plugin-
  Commands via VaultDNA, nicht SKILL.md-Skills) und bleibt unangetastet. Das
  Skill-Verzeichnis vereinigt **SKILL.md-Skills aus beiden Quellen**:
  `SelfAuthoredSkillLoader` (bundled + learned/user, inkl. Inventory-Zeilen) und
  `SkillsManager` (User-Skills), dedupliziert per Name. Es ersetzt damit sowohl
  Section 10 ("ACTIVE SKILLS") als auch Section 13 ("SELF-AUTHORED SKILLS").
- Platzierung: ADR-116 sagt "in den stabilen Block vor dem CACHE-BREAKPOINT". Das
  Verzeichnis kommt als **letzte stabile Section** direkt vor dem
  `CACHE_BREAKPOINT_MARKER` (nach Security-Boundary) -- so bleibt der bestehende
  Test "Security Boundary before Skills" gueltig und das Verzeichnis liegt im
  gecachten Praefix.
- `activeSkillNames` (Power-Steering-Reminder in `AgentTask.ts`): wird heute aus
  der Klassifikator-Wahl befuellt. Ohne Klassifikator gibt es keine Vorab-Liste.
  **Entscheidung:** `activeSkillNames` entfaellt; der Power-Steering-Reminder
  laesst die "ACTIVE SKILLS: ..."-Zeile weg. Die Steuerung liegt jetzt im
  `read_skill`-Result-Header ("follow this workflow for the current task") und in
  der Verzeichnis-Leitplanke. (ADR-116 nennt das Re-Injizieren eines Skill-
  Headers im geladenen Body explizit als Mitigation -- siehe unten. Falls sich
  Skill-Befolgung als zu schwach erweist, kann spaeter ein "du hast Skill X
  geladen, lies ihn mit read_skill neu falls verloren"-Reminder ergaenzt werden;
  bewusst NICHT in diesem PLAN.)
- Shadow-Mode-Vergleich (Klassifikator-Wahl vs. Modell-Wahl) aus ADR-116
  "Risiken": **bewusst nicht implementiert** -- der Klassifikator-Pfad wird
  entfernt, nicht parallel betrieben. Die Verzeichnis-Beschreibungen sind dasselbe
  Material, das der Klassifikator als Input bekam; konservative Leitplanke
  reicht als Mitigation. (Wird in der ADR-116-Amendment dokumentiert.)

---

## 2. Aenderungen

### 2.1 `src/core/prompts/sections/skills.ts` -> `skillDirectory.ts` (Rename + Rewrite)

VORHER: `getSkillsSection(skillsSection?)` rendert eine "ACTIVE SKILLS"-Section mit
`SKILL PRECEDENCE`-Regeln und `<available_skills>`-Block (volle Bodies).

NACHHER: Datei umbenannt zu `skillDirectory.ts`, Funktion `getSkillDirectorySection(directory?: string): string`:

```ts
export function getSkillDirectorySection(directory?: string): string {
    if (!directory?.trim()) return '';
    return [
        '',
        '====',
        '',
        'SKILLS',
        '',
        'Skills are step-by-step workflows for specific task types. The directory below',
        'lists every available skill (name + what it is for). When the current task',
        'matches a skill\'s purpose, call read_skill({ name: "<name>" }) to load its full',
        'instructions as a tool result, then follow that workflow step by step -- it',
        'OVERRIDES default tool selection and general guidelines. If a skill says "ASK',
        'the user", you MUST ask and STOP. Do NOT load a skill that does not match the',
        'task. If no skill applies, proceed with normal tools and capabilities.',
        '',
        '<available_skills>',
        directory.trim(),
        '</available_skills>',
    ].join('\n');
}
```

- `src/core/prompts/sections/index.ts`: Export `getSkillsSection` -> `getSkillDirectorySection` (aus `./skillDirectory`).

### 2.2 `src/core/systemPrompt.ts`

- Import: `getSkillsSection` -> `getSkillDirectorySection`.
- `SystemPromptConfig`: `skillsSection?` und `selfAuthoredSkillsSection?` **entfernen**,
  `skillDirectorySection?: string` **hinzufuegen**.
- Legacy positional Overload + `buildSystemPromptForMode`-Impl: `skillsSection` und
  `selfAuthoredSkillsSection` aus den Parametern entfernen, `skillDirectorySection`
  ergaenzen (am Ende, analog `selfAuthoredSkillsSection` heute). Config-Form-Branch
  entsprechend.
- Section-Array: Section 10 (`getSkillsSection(skillsSection)`) **entfernen**;
  Section 13 (`SELF-AUTHORED SKILLS\n...${selfAuthoredSkillsSection}`) **entfernen**.
  Neue Section **8b** direkt nach `getSecurityBoundarySection()` und VOR
  `CACHE_BREAKPOINT_MARKER`:
  `isSubtask ? '' : getSkillDirectorySection(skillDirectorySection)`
  (subtask-gated wie die alten Skill-Sections).
- `labels`-Array + Doc-Comment (Section-Order-Kommentar oben in der Datei)
  entsprechend anpassen: `active-skills` raus, `self-authored-skills` raus,
  `skill-directory` als stabile Section 8b vor `cache-breakpoint`.

### 2.3 `src/core/tools/agent/ReadSkillTool.ts` (NEU)

Neues, NICHT-deferred Tool `read_skill` (Klasse `ReadSkillTool extends BaseTool<'read_skill'>`):

- Konstruktor: `(plugin, skillLoader?: SelfAuthoredSkillLoader | null)`. `SkillsManager`
  wird lazy ueber `plugin.skillsManager` geholt (kann fehlen -> dann nur self-authored).
- `getDefinition()`: `name: 'read_skill'`, input_schema `{ name: string (required) }`,
  Beschreibung: "Load the full step-by-step instructions of a skill listed in the
  SKILLS directory. Call this when the current task matches a skill's purpose, then
  follow the returned workflow exactly. Does not exist for skills not in the directory."
- `execute({ name }, ctx)`:
  1. `name` validieren (nicht leer).
  2. `skillLoader?.getSkill(name)` -> wenn vorhanden:
     - Body = `skill.body`. Cap bei `MAX_SKILL_BODY_CHARS = 24_000`: bei Ueberschreitung
       auf die ersten 24k kappen + Hinweis "...(truncated; this skill is large -- read its
       reference files with read_file: <inventory.references>)".
     - Header + Metadaten + Inventory-Zeilen (Scripts/References/Assets/Sub-roles via
       der schon vorhandenen Render-Logik bzw. ein kleiner lokaler Renderer) + ggf.
       "Code modules registered as tools: <namen>".
     - `pushToolResult(this.formatSuccess(...))`.
  3. sonst `plugin.skillsManager?.discoverSkills()` -> Eintrag mit `meta.name === name`
     finden -> `skillsManager.readFile(meta.path)` -> Frontmatter strippen
     (`replace(/^---\n[\s\S]*?\n---\n?/, '').trim()`) -> Cap wie oben -> Header + Body
     -> `pushToolResult`.
  4. sonst Fehler: `formatError(new Error(\`Skill "${name}" not found. Available skills:
     ${verfuegbareNamen.join(', ')}. Check the SKILLS directory in your system prompt.\`))`.
- Result-Header (ADR-116-Mitigation, "Primacy"-Verlust): erste Zeile des Tool-Results
  `## SKILL: <name> -- follow this workflow for the current task. It overrides default
  tool selection.` danach `**Description:** ...` dann `---` dann der Body.

### 2.4 `src/core/tools/ToolRegistry.ts`

- Import `ReadSkillTool`.
- Registrieren -- unconditional, direkt nach `FindToolTool` (oder im Skill-Block):
  `this.register(new ReadSkillTool(this.plugin, skillLoader ?? null));`
  (auch wenn `skillLoader` null ist -> Tool funktioniert dann nur ueber
  `plugin.skillsManager`.)

### 2.5 `src/core/tools/types.ts`

- `'read_skill'` in die `ToolName`-Union aufnehmen (an der Stelle, wo `find_tool`,
  `manage_skill` etc. stehen). Falls es eine `TOOL_NAMES`-Liste o.ae. gibt, dort
  ergaenzen.

### 2.6 `src/core/tools/toolMetadata.ts`

- `TOOL_METADATA` um `read_skill` ergaenzen:
  ```
  read_skill: {
      group: 'read', label: 'Read Skill', icon: 'book-open',
      signature: 'read_skill(name)',
      description: 'Load the full instructions of a skill from the SKILLS directory. Call when the current task matches a skill\'s purpose, then follow the returned workflow step by step.',
      whenToUse: 'When a skill in the SKILLS directory matches what the user wants -- load it before doing the work.',
      commonMistakes: 'Loading a skill whose description does not match the task. Re-loading a skill you already loaded this turn -- its content is already in the conversation.',
  }
  ```
- **NICHT** in `DEFERRED_TOOL_NAMES`.
- Pruefen: gehoert `read_skill` damit automatisch in die `read`-Tool-Gruppe und
  ist in allen Modes mit `read`-Gruppe verfuegbar (Agent + Ask). Falls die
  `read`-Gruppen-Definition (modes/builtinModes oder `getToolsForGroup`) eine
  explizite Allowlist nutzt -> dort `read_skill` ergaenzen.

### 2.7 `src/core/AgentTask.ts`

- Run-Options-Interface: `skillsSection?`, `selfAuthoredSkillsSection?`,
  `activeSkillNames?` **entfernen**; `skillDirectorySection?: string` **hinzufuegen**.
- Destructuring der Run-Options entsprechend.
- `rebuildPromptCache()`: `skillsSection` + `selfAuthoredSkillsSection` aus dem
  `buildSystemPromptForMode({...})`-Call entfernen, `skillDirectorySection` ergaenzen.
- Fast-Path-Call (~Zeile 305): `skillsSection` + `selfAuthoredSkillsSection`
  -> `skillDirectorySection`.
- `childTask.run({...})` (Subtask-Spawn): `skillsSection` + `selfAuthoredSkillsSection`
  -> `skillDirectorySection` (wird ohnehin subtask-gated weggelassen, aber
  konsistent durchreichen).
- Power-Steering-Reminder (~Zeile 611-616): `skillReminder`-Block (der
  `activeSkillNames` nutzte) **entfernen**; die Reminder-Message ohne die
  "ACTIVE SKILLS: ..."-Zeile bauen.

### 2.8 `src/ui/AgentSidebarView.ts`

- `classifySkillsWithLlm()` **entfernen**.
- `matchSkillsByKeywordAndTrigger()` **entfernen** (nur von `buildSkillsSection`
  genutzt).
- Konstanten `MAX_INJECTED_SKILLS`, `MAX_TOTAL_SKILL_CHARS` **entfernen**.
- `buildSkillsSection()` -> ersetzen durch
  `buildSkillDirectory(allowedSkillNames?: string[]): Promise<string | undefined>`:
  - Toggle-/Mode-Allowlist-Filterung wie heute (`manualSkillToggles`,
    `modeSkillAllowList`).
  - Self-authored: `selfAuthoredSkillLoader.getMetadataSummary()` liefert bereits
    die `- name: desc [trigger: ...]` + Inventory-Zeilen. Filterung: vor dem
    Render die nicht-erlaubten Skills herausnehmen -- am einfachsten ueber eine
    neue/erweiterte Loader-Methode `getMetadataSummary(filter?: (s) => boolean)`
    ODER hier ueber `getAllSkills().filter(...).map(renderSkillSummary)` -- letzteres
    braucht `renderSkillSummary` public. **Entscheidung:** `SelfAuthoredSkillLoader.getMetadataSummary()`
    bekommt einen optionalen `allowedNames?: Set<string>`-Parameter (Filter; default
    = alle). `[trigger: ...]` aus der gerenderten Zeile entfernen (Trigger sind im
    on-demand-Modell irrelevant -- siehe `renderSkillSummary`-Anpassung unten).
  - User-Skills (`SkillsManager`): `discoverSkills()` -> gefilterte Liste, je
    Eintrag eine Zeile `- ${name}: ${description}`. Skills, deren Name schon aus
    `getMetadataSummary` kommt, ueberspringen (dedupe by name).
  - Rueckgabe: `[selfAuthoredBlock, userSkillLines].filter(Boolean).join('\n')` oder
    `undefined` wenn leer.
- `renderSkillSummary` in `SelfAuthoredSkillLoader`: `[trigger: ${s.triggerSource}]`
  aus `head` entfernen (im on-demand-Modell nicht mehr relevant; spart Tokens).
  `getMetadataSummary(allowedNames?)`-Filter ergaenzen.
- Aufrufstelle (~Zeile 2346-2364): statt `buildSkillsSection` ->
  `const skillDirectorySection = isOnboarding ? undefined : await this.buildSkillDirectory(allowedSkillNames);`
  (`userMessageText` wird hier nicht mehr fuer Skills gebraucht -- bleibt aber fuer
  Recipe-Matching; nur den Skill-Teil umstellen). `activeSkillNames` lokale Var
  entfernen.
- ~Zeile 2497: `selfAuthoredSkillsSection`-Var **entfernen**.
- `task.run({...})` (~Zeile 2499-2518): `skillsSection`, `selfAuthoredSkillsSection`,
  `activeSkillNames` **entfernen**; `skillDirectorySection` ergaenzen.
- `xmlEsc`-Import: pruefen ob noch woanders genutzt; falls nicht -> Import entfernen.

### 2.9 `src/core/tools/agent/ManageSkillTool.ts` (kleiner Doku-Fix)

- `handleRead()`: der Truncation-Hinweis ("this skill is ALREADY ACTIVE in your
  system prompt under <available_skills>. Do NOT call read again -- check your
  system prompt instead.") ist mit ADR-116 falsch. Auf "...(body truncated, ${len}
  chars total -- if you need the full skill, use read_skill or read the skill's
  reference files with read_file)" aendern. (`manage_skill read` bleibt fuer
  Editing; `read_skill` ist der Lade-Pfad fuers Anwenden.)
- `manage_skill`-Metadaten-Beschreibung in toolMetadata.ts: "...injected into the
  system prompt when relevant." -> "Skills appear in the SKILLS directory; the
  agent loads a skill's body on demand via read_skill." (kosmetisch).

### 2.10 Tests

- `src/core/__tests__/systemPrompt.test.ts`:
  - Test-Helper `buildTestPrompt` / die zwei betroffenen Tests: `skillsSection`
    -> `skillDirectorySection`.
  - "should place Security Boundary before Skills" bleibt gueltig (Directory steht
    NACH Security). Ggf. den `<available_skills>`-Marker-String anpassen, falls
    der Test auf "TestSkill" prueft -- bleibt, weil `directory.trim()` 1:1 ausgegeben wird.
  - "should omit Skills and Memory for subtasks": `skillsSection` -> `skillDirectorySection`,
    Assertion bleibt (`SHOULD_NOT_APPEAR` darf nicht erscheinen, da subtask-gated).
- `src/core/tools/agent/__tests__/ReadSkillTool.test.ts` (NEU): self-authored Skill
  laden (Body + Header + Inventory), User-Skill laden (Frontmatter gestrippt),
  unbekannter Name -> Fehler mit Liste, Body-Cap greift.
- `src/core/prompts/sections/__tests__/skillDirectory.test.ts` (NEU, oder in
  bestehende Section-Tests): leeres Verzeichnis -> "", nichtleeres -> enthaelt
  "read_skill(" + den Verzeichnis-String + Leitplanke.
- `src/core/tools/__tests__/deferredToolLoading.test.ts`: pruefen, dass `read_skill`
  NICHT in `DEFERRED_TOOL_NAMES` ist (ggf. Assertion ergaenzen).
- Volltext-Suche nach `skillsSection`/`selfAuthoredSkillsSection`/`activeSkillNames`/
  `buildSkillsSection` im gesamten Repo (inkl. Tests, `main.js` ist generiert ->
  egal) und alle Treffer abarbeiten.

### 2.11 Dokumentation

- `_devprocess/architecture/ADR-116-active-skills-on-demand.md`: Status
  `Proposed` -> `Accepted`; Amendment-Abschnitt "Amendment 2026-05-13 (PLAN-20
  Umsetzung)" mit den Entscheidungen aus 1. (neues `read_skill`-Tool statt
  `manage_skill`-Erweiterung -- Grund: `manage_skill` deferred; Verzeichnis
  vereinigt beide Skill-Quellen + ersetzt Section 10 UND 13; Platzierung als
  letzte stabile Section; `activeSkillNames`-Power-Steering entfaellt; kein
  Shadow-Mode).
- `_devprocess/architecture/arc42/09-architekturentscheidungen.md` (bzw. wo §9
  liegt): ADR-116-Zeile auf "Accepted" / Umsetzungsstand.
- `_devprocess/requirements/features/FEAT-24-09-active-skills-on-demand.md`: Success
  Criteria von `[AWAITING RE]` auf konkrete, verifizierbare SC umschreiben (siehe
  Abschnitt 4); `plan-refs: [PLAN-20]`.
- `_devprocess/context/BACKLOG.md` (EPIC-24-Abschnitt): FEAT-24-09-Row Status
  `Geplant` -> `In Arbeit` -> nach Merge `Done`; PLAN-20 als Plan-Ref.
- `_devprocess/requirements/epics/EPIC-24-agent-loop-effizienz.md`: FEAT-24-09-Status.
- Nach Abschluss: `memory/project_agent_loop_refactoring.md` "Stand 2026-05-13"-Block
  um FEAT-24-09 ergaenzen; `memory/MEMORY.md` falls Eckdaten betroffen.

---

## 3. Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|---|---|---|
| `src/core/prompts/sections/skills.ts` -> `skillDirectory.ts` | Rename + Rewrite (`getSkillDirectorySection`) | mittel (Section-Inhalt + Export) |
| `src/core/prompts/sections/index.ts` | Export umbenennen | niedrig |
| `src/core/systemPrompt.ts` | Section 10+13 raus, Section 8b rein; Config/Params; labels/Doc | mittel (Reihenfolge, Cache-Praefix) |
| `src/core/tools/agent/ReadSkillTool.ts` | NEU | mittel |
| `src/core/tools/ToolRegistry.ts` | `ReadSkillTool` registrieren | niedrig |
| `src/core/tools/types.ts` | `'read_skill'` in `ToolName` | niedrig |
| `src/core/tools/toolMetadata.ts` | `read_skill` in `TOOL_METADATA`; `manage_skill`-Desc-Fix | niedrig |
| `src/core/AgentTask.ts` | Params: `skillDirectorySection` statt `skillsSection`/`selfAuthoredSkillsSection`; `activeSkillNames` raus; Power-Steering-Reminder | mittel (mehrere Call-Sites) |
| `src/ui/AgentSidebarView.ts` | Klassifikator raus; `buildSkillDirectory`; `task.run`-Params | hoch (zentrale Stelle, viel entfernter Code) |
| `src/core/skills/SelfAuthoredSkillLoader.ts` | `getMetadataSummary(allowedNames?)`; `renderSkillSummary` ohne `[trigger]` | niedrig |
| `src/core/tools/agent/ManageSkillTool.ts` | Truncation-Hinweis im `handleRead` korrigieren | niedrig |
| `src/core/__tests__/systemPrompt.test.ts` | `skillsSection` -> `skillDirectorySection` | niedrig |
| `src/core/tools/agent/__tests__/ReadSkillTool.test.ts` | NEU | niedrig |
| `src/core/prompts/sections/__tests__/skillDirectory.test.ts` | NEU | niedrig |
| `_devprocess/...` (ADR-116, arc42 §9, FEAT-24-09, BACKLOG, EPIC-24) | Doku-Updates | niedrig |

## 4. Nicht betroffen (Blast-Radius)

- `getPluginSkillsSection` / `pluginSkillsSection` / `SkillRegistry` / `VaultDNAScanner`
  (Plugin-Commands -- anderes Konzept, bleibt Section 9).
- `recipesSection` / `RecipeMatchingService` (Recipes -- eigenes Matching, unberuehrt;
  `userMessageText` an der Aufrufstelle bleibt fuer Recipe-Matching erhalten).
- `MicroCompactor` / `AgentTask.microcompact()` (geladene Skill-Bodies sind normale
  Tool-Results -> automatisch abgedeckt, keine Code-Aenderung).
- `manage_skill`-Aktionen `create/update/delete/list/validate` (unberuehrt; nur
  `read`-Truncation-Hinweis kosmetisch).
- Provider (`anthropic.ts` etc.), `splitSystemPromptAtCacheBreakpoint`,
  `CACHE_BREAKPOINT_MARKER` (unveraendert -- das Verzeichnis steht oberhalb des
  Markers, der Split-Mechanismus selbst aendert sich nicht).
- `SkillsManager.matchSkills` (bleibt -- ggf. von Recipe-/Fast-Path-Code genutzt;
  nur der `buildSkillsSection`-Aufrufer in AgentSidebarView faellt weg).
- `code_modules` / `DynamicToolFactory` (Code-Module-Skills -- ihre Tools werden wie
  bisher registriert; `read_skill` erwaehnt sie nur).
- Onboarding-Pfad (`isOnboarding` -> `skillDirectorySection = undefined`, wie heute
  `skillsSection`).

## 5. Verifikation

1. **Build:** `npm run build` -- gruen. Dann `npm run deploy`.
2. **Tests:** `npm test` -- Baseline `dev` = 1411 (inkl. FEAT-24-05). Erwartung:
   keine Regression; neue Tests (ReadSkillTool, skillDirectory) gruen.
3. **Typecheck:** keine `skillsSection`/`selfAuthoredSkillsSection`/`activeSkillNames`-
   Treffer mehr ausser in `main.js` (generiert). `grep -rn` zur Kontrolle.
4. **Regression -- System-Prompt:** `[SystemPrompt]`-Log: keine `active-skills`-/
   `self-authored-skills`-Section mehr; `skill-directory` taucht in den Top-Sections
   nur auf, wenn Skills installiert sind, und liegt vor `cache-breakpoint`.
5. **Regression -- Caching:** `[CacheStat:anthropic]` / `[InputBreakdown:main-loop]`
   ueber 2+ Turns: der gecachte Praefix umfasst jetzt auch das Skill-Verzeichnis;
   Hit-Rate ab Call 2 nicht schlechter als vor dem Change.
6. **Funktional -- Skill laden:** mit installiertem Skill (z.B. `office-workflow`)
   eine passende Aufgabe stellen ("erstelle eine Praesentation aus ...") -> der Agent
   ruft `read_skill({ name: "office-workflow" })`, bekommt den Body als Tool-Result
   mit Header, folgt dem Workflow. Kein `classifyText`-Call mehr im `[Cost]`-Log vor
   der ersten Iteration.
7. **Funktional -- kein passender Skill:** normale Notizfrage -> kein `read_skill`-
   Call, kein Klassifikator-Call, keine Skill-Section im Prompt-Tail.
8. **Funktional -- Ask-Mode:** `read_skill` ist im Tool-Schema verfuegbar (Gruppe
   `read`), Verzeichnis im Prompt vorhanden.
9. **Review-Bot:** `/review-bot` lokal -- kein `console.log`, kein `any`, keine
   floating promises im neuen Tool; eslint gruen.
10. `/testing` (Unit + Integration fuer `ReadSkillTool` + Section) -> `/security-audit`
    (neues Tool: Pfad-Traversal beim Skill-Lookup? `read_skill` nimmt nur einen
    Namen und schlaegt ihn in den geladenen Skill-Maps nach -- kein freier Pfad ->
    kein Traversal-Vektor. Trotzdem im Audit verifizieren, dass `meta.path` aus
    `discoverSkills()` nicht manipulierbar ist.)
