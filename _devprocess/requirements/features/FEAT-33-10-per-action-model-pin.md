---
id: FEAT-33-10
title: Optional Per-Action-Model-Pin (Power-User-Override)
epic: EPIC-33
subtype: user-facing
priority: P2
effort: S
asr-refs: [ASR-EPIC-33-06]
adr-refs: []
depends-on: [FEAT-33-01]
created: 2026-06-22
ba-ref: ../../analysis/BA-EPIC-33-inline-editor-ai-actions.md
---

# FEAT-33-10: Optional Per-Action-Model-Pin (Power-User-Override)

## Feature description

Power-User koennen pro Inline-Action ein Modell pinnen, das den Settings-Snapshot aus dem Main-Chat fuer genau diese Action ueberschreibt. Default bleibt der Settings-Reuse aus FEAT-33-01: ohne Pin laeuft jede Action mit dem aktuell im Main-Chat aktiven Modell. Ein gepinnter Modell-Override gilt persistent, bis der Pin geloest wird. Reasoning-Parameter wie Thinking-Budget oder Effort-Stufe folgen dem gepinnten Modell, nicht dem Main-Chat-Setup.

Das Feature dient zwei Zwecken. Erstens gibt es Power-User eine Foldback-Option, falls der Settings-Reuse-Default fuer einzelne Actions zu grob ist (zum Beispiel Translate fest auf Haiku statt Default-Tier). Zweitens liefert die Pin-Nutzung das Telemetrie-Signal fuer H-03: bleibt die Pin-Quote unter 30 Prozent, ist Settings-Reuse als Default bestaetigt; steigt sie darueber, ist eine Default-Aenderung zu pruefen.

## Benefits hypothesis

We believe that Power-User pro Action ein dediziertes Modell pinnen wollen, ohne dabei den globalen Main-Chat-Setup anzufassen.
This delivers Override-Kontrolle pro Action plus Telemetrie-Validierung fuer die H-03-Settings-Reuse-Annahme.
We know we are successful when zwischen 10 und 30 Prozent der Beta-User mindestens eine Action mit Pin betreiben, der Settings-Reuse-Default damit als richtige Grundlage bestaetigt ist, und keine Pin-bedingten Settings-Drifts oder Provider-Credential-Fehler im Beta-Issue-Tracking auftreten.

## Jobs to be Done

| Job-Type | Job | Address-in-Story |
|---|---|---|
| Functional | Modell pro Inline-Action fest verdrahten, ohne globalen Main-Chat-Setup zu aendern | US-33-10-01 |
| Functional | Aktiven Pin im Floating-Menu sehen, bevor die Action losgeht | US-33-10-02 |
| Emotional | Vertrauen, dass Default-Settings-Reuse weiterhin gilt und Pin explizites Opt-in bleibt | US-33-10-03 |
| Social | Eigene Pin-Konfiguration mit anderen Power-User-Setups vergleichen koennen (via Settings-Surface dokumentiert) | indirekt via US-33-10-01 |

## User stories

- **US-33-10-01 (P2 Power-User):** Als Power-User moechte ich pro Inline-Action ein Modell pinnen, damit Translate immer auf Haiku laeuft, auch wenn mein Main-Chat auf Opus steht.
- **US-33-10-02 (P2 Power-User):** Als Power-User moechte ich im Floating-Menu erkennen, dass eine Action gepinnt ist und welches Modell sie nutzt, damit ich nicht versehentlich auf veraltete Pin-Settings vertraue.
- **US-33-10-03 (P2 Power-User):** Als Power-User moechte ich Pins jederzeit loesen koennen und sofort zum Settings-Reuse-Default zurueckfallen, damit Pin kein Lock-in wird.

## Success criteria

| ID | Criterion | Target | Measurement |
|---|---|---|---|
| SC-01 | Power-User kann pro verfuegbarer Inline-Action ein Modell pinnen oder die Pin-Auswahl auf "kein Pin" zuruecksetzen | 100 Prozent der verfuegbaren Actions pinnbar | UI-Test: jede Action aus FEAT-33-01..09 hat einen Pin-Selector mit Reset-Option |
| SC-02 | Aktive Pins sind im Trigger-UI vor Action-Start sichtbar | Pin-Hinweis erscheint bei allen gepinnten Actions | Visuelles Akzeptanztest: gepinnte Action zeigt Modell-Hinweis im Floating-Menu |
| SC-03 | Ohne Pin laeuft die Action mit dem aktuellen Main-Chat-Modell-Snapshot | 100 Prozent Settings-Reuse bei nicht gepinnten Actions | Trace-Vergleich Main-Chat-Modell-State versus Action-Modell-State pro Trigger |
| SC-04 | Pin-Setzen und Pin-Loesen wirken sofort auf den naechsten Action-Trigger | Naechster Trigger benutzt neuen Pin-Stand | Manuelle Verifikation: Pin setzen, Action triggern, Modell-ID im Action-Log pruefen |
| SC-05 | Pin-Nutzung wird als Telemetrie-Signal erfasst und ist auswertbar fuer H-03 | Pin-Quote pro Action im Beta-Telemetrie-Export verfuegbar | Telemetrie-Schema enthaelt Pin-Status pro Action, Beta-Auswertung liefert Quote |

## Technical NFRs

- **Performance:** Pin-Lookup beim Action-Trigger laeuft synchron aus dem Plugin-Settings-State, <5ms Overhead pro Trigger. Kein zusaetzlicher Disk- oder DB-Roundtrip.
- **Memory-Footprint:** `actionPins`-Struktur ist `Record<ActionId, ModelId | null>` mit maximal so vielen Eintraegen wie Actions im EPIC-33-Scope (aktuell 11). Persistierung im bestehenden Plugin-Settings-File, kein eigenes Storage.
- **Security:** Gepinntes Modell laeuft mit dem Provider-Credential, das im Main-Chat-Setup fuer den zugehoerigen Provider hinterlegt ist. Kein separates Credential-Set fuer Pins. Wenn der Provider fuer das gepinnte Modell nicht konfiguriert ist, faellt die Action mit klarer Fehlermeldung zurueck auf den Settings-Reuse-Default (kein Silent-Drop).
- **Scalability:** Pin-Selector listet alle Modelle aus dem Plugin-Settings-Modell-Pool. Bei mehr als 20 verfuegbaren Modellen wird die Liste alphabetisch sortiert und mit Provider-Praefix gerendert.
- **Availability:** Pin-Subsystem ist sidebar-unabhaengig. Settings-Surface ist in den bestehenden Plugin-Settings-Tab eingehaengt und steht auch bei geschlossener Chat-Sidebar zur Verfuegung.
- **Telemetrie:** Pro Action-Trigger wird ein Boolean `pinned: boolean` plus optional `pinned_model_id: string` ins Telemetrie-Log geschrieben. Keine Provider-Credentials, keine Selection-Inhalte.

## Architecture considerations

### ASRs

| Type | Title | Why-ASR | Impact | Quality-Attribute |
|---|---|---|---|---|
| Critical | ASR-EPIC-33-06 Settings-Snapshot-Lifecycle | Pin uebermalt das Default-Modell aus Main-Chat zum Trigger-Zeitpunkt, ohne den Settings-Snapshot fuer Skills, Prompts und Provider-Setup zu brechen. Reasoning-Settings (thinking-budget, effort) muessen dem gepinnten Modell folgen, nicht dem Main-Chat-Modell. | Falscher Lifecycle bricht entweder Pin-Wirkung (Pin wirkt nicht) oder Settings-Reuse (Skills/Prompts werden ueberschrieben). | Correctness, Consistency |
| Moderate | Pin-Persistenz und Settings-Sync | actionPins gehoert in Plugin-Settings-File. Schema-Migration noetig, falls Settings-File ohne Pin-Eintraege vorliegt. | Fehlende Migration fuehrt zu undefined-Lookup beim Trigger. | Compatibility |

### Constraints

- Pin-Surface lebt im bestehenden Plugin-Settings-Tab unter dem FEAT-33-01-Settings-Bereich. Kein eigener Tab.
- Pin gilt nicht fuer FEAT-33-04 Send-to-Main-Chat (dort laeuft der reale Main-Chat-Setup, Pin waere semantisch leer).
- Reasoning-Settings folgen dem gepinnten Modell. Wenn Pin ein Modell ohne Thinking-Support waehlt, wird Thinking automatisch deaktiviert (kein Crash).

### Open questions for architect

1. Wo genau im Settings-Snapshot-Code (FEAT-33-01) wird der Pin-Lookup eingehaengt: vor oder nach dem Provider-Credential-Resolve?
2. Wie wird der Pin-Indikator im Floating-Menu visuell geloest, ohne den Action-Label-Platz zu sprengen? Badge, Icon, Tooltip?
3. Soll Pin-Setzen einen Provider-Switch ausloesen koennen, wenn das gepinnte Modell zu einem anderen Provider gehoert als der Main-Chat-Default?

## Definition of Done

### Activation Path (mandatory)

- **Type:** Settings-Surface plus visueller Pin-Indikator im Floating-Menu
- **Identifier:** "Pin model for this action"-Dropdown pro Action in Plugin-Settings, Pin-Badge im Floating-Menu
- **Where:** Plugin-Settings-Tab unter dem FEAT-33-01-Inline-Actions-Bereich (Dropdown pro Action plus Reset-Option); Pin-Badge im Floating-Menu rechts neben dem Action-Label
- **How:** Power-User oeffnet Plugin-Settings, scrollt zum Inline-Actions-Bereich, waehlt pro Action ein Modell aus dem Dropdown (Default-Option "Use main chat setting"). Beim naechsten Action-Trigger zeigt das Floating-Menu fuer gepinnte Actions einen Badge mit dem gepinnten Modell-Namen. Action laeuft mit Pin-Modell statt Main-Chat-Modell.

### Functional checklist

- [ ] Plugin-Settings-Tab enthaelt Pin-Dropdown pro Action mit Reset-Option "Use main chat setting"
- [ ] actionPins-Struktur (`Record<ActionId, ModelId | null>`) persistiert in Plugin-Settings-File
- [ ] Settings-Migration: fehlender actionPins-Eintrag in alter Settings-File wird beim Plugin-Load mit leerem Objekt initialisiert
- [ ] Pin-Lookup beim Action-Trigger uebermalt nur das Modell-Feld im Settings-Snapshot, andere Snapshot-Felder bleiben aus Main-Chat
- [ ] Reasoning-Settings (thinking-budget, effort) folgen dem gepinnten Modell, nicht dem Main-Chat-Modell
- [ ] Floating-Menu zeigt Pin-Badge fuer alle gepinnten Actions mit Modell-Kurzname
- [ ] Pin-Reset wirkt sofort auf den naechsten Trigger
- [ ] Fehlende Provider-Credentials fuer das gepinnte Modell loesen eine klare Fehlermeldung aus, kein Silent-Fallback

### Quality checklist

- [ ] **Sidebar-Independence-Check:** Pin-Setzen, Pin-Loesen und Action-Ausfuehrung mit Pin funktionieren mit geschlossener Chat-Sidebar. Verifiziert via manuellem Beta-Test.
- [ ] Telemetrie-Schema erweitert um `pinned` Boolean und optional `pinned_model_id` String pro Action-Trigger
- [ ] Tests fuer Pin-Lookup-Logik: kein Pin, Pin gesetzt, Pin-Modell ohne Credentials, Pin-Modell ohne Thinking-Support
- [ ] Tests fuer Settings-Migration: alte Settings-File ohne actionPins, neue Settings-File mit Pin-Eintraegen
- [ ] Bot-Compliance: kein fetch, kein innerHTML, kein direkter Style-Mutation, FileManager.trashFile, kein require ausser Allowlist
- [ ] UI in Englisch, keine internen FEAT-IDs oder ADR-Nummern in Settings-Labels oder Tooltips
- [ ] Build und Deploy laufen, tsc clean, ESLint clean

### Documentation checklist

- [ ] arc42 Section 8 oder 9 dokumentiert Pin-Subsystem inklusive Lifecycle-Diagramm fuer Settings-Snapshot mit und ohne Pin
- [ ] User-Doku unter docs/guides/ ergaenzt um Kurzabschnitt "Pinning a model per inline action"
- [ ] Release-Notes-Eintrag bei naechstem Release mit Hinweis auf Power-User-Opt-in-Charakter
- [ ] H-03-Telemetrie-Auswertung im EPIC-33-Beta-Report enthaelt Pin-Quote pro Action

## Hypothesis validation

Dieses Feature validiert H-03 aus der BA (Settings-Snapshot aus Main-Chat als Default plus optional Per-Action-Pin als Power-User-Override).

- **Validierungs-Methode:** 30-Tage-Beta plus Telemetrie auf Pin-Nutzung pro Action plus Issue-Tracking auf Pin-bedingte Bugs.
- **Erfolgs-Schwelle:** Default-Settings-Reuse wird von >80 Prozent der Beta-User akzeptiert (keine Pin-Konfiguration). Pin wird von 10 bis 30 Prozent genutzt (gerechtfertigt fuer Power-User, kein Hint dass Default falsch ist).
- **Foldback-Schwelle:** Wenn >50 Prozent der Beta-User mindestens 3 Actions pinnen, ist Settings-Reuse als Default zu pruefen und ein dedizierter Inline-Settings-Tree in der Folge-Welle zu erwaegen.

## Dependencies

- **FEAT-33-01 Inline-Action-Framework:** Pin-Lookup haengt im Settings-Snapshot-Step von FEAT-33-01 ein. Ohne FEAT-33-01 existiert kein Snapshot, der ueberschrieben werden koennte.

## Assumptions

- Plugin-Settings-File-Schema ist erweiterbar ohne Breaking-Change fuer existierende Installationen.
- Modell-Pool im Plugin-Settings-Modell-Tab bleibt stabil. Pin haelt eine ModelId-String-Referenz, kein Snapshot des Modell-Config.
- Wenn der Power-User ein gepinntes Modell aus dem Modell-Pool entfernt, faellt die Action automatisch auf Settings-Reuse-Default zurueck (mit Hinweis im Floating-Menu).

## Out of scope

- Pro-Action-Skills-Pin, Pro-Action-Prompt-Pin, Pro-Action-Provider-Pin: Pin gilt nur fuer Modell-ID, nicht fuer das gesamte Settings-Snapshot.
- Globaler Inline-Settings-Tree (separat von Main-Chat-Settings): bewusst via H-03 verworfen, Pin ist Foldback-Mechanik fuer Power-User.
- Pin-Sync ueber Geraete via Obsidian-Sync: laeuft implizit ueber Plugin-Settings-File, kein dediziertes Sync-Subsystem.
- Pin fuer FEAT-33-04 Send-to-Main-Chat: dort gilt der reale Main-Chat-Setup, Pin waere semantisch leer.

## Code Pointer

Konzept-Name in ARCHITECTURE.map: `inline-action-model-pin`. Erwartete Plugin-Settings-Struktur erweitert `Record<ActionId, ModelId | null>`. Settings-Snapshot-Step aus FEAT-33-01 enthaelt einen Pin-Lookup-Hook, der das Modell-Feld ueberschreibt, bevor der Snapshot an die Action-Pipeline geht.
