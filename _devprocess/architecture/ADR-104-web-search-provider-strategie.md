---
id: ADR-104
title: Web-Search-Provider-Strategie (BYOK obligatorisch)
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-14
  - FEAT-19-19
  - FEAT-19-20
  - FEAT-04-02
---

# ADR-104: Web-Search-Provider-Strategie (BYOK obligatorisch)

## Context

Stufe-2-Activity-Trigger (FEAT-19-19), Stufe-3-Periodischer-Job (FEAT-19-20) und Anti-Echo-Suche (FEAT-19-14) brauchen Web-Search. Zwei Strategie-Optionen: BYOK (User bringt eigenen Provider-API-Key fuer Brave oder Tavily, wie in FEAT-04-02 etabliert) oder Default-Provider via Vault Operator-Gateway (Token-Kosten ueber User-Account-Subscription).

## Decision Drivers

- Token-Kosten-Transparenz (User soll wissen was er bezahlt)
- Existierende Provider-Infrastruktur (FEAT-04-02 ist released)
- Privacy (welche Queries gehen wohin)
- Setup-Friction fuer Casual-User

## Considered Options

### Option A: BYOK obligatorisch (reuse FEAT-04-02)

Pros:
- Existing Stack (Brave, Tavily, weitere via FEAT-04-02).
- Token-Kosten direkt beim User-Provider, transparent.
- Keine zusaetzliche Vault Operator-Gateway-Infrastruktur.
- Privacy: Queries gehen direkt User-zu-Provider.

Cons:
- Casual-User muss eigenen API-Key besorgen.

### Option B: Default-Provider via Vault Operator-Gateway (Subscription)

Pros:
- Casual-User braucht keinen eigenen API-Key.

Cons:
- Vault Operator-Gateway-Infrastruktur muss gebaut werden (separates Projekt).
- Token-Kosten bei Vault Operator, undurchsichtig fuer User.
- Privacy: Queries laufen ueber Vault Operator-Gateway.
- Subscription-Modell setzt Monetarisierung voraus, die noch nicht released ist.

### Option C: Hybrid (BYOK Default, Gateway optional spaeter)

Pros:
- Flexibel.

Cons:
- Doppelte Implementation.

## Decision

**Option A**: BYOK obligatorisch. Reuse FEAT-04-02 Web-Search-Provider-Stack (Brave, Tavily). Wenn kein Provider konfiguriert: Stufe-2 und Stufe-3 sind in Settings deaktiviert mit Hint "Configure Web Search Provider in Settings".

Begruendung:
- FEAT-04-02 ist released und produktiv. Reuse spart Implementation komplett.
- Token-Transparenz ist BA-25 N7 (Cross-Persona-Need): "User will Token-Budget kontrollieren koennen".
- Gateway-Infrastruktur waere separates Projekt (siehe FEAT-09-01 Vault Operator Gateway, Status Candidates).
- Casual-User-Friction ist akzeptabel weil Stufe-2/3-Lint-Features explizit Power-User sind.

## Consequences

### Positive
- Null neue Infrastruktur.
- Token-Kosten transparent.
- Privacy bleibt User-controlled.
- Existing Provider-Switching (Brave vs Tavily) funktioniert sofort.

### Negative
- Casual-User ohne API-Key bekommt keine Stufe-2/3-Funktionalitaet. Mitigation: UI-Hint plus Setup-Link in Settings.

### Risks
- Wenn FEAT-04-02 spaeter Providers wechselt, Lint-Features muessen mitziehen. Mitigation: Lint nutzt nur Provider-Abstraktion (WebSearchService), kein direkter Provider-Code.

## Implementation Notes

Web-Search-Calls in Lint laufen ueber existing `WebSearchService` (FEAT-04-02). Pre-Check vor Stufe-2/3-Aktion: `webSearchService.isConfigured()` -> wenn false, Action disabled mit Hint.

Anti-Echo-Suche-Spezifika: Source-Filter via Provider-Query-Operator (`-site:dominante-domain.com`) wenn Provider unterstuetzt; sonst Post-Filter auf Result-URLs.

## Amendment 2026-06-19 (IMP-20-06-01)

Der Note-Verifier aus IMP-20-06-01 ergaenzt den `WebSearchService` um eine zweite Aufruf-Form: `verifierQuery(note, cluster)`. Im Unterschied zu freien Recherche-Calls, die der Agent im Chat als Tool-Use absetzt, ist diese Form Plugin-intern und nicht user-initiiert. Privacy-Implikation: dieselbe Note kann pro Verifier-Run einen Such-Call ausloesen, und ueber tausende Notes summiert ergibt das eine signifikante Datenmenge, die an den Suchanbieter geht.

Aus dieser Asymmetrie ergeben sich zwei Konvention-Erweiterungen:

Erstens eine harte Query-Laenge-Schranke von 400 Zeichen, durchgesetzt im Query-Builder, nicht im Provider-Adapter. Der Builder erzeugt die Query aus einer Keywords-Projektion des Note-Inhalts (Top-N Substantive, Cluster-Topic, maximal ein bis zwei zitierte Claim-Saetze) und nicht aus dem Volltext. Ein Unit-Test pinnt den Cap; ein Pull-Request der den Cap aufweicht, schlaegt fehl. Der Cap ist eine inhaltliche Aussage, kein Token-Sparen: was nicht ins 400er-Fenster passt, ist mit hoher Wahrscheinlichkeit kontextuell schon Volltext und gehoert nicht in eine externe Anfrage.

Zweitens ein separater Settings-Toggle `freshness.externalSources.enabled`, default off. Der bestehende `webTools.enabled`-Toggle aktiviert agentengesteuerte Recherche-Tools im Chat. Der neue Toggle gilt ausschliesslich fuer die Verifier-Pipeline. Ohne den neuen Toggle laeuft die Verifier-Pipeline ohne externe Suche und liefert `severity: no_external_source`. User, die fuer Chat-Recherche einen API-Key hinterlegt haben, eskalieren damit nicht still in den Background-Verifier.

Die Provider-Wahl folgt der existierenden User-Konfiguration (`webTools.provider` mit den Werten `brave`, `tavily` oder `none`). Es gibt heute keinen Provider-Fallback, und diese Amendment fuehrt auch keinen ein; der Verifier nutzt schlicht den vom User aktivierten Provider. Bei `provider === 'none'` faellt das Verdict auf `severity: no_external_source` zurueck. Model-native Web-Search wird in dieser Amendment ausdruecklich NICHT eingefuehrt; sie waere eine eigene Folge-ADR.

Code-seitig nutzt der Verifier denselben Provider-Pfad wie das bestehende `WebSearchTool` (`src/core/tools/web/WebSearchTool.ts`). Wir bauen keinen zweiten Service-Layer, sondern einen schlanken `FreshnessWebSearch`-Helper, der die existierenden Provider-Calls wiederverwendet und den Query-Cap im Builder enforced.
