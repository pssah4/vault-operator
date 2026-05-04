---
id: PLAN-08
title: Memory v2 Phase 4.5 -- Agent-Self Layer (FEAT-03-19b)
date: 2026-04-28
feature-refs: [FEAT-03-19b]
adr-refs: [ADR-77, ADR-85]
bug-refs: []
pair-id: sebastian-opus-4.7
parent-plan: PLAN-01-memory-v2-master
related:
  - PLAN-01-memory-v2-master.md
  - PLAN-07-feature-0318-single-call-update.md
  - _devprocess/requirements/features/FEAT-03-19b-agent-self-layer.md
---

# PLAN-08 -- Memory v2 Phase 4.5 Agent-Self Layer

## Kontext

Im Live-Test 2026-04-28 wurde die Self-Awareness-Luecke des Agents
manifest: er halluzinierte Features (Star-Button, automatische
Extraction-Regeln) weil weder Capability-Snapshot noch Code-Introspect-Tool
existierten. Gleichzeitig lebt die OpenClaw-style Soul (Werte,
Anti-Patterns, Persoenlichkeit) noch in legacy `soul.md` und
`communication_styles`-Tabelle, beides nicht in den Memory v2 Read-Pfad
integriert.

**Loesungsansatz: Layered Self-Memory.** Fuenf Layer, von hardcoded bis
runtime:

- L1 Static Identity (im Bundle)
- L2 Curated Soul (DB, profile_id='_obsilo', user/agent-editierbar)
- L3 Capabilities Snapshot (DB, profile_id='_obsilo', auto-synced beim Plugin-Onload)
- L4 Code/Settings Awareness (runtime, via inspect_self-Tool)
- L5 Operational State (out of scope hier)

Reservierter `profile_id='_obsilo'` als Konvention -- keine neue Tabelle,
ContextComposer + recall_memory + Aging arbeiten mit. Saubere Trennung
ueber den schon vorhandenen profile-Filter.

**Bewusste Entscheidung:** Kein Feature-Flag fuer "alter vs neuer Soul".
communication_styles wird nicht mehr beschrieben (Audit-only), L2
ersetzt sie. Migration des legacy soul.md ist optional + idempotent.

## Reihenfolge

Drei Commit-Bloecke nach Risiko:

**Block A -- Foundation (klein, isoliert)**
1. CapabilityManifest-Modul + Hash-Helper
2. SoulView (Read-API auf FactStore mit profile-Filter)
3. ContextComposer Erweiterung: Soul-Block am Anfang des Memory-Markdowns

**Block B -- Tools (mittel, agent-facing)**
4. update_soul-Tool
5. inspect_self-Tool (settings + tools + capabilities, L4 Phase 1)
6. ToolRegistry + builtinModes-Eintraege

**Block C -- Wiring + UX (mittel, hot-path)**
7. plugin.onload Capability-Sync mit Hash-Vergleich + Deprecate/Insert-Cycle
8. Settings-Tab "Obsilo's soul" mit Soul-Editor + Capability-Inspektor
9. Migrations-Action "Import legacy soul.md"
10. SystemPrompt-Pointer fuer recall_memory + inspect_self

**Block D -- Tests + Docs**
11. Unit-Tests (SoulView, CapabilityManifest, update_soul, inspect_self)
12. Eval-Fixtures: Soul-Edits, Capability-Inquiries, Hallucination-Regression
13. Backlog + Memory-Status updates

## Aenderungen

### Aufgabe 1 -- CapabilityManifest

`src/core/memory/CapabilityManifest.ts` -- kuratierte Plugin-Selbstauskunft.

```ts
export interface Capability {
    area: 'tool' | 'ui' | 'setting' | 'mode' | 'command';
    key: string;
    summary: string;
    notes?: string;
}
export const CAPABILITIES: Capability[] = [
    { area: 'tool', key: 'mark_for_memory', summary: 'Save current chat to memory immediately, bypassing throttle.' },
    { area: 'tool', key: 'recall_memory', summary: 'Search Memory v2 facts by meaning + topics.' },
    { area: 'ui', key: 'memory-star-header', summary: 'Star icon in chat header toggles save/unsave for active conversation.' },
    { area: 'ui', key: 'memory-star-history', summary: 'Star icon per row in history panel; filled = facts in memory.' },
    { area: 'setting', key: 'memory.autoExtractSessions', summary: 'Auto-extract toggle. Manual paths always work regardless.' },
    { area: 'setting', key: 'memory.extractionThreshold', summary: 'Min message count before auto-extract triggers.' },
    // ... pflegen wir bei jeder feature-aenderung mit
];
export function manifestHash(): string {
    return sha256(JSON.stringify(CAPABILITIES));
}
```

Hash via Web-Crypto-API oder simplem djb2 (kollisionsarm fuer ~100 Eintraege).

### Aufgabe 2 -- SoulView

`src/core/memory/SoulView.ts`. Read-API auf FactStore.

```ts
export class SoulView {
    constructor(private memoryDB: MemoryDB) {}

    getValues(): Fact[] { return this.query(['soul', 'value']); }
    getAntiPatterns(): Fact[] { return this.query(['soul', 'anti_pattern']); }
    getIdentity(): Fact[] { return this.query(['soul', 'identity']); }
    getCommunicationStyle(): Fact[] { return this.query(['soul', 'communication']); }
    getCapabilities(): Fact[] { return this.query(['capability']); }

    private query(topics: string[]): Fact[] {
        return new FactStore(this.memoryDB).listLatest({
            profileId: '_obsilo',
            limit: 50,
        }).filter(f => topics.every(t => f.topics.includes(t)));
    }
}
```

### Aufgabe 3 -- ContextComposer Soul-Block

ContextComposer rendert vor dem Memory-Block:

```markdown
## Identity & Soul (Obsilo)

You are Obsilo, an AI agent embedded in Obsidian.

**Values:**
- Nuetzlichkeit vor Hoeflichkeit
- ...

**Anti-Patterns:**
- Keine Floskeln
- ...

**Communication style:**
- Deutsch, Augenhoehe, kompakt

If unsure about your own features, call recall_memory(profile='_obsilo')
or inspect_self({area: 'capabilities'|'tools'|'settings'}).
```

L1 (hardcoded) + L2 (aus SoulView). Limitiert auf top-N pro Kategorie nach
importance + recency, total <= 220 Tokens. KV-Cache-stabil (kommt VOR
volatilem User-Hot-Memory).

### Aufgabe 4 -- update_soul-Tool

`src/core/tools/memory/UpdateSoulTool.ts`. Agent-facing.

```ts
input_schema: {
    category: 'value' | 'anti_pattern' | 'identity' | 'communication',
    text: string,
    importance?: number, // default 0.7
    supersedes?: number, // fact id, optional
    rationale?: string,
}
```

Inserts via FactStore mit `profile_id='_obsilo'`, `kind='identity'`,
`source_interface='obsilo-self'`, `topics=['soul', category]`. Bei
`supersedes`: FactStore.supersede.

### Aufgabe 5 -- inspect_self-Tool

`src/core/tools/agent/InspectSelfTool.ts`. Live-Introspect, kein DB-Read fuer L4.

```ts
input_schema: {
    area: 'settings' | 'tools' | 'capabilities' | 'code',
    topic?: string,
}
```

- `settings`: liest plugin.settings, Filter regex `/(api[_-]?key|token|secret|password)/i` -> redacted.
- `tools`: listet plugin.toolRegistry.list() mit { name, description, isWriteOperation }.
- `capabilities`: shortcut auf SoulView.getCapabilities() -> formatierte Liste.
- `code, topic`: liest die ersten 30 Zeilen jedes `src/core/<topic>/*.ts` (JSDoc-Header). Phase 2.

Output als Markdown-Block, max ~2000 Tokens (truncated mit Hinweis).

### Aufgabe 6 -- ToolRegistry + builtinModes

```ts
this.register(new UpdateSoulTool(this.plugin));
this.register(new InspectSelfTool(this.plugin));
```

ToolGroups:
- `vault: [..., 'update_soul']` (memory-write, agent-facing)
- `agent: [..., 'inspect_self']` (control-flow / introspect)

### Aufgabe 7 -- Plugin Onload Capability-Sync

`src/main.ts` in `onload`, nach Memory-DB-Init:

```ts
if (this.memoryDB?.isOpen()) {
    const newHash = manifestHash();
    if (this.settings.memory.lastCapabilityHash !== newHash) {
        await this.syncCapabilitySnapshot(newHash);
    }
}
```

`syncCapabilitySnapshot`:
1. listLatest mit profile_id='_obsilo' AND topics CONTAINS 'capability'
2. Pro Eintrag FactStore.deprecate('superseded by new manifest').
3. Pro CAPABILITIES-Entry: FactStore.insert mit area+key in topics, summary als text.
4. settings.memory.lastCapabilityHash = newHash; saveSettings.

Synchron beim onload, < 200ms. Fehler nicht-fatal (Plugin laed weiter).

### Aufgabe 8 -- Settings-UI

`src/ui/settings/MemoryTab.ts` neue Section "Obsilo's soul".

Komponenten:
- Liste pro Kategorie (Werte, Anti-Patterns, Identitaet, Communication).
- Add-Button -> opens TextArea-Modal.
- Edit-Button per Row -> Modal mit Pre-fill.
- Deprecate-Button per Row mit Confirm.
- Read-only Section "Capabilities (auto-synced)" -> SoulView.getCapabilities().

### Aufgabe 9 -- Migration legacy soul.md

Eigene Migrations-Action im MemoryTab, Button "Import legacy soul.md".

1. Liest `memory/soul.md` via fs.
2. Parsed Sections: Name, Communication, Values, Anti-Patterns, Identity (Markdown headings).
3. Pro Eintrag: insert als L2-Fact mit korrekter category.
4. Idempotent: vor Insert duplicate-check via SoulView Query (text-match).
5. Notice mit count.

Keine automatische Loeschung der soul.md. User entscheidet selbst.

### Aufgabe 10 -- SystemPrompt-Pointer

In ContextComposer-Render: nach dem Soul-Block ein konstanter Pointer:

```
You can recall_memory(profile='_obsilo', topics=['capability', '...'])
when uncertain about your features. Use inspect_self({area:'settings'})
for current configuration values, inspect_self({area:'tools'}) for
available tools.
```

~80 Tokens, KV-Cache-stabil.

### Aufgabe 11 -- Tests

- `__tests__/SoulView.test.ts`: read paths fuer alle Kategorien, profile-Filter, Empty-Cases.
- `__tests__/CapabilityManifest.test.ts`: Hash-Stabilitaet, Sync-Idempotenz, Deprecate+Insert-Cycle.
- `__tests__/UpdateSoulTool.test.ts`: input-validation, FactStore-Aufrufe, supersedes-Pfad.
- `__tests__/InspectSelfTool.test.ts`: settings-redaction, tools-list, capability-aggregation.
- `__tests__/ContextComposer.test.ts` Erweiterung: Soul-Block-Rendering, Token-Cap-Enforcement.

### Aufgabe 12 -- Eval-Fixtures

3 neue JSON-Fixtures in `__tests__/conversation-fixtures/`:
- `13-soul-edit.json`: User sagt "merk dir, ich mag keine Floskeln" -> Agent ruft update_soul.
- `14-capability-inquiry.json`: User fragt "wie speicher ich einen Chat?" -> Agent ruft recall_memory(profile='_obsilo') statt zu raten.
- `15-settings-inquiry.json`: User fragt "ist auto-extract an?" -> Agent ruft inspect_self({area:'settings'}).

### Aufgabe 13 -- Backlog + Memory-Status updates

- _devprocess/context/BACKLOG.md: Phase 4.5 als "Implemented" markieren mit Commit-Refs.
- ~/.claude/.../project_memory_v2_status.md: Phase 4.5-Block ergaenzen.

## Dateien-Zusammenfassung

| Datei | Aenderung | Risiko |
|-------|-----------|--------|
| `src/core/memory/CapabilityManifest.ts` | NEU | Klein |
| `src/core/memory/SoulView.ts` | NEU | Klein |
| `src/core/memory/ContextComposer.ts` | + Soul-Block + Pointer | Mittel |
| `src/core/tools/memory/UpdateSoulTool.ts` | NEU | Klein |
| `src/core/tools/agent/InspectSelfTool.ts` | NEU | Klein |
| `src/core/tools/ToolRegistry.ts` | + 2 register | Klein |
| `src/core/modes/builtinModes.ts` | + tools in groups | Klein |
| `src/core/tools/types.ts` | + 2 ToolName-Eintraege | Klein |
| `src/main.ts` | + Capability-Sync onload | Mittel |
| `src/types/settings.ts` | + lastCapabilityHash | Klein |
| `src/ui/settings/MemoryTab.ts` | + Soul-Editor-Section + Migration-Button | Mittel |
| `src/i18n/locales/en.ts` | + i18n-keys | Klein |
| `src/core/memory/__tests__/*.test.ts` | NEU + Erweiterungen | Klein |
| `src/core/memory/__tests__/conversation-fixtures/*.json` | + 3 Fixtures | Klein |

## Nicht betroffen

- `src/core/memory/SingleCallExtractor.ts` -- bleibt unveraendert.
- `src/core/memory/FactIntegrator.ts` -- bleibt unveraendert.
- `src/core/memory/MemoryDB.ts` -- kein Schema-Change (profile_id existiert seit v3).
- `src/core/memory/CommunicationStyleStore.ts` -- read-only Legacy.
- `src/core/memory/MemoryAtomizer.ts` -- bleibt unveraendert.
- ExtractionQueue, SingleCallProcessor -- bleibt unveraendert.

## Verifikation

1. `npm run build` clean.
2. `npx vitest run` alle gruen, +30-40 neue Tests.
3. Live-Test:
   - Plugin reload -> Capability-Snapshot in DB persistiert.
   - Settings -> Memory -> Obsilo's soul -> Eintrag hinzufuegen, sieht Aenderung im naechsten Conversation-Turn.
   - Agent fragen "wie speichere ich einen Chat?" -> erhaelt korrekte Antwort via recall_memory.
   - Agent fragen "merk dir, ich mag keine Emojis" -> ruft update_soul auf.
   - inspect_self({area:'settings'}) -> JSON ohne API-Keys.
4. Hallucination-Regression: Eval-Fixture 13/14/15 gruen.
5. KV-Cache-Test: Soul-Block kommt immer in stabiler Reihenfolge, Cache bleibt warm.

## Architecture-Entscheidungen (2026-04-28)

A. **profile-Filter-API:** Zwei separate compose-Calls. ContextComposer.compose({profile:'_obsilo'}) liefert Soul-Block; zweiter Call mit User-Profil liefert User-Memory-Block. Caller (System-Prompt-Builder) konkateniert beide. Saubere Trennung, beide Bloecke unabhaengig cache-stabil, ContextRanker bleibt profile-naiv.

B. **L2 Token-Cap:** Top-3 pro Kategorie (Werte/Anti-Patterns/Identity/Communication) = max 12 Eintraege total. Vorhersagbar (~150-200 Tokens). SoulView ranking nach importance DESC, Tiebreaker last_used_at DESC.

C. **Capability-Hash:** djb2 sync (32-bit). Sync im onload-Pfad noetig (kein await), kollisionsarm fuer ~100 kuratierte Eintraege. Implementierung 5 Zeilen, kein crypto-Import.

D. **inspect_self code-area:** Phase 1 = settings + tools + capabilities only. code-Reading defer als Phase 2 mit eigenem Driver. Tool-Schema laesst code-area als Enum-Wert offen, Implementierung returnt "not yet implemented" -- so bleibt API forward-kompatibel.

## Implikationen fuer den Plan

- Aufgabe 3 ContextComposer-Erweiterung: nur Soul-Block-Rendering + Top-3-Cap pro Kategorie. Kein Profile-Multi.
- Aufgabe 7 Capability-Sync: djb2-Helper inline, kein Web-Crypto-Import.
- Aufgabe 5 inspect_self: 3 Areas implementieren, 'code' wirft "not yet implemented".
- SystemPrompt-Builder (vermutlich AgentSidebarView oder MemoryService) muss zwei compose-Calls coordinieren -- finden wir in Block C.
