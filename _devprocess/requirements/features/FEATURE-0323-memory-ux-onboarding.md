---
id: FEATURE-0323
title: Memory-UX, Onboarding und Settings-Migration
epic: EPIC-003-context-memory-scaling
phase: Building
status: Planned
priority: P1
effort: M
depends-on: [FEATURE-0319]
related:
  - PLAN-001-memory-v2-master.md
  - FEATURE-0405-onboarding.md (existierender OnboardingService)
---

# Feature: Memory-UX, Onboarding und Settings-Migration

> **Feature ID:** FEATURE-0323
> **Epic:** [EPIC-003 Context, Memory & Scaling](../epics/EPIC-003-context-memory-scaling.md)
> **Backlog ID:** Initiative Memory v2, UX-Querschnitt (entstanden aus A4+A6+A7 Diskussion 2026-04-26)
> **Priority:** P1-High
> **Effort:** M (1 Wo)

## Feature Description

Querschnittliches Feature fuer User-Education und Setup-Smoothness rund um Memory v2. Drei Sub-Bereiche:

**1. Settings-Migration v2.6.x -> Memory-v2 (A4):**

Beim ersten Plugin-Start nach dem Update werden alte Settings-Keys auf neue Memory-v2-Keys gemappt:

- `memoryModelKey` -> bleibt erhalten (default fuer Single-Call-Extraction-Modell)
- `autoExtractSessions` + `autoUpdateLongTerm` -> werden subsumed durch `memoryEligible`-Konzept (default off, wie bisher)
- Neue Default-Werte: `persistenceService='local'`, `dbLocation='plugin-local'` (Klasse A)

**Smart-Defaults bei Auto-Migration:** Klare Mapping-Regeln werden silent angewendet, User merkt nichts.

**Wizard-Fallback bei Mapping-Failures:** Wenn Auto-Migration einen Edge-Case erkennt (z.B. `memoryModelKey` ist gesetzt aber Modell existiert nicht mehr in Settings), oeffnet sich ein Modal-Wizard, der den User aktiv durchfuehrt. Kein silent-Fehlverhalten.

**2. Onboarding-Erweiterung (A6):**

Bestehender OnboardingService (FEATURE-0405) wird erweitert um neuen Schritt 'Memory & UCM':

- Conversational, im Chat (nicht Wall-of-Text-Modal)
- Erklaert: Was ist Memory, Living Document, Star-Button, Agent-als-Memory-Interface
- Erklaert die drei Setup-Klassen A/B/C und wie man wechselt
- Skipbar fuer Power-User

Plus **Inline-Coach-Marks** bei Erstkontakt:

- Erstes Mal Star-Button geklickt: Tooltip 'Diese Conversation wird jetzt extrahiert. Du kannst spaeter den Agent fragen, was er gelernt hat.'
- Erstes Mal `search_history` aufgerufen: 'Tipp -- du kannst auch deinen Agent in natuerlicher Sprache fragen.'
- Erstes Mal Setup-Wechsel-Wizard: Erklaerung der drei Klassen und ihrer Trade-offs

**3. Fehler-UX via Agent (A7):**

Memory-v2-Fehler-Pfade produzieren **strukturierte Fehler-Outputs** mit Error-Codes:

- `MEMORY_MODEL_NOT_CONFIGURED`
- `STANDALONE_WORKER_UNREACHABLE`
- `DB_INTEGRITY_CHECK_FAILED`
- `EMBEDDING_PROVIDER_ERROR`
- `MIGRATION_IN_PROGRESS`
- `LOCK_HELD_BY_OTHER_PROCESS`
- (vollstaendige Liste in Code-Konstanten)

Der Agent erkennt diese via Tool-Output und erklaert sie dem User in der Conversation, schlaegt Recovery-Schritte vor und kann via existierende Tools `update_settings`, `configure_model`, `read_agent_logs` direkt fixen.

Beispiel-Conversation:

```
User: erinnerst du dich, wie wir gestern ueber UniCredit gesprochen haben?
Agent: Hmm, ich kann gerade nicht auf Memory zugreifen. Der Fehler-Code lautet
       MEMORY_MODEL_NOT_CONFIGURED -- das bedeutet, dass kein Embedding-Modell
       konfiguriert ist. Ich kann das fuer dich beheben, wenn du moechtest.
       Welches Modell soll ich nutzen? (Optionen: ...)
User: Nimm Xenova lokal.
Agent: [ruft configure_model auf, setzt activeEmbeddingModelKey] Erledigt.
       Memory ist jetzt aktiv. Lass mich nochmal nach UniCredit suchen...
```

Damit ist Fehler-UX kein UI-Layer (Status-Ampel, Toasts), sondern Conversation-Layer. Konsistent mit FEATURE-0319 Agent-als-Memory-Interface.

## Benefits Hypothesis

**We believe that** Smart-Defaults + Wizard-Fallback + Onboarding-Coach-Marks + Agent-als-Fehler-UI zusammen die User-Friction beim Memory-v2-Update auf nahe Null senken.

**Delivers the following measurable outcomes:**

- Setting-Migration-Failure-Rate: < 5% der Updates triggern Wizard
- Onboarding-Completion-Rate: > 70% der neuen User absolvieren Memory-Schritt
- Fehler-Recovery-Rate: > 80% der Fehler werden via Agent-Vorschlag automatisch behoben

**We know we are successful when:**

- Sebastian updatet von v2.6.x ohne manuelle Settings-Aenderungen
- Erst-User nach Plugin-Install hat Memory v2 nach 5 Minuten verstanden
- Bei broken-by-default Scenario erkennt Agent das Problem und bietet Fix an

## User Stories

### Story 1: Plugin-Update ist nahtlos (Functional Job)

**As a** Sebastian (existierender User)
**I want to** dass nach dem Memory-v2-Update mein Plugin so funktioniert wie vorher
**so that** ich nichts neu konfigurieren muss

### Story 2: Erst-User versteht Memory v2 (Functional Job)

**As a** neuer Obsilo-User
**I want to** lernen, was Memory bedeutet und wie ich es nutze
**so that** ich es nicht aus Versehen falsch nutze oder gar nicht aktiviere

### Story 3: Fehler werden konversational geloest (Emotional Job)

**As a** Sebastian
**I want to** dass der Agent mir bei Fehlern hilft, statt dass ich in Settings rumsuchen muss
**so that** Plugin-Probleme nicht zu Frust werden

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Auto-Migration mit Smart-Defaults funktioniert bei Standard-Setups | > 95% silent erfolgreich | Test-Suite mit alten Settings-Variationen |
| SC-02 | Wizard-Fallback triggert nur bei echtem Edge-Case | < 5% der Updates triggern Wizard | Migration-Telemetrie |
| SC-03 | Onboarding-Coach-Marks erscheinen kontextuell | bei Erstkontakt mit Star/search_history/Wizard | Test |
| SC-04 | Fehler-Codes werden vom Agent verstanden | Eval-Test-Set fuer 8 Fehler-Codes | LLM-as-Judge |
| SC-05 | Agent kann via update_settings/configure_model fixen | konkrete Auto-Fix-Pfade fuer 5 haeufigste Fehler | Test |

---

## Technical NFRs

### Performance

- **Settings-Migration:** < 100ms beim Plugin-Start
- **Wizard-Modal:** < 200ms Open-Latenz
- **Coach-Mark-Trigger:** < 50ms nach User-Aktion

### Security

- **Settings-Migration ist idempotent:** doppelter Run tut nichts
- **Migration-Audit-Log:** alte Settings-Werte werden in `migrations/v2-settings-{timestamp}.json` archiviert vor Aenderung

### Scalability

- N/A (Single-User-Local-Setup)

### Availability

- **Migration-Recovery:** wenn Plugin mid-migration crashed, Recovery-Replay beim naechsten Start

---

## Architecture Considerations

### ASRs

**MODERATE ASR #1:** Strukturierte Fehler-Outputs mit Error-Codes als Engine-Public-Konstanten.

- **Why ASR:** Agent muss Fehler semantisch verstehen, nicht aus Free-Text-Strings raten
- **Impact:** Engine-Public-API exportiert Error-Code-Enum, Tool-Outputs traget standard Fehler-Schema
- **Quality Attribute:** Maintainability, Reliability

**MODERATE ASR #2:** OnboardingService-Erweiterung baut auf bestehendem Service auf, kein paralleler Pfad.

- **Why ASR:** Konsistenz mit FEATURE-0405
- **Impact:** OnboardingService-Erweiterung um Memory-v2-Schritt
- **Quality Attribute:** Maintainability

### Open Questions for Architect

- Coach-Mark-Engineering: native Obsidian-API oder eigener Layer?
- Wizard-Modal-Persistenz: was, wenn User Modal abbricht? Bleibt Auto-Migration im Halb-Zustand oder revert?
- Agent-Fehler-Framing: System-Prompt-Erweiterung oder Tool-Description-only?

---

## Definition of Done

### Functional

- [ ] Settings-Migration-Logic mit Smart-Defaults
- [ ] Migration-Audit-Log nach `_devprocess/logs/migrations/v2-settings-{timestamp}.json`
- [ ] Wizard-Modal-Fallback bei Mapping-Failures
- [ ] OnboardingService-Erweiterung um Memory-v2-Schritt
- [ ] Inline-Coach-Marks bei drei Erstkontakt-Triggern (Star, search_history, Setup-Wechsel)
- [ ] Fehler-Code-Enum in Engine-Public-API
- [ ] Strukturierte Fehler-Outputs in allen Memory-v2-Tools
- [ ] System-Prompt-Erweiterung: Agent erkennt Fehler-Codes und schlaegt Recovery vor
- [ ] Eval-Test-Set fuer Agent-Fehler-Recovery (8 haeufige Fehler-Faelle)
- [ ] **Embeddings-Tab-Infotext-Hint** (C6-Beschluss 2026-04-26): Side-Edit in `EmbeddingsTab.ts`-Infotext: 'Fuer mixed-Language Workflows multilingual-Modell empfohlen (z.B. Qwen3-Embedding-8B, OpenAI text-embedding-3, paraphrase-multilingual-mpnet). Englisch-only Modelle wie Xenova/all-MiniLM-L6-v2 fuehren zu cross-lingual Recall-Verlust.' Kein neues Onboarding-Feature, nur Doku im UI

### Quality

- [ ] Settings-Migration-Test-Suite mit 10+ Edge-Cases
- [ ] Onboarding-Eval (manuelles Spot-Check, neuer Test-User)
- [ ] Agent-Fehler-Recovery-Eval mit LLM-as-Judge

### Documentation

- [ ] FEATURE-0323 Status: Implemented
- [ ] User-Doku: 'Memory v2 -- erste Schritte'
- [ ] Fehler-Code-Glossar fuer Power-User

---

## Dependencies

- **FEATURE-0319** (Living Document UX): Star-Button + Settings-Schema muessen existieren
- **FEATURE-0405** (OnboardingService): bestehender Service wird erweitert, nicht ersetzt
- **Existierende Tools:** `update_settings`, `configure_model`, `read_agent_logs` -- muessen Memory-v2-aware sein (z.B. Memory-Settings-Pfade kennen)

## Assumptions

- OnboardingService-API ist erweiterbar
- Anthropic-Tool-Calling-Schema-Format akzeptiert strukturierte Fehler-Outputs

## Out of Scope

- Vollstaendige Settings-UI-Reorganisation (nur Memory-v2-Settings-Tab betroffen)
- Multi-Lingual-Onboarding (DE primaer, EN folgt nach Wave 4)
- Agent-Self-Repair-Auto-Trigger (Agent fragt User vor Auto-Fix)
