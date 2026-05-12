---
id: FEAT-03-19b
title: Agent-Self Layer (Soul, Capabilities, Self-Awareness)
epic: EPIC-03-context-memory-scaling
priority: P1
effort: M
depends-on: [FEAT-03-18]
related:
  - PLAN-01-memory-v2-master.md (Phase 4.5 -- Soul-Gap before Phase 5)
  - ADR-77-storage-schema.md (profile_id partitioning)
  - ADR-85-soft-delete-cascade.md
---

# Feature: Agent-Self Layer (Soul, Capabilities, Self-Awareness)

> **Feature ID:** FEAT-03-19b
> **Epic:** [EPIC-03 Context, Memory & Scaling](../epics/EPIC-03-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, Phase 4.5 (vor Phase 5)
> **Priority:** P1-High
> **Effort:** M (1 Woche)

## Feature Description

Der Agent (Vault Operator) bekommt einen eigenen, durchsuchbaren Memory-Layer fuer **Selbstverstaendnis, Werte, Anti-Patterns und Capabilities**. Aktuell hat Vault Operator zwei verstreute Quellen: legacy `soul.md` (file-based, nicht v2-integriert) und `communication_styles`-Tabelle (zu kurz fuer Werte/Anti-Patterns). Beide werden durch eine konsolidierte Konvention auf der bestehenden `facts`-Tabelle ersetzt: reservierter `profile_id='_obsilo'`. Damit wandert die Agent-Self-Information in den gleichen Read-/Write-/Aging-Pfad wie User-Facts, ohne neue Tabelle.

Parallel adressiert das Feature die **Self-Awareness-Luecke**, die im Live-Test 2026-04-28 sichtbar wurde: der Agent halluzinierte Features (Star-Button, automatische Extraction-Logik), weil er weder einen verlaesslichen Capability-Snapshot noch ein Tool zum Code-Introspect hatte. Die Loesung ist **Layered Self-Memory**:

| Layer | Inhalt | Quelle | Speicher |
|-------|--------|--------|----------|
| L1 Static Identity | Name=Vault Operator, Type=AI Agent, Host=Obsidian | hardcoded | Bundle |
| L2 Curated Soul | Werte, Anti-Patterns, Persoenlichkeit, Communication-Style | User + Agent (editierbar) | facts(profile_id='_obsilo') |
| L3 Capabilities Snapshot | "Ich kann mark_for_memory; Star ist im Header" | CapabilityManifest beim Plugin-Onload | facts(profile_id='_obsilo', topics=['capability']) |
| L4 Code/Settings Awareness | Aktueller Settings-State, Tool-Inventar, Module-Kurzbeschreibung | runtime-introspection | nicht persistiert |
| L5 Operational State | Queue-Size, aktive Conversation, Mode | runtime | nicht persistiert |

**L1 + L2 sind cache-stabil im System-Prompt verankert** (~150-200 Tokens). L3 ist via Pointer "recall_memory(profile='_obsilo', topics=['capability']) when uncertain about your own features" erreichbar. L4 erhaelt ein neues Tool `inspect_self({area})`, das Settings/Tool-Liste/Module-Header live introspektiert. L5 bleibt ungenutzt fuer dieses Feature, weil operational state in 99% der Faelle ohne Tool-Call sichtbar ist (durch UI-Kontext im Conversation-State).

**`update_soul`-Tool fuer den Agent (B3-Beschluss):** Der Agent kann selbst Eintraege im L2-Layer hinzufuegen, aktualisieren oder deprecaten. Use-Cases: User sagt *"Ich mag es nicht, wenn du Floskeln nutzt -- merk dir das."* Der Agent ruft `update_soul({category:'anti_pattern', text:'Avoid filler phrases ...'})` auf. Tool-Output schreibt einen Fact mit `profile_id='_obsilo'`, `kind='identity'`, `topics=['soul', 'anti_pattern']`, `source_interface='obsilo-self'`.

**Capability-Sync beim Plugin-Update:** Beim `plugin.onload()` berechnet das Plugin einen Hash ueber das `CapabilityManifest`-Modul. Wenn der Hash sich seit `settings.lastCapabilityHash` aendert, wird der bestehende Capability-Snapshot deprecaten und neu geschrieben. Damit ist der Agent nach jedem BRAT-Update automatisch up-to-date, ohne dass irgendwer eine Datei pflegen muss.

**Migration des Legacy-soul.md (Phase-2-Reststueck):** Bestehende `soul.md`-Eintraege werden via einmaliger Migrations-Action ("Import legacy soul.md") als L2-Facts importiert. Danach ist die Datei obsolet und kann manuell archiviert werden. Die `communication_styles`-Tabelle wird **nicht** geloescht (Audit-Trail), sondern nur nicht mehr beschrieben; Reads gehen ab v4-Schema durch L2.

## Benefits Hypothesis

**We believe that** ein konsolidierter Agent-Self-Layer mit Capability-Sync die Halluzinationsrate des Agents bezueglich eigener Features auf null senkt und gleichzeitig dem User erlaubt, Vault Operator Werte und Anti-Patterns zu setzen, die das Verhalten ueber Conversations hinweg pragen.

**Delivers the following measurable outcomes:**

- Hallucinated-Capability-Rate (im Live-Eval-Set): < 1 / 20 Conversations (heute >= 1 / 5)
- Agent-driven Soul-Updates: messbar (count(facts WHERE profile_id='_obsilo' AND source='obsilo-self'))
- System-Prompt-Token-Overhead: <= 220 Tokens (L1+L2 fix); L3 nur on-demand, daher 0 im Default-Case
- Capability-Snapshot-Latenz nach Plugin-Update: < 200ms beim onload (synchron)

**We know we are successful when:**

- Sebastian fragt den Agent "Wie kann ich einen Chat ins Memory speichern?" und der Agent antwortet korrekt ueber den Star-Button + mark_for_memory-Tool, ohne zu raten oder eigene UI-Elemente zu erfinden.
- Sebastian bearbeitet eine Soul-Werte-Liste in den Settings und sieht die Aenderung im naechsten Conversation-Turn im Verhalten.
- Ein Plugin-Update fuegt ein neues Tool hinzu; der Agent erkennt es im naechsten Turn ohne weiteres Eingreifen.

## Acceptance Criteria

### Storage + Schema

1. Reservierter `profile_id='_obsilo'` als Konvention dokumentiert in ADR-77 (kein Schema-Change, nur Konventions-Erweiterung).
2. ContextComposer-Profile-Filter unterstuetzt Mehrfach-Profile gleichzeitig (`profile=['default','_obsilo']`) ODER getrennte compose-Calls -- entscheiden in /architecture.
3. SoulView (Read-API): liest L2-Facts gefiltert auf `profile_id='_obsilo' AND topics CONTAINS 'soul'`, gruppiert nach sub-topic (value/anti_pattern/identity/communication).

### CapabilityManifest

4. `src/core/memory/CapabilityManifest.ts` modul mit kuratierter Liste der Plugin-Features pro Area: tools, ui-elements, settings-keys, mode-tool-groups.
5. Manifest-Hash-Berechnung idempotent; aenderbar nur durch Code-Aenderung (nicht runtime).
6. `plugin.onload()` syncs: deprecate alte Capability-Facts, insert neue, persist hash in settings.

### update_soul Tool (Agent-facing)

7. Tool-Schema: `{ category: 'value'|'anti_pattern'|'identity'|'communication', text: string, importance?: number, supersedes?: number }`.
8. Inserts via FactStore mit `profile_id='_obsilo'`, `source_interface='obsilo-self'`, `kind='identity'`.
9. Wenn `supersedes` gesetzt: alter Fact wird via FactStore.supersede ersetzt.

### inspect_self Tool (Agent-facing, L4)

10. Tool-Schema: `{ area: 'settings'|'tools'|'capabilities'|'code', topic?: string }`.
11. `area='settings'`: liest plugin.settings, filtert sensible Keys (apiKey/Token/Secret), gibt JSON zurueck.
12. `area='tools'`: listet ToolRegistry-Inhalt mit Kurzbeschreibung pro Tool.
13. `area='capabilities'`: shortcut fuer recall_memory(profile='_obsilo', topics=['capability']).
14. `area='code', topic=X`: liest JSDoc-Header der Module in `src/core/<topic>/*.ts` (best-effort, Phase 2).

### System-Prompt-Integration

15. ContextComposer rendert L1 + L2 als `## Identity & Soul`-Section am Anfang des Memory-Blocks (cache-stabil, nicht durch User-Facts unterbrochen).
16. L1 hardcoded; L2 dynamisch aus FactStore mit profile_id='_obsilo'.
17. Pointer-Hint im System-Prompt: *"Use recall_memory(profile='_obsilo') for capabilities, inspect_self for current settings/tools/code."*

### Settings-UI

18. `Settings -> Memory -> Vault Operator's soul` neuer Tab/Section.
19. Liste aller L2-Facts mit Add/Edit/Deprecate per Eintrag.
20. Migration-Button: importiert legacy soul.md einmalig.
21. Read-only-Inspektion der L3-Capabilities (zur Diagnose; "ich sehe was der Agent ueber sich weiss").

### Migration

22. Migration-Action "Import legacy soul.md" -- liest Datei, parst Sections (Identity/Communication/Values/Anti-Patterns), inserts als L2-Facts.
23. Idempotent: Re-run macht keine Duplikate (matcht auf text + topics).
24. communication_styles-Tabelle wird nicht mehr beschrieben (read-only Legacy); SoulView ignoriert sie ab v4.

### Tests

25. Unit: SoulView Read-Pfad mit gemischten profile_id Facts.
26. Unit: CapabilityManifest Hash-Stabilitaet + Insert/Supersede-Logik.
27. Unit: update_soul Tool inserts und supersedes korrekt.
28. Unit: inspect_self filtert sensible Settings.
29. Integration: ContextComposer rendert L1+L2 cache-stabil, KV-Cache-Test bleibt gruen.
30. Eval-Erweiterung: 3+ Fixtures mit Soul-Edits + Capability-Inquiries.

## Out of Scope

- Multi-Agent-Soul (verschiedene Agent-Personas) -- spaeter wenn UCM-multi-host kommt.
- Voll-introspektives Code-Reading (`area='code'` mit Function-Bodies) -- nur JSDoc-Header.
- Eigenstaendiges UI fuer Capability-Editing (Capabilities sind code-derived, nicht user-editable).
- Cross-Vault-Sync der Soul -- jede Vault-Instanz hat eigene Memory-DB, eigene Soul.

## Architecture-Entscheidungen (2026-04-28, /architecture)

A. **profile-Filter-API:** Zwei separate ContextComposer.compose-Calls (Soul + User), Caller konkateniert. Saubere Cache-Trennung pro Block.
B. **L2 Token-Cap:** Top-3 pro Kategorie, max 12 Eintraege gesamt; Ranking nach importance + last_used_at.
C. **Capability-Hash:** djb2 sync, 32-bit. Sync im onload-Pfad, ~100 Eintraege ausreichend kollisionsarm.
D. **inspect_self code-area:** Phase 1 deckt settings + tools + capabilities. Code-Area-Enum bleibt im Schema (forward-compat), Implementation Phase 2.

## Files Likely Touched

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `src/core/memory/SoulView.ts` | NEU | Klein |
| `src/core/memory/CapabilityManifest.ts` | NEU | Klein |
| `src/core/memory/ContextComposer.ts` | Erweiterung Profile-Multi + Soul-Block | Mittel |
| `src/core/tools/memory/UpdateSoulTool.ts` | NEU | Klein |
| `src/core/tools/agent/InspectSelfTool.ts` | NEU | Klein |
| `src/main.ts` | Plugin-Onload Capability-Sync | Klein |
| `src/types/settings.ts` | `lastCapabilityHash` Settings-Feld | Klein |
| `src/ui/settings/MemoryTab.ts` | Soul-Editor-Section | Mittel |
| `src/core/memory/MemoryMigrationJob.ts` | Optionaler Soul-Import | Klein |
| `src/core/tools/types.ts` | 2 neue ToolName-Eintraege | Klein |

## Backlog-Eintrag (geplant)

```
| 4.5 Agent-Self Layer | Planned | FEAT-03-19b | Soul + Capabilities + Self-Awareness via profile_id='_obsilo'-Konvention,
update_soul + inspect_self Tools, CapabilityManifest mit Onload-Sync, Settings-UI fuer Soul-Editor | Phase 4 stabil |
```
