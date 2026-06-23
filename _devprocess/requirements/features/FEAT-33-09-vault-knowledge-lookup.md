---
id: FEAT-33-09
title: Vault-Knowledge-Integration im Lookup (RAG-Pipeline)
epic: EPIC-33
subtype: user-facing
priority: P0
effort: M
asr-refs: [ASR-EPIC-33-04]
adr-refs: []
depends-on: [FEAT-33-02]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# Feature: Vault-Knowledge-Integration im Lookup (RAG-Pipeline)

> Backlog row: `_devprocess/context/BACKLOG.md` -> FEAT-33-09
> (status, phase, claim, last-change live there).

## Feature description

Das Lookup auf markiertem Text aus FEAT-33-02 ist im Default ein reiner LLM-Call. Die markierte Phrase landet als Frage im Modell, das Modell antwortet aus seinem Trainingsstand. Power-User mit kuratiertem Vault haben in ihren Notes oft die bessere Antwort, weil dort projekt- und vault-spezifisches Wissen liegt, das das Foundation-Model nicht kennt (eigene Definitionen, interne Entscheidungen, persoenliche Begriffsverwendung). Dieses Wissen bleibt im Default-Lookup ungenutzt.

Das Feature erweitert die Lookup-Action um eine RAG-Pipeline ueber den bestehenden Vault-Index (10.783 Vektoren in der KnowledgeDB). Vor dem LLM-Call laeuft ein Semantic-Search-Pass mit dem Selection-Text als Query gegen die `domain='note'`-Vektoren. Treffer ueber einem Confidence-Threshold werden als Snippet-Kontext in den Prompt eingebettet. Das LLM erklaert den Begriff dann praeferenziert anhand der Vault-Quellen und der Output-Tooltip im Preview-Block zeigt verlinkte Quell-Notes mit Titel und Excerpt. Wenn kein Treffer die Confidence-Schwelle erreicht, faellt die Pipeline auf den reinen LLM-Call zurueck und markiert den Output entsprechend.

Das ist eine kompetitive Differenzierung: Smart Connections macht Vault-Lookup ohne AI als read-only Decorator, Notion "Explain this" ist ein LLM-only-Call ohne Vault-Anbindung. Vault Operator verbindet beides in einer einzigen Action.

## Benefits hypothesis

**We believe that** ein Lookup, das Vault-Wissen aktiv konsultiert bevor es das LLM fragt,

**delivers the following measurable outcomes:**

- Antworten werden vault-spezifisch korrekt (eigene Definitionen, projekt-interne Begriffe) statt generisch aus dem Foundation-Model
- User finden eigene fruehere Notes wieder, ohne aktiv suchen zu muessen (Lookup als Wiederentdeckungs-Layer)
- Insert-into-Note-Rate steigt, weil vault-konsistente Antworten oeftere uebernommen werden als generische

**We know we are successful when:**

- In der Beta-A/B-Messung liegt die Insert-into-Note-Rate fuer den Vault-RAG-Arm mindestens 15 Prozentpunkte ueber dem LLM-only-Arm (Validierung H-07)
- In >=60% aller Lookups auf einem aktiven Vault findet die Pipeline mindestens einen Treffer ueber dem Confidence-Threshold
- User berichten in qualitativem Feedback, dass das Lookup "die richtige Note vorschlaegt" (mindestens 5 von 10 Beta-Tester nennen dieses Verhalten unprompted)

## Jobs to be Done (from BA Section 5.4)

| Job type   | Job                                                                                          | Addressed in story |
|------------|----------------------------------------------------------------------------------------------|--------------------|
| Functional | Einen Begriff im Kontext der eigenen Wissensbasis erklaert bekommen, nicht generisch aus dem Trainingsstand des Modells | Story 1            |
| Functional | Vergessene oder verstreute eigene Notes zu einem Thema wiederfinden, ohne aktiv zu suchen   | Story 2            |
| Emotional  | Das Gefuehl haben, dass das eigene Wissens-System mitdenkt statt nur Text zu generieren     | Story 3            |

## User stories

### Story 1: Vault-konsistente Erklaerung (Functional Job)

**As a** Knowledge-Worker mit kuratierten eigenen Definitionen im Vault
**I want to** beim Lookup auf einen Begriff eine Erklaerung sehen, die meine eigenen Notes als Quelle einbezieht
**so that** die Erklaerung zu meinem bestehenden Verstaendnis und meinen frueheren Entscheidungen passt statt einer generischen Lehrbuch-Antwort

### Story 2: Wiederentdeckung eigener Notes (Functional Job)

**As a** Power-User mit mehreren tausend Notes
**I want to** beim Lookup automatisch sehen, welche meiner Notes zum markierten Begriff existieren
**so that** ich ohne aktive Suche zu den passenden Quellen springen kann und mein eigenes Wissen wieder finde

### Story 3: Mitdenkendes Vault-System (Emotional Job)

**As a** Power-User, der seinen Vault als Second Brain betrachtet
**I want to** dass eine AI-Action mein Wissens-System aktiv konsultiert statt es zu ignorieren
**so that** ich das Plugin als Verlaengerung meines Vaults erlebe und nicht als externes Werkzeug, das parallel dazu lebt

---

## Success criteria (tech-agnostic)

> Keine Implementierungs-Details. Schwellen, Modell-Tiers und konkrete Latenz-Zahlen leben in den Technical NFRs.

| ID    | Criterion                                                                                                | Target                                  | Measurement |
|-------|----------------------------------------------------------------------------------------------------------|-----------------------------------------|-------------|
| SC-01 | Wenn der Vault relevantes Wissen zum markierten Begriff enthaelt, zeigt die Lookup-Antwort dieses Wissen | In >=60% der Lookups auf einem aktiven Vault wird mindestens eine Vault-Quelle einbezogen | Telemetry-Counter "lookup_with_vault_sources" / "lookup_total" |
| SC-02 | Die Antwort verweist transparent auf die genutzten Vault-Quellen mit Titel und Sprung-Moeglichkeit       | 100% der Antworten mit Vault-Anteil zeigen Quellen-Anhang | Visuelle Inspektion in 20 Beta-Sessions, Quellen-Anhang muss bei jeder vault-augmentierten Antwort sichtbar sein |
| SC-03 | Wenn kein vault-relevantes Wissen existiert, faellt die Antwort auf den reinen LLM-Pfad zurueck         | 0 Faelle, in denen die Action wegen leerer Vault-Suche fehlschlaegt | Logging der Fallback-Pfad-Aktivierung, kein Error-Surface |
| SC-04 | Vault-augmentierte Antworten fuehlen sich konsistent mit dem eigenen Vault-Verstaendnis an              | Beta-A/B: Insert-into-Note-Rate Vault-Arm vs. LLM-only-Arm >=+15 Prozentpunkte | A/B-Cohort-Split 50/50 ueber Beta-Phase, Counting der Accept-Aktion pro Arm |
| SC-05 | Das Lookup-Erlebnis fuehlt sich nicht spuerbar langsamer an als der reine LLM-Lookup                    | Erste sichtbare Tokens <=300ms nach LLM-only-Baseline | Vergleichsmessung der Time-to-First-Token in der Beta-Telemetry |

---

## Technical NFRs (for the architect): technology terms allowed

### Performance

- Vault-Search-Pass: <=120ms p95 fuer Selection bis 200 Tokens (Vector-Lookup via VectorStore.findNoteVectors gegen 10.783 Vektoren, Cosine-Similarity-Threshold default 0.7)
- Augmented-Prompt-Konstruktion: <=20ms p95 (Snippet-Konkatenation, Token-Budget-Trimming)
- Tier-Routing bleibt Haiku-Tier (Lookup-Default aus FEAT-33-02), Vault-Quellen kompensieren die Modell-Groesse fachlich
- Time-to-First-Token: <=300ms zusaetzliche Latenz gegenueber LLM-only-Baseline (SC-05)
- Token-Budget pro Snippet-Block: TOP-3 Treffer, je <=400 Tokens, Gesamtbudget <=1500 Tokens

### Security

- Vault-Snippets bleiben lokal: der Prompt mit eingebetteten Snippets geht an den Provider, der bereits in den Settings akzeptiert ist. Kein neuer Provider, keine neue Trust-Boundary
- Keine neuen Embedding-Calls an externe Services: bestehende Embedding-Pipeline (qwen3-embedding-8b via OpenRouter, oder Fallback) wird wiederverwendet
- Selection-Text und Snippets werden nicht in einem persistenten Cache abgelegt, die RAG-Pipeline ist stateless pro Action

### Scalability

- Vault-Groesse: getestet bis 10.783 Vektoren (Sebastians Vault), muss bis 100k Vektoren lauffaehig bleiben ohne Latenz-Verdopplung
- Concurrent-Lookups: bis 3 parallele Lookups (User markiert schnell hintereinander). Vector-Store muss thread-safe lesen, Embedding-Pipeline darf serialisieren
- A/B-Test-Hook: 50/50-Cohort-Split fuer H-07-Validierung, Cohort-Zuweisung deterministisch ueber User-Hash, kein Server-Roundtrip

### Availability

- Fallback-Pfad muss bei jedem Vault-Search-Fehler greifen (DB-Lock, Embedding-Failure, leere Treffermenge). Lookup darf nie wegen Vault-Layer-Problemen fehlschlagen
- Settings-Toggle "Use Vault knowledge in Lookup" deaktiviert die gesamte Pipeline ohne Restart (Live-Read der Settings beim Trigger)
- KnowledgeDB-Lock-Konflikte (parallele Plugin-Instanz, Migration) loesen still den Fallback aus, nicht den Error-Surface

---

## Architecture considerations

### Architecturally Significant Requirements (ASRs)

**CRITICAL ASR-EPIC-33-04 (Vault-Knowledge-RAG-Pipeline):** Erweiterung der Lookup-Action um eine RAG-Stufe auf dem bestehenden Vault-Index

- Why ASR: bringt die KnowledgeDB-Leseschicht (VectorStore mit domain-Diskriminator aus FEAT-03-27) in einen synchronen User-Pfad mit harten Latenz-Anforderungen (<=300ms zusaetzlich). Bisher wird die KnowledgeDB ueberwiegend in asynchronen Pfaden gelesen (RecallEngine, semantic_search Tool). Synchroner Zugriff im Editor stellt neue Anforderungen an Caching und Lock-Verhalten.
- Impact: Architekt muss entscheiden, ob (a) der bestehende VectorStore direkt aus dem Editor-Action-Pfad aufgerufen werden darf, (b) ein dedizierter LookupRAGService als Vermittler eingezogen wird, oder (c) ein In-Memory-Cache fuer haeufige Queries vorgeschaltet wird. Betrifft auch die Frage, wie die Embedding-Pipeline (qwen3-embedding-8b) im Editor-Pfad reagiert, wenn das Embedding-Modell nicht verfuegbar ist.
- Quality attribute: Performance + Availability

**MODERATE ASR-EPIC-33-04-A:** Confidence-Threshold-Konfigurierbarkeit

- Why ASR: ein fester Schwellwert (0.7) passt nicht zu allen Vaults. Vaults mit vielen kurzen Notes erzeugen schwaechere Vector-Treffer als Vaults mit langen Konzept-Notes. Der Architekt muss klaeren, ob der Schwellwert in den Settings exponiert wird oder ob die Pipeline ihn adaptiv lernt.
- Impact: betrifft die Settings-Surface von FEAT-33-02 und die Telemetry-Struktur (Schwellwert muss pro Action mitgeloggt werden, um die H-07-Validierung sauber zu interpretieren)
- Quality attribute: Configurability + Measurability

**MODERATE ASR-EPIC-33-04-B:** Output-Quellen-Anhang im sidebar-unabhaengigen Renderpfad

- Why ASR: der Quellen-Anhang muss im Editor-Widget (CodeMirror-Decoration oder Inline-Tooltip) klickbare Links auf die Quell-Notes anzeigen, ohne dass die Chat-Sidebar offen sein muss (Cross-FEAT-Constraint 1+3). Der Klick muss die Note in einem neuen Tab oeffnen, ohne den Editor-Fokus auf der Selection zu zerstoeren.
- Impact: betrifft den Editor-Widget-Layer aus FEAT-33-02 und die Workspace-API-Nutzung (open in new leaf ohne Active-Leaf-Switch)
- Quality attribute: Usability + Sidebar-Independence

### Constraints

- Technology: VectorStore aus src/services/SemanticIndexService.ts mit domain='note'-Filter (FEAT-03-27 Layer-Trennung). Keine neue Embedding-Engine.
- Platform: Editor-Action-Pfad ist synchron aus User-Sicht, der Vault-Search muss asynchron geschehen aber innerhalb des angekuendigten Latenz-Budgets bleiben
- Compliance: Bot-Compliance (kein fetch, kein innerHTML im Quellen-Anhang, FileManager-konform). Kein require ausser Allowlist

### Open questions for architect

- **Confidence-Threshold:** fester Default (0.7) versus Settings-exponiert versus adaptiv. Welche Variante balanciert Beta-Validierung und User-Kontrolle?
- **Cache:** soll ein In-Memory-LRU-Cache fuer haeufige Lookups eingezogen werden? Bei Power-User-Sessions wiederholen sich Selections oft.
- **Embedding-Fallback:** was passiert wenn das Embedding-Modell offline ist (qwen3-embedding-8b via OpenRouter)? Fallback auf lokale Embedding-Engine, oder direkt LLM-only-Pfad?
- **Quellen-Anhang-Granularitaet:** Note-Titel + 1-Zeilen-Excerpt, oder Titel + 3-Zeilen-Excerpt, oder klickbarer Header mit Hover-Vorschau? Welche Form fuehrt zu hoeherer Click-through-Rate auf die Quelle?
- **A/B-Cohort-Persistenz:** Cohort-Zuweisung fuer H-07 ueber User-Hash deterministisch, oder per-Action zufaellig? Letzteres erhoeht statistische Power, kann aber User-Verwirrung produzieren wenn dieselbe Selection unterschiedliche Antworten gibt.
- **Reranker:** soll der Cross-Encoder-Reranker aus Retrieval Wave 1 die TOP-3 vor dem Prompt nochmal scoren, oder verletzt das das Latenz-Budget?

---

## Definition of Done

### Activation Path (mandatory)

- **Type:** Settings-Toggle + Implizite Aktivierung
- **Identifier:** Settings-Pfad `Inline AI > Lookup > Use Vault knowledge` (default an)
- **Where:** wirkt im Lookup-Action-Pfad aus FEAT-33-02, in jedem Editor-Kontext (Markdown-View, Daily-Note, Canvas-Card-Edit)
- **How:** Ist FEAT-33-02 Lookup ausgeloest und der Toggle an, laeuft die RAG-Pipeline vor dem LLM-Call. Ist der Toggle aus oder die Vault-Search liefert keinen Treffer ueber Schwelle, faellt die Pipeline still auf den reinen LLM-Pfad zurueck. Beta-Phase: 50/50-A/B-Cohort-Split fuer H-07-Validierung, danach Cohort-Hook deaktiviert.

### Functional

- [ ] Alle User Stories implementiert
- [ ] Alle Success Criteria SC-01 bis SC-05 erfuellt (verifiziert)
- [ ] Settings-Toggle `Use Vault knowledge in Lookup` in der FEAT-33-02-Settings-Surface sichtbar und live-wirksam
- [ ] Fallback-Pfad auf LLM-only greift bei (a) Toggle aus, (b) leerer Treffermenge ueber Schwelle, (c) Vault-Search-Fehler
- [ ] Quellen-Anhang im Output-Block zeigt Note-Titel und Excerpt, Klick oeffnet die Note in neuem Tab ohne Editor-Fokus zu verlieren
- [ ] A/B-Cohort-Hook fuer H-07-Validierung aktiv in der Beta-Phase, danach deaktivierbar via Build-Flag oder Settings

### Quality

- [ ] Unit Tests: Confidence-Filter, Snippet-Trimming, Fallback-Pfad-Auswahl
- [ ] Integration Tests: Vault-Search gegen Test-VectorStore mit synthetischen Note-Embeddings, Treffer-Reihenfolge stabil
- [ ] Performance Tests: Time-to-First-Token-Delta gegen LLM-only-Baseline innerhalb +300ms (SC-05)
- [ ] **Sidebar-Independence-Check:** Lookup mit Vault-Augmentierung funktioniert mit geschlossener Chat-Sidebar, Quellen-Anhang ist klickbar und oeffnet Note ohne Sidebar zu involvieren
- [ ] Bot-Compliance: keine fetch/innerHTML/Style-Mutation/require-Verstoesse im Quellen-Anhang-Renderer

### Documentation

- [ ] Backlog row updated auf Status `Done`, Commit-SHA recorded
- [ ] FEAT-33-02-Spec referenziert FEAT-33-09 als Augmentierungs-Layer
- [ ] Settings-Beschreibung im Plugin (englisch) erklaert den Toggle in einem Satz
- [ ] ARCHITECTURE.map updated falls ein neuer LookupRAGService eingezogen wird

---

## Hypothesis validation (if applicable)

Dieses Feature validiert **H-07 (Vault-RAG schlaegt LLM-only-Lookup)** aus der BA-EPIC-33.

- **Hypothesen-Aussage:** Lookups, die mit Vault-Knowledge augmentiert sind, werden haeufiger in die Note uebernommen als reine LLM-Antworten, weil sie vault-konsistent sind und der User sie als seine eigene Stimme wiedererkennt.
- **Mess-Design:** 50/50-A/B-Cohort-Split in der Beta-Phase. Cohort A bekommt Vault-RAG, Cohort B bekommt LLM-only. Primaere Metrik: Insert-into-Note-Rate pro Cohort. Sekundaer: Time-to-Accept, Dismiss-Rate, Re-Trigger-Rate.
- **Success-Schwelle:** Cohort A mindestens +15 Prozentpunkte Insert-into-Note-Rate gegenueber Cohort B (SC-04).
- **Konsequenz bei Bestaetigung:** Vault-RAG bleibt Default an, Toggle bleibt fuer Power-User-Opt-out.
- **Konsequenz bei Widerlegung:** Toggle wird auf Default-aus geschaltet, Pipeline bleibt als Opt-in fuer interessierte User erhalten.

---

## Dependencies

- **FEAT-33-02 (Lookup-Action):** liefert den Lookup-Action-Pfad, die Settings-Surface und den Output-Renderpfad. FEAT-33-09 ist eine Augmentierungs-Stufe, kein eigener Trigger.
- **FEAT-03-27 (Tracing-Layer-Trennung):** liefert `vectors.domain='note'`-Diskriminator. Ohne diese Trennung wuerde die Vault-Search auch Session- und Episode-Eintraege treffen und den Quellen-Anhang verschmutzen.
- **SemanticIndexService + VectorStore:** liefert die Reader-Schicht. Muss FEAT-03-27-konform sein.
- **TaskRouter:** liefert das Haiku-Tier-Routing fuer den augmentierten Prompt (Tier bleibt wie in FEAT-33-02).

## Assumptions

- Der User hat einen Vault mit mindestens 100 indexierten Notes, sonst ist der RAG-Pfad wertlos. Fuer kleinere Vaults wird die Pipeline still nichts beitragen (Fallback-Pfad greift) und die Telemetry zeigt das ueber den Cohort-Vergleich.
- Die Embedding-Pipeline (qwen3-embedding-8b via OpenRouter) ist verfuegbar oder der bestehende Fallback greift. Wenn beides ausfaellt, faellt FEAT-33-09 still auf den LLM-only-Pfad zurueck.
- AgentTask ist sidebar-unabhaengig instanziierbar, oder die Action ruft den LLM-Call ohne AgentTask direkt ueber den Provider auf (zu klaeren im ADR von FEAT-33-02).
- Beta-Phase hat genug Traffic, um die 15-Prozentpunkte-Differenz statistisch zu detektieren (mindestens 100 Lookups pro Cohort).

## Out of scope

- Reranker-Integration im Lookup-Pfad (offen im Architecture-Questions-Block, separate Initiative falls Bench zeigt das es einen Mehrwert hat)
- Web-Search-Augmentierung als zweite RAG-Quelle (Vault-only in dieser Iteration, Web-Quellen sind ein eigenes FEAT)
- RAG-Pipeline fuer andere Actions ausser Lookup (Rewrite, Translate, Summarize) - diese koennten in Folge-FEATs den Layer wiederverwenden, gehoeren aber nicht zu FEAT-33-09
- UI fuer das aktive Setzen des Confidence-Thresholds (bleibt Default oder im Hidden-Settings-Bereich, je nach ADR-Entscheidung)
- Persistente Quellen-Annotation in der Note (z.B. automatische Footnote mit Vault-Link) - der Quellen-Anhang ist im Preview, Insert nimmt nur den Antwort-Text uebernehmen, nicht die Quellen-Liste

---

## Code Pointer (optional, may go stale)

> Der Wayfinder (`src/ARCHITECTURE.map`) ist die Quelle fuer aktuelle Pfade.

ARCHITECTURE.map concepts: `semantic-index`, `knowledge-db`, `task-router`, `inline-editor-actions` (neu mit EPIC-33).

Zu erwartende Beruehrungspunkte (Stand 2026-06-22):

- Reader: `SemanticIndexService` mit domain-Filter aus FEAT-03-27 (`vectors.domain='note'`)
- Embedding-Pipeline: bestehende `EmbeddingService` (qwen3-embedding-8b via OpenRouter), kein neuer Pfad
- Augmentierung: neuer `LookupRAGService` oder eine Methode in dem Service, der die Lookup-Action aus FEAT-33-02 traegt (architect-call)
- Output-Renderer: Editor-Widget aus FEAT-33-02 erweitert um Quellen-Anhang-Sektion (CodeMirror-Decoration oder Inline-Tooltip)
- Settings-Surface: Inline-AI-Settings aus FEAT-33-02 plus Toggle `useVaultKnowledge` und optional `confidenceThreshold`
