---
id: ADR-116
title: Active Skills -- model-getriebenes On-demand-Laden statt Klassifikator-Inject
date: 2026-05-12
deciders: Sebastian + Architekt-Agent
related-features: FEAT-24-09
related-adrs: ADR-09 (PAS-1 Local Skills), ADR-62 (KV-Cache-Optimized Prompt Structure, Amendment 2026-05-12), ADR-08 (Modular Prompt Sections)
related-imps: []
---

# ADR-116: Active Skills -- model-getriebenes On-demand-Laden

## Status

Accepted (Implementierung PLAN-20, 2026-05-13, EPIC-24 Welle 2). Triggernde ASR: EPIC-24 / FEAT-24-09; RESEARCH-36 Abschnitt 8 (Hebel B-Teil) und Abschnitt 3 (Caching-Stabilitaet). Siehe Amendment 2026-05-13 unten fuer die Implementierungs-Entscheidungen.

## Kontext

Skills (Markdown-Anleitungen fuer bestimmte Aufgabentypen) werden heute so eingebunden: bei jeder User-Message macht der Agent einen **LLM-Klassifikations-Call** ("welche Skills sind fuer diese Nachricht relevant?"), und der Inhalt der so gewaehlten Skills wird in den **System-Prompt** injiziert (Section "Active Skills", im dynamischen Block nach dem Cache-Breakpoint). Zwei Probleme:

1. **Ein zusaetzlicher LLM-Roundtrip pro User-Message** -- der Klassifikator-Call laeuft vor jeder eigentlichen Agent-Iteration. Kostet Tokens und Latenz, auch wenn am Ende kein Skill relevant ist.
2. **Cache-Schaedlichkeit:** weil der Active-Skills-Inhalt im System-Prompt steht und sich pro Message aendert, ist er Teil des Grundes, warum der gecachte System-Praefix instabil ist (siehe ADR-62-Amendment: der volatile Tail -- DateTime, Memory, Active Skills, Recipes, Vault Context -- liegt im gleichen `cache_control`-Block wie der stabile Teil). Selbst nach dem Praefix-Split (ADR-62-Amendment) bleibt der Active-Skills-Inhalt ein per-Message wechselnder Block, der nicht cachebar ist.

Claude Code und EnBW Cowork machen es anders: Skills sind progressive-disclosure -- beim Start sieht das Modell nur ein **Verzeichnis** (Name + Beschreibung jeder Skill, wenige Tokens), und entscheidet *selbst* per Tool-Aufruf, ob es eine Skill braucht; dann wird der volle SKILL.md-Body als Tool-Result in den Message-Stream geladen (nicht in den System-Prompt). Kein Klassifikator-Call, kein per-Message wechselnder System-Prompt-Block.

Triggernde ASR: EPIC-24 / FEAT-24-09; RESEARCH-36 Abschnitt 8 (Hebel B-Teil), Abschnitt 3.

## Decision Drivers

- Den per-Message-Klassifikator-Roundtrip einsparen.
- Den System-Prompt cache-stabil halten (kein per-Message wechselnder Block darin).
- Skill-Inhalt nur laden, wenn er gebraucht wird; danach faellt er unter Microcompaction (ADR-12-Amendment) wie jedes andere Tool-Result.
- Vorhandene Skill-Mechanik (ADR-09, das `manage_skill`-Tool, der Skill-Loader) nutzen, nicht neu bauen.

## Considered Options

### Option 1: Status quo -- Klassifikator-Call plus Inject in den System-Prompt

- Pro: kein Aufwand; "Primacy" -- die Skill steht weit oben.
- Con: Extra-Roundtrip pro Message; cache-schaedlicher per-Message-Block im System-Prompt.

### Option 2: Klassifikator behalten, aber das Ergebnis als Tool-Result in den Message-Stream statt in den System-Prompt

- Pro: System-Prompt wird cache-stabil.
- Con: der Extra-Klassifikator-Roundtrip bleibt; der Klassifikator entscheidet weiterhin statt das Modell.

### Option 3: Klassifikator weg, model-getriebenes On-demand-Laden -- nur ein Skill-Verzeichnis im (stabilen) System-Prompt, der volle SKILL.md-Body wird per Tool als Tool-Result geladen

Der System-Prompt enthaelt nur noch das stabile Skill-**Verzeichnis** (Name + Beschreibung je Skill -- klein, aendert sich nur wenn Skills hinzu-/wegkommen, also Teil des stabilen Blocks). Wenn das Modell eine Skill braucht, ruft es ein Tool ("load_skill" / das bestehende `manage_skill` mit einer Lade-Aktion), das den vollen SKILL.md-Body als Tool-Result zurueckgibt. Der Body lebt dann im Message-Stream und faellt nach Gebrauch unter Microcompaction (ADR-12-Amendment) wie jedes andere Tool-Result.

- Pro: kein Klassifikator-Roundtrip; System-Prompt cache-stabil (Verzeichnis ist klein und aendert sich selten); Skill-Body wird nur bei Bedarf geladen und danach geprunt; Claude Code und Cowork machen es genauso.
- Con: das Modell muss erkennen, dass es eine Skill braucht (statt dass ein Klassifikator es vorgibt) -- braucht gute Verzeichnis-Beschreibungen und eine Prompt-Leitplanke; ein bisschen "Primacy"-Verlust (die Skill steht nicht mehr im System-Prompt).

## Entscheidung

**Option 3.** Der per-Message-Active-Skills-Klassifikator entfaellt. Der System-Prompt enthaelt nur noch ein **Skill-Verzeichnis** (Name + Beschreibung je verfuegbarer Skill, plus die schon vorhandene Plugin-Skill-Listung); das ist klein und aendert sich nur, wenn Skills hinzukommen oder wegfallen -- es gehoert damit in den stabilen, gecachten Block (ergaenzt ADR-62-Amendment). Braucht das Modell eine Skill, laedt es deren vollen Body ueber ein Tool als Tool-Result; der Body lebt im Message-Stream und unterliegt Microcompaction (ADR-12-Amendment). Eine Prompt-Leitplanke instruiert das Modell, eine Skill nur zu laden, wenn die Aufgabe dem Skill-Typ entspricht. Self-Authored Skills und Recipes folgen demselben Muster, soweit sinnvoll (im PLAN klaeren).

## Konsequenzen

### Positiv

- Ein LLM-Roundtrip weniger pro User-Message (der Klassifikator-Call faellt weg) -- spart Tokens und Latenz.
- Der System-Prompt wird cache-stabil bzgl. Skills -- der per-Message wechselnde Active-Skills-Block verschwindet; das ergaenzt ADR-62-Amendment (Punkt 4) und macht den stabilen gecachten Praefix groesser/zuverlaessiger.
- Skill-Bodies werden nur bei Bedarf geladen und danach geprunt -- kein Dauer-Ballast im Kontext.
- Nutzt die bestehende Skill-Mechanik (ADR-09); ein Tool statt eines Klassifikator-Pfads.

### Negativ

- "Primacy"-Verlust: die Skill steht nicht mehr im System-Prompt, sondern wird mitten in der Konversation als Tool-Result geladen. Mitigation: gute Verzeichnis-Beschreibungen; eine Prompt-Leitplanke; wenn sich ein Skill-Befolgungs-Problem zeigt, kann der geladene Skill-Body am Anfang einen kurzen "befolge diese Anleitung jetzt"-Header tragen.
- Das Modell muss die Skill-Auswahl selbst treffen -- ein schlechtes Verzeichnis fuehrt dazu, dass es die falsche oder keine Skill laedt. Mitigation: Verzeichnis-Beschreibungen sind dasselbe Material, das heute der Klassifikator als Input bekommt; sie sind also schon vorhanden, nur jetzt fuer das Modell direkt.

### Risiken

- Wenn das Modell eine relevante Skill *nicht* laedt, faellt sie still aus (heute haette der Klassifikator sie vielleicht reingebracht). Mitigation: Shadow-Mode-Vergleich (Klassifikator-Wahl vs. Modell-Wahl) vor dem vollen Cut-over; konservative Prompt-Leitplanke.
- Interagiert mit ADR-115 (Hilfs-Modell-Routing): heute laeuft der Klassifikator-Call auf dem Haupt-Modell und koennte aufs Hilfs-Modell geroutet werden -- mit ADR-116 entfaellt der Call ganz, der Punkt erledigt sich.

## Related Decisions

- ADR-09: PAS-1 Local Skills -- die Skill-Mechanik, die hier anders eingebunden wird.
- ADR-62 (Amendment 2026-05-12): das Skill-Verzeichnis gehoert in den stabilen, gecachten Block; der per-Message-Block entfaellt.
- ADR-12 (Amendment 2026-05-12): geladene Skill-Bodies unterliegen Microcompaction wie andere Tool-Results.
- ADR-08: Modular Prompt Sections -- die "Active Skills"-Section wird zur "Skill-Verzeichnis"-Section.

## Implementation Notes (2026-05-12, kann veralten)

Klassifikator-Pfad (`getSkillsSection(skillsSection)` plus der vorgelagerte Klassifikations-Call in `systemPrompt.ts` bzw. `AgentTask.ts`) entfernen; die Section "Active Skills" durch eine stabile "Skill-Verzeichnis"-Section ersetzen (Name + Beschreibung je Skill, analog zur bestehenden Plugin-Skill-Listung), in den stabilen Block vor dem CACHE-BREAKPOINT verschieben. Ein Lade-Tool (entweder das bestehende `manage_skill` um eine Lade-Aktion erweitern, oder ein schlankes neues `load_skill`-Tool), das den vollen SKILL.md-Body als Tool-Result zurueckgibt. Prompt-Leitplanke in `objective.ts`/`toolDecisionGuidelines.ts`. Skill-Loader (`SelfAuthoredSkillLoader` o.ae.) liefert das Verzeichnis statt vorklassifizierter Inhalte. Diagnose: `[SystemPrompt]` (die "active-skills"-Section sollte verschwinden bzw. zur kleinen "skill-directory"-Section schrumpfen). Verwandt: FEAT-24-09, ADR-62-Amendment, ADR-12-Amendment, RESEARCH-36 Abschnitt 8 (Hebel B), Claude Code (Skill-Tool / progressive disclosure), EnBW Cowork (pi-SDK Skill-Loader).

## Amendment 2026-05-13 (PLAN-20 Umsetzung)

Drei Entscheidungen, bei denen der Code-Abgleich von der Vorab-Note abwich:

1. **Neues, NICHT-deferred Tool `read_skill` statt Erweiterung von `manage_skill`.** Befund: `manage_skill` steht in `DEFERRED_TOOL_NAMES` (`src/core/tools/toolMetadata.ts`) und ist erst nach einem `find_tool`-Roundtrip aufrufbar -- ein Skill darueber zu laden kostet damit zwei Roundtrips und macht den eingesparten Klassifikator-Call zunichte. `read_skill` ist deshalb ein eigenes Tool in der `read`-Gruppe, immer im Schema. `manage_skill` bleibt fuer Editing/Authoring.
2. **Vereinigtes Skill-Verzeichnis ersetzt zwei Sections.** Das Verzeichnis vereinigt `SelfAuthoredSkillLoader.getMetadataSummary()` (bundled + learned, mit Inventory-Zeilen) und `SkillsManager.discoverSkills()` (User-Skills) und ersetzt damit sowohl die alte Section 10 ("ACTIVE SKILLS") als auch Section 13 ("SELF-AUTHORED SKILLS"). `pluginSkillsSection` (VaultDNA-Plugin-Commands, Section 9) ist ein anderes Konzept und bleibt unangetastet.
3. **Power-Steering ohne `activeSkillNames`.** Ohne Klassifikator gibt es keine Vorab-Liste; der `activeSkillNames`-Parameter aus `AgentTask.run` und das Reminder-Anhaengsel wurden entfernt. Steuerung liegt im `read_skill`-Result-Header ("follow this workflow for the current task -- it OVERRIDES default tool selection") + der Verzeichnis-Leitplanke. Falls sich Skill-Befolgung ueber lange Tasks als zu schwach erweist, kann spaeter ein "du hast Skill X geladen, lies ihn mit read_skill neu falls verloren"-Reminder ergaenzt werden -- bewusst nicht in PLAN-20.

Ausserdem bewusst nicht implementiert: der Shadow-Mode-Vergleich (Klassifikator-Wahl vs. Modell-Wahl) aus den "Risiken" -- der Klassifikator-Pfad wird entfernt, nicht parallel betrieben.

**Tatsaechliche Code-Aenderungen (PLAN-20):** `src/core/prompts/sections/skillDirectory.ts` (neu, ersetzt `skills.ts`); `src/core/systemPrompt.ts` (Section 8b vor `CACHE_BREAKPOINT_MARKER`, Section 10/13 entfernt, `skillDirectorySection` statt `skillsSection`/`selfAuthoredSkillsSection`); `src/core/tools/agent/ReadSkillTool.ts` (neu); `src/core/tools/ToolRegistry.ts` (Registrierung); `src/core/tools/toolMetadata.ts` (TOOL_METADATA-Eintrag, NICHT in `DEFERRED_TOOL_NAMES`); `src/core/tools/types.ts` (`'read_skill'` in `ToolName`); `src/core/AgentTask.ts` (Run-Options + drei Call-Sites + Power-Steering); `src/ui/AgentSidebarView.ts` (Klassifikator-Pfad raus, `buildSkillDirectory`); `src/core/skills/SelfAuthoredSkillLoader.ts` (`getMetadataSummary(allowedNames?)`, `[trigger:]` aus Render entfernt); `src/core/tools/agent/ManageSkillTool.ts` (Truncation-Hinweis aktualisiert). Tests: `systemPrompt.test.ts` (skillDirectorySection statt skillsSection + neuer Cache-Praefix-Test), `ReadSkillTool.test.ts` (neu, 6 Tests), `skillDirectory.test.ts` (neu, 4 Tests). 1422 grün auf dem Branch (vorher 1411 auf `dev`).
