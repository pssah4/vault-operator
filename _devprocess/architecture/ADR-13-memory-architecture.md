# ADR-13: 3-Tier Memory Architecture (Chat -> Session -> Long-Term)

**Datum:** 2026-02-24
**Entscheider:** Sebastian Hanke
**Superseded-by:** ADR-77, ADR-78, ADR-79, ADR-85, ADR-86, ADR-87

---

> **Hinweis:** Diese Entscheidung ist superseded. Die Drei-Tier-Pipeline
> wurde 2026-04 durch den Memory-v2-Stack abgeloest. Die hier
> beschriebenen Module `SessionExtractor.ts`, `LongTermExtractor.ts`,
> `OnboardingService.ts`, `ExtractionQueue.ts` existieren nicht mehr im
> Code. Aktuell gueltige Architektur: ADR-77 (Memory-v2-Storage-Schema),
> ADR-86 (Inference-Pass), ADR-87 (Vault-Note-Memory-Source-Pipeline).

## Kontext

Der Agent soll den Nutzer ueber Sessions hinweg kennenlernen, Praeferenzen,
Projekte, Kommunikationsstil. Ohne persistentes Memory startet jede
Session bei Null. Die Frage ist, wie Wissen aus Gespraechen extrahiert
und langfristig gespeichert wird.

Optionen:

1. Manuelles Memory (Nutzer pflegt Dateien selbst)
2. Rule-basierte Extraktion (Regex / Keyword-Matching)
3. LLM-basierte Extraktion mit 3-Tier-Pipeline
4. Embedding-basiertes Memory (alles in Vektoren)

## Entscheidung (historisch, 2026-02-24)

Option 3, 3-Tier-Pipeline mit LLM-basierter Extraktion.

```
Tier 1: Chat History (ConversationStore) -- volle Konversationen, kurzfristig
Tier 2: Session Summaries -- LLM-Zusammenfassung nach Gespraechsende, semantisch durchsuchbar
Tier 3: Long-Term Memory -- Fakten in persistente Dateien (user-profile.md, projects.md, patterns.md, soul.md)
```

Asynchrone Verarbeitung via persistenter FIFO, ueberlebt Neustarts.

## Begruendung (historisch)

- LLM-Qualitaet erkennt implizite Praeferenzen, die Rule-based verpassen
- 3-Tier-Separation: volle History fuers Debugging, Summaries fuer
  Cross-Session-Kontext, Long-Term fuer Identitaet
- Persistente Queue ueberlebt Obsidian-Neustart
- Long-Term auf 4000 Zeichen begrenzt um System-Prompt nicht zu sprengen
- On-Demand Knowledge ueber semantic_search statt System-Prompt-Injection

## Konsequenzen (historisch)

Positiv:
- Agent lernt organisch aus Gespraechen
- Keine manuelle Pflege noetig
- Crash-sicher dank persistenter Queue
- Memory-Dateien sind Plaintext (inspizierbar, editierbar)

Negativ:
- 2 LLM-Calls pro Konversation
- Extraktionsqualitaet haengt vom Memory-Modell ab
- Merge-Konflikte moeglich bei manueller Datei-Edits

## Warum superseded

Die 3-Tier-Pipeline lieferte die Episodes-Schicht, aber die langfristige
Praezision war ungenuegend. Sessions wurden komprimiert, Atomic Facts
gingen verloren, Cross-Session-Wiederverwendung war schwach. Memory v2
ersetzt die Tier-Trennung durch eine atomic-fact-zentrierte Architektur
mit FactStore plus EdgeStore plus SingleCallExtractor und einer
Vault-Note-Source-Pipeline.

Aktive ADR-Familie ab 2026-04:

- ADR-76: Episode/Fact-Boundary
- ADR-77: Memory-v2-Storage-Schema
- ADR-78: URI-Versioning-Schema
- ADR-79: Knowledge-DB-Haertung
- ADR-85: Soft-Delete-Cascade
- ADR-86: Inference-Pass-Architektur
- ADR-87: Vault-Note-Memory-Source-Pipeline

---

## Implementation Notes (historisch, may go stale)

> Diese Sektion beschreibt den Stand 2026-02-24. Die genannten Dateien
> sind im Code nicht mehr vorhanden. Aktuelle Pfade fuer Memory v2:
> `grep "memory" src/ARCHITECTURE.map`.

Damalige Module (alle entfernt im Memory-v2-Refactor):

- `src/core/memory/MemoryService.ts`
- `src/core/memory/ExtractionQueue.ts`
- `src/core/memory/SessionExtractor.ts`
- `src/core/memory/LongTermExtractor.ts`
- `src/core/memory/MemoryRetriever.ts`
- `src/core/memory/OnboardingService.ts`

Storage: `.obsidian/plugins/obsidian-agent/memory/`.
