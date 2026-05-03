---
id: ADR-104
title: Web-Search-Provider-Strategie (BYOK obligatorisch)
status: Proposed
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

Stufe-2-Activity-Trigger (FEAT-19-19), Stufe-3-Periodischer-Job (FEAT-19-20) und Anti-Echo-Suche (FEAT-19-14) brauchen Web-Search. Zwei Strategie-Optionen: BYOK (User bringt eigenen Provider-API-Key fuer Brave oder Tavily, wie in FEAT-04-02 etabliert) oder Default-Provider via Obsilo-Gateway (Token-Kosten ueber User-Account-Subscription).

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
- Keine zusaetzliche Obsilo-Gateway-Infrastruktur.
- Privacy: Queries gehen direkt User-zu-Provider.

Cons:
- Casual-User muss eigenen API-Key besorgen.

### Option B: Default-Provider via Obsilo-Gateway (Subscription)

Pros:
- Casual-User braucht keinen eigenen API-Key.

Cons:
- Obsilo-Gateway-Infrastruktur muss gebaut werden (separates Projekt).
- Token-Kosten bei Obsilo, undurchsichtig fuer User.
- Privacy: Queries laufen ueber Obsilo-Gateway.
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
- Gateway-Infrastruktur waere separates Projekt (siehe FEAT-09-01 Obsilo Gateway, Status Candidates).
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
