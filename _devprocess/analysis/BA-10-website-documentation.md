# Business Analysis: Website-Dokumentation & Roadmap

> **Scope:** MVP
> **Erstellt:** 2026-04-01
> **Status:** Approved

---

## 1. Executive Summary

### 1.1 Problem Statement

Obsilo ist von einem Plugin mit ~30 Tools zu einem umfassenden AI Operating Layer mit 49+ Tools, Knowledge Layer, Multi-Provider, MCP Connector und Office Pipeline gewachsen. Die Website-Dokumentation bildet nur einen Bruchteil dieses Funktionsumfangs ab, ist feature-orientiert statt nutzer-orientiert strukturiert, und es gibt keinen Mechanismus damit Obsilo selbst Fragen zur eigenen Bedienung beantworten kann.

### 1.2 Proposed Solution

Drei parallele Dokumentations-Streams:
1. **User Guide** -- praxisnah, Persona-basiert, "Wie arbeite ich mit Obsilo?" statt Feature-Listen
2. **Developer/Architect Docs** -- technischer Deep-Dive, Portfolio-tauglich, Contributor-onboarding-faehig
3. **Roadmap & Versions-Log** -- zeigt Lieferfaehigkeit und Zukunftsvision auf der Homepage

Plus: Doku als Obsilo-Skill, damit der Agent User-Fragen zur Bedienung beantworten kann.

### 1.3 Expected Outcomes

- Neue User koennen Obsilo ohne externe Hilfe installieren, konfigurieren und produktiv nutzen
- Obsilo beantwortet Fragen zur eigenen Bedienung im Chat
- Engineers verstehen die Architektur gut genug fuer eine Contribution
- Roadmap vermittelt ein aktiv gepflegtes, ambitioniertes Projekt
- Die Doku macht Spass zu lesen (best-in-class Patterns, Stripe/Tailwind/Linear-Niveau)

---

## 2. Business Context

### 2.1 Background

Obsilo ist ein Open-Source Obsidian-Plugin das als AI Operating Layer fungiert. Es ist kein einfaches LLM-UI, sondern ein tief integrierter Assistent der den gesamten Obsidian-Workflow augmentiert und automatisiert -- von Note-Taking und Wissensmanagement ueber Zettelkasten-Methoden bis hin zu Office-Dokument-Erstellung und Plugin-Interaktion.

### 2.2 Current State ("As-Is")

**Website-Stack:** Static HTML (kein SSG), i18n via JSON-Locales (6 Sprachen), GitHub Pages, Custom CSS, Dark/Light Theme, Suchfunktion.

**User Guide (13 Seiten):**
- Getting Started, Chat Interface, Memory & Chat History, Modes, Permissions & Safety
- Rules/Skills/Workflows, Semantic Search
- Reference: Tools, Providers & Models, MCP Servers, Remote Access, Checkpoints, Settings Reference

**Dev Docs (11 Seiten):**
- Architecture Overview, Agent Loop, System Prompt, Tool System
- API Providers, Governance, MCP Client, Memory System, Mode System, Semantic Search Pipeline
- UI Architecture, VaultDNA

**Homepage:** Hero mit Typewriter-Demo, Feature-Badges, Developer-Section, About-Seite

**Probleme:**
- Feature-orientiert statt nutzer-orientiert (Persona: "Was kann ich damit machen?" nicht beantwortet)
- Grosse Luecken: Knowledge Layer, Copilot/Kilo Provider, MCP Server, Office Creation, Task Extraction, Chat-Linking, Onboarding -- alles nicht dokumentiert
- Hero-Zahlen veraltet ("49 tools")
- Kein Roadmap/Versions-Log
- Obsilo kennt die eigene Doku nicht (kein Skill/Rule)
- Raw HTML schwer wartbar bei wachsendem Content
- 6 Sprachen mit hohem Wartungsaufwand

### 2.3 Desired State ("To-Be")

**User Guide:**
- Praxisnaher, Persona-basierter Zugang: "Wie arbeite ich mit Obsilo?" statt Feature-Listen
- Kein User wird allein gelassen -- vom ersten Start bis zu fortgeschrittenen Workflows
- Vermittelt was Obsilo kann, ohne zu erschlagen
- Progressive Disclosure: Basics -> Intermediate -> Advanced
- Obsilo selbst kann Fragen zur Bedienung beantworten (Skill basierend auf der Doku)

**Developer Docs:**
- Technischer Deep-Dive fuer "curious engineers"
- Portfolio/Showcase fuer den Autor: zeigt Konzepte und Entscheidungen
- Contributor-onboarding-faehig (auch wenn aktuell keine Contributors geplant)
- Fuer Menschen geschrieben, nicht als API-Referenz

**Homepage:**
- Roadmap-Sektion mit groben Kategorien (implementiert / in Arbeit / geplant)
- Versions-Log ("v2.0: Knowledge Layer, v2.1: Copilot & Kilo, ...")
- Vermittelt: aktives Projekt, ambitionierte Vision, nachweisbare Lieferfaehigkeit

**Technisch:**
- Migration von raw HTML zu Static Site Generator (Markdown-Authoring)
- Hosting: GitHub Pages (kostenlos)
- Sprachen: EN + DE
- Doku-Source in Markdown = direkt als Obsilo-Skill konsumierbar

### 2.4 Gap Analysis

| Bereich | As-Is | To-Be | Gap |
|---------|-------|-------|-----|
| Content-Abdeckung | ~60% der Features dokumentiert | 100% | 15+ Seiten fehlen (Knowledge Layer, Office, Copilot/Kilo, MCP Server, Task Extraction, Chat-Linking) |
| Informationsarchitektur | Feature-orientiert (flat list) | Persona-basiert, progressive disclosure | Kompletter Umbau der Navigation + Content-Struktur |
| Agent-Awareness | Obsilo kennt Doku nicht | Obsilo beantwortet Fragen via Skill | Skill erstellen, Markdown als Source |
| Tech Stack | Raw HTML, 6 Sprachen | SSG (Markdown), EN + DE | Migration zu SSG, 4 Sprachen entfernen |
| Roadmap | Nicht vorhanden | Kategorien + Versions-Log auf Homepage | Neue Sektion + Daten-Pflege |
| Dev Docs | ~60% abgedeckt | 100% + Portfolio-Charakter | Knowledge Layer, Office Pipeline, Copilot/Kilo, MCP Server fehlen |
| DX/UX der Doku | Funktional, nicht inspirierend | Best-in-class (Stripe, Tailwind, Linear) | Design-Ueberarbeitung |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|-------------|------|----------|-----------|-------|
| Sebastian (Autor) | Maintainer, Entscheider | H | H | Portfolio-Showcase, User-Retention, wenig Wartungsaufwand |
| Non-Tech Obsidian User | Primaere Zielgruppe | H | M | Praxisnahe Anleitung, Quick Wins, kein Jargon |
| Curious Engineers | Sekundaere Zielgruppe | M | L | Technischer Deep-Dive, Architektur-Verstaendnis |
| Obsidian Community | Multiplikatoren | M | M | Vertrauen in Qualitaet und Aktivitaet des Projekts |

### 3.2 Key Stakeholders

**Primary:** Sebastian (Autor/Maintainer) -- Entscheidet ueber Scope, Prioritaeten, Design
**Secondary:** Non-Tech Obsidian User (groesste Zielgruppe), Curious Engineers

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: "Alex" -- der Obsidian Power User**
- **Rolle:** Knowledge Worker, nutzt Obsidian taeglich fuer Notizen, Projekte, Zettelkasten
- **Tech-Level:** Kann Plugins installieren, kennt Obsidian Settings, aber kein Entwickler
- **Ziele:** Obsilo als unsichtbaren Assistenten nutzen der Routinearbeit abnimmt
- **Pain Points:** Ueberwaeltigt von Feature-Listen, will wissen "was bringt mir das konkret?", braucht Quick Wins
- **Nutzungshaeufigkeit:** Daily
- **Typische Fragen:** "Wie fange ich an?", "Wie suche ich semantisch?", "Wie erstelle ich eine Praesentation aus meinen Notizen?", "Welches Modell soll ich nehmen?"

**Persona 2: "Jordan" -- der Curious Engineer**
- **Rolle:** Software-Entwickler oder Architekt, interessiert an AI-Agent-Systemen
- **Tech-Level:** Liest Code, versteht Architektur-Patterns, kennt LLM-APIs
- **Ziele:** Verstehen wie Obsilo unter der Haube funktioniert, ggf. eigene Projekte inspirieren
- **Pain Points:** Oberflaechliche Doku ohne Tiefe, keine Architektur-Entscheidungen erklaert
- **Nutzungshaeufigkeit:** Einmalig bis gelegentlich (Referenz)
- **Typische Fragen:** "Wie funktioniert der Agent Loop?", "Warum SQLite statt Vectra?", "Wie ist die Tool Pipeline aufgebaut?"

### 4.2 User Journey (High-Level)

**Alex (User Guide):**
```
1. Homepage -> "Get Started" (Installation, erstes Modell, erster Chat)
2. Grundlagen verstehen (Chat, Modes, Permissions)
3. Vault-Intelligence entdecken (Semantic Search, Memory, Knowledge Layer)
4. Fortgeschritten (Skills/Workflows, Office-Erstellung, MCP, Konnektoren)
5. Bei Fragen: Obsilo im Chat fragen ("Wie richte ich X ein?")
```

**Jordan (Dev Docs):**
```
1. Homepage -> "Architecture" (Ueberblick, Systemdiagramm)
2. Deep-Dive in interessante Bereiche (Agent Loop, Tool Pipeline, Knowledge Layer)
3. ADR-Kontext verstehen (Warum wurde so entschieden?)
4. Ggf. Code lesen (Referenz auf Key Files)
```

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Die aktuelle Dokumentation hat drei fundamentale Probleme:

1. **Content-Luecken:** ~40% der implementierten Features sind nicht dokumentiert (Knowledge Layer, Office Pipeline, Copilot/Kilo, MCP Server, Task Extraction, Chat-Linking)
2. **Falsche Perspektive:** Feature-orientiert ("Was hat Obsilo?") statt nutzer-orientiert ("Wie loese ich mein Problem?"). Ein Non-Tech User muss sich durch 13 technische Seiten arbeiten ohne klaren Einstieg.
3. **Kein Self-Service:** Obsilo kann keine Fragen zur eigenen Bedienung beantworten. User muessen die Website aufsuchen, obwohl der Agent direkt helfen koennte.

### 5.2 Root Causes

- Organisches Wachstum: Doku wurde feature-weise ergaenzt, nie holistisch geplant
- Raw HTML macht Aenderungen aufwaendig, daher wird weniger aktualisiert
- Kein Feedback-Loop: keine Metriken welche Seiten besucht/gesucht werden
- Doku war immer sekundaer zur Implementierung

### 5.3 Impact

- **User Impact:** Neue User scheitern an der Einrichtung oder nutzen nur einen Bruchteil der Faehigkeiten
- **Business Impact:** Geringere Adoption, weniger Community-Wachstum, schwaecher als Portfolio-Stueck

---

## 6. Goals & Objectives

### 6.1 Business Goals

- Obsilo als ernstzunehmendes, professionelles Open-Source-Projekt positionieren
- Portfolio-Wert fuer den Autor maximieren (technische Tiefe + Lieferfaehigkeit zeigen)
- Grundlage fuer Community-Wachstum schaffen (Richtung Community Plugin Release)

### 6.2 User Goals

- Non-Tech User koennen Obsilo selbststaendig einrichten und produktiv nutzen
- Fortgeschrittene User entdecken Features progressiv ohne ueberwaeltigt zu werden
- Engineers verstehen Architektur und Entscheidungen in angemessener Tiefe
- Obsilo beantwortet Bedienungsfragen direkt im Chat

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|-----|----------|--------|-----------|
| Feature-Abdeckung in User Docs | ~60% | 100% | MVP |
| Feature-Abdeckung in Dev Docs | ~60% | 100% | MVP |
| Sprachen | 6 (teilweise) | 2 (EN+DE, vollstaendig) | MVP |
| Obsilo beantwortet Doku-Fragen | 0% | >80% der gaengigen Fragen | MVP |
| Roadmap auf Homepage | nicht vorhanden | vorhanden mit Versions-Log | MVP |
| "Kann Obsilo ohne externe Hilfe einrichten" | unklar | Ja (Self-Test) | MVP |
| Spass beim Lesen (subjektiv) | funktional | best-in-class inspiriert | MVP |

---

## 7. Scope Definition

### 7.1 In Scope

**Stream 1: User Guide (Neustrukturierung + Content)**
- Migration zu SSG (Markdown-basiert, GitHub Pages)
- Persona-basierte Informationsarchitektur mit Progressive Disclosure
- Alle implementierten Features abgedeckt
- Praxisnahe Anleitungen statt Feature-Listen
- EN + DE

**Stream 2: Developer/Architect Docs (Update + Erweiterung)**
- Alle fehlenden Bereiche ergaenzen (Knowledge Layer, Office Pipeline, Copilot/Kilo, MCP Server)
- Portfolio-Charakter: Architektur-Entscheidungen erklaert, nicht nur beschrieben
- Contributor-onboarding-faehig

**Stream 3: Homepage (Roadmap + Versions-Log)**
- Roadmap-Sektion mit groben Kategorien und Status-Badges
- Versions-Log (Meilensteine pro Version)
- Hero-Section aktualisieren (Zahlen, Messaging)

**Stream 4: Obsilo Doku-Skill**
- Markdown-Doku als Skill fuer den Agent
- Obsilo kann Fragen zur eigenen Bedienung beantworten

### 7.2 Out of Scope

- Video-Content / Tutorials (evtl. spaeter ergaenzend)
- Community-Forum / Discord (erst bei Community-Plugin-Freigabe)
- Chatbot auf der Website (Token-Kosten ohne Nutzen)
- Detailliertes Changelog (Commit-Level)
- API-Dokumentation (Obsilo hat keine externe API)
- Mehr als 2 Sprachen

### 7.3 Assumptions

- GitHub Pages bleibt Hosting-Plattform
- SSG wird ausgewaehlt der static HTML generiert (kompatibel mit GitHub Pages)
- Bestehendes Design-System (CSS, Dark/Light Theme) wird migriert, nicht komplett neu gebaut
- Die interne _devprocess-Doku bleibt die Single Source of Truth, Website-Doku ist eine nutzerfokussierte Ableitung

### 7.4 Constraints

- Ein-Personen-Projekt: Wartungsaufwand muss minimal bleiben
- Kein Budget fuer Hosting (GitHub Pages, kostenlos)
- Doku-Content muss in zwei Formen nutzbar sein: Website + Obsilo-Skill (Markdown als gemeinsame Basis)
- Bestehendes URL-Schema sollte soweit moeglich erhalten bleiben (SEO, existierende Links)

---

## 8. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| SSG-Migration dauert laenger als geplant | M | M | Bestehende HTML-Seiten als Fallback, inkrementelle Migration |
| Content-Menge ueberwaeltigt (zu viele Seiten) | M | H | Progressive Disclosure konsequent umsetzen, "Getting Started" als roter Faden |
| Doku veraltet schnell wieder | H | H | Markdown als Source fuer Website + Skill, Backlog-Update-Pflicht bei Feature-Implementierung |
| Zwei Sprachen verdoppeln Aufwand | M | M | EN als Primary, DE als Second -- nicht 1:1 uebersetzen sondern priorisieren |
| User-Guide wird zu technisch geschrieben | M | H | Alex-Persona als Leitfigur, kein Jargon ohne Erklaerung, Peer-Review |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

**User Guide:**
- Installation & Quick Start (3 Minuten zum ersten Chat)
- "Wie arbeite ich mit Obsilo?" -- Grundkonzepte erklaert
- Feature-Bereiche mit Praxis-Beispielen (nicht Feature-Listen)
- Troubleshooting / FAQ
- Durchgaengige Navigation (Previous/Next, Sidebar, Suche)

**Dev Docs:**
- Architektur-Ueberblick mit Systemdiagramm
- Deep-Dives pro Subsystem (Agent Loop, Tool Pipeline, Knowledge Layer, etc.)
- ADR-Kontext (Warum wurde so entschieden?)
- Key-File-Referenzen

**Homepage:**
- Roadmap mit Kategorien: Done / In Progress / Planned
- Versions-Log mit Meilensteinen
- Aktualisierte Hero-Section

**Obsilo Doku-Skill:**
- Skill der die User-Guide-Inhalte als Kontext bereitstellt
- Obsilo kann "Wie richte ich X ein?" Fragen beantworten

### 9.2 Non-Functional Requirements (Summary)

- **Performance:** Seiten laden in <1s (static HTML, kein JS-Framework)
- **Accessibility:** Lesbar auf Mobile, Screen-Reader-kompatibel
- **Wartbarkeit:** Markdown-Authoring, eine Aenderung = ein File
- **Design:** Best-in-class Inspiration (Stripe Docs, Tailwind, Linear), Spass beim Lesen
- **SEO:** Sinnvolle Seitentitel, Meta-Descriptions, Clean URLs

### 9.3 Key Features (fuer RE)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | SSG-Migration | Markdown-basiert, GitHub Pages, EN+DE |
| P0 | User Guide Neustrukturierung | Persona-basiert, Progressive Disclosure, alle Features |
| P0 | Obsilo Doku-Skill | Agent beantwortet Bedienungsfragen |
| P1 | Dev Docs Update | Fehlende Bereiche ergaenzen, Portfolio-Charakter |
| P1 | Homepage Roadmap | Kategorien + Versions-Log |
| P1 | Hero-Section Update | Aktuelle Zahlen, Messaging |
| P2 | Design-Ueberarbeitung | Best-in-class Patterns, Animations, Code-Highlighting |
| P2 | DE Uebersetzung | User Guide + Dev Docs auf Deutsch |

---

## 10. Next Steps

- [x] Review durch Stakeholder
- [ ] Uebergabe an Requirements Engineer (`/requirements-engineering`)
- [ ] SSG-Auswahl (VitePress, Astro, Docusaurus -- Entscheidung in Architektur-Phase)
- [ ] Informationsarchitektur definieren (Seitenstruktur, Navigation)
- [ ] Content-Plan erstellen (welche Seiten, welche Reihenfolge)

---

## Appendix

### A. Glossar

- **SSG:** Static Site Generator -- generiert statische HTML-Seiten aus Markdown
- **Progressive Disclosure:** Informationen schrittweise enthuellen statt alles auf einmal
- **Doku-Skill:** Obsilo-interner Skill der Website-Doku-Inhalte als Kontext bereitstellt

### B. Interview Notes

- Scope: MVP (drei parallele Streams)
- Zielgruppen: Non-Tech Obsidian User (primaer), Curious Engineers (sekundaer)
- Obsilo ist generalistischer Assistent, kein Spezialtool -- Doku muss "Wie arbeite ich mit Obsilo?" vermitteln
- Dev Docs als Portfolio + Showcase, nicht als API-Referenz
- Roadmap: grobe Kategorien, zeigt Lieferfaehigkeit
- Versions-Log: Meilensteine pro Version
- Obsilo soll eigene Doku als Skill kennen (Stream 4)
- Hosting: GitHub Pages (kostenlos, Pflicht)
- Sprachen: EN + DE
- Design: best-in-class (Stripe, Tailwind, Linear als Vorbilder)
- Kein Video, kein Discord, kein Website-Chatbot, kein detailliertes Changelog
- Contributors nicht geplant, aber Doku soll onboarding-faehig sein

### C. Bestehende Website-Analyse

**User Guide Seiten (13):** getting-started, chat-interface, memory, modes, permissions, rules-skills-workflows, semantic-search, tools, providers, mcp-servers, remote-access, checkpoints, settings-reference

**Dev Docs Seiten (11):** architecture-overview, agent-loop, system-prompt, tool-system, api-providers, governance, mcp-client, memory-system, mode-system, semantic-search, ui-architecture, vault-dna

**Fehlend im User Guide:** Knowledge Layer (Graph, Implicit Connections, Reranking), Office Creation (PPTX/DOCX/XLSX), Copilot Provider, Kilo Gateway Provider, MCP Server/Connector, Task Extraction, Chat-Linking, Onboarding, Self-Development/Sandbox

**Fehlend in Dev Docs:** Knowledge Layer Architecture, Office Pipeline (PPTX Template Engine), Copilot/Kilo Auth Architecture, MCP Server Architecture, Task Extraction Pipeline, Self-Development Framework
