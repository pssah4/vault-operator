# Business Analysis: GitHub Copilot LLM Provider Integration

> **Scope:** MVP (C)
> **Erstellt:** 2026-03-18
> **Status:** Draft

---

## 1. Executive Summary

### 1.1 Problem Statement
Obsilo Agent unterstuetzt aktuell LLM-Provider ausschliesslich ueber BYOK (Bring Your Own Key) -- Anthropic, OpenAI, Ollama, LM Studio, OpenRouter, Azure, Custom. Nutzer mit einem bestehenden GitHub Copilot Abo (Pro/Business/Enterprise) koennen ihre bereits bezahlten Premium Requests nicht nutzen und muessen separate API Keys erwerben und konfigurieren.

### 1.2 Proposed Solution
GitHub Copilot als vollwertigen LLM Provider integrieren, analog zu bestehenden Providern. Authentifizierung ueber GitHub OAuth Device Code Flow, dynamisches Modell-Listing ueber Copilot API, Nutzung fuer Chat-Modelle und Embedding-Modelle. Integriert in bestehende Provider-Architektur (ProviderType, CustomModel, LLMProvider, ApiHandler).

### 1.3 Expected Outcomes
- Nutzer koennen ihr bestehendes GitHub Copilot Abo direkt in Obsilo nutzen
- Zugang zu allen Copilot-verfuegbaren Modellen (Claude, GPT, Gemini etc.) ohne separate API Keys
- Embedding-Modelle ueber Copilot fuer den SemanticIndexService nutzbar
- Konsistente UX: GitHub Copilot erscheint als Provider im Dropdown wie OpenAI, Ollama etc.

---

## 2. Business Context

### 2.1 Background
GitHub Copilot bietet seit 2025 Zugang zu verschiedenen LLM-Familien (Claude, GPT, Gemini, etc.) ueber ein einziges Abo-Modell mit Premium Requests. Viele Obsidian-Nutzer haben bereits ein GitHub Copilot Abo fuer ihre IDE-Nutzung. Andere Obsidian-Plugins (z.B. obsidian-copilot) haben diese Integration bereits erfolgreich umgesetzt.

### 2.2 Current State ("As-Is")
- 7 Provider-Typen verfuegbar: anthropic, openai, ollama, lmstudio, openrouter, azure, custom
- Alle erfordern eigene API Keys pro Provider
- Provider-Architektur sauber abstrahiert: `ProviderType` → `CustomModel` → `LLMProvider` → `ApiHandler`
- Settings UI mit Model-Table, Provider-Dropdown, ModelConfigModal
- `SafeStorageService` fuer verschluesselte Token-Speicherung vorhanden
- Embedding-Provider separat konfigurierbar (`EMBEDDING_PROVIDERS` Liste)

### 2.3 Desired State ("To-Be")
- GitHub Copilot als 8. Provider verfuegbar (`github-copilot` ProviderType)
- OAuth Device Code Flow fuer Authentifizierung (User autorisiert ueber GitHub.com)
- Dynamische Modell-Abfrage ueber Copilot `/models` Endpoint
- Chat-Modelle UND Embedding-Modelle ueber Copilot nutzbar
- Token-Management: automatische Erneuerung, sichere Speicherung ueber SafeStorageService
- Klare Fehlermeldungen wenn Premium Requests aufgebraucht oder Auth abgelaufen

### 2.4 Gap Analysis
| Gap | Beschreibung |
|-----|-------------|
| Auth-Modell | Bestehende Provider nutzen statische API Keys. Copilot braucht OAuth Device Code Flow mit Token-Refresh-Lifecycle |
| Token-Hierarchie | Copilot hat 2 Token-Ebenen: GitHub Access Token → Copilot Session Token (kurzlebig, ~1h) |
| API-Endpunkt | Copilot nutzt eigene API (`api.githubcopilot.com`) mit spezifischen Headers, nicht Standard-OpenAI |
| Dynamisches Modell-Listing | Bestehende Provider nutzen hartkodierte Suggestions. Copilot braucht API-basiertes Modell-Listing |
| Settings UI | Bestehende Provider zeigen API-Key-Feld. Copilot braucht OAuth-Button + Status-Anzeige |
| Inoffizielle API | GitHub Copilot API ist nicht offiziell dokumentiert fuer Drittanbieter. Disclaimer erforderlich |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|-------------|------|----------|-----------|-------|
| Plugin-Nutzer mit Copilot Abo | Endnutzer | H | M | Einfache Einrichtung, alle Modelle nutzbar |
| Plugin-Nutzer ohne Copilot Abo | Endnutzer | L | L | Keine Beeintraechtigung bestehender Funktionen |
| Plugin-Entwickler (Sebastian) | Owner | H | H | Wartbar, community-plugin-review-konform, geringes Risiko |
| GitHub/Microsoft | Plattform | M | H | Koennte API sperren; Markenrecht |
| Obsidian Community Plugin Review | Gatekeeper | M | H | Review-Bot-Compliance, keine verbotenen Patterns |

### 3.2 Key Stakeholders

**Primary:** Plugin-Entwickler (Entscheidungen), Plugin-Nutzer mit Copilot Abo (Hauptzielgruppe)
**Secondary:** Obsidian Review Team (Genehmigung), GitHub (Plattformrisiko)

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: "Developer Dana"**
- **Rolle:** Software-Entwickler:in mit GitHub Copilot Pro
- **Ziele:** Obsidian als AI-gestuetztes Wissensmanagement nutzen, ohne extra API-Kosten
- **Pain Points:** Hat Copilot Abo, muss aber trotzdem separaten OpenAI/Anthropic Key kaufen
- **Nutzungshaeufigkeit:** Daily
- **Tech-Level:** Hoch -- versteht OAuth, hat GitHub-Account

**Persona 2: "Knowledge Worker Kim"**
- **Rolle:** Wissensarbeiter:in, Employer stellt GitHub Copilot Business bereit
- **Ziele:** Premium-Modelle in Obsidian nutzen ohne eigene Kreditkarte
- **Pain Points:** Keine eigenen API Keys, nur eingeschraenkte Moeglichkeiten mit lokalen Modellen
- **Nutzungshaeufigkeit:** Daily
- **Tech-Level:** Mittel -- kann Anweisungen folgen, braucht klare UI

**Persona 3: "Privacy-Focused Pat"**
- **Rolle:** Nutzer:in die nur lokale Modelle nutzt
- **Ziele:** Bestehende Funktionen sollen nicht beeintraechtigt werden
- **Pain Points:** Sorge dass neue Features Komplexitaet und Bugs einfuehren
- **Nutzungshaeufigkeit:** Weekly
- **Tech-Level:** Variiert

### 4.2 User Journey (High-Level)

1. User oeffnet Settings → Models Tab
2. Klickt "Add Model" → waehlt "GitHub Copilot" als Provider
3. Klickt "Connect with GitHub" Button
4. Browser oeffnet sich: `github.com/login/device` mit Code
5. User gibt Code ein, autorisiert
6. Plugin erhaelt Token, zeigt "Connected" Status
7. Copilot-Modelle werden dynamisch geladen und als Auswahl angezeigt
8. User waehlt Modell, aktiviert es → fertig

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)
GitHub Copilot Abonnenten zahlen bereits fuer Premium Requests, die Zugang zu Claude, GPT-4o, Gemini und weiteren Modellen bieten. In Obsilo Agent muessen diese Nutzer aktuell separate API Keys erwerben (ab $5-20/Monat), obwohl sie die gleichen Modelle bereits ueber Copilot nutzen koennten. Die fehlende Integration fuehrt zu doppelten Kosten und verpasster Zielgruppe.

### 5.2 Root Causes
- GitHub Copilot nutzt einen proprietaeren OAuth + Token-Refresh Mechanismus statt statischer API Keys
- Die Copilot API (`api.githubcopilot.com`) ist inoffiziell und erfordert spezifische Request-Headers
- Das bestehende Provider-Pattern geht von statischen API Keys aus

### 5.3 Impact
- **Business Impact:** Grosse potenzielle Nutzergruppe (GitHub Copilot hat Millionen Abonnenten) bleibt ausgeschlossen
- **User Impact:** Nutzer mit Copilot Abo muessen unnoetig Geld fuer separate API Keys ausgeben
- **Competitive Impact:** Andere Obsidian-Plugins (obsidian-copilot) bieten diese Integration bereits

---

## 6. Goals & Objectives

### 6.1 Business Goals
- Zielgruppe erweitern auf GitHub Copilot Abonnenten
- Unique Selling Proposition: Copilot als Provider in einem agentic Obsidian Plugin (obsidian-copilot hat nur Chat, nicht Agentic Tools)
- Plugin-Attraktivitaet fuer Community Plugin Store erhoehen

### 6.2 User Goals
- Copilot Abo direkt in Obsilo nutzen (Chat + Embeddings)
- Keine separaten API Keys noetig
- Einfacher einmaliger Auth-Flow, danach automatisch

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|-----|----------|--------|-----------|
| Copilot Auth Success Rate | 0% (nicht vorhanden) | >95% | After Launch |
| Copilot-Modelle verfuegbar | 0 | Alle dynamisch gelisteten | After Launch |
| Token Auto-Refresh Erfolgsrate | n/a | >99% | Laufend |
| Bestehende Provider-Regression | 0 Bugs | 0 Bugs | After Launch |

---

## 7. Scope Definition

### 7.1 In Scope
- `github-copilot` als neuer `ProviderType`
- OAuth Device Code Flow mit GitHub
- Automatisches Token-Management (Access Token → Copilot Token, Refresh)
- Dynamisches Modell-Listing ueber `/models` Endpoint
- Chat Completions ueber Copilot API (`/chat/completions`)
- Embedding-Modelle ueber Copilot API
- Sichere Token-Speicherung ueber SafeStorageService
- Settings UI: Provider-Dropdown, OAuth-Connect-Button, Status-Anzeige, Disconnect
- Provider in Embedding-Provider-Liste aufnehmen
- Disclaimers (UI + Docs): Inoffizielle Integration
- Optionales Custom Client ID Feld fuer Power User
- Klare Fehlermeldungen bei abgelaufenen/erschoepften Premium Requests
- Copilot-spezifische Request-Headers (User-Agent, Editor-Version etc.)
- I18n: Alle neuen Strings in EN/DE (+ bestehende Sprachen)

### 7.2 Out of Scope
- Offizielle GitHub OAuth App Registrierung (nutzt VSCode Client ID, wie de-facto Standard)
- GitHub Copilot Chat (Copilots eigene Chat-Features, nicht LLM API)
- Code Completion / Inline Suggestions (das ist ein anderes Copilot-Feature)
- Mobile-Support (Electron `safeStorage` nicht verfuegbar auf Mobile)
- Automatisches Umschalten auf anderen Provider bei Copilot-Fehler (User entscheidet selbst)
- Copilot-spezifische Streaming-Quirks von Claude-Modellen (Content-Array statt String) -- wird in der Implementierung beruecksichtigt, ist aber kein separates Feature

### 7.3 Assumptions
- VSCode OAuth Client ID (`Iv1.b507a08c87ecfe98`) bleibt funktionsfaehig (de-facto Standard seit 3+ Jahren)
- GitHub Copilot API Endpunkte (`api.githubcopilot.com`) aendern sich nicht grundlegend
- Obsidian `requestUrl` unterstuetzt die erforderlichen HTTP-Methoden und Header
- User haben ein aktives GitHub Copilot Abo (Pro, Business oder Enterprise)
- Copilot API gibt Modelle zurueck die Tool Calling unterstuetzen

### 7.4 Constraints
- **Review-Bot Compliance:** Kein `fetch()` (nur `requestUrl`), kein `innerHTML`, keine floating promises, keine `any` types
- **Inoffizielle API:** Kein SLA, kann jederzeit brechen. Muss fuer User transparent kommuniziert werden
- **Token-Lebenszeit:** Copilot Token laeuft nach ~1h ab, muss automatisch refreshed werden
- **Header-Requirements:** Copilot API erfordert spezifische Headers (User-Agent, Editor-Version, etc.)
- **Markenrecht:** "GitHub Copilot" nur mit "(unofficial)" Label verwenden
- **Keine LangChain-Abhaengigkeit:** Obsilo nutzt Anthropic SDK + OpenAI SDK direkt, keine LangChain (anders als obsidian-copilot Referenz)

---

## 8. Risk Assessment

### 8.1 Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| GitHub sperrt VSCode Client ID | Niedrig | Hoch | Optionales Custom Client ID Feld; Disclaimer in UI und Docs |
| Copilot API aendert Endpoints/Headers | Mittel | Mittel | Headers als Konstanten, leicht aktualisierbar; API-Version-Header |
| Token Refresh Race Conditions | Niedrig | Mittel | Promise-Lock Pattern, Generation Counter (wie in Referenz) |
| Copilot gibt Modelle ohne Tool Calling zurueck | Niedrig | Niedrig | ModelInfo korrekt setzen; graceful degradation |
| Claude-via-Copilot gibt Content als Array statt String | Hoch | Mittel | Content-Normalisierung in Stream-Handler |
| Community Plugin Review Ablehnung | Niedrig | Mittel | Strikte Review-Bot Compliance; alle Patterns vorab pruefen |
| Nutzer-Verwirrung wegen Token-Limits | Mittel | Niedrig | Klare Error-Messages mit Handlungsanweisungen |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

**Auth & Token Management:**
- OAuth Device Code Flow (deviceCode → accessToken → copilotToken)
- Automatischer Token-Refresh vor Ablauf (~1min Buffer)
- Sichere Speicherung aller Tokens ueber SafeStorageService
- Disconnect/Reset-Funktion
- Optionale Custom Client ID

**Provider Integration:**
- Neuer `ProviderType: 'github-copilot'`
- `GitHubCopilotProvider` implementiert `ApiHandler` Interface
- Chat Completions Streaming ueber Copilot API
- Embedding-Anfragen ueber Copilot API
- Copilot-spezifische Request-Headers
- Content-Normalisierung (Claude Array → String)

**Modell-Management:**
- Dynamisches Listing ueber `/models` Endpoint
- Modell-Auswahl im Settings UI
- Policy Terms Caching (welche Modelle der User aktiviert hat)

**Settings UI:**
- "GitHub Copilot (unofficial)" im Provider-Dropdown
- OAuth Connect/Disconnect Button mit Status-Anzeige
- Dynamische Modell-Suche nach erfolgreicher Auth
- Custom Client ID Eingabefeld (optional, collapsed/advanced)

**Error Handling:**
- "Premium Requests aufgebraucht" → klare Meldung an User
- "Auth abgelaufen" → Re-Auth Aufforderung
- "Modell nicht freigeschaltet" → Hinweis auf GitHub Settings
- Kein stilles Umschalten auf anderen Provider

### 9.2 Non-Functional Requirements (Summary)
- **Performance:** Token-Refresh darf Chat nicht blockieren (<500ms fuer Refresh)
- **Security:** Tokens nur ueber SafeStorageService gespeichert; nie in Plaintext-Logs
- **Reliability:** Automatischer Retry bei 401 (einmal), dann Error
- **Maintainability:** Copilot-Endpoints und Headers als Konstanten
- **Compatibility:** Keine Regression in bestehenden Providern
- **I18n:** Alle neuen UI-Strings in allen unterstuetzten Sprachen

### 9.3 Key Features (fuer RE Agent)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | OAuth Device Code Flow | GitHub Login + Token-Kette (accessToken → copilotToken) |
| P0 | Chat Completions via Copilot | ApiHandler Implementation mit Streaming + Tool Calling |
| P0 | Token Auto-Refresh | Automatische Erneuerung vor Ablauf |
| P0 | Settings UI Integration | Provider im Dropdown, Connect-Button, Status |
| P0 | Error Messaging | Klare Fehlermeldungen bei Token/Limit-Problemen |
| P1 | Dynamisches Modell-Listing | /models Endpoint abfragen, in UI zur Auswahl anbieten |
| P1 | Embedding-Support | Copilot als Embedding-Provider im SemanticIndexService |
| P1 | Sichere Token-Speicherung | SafeStorageService fuer Access Token + Copilot Token |
| P1 | Disclaimers | UI-Hinweis + Docs: Inoffizielle Integration |
| P2 | Custom Client ID | Optionales Eingabefeld fuer eigene OAuth Client ID |
| P2 | Policy Terms Caching | Modell-Aktivierungshinweise aus /models Response |

---

## 10. Next Steps

- [ ] Review durch Stakeholder (Sebastian)
- [ ] Uebergabe an Requirements Engineer zur Epic/Feature-Definition
- [ ] Technische Spike: Copilot API Endpoints mit `requestUrl` verifizieren
- [ ] ADR: Entscheidung OAuth Client ID Strategie dokumentieren

---

## Appendix

### A. Glossar

| Begriff | Definition |
|---------|-----------|
| **Device Code Flow** | OAuth-Verfahren fuer Geraete ohne Browser-Redirect. User erhaelt Code, gibt ihn auf github.com ein. |
| **Access Token** | Langlebiger GitHub OAuth Token (Ergebnis des Device Code Flow) |
| **Copilot Token** | Kurzlebiger API-Token (~1h) fuer `api.githubcopilot.com`, erhaelt man durch Austausch des Access Tokens |
| **Premium Requests** | Begrenzte Anzahl an LLM-Aufrufen pro Monat im Copilot Abo |
| **Client ID** | Identifikator der OAuth-App gegenueber GitHub. Standard: VSCodes ID. |
| **requestUrl** | Obsidians HTTP-Funktion (ersetzt `fetch()` fuer Plugin-Review-Compliance) |
| **SafeStorageService** | Obsilo-Klasse die Electron `safeStorage` nutzt fuer OS-Keychain-Verschluesselung |

### B. Interview Notes

**Projektzweck:** MVP -- volle Integration als gleichwertiger Provider

**Entscheidungen aus Interview:**
1. **Client ID:** Option A -- VSCode Client ID nutzen + Disclaimers + optionales Custom Client ID Feld
2. **Modell-Listing:** Dynamisch ueber Copilot `/models` API
3. **UI:** GitHub Copilot als Option im Provider-Dropdown (analog zu OpenRouter, Azure etc.), bei Auswahl OAuth-Settings anzeigen
4. **Embeddings:** Ja, auch Embedding-Modelle ueber Copilot unterstuetzen
5. **Fehlerverhalten:** Klare Fehlermeldung an User, kein stilles Umschalten auf anderen Provider
6. **Haftung:** Disclaimers in UI und Docs; MIT-Lizenz schliesst Haftung aus; kein kommerzielles Interesse

**Referenz-Implementierung:** `obsidian-copilot` Plugin (GitHub) als Orientierung, aber keine 1:1 Kopie. Wichtig: Obsilo nutzt kein LangChain, sondern direkte SDK-Integration.

### C. References

- GitHub OAuth Device Flow: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
- GitHub Copilot API (inoffiziell): `api.githubcopilot.com`
- Referenz-Plugin: obsidian-copilot (GitHub: logancyang/obsidian-copilot)
- Obsilo Provider-Architektur: `src/api/index.ts`, `src/api/providers/`, `src/types/settings.ts`
- SafeStorageService: `src/core/security/SafeStorageService.ts`
- Review-Bot Compliance: `_memory/quality-rules.md`

---

## Validierung

```
CHECK fuer MVP:

1. Business Context vollstaendig?                    [x]
2. Stakeholder Map vorhanden?                        [x]
3. Mind. 2 User Personas?                            [x] (3 Personas)
4. KPIs mit Baseline + Target?                       [x]
5. In-Scope vs Out-of-Scope explizit?                [x]
6. Constraints dokumentiert?                         [x]
7. Risiken identifiziert?                            [x] (7 Risiken)
8. Key Features priorisiert (P0/P1/P2)?              [x]

Score: 8/8 - RE-Ready
```
