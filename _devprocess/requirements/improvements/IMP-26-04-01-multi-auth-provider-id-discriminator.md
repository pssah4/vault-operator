---
id: IMP-26-04-01
feature: FEAT-26-04
epic: EPIC-26
adr-refs: []
plan-refs: [PLAN-25]
audit-refs: [AUDIT-027]
depends-on: []
created: 2026-05-16
---

# IMP-26-04-01: Multi-auth Provider-Instance-ID-Discriminator entkoppeln vom API-Key

## Motivation

AUDIT-027 L-1 (defensiv, kein Exploit-Pfad). Die Migration `activeModelsToProviders` weist Provider-Configs Instance-IDs der Form `${type}-${authKey.slice(0, 8)}` zu, wenn ein User mehrere Auth-Konfigurationen für denselben Provider-Type pflegt. Der Discriminator kommt direkt aus den ersten acht Zeichen des API-Keys.

Zwei kleinere Defensiv-Schwächen:

1. **Logging-Surface.** Sollte die ID jemals in einem Debug-Log auftauchen, wären acht Zeichen des Schlüssels sichtbar. Genug für Fingerprinting, nicht für direkte Kompromittierung.
2. **Kollisions-Risiko.** Zwei API-Keys mit identischer 8-Zeichen-Prefix kollabieren in eine Provider-Config. Wahrscheinlichkeit bei zufälligen Keys: rund 1 / 2^48, bei provider-issued Keys mit gemeinsamer Vendor-Prefix-Struktur etwas höher. Failure-Modus ist still.

Beide Pfade treffen nur Multi-Auth-Setups, was im Sebastian-Use-Case heute nicht vorkommt. Der Punkt ist Hygiene, nicht akutes Risiko.

## Plan

Ersetzt den API-Key-Discriminator durch einen einfachen Counter:

- Erste Auth-Gruppe pro Provider-Type: `${type}-main` (unverändert).
- Zweite, dritte, ... Auth-Gruppe: `${type}-2`, `${type}-3`, ... in Reihenfolge der Migration. ID-Set wird vor der Allocation gesammelt, Counter überspringt belegte Werte.

Code-Touch: `src/core/settings/migrations/activeModelsToProviders.ts` -- die `providerInstanceId(providerType, suffix?)`-Funktion plus die Aufrufstelle im `byAuth`-Loop.

## Tests

`src/core/settings/migrations/__tests__/activeModelsToProviders.test.ts` um zwei Tests erweitern:

1. Multi-Auth-Setup mit zwei Anthropic-Models (verschiedene API-Keys): erwartete IDs sind `anthropic-main` und `anthropic-2`, nicht abhängig vom Key-Prefix.
2. Idempotenz: zweimal hintereinander auf demselben Setup laufen lassen produziert dieselben IDs.

## Akzeptanzkriterien

- Keine Provider-ID enthält API-Key-Material.
- Multi-Auth-Setups erhalten stabil enumerierte IDs (main, 2, 3, ...).
- Migrations-Tests grün.

## Out-of-Scope

- Bestehende Provider-IDs in User-data.json werden NICHT umbenannt. Wer migriert hat, behält die alten IDs (Daten-Stabilität wichtiger als Kosmetik-Fix).
- ProvidersTab + ProviderDetailModal müssen die alten ID-Schemata weiterhin akzeptieren.
