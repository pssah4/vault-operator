# Epic: Token-Kostenreduktion

> **Epic ID**: EPIC-018
> **Business Alignment**: _devprocess/analysis/BA-012-token-cost-reduction.md
> **Scope**: MVP

## Epic Hypothesis Statement

FUER Obsilo-Nutzer die taeglich Vault-Aufgaben an den AI-Agenten delegieren
DIE unter hohen Token-Kosten und Provider-Inkompatibilitaet leiden
IST DIE Token-Kostenreduktion
EIN Performance- und Kosten-Optimierungs-Release
DAS die Kosten pro Standard-Task um 80-90% senkt
IM GEGENSATZ ZU dem aktuellen Ansatz (8 volle LLM-Iterationen pro Task)
UNSERE LOESUNG kombiniert gelerntes Wissen (Recipes) mit intelligenter Ausfuehrung
und Provider-spezifischen Optimierungen, ohne die Ergebnisqualitaet zu beeintraechtigen.

## Business Outcomes (messbar)

1. **Token-Verbrauch**: Sinkt von 634.000 auf <130.000 Input-Tokens pro Standard-Task innerhalb 4 Wochen
2. **Kosten**: Sinkt von $2.00 auf <$0.30 pro Standard-Task (Sonnet 4.6 via OpenRouter) innerhalb 4 Wochen
3. **Provider-Kompatibilitaet**: 168k-Limit-Modelle (GitHub Copilot) koennen Standard-Tasks abschliessen ab Release

## Leading Indicators (Fruehindikatoren)

- **Iterationsreduktion**: Durchschnittliche LLM-Iterationen pro Task sinkt von 8 auf 2-3
- **Prompt Cache Hit Rate**: >80% bei Providern die Caching unterstuetzen
- **Fast Path Nutzung**: >30% aller Tasks nutzen Fast Path nach 2 Wochen Lernzeit

## MVP Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEATURE-1800 | Fast Path Execution | P0 | M | Implementiert (ADR-061) |
| FEATURE-1801 | Prompt Caching (Provider-agnostisch) | P0 | S | Implementiert (ADR-062) |
| FEATURE-1802 | Context Externalization (Dateisystem als Kontext) | P1 | M | Implementiert (ADR-063) |
| FEATURE-1803 | Cross-Platform TMP-Pfade fuer Context Externalization | P1 | S | Implementiert v2.5.0 (BUG-014, Issue #29) |

**Priority:** P0-Critical (ohne geht MVP nicht), P1-High (wichtig), P2-Medium (wertsteigernd)
**Effort:** S (1-3 Tage), M (4-7 Tage), L (2+ Wochen)

## Explizit Out-of-Scope

- **Modell-Distillation**: Eigenes kleineres Modell trainieren -- zu aufwaendig, anderer Ansatz
- **Deferred Tool Loading** (als Standalone): Riskiert Qualitaetsverlust -- nur innerhalb Fast Path
- **Prompt-Kompression**: System Prompt zusammenfassen/kuerzen -- zu riskant fuer Qualitaet
- **Agent-Loop-Rewrite**: Grundlegende Aenderung der ReAct-Architektur -- zu hoher Blast Radius

## Dependencies & Risks

### Dependencies
- **ADR-058 (Semantic Recipe Promotion)**: Fast Path baut auf gelernten Recipes auf. Bereits implementiert.
- **Provider APIs**: Prompt Caching erfordert Provider-spezifische API-Features. Muessen stabil sein.

### Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Fast Path waehlt falsche Tools | M | H | Fallback auf normale ReAct-Loop |
| Prompt Caching invalidiert zu oft | M | M | Stabile Sections zuerst positionieren |
| Search-Optimierung filtert relevante Treffer | L | H | Vergleichstest vor/nach |
| Recipes decken zu wenige Patterns ab | M | M | Fast Path ist optional, normale Loop bleibt |
| Provider aendern Caching-Semantik | L | M | Abstraktion + Feature-Detection |
