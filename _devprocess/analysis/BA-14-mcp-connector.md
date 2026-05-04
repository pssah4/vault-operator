# Business Analysis: Obsilo MCP Connector

> **Scope:** MVP
> **Erstellt:** 2026-03-25
> **Status:** Draft

---

## 1. Executive Summary

### 1.1 Problem Statement

Obsilo Agent arbeitet ausschliesslich im Standalone-Modus: Der User muss eigene API-Keys konfigurieren, einen LLM-Provider waehlen und traegt die Token-Kosten selbst. Diese Einstiegshuerde schliesst nicht-technische User aus und limitiert die Reichweite auf Obsidian-Power-User.

Gleichzeitig waechst das MCP-Oekosystem (50+ Connectors im Anthropic Directory), aber es gibt keinen offiziellen Obsidian-Connector -- obwohl Obsidian eines der populaersten PKM-Systeme ist.

### 1.2 Proposed Solution

Obsilo exponiert seine Vault-Intelligenz als MCP Server. Claude (claude.ai, Desktop, Cowork) wird zum Frontend, Obsilo zum Backend. Der User arbeitet in Claude und greift transparent auf seinen Vault zu -- ohne eigene API-Keys, ohne zusaetzliche Token-Kosten.

### 1.3 Expected Outcomes

- Deutlich niedrigere Einstiegshuerde fuer neue User (kein API-Key-Setup)
- Obsilo als Vault-Intelligence-Schicht fuer das gesamte MCP-Oekosystem positioniert
- Potenzielle Aufnahme in das Anthropic Connectors Directory als erster PKM-Agent-Connector
- Beide Modi (Standalone + Connector) koexistieren parallel

---

## 2. Business Context

### 2.1 Background

Obsilo Agent ist ein KI-Agent als Obsidian-Plugin mit 46+ Tools fuer Vault-Operationen, hybrider semantischer Suche, 3-stufigem Memory-System, Dokumenten-Intelligenz (PPTX, DOCX, PDF, XLSX) und einem Plugin-as-Skill-System. Seit v2.2 sind alle Feature-Phasen (A-F) abgeschlossen.

Anthropic hat 2025/2026 das Connector-System in Claude eingefuehrt. Nutzer mit Pro-, Max-, Team- oder Enterprise-Plan koennen eigene MCP-Server-URLs als Custom Connector hinzufuegen. Das offizielle Connectors Directory umfasst 50+ kuratierte Integrationen (Notion, Slack, Asana, Gmail, Canva, etc.).

### 2.2 Current State ("As-Is")

| Aspekt | Status Quo |
|--------|------------|
| Interaktion | User arbeitet in Obsidian-Sidebar |
| LLM-Inferenz | User konfiguriert eigenen Provider (Anthropic, OpenAI, Gemini, Ollama) |
| Token-Kosten | User traegt Kosten selbst |
| Einstiegshuerde | API-Key einrichten, Provider waehlen, Modell konfigurieren |
| Rollenverteilung | Obsilo plant, entscheidet UND fuehrt aus |
| MCP-Praesenz | Obsilo hat einen MCP-Client (konsumiert externe MCP-Server), aber keinen MCP-Server |

### 2.3 Desired State ("To-Be")

| Aspekt | Zielzustand |
|--------|-------------|
| Interaktion | User arbeitet in Claude (claude.ai, Desktop, Cowork) ODER Obsidian-Sidebar |
| LLM-Inferenz | Claude-Abo (Connector-Modus) ODER eigener Provider (Standalone) |
| Token-Kosten | Im Claude-Abo enthalten (Connector) ODER User-getragen (Standalone) |
| Einstiegshuerde | Connector aktivieren, fertig (kein API-Key-Setup) |
| Rollenverteilung | Claude plant + entscheidet, Obsilo fuehrt aus (Connector) |
| MCP-Praesenz | Obsilo als MCP Server im Anthropic Connectors Directory |

### 2.4 Gap Analysis

| Gap | Beschreibung | Komplexitaet |
|-----|-------------|--------------|
| **G-1: MCP Server Runtime** | Obsilo hat keinen MCP-Server. Es muss eine Server-Komponente entstehen die Tool Calls empfaengt und an die bestehende Tool-Pipeline weiterleitet. | Hoch |
| **G-2: Transport-Layer** | Fuer lokale Nutzung (Claude Desktop/Code): stdio. Fuer remote Nutzung (claude.ai): Streamable HTTP. Electron/Obsidian hat keinen nativen HTTP-Server. | Hoch |
| **G-3: Tool-Mapping** | 46+ interne Tools muessen auf eine MCP-taugliche Oberflaeche gemappt werden. Nicht 1:1, sondern kuratierte Tiers (Core, Intelligence, Workflow). | Mittel |
| **G-4: Approval-Pipeline** | Read-Operationen koennten auto-approved werden. Write-Operationen brauchen User-Bestaetigung -- remote besonders herausfordernd. | Hoch |
| **G-5: Auth (Remote)** | Fuer Streamable HTTP braucht es OAuth 2.1 + PKCE oder vergleichbare Authentifizierung. | Mittel |
| **G-6: Skill-Prompt-Adaptation** | Obsilo-Skills sind als System-Prompt-Kontext optimiert. Als MCP Prompts an Claude uebergeben, koennten sie anders performen. | Mittel |
| **G-7: Plugin Skill Discovery** | VaultDNA-basierte Plugin-Erkennung muss als MCP-Feature exponiert werden (discover_capabilities). | Niedrig |

---

## 3. Stakeholder Analysis

### 3.1 Stakeholder Map

| Stakeholder | Role | Interest | Influence | Beduerfnisse |
|-------------|------|----------|-----------|-------------|
| End-User (Power-User) | Primaer-Nutzer | H | H | Nahtlose Integration beider Modi, voller Tool-Zugriff |
| End-User (Claude-First) | Primaer-Nutzer | H | H | Einfaches Onboarding, kein API-Key-Setup |
| Anthropic | Plattform-Partner | H | H | Referenz-Connector fuer PKM, Connectors Directory Qualitaet |
| Obsidian Community | Oekosystem | M | M | Plugin-Qualitaet, Community Plugin Review bestehen |
| MCP-Oekosystem | Potenzielle Clients | M | L | Standardkonformer MCP-Server, wiederverwendbar fuer Cursor/Windsurf/etc. |
| Sebastian (Product Owner) | Entwickler/PO | H | H | Strategische Positionierung, machbare Implementierung |

### 3.2 Key Stakeholders

**Primary:** End-User (beide Segmente), Sebastian (PO)
**Secondary:** Anthropic (Partnership), Obsidian Community, MCP-Oekosystem-Clients

---

## 4. User Analysis

### 4.1 User Personas

**Persona 1: Alex -- der Power-User**
- **Rolle:** Senior Developer / Knowledge Worker
- **Ziele:** Obsidian-Vault als zentrale Wissensbasis, Claude fuer komplexe Aufgaben nutzen, beides integriert
- **Pain Points:** Kontext-Wechsel zwischen Claude und Obsidian. Manuelles Copy-Paste von Vault-Inhalten nach Claude. Redundante Tool-Konfiguration.
- **Nutzungshaeufigkeit:** Daily (beide Modi)
- **Technisches Niveau:** Hoch -- hat API-Keys, kennt MCP, nutzt Claude Desktop/Code
- **Typische Aufgabe:** "Recherchiere im Web, vergleiche mit meinen Vault-Notizen, erstelle eine Gap-Analyse als Canvas."

**Persona 2: Maria -- die Claude-First-Einsteigerin**
- **Rolle:** Consultant / Wissensarbeiterin
- **Ziele:** Obsidian-Notizen aus Claude heraus durchsuchen und bearbeiten, ohne technisches Setup
- **Pain Points:** API-Key-Konfiguration zu komplex. LLM-Provider-Auswahl ueberfordert. Will "einfach loslegen."
- **Nutzungshaeufigkeit:** Weekly (primaer Connector-Modus)
- **Technisches Niveau:** Mittel -- hat Claude Pro, kennt Obsidian, aber keine API-Erfahrung
- **Typische Aufgabe:** "Was steht in meinem Vault zum Thema X?" oder "Erstelle eine Meeting-Notiz aus diesem Transcript."

**Persona 3: Team-Lead Thomas**
- **Rolle:** Engineering Lead mit Claude Team-Plan
- **Ziele:** Team-Wissen in Obsidian-Vaults ueber Claude zugaenglich machen
- **Pain Points:** Jedes Teammitglied braucht eigene API-Keys. Keine zentrale Vault-Anbindung.
- **Nutzungshaeufigkeit:** Daily (Connector fuer Team-Vaults)
- **Technisches Niveau:** Hoch -- entscheidet ueber Tool-Adoption im Team

### 4.2 User Journey (High-Level)

**Connector-Modus (Persona Maria):**
```
1. Installiert Obsilo Plugin in Obsidian
2. Oeffnet Obsilo Settings -> "MCP Server" Abschnitt
3. Klickt "Enable MCP Server" (lokal: stdio auto-config)
4. Oeffnet Claude Desktop -> Settings -> Connectors -> sieht "Obsilo Vault"
5. Stellt eine Frage: "Was steht in meinem Vault zum Thema Governance?"
6. Claude ruft vault_search auf -> Obsilo antwortet mit Ergebnissen
7. Claude fasst zusammen, Maria arbeitet weiter
```

**Connector-Modus (Persona Alex, remote):**
```
1. Hat Obsilo bereits installiert, aktiviert "Remote Access" in Settings
2. Obsilo startet Cloudflare Tunnel (opt-in, klare Datenschutz-Kommunikation)
3. Alex kopiert die Tunnel-URL, traegt sie als Custom Connector in claude.ai ein
4. Arbeitet von unterwegs in claude.ai mit vollem Vault-Zugriff
5. Bei Write-Operationen: [Approval-UX -- Design offen]
```

---

## 5. Problem Analysis

### 5.1 Problem Statement (Detailed)

Obsilo's Standalone-Modus erfordert drei Konfigurationsschritte die nicht-technische User abschrecken: (1) API-Key beschaffen, (2) Provider und Modell waehlen, (3) Token-Budget verwalten. Jeder dieser Schritte ist eine potenzielle Abbruchstelle im Onboarding.

Gleichzeitig hat Claude als Plattform keinen nativen Zugriff auf Obsidian-Vaults. User die Claude und Obsidian nutzen, muessen Inhalte manuell hin- und herkopieren -- oder einen der Community MCP-Server einrichten (alle ausserhalb des offiziellen Connectors Directory, variierende Qualitaet).

### 5.2 Root Causes

1. **Architektonische Einbahnstrasse:** Obsilo wurde als Agent designed der selbst denkt UND ausfuehrt. Die Ausfuehrungs-Schicht ist nicht als eigenstaendiger Service exponiert.
2. **Fehlende MCP-Server-Komponente:** Obsilo konsumiert MCP-Server (als Client), exponiert sich aber nicht als Server.
3. **Kein offizieller PKM-Connector:** Anthropic's Connectors Directory hat Notion, aber kein Obsidian. Die Community-Loesungen sind fragmentiert.

### 5.3 Impact

- **Business Impact:** Begrenzte Nutzerbasis durch hohe Einstiegshuerde. Obsilo adressiert nur den "API-Key-affinen" Teil des Obsidian-Markts (geschaetzt <10% der 3M+ Obsidian-User).
- **User Impact:** Kontext-Wechsel und manuelles Copy-Paste zwischen Claude und Obsidian. Keine nahtlose Integration der staerksten KI-Plattform mit dem eigenen Wissensmanagement.

---

## 6. Goals & Objectives

### 6.1 Business Goals

- Obsilo als die Intelligence-Schicht fuer Obsidian im MCP-Oekosystem positionieren
- Einstiegshuerde senken: "Installiere Obsilo, verbinde mit Claude, fertig"
- Aufnahme in das Anthropic Connectors Directory anstreben
- Grundlage fuer spaetere Monetarisierung schaffen (MVP erstmal kostenlos)

### 6.2 User Goals

- Vault-Inhalte nahtlos in Claude-Workflows einbinden (Suche, Lesen, Schreiben)
- Kein API-Key-Setup, kein Provider-Management, keine Token-Kosten im Connector-Modus
- Plugin-Faehigkeiten (Dataview, Tasks, etc.) ueber Claude nutzen
- Beide Modi (Standalone + Connector) parallel nutzen koennen

### 6.3 Success Metrics (KPIs)

| KPI | Baseline | Target | Timeframe | Prioritaet |
|-----|----------|--------|-----------|------------|
| Adoption Rate (aktive Connector-Installationen) | 0 | 500+ | 6 Monate nach Release | P0 |
| Tool-Usage (Tool Calls/User/Woche via Connector) | 0 | 20+ | 3 Monate nach Release | P1 |
| Onboarding-Conversion (Connector aktiviert in 1. Woche) | 0% | 30% neuer User | 3 Monate nach Release | P1 |
| Connectors Directory Aufnahme | Nein | Ja | 12 Monate | P2 |

---

## 7. Scope Definition

### 7.1 In Scope

- **Phase 1:** Lokaler MCP Server (stdio-Transport) mit Core Tools (6 Tools)
- **Phase 2:** Remote Access via Cloudflare Tunnel + OAuth 2.1 / PKCE
- **Phase 3:** Intelligence Tools (6) + MCP Resources + MCP Prompts
- **Phase 4:** Plugin Skills via discover_capabilities (dynamisch via VaultDNA)
- **Phase 5:** Anthropic Connectors Directory Einreichung
- Settings-UI fuer MCP Server Konfiguration (Enable/Disable, Transport, Auth)
- Datenschutz-Kommunikation fuer Remote-Modus (Opt-in, klare Erklaerung)

### 7.2 Out of Scope

- Monetarisierung / Tier-Trennung (Free vs Pro) -- kommt spaeter
- Mobile-Support fuer den MCP-Server (Obsidian Mobile hat kein stdio/HTTP)
- Multi-Vault-Support im Connector-Modus (1 Vault = 1 MCP Server)
- Eigene Claude-aehnliche Chat-UI in der Connector-Erfahrung (Claude IS die UI)
- Migration bestehender Community MCP-Server-Konfigurationen

### 7.3 Assumptions

- A-1: Anthropic's Custom Connector Feature bleibt stabil und fuer Pro/Max/Team/Enterprise verfuegbar
- A-2: MCP Spec (aktuell 2025-03-26) bleibt rueckwaertskompatibel oder Aenderungen sind handhabbar
- A-3: Cloudflare Tunnel Free Tier bleibt kostenlos und performant genug fuer Einzel-User
- A-4: Obsidian's Plugin Review erlaubt einen lokalen MCP Server (stdio) ohne Verstoss gegen Plugin-Richtlinien
- A-5: Die bestehende Tool-Pipeline kann als MCP-Backend wiederverwendet werden (kein komplettes Rewrite)

### 7.4 Constraints

- **C-1: Obsidian Plugin API** -- Electron-Umgebung, kein nativer HTTP-Server. Fuer Remote-Zugriff muss der HTTP-Server ueber Node.js native Modules oder einen externen Prozess laufen.
- **C-2: 1-Person-Team** -- Entwicklung primaer durch eine Person. Phasen muessen sequentiell und inkrementell umsetzbar sein.
- **C-3: Community Plugin Review** -- Alle Review-Bot-Regeln muessen eingehalten werden (kein `require()`, kein `innerHTML`, etc.)
- **C-4: Keine harte Timeline** -- Qualitaet vor Geschwindigkeit. Kein externer Meilenstein-Druck.

---

## 8. Wettbewerbsanalyse

### 8.1 Bestehende Obsidian MCP-Server

| Projekt | Stars | Ansatz | Tools | Differenzierung |
|---------|-------|--------|-------|-----------------|
| MCPVault (bitbonsai) | 957 | Direkt auf Dateisystem | 14 (CRUD + semantic search) | Kein Plugin noetig, Zero Dependencies |
| obsidian-mcp-tools (jacksteamdev) | 682 | Plugin + separater MCP Server | Vault + Semantic Search + Templater | Security-Fokus, SLSA Attestations |
| obsidian-mcp-server (cyanheads) | 416 | Via Local REST API Plugin | 8 (CRUD + search) | stdio + HTTP, In-Memory Cache |
| Claudesidian/Nexus (ProfSynapse) | 91 | Als Obsidian Plugin | 2-Tool-Design (getTools + useTools) | Token-sparend, Native Chat View |
| mcp-obsidian (MarkusPfundstein) | - | Python, via REST API | 7 (CRUD) | Python-basiert |
| obsidian-mcp (StevenStavrakis) | - | stdio | 12 (CRUD + Tags) | Multi-Vault-Support |

### 8.2 PKM-Wettbewerber im Connectors Directory

| PKM System | MCP Status | Connectors Directory |
|------------|------------|---------------------|
| **Notion** | Offizieller MCP Server (4100 Stars, 22 Tools) | **Ja -- offiziell im Directory** |
| Roam Research | Offizieller MCP Server | Nein |
| Logseq | Community, fruehes Stadium | Nein |
| Tana | Community, primaer Input API | Nein |
| **Obsidian** | 6+ Community-Projekte, fragmentiert | **Nein** |

### 8.3 Obsilo's Differenzierung

Keiner der bestehenden Obsidian MCP-Server bietet:
- **Agent-Intelligence:** Semantische Suche mit Reranking, 3-stufiges Memory-System, Context Condensing
- **Dokumenten-Intelligenz:** PPTX, DOCX, PDF, XLSX lesen und erstellen
- **Plugin-as-Skill:** Dynamische Erkennung und Nutzung installierter Obsidian-Plugins via VaultDNA
- **Kuratierte Tool-Tiers:** Statt 40+ flacher Tools eine intelligente 3-Tier-Struktur (Core, Intelligence, Workflow)
- **MCP Prompts:** Skill-Prompts als MCP Prompt-Kontext fuer Claude (nicht nur Tools, sondern auch Anleitungen)

Die bestehenden Loesungen sind CRUD-fokussiert. Obsilo waere der erste **Intelligence-Layer** fuer Obsidian im MCP-Oekosystem.

---

## 9. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **R-1: Electron HTTP-Server** -- Obsidian/Electron erlaubt keinen nativen HTTP-Server im Plugin-Kontext | M | H | Phase 1 nur stdio. Remote via separaten Prozess oder Cloudflare Tunnel Worker. Fruehe Validierung in PoC. |
| **R-2: MCP Spec Breaking Changes** -- MCP ist jung, Spec kann sich aendern | M | M | Abstraktionsschicht zwischen MCP-Transport und interner Tool-Pipeline. Spec-Version pinnen. |
| **R-3: Plugin Review Ablehnung** -- Community Plugin Review koennte den MCP-Server-Teil beanstanden | L | H | Frueh mit Obsidian-Team klaeren. stdio ist weniger kritisch als HTTP. Bestehende MCP-Plugin-Beispiele als Praezedenz. |
| **R-4: Approval-UX Remote** -- Keine gute Loesung fuer Write-Bestaetigung bei Remote-Zugriff | H | M | Design-Frage fuer Architektur-Phase. Optionen: Push-Notification, Whitelist, Auto-Approve. |
| **R-5: Skill-Prompt-Degradation** -- Skills performen als MCP Prompt schlechter als als System Prompt | M | M | Frueh testen in Phase 1. Ggf. Prompt-Adapter-Schicht. Als PoC-Acceptance-Criterion aufnehmen. |
| **R-6: Concurrent Access** -- Standalone + Connector gleichzeitig auf Vault | M | L | Beide nutzen gleiche Obsidian Vault API. Design-Frage fuer Architektur-Phase. |
| **R-7: Datenschutz-Akzeptanz** -- "Local-only"-User lehnen Tunnel-Option ab | L | M | Remote ist explizit opt-in. Klare Kommunikation: E2E-Tunnel, keine Cloud-Speicherung, Default = lokal. |
| **R-8: Wettbewerber holt auf** -- MCPVault oder Claudesidian baut Intelligence-Features | M | M | First-Mover-Vorteil nutzen. Obsilo's 46+ Tools und Agent-Intelligence sind ein tiefer Moat. |

---

## 10. Requirements Overview (High-Level)

### 10.1 Functional Requirements (Summary)

1. **MCP Server Lifecycle:** Starten, Stoppen, Konfigurieren des MCP Servers aus Obsilo heraus
2. **Tool-Exposition:** Bestehende Obsilo-Tools als MCP Tools exponieren (3 Tiers)
3. **Transport-Layer:** stdio (lokal) und Streamable HTTP (remote) unterstuetzen
4. **Auth:** Authless (lokal), OAuth 2.1 + PKCE (remote)
5. **Approval-Pipeline:** Read-Ops auto, Write-Ops mit Bestaetigung (Design offen)
6. **MCP Resources:** Vault-Metadaten als MCP Resources exponieren
7. **MCP Prompts:** Skill-Prompts als MCP Prompts an Claude uebergeben
8. **Plugin Skill Discovery:** Installierte Obsidian-Plugins dynamisch als MCP Tools anbieten
9. **Settings-UI:** MCP Server Konfiguration in den Obsilo Settings

### 10.2 Non-Functional Requirements (Summary)

- **Performance:** Tool-Call-Latenz <500ms (lokal), <2s (remote inkl. Tunnel)
- **Security:** OAuth 2.1 fuer Remote, keine Vault-Daten im Klartext ueber oeffentliche Netze, Approval-Pipeline fuer Writes
- **Reliability:** MCP Server muss stabil laufen solange Obsidian offen ist. Graceful Degradation bei Tunnel-Ausfall.
- **Privacy:** Remote-Modus opt-in, klare Datenschutz-Kommunikation, keine Cloud-Speicherung von Vault-Daten
- **Compatibility:** MCP Spec 2025-03-26 konform, Claude Desktop + claude.ai + Cowork als Clients

### 10.3 Key Features (fuer RE)

| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | MCP Server Core (stdio) | Lokaler MCP Server mit stdio-Transport, Core Tools (6), Auto-Konfiguration fuer Claude Desktop |
| P0 | Tool-Tier-Mapping | 46+ interne Tools auf 3 MCP-Tiers mappen (Core/Intelligence/Workflow) |
| P0 | Settings-UI | MCP Server Enable/Disable, Transport-Wahl, Status-Anzeige |
| P1 | Remote Transport (Streamable HTTP) | HTTP-Server + Cloudflare Tunnel fuer claude.ai Zugriff |
| P1 | OAuth 2.1 + PKCE | Authentifizierung fuer Remote-Zugriff |
| P1 | MCP Resources | Vault-Metadaten (Struktur, Tags, Stats) als MCP Resources |
| P1 | MCP Prompts | Skill-Prompts als MCP Prompts exponieren |
| P2 | Plugin Skill Discovery | VaultDNA-basierte Plugin-Erkennung als MCP Tool (discover_capabilities) |
| P2 | Approval Pipeline (Remote) | Write-Bestaetigung fuer Remote-Zugriff (Design offen) |
| P2 | Connectors Directory Submission | Einreichung bei Anthropic fuer offizielle Aufnahme |

---

## 11. Offene Design-Fragen (fuer Architektur-Phase)

1. **Approval-UX Remote:** Wie bestaetigt der User Write-Ops wenn Obsidian auf einem anderen Rechner laeuft? (Push-Notification, Whitelist, Auto-Approve?)
2. **Concurrent Access:** Locking-Strategie wenn Standalone-Agent und Connector gleichzeitig auf den Vault zugreifen?
3. **HTTP-Server in Electron:** Wie laeuft ein HTTP-Server innerhalb eines Obsidian-Plugins? Separater Prozess? Worker Thread? Node native modules?
4. **Tool-Tier-Zuordnung:** Welche der 46+ Tools gehoeren in welchen Tier? Granularitaet der MCP-Tool-Definitionen?
5. **Skill-Prompt-Format:** Muessen Skills fuer MCP-Kontext umgeschrieben werden oder funktionieren sie 1:1?
6. **2-Tool-Pattern:** Lohnt sich Claudesidian's Ansatz (getTools + useTools statt viele einzelne Tools) fuer Token-Effizienz?

---

## 12. Next Steps

- [ ] Review dieses Dokuments durch Product Owner
- [ ] Uebergabe an Requirements Engineer (`/requirements-engineering`)
- [ ] Input: `_devprocess/analysis/BA-MCP-CONNECTOR.md`

---

## Appendix

### A. Glossar

| Begriff | Definition |
|---------|-----------|
| MCP | Model Context Protocol -- offener Standard fuer Tool-Integration zwischen KI-Clients und Servern |
| Connector | MCP-basierte Integration in Claude (claude.ai, Desktop, Cowork) |
| stdio | Standard Input/Output -- lokaler Transport fuer MCP (JSON-RPC ueber stdin/stdout) |
| Streamable HTTP | HTTP-basierter MCP-Transport fuer Remote-Zugriff |
| VaultDNA | Obsilo-Feature zur automatischen Erkennung installierter Obsidian-Plugins |
| Tool Tier | Gruppierung von Tools nach Funktionalitaet: Core (CRUD), Intelligence (Suche, Memory), Workflow (Dokumente, Canvas) |
| Approval Pipeline | Sicherheitsmechanismus: Read-Ops auto-approved, Write-Ops erfordern User-Bestaetigung |

### B. Interview Notes

**Scope:** MVP -- alle 5 Phasen (lokal -> remote -> Intelligence -> Plugin Skills -> Directory)
**User-Segmente:** Power-User und Claude-First-Einsteiger gleichwertig
**Stakeholder:** End-User, Anthropic, Obsidian Community, MCP-Oekosystem
**Monetarisierung:** Erstmal alles kostenlos, Tier-Grenze spaeter
**Datenschutz:** Remote opt-in mit klarer Kommunikation
**Plugin Skills:** Dynamisch via VaultDNA (keine manuelle Priorisierung)
**Skill-Prompts:** Qualitaet als MCP Prompt muss getestet werden (PoC-Kriterium)
**Timeline:** Kein fixer Termin. Qualitaet vor Geschwindigkeit.
**Constraints:** Primaer Obsidian Plugin API (Electron, kein nativer HTTP-Server)

### C. References

- Feature Briefing: "Obsilo als MCP Connector fuer Claude" (Sebastian Hanke, 2026-03-25)
- MCP Specification: https://spec.modelcontextprotocol.io/
- Anthropic Connectors Directory: https://claude.ai/connectors
- Wettbewerbs-Recherche: Siehe Abschnitt 8 (6+ Obsidian MCP-Server, kein offizieller Connector)
- Obsilo Architektur: `_devprocess/architecture/arc42.md`
- Obsilo Backlog: `_devprocess/context/BACKLOG.md`
