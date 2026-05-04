# Feature: User Guide -- Informationsarchitektur & Content

> **Feature ID**: FEAT-17-01
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P0-Critical
> **Effort Estimate**: L

## Feature Description

Komplette Neustrukturierung des User Guides von einer feature-orientierten Seitensammlung zu einer Persona-basierten, progressiv aufgebauten Anleitung. Der Guide beantwortet die Frage "Wie arbeite ich mit Obsilo?" statt "Was hat Obsilo?". Die Informationsarchitektur folgt dem Progressive-Disclosure-Prinzip: Basics -> Intermediate -> Advanced.

Alle implementierten Capabilities werden abgedeckt -- inkl. der aktuell fehlenden Bereiche (Knowledge Layer, Office-Erstellung, Copilot/Kilo Provider, MCP Connector, Task Extraction, Chat-Linking). Der Ton ist praxisnah, jargonfrei und verwendet konkrete Beispiele statt abstrakter Feature-Beschreibungen.

## Benefits Hypothesis

**Wir glauben dass** ein Persona-basierter User Guide mit Progressive Disclosure
**Folgende messbare Outcomes liefert:**
- Neue User koennen Obsilo ohne externe Hilfe einrichten und produktiv nutzen
- 100% der implementierten Features sind dokumentiert (vs. ~60% heute)

**Wir wissen dass wir erfolgreich sind wenn:**
- Ein neuer User Obsilo innerhalb von 3 Minuten zum ersten Chat bringt (Self-Test)
- Kein implementiertes Feature undokumentiert bleibt (Abgleich mit Backlog)
- Der Guide macht Spass zu lesen (subjektive Bewertung, best-in-class Anspruch)

## User Stories

### Story 1: Schnellstart
**Als** Obsidian-Nutzer der Obsilo zum ersten Mal installiert
**moechte ich** in wenigen Minuten einen funktionierenden Chat haben
**um** sofort den Mehrwert zu erleben statt mich durch Konfiguration zu kaempfen

### Story 2: Progressives Entdecken
**Als** Obsilo-Nutzer der die Grundlagen beherrscht
**moechte ich** schrittweise fortgeschrittene Features entdecken (z.B. Semantic Search, Skills, Office-Erstellung)
**um** meine Nutzung organisch auszubauen ohne ueberwaeltigt zu werden

### Story 3: Konkretes Problem loesen
**Als** Obsilo-Nutzer mit einer konkreten Frage ("Wie erstelle ich eine Praesentation?")
**moechte ich** die Antwort schnell finden (via Suche oder Navigation)
**um** nicht alle Seiten durchlesen zu muessen

### Story 4: Best Practices lernen
**Als** aktiver Obsilo-Nutzer
**moechte ich** Tipps fuer optimale Nutzung finden (Modell-Wahl, Skill-Erstellung, Workflow-Patterns)
**um** das Maximum aus dem Tool herauszuholen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Alle implementierten Capabilities sind dokumentiert | 100% Abdeckung | Abgleich Guide-Seiten gegen Backlog |
| SC-02 | Ein neuer User kann Obsilo selbststaendig einrichten | Erster Chat in unter 3 Minuten | Self-Test mit frischer Installation |
| SC-03 | Navigation fuehrt stufenweise von Basics zu Advanced | 3 Stufen erkennbar | Pruefung der Seitenstruktur |
| SC-04 | Konkrete Fragen sind ueber Suche oder Sidebar findbar | Top-10 User-Fragen fuehren zum Ziel | Manueller Suchtest |
| SC-05 | Kein technischer Jargon ohne Erklaerung | 0 unerklarte Fachbegriffe | Review gegen Alex-Persona |

---

## Technical NFRs (fuer Architekt)

### Content-Struktur
- Seitenstruktur in 4 Bereiche: Getting Started / Using Obsilo / Intelligence & Knowledge / Reference
- Jede Seite hat Breadcrumb, Previous/Next-Navigation, Sidebar
- Praxis-Beispiele statt abstrakter Beschreibungen

### Informationsarchitektur (Vorschlag)

**Getting Started (Basics)**
- Installation & Quick Start (3 Minuten zum ersten Chat)
- Dein erstes Gespraech (Chat-Grundlagen, Modes, Kontext)
- Modelle einrichten (Provider-Auswahl, Empfehlungen)

**Arbeiten mit Obsilo (Intermediate)**
- Chat-Interface (Attachments, @-Mentions, Tool-Picker, History)
- Vault-Operationen (Lesen, Schreiben, Suchen, Strukturieren)
- Wissen vernetzen (Semantic Search, Knowledge Graph, Implicit Connections)
- Erinnerung & Personalisierung (Memory, Onboarding, Chat-Linking)
- Sicherheit & Kontrolle (Permissions, Checkpoints, Approvals)

**Fortgeschritten (Advanced)**
- Skills, Rules & Workflows (eigene Verhaltensregeln, Automatisierungen)
- Office-Dokumente erstellen (PPTX, DOCX, XLSX aus dem Chat)
- Konnektoren (MCP Client, MCP Server, Remote Access)
- Multi-Agent & Sub-Tasks

**Referenz**
- Tools-Uebersicht (alle Tools tabellarisch)
- Provider-Referenz (alle Provider mit Setup-Anleitung)
- Settings-Referenz (alle Einstellungen erklaert)
- Troubleshooting & FAQ

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Progressive Disclosure in Navigation
- **Warum ASR**: Die Seitenstruktur bestimmt ob User den Guide als hilfreich oder ueberfordernd empfinden
- **Impact**: Sidebar-Design, Seitengruppierung, Verlinkung zwischen Seiten
- **Quality Attribute**: Usability

**MODERATE ASR #2**: Dual-Use Content (Website + Skill)
- **Warum ASR**: Dieselben Markdown-Inhalte muessen sowohl als Website-Seiten rendern als auch als Obsilo-Skill funktionieren
- **Impact**: Frontmatter-Schema, Content-Granularitaet, keine Website-spezifischen Elemente in Skill-Inhalten
- **Quality Attribute**: Wartbarkeit

### Open Questions fuer Architekt
- Wie granular werden die Seiten? (Eine Seite pro Tool vs. eine Seite "Vault-Operationen"?)
- Wie werden Praxis-Beispiele formatiert? (Callout-Boxen, Tabs, interaktive Demos?)

---

## Definition of Done

### Functional
- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria erfuellt (verifiziert)

### Quality
- [ ] Jede Seite gegen Alex-Persona geprueft (kein unerklarter Jargon)
- [ ] Navigation: Previous/Next, Sidebar, Breadcrumb, Suche funktionieren
- [ ] Mobile-Ansicht lesbar

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- **FEAT-17-00 (SSG-Migration)**: Grundgeruest muss stehen

## Assumptions
- Bestehender Content wird ueberarbeitet, nicht 1:1 uebernommen
- _devprocess/ Dokumente dienen als Referenz fuer technische Korrektheit

## Out of Scope
- DE-Uebersetzung (macht FEAT-17-07)
- Design-Ueberarbeitung (macht FEAT-17-06)
- Developer Docs (macht FEAT-17-03)
