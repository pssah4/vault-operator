---
id: FIX-26-99-01
epic: EPIC-26
feature: FEAT-26-03
adr-refs: [ADR-122, ADR-123]
plan-refs: []
depends-on: []
audit-refs: [STABILITY-AUDIT-v2.14.0-2026-06-21]
created: 2026-06-21
---

# FIX-26-99-01: Settings-Deeplinks, ModeService-Exposure, OnboardingFlow auf providerConfigs[]

## Symptom

Stabilitaets-Audit 2026-06-21 fand drei UI-Defekte, die jeweils einen
sichtbaren UX-Bruch produzieren:

1. **Settings-Deeplinks landen auf falschem Tab.** `openSettingsAt('agent', 'providers')` (Zeile 2407) und `openSettingsAt('agent', 'memory')` (Zeile 3729) verwenden den String `'agent'`, der nicht in der `TabId`-Union (`'providers' | 'agent-behaviour' | 'customize' | 'advanced' | 'help'`) ist. Der `tab as TabId`-Cast hat das ohne TS-Fehler durchgewinkt. Das EPIC-26 Migration-Modal und der Memory-v2-Upgrade-Modal oeffneten daher den Default-Tab statt der erwarteten Section.

2. **ModesTab + NewModeModal bekommen `undefined` als ModeService.** `AgentSettingsTab.display()` hatte `const ms = undefined` mit Kommentar "settings tabs work without it". Tatsaechlich werden globale Modes nicht angezeigt und Save-Aktionen landeten auf einer Detached-Kopie, die nie den Agent-Loop erreicht.

3. **OnboardingFlow schreibt in totes `activeModels[]`.** Der `setupBtn` der Welcome-Bubble und der NoModel-Bubble oeffnete `openAddModelModal`, das beim Save in `settings.activeModels[]` pushte. Nach der EPIC-26 Migration ist das Provider-only-Schema `providerConfigs[]` der kanonische Store. Ein User-Klick auf "Setup" schrieb damit entweder in Daten, die beim naechsten Reload migriert wurden, oder in Daten, die das Provider-UI nie sah.

## Root Cause + Fix

### FIX-26-99-01 (Settings-Deeplinks tot-String)

- `openSettingsAt(tab: string, ...)` -> `openSettingsAt(tab: TabId, ...)`. Der Compiler erzwingt damit jeden Aufruf auf einen gueltigen Wert.
- Migration-Modal: `openSettingsAt('providers')` (zeigt Providers-Tab direkt).
- Memory-Upgrade-Modal: `openSettingsAt('agent-behaviour', 'memory')`.
- Protocol-Handler `obsidian://vault-operator-settings`: explizite `VALID_SETTINGS_TABS`-Allowlist plus `console.warn` bei unbekanntem Tab. Schliesst externe Deep-Links als zusaetzliche Source.
- `UpdateSettingsTool.handleOpenTab`: gleiche Allowlist, klare Error-Message bei Unknown-Tab.

### FIX-26-99-03 (ModeService an Settings exponieren)

- `AgentSidebarView`: neue Public-Methode `getModeServiceOrNull(): ModeService | null` (inline assignment im Constructor um Property-Ordering-Hazard zu vermeiden).
- `AgentSettingsTab.findActiveModeService()`: sucht den ersten `obsidian-agent-sidebar`-Leaf und ruft `getModeServiceOrNull()`. Returnt `undefined` wenn die Sidebar nicht offen ist (ModesTab degradiert anstatt zu crashen).

### FIX-26-99-02 (OnboardingFlow auf providerConfigs[])

- `setupBtn`-Handler ruft nicht mehr `openAddModelModal(callbacks)` sondern direkt `callbacks.openSettings()`.
- `AgentSidebarView` `openSettings`-Callback routed via `plugin.openSettingsAt('providers')` direkt auf den Providers-Tab. User landet auf der providerConfigs[]-UI, statt ueber den Legacy-Modal-Pfad zu gehen.
- Die `openAddModelModal`-Methode bleibt als unused-private im Source (kein Test-Aufrufer; Cleanup-Ticket koennte sie spaeter loeschen).

## Out of Scope (Deferred)

- **Double-Init API-Handler.** Live-Log zeigt `[Plugin] API handler initialized: ... (bedrock)` zweimal im selben Reload. `initApiHandler()` wird einmal in `onload()` (line 2161) und einmal nach `saveSettings()` (line 3091) gerufen. Ein Settings-Save im onload-Flow triggert den zweiten Roundtrip. Audit-Empfehlung: Init-Order in main.ts refactorieren. Kosmetisches Issue ohne funktionalen Schaden -> P3 deferred.

## Tests

Keine neuen Tests fuer diese Welle (UI-Patches mit klarem Diff). tsc clean, full vitest 2963 + 1 expected fail, build clean.
