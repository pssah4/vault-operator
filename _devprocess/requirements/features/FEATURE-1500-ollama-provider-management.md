# FEATURE: Ollama Provider Management

**Status:** Geplant
**Epic:** Provider Experience
**Source:** `src/ui/settings/`, `src/api/providers/openai.ts`
**Referenz:** Kilo Code `forked-kilocode/src/api/providers/native-ollama.ts`

## Zusammenfassung

Nicht-technischen Usern den Einstieg mit Ollama erleichtern: Status-Anzeige,
Model-Installation direkt aus der UI, und optionales Start/Stop des Ollama-Servers.
Aktuell muss der User Terminal-Befehle (`ollama serve`, `ollama pull`) kennen.

## Ist-Zustand

| Feature | Status |
|---------|--------|
| Model-Browse (`/api/tags`) | Vorhanden |
| Connection-Test (30s Timeout) | Vorhanden |
| Fehlerbehandlung (ECONNREFUSED, 404) | Vorhanden, mit hilfreichen Hinweisen |
| Built-in Models (llama3.2, qwen2.5:7b) | Vorhanden |
| Start/Stop des Servers | Fehlt -- nur Text-Hinweis "ollama serve" |
| Model Pull/Install | Fehlt -- nur Text-Hinweis "ollama pull" |
| Health-Status-Indikator | Fehlt |

## Anforderungen

### Must Have

#### F-1500.1: Ollama Health-Status-Indikator
- Farbiger Status-Dot im ModelConfigModal neben dem Ollama-Provider
- Gruen = erreichbar, Rot = nicht erreichbar, Grau = unbekannt
- Automatischer Check beim Oeffnen des Modals und bei Provider-Wechsel zu Ollama
- Endpoint: `GET {baseUrl}/api/tags` (existierender Code wiederverwendbar)
- Kein Polling -- nur on-demand

#### F-1500.2: Model Pull/Install aus der UI
- "Pull Model"-Button im Ollama-Browser (ModelConfigModal)
- Input-Feld fuer Model-Name (z.B. `llama3.2`, `qwen2.5:7b`)
- Vorschlaege/Autocomplete mit gaengigen Modellen
- Progress-Anzeige waehrend des Downloads (Ollama `/api/pull` streamt JSON-Progress)
- Abbruch-Moeglichkeit
- Nach erfolgreichem Pull: Model-Liste automatisch aktualisieren
- Fehlerbehandlung: ungueltige Model-Namen, Netzwerkfehler, Speicherplatz

#### F-1500.3: Installed Models mit Details
- Erweiterte Model-Liste zeigt: Name, Groesse, Quantisierung, Parameter-Anzahl
- Daten via `/api/show` Endpoint (Kilo Code Pattern)
- Tool-Support-Indikator (capabilities.includes("tools"))

### Should Have

#### F-1500.4: Ollama Server Start/Stop
- "Start Ollama"-Button wenn Server nicht erreichbar
- Nutzt `child_process.spawn('ollama', ['serve'])` (Electron nodeIntegration)
- Prozess-Lifecycle an Plugin-Lifecycle binden (Stop bei Plugin-Unload)
- "Stop"-Button wenn Server laeuft UND vom Plugin gestartet wurde
- Kein Stop fuer extern gestartete Ollama-Instanzen

**Einschraenkungen:**
- Nur moeglich wenn Ollama auf dem gleichen Rechner installiert ist
- macOS: Ollama App vs CLI (`ollama serve`) haben unterschiedliche Lifecycles
- Windows: Ollama laeuft oft als System-Service
- Erkennung ob Ollama installiert ist: `which ollama` / `where ollama`

#### F-1500.5: Model-Loeschung
- "Delete"-Button pro installiertem Modell
- Confirmation-Modal (gemaess Feedback: destruktive Aktionen brauchen Bestaetigung)
- Endpoint: `DELETE /api/delete`

### Nice to Have

#### F-1500.6: Ollama Library Browse
- Durchsuchbare Liste verfuegbarer Modelle von ollama.com
- Kategorien: Chat, Code, Embedding, Vision
- Direkt-Pull aus der Library

## Abgrenzung

- Kein nativer Ollama-SDK-Provider (bleibt bei OpenAI-compatible, ADR-064 Pattern)
- Keine GPU-Konfiguration oder Performance-Tuning
- Kein automatischer Server-Start beim Plugin-Load (nur manuell)
- Kein Ollama-Update-Management

## Akzeptanzkriterien

1. User kann in den Settings sehen, ob Ollama laeuft (Status-Dot)
2. User kann ein Modell direkt in der UI pullen, mit sichtbarem Download-Fortschritt
3. User sieht installierte Modelle mit Groesse und Capabilities
4. User kann (optional) Ollama aus der UI starten, wenn lokal installiert
5. Alle Aktionen funktionieren ohne Terminal-Kenntnisse

## Technische Notizen

### Ollama API Endpoints
- `GET /api/tags` -- Liste installierter Modelle
- `POST /api/show` -- Detail-Info zu einem Modell
- `POST /api/pull` -- Modell herunterladen (streamt JSON-Progress)
- `DELETE /api/delete` -- Modell loeschen
- `GET /` -- Health-Check (200 = "Ollama is running")

### Kilo Code Referenz
- `forked-kilocode/src/api/providers/native-ollama.ts` -- Model-Fetch mit `/api/show`
- `forked-kilocode/src/api/providers/fetchers/ollama.ts` -- Context-Window-Erkennung, Tool-Support

### Review-Bot Compliance
- `child_process.spawn` braucht `require()` -- erlaubt mit eslint-disable + Begruendung
- Keine `console.log` -- nur `console.debug`
- Progress-UI ueber CSS-Klassen, nicht inline styles
