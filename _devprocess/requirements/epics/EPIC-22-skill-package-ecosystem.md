# Epic: Skill-Package Ecosystem (Anthropic-kompatibel)

> **Epic ID**: EPIC-22
> **Business Alignment**: `_devprocess/analysis/BA-21-skill-package-ecosystem.md`
> **Scope**: Skill-Format + Distribution analog Anthropic Skills
> **Erstellt**: 2026-04-17

## Epic Hypothesis Statement

FUER Power-User die Obsilo's Skill-System kennen und Anthropic Claude-Skills genutzt haben
DIE aktuell kein Package-Format, keine Scripts-im-Skill und keine Multi-Rollen-Skills haben
IST EPIC-22
EIN Skill-Package-Format analog zu Anthropics offener Skill-Spec (`agentskills.io`) plus Obsilo-spezifischer Coordinator-Erweiterung
DAS Skills als Ordner mit SKILL.md + optionalen scripts/references/assets/ Subfolders speichert, `.skill`-Zip-Distribution anbietet, und Sub-Skill-Koordination zulaesst
IM GEGENSATZ ZUM Status quo wo Skills nur einzelne Markdown-Files sind, ohne Distribution und ohne Rollen-Orchestrierung
UNSERE LOESUNG macht Obsilo rueckwaerts-kompatibel zu bestehenden Single-File-Skills (v2.5.x), nimmt bestehende Anthropic-Skills-Zips an, und erweitert das Format um eine Coordinator-Rolle die in Claude-Land nicht existiert aber in Obsilos Agent-Loop sinnvoll ist.

## Business Outcomes (messbar)

1. **Skill-Sharing:** Anthropic-Skills aus dem offiziellen Repo (pdf, pptx, skill-creator etc.) koennen per Zip-Drop importiert und genutzt werden.
2. **Token-Effizienz:** Lange Skill-Referenzen landen in `references/`, werden nur bei Bedarf geladen. System-Prompt bleibt schlank.
3. **Modularitaet:** Scripts leben im Skill-Ordner statt inline im Markdown. Besser wartbar, versionierbar mit dem Skill.
4. **Rueckwaerts-Kompatibilitaet:** Alle bestehenden v2.5.x Single-File-Skills laufen unveraendert weiter.

## Leading Indicators

- Anzahl importierter `.skill` Zips pro Woche (via Analytics-Log)
- Skill-Ordner mit mehr als nur SKILL.md (Scripts, References)
- Coordinator-Skills die erfolgreich Sub-Rollen delegieren

## MVP Features

| Feature ID | Name | Typ | Priority | Effort | Status |
|------------|------|-----|----------|--------|--------|
| FEAT-22-01 | Skill-Folder-Struktur (SKILL.md + Subfolders) | Infra | P0 | M | Geplant |
| FEAT-22-02 | `.skill` Zip-Import | UI + Infra | P0 | S | Geplant |
| FEAT-22-03 | Scripts-im-Skill (Sandbox-Aufruf) | Feature | P1 | M | Geplant |
| FEAT-22-04 | Coordinator-Skill (Multi-Rolle in einem Ordner) | Feature | P1 | M | Geplant |

**Priority:** P0-Critical (Kern-Funktionalitaet fuer Anthropic-Kompatibilitaet), P1-High (Obsilo-spezifische Erweiterungen).

## Architektur-Beruehrungspunkte

- **ADR-75** (neu): Skill-Package-Architektur — Ordner-Layout, Loader-Umbau, Backward-Compat-Strategie, Security-Modell fuer Scripts.
- **ADR-09** (bestehend, Local Skills): weiter gueltig, EPIC-22 erweitert das Spektrum.
- **ADR-21** (Sandbox): bleibt Security-Wrapper fuer Skill-Scripts.

## Dependencies & Risks

### Dependencies

- **Sandbox-Executor funktioniert zuverlaessig** (aktuell: ja). Scripts laufen nur ueber `evaluate_expression`.
- **FEAT-05-07 Konfigurierbarer Agent-Folder** (released v2.5.x): Skills-Verzeichnis ist jetzt `<agent-folder>/skills/`.

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Script-Ausfuehrung ohne Approval fuehrt zu Datenverlust | L | H | Zwinge bestehende Sandbox-Approval-Kette, kein Auto-Run |
| Zip-Bomb / Path-Traversal im Import | M | M | Whitelist-Extraktion (nur SKILL.md, scripts/, references/, assets/), Pfad-Normalisierung, Groessenlimit |
| Loader-Refaktor bricht bestehende Skills | M | H | Klarer Test-Plan: alle 9 bundled-skills muessen nach Umbau gruen sein |
| Coordinator-Pattern ist ueber Anthropic-Spec hinaus, fuehrt zu divergenter Konvention | M | L | Explizite Markierung in SKILL.md: `type: coordinator` (Obsilo-only), Dokumentation macht klar dass das eine Erweiterung ist |

## Out of Scope

- Eigener Online-Skill-Registry
- Signatur-Verifikation (Scripts werden rein durch Sandbox-Approval geschuetzt)
- Claude-API `/v1/skills` Endpoint-Integration
- Automatische Skill-Updates aus externen Quellen

## Erfolgskriterien (Epic)

| ID | Kriterium | Messung |
|----|-----------|---------|
| EPIC022-SC-01 | `.skill` Zip aus Anthropic-Repo laedt und funktioniert | Manueller Test |
| EPIC022-SC-02 | Bundled Skills nach Umbau alle gruen (keine Regression) | 9/9 in smoke-test-Vault |
| EPIC022-SC-03 | Coordinator-Skill mit 2 Sub-Rollen orchestriert korrekt | Manueller Test |
| EPIC022-SC-04 | References werden nur on-demand geladen (Token-Budget) | Token-Messung |
