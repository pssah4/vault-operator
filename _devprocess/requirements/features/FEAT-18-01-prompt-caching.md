# Feature: Prompt Caching (Provider-agnostisch)

> **Feature ID**: FEAT-18-01
> **Epic**: EPIC-18 - Token-Kostenreduktion
> **Priority**: P0-Critical
> **Effort Estimate**: S (1-3 Tage)

## Feature Description

Vault Operator soll den System Prompt so strukturieren dass Provider-seitiges Prompt Caching
maximal effektiv ist, und einen generischen Caching-Mechanismus bereitstellen der
mit jedem Provider funktioniert -- ohne Provider-spezifische Feature-Arbeit bei
jedem neuen Provider.

Die Kernidee: Alle Provider die Caching unterstuetzen (Anthropic, OpenAI, DeepSeek,
Gemini) profitieren von demselben Prinzip: **stabiler Prompt-Prefix**. Wenn der
Anfang des System Prompts ueber Iterationen identisch bleibt, cached der Provider
diesen Anteil automatisch (OpenAI, DeepSeek) oder auf explizite Markierung (Anthropic).

Die Implementierung besteht aus:
1. **Prompt-Reordering**: Stabile Sections zuerst, dynamische zuletzt (Provider-agnostisch)
2. **Cache-Hint-Abstraktion**: Ein Interface das Provider-spezifische Caching-Marker
   injiziert (Adapter-Pattern). Neuer Provider = kleine Adapter-Klasse, kein neues Feature.

## Benefits Hypothesis

**Wir glauben dass** generisches Prompt Caching
**folgende messbare Outcomes liefert:**
- 50-90% Kostenreduktion auf den stabilen System-Prompt-Anteil (Provider-abhaengig)
- Automatische Aktivierung bei jedem kompatiblen Provider
- Zero Maintenance bei neuen Providern (nur Adapter registrieren)

**Wir wissen dass wir erfolgreich sind wenn:**
- Provider melden Cache-Hits (wo sichtbar)
- Kein Funktionsverlust bei Providern ohne Caching (Graceful Degradation)
- Neuer Provider mit Caching-Support erfordert nur einen Adapter (<50 Zeilen)

## User Stories

### Story 1: Automatische Kostenoptimierung
**Als** Vault Operator-Nutzer
**moechte ich** dass das Plugin automatisch Prompt Caching nutzt wenn mein Provider es unterstuetzt
**um** geringere API-Kosten zu haben ohne etwas konfigurieren zu muessen

### Story 2: Provider-Unabhaengigkeit
**Als** Vault Operator-Nutzer der den Provider wechselt
**moechte ich** dass Caching bei jedem unterstuetzten Provider sofort funktioniert
**um** mich nicht an einen bestimmten Provider binden zu muessen

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Der stabile Anteil der Systemnachricht bleibt ueber alle Schritte einer Sitzung identisch | >95% Prefix-Stabilitaet | Vergleich des Prompt-Anfangs ueber Iterationen |
| SC-02 | Kostenreduktion bei unterstuetzten Anbietern messbar | >40% auf stabilen Anteil | Kosten-Vergleich vorher/nachher |
| SC-03 | Keine Konfiguration durch den Nutzer erforderlich | Zero-Config | Automatische Aktivierung bei kompatiblem Provider |
| SC-04 | Hinzufuegen eines neuen Providers mit Caching erfordert minimalen Code | <50 Zeilen Adapter-Code | Code-Review bei neuem Provider |

---

## Technical NFRs (fuer Architekt)

### Architecture
- **Adapter-Pattern**: `PromptCacheAdapter` Interface mit `applyCacheHints(messages)` Methode
- **Provider-Detection**: ApiHandler meldet ob Caching unterstuetzt wird (`supportsCaching: boolean`)
- **Prompt-Reordering**: systemPrompt.ts ordnet Sections: stabile zuerst, dynamische zuletzt
- **Kein Fallback noetig**: Ohne Adapter passiert nichts (Prompts gehen normal durch)

### Bekannte Provider-Mechanismen
- **Anthropic**: Explizite `cache_control: { type: "ephemeral" }` Breakpoints im Messages-Request
- **OpenAI**: Automatisches Prefix-Caching (50% Rabatt bei identischem Prefix >=1024 Tokens)
- **DeepSeek**: Automatisches Prefix-Caching (90% Rabatt)
- **Gemini**: Context Caching API (TTL-basiert, eigener Mechanismus)
- **GitHub Copilot**: Kein Einfluss (Gateway-managed)
- **Ollama/LM Studio**: Irrelevant (lokal, keine Kosten)

### Prompt-Section-Reihenfolge (optimiert fuer KV-Cache, Manus Context Engineering)

KRITISCH: Ein einziger veraenderter Token im Prefix invalidiert den GESAMTEN
Cache fuer alles danach. Daher: Alles Dynamische ans Ende.

```
STABIL (cached, aendert sich nie innerhalb einer Task-Session):
  1. Mode Definition
  2. Capabilities
  3. Obsidian Conventions
  4. Tools Section (47 Tools -- groesster stabiler Block, ~8k Tokens)
  5. Tool Routing Rules
  6. Objective
  7. Response Format
  8. Security Boundary
  --- CACHE BREAKPOINT ---

DYNAMISCH (nicht cached, kann sich pro Message/Session aendern):
  9. Plugin Skills (aendert sich wenn Plugins enabled/disabled werden)
  10. Active Skills (pro Message unterschiedlich via LLM-Klassifikation)
  11. Memory Context (aendert sich ueber Sessions)
  12. Procedural Recipes (pro Message unterschiedlich)
  13. Self-Authored Skills
  14. Custom Instructions + Rules
  15. Vault Context (Dateistruktur kann sich aendern)
  16. DateTime (MUSS am Ende stehen -- Zeitstempel invalidiert Cache!)
```

WICHTIG: DateTime steht aktuell an Position 1 und zerstoert den Cache bei
JEDEM Call. Muss ans Ende verschoben werden. Plugin Skills wurden bewusst
in den dynamischen Block verschoben (koennen sich zwischen Tasks aendern).

---

## Architecture Considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR #1**: Prompt-Reordering darf die Agent-Qualitaet nicht veraendern
- **Warum ASR**: Aktuelle Section-Reihenfolge nutzt "Primacy Effect" (Skills zuerst).
  Aber Manus-Erkenntnis zeigt: KV-Cache-Stabilitaet ist wichtiger als Primacy Effect,
  weil instabiler Cache 10x teurer ist.
- **Impact**: Wenn Skills nach hinten rutschen, koennte der Agent sie seltener befolgen.
  Muss empirisch getestet werden. Alternativ: Skills-Precedence via todo/reminder
  am Ende erzwingen (Recency Bias statt Primacy Effect).
- **Quality Attribute**: Correctness + Cost Efficiency

**MODERATE ASR #2**: Cache-Adapter darf API-Call-Semantik nicht veraendern
- **Warum ASR**: Cache-Hints sind Metadaten, keine Content-Aenderungen
- **Impact**: Adapter darf nur Metadaten hinzufuegen, nie Content aendern
- **Quality Attribute**: Correctness

### Open Questions fuer Architekt
- Veraendert die Section-Umordnung (Skills nach hinten) das Agent-Verhalten messbar?
- Soll der Cache-Breakpoint nach den Tools oder nach den Rules gesetzt werden?
- Wie gross ist der stabile Prefix-Anteil in Tokens? (bestimmt die Cache-Effektivitaet)

---

## Definition of Done

### Functional
- [ ] Prompt-Sections in Cache-freundlicher Reihenfolge
- [ ] Anthropic-Adapter sendet cache_control Breakpoints
- [ ] OpenAI/DeepSeek profitieren von stabilem Prefix (verifiziert)
- [ ] Provider ohne Caching funktionieren unbeeintraechtigt

### Quality
- [ ] Vergleichstest: Identische Agent-Ergebnisse mit neuer Section-Reihenfolge
- [ ] Kosten-Messung: Nachweisbare Reduktion bei Anthropic

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] ADR fuer Caching-Architektur und Prompt-Reordering
- [ ] Provider-Kompatibilitaetsmatrix dokumentiert

---

## Dependencies
- **Provider-Abstraktion (ApiHandler)**: Muss Caching-Hints durchreichen koennen
- **systemPrompt.ts**: Section-Reihenfolge muss anpassbar sein

## Out of Scope
- Client-seitiges Response-Caching (anderer Scope)
- Caching von Tool-Results (FEAT-18-02)
- Gemini Context Caching (TTL-basiert, eigener Mechanismus -- spaeter evaluieren)
