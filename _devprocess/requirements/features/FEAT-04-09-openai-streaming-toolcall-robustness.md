# Feature: OpenAI-kompatible Streaming Tool-Call Robustheit

> **Feature ID**: FEAT-04-09
> **Epic**: EPIC-04 (Providers, Web, Localization)
> **Priority**: P1
> **Effort Estimate**: XS
> **Bug-Bezug**: BUG-013, Issue #30
> **Bezogene Features**: FEAT-04-03 (Providers & Models)
> **Backlog row:** `_devprocess/context/BACKLOG.md` -> FEAT-04-09
> (Status, Phase, Commit-SHA leben dort.)
> **Code pointer:** ARCHITECTURE.map concept `openai`.

## Feature Description

Im OpenAI- und Copilot-Provider werden Tool-Call-Akkumulatoren nach dem Stream-Ende nicht ausgegeben, wenn `finish_reason !== "tool_calls"`. Manche OpenAI-kompatible Provider (OpenRouter mit gpt-oss-120b, Groq, einige lokale Backends) liefern `finish_reason="stop"` zusammen mit gefuellten `delta.tool_calls`. Das Feature ergaenzt einen Post-Loop-Flush, sodass Tool-Calls auch in diesen Faellen ausgefuehrt werden.

## User Story

**Als** Vault Operator-User mit OpenRouter-Konfiguration und einem Open-Source-Modell wie gpt-oss-120b
**moechte ich** dass der Agent Tools korrekt aufruft statt Tool-Argumente als JSON-Text auszugeben
**um** unabhaengig von Provider-spezifischen finish_reason-Quirks alle unterstuetzten Modelle nutzen zu koennen.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Tool-Calls werden bei finish_reason="stop" ausgefuehrt | 100% der Faelle | Unit-Test mit Mock-Stream |
| SC-02 | Tool-Calls werden bei finish_reason="tool_calls" weiterhin korrekt ausgefuehrt (kein Doppel-Yield) | 100% | Regression-Test |
| SC-03 | Tool-Calls werden bei finish_reason="length" ausgefuehrt sofern Akkumulator-Map gefuellt ist | 100% | Unit-Test |
| SC-04 | OpenRouter gpt-oss-120b ruft list_files erfolgreich auf | manueller Test | Live-Test |

## Out of Scope

- Konsolidierung der OpenAI- und Copilot-Streaming-Loops in eine gemeinsame Basis.
- Aenderung der Tool-Call-Parsing-Logik selbst (nur das Flush-Verhalten).

## Verifikation

1. Build: `npm run build` ohne Fehler.
2. Unit-Test in `tests/api/providers/openai.test.ts`: Mock-Stream mit `delta.tool_calls` plus `finish_reason="stop"` produziert mindestens einen `type: "tool_use"` Event.
3. Live-Test: OpenRouter mit `openai/gpt-oss-120b`, einfacher list_files-Aufruf.
4. Regression: gpt-4o ueber OpenRouter mit Tool-Call funktioniert weiter (kein Doppel-Yield).
