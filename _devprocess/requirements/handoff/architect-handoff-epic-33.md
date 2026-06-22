# Architect Handoff for EPIC-33: Inline-Editor-AI-Actions

> Handoff von `/requirements-engineering` an `/architecture`. Aggregiert ASRs, NFR-Summary, Constraints, Open Questions. Dialog-Channel fuer bidirektionale Klaerung waehrend der Architektur-Phase.

**Status:** Ready for Architect
**Last update:** 2026-06-22
**Author:** Requirements Engineering (sebastian-claude-opus-4-7)
**Source-BA:** [BA-EPIC-33-inline-editor-ai-actions.md](../../analysis/BA-EPIC-33-inline-editor-ai-actions.md)
**Source-Research:** [RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md](../../analysis/RESEARCH-EPIC-33-inline-ai-competitors-2026-06-22.md)

---

## 1. Scope

- **Scope:** MVP (GA-Feature, Welle-basierte Auslieferung)
- **Main goal:** Markierter Text in einer Note wird zur Eingangstuer fuer elf kuratierte AI-Aktionen. Editor und Chat-Sidebar werden zu zwei gleichwertigen AI-Surfaces mit geteilter Settings-Schicht. Alle Aktionen funktionieren unabhaengig davon ob die Chat-Sidebar offen ist
- **Target release:** v3.0 (Marketing-Name) ueber drei Wellen
  - Welle 1 (P0, 6 FEATs): voll funktionsfaehige Inline-Surface mit Differenzierungs-Ankern (Skills + Vault-Knowledge)
  - Welle 2 (P1, 3 FEATs): Inline-Chat-Innovation + Tool-Parity (Translate, Summarize)
  - Welle 3 (P2, 2 FEATs): nach Beta-Lernen
- **Persona:** P1 Vault Operator-User (Power-User-Wissensarbeiter), GA-Feature ohne Persona-Split

## 2. Architecturally Significant Requirements (ASRs)

> Aus den 11 FEAT-Specs und der EPIC-Spec aggregiert. CRITICAL ASRs MUESSEN je mindestens eine ADR produzieren. MODERATE ASRs werden case-by-case geprueft.

| ID | Source FEATURE | Classification | Constraint | Notes |
|---|---|---|---|---|
| ASR-EPIC-33-01 | EPIC-33 cross, FEAT-33-01 zentral | Critical | **Sidebar-Independence:** alle Inline-Actions ausser FEAT-33-04 funktionieren mit geschlossener Chat-Sidebar. Modell-Provider, Settings-Snapshot, TaskRouter, Skills-System, Streaming-Rendering MUESSEN sidebar-unabhaengig leben | AgentTask-Layer-Inventory in Spike. Wenn aktueller Code an Sidebar-View gekoppelt, Refactoring-Inventory erstellen. Vorbild fuer Editor-State-Mutation ohne View-Bindung: FIX-01-07-03 `refreshOpenMarkdownViewsFor` |
| ASR-EPIC-33-02 | FEAT-33-03 (Rewrite) | Critical | **CodeMirror-6 Diff-Renderer:** Inline-Diff mit added/removed-Markern direkt im Editor-Buffer, Per-Hunk Accept/Reject, Streaming-Render-Latenz <100ms zwischen Token-Arrival und visuellem Update | Eigenbau vs. Library: InlineAI-Plugin-Source als Best-Practice-Referenz. Risiko Editor-State-Korruption bei Stream-Cancel oder Page-Switch. Spike-Phase verifiziert Tragfaehigkeit; Fallback Modal-Preview (Obsidian-Copilot-Style) wenn Inline-Diff nicht traegt |
| ASR-EPIC-33-03 | FEAT-33-05 (Inline-Chat) | Critical | **Conversation-Block-Speicherung:** persistenter Multi-Turn-Block in der Note. Vier Speicher-Strategien zur Wahl, jede mit Folgekosten | Optionen: (a) ephemer im Memory, (b) persistiert in Note-Frontmatter, (c) eigene `.inline-chats.md` mit Note-Anker, (d) Sub-Conversation in History-Pipeline. Auswirkungen auf Search, Recall, Linking, Markdown-Konformitaet. ADR muss explizit eine waehlen und Begruendung dokumentieren |
| ASR-EPIC-33-04 | FEAT-33-09 (Vault-RAG-Lookup) | Moderate | **Vault-Knowledge-RAG-Pipeline:** Semantic-Search der 10.783 Vektoren -> Confidence-Threshold -> LLM-Augmentation -> Quellen-Tooltip | Pipeline-Etappen klar definieren (Embedding-Strategie, Vector-Search-Domain, Filter, Prompt-Augmentation). Confidence-Threshold konfigurierbar (Default cosine-similarity >=0.7). Fallback auf LLM-only wenn kein Treffer ueber Threshold |
| ASR-EPIC-33-05 | FEAT-33-08 (Skills-im-Menu) | Moderate | **Skill-Capability-Filter "inline-action-eligible":** welche Skills tauchen im Floating-Menu auf, wie wird Skill-Input (Selection) uebergeben, welche Output-Modi werden vom Skill deklariert | Schema-Update: Skill-Manifest erhaelt neue Capability-Flag plus optionalen `output_mode`-String (preview-block, inline-diff, side-panel, tooltip). Settings-Surface pro Skill on/off plus Reihenfolge. TOP-N-Cap wenn User viele Skills hat |
| ASR-EPIC-33-06 | EPIC-33 cross, FEAT-33-01, FEAT-33-10 | Moderate | **Settings-Snapshot-Lifecycle:** wann wird der Snapshot aus dem Main-Chat-State gelesen, wann invalidiert | Optionen: (a) pro Action-Trigger frisch lesen, (b) gecached bis Settings-Aenderung-Event, (c) hybrid. Optional Per-Action-Pin (FEAT-33-10) ueberschreibt den Modell-Anteil. Reasoning-Settings (thinking-budget, effort) folgen dem effektiv gewaehlten Modell |

## 3. Non-Functional Requirements summary

> Numbers, not adjectives. Quellen sind die Technical-NFRs der FEAT-Specs.

| Category | Target | Source FEATUREs |
|---|---|---|
| Performance (Trigger-Resolver-Overhead pro Selection-Event) | <5ms | FEAT-33-01 |
| Performance (Time-to-First-Token-Output) | <=3s | alle Action-FEATs |
| Performance (Inline-Diff-Render-Latenz zwischen Token-Arrival und Render) | <100ms | FEAT-33-03 |
| Performance (Floating-Menu Render nach Selection-Event) | <100ms | FEAT-33-01 |
| Availability / Architecture (Sidebar-Independence-Coverage) | 100% der Actions ausser Send-to-Main-Chat laufen mit geschlossener Sidebar | alle 11 FEATs |
| Security (Selection-Inhalt-Behandlung) | identisch zu Chat-Input: Prompt-Injection-Hardening, keine zusaetzliche PII-Exposure | alle Action-FEATs |
| Security (Settings-Snapshot Credential-Handling) | gleiches Schluessel-Material wie Main-Chat, keine erneute Kapselung | FEAT-33-01 |
| Scalability (Note-Groesse, Selection-Laenge) | Cap analog `CONTEXT_DOCUMENT_CHAR_LIMIT` (80k chars) | alle Action-FEATs, besonders FEAT-33-05, FEAT-33-09 |
| Scalability (Skills-im-Menu mit vielen User-Skills) | TOP-N-Cap (Default 10), Reihenfolge ueber Haeufigkeit oder User-Settings | FEAT-33-08 |
| Compatibility (Editor-Modes) | Source-Mode + Live-Preview tragen alle Actions; Reading-Mode traegt Lookup, Send-to-Main-Chat, Translate (read-only); Rewrite/Inline-Chat in Reading-Mode no-op mit User-Hinweis | alle Action-FEATs |
| Compliance (Bot-Compliance) | Obsidian Community Plugin Review-Bot Rules: kein fetch, kein innerHTML, kein direkter Style-Mutation, FileManager.trashFile, kein require ausser Allowlist | alle FEATs |
| Cost-Tracking | Inline-Action-Aufrufe sind ins existierende Cost-Tracking eingehaengt (EPIC-09), Tier pro Action gewaehlt (Haiku fuer Lookup/Translate/Summarize, Default-Tier fuer Rewrite/Chat) | alle Action-FEATs |
| Mobile | Tap-and-hold-Menu als Trigger-UX, Fallback auf Command-Palette wenn System-Selection-Menu nicht ausweicht. Koordination mit FEAT-27-01 | FEAT-33-01 |

## 4. Constraints

- **Stack constraints:** TypeScript strict, Obsidian Plugin API, CodeMirror 6, esbuild. Kein neuer Tech-Stack jenseits dessen was Vault Operator bereits einsetzt. AI-Calls ueber existierende Provider-Infrastruktur (src/api/*.ts), nicht via fetch direkt
- **Integration constraints:** MUSS integrieren mit:
  - AgentTask-Layer (src/core/AgentTask.ts) als sidebar-unabhaengige Action-Pipeline
  - Skills-System (src/services/SkillsService.ts) mit neuem `inline-action-eligible`-Capability
  - TaskRouter (src/services/TaskRouter.ts) fuer Tier-Routing pro Action
  - SemanticIndex (src/services/SemanticIndexService.ts + VectorStore + KnowledgeDB) fuer FEAT-33-09 Vault-RAG
  - Memory v2 + History-Pipeline (EPIC-03 + EPIC-07) fuer FEAT-33-05 Conversation-Block-Indexing
  - Obsidian-Hotkey-Bus und Command-Palette fuer Trigger-Layer
  - CodeMirror 6 Selection-Events und Decorations fuer Floating-Menu und Inline-Diff
- **Operational constraints:** Deployment via Obsidian Community Plugin Marketplace (sync-public CI) und BRAT-Beta-Channel auf vault-operator-dev. Tag-Konvention OHNE v-Prefix
- **Team constraints:** Sebastian solo plus Multi-Agent-Code-Review. Welle-Schnitt erlaubt Iteration, voller Scope (11 FEATs) erwartet 2-3 Releases verteilt
- **Mobile-Constraint:** EPIC-27 Welle 1 laeuft parallel; FEAT-33-01 Mobile-Pattern (Tap-and-hold-Menu) muss mit Platform-Capabilities-Filter aus FEAT-27-01 koordiniert sein

## 5. Open Questions

> Gaps oder Punkte, die die Architektur explizit entscheiden muss. Pending-Entries blockieren nicht das gesamte Handoff, nur die abhaengigen ADRs.

- **Q-EPIC-33-01:** Welche Sidebar-Independence-Architektur? AgentTask direkt instanziieren vs. neuer InlineActionService-Layer als Fassade vs. Refactoring des bestehenden Sidebar-AI-Wirings. Inventory der View-Abhaengigkeiten ist Vorarbeit
- **Q-EPIC-33-02:** Eigenbau-Diff-Renderer vs. Library? InlineAI-Plugin nutzt Custom-CM6-Decorations. Aufwand-Vergleich nach 1-tagigem Spike
- **Q-EPIC-33-03:** Conversation-Block-Speicherung: vier Optionen, welche? Trade-offs: ephemer = einfach, aber Memory-/History-Indexing schwierig. Note-Frontmatter = persistiert sichtbar, aber blaht Frontmatter. `.inline-chats.md` = klar getrennt, aber Markdown-Konformitaet leidet. Sub-Conversation in History-Pipeline = beste Indexierung, aber komplex
- **Q-EPIC-33-04:** Vault-RAG-Embedding-Strategie: nutzt FEAT-33-09 das bestehende Embedding-Modell (qwen3-embedding-8b via OpenRouter, in SemanticIndexService) oder Local-Fallback? Performance-Latenz beim Selection-Embedding ist kritisch (<3s Time-to-First-Token gesamt)
- **Q-EPIC-33-05:** Skill-Capability-Filter konkret: ist `inline-action-eligible` ein boolean oder ein Capability-Object mit weiteren Feldern (output_mode, input_format, max_selection_chars)? Wie wird Selection an Skill-Sandbox uebergeben (string-arg vs. context-injection)?
- **Q-EPIC-33-06:** Settings-Snapshot-Lifecycle: pro Trigger frisch lesen (sicher aber Latenz) oder gecached mit Invalidation auf Settings-Event (schnell aber Stale-Risiko)? Hybrid moeglich?
- **Q-EPIC-33-07:** Hotkey-Defaults: setzen wir Cmd+K und Cmd+L als Default-Bindings (Obsidian-Convention: keine Hard-Defaults, alles ueber Hotkey-Settings rebindbar) oder dokumentieren wir sie nur als Empfehlung?
- **Q-EPIC-33-08:** Telemetrie-Infrastruktur: existiert ein Hook im AgentTask-Layer fuer Cost-Tracking + Token-Counts + Diff-Accept-Rate, oder muss er gebaut werden? Wichtig fuer KPI-Messung in Beta (H-01 Floating-Opt-Out, H-02 Diff-Accept-Rate, H-03 Pin-Nutzung, H-07 Vault-RAG-A/B)
- **Q-EPIC-33-09:** Reading-Mode-Verhalten: Lookup und Translate funktionieren read-only, Rewrite und Inline-Chat nicht. Wie machen wir das UI-konsistent? Floating-Menu blendet inkompatible Actions aus oder zeigt sie disabled mit Hinweis?

## 6. Dialog

> Bidirektionaler Kanal Architekt <-> Requirements Engineer. NOT a blocker - parallele Arbeit an unabhaengigen ADRs laeuft weiter. Append-only.

### Questions from Architect to RE

| ID | Date | Question | Addressed by | Status |
|---|---|---|---|---|
| _(leer beim Handoff-Start)_ | | | | |

### Answers from RE

| ID | Date | Answer | Affected artifacts | Status |
|---|---|---|---|---|
| _(leer beim Handoff-Start)_ | | | | |

---

## 7. Ready-to-design checklist

- [x] Alle Critical ASRs haben quantifizierte Constraints (ASR-EPIC-33-01 .. -03 Critical, -04 .. -06 Moderate)
- [x] NFR-Tabelle hat Zahlen, nicht Adjektive (Latenz <100ms, Time-to-First-Token <3s, Trigger-Overhead <5ms, Coverage 100%)
- [x] Jedes FEATURE listet in Sektion 2 (ASRs) oder 3 (NFRs) auf (11 FEATs, 6 ASRs, 13 NFR-Zeilen)
- [x] Open questions kategorisiert: alle haben Blocker-Status "no" - parallele ADR-Arbeit moeglich, nur die jeweils abhaengige ADR wartet
- [x] Handoff in kanonischem Stil (keine Em-Dashes, keine AI-Vokabular)
- [x] Forbidden-Terms-Check Success Criteria: alle 11 FEATs haben tech-agnostische SC (Tech-Terme nur in Technical NFRs)

## 8. Recommended ADR-Map

> Vorschlag aus der RE-Sicht, welche ADRs entstehen sollten. Die Architektur-Phase trifft die finale Entscheidung.

| Empfohlene ADR | Adressiert | Wellen-Bezug |
|---|---|---|
| ADR-EPIC-33-A Sidebar-Independence-Architektur | ASR-EPIC-33-01 + Q-01 + AgentTask-Inventory | Welle 1 vor FEAT-33-01-Start |
| ADR-EPIC-33-B CodeMirror-6 Inline-Diff-Renderer | ASR-EPIC-33-02 + Q-02 | Welle 1 vor FEAT-33-03-Start (Spike-Output) |
| ADR-EPIC-33-C Settings-Snapshot-Lifecycle | ASR-EPIC-33-06 + Q-06 | Welle 1 mit FEAT-33-01 |
| ADR-EPIC-33-D Skill-Capability-Filter (inline-action-eligible) | ASR-EPIC-33-05 + Q-05 | Welle 1 mit FEAT-33-08 |
| ADR-EPIC-33-E Vault-RAG-Pipeline fuer Lookup | ASR-EPIC-33-04 + Q-04 | Welle 1 mit FEAT-33-09 |
| ADR-EPIC-33-F Conversation-Block-Storage-Strategy | ASR-EPIC-33-03 + Q-03 | Welle 2 vor FEAT-33-05-Start |
| ADR-EPIC-33-G Telemetrie-Hook fuer Inline-Actions | Q-08 | Welle 1 (Querschnitt) |
| ADR-EPIC-33-H Mobile-Pattern (Tap-and-hold + Coordination mit FEAT-27-01) | Mobile-Constraint + Q-09 | Welle 1 mit FEAT-33-01 |

## 9. Spike-Vorschlaege fuer die Architektur-Phase

Beide Spikes sind unabhaengig und lassen sich parallel fahren:

- **Spike A (1-2 Tage):** Sidebar-Independence-Inventory. Grep auf aktuellen AI-Aufruf-Pfaden, View-Abhaengigkeiten kartieren, AgentTask-Instanziierung ohne Sidebar testen. Output: Refactor-Aufwand-Schaetzung
- **Spike B (1-2 Tage):** CodeMirror-6 Inline-Diff-Prototyp. Floating-Menu plus added/removed-Decorations auf einer einzelnen FEAT-33-03-aehnlichen Rewrite-Action. InlineAI-Plugin als Vorbild. Output: Latenz-Messung plus Editor-State-Korruptions-Test

## 10. Recommended Sequence fuer die Architektur-Phase

1. Spike A und B parallel fahren
2. ADRs A-E parallel verfassen (alle haben unabhaengige Q-IDs)
3. ADR-F kann parallel oder spaeter, da FEAT-33-05 erst Welle 2
4. ADR-G und H sind Querschnitt, sollten aber vor FEAT-33-01-Implementation entschieden sein
5. arc42-Update Sections 5 (Bausteinsicht: InlineActionService-Layer, Trigger-Resolver, Floating-Menu-Render-Modul, Inline-Diff-Renderer, Conversation-Block-Persistor) und 9 (Entscheidungen mit allen 6-8 neuen ADRs)
6. plan-context.md mit Wellen-Schnitt, Spike-Output, Implementation-Reihenfolge, Test-Plan

---

**Naechster Schritt:** `/architecture` startet mit Spike A + B parallel, schreibt die 6-8 empfohlenen ADRs (oder begruendet Abweichungen), aktualisiert arc42 Sections 5 und 9, erstellt plan-context-epic-33.md.
