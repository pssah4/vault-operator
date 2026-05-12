---
id: FEAT-24-09
title: Active Skills -- model-getriebenes On-demand-Laden statt Klassifikator-Inject
epic: EPIC-24
priority: P1
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-116, ADR-62]
plan-refs: []
depends-on: []
---

# FEAT-24-09: Active Skills on-demand

## Description

Der per-Message-Active-Skills-Klassifikator entfaellt. Der System-Prompt enthaelt nur noch ein stabiles Skill-Verzeichnis (Name + Beschreibung je Skill) im gecachten Block. Braucht das Modell eine Skill, laedt es deren vollen SKILL.md-Body ueber ein Tool als Tool-Result; der Body unterliegt danach Microcompaction (FEAT-24-02). Prompt-Leitplanke. Spart den Klassifikator-Roundtrip und macht den System-Prompt cache-stabil (ergaenzt ADR-62-Amendment). Setzt ADR-116 um.

Quelle: RESEARCH-36 Abschnitt 8 Hebel B-Teil + Abschnitt 3. Architektur: ADR-116, ADR-62 (Amendment).

## Success Criteria

`[AWAITING RE]` -- Richtwert: kein Klassifikations-Call pro User-Message mehr (`[Cost]`-Log); die "active-skills"-Section im `[SystemPrompt]`-Log schrumpft auf eine kleine "skill-directory"-Section; das Modell laedt eine Skill bei passender Aufgabe; Shadow-Mode-Vergleich Klassifikator-Wahl vs. Modell-Wahl zeigt keine relevante Regression.
