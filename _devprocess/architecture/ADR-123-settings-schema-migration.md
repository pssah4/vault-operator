---
id: ADR-123
title: Settings-Schema-Migration und Recovery-Pfad
date: 2026-05-15
deciders: Sebastian + Architekt-Agent
related-features: FEAT-26-04
related-adrs: ADR-122 (Provider-only Settings-Schema), ADR-121 (Tier-Klassifikator)
related-imps: []
---

# ADR-123: Settings-Schema-Migration und Recovery-Pfad

## Status

Proposed (Architecture-Pass 2026-05-15, EPIC-26 Welle 2).
Triggernde ASR: EPIC-26 / FEAT-26-04; BA-27 Sektion 8 Risk R-3.

## Kontext

ADR-122 entscheidet, dass `activeModels[]` durch ein neues `providers[]`-Schema ersetzt wird. Bestehende User haben kuratierte Setups mit mehreren Modellen pro Provider, OAuth-Tokens, Bedrock-Credentials und ggf. Custom-Endpoints. Die Migration darf diese Setups nicht verlieren und muss bei Fehlern reversibel sein. Plus: der User muss verstehen, was passiert ist, und wenn nötig korrigieren können.

Migration ist ein einmaliges Event pro User beim ersten Plugin-Start nach dem EPIC-26-Upgrade. Sie läuft zwischen "Plugin lädt" und "User kann produktiv arbeiten". Idempotenz ist wichtig (mehrfaches Auslösen darf nichts ändern), Atomicity ist wichtig (Fehler in einem Schritt darf nicht zu inkonsistentem State führen), Sichtbarkeit ist wichtig (User wird informiert, nicht überrumpelt).

## Decision Drivers

- Bestehende User-Setups dürfen nicht silent zerstört werden (R-3 aus BA-27, ASR-CRIT-01 aus FEAT-26-04)
- OAuth-Tokens (Copilot, ChatGPT-OAuth) und Bedrock-Credentials werden unverändert übertragen (kein Re-Auth)
- Migration läuft asynchron, blockiert nicht das Plugin-Init
- User sieht eine klare Information was migriert wurde, kann ungewöhnliche Setups erkennen
- Recovery-Pfad besteht (Restore-Action auf Settings-Ebene oder data.json-Edit)
- Idempotenz: wiederholtes Auslösen ändert nichts an einem bereits migrierten State
- Schema-Versionierung erlaubt zukünftige Migrationen

## Considered Options

### Option 1: Silent Auto-Migration ohne UI-Feedback

Plugin migriert beim ersten Start nach Upgrade still im Hintergrund, zeigt keinen Notification. User merkt es nur an der neuen Settings-UI.

- **Pro:** keine Friction für User, kein blockierendes Modal
- **Con:** User weiss nicht warum die UI plötzlich anders aussieht. Bei Anomalien (Multi-Auth, fehlendes flagship) keine Möglichkeit zur Korrektur. Vertrauensverlust wenn etwas schiefgeht.

### Option 2: Migration-Wizard mit Step-by-Step-Bestätigung

Plugin zeigt beim ersten Start nach Upgrade einen mehrstufigen Wizard: Provider 1 von N, Tier-Mapping bestätigen, weiter zu Provider 2. User klickt durch.

- **Pro:** maximale Transparenz, kein Setup-Detail bleibt verborgen
- **Con:** hohe Friction. User der nur kurz checken wollte, muss durch mehrere Klicks. Bei einfachen Setups (ein Provider, drei Modelle) ist der Wizard Overhead.

### Option 3: Auto-Migration mit Single-Modal-Notification

Plugin migriert beim ersten Start nach Upgrade asynchron im Hintergrund. Nach erfolgreicher Migration erscheint ein Notification-Modal mit der Zusammenfassung (N Provider, M Modelle, Anomalien-Liste falls vorhanden) und zwei Aktionen: "Settings öffnen" und "OK". Backup wird unter `legacy_active_models_backup` mit Timestamp für 30 Tage gehalten.

- **Pro:** Balance zwischen Transparenz und niedrigem Aufwand. User weiss was passiert ist, kann bei Bedarf in Settings prüfen, kann ignorieren wenn alles OK. Anomalien werden im Modal markiert. Recovery via Backup-Restore möglich.
- **Con:** Backup-Cleanup nach 30 Tagen muss gepflegt werden. Modal-Inhalt muss klar genug sein, dass User die Anomalien-Liste versteht.

## Entscheidung

**Option 3.** Auto-Migration mit Single-Modal-Notification und 30-Tage-Backup.

Konkrete Mechanik:

**Migrations-Algorithmus (idempotent):**

1. Plugin liest `settings.schemaVersion`. Wenn `>= 2026.5.15` (Migration bereits gelaufen), exit.
2. Plugin liest die bestehende `activeModels: CustomModel[]`-Liste. Wenn leer, setzt nur `schemaVersion` und exit (Fresh-Install-Pfad).
3. Plugin gruppiert die Liste nach `provider`-Type. Jeder Type wird ein `ProviderConfig`-Eintrag.
4. Pro Gruppe:
   - Wenn mehrere Einträge mit unterschiedlichen Auth-Daten existieren: das erste enabled-Modell stellt die Auth. Weitere Auths werden im `anomalies`-Feld des Modals gemeldet.
   - Auth-Daten (`apiKey`, `awsRegion`, `awsAuthMode`, `awsCredentials`, OAuth-Token-References) werden 1:1 übernommen
   - `baseUrl` wird übernommen wenn vorhanden
5. Plugin ruft den Tier-Klassifikator (ADR-121) für jeden Provider mit den vorhandenen Modell-IDs auf. Tier-Mapping wird in `tierMapping` geschrieben. Manuelle Overrides werden initial leer gelassen (User kann später überschreiben).
6. Plugin setzt `activeProviderId` auf den Provider, der zum heutigen `activeModelKey` gehört (Lookup via `getModelKey()`-Logik).
7. Plugin kopiert die Original-`activeModels[]` in `legacy_active_models_backup` mit `migratedAt: Date.now()` und `originalCount: N`.
8. Plugin setzt `settings.schemaVersion = '2026.5.15'`.
9. Plugin sammelt Anomalien (siehe unten) und triggert das Notification-Modal.

**Anomalien (im Modal angezeigt):**

- Multi-Auth pro Provider: "{provider} hat {N} verschiedene Auth-Keys, der erste enabled wurde übernommen. Andere Auths sind im Backup."
- Provider ohne flagship-Modell: "{provider} hat kein als flagship klassifiziertes Modell. Eskalations-Pattern ist für diesen Provider deaktiviert."
- Custom-Endpoints ohne Tier-Mapping: "{N} lokale Modelle wurden gelistet, aber das Tier-Mapping muss manuell gesetzt werden."
- Unbekannter Provider-Type: "Modell {id} hat Provider-Type {x}, der nicht unterstützt wird. Bleibt im Backup."
- Klassifikations-Outlier: "Modell {id} wurde nur per Fallback klassifiziert. Bitte prüfen."

**Modal-Aktionen:**

- "Settings öffnen": navigiert direkt zum neuen Providers-Tab, scrollt zur ersten Anomalie
- "OK": Modal schliesst, Plugin ist normal nutzbar

**Recovery-Pfad:**

- Versteckte Setting `_restoreLegacy` (oder Action im Settings-Reset-Menü) löst Restore aus
- Restore liest `legacy_active_models_backup` zurück in `activeModels[]`, setzt `schemaVersion` zurück auf den Pre-Migration-Wert
- Plugin-Restart führt zu erneutem Migrations-Versuch (idempotent, daher kein Risiko)

**Backup-Retention:**

- `legacy_active_models_backup.migratedAt` wird beim Plugin-Start geprüft
- Wenn älter als 30 Tage: ein dezenter Settings-Banner "Migration-Backup ist 30 Tage alt, jetzt löschen?" mit Button-Aktion
- Automatisches Löschen nach 90 Tagen (Hard-Cleanup)

**Idempotenz-Garantie:**

- Migration prüft `schemaVersion` als erstes. Bei `>= 2026.5.15` läuft sie nicht erneut.
- Bei Restore-Aktion wird `schemaVersion` zurückgesetzt, Migration läuft beim nächsten Start erneut.

## Konsequenzen

### Positiv

- Migration ist sichtbar aber nicht blockierend
- Anomalien sind explizit gemeldet, User kann gezielt korrigieren
- Recovery-Pfad ist klar definiert
- Idempotenz schützt vor versehentlichem Doppel-Migrieren
- Schema-Versionierung erlaubt zukünftige Migrationen ohne Konflikt
- Backup-Retention macht Recovery zeitlich begrenzt aber lange genug für späte Bug-Reports

### Negativ

- Notification-Modal beim ersten Start nach Upgrade ist eine Unterbrechung (auch wenn nur 1 OK-Click)
- Backup-Daten bleiben 30-90 Tage auf der Disk
- Multi-Auth-pro-Provider-Setups werden zu Single-Auth verflacht (Konsequenz von Single-Active-Provider-Disziplin aus ADR-122)
- Pre-Migration-Setups mit exotischen Konstellationen können schlecht klassifiziert werden, User muss korrigieren

### Risiken

- Migration läuft bei sehr grossen `activeModels[]`-Listen (z.B. 50 Modelle) langsam, blockiert das Plugin-Init. Mitigation: Migration läuft asynchron in einem Background-Job, Plugin-Init wartet nicht.
- Bei Plugin-Crash während Migration ist der Zustand inkonsistent. Mitigation: Transaktion via temporäres File und atomic-Rename (analog `KnowledgeDB`-Pattern). Wenn der Rename fehlt, ist die Migration nicht passiert.
- User löst Restore aus während `providers[]` bereits aktiv genutzt wird (z.B. Chat läuft). Mitigation: Restore-Action ist von einem Confirm-Modal geschützt, gibt eine Warnung "Aktuelle Settings werden zurückgesetzt".
- Backup-Cleanup-Logik wird vergessen, Settings-Datei wächst. Mitigation: 30-Tage-Banner als sichtbarer Trigger, 90-Tage-Hard-Cleanup als Safety.
- OAuth-Token-Migration: bei ChatGPT-OAuth-Tokens, die in einem Auth-Service-Cache liegen, ändert sich nichts (das Service ist Single Source). Aber wenn ein User vor Migration den Cache gelöscht hat, fehlt das Token nach Migration. Mitigation: Modal markiert OAuth-Provider explizit ("Sign-In nötig, falls Token-Cache geleert").

### Architektonische Folgepunkte

- arc42 Sektion 8 bekommt einen Eintrag zu Schema-Migration-Pattern
- Settings-Accessor-Pattern aus ADR-122 sollte einen `requiresSchemaVersion(version)`-Guard haben
- Backup-Retention-Logik kann später in ein generisches "30-day-soft-cleanup"-Pattern abstrahiert werden, falls weitere Backup-Felder hinzukommen

## Related Decisions

- Operationalisiert ADR-122 (Schema-Wechsel)
- Konsumiert ADR-121 (Tier-Klassifikator für Migration-Zeit-Klassifikation)
- Hat keinen direkten Einfluss auf ADR-120 (Advisor-Pattern), aber die korrekte Migration ist Voraussetzung für eine funktionale flagship-Slot-Belegung

## Implementation Notes

Die folgenden Code-Pfade sind Anhaltspunkte und können nach Coding-Pivots veralten.

- Migrations-Modul in `src/core/settings/migrations/`
- Atomic Settings-Save analog `KnowledgeDB`-Pattern aus FEATURE-0314
- Notification-Modal als neue Komponente, nutzt bestehende Modal-Infrastruktur
- Restore-Action in Settings-Reset-Sub-Menu, geschützt durch Confirm-Modal
- Backup-Cleanup-Banner als Settings-Tab-Top-Banner

## Quellen

- BA-27 Sektion 8 Risk R-3, Sektion 4.4 JTBD-3
- FEAT-26-04 Description, Success Criteria
- KnowledgeDB Atomic-Write-Pattern (FEATURE-0314) als Migrations-Robustness-Vorbild
