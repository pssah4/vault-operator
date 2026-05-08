# FIX-19-28-02: Chat-Attachments leben nur 1 Turn (ingest_document attachment_index schlaegt ab Turn 2 fehl)

**Prioritaet:** P1 (User-sichtbar im /ingest-deep-Live-Test, ~12 EUR Token-Verbrauch durch Retry-Loop)
**Feature-Bezug:** FEAT-19-28 (Source-Position-Marker), FEAT-19-31 (Skill-Suite), EPIC-19
**Verwandt:** FIX-19-28-01 (Source-Position-Marker fehlten), AgentSidebarView attachment-flow
**Entdeckt:** 2026-05-07 (Live-Test EnBW-Geschaeftsbericht 2025 PDF mit /ingest-deep)

---

## Problem

Im Karpathy-Multi-Turn-Pattern (Skill `/ingest-deep`) muss der Agent
typischerweise auf Turn 2+ das Tool `ingest_document` mit
`attachment_index: 0` aufrufen, um den geparsten PDF-Inhalt
strukturiert in eine Note zu schreiben. Im Live-Test schlug jeder
Aufruf mit der Meldung fehl:

```
Attachment index 0 out of range. 0 attachment(s) available.
```

Folge: Der Agent ist in eine Retry-Loop gefallen (5x `read_document`-
Aufrufe mit unterschiedlichen Argumenten, dann `list_files` mit 518
Eintraegen, dann ad-hoc `write_file` ohne Position-Marker-Check).
Token-Verbrauch fuer einen einzigen Run: 757036 Input-Tokens auf
Bedrock Opus 4.6 = **11.35 EUR**.

Sense-Making-Note wurde zwar geschrieben, aber:
- Kein `## Originaltext`-Append (FIX-19-28-01-Pfad nicht aktiviert)
- Keine `[[basename#Page N|↗]]`-Marker im Output

## Root Cause

[AgentSidebarView.ts:1710-1722](src/ui/AgentSidebarView.ts#L1710-L1722)
ruft pro `handleSendMessage`-Aufruf `attachments.getFullDocTexts()`
und passt das Ergebnis an `IngestDocumentTool.setAttachmentTexts(...)`.

Auf Turn 1 (User uploadet PDF): `getFullDocTexts()` gibt
`[parsedPdfText]` zurueck -> `attachmentTexts.length === 1` -> Tool
funktioniert.

Auf Turn 2+ (User schickt nur eine Folge-Nachricht ohne neues
Attachment): die Attachment-Bar ist leer (Standard-UX -- nach Send
werden Attachments in die User-Message aufgenommen und der
Chip-Bar-State geleert). `getFullDocTexts()` gibt `[]` zurueck,
`setAttachmentTexts([])` fuehrt zu `attachmentTexts.length === 0`.

Der LLM sieht aber im Conversation-History noch den
`<attached_document name="..." pages="N">...parsed text...
</attached_document>`-Block aus der ersten Message (deshalb glaubt
er, das Attachment sei verfuegbar). Diese Diskrepanz zwischen
LLM-Sicht (Attachment im Kontext) und Tool-Sicht (Attachment im
Speicher) verursacht den Loop.

### Kette

```
Turn 1
  User attachet PDF -> AttachmentHandler parsed text + appendet
  <attached_document>-Block in user-Message
  AgentSidebarView: setAttachmentTexts([parsedText])
  Agent ruft ggf ingest_document mit attachment_index=0 -> ok

Turn 2
  User schickt Folge-Message ohne neues Attachment
  Attachment-Bar im UI ist leer (standard)
  AgentSidebarView: getFullDocTexts() -> [], setAttachmentTexts([])
  Tool-State: attachmentTexts.length === 0
  Aber: Conversation-History enthaelt noch <attached_document> aus Turn 1
  Agent: "Ich habe ein Attachment, ich rufe ingest_document mit attachment_index=0"
  Tool: "Attachment index 0 out of range. 0 attachment(s) available."
  Agent: Retry-Loop (anderer attachment_index, source_path, list_files...)
```

## Scope dieses FIX

In-Scope (kurzfristig, ohne UI-Aenderungen):

1. **Tool-Errormsg klarer machen** (DONE in PLAN-15-Phase-2): Tool meldet
   bei `attachmentTexts.length === 0`, dass das Attachment nur einen
   Turn lang lebt und gibt eine klare Action-Anweisung
   (Speichern in Vault oder write_file mit pre-parsed Text).
2. **Skill-Anpassung** (DONE in /ingest-deep, /ingest v2): Skills
   erwaehnen explizit den 1-Turn-Lifetime und schreiben Source-Type-
   Detection als Step 0 vor.

In-Scope (mittelfristig, ein eigenes IMP):

3. **Persistent attachment state** ueber den Task-Lifecycle: AgentTask
   sollte die `attachmentTexts` aus der ersten Message dauerhaft
   halten, solange dieser AgentTask laeuft. Tool-Aufrufe in spaeteren
   Turns finden die Attachments dann immer noch.
4. **Tool-side parsing of `<attached_document>` aus History**:
   IngestDocumentTool extrahiert pre-parsed Text aus der Conversation-
   History, wenn `attachmentTexts.length === 0` und ein
   `<attached_document>`-Block vorhanden ist. Bricht Tool-Auth-
   Boundary, ist aber pragmatisch.

Out-of-Scope:

- AttachmentHandler-UI-Refactor (eigenes IMP wenn UX-Beschwerden).
- Token-Cost-Reduktion-Mechanismen (FEAT-EPIC-018-pfad).

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | Tool-Errormsg bei attachmentTexts.length === 0 nennt eine Action (vault save oder write_file fallback) |
| AC-02 | Skill /ingest-deep erkennt Chat-Attachment vs Vault-File und waehlt entsprechenden Pfad |
| AC-03 | Skill /ingest-deep STOP-on-Error, kein Retry-Loop |
| AC-04 | Bei nicht verfuegbarem Attachment: Skill weist User aktiv auf Vault-Save hin |

Akzeptanz-Verifikation: erneuter /ingest-deep-Live-Test mit
PDF-Chat-Attachment. Erwartung: Skill bricht sauber ab und fragt nach
Vault-Save, statt 5+ Tool-Calls zu machen.

## Files (vorraussichtlich)

In diesem Inkrement angefasst (Skill v2 + Tool-Errormsg):

- `src/core/tools/vault/IngestDocumentTool.ts`: bessere Errormsg fuer
  attachmentTexts.length === 0
- `bundled-skills/ingest-deep/SKILL.md`: rewrite mit Source-Type-
  Gate, STOP-on-Error, Kosten-Disziplin-Block
- `bundled-skills/ingest/SKILL.md`: rewrite parallel

Ausstehend (separates IMP):

- `src/ui/AgentSidebarView.ts`: persistent attachment state ueber
  Task-Lifecycle
- `src/core/tools/vault/IngestDocumentTool.ts`: optional Fallback
  via Conversation-History-Parsing
