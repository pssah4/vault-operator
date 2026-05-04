# ADR-60: Session-Summary Zuverlaessigkeit und Observability

**Date:** 2026-04-03
**Deciders:** Sebastian Hanke

## Context

Der Systemtest 2026-04-03 deckte auf, dass trotz korrekter Settings
(`memory.enabled: true`, `autoExtractSessions: true`) keine Session-Summary
.md-Dateien im `memory/sessions/`-Verzeichnis geschrieben werden (FIX-09).

**Root Cause (gefunden im Coding-Review):** `MemoryService.writeSessionSummary()`
(Zeile 158-171) hat eine `if/return`-Logik: Wenn MemoryDB offen ist (immer seit
FEAT-15-05), wird NUR in die DB geschrieben und per `return` abgebrochen.
Die .md-Datei ist ein Legacy-Fallback der nie greift.

Die Summaries EXISTIEREN in der DB (bis zu 2263 chars). Das Problem ist nicht
der SessionExtractor, sondern der MemoryRetriever-Fallback: `getRecentSessions()`
liest nur .md-Dateien, kennt die DB nicht.

Zusaetzlich sind alle Log-Meldungen des Memory-Systems auf `console.debug` Level,
was bedeutet dass Fehler nur sichtbar sind wenn der User "Verbose" in der Developer
Console aktiviert -- was kein normaler User tut.

**Triggering ASR:**
- ASR-3: Session-Summary-Pipeline muss zuverlaessig funktionieren
- Quality Attribute: Reliability, Observability

## Decision Drivers

- **Zuverlaessigkeit**: Jede Conversation ueber dem Threshold MUSS eine Summary erzeugen
- **Observability**: Fehler muessen sichtbar sein ohne Developer Console
- **Debugging**: Extraction-Status muss fuer Entwickler nachvollziehbar sein
- **User Transparenz**: User soll sehen ob das Memory-System aktiv ist

## Considered Options

### Option 1: Dual-Write (DB + .md-Datei)

`writeSessionSummary()` aendern: Nach dem DB-Write KEIN `return`, sondern
auch die .md-Datei schreiben. Beide Speicherorte bleiben synchron.

- Pro: Bestehender MemoryRetriever-Fallback funktioniert sofort
- Pro: .md-Dateien sind inspizierbar und editierbar
- Con: Redundante Datenhaltung (DB + Filesystem)
- Con: Sync-Probleme moeglich (DB und .md divergieren)

### Option 2: MemoryRetriever auf DB umstellen (kein .md mehr)

`getRecentSessions()` Fallback aendern: Statt .md-Dateien aus dem Filesystem
zu lesen, direkt `SELECT id, summary FROM sessions ORDER BY created_at DESC`
aus der MemoryDB. .md-Dateien werden nicht mehr benoetigt.

- Pro: Single Source of Truth (nur DB)
- Pro: Keine Redundanz, kein Sync-Problem
- Pro: DB-Query ist schneller als Filesystem-Listing
- Con: Sessions sind nicht mehr als .md inspizierbar
- Con: MemoryRetriever braucht Zugriff auf MemoryDB (neuer Constructor-Parameter)

### Option 3: DB-Retriever + optionaler .md-Export

MemoryRetriever liest primaer aus DB. Zusaetzlich: Ein Export-Befehl
in Settings der auf Knopfdruck alle Summaries als .md exportiert.

- Pro: Single Source of Truth + Inspizierbarkeit auf Wunsch
- Con: Mehr Code fuer eine Niche-Funktion

## Decision

**Vorgeschlagene Option:** Option 2 -- MemoryRetriever auf DB umstellen

**Begruendung:**

Die .md-Dateien sind ein Legacy-Pfad aus der Zeit vor der DB-Migration
(FEAT-15-05). Die Summaries existieren bereits vollstaendig in der DB.
Dual-Write (Option 1) wuerde unnoetige Redundanz einfuehren.

Der MemoryRetriever braucht nur einen neuen Constructor-Parameter (MemoryDB)
und eine SQL-Query als Fallback statt Filesystem-Listing.

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final
basierend auf dem realen Zustand der Codebase.

## Implementation Sketch

### Schritt 1: MemoryRetriever DB-Fallback

```typescript
// MemoryRetriever.getRecentSessions() aendern:
// Statt .md-Dateien lesen -> DB-Query
private getRecentSessions(topK: number): Array<{ id: string; excerpt: string }> {
    if (this.memoryDB?.isOpen()) {
        const result = db.exec(
            'SELECT id, summary FROM sessions WHERE summary IS NOT NULL ORDER BY created_at DESC LIMIT ?',
            [topK]
        );
        return result[0]?.values.map(row => ({
            id: row[0] as string,
            excerpt: (row[1] as string) ?? '',
        })) ?? [];
    }
    // Legacy fallback: .md files (unchanged)
    return this.getRecentSessionsFromFiles(topK);
}
```

### Schritt 2: MemoryRetriever Constructor erweitern

```typescript
// Neuer Parameter: memoryDB
constructor(
    private fs: FileAdapter,
    private memoryService: MemoryService,
    private getSemanticIndex: () => SemanticIndexService | null,
    private memoryDB: MemoryDB | null = null,  // NEU
) {}
```

### Schritt 3: Logging-Upgrade

```
console.warn('[Memory] Session extraction failed: {error}')  -- Fehler sichtbar
console.warn('[Memory] No memory model configured')          -- Config-Problem sichtbar
```

### Aenderungen

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `MemoryRetriever.ts` | DB-Fallback + Constructor-Parameter | Medium |
| `AgentSidebarView.ts` | MemoryRetriever-Instanziierung anpassen (memoryDB uebergeben) | Low |
| `ExtractionQueue.ts` | Logging-Upgrade | Low |

## Consequences

### Positive
- MemoryRetriever findet Session-Summaries zuverlaessig (aus DB)
- Single Source of Truth (keine Dual-Write-Redundanz)
- Schnellere Fallback-Query (DB statt Filesystem-Listing)
- Fehler sind sichtbar (Logging-Upgrade)

### Negative
- MemoryRetriever bekommt neue Dependency (MemoryDB)
- Sessions nicht mehr als .md-Dateien inspizierbar (nur via DB)

### Risks
- **MemoryDB nicht offen**: Mitigation durch Legacy-Fallback auf .md-Dateien (bestehender Code bleibt als Fallback)

## Implementation Notes (Coding Review 2026-04-03)

**Root Cause gefunden:** `MemoryService.writeSessionSummary()` (Zeile 158-171) hat
`if (memoryDB.isOpen()) { write to DB; return; }`. Die .md-Dateien sind ein Legacy-Fallback
der seit FEAT-15-05 nie greift. Summaries existieren in der DB (bis 2263 chars).

**Umgesetzt: Option 2** (MemoryRetriever auf DB umstellen):

1. `MemoryRetriever.getRecentSessionsFromDB()`: SQL-Query als primaerer Fallback
2. `MemoryRetriever.getRecentSessionsFromFiles()`: Legacy .md-Fallback bleibt
3. `MemoryService.getStats()`: Zaehlt Sessions aus DB statt .md-Dateien
4. `AgentSidebarView`: MemoryRetriever bekommt `memoryDB` Parameter
5. `ExtractionQueue`: Aussagekraeftigere Warn-Meldungen

**Zusaetzlich entdeckt:** `stats.sessionCount` Gate in AgentSidebarView:1867
pruefte nur .md-Dateien -- MemoryRetriever wurde NIE aufgerufen obwohl Sessions
in der DB waren. Gefixt durch DB-basiertes Counting in getStats().

**Key Files:**
- `src/core/memory/MemoryRetriever.ts` (DB-Fallback + Constructor)
- `src/core/memory/MemoryService.ts` (getStats DB-Counting)
- `src/ui/AgentSidebarView.ts` (memoryDB Parameter)
- `src/core/memory/ExtractionQueue.ts` (Logging)

## Related Decisions

- ADR-13: 3-Tier Memory (Session-Tier muss funktionieren)
- ADR-18: Episodic Memory (haengt von funktionierender Session-Pipeline ab)

## References

- Systemtest 2026-04-03: 0 Session-Summaries trotz 10+ Conversations
- BUG-009-session-summaries-not-written.md (Detaillierte Analyse)
