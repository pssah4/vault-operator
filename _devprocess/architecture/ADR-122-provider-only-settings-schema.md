---
id: ADR-122
title: Provider-only Settings-Schema
date: 2026-05-15
deciders: Sebastian + Architekt-Agent
related-features: FEAT-26-03, FEAT-26-04
related-adrs: ADR-11 (Multi-Provider API Architecture), ADR-121 (Tier-Klassifikator), ADR-123 (Migrations-Strategie)
related-imps: []
---

# ADR-122: Provider-only Settings-Schema

## Status

Proposed (Architecture-Pass 2026-05-15, EPIC-26 Welle 2).
Triggernde ASR: EPIC-26 / FEAT-26-03; BA-27 Sektion 4.4 JTBD-3 und JTBD-4.

## Kontext

Das heutige Settings-Modell verwaltet eine flache Liste konfigurierter Modelle (`activeModels: CustomModel[]`). Jeder Eintrag enthält ~20 Felder (Provider, BaseURL, MaxTokens, Temperature, Thinking-Budget, Caching-Flags, AWS-Auth-Modi, etc.). Der User pflegt jedes Modell einzeln und wechselt zwischen ihnen über das Chat-Dropdown.

Mit dem Advisor-Pattern (ADR-120) und dem Tier-Klassifikator (ADR-121) ändert sich die Sicht des Plugins fundamental: relevant ist nicht mehr "welches Modell läuft", sondern "welcher Provider ist aktiv und welche drei Modelle füllen die Tier-Slots". Die Modell-Liste pro Provider wird per Auto-Discovery gepflegt, der User pflegt nur Provider plus Auth.

Das wirft die Frage auf, wie das Settings-Schema strukturiert ist. Drei Modi sind möglich: bestehendes Schema ersetzen, beide Schemas parallel halten, oder hybrid umstellen.

## Decision Drivers

- Migration alter `activeModels[]`-Configs darf nicht User-Setup zerstören (ADR-123 löst die Migration, dieses ADR muss aber das Ziel-Schema klar haben)
- Schema muss alle heutigen Provider-Typen abdecken (Anthropic, OpenAI, Bedrock, OpenRouter, GitHub Copilot, ChatGPT-OAuth, Azure, Ollama, LMStudio, Custom)
- Provider-spezifische Auth (API-Key, OAuth-Token, Bedrock SigV4) bleibt unverändert intakt
- Tier-Mapping ist sichtbar in den Settings (auto-detected mit Override-Möglichkeit pro Slot)
- Settings-Save-Pfad ist atomic (kein Half-Write bei Tier-Override oder Provider-Wechsel)
- Single Active Provider als bewusste Disziplin (kein Cross-Provider-Tier-Mapping in Welle 1)
- Backwards-Kompatibilität in einer Übergangsphase (Legacy-Backup für Recovery)

## Considered Options

### Option 1: Schema komplett ersetzen (Hard-Cut)

`activeModels[]` wird beim ersten Plugin-Start nach Upgrade migriert und gelöscht. Plugin kennt ab dann nur noch das neue `providers[]`-Schema. Kein Rollback-Pfad innerhalb des Plugins, nur via Git-Restore.

- **Pro:** klares Schema, kein Code-Pfad-Doppel, keine Verwirrung
- **Con:** Migration-Fehler sind irreversibel. Bei kritischen Setup-Verlusten (Multi-Auth-pro-Provider, exotische Custom-Endpoints) ist keine Recovery möglich. Hohes Vertrauensrisiko (R-3 aus BA-27).

### Option 2: Schemas parallel mit Legacy-Backup

Neues `providers[]`-Schema wird zusätzlich zum bestehenden `activeModels[]` eingeführt. Migration kopiert `activeModels[]` in das neue Schema und behält die Original-Liste als `legacy_active_models_backup` für 30 Tage. Plugin liest ab Migration ausschliesslich aus dem neuen Schema. Rollback ist möglich durch Settings-Restore aus dem Backup-Feld.

- **Pro:** Sicherheitsnetz für Migration-Fehler, User-Vertrauen bleibt erhalten. Schema bleibt klar (Plugin liest nur aus `providers[]`, Backup ist Read-Only-Daten). Backup-Retention erlaubt User-Reaktion bei spät bemerkten Problemen.
- **Con:** Settings-Objekt wird grösser (Backup-Daten bleiben 30 Tage liegen). Cleanup-Logik nötig nach 30 Tagen oder manuell.

### Option 3: Hybrid mit doppeltem Lese-Pfad

Plugin liest sowohl `activeModels[]` als auch `providers[]`, mit Override-Logik (z.B. providers gewinnt wenn vorhanden). Migration füllt providers, lässt activeModels intakt.

- **Pro:** maximale Flexibilität, User kann zwischen Schemas wechseln
- **Con:** zwei Code-Pfade dauerhaft parallel. Erhöhte Komplexität in jedem Settings-Lese-Pfad. Konsistenz-Risiko (was wenn beide Schemas inkonsistent werden). Unklare Quelle-der-Wahrheit. Verlängert die Pflege-Schuld.

## Entscheidung

**Option 2.** Schemas parallel mit Legacy-Backup als Read-Only-Daten.

Konkrete Schema-Struktur:

- Neues Top-Level-Setting `providers: ProviderConfig[]` ersetzt funktional die heutige `activeModels`-Liste
- Jeder `ProviderConfig` enthält:
  - `id` (eindeutig, generiert oder vom Provider-Type abgeleitet)
  - `type` (anthropic, openai, bedrock, openrouter, github-copilot, chatgpt-oauth, azure, ollama, lmstudio, custom)
  - `enabled` (Boolean)
  - Provider-spezifische Auth-Felder (apiKey, baseUrl, oauth-Token via Auth-Service, awsRegion, awsAuthMode, awsCredentials, etc.) - identisch zur heutigen `CustomModel`-Struktur, nur auf Provider-Ebene gehoben
  - `discoveredModels: DiscoveredModel[]` (vom Discovery-Service gepflegt, Cache-Daten)
  - `tierMapping: { fast?, mid?, flagship? }` mit Modell-IDs als Werte
  - `tierOverrides: { fast?, mid?, flagship? }` mit manueller User-Wahl (überschreibt auto-detected)
  - `lastRefreshAt` (Unix-Timestamp für Cache-TTL)
- Neues Top-Level-Setting `activeProviderId: string | null`
- Bestehende `activeModelKey`, `helperModelKey`, `memoryModelKey`, `titlingModelKey` bleiben unverändert (Backwards-Kompat für Settings, die nicht in `providers` landen)
- Bestehende `activeModels` bleibt als Read-Only-Quelle für die Migration, wird ab Migration nicht mehr aktiv gepflegt
- Migration kopiert `activeModels[]` in `legacy_active_models_backup` (separates Feld) mit Timestamp. Plugin behält das Backup für 30 Tage. Cleanup-Logik per Settings-Action oder automatisch (siehe ADR-123).

Settings-Schema-Versionierung: neues Top-Level-Feld `schemaVersion: '2026.5.15'` markiert die Migration. Zukünftige Migrationen lesen die Version und entscheiden, ob ein weiterer Schritt nötig ist.

Welcher Settings-Pfad gewinnt: Plugin liest ab Schema-Version `2026.5.15` ausschliesslich aus `providers[]` und `activeProviderId`. `activeModels[]` ist tote Read-Only-Daten ab Migration, wird aber nicht gelöscht, weil das Backup-Konzept es als Recovery-Pfad braucht.

## Konsequenzen

### Positiv

- Migration-Fehler sind reversibel (Backup-Restore möglich)
- Schema ist klar definiert: Plugin liest nur aus `providers[]` ab Migration
- Provider-spezifische Auth-Mechaniken bleiben intakt (OAuth-Flow für Copilot, Bedrock SigV4)
- Tier-Mapping ist explizit im Schema sichtbar, kein impliziter Lookup nötig
- Single Active Provider als Disziplin direkt im Schema (`activeProviderId` als Top-Level-Setting)
- Schema-Versionierung erlaubt zukünftige Migrationen ohne Brüche

### Negativ

- Settings-Objekt wird grösser (Backup-Daten bleiben 30 Tage)
- Cleanup-Logik für Backup nach 30 Tagen muss implementiert werden (oder bleibt manueller User-Trigger)
- Zwei Datenquellen während der Übergangsphase (`activeModels[]` als Backup, `providers[]` als aktive Quelle). Pflicht-Disziplin: Plugin-Code liest nur aus `providers[]`, `activeModels[]` bleibt Read-Only-Recovery
- Provider-spezifische Auth-Felder müssen pro Provider-Type explizit im Schema modelliert werden (Discriminated Union oder Flat-Struktur mit Optional-Feldern)

### Risiken

- Plugin-Code liest versehentlich aus `activeModels[]` statt `providers[]` und erzeugt inkonsistentes Verhalten. Mitigation: Linter-Rule oder Settings-Accessor-Pattern, der nur den neuen Pfad freigibt. Pre-Commit-Hook prüft auf `activeModels[]`-Reads ausserhalb der Migration.
- 30-Tage-Backup wird nie aufgeräumt, Settings-Datei wächst unbegrenzt. Mitigation: Auto-Cleanup nach 30 Tagen oder Sichtbarkeit als "Backup auf Disk, jetzt löschen?"-Action in Settings.
- Bei OAuth-Token-Refresh muss klar sein, ob der Refresh in `providers[]` oder im Auth-Service-Cache passiert. Mitigation: Auth-Service bleibt Single Source of Truth für Tokens, `providers[]` referenziert nur den Provider-Type, nicht den Token selbst.
- Multi-Auth-pro-Provider-Setups (z.B. Sebastian hat zwei Anthropic-API-Keys für unterschiedliche Zwecke) sind im neuen Schema nicht direkt darstellbar (Single Active Provider impliziert eine Auth pro Provider). Mitigation: Migration markiert solche Fälle im Notification-Modal, User entscheidet welche Auth übernommen wird. Sekundäre Auths landen im Backup. ADR-123 erläutert den Migrations-Pfad.

### Architektonische Folgepunkte

- ADR-123 löst die Migration und die Recovery-Mechanik
- arc42 Sektion 8 (Querschnittliche Konzepte) bekommt einen Eintrag zu Schema-Versionierung
- ARCHITECTURE.map bekommt einen neuen Wayfinder-Eintrag für das Provider-Konzept

## Related Decisions

- Konsumiert von ADR-120 (Advisor-Pattern braucht `tierMapping`)
- Konsumiert von ADR-121 (Tier-Klassifikator schreibt in `tierMapping`)
- Implementiert von ADR-123 (Migrations-Strategie operationalisiert den Schema-Wechsel)
- Erweitert nicht ADR-11 (Multi-Provider API Architecture bleibt strukturell unverändert auf Adapter-Ebene)

## Implementation Notes

Die folgenden Code-Pfade sind Anhaltspunkte und können nach Coding-Pivots veralten.

- Neues Settings-Interface `ProviderConfig` in `src/types/settings.ts`
- Discovery-Service-Methode `refreshProvider(providerId)` schreibt `discoveredModels` und `lastRefreshAt`
- Klassifikator-Aufruf `classify(discoveredModels)` befüllt `tierMapping` (Override-Mapping bleibt unverändert)
- Settings-Accessor `getActiveProvider()` und `getActiveProviderTier(tier)` als zentrale Lookup-Methoden
- `legacy_active_models_backup` als separates Top-Level-Feld mit `migratedAt: number` Timestamp

## Quellen

- BA-27 Sektion 2.3 To-Be und 7.1 Welle 2/3
- FEAT-26-03, FEAT-26-04
- ADR-11 (Multi-Provider API Architecture als Adapter-Vorbild)
