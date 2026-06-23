---
id: ADR-141
title: Skill-Capability-Filter inline-action-eligible
date: 2026-06-22
deciders: [Sebastian Hanke, Architecture Agent (Claude Opus 4.7)]
asr-refs: [ASR-EPIC-33-05]
feature-refs: [FEAT-33-08, FEAT-33-11]
related-adrs: []
supersedes: null
superseded-by: null
---

# ADR-141: Skill-Capability-Filter inline-action-eligible

## Context

EPIC-33 fuehrt Inline-Editor-AI-Actions ein. Ein zentraler Baustein ist das Floating-Menu, das beim Markieren von Text im Editor auftaucht und Aktionen wie Rewrite, Lookup oder Summarize anbietet. Neben den eingebauten Actions soll das bestehende Skills-System als Quelle weiterer Inline-Actions dienen (FEAT-33-08). Damit kann ein Skill-Autor eigene LLM-gestuetzte Aktionen direkt am Selection-Punkt anbieten, ohne den Umweg ueber die Sidebar.

Heute deklariert ein Skill weder ob er inline-tauglich ist noch welche Art von Output er produziert. Skills sind dialog-orientiert: Eingabe ist ein Prompt-String, Ausgabe ist Freitext im Sidebar-Chat. Inline-Actions brauchen aber zusaetzliche Information: ein deklariertes Output-Format (Preview-Block, Inline-Diff, Tooltip oder Side-Panel), ein erwartetes Input-Format (Markdown vs Plain-Text) und eine Obergrenze fuer die Selection-Laenge, damit ein Skill nicht ungewollt mit zehntausenden Zeichen aufgerufen wird.

Die Frage ist, wie das Skill-Manifest erweitert wird, damit das Floating-Menu zuverlaessig entscheiden kann welcher Skill erscheint und wie sein Output gerendert wird, ohne den Skill-Code selbst zu inspizieren.

**Triggering ASR:** ASR-EPIC-33-05 fordert, dass Skills als Inline-Action-Quelle nutzbar sind und das Floating-Menu pro Skill den richtigen Output-Pfad waehlen kann.

**Quality attribute:** Extensibility (Skill-Autoren erweitern die Inline-Actions ohne Core-Code zu aendern) und Usability (das Floating-Menu rendert Aktionen mit dem fuer sie passenden Output-Modus).

## Decision drivers

- **Explizite Opt-in-Semantik:** Bestehende Skills duerfen nicht ungefragt im Floating-Menu auftauchen. Ein Skill-Autor muss aktiv erklaeren dass sein Skill inline-tauglich ist.
- **Output-Modus-Variation:** Inline-Actions unterscheiden sich stark in der Praesentation. Rewrite braucht Inline-Diff, Lookup einen Tooltip oder Side-Panel, Summarize einen Preview-Block. Ein einziger Default-Output-Pfad reicht nicht.
- **Migrationsfreundlichkeit:** Der bestehende Skill-Bestand soll unveraendert weiterlaufen. Wer das neue Feature nicht braucht, aendert nichts.
- **Validierbarkeit:** Das Capability-Feld muss beim Skill-Load gegen ein Schema pruefbar sein, damit Fehlkonfigurationen frueh und mit klarer Fehlermeldung auffallen.

## Considered options

### Option 1: Boolean-Flag inline-action-eligible: true

Das Skill-Manifest erhaelt ein einzelnes Boolean-Feld. Setzt der Autor es auf true, taucht der Skill im Floating-Menu auf. Output-Modus ist immer Preview-Block, Input-Format immer Markdown, Selection-Cap fix.

**Pros:**
- Minimaler Schema-Change.
- Triviale Implementation im Floating-Menu (Filter ueber ein Boolean).
- Klarer Migrationspfad: alle bestehenden Skills haben den Flag implizit auf false.

**Cons:**
- Output-Modus laesst sich nicht pro Skill steuern. Ein Skill der Inline-Diff oder Tooltip will, hat keine Ausdrucksmoeglichkeit.
- Input-Format-Annahmen sind ungenau. Ein Skill der Plain-Text erwartet bekommt Markdown.
- Selection-Cap ist global statt pro Skill, was bei kleinen Lookup-Skills zu unnoetig grossen Inputs fuehrt.

### Option 2: Capability-Object mit output_mode-Hint (empfohlen)

Das Skill-Manifest erhaelt ein optionales Capability-Object mit den Feldern eligible, output_mode (Enum aus preview-block, inline-diff, side-panel, tooltip), input_format (markdown oder plain) und einem optionalen max_selection_chars. Das Floating-Menu fragt diese Felder ab und waehlt pro Skill den passenden Render-Pfad.

**Pros:**
- Der Skill-Autor deklariert explizit Output-Modus und Input-Format, ohne dass das Floating-Menu raten muss.
- Selection-Cap ist pro Skill setzbar.
- Erweiterbar fuer kuenftige Capabilities wie requires_vault_context oder max_token_budget.
- Bestehende Skills bleiben unveraendert, das Feld ist optional.

**Cons:**
- Schema-Migration noetig. Doku und Beispiele muessen das neue Feld erklaeren.
- Validierung beim Skill-Load ist aufwaendiger, weil ein Enum gegen erlaubte Werte gepruefen werden muss.
- Skill-Autoren brauchen ein Doku-Update, um die Capability korrekt zu setzen.

### Option 3: Implicit inference aus Skill-Tags

Das Manifest aendert sich nicht. Stattdessen liest das Floating-Menu vorhandene Tag-Felder (rewrite, lookup, summarize, transform) und leitet daraus sowohl die Inline-Tauglichkeit als auch den Output-Modus ab. Ein Skill mit Tag rewrite landet im Diff-Pfad, ein Skill mit Tag lookup im Tooltip-Pfad.

**Pros:**
- Kein Schema-Change. Bestehende Skills mit passenden Tags sind sofort verfuegbar.
- Skill-Autoren muessen nichts lernen.

**Cons:**
- Tag-Vergabe ist heute lose und nicht normiert. Skills tragen Tags zur Sortierung, nicht zur Output-Steuerung.
- Skill-Autoren koennen weder opt-in noch opt-out aussprechen. Ein Skill mit Tag rewrite landet im Floating-Menu, auch wenn er fuer einen anderen Zweck gedacht war.
- Output-Modus-Inferenz ist unsicher und schwer zu debuggen, wenn ein Skill ploetzlich im falschen Pfad landet.

## Decision

Vorgeschlagen wird Option 2 (Capability-Object mit output_mode-Hint).

Begruendung: Output-Modus-Variation ist zentral fuer die EPIC-33-Quality. Rewrite, Lookup, Summarize und Transform haben unterschiedliche Render-Pfade, ein einziges Default reicht nicht aus. Der Boolean-Flag aus Option 1 spart Schema, opfert dafuer aber den entscheidenden Vorteil dass das Floating-Menu pro Skill den passenden Output-Pfad waehlen kann. Implicit-Inference aus Option 3 ist fragil, weil Tags heute keine semantische Garantie tragen und ein Autor weder opt-in noch opt-out hat. Das Capability-Object macht die Eignung explizit, erlaubt Validierung beim Load und bleibt offen fuer kuenftige Felder.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Skill-Autoren deklarieren explizit dass ein Skill inline-tauglich ist und mit welchem Output-Modus er erscheint.
- Das Floating-Menu kann pro Skill den richtigen Render-Pfad ansteuern (Preview-Block, Inline-Diff, Side-Panel, Tooltip).
- Bestehende Skills bleiben unveraendert. Das Capability-Feld ist optional, ein nicht gesetztes Feld bedeutet "nicht inline-faehig".
- Das Object ist erweiterbar fuer kuenftige Capabilities wie requires_vault_context, max_token_budget oder Provider-Restriktionen.

### Negative

- Das Skill-Manifest-Schema muss um einen optionalen Block erweitert werden. Doku und Beispielskills brauchen ein Update.
- Validierung beim Skill-Load wird aufwaendiger. output_mode muss aus dem festgelegten Enum stammen, max_selection_chars muss ein positiver Integer sein.
- Skill-Autoren brauchen klare Doku, sonst bleibt das Feature ungenutzt oder wird inkonsistent gesetzt.

### Risks

- Drift zwischen Capability-Deklaration und tatsaechlichem Skill-Verhalten. Ein Skill deklariert inline-diff, sein Output passt aber nicht in ein Diff-Schema. Mitigation: Schema-Validation beim Skill-Load plus ein Referenz-Skill pro Output-Modus in den Beispielen, an dem Autoren sich orientieren.
- Migration bestehender Skills auf das neue Feld kann sich ziehen. Mitigation: das Feld bleibt opt-in. Skills ohne Capability sind im Floating-Menu unsichtbar, was sicheres Default-Verhalten ist und keine Zwangsmigration ausloest.
- Output-Modus-Enum koennte sich kuenftig erweitern, was Skill-Autoren zu Anpassungen zwingt. Mitigation: das Enum wird konservativ klein gehalten und nur erweitert wenn ein Render-Pfad nachweislich fehlt.

## Implementation Notes

Schema-Erweiterung in `src/services/SkillsService.ts` und `src/types/skill-manifest.ts`:

```ts
interface SkillManifest {
  // ... bestehende Felder ...
  inlineActionCapability?: {
    eligible: boolean
    output_mode: 'preview-block' | 'inline-diff' | 'side-panel' | 'tooltip'
    input_format: 'markdown' | 'plain'
    max_selection_chars?: number  // default 5000
  }
}
```

Validierung beim Skill-Load: in `SkillsService.loadSkill()` wird das Manifest gegen ein Zod- oder JSON-Schema gepruefen. Ungueltige Capability-Eintraege fuehren zu einem console.warn mit Skill-Name und der Skill wird ohne Capability geladen (graceful degradation).

Filter-API: `SkillsService.getInlineEligibleSkills(): SkillManifest[]` liefert alle Skills mit `inlineActionCapability?.eligible === true`. Das Floating-Menu (`src/core/inline/menu/InlineFloatingMenu.ts` NEU) konsumiert diese Liste und rendert pro Skill einen Menu-Eintrag mit Skill-Icon plus einem Hint-Glyph fuer den output_mode.

Selection-Pipeline: vor dem Skill-Aufruf prueft das Floating-Menu die Selection-Laenge gegen `max_selection_chars` (Default 5000) und konvertiert bei Bedarf Markdown nach Plain-Text wenn `input_format === 'plain'`.

Doku: `docs/reference/skills/inline-action-capability.md` (NEU) mit Beispiel-Manifesten pro output_mode plus einem Migrationsleitfaden fuer bestehende Skill-Autoren.

Referenz-Skills: ein Beispielskill pro output_mode in `examples/skills/inline-*.skill.md`, damit Autoren ein lauffaehiges Template haben.
