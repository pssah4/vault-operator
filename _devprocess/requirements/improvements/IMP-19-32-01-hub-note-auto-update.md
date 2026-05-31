---
id: IMP-19-32-01
feature: FEAT-19-00
epic: EPIC-19
adr-refs: []
plan-refs: []
depends-on: []
research-refs: [RESEARCH-37]
created: 2026-05-31
status: Candidates (User-Entscheidung ueber Option ausstehend)
priority: P2
source: USER
---

# IMP-19-32-01: Hub-Note Auto-Update

## Problem

Themen- und Konzept-Hub-Notes bekommen aktuell keinen sichtbaren
Auto-Update ihres Markdown-Bodys. Was es gibt, ist intern oder
Obsidian-built-in (Backlinks-Panel in der Sidebar). Eine Hub-Note
`Themen/Agentic AI.md` weiss nicht von sich aus, dass eine neue
Quellen-Note `Inbox/Webb-2026.md` sie als `Themen: [[Agentic AI]]`
referenziert. Die Hub-Note bleibt unveraendert; nur das
Obsidian-Backlinks-Panel listet die neue Referenz.

User-Eindruck am 2026-05-31: "Aktuelle Aktualisierung passiert
nicht." Bestaetigt.

## Vollstaendige Analyse

Siehe Design-Memo: [RESEARCH-37](../../analysis/RESEARCH-37-hub-note-auto-update.md).

Vier Optionen untersucht:

- **A: Companion-Base pro Hub** (Skill-only, kein Plugin-Code) -- 1 Tag
- **B: Skill-edit auf Hub-Body** -- 2 Tage, verletzt aber Skill-Regel
  "keine fremden Notes inhaltlich aendern"
- **C: Periodischer Plugin-Job** -- 4-5 Tage, vollstaendig
  selbst-heilend
- **D: Globale Hub-Index-Note** -- 1-2 Tage, sichtbare
  Vault-Uebersicht

Empfehlung aus dem Memo: **A + D** als Phase 1 + 2, beide
skill-only.

## Offene User-Entscheidungen

Bevor wir scopen koennen:

1. Option-Wahl (A+D, B, C, oder Variante).
2. Ordner-Layout der Companion-Bases (`Themen/*.base` neben der
   Hub-Note vs. `_bases/Themen/*.base` separat).
3. Filter pro Hub-Kategorie: nur `Themen.contains(this.file.link)`
   oder beide `Themen` UND `Konzepte` per OR?
4. Transitive Beziehungen einbeziehen (Konzepte gelten auch fuer
   ihre Themen-Eltern)? Pragmatisch nein in Phase 1.

## Naechste Schritte

- User entscheidet Option + offene Fragen
- Bei Option A+D: Spec hier ausarbeiten, knowledge-ingest / ingest /
  ingest-deep um die Base-Anlage erweitern, Stub-Base-Template
  bundeln, dann implementieren
- Bei Option B oder C: separate Spec mit Plugin-Code-Plan

Solange diese Antworten ausstehen, ist Hub-Auto-Update nicht in
einer Release-Welle eingeplant. Die Skill-Regel zur
Themen/Konzepte-Property-Disziplin (kategoriegebunden + YAML-Liste)
ist UNABHAENGIG und bereits in v2.12.8 enthalten (commit auf
`fix/code-review-7-findings`).
