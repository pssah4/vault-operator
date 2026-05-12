# Feature: SSG-Migration & Grundgeruest

> **Feature ID**: FEAT-17-00
> **Epic**: EPIC-17 - Website-Dokumentation
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Migration der bestehenden Website von raw HTML zu einem Static Site Generator (SSG) mit Markdown-Authoring. Das SSG generiert statische HTML-Seiten die auf GitHub Pages gehostet werden. Die Migration schafft die technische Grundlage fuer alle weiteren Content-Arbeiten und ermoeglicht gleichzeitig die Nutzung der Markdown-Quellen als Vault Operator-Skill.

Das bestehende Design-System (Dark/Light Theme, CSS-Variablen, responsive Layout) wird migriert, nicht neu gebaut. Die Seitenstruktur wird an die neue Informationsarchitektur angepasst (User Guide / Dev Docs / Homepage als getrennte Bereiche).

## Benefits Hypothesis

**Wir glauben dass** eine Markdown-basierte Website mit SSG
**Folgende messbare Outcomes liefert:**
- Content-Aenderungen dauern Minuten statt Stunden (kein HTML-Editing mehr)
- Markdown-Dateien dienen als Dual-Use: Website + Vault Operator-Skill

**Wir wissen dass wir erfolgreich sind wenn:**
- Alle bestehenden Seiten im neuen System erreichbar sind
- Neue Seiten durch Anlegen einer Markdown-Datei entstehen koennen
- Build + Deploy auf GitHub Pages funktioniert

## User Stories

### Story 1: Autor aktualisiert Doku
**Als** Maintainer
**moechte ich** eine Seite durch Bearbeiten einer Markdown-Datei aktualisieren
**um** Content-Aenderungen in Minuten statt Stunden umzusetzen

### Story 2: Besucher findet bestehende Seiten
**Als** Besucher der Website
**moechte ich** alle bisherigen Inhalte weiterhin unter funktionierenden URLs finden
**um** nicht auf toten Links zu landen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Bestehende Seiten sind im neuen System erreichbar | 100% der bisherigen URLs | URL-Pruefung gegen bestehende Sitemap |
| SC-02 | Neue Seiten werden durch Erstellen eines Dokuments angelegt | Eine Datei = eine Seite | Manueller Test |
| SC-03 | Website laeuft auf GitHub Pages ohne Kosten | Kostenloses Hosting | Deploy-Test |
| SC-04 | Dark/Light Theme funktioniert wie bisher | Visuell identisch | Manueller Vergleich |
| SC-05 | Suche funktioniert ueber alle Seiten | Stichwort findet relevante Seiten | Manueller Test |

---

## Technical NFRs (fuer Architekt)

### Performance
- Build-Zeit unter 30 Sekunden
- Seiten-Ladezeit unter 1 Sekunde (static HTML, kein JS-Framework-Overhead)

### Wartbarkeit
- Markdown als Single Source, kein duplizierter Content
- Sidebar-Navigation automatisch aus Dateistruktur generiert
- i18n-Unterstuetzung fuer EN + DE

### Kompatibilitaet
- Bestehende URL-Pfade erhalten (Redirects wo noetig)
- GitHub Pages kompatibel (Static Output)

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: SSG-Auswahl
- **Warum ASR**: Bestimmt den gesamten Authoring-Workflow, Build-Pipeline und Feature-Set
- **Impact**: Betrifft alle nachfolgenden Features (Navigation, Suche, i18n, Design)
- **Quality Attribute**: Wartbarkeit, Developer Experience

**MODERATE ASR #2**: Dual-Use Markdown (Website + Skill)
- **Warum ASR**: Markdown muss sowohl als SSG-Input (mit Frontmatter) als auch als Vault Operator-Skill (plain Markdown) funktionieren
- **Impact**: Content-Struktur, Frontmatter-Schema
- **Quality Attribute**: Wartbarkeit

### Open Questions fuer Architekt
- VitePress vs Astro vs Docusaurus -- welcher SSG passt am besten (i18n, GitHub Pages, Markdown-First)?
- Wie werden Redirects fuer bestehende URLs umgesetzt?
- Wie wird das Markdown fuer den Vault Operator-Skill extrahiert (Build-Step oder Symlink)?

---

## Definition of Done

### Functional
- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria erfuellt (verifiziert)

### Quality
- [ ] Build + Deploy auf GitHub Pages erfolgreich
- [ ] Alle bestehenden URLs erreichbar oder redirected
- [ ] Mobile-Ansicht funktioniert

### Documentation
- [ ] Feature-Spec aktualisiert (Status: Implemented)
- [ ] Backlog aktualisiert

---

## Dependencies
- Keine (Grundlage fuer alle weiteren Features)

## Assumptions
- GitHub Pages bleibt Hosting-Plattform
- Bestehendes CSS wird migriert, nicht neu geschrieben

## Out of Scope
- Content-Erstellung (macht FEAT-17-01/1703)
- Design-Ueberarbeitung (macht FEAT-17-06)
- DE-Uebersetzung (macht FEAT-17-07)
