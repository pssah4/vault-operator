---
id: ADR-105
title: Stufe-3 Job-Runner und Token-Budget-Enforcement
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-20
  - FEAT-19-21
---

# ADR-105: Stufe-3 Job-Runner und Token-Budget-Enforcement

## Context

Stufe-3 Periodischer Job (FEAT-19-20) braucht zwei Architektur-Entscheidungen, die eng verbunden sind: wie und wann der Job laeuft, und wie das Token-Budget hart kappiert wird. Drei Job-Runner-Optionen: setInterval im Plugin, BackgroundFetch (Mobile), Cron-via-OS. Drei Budget-Optionen: soft cap (Warnung bei Ueberschreitung), hard cap (Stop bei Limit), reset-Strategie (kalender-wochentlich vs sliding 7-Tage-Fenster).

## Decision Drivers

- Plugin-Restart-Tolerance (Job darf nicht durch Restart verloren gehen)
- Mobile-Kompatibilitaet (Klasse-A-Setup)
- Token-Kosten-Kontrolle (BA-25 N7, hart begrenzt)
- Vorhersagbarkeit fuer User

## Considered Options

### Job-Runner

**A1: setInterval beim Plugin-Onload**
- Pros: Simpel, in Plugin-Lifecycle integriert.
- Cons: Wenn Obsidian zu lang offen, Drift; wenn Obsidian geschlossen, Job-Skip.

**A2: BackgroundFetch (Mobile)**
- Pros: Funktioniert bei geschlossener App.
- Cons: iOS BackgroundFetch ist nicht garantiert (System entscheidet).

**A3: OS-Cron**
- Pros: Verlaesslich.
- Cons: Plugin-Sandbox kann nicht direkt OS-Cron setzen.

### Token-Budget

**B1: Soft cap, nur Warnung**
- Pros: User bekommt nuetzliche Findings auch bei Ueberschreitung.
- Cons: Kosten-Falle.

**B2: Hard cap, Job stoppt**
- Pros: Vorhersagbare Maximalkosten.
- Cons: Bei niedrigem Budget bekommt User wenig Findings.

**B3: Hard cap mit 80%-Notification**
- Pros: Vorhersagbarkeit plus Vorwarnung.
- Cons: Komplexer.

## Decision

**Job-Runner: A1 setInterval mit Cooldown-Persistenz**.

Begruendung:
- Sebastian's Setup ist Desktop-primaer, Plugin laeuft taeglich auf.
- Mobile-User-Faelle sind opt-in (BA-25 Constraint: Mobile Read-Pfad obligatorisch, Write-Pfad kann Desktop-only sein).
- setInterval(weeklyCheck, 24h) plus Cooldown-Check via `last_run_at`-Settings-Property: bei Plugin-Restart wird letzter Lauf-Timestamp geprueft, naechster Lauf nur wenn > 7d her.
- BackgroundFetch und OS-Cron als deferred Optionen wenn Mobile-Use-Case dominiert.

**Token-Budget: B3 Hard cap mit 80%-Notification, kalender-wochentlich Reset**.

Begruendung:
- Vorhersagbarkeit ist hoechste Prioritaet (BA-25 H-13).
- Hard Stop verhindert Cost-Spike-Faelle.
- Kalender-Wochen-Reset (jeden Montag 0:00 UTC) ist transparent und mental einfach.
- 80%-Notification gibt User Chance zu reagieren (Hot-List trimmen, Budget hoeher setzen, etc).

## Consequences

### Positive
- Plugin-Restart-tolerant.
- Token-Kosten hart begrenzt, vorhersagbar.
- 80%-Warnung verhindert Ueberraschung.
- Default 2 USD/Woche realistisch erreichbar.

### Negative
- Bei laengerer Plugin-Pause (> 7d) wird Job nachgeholt, kann zu Lasten-Spitze fuehren. Mitigation: bei Pause-Detection Hot-List-Anzahl reduzieren oder Skip.
- Mobile-User ohne Always-on Desktop bekommen Stufe-3 nicht, mussen auf Stufe-2 (Activity-Trigger) zurueckfallen.

### Risks
- setInterval-Drift bei Plugin-Restart kann zu doppeltem Trigger fuehren. Mitigation: Cooldown-Check mit `last_run_at`-Persistenz schuetzt.

## Implementation Notes

Job-Runner-Skelett:
```
plugin.onload():
  this.weeklyJobInterval = setInterval(() => maybeRunWeeklyJob(), 1h)  // check stuendlich, runWeekly nur wenn 7d-Cooldown
plugin.onunload():
  clearInterval(this.weeklyJobInterval)
```

Settings:
- `vaultIngest.lint.stufe3.enabled: boolean`, default false
- `vaultIngest.lint.stufe3.weeklyBudgetUsd: number`, default 2.0
- `vaultIngest.lint.stufe3.lastRunAt: timestamp` (intern persistiert)
- `vaultIngest.lint.stufe3.currentWeekTokensSpent: number` (intern, wird Montag 0:00 UTC zurueckgesetzt)

Budget-Counter:
- Pro LLM-Call wird tokens_used in `currentWeekTokensSpent` aufaddiert.
- Bei `currentWeekTokensSpent / weeklyBudgetUsd > 0.8`: Notification feuern (einmalig pro Woche).
- Bei `currentWeekTokensSpent >= weeklyBudgetUsd`: Job-Iteration abbrechen, Notification "Budget exhausted".

## Amendment 2026-06-19 (IMP-20-06-01)

Der Note-Verifier aus IMP-20-06-01 laeuft INNERHALB des bestehenden `webUpdatePass`-Hooks, nicht als zweite parallele Pipeline. Damit erbt er das Token-Budget, die Pause-Detection und die Cooldown-Logik aus ADR-105 ohne Sondercode. Aggregierung folgt der bestehenden Konvention: `tokensUsed` aus `webUpdatePass` summiert alle pro-Note-Calls innerhalb des Clusters; das Stufe-3-Budget wird hart enforced wie bisher.

Hook-Schema-Erweiterung: `UpdateFinding` bekommt ein optionales Feld `notes: NoteVerdict[]`. Das Feld ist abwaertskompatibel: bestehende Cluster-Level-Findings ohne Note-Liste funktionieren unveraendert; die `notificationSink`-Implementierung in main.ts ignoriert das Feld, wenn es leer ist. `NoteVerdict` traegt `path`, `verdict`, `confidence`, `summary`, `sources` und `verifierTier`. Die UI im Aging-knowledge-Tab konsumiert das Feld; legacy-Tests, die nur Cluster-Findings pruefen, bleiben gruen.

Note-Auswahl pro Cluster ist Aufgabe eines neuen `NoteSelector`, der innerhalb `webUpdatePass` aufgerufen wird. Auswahl-Heuristik: `freshness_class` aus dem bestehenden `note_freshness`-Eintrag bestimmt die Frequenz (volatile zuerst, evolving spaeter, stable nur on-demand), `last_checked_at` filtert kuerzlich geprueftes raus, `dismissed_freshness` mit `hint_type='verdict'` filtert User-Quittierungen raus. Der Selector liefert eine geordnete, bound-cappte Liste; default Top 5 pro Cluster.

Die `last_external_check`-Spalte aus `ClusterMetadataStore` wird vom Verifier gelesen und geschrieben (kein neues Feld). Sie entscheidet, ob ein Cluster ueberhaupt fuer einen Verifier-Run qualifiziert ist; der Stufe-3-Cooldown auf Cluster-Ebene bleibt das harte Gate.

Mobile-Klausel aus ADR-105 (Stufe-3 nur Desktop) bleibt unveraendert. Der Aging-knowledge-Tab auf Mobile zeigt persistierte Verdicts read-only, ohne Run-Trigger.
