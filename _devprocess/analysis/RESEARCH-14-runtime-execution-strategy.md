# Runtime Execution Strategy — Zwischenstand

**Datum:** 2026-04-14
**Status:** Diskussion pausiert, später wieder aufnehmen
**Trigger:** Frage nach Python-Support fuer Anthropic-Standard-Skills (docx, xlsx, pptx, pdf, skill-creator)

---

## 1. Problem-Rahmen

### 1.1 Die auslösende Frage

Die Anthropic-Standard-Skills, die Cowork aus deren offiziellem Skill-Repo uebernommen hat,
sind durchgehend **Python-basiert** (python-pptx, python-docx, openpyxl, pdfplumber).
Obsilo's Sandbox kann heute nur JavaScript ausfuehren. Damit koennen wir diese Skills nicht
uebernehmen und haben einen Content-Gap gegenueber Cowork + kuenftigen Anthropic-Skill-Releases.

### 1.2 Die realen Constraints

Im Lauf der Diskussion haben sich vier harte Randbedingungen herauskristallisiert:

1. **main.js ist bereits 32 MB gross** (v2.4.7 mit embedded WASM). Weiteres Einbetten
   gefaehrdet Plugin-Stabilitaet, BRAT-Download-Zeit, V8-Parse-Kosten und zukuenftige
   Erweiterbarkeit.

2. **Ziel-User sind nicht-technische Wissensarbeiter**, oft in Corporate-Setups (EnBW
   als konkretes Beispiel). Keine Terminal-Benutzung, keine Admin-Rechte, keine BIOS-
   Eingriffe, keine "installier dir mal eben Docker"-Aufgaben. Der Agent muss alles
   handhaben, der User gibt nur frei.

3. **Sicherheit bleibt Pflicht.** Obsilo hat historisch Code-Ausfuehrung auf dem Host
   vermieden und deshalb die JS-in-Electron-Sandbox gebaut. Neue Ausfuehrungspfade
   duerfen diese Grundhaltung nicht aufweichen — weder gegen Bugs noch gegen kompromittierte
   Skills/Dependencies.

4. **Offline-Faehigkeit und Privacy** sind Obsilo-Kernversprechen. Der Vault-Content
   darf nicht ohne expliziten User-Consent ins Internet.

### 1.3 Warum das kein reines Feature-Problem ist

Das ist eine **Architektur-Entscheidung**, keine Tool-Implementierung. Sie wirkt sich aus auf:

- Plugin-Groesse und Release-Strategie
- Provider-Unabhaengigkeit (Multi-Provider vs. vendor lock-in)
- Sicherheits-Modell (trust chain, approval UX)
- Build- und Deploy-Pipeline
- Skill-System und Dokumentation

---

## 2. Die untersuchten Pfade

### 2.1 Pfad A — Pyodide embedded in main.js

**Idee:** Python-in-WASM direkt ins Plugin einbauen, analog zum bestehenden ORT-WASM.

**Pro:**
- Zero-Install fuer User
- Laeuft vollstaendig in-process
- Keine Netzwerk-Abhaengigkeit zur Runtime

**Contra (Show-Stopper):**
- +10–15 MB in main.js (wird nach Embedding auf ~45 MB wachsen)
- Verstaerkt genau das Problem, das wir mit Constraint 1 vermeiden wollen
- Python-Libraries mit nativen C-Extensions sind teilweise nicht verfuegbar

**Verdict:** Verworfen wegen main.js-Bloat.

### 2.2 Pfad B — Externer Python-Sidecar via `uvx` (User installiert)

**Idee:** User fuehrt einmalig `uvx obsilo-python-runtime` im Terminal aus, Obsilo verbindet
sich via MCP-Protokoll mit dem lokalen Sidecar.

**Pro:**
- main.js bleibt klein
- Nutzt bestehende MCP-Client-Infrastruktur
- Saubere Process-Isolation

**Contra (Show-Stopper):**
- Setzt Terminal-Nutzung voraus — widerspricht Constraint 2
- Non-tech User werden daran scheitern

**Verdict:** Verworfen wegen User-Profil-Mismatch.

### 2.3 Pfad C — Agent-managed Sidecar via `execute_shell`-Tool

**Idee:** Neues sandboxed `execute_shell`-Tool, mit dem der Agent selbst die Runtime
installiert und managed. User klickt nur auf Approval-Dialoge. Konkret:

1. Neues Tool `execute_shell` mit Path-Containment, clean env, binary allowlist, approval-required
2. `RuntimeInstaller`-Pattern: Agent erkennt fehlende Runtime, fuehrt Install-Kommandos via `execute_shell` aus
3. Python-MCP-Server als bundled asset (~500 KB), gestartet via `child_process.spawn`
4. Agent-Tool-Calls gehen ueber MCP-Client an den lokalen Sidecar

**Pro:**
- Null manuelle User-Installation — Agent uebernimmt alles
- main.js bleibt klein (nur der MCP-Server-Source ist embedded, kein Python-Interpreter)
- Flexibel: gleiche Infrastruktur fuer kuenftige Runtimes (R, DuckDB, etc.)

**Contra:**
- **"Weak sandbox" auf dem Host** — path containment + clean env + approval ist kein
  echter Schutz gegen aktive Angriffe, nur gegen Fehler und naive Malware
- Installation laeuft nicht wirklich isoliert, nur in einem eingeschraenkten Pfad
- Kompromittierte Skills koennen ueber Approval-Muedigkeit Schaden anrichten

**Erweiterung:** OS-native Sandbox als zusaetzlicher Layer — `sandbox-exec` auf macOS,
`bwrap` auf Linux, AppContainer auf Windows. Kommt ohne Installation, bietet mittlere
Isolation ohne VM.

**Verdict:** Technisch umsetzbar, aber die Sicherheits-Limits muessen klar kommuniziert
werden. Keine Schweige-Bullets.

### 2.4 Pfad D — VM/Container-Setup via Script (Lima/WSL2/Docker)

**Idee:** Obsilo liefert ein Setup-Script mit, das Lima (macOS) / WSL2 (Windows) /
Docker automatisch installiert und konfiguriert.

**Pro:**
- Maximale Isolation (echte VM)
- Cowork macht das so — bewiesenes Muster
- Blockiert alle untersuchten Angriffsklassen

**Contra (mehrere Show-Stopper):**
- **2–5 GB Disk-Footprint** fuer eine VM-Runtime
- **1–2 GB RAM dauerhaft** alloziert
- **Setup-Zeit 5–10 Minuten** beim ersten Mal
- **Admin-Rechte erforderlich** — UAC-/sudo-Dialoge, die non-tech User abschrecken
- **BIOS-Virtualisierung muss aktiviert sein** — in vielen Corporate-Laptops per
  Group Policy deaktiviert, kein Script kann das umgehen
- **Docker Desktop ist lizenzpflichtig** fuer Firmen ab 250 Mitarbeiter (EnBW-Risiko)
- **Plattform-spezifische Fallen** (Windows Home vs. Pro, alte Windows-Versionen,
  Corporate Antivirus blockiert WSL)

**Verdict:** Verworfen fuer den Mass-Market. Kann als *dokumentierte* Opt-in-Option
fuer Power-User bleiben, aber kein Setup-Script-Automatismus.

### 2.5 Pfad E — Anthropic Managed Agents (`/v1/agents`)

**Idee:** Code-Execution komplett auslagern an Anthropic's gehostete Agent-API. Obsilo
schickt Sub-Requests raus, bekommt Ergebnisse zurueck. Kein Code auf dem User-Rechner
ausser der lokalen Vault-Tools.

**Pro (loest mehrere Probleme auf einen Schlag):**
- **NPM-Wurm-Angriffe unmoeglich** — kein Code laeuft lokal
- **Bösartige Skills koennen den User-Rechner nicht kompromittieren**
- **Null Installation** auf dem User-Rechner (keine Runtimes, keine VM)
- **Echte Container-Isolation** bei Anthropic
- **Anthropic-Standard-Skills laufen 1:1** (kein JS-Port noetig)
- **Plattformunabhaengig** (macOS, Windows, Linux, Mobile)

**Contra (die ehrlichen Kosten):**
- **Vendor Lock-in auf Anthropic** — bricht Obsilo's Multi-Provider-Versprechen fuer
  Code-Execution-Features. Gemini/Ollama/Bedrock-User bekommen keine Python-Skills.
- **Privacy-Bruch**: Vault-Content geht in die Cloud. Fuer sensible Domains
  (legal/medical/research) und DSGVO-kritische Corporate-User nicht akzeptabel.
- **Zweite Kosten-Achse**: Tokens + Compute-Units. User-Rechnung wird unuebersichtlich.
- **Offline-Feature bricht** — Managed Agents braucht Internet
- **Latency**: 200–500 ms pro Tool-Call Cloud-Roundtrip
- **Vault-Tools bleiben zwingend lokal** — `read_file`, `semantic_search`, etc. brauchen
  Vault-Zugriff. Das heisst **hybride Architektur** mit Context-Sync zwischen lokalem
  Client und remote Sub-Agent. Neu und nicht trivial.

**Verdict:** Konzeptionell die eleganteste Loesung fuer Corporate-Non-Tech-User ohne
Privacy-Issue, aber nicht fuer alle geeignet.

---

## 3. Das Sicherheits-Reality-Check

Waehrend der Diskussion ist klar geworden, dass die Sicherheitsfrage komplexer ist als
"wir bauen eine Sandbox, und dann sind wir safe". Ehrliche Einordnung:

### 3.1 Was eine weak/OS-native Sandbox blockt

Gegen einen NPM-Wurm, der via `execute_shell` getriggert wird:

- **Geblockt:** Zugriff auf SSH-Keys, AWS-Credentials, GitHub-Tokens, User-Secrets
  (bei tight path containment + clean env)
- **Geblockt:** Persistenz-Installation (keine LaunchAgents, crontab, Startup-Scripts)
- **Geblockt:** Zugriff auf Vault-Content ausserhalb des Runtime-Ordners
- **Geblockt:** Process-Escape via Child-Spawn (Sandbox-Profile propagieren)

### 3.2 Was sie nicht blockt

- **Exfiltration ueber erlaubte Netzwerk-Pfade** (wir muessen `registry.npmjs.org`
  freischalten, der kann als Covert Channel benutzt werden)
- **Schaden innerhalb des Runtime-Ordners** (Cross-Package-Kompromittierung)
- **Supply-Chain-Angriffe auf unsere bundled deps** (Anthropic-SDK, OpenAI, AWS-SDK,
  transformers.js, etc.) — wenn eines davon kompromittiert wird, laeuft der Code **in**
  main.js mit vollen Electron/Obsidian-Rechten. Keine Sandbox auf User-Seite kann das
  stoppen.
- **Social Engineering via Skills** — wenn der User dreimal "Erlauben" klickt, laeuft
  bösartiger Code trotzdem. Die Sandbox begrenzt nur den Schaden nach dem Klick.

### 3.3 Die notwendige Verteidigungskette (Defense in Depth)

Sandbox allein ist keine Antwort. Der vollstaendige Stack braeuchte:

1. **Build-time Dep-Hygiene** — Lockfile mit Integrity-Hashes, `npm audit` im CI,
   strenge Review-Policy fuer neue Deps, minimale Dep-Liste
2. **Runtime Sandbox** (OS-native oder VM) — gegen ausgefuehrte Skripte
3. **Approval UX mit semantischem Kontext** — Approval zeigt *warum* ein Call riskant ist,
   nicht nur *was* aufgerufen wird
4. **Skill Trust Tiers** — bundled > user > third-party mit eskalierender Approval-Pflicht
5. **Pattern Detection** — Agent erkennt verdaechtige Chains (`fetch → write .py → execute`)
6. **Capability Scoping per Skill** — Skills deklarieren im Frontmatter, welche Tools sie
   nutzen duerfen

Davon haben wir heute: teilweise (1), schwach (2), teilweise (3), **nicht** (4, 5, 6).

---

## 4. Bewertungs-Matrix

| Kriterium                       | A: Pyodide embed | B: uvx (User) | C: execute_shell | D: VM/Container | E: Managed Agents |
|---------------------------------|------------------|---------------|------------------|-----------------|-------------------|
| main.js-Impact                  | +15 MB           | 0             | +500 KB          | 0               | 0                 |
| User-Installation               | 0                | Terminal      | 0 (Agent-managed)| 2–5 GB + Admin  | 0                 |
| Non-tech User                   | OK               | **Broken**    | OK (mit Approval)| **Broken**      | OK                |
| Offline-faehig                  | Ja               | Ja            | Ja               | Ja              | **Nein**          |
| Privacy local-first             | Ja               | Ja            | Ja               | Ja              | **Nein**          |
| Multi-Provider kompatibel       | Ja               | Ja            | Ja               | Ja              | **Anthropic-only**|
| Isolation-Staerke               | Schwach          | Mittel        | Mittel (OS)      | **Stark**       | **Stark**         |
| Implementation-Effort           | S                | S             | M–L              | XL              | L                 |
| Reife der zugrunde liegenden Tech| Produktionsreif | Produktionsreif| Produktionsreif | Produktionsreif | **Noch jung**     |
| Kosten fuer User                | 0                | 0             | 0                | 0               | Tokens + Compute  |

**Keiner der Pfade ist perfekt.** A+B+D fallen an harten Constraints. C und E bleiben als
realistische Kandidaten uebrig und adressieren komplementaere User-Segmente.

---

## 5. Zwischen-Fazit

### 5.1 Die plausibelste Ziel-Architektur

Ein **Drei-Tier-Modell**, bei dem der User in den Settings waehlt, welches Tier aktiv ist:

- **Tier 1 — Local JS Sandbox** (bestehend): `evaluate_expression` in JS-Worker. Default,
  funktioniert ueberall, kein Python, keine native Tools.
- **Tier 2 — Managed Agents** (neu, opt-in): Python/Compute-Tools laufen in Anthropic's
  Cloud. Beste Sicherheit, null Setup. Trade-off: Anthropic-Provider-Pflicht,
  Privacy-Bruch, Cloud-Costs. Zielgruppe: Corporate-Non-Tech ohne Privacy-Issues.
- **Tier 3 — Local Sidecar mit OS-Sandbox** (neu, opt-in): `execute_shell` + path
  containment + sandbox-exec/bwrap/AppContainer + lokaler Python-Install via Agent.
  Local-first, aber weak sandbox. Zielgruppe: Power-User mit Privacy-Anforderungen.

Die **Vault-Tools** (read_file, semantic_search, knowledge graph) bleiben immer lokal,
unabhaengig vom Tier.

### 5.2 Offene Fragen, die wir beim Wiederaufnehmen klaeren muessen

1. **Welches Segment dominiert bei Obsilo's User-Base?** Corporate-Non-Tech (favorisiert
   Tier 2) oder Privacy-sensitive Power-User (favorisiert Tier 3)? Das bestimmt, welches
   Tier zuerst gebaut wird.

2. **Managed Agents API — Reality Check.** Wir kennen die aktuelle Reife nicht. Preise,
   Rate-Limits, Verfuegbarkeit, File-Handle-Groessen, Session-Lifetimes sind alle
   offen. Braucht einen kleinen POC-Spike (~halber Tag), bevor wir fest darauf planen.

3. **Hybrid-Architektur-Design.** Wenn wir Tier 2 bauen, brauchen wir einen klaren
   Entwurf, wie lokale Vault-Tools und remote Compute-Tools im selben Agent-Loop
   zusammenarbeiten. Context-Sync, File-Transfer, State-Management. Das ist heute
   nicht designed.

4. **Build-time Supply-Chain-Schutz.** Unabhaengig vom gewaehlten Runtime-Pfad: wir
   muessen unsere bundled deps absichern (Lockfile-Hashes, npm audit im CI, manuelle
   Review-Policy). Das ist die Luecke, gegen die keine Runtime-Sandbox schuetzt.

5. **Approval-UX-Redesign.** Der aktuelle Approval-Dialog zeigt nur Tool-Name +
   Parameter. Fuer Security-Awareness muss er Kontext zeigen ("dieses File wird gleich
   ausgefuehrt"). Das ist ein unabhaengiges UI-Thema, aber Voraussetzung fuer
   vertrauenswuerdige Runtime-Execution.

6. **Skill Trust Tiers.** Brauchen wir fuer verlaesslichen Defense-in-Depth. Design-
   Entscheidung steht aus: woran erkennen wir, dass ein Skill vertrauenswuerdig ist?
   Signatur? Herkunft? User-Einstufung?

### 5.3 Was wir **nicht** tun sollten

- Pyodide in main.js einbauen (Groessen-Problem)
- Terminal-Installation vom User verlangen (User-Profil-Mismatch)
- VM-Setup-Script mitliefern (Setup-Aufwand + Corporate-Laptop-Probleme)
- Die Sandbox als Allheilmittel darstellen (sie ist es nicht)
- Neue Features in die main.js packen ohne strategischen Gesamtplan

---

## 6. Nächste Schritte beim Wiederaufnehmen

### 6.1 Empfohlene Reihenfolge

1. **ADR "Plugin Footprint Strategy"** schreiben. Dokumentiert das Prinzip "Sidecar first,
   embed nur wenn unvermeidlich" und klassifiziert bestehende + zukuenftige Assets in
   vier Kategorien: embedded / release-tarball / CDN-on-demand / external sidecar.

2. **ADR "Runtime Execution Tiers"** schreiben. Beschreibt das Drei-Tier-Modell und
   positioniert Tier 2 (Managed Agents) und Tier 3 (Local Sidecar mit OS-Sandbox) als
   opt-in neben Tier 1.

3. **ADR "Defense-in-Depth fuer Agent-Code-Execution"** schreiben. Dokumentiert die
   sechs Schichten (Dep-Hygiene, Sandbox, Approval-UX, Trust Tiers, Pattern Detection,
   Capability Scoping) und welche Schichten wir zuerst bauen.

4. **POC-Spike Managed Agents** (halber Tag). Direkter API-Call gegen `/v1/agents`,
   Python-Tool-Aufruf, File-Upload/Download-Roundtrip. Nur um zu bestaetigen, dass es
   in Electron-Kontext funktioniert. Liefert harte Zahlen fuer Preise und Latency.

5. **Entscheidung: Pfad A (Lokal zuerst) oder Pfad B (Cloud zuerst)**. Abhaengig von
   POC-Ergebnis und User-Segment-Priorisierung. Bei Corporate-Fokus wahrscheinlich
   Cloud zuerst. Bei Privacy-Fokus lokal zuerst.

6. **Implementation in Phasen** gemaess gewaehltem Pfad. Jede Phase ein eigener
   PR-Cycle, nicht alles auf einmal.

### 6.2 Harte No-Gos beim Wiederaufnehmen

- Nichts in main.js einbauen ohne expliziten Check gegen den Plugin-Footprint-ADR
- Keine Runtime-Installation die User-Terminal erfordert
- Keine Sicherheits-Aussagen ohne klares Threat-Modell dahinter
- Keine Tier-2-Implementation ohne vorherigen POC-Spike
- Keine Multi-Provider-Inkonsistenzen ohne expliziten Hinweis in der UI

---

## 7. Referenzen

- Diskussion: Chat-Session 2026-04-14, beginnend mit Cowork-Skills-Analyse
- Cowork-Codebase: `/Users/sebastianhanke/projects/enbw-cowork/`
- Anthropic Skills Repo: Cowork's `.claude/skills/` (docx, xlsx, pptx, pdf, skill-creator)
- Bestehende Obsilo Sandbox: `src/core/sandbox/ProcessSandboxExecutor.ts`,
  `IframeSandboxExecutor.ts`
- Bestehende MCP-Infrastruktur: EPIC-14, FEAT-14-00 ff.
- Obsilo Security-Historie: AUDIT-003, AUDIT-010, AUDIT-011
- Aktueller Plugin-Footprint: main.js 32 MB (v2.4.7)

---

**Zum Wiederaufnehmen genuegt es, diese Datei zu lesen.** Die Entscheidung ist vertagt,
nicht gestrichen. Die naechste Aktion ist der POC-Spike gegen Managed Agents,
idealerweise bevor irgendein anderer Code zum Thema geschrieben wird.
