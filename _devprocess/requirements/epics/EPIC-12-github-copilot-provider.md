# Epic: GitHub Copilot LLM Provider Integration

> **Epic ID**: EPIC-12
> **Business Alignment**: _devprocess/analysis/BA-07-github-copilot-provider.md
> **Scope**: MVP

## Epic Hypothesis Statement

FUER Obsidian-Nutzer mit bestehendem GitHub Copilot Abonnement
DIE ihre bezahlten Premium Requests fuer Vault-Management und AI-Aufgaben nutzen moechten
IST DIE GitHub Copilot Provider Integration
EIN neuer LLM Provider innerhalb der bestehenden Obsilo Provider-Architektur
DER Zugang zu allen Copilot-verfuegbaren Modellen (Chat + Embedding) ohne separate API Keys bietet
IM GEGENSATZ ZU manuell konfigurierten BYOK-Providern mit eigenen API Keys
UNSERE LOESUNG erfordert nur einen einmaligen GitHub-Login statt separater API Key Beschaffung

## Business Outcomes (messbar)

1. **Nutzer-Aktivierung**: Copilot-Auth-Erfolgsrate erreicht >95% innerhalb der ersten 2 Wochen nach Launch
2. **Modell-Abdeckung**: 100% der vom Copilot API gelisteten Modelle sind in Obsilo nutzbar
3. **Null-Regression**: 0 neue Bugs in bestehenden Providern (Anthropic, OpenAI, Ollama, etc.)

## Leading Indicators (Fruehindikatoren)

- Auth Flow Completion Rate: Anteil der User die den Device Code Flow vollstaendig abschliessen
- Token Refresh Success Rate: Anteil automatischer Token-Erneuerungen die ohne User-Intervention funktionieren
- Copilot Model Usage: Wie viele Chat-Sessions ueber Copilot-Modelle laufen (vs. BYOK)

## MVP Features

| Feature ID | Name | Priority | Effort | Status |
|------------|------|----------|--------|--------|
| FEAT-12-01 | GitHub Copilot Auth & Token Management | P0 | M | Not Started |
| FEAT-12-02 | Copilot Chat Completions Provider | P0 | M | Not Started |
| FEAT-12-03 | Settings UI Integration | P0 | M | Not Started |
| FEAT-12-04 | Copilot Embedding Support | P1 | S | Not Started |
| FEAT-12-05 | Dynamic Model Listing | P1 | S | Not Started |
| FEAT-12-06 | Modern Model Compatibility (max_completion_tokens) | P1 | XS | Implementiert v2.5.0 (BUG-015, Issue #28) |

**Priority Legend:**
- P0-Critical: Ohne geht MVP nicht
- P1-High: Wichtig fuer vollstaendige User Experience
- P2-Medium: Wertsteigernd, aber nicht essentiell

**Effort:** S (1-2 Sprints), M (3-5 Sprints), L (6+ Sprints)

## Explizit Out-of-Scope

- **Offizielle GitHub OAuth App**: Nutzt VSCode Client ID (de-facto Standard); Custom Client ID als Option
- **Copilot Chat Features**: Nur LLM API Zugang, nicht Copilots eigene Chat-Features
- **Code Completions**: Keine Inline-Suggestions (anderes Copilot-Feature)
- **Mobile-Support**: Electron safeStorage nicht auf Mobile verfuegbar
- **Auto-Provider-Switching**: Kein stilles Umschalten bei Copilot-Fehler; User entscheidet selbst
- **LangChain-Abhaengigkeit**: Direkte SDK-Integration, kein LangChain

## Dependencies & Risks

### Dependencies
- **SafeStorageService** (`src/core/security/SafeStorageService.ts`): Muss Token-Verschluesselung unterstuetzen. Bereits implementiert.
- **ApiHandler Interface** (`src/api/types.ts`): Provider muss Interface implementieren. Stabil.
- **ModelConfigModal** (`src/ui/settings/ModelConfigModal.ts`): Muss um Copilot-Auth-UI erweitert werden.
- **Provider Registry** (`src/api/index.ts`, `src/types/settings.ts`): ProviderType erweitern.

### Risks
| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GitHub sperrt VSCode Client ID | Niedrig | Hoch | Custom Client ID Feld; Disclaimers |
| Copilot API aendert Endpoints | Mittel | Mittel | Headers/URLs als Konstanten; API-Version-Header |
| Token Refresh Race Conditions | Niedrig | Mittel | Promise-Lock, Generation Counter |
| Claude-via-Copilot Content als Array | Hoch | Mittel | Content-Normalisierung im Stream-Handler |
| Community Plugin Review Ablehnung | Niedrig | Mittel | Strikte Review-Bot Compliance |

## Technical Debt

Keiner geplant -- dies ist MVP-Scope, nicht PoC. Integration folgt bestehenden Patterns.
