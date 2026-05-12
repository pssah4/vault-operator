---
id: FEAT-24-08
title: Autonomie-Governance -- Token-/Kosten-Budget pro Task, Steering-Hook, Exploration-Limit
epic: EPIC-24
priority: P2
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-114]
plan-refs: []
depends-on: []
---

# FEAT-24-08: Autonomie-Governance

## Description

Kumulatives Token-/Kosten-Budget pro Task (konfigurierbar, mit Warnschwelle): beim Ueberschreiten pausiert der Lauf und fragt (weitermachen / Limit erhoehen / abbrechen). Steering-Hook: zwischen zwei Iterationen ein korrigierender Prompt ohne Abbruch. Weiches Exploration-Limit: nach N reinen Lese-/Such-Aufrufen ohne produktiven Schritt ein Hinweis (fokussieren / Subtask spawnen). Defaults grosszuegig (einfache Aufgaben beruehren nie ein Limit). Das Subtask-Per-Call-Budget bleibt in ADR-113/FEAT-24-04. Setzt ADR-114 um.

Quelle: RESEARCH-36 Abschnitt 8 Hebel G. Architektur: ADR-114.

## Success Criteria

`[AWAITING RE]` -- Richtwert: ein Lauf, der die Warnschwelle ueberschreitet, pausiert und fragt den Nutzer (statt unbemerkt weiterzulaufen); ein Steering-Prompt wird vor der naechsten Iteration eingespeist; einfache Aufgaben (1-3 Iterationen) beruehren nie ein Limit.
