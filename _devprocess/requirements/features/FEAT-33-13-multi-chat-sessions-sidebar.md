---
id: FEAT-33-13
title: Multi-Chat-Sessions in Sidebar (parallele AgentTask-Loops)
epic: EPIC-33
subtype: user-facing
priority: P1
effort: L
asr-refs: []
adr-refs: [ADR-138]
depends-on: []
created: 2026-06-24
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# Feature: Multi-Chat-Sessions in Sidebar (parallele AgentTask-Loops)

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-33-13.
> **Skeleton-Spec** (User-Anforderung aufgenommen 2026-06-24 im Rahmen von FEAT-33-12). Vollstaendige BA + Architektur-Pass via `/business-analysis` + `/requirements-engineering` + `/architecture` ausstehend.

## Feature description

Die Sidebar zeigt heute genau eine aktive Chat-Session. Switch zwischen Konversationen laeuft ueber History -- alte Konversation schliessen, neue aus Memory laden, Kontext-Wechsel-Kosten fuer den User.

FEAT-33-13 fuehrt **mehrere parallele Chat-Sessions** in der Sidebar ein, analog zu Claude Code (mehrere Sessions / Tabs gleichzeitig). Jede Session hat:

- eigene Conversation-History
- eigene `AgentTaskRunner`-Instanz (eigene Model-Calls, eigener Stream-State)
- eigene Settings-Snapshot (Skills/Prompts/Workflows/Model)
- eigene Attachment-Liste

Sessions laufen tatsaechlich parallel: waehrend Session A streamt, kann der User in Session B tippen, ein anderes Tool genehmigen oder ein Markup-Diff annehmen.

## User stories

- **US-33-13-01 (P1 Power-User):** Als Power-User moechte ich mehrere Konversationen parallel in der Sidebar fuehren, damit ich nicht eine laufende Antwort abbrechen muss um eine andere Frage zu stellen.
- **US-33-13-02 (P1 Power-User):** Als Power-User moechte ich per Tab-Leiste (oder Dropdown) zwischen offenen Sessions wechseln, damit ich Kontext-Switches in Sekundenbruchteilen mache statt ueber History laufen zu muessen.
- **US-33-13-03 (P1 Power-User):** Als Power-User moechte ich eine Session schliessen koennen, ohne andere zu beruehren, damit ich Aufraeumen ohne Abbrueche mache.
- **US-33-13-04 (P0 alle Nutzer):** Als Nutzer moechte ich, dass ein eingehender Inline-zu-Sidebar-Handoff (FEAT-33-12) eine eigene Session oeffnet, wenn die aktuelle Session busy ist, damit ich nichts unterbreche.

## Success criteria

| ID | Criterion | Target | Measurement |
|---|---|---|---|
| SC-01 | Mindestens 5 parallele Sessions in einer Sidebar moeglich, ohne sichtbare Performance-Einbusse | 5 Sessions parallel, kein Frame-Drop | Manual + Load-Test |
| SC-02 | Stream in Session A laeuft unbeeintraechtigt weiter, waehrend User in Session B tippt | 100 Prozent kein Stream-Abbruch | Manual |
| SC-03 | Tab-Leiste / Switcher zeigt fuer jede Session Titel + Status-Indikator (idle/streaming/awaiting-tool-approval) | Live-Update der Statusbadges | Manual |
| SC-04 | Inline-Handoff (FEAT-33-12) im busy-Fall oeffnet eine neue Session statt Warning-Modal zu zeigen | 100 Prozent ohne Block | Integration-Test |
| SC-05 | Session-Close persistiert die Konversation in History (existierende Memory-Mechanik); wiederherstellbar via "Resume" | 100 Prozent Persistenz | Manual + Unit-Test |

## Technical NFRs

- **Performance:** je Session ein eigener AgentTaskRunner heisst eigene Stream-Connection plus eigene Memory-Pages. Bei 5 parallelen Sessions sollte der zusaetzliche RAM-Footprint unter 50 MB bleiben.
- **A11y:** Tab-Switcher per Tastatur (Ctrl+Tab / Cmd+Tab in der Sidebar-Surface) navigierbar.
- **Settings:** Default-Tab-Limit (z.B. 10) konfigurierbar zur Eindaemmung von Memory-Drift.

## Architecture pointers (zu verfeinern in /architecture)

- **AgentSidebarView** wird zu einer View, die `Map<sessionId, SessionController>` verwaltet, statt eines einzelnen Controllers.
- **SessionController** = Wrapper um `AgentTaskRunner` + Conversation-State + Surface-DOM.
- **Tab-Bar-UI** als neue Komponente oberhalb des Composers.
- **ADR-138 (Sidebar-Independence):** wird durch FEAT-33-13 nicht gebrochen, eher gestaerkt -- Inline-Chat ist im Prinzip eine weitere Session-Surface, nur ausserhalb der Sidebar gemountet.
- **Memory-System:** existierende History pro Conversation bleibt unveraendert; pro Session eigene Conversation-ID.

## Dependencies

- Keine harten. Eigenstaendig implementierbar.
- **FEAT-33-12** profitiert von FEAT-33-13 (parallele Handoff-Sessions), faellt sonst auf Warning-Modal zurueck.

## Out of scope (Skeleton-Stand)

- Cross-Device-Sync der Multi-Session-State -- spaetere Welle.
- Session-Pinning / Reordering -- spaetere Welle.
- Session-Templates ("start a new session with this skill set") -- spaetere Welle.

## Code Pointer

- Heutiger Single-Session-Pfad: `src/ui/AgentSidebarView.ts`, `src/core/agent/AgentTaskRunner.ts`, `src/core/inline/chat/PanelChatController.ts`.
- Memory-Bridge: zu verifizieren wie History-IDs pro Conversation heute vergeben werden.
