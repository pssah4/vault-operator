---
id: EPIC-28
title: Plugin Hardening and Listing Compliance
date: 2026-05-16
related: BA-28
predecessor: AUDIT-027
github-issue:
---

# EPIC-28: Plugin Hardening and Listing Compliance

## Hypothesis Statement

Vault Operator ist als BRAT-pre-release-Plugin etabliert und wird via Sideload verteilt. Der naechste Schritt in den offiziellen Obsidian-Community-Store erfordert, dass das Plugin im manuellen Maintainer-Review keinen Grund zur Rueckfrage liefert. Der Obsidian Community Plugin Scanner meldet aktuell (v2.11.0) fuenf Behavior-Findings: zwei Warnings (Direct Filesystem Access via `fs`, Shell Execution via `child_process`) und drei Recommendations (Vault Enumeration, Clipboard Access, Dynamic Code Execution). Alle fuenf sind Klassifikationen auf Capability-Ebene, die direkt mit Kernfeatures verdrahtet sind (KnowledgeDB, Office-Pipeline, Sandbox, Semantic Index, Checkpoints, MCP-stdio). Sie sind nicht entfernbar ohne massiven Funktions-Verlust.

EPIC-28 verfolgt deshalb **Weg C** aus der strategischen Analyse vom 2026-05-16: das Plugin behaelt vollen Funktionsumfang, akzeptiert den manuellen Review-Track, und macht den Review fuer den Maintainer auditierbar und reibungslos. Konkret werden zwei zentrale Sicherheits-Wrapper eingefuehrt (safeFs, spawn-Allowlist), die jede `fs`- und `child_process`-Nutzung durch eine pruefbare Schicht zwingen, plus eine `SECURITY.md` mit vollstaendigem Threat-Model im Repo-Root als Reviewer-Brief.

Damit erreichen wir, dass jede `fs`-Operation gegen eine Path-Allowlist (Vault + Plugin-Daten + System-Temp) gefiltert ist, jede `spawn`-Operation gegen eine Binary-Allowlist (node, git, soffice, cloudflared), und der Maintainer eine einzige Datei mit Threat-Model, Audit-Verweisen und Architektur-Erlaeuterung lesen kann statt 16+ Call-Sites einzeln nachzuvollziehen.

## How might we

Wie koennen wir den Obsidian-Community-Plugin-Store-Review so vorbereiten, dass ein Maintainer in unter 30 Minuten verifizieren kann, dass Vault Operator trotz `fs`-/`child_process`-Nutzung weder ueber den Vault hinaus schreibt noch beliebige Binaries spawnt, ohne Plugin-Funktionalitaet zu beschneiden?

## Business Outcomes

- **OUT-01:** Der Obsidian Community Plugin Scanner zeigt nach EPIC-28 keinen Capability-Finding mehr, der nicht in `SECURITY.md` mit Code-Verweis und Mitigation begruendet ist. Gemessen durch erneuten Scanner-Run.
- **OUT-02:** Anzahl der Reviewer-Rueckfragen bei einer hypothetischen Store-Einreichung sinkt auf 0-2 (vs. erfahrungsmaessig 5-8 bei vergleichbar gelagerten AI-Agent-Plugins ohne Threat-Model). Geschaetzt anhand veroeffentlichter PR-Diskussionen aehnlicher Plugins.
- **OUT-03:** Jede `fs.*`- oder `child_process.spawn`-Operation im Plugin-Bundle laeuft ueber einen der zwei zentralen Wrapper. Gemessen durch grep im Source.
- **OUT-04:** Pfad-Traversal-Angriffe (`..`-Sequenzen, absolute Pfade ausserhalb der Allowlist) werfen in jedem fs-Call. Gemessen via Test-Suite.
- **OUT-05:** Versuche, ein nicht-allowlisted Binary zu spawnen, werfen mit eindeutiger Fehlermeldung. Gemessen via Test-Suite.

## Features

### Welle 1: Zentrale Wrapper (P0)

| ID | Title | Wert |
|----|-------|------|
| FEAT-28-01 | safeFs Wrapper mit Path-Allowlist | Macht jeden fs-Zugriff verifizierbar |
| FEAT-28-02 | spawn-Allowlist mit fester Binary-Liste | Macht jeden Process-Spawn verifizierbar |

### Welle 2: Disclosure (P0)

| ID | Title | Wert |
|----|-------|------|
| FEAT-28-03 | SECURITY.md Threat-Model im Repo-Root | Maintainer-Brief, single source of truth |

### Welle 3 (P2, optional): Sandbox-Worker Hardening

Aktuell nur als Notizen, nicht im aktiven Backlog. Wird abhaengig von Welle 1+2 Erkenntnissen aktiviert.

## Critical Hypotheses

- **CRIT-01:** Es gibt keine LLM-direkte Bahn zu `fs.*` oder `child_process.spawn`. Validiert via Audit am 2026-05-16 (siehe AUDIT-027-followup).
- **CRIT-02:** Eine zentrale safeFs-Schicht laesst sich ohne Performance-Regression einfuehren (Pfad-Pruefung ist O(1), passiert pro Call).
- **CRIT-03:** Der Obsidian-Plugin-Scanner unterscheidet nicht zwischen gewrappten und direkten fs-Aufrufen. Disclosure plus Wrapper sind beide noetig, der Wrapper allein eliminiert das Finding nicht. Die Findings bleiben, aber sie sind im manuellen Review erklaerbar.

## Non-Goals

- Sandbox-Worker selbst in einem Container/seccomp-Jail laufen lassen (Electron-Limit)
- Companion-App-Auslagerung (separat als Companion-Analyse-Dokument)
- Sandbox-Funktionalitaet einschraenken (kein npm-CDN-Verbot, kein evaluate_expression-Verbot)
- Office-Pipeline entfernen
- Lite-Build-Variante ohne Power-Features

## Out-of-Scope (Welle 3 und spaeter)

- Process-Sandbox-Hardening (Worker-Args, Worker-CWD, Worker-ENV)
- safeFs-Pfad-Whitelist runtime-konfigurierbar machen
- Telemetry-Counter fuer Allowlist-Verstoesse
