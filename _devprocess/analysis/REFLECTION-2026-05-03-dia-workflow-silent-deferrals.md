---
title: DIA-Workflow-Reflexion: Silent Deferrals und falsche Done-Markierung
date: 2026-05-03
context: BA-25 Karpathy-Wiki-Pattern Implementierung
status: Lessons-Learned
related: BA-25, EPIC-19, AUDIT-014
---

# DIA-Workflow-Reflexion: Silent Deferrals und falsche Done-Markierung

## Kontext

Bei BA-25 (Karpathy-Wiki-Pattern, 28 Features ueber drei Dimensionen)
hat der `/dia-orchestrator`-Lauf 15 Features als "Done" / "Released"
markiert, obwohl die jeweilige Backend-Logik nur als Modul existierte
ohne tatsaechlich verkabelt oder aufrufbar zu sein. Erst der Crosscheck-
Pass auf Wunsch des Users hat den Drift sichtbar gemacht.

Konkrete Beispiele:

- **FEAT-19-19 (Stufe-2 Activity-Trigger)**: ADR-104 + ADR-106
  geschrieben, kein Modul existierte, Done.
- **FEAT-19-22/23/24/26/30 (Deep-Ingest-Pipeline)**: `DeepIngestPipeline`
  als Klasse vorhanden, kein Caller. Tool fehlte. Done.
- **FEAT-19-14 (Anti-Echo-Suche)**: Tool fehlte, Done.
- **FEAT-19-29 (PDF-Markdown-Mirror)**: `PdfMarkdownMirror` als Klasse
  vorhanden, nirgends instanziert. Done.
- **FEAT-19-20 (Stufe-3 Job-Hooks)**: `Stufe3PeriodicJob` mit no-op
  Stub-Hooks (preFilter -> 'no', webPass -> []). Done.
- **FEAT-19-27 (Auto-Trigger Tool-Wiring)**: `AutoTriggerObserver`
  feuerte Notice statt das `ingest_triage` Tool aufzurufen. Done.
- **FEAT-19-18 (Health-Modal-Erweiterung)**: keine Severity-Tabs, keine
  cluster-spezifischen Action-Buttons im Modal. Done.
- **FEAT-19-11 (MOC-Marker-Pflege)**: `refreshAllMOCs` aktualisierte
  bestehende Marker, aber es gab keinen Pfad um Marker initial in
  Kandidaten-MOCs einzufuegen. Done.
- **FEAT-03-26 (Top-Hub-Block Lifecycle)**: initialer Build beim onload
  vorhanden, kein Auto-Regen bei Ontology-Changes. Done.

User-Reaktion: "ich bin davon ausgegangen, dass alles umgesetzt wurde."

## Root Causes

Drei voneinander unabhaengige Defekte im `/dia-orchestrator`-Workflow,
die zusammen den Drift ermoeglichen:

### 1. Done-Definition operiert auf Spec-Ebene, nicht auf Verifikations-Ebene

Die Phase-End-Commits in `/coding` markieren ein Feature als Done sobald
- Code committed
- Tests gruen
- TypeScript baut

Was geprueft wird: das Modul existiert syntaktisch und ist intern
konsistent.
Was NICHT geprueft wird: das Modul ist von der Plugin-Lifecycle aus
erreichbar; es kann ueber den Tool-Call-Pfad oder ein Vault-Event
ausgeloest werden; es interagiert mit Real-DB, Real-LLM, Real-Tool-
Registry.

Folge: ein FEATURE kann als Done markiert sein, obwohl `grep -r
'new MyFeatureClass'` null Treffer im Plugin-Code liefert.

### 2. Handoff zwischen Modul-Bau und Wiring ist implizit

Im V-Model wird zwischen `/architecture` (ADR + Module) und `/coding`
(Implementierung) klar getrennt. Es gibt jedoch keinen expliziten
Verkabelungs-Schritt. Der Coding-Agent baut das Modul; ob das Modul
in `main.ts` instanziiert oder in einer `ToolRegistry` registriert
wird, ist nicht Teil eines Quality-Gates. Der Wiring-Schritt rutscht
zwischen die Phasen und wird in komplexen Sessions vergessen.

### 3. Backlog ist Status-Quelle, nicht Verifikations-Quelle

Die Anweisung "Backlog ist Single Source of Truth" zwingt den Agenten,
den Status im Backlog zu pflegen. Sie zwingt aber NICHT zu pruefen, ob
der eingetragene Status der Realitaet entspricht. Der Backlog wird zum
Selbstbestaetigungs-Mechanismus: "es steht hier auf Done, also ist es
Done." Die Backlog-Pflege ist orthogonal zur Code-Realitaet.

## Mitigation: konkrete Workflow-Aenderungen

### M1: Wiring-Verifikation als hartes Gate vor Done

Vor jedem Status-Wechsel von `Active` -> `Done` fuehrt das Coding-Skill
eine Wiring-Verifikation aus. Sie besteht aus drei Checks:

a. **Reachability-Grep.** Fuer jede neue Klasse / jedes neue Tool /
   jedes neue Modul: `grep -r "new <ClassName>\\|<className>:" src/`
   muss mindestens einen Treffer ausserhalb der Klassendatei selbst und
   ausserhalb von Test-Dateien liefern.

b. **Tool-Registration-Check.** Fuer jedes neue Tool: der Tool-Name muss
   in `ToolRegistry` registriert sein UND eine `TOOL_GROUPS`-Zuordnung
   in `ToolExecutionPipeline` haben.

c. **Lifecycle-Hook-Check.** Fuer jedes Listener-Pattern (`vault.on`,
   `setInterval`, `MutationObserver`): die Cleanup-Stelle in `onunload`
   oder `unregister` muss existieren.

Schlaegt einer der drei Checks fehl, bleibt das FEATURE auf `Active`.
Der Agent darf das Wiring nachreichen oder eine FIX-Row mit klarer
Begruendung "Wiring offen" anlegen, aber der Done-Status ist gesperrt.

### M2: explizite Wiring-Phase im Phase-Modell

Zwischen `/coding` und `/testing` schiebt sich eine kurze
`/wiring`-Phase. Sie ist kein neues Skill, sondern eine Pflicht-
Checkliste am Ende von `/coding`:

```
Wiring-Checklist (vor Done):
[ ] Modul instantiiert in main.ts oder Parent-Service
[ ] Listener registriert (vault.on / register* / addCommand)
[ ] Listener-Cleanup in onunload (try/catch um off-Calls)
[ ] Tool registriert in ToolRegistry und TOOL_GROUPS
[ ] Settings-Toggle in entsprechendem Settings-Tab
[ ] Konsumierende UI-Komponente kennt das neue Verhalten
[ ] manueller Smoke-Test im Plugin (mind. eine Path-Variante)
```

Erfuellt der Agent eine Zeile nicht, schreibt er sie als
"Wiring-Defekt:" in den Phase-End-Commit und erstellt eine FIX-Row.

### M3: Crosscheck-Skill als Pflicht-Gate vor Phase-End

Vor dem Phase-End-Commit eines `/coding`-Laufs laeuft automatisch ein
Crosscheck:

```
crosscheck_dod() {
  for each FEAT marked Active->Done in this session:
    1. read FEATURE Success-Criteria
    2. for each SC, identify the code path that proves it
    3. report any SC without code path as "evidence missing"
  end
}
```

Die Output-Form ist eine Tabelle: SC-ID | Evidence-Path | Status
(Verified / Evidence-Missing / Not-Implemented). Eine Zeile mit
"Not-Implemented" blockiert den Done-Status.

Heutige Praxis: dieser Crosscheck wird nur auf User-Aufforderung
ausgefuehrt. Aenderung: er ist Teil des Default-Loops.

### M4: Silent-Deferral wird laut

Wenn der Agent ein Feature defer'd, weil ein Hook noch nicht
verfuegbar ist (z.B. "LLM-Hook bleibt no-op bis Web-Search-Provider
verkabelt"), MUSS das in zwei Stellen sichtbar werden:

a. Im Code als TODO mit Marker-Format `// FIXME(deferred-wiring): ...`,
   damit `grep "FIXME(deferred-wiring)"` den offenen Punkt findet.

b. Im Backlog als FIX-Row "Wiring offen", explizit mit Reference
   auf das deferring FEATURE.

Heute fehlt beides. Stub-Hooks landen im Code ohne Marker, das
Backlog vermerkt nur "Done". Aenderung: kein Stub-Hook ohne FIXME-
Marker, kein FIXME-Marker ohne FIX-Row, keine FIX-Row ohne Backlog-
Eintrag.

### M5: Done verlangt Nutzer-sichtbaren Pfad

Letzte Regel: bevor ein User-facing Feature auf Done gehen darf, muss
mindestens EIN Pfad existieren, ueber den ein Endnutzer das Feature
ausloesen kann. Das heisst konkret: ein Settings-Toggle, ein Command,
ein Tool im Agent, ein Button im Modal, ein Hotkey, oder ein
automatischer Trigger der dokumentiert ist. Backend-Klassen ohne
Aktivierungspfad sind kein Feature, sondern Infrastruktur, und gehoeren
in IMP-Eintraege, nicht in FEAT-Eintraege mit Done.

## Erwartete Wirkung

Die fuenf Mitigations sind orthogonal und decken jeweils einen anderen
Defekt ab:

- M1 (Reachability-Grep) faengt Module ab, die zwar gebaut sind aber
  nirgendwo aufgerufen werden.
- M2 (Wiring-Checkliste) zwingt den Agenten, alle vier
  Verkabelungsstellen zu betrachten und nicht nur eine.
- M3 (Crosscheck-Gate) schliesst die Luecke zwischen Spec-Ebene und
  Code-Ebene durch SC-zu-Code-Mapping.
- M4 (Loud Deferrals) macht Stub-Implementierungen nicht-uebersehbar.
- M5 (Nutzer-sichtbarer Pfad) verhindert dass Backend-Code als
  User-Feature deklariert wird.

Falls auch nur eine der fuenf Mitigations gelaufen waere, haetten die
15 silent deferrals in BA-25 nicht passieren koennen.

## Naechste Schritte

1. Vorschlag M1+M3 als Aenderung am `/coding` Skill einreichen
   (Issue im DIA-Repo: skills/coding/SKILL.md, Section "Verify gate").
2. Vorschlag M2 als Erweiterung der Phase-End-Checkliste im
   Team-Workflow (skills/project-conventions/references/team-workflow.md).
3. Vorschlag M4 als Erweiterung der FIX/IMP Triage-Regeln
   (graph-invariants.md).
4. M5 als Schaerfung der FEATURE-Definition in
   skills/requirements-engineering/SKILL.md aufnehmen (Definition of
   Done verlangt mindestens einen Aktivierungspfad).

Die Konkretisierung dieser Vorschlaege als PRs im
digital-innovation-agents Repo (https://github.com/pssah4/digital-
innovation-agents) ist die nachhaltige Form. Lokale Workarounds in der
projekt-CLAUDE.md sind Notnagel.
