---
id: ADR-144
title: Telemetrie-Hook fuer Inline-Actions
date: 2026-06-22
deciders: [Sebastian Hanke, Architecture Agent (Claude Opus 4.7)]
asr-refs: []
feature-refs: [FEAT-33-01, FEAT-33-03, FEAT-33-09, FEAT-33-10]
related-adrs: [ADR-61, ADR-62]
supersedes: null
superseded-by: null
---

# ADR-144: Telemetrie-Hook fuer Inline-Actions

## Context

EPIC-33 fuehrt Inline-Editor-AI-Actions ein, also direkte AI-Aktionen aus dem Markdown-Editor heraus (Lookup, Rewrite, Translate, Inline-Chat und weitere). Das EPIC traegt sieben Critical Hypotheses (H-01 bis H-07), die in einer Beta validiert werden muessen, bevor Inline-Actions als stabil gelten. Ohne dedizierte Telemetrie bleibt offen, ob das Floating Menu akzeptiert wird, wie hoch die Diff-Accept-Rate beim Rewrite ist, ob Per-Action-Pinning genutzt wird, welche TOP-5-Watchlist-Issues in der Praxis auftreten, wie haeufig Sidebar-Independence-Bugs auftauchen und wie stark Vault-RAG-Akzeptanz sich auswirkt.

Heute existiert ein OperationLogger, der Tool-Calls persistiert (Schema, Privacy-Sanitization, Dashboard). Inline-Actions sind keine klassischen Tool-Calls und werden bisher nicht erfasst. Damit fehlt das Datenfundament fuer eine evidenzbasierte Beta-Auswertung.

**Triggering ASR:** Cross-Cutting Quality Concern aus EPIC-33 Beta-Plan. Kein einzelner ASR.

**Quality attribute:** Observability und Cost-Tracking.

## Decision drivers

- **Beta-Validierung von H-01 bis H-07:** Ohne persistierte Metriken pro Inline-Action ist die Beta nicht messbar. Akzeptanz-, Pin- und Diff-Accept-Raten muessen ueber Sessions hinweg auswertbar sein.
- **Privacy by default:** Selection-Inhalt darf niemals in der Telemetrie landen. Sanitization muss aktiv und getestet sein, bevor Events geschrieben werden.
- **Wiederverwendung statt Duplikation:** Schema, Sanitization-Pipeline und Dashboard fuer Tool-Calls existieren bereits. Eine Parallel-Infrastruktur waere teuer und fuegt Wartungs-Oberflaeche hinzu.
- **Additive Schema-Erweiterung:** Bestehende Daten und Konsumenten duerfen nicht brechen. Neue Felder muessen optional sein.

## Considered options

### Option 1: OperationLogger erweitern um Inline-Action-Events

Der bestehende OperationLogger bekommt vier neue Event-Typen (inline_action_triggered, inline_action_accepted, inline_action_rejected, inline_action_pinned) sowie optionale Inline-spezifische Felder. Persistierung laeuft ueber die vorhandene DB, das Dashboard bekommt eine zusaetzliche Sektion.

**Pros:**
- Wiederverwendung der bestehenden Infrastruktur (DB-Schema, Retention-Policy, Privacy-Sanitization, UI).
- Konsistent mit dem bestehenden Tool-Call-Tracking, Reviewer sehen alle Events am gleichen Ort.
- Privacy-Guarantees (PII-Strip vor DB-Write, opt-in Telemetry) gelten automatisch fuer neue Event-Typen.
- Additive Erweiterung, keine Migration noetig, lediglich ein erweiterter event_type-Enum.

**Cons:**
- Das Schema des OperationLoggers wird breiter, das Risiko fuer Schema-Bloat steigt.
- Inline-spezifische Felder belegen Spalten oder ein JSON-Sub-Objekt, das fuer Tool-Calls leer bleibt.

### Option 2: Eigener InlineActionTelemetry-Layer

Ein dedizierter Telemetry-Layer nur fuer Inline-Actions mit eigener DB-Tabelle, eigener Sanitization und eigenem Dashboard.

**Pros:**
- Klare fachliche Trennung zwischen Tool-Calls und Inline-Actions.
- Schema-Freiheit fuer Inline-spezifische Felder, kein Druck zur Generalisierung.

**Cons:**
- Code-Duplikation gegen den OperationLogger (Schema-Bootstrap, Retention, Privacy-Sanitization).
- Privacy-Sanitization muesste erneut implementiert und erneut getestet werden, mit echtem Leak-Risiko bei Drift.
- Dashboard-Aufwand verdoppelt sich, zwei Views fuer ein eng verwandtes Thema.

### Option 3: Lightweight In-Memory-Counter ohne Persistierung

Inline-Actions werden in einem Plugin-State-Counter gezaehlt. Die Anzeige passiert im Settings-UI als reiner Live-Counter.

**Pros:**
- Triviale Implementation.
- Kein Privacy-Risiko, da keine Persistierung stattfindet.

**Cons:**
- Counter geht beim Reload verloren, Cross-Session-Auswertung ist nicht moeglich.
- Beta-Validierung von H-01 bis H-07 nicht durchfuehrbar, weil Aggregation ueber Tage und Sessions fehlt.
- Keine Diff-Accept-Rate, keine Pin-Verteilung, keine Vault-RAG-Akzeptanz auswertbar.

## Decision

Gewaehlt wird Option 1, OperationLogger erweitern.

Begruendung: Die bestehende Infrastruktur deckt Schema, Persistierung, Retention, Privacy-Sanitization und Dashboard ab. Vier neue Event-Typen lassen sich additiv einpflegen, ohne Migration. Option 2 verdoppelt Code und Dashboard ohne fachlichen Mehrwert und vergroessert das Privacy-Leak-Risiko durch Duplikation der Sanitization. Option 3 erfuellt die Anforderung aus dem Beta-Plan nicht, weil H-01 bis H-07 ueber Sessions hinweg gemessen werden muessen.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Beta-Validierung fuer H-01 bis H-07 wird datenbasiert moeglich.
- Das Dashboard zeigt Inline-Action-Metriken neben Tool-Call-Metriken, Reviewer haben einen einzigen Ort fuer Auswertungen.
- Privacy-Sanitization wirkt automatisch fuer neue Event-Typen, weil sie zentral implementiert ist.
- Die Schema-Erweiterung ist additiv, bestehende Konsumenten brechen nicht.

### Negative

- Das OperationLogger-Schema waechst um vier Event-Typen plus optionale Inline-Felder.
- Das Dashboard-UI muss um eine Inline-Action-Sektion erweitert werden.

### Risks

- **Risiko Selection-Leak in Telemetrie:** Wenn Sanitization nicht greift, koennte Selection-Text in die DB gelangen. Mitigation: explizite Sanitization-Tests fuer die neuen Event-Typen, Selection-Text wird grundsaetzlich nicht persistiert, nur Counts, Laengen und Kategorien.
- **Risiko DB-Wachstum:** Bei vielen Inline-Actions pro Session waechst die DB staerker als zuvor. Mitigation: bestehende Retention-Policy (Tages-Snapshots, 7-Tage-Retention) gilt automatisch fuer Inline-Events.
- **Risiko Schema-Bloat:** Inline-Felder bleiben fuer Tool-Call-Events leer. Mitigation: Inline-Metadaten in einem optionalen Sub-Objekt buendeln, statt eigene Top-Level-Spalten anzulegen.

## Implementation Notes

Schema-Erweiterung im OperationLogger (Pfad ueblicherweise `src/services/OperationLogger.ts`):

```ts
interface OperationEvent {
  // ... bestehende Felder ...
  event_type:
    | 'tool_call'
    | 'inline_action_triggered'
    | 'inline_action_accepted'
    | 'inline_action_rejected'
    | 'inline_action_pinned'
  inline_action_id?: string  // z.B. "lookup", "rewrite", "translate"
  inline_action_metadata?: {
    output_mode?: string
    trigger_ux?: 'floating-menu' | 'hotkey' | 'command-palette'
    pin_active?: boolean
    diff_hunk_count?: number
    diff_accept_count?: number
    selection_length?: number  // Anzahl Zeichen, ohne Inhalt
    vault_rag_used?: boolean   // FEAT-33-09
    confidence_threshold_hit?: boolean
  }
}
```

Sanitization: separate Funktion `sanitizeInlineActionEvent()`, die ausschliesslich Counts, Laengen und Enum-Werte uebernimmt und niemals Selection-Text oder LLM-Antwort-Text in das Event uebernimmt. Tests gehoeren in das bestehende Sanitization-Test-File des OperationLoggers.

Dashboard-Erweiterung (vermutlich `src/ui/settings/TelemetryDashboard.ts` oder aequivalent): neue Sektion "Inline Actions" mit Metric-Cards fuer Adoption-Rate (triggered pro Session), Action-Mix (Verteilung ueber inline_action_id), Diff-Accept-Rate (accepted vs rejected fuer Rewrite-Actions), Pin-Usage (pin_active true vs false bei triggered) und Vault-RAG-Hit-Rate (vault_rag_used vs nicht-rag bei lookup).

Aufruf-Sites: die Inline-Action-Pipeline (FEAT-33-01 Floating Menu, FEAT-33-03 Rewrite, FEAT-33-09 Vault-RAG, FEAT-33-10 Pinning) loggt jeweils ein triggered-Event beim Start, ein accepted- oder rejected-Event nach User-Entscheid, und ein pinned-Event bei Pin-Toggle. Die Loops nutzen `void`-Prefix oder `.catch()` fuer Floating-Promise-Compliance.

Retention: die bestehende 7-Tage-Snapshot-Politik des OperationLoggers wird nicht angepasst, die neuen Events fallen automatisch unter die Policy.
