# Feature: Konfigurierbarer Auto-Trigger via Frontmatter-Property

> **Feature ID**: FEAT-19-27
> **Epic**: EPIC-19 - Knowledge Maintenance
> **Source**: BA-25 Section 11.1
> **Priority**: P0
> **Effort Estimate**: S

## Feature Description

User definiert in Settings einen Property-Namen plus Wert, der den Auto-Trigger fuer Ingest-Triage ausloest. Bei Sebastian: `Kategorie: Quelle`. Andere User waehlen frei. VaultObserver registriert auf vault.on('create') und vault.on('modify'). Wenn Note die konfigurierte Property mit dem konfigurierten Wert traegt UND noch nicht triaged wurde, startet Auto-Triage still im Hintergrund.

Default OFF (kein System-Default fuer Property-Name). Explizit Settings-Konfiguration erforderlich.

## Benefits Hypothesis

Wir glauben, dass konfigurierbarer Auto-Trigger > 95% korrekt feuert (BA-25 H-20). Folgende messbare Outcomes liefert: Sebastian's Webclipper-Workflow fliesst nahtlos in Triage ein, ohne dass er manuell triggern muss; andere User adaptieren das Pattern an ihre Vault-Konventionen.

Wir wissen, dass wir erfolgreich sind, wenn nach 4 Wochen Sebastian alle Webclipper-Sources auto-triaged sind.

## User Stories

**Story 1:** Als Sebastian moechte ich, dass alle neuen Notes mit `Kategorie: Quelle` automatisch triaged werden, weil das mein Webclipper-Schema ist.

**Story 2:** Als anderer User moechte ich frei waehlen welche Property-Wert-Kombination meinen Trigger ausloest.

**Story 3:** Als User moechte ich Auto-Trigger jederzeit deaktivieren oder umkonfigurieren koennen.

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Settings-Konfiguration fuer Property-Name plus Wert | UI-Pflicht | Manueller Test |
| SC-02 | Auto-Trigger feuert bei Match | > 95% Precision | Integration-Test |
| SC-03 | Auto-Trigger feuert NICHT bei Mismatch | 100% (kein false-positive) | Unit-Test |
| SC-04 | Bereits triaged Notes werden nicht erneut triggered | Tracking-Mechanismus | Unit-Test |
| SC-05 | Multi-Wert-Listen werden unterstuetzt | Optional | Unit-Test |

## Technical NFRs

- **Performance:** Trigger-Detection bei Vault-Event < 5ms (Property-Lookup).
- **Failure-Mode:** Wenn Triage scheitert, Notification, kein Block.
- **Cooldown:** kein Re-Trigger fuer dieselbe Note innerhalb 1 Stunde.

## Architecturally Significant Requirements (ASRs)

- **ASR-1 (Moderate):** Trigger-Detection-Mechanik (vault.on-Listener vs Polling vs Hybrid). ADR-Bedarf.

## Definition of Done

- Settings-Schema (Property-Name, Wert, Notification-Toggle).
- VaultObserver-Listener-Implementation.
- Tracking-Mechanik gegen Doppel-Trigger (zB triaged_at-Property oder DB-Tabelle).
- Settings-UI mit Beispiel-Hint.
- Live-Test mit Sebastians "Kategorie: Quelle"-Schema.
