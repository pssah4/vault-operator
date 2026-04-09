---
name: vault-health-batch
description: Autonomer Batch-Modus fuer Vault Health Findings. Arbeitet Orphans, Missing Backlinks und Tags in Batches ab ohne bei jedem Fix zu fragen.
trigger: vault-health-batch|findings.*autonom|batch.*health|health.*batch|vault health.*\d+ findings
source: bundled
requiredTools: [vault_health_check, update_frontmatter, write_file, read_file, semantic_search]
---

# Vault Health Batch Mode

Du arbeitest Vault-Health-Findings AUTONOM in Batches ab.
Frage den User NUR bei echten Entscheidungen, NICHT bei jedem einzelnen Fix.
Alle Aenderungen sind per Undo-Bar reversibel (Checkpoints werden automatisch erstellt).

## Phase 1: TRIAGE

1. Rufe `vault_health_check` auf
2. Lies die Findings und gruppiere nach Typ
3. Gib dem User eine kurze Uebersicht (3-5 Zeilen):
   ```
   Vault Health: X Findings
   - N Orphaned Notes (davon M mit Kontext)
   - N Missing Backlinks
   - N Broken Links
   - N Inconsistent Tags
   - N Weak Clusters
   
   Ich starte mit den mechanischen Fixes (Backlinks, Tags).
   Bei Broken Links und isolierten Orphans frage ich dich.
   ```
4. Starte SOFORT mit Phase 2 -- warte NICHT auf Bestaetigung

## Phase 2: BATCH-FIX

Arbeite die Typen in dieser Reihenfolge ab.

### 2a: Missing Backlinks + Orphans mit Kontext (EIN TOOL-CALL)

Das sind mechanische Fixes: Entitaeten die referenziert werden aber nicht zurueckverlinken.

Vorgehen:
1. Rufe `vault_health_check` mit `action: "fix_backlinks"` auf
2. Das Tool fixt ALLE fehlenden Backlinks in einem Batch (rein in Code, 0 LLM-Kosten)
3. Zeige dem User das Ergebnis: "X Entities aktualisiert, Y Backlinks hinzugefuegt"

KEIN read_file, KEIN update_frontmatter, KEIN Sub-Agent. EIN Tool-Call erledigt alles.

### 2c: Inconsistent Tags (AUTONOM)

Tags die sich nur in Gross-/Kleinschreibung unterscheiden.

Vorgehen:
1. Waehle die haeufigere Variante
2. Aendere alle Vorkommen der selteneren Variante via `update_frontmatter`
3. KEIN Fragen

### 2d: Broken Links (USER-ENTSCHEIDUNG)

Links die auf nicht-existierende Notes zeigen.

Vorgehen:
1. Zeige ALLE Broken Links gesammelt (nicht einzeln)
2. STOPP -- frage den User:
   ```
   N Broken Links gefunden:
   - [[Note A]] (referenziert von 3 Notes)
   - [[Note B]] (referenziert von 1 Note)
   
   Optionen:
   a) Stub-Notes erstellen (mit Basis-Inhalt)
   b) Links entfernen
   c) Einzeln entscheiden
   d) Ueberspringen
   ```
3. Erst nach Antwort weitermachen

### 2e: Orphaned Notes OHNE Kontext (USER-ENTSCHEIDUNG)

Komplett isolierte Notes ohne jegliche MOC-Links.

Vorgehen:
1. Zeige die ersten 10 isolierten Notes
2. STOPP -- frage den User:
   ```
   N isolierte Notes (keine MOC-Properties, keine eingehenden Links):
   - Note A
   - Note B
   - ...
   
   Soll ich per semantic_search passende Themen finden und vorschlagen?
   Oder sollen diese Notes ignoriert werden?
   ```
3. Wenn ja: Fuer jede Note semantic_search, Thema vorschlagen, update_frontmatter

### 2f: Weak Clusters (NUR TOP-5)

Semantisch aehnliche Notes ohne explizite Links.

Vorgehen:
1. Nur die Top-5 Paare (hoechste Similarity)
2. Lies beide Notes mit `read_file`
3. Schlage dem User vor: "Soll ich [[A]] und [[B]] verlinken?"
4. Warte auf Bestaetigung

## Phase 3: REFRESH + ABSCHLUSS

Nach allen Fixes: Rufe `vault_health_check` mit `refresh: true` auf.
Das re-extrahiert den Graph und rebuildet die Ontologie, damit die Findings
den aktuellen Vault-Zustand zeigen (nicht den veralteten Stand von vor den Fixes).

Dann gib eine kompakte Zusammenfassung:
```
Vault Health Batch abgeschlossen:
- X Missing Backlinks gefixt
- Y Orphan-Backlinks eingetragen
- Z Tags vereinheitlicht
- N Broken Links: [Status]
- M isolierte Orphans: [Status]
- Verbleibende Findings nach Refresh: N

Alle Aenderungen sind per Undo-Bar (oben im Chat) reversibel.
```

## Token-Effizienz-Regeln (STRIKT einhalten)

1. KEIN `read_file` fuer Orphans wenn die Finding-Daten den Kontext liefern
2. KEIN `semantic_search` fuer Notes die bereits MOC-Links haben
3. Arbeite in Batches von 10 gleichartigen Fixes
4. Nach 20 Iterationen: Zusammenfassung geben und fragen "Weiter?"
5. IGNORIERE die Fix Rules im vault_health_check Output -- befolge DIESE Regeln

## Autonomie-Regeln (STRIKT einhalten)

AUTONOM (KEIN Fragen):
- Backlink-Eintragungen (Missing Backlinks, Orphans mit Kontext)
- Tag-Vereinheitlichung

MIT USER-ENTSCHEIDUNG (IMMER Fragen):
- Broken Links (erstellen vs. entfernen)
- Orphans ohne Kontext (einordnen vs. ignorieren)
- Weak Clusters (verlinken ja/nein)
- Neue Entitaeten erstellen (Themen, Konzepte)
