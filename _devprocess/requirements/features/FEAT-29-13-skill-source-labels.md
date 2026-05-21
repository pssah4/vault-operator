---
id: FEAT-29-13
title: Skill-Source-Labels (Built-in, Agent, User) mit Tooltip
epic: EPIC-29
priority: P2
effort: XS
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-05, FEAT-29-11]
created: 2026-05-21
---

# Feature: Skill-Source-Labels mit klarer Drei-Kategorien-Trennung

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-13
> (status, phase, claim, last-change leben dort).

## Feature description

Vor diesem Feature zeigte der Settings -> Skills-Tab in der "Source"-Spalte drei Werte: **Built-in**, **Agent** (fuer `source: learned`) und **Template** (fuer `source: user`). Das war aus zwei Gruenden irrefuehrend:

1. Der Tag "Template" suggeriert eine Vorlage, nicht eine User-Erstellung. Anwender konnten daraus nicht ableiten, ob ein Skill durch den qualitaetsgesicherten skill-creator-Workflow lief.
2. `init_skill` aus dem skill-creator schrieb `source: user`. Damit landeten agent-erstellte Skills mit demselben Discriminator wie manuell importierte oder kopierte Skills - keine technische Trennung moeglich.

Das Feature setzt drei klar getrennte Labels: **Built-in** (vom Plugin ausgeliefert), **Agent** (via skill-creator erstellt, quality-gated) und **User** (manuell geschrieben/kopiert/importiert). `init_skill` schreibt ab jetzt `source: agent`, der `learned`-Legacy-Wert faellt in dieselbe Agent-Kategorie. Der Spalten-Header bekommt einen Tooltip, der die drei Kategorien erklaert.

## Benefits hypothesis

**Wir glauben dass** klare Source-Labels mit Tooltip am Header
**folgende messbare Wirkung erzielt:**

- User erkennt auf einen Blick, ob ein Skill vom Plugin, vom Agent oder von ihm selbst stammt.
- User versteht, welche Skills die skill-creator-Qualitaetsgates durchlaufen haben.

**Wir wissen dass wir erfolgreich sind, wenn:**

- Source-Spalte zeigt genau drei Labels: Built-in, Agent, User.
- Spalten-Header zeigt beim Hover einen Tooltip, der die drei Kategorien erklaert.
- Neue Skills via skill-creator landen mit `source: agent` (per init_skill).
- BuiltinSkillMaterializer ueberschreibt agent- und user-Skills nicht auf Plugin-Reload.

## User stories

### Story 1: Drei klare Kategorien (Functional Job)

**Als** User der Skills in den Settings prueft
**moechte ich** drei klar getrennte Source-Labels sehen,
**damit** ich Plugin-Defaults, Agent-Output und meine eigenen Skills auf einen Blick unterscheiden kann.

### Story 2: Tooltip-Erklaerung (Educational Job)

**Als** User der das Plugin neu kennenlernt
**moechte ich** beim Hover ueber "Source" eine kurze Erklaerung der Labels bekommen,
**damit** ich nicht in der Doku nachschlagen muss.

### Story 3: Schutz vor Plugin-Reload (Functional Job)

**Als** User der via skill-creator einen Skill mit demselben Namen wie ein Bundled-Skill erstellt
**moechte ich** dass mein Agent-Skill nicht beim Plugin-Reload ueberschrieben wird,
**damit** ich nicht jede Iteration neu starten muss.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Source-Spalte zeigt drei Labels: Built-in, Agent, User | drei Buckets sichtbar | Manueller Test im Settings-Tab |
| SC-02 | Tooltip am Source-Spalten-Header erklaert die drei Kategorien | Hover zeigt > 50 Zeichen Erklaerung | Manueller Hover-Test |
| SC-03 | Neue Skills via skill-creator landen mit `source: agent` im Frontmatter | Frontmatter-Lesung nach init_skill | Manueller Test + Unit-Test |
| SC-04 | BuiltinSkillMaterializer skipped agent- und learned-Skills genauso wie user-Skills | Skip in materialize-Report | Manueller Test (reload mit gleichnamigem Agent-Skill) |
| SC-05 | UI-Sortierung: Built-in zuerst, dann Agent, dann User, jeweils alphabetisch | korrekte Reihenfolge im Tab | Manueller Test |

---

## Technical NFRs

### Performance

- Tooltip-Anzeige unter 100 ms nach Hover.

### Accessibility

- Tooltip via `setTooltip` (Obsidian-API) -- screen-reader-kompatibel.

### Maintenance

- `getSourceLabel` extrahiert aus SkillsTab in `userSkillSource.ts` -- testbar ohne Modal-/setIcon-Imports.

---

## Files affected

| Datei | Aenderung |
|---|---|
| `bundled-skills/skill-creator/scripts/init_skill.js` | `source: user` -> `source: agent` |
| `bundled-skills/skill-creator/SKILL.md` | Doku-Update: drei Kategorien benannt |
| `src/ui/settings/userSkillSource.ts` | `agent` zu USER_SKILL_SOURCES, neue Exports `getSourceLabel` + `SOURCE_TOOLTIP` |
| `src/ui/settings/__tests__/userSkillSource.test.ts` | Tests fuer `agent` + `getSourceLabel` + `SOURCE_TOOLTIP` |
| `src/ui/settings/SkillsTab.ts` | Import von `getSourceLabel`/`SOURCE_TOOLTIP`, Tooltip am Header, Sort-Order erweitert, private `getSourceLabel` entfernt |
| `src/core/skills/BuiltinSkillMaterializer.ts` | Override-Check schliesst `agent` und `learned` mit ein |
| `styles.css` | `.agent-skill-source-builtin` und `.agent-skill-source-agent` Klassen ergaenzt |

---

## Verification

1. Unit-Tests: `npx vitest run src/ui/settings/__tests__/userSkillSource.test.ts` -- 10/10 green.
2. Build + Deploy: `npm run build` -- clean.
3. Settings-Tab im Live-Vault: drei Labels sichtbar, Tooltip am Header funktioniert.
4. skill-creator-Workflow: neuer Skill via `init_skill` -> Frontmatter zeigt `source: agent`.
5. Plugin-Reload mit gleichnamigem Agent-Skill -> Skip im Materializer-Report.
