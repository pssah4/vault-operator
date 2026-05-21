---
id: ADR-125
title: Execution Visibility fuer Plugin-Commands via Notice-Capture
date: 2026-05-20
deciders: [Sebastian, Architekt-Agent]
asr-refs: [ASR-29-08, ASR-29-09]
feature-refs: [FEAT-29-04]
related-adrs: [ADR-01]
supersedes: null
superseded-by: null
---

# ADR-125: Execution Visibility fuer Plugin-Commands via Notice-Capture

## Context

Das heutige Command-Execution-Tool ruft die Obsidian-Command-API direkt auf und meldet dem Modell nur, ob das Command unter dem angeforderten Namen registriert war. Ob das Command intern erfolgreich gelaufen ist, ob ein Modal nicht geschlossen wurde, ob ein "kein aktiver Editor"-Fehler aufgetreten ist, ob eine Permission-Verweigerung die Aktion abgebrochen hat, bleibt fuer das Modell unsichtbar. Der Effekt: der Agent meldet dem User "erledigt", obwohl die Aktion still gescheitert ist. Das ist die haerteste Bruchstelle in der Plugin-Integration, weil sie silent ist und Vertrauen zerstoert.

Plugins kommunizieren Erfolg, Warnungen und Fehler ueblicherweise ueber die Obsidian-Notice-API. Diese Notices erscheinen kurz im oberen rechten Bildschirmbereich, werden aber heute nicht an den Agent zurueckgeliefert.

**Triggering ASR:**
- ASR-29-08 (Critical): Notice-Capture darf Plugin-Internals nicht brechen
- ASR-29-09 (Moderate): Strukturiertes Notice-Schema im tool_result
- Quality attribute: Reliability, Observability, User-Trust

## Decision drivers

- **Silent-Failure-Eliminierung**: Notices sind die einzige konsistent verfuegbare Erfolgs-/Fehler-Signal-Quelle fuer Plugin-Commands.
- **Plugin-Kompatibilitaet**: Manche Plugins haben eigene Notice-Wrapper. Capture darf deren Code nicht brechen.
- **Strukturierte Rueckmeldung**: Modell muss programmatisch auf Capture-Inhalt reagieren koennen, nicht aus Freitext parsen.
- **Performance-Neutralitaet**: Capture darf die Latenz von Plugin-Commands nicht spuerbar erhoehen.

## Considered options

### Option 1: Notice-API-Patch waehrend Command-Execution-Window

Vor dem Command-Aufruf wird die Notice-Konstruktor-Funktion monkey-patched, alle waehrend des Calls erzeugten Notices werden in einem Buffer gesammelt. Nach dem Call wird der Original-Konstruktor wiederhergestellt und der Buffer als strukturiertes Feld im tool_result an den Agent gegeben.

- Pro: Vollstaendige Capture aller Notice-Texte ohne dass Plugins ihren Code aendern muessen.
- Pro: Klare Lifecycle-Boundary, Patch lebt nur Sekundenbruchteile.
- Con: Monkey-Patching ist fragil bei Plugins die selbst auf Notice-API patchen.
- Con: Async-Notices die nach dem Command aber waehrend laufender Promise-Chain entstehen koennten verpasst werden.

### Option 2: DOM-Observer auf Notice-Container

Statt API-Patch wird der DOM-Knoten, in dem Notices gerendert werden, mit einem MutationObserver beobachtet.

- Pro: Funktioniert unabhaengig davon, wie Plugins die Notice-API aufrufen.
- Con: Latenz und Robustheit haengen von Obsidian-DOM-Stabilitaet ab. Bei Obsidian-Update kann der Selector brechen.
- Con: Mehr Async-Code, Race-Conditions schwerer zu kontrollieren.

### Option 3: Plugin-spezifische Wrapper

Jeder Plugin-Adapter bekommt einen eigenen Wrapper der den Output des Plugins versteht und uebersetzt.

- Pro: Maximale Kontrolle pro Plugin.
- Con: Skaliert nicht, jeder neuer Plugin braucht eigenen Adapter.
- Con: Bricht die generische execute_command-Abstraktion.

## Decision

**Proposed option:** Option 1, Notice-API-Patch mit klar definiertem Capture-Window plus optionalem kurzem Tail-Window fuer Async-Effekte.

**Reasoning:**
Notice-API-Patch ist die einzige Loesung die ohne Obsidian-DOM-Annahmen funktioniert und gleichzeitig auf alle Plugins gleich wirkt. Die Fragilitaet bei Plugin-internem Patching wird mit Fail-Soft begegnet: wenn der Patch nicht greift, faellt das Tool zurueck auf den heutigen "command-was-registered"-Modus mit klarer Log-Warnung. Ein optionales Tail-Window von ein bis zwei Sekunden nach dem synchronen Command-Aufruf faengt asynchrone Notice-Effekte ab.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Agent kann auf Plugin-Erfolg, -Warnung oder -Fehler differenziert reagieren.
- User sieht die echte Plugin-Antwort im Chat statt eines falschen "erledigt".
- Spaetere Audit-Logs koennen die Plugin-Command-Ergebnisse rekonstruieren.

### Negative

- Monkey-Patching erhoeht Code-Komplexitaet im Execution-Pfad.
- Bei Plugins die selbst die Notice-API patchen besteht das Risiko von Capture-Verlusten oder doppelten Captures.

### Risks

- **Patch-Konflikt mit Plugin**: mitigation durch Fail-Soft (fallback auf heutiges Verhalten plus Warning-Log) und durch Test-Suite die mit Plugins die eigenen Notice-Code haben gefahren wird.
- **Async-Tail-Notices verpasst**: mitigation durch optionales kurzes Tail-Window mit Cap auf maximale Wartezeit pro Command (z.B. zwei Sekunden) damit Command-Latenz aus User-Sicht stabil bleibt.
- **Sensitive Daten in Notices**: mitigation durch Heuristik die offensichtliche Sensitiv-Marker (key, token, secret) im Capture-Output redacted bevor das Tool-Result an das Modell geht.

## Related decisions

- ADR-01: Zentrale Tool-Execution-Pipeline. ADR-121 erweitert den Pipeline-Punkt fuer execute_command um Notice-Capture, ohne die Pipeline-Architektur zu aendern.

## References

- FEAT-29-04: Execution Visibility
- EPIC-29

---

## Implementation Notes (optional, may go stale)

Erste Skizze fuer die /coding-Phase:

- Patch lebt im execute_command-Tool-Handler, der Original-Konstruktor wird vor dem Plugin-Aufruf via Closure gespeichert und nach Promise-Resolution oder Timeout wiederhergestellt.
- Capture-Buffer ist ein Array von Objekten mit Feldern fuer Text, Severity-Heuristik (success/warning/error abgeleitet aus Notice-Klassen-Markern wenn verfuegbar), und Timestamp.
- Tail-Window wird ueber setTimeout implementiert, Promise.race kappt nach maximaler Wartezeit.
- Test-Suite gegen Plugins wie Templater, Dataview, Excalidraw die unterschiedlich viele Notices erzeugen.
