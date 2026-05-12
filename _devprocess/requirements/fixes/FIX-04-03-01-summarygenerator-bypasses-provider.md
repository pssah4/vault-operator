---
id: FIX-04-03-01
feature: FEAT-04-03
epic: EPIC-04
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-08
issue: https://github.com/pssah4/vault-operator-dev/issues/60
---

# FIX-04-03-01: SummaryGenerator umgeht konfigurierten Provider, Anthropic 400 trotz OpenRouter-Setup

## Symptom

Live-Test 2026-05-08 (`/ingest-deep` auf
`Attachements/enbw-geschaeftsbericht-2025.pdf`, branch
`feature/block-source-citations`). Konsole zeigt vier aufeinanderfolgende
Anthropic-API-Fehler:

```
api.anthropic.com/v1/messages:1  Failed to load resource: the server responded with a status of 400 ()
api.anthropic.com/v1/messages:1  Failed to load resource: the server responded with a status of 400 ()
api.anthropic.com/v1/messages:1  Failed to load resource: the server responded with a status of 400 ()
api.anthropic.com/v1/messages:1  Failed to load resource: the server responded with a status of 400 ()
[SummaryGenerator] failed for Sources/EnBW-Geschaeftsbericht-2025-Mirror.md:
console.warn @ plugin:obsilo-agent:301800
```

Aktiver Provider war OpenRouter (parallele
`[SemanticIndex] Embedding via SDK: openrouter ...`-Eintraege belegen
das). Die Calls an `api.anthropic.com` haben keinen funktionalen Bezug
zur OpenRouter-Konfiguration.

## Root cause -- Hypothese (zu validieren)

Wiederkehrendes Pattern (siehe BUG-016, Wave 2 in `memory/MEMORY.md`).
Hilfs-LLM-Konsumenten innerhalb des Plugins instanziieren teils einen
Anthropic-Client direkt, statt durch den ProviderResolver zu gehen, der
den vom User konfigurierten Provider liefert. Bei OpenRouter-Setup
hat das Plugin keinen gueltigen Anthropic-API-Key, der Anthropic-Client
sendet trotzdem (Auth wird teils erst bei Request-Build gepruefst), und
der Server antwortet mit 400.

```
SummaryGenerator.ts (vermutet)
  -> new Anthropic({ apiKey: '' })   // statt providerResolver.getActive()
  -> client.messages.create(...)
  -> 400 Bad Request (kein gueltiges Auth + ggf. ungueltiger Body)
  -> retry-loop (4x in Logs sichtbar)
```

Code-Pointer noch zu validieren -- erster Schritt ist
`grep -rn "SummaryGenerator" src/`. Das gleiche Pattern wurde Anfang
April auf MemoryService und ContextPrefixBuilder beobachtet (BUG-016,
in MEMORY notiert als "Memory+Context-Prefix bypass configured
provider -> Anthropic direct").

## Fix

Offen. Vorschlag:

1. SummaryGenerator-Service identifizieren und die Anthropic-Client-Instanziierung
   gegen den ProviderResolver tauschen (gleicher Fix wie BUG-016).
2. Fail-soft: wenn der aktive Provider keinen Summarization-fauehigen
   Modell-Slot hat, einmal sauber loggen und abbrechen statt 4x 400
   zu produzieren (Retry-Backoff oder fail-once-Guard).
3. Systematischer Audit als Folge-IMP: alle Anthropic-Client-Instanziierungen
   im Code aufzaehlen, sodass dieses Pattern nicht ein drittes Mal
   wiederkehrt (siehe IMP-04-03-01 falls eroeffnet).

## Regression test

Smoke-Test: Provider auf OpenRouter konfigurieren, ein PDF ingesten,
sicherstellen dass kein Request an `api.anthropic.com` geht (per
network-mock oder MSW). Plus Assertion: SummaryGenerator-Output
existiert nach erfolgreichem Run, nicht leer.

## Status

See the backlog row for FIX-04-03-01 in `_devprocess/context/BACKLOG.md`
(status, phase, claim, commit SHA).

## Tracking

GitHub Issue: https://github.com/pssah4/vault-operator-dev/issues/60
