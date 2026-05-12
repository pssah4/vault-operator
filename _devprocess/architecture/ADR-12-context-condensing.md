# ADR-12: Context Condensing Strategy (Keep-First-Last)

**Datum:** 2026-02-24
**Entscheider:** Sebastian Hanke

---

## Kontext

Lange Agent-Sessions koennen das Context Window des LLM ueberschreiten. Ohne Gegenmassnahme bricht der API-Call mit einem Token-Limit-Fehler ab. Es braucht eine Strategie, um die Konversationshistorie zu komprimieren, ohne kritischen Kontext zu verlieren.

Optionen:
1. Sliding Window (aelteste Nachrichten entfernen)
2. LLM-basierte Zusammenfassung des mittleren Teils
3. RAG-basierter Kontext-Abruf (nur relevante Nachrichten)
4. Kombiniert: Keep-First + Keep-Last + LLM-Summarize-Middle

## Entscheidung

**Option 4 — Keep-First-Last mit LLM-Summarize-Middle.**

Trigger: Geschaetzte Token-Zahl > `condensingThreshold` % des Context Windows (Default: 70%).

Algorithmus:
1. Behalte die erste User-Nachricht (Original-Aufgabe)
2. Smart Tail: Behalte die letzten Nachrichten (bis zu 10k Tokens, min. 2 Nachrichten)
3. Komprimiere den mittleren Teil via LLM-Call in eine Zusammenfassung (mit Tool-Call-Ledger)
4. Ersetze die History mit: [erste Nachricht, Zusammenfassung als User-Message, ...tail]
5. Multi-pass: Bis zu 2 Retries falls nach erstem Pass immer noch ueber Threshold

## Begruendung

- **Aufgaben-Kontext bleibt erhalten**: Die erste Nachricht definiert die Aufgabe — ihr Verlust fuehrt zu Orientierungsverlust.
- **Aktueller Zustand bleibt erhalten**: Smart Tail (bis zu 10k Tokens, min 2 Nachrichten) enthaelt den aktuellen Arbeitskontext und letzte Tool-Results.
- **LLM-Qualitaet**: Eine LLM-Zusammenfassung ist deutlich besser als simples Abschneiden.
- **Token-Schaetzung statt exakter Zaehlung**: `estimateTokenCount()` nutzt eine 4-Chars-pro-Token-Heuristik. Exaktes Tokenizing waere zu langsam fuer Echtzeit-Checks.
- **Kilo Code Referenz**: Uebernimmt die Strategie aus der Kilo-Code-Referenz.

## Emergency Condensing (Ergaenzung 2026-03-01)

Zusaetzlich zum proaktiven Threshold-Check gibt es einen reaktiven Catch-Block:

Wenn der API-Call mit einem 400-Fehler fehlschlaegt (Patterns: `context_length_exceeded`, `prompt too long`, `too many tokens`, `token limit`, `request too large`), und die History mindestens 7 Nachrichten hat, wird `condenseHistory()` als Notfall-Massnahme ausgefuehrt. Bei Erfolg wird der User informiert ("Konversation wurde komprimiert — bitte letzte Nachricht erneut senden"). Bei Fehlschlag greift der normale Error-Handler.

Dies verhindert den Totalabbruch des Tasks bei unvorhergesehener Context-Ueberschreitung (z.B. sehr grosse Tool-Results in einem einzigen Turn).

## Konsequenzen

**Positiv:**
- Agent kann beliebig lange Sessions fuehren
- Kein abrupter Abbruch bei vollem Kontext
- Nutzer wird benachrichtigt (onContextCondensed Callback)
- Emergency Condensing faengt unvorhergesehene 400-Fehler ab

**Negativ:**
- Ein LLM-Call fuer die Zusammenfassung (Latenz + Kosten)
- Detail-Verlust in der Mitte der Konversation
- Token-Schaetzung kann ungenau sein (besonders bei nicht-lateinischen Sprachen)

## Implementierung

- `src/core/AgentTask.ts` — `condenseHistory()`, Token-Schaetzung, Threshold-Check, Emergency Condensing im Catch-Block
- Settings: `condensingEnabled` (boolean, Default: true), `condensingThreshold` (50-95, Default 70)
- Emergency Condensing: Auto-Retry statt Abbruch — nach erfolgreicher Notfall-Komprimierung wird der Agent-Loop automatisch fortgesetzt (max. 1 Retry)
- Pre-Compaction Memory Flush wird auch vor Emergency Condensing ausgefuehrt

## Amendment 2026-05-12 (EPIC-24 / FEAT-24-02): Microcompaction — Tool-Result-Pruning an Turn-Grenzen

**Befund (5-Provider-Messlauf 2026-05-12):** Die Keep-First-Last-Voll-Compaction triggert erst bei ~70 % des Kontextfensters (oder im Notfall bei 400). Bis dahin waechst die History monoton, dominanter Treiber sind akkumulierende Tool-Results: `read_file` ist auf 50k Chars/Datei gekappt, aber 4 Reads in einem Turn = ~31k Tokens; dazu Such-/Semantic-Results und Edit-Diffs. Beispiel: ein 4-Datei-Read-Turn endet bei ~48k Input-Tokens, davon ~32k Tool-Results — die fahren in jeder Folge-Iteration und jedem Folge-Turn im Volltext mit. Hochskaliert ist das das 138k/181k-Disaster (58-Msg-Chat: History ~139k Tokens). Claude Code loest das mit "Microcompaction": laufendes Pruning der **Inhalte** alter Tool-Results, das `tool_use`/`tool_result`-Skelett bleibt.

**Entscheidung (ergaenzt ADR-12 additiv — die Keep-First-Last-Voll-Compaction bleibt unveraendert als Notnagel bei ~70 %):**

**Microcompaction an natuerlichen Uebergaengen.** Ist ein Turn abgeschlossen (der Assistant emittiert finalen Text ohne weiteren `tool_use`), werden die Tool-Results dieses Turns auf Skelette eingedampft, bevor der naechste Turn startet: der `tool_result`-Block behaelt eine kompakte Zusammenfassung + einen Pointer ("[read Notes/X.md — 50000 chars; ggf. read_file path=...]", "[semantic_search 'X' — 34 Treffer; ggf. tmp/...]"), der Volltext wird entfernt. Der Agent hat das Result in dem Turn, der es nutzt, im Volltext; danach reicht das Skelett. Effekt: ein 4-Datei-Read-Turn endet bei ~48k, der Folge-Turn startet unter ~20k statt mit den ~48k im Schlepptau.

**Was NICHT komprimiert wird:** Anforderungen, Constraints, Conventions, Architektur-/Security-Regeln, Qualitaetsstandards — die gehoeren in den System-Prompt (stabile Sections, ADR-62), nicht in die komprimierbare History; sie ueberleben jede Microcompaction unveraendert. Die erste User-Message (Original-Aufgabe) bleibt unangetastet wie schon bei der Keep-First-Last-Compaction.

**Trigger-Punkte:** (a) nach Abschluss eines Turns (kein `tool_use` mehr) — dort wo heute das Voll-Condensing nach text-only-Turns geprueft wird; (b) optional vor einem neuen User-Turn, der erkennbar das Thema wechselt; (c) optional nach einem erfolgreichen Edit (Erfolgs-Diff + `old_str`/`new_str`-Bloecke -> Skelett).

**Rolling-Summary alter Turn-Bloecke (zweite Stufe, ueber Tool-Result-Pruning hinaus):** auch wenn die Tool-Results geprunt sind, koennen sich viele alte Turns (Assistant-Text, kurze User-Folgefragen, Tool-Skelette) summieren. Sobald die History eine konfigurierbare, *unter* dem 70%-Voll-Condensing-Schwellwert liegende Marke ueberschreitet, wird der aelteste Teil der Konversation (vor dem Smart-Tail, nach der ersten User-Message) inkrementell in eine laufende Zusammenfassung gefasst -- dieselbe Mechanik wie die Keep-First-Last-Voll-Compaction, aber frueher und schrittweise statt erst beim Notnagel-Schwellwert. Reine Paste-/@-Mention-Riesen-User-Messages sind dabei kein Sonderfall mehr, weil sie schon beim Reinkommen gekappt werden (ADR-63-Amendment, Punkt 3) -- die Rolling-Summary fasst nur, was trotzdem noch zusammenkommt. Default-Schwellwert grosszuegig, damit kurze Sessions nie davon beruehrt werden.

**KV-Cache-Vertraeglichkeit:** Microcompaction veraendert die History rueckwirkend (Inhalte werden ersetzt) und invalidiert den Cache ab der ersten geaenderten Message. Akzeptabel, weil (a) es an Turn-Grenzen passiert, nicht mitten in einer Iteration, (b) der eingesparte Re-Send-Aufwand den Cache-Re-Build deutlich uebersteigt, (c) der stabile System-Prompt-Praefix (ADR-62-Amendment) davon unberuehrt bleibt. Alternative fuer den PLAN: nur Tool-Results vor dem aeltesten noch-relevanten Punkt prunen, juengere unangetastet lassen.

**Risiko:** Zu aggressives Pruning kostet Ergebnisqualitaet (der Agent braucht ein altes Result doch nochmal). Mitigation: das Skelett enthaelt immer den `read_file path=...`-Pointer, der Agent kann nachladen — dann unterliegt der Re-Read dem Cap aus dem ADR-63-Amendment; Shadow-Mode / A-B-Test vor dem Release; konservativer Default (z.B. nur Tool-Results aelter als N Turns prunen).

**Implementation Notes (2026-05-12, kann veralten):** Erweiterung von `condenseHistory()` bzw. neue `microcompactToolResults()`-Methode in `src/core/AgentTask.ts`, getriggert am Turn-Ende (dort wo heute das Voll-Condensing nach text-only-Turns laeuft). Skelett-Format konsistent mit den Externalizer-Referenzen (`ResultExternalizer.ts`, ADR-63). Diagnose: `logInputBreakdown` (`[InputBreakdown]` zeigt den `hist`-Anteil pro Turn). Verwandt: ADR-62-Amendment, ADR-63-Amendment, FEAT-24-02, RESEARCH-36 (Befund C).
