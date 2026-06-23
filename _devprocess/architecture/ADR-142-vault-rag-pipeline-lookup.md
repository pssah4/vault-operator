---
id: ADR-142
title: Vault-RAG-Pipeline fuer Lookup-Action
date: 2026-06-22
deciders: [Sebastian Hanke, Architecture Agent (Claude Opus 4.7)]
asr-refs: [ASR-EPIC-33-04]
feature-refs: [FEAT-33-09]
related-adrs: [ADR-136, ADR-137, ADR-58]
supersedes: null
superseded-by: null
---

# ADR-142: Vault-RAG-Pipeline fuer Lookup-Action

## Context

Die Lookup-Action im Inline-Editor (FEAT-33-09) soll nicht nur generische LLM-Antworten liefern, sondern den Kontext der eigenen Vault einbeziehen. Die Selektion des Users wird als Query gegen den bestehenden Semantic-Index (10.783 Vektoren in der KnowledgeDB) gestellt. Treffer ueber einer Confidence-Schwelle werden in den LLM-Prompt eingewoben, im Tooltip-Result tauchen Quellen-Verlinkungen zu den Original-Notes auf.

Die Marktrecherche zeigt eine klare Differenzierungsluecke: Smart Connections macht Vault-Lookup ohne AI-Synthese, Notion AI Explain ist LLM-only ohne Vault-Bezug. Kein Wettbewerber kombiniert beides direkt in einem Inline-Trigger. Diese Kombination ist eines der Schluesselargumente fuer Vault Operator als AI-Editor.

Die Datengrundlage ist bereits vorhanden: ADR-136 hat die Domain-Diskriminator-Spalte in der KnowledgeDB eingefuehrt, ADR-137 stellt einen Domain-Access-Helper bereit, der pro Layer (note, memory, recipe, history) gezielt nach Vektoren sucht. Neue Storage-Schicht muss nicht entstehen.

**Triggering ASR:** ASR-EPIC-33-04 fordert, dass die Lookup-Action bei Selection mit Vault-Bezug auf eigene Notes referenziert und die Quellen sichtbar macht. Die Pipeline muss reproduzierbar sein (gleiche Selection liefert dieselben Top-N-Sources), darf den LLM-Roundtrip aber nicht unzumutbar verlangsamen.

**Quality attribute:** Differentiation und Performance. Differentiation ueber das einzigartige Feature (Vault-RAG plus LLM-Synthese in einer Action). Performance ueber Latenz-Budget fuer den End-to-End-Lookup.

## Decision drivers

- **Wiederverwendung statt Neubau**: Embedding-Service, VectorStore und Domain-Schema existieren bereits und sind durch andere Features (Semantic Search, Memory v2, Recipe Promotion) belastungsgepruefte Bausteine. Eine Lookup-Pipeline soll diese Bausteine zusammensetzen, nicht parallele Strukturen schaffen.
- **A/B-Testbarkeit fuer H-07**: Die Hypothese "Vault-Knowledge in Lookup steigert die Insert-into-Note-Rate" muss empirisch pruefbar sein. Die Architektur muss erlauben, RAG per Settings-Toggle zu aktivieren oder zu deaktivieren, ohne separate Code-Pfade pflegen zu muessen.
- **Confidence-Threshold als Tuning-Knopf**: Vault-Inhalte variieren stark in Qualitaet und Themenbreite. Ein fester Threshold wuerde fuer manche Vaults zu leer, fuer andere zu fluten. Der Schwellwert muss konfigurierbar bleiben und einen Default haben, der auf einer mittleren Vault-Groesse vernuenftig kalibriert ist.
- **Fail-soft Verhalten**: Wenn der Embedding-Service nicht erreichbar oder das Modell-Tag inkompatibel ist, darf die Lookup-Action nicht brechen. Sie soll auf LLM-only zurueckfallen und die Bedingung transparent kommunizieren.

## Considered options

### Option 1: Synchrone Inline-RAG-Pipeline

Beim Lookup-Trigger laeuft eine lineare Pipeline ab: Selection-Embedding berechnen, Vector-Search gegen die Note-Domain ausfuehren, Treffer ueber Confidence-Threshold filtern, Top-N als Augmentation-Block in den LLM-Prompt einweben, LLM-Call ausloesen und Tooltip mit Result plus Source-Links rendern. Faellt kein Treffer ueber den Threshold, laeuft der LLM-Call ohne Augmentation als reines Lookup.

**Pros:**
- Lineare Pipeline ist gut zu testen, jeder Schritt kann isoliert ueberprueft werden.
- Nutzt bestehende Bausteine ohne Architektur-Bruch.
- A/B-Test fuer H-07 ist trivial ueber Settings-Toggle umsetzbar.
- Confidence-Threshold bleibt konfigurierbar pro User und kann ueber Telemetrie nachjustiert werden.
- Tooltip mit Quellen-Verlinkung schafft Discoverability fuer eigene Notes und gibt dem User Vertrauen.

**Cons:**
- Der Embedding-Roundtrip addiert eine geschaetzte Latenz von 200 bis 500ms vor dem LLM-Call. Bei Cold-Start oder schwacher Verbindung kann es mehr werden.
- Bei einer Selection ohne Vault-Bezug wird das Embedding trotzdem berechnet, der Aufwand ist dann ohne Mehrwert.

### Option 2: Parallele Race zwischen LLM-only und RAG-augmented

Beim Trigger werden zwei LLM-Calls gleichzeitig gestartet. Der LLM-only-Call laeuft direkt los, der RAG-augmentierte Call wartet die Embedding-Suche ab. Die erste vollstaendige Antwort wird angezeigt, die zweite optional als alternative Sicht eingeblendet.

**Pros:**
- Der User sieht immer die schnellste Antwort, die Latenz wird nicht durch den RAG-Roundtrip blockiert.
- Bei vault-fremden Queries gewinnt der LLM-only-Call ohnehin, der RAG-Call kann verworfen werden.

**Cons:**
- Doppelte Token-Cost pro Lookup-Trigger. Auch wenn die Race-Logik den langsameren Call abbrechen kann, ist ein Teil schon bezahlt.
- UX-Komplexitaet: welches Ergebnis ist primaer, wann zeigt man das zweite an, wie unterscheidet der User sie.
- Cancellation-Logik fuer den langsameren Call ist aufwaendig und fehleranfaellig.

### Option 3: Conditional-RAG mit Query-Vorklassifizierung

Vor dem Lookup wird die Selection klassifiziert. Eine Heuristik oder ein kleiner LLM-Call entscheidet, ob die Selection wahrscheinlich Vault-Bezug hat. Nur in diesem Fall wird die RAG-Pipeline aktiviert, sonst lauft ein direkter LLM-only-Call.

**Pros:**
- Spart den Embedding-Roundtrip bei Selections ohne Vault-Bezug.
- Adaptive Latenz, kurze Lookups bleiben kurz.

**Cons:**
- Die Klassifizierung selbst kostet Zeit. Eine Heuristik ist schnell aber unzuverlaessig, ein LLM-Call ist genau aber teuer.
- Fehlentscheidungen der Klassifizierung verlieren den Differenzierungswert (Vault-Treffer wird uebersehen) oder addieren unnoetige Latenz (Vault-RAG laeuft fuer offensichtlich generische Frage).
- Deutlich hoehere Komplexitaet als Option 1, ohne dass der Latenz-Gewinn garantiert ist.

## Decision

Vorgeschlagen wird Option 1: Synchrone Inline-RAG-Pipeline mit Confidence-Threshold-Filter und LLM-only-Fallback bei leerem Treffer-Set.

Begruendung: Die lineare Pipeline ist testbar und nutzt die bereits etablierte Bauweise aus Semantic Search, Memory v2 und Recipe Promotion. ADR-136 und ADR-137 liefern das Daten-Fundament, ein paralleles Schema entsteht nicht. Die Latenz-Kosten von 200 bis 500ms sind im Lookup-Kontext akzeptabel, weil der User bewusst eine Action ausloest und mit einer LLM-Antwort rechnet, nicht mit Instant-Feedback im Sub-100ms-Bereich. Option 2 verdoppelt Token-Kosten ohne klaren UX-Gewinn, Option 3 erkauft Latenz-Optimierung mit hoher Komplexitaet und potenziellen Fehlentscheidungen.

Der Confidence-Threshold ist mit einem Default von 0.7 cosine-similarity vorbelegt. Dieser Wert hat sich in Semantic Search und Recipe Promotion (ADR-58) als praktikabel erwiesen und kann ueber Settings angepasst werden.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Vault-Knowledge wird als first-class Differenzierungs-Feature im Inline-Editor verankert.
- Die Quellen-Verlinkung im Tooltip schafft fuer den User einen sichtbaren Mehrwert und macht eigene Notes nebenbei wieder auffindbar.
- A/B-Tests fuer H-07 sind ueber den Settings-Toggle ohne Code-Duplikation moeglich.
- Wiederverwendung der ADR-136/137-Architektur stabilisiert die Domain-Diskriminator-Entscheidung weiter und vermeidet Schema-Drift.
- Confidence-Threshold und Source-Count als Settings-Knoepfe erlauben User-Tuning und Telemetrie-basierte Default-Anpassung.

### Negative

- Lookup-Latenz steigt um den Embedding-Roundtrip. Bei Selections ohne Vault-Bezug ist dieser Aufwand ohne direkten Mehrwert.
- Bei sehr grossen Vaults muss der Threshold sorgfaeltig kalibriert sein, sonst werden zu viele schwach relevante Notes als Context eingewoben und die LLM-Antwort wird unscharf.
- Die Pipeline ist abhaengig vom Embedding-Service. Bei Ausfall oder Rate-Limit wird der Lookup zum LLM-only-Call degradiert.

### Risks

- **Threshold-Fehlkalibrierung**: Ein zu hoher Threshold leert den RAG-Kontext, ein zu niedriger flutet ihn mit schwach relevanten Notes. Mitigation: Default bei 0.7 verankern, Settings-Override anbieten, Telemetrie ueber die empirische Trefferverteilung sammeln und den Default bei Bedarf nachjustieren.
- **Embedding-Modell-Drift**: Wenn der User das aktive Embedding-Modell wechselt, sind die alten Vektoren mit der neuen Query inkompatibel. Mitigation: VectorStore liefert bereits einen Modell-Tag pro Vector, bei Mismatch fallback auf LLM-only mit Hinweis im Tooltip.
- **Source-Tooltip leakt sensible Notes**: In einer geteilten oder oeffentlichen Vault-Variante koennten Quellen-Links auf private Notes verweisen. Mitigation: Settings-Toggle "Show vault sources in tooltip" mit Default an, der bewusst abgeschaltet werden kann.
- **Latenz-Verschlechterung bei Cold-Start**: Der erste Lookup pro Session kann durch Embedding-Service-Initialisierung deutlich langsamer sein. Mitigation: Embedding-Service beim Plugin-Start vorwaermen, falls Lookup-Action in den Settings aktiviert ist.

## Implementation Notes

Empfohlene Modul-Struktur:

- `src/core/inline/lookup/VaultRagPipeline.ts` (neu): orchestriert die Pipeline-Schritte Embedding, Vector-Search, Confidence-Filter, Prompt-Augmentation, LLM-Call.
- `src/core/inline/lookup/RagConfidenceFilter.ts` (neu): kapselt die Threshold-Logik und liefert eine sortierte Treffer-Liste oberhalb des Schwellwerts.
- `src/core/inline/lookup/RagPromptAugmenter.ts` (neu): baut den Augmentation-Block aus den Top-N-Treffern und fuegt ihn an die bestehende Lookup-Prompt-Struktur an.

Wiederverwendet wird:

- `src/services/SemanticIndexService.ts` fuer den Embedding-Aufruf der Selection.
- `src/services/VectorStore.ts` `findNoteVectors({query, limit, domain})` aus ADR-137 fuer die Domain-spezifische Suche mit `domain="note"`.
- `src/services/KnowledgeDB.ts` als Storage-Layer mit dem Domain-Diskriminator-Schema aus ADR-136.

Neue Settings-Felder in `main.ts` data.json:

- `inlineLookupUseVaultRag: boolean` (Default `true`).
- `inlineLookupConfidenceThreshold: number` (Default `0.7`).
- `inlineLookupSourceCount: number` (Default `5`).
- `inlineLookupShowSourcesInTooltip: boolean` (Default `true`).

Telemetrie fuer den H-07-A/B-Test: pro Lookup-Action die Felder ragActive, sourceCount, insertedIntoNote, followUpAction loggen. Aggregation laeuft ueber die bestehende HistoryDB-Pipeline aus Memory v2 Phase 6.
