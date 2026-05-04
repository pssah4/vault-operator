---
id: ADR-94
title: Cluster-Halbwertszeit-Modell (statische Defaults editierbar)
status: Proposed
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-15-12
  - FEAT-19-16
---

# ADR-94: Cluster-Halbwertszeit-Modell (statische Defaults editierbar)

## Context

Stufe-1-Freshness-Score (FEAT-19-16) braucht pro Cluster eine Halbwertszeit, um Score-Berechnung deterministisch zu machen. Die Frage: liefern wir statische Defaults pro Cluster-Kategorie (Tech 6 Monate, Wissenschaft 12 Monate, Politik 1 Monat), oder bauen wir adaptive Heuristik (System lernt aus User-Update-Verhalten welche Cluster wie schnell altern).

## Decision Drivers

- Implementierungsgeschwindigkeit
- Vorhersagbarkeit fuer User
- Konfigurierbarkeit
- Risiko von Fehl-Lernen (adaptive Heuristik)

## Considered Options

### Option A: Statische Defaults, pro Cluster editierbar

Pros:
- Sofort funktional.
- Vorhersagbar fuer User.
- User kann pro Cluster Default ueberschreiben.

Cons:
- Defaults sind Sebastians Annahme, nicht datenbasiert.
- Wenn Defaults schlecht sind, fuehlt sich der Score willkuerlich an.

### Option B: Adaptive Heuristik (System lernt aus User-Aktivitaet)

Pros:
- Konvergiert zu User-Realitaet.
- Reduziert Pflege.

Cons:
- Cold-Start-Problem (erste Wochen ohne brauchbare Heuristik).
- Implementations-Komplexitaet hoch.
- Risiko Fehl-Lernen wenn User unkonventionell arbeitet.

### Option C: Statisch global, kein per-Cluster-Override

Pros:
- Minimal-Komplexitaet.

Cons:
- Tech und Geschichte werden gleich behandelt, das ist offensichtlich falsch.

## Decision

**Option A**: Statische Defaults pro Cluster-Kategorie (5 Kategorien), pro Cluster ueberschreibbar.

Default-Liste (BA-25 Section 12.1):

| Kategorie | Halbwertszeit |
|-----------|---------------|
| Tech / Software / AI | 180 Tage |
| Wissenschaft / Forschung | 365 Tage |
| Politik / Wirtschaft | 30 Tage |
| Geschichte / Philosophie | 730 Tage |
| Personal / Self / Reflection | 0 (statisch, nie reift) |

Cluster-Kategorie-Erkennung: heuristisch ueber Cluster-Name-Match (lowercase substring search). Fallback: Tech-Default (180 Tage) wenn keine Kategorie passt.

Begruendung:
- Adaptive Heuristik (Option B) ist explizit als FEAT-19-32 deferred (BA-25 R-11 Mitigation).
- User-Override im Settings-UI loest den "willkuerlich"-Pain-Point.
- Kein Cold-Start-Problem, System ist ab Tag 1 produktiv.

## Consequences

### Positive
- Sofort produktiv.
- User behaelt Kontrolle.
- Adaptive Heuristik bleibt offen als spaeterer additiver Schritt.

### Negative
- Defaults sind subjektiv (BA-25 R-11). Mitigation: User-Befragung nach 4 Wochen, Defaults ggf anpassen.
- Cluster-Kategorie-Erkennung ueber Name-Match ist fehleranfaellig (zB Cluster "AI Tools" matcht Tech, "AI Ethics" auch, aber "Personal AI" sollte Personal sein). Mitigation: User-Override pro Cluster.

### Risks
- Wenn die Defaults bei vielen Usern schlecht treffen, faellt das Vertrauen ins Lint-System. Mitigation: Settings-UI macht Override trivial sichtbar.

## Implementation Notes

Schema cluster_metadata: `(cluster TEXT PRIMARY KEY, half_life_days INTEGER NOT NULL, custom_weights TEXT, last_external_check TEXT, hot_cluster INTEGER NOT NULL DEFAULT 0)`.

Default-Liste als const HALF_LIFE_DEFAULTS in einer Konstanten-Datei. Lookup-Helper detectCategory(clusterName) -> half_life_days. Bei UPSERT in cluster_metadata wird half_life_days aus detectCategory() gefuellt wenn nicht uebergeben.
