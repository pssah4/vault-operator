---
id: FEAT-24-03
title: Tool-Output- & Kontext-Disziplin -- Externalizer im Hauptloop, Re-Read-Cap, Per-Tool-Caps, grosse User-Messages kappen
epic: EPIC-24
priority: P0
date: 2026-05-12
related: RESEARCH-36
adr-refs: [ADR-63]
plan-refs: []
depends-on: []
---

# FEAT-24-03: Tool-Output- & Kontext-Disziplin

## Description

ADR-63-Externalizer auch im allgemeinen ReAct-Loop wirksam machen (web_fetch/web_search/grosse read_file-Results/grosse Edit-Diffs); Re-Read einer externalisierten tmp-Datei selbst kappen + reichhaltigere kompakte Referenz + Prompt-Leitplanke; harte Per-Tool-Output-Caps als zweite Verteidigungslinie (Claude-Code-Vorbild); grosse reingepastete/@-mentionte User-Message-Inhalte beim Reinkommen kappen + externalisieren. Setzt ADR-63-Amendment um. Superseded FIX-18-02-01.

Quelle: RESEARCH-36 Befund C/E. Architektur: ADR-63 (Amendment 2026-05-12). Bug-Details: FIX-24-03-01, FIX-24-03-02.

## Success Criteria

`[AWAITING RE]` -- Richtwert: ein Recherche-Turn mit 3 web_fetch bleibt unter ~120k Input; eine User-Message mit angehaengtem Material ueberschreitet nie ~20k Tokens; ein externalisiertes Result, das der Agent zurueckliest, fuegt nicht den Volltext erneut in die History.
