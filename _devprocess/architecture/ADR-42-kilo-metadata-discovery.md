# ADR-42: Kilo Metadata Discovery Strategy

**Date:** 2026-03-18
**Deciders:** Sebastian Hanke

## Context

Kilo Gateway stellt Modelle, Provider und zum Teil organisationsabhaengige Defaults ueber eigene Endpunkte bereit. Fuer Obsilo bedeutet das: Modellwahl und Organisationskontext koennen nicht ausschliesslich statisch aus Konstanten kommen. Gleichzeitig darf ein Fehler beim Laden dieser Metadaten den Nutzer nicht komplett blockieren.

**Triggering ASR:**
- Moderate ASR-04: Runtime-Loaded Model and Organization Metadata
- Quality Attributes: UX, Maintainability, Availability

**Problem:** Wie werden Modell- und Organisationsmetadaten zur Laufzeit geladen, zwischengespeichert und bei Fehlern abgefedert, ohne die bestehende Settings-UX zu zerreissen?

## Decision Drivers

- **Aktualitaet:** Neue Modelle sollen ohne Plugin-Update sichtbar werden
- **Resilienz:** Fehlende Metadaten duerfen die Grundnutzung nicht blockieren
- **Performance:** Wiederholte Oeffnungen des Modals sollen nicht jedes Mal volle Netzwerklast erzeugen
- **Kontextsensitivitaet:** Organisation und Auth-Status beeinflussen verfuegbare Defaults und potenziell die Nutzbarkeit einzelner Modelle
- **Einfachheit:** UI braucht ein klares Datenmodell fuer loading, success, stale und error

## Considered Options

### Option 1: Statische Modelllisten mit optionalem spaeterem Refresh
- Provider bringt feste Vorschlagslisten mit und ignoriert Gateway-Metadaten weitgehend
- Pro: Sehr einfach
- Pro: Keine Laufzeitabhaengigkeit im Settings-Dialog
- Con: Neue Modelle erscheinen nicht automatisch
- Con: Verfehlt den dokumentierten Kilo-Mehrwert
- Con: `kilo/auto`, Free Models und Provider-Gruppierung werden schnell inkonsistent

### Option 2: Metadata-Service mit Session-Cache und Fallback auf manuelle Eingabe
- Eigener Service oder Service-Erweiterung laedt Modelle und ggf. Organisationen asynchron
- Cache pro Session oder bis expliziter Refresh/Disconnect
- UI kann bei Fehlern weiterlaufen und manuelle Model-ID erlauben
- Pro: Aktuelle Daten ohne dauernde Live-Abfragen
- Pro: Gute UX fuer Success und Failure Cases
- Pro: Lässt sich spaeter auf weitere Gateway-Metadaten ausdehnen
- Con: Braucht Cache-Invalidierung und Statusmodell
- Con: Zusätzliche Service-Komplexitaet

### Option 3: Immer Live-Fetch ohne Cache
- Jedes Oeffnen des Modals laedt Modelle und Organisationen neu
- Pro: Immer aktuell
- Pro: Kein Cache-Invalidierungsproblem
- Con: Schlechtere Responsiveness und hoehere Fehlersensitivitaet
- Con: Unnoetige Last und wiederholte Spinner im UI

## Decision

**Vorgeschlagene Option:** Option 2 - Metadata-Service mit Session-Cache und Fallback auf manuelle Eingabe

**Begruendung:**
Kilo-Modell-Discovery ist ein Kernbestandteil des Produkts, darf aber nicht zum Single Point of Failure werden. Ein dedizierter Metadatenpfad mit Session-Cache liefert die notwendige Aktualitaet bei guter UX. Fehler koennen abgefedert werden, indem die UI den letzten erfolgreichen Stand zeigt oder auf manuelle Model-ID-Eingabe und spaeteres Retry zurueckfaellt.

**Vorgeschlagene Quellen:**
- Modelle: `GET /api/gateway/models`
- Optional gruppiert: `GET /api/gateway/models-by-provider`
- Defaults: `GET /api/defaults` oder org-spezifische Defaults
- Organisationen: Profil- oder Default-Endpunkte nach erfolgreicher Auth

## Consequences

### Positive
- Modelllisten bleiben aktuell ohne Plugin-Release
- UI bleibt auch bei temporären Gateway-Fehlern benutzbar
- Provider- und Organisationsmetadaten haben einen klaren fachlichen Ort
- Caching reduziert Netzwerklast und Spinner-Frequenz

### Negative
- Cache-Zustand muss explizit invalidiert werden
- Mehr Zustandsvarianten in der UI: loading, loaded, stale, error

### Risks
- **Stale Metadata:** Alte Modelllisten koennten kurzzeitig sichtbar bleiben. Mitigation: expliziter Refresh und Reset bei Disconnect oder Org-Wechsel.
- **Org-abhängige Unterschiede:** Modelle oder Defaults koennten sich je Tenant unterscheiden. Mitigation: Cache-Key inkludiert Organization ID und Auth-Zustand.

## Implementation Notes

- Metadata-Service darf keine Secrets speichern
- Cache-Key mindestens aus provider, authState und organizationId bilden
- Fehlerfallebene: letzte erfolgreiche Modellliste oder manuelle Eingabe
- UI kennzeichnet stale/error klar, blockiert aber nicht die manuelle Konfiguration
- `kilo/auto` immer als gueltige Auswahl fuehren, auch wenn Modelle-Endpoint temporaer ausfaellt

## Related Decisions

- ADR-40: Kilo Provider Architecture
- ADR-41: Kilo Auth and Session Architecture
- ADR-43: Kilo Embedding Gating Strategy

## References

- FEAT-13-04: Kilo Dynamic Model Listing
- FEAT-13-05: Kilo Organization Context
- Kilo Gateway docs: models, providers, models-by-provider
