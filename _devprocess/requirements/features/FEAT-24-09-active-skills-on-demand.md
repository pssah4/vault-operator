---
id: FEAT-24-09
title: Active Skills -- model-getriebenes On-demand-Laden statt Klassifikator-Inject
epic: EPIC-24
priority: P1
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-116, ADR-62, ADR-12]
plan-refs: [PLAN-20]
depends-on: []
---

# FEAT-24-09: Active Skills on-demand

## Description

Der per-Message-Active-Skills-Klassifikator entfaellt. Der System-Prompt enthaelt nur noch ein stabiles Skill-Verzeichnis (Name + Beschreibung je Skill, plus Inventory-Zeilen self-authored Skills) im gecachten Block oberhalb des `CACHE_BREAKPOINT_MARKER`. Braucht das Modell eine Skill, laedt es deren vollen SKILL.md-Body ueber das neue, NICHT-deferred Tool `read_skill` als Tool-Result; der Body unterliegt danach Microcompaction (FEAT-24-02 / ADR-12-Amendment) wie jedes andere Tool-Result. Prompt-Leitplanke im Verzeichnis und im `read_skill`-Result-Header. Spart den Klassifikator-Roundtrip und macht den System-Prompt cache-stabil (ergaenzt ADR-62-Amendment). Setzt ADR-116 um (siehe ADR-116 Amendment 2026-05-13 fuer die drei Implementierungs-Entscheidungen).

Quelle: RESEARCH-36 Abschnitt 8 Hebel B-Teil + Abschnitt 3. Architektur: ADR-116, ADR-62 (Amendment), ADR-12 (Amendment). Umsetzung: PLAN-20.

## Success Criteria

1. **Kein Klassifikator-Call pro User-Message:** im `[Cost]`/`[CacheStat:*]`-Log einer normalen Konversation darf kein `classifyText`-Call mehr vor der ersten Iteration auftauchen. (Live-Messlauf -- gemeinsam mit den `[AWAITING RE]`-SC aus FEAT-24-01..03 abnehmen.)
2. **System-Prompt cache-stabil bzgl. Skills:** im `[SystemPrompt]`-Top-Sections-Log existiert keine `active-skills`- und keine `self-authored-skills`-Section mehr; statt dessen taucht (sobald Skills installiert sind) `skill-directory` auf, **vor** `cache-breakpoint`.
3. **Modell laedt eine Skill bei passender Aufgabe:** mit installiertem `office-workflow`-Skill und Aufgabe "erstelle eine Praesentation aus ..." ruft der Agent `read_skill({ name: "office-workflow" })` und folgt anschliessend dem Workflow.
4. **Kein Skill-Body bei nicht passender Aufgabe:** normale Notiz-/Frage-Tasks loesen weder einen Klassifikator-Call noch einen `read_skill`-Call aus; Skill-Bodies tauchen nicht in der History auf.
5. **`read_skill` ist im Tool-Schema von Agent- und Ask-Mode verfuegbar** (Gruppe `read`, NICHT in `DEFERRED_TOOL_NAMES`).
6. **Tests-Baseline auf dem Branch:** 1422 grün (vorher 1405 auf `dev` ohne FEAT-24-05; +6 ReadSkillTool, +4 skillDirectory, +1 systemPrompt-Cache-Praefix-Test, +6 von FEAT-24-05 = 1422).

Shadow-Mode-Vergleich Klassifikator vs. Modell-Wahl bewusst nicht implementiert -- der Klassifikator-Pfad wird entfernt, nicht parallel betrieben (siehe ADR-116 Amendment 2026-05-13).
