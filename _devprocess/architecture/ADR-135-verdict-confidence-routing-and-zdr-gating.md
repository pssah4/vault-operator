---
id: ADR-135
title: Verdict-Confidence-Routing und ZDR-Pflicht fuer Note-Verifier
date: 2026-06-19
deciders: [Sebastian, Architekt-Agent]
asr-refs: []
feature-refs: [FEAT-20-06]
imp-refs: [IMP-20-06-01]
related-adrs: [ADR-94, ADR-98, ADR-104, ADR-105, ADR-106]
supersedes: null
superseded-by: null
---

# ADR-135: Verdict-Confidence-Routing und ZDR-Pflicht fuer Note-Verifier

## Context

Die Note-Verifier-Pipeline aus IMP-20-06-01 erzeugt pro Kandidat-Note ein Verdict, eine Confidence und eine Begruendung. Die Frage "wer prueft das" hat zwei Achsen, die hier zusammen entschieden werden, weil sie sich gegenseitig bedingen.

Die erste Achse betrifft die Modell-Wahl. Ein billiges Mid-Tier-Modell schafft die meisten Faelle gut: einfache Fakten, gut formulierte Quellen, klare temporale Marker. Ein Frontier-Modell ist genauer bei mehrdeutigen oder strittigen Faellen, kostet aber pro Aufruf zehn bis dreissig Mal mehr. Eine Strategie, die immer Frontier laeuft, ist unbezahlbar bei den Token-Mengen der Stufe-3-Pipeline. Eine Strategie, die nie Frontier laeuft, liefert bei den schwierigen Faellen schlechtere Verdicts, gerade dort wo der User die Verlaesslichkeit am meisten braucht.

Die zweite Achse betrifft Privacy. Die Verifier-Pipeline schickt Note-Inhalte und Kontextfragmente an einen Modell-Provider. Bei einem allgemein-Tier-Modell ist das ein Trade-off, den der User schon bei der Plugin-Einrichtung eingegangen ist. Bei einer Eskalation zu Frontier eskaliert auch der Datentyp: das Frontier-Modell sieht nicht nur die Note, sondern auch die externen Quellen und die Begruendung des Mid-Tier-Modells. Genau die Notes, bei denen Frontier eskaliert wird, sind die mit `contradicts` oder `outdated` Verdicts, also die mit hoher Wahrscheinlichkeit sensible Inhalte (medizinische Notizen, juristische Notizen, persoenliche Praeferenzen). Ein Provider-Breach oder eine richterliche Anordnung erschliesst dem Angreifer einen kuratierten Index "Saetze, bei denen der User privat anderer Meinung ist als die externe Welt".

Beide Achsen brauchen daher eine gemeinsame Entscheidung. Confidence allein reicht nicht, Privacy allein reicht nicht. Triggering ASR aus IMP-20-06-01 HANDOFFS-Block: Item 5 (Frontier-Eskalation mit ZDR-Pflicht, fail-closed).

## Decision drivers

- **Modellkosten**: Mid-Tier-Calls bei 5000 Input + 500 Output Token kosten ungefaehr ein Dreissigstel eines Frontier-Calls.
- **Verdict-Qualitaet**: Frontier reduziert False-Positives und False-Negatives bei mehrdeutigen Quellen signifikant.
- **Privacy-Surface**: jeder eskalierte Call vergroessert die Datenmenge, die an einen Provider gelangt, und korreliert mit Sensibilitaet des Inhalts.
- **Transparenz fuer User**: User muss wissen, welches Modell sein Verdict produziert hat, sonst kann er der UI nicht trauen.
- **Fail-closed-Semantik**: wenn ein ZDR-Endpoint nicht gesetzt werden kann, darf die Eskalation nicht heimlich auf Standard-Endpoint zurueckfallen.
- **Konsistenz mit der bestehenden Confidence-Konvention**: `edges.confidence` aus FEAT-20-01 ist REAL im Bereich 0.0 bis 1.0. Die Verdict-Confidence folgt derselben Skala.

## Considered options

### Option 1: Immer Frontier (keine Eskalations-Logik)

Pro Note ein Frontier-Call.

- **Pro**: maximale Verdict-Qualitaet, einfacher Code, keine Heuristik-Fehler.
- **Con**: Token-Kosten sprengen das Stufe-3-Budget um Faktor dreissig. Privacy-Surface ist standardmaessig maximal. Nicht durchsetzbar als Default-Pfad.

### Option 2: Immer Mid-Tier (keine Eskalation)

Pro Note ein Mid-Tier-Call. Kein Frontier, egal wie unsicher die Antwort.

- **Pro**: billig, schnell, Privacy-Surface ist niedrig und konstant. Keine Provider-Capability-Pruefung noetig.
- **Con**: bei mehrdeutigen Quellen liefert Mid-Tier oft `contradicts` mit niedriger Confidence, ohne dass die UI das verbessern kann. User-Trust leidet, weil das System "ich bin mir nicht sicher" zu oft sagt.

### Option 3: Confidence-basierte Eskalation, ZDR optional

Mid-Tier-Call zuerst. Bei `confidence < 0.7` UND `verdict in {contradicts, outdated}` Frontier nachschalten. ZDR wird angefragt, wenn der Provider es unterstuetzt, ist aber nicht harte Voraussetzung.

- **Pro**: spart Kosten in den einfachen Faellen, holt Qualitaet zurueck wo es wirklich noetig ist.
- **Con**: Privacy-Versprechen ist schwammig. Provider ohne ZDR liefern trotzdem Verdict, User weiss nicht woran er ist. Genau die sensiblen Notes wandern stillschweigend in den nicht-ZDR-Pfad.

### Option 4: Confidence-basierte Eskalation mit fail-closed ZDR-Pflicht (gewaehlt)

Mid-Tier-Call zuerst. Frontier nur wenn `confidence < 0.7` UND `verdict in {contradicts, outdated}` UND der konfigurierte Frontier-Provider eine garantierte Zero-Data-Retention-Konfiguration anbietet, die der Plugin-Code erkennen und aktiv setzen kann. Wenn ZDR nicht setzbar: kein Frontier-Call. Stattdessen bleibt das Mid-Tier-Verdict bestehen, der Verdict-Eintrag traegt `verifier_tier: mid` und `confidence_low: true`. Die UI macht das sichtbar mit einem "Mid-tier verdict, low confidence" Hinweis.

- **Pro**: harte Privacy-Garantie ohne stille Downgrade-Pfade. Token-Kosten bleiben kalkulierbar. User sieht in der UI welches Modell ein Verdict produziert hat. Default-Setting ist konservativ.
- **Con**: User mit Provider ohne ZDR (heute z.B. lokale Inferenz ohne explizites no-logging-Flag) sehen einen permanent "low confidence" Bucket. Mitigation: explizite Einstellung pro Provider, ob no-logging als ausreichende Garantie zaehlt; Default-Liste erlaubt Anthropic ZDR, Bedrock no-logging, OpenAI no-training.

## Decision

Option 4. Eskalation folgt drei Bedingungen mit AND-Verknuepfung: Confidence-Schwelle, Severity-Filter, ZDR-Verfuegbarkeit. Default-Schwelle ist 0.7. Default-Schwelle und Default-Severity-Liste sind in Settings konfigurierbar; ZDR-Pflicht ist NICHT konfigurierbar und ist Plugin-Konvention.

Die Verifier-Pipeline schreibt pro Verdict eine `verifier_tier` Spalte mit `mid` oder `frontier`. Die UI mappt diese Spalte auf ein visuelles Tier-Label im Knowledge-review-Tab. Bei `verifier_tier: mid` mit niedriger Confidence zeigt die UI einen kleinen "Mid-tier" Marker und einen "Re-check with Frontier" Button, der aber ausgeblendet ist solange `freshness.allowFrontierEscalation` aus ist oder das Provider-Capability-Schema kein ZDR meldet.

Die Confidence-Skala ist 0.0 bis 1.0 REAL, konsistent mit `edges.confidence` aus FEAT-20-01.

Default-Settings:

- `freshness.allowFrontierEscalation`: false
- `freshness.frontierConfidenceThreshold`: 0.7
- `freshness.frontierSeverityFilter`: ["contradicts", "outdated"]

ZDR-Capability-Schema: jeder Provider exponiert eine Funktion, die `true` liefert, wenn der konkret konfigurierte Endpoint und API-Key garantiert no-training und no-logging im Sinne der Plugin-Konvention erfuellt. Diese Funktion ist die einzige Stelle, an der die Eskalation einen Frontier-Call freigibt. Sie verweigert by default; positive Antwort verlangt explizite Konfiguration durch User oder Anbieter.

## Consequences

### Positive

- Token-Budget aus ADR-105 bleibt einhaltbar; nur ein kleiner Anteil der Notes geht durch Frontier.
- Sensible Notes bekommen entweder Frontier-Qualitaet UNTER ZDR oder bleiben bei Mid-Tier-Verdict ohne stille Eskalation.
- UI macht Modell-Herkunft eines Verdicts sichtbar, was den User-Trust erhoeht.
- Confidence-Konvention ist projektweit einheitlich (FEAT-20-01).

### Negative

- User mit Provider ohne ZDR sehen nie Frontier-Verdicts; ihr "low confidence" Bucket bleibt voll. Mitigation: Settings-Tooltip dokumentiert das und verlinkt auf die Provider-Konfigurations-Doku.
- Provider-Capability-Schema muss pro Provider gepflegt werden. Mitigation: Default-Liste mit den drei wichtigsten Providern, Erweiterung als reine Settings-Eintraege ohne Code-Aenderung.

### Risks

- Provider aendert seine ZDR-Garantie still in der Praxis. Mitigation: Plugin-Update kann die Capability-Default-Liste anpassen. Im aktuellen Stand vertrauen wir der dokumentierten Provider-Konfiguration.
- User setzt eine konkrete Schwelle so niedrig, dass praktisch jeder Call eskaliert. Mitigation: Settings-Validierung erlaubt nur Werte zwischen 0.5 und 0.95.

## Implementation Notes

Die Confidence-Schwelle und der Severity-Filter sind in `FreshnessVerifier` zentralisiert. Provider-Capability-Schema wird im bestehenden Provider-Klassen-Layer extends, ohne neue Klassenhierarchie. Verdict-Persistenz erweitert die ALTER-TABLE-Migration aus IMP-20-06-01 (`note_freshness.last_verifier_tier`).

Knowledge-review-Tab-UI rendert das Mid-tier-Verdict mit einem dezenten Marker; Frontier-Verdicts haben kein zusaetzliches Label, weil sie der Default-erwartete Fall sind, wenn Eskalation aktiv ist.
