# Feature: Template-Analyzer Web-Frontend (pssah4.github.io/vault-operator)

> **Feature ID**: FEAT-11-13
> **Epic**: EPIC-11 - Office Document Quality
> **Priority**: P1-High
> **Effort Estimate**: M (3-5 Tage)
> **Note**: **DEPRECATED** -- Web-Frontend nie implementiert, Analyse lokal im Plugin

## Feature Description

Statische Web-Seite auf pssah4.github.io/vault-operator (GitHub Pages) die als Frontend fuer den multimodalen Template-Analyzer (FEAT-11-12) dient. User laden ihre PPTX-Vorlage hoch, geben ihren Anthropic API Key ein und erhalten ein Visual Design Language Document zum Download.

Kein Backend auf pssah4.github.io/vault-operator noetig -- die Seite kommuniziert direkt mit dem Cloud Run Service. API Key wird nur im Browser gehalten und direkt an den Service weitergegeben.

## Benefits Hypothesis

**Wir glauben dass** ein Web-Frontend auf pssah4.github.io/vault-operator
**Folgende messbare Outcomes liefert:**
- Niedrige Einstiegshuerde: Browser oeffnen, hochladen, fertig
- Kein Plugin-Update noetig fuer Analyse-Verbesserungen
- Sichtbare Marke: pssah4.github.io/vault-operator als Anlaufstelle fuer Template-Analyse

**Wir wissen dass wir erfolgreich sind wenn:**
- User kann in unter 5 Minuten von Upload bis zum fertigen Skill kommen
- Fortschrittsanzeige zeigt den aktuellen Analyse-Schritt
- Download-Button liefert korrekte SKILL.md
- Seite funktioniert auf Desktop und Tablet

## User Stories

### Story 1: Template analysieren
**Als** Vault Operator-User
**moechte ich** mein Template auf einer Web-Seite hochladen und analysieren lassen
**um** den generierten Skill in Vault Operator importieren zu koennen

### Story 2: Ergebnis ueberpruefen
**Als** Berater
**moechte ich** das Analyse-Ergebnis vor dem Download sehen
**um** die Qualitaet beurteilen zu koennen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Gesamter Workflow abgeschlossen in akzeptabler Zeit | Unter 5 Minuten von Upload bis Download | Zeitmessung |
| SC-02 | Fortschritt ist sichtbar waehrend der Analyse | Nutzer sieht aktuellen Schritt | Beobachtbar |
| SC-03 | Ergebnis kann vor dem Download eingesehen werden | Vorschau im Browser | Funktionstest |
| SC-04 | Ergebnis kann heruntergeladen und importiert werden | SKILL.md korrekt formatiert | Import-Test in Vault Operator |
| SC-05 | Seite ist zugaenglich und bedienbar | Desktop + Tablet, keine Huerden | Manueller Test |
| SC-06 | Eingaben des Nutzers (insb. Schluessel) werden nicht gespeichert | Kein Storage, kein Tracking | Code-Review |

---

## Technical NFRs (fuer Architekt)

### Hosting
- **Plattform**: GitHub Pages (bestehende pssah4.github.io/vault-operator Infrastruktur)
- **Deployment**: Automatisch bei Push auf main (bestehende Pipeline)
- **Kosten**: $0

### Security
- **API Key Handling**: Nur im Browser-Memory, wird als HTTP Header an Cloud Run gesendet, nie in localStorage/sessionStorage
- **Kein Tracking**: Keine Analytics, keine Cookies, kein User-Tracking
- **HTTPS**: Erzwungen (GitHub Pages Standard)

### UX
- **Responsive**: Desktop + Tablet (Mobile nicht prioritaer -- PPTX-Upload)
- **Accessibility**: Semantisches HTML, Keyboard-Navigation, ARIA-Labels
- **Browser-Support**: Chrome, Firefox, Safari (aktuelle Versionen)

---

## Seitenstruktur

```
pssah4.github.io/vault-operator/template-analyzer

┌──────────────────────────────────────────────┐
│  Vault Operator Template Analyzer                      │
│                                                │
│  [Drag-and-Drop Upload Zone]                   │
│  "Drop your .pptx template here"               │
│                                                │
│  [API Key Input (password field)]              │
│  "Your Anthropic API key (never stored)"       │
│                                                │
│  [Analyze Button]                              │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ Progress:                                │  │
│  │ ✓ Parsing shapes...                      │  │
│  │ ✓ Rendering slides...                    │  │
│  │ → Analyzing design...                    │  │
│  │ ○ Generating skill...                    │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │ Markdown Preview                         │  │
│  │ # Template-Name -- Visual Design...      │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  [Download SKILL.md]                           │
│                                                │
│  How to import: Settings > Skills > Import     │
└──────────────────────────────────────────────┘
```

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1: Kein API Key Leaking**
- **Warum ASR**: API Key darf nur an Cloud Run Service gesendet werden, nie an Dritte, nie persistiert.
- **Impact**: Kein Analytics-Script, kein CDN das Headers mitlesen koennte, direkter Fetch an Cloud Run.
- **Quality Attribute**: Security

### Constraints
- **Statische Seite**: Kein Server-Side-Code, nur HTML/CSS/JS
- **Bestehendes Design**: Konsistent mit restlicher pssah4.github.io/vault-operator Seite
- **Keine Dependencies**: Vanilla JS oder minimale Build-Chain (kein React/Vue fuer eine Seite)

### Open Questions fuer Architekt
- Soll die Seite in die bestehende Jekyll-Site integriert werden oder als standalone HTML?
- Soll ein Service-Worker fuer Offline-Hinweis sorgen?

---

## Definition of Done

### Functional
- [ ] Drag-and-Drop PPTX Upload funktional
- [ ] API Key Input (password-Feld, nie gespeichert)
- [ ] Analyze-Button sendet Request an Cloud Run Service
- [ ] Fortschrittsanzeige zeigt Analyse-Schritte
- [ ] Markdown-Vorschau des Ergebnisses
- [ ] Download-Button fuer SKILL.md
- [ ] Anleitung zum Import in Vault Operator

### Quality
- [ ] Responsive (Desktop + Tablet)
- [ ] Accessible (Keyboard-Navigation, ARIA)
- [ ] Kein API Key Leaking (Code-Review)
- [ ] Error Handling: Netzwerk-Fehler, ungueltige Dateien, API-Fehler
- [ ] Konsistent mit pssah4.github.io/vault-operator Design

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies

- **FEAT-11-12**: Cloud Run Backend (muss POST /analyze Endpoint bereitstellen)
- **pssah4.github.io/vault-operator**: Bestehende GitHub Pages Site
- **CORS**: Cloud Run muss pssah4.github.io/vault-operator Origin erlauben

## Out of Scope

- Mobile-optimiertes Design (PPTX-Upload auf Phone nicht realistisch)
- Multi-Template-Analyse
- Skill-Editor im Browser
- User-Accounts oder gespeicherte Ergebnisse
- Template-Vorschau vor der Analyse
