---
id: ADR-140
title: Settings-Snapshot-Lifecycle fuer Inline-Actions
date: 2026-06-22
deciders: [Sebastian Hanke, Architecture Agent (Claude Opus 4.7)]
asr-refs: [ASR-EPIC-33-06]
feature-refs: [FEAT-33-01, FEAT-33-10]
related-adrs: []
supersedes: null
superseded-by: null
---

# ADR-140: Settings-Snapshot-Lifecycle fuer Inline-Actions

## Context

Inline-Actions im Editor (FEAT-33-01) konsumieren bei jedem Trigger einen Settings-Snapshot: aktives Modell, Provider, Skills, Custom-Prompts. Dieser Snapshot muss den State spiegeln, den der User im Main-Chat sieht. Gleichzeitig ist eine Action im Editor ein Hotpath: User markiert Text, drueckt einen Hotkey, erwartet sub-second Reaktion.

Damit stehen drei Eigenschaften in Spannung. Erstens Konsistenz: der Snapshot muss aktuell sein, sonst weicht das Inline-Verhalten vom Chat-Verhalten ab. Zweitens Performance: das Aufloesen von Modell, Provider, Skills bei jedem Trigger erzeugt Latenz, die sich im Inline-Kontext direkt anfuehlt. Drittens Per-Action-Pin (FEAT-33-10): einzelne Actions koennen ein fixes Modell pinnen, das den globalen Snapshot ueberschreiben muss.

Die Settings-Quellen sind heterogen: das globale Plugin-Settings-Objekt, die providerConfigs[]-Liste, das Skills-Verzeichnis, optional die data.json bei Out-of-Band-Aenderungen. Ein einheitlicher Lesepfad existiert nicht.

**Triggering ASR:** ASR-EPIC-33-06 fordert, dass Inline-Actions die im Main-Chat aktiven Settings ohne sichtbare Verzoegerung konsumieren und dabei mit dem Chat konsistent bleiben.

**Quality attribute:** Consistency und Performance.

## Decision drivers

- **Trigger-Latenz unter 50ms im Snapshot-Pfad.** Inline-Actions feuern auf Tastendruck. Der User darf die Snapshot-Aufloesung nicht spueren. Modell-Resolution mit Provider-Lookup ist der teure Anteil.
- **Konsistenz mit dem Main-Chat.** Aendert der User im Chat das Modell, muss die naechste Inline-Action das neue Modell verwenden. Stale-Reads sind ein User-sichtbarer Bug.
- **Per-Action-Pin als first-class Override.** FEAT-33-10 erlaubt pro Action ein fixes Modell. Der Snapshot-Mechanismus muss diesen Override sauber integrieren, ohne dass die Action den globalen Cache stoert.
- **Multiple Settings-Aenderungs-Pfade.** Settings koennen via Settings-UI, Programmatisch, oder im Edge-Case via Out-of-Band Edit der data.json geaendert werden. Der Lifecycle muss die ueblichen Pfade decken und Edge-Cases erklaerbar machen.

## Considered options

### Option 1: Pro Trigger frisch lesen

Bei jedem Action-Trigger wird der vollstaendige Snapshot neu gebaut: Modell aus plugin.settings, Provider aus plugin.apiHandler, Skills aus dem Plugin-State, Prompts aus den Custom-Prompts.

**Pros:**
- Immer aktuell, kein Stale-Risiko.
- Implementierung einfach, kein Cache-Management.
- Out-of-Band-Aenderungen werden beim naechsten Trigger automatisch sichtbar.

**Cons:**
- Latenz pro Trigger durch Settings-Read und Modell-Resolution.
- Bei 100 Inline-Actions pro Session entstehen 100 vollstaendige Resolutions.
- Provider-Lookup geht ueber mehrere Datenstrukturen und ist nicht trivial.

### Option 2: Gecached mit Invalidation-Event

Der Snapshot wird beim Plugin-Load gebaut und im Memory gehalten. Settings-Aenderungen feuern ein Invalidation-Event, das den Cache neu aufbaut.

**Pros:**
- Schnellster Pfad pro Action-Trigger.
- Klare Invalidation-Semantik, sofern alle Aenderungspfade das Event feuern.

**Cons:**
- Komplexitaet im Event-Wiring fuer alle Settings-Aenderungswege.
- Stale-Risiko bei Out-of-Band-Aenderungen (data.json manuell editiert).
- Der gesamte Snapshot wird invalidiert, auch wenn nur ein Detail betroffen ist.

### Option 3: Hybrid aus gecachetem Modell und frischer Selektion (empfohlen)

Modell und Provider werden gecached. Der Cache reagiert auf Settings-Save-Events. Skills und Custom-Prompts werden bei jedem Trigger frisch aus dem Plugin-State gelesen, weil dieser Zugriff billig ist. Per-Action-Pin aus FEAT-33-10 wird in der Snapshot-Assembly nach dem Cache-Lookup angewendet und ueberschreibt den Modell-Anteil.

**Pros:**
- Beste Balance aus Latenz und Aktualitaet: teurer Teil gecached, billiger Teil frisch.
- Per-Action-Pin sauber als finaler Override in der Pipeline.
- Cache hat einen klar definierten Scope auf Modell und Provider.
- Edge-Case Out-of-Band-Aenderung trifft nur den Modell-Anteil und ist erklaerbar.

**Cons:**
- Zwei Reading-Pfade fuer Snapshot-Komponenten erhoehen die kognitive Last.
- Cache-Invalidation muss zuverlaessig laufen, sonst entsteht Modell-Drift.

## Decision

Wir waehlen Option 3 (Hybrid).

Modell und Provider werden in einem InlineActionSettingsCache abgelegt, der per Event auf Settings-Saves invalidiert wird. Skills und Custom-Prompts werden bei jedem Action-Trigger frisch aus dem Plugin-State gelesen. Die Snapshot-Assembly laeuft in fester Reihenfolge: erst Cache-Lookup fuer Modell und Provider, dann frischer Read der Skills und Prompts, zuletzt Per-Action-Pin-Override.

Der Hybrid passt zu den Latenz-Anforderungen, weil die teure Modell-Resolution nicht wiederholt wird. Er passt zur Konsistenz-Anforderung, weil Skills und Prompts immer frisch sind und das Modell ueber einen klaren Invalidation-Pfad propagiert. Er passt zu FEAT-33-10, weil der Pin als letzte Stufe der Pipeline keinen Cache stoert.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Trigger-Latenz im Snapshot-Pfad bleibt klar unter 50ms, da der teure Modell-Resolve nur bei Settings-Save laeuft.
- Modell-Aenderungen im Main-Chat propagieren ueber den Settings-Save-Hook in den Inline-Cache und werden bei der naechsten Action sichtbar.
- Per-Action-Pin laesst sich als finaler Override-Schritt einhaengen, ohne den Cache-Pfad zu beruehren.
- Die Trennung zwischen gecachten und frischen Anteilen ist klein genug, um in einem Snapshot-Builder kompakt dokumentierbar zu bleiben.

### Negative

- Zwei Lesepfade im Snapshot-Builder erhoehen den Erklaerungsaufwand fuer Code-Reader.
- Der Settings-Save-Hook muss zuverlaessig feuern. Bei Out-of-Band-Aenderungen an der data.json wird der Modell-Anteil des Caches stale, bis der naechste Save oder ein expliziter Reload erfolgt.
- Tests muessen den Cache-Invalidation-Pfad und den Frisch-Read-Pfad getrennt abdecken.

### Risks

- **Hooks-Drift:** Wenn ein neuer Settings-Aenderungsweg eingefuehrt wird, ohne den Invalidation-Hook zu feuern, wird der Cache stale. Mitigation: alle Settings-Aenderungen auf eine zentrale Update-Methode konsolidieren und den Hook dort emittieren.
- **Race-Condition Pin gegen Cache-Update:** Bei gleichzeitigem Pin-Update und Settings-Save kann der Pin-Override gegen einen alten Cache-Wert laufen. Mitigation: Pin-Aufloesung als letzte Stufe der Snapshot-Pipeline, nachdem der Cache geantwortet hat.
- **Out-of-Band Edit der data.json:** Manuelle Aenderung umgeht den Hook und laesst den Modell-Anteil veraltet. Mitigation: explizite Reload-Action in den Settings-Tools dokumentieren und im Plugin-Start als Cache-Rebuild abbilden.

## Implementation Notes

Empfohlene Module:

- `src/core/inline/settings/InlineActionSettingsCache.ts` (NEU): haelt Modell-ID, Provider-Handle und Resolve-Metadaten. Lauscht auf das plugin-interne SettingsSaved-Event und baut den Cache lazily neu beim naechsten Zugriff.
- `src/core/inline/settings/InlineActionSettingsSnapshot.ts` (NEU): Snapshot-Builder. Reihenfolge im Build: `cache.getModelAndProvider()` -> Skills aus `plugin.settings.skills` lesen -> Custom-Prompts aus `plugin.settings.customPrompts` lesen -> Pin-Override aus `plugin.settings.inlineActionPins[actionId]` anwenden.
- `main.ts`: in `plugin.saveSettings()` einen Aufruf an `inlineActionSettingsCache.invalidate()` ergaenzen. Damit ist der zentrale Aenderungs-Pfad gedeckt.

Pin-Schema (FEAT-33-10): `plugin.settings.inlineActionPins: Record<ActionId, ModelId | null>`. Pin-Override ersetzt im Snapshot ausschliesslich Modell und korrespondierenden Provider, niemals Skills oder Prompts.

Test-Punkte:
- Cache liefert nach Settings-Save den neuen Modell-Wert.
- Pin-Override gewinnt gegen Cache-Wert.
- Skills-Aenderung wird ohne Save sichtbar (frischer Read).
- Out-of-Band-Aenderung an data.json bleibt im Cache stale bis zum naechsten Save oder expliziten Reload (dokumentiertes Verhalten).
