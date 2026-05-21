# Epic: Skills-Marketplace (GitHub-basiert)

> **Epic ID**: EPIC-31
> **Feature Prefix**: FEAT-31-XX
> **Business Alignment**: User-getrieben aus Session-Diskussion 2026-05-20.
> **Scope**: MVP (Skeleton-Epic, volle Specs folgen nach EPIC-30 Workflow-Builder)
> **depends-on**: [EPIC-29, EPIC-30]
> **Note**: Skeleton (Phase: Candidates)

## How-Might-We

How might we Vault-Operator-Skills aus einem kuratierten Community-Pool importieren und eigene Skills mit klarer MIT-Lizenz zur Community beisteuern, ohne ein eigenes Hosting-System zu bauen?

## Epic Hypothesis Statement

Fuer Power-User die Vault-Operator-Skills produktiv nutzen und mit anderen Usern Skills teilen oder von der Community profitieren wollen, verspricht EPIC-31 einen GitHub-basierten Skills-Marketplace. Der Marketplace lebt als oeffentliches Repo (z.B. `pssah4/vault-operator-skills`) und nutzt den nativen GitHub-PR-Workflow fuer Community-Submissions. Jeder Skill traegt eine MIT-Lizenz als Pflichtfeld. Das Plugin bietet eine Skills-Marketplace-Ansicht die das Repo durchsucht, Metadaten anzeigt und Installation per Klick anbietet. Zusaetzlich integriert das Plugin den Anthropic-Skills-Marketplace als Discovery-Link: User finden dort Skills, klicken "In Vault Operator importieren", und der Translator (FEAT-29-08) konvertiert sie auf Knopfdruck. Im Gegensatz zum heutigen Status (kein Sharing, kein Discovery) entsteht damit eine Community-Foundation, ohne dass wir ein eigenes Hosting bauen oder ein eigenes Auth-System wartet.

## Business Outcomes (messbar)

1. **Community-Submissions**: Mindestens 10 Community-Submissions pro Monat nach 6 Monaten Verfuegbarkeit.
2. **Import-Rate**: Mindestens 50% der aktiven User haben mindestens einen Skill aus dem Marketplace importiert.
3. **Anthropic-Bridge-Nutzung**: Mindestens 5 prominente Anthropic-Skills (pdf, pptx, docx, xlsx, json) sind ueber die Bridge in unter 2 Minuten User-Klick-zu-installiert.

## Feature-Skizze

| Feature ID | Name | Skizze |
|---|---|---|
| FEAT-31-01 | GitHub-Repo-Struktur und MIT-Lizenz-Policy | Repo-Layout, README, CONTRIBUTING-Doku, MIT-License-Pflicht im SKILL.md-Frontmatter (Anthropic erlaubt `license`-Optional-Feld), CI-Validator fuer License-Check |
| FEAT-31-02 | Skill-Marketplace-Import-UI im Plugin | Neue Settings-Section "Marketplace", Listet Repo-Inhalte, Klick-to-Install, Updates-Check |
| FEAT-31-03 | PR-Workflow und Skill-Validation-CI | GitHub-Actions: SKILL.md-Validation, Sandbox-Smoke-Test, License-Check, optional Test-Coverage-Hinweise |
| FEAT-31-04 | Anthropic-Marketplace-Bridge | Discovery-Link zum Anthropic-Repo, Klick-to-Translate via FEAT-29-08, vorausgewaehlte Top-Skills |
| FEAT-31-05 | Skill-Update-Notifications | Wenn ein installierter Skill im Marketplace eine neue Version hat, klare User-Notification mit Diff-Vorschau |

Volle FEAT-Specs werden in einer eigenen RE-Session nach Abschluss EPIC-29-Welle 2 geschrieben.

## Explicit Out-of-Scope

- Eigenes Auth-System fuer Marketplace-Logins. GitHub-Account reicht fuer Submissions.
- Bezahlte Skills oder Monetarisierung. Alles MIT.
- Eigenes Hosting (Server, CDN). GitHub-Pages und Repo-API reichen.
- Rating-System oder Reviews. Folge-Initiative.

## Dependencies

- **EPIC-29 (Skills-Konsolidierung)**: Skills muessen im Anthropic-konformen Format vorliegen, sonst macht Marketplace keinen Sinn.
- **EPIC-30 (Workflow-Builder)**: Marketplace bietet auch Workflows an, daher muss das Workflow-Format stabil sein bevor wir Sharing dafuer aufsetzen.
- **GitHub-Account beim User**: Optional fuer Browse, Pflicht fuer Submission.
- **FEAT-29-08 Skill-Translator**: notwendig fuer Anthropic-Bridge.

## Risks (Skizze)

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| MIT-Lizenz-Verstoesse durch unsorgfaeltige Submissions | M | M | CI-Check fuer License-Header in allen Files, plus Review im PR-Workflow |
| Marketplace-Repo wird verwaist (zu wenige Submissions) | M | M | Initiale Seed-Skills aus eigenem Bestand, Anthropic-Bridge fuellt die Luecke |
| Malware in Community-Skills | L | H | CI-Validator scannt nach verdaechtigen Patterns, Sandbox-Approval-Kette bleibt aktiv |

## Aktueller Status

Skeleton-Epic. Die vollen Specs (Feature-Beschreibungen, Success Criteria, Akzeptanzkriterien, NFRs, ASRs) werden in einer eigenen RE-Session erstellt, sobald EPIC-29 (Skills-Konsolidierung) und EPIC-30 (Workflow-Builder) deployed und stabil sind. Damit hat der Marketplace dann beide Asset-Typen (Skills und Workflows) zum Anbieten.
