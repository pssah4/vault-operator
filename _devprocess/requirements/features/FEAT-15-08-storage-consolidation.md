# Feature: Storage Consolidation

> **Feature ID**: FEAT-15-08
> **Epic**: EPIC-15 - Unified Knowledge Layer
> **Priority**: P0-Critical
> **Effort Estimate**: M

## Feature Description

Storage wird auf zwei klar getrennte Orte konsolidiert:
- **User-global** (`{vault-parent}/.obsidian-agent/`): Memory, History, Recipes, Settings -- geteilt ueber alle Vaults im selben Eltern-Verzeichnis
- **Vault-spezifisch** (`{vault}/.obsidian-agent/`): knowledge.db, VaultDNA -- Index dieses Vaults

Das Eltern-Verzeichnis des Vaults wird als globaler Root genutzt. Bei `~/Obsidian/NexusOS/` ist das `~/Obsidian/.obsidian-agent/`. Damit: Ein iCloud/OneDrive-Sync von `~/Obsidian/` synct automatisch sowohl globale Daten als auch alle Vaults.

Aktuell sind Daten ueber 6 Verzeichnisse verstreut:
- `~/.obsidian-agent/` (Home-Dir, nicht neben dem Vault) -- History, Memory, Settings
- `{vault}/.obsidian-agent/` (vault-lokal) -- memory.db, VaultDNA
- `{vault}/.obsilo-sync/` (Sync-Spiegel) -- fragiler Workaround
- `{vault}/.obsilo/` (legacy, leer)
- `{vault}/.obsidian/.obsilo/` (legacy, leer)
- `{vault}/.obsidian/plugins/vault-operator/` (Plugin Runtime)

Das Refactoring eliminiert SyncBridge, Legacy-Verzeichnisse und verschiebt alles neben den Vault.

## Benefits Hypothesis

**Wir glauben dass** die Storage-Konsolidierung
**Folgende messbare Outcomes liefert:**
- Obsidian Sync funktioniert automatisch fuer alle persistenten Daten
- Kein Datenverlust beim Geraetewechsel (Chat History, Memory, Settings)
- Weniger Verzeichnisse = weniger Verwirrung

**Wir wissen dass wir erfolgreich sind wenn:**
- Nur noch 2 Storage-Orte existieren: `{vault}/.obsidian-agent/` + `~/.obsidian-agent/knowledge.db`
- SyncBridge und alle Legacy-Verzeichnisse entfernt sind
- Bestehende Daten verlustfrei migriert wurden

## User Stories

### Story 1: Automatischer Sync
**Als** Obsidian-Nutzer mit mehreren Geraeten
**moechte ich** dass meine Chat History, Memory und Settings automatisch synchronisiert werden
**um** auf jedem Geraet denselben Stand zu haben

### Story 2: Aufgeraeumte Verzeichnisse
**Als** Vault-Owner
**moechte ich** verstehen wo meine Daten liegen
**um** Kontrolle ueber mein Dateisystem zu behalten

---

## Success Criteria (Tech-Agnostic)

| ID | Criterion | Target | Measurement |
|----|-----------|--------|-------------|
| SC-01 | Nur 2 klar getrennte Storage-Orte | Global: `{vault-parent}/.obsidian-agent/`, Vault: `{vault}/.obsidian-agent/` | Dateisystem-Pruefung |
| SC-02 | Daten synchronisieren via Obsidian Sync | History, Memory, Settings im Vault | Sync-Test auf 2. Geraet |
| SC-03 | Legacy-Verzeichnisse entfernt | 0 Legacy-Pfade | Dateisystem-Pruefung |
| SC-04 | Bestehende Daten migriert | Kein Datenverlust | Vergleich vorher/nachher |
| SC-05 | Bestehende Funktionen arbeiten identisch | Keine Regression | Funktionstest |

---

## Technical NFRs (fuer Architekt)

### Migration
- **Einmalige Migration**: Beim ersten Start nach Update Daten von `~/.obsidian-agent/` nach `{vault}/.obsidian-agent/` kopieren
- **Rollback-sicher**: Alte Dateien erst nach erfolgreicher Migration loeschen
- **Idempotent**: Migration kann mehrfach laufen ohne Datenverlust

### Performance
- **Plugin-Start**: Darf nicht langsamer werden als aktuell (<1s)
- **File I/O**: vault.adapter statt fs.promises fuer vault-lokale Dateien (Mobile-kompatibel)

---

## Architecture Considerations

### Soll-Zustand

```
{vault-parent}/.obsidian-agent/           # USER-GLOBAL (cross-vault, synct via iCloud/OneDrive)
+-- memory/                               # soul.md, user-profile.md, patterns.md, errors.md, ...
+-- memory.db                             # Sessions, Episodes, Recipes, Patterns
+-- history/                              # Chat History
+-- settings.json                         # Modell-Config (nicht API-Keys)
+-- logs/                                 # Audit Logs
+-- rules/                                # Custom Rules
+-- skills/                               # User Skills
+-- workflows/                            # Workflows
+-- pending-extractions.json

{vault}/.obsidian-agent/                  # VAULT-SPEZIFISCH
+-- knowledge.db                          # Vektoren, Graph, Implicit Edges DIESES Vaults
+-- plugin-skills/                        # VaultDNA DIESES Vaults
+-- vault-dna.json

~/.obsidian-agent/                        # ENTFAELLT (Migration beim ersten Start)
```

Beispiel fuer `~/Obsidian/NexusOS/`:
- Global: `~/Obsidian/.obsidian-agent/`
- Vault: `~/Obsidian/NexusOS/.obsidian-agent/`
- Beide unter `~/Obsidian/` -> ein iCloud-Sync reicht

### Kern-Aenderung: GlobalFileService

`GlobalFileService` aendert sein Root-Verzeichnis von `os.homedir()/.obsidian-agent/` auf `{vault}/.obsidian-agent/`. Intern wechselt es von `fs.promises` auf `vault.adapter` (fuer Mobile-Kompatibilitaet).

### Was entfaellt

- **SyncBridge**: Komplett entfernen (keine Notwendigkeit mehr, Vault synct von selbst)
- **`{vault}/.obsilo-sync/`**: Entfernen
- **`{vault}/.obsilo/`**: Entfernen (legacy, leer)
- **`{vault}/.obsidian/.obsilo/`**: Entfernen (legacy, leer)
- **`~/.obsidian-agent/semantic-index/`**: Entfernen (vectra legacy)
- **`~/.obsidian-agent/episodes/`**: Entfernen (in memory.db)
- **`~/.obsidian-agent/patterns/`**: Entfernen (in memory.db)

### Was bleibt wo

| Daten | Vorher | Nachher |
|-------|--------|---------|
| knowledge.db | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` (vault-spezifisch) |
| memory.db | `{vault}/.obsidian-agent/` | `{vault-parent}/.obsidian-agent/` (user-global) |
| history/ | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| memory/*.md | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| settings.json | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| logs/ | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| rules/ | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| skills/ | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| workflows/ | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| pending-extractions.json | `~/.obsidian-agent/` | `{vault}/.obsidian-agent/` |
| Plugin runtime | `{vault}/.obsidian/plugins/vault-operator/` | unveraendert |

---

## Definition of Done

### Functional
- [ ] GlobalFileService Root umgestellt auf `{vault}/.obsidian-agent/`
- [ ] Einmalige Migration von `~/.obsidian-agent/` nach `{vault}/.obsidian-agent/`
- [ ] SyncBridge entfernt
- [ ] Legacy-Verzeichnisse bereinigt (.obsilo, .obsilo-sync, .obsidian/.obsilo)
- [ ] Legacy-Dateien bereinigt (semantic-index, episodes/*.json, patterns/*.json)
- [ ] Bestehende Funktionen arbeiten identisch

### Quality
- [ ] Migrations-Test: Daten korrekt kopiert
- [ ] Regression: Memory, History, Settings funktionieren wie vorher

### Documentation
- [ ] Feature-Spec aktualisiert
- [ ] arc42 Storage Layout aktualisiert

---

## Dependencies
- **FEAT-15-00**: SQLite Knowledge DB (knowledge.db wird vault-lokal)
- **FEAT-15-05**: Knowledge Data Consolidation (memory.db bleibt vault-lokal)

## Out of Scope
- Plugin-Verzeichnis Aenderungen (.obsidian/plugins/vault-operator/)
