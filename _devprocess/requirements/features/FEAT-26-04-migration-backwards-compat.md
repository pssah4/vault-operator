---
id: FEAT-26-04
title: Migration und Backwards-Compat
epic: EPIC-26
priority: P0
date: 2026-05-15
related: BA-27
adr-refs: []
plan-refs: []
depends-on: [FEAT-26-02, FEAT-26-03]
---

# FEAT-26-04: Migration und Backwards-Compat

## Description

Beim ersten Plugin-Start nach Upgrade auf die EPIC-26-Version migriert das Plugin automatisch die bestehende `activeModels[]`-Konfiguration auf das neue Provider-Schema (`providers: ProviderConfig[]` mit `tierMapping`).

Migrations-Algorithmus:
1. Lese vorhandene `activeModels[]`-Liste
2. Gruppiere nach `provider`-Type
3. Pro Gruppe: erstelle einen `ProviderConfig`-Eintrag mit den Auth-Daten aus dem ersten Modell der Gruppe (bei mehreren Auth-Keys für denselben Provider: nimm das mit `enabled === true`, sonst das erste)
4. Klassifiziere die Modelle der Gruppe via `ModelTierClassifier` (FEAT-26-02)
5. Setze `activeProviderId` auf den Provider, dem das heutige `activeModelKey` entspricht
6. Original `activeModels[]` bleibt erhalten (als Backup, nicht gelöscht) bis nach erfolgreicher Migration

Nach der Migration zeigt ein Notification-Modal: "Wir haben dein Setup auf das neue Provider-Format migriert. {N Provider, M Modelle} sind verfügbar. Prüfe die Tier-Zuordnung in Settings → Providers." Mit zwei Buttons: "Settings öffnen" und "OK".

Bei ungewöhnlichen Setups (Multi-Anthropic mit verschiedenen API-Keys, exotische Custom-Endpoints, fehlende Modelle) wird im Modal ein detaillierter Hinweis angezeigt mit der Liste der Anomalien.

Rollback-Pfad: User kann via versteckte Setting `legacy_active_models_backup` (Lese-Zugriff via Settings-Editor oder data.json) sehen, was migriert wurde. Bei kritischen Fehlern kann der Rollback-Plan über eine separate "Restore legacy"-Aktion ausgelöst werden.

Quelle: BA-27 Sektion 7.1 Welle 4. QA-Decision 5.

## Benefits Hypothesis

Das Plugin hat eine bestehende Nutzerbasis mit kuratierten `activeModels[]`-Configs. Wenn die Migration silent fehlschlägt oder das Setup zerstört, verlieren wir User-Vertrauen permanent (R-3). Eine robuste Auto-Migration mit klarem Notification-Modal und Backup-Pfad eliminiert dieses Risiko. Plus: ohne Migration könnte der User in einem leeren Zustand starten und das Plugin als "kaputt nach Upgrade" wahrnehmen.

## User Stories

- **US-04-01 (P1 Sebastian, JTBD-3):** Als bestehender Power-User möchte ich beim Plugin-Update sehen, dass mein bestehendes Modell-Setup automatisch auf das neue Format migriert wurde, damit ich sofort weiterarbeiten kann.
- **US-04-02 (P1 Sebastian):** Als bestehender Power-User möchte ich nach der Migration ein Notification-Modal sehen mit dem Hinweis, wo ich das Setup prüfen kann, damit ich proaktiv das neue UI kennenlerne.
- **US-04-03 (P1 Sebastian):** Als Power-User möchte ich, dass bei ungewöhnlichen Setup-Konstellationen (mehrere API-Keys für denselben Provider) das Modal Hinweise gibt, damit ich gezielt überprüfen kann.
- **US-04-04 (P2 Knowledge-Worker):** Als Standard-User möchte ich, dass die Migration silent funktioniert und ich nicht durch komplexe Modale geblockt werde, damit ich produktiv bleiben kann.

## Success Criteria

1. Beim ersten Plugin-Start nach EPIC-26-Upgrade läuft die Migration automatisch und blockiert das Plugin nicht (asynchron während Plugin-Init).
2. Nach erfolgreicher Migration sehe ich ein Notification-Modal mit der Zusammenfassung der migrierten Provider und Modelle.
3. Wenn ich auf "Settings öffnen" klicke, lande ich direkt im Providers-Tab und sehe das migrierte Setup.
4. Wenn ich auf "OK" klicke, schließt sich das Modal und das Plugin ist normal nutzbar.
5. Mein bisheriges `activeModelKey` wird als aktiver Provider erkannt und gesetzt. Mein erster Send nach Migration nutzt denselben Provider wie vorher.
6. Wenn meine Setup-Konstellation ungewöhnlich ist (mehrere API-Keys für denselben Provider, fehlendes flagship-Modell, exotische Custom-Endpoints), zeigt das Modal eine Liste der Anomalien mit Aktions-Empfehlungen.
7. Wenn ich nach der Migration in `data.json` schaue, finde ich die ursprüngliche `activeModels[]`-Liste unter `legacy_active_models_backup` als Backup.
8. Wenn ich eine "Restore legacy"-Aktion auslöse (z.B. über versteckte Setting oder Settings-Reset), wird der Migration-Stand zurückgesetzt und das alte Setup wiederhergestellt.
9. Die Migration ist idempotent: wiederholtes Auslösen führt nicht zu doppelten Provider-Einträgen.

## Technical NFRs

- **Atomicity:** Migration läuft als Transaktion. Bei Fehler in einem Schritt wird der ursprüngliche `activeModels[]`-Zustand erhalten und ein klar lesbarer Error-Log geschrieben.
- **Provider-Type-Mapping:** Plugin kennt explizites Mapping `CustomModel.provider` → `ProviderConfig.type`. Bei unbekanntem Provider-Type bleibt das Modell in `legacy_active_models_backup`, wird im Modal markiert.
- **Auth-Daten-Preservation:** API-Keys, OAuth-Tokens, Bedrock-Credentials werden 1:1 übernommen, kein Re-Auth nötig.
- **Multi-Auth-pro-Provider:** wenn der User mehrere `CustomModel`-Einträge mit demselben `provider`-Type aber unterschiedlichen API-Keys hat, wird der erste enabled übernommen, die anderen werden im Modal als "Mehrere Auth-Konfigurationen gefunden, manuelle Prüfung empfohlen" markiert.
- **Disabled-Modell-Handling:** Modelle mit `enabled: false` werden ignoriert (Provider erhält nur enabled-Modelle für Klassifikation).
- **Rollback-Mechanik:** `legacy_active_models_backup` bleibt mindestens 30 Tage erhalten (oder bis User explizit ein Cleanup auslöst).

## ASRs

- **ASR-CRIT-01:** Migration darf bestehende User-Setups NIEMALS silent zerstören. Bei Migration-Fehler bleibt das alte Setup funktional, das Modal zeigt den Fehler an.
- **ASR-CRIT-02:** OAuth-Tokens (Copilot, ChatGPT-OAuth) und Bedrock-Credentials müssen unverändert übertragen werden. Kein Re-Auth darf nötig sein.
- **ASR-MOD-01:** Schema-Migration hat eine eindeutige Version (`schemaVersion: 2026.5.15` o.ä.) im Settings-Objekt, damit zukünftige Migrationen darauf aufsetzen können.

## Definition of Done

- [ ] Migrations-Script `migrateActiveModelsToProviders()` in `src/core/settings/migrations/`
- [ ] Notification-Modal mit Zusammenfassung und Aktionen
- [ ] Anomalie-Detection (Multi-Auth, fehlendes flagship, Custom-Endpoint-Sonderfall)
- [ ] `legacy_active_models_backup` als Settings-Feld, retained für 30 Tage
- [ ] Idempotenz-Garantie: wiederholtes Aufrufen ändert nichts
- [ ] Tests: Standard-Migration (1 Provider, 3 Modelle), Multi-Auth-Migration, Disabled-Modell-Ignore, Migration-Fehler-Path, Idempotenz, Restore-Legacy
- [ ] Tests gegen Sebastians eigenes Multi-Provider-Setup als realistischer Worst-Case
- [ ] Live-Messlauf [AWAITING RE]: Plugin-Update mit echtem User-Setup, Notification-Modal sichtbar

## Validation (Critical Hypothesis H-05)

H-05 sagt: Migration läuft für >95 % der User-Setups fehlerfrei. Validation: Test gegen Sebastians Setup + 2-3 weitere Standard-Variant-Setups (nur Anthropic, nur OpenAI, Mix mit Bedrock).

## Out-of-Scope

- Manueller Migrations-Wizard mit Step-by-Step-Bestätigung
- Migration über mehrere Plugin-Versionen (nur die letzte legacy-Version wird unterstützt)
- Auto-Cleanup von `legacy_active_models_backup` nach 30 Tagen (manuell oder Folge-IMP)
- Multi-User-Migration (Plugin ist Single-User)
