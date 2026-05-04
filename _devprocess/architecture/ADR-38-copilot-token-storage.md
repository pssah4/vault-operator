# ADR-38: Copilot Token Storage in Settings

**Date:** 2026-03-18
**Deciders:** Sebastian Hanke

## Context

GitHub Copilot erfordert zwei Token-Ebenen:
1. **Access Token** (langlebig, Ergebnis des OAuth Device Code Flow)
2. **Copilot Token** (kurzlebig ~1h, abgeleitet vom Access Token)

Beide muessen persistent gespeichert werden -- der Access Token damit der User nicht bei jedem Obsidian-Start neu einloggen muss, der Copilot Token um unnoetige Refresh-Requests zu vermeiden.

**Triggering ASR:**
- SafeStorageService-Integration (Security, FEAT-12-01)

**Problem:** Wie werden Copilot-Tokens in `ObsidianAgentSettings` strukturiert? Flache Felder oder verschachteltes Objekt?

## Decision Drivers

- **Einfachheit:** Flache Felder sind einfacher zu lesen/schreiben
- **Backwards Compatibility:** Settings-Aenderungen muessen mit bestehenden data.json kompatibel sein
- **Konsistenz:** Bestehende API Keys werden als flache String-Felder in `CustomModel.apiKey` gespeichert
- **SafeStorageService:** Verschluesselt Strings mit `enc:v1:` Prefix -- funktioniert fuer flache Felder

## Considered Options

### Option 1: Flache Felder in ObsidianAgentSettings
```typescript
interface ObsidianAgentSettings {
    // ... bestehende Felder ...
    githubCopilotAccessToken: string;
    githubCopilotToken: string;
    githubCopilotTokenExpiresAt: number;
    githubCopilotCustomClientId: string;  // optional, leer = Default
}
```
- Pro: Einfach, konsistent mit bestehendem Pattern
- Pro: SafeStorageService funktioniert direkt (encrypt/decrypt pro Feld)
- Pro: Keine Migration noetig (neue Felder mit Defaults)
- Con: "Namespace Pollution" in Settings-Interface

### Option 2: Verschachteltes Objekt
```typescript
interface CopilotAuthState {
    accessToken: string;
    copilotToken: string;
    tokenExpiresAt: number;
    customClientId: string;
}
interface ObsidianAgentSettings {
    copilotAuth: CopilotAuthState;
}
```
- Pro: Saubere Gruppierung
- Con: SafeStorageService muesste Nested-Felder traversieren (aktuell nicht unterstuetzt)
- Con: `saveSettings()` schreibt das gesamte Settings-Objekt -- verschachtelte Mutation ist fehleranfaellig
- Con: Migration noetig wenn User Update macht

## Decision

**Vorgeschlagene Option:** Option 1 -- Flache Felder

**Begruendung:**
1. Konsistent mit dem bestehenden Pattern (z.B. `activeModelKey`, `enableSemanticIndex` etc.)
2. SafeStorageService arbeitet auf String-Ebene und kann die Token-Felder direkt verschluesseln
3. Keine Migration oder Sonderbehandlung noetig
4. Obsidian Settings sind von Natur aus ein flaches JSON-Objekt in `data.json`

**Hinweis:** Dies ist ein VORSCHLAG. Claude Code entscheidet final basierend auf dem realen Zustand der Codebase.

## Consequences

### Positive
- Zero Migration -- neue Felder bekommen leere String Defaults
- SafeStorageService funktioniert ohne Anpassung
- Einfache Lese/Schreib-Operationen im Auth-Service

### Negative
- Vier zusaetzliche Felder im ohnehin grossen `ObsidianAgentSettings`
- Token-Felder sind semantisch zusammengehoerig aber strukturell verstreut

### Risks
- Keine signifikanten Risiken bei diesem Ansatz

## Implementation Notes

**Default-Werte in `DEFAULT_SETTINGS`:**
```typescript
githubCopilotAccessToken: '',
githubCopilotToken: '',
githubCopilotTokenExpiresAt: 0,
githubCopilotCustomClientId: '',
```

**SafeStorageService-Nutzung:**
- `encrypt(token)` vor dem Schreiben in Settings
- `decrypt(settings.githubCopilotAccessToken)` vor dem Nutzen

**Wichtig:** `githubCopilotTokenExpiresAt` ist ein Timestamp (number), nicht verschluesselt.

## Related Decisions

- ADR-19: Electron SafeStorage -- bestehendes Pattern fuer Token-Verschluesselung
- ADR-37: Copilot Provider Architecture -- Auth-Service nutzt diese Settings

## References

- FEAT-12-01: Auth & Token Management
- `src/types/settings.ts`: ObsidianAgentSettings Interface
