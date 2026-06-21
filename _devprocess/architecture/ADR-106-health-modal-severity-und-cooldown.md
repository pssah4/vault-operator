---
id: ADR-106
title: Health-Modal-Severity und Activity-Trigger-Cooldown
deciders: Architecture
date: 2026-05-03
related:
  - BA-25
  - FEAT-19-18
  - FEAT-19-19
---

# ADR-106: Health-Modal-Severity-Modell und Activity-Trigger-Cooldown

## Context

Vault-Health-Modal-Erweiterung (FEAT-19-18) muss bei wachsender Findings-Liste skaliert bleiben (BA-25 R-15). Gleichzeitig braucht Activity-Trigger (FEAT-19-19) eine Cooldown-Strategie, damit User nicht von Hints ueberflutet wird. Beide Themen sind UX-Themen, die zusammenhaengen.

## Decision Drivers

- Skalierung des Modals bei vielen Findings
- User-Aufmerksamkeit (kein Notification-Spam)
- Vorhersagbarkeit
- Filter-Faehigkeit

## Considered Options

### Severity-Modell

**A1: Drei Stufen Critical/Warning/Hint**
- Pros: Standard, einfach.
- Cons: Bei 50+ Findings koennte mehr Granularitaet helfen.

**A2: Zahlen-Score 0-100**
- Pros: Granular.
- Cons: User-Verstaendnis schwierig.

### Activity-Trigger-Cooldown

**B1: Pro Cluster max 1 Hint pro Woche**
- Pros: Einfach.
- Cons: Bei aktiven Clustern verpasst User wichtige Updates.

**B2: Pro Cluster Cooldown plus globaler Daily-Cap**
- Pros: Schutz auf zwei Ebenen.
- Cons: Mehr Logik.

## Decision

**Severity: A1 Drei-Stufen-Modell** mit klaren Schwellwerten:

- **Critical**: Score < 30 (sehr veraltet) ODER strukturelle Findings die Vault-Integritaet gefaehrden (broken_links, godNodes mit kaputten Edges).
- **Warning**: Score 30-50 ODER Concentration > 0.7 plus min 5 Notes ODER explizit als Warning markiert.
- **Hint**: Score 50-70 ODER Cluster reif aber nicht kritisch.

Health-Modal sortiert nach Severity (Critical zuerst), innerhalb Severity nach Kategorie. Filter-Toggles pro Kategorie. Bulk-Dismiss pro Severity-Bucket.

**Cooldown: B2 Hybrid**:
- Pro Cluster: max 1 Hint pro 7 Tage (bei Stufe-2-Activity-Trigger).
- Global: max 5 Hints pro Tag (Default, in Settings konfigurierbar).
- Reset: kalender-taeglich um 0:00 lokale Zeit.

Begruendung:
- Drei Severity-Stufen sind etabliert, User-vertraut. Granulare Score-Sicht bleibt im Hover-Tooltip verfuegbar.
- Cluster-Cooldown plus Daily-Cap schuetzt vor zwei Spam-Modi (gleicher Cluster taeglich vs viele Cluster taeglich).
- Settings-Konfigurierbarkeit fuer Power-User die mehr Hints wollen.

## Consequences

### Positive
- Skalierung des Modals durch Severity-Sortierung plus Filter.
- Notification-Spam vermieden.
- Vorhersagbarkeit der Hint-Frequenz.

### Negative
- Wenn ein Cluster 2-3 mal pro Woche relevante Updates hat, sieht User nur einen.
- Daily-Cap kann legitimen Hint blockieren (an Tag mit 6 reifen Clustern).

### Risks
- Defaults sind Sebastians Annahme. Mitigation: nach 4 Wochen User-Befragung anpassen.

## Implementation Notes

Severity-Mapping-Helper:
```
function mapSeverity(finding: HealthFinding): 'critical' | 'warning' | 'hint' {
  if (finding.checkType === 'broken_links') return 'critical'
  if (finding.score !== undefined && finding.score < 30) return 'critical'
  if (finding.checkType === 'source_concentration' && finding.concentrationScore > 0.7) return 'warning'
  if (finding.score !== undefined && finding.score < 50) return 'warning'
  return 'hint'
}
```

Cooldown-Persistenz: pro Cluster `cluster_metadata.last_hint_at`-Spalte (additiv, in v9 -> v10 Migration aufnehmen). Daily-Cap-Counter im Plugin-Memory (zurueckgesetzt nach Mitternacht-Detection oder Plugin-Onload).

Modal-Layout (UI):
- Header: Severity-Tabs (Critical / Warning / Hint) plus Counts.
- Body: gruppiert nach Kategorie innerhalb Severity.
- Pro Finding: Title, Cluster-/Note-Ref, kontext-spezifische Action-Buttons (siehe FEAT-19-18).
- Footer: Bulk-Dismiss-Action plus Settings-Link.

## Amendment 2026-06-19 (IMP-20-06-01)

Das `VaultHealthRepairModal` aus diesem ADR bekommt einen weiteren Tab namens `Knowledge review`, der die Note-Verdicts aus IMP-20-06-01 visualisiert. Der Tab folgt der bestehenden Severity-Konvention dieses ADR; Verdict-Werte aus dem Verifier mappen auf die ADR-106-Severity-Stufen wie folgt:

- `outdated` mappt auf Critical
- `contradicts` mit hoher Confidence mappt auf Critical
- `contradicts` mit niedriger Confidence mappt auf Warning
- `extends` mappt auf Hint
- `matches` wird nicht im Modal angezeigt, sondern nur ueber das `last_checked_at`-Feld dokumentiert.

Cluster-freshness-Findings (Karpathy-Lint, `HealthCheckType = 'cluster_freshness'`) landen ebenfalls im Knowledge-review-Tab und nicht im Findings-Tab; sie rendern als eigene Sub-Sektion oberhalb der per-Note-Verdicts. Begruendung: der User-Mental-Model ist "knowledge that is no longer current"; sowohl Cluster-Score als auch Note-Verdicts beantworten dieselbe Frage.

Severity-Filter und Tab-Logik aus ADR-106 gelten unveraendert; der neue Tab folgt denselben Sortier- und Cooldown-Regeln wie die anderen Tabs.

Zwei neue sub-modale Komponenten gehoeren in die Surface dieses ADR und werden hier mit-verantwortet, nicht in einer neuen UI-ADR ausgelagert:

`ResolveConflictModal` ist ein Single-Note-Aufloesungs-Modal, das aus dem Knowledge-review-Tab geoeffnet wird. Es zeigt einen Diff zwischen aktueller Note und dem vom Verifier vorgeschlagenen `suggestedPatch`, plus die Action-Buttons Apply, Edit, Mark verified, Delete (mit Bestaetigung), Open in chat. Apply geht durch das bestehende `EditFileTool`-Boundary mit Checkpoint; Delete geht durch `FileManager.trashFile` mit explizitem Bestaetigungs-Modal.

`BatchResolveModal` ist ein Bulk-Modal mit Filter (Severity, Confidence-Schwelle), Auswahl mehrerer Notes, sequentiellem Anwenden, Abort waehrend Lauf und Resume nach Fehler. Resume-State persistiert in einer kleinen DB-Tabelle (Schluessel: Run-ID, Index der naechsten Note), damit der Plugin-Reload den Bulk-Run nicht killt.

Mobile-Klausel: beide sub-modalen Komponenten sind read-only auf iOS und Android. Apply, Delete und Bulk-Run sind dort ausgeblendet; die UI zeigt einen `synced from desktop`-Hinweis.

User-Quittierung via Mark verified schreibt einen Eintrag in die existierende `dismissed_freshness`-Tabelle mit `hint_type='verdict'`. Der bestehende Knowledge-review-Tab-Aufruf liest diese Tabelle und unterdrueckt quittierte Notes, bis sich `mtime` der Note aendert.

User-faced Display-Labels (kanonische englische Verdict-Literals bleiben in Code und Storage, das UI mappt sie auf lesbare Phrasen):

- `matches` -> "Matches sources"
- `extends` -> "Could extend"
- `contradicts` -> "Contradicted by sources"
- `outdated` -> "Outdated"
- `no_external_source` -> "No external evidence yet"
