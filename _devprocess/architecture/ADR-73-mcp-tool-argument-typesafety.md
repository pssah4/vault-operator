# ADR-73: MCP-Tool-Argument Type-Safety

no-explicit-any disables that motivated this ADR are no longer in the
tree, so the proposed coerceStringArg/coerceNumberArg helpers were not
introduced. Kept as a reference in case future MCP tool growth re-raises
the type-safety question.
**Date:** 2026-04-17
**Deciders:** Sebastian Hanke
**Bezug:** Querschnittliche Review-Bot-Compliance (kein eigenes Feature). Begleitet IMPL-007 Phase 6. Siehe `memory/review-bot-compliance.md` fuer die kanonische Regel-Liste.

## Context

Der Review-Bot meldet konsistent zwei verwandte Klassen von Findings im MCP-Code:

1. **`@typescript-eslint/no-explicit-any` Disables:** `RerankerService.ts:33,35`, `SemanticIndexService.ts:1170`, `CloudflareDeployer.ts:126,224`, `McpBridge.ts:134,136`. Begruendung war "MCP-SDK-Typen sind unscharf", aber damit ist die Regel global ausgehebelt.

2. **Object-Stringification Warnings:** Aufrufe wie `args.query ?? ''` werden in Template-Literals interpoliert. Wenn `args.query` weder string noch undefined ist (z.B. ein Object), wird `[object Object]` interpoliert. Betroffen sind die zentrale MCP-Tool-Registry sowie mehrere Tool-Module (`searchVault`, `syncSession`, `updateMemory`, `RelayClient`, `inputSchemaValidator`).

Die zweite Klasse ist eine direkte Folge der ersten: weil wir `args` als `any` typisieren, erkennt TypeScript nicht, dass die einzelnen Felder unsicher sind. Wenn wir `args` als typed-Schema beschreiben, faellt der Stringification-Fall in Type-Errors auf.

Der MCP-Server-Worker laeuft in einem Worker-Thread mit eigenen Konventionen. Hier braucht es eine eigene Type-Safety-Schicht.

## Decision Drivers

- **Bot-Compliance:** null Required-Findings.
- **Defense-in-Depth:** Eingehende MCP-Calls sind externe Eingaben. Type-Sicherheit ist eine Sicherheitsmassnahme.
- **Wartbarkeit:** Klare Schemas vermeiden zukuenftige Stringification-Bugs.
- **Minimaler Eingriff:** Bestehende MCP-Tool-Logik soll nicht restrukturiert werden.

## Considered Options

### Option A: `unknown` + Type-Guards

Statt `any` wird `unknown` verwendet. Jeder Tool-Handler beginnt mit Type-Guards:

```typescript
function getStringArg(args: unknown, key: string, fallback = ''): string {
    if (args && typeof args === 'object' && key in args) {
        const value = (args as Record<string, unknown>)[key];
        return typeof value === 'string' ? value : fallback;
    }
    return fallback;
}
```

**Pro:** Robust, type-safe, minimaler Mehraufwand pro Tool.
**Contra:** Boilerplate in jedem Tool.

### Option B: Zod-Schemas mit Runtime-Validation

Jedes MCP-Tool deklariert ein Zod-Schema, das die Args parsed. Bei Mismatch wird ein strukturierter Fehler an den MCP-Client zurueckgegeben.

**Pro:** Single-Source-of-Truth fuer Schema und Type. Bessere Fehlermeldungen fuer Caller.
**Contra:** Zod ist eine neue Dependency (~12 KB minified). Bei MCP-Tool-Heavy-Plugins wird das spuerbar.

### Option C: Manuelle Interface-Typen aus dem MCP-SDK uebernehmen

Das MCP-SDK exportiert `CallToolRequestSchema`. Wir definieren pro Tool ein TypeScript-Interface fuer die erwarteten Args.

**Pro:** Keine neue Dependency, klare Schemas.
**Contra:** Manuelle Pflege der Interfaces, Drift-Risiko zwischen Schema und Code.

## Decision

**Mix aus Option A und C.** Wir definieren pro Tool ein TypeScript-Interface fuer die erwarteten Args (Option C) und verwenden zentral einen Helper `coerceStringArg(args, key, fallback)` aus dem `argHelpers`-Modul (Option A).

Begruendung: Zod ist fuer 6 Tools Overkill. Die manuelle Interface-Definition ist trivial, weil wir die Schemas ohnehin in `tools/index.ts` deklarieren (fuer das MCP-SDK). Die Args-Typen sind Spiegelbilder dieser Schemas.

### Implementation-Skizze

```typescript
// src/mcp/tools/argHelpers.ts (neu)
export function coerceStringArg(
    args: unknown,
    key: string,
    fallback = '',
): string {
    if (args && typeof args === 'object' && key in args) {
        const value = (args as Record<string, unknown>)[key];
        if (typeof value === 'string') return value;
        if (value === null || value === undefined) return fallback;
        return JSON.stringify(value);
    }
    return fallback;
}

export function coerceNumberArg(args: unknown, key: string, fallback: number): number { ... }
```

```typescript
// src/mcp/tools/searchVault.ts (Beispiel)
export interface SearchVaultArgs {
    query: string;
    limit?: number;
}

export async function searchVault(args: unknown, ctx: McpToolContext) {
    const query = coerceStringArg(args, 'query');
    const limit = coerceNumberArg(args, 'limit', 10);
    if (!query) {
        return { content: [{ type: 'text', text: 'Missing query argument' }], isError: true };
    }
    ...
}
```

### Worker-Code

Der MCP-Server-Worker und der Cloudflare-Deployer haben aktuell `eslint-disable` ohne Begruendung. Wir nutzen denselben Helper-Ansatz und entfernen die Disables. Wo das nicht moeglich ist (z.B. opake SDK-Typen aus `@modelcontextprotocol/sdk`), ergaenzen wir den Disable mit `-- reason: ...`.

### Bot-Effekt

- Alle `no-explicit-any` Disables im MCP-Code entfallen.
- Alle Object-Stringification-Warnings entfallen, weil Helper explizit `JSON.stringify` ausfuehren.
- Disables die bleiben (z.B. fuer SDK-Imports) tragen `-- reason`.

## Consequences

### Pro

- Bot-Compliance ohne Funktionsverlust.
- Robuster gegen MCP-Caller-Bugs.
- Klare Migration auf Zod im Wave 3 falls noetig.

### Contra

- Boilerplate-Helper (~30 LOC) und Argument-Interfaces pro Tool.
- Marginal mehr Code zu pflegen.

## Verification

- `npm run lint` zeigt keine `no-explicit-any` Disables im MCP-Code mehr.
- Bot-Re-Scan im PR #11394 zeigt 0 Stringification-Warnings.
- Smoke-Test: alle MCP-Tools funktionieren von Claude Desktop aus.
