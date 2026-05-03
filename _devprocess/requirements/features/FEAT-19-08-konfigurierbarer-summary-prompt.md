# Feature: Konfigurierbarer Standard-Prompt fuer Note-Summary-Generierung

> **Feature ID**: FEAT-19-08
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 7.2 Retrieval
> **Priority**: P0
> **Effort Estimate**: S

## Feature Description

Sebastians vorgegebener Standard-Prompt (1 Satz deutsch, max 25 Woerter, plus 5-10 Keywords, plus 2-3 Themen, plus 2-3 Konzepte) wird als Default-Wert in die Settings hinterlegt und ist vom User editierbar. Der Prompt steuert FEAT-19-09 (Auto-Summary-Generierung).

Settings-Pfad: `vaultIngest.summaryPrompt.template` (Multi-Line String). Plus Companion-Settings: `vaultIngest.summaryPrompt.modelOverride` (optional eigenes Modell statt Default-LLM).

## Benefits Hypothesis

Wir glauben, dass ein konfigurierbarer Prompt es jedem User ermoeglicht, sein Vault-Schema beizubehalten ohne dass das System es vorgibt. Folgende messbare Outcomes liefert: Sebastian behaelt seinen exakten Wortlaut, andere User passen den Prompt an ihre Frontmatter-Konventionen an, ohne dass das System eine Schema-Annahme erzwingt.

Wir wissen, dass wir erfolgreich sind, wenn > 90% der generierten Summaries dem im Settings konfigurierten Format entsprechen.

## User Stories

**Story 1:** Als Sebastian moechte ich, dass mein bisheriger manueller Prompt 1:1 als Settings-Default erscheint, um keine Pflege-Standards zu verlieren.

**Story 2:** Als anderer User moechte ich den Default-Prompt nach meinem Vault-Schema editieren koennen, um zB englische Summaries oder andere Frontmatter-Felder zu generieren.

**Story 3:** Als Power-User moechte ich pro Vault einen eigenen Prompt definieren koennen, weil mein Forschungs-Vault andere Konventionen hat als mein persoenlicher Vault.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Default-Prompt entspricht Sebastians vorgegebenem Wortlaut | 100% Wortlaut-Match | Manueller Vergleich |
| SC-02 | User kann Prompt editieren ohne Plugin-Reload | Aenderung wirkt auf naechste Generierung | Manueller Test |
| SC-03 | Prompt-Edits werden persistiert | Ueberlebt Plugin-Restart | Integration-Test |
| SC-04 | Prompt-Validation verhindert kaputte Templates | Schema-Pruefung beim Speichern | Unit-Test |
| SC-05 | Settings-UI zeigt Default-Wert plus Edit-Moeglichkeit | UI-Test bestanden | Manueller Test |

## Technical NFRs

- **Performance:** Settings-Lookup < 10ms.
- **Storage:** Plugin-Settings (existing `data.json`-Struktur).
- **i18n:** Default-Prompt deutsch, kein Auto-Translate.
- **Validation:** mindestens "leer" vs "nicht leer" pruefen, optional Marker-Validation.

## Definition of Done

- Settings-Schema-Eintrag plus Default-Wert.
- Settings-UI mit Multi-Line-Textarea plus "Reset to Default"-Button.
- Validation beim Save.
- Test mit Sebastians Original-Prompt.
- Anhang B in BA-25 als Default uebernommen (1:1 woertlich).
