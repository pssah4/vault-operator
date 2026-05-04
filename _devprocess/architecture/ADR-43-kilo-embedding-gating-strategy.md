# ADR-43: Kilo Embedding Gating Strategy

**Date:** 2026-03-18
**Deciders:** Sebastian Hanke

## Context

Die Produktanforderung fuer Kilo umfasst auch Embedding-Support, damit Nutzer ihren Gateway-Zugang fuer Semantic Search wiederverwenden koennen. Anders als beim Chat-Pfad ist die konkrete Gateway-Kompatibilitaet fuer Embeddings jedoch noch nicht abschliessend validiert. Die Architektur muss deshalb sowohl einen sauberen Reuse-Pfad vorsehen als auch eine risikoarme Deaktivierung ermoeglichen.

**Triggering ASR:**
- Moderate ASR-05: Embedding Support Must Be Technically Verified Before Commitment
- Quality Attributes: Reliability, Maintainability, Delivery Safety

**Problem:** Soll Embedding-Support sofort vollwertig architectural committed werden, ganz verschoben werden oder als kontrolliert aktivierbarer Pfad in die Architektur aufgenommen werden?

## Decision Drivers

- **Produkttreue:** Der Nutzerwunsch nach demselben Zugang fuer Chat und Embeddings ist legitim
- **Unsicherheit:** Der konkrete Embedding-Endpoint und die Modellfaehigkeiten sind noch nicht hinreichend bestaetigt
- **Wiederverwendung:** Der bestehende SemanticIndexService fuer API-basierte Embeddings soll nach Moeglichkeit weitergenutzt werden
- **Release-Sicherheit:** Unklare Embedding-Semantik darf den restlichen Kilo-Launch nicht blockieren

## Considered Options

### Option 1: Embeddings fest fuer MVP zusagen und voll integrieren
- Architektur geht von vollstaendiger OpenAI-Kompatibilitaet fuer Embeddings aus
- Pro: Maximale Produktvollstaendigkeit
- Pro: Keine spaetere Feature-Grenze notwendig
- Con: Hohe Gefahr falscher Architekturannahmen
- Con: Chat-Launch koennte durch Embedding-Probleme verzoegert werden

### Option 2: Embedding-Pfad architektonisch vorbereiten, aber per Capability Check oder Feature Gate absichern
- Wiederverwendung des bestehenden Embedding-Pfads wird vorgesehen
- Aktivierung erfolgt erst nach technischem Spike oder Runtime-Capability-Validierung
- Pro: Hohes Mass an Sicherheit bei gleichzeitig klarer Zielarchitektur
- Pro: Chat- und Provider-Integration bleiben unabhaengig auslieferbar
- Pro: Gute Balance zwischen Produktziel und technischer Ehrlichkeit
- Con: Zusätzliche Feature-Gate-Logik oder Capability-Pruefung
- Con: UI muss ggf. nicht verfuegbare Embeddings klar kennzeichnen

### Option 3: Embedding-Support komplett auf nach MVP verschieben
- Architektur behandelt Kilo nur als Chat-Provider
- Pro: Einfachste und sicherste Umsetzung
- Pro: Kein Risiko fuer SemanticIndexService im ersten Schritt
- Con: Verfehlt die dokumentierten Anforderungen
- Con: Nutzer muessen trotzdem einen zweiten Provider fuer Embeddings pflegen

## Decision

**Vorgeschlagene Option:** Option 2 - Architektonisch vorbereiten, aber per Capability Check oder Feature Gate absichern

**Begruendung:**
Der Embedding-Pfad soll dieselbe Auth- und Session-Infrastruktur wiederverwenden wie Chat. Gleichzeitig ist technisch noch offen, ob Kilo Gateway denselben OpenAI-kompatiblen Embedding-Contract in der fuer Obsilo benoetigten Form stabil erfuellt. Deshalb wird Embedding-Support in der Architektur explizit vorgesehen, aber nur nach verifizierter Kompatibilitaet aktiviert. So bleibt die Zielarchitektur konsistent, ohne das Chat-MVP an eine unbestaetigte Annahme zu koppeln.

## Consequences

### Positive
- Keine Blockade des Chat-MVP durch Embedding-Unklarheiten
- SemanticIndexService kann spaeter mit minimalen Architekturbruechen erweitert werden
- Nutzeranforderung bleibt in der Architektur sichtbar und nicht stillschweigend gestrichen

### Negative
- Zusätzliche Aktivierungs- oder Verifikationslogik notwendig
- UI muss vermitteln, dass Embeddings je nach Validierungsstand verfuegbar oder noch deaktiviert sein koennen

### Risks
- **Dauerhaftes Gate:** Embeddings bleiben eventuell laenger deaktiviert als geplant. Mitigation: fruehen technischen Spike priorisieren und Ergebnis dokumentieren.
- **Capability Drift:** Modelle mit Chat-Support koennten keine Embeddings unterstuetzen. Mitigation: Modell- oder Provider-Capabilities explizit aus Metadaten ableiten, nicht implizit annehmen.

## Implementation Notes

- SemanticIndexService bleibt der einzige Embedding-Orchestrator
- Kilo teilt Auth-Service und Token-Zugriff mit dem Chat-Pfad
- Aktivierung erst nach dokumentierter Endpoint-Validierung oder erfolgreichem Probe-Request
- Embeddings-UI zeigt Kilo nur als aktiv waehlbar, wenn die Capability freigegeben ist

## Related Decisions

- ADR-03: Vectra Semantic Index
- ADR-40: Kilo Provider Architecture
- ADR-41: Kilo Auth and Session Architecture
- ADR-42: Kilo Metadata Discovery Strategy

## References

- FEAT-13-06: Kilo Embedding Support
- BA-08: Kilo Gateway Provider Integration
- Architect Handoff: Kilo Gateway Provider
