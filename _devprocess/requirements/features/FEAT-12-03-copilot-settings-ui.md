# Feature: Copilot Settings UI Integration

> **Feature ID**: FEAT-12-03
> **Epic**: EPIC-12 - GitHub Copilot LLM Provider Integration
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Integration von GitHub Copilot in die bestehende Settings UI. "GitHub Copilot (unofficial)" erscheint als Provider-Option im Dropdown der ModelConfigModal, analog zu OpenAI, Azure etc. Bei Auswahl werden copilot-spezifische Felder angezeigt: OAuth Connect/Disconnect Button, Verbindungsstatus und optionales Custom Client ID Feld. Disclaimers werden an relevanten Stellen eingeblendet.

## Benefits Hypothesis

**Wir glauben dass** eine nahtlose UI-Integration von Copilot als Provider im bestehenden Settings-Pattern
**Folgende messbare Outcomes liefert:**
- Nutzer finden und konfigurieren Copilot ohne Dokumentation
- Kein Lernaufwand -- gleiche UX wie bei anderen Providern

**Wir wissen dass wir erfolgreich sind wenn:**
- 95% der Nutzer den Auth-Flow beim ersten Versuch erfolgreich abschliessen
- Kein Support-Aufwand fuer "Wo finde ich GitHub Copilot?"

## User Stories

### Story 1: Provider entdecken
**Als** neuer Nutzer
**moechte ich** "GitHub Copilot" im Provider-Dropdown finden
**um** zu wissen dass Copilot-Integration verfuegbar ist

### Story 2: Verbindung herstellen
**Als** Nutzer der Copilot einrichten moechte
**moechte ich** einen "Connect with GitHub" Button sehen
**um** den Auth-Flow starten zu koennen

### Story 3: Verbindungsstatus pruefen
**Als** verbundener Nutzer
**moechte ich** den Status meiner Copilot-Verbindung sehen (Connected/Disconnected)
**um** zu wissen ob alles funktioniert

### Story 4: Disclaimer lesen
**Als** Nutzer
**moechte ich** einen klaren Hinweis sehen dass dies eine inoffizielle Integration ist
**um** informierte Entscheidungen zu treffen

### Story 5: Modell nach Auth auswaehlen
**Als** verbundener Nutzer
**moechte ich** nach erfolgreicher Auth mein Copilot-Modell auswaehlen koennen
**um** den gewuenschten AI-Dienst zu nutzen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Copilot ist als Provider-Option sichtbar neben bestehenden Providern | Im gleichen Dropdown/Ablauf | UI-Review |
| SC-02 | Gesamter Einrichtungs-Flow ist ohne Dokumentation abschliessbar | <3 Minuten End-to-End | User-Test |
| SC-03 | Verbindungsstatus ist auf einen Blick erkennbar | Visueller Indikator (Farbe/Icon) | UI-Review |
| SC-04 | Disclaimer ist sichtbar vor dem ersten Login | Nutzer sieht Hinweis bevor er autorisiert | User-Test |
| SC-05 | Bestehende Provider-UIs unveraendert | Kein visueller oder funktionaler Unterschied | Regressions-Test |
| SC-06 | Alle UI-Texte in Deutsch und Englisch verfuegbar | Sprachumschaltung getestet | I18n-Test |

---

## Technical NFRs (fuer Architekt)

### UI/UX
- **Provider Dropdown**: `github-copilot` als neue Option in `ProviderType`
- **Conditional Fields**: Bei Provider-Auswahl `github-copilot` statt API-Key-Feld → OAuth-Connect-Button + Status
- **Status-Anzeige**: Connected (gruen), Disconnected (grau), Pending (gelb)
- **Disclaimer**: Sichtbar im ModelConfigModal wenn Provider = github-copilot
- **Custom Client ID**: Collapsed/Advanced Section, optional

### I18n
- Alle neuen Strings in `en.ts`, `de.ts` (Pflicht) + `es.ts`, `ja.ts`, `zh-CN.ts` (best-effort)
- Keys: `provider.github-copilot`, `settings.copilot.*`, `copilot.auth.*`, `copilot.error.*`

### Consistency
- **PROVIDER_LABELS**: Eintrag fuer `github-copilot` hinzufuegen
- **PROVIDER_COLORS**: Passende Farbe (#000000 GitHub-Schwarz oder #6e40c9 GitHub-Lila)
- **MODEL_SUGGESTIONS**: Kein statischer Eintrag (dynamisches Listing via FEAT-12-05)

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**MODERATE ASR #1: ModelConfigModal Erweiterung**
- **Warum ASR**: Das Modal muss conditional rendering unterstuetzen: statt API-Key-Feld → OAuth-Section. Aendert den Flow des bestehenden UI-Codes.
- **Impact**: Modal-Logik wird komplexer, muss aber rueckwaertskompatibel bleiben
- **Quality Attribute**: Maintainability, UX Consistency

**MODERATE ASR #2: Provider-Typ Erweiterung**
- **Warum ASR**: `ProviderType` Union Type erweitern beeinflusst exhaustive switch-Statements im gesamten Codebase
- **Impact**: Alle switch/case ueber ProviderType muessen `github-copilot` behandeln
- **Quality Attribute**: Type Safety, Correctness

### Constraints
- **Review-Bot Compliance**: Kein `innerHTML`, keine `element.style.X = Y`, CSS-Klassen nutzen
- **Obsidian API**: DOM-Erstellung ueber `createEl`, `createDiv`, `setIcon`
- **Keine neue Tab**: Kein eigener Settings-Tab, Integration in bestehenden Models-Tab

### Open Questions fuer Architekt
- Soll der OAuth-Button direkt im ModelConfigModal erscheinen oder als separater Pre-Step?
- Wie wird der Modell-Name gesetzt wenn dynamisches Listing noch nicht geladen? Manuelles Textfeld als Fallback?

---

## Definition of Done

### Functional
- [ ] `github-copilot` im Provider-Dropdown der ModelConfigModal
- [ ] Bei Auswahl: OAuth-Connect-Button statt API-Key-Feld
- [ ] Status-Anzeige: Connected / Disconnected / Pending
- [ ] Disconnect-Button bei bestehender Verbindung
- [ ] Disclaimer-Banner sichtbar
- [ ] Custom Client ID Feld (optional, collapsed)
- [ ] Modell-Auswahl nach Auth (manuell oder via dynamisches Listing)
- [ ] Alle Strings i18n (EN + DE mindestens)

### Quality
- [ ] Kein visueller Regress bei anderen Providern
- [ ] Review-Bot Compliance (kein innerHTML, kein element.style)
- [ ] Responsive: funktioniert in verschiedenen Seitenleisten-Breiten

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-12-01**: Auth-Service muss existieren (fuer Connect/Disconnect)
- **FEAT-12-05**: Dynamisches Modell-Listing (optional, manuelle Eingabe als Fallback)
- **I18n System**: Bestehend, muss nur erweitert werden

## Assumptions

- ModelConfigModal kann mit conditional rendering erweitert werden ohne Refactoring
- Bestehende Provider-Felder (API Key, Base URL) bleiben unveraendert
- GitHub-Logo oder Copilot-Icon darf im UI verwendet werden (oeffentlich verfuegbar)

## Out of Scope

- Eigener "GitHub Copilot" Settings-Tab (Integration in bestehenden Models-Tab)
- Dark/Light Theme Anpassungen (nutzt bestehende Obsidian CSS Variables)
- Onboarding-Wizard-Integration (spaetere Erweiterung)
