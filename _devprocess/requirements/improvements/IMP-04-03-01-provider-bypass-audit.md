# IMP-04-03-01: Provider-Bypass-Audit -- alle direkten LLM-Client-Instanziierungen auf ProviderResolver umstellen

**Prioritaet:** P2 (Pattern wiederkehrend, kein akuter Daten-Bug)
**Feature-Bezug:** FEAT-04-03 (Providers & Models), EPIC-04
**Verwandt:** FIX-04-03-01 (Sub-Issue, SummaryGenerator), BUG-016 (Memory + Context-Prefix, in `memory/MEMORY.md` als offen markiert)

## Problem

Wiederkehrendes Pattern: Hilfs-LLM-Konsumenten im Plugin instanziieren
teils einen Anthropic-Client (oder OpenAI-Client) direkt, statt durch
den `ProviderResolver` zu gehen, der den vom User konfigurierten
aktiven Provider liefert. Bei Setups mit konfiguriertem Nicht-
Anthropic-Provider (OpenRouter, Bedrock, GitHub Copilot, Ollama)
schlagen diese Calls mit 400/401 fehl, weil kein gueltiger
Anthropic-API-Key existiert.

Bekannte Vorkommen:

- **BUG-016** -- Memory- und Context-Prefix-Pfad, im April 2026 in der
  Community-Wave-1-Beta gefunden, in `memory/MEMORY.md` als "Open Wave
  2" markiert (`bypass configured provider -> Anthropic direct`). Noch
  nicht als eigener FIX-Eintrag im Backlog erfasst.
- **FIX-04-03-01** ([#60](https://github.com/pssah4/vault-operator-dev/issues/60))
  -- SummaryGenerator schlaegt mit 4x 400 fehl bei OpenRouter-Setup,
  Live-Test 2026-05-08.

Zwei aufgetretene Faelle innerhalb von ~3 Wochen am gleichen Pattern
sind ein Architektur-Smell, kein Einzelfall.

## Scope

Systematischer Audit aller Stellen im Plugin, an denen ein LLM-Client
direkt instanziiert wird, statt durch den ProviderResolver zu gehen.

In-Scope:

1. Code-Audit:
   - `grep -rn "new Anthropic(" src/`
   - `grep -rn "new OpenAI(" src/`
   - `grep -rn "api.anthropic.com\|api.openai.com" src/`
   - Plus alle Hilfs-LLM-Pfade (Memory-Service, ContextPrefixBuilder,
     SummaryGenerator, ggf. Skill-Mastery-Loop, ggf.
     Embedding-Wrapper).
2. Pro Treffer:
   - ProviderResolver verwendbar? Wenn ja: umstellen + Test.
   - Falls bewusst direkt belassen (z. B. Embeddings nur via OpenRouter):
     mit Begruendung im Code-Kommentar belassen.
3. Fallback-Policy: Wenn der aktive Provider keinen passenden
   Modell-Slot fuer den Hilfs-LLM-Use-Case hat (z. B. SummaryGenerator
   unter Bedrock-EU ohne Sonnet-Slot), klar definieren:
   - Feature gracefully disablen mit user-sichtbarer Notice, oder
   - Default-Fallback auf einen anderen konfigurierten Slot (mit
     User-Setting).
4. Lint-Regel ergaenzen: ESLint-Rule, die `new Anthropic(` /
   `new OpenAI(` ausserhalb des Provider-Modules verbietet, sodass
   das Pattern nicht ein drittes Mal wiederkehrt.

Out-of-Scope:

- Erfassung von BUG-016 als eigener FIX-Eintrag (separat, sobald die
  konkreten Logs zur Hand sind).
- Embedding-Provider-Pfad (OpenRouter laeuft hier bewusst direkt; das
  ist gewuenscht, weil kein anderer Provider die Embedding-Modelle
  spiegelt).

## Akzeptanzkriterien

1. Code-Audit-Liste in einem Detail-Doc unter
   `_devprocess/analysis/IMP-04-03-01-provider-bypass-audit.md` mit
   allen direkten LLM-Client-Instanziierungen, je mit Status
   (umgestellt / belassen mit Begruendung).
2. FIX-04-03-01 (SummaryGenerator) als erstes konkretes Resultat
   abgeschlossen.
3. ESLint-Rule landet, blockt neue direkte Instanziierungen.
4. Regression-Test: Provider auf OpenRouter setzen, alle Hilfs-LLM-
   Pfade durchspielen (Memory, Context-Prefix, SummaryGenerator,
   ggf. weitere). Keine Anthropic-Domain-Calls in Network-Mock.

## Tracking

GitHub Issue (Parent): wird in Phase 1 angelegt; Sub-Issue:
[#60](https://github.com/pssah4/vault-operator-dev/issues/60) (FIX-04-03-01).
