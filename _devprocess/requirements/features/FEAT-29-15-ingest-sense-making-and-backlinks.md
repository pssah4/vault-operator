---
id: FEAT-29-15
title: /ingest und /ingest-deep Sense-Making-Notes mit Backlinks
epic: EPIC-29
priority: P2
effort: S
asr-refs: []
adr-refs: []
depends-on: [FEAT-29-14]
created: 2026-05-21
---

# Feature: /ingest und /ingest-deep -- Sense-Making-Output mit Graph-Backlinks

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-29-15
> (status, phase, claim, last-change leben dort).

## Feature description

Die /ingest- und /ingest-deep-Skills produzieren bereits Quellen-Notes mit Kernaussagen plus Block-Refs zur Quelle. Was bisher fehlte:

1. **Inline-Default `Kategorie:` war Inline-Array.** Der Inline-Default schrieb `Kategorie: [Quelle]` was den Auto-Trigger (FEAT-19-27) nicht matcht; das erwartet YAML-Listen-Format `- Quelle`.
2. **Sense-Making-Output nicht standardisiert.** /ingest-deep hat zwar `output_mode: source-plus-summary` und `source-plus-multi-zettel`, aber die Skill-Anweisung sagte nicht welches Template, welche Kategorie, welches Frontmatter-Feld den Backref zur Quelle traegt.
3. **Kein Graph-Backref.** Die neu angelegten Sense-Making-Notes / Zettel landeten ohne Eintrag im Quelle-Frontmatter (`Notizen:`-Feld blieb leer). Der Obsidian-Graph zeigt damit keine Kante Quelle <-> abgeleitete Erkenntnis.

Dieses Feature aendert beide Skill-Bodies:

- **Kategorie-Pflicht-Format auf YAML-Listen-Element** (`- Quelle` / `- Source`).
- **Template-Verweis erweitert:** Skill liest fuer Quelle die Setting `ingestNoteTemplate` / `ingestDeepNoteTemplate`, fuer Sense-Making-Output die NEUE Setting `quellenNotizTemplate` (kommt aus FEAT-29-14). Template wird IMMER bevorzugt vor dem Inline-Default.
- **Sense-Making-Step in /ingest:** Skill fragt explizit "A: Sense-Making-Note, B: Multi-Zettel, C: Nichts" (Default C). Output-Notes mit Kategorie `- Quellen-Notiz` / `- Source note` und `Quellen: [[<basename>]]` Backref.
- **Backlink-Step (Pflicht) in beiden Skills:** Nach Anlegen der Output-Notes laedt der Skill die Quelle-Note via `read_file` und ergaenzt via `update_frontmatter` das `Notizen:`-Feld mit Wiki-Links auf alle neu erstellten Notes.

## Benefits hypothesis

**Wir glauben dass** Sense-Making-Output mit Backlink ins Quelle-Frontmatter
**folgende messbare Wirkung erzielt:**

- Auto-Trigger feuert auf neu ingestete Notes zuverlaessig.
- Obsidian-Graph zeigt Quelle <-> Sense-Making-Notes als bidirektionale Kante.
- User kann von der Quelle aus zu allen abgeleiteten Erkenntnissen springen.

**Wir wissen dass wir erfolgreich sind, wenn:**

- Inline-Default schreibt `Kategorie:\n  - Quelle` (Listen-Format).
- Skill nutzt `vaultIngest.templates.quellenNotizTemplate` fuer Sense-Making-Output-Notes.
- Sense-Making-Notes haben Kategorie `- Quellen-Notiz` (DE) / `- Source note` (EN) und `Quellen: [[<basename>]]` im Frontmatter.
- Quelle-Note hat nach dem Run `Notizen: [[note1]], [[note2]]` im Frontmatter (append, kein replace).

## User stories

### Story 1: Auto-Trigger funktioniert (Functional Job)

**Als** User mit konfiguriertem Auto-Trigger auf `category: source`
**moechte ich** dass /ingest die Note mit Kategorie `- Quelle` als YAML-Listen-Element schreibt,
**damit** der Auto-Trigger nicht silent fehlschlaegt.

### Story 2: Sense-Making mit klarem Backlink (Functional Job)

**Als** User der /ingest auf ein PDF anwendet
**moechte ich** auf Wunsch automatisch eine Sense-Making-Note oder Zettel anlegen lassen, die im Frontmatter auf die Quelle verweisen,
**damit** ich die Erkenntnisse von der Quelle aus wiederfinde.

### Story 3: Graph-Kante zur Quelle (Functional Job)

**Als** User der den Obsidian-Graph nutzt
**moechte ich** dass die Quelle-Note nach /ingest im `Notizen:`-Frontmatter Wiki-Links auf die abgeleiteten Notes traegt,
**damit** der Graph die Verbindung visuell sichtbar macht.

---

## Success criteria (tech-agnostic)

| ID | Kriterium | Target | Messung |
|---|---|---|---|
| SC-01 | Inline-Default in ingest/SKILL.md schreibt `Kategorie:\n  - Quelle` (Listen-Format) | YAML-Listen-Element, nicht Inline-Array | Visueller Check der SKILL.md |
| SC-02 | Skill bevorzugt IMMER das User-Template (Setting) ueber Inline-Default | Skill-Body sagt das explizit | Visueller Check |
| SC-03 | /ingest fragt nach Sense-Making-Modus (A/B/C, Default C) | Frage erscheint nach Step 3 | Manueller Test |
| SC-04 | Sense-Making-Notes nutzen `quellenNotizTemplate` mit Kategorie `- Quellen-Notiz` / `- Source note` | Frontmatter-Check der Output-Note | Manueller Test |
| SC-05 | Quelle-Note hat nach dem Run `Notizen: [[note1]], ...` im Frontmatter (append) | Frontmatter-Check via read_file | Manueller Test |
| SC-06 | /ingest-deep Step 5 (Backlink) ist Pflicht-Schritt im Skill-Body | Step 5 dokumentiert | Visueller Check |
| SC-07 | requiredTools erweitert um `update_frontmatter` in beiden Skills | Frontmatter check | Visueller Check |

---

## Files affected

| Datei | Aenderung |
|---|---|
| `bundled-skills/ingest/SKILL.md` | Step 0a um Template-Bevorzugung erweitert, Inline-Default `Kategorie:` als Liste, neuer Step 4 (Sense-Making-Output, User-Frage A/B/C), neuer Step 5 (Backlink in Quelle), `update_frontmatter` zu requiredTools |
| `bundled-skills/ingest-deep/SKILL.md` | Step 0a analog, Step 4 erweitert um Output-Note-Konvention, neuer Step 5 (Backlink), `update_frontmatter` + `write_file` zu requiredTools |

## Dependencies

- **FEAT-29-14**: liefert das `quellenNotizTemplate`-Setting und materialisiert das Notiz/Note-Template. Ohne 29-14 sind die Skill-Anweisungen zwar korrekt, aber die User-Templates muessen manuell gepflegt werden.

---

## Verification

1. Build: `npm run build` -- 24 skills emitted, clean.
2. SkillFrontmatterValidator: `npx vitest run src/core/skills/__tests__/SkillFrontmatterValidator.test.ts` -- 16/16 green (kein Drift durch neue requiredTools-Eintraege).
3. /ingest live-Test:
   - PDF in Chat ziehen.
   - Quelle-Note hat `Kategorie:\n  - Quelle`.
   - User-Frage "Sense-Making A/B/C?" erscheint, A waehlen.
   - Sense-Making-Note hat `Kategorie:\n  - Quellen-Notiz` und `Quellen: [[<basename>]]`.
   - Quelle-Note Frontmatter hat danach `Notizen: [[<sense-making-name>]]`.
4. /ingest-deep live-Test, `output_mode: source-plus-multi-zettel`:
   - N Zettel angelegt, alle mit Kategorie `- Quellen-Notiz` und Backref.
   - Quelle hat `Notizen: [[zettel1]], [[zettel2]], ...`.
