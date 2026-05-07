---
name: BA-23 Mobile Support
description: Business Analysis fuer Mobile-Companion-Mode von Obsilo. Zettelkasten-konforme Capture-und-Pre-Wire-Unterstuetzung auf iOS/Android mit Desktop-synchronisiertem Read-only-Index.
status: Draft
scope: MVP
created: 2026-04-23
created-by: /business-analysis
epic: EPIC-23 (proposed)
---

# Business Analysis: Mobile Support fuer Obsilo

> **Scope:** MVP
> **Created:** 2026-04-23
> **Status:** Draft (in Review mit Sebastian)
> **Epic-Zuordnung:** EPIC-23 (neu, noch nicht angelegt)

---

## 1. Executive Summary

### 1.1 Problem Statement

Obsilo laeuft in v2.6.0 ausschliesslich auf Desktop (`manifest.json:
isDesktopOnly: true`). Der Obsilo-Besitzer und die bestehende Community
betreiben ihre Zettelkaesten aber nicht nur am Schreibtisch. Ideen,
Scans, Fotos, Sprachnotizen und Web-Clips fallen unterwegs an und
bleiben bis zum naechsten Desktop-Fenster unverarbeitet. Die
Codebase enthaelt 22 HARD_BLOCKER, 15 SOFT_BLOCKER und 8 DEGRADED-
Stellen, die eine unveraenderte Mobile-Nutzung verhindern.

### 1.2 How-Might-We Question

> **How might we** einem Zettelkasten-basierten Wissensarbeiter
> **ermoeglichen, unterwegs erfasste Inhalte mit Agent-Unterstuetzung
> vorzustrukturieren** (Metadaten, Zusammenfassungen, Verlinkung auf
> bestehende Notes, Base-Einordnung), **obwohl** Obsidian Mobile
> weder Node.js noch nativen Filesystem-Zugriff erlaubt und die
> Indexierung auf Mobile zu ressourcenintensiv waere?

### 1.3 Value Proposition (Solution Hypothesis)

Obsilo Mobile wird **Companion-Modus** statt Full-Parity-Clone. Der
Agent arbeitet mobil als Capture- und Pre-Wire-Assistent mit Zugriff
auf den am Desktop erzeugten Vektor-Index. Er nimmt Sprach-, Text-,
Scan- und Foto-Inputs entgegen, schlaegt Metadaten und Links vor,
erstellt Inbox-Notes und lehnt die Vollintegration in den
Zettelkasten ab. Diese passiert weiter am Desktop.

### 1.4 High-Level Concept

> "Dein Zettelkasten-Concierge unterwegs: er nimmt Ideen auf, legt
> sie strukturiert ab und bereitet sie fuer die Desktop-Verzettelung
> vor."

Analogie: Das Mobile-Notebook eines Research-Assistenten, nicht der
komplette Schreibtisch.

### 1.5 Expected Outcomes

- Sebastian kann mobile Inputs (Voice, Scan, Web-Clip) innerhalb
  von Minuten als strukturierte Inbox-Note ablegen.
- Der Agent zieht beim Mobile-Capture automatisch Links auf
  bestehende Vault-Notes aus dem konsumierten Index.
- MCP, RAG-Zugriff, Base-Erstellung, Brainstorming mit Agent
  funktionieren mobil.
- Canvas, Excalidraw, Checkpoints, Plugin-Self-Modification bleiben
  als Out-of-Scope markiert und liefern auf Mobile klare
  "Desktop-only"-Hinweise statt Crashes.
- Die Desktop-Installation bleibt unveraendert, der Desktop schreibt
  den Index einmalig in den Vault, Obsidian Sync transportiert ihn.

---

## 2. Business Context

### 2.1 Background

Obsilo ist seit v2.6.0 released (2026-04-19), AUDIT-012 GREEN, alle
Phasen A-F abgeschlossen. 22 Epics, 151 FEATUREs, 49 Tools. Die
Obsidian-Community-Waves 1 und 4 haben Mobile bislang nicht
priorisiert und keine expliziten Mobile-Issues in Wave-1 oder
Wave-4 aufgebracht. Gleichzeitig nutzen Obsidian-Power-User das
Produkt auf iPad/iPhone/Android im Alltag. Das signalisiert eine
Nachfrage, die durch das `isDesktopOnly: true` Gate blockiert bleibt.

Sebastian als Primary-User betreibt selbst einen Zettelkasten-Vault
und stoesst im Alltag an die Desktop-Only-Grenze, sobald er
unterwegs Ideen erfasst.

### 2.2 Current State ("As-Is")

Der `/dia-guide`-Orchestrator hat den `Explore`-Subagent mit
einer umfangreichen Codebase-Analyse beauftragt. Die wichtigsten
Befunde:

**Manifest-Gate:**
- `manifest.json:9`: `isDesktopOnly: true`. Obsidian Mobile zeigt
  das Plugin gar nicht erst an.

**Hard-Blocker (Top 10 nach Impact):**

| ID | Pfad:Zeile | Subsystem | Betroffene Feature |
|----|------------|-----------|--------------------|
| HARD-01 | [SafeStorageService.ts:37](../../src/core/security/SafeStorageService.ts#L37) | API-Key Storage | Provider-Config, alle LLM-Aufrufe |
| HARD-02 | [ProcessSandboxExecutor.ts:109](../../src/core/sandbox/ProcessSandboxExecutor.ts#L109) | Sandbox | Skills, Custom-Tools, evaluate_expression |
| HARD-05 | [GlobalFileService.ts:16](../../src/core/storage/GlobalFileService.ts#L16) | Global Storage | Memory, Rules, Skills, Episoden |
| HARD-06 | [GitCheckpointService.ts:17](../../src/core/checkpoints/GitCheckpointService.ts#L17) | Checkpoints | Undo-System |
| HARD-09 | [KnowledgeDB.ts:22](../../src/core/knowledge/KnowledgeDB.ts#L22) | sql.js Loader | SemanticIndex, RAG |
| HARD-10 | [RerankerService.ts:83](../../src/core/knowledge/RerankerService.ts#L83) | Reranker WASM | Suche |
| HARD-17 | [mcp-server-worker.js:54](../../mcp-server-worker.js#L54) | MCP-Local-Server | MCP-Tools |
| HARD-18 | [createSandboxExecutor.ts:24](../../src/core/sandbox/createSandboxExecutor.ts#L24) | Sandbox-Factory | Crash beim Plugin-Load |
| HARD-11 | [main.ts:1435](../../src/main.ts#L1435) | Plugin-Init-Migrations | Legacy-Pfad-Migration |
| HARD-13 | [AgentFolderPickerModal.ts:39](../../src/ui/settings/AgentFolderPickerModal.ts#L39) | Native Folder Picker | Agent-Folder-Setup |

**Soft-Blocker (auszugsweise):**
- ExecuteCommandTool trifft Desktop-only Obsidian-Commands.
- Workspace-Split-APIs (`getLeaf('split', 'vertical')`).
- Skill-Import via nativen File-Picker.

**Degraded-Subsysteme:**
- Office-Document-Creation (docx, xlsx, pptxgenjs) ist pure JS, aber
  Buffer-Handling in Sandbox-Context ist auf Mobile ungetestet.
- Workspace-UI-Elemente, die Multi-Pane-Behavior annehmen.

**Voller Report:** Inline im Explore-Subagent-Output vom 2026-04-22.
Eine statische Kopie wird in Phase 3 (Architektur) als Evidenz-Tabelle
in die ADRs uebernommen.

### 2.3 Desired State ("To-Be")

- `manifest.json`: `isDesktopOnly: false`. Plugin laedt auf iOS und
  Android ohne Crash.
- Alle Electron-only Imports laufen durch Platform-Guards.
  ProcessSandboxExecutor wird nur auf Desktop lazy-required.
  IframeSandboxExecutor oder ein Worker-Sandbox ist der Mobile-
  Default.
- `KnowledgeDB` oeffnet auf Mobile im Read-only-Modus aus einer
  vault-lokalen `.sqlite`-Datei, die der Desktop erzeugt und via
  Obsidian Sync in den Vault transportiert.
- `SemanticIndex` und `Reranker` nutzen auf Mobile ausschliesslich
  den Desktop-Index. Mobile indexiert nicht.
- `GlobalFileService` migriert zu vault-lokalem Storage fuer die
  Mobile-relevanten Artefakte (Memory, Skills, Rules). Desktop-
  Verhalten bleibt rueckwaerts-kompatibel.
- `MCP-Server`: Lokal auf Mobile startbar, oder auf Desktop startbar
  mit Relay fuer Remote-Mobile-Zugriff. Architektur-Offen.
- `Checkpoints`: auf Mobile deaktiviert (Hinweis im UI), bleibt auf
  Desktop unveraendert.
- Skill-Katalog gefiltert: Skills, die Sandbox-Ressourcen oder
  Desktop-only Plugins benoetigen, werden auf Mobile als
  "nicht verfuegbar" markiert.
- Inbox-Capture-Workflow: Voice-Input, Scan-Import, Web-Clip-Import
  erzeugen Inbox-Notes mit vom Agent vorbereiteten Links und
  Metadaten.

### 2.4 Gap Analysis

| Dimension | As-Is | To-Be | Gap |
|-----------|-------|-------|-----|
| Plugin-Load-Fail auf Mobile | Crash durch `isDesktopOnly: false`-Test und top-level fs-Imports | Clean Load mit Platform-Guards | Refactoring an ~22 Stellen, Lazy-Require-Pattern, Mobile-Stubs |
| Sandbox-Executor | ProcessSandboxExecutor statisch importiert | Iframe/Worker-Sandbox als Mobile-Default, Lazy-Require fuer Process | createSandboxExecutor.ts umbauen, Build-Config |
| Index-Konsum | sql.js mit fs.readFileSync | sql.js mit vault.adapter + readonly-Flag | KnowledgeDB I/O abstrahieren, AssetProvisioner-Cache-Pfad |
| Global-Storage | `~/.obsidian-agent/` via Node-fs | Vault-lokal `{vault}/.obsidian-agent/` | GlobalFileService kapseln, Migration-Path |
| Capture-UX | Keine Mobile-UI | Voice-Input, Scan/Foto-Import, Web-Clipper-Eingang | Neue Mobile-Capture-View, Inbox-Folder-Convention |
| MCP-Strategie | mcp-server-worker.js als Node-Script | Mobile-Mode: lokaler MCP oder Desktop-Relay | Architektur-Entscheidung (ADR in Phase 3) |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Rolle | Interest | Influence | Needs |
|-------------|-------|----------|-----------|-------|
| Sebastian (Owner, Primary User) | Produktowner, Power-User, Zettelkasten-Praktiker | H | H | Mobile-Capture fuer eigenen Vault, kein Feature-Split-Chaos |
| Obsilo-Community (Wave-1, Wave-4 User) | Bestehende Desktop-User, teils Mobile-interessiert | M | M | BRAT-kompatibler Mobile-Rollout, Rueckwaerts-Kompatibilitaet Desktop |
| Obsidian-Core (Community Plugin Review-Bot) | Gate-Keeper fuer Public-Store | M | H | Bot-Compliance, `isDesktopOnly: false` erfordert saubere Guards |
| Anthropic/OpenAI (Provider) | API-Bereitsteller | L | M | Keine Aenderung, Multi-Provider bleibt |
| MCP-Server-Betreiber (User) | Nutzen Obsilo-MCP | M | L | Relay-Option bei Mobile-only Setup |

### 3.2 Key Stakeholders

**Primary:** Sebastian (Entscheider, Entwickler, Primary User)
**Secondary:** Obsilo-Community (Akzeptanz-Indikator), Review-Bot
(Compliance-Gate fuer zukuenftigen Public-Release)

---

## 4. User Analysis

### 4.1 User Personas

**Persona P1: Sebastian, der mobile Zettelkasten-Wissensarbeiter**

- **Rolle:** Obsilo-Owner, Obsidian-Power-User, Zettelkasten-
  Praktizierender
- **Ziele:**
  - Ideen und Quellen unterwegs so erfassen, dass sie spaeter am
    Desktop leicht verzettelbar sind.
  - Mit Agent-Support Metadaten, Zusammenfassungen und Links schon
    mobil vorbereiten.
  - RAG-Zugriff und Brainstorming auf dem bestehenden Vault auch
    unterwegs.
- **Pain Points:**
  - Obsilo ist auf Mobile gar nicht installierbar (isDesktopOnly).
  - Manuelle Notes auf Mobile haben heute keine Link-Vorarbeit,
    Verzettelung dauert laenger.
  - Sprach-Input wird aktuell nur im Apple-Notizen- oder
    Voice-Memo-Workflow erfasst, nicht direkt in den Zettelkasten.
  - Scan und Web-Clipper landen ohne Agent-Vorarbeit in der Inbox.
- **Nutzungshaeufigkeit:** Taeglich.
- **Typisches Zitat:** "Ich moechte unterwegs einen Gedanken
  einsprechen und der Agent erzeugt daraus eine Notiz oder einen
  Zettel, den ich spaeter verzetteln kann. Das Verzetteln bleibt am
  Desktop, der Agent leistet Vorarbeit."
- **Nutzungs-Kontext:** Waehrend Pendeln, Spaziergang, Meetings,
  Research-Sessions im Cafe.

**Persona P2: Die Obsilo-Community (Hypothese, Validierung nach
PoC-Release)**

- **Rolle:** Bestehende Obsilo-Desktop-Nutzer, die Obsidian auch auf
  iPad oder Smartphone betreiben.
- **Ziele:** (angenommen, basiert auf Wave-1 + Wave-4 Feedback-
  Profilen)
  - Obsilo soll Mobile nicht crashen.
  - Kern-Features (Chat, Semantic Search, Inbox-Support) sollen auf
    Mobile verfuegbar sein, auch wenn Full-Parity nicht moeglich ist.
  - BRAT-Install-Flow soll ohne Desktop-Extra-Schritte auf Mobile
    funktionieren.
- **Pain Points:** (Annahme)
  - Aktuelle Desktop-only-Beschraenkung fuehrt zu Context-Switch
    beim Wechsel zwischen Geraeten.
  - Mobile-Obsidian-Erfahrung bleibt ohne AI-Assist rudimentaer.
- **Nutzungshaeufigkeit:** Unbekannt, Annahme: Woechentlich bis
  taeglich.
- **Typisches Zitat:** (Platzhalter, noch nicht aus User-Interviews
  validiert)
- **Nutzungs-Kontext:** Obsidian Sync, iCloud/Google-Drive-basiert,
  oft als Zweit-Geraet.
- **Validierungs-Methode:** Post-PoC-Release: Issue-Monitoring,
  Discord/Forum-Feedback, kleiner Mobile-User-Survey (Method:
  Explorative interviews, 5-8 User aus Wave-Teilnehmern).

### 4.2 Needs

| Need ID | Need | Typ | Prioritaet | Persona |
|---------|------|-----|------------|---------|
| N-01 | Plugin laedt auf iOS und Android ohne Crash | Funktional | H | P1, P2 |
| N-02 | Ideen und Sprachnotizen unterwegs in strukturierte Inbox-Note umwandeln | Funktional | H | P1 |
| N-03 | Agent schlaegt mobil Links auf bestehende Vault-Notes vor | Funktional | H | P1 |
| N-04 | RAG-Zugriff auf Desktop-erzeugten Semantic Index | Funktional | H | P1, P2 |
| N-05 | Base-Erstellung mobil (leichtgewichtig) | Funktional | M | P1 |
| N-06 | Brainstorming mit Agent zu einem Thema | Funktional | M | P1 |
| N-07 | Scan, Foto und Web-Clip als Inbox-Quelle | Funktional | M | P1 |
| N-08 | MCP-Tools mobil nutzbar (lokal oder via Desktop-Relay) | Funktional | M | P1 |
| N-09 | Skills verfuegbar mit ressourcen-basiertem Filter | Funktional | M | P1, P2 |
| N-10 | Checkpoints, Canvas, Excalidraw sichtbar als "Desktop-only" | UX | L | P1, P2 |
| N-11 | Keine Index-Erzeugung auf Mobile (Batterie, Speicher) | Nicht-funktional | H | P1 |
| N-12 | Vault-Desktop-Install bleibt unveraendert bei Rollout | Nicht-funktional | H | P1, P2 |
| N-13 | Weniger Tippen, mehr Voice/Scan-Input | Emotional | M | P1 |
| N-14 | Vertrauen: Mobile-Input verliert keine Daten, wird nicht doppelt indexiert | Emotional | H | P1, P2 |

### 4.3 Insights

**Funktional:**
- Der User arbeitet bereits heute mit Zettelkasten-Disziplin: Inbox
  steht fuer "noch nicht verzettelt". Dieser Status signalisiert
  ihm Review-Bedarf. Jede Mobile-Loesung muss diese Trennung
  respektieren, nicht umgehen. (Quelle: Sebastian, Antwort auf
  Primary-Use-Case-Frage 2026-04-23.)
- "Index-Consumer-Pattern" war eine User-Hypothese VOR der As-Is-
  Analyse. Die Codebase-Analyse bestaetigt, dass sql.js readonly auf
  Mobile technisch machbar ist, wenn die WASM-Binary und die .sqlite-
  Datei ueber Vault-Adapter erreichbar sind. (Quelle: Explore-Report,
  HARD-09 + Feasibility-Abschnitt 1.)

**Emotional:**
- Der User will unterwegs "weniger tippen" und mehr einsprechen. Das
  ist Accessibility UND Komfort. Voice-First ist kein Nice-to-have,
  sondern Capture-Prinzip. (Quelle: Sebastian, direktes Zitat
  2026-04-23.)
- Verzettelung ist bewusste Eigenarbeit. Der User will den Agent als
  Vorbereiter, nicht als Automatisierer. (Quelle: "Solange die
  Notiz in Inbox bleibt, weiss ich, dass ich da noch mal Review
  muss.", Sebastian, 2026-04-23.)

**Sozial:**
- Die Obsilo-Community hat Mobile in Wave-1 und Wave-4 nicht
  aufgebracht. Das koennte Desinteresse sein ODER Selbst-
  Selektion (Community = Desktop-User). Annahme, muss in Phase 8
  post-release validiert werden. (Quelle: MEMORY.md Community-
  Wave-Historie, kein expliziter Mobile-Thread.)

**Analogien:**
- Readwise Reader hat einen aehnlichen Capture-Consume-Split
  (Mobile capture, Desktop reader).
- Reflect/Tana haben Voice-to-Note als First-Class-Feature, nicht
  als Nachgelagertes.
- Mem.ai hat einen Index-Server-Ansatz (Cloud-indexiert), was
  architekturell anders ist als der hier vorgeschlagene Desktop-
  indexiert/Mobile-konsumiert-Ansatz.

### 4.4 User Journey (High-Level)

1. **Morgen:** Sebastian hat im Bett einen Gedanken zu einem
   laufenden Projekt. Er oeffnet Obsidian Mobile, startet Obsilo,
   sagt: "Neue Idee zu EPIC-19: Lint-Rules fuer veraltete Chunks
   koennten ueber Recency-Score gewichtet werden."
2. **Agent-Vorarbeit:** Obsilo nimmt den Voice-Input entgegen,
   strukturiert Titel + Body, zieht per Semantic Search aus dem
   Desktop-Index die passende Note "EPIC-19 Knowledge Maintenance"
   und verlinkt sie, setzt Tags `[[Inbox]]` + `[[EPIC-19]]`.
3. **Inbox-Note:** Die Note landet in `Inbox/2026-04-23-idee-
   lint-recency.md` mit YAML-Frontmatter und Link-Vorschlaegen.
4. **Pendeln:** Sebastian scannt auf dem Weg ins Cafe eine
   Buchseite mit der Obsidian-Kamera, Obsilo extrahiert Text (OCR
   via Plattform-API) und legt eine Quelle-Note an mit Zitat-
   Vorlage.
5. **Cafe:** Er macht ein Brainstorming-Chat mit Obsilo zum Thema
   "Ontologie-Evolution". RAG-Zugriff zieht die passenden Chunks
   aus dem Desktop-Index. Der Chat wird auf Mobile als Conversation
   gespeichert (kein Index-Write).
6. **Abend am Desktop:** Sebastian oeffnet Obsilo Desktop. Der
   Semantic Index indexiert die mobil erzeugten Inbox-Notes
   automatisch. Er verzettelt sie in Ruhe, loest [[Inbox]]-Tags auf
   und integriert die Notes in den Vault.

### 4.5 Touchpoints

| Touchpoint | Phase | Kanal | Experience |
|------------|-------|-------|------------|
| Obsidian Mobile App | Before | App Store / Sideload | o (neutral, Voraussetzung) |
| BRAT-Install obsilo-agent | Before | BRAT-Plugin | + (bekannt aus Desktop) |
| Plugin-Enable auf Mobile | During | Obsidian Settings | - (aktuell blockiert durch isDesktopOnly) |
| Sidebar-Chat mobil | During | Obsilo-UI | + (Ziel-Zustand) |
| Voice-Input-Button | During | Obsilo-Capture-View | + (Neu) |
| Inbox-Note in Vault | After | Obsidian Vault + Sync | + (nahtlos fuer Zettelkasten-Workflow) |
| Desktop-Verzettelung | After | Obsilo Desktop | + (unveraendert) |

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Obsilo ist als Desktop-only Plugin gestartet, weil viele Kern-
Subsysteme auf Electron-APIs und Node.js-nativen Modulen aufbauen:
safeStorage, child_process, fs fuer Global-Storage, isomorphic-git
fuer Checkpoints, esbuild-wasm fuer Self-Modification, sql.js ueber
Node-fs fuer den Semantic-Index, eine Process-basierte Sandbox fuer
Skills. Diese Entscheidungen waren fuer die Desktop-Phasen A-F
sinnvoll, sie haben die Entwicklung beschleunigt. Der Preis: Mobile-
Obsidian-Nutzer sind heute vom Produkt ausgeschlossen.

Die zweite Ebene des Problems ist der Use-Case-Mismatch. Selbst
wenn das Plugin mobil laedt, ist Full-Parity nicht sinnvoll:
Indexierung frisst Mobile-Akku, Canvas-Editor ist auf 6-Zoll-
Displays unbrauchbar, Self-Modification durch Plugin-Rebuild ist
auf Mobile weder machbar noch gewuenscht. Die richtige Antwort ist
deshalb eine bewusste Scope-Reduktion ("Companion-Modus"), nicht
ein Port.

Die dritte Ebene ist der Workflow-Fit. Sebastian praktiziert
Zettelkasten: Inbox-Notes sind explizit "noch nicht verzettelt".
Jede Loesung, die Mobile-Capture direkt in den Haupt-Vault
integriert oder Auto-Index schreibt, bricht diese Disziplin. Die
Loesung muss die Inbox-Stage respektieren.

### 5.2 Root Causes

1. **Historische API-Wahl:** In Phasen A-E wurden Electron-APIs
   bewusst eingesetzt, weil sie den schnellsten Weg zum Ziel
   boten und Mobile nicht im Scope war.
2. **Fehlende Platform-Abstraktion:** `GlobalFileService`,
   `KnowledgeDB`, `RerankerService`, `GitCheckpointService`,
   `ProcessSandboxExecutor` und andere nutzen Node-APIs direkt statt
   ueber eine Platform-Abstraktion.
3. **isDesktopOnly als Abkuerzung:** Solange das Manifest
   `isDesktopOnly: true` haelt, musste niemand ueber Mobile-
   Kompatibilitaet nachdenken. Das hat zu top-level `import fs`
   Statements und statischen `require('./ProcessSandboxExecutor')`
   gefuehrt, die sofort crashen, wenn der Gate fallen wuerde.
4. **Fehlender Capture-Flow:** Obsilo hat keinen Voice-Input-
   Button, keinen Scan/Foto-Importer, keinen Web-Clipper-Entry-
   Point. Das sind mobile First-Class-Use-Cases, die auch auf
   Desktop heute fehlen.

### 5.3 Impact

**Business Impact:**
- Der adressierbare Markt ist halbiert. Viele Obsidian-Nutzer
  arbeiten bimodal (Desktop + Mobile).
- Die Community-Wachstums-Rate wird durch die Desktop-Grenze
  gebremst. Neue Obsidian-User probieren heute oft zuerst Mobile.
- Die eigene Zukunft (moegliches Public-Release, Community-
  Wave-2+) bleibt an der Desktop-Insel haengen.

**User Impact (Sebastian):**
- Ideen unterwegs gehen entweder verloren oder landen in Drittools
  (Apple-Notizen, Voice Memos, Screenshots-Ordner) und muessen
  spaeter manuell in den Zettelkasten wandern.
- Inbox-Disziplin ist anstrengender, weil Pre-Wiring am Desktop
  nachgeholt werden muss.
- RAG-Wissensfragen an den eigenen Vault sind unterwegs nicht
  beantwortbar.

### 5.4 Jobs to be Done

| Job-Typ | Job-Beschreibung | Aktuell "eingestellt" fuer | Firing-Reason |
|---------|------------------|-----------------------------|---------------|
| Funktional | "Gedanken unterwegs strukturiert in meinen Zettelkasten bringen" | Apple Notizen + manuelles Copy-Paste | Kein Link-Support, kein Metadaten-Vorschlag, Copy-Paste verliert Context |
| Funktional | "Web-Artikel unterwegs auf Mobile speichern fuer spaetere Verarbeitung" | Obsidian-WebClipper ohne Agent-Vorarbeit | Titel und Links werden nicht automatisch an bestehende Vault-Notes gekoppelt |
| Funktional | "Wissen aus meinem Vault unterwegs abrufen" | Obsidian-Mobile-Suche (BM25 ohne Semantic) | Keine Semantic Search, keine RAG, keine Agent-Zusammenfassung |
| Emotional | "Ich moechte mich als produktiver Wissensarbeiter fuehlen, auch wenn ich nicht am Schreibtisch sitze" | Aktuell Kompromiss-Workflow mit Drittools | Bruch im Workflow, fuehlt sich zerstueckelt an |
| Sozial | "Ich moechte glaubwuerdig einem anderen Obsidian-Power-User erzaehlen koennen, dass mein Obsilo mobil funktioniert" | Kann ich heute nicht | Community-Signal: Plugin ist Desktop-only |

---

## 6. Goals & Objectives

### 6.1 Business Goals

- **BG-01:** Obsilo wird auf iOS und Android installierbar und
  funktional nutzbar. Zielzustand: `isDesktopOnly: false` mit
  sauberer Mobile-UX.
- **BG-02:** Mobile-Release erweitert den Obsilo-Nutzungsrahmen ohne
  Desktop-Regression. Desktop-User merken keinen negativen Impact.
- **BG-03:** Vorbereitung auf potenziellen Public-Release via
  Obsidian-Community-Store: Review-Bot-compliant auch fuer den
  Mobile-Pfad.

### 6.2 User Goals

- **UG-01:** Sebastian kann taeglich mobile Ideen in seinen
  Zettelkasten einfliessen lassen, ohne Drittools.
- **UG-02:** Agent-Unterstuetzung (Metadaten, Links, RAG, Brainstorm)
  ist mobil verfuegbar.
- **UG-03:** Klare UX-Erwartung: Was geht mobil, was nur Desktop?
  Kein versteckter Feature-Verlust, keine Crash-Ueberraschungen.

### 6.3 Success Metrics (KPIs)

MVP-Scope, Personal+Community-Mix. Metriken sind qualitativ-
priorisiert, weil absolute Nutzungszahlen im Privat-Scope keine
Aussagekraft haben.

| KPI | Baseline | Target | Timeframe | Messmethode |
|-----|----------|--------|-----------|-------------|
| Mobile-Plugin-Load-Success (Sebastian) | 0 % (isDesktopOnly blockiert) | 100 % auf iOS + Android | Ende Phase 1 | Manueller Install-Test (BRAT + iOS-Sideload, Android-Direct) |
| Anteil mobil erstellter Inbox-Notes an Gesamt-Inbox pro Monat | 0 % | >= 30 % nach 6 Wochen Nutzung | Ende Phase 4 | Auszaehlung `Inbox/`-Folder mit Frontmatter-Marker `source: mobile` |
| Link-Vorschlag-Qualitaet fuer mobile Inbox-Notes | n/a | >= 70 % der Notes haben >= 1 passenden Vault-Link | 6 Wochen post-Launch | Stichprobe 20 Notes, Review durch Sebastian |
| Agent-RAG-Roundtrip-Zeit auf Mobile | n/a | <= 8 s P95 fuer einfache Queries auf Wohn-WLAN | PoC-Ende | Telemetrie via ConsoleRingBuffer-Messung, Beispiel-Queries |
| Keine Mobile-spezifischen Crash-Reports | n/a | 0 Crashes in Sebastian's Eigen-Nutzung pro Woche | Erste 4 Wochen | Fehler-Log Review |
| Community-Mobile-Interesse | Unbekannt, Hypothese P2 | >= 5 Community-User probieren BRAT-Mobile-Release innerhalb 8 Wochen | Post-Release | Discord-Poll, Issue-Tracking |

---

## 7. Idea Potential & Solution Concept

### 7.1 Idea Potential (3 Axen, Skala 0-10)

| Axe | Score | Rationale |
|-----|-------|-----------|
| **Value / Urgency** | 7 | Klarer Pain fuer Primary-User, wiederholbare Daily-Use-Case. Nicht lebensbedrohlich, aber spuerbar im Workflow. |
| **Transferability** | 6 | Use-Case ist fuer Zettelkasten-Power-User uebertragbar. Nicht fuer Casual-Obsidian-User mit minimalem Vault. |
| **Feasibility** | 5 | 10-14 Wochen Aufwand. Index-Consumer-Pattern ist technisch neu. Risiken in Sandbox-Factory-Umbau, Global-Storage-Migration, MCP-Architektur. |

### 7.2 The Wow

Obsilo ist der erste Obsidian-Agent, der Zettelkasten-konformes
Capture-und-Pre-Wire unterwegs liefert, **mit** Zugriff auf den
eigenen Desktop-Wissensindex, **ohne** auf Mobile zu indexieren.
Voice-to-Zettel-mit-Link in unter 10 Sekunden. Kein Cloud-Upload,
kein Drittdienst, Synchronisation laeuft ueber Obsidian Sync.

### 7.3 Critical Hypotheses

| ID | Hypothese | Typ | Test-Methode | Success-Kriterium |
|----|-----------|-----|--------------|-------------------|
| H-01 | Das Plugin laesst sich nach Refactoring auf iOS und Android ohne Crash laden. | Tech Feasibility | Install-Test auf realem iOS + Android mit BRAT nach Phase 1 | Sidebar oeffnet, Chat funktioniert mit Remote-Provider |
| H-02 | sql.js WASM laeuft auf Mobile mit vault-lokaler Datenbank im Read-only-Modus. | Tech Feasibility | Spike in Phase 2: Desktop erzeugt Mini-DB, Mobile liest Vektoren raus | Semantic-Query auf Mobile liefert dieselben Top-5-Treffer wie Desktop |
| H-03 | Obsidian Sync transportiert die sqlite-Datei (bis ca. 50 MB) zuverlaessig in realen User-Vaults. | Data Availability | Praxis-Test mit Sebastian's Vault (~10.783 Vektoren) | Sync-Dauer <= 60 s bei Aenderung, keine Korruption |
| H-04 | Voice-to-Note-Flow liefert nutzbare Inbox-Notes mit Link-Vorschlaegen. | Problem-Solution Fit | PoC-Implementation + 2 Wochen Eigen-Nutzung | >= 70 % der mobil erfassten Notes enthalten >= 1 relevanten Vault-Link |
| H-05 | IframeSandboxExecutor (oder ein Worker-Sandbox) reicht fuer die Mobile-relevanten Skills. | Tech Feasibility | Skill-Katalog auditieren, Skills mit Process-Dependencies flaggen | Mindestens die Top-10-Skills nach Nutzungshaeufigkeit funktionieren im Mobile-Sandbox |
| H-06 | MCP-Tools sind mobil entweder lokal oder ueber Desktop-Relay nutzbar. | Tech Feasibility | Spike: Relay-Variante testen, lokal-Mobile-Variante evaluieren | Mindestens ein Variante liefert vollstaendigen Tool-Roundtrip |
| H-07 | GlobalFileService-Migration zu vault-lokalem Storage laesst sich rueckwaerts-kompatibel zu Desktop-v2.6.0 durchfuehren. | Tech Feasibility | Migration-Script + Fallback-Lesepfad | Bestehende Desktop-Setups laufen nach Upgrade ohne Datenverlust weiter |
| H-08 | Die Obsilo-Community interessiert sich ueberhaupt fuer Mobile-Support. | Market | Post-PoC-Release: BRAT-Adoption-Monitoring, Discord-Poll | >= 5 aktive Community-User probieren den Mobile-Build innerhalb 8 Wochen |

### 7.4 Solution Idea and Object Model

**Companion-Modus-Architektur in Komponenten:**

```
Desktop (Obsilo Producer Mode)                Mobile (Obsilo Consumer Mode)
+-------------------------------------+       +-------------------------------------+
| SemanticIndexService (writer)       |       | SemanticIndexService (reader-only)  |
|   - writes knowledge.db             |       |   - reads {vault}/.obsilo/index/... |
|   - writes reranker-cache           |       |                                     |
|   - exports to vault/.obsilo/index/ |       | CaptureView (new)                   |
|                                     |       |   - Voice-to-Text                   |
| GlobalFileService                   |       |   - Scan/Foto-Import                |
|   - vault-local (migrated)          |       |   - Web-Clipper-Handoff             |
|                                     |       |                                     |
| GitCheckpointService (active)       |       | GitCheckpointService (disabled)     |
| ProcessSandboxExecutor (default)    |       | IframeSandboxExecutor (default)     |
| MCP Local Server                    |       | MCP Local Server (if feasible)      |
|                                     |       |   OR MCP Relay Client -> Desktop    |
| Plugin Self-Modification            |       | Plugin Self-Modification (disabled) |
+-------------------------------------+       +-------------------------------------+
                 |                                          |
                 |           Obsidian Sync                  |
                 +------------------------------------------+
                              (Vault + .obsilo/index/)
```

**Objekte und Verantwortlichkeiten:**

- **PlatformCapabilities** (neu): Zentrale Abstraktion, die an Obsidian
  `Platform` und eigene Heuristiken gekoppelt ist. Liefert Boolean-
  Getter: `canSpawnProcess`, `canAccessNodeFs`, `canWriteIndex`,
  `canUseNativeDialog`, `canRunProcessSandbox`.
- **IndexProducer / IndexConsumer** (neu): Rollen-Split fuer
  `SemanticIndexService`. Desktop ist Producer+Consumer, Mobile ist
  nur Consumer.
- **VaultLocalGlobalFs** (Umbau): Ersatz fuer ~/.obsidian-agent/-
  Pfade im Mobile-Kontext. Auf Desktop bleibt der alte Pfad per
  Fallback erreichbar (Migration-Path fuer bestehende User).
- **MobileCaptureView** (neu): Dedizierte View fuer Voice-Input,
  Scan/Foto-Import, Web-Clipper-Resolution.
- **SkillCapabilityFilter** (Erweiterung): Pro Skill ein
  `requires: [process_sandbox, node_fs, native_dialog, ...]`. Auf
  Mobile werden nicht-kompatible Skills als "Desktop-only"
  markiert.
- **MobileMcpStrategy** (ADR-kandidat): Entscheidung zwischen
  lokal-MCP-auf-Mobile versus Desktop-MCP-Relay. Wird in Phase 3
  entschieden.

---

## 8. Scope Definition

### 8.1 In Scope (MVP)

- **Plugin-Manifest:** `isDesktopOnly: false` + Platform-Guards.
- **Sandbox:** IframeSandboxExecutor oder Worker-Sandbox als
  Mobile-Default.
- **Index-Consumer:** sql.js readonly, vault-lokale DB.
- **Voice-to-Note Capture:** Voice-Input-Button, Transkription,
  strukturierte Inbox-Note mit Agent-Vorarbeit.
- **Scan/Foto-Import:** Eingang fuer Obsidian-Kamera-Notes mit
  Agent-Metadaten-Vorschlag.
- **Web-Clipper-Handoff:** Import von Web-Artikeln in Obsilo-Inbox-
  Workflow.
- **RAG-Zugriff:** Semantic-Query auf Desktop-Index funktioniert
  mobil.
- **Brainstorming-Chat:** Konversation mit Agent ohne Index-Write.
- **Base-Erstellung mobil:** leichtgewichtig (kein Canvas).
- **MCP-Tools mobil:** Architektur-Entscheidung in Phase 3 (lokal
  oder Relay).
- **Skill-Filter:** Ressourcen-/Plugin-Inkompatible Skills klar
  markiert.
- **Global-Storage-Migration:** `~/.obsidian-agent/` zu vault-lokal
  mit Rueckwaerts-Kompatibilitaet.
- **Community-Plugin-Bot-Compliance:** Mobile-Pfad ebenfalls ohne
  Bot-Verletzungen.

### 8.2 Out of Scope (explizit)

- **Canvas- und Excalidraw-Generierung** auf Mobile.
- **Indexierung** auf Mobile (weder initial noch inkrementell).
- **Plugin-Self-Modification / PluginBuilder** auf Mobile.
- **Checkpoints** auf Mobile.
- **Full-Parity** zu Desktop-Features.
- **Native-Folder-Picker** auf Mobile (Manual-Path-Input als
  Fallback, bereits vorhanden).
- **Desktop-Regressions:** Alle Desktop-Features bleiben
  unveraendert funktionsfaehig.
- **Umfassendes Redesign** der Settings-UI fuer Mobile (nur
  Mobile-relevante Sections werden geprueft, nicht alle).

### 8.3 Assumptions

- **A-01:** Obsidian Sync transportiert Dateien bis ca. 50 MB
  zuverlaessig in realen User-Vaults.
- **A-02:** Sebastian's bestehender Vault (10.783 Vektoren) produziert
  eine sqlite-Datei unter 50 MB.
- **A-03:** Transformers.js Reranker-Modell laesst sich auf Mobile
  mit vault-lokalem Cache laden (oder wird gnadenvoll disabled).
- **A-04:** MCP-Local-Server auf Mobile ist technisch machbar (siehe
  H-06) ODER ein Desktop-Relay deckt den Use-Case ab.
- **A-05:** Community-Interesse laesst sich post-PoC-Release
  erheben und ist nicht Null.
- **A-06:** Voice-Input laeuft ueber Obsidian-Mobile-APIs oder eine
  Plattform-native Speech-to-Text, ohne Cloud-Dependenz.

### 8.4 Constraints

- **C-01:** Review-Bot-Regeln bleiben verbindlich (keine
  `fetch`, keine `console.log`, kein hardcoded `.obsidian`, etc.).
- **C-02:** Obsidian-Mobile-Runtime: kein Node.js, kein Electron,
  kein child_process, kein fs.
- **C-03:** Bestehende Desktop-User duerfen durch die Mobile-
  Aenderungen keinen Funktionsverlust erfahren.
- **C-04:** Keine neuen Remote-Dependencies ausser dem bestehenden
  Provider-Set (Anthropic, OpenAI, etc.) ohne ADR.
- **C-05:** BRAT-Install-Flow bleibt Primary-Distribution.
- **C-06:** Zeit-Budget: 10-14 Wochen fuer MVP.

---

## 9. Risk Assessment

| ID | Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|----|--------|---------------------|--------|------------|
| R-01 | sql.js WASM laeuft auf iOS/Android nicht oder nur mit Size-Limits | M | H | Spike in Phase 2 (H-02), Fallback: reduzierter Index oder Embedding-Server |
| R-02 | Obsidian Sync transportiert sqlite-DB nicht zuverlaessig (Conflict, Size) | M | H | Praxis-Test in Phase 2 (H-03), Fallback: manueller Export/Import-Flow via File-Sharing |
| R-03 | IframeSandbox reicht nicht fuer die Mobile-relevanten Skills | M | M | Skill-Katalog-Audit in Phase 1, Priorisierung, Plan-B: Subset-Skills markieren |
| R-04 | GlobalFileService-Migration verursacht Datenverlust bei bestehenden Usern | L | H | Dual-Read-Pfad (alt + neu), Write nur zu neu, Migration-Script mit Backup |
| R-05 | MCP-Local auf Mobile ist technisch nicht machbar | M | M | Fallback: Desktop-Relay-Variante (H-06) |
| R-06 | Obsidian-Platform-API liefert unerwartete Einschraenkungen (z.B. requestUrl-Size-Limit, Worker-Support) | M | M | Mobile-Spike-Phase vor Architektur-Finalisierung, frueh testen |
| R-07 | Voice-to-Text-Qualitaet zu schlecht fuer sinnvolle Inbox-Notes | M | M | Provider-Wahl (Platform-native vs. API), Manual-Edit-Fallback in UI |
| R-08 | Community-Interesse ist Null, Mobile-Arbeit bleibt Privat-Projekt | M | L | Bewusst akzeptiert, Scope ist Personal-First mit Community-Upside |
| R-09 | Review-Bot-Regeln auf Mobile-Pfad verletzt, Public-Release blockiert | L | M | /review-bot vor jedem Mobile-Release, Regel-Compliance ab Phase 1 |
| R-10 | Aufwand ueberschreitet 14 Wochen signifikant | M | M | Iteratives Rollout: Phase-fuer-Phase mit eigenen Release-Punkten |

---

## 10. Requirements Overview (High-Level)

### 10.1 Functional Requirements (Summary)

1. Plattform-Erkennung und saubere Guards fuer alle Electron-/Node-
   APIs.
2. Index-Consumer-Pfad: Desktop schreibt, Mobile liest.
3. Mobile-Capture-View mit Voice, Scan, Foto, Web-Clip.
4. Agent-Vorarbeit fuer Metadaten und Vault-Links in mobil erfassten
   Notes.
5. Inbox-Workflow-Convention mit Frontmatter-Marker `source: mobile`.
6. RAG-Zugriff, Chat, Base-Erstellung, Brainstorming auf Mobile.
7. MCP-Tools mobil nutzbar (Architektur-Entscheidung in Phase 3).
8. Skill-Katalog mit Capability-Flags fuer Mobile-Filter.
9. Global-Storage-Migration zu vault-lokalem Pfad mit
   Rueckwaerts-Kompatibilitaet.
10. Checkpoints, Canvas, Excalidraw, Plugin-Self-Modification mit
    "Desktop-only"-UI-Hinweisen statt Crashes.

### 10.2 Non-Functional Requirements (Summary)

- **Performance:** RAG-Roundtrip <= 8 s P95 auf Wohn-WLAN.
- **Security:** API-Keys in Mobile ohne Electron-safeStorage ueber
  Vault-Adapter mit User-Passphrase ODER per-Device-Reinput (ADR-
  Kandidat in Phase 3).
- **Compatibility:** iOS und Android, Obsidian >= 1.4.0 (Desktop-
  minAppVersion beibehalten).
- **Accessibility:** Voice-First, Screen-Reader-Kompatibilitaet der
  Mobile-Capture-View.
- **Offline:** Semantic Search und Chat mit lokalem Provider (wenn
  LM Studio/Ollama via Relay verfuegbar) muessen offline-fest sein.
  Default-Provider ist Cloud, also Offline-Downgrade statt Crash.
- **Datenintegritaet:** Keine Index-Writes auf Mobile. Mobile-Inbox-
  Notes niemals automatisch verschoben oder verzettelt.
- **Battery:** Keine Background-Indexierung, keine
  Hintergrund-HTTP-Polls ohne explizite User-Aktion.

### 10.3 Key Features (fuer RE)

| Prioritaet | Feature | Beschreibung |
|------------|---------|--------------|
| P0 | Platform-Guards und Sandbox-Factory-Refactor | isDesktopOnly false, lazy-require, IframeSandbox als Mobile-Default |
| P0 | GlobalFileService Vault-Local Migration | Compat-Pfad alt + neu, Tests fuer Desktop-Regression |
| P0 | Index-Consumer-Modus (KnowledgeDB + Reranker) | Readonly-Flag, vault-adapter I/O, AssetProvisioner-Anpassung |
| P0 | Mobile-Capture-View (Voice-to-Note) | Voice-Input, Agent-Vorarbeit, Inbox-Note-Erzeugung |
| P1 | MCP-Mobile-Strategie | Lokal oder Relay (ADR Phase 3), mindestens ein Pfad lauffaehig |
| P1 | Skill-Capability-Filter | Skill-Metadata um `requires`-Feld erweitern, Mobile-UI-Markierung |
| P1 | Scan/Foto-Import und Web-Clipper-Handoff | Eingang fuer Obsidian-Kamera/Clipper in Obsilo-Inbox-Flow |
| P1 | UI-Markierungen fuer Desktop-only-Features | Canvas, Excalidraw, Checkpoints, Plugin-Builder sichtbar disabled |
| P2 | Base-Erstellung mobil | Leichtgewichtige Base-UI auf Mobile |
| P2 | Agent-Brainstorming-Mode | Gesonderter Chat-Mode ohne Index-Write |
| P2 | Mobile-Spezifische Onboarding-Anpassung | Hinweis auf Companion-Modus beim ersten Mobile-Start |

---

## 11. Evaluate: Market Assessment and Business Viability

Der Scope ist Personal-first mit Community-Upside. Marktanalyse wird
knapp gehalten, weil Monetarisierung nicht Ziel dieses Zyklus ist.

### 11.1 Value Proposition Score (Skala 0-10)

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Activate users** | 8 | Fuer P1 direkt daily-driver. Fuer P2 abhaengig von H-08. |
| **Preference vs. Alternativen** | 7 | Kein direkter Konkurrent mit Zettelkasten+Companion+Desktop-Index-Ansatz |
| **Willingness to pay** | n/a | Scope ist privat, kein Pricing |
| **Referral potential** | 6 | Power-User-Community teilt Workflows aktiv, wenn der Pain geloest wird |

### 11.2 Assessment Radar (Skala 0-10)

| Axe | Score | Rationale |
|-----|-------|-----------|
| **Brand Fit** | 9 | Passt zum Obsilo-Kern: Zettelkasten-Agent, AI-Assist im Vault |
| **Investment** | 4 | 10-14 Wochen Entwicklungsaufwand, nicht trivial |
| **Asset Fit** | 8 | Bestehende Infrastruktur (Multi-Provider, MCP, Skills, Memory) wird wiederverwendet |
| **Viral Potential** | 5 | Obsidian-Power-User-Community, mittleres Reichweitenpotenzial |
| **New Customer** | 4 | Kein primaeres Akquise-Ziel, eher Retention fuer bestehende Obsilo-User |
| **Market Size** | 6 | Obsidian-Mobile hat Millionen-Nutzer, Power-User-Segment ist kleiner aber relevant |

### 11.3 Price Point & Willingness to Pay

Nicht relevant im aktuellen Scope. Obsilo ist privat + Community-
BRAT.

### 11.4 Channels

| Kanal | Zweck | Prioritaet |
|-------|-------|------------|
| Eigen-Nutzung auf Sebastian's Geraeten | Alpha-Validierung | H |
| BRAT obsilo-dev Pre-Release | Community-Waves (P2) | H |
| Obsidian Discord / Reddit | Mobile-Feedback-Kanal | M |
| Obsidian Community Plugin Store (obsilo public) | Langfrist-Kanal, nach Stabilisierung | L (post-MVP) |

### 11.5 Unfair Advantage

- Desktop-Index-Producer plus Mobile-Index-Consumer ist eine
  Architektur, die Cloud-Indexer wie Mem.ai nicht bieten (Privacy-
  Vorteil).
- Obsilo hat bereits 30+ Tools, Memory, Skills, Self-Development.
  Mobile-Companion wird zum differenzierten Feature statt zum
  neuen Produkt.
- Zettelkasten-Respect ist kulturell konsistent mit Obsidian-
  Community.

### 11.6 Revenue Stream

Nicht relevant. Privat-Projekt.

### 11.7 KPIs

Siehe Abschnitt 6.3.

### 11.8 User Experience & Emotion

- **UX:** Mobile-First-Capture, Voice-Button prominent, Inbox-
  Workflow transparent. Desktop-UI unveraendert.
- **Emotion:** "Der Zettelkasten kommt mit." Der User soll sich
  auch unterwegs als produktiver Wissensarbeiter fuehlen, ohne
  den Zwang, am Desktop sitzen zu muessen.

---

## 12. Next Steps

- [ ] Review dieser BA durch Sebastian (Primary-Stakeholder).
- [ ] Offen: Status `Draft` -> `Validated` nach Review.
- [ ] Handoff zu `/requirements-engineering` (EPIC-23, ca. 10
      Features, P0-P2-Matrix).
- [ ] Spike-Phase fuer H-02 (sql.js readonly) und H-03 (Obsidian
      Sync sqlite) vor Architektur-Finalisierung.
- [ ] Post-PoC-Release: Validierung H-08 (Community-Interesse) via
      Discord-Poll und Issue-Monitoring.

---

## Appendix

### A. Glossary

- **Companion-Modus:** Bewusste Scope-Reduktion fuer Mobile. Obsilo
  ist mobil Capture-und-Pre-Wire-Assistent, nicht Full-Parity-Clone.
- **Index-Producer / Index-Consumer:** Architektur-Rollen. Desktop
  schreibt den Semantic-Index, Mobile liest ihn readonly.
- **Verzetteln:** Zettelkasten-Begriff fuer die bewusste Integration
  einer Inbox-Note in den strukturierten Vault mit Tags, Links,
  Atomicity.
- **Inbox-Note:** Eine Note im `Inbox/`-Ordner mit dem impliziten
  Status "noch zu verzetteln". Wird am Desktop finalisiert.
- **Pre-Wire:** Vorarbeit des Agents. Metadaten, Link-Vorschlaege,
  Zusammenfassungen setzen, ohne die finale Verzettelung zu
  erzwingen.

### B. Exploration Board

Die Exploration-Inhalte sind in dieser BA konsolidiert (Personas,
Needs, Insights, HMW, User-Journey). Ein separates
`EXPLORE-23-mobile-support.md` wird angelegt, wenn die Diskussion
in Phase 3 zusaetzliche Discovery-Runden erfordert.

### C. Interview Notes

**Session 1 (2026-04-22):**
- User-Eingangs-Frage: "Ich wuerde gerne, ob Silo auch auf meinem
  Smartphone nutzen koennen. Momentan funktioniert das noch nicht.
  Analysiere bitte mal umfangreich die Code Base, um zu verstehen wo
  momentan Hindernisse und Blocker sind."
- Antwort Primary-Use-Case: siehe Persona P1 Zitat.
- Antwort Zielgruppe: "Obsilo Community (bestehende Desktop-User
  die auch mobil wollen)" - Dokumentiert als P2 mit
  Validierungs-Hypothese H-08.

### D. References

- Explore-Subagent-Report "As-Is Mobile-Blocker-Report (Obsilo
  v2.6.0)", 2026-04-22. Inline im /dia-guide-Transcript.
- Obsidian Platform API (`Platform.isDesktop`, `Platform.isMobile`).
- MEMORY.md Community-Wave-1 + Wave-4 Eintraege (Community-
  Signale).
- ADR-21 (evaluate_expression + Sandbox) als Referenz-Architektur
  fuer Sandbox-Refactor.
- AUDIT-012 (v2.6.0 pre-release) als aktueller Security-Stand.

---

*Ende BA-23-mobile-support*
