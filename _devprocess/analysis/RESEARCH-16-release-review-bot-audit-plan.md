# Review-Bot Release Audit Plan

**Datum:** 2026-03-18
**Betroffener PR:** obsidianmd/obsidian-releases#10565
**Ziel:** Vollstaendige Review-Bot-Vorpruefung der aktuellen Codebase vor dem naechsten Release

---

## 1. Kontext

Der bestehende Community-Plugin-PR #10565 ist historisch nicht an einem einzelnen Problem gescheitert, sondern an drei verschiedenen Ebenen:

1. einer grossen Menge automatischer Review-Bot-Findings im Plugin-Code,
2. einem kleinen, bewusst nicht fixbaren Rest, der per `/skip` begruendet wurde,
3. einem spaeteren externen Validierungsfehler im `community-plugins.json` des Upstream-Repositories.

Fuer das naechste Release reicht es deshalb nicht, nur punktuell einzelne neue Findings zu fixen. Wir brauchen einen reproduzierbaren Audit-Prozess, der die gesamte Codebase mit den Augen des ObsidianReviewBots prueft, die frueheren Fix-Muster wiederverwendet und die `/skip`-Grenze sauber von echten Regressionen trennt.

---

## 2. Analyse des bestehenden PR #10565

### 2.1 Chronologie

Der PR durchlief mehrere Bot-Runden:

- Initialer Bot-Scan mit mehreren hundert Required- und Optional-Findings
- Mehrere Fix-Runden mit deutlicher Reduktion der Findings
- Finaler Restbestand mit `/skip` begruendet
- Spaeter zusaetzlicher GitHub-Actions-Fehler: `community-plugins.json` im Upstream war temporaer invalides JSON

### 2.2 Historisch gemeldete Hauptkategorien

Die Bot-Funde im PR lagen vor allem in diesen Gruppen:

- `fetch()` im Plugin-Code
- `console.log()` und `console.info()`
- `require()` statt ES-Imports
- hardcodierte `.obsidian`-Pfade statt `vault.configDir`
- `innerHTML`
- direkte `element.style.X = Y` Zuweisungen
- floating Promises
- `any`-Typen und unsaubere Casts
- `Vault.delete()` / `Vault.trash()` statt `FileManager.trashFile()`
- Template-Literal- und Stringification-Probleme
- unnötige Type Assertions
- `async` ohne `await`
- Sentence-Case-Verstosse in UI-Strings
- Deprecated MCP-Transport
- vereinzelte Regex-, Promise- und Typing-Probleme

### 2.3 Was davon spaeter bewusst nicht gefixt wurde

Der dokumentierte `/skip`-Rest in [REVIEW-001-bot-skip-list.md](_devprocess/analysis/REVIEW-001-bot-skip-list.md) bestand aus sieben begruendeten Klassen:

1. `async`-Methoden ohne `await`, wenn ein Interface- oder Lifecycle-Contract `Promise<T>` verlangt
2. `SSEClientTransport` als notwendiger Legacy-Fallback im MCP-Client
3. `style.setProperty()` fuer dynamische, runtime-berechnete Positionierung
4. `async onunload()` als Obsidian-Lifecycle-Muster
5. deprecated Settings-Felder als Migrations-Shims
6. der Regex-Escape in `SemanticIndexService.ts`
7. Sentence-Case-Funde auf Proper Nouns, Akronyme und technische Identifier

Wichtig: Diese Liste ist kein Freifahrtschein. Sie ist nur gueltig, wenn die aktuelle Codebasis dieselben technisch begruendeten Randbedingungen hat und die Anzahl der Treffer nicht unkontrolliert gewachsen ist.

---

## 3. Wie die frueheren Probleme beseitigt wurden

Die frueheren Fixes sind bereits in [TECH-011-review-bot-compliance.md](_devprocess/implementation/TECH-011-review-bot-compliance.md) und [IMPL-001-review-bot-fixes.md](_devprocess/implementation/IMPL-001-review-bot-fixes.md) dokumentiert. Die wichtigsten erfolgreichen Muster waren:

### 3.1 Mechanische Massenfixes

- `console.log/info` systematisch auf `console.debug/warn/error` umgestellt
- `fetch()` durch `requestUrl` oder SDK-Clients ersetzt
- `require()` durch ES-Imports ersetzt, ausser `require('electron')`
- `.obsidian` systematisch auf `vault.configDir` umgestellt
- `innerHTML` auf Obsidian-DOM-API migriert
- `element.style.X = Y` auf CSS-Klassen verlagert
- floating Promises mit `void` oder `.catch()` explizit markiert
- `any` durch `unknown`, Type Guards und Obsidian-Augmentations ersetzt
- `as TFile` / `as TFolder` durch `instanceof` ersetzt
- `Vault.delete()` / `Vault.trash()` durch `fileManager.trashFile()` ersetzt

### 3.2 Strukturelle Fixes

- OpenAI-Provider auf SDK-basiertes Streaming umgebaut, um eigenes `fetch()` zu vermeiden
- Utility-CSS-Klassen in `styles.css` zentralisiert
- neue Typdefinitionen in `src/types/obsidian-augments.d.ts` und `src/types/electron.d.ts` eingefuehrt
- einzelne Problemklassen in gemeinsame Utilities oder zentrale Services verlagert

### 3.3 Bewusste Skip-Strategie

Die erfolgreiche Vorarbeit bestand nicht nur aus Fixes, sondern auch aus sauber begrenzten Nicht-Fixes mit technischer Begruendung. Genau dieses Muster muessen wir fuer das naechste Release wiederholen: erst alles Fixbare eliminieren, dann den echten Restbestand beweisbar klein halten.

---

## 4. Aktueller Ist-Zustand der Codebase

### 4.1 Lokaler ESLint-Stand am 2026-03-18

Ein frischer Lauf mit `npm run lint` liefert aktuell:

- **49 Errors**
- **456 Warnings**

Regelverteilung:

- Obsidian-spezifisch: **31**
- Security-Plugin: **438**
- TypeScript/Allgemein: **26**
- Sonstige: **10**

Top-Regeln:

- `security/detect-object-injection`: 379
- `security/detect-non-literal-regexp`: 29
- `security/detect-non-literal-fs-filename`: 19
- `obsidianmd/ui/sentence-case`: 19
- `obsidianmd/no-static-styles-assignment`: 12
- `prefer-const`: 11

### 4.2 Aktuelle echte Obsidian-Hotspots

Die direkt Review-Bot-relevanten Treffer sitzen aktuell vor allem hier:

- `src/ui/settings/VaultTab.ts` — 8x sentence case
- `src/ui/settings/VisualIntelligenceTab.ts` — 7x sentence case
- `src/ui/AgentSidebarView.ts` — 6x static styles, 1x sentence case
- `src/ui/sidebar/ToolPickerPopover.ts` — 3x static styles
- `src/ui/sidebar/VaultFilePicker.ts` — 3x static styles
- `src/ui/TaskSelectionModal.ts` — 1x sentence case
- `src/ui/settings/ModelConfigModal.ts` — 1x sentence case
- `src/ui/sidebar/CondensationFeedback.ts` — 1x sentence case

### 4.3 Delta zur frueheren sauberen Lage

Die historische Aussage in [AUDIT-003-obsilo-2026-03-06.md](_devprocess/analysis/security/AUDIT-003-obsilo-2026-03-06.md), dass Review-Bot-Compliance vollstaendig bestanden sei, ist fuer die heutige Codebasis nicht mehr belastbar. Seitdem sind neue Office-, PPTX-, UI-, Security- und Provider-Aenderungen hinzugekommen. Der aktuelle Lint-Lauf zeigt klar, dass die Codebase wieder neu geprueft werden muss.

---

## 5. Root-Cause-Analyse

**Problem:** Der PR steckt weiterhin fest, obwohl ein grosser Teil der historischen Review-Bot-Funde bereits abgearbeitet wurde.

**Root Cause:**

1. Die frueheren Fixes waren erfolgreich, aber nicht als dauerhaft erzwungener Release-Gate institutionalisiert.
2. Nachfolgende Features haben neue Review-Bot-relevante Muster eingefuehrt, insbesondere in neuen UI- und Office-Bereichen.
3. Die lokale ESLint-Konfiguration mischt echte Obsidian-Review-Bot-Regeln mit weitergehenden Security-Regeln. Ohne Trennung verschwimmt, was Store-blockierend ist und was internes Hardening ist.
4. Der Upstream-PR kann zusaetzlich an externen Registry-Validierungsfehlern haengen, die ausserhalb der Plugin-Codebase liegen.

**Kette:**

Release-Wachstum -> neue Dateien und UI-Pfade -> Compliance driftet wieder -> keine dedizierte Review-Bot-Vorpruefung pro Release -> PR bleibt erneut an Bot/Validierung haengen

---

## 6. Zielbild fuer den naechsten Release-Prozess

Vor dem naechsten Push an den Community-Plugin-PR muss ein eigener Release-Audit laufen, der drei Ebenen strikt trennt:

1. **Store-Blocker:** echte ObsidianReviewBot-Regeln und bekannte historische PR-Blocker
2. **Skip-Kandidaten:** nur technisch notwendige Restfaelle mit dokumentierter Begruendung
3. **Interne Hardening-Funde:** Security- und Code-Quality-Regeln, die nicht zwingend Review-Bot-blockierend sind, aber bewusst bewertet werden muessen

---

## 7. Plan: Vollanalyse der gesamten Codebase mit den Augen des ObsidianReviewBots

### Phase 0: Review-Bot-Baseline einfrieren

Ziel: historische und aktuelle Regeln in einer belastbaren Baseline zusammenziehen.

Schritte:

1. PR #10565 als Referenzbestand vollständig in Kategorien zerlegen: fixbar, skipbar, extern.
2. [TECH-011-review-bot-compliance.md](_devprocess/implementation/TECH-011-review-bot-compliance.md) als Fix-Pattern-Katalog verwenden.
3. [REVIEW-001-bot-skip-list.md](_devprocess/analysis/REVIEW-001-bot-skip-list.md) in eine aktuelle “nur wenn weiterhin technisch notwendig”-Skip-Matrix ueberfuehren.
4. Eine aktuelle Release-Checkliste definieren, die nicht nur historische Regeln wiederholt, sondern neue Feature-Flaechen explizit mit abdeckt.

Ergebnis:

- verbindliche Review-Bot-Baseline fuer diesen Release

### Phase 1: Obsidian-spezifischen Audit isoliert fahren

Ziel: zuerst alle echten Community-Store-Blocker finden, ohne Security-Lint-Rauschen.

Schritte:

1. ESLint-Auswertung in einen eigenen Obsidian-Bucket zerlegen
2. Nur `obsidianmd/*` und die historisch bekannten harten Regeln priorisieren:
   - `fetch()`
   - `require()`
   - `console.log/info`
   - `.obsidian`
   - `innerHTML`
   - `element.style.X = Y`
   - floating promises
   - `any`
   - `as TFile` / `as TFolder`
   - `Vault.delete()` / `Vault.trash()`
   - sentence case
3. Fuer jede betroffene Datei feststellen: echter Fehler, zulaessiger Skip-Fall oder false positive

Ergebnis:

- kurze Liste echter Release-Blocker
- separate Liste potenzieller `/skip`-Kandidaten

### Phase 2: Historische Fix-Muster wiederverwenden

Ziel: nicht neu erfinden, sondern systematisch auf bewaehrte Muster mappen.

Musterbibliothek:

- static styles -> CSS-Klassen oder CSS-Variablen
- sentence case -> generische UI-Labels absenken, Proper Nouns/Akronyme dokumentieren
- floating promises -> `void` oder `.catch()`
- dynamic positioning -> pruefen, ob echte `setProperty()`-Notwendigkeit besteht
- provider/network code -> `requestUrl` oder SDK-internes HTTP

Ergebnis:

- pro Finding-Klasse ein Standard-Fix-Muster

### Phase 3: File-Hotspot-Audit

Ziel: zuerst die Dateien mit hoechstem Review-Bot-Risiko abarbeiten.

Reihenfolge fuer den naechsten Audit-Durchlauf:

1. `src/ui/AgentSidebarView.ts`
2. `src/ui/sidebar/ToolPickerPopover.ts`
3. `src/ui/sidebar/VaultFilePicker.ts`
4. `src/ui/settings/VaultTab.ts`
5. `src/ui/settings/VisualIntelligenceTab.ts`
6. `src/ui/settings/ModelConfigModal.ts`
7. `src/ui/TaskSelectionModal.ts`
8. `src/ui/sidebar/CondensationFeedback.ts`

Danach zweite Welle fuer neue grosse Feature-Bloecke mit generischen Lint-Risiken:

1. Office/PPTX-Dateien
2. Sandbox-Dateien
3. neue Provider-/Auth-Dateien
4. semantische Suche und Skill-Loader

Ergebnis:

- priorisierte Arbeitsliste statt vollflaechiger Ad-hoc-Fixes

### Phase 4: Skip-Matrix neu validieren

Ziel: historische `/skip`-Argumente nur uebernehmen, wenn sie noch wahr sind.

Fuer jeden bisherigen Skip-Fall pruefen:

1. ist der Fund noch vorhanden?
2. ist die Begruendung technisch weiter gueltig?
3. ist die Anzahl der Vorkommen stabil oder gewachsen?
4. gibt es inzwischen eine bot-konforme Alternative?

Ergebnis:

- aktualisierte, stark reduzierte `/skip`-Liste
- keine automatische Uebernahme alter Skip-Kommentare

### Phase 5: Release-Gate lokal reproduzierbar machen

Ziel: vor jedem Release dieselben Klassen lokal deterministisch pruefen.

Pflichtlauf vor PR-Update:

1. `npm run lint`
2. gezielte Greps fuer die historischen Hard-Blocker
3. `npm run build`
4. manuelle UI-Stichprobe fuer die Dateien mit CSS-/Sentence-Case-Fixes
5. Vergleich gegen die dokumentierte Skip-Matrix

Ergebnis:

- PR wird erst aktualisiert, wenn lokal kein unerklaerter Review-Bot-Blocker mehr uebrig ist

### Phase 6: Externe PR-Validierung separat behandeln

Ziel: Plugin-Code-Probleme nicht mit Upstream-Registry-Problemen vermischen.

Schritte:

1. Vor Push kurz PR-Zustand und Labels in `obsidian-releases` pruefen
2. Wenn erneut `community-plugins.json` invalid ist, diesen Fehler nicht als Plugin-Code-Problem behandeln
3. Eigene Aenderungen nur pushen, wenn der Upstream-Zustand wieder normal ist oder der Fehler klar extern ist

Ergebnis:

- saubere Trennung zwischen Code-Compliance und Upstream-Validierungsstoerung

---

## 8. Konkreter Arbeitsmodus fuer den naechsten Audit-Lauf

### Audit-Regeln

- Zuerst Obsidian-spezifische Errors/Warnungen
- Danach historische Hard-Blocker per grep
- Danach Security-Stack nur als zweite Schicht
- Neue `/skip`-Argumente nur mit konkreter technischer Begruendung und Dateiliste

### Definition of Done fuer den Release-Audit

- keine unerklaerten Obsidian-spezifischen Findings mehr
- alle historischen Hard-Blocker erneut geprueft
- nur ein kleiner, technisch verteidigbarer `/skip`-Rest bleibt uebrig
- `npm run build` erfolgreich
- Release-Entscheidung basiert auf aktueller Codebase, nicht auf dem Audit-Stand vom 2026-03-06

---

## 9. Empfohlene naechste Umsetzungsschritte

### Sofort

1. echten Review-Bot-Audit fuer die acht aktuellen UI-Hotspots starten
2. alte `/skip`-Liste gegen die heutige Codebase neu verifizieren
3. Office- und Sandbox-Bloecke separat als zweite Welle auditieren

### Vor dem naechsten PR-Push

1. Release-Checkliste aus diesem Dokument als festen Gate verwenden
2. Findings in drei Spalten pflegen: fix, skip, extern
3. erst nach lokaler Gruenphase wieder auf PR #10565 pushen

---

## 10. Referenzen

- [TECH-011-review-bot-compliance.md](_devprocess/implementation/TECH-011-review-bot-compliance.md)
- [IMPL-001-review-bot-fixes.md](_devprocess/implementation/IMPL-001-review-bot-fixes.md)
- [REVIEW-001-bot-skip-list.md](_devprocess/analysis/REVIEW-001-bot-skip-list.md)
- [AUDIT-003-obsilo-2026-03-06.md](_devprocess/analysis/security/AUDIT-003-obsilo-2026-03-06.md)
- PR: `https://github.com/obsidianmd/obsidian-releases/pull/10565`