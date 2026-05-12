# Feature: GitHub Copilot Modern Model Compatibility (max_completion_tokens)

> **Feature ID**: FEAT-12-06
> **Epic**: EPIC-12 (GitHub Copilot LLM Provider)
> **Priority**: P1
> **Effort Estimate**: XS
> **Bug-Bezug**: BUG-015, Issue #28
> **Bezogene Features**: FEAT-12-02 (Copilot Chat Completions)

## Feature Description

Der Copilot-Provider sendet aktuell unbedingt `max_tokens`. Neuere Modelle (gpt-5, gpt-5-codex, o3, o4-mini) lehnen diesen Parameter ab und verlangen `max_completion_tokens`. Das Feature ersetzt den Body-Parameter im Copilot-Provider, sodass alle aktuellen und kuenftigen Copilot-Modelle ohne 400-Fehler funktionieren.

## User Story

**Als** Vault Operator-User mit GitHub-Copilot-Abo
**moechte ich** alle Copilot-Modelle (gpt-5, o4-mini, claude-sonnet) im Sidebar-Chat verwenden
**um** die volle Modellbandbreite zu nutzen, fuer die ich bezahle.

## Success Criteria

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | gpt-5 ueber Copilot beantwortet eine Chat-Nachricht ohne 400 | 100% | Live-Test |
| SC-02 | o4-mini ueber Copilot beantwortet eine Chat-Nachricht ohne 400 | 100% | Live-Test |
| SC-03 | claude-sonnet ueber Copilot beantwortet eine Chat-Nachricht ohne 400 | 100% | Live-Test |
| SC-04 | classifyText() (Embedding-Skill-Match) funktioniert weiter | Kein Regress | Bestehender Smoke-Test |
| SC-05 | runTest() in der Settings-UI gibt fuer alle drei Modelle "OK" zurueck | 100% | Manueller Settings-Test |

## Out of Scope

- Konsolidierung von Copilot- und OpenAi-Provider (eigenes Refactoring-Feature).
- Token-Budget-Anzeige fuer reasoning-Modelle (separates Feature).
- Modell-spezifisches Branching fuer Modelle die noch `max_tokens` verlangen. Voraussetzung dieser Loesung: Copilot-Gateway akzeptiert `max_completion_tokens` einheitlich.

## Verifikation

1. Build: `npm run build` ohne Fehler.
2. `runTest()` aus `testModelConnection.ts` gegen Copilot mit gpt-5: Smoke-Test gruen.
3. Live-Test in Sidebar-Chat: 1 User-Nachricht beantwortet ohne Fehler.
4. Regression: alte Modelle (falls noch im Copilot-Katalog) funktionieren weiterhin.
