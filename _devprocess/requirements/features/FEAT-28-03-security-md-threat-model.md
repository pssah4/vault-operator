---
id: FEAT-28-03
title: SECURITY.md threat model for plugin reviewer
epic: EPIC-28
priority: P0
date: 2026-05-16
related: AUDIT-027
adr-refs: []
plan-refs: []
depends-on: [FEAT-28-01, FEAT-28-02]
---

# FEAT-28-03: SECURITY.md threat model for plugin reviewer

## Description

Heute hat das Repository keine zentrale Security-Dokumentation, die ein Obsidian-Community-Maintainer in einem Review konsultieren koennte. Die Behavior-Findings des Scanners (Direct Filesystem Access, Shell Execution, Vault Enumeration, Clipboard Access, Dynamic Code Execution) sind durch Funktion gerechtfertigt, aber diese Rechtfertigung steht nirgends an einer einzigen Stelle. README hat seit v2.11.1 einen kurzen "Local capabilities"-Abschnitt, aber das ist Marketing-Sprache, kein Threat-Model.

FEAT-28-03 fuegt eine `SECURITY.md` im Repo-Root hinzu, geschrieben als Reviewer-Brief. Die Datei ist Englisch (oeffentliche Dokumentation), Markdown, und folgt einer fixen Struktur:

1. **Threat Model.** Wer ist der Angreifer (boesartiger LLM-Output, kompromittierte CDN-Library, kompromittierter MCP-Server, lokaler Angreifer mit Filesystem-Zugriff)? Was sind die Trust-Boundaries (Plugin <-> LLM, Plugin <-> Vault, Plugin <-> Sandbox, Plugin <-> MCP, Plugin <-> System)?

2. **Capability Disclosure.** Jede der 5 Scanner-Findings einzeln, mit:
   - Was die Capability ist
   - Welche Plugin-Features sie brauchen (mit Code-Verweis, Datei:Zeile)
   - Welche Mitigation greift (safeFs, spawn-Allowlist, AST-Validator, etc.)
   - Was der Worst-Case-Schaden bei Mitigation-Bypass waere

3. **Sandbox Architecture.** Detaillierte Beschreibung der zwei Sandbox-Tiers (iframe + Node `vm.runInNewContext`), AST-Allowlist, esm.sh-Integrity-Pinning, vault-Bridge-API. Eine Diagramm-Skizze in ASCII.

4. **Audit History.** Verweis auf AUDIT-027 und alle vorherigen `_devprocess/analysis/AUDIT-*`-Reports, mit Datum, Scope, Verdict. Sebastian ist der einzige Auditor heute; das wird ehrlich offengelegt.

5. **Reporting Vulnerabilities.** Standard-Boilerplate fuer Responsible Disclosure (E-Mail, PGP-Key falls vorhanden, Response-Time-Erwartung).

6. **Compliance Notes.** Liste der Obsidian-Community-Plugin-Bot-Findings mit Verweis auf die Mitigations in dieser Datei. Damit kann der Maintainer 1:1 abgleichen.

Die Datei wird im Public-Repo-Sync nicht gestrippt (gehoert zum oeffentlichen Repo) und ist deshalb auch im Plugin-Store-Verzeichnis sichtbar.

## Benefits Hypothesis

Ein Maintainer-Review fuer den Store-Listing-Antrag kann auf "lies SECURITY.md, pruefe safeFs.ts und spawnAllowlist.ts, dann entscheide" verkuerzt werden. Statt 16+ Call-Sites einzeln nachzuvollziehen, gibt es eine Reviewer-orientierte Erzaehlung, die jede Capability erklaert und auf den passenden Code verweist.

## User Stories

- **US-28-03-01 (P0 Maintainer):** Als Obsidian-Community-Reviewer moechte ich in unter 30 Minuten verstehen, was das Plugin technisch tut, welche Risiken es hat, und welche Mitigations existieren, damit ich nicht 60+ Source-Files lese.
- **US-28-03-02 (P1 Security-Researcher):** Als Sicherheitsforscher moechte ich wissen, wie ich Vulnerabilities verantwortungsvoll melde, damit ich nicht oeffentliche Issues aufmachen muss.
- **US-28-03-03 (P1 Power-User):** Als Power-User moechte ich verstehen, was das Plugin auf meinem System tun kann, damit ich eine informierte Trust-Entscheidung treffen kann.

## Success Criteria

1. `SECURITY.md` existiert im Repo-Root und wird im Public-Sync NICHT gestrippt.
2. Alle 5 Scanner-Behavior-Findings sind einzeln dokumentiert mit Code-Verweis und Mitigation.
3. Sandbox-Architektur ist mit ASCII-Diagramm dargestellt.
4. AUDIT-027 ist verlinkt (relativer Pfad ins Repo).
5. Die Datei ist Englisch.
6. Markdown-Lint passt zu README-Stil (keine Em-Dashes, Sentence-Case-Headings).
7. Lesbar in unter 30 Minuten (geschaetzte 2500 Worte max).

## Technical NFRs

- **Single-Source:** SECURITY.md ist die einzige Stelle, an der die volle Capability-Disclosure steht. README zeigt nur die Kurzform plus Link.
- **Aktualitaet:** bei jedem Release prueft der Release-Workflow, ob `SECURITY.md` einen Eintrag fuer die neue Version hat (manuell, kein Bot-Check).
- **Code-Verweise:** jede Capability-Behauptung hat einen Datei:Zeile-Link ins Repo. Tote Links werden im consistency-check geprueft (mode A).

## ASRs

- **ASR-01:** SECURITY.md verlinkt NUR auf Pfade die im Public-Sync NICHT gestrippt werden. Kein Link in `_devprocess/`, kein Link in `.claude/`, kein Link in `scripts/`. AUDIT-Reports werden entweder in einen oeffentlichen Ordner kopiert oder im Text inline zusammengefasst.

## Definition of Done

- [ ] `SECURITY.md` im Repo-Root erstellt
- [ ] Alle 5 Scanner-Findings dokumentiert
- [ ] Sandbox-Architektur mit ASCII-Diagramm
- [ ] AUDIT-027 zusammengefasst und verlinkt (oder Inline-Kopie wenn nicht oeffentlich)
- [ ] Reporting-Section mit E-Mail-Adresse
- [ ] Public-Sync-CI laesst `SECURITY.md` durch (kein `_devprocess`-Pfad)
- [ ] Im README "Local capabilities"-Abschnitt steht jetzt nur die Kurzform plus Link auf SECURITY.md

## Out-of-Scope

- PGP-Key fuer Disclosure (kann spaeter ergaenzt werden, blockt nicht das Listing)
- CVE-Registrierung
- Bug-Bounty-Programm
- Externe Audit-Firma beauftragen
