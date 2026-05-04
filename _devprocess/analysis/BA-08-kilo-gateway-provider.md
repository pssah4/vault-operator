# Business Analysis: Kilo Gateway LLM Provider Integration

> **Scope:** MVP (C)
> **Erstellt:** 2026-03-18
> **Status:** Draft

---

## 1. Executive Summary

### 1.1 Problem Statement
Obsilo Agent unterstuetzt aktuell nur klassische BYOK-Provider und plant zusaetzlich GitHub Copilot als abonnementsbasierten Zugang. Nutzer mit einem bestehenden Kilo-Account beziehungsweise Kilo-Gateway-Zugang koennen ihre dort gebuendelten Modelle, freien Modelle, Organisationsrichtlinien und optionalen BYOK-Routings aktuell nicht in Obsilo verwenden.

### 1.2 Proposed Solution
Kilo Gateway als vollwertigen LLM Provider in Obsilo integrieren. Authentifizierung ueber Kilo Device Authorization Flow oder optional manuellen Token, dynamisches Modell-Listing ueber die Gateway-Endpoints, Chat- und Embedding-Nutzung ueber die OpenAI-kompatible Gateway-API und sichere Speicherung ueber SafeStorageService.

### 1.3 Expected Outcomes
- Nutzer koennen ihren bestehenden Kilo-Zugang direkt in Obsilo nutzen
- Zugriff auf die gesamte Kilo-Gateway-Modellpalette ohne separate Provider-Konfiguration pro Modell
- Organisationskontext und Kilo-spezifische Routing-Funktionen koennen genutzt werden
- Kilo Gateway erscheint konsistent als weiterer Provider neben OpenAI, OpenRouter, Azure, Ollama und GitHub Copilot

---

## 2. Business Context

### 2.1 Background
Kilo Gateway bietet einen OpenAI-kompatiblen Zugang zu hunderten Modellen unterschiedlicher Anbieter ueber eine einheitliche Gateway-API. Neben klassischer Bearer-Token-Authentifizierung bietet Kilo einen browsergestuetzten Device-Authorization-Flow, Organisationskontext per Header, freie Modelle ohne Authentifizierung sowie provideruebergreifendes Routing inklusive BYOK-Weiterleitung innerhalb des Gateways.

### 2.2 Current State ("As-Is")
- Obsilo hat eine bestehende Multi-Provider-Architektur mit `ProviderType`, `CustomModel`, `LLMProvider` und `ApiHandler`
- Settings UI und Embedding-Konfiguration sind bereits fuer mehrere Provider vorhanden
- `SafeStorageService` fuer verschluesselte Secret-Speicherung existiert
- Dynamische Modell-Listen sind fuer einzelne Provider bereits ein bekanntes Pattern
- Kilo Gateway ist aktuell in Obsilo nicht verfuegbar

### 2.3 Desired State ("To-Be")
- Kilo Gateway als weiterer Provider in der bestehenden Provider-Auswahl
- Einfacher Login per Device Auth mit Browser-Flow
- Optionaler manueller Token fuer Power User
- Dynamische Modell-Abfrage ueber `https://api.kilo.ai/api/gateway/models`
- Chat ueber die OpenAI-kompatible Kilo-Gateway-API
- Embeddings ueber denselben Gateway-Pfad, sofern Endpoint verifiziert ist
- Optionaler Organisationskontext fuer Team-/Enterprise-Nutzer
- Klare Fehlermeldungen bei Auth-, Limit- oder Organisationsproblemen

### 2.4 Gap Analysis
| Gap | Beschreibung |
|-----|-------------|
| Auth-Modell | Bestehende Provider nutzen API Keys. Kilo bietet zusaetzlich einen eigenen Device-Authorization-Flow |
| Organisationen | Kilo unterstuetzt Organisationskontext ueber `X-KiloCode-OrganizationId`, Obsilo bislang nicht |
| Modell-Discovery | Kilo bietet eigene oeffentliche Modelle-Endpoints, die in Obsilo noch nicht genutzt werden |
| Provider-Semantik | Kilo ist OpenAI-kompatibel, aber fachlich ein abonnements- und routingbasierter Gateway-Provider |
| Free Models | Kilo erlaubt anonyme Nutzung bestimmter Free-Modelle, dieses Konzept existiert in Obsilo noch nicht |
| Gateway-spezifische Header | Kilo nutzt Zusatzheader wie `X-KiloCode-OrganizationId`, `X-KiloCode-Version` und `x-kilocode-mode` |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Needs |
|-------------|------|----------|-----------|-------|
| Plugin-Nutzer mit Kilo-Account | Endnutzer | H | M | Einfache Einrichtung, viele Modelle, ein zentraler Zugang |
| Team-/Enterprise-Nutzer mit Kilo-Organisation | Endnutzer | H | M | Organisationskontext, Richtlinien, Budget- und Modellkontrolle |
| Plugin-Nutzer ohne Kilo | Endnutzer | L | L | Keine Regression der bestehenden Provider |
| Plugin-Entwickler (Sebastian) | Owner | H | H | Wartbare Integration, geringe Sonderlogik, gute UX |
| Kilo Plattform | Externer Anbieter | M | H | Korrekte Gateway-Nutzung, konsistente Header, stabile Auth-Flows |
| Obsidian Community Plugin Review | Gatekeeper | M | H | Review-Bot-Compliance |

### 3.2 Key Stakeholders

**Primary:** Plugin-Entwickler, Obsilo-Nutzer mit Kilo-Zugang
**Secondary:** Kilo Plattform, Obsidian Review Team

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: "All-in-One Alex"**
- **Rolle:** Entwickler:in mit aktivem Kilo-Account
- **Ziele:** Viele frontier Modelle ueber einen einzigen Zugang in Obsilo nutzen
- **Pain Points:** Will nicht fuer jedes Modell einen eigenen Provider und API Key pflegen
- **Nutzungshaeufigkeit:** Daily
- **Tech-Level:** Hoch

**Persona 2: "Team Tenant Toni"**
- **Rolle:** Enterprise-/Team-Nutzer:in in einer Kilo-Organisation
- **Ziele:** Modelle unter den Richtlinien und Limits der Organisation in Obsilo nutzen
- **Pain Points:** Braucht Organisationskontext und modellbezogene Freigaben im richtigen Tenant
- **Nutzungshaeufigkeit:** Daily
- **Tech-Level:** Mittel bis hoch

**Persona 3: "Budget Bea"**
- **Rolle:** Nutzer:in, die mit Free Models oder kleinem Budget arbeitet
- **Ziele:** Niedrige Einstiegshuerde und schnelle Verfuegbarkeit von guenstigen oder kostenlosen Modellen
- **Pain Points:** Will nicht sofort mehrere API Keys oder Abos anlegen
- **Nutzungshaeufigkeit:** Weekly
- **Tech-Level:** Mittel

### 4.2 User Journey (High-Level)

1. User oeffnet Settings → Models Tab
2. Klickt "Add Model" und waehlt "Kilo Gateway"
3. Klickt "Connect with Kilo" oder gibt optional manuell ein Token ein
4. Browser oeffnet Kilo-Authentifizierung
5. Nach erfolgreichem Login wird optional eine Organisation ausgewaehlt
6. Obsilo laedt die verfuegbaren Modelle dynamisch
7. User waehlt Modell und aktiviert es fuer Chat oder Embeddings
8. Bei Fehlern erhaelt der User klare Anweisungen statt stiller Fallbacks

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)
Kilo Gateway abstrahiert Modellzugang, Routing, Organisationen und teilweise auch BYOK innerhalb einer einzigen Plattform. Obsilo-Nutzer mit bestehendem Kilo-Zugang muessen heute trotzdem auf separate Direkt-Provider ausweichen und verlieren damit den Mehrwert des Gateways: zentrales Konto, freie Modelle, Routinglogik, Organisationsrichtlinien und vereinfachte Modellverwaltung.

### 5.2 Root Causes
- Kilo ist als Plattform und nicht nur als direkter Modellanbieter zu betrachten
- Der Login erfolgt ueber Kilo-spezifische Auth-Endpunkte, nicht ueber klassische API-Key-Eingabe allein
- Organisations- und Routing-Kontext muessen auf Request-Ebene transportiert werden
- Obsilo kennt bislang keine Gateway-spezifische Device-Auth fuer Modellprovider

### 5.3 Impact
- **Business Impact:** Eine relevante Nutzergruppe mit vorhandenem Kilo-Zugang bleibt unadressiert
- **User Impact:** Doppelter Konfigurationsaufwand, Verlust von Free Models, Org-Kontext und Gateway-Features
- **Strategic Impact:** Obsilo verpasst einen modernen Gateway-Provider, der mehrere Modellanbieter hinter einer einheitlichen API kapselt

---

## 6. Goals & Objectives

### 6.1 Business Goals
- Gateway-basierte Provider als zusaetzliche Zugangskategorie etablieren
- Nutzer mit bestehendem Kilo-Zugang in Obsilo abholen
- Komplexitaet fuer Multi-Model-Nutzung reduzieren

### 6.2 User Goals
- Kilo-Zugang einmal verbinden und dann direkt Modelle in Obsilo nutzen
- Kilo-Organisationen, Free Models und Gateway-Routing verwenden koennen
- Keine stillen Providerwechsel bei Problemen; Entscheidungen selbst treffen

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe |
|-----|----------|--------|-----------|
| Kilo Auth Success Rate | 0% | >95% | After Launch |
| Kilo Model Listing Availability | 0 Modelle | 100% der vom Gateway gelieferten Modelle | After Launch |
| Organisation Selection Completion | 0% | >90% fuer Team-Nutzer | After Launch |
| Existing Provider Regression | 0 Bugs | 0 Bugs | After Launch |

---

## 7. Scope Definition

### 7.1 In Scope
- Neuer `ProviderType` fuer Kilo Gateway
- Browserbasierter Device-Authorization-Flow
- Optionaler manueller Token-Login fuer Power User
- Sichere Speicherung von Token, Organisation und Auth-State ueber SafeStorageService
- Dynamisches Modell-Listing ueber Kilo-Gateway-Endpoints
- Chat Completions ueber `https://api.kilo.ai/api/gateway`
- Embedding-Support ueber Gateway, sofern Endpoint in technischem Spike bestaetigt wird
- Optionaler Organisations-Selector nach erfolgreichem Login
- Kilo-spezifische Header-Unterstuetzung (`X-KiloCode-OrganizationId`, `X-KiloCode-Version`, `x-kilocode-mode`)
- UI-Integration analog zu anderen Providern im bestehenden ModelConfigModal
- Klare Fehlermeldungen bei Auth-, Limit- und Organisationsproblemen
- I18n fuer neue Kilo-Strings

### 7.2 Out of Scope
- Verwaltung von BYOK-Keys innerhalb des Kilo-Dashboards aus Obsilo heraus
- Vollstaendige Abbildung aller Kilo-Plattformfeatures ausser LLM- und Embedding-Zugang
- Automatischer Fallback von Kilo auf andere Provider bei Fehlern
- Separate Kilo-spezifische Team-, Billing- oder Analytics-Oberflaechen in Obsilo
- Vollautomatische Nutzung anonymer Free Models ohne explizite Produktentscheidung

### 7.3 Assumptions
- Kilo Gateway bleibt OpenAI-kompatibel unter `https://api.kilo.ai/api/gateway`
- Der Device-Auth-Flow bleibt fuer Dritt-Clients stabil verfuegbar
- Die Modelle-Endpoints bleiben oeffentlich oder zumindest konsistent erreichbar
- Organisationskontext wird weiterhin ueber `X-KiloCode-OrganizationId` gesteuert
- Embeddings koennen ueber den Gateway-Pfad genutzt werden oder lassen sich kurzfristig verifizieren

### 7.4 Constraints
- **Review-Bot Compliance:** Kein direktes `fetch()` im Plugin-Code, kein `innerHTML`, keine floating promises, keine `any` types
- **Kilo-Speziallogik:** Auth ist proprietaer, Inference aber OpenAI-kompatibel -- Architektur sollte beides trennen
- **Organisationen:** Team-/Enterprise-Nutzer brauchen eventuell einen Org-Selector vor dem produktiven Einsatz
- **Header-Kontext:** Zusatzheader duerfen andere Provider nicht beeinflussen
- **UX-Konsistenz:** Kilo muss sich in das bestehende Provider-UI einfuegen und darf kein paralleles Settings-System aufbauen

---

## 8. Risk Assessment

### 8.1 Identified Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Device-Auth-Flow aendert sich | Mittel | Mittel | Auth-Service kapseln, Endpunkte zentral als Konstanten |
| Organisationskontext falsch gesetzt | Mittel | Hoch | Explizite Org-Auswahl, klare Statusanzeige, gespeicherter Kontext sichtbar |
| Modellliste und nutzbare Modelle divergieren | Mittel | Mittel | Modellliste dynamisch laden, Auth-/Org-Kontext bei Requests sauber anwenden |
| Embeddings nicht vollstaendig Gateway-kompatibel | Mittel | Mittel | Technischer Spike vor finaler Zusage, Feature phasenweise schalten |
| Nutzer verstehen Free Models vs. eingeloggte Modelle nicht | Mittel | Niedrig | Produkttext und Hinweise im UI klar formulieren |
| Regressionen im OpenAI-kompatiblen Pfad | Niedrig | Hoch | Kilo-spezifische Konfiguration sauber isolieren, Regressionstests |

---

## 9. Requirements Overview (High-Level)

### 9.1 Functional Requirements (Summary)

**Auth & Session:**
- Device Authorization Flow fuer Kilo
- Optionaler manueller Token-Login
- Persistente Speicherung des Tokens
- Optionaler Organisations-Selector
- Disconnect/Reset-Funktion

**Provider Integration:**
- Kilo Gateway als Provider im bestehenden Provider-System
- Requests ueber OpenAI-kompatible Gateway-API
- Zusatzheader fuer Organisation, Version und optional Mode-Hints
- Fehlerbehandlung fuer Auth, Limits und Tenant-Kontext

**Model Management:**
- Dynamisches Listing ueber `/api/gateway/models`
- Optional gruppierte Darstellung ueber `/api/gateway/models-by-provider`
- Unterstuetzung des virtuellen Modells `kilo/auto`

**Embeddings:**
- Kilo als Embedding-Provider sichtbar
- Gateway-basierte Embedding-Konfiguration fuer Semantic Search

**Settings UI:**
- Provider-Option "Kilo Gateway"
- Connect-Button oder manueller Token-Modus
- Statusanzeige, ggf. Organisation, Disconnect
- Dynamische Modell-Auswahl nach erfolgreicher Verbindung

### 9.2 Non-Functional Requirements (Summary)
- **Performance:** Modellliste <3 Sekunden, Auth-Requests <2 Sekunden bis zum User-Interaktionsschritt
- **Security:** Tokens nur ueber SafeStorageService gespeichert, keine Plaintext-Logs
- **Reliability:** Klare Wiederanmeldung oder Fehlerhinweise statt stiller Fallbacks
- **Maintainability:** Kilo-Auth und Kilo-Gateway-Konfiguration getrennt kapseln
- **Compatibility:** Bestehender OpenAI-kompatibler Pfad wird nicht fuer andere Provider destabilisiert

### 9.3 Key Features (fuer RE Agent)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | Kilo Device Auth | Browserbasierter Login ueber Kilo-Device-Authorization |
| P0 | Kilo Chat Provider Integration | Nutzung des Gateways fuer Chat und Tool Calling |
| P0 | Settings UI Integration | Kilo Gateway im Provider-Dropdown mit Login-Flow |
| P0 | Secure Token Storage | Token und Kontext sicher speichern |
| P1 | Dynamic Model Listing | Modelle dynamisch aus dem Gateway laden |
| P1 | Organization Context | Organisation waehlen und als Header mitsenden |
| P1 | Manual Token Mode | Fallback fuer Power User ohne Device Auth |
| P1 | Embedding Support | Kilo fuer Embeddings und Semantic Index nutzbar machen |
| P2 | `kilo/auto` Mode Mapping | Obsilo-Modes auf Kilo-Mode-Hints abbilden |
| P2 | Free Model Strategy | Produktentscheidung fuer anonyme Free-Model-Nutzung |

---

## 10. Next Steps

- [ ] Review durch Stakeholder (Sebastian)
- [ ] Uebergabe an Requirements Engineer zur Epic/Feature-Definition
- [ ] Technischer Spike: Embeddings-Endpunkt gegen Kilo Gateway verifizieren
- [ ] Architekturentscheidung: eigener Provider vs. OpenAI-kompatibler Reuse finalisieren

---

## Appendix

### A. Glossar

| Begriff | Definition |
|---------|-----------|
| **Kilo Gateway** | OpenAI-kompatibler Multi-Provider-Gateway-Zugang von Kilo |
| **Device Authorization Flow** | Browsergestuetzter Login mit Code/Autorisierungsstatus ueber Kilo-Endpunkte |
| **Organization Context** | Request-Kontext fuer Team-/Enterprise-Nutzung, gesetzt per `X-KiloCode-OrganizationId` |
| **Free Models** | Modelle, die laut Kilo auch ohne Authentifizierung genutzt werden koennen |
| **kilo/auto** | Virtuelles Kilo-Modell, das je nach Modus auf ein internes Modell geroutet wird |
| **BYOK im Gateway** | Kilo nutzt innerhalb des Gateways hinterlegte Provider-Keys des Users fuer das Routing |

### B. Interview Notes

**Ausgangslage:** Gleiche Needs und Anforderungen wie fuer GitHub Copilot, aber fuer einen anderen Provider

**Recherchierte Fakten:**
1. Kilo Gateway ist OpenAI-kompatibel und nutzt `https://api.kilo.ai/api/gateway`
2. Device Auth ist ueber Kilo-eigene Endpunkte verfuegbar (`/api/device-auth/codes`)
3. Modelllisten sind ueber `GET /api/gateway/models` dokumentiert
4. Kilo unterstuetzt Organisationskontext ueber `X-KiloCode-OrganizationId`
5. Kilo hat optional freie Modelle und einen virtuellen `kilo/auto` Modus
6. Kilo-Inference ist einfacher als Copilot, weil kein proprietaerer Chat-Pfad erforderlich ist

### C. References

- Kilo Gateway Authentication: https://kilo.ai/docs/gateway/authentication
- Kilo Gateway SDKs & Frameworks: https://kilo.ai/docs/gateway/sdks-and-frameworks
- Kilo Gateway Models & Providers: https://kilo.ai/docs/gateway/models-and-providers
- Referenz-Code: `forked-kilocode/cli/src/auth/providers/kilocode/device-auth.ts`
- Referenz-Code: `forked-kilocode/cli/src/auth/providers/kilocode/shared.ts`
- Referenz-Code: `forked-kilocode/src/services/kilocode/DeviceAuthService.ts`
- Obsilo Provider-Architektur: `src/api/index.ts`, `src/api/providers/openai.ts`, `src/types/settings.ts`

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
7. Risiken identifiziert?                            [x] (6 Risiken)
8. Key Features priorisiert (P0/P1/P2)?              [x]

Score: 8/8 - RE-Ready
```
