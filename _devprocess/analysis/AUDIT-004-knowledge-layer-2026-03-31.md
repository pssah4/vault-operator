# Security Audit: EPIC-15 Knowledge Layer

**Audit-ID:** AUDIT-004
**Datum:** 2026-03-31
**Scope:** EPIC-15 (FEAT-15-00 bis FEAT-15-08)
**Prüfer:** Claude Code
**Status:** Alle Findings resolved

---

## Zusammenfassung

| Severity | Gefunden | Resolved | Offen |
|----------|----------|----------|-------|
| Critical | 0 | 0 | 0 |
| High | 0 | 0 | 0 |
| Medium | 3 | 3 | 0 |
| Low | 2 | 2 | 0 |
| Info | 5 | - | - |

---

## Findings

### M-1: GraphStore BFS Visited-Set ohne Limit (RESOLVED)

- **CWE:** CWE-400 (Resource Exhaustion)
- **Datei:** `src/core/knowledge/GraphStore.ts:102`
- **Beschreibung:** BFS Visited-Set wuchs ohne Limit, konnte bei stark vernetzten Graphen den Speicher exhaustieren
- **Fix:** `MAX_VISITED = 1000` Hard Limit hinzugefuegt, BFS bricht ab wenn erreicht

### M-2: ImplicitConnection O(n^2) ohne Timeout (RESOLVED)

- **CWE:** CWE-400 (Resource Exhaustion)
- **Datei:** `src/core/knowledge/ImplicitConnectionService.ts:94`
- **Beschreibung:** Paarweise Cosine-Similarity-Berechnung ohne Zeitlimit, konnte bei grossen Vaults die UI fuer Minuten blockieren
- **Fix:** `MAX_COMPUTATION_MS = 60000` (60s) Timeout, Abbruch nach Zeitlimit mit partiellen Ergebnissen

### M-3: VectorStore Cache ohne Groessenlimit (RESOLVED)

- **CWE:** CWE-400 (Resource Exhaustion)
- **Datei:** `src/core/knowledge/VectorStore.ts:201`
- **Beschreibung:** Alle Vektoren wurden in einen einzigen In-Memory-Cache geladen, konnte bei >100K Chunks OOM verursachen
- **Fix:** `MAX_CACHE_VECTORS = 200000` Limit, Warning bei Ueberschreitung, Subset geladen

### L-1: LLM Response Size nicht validiert (RESOLVED)

- **CWE:** CWE-502 (Deserialization of Untrusted Data)
- **Datei:** `src/core/mastery/RecipePromotionService.ts:136`
- **Beschreibung:** LLM-generierte JSON-Responses wurden ohne Groessenpruefung geparsed
- **Fix:** `50000` Zeichen Limit vor `JSON.parse()`

### L-2: Prompt Injection via Vault-Content (RESOLVED)

- **CWE:** CWE-77 (Prompt Injection)
- **Datei:** `src/core/semantic/SemanticIndexService.ts:911`
- **Beschreibung:** Vault-Inhalte wurden unsanitisiert in den Contextual Retrieval Prompt injiziert
- **Fix:** `sanitize()` Funktion entfernt Backticks, Role-Prefixes und begrenzt Laenge

---

## Secure (keine Findings)

| Bereich | CWE | Status |
|---------|-----|--------|
| SQL Injection | CWE-89 | SECURE -- alle Queries parametrisiert |
| Path Traversal | CWE-22 | SECURE -- GlobalFileService H-5 Schutz |
| Information Disclosure | CWE-200 | SECURE -- kein console.log, keine API-Keys geloggt |
| Review-Bot Compliance | - | SECURE -- 0 Errors, 71 Warnings (alle false positives) |
| Unsafe Deserialization | CWE-502 | SECURE -- Type Guards auf allen JSON-Parsen |

---

## Pruefumfang

| Datei | Geprueft |
|-------|----------|
| src/core/knowledge/KnowledgeDB.ts | Ja |
| src/core/knowledge/VectorStore.ts | Ja |
| src/core/knowledge/GraphStore.ts | Ja |
| src/core/knowledge/GraphExtractor.ts | Ja |
| src/core/knowledge/ImplicitConnectionService.ts | Ja |
| src/core/knowledge/RerankerService.ts | Ja |
| src/core/knowledge/MemoryDB.ts | Ja |
| src/core/semantic/SemanticIndexService.ts | Ja |
| src/core/tools/vault/SemanticSearchTool.ts | Ja |
| src/core/storage/GlobalFileService.ts | Ja |
| src/core/mastery/RecipeStore.ts | Ja |
| src/core/mastery/EpisodicExtractor.ts | Ja |
| src/core/mastery/RecipePromotionService.ts | Ja |
| src/core/memory/MemoryService.ts | Ja |
| src/core/memory/LongTermExtractor.ts | Ja |
| src/ui/settings/EmbeddingsTab.ts | Ja |
