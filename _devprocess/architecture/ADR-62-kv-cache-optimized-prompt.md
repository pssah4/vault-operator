# ADR-62: KV-Cache-Optimized Prompt Structure & Provider-Agnostic Caching

**Date:** 2026-04-04
**Deciders:** Sebastian Hanke
**Feature:** FEAT-18-01 (Prompt Caching)

## Context

Der System Prompt (~25k Tokens) wird bei jeder Iteration identisch gesendet.
Anthropic Prompt Caching ist bereits teilweise implementiert (cache_control
Breakpoints in `anthropic.ts:60-89`), aber zwei Design-Probleme verhindern
effektives Caching:

1. **DateTime an Position 1**: `getDateTimeSection()` steht am Anfang des
   System Prompts und enthaelt den aktuellen Zeitstempel. Jeder neue API-Call
   hat einen anderen Timestamp → der gesamte KV-Cache wird invalidiert.

2. **Skills an Position 3**: Skills werden pro User-Message dynamisch via
   LLM-Klassifikation zusammengestellt. Unterschiedliche Skills → Cache-Invalidierung
   fuer alles danach.

Manus Context Engineering zeigt: Ein einziger veraenderter Token im Prefix
invalidiert den gesamten KV-Cache. Die Section-Reihenfolge ist entscheidend.

**Triggering ASR:**
- C-3: Prompt Caching darf die Prompt-Semantik nicht veraendern
- Quality Attributes: Cost Efficiency, Compatibility

## Decision Drivers

- **KV-Cache-Stabilitaet**: Stabiler Prefix > 90% der System-Prompt-Tokens
- **Provider-Agnostik**: Pattern muss mit allen Providern funktionieren
- **Qualitaetserhalt**: Section-Umordnung darf Agent-Verhalten nicht verschlechtern
- **Bestehende Implementierung nutzen**: Anthropic cache_control ist bereits da

## Considered Options

### Option 1: Nur Section-Reordering (Stabile zuerst, Dynamische zuletzt)

System Prompt Sections umordnen: Alles Stabile (Tools, Routing, Capabilities)
zuerst, alles Dynamische (DateTime, Skills, Memory, Recipes) zuletzt.

- Pro: Maximale Cache-Stabilitaet fuer alle Provider (auch automatisches Prefix-Caching)
- Pro: Keine neue Abstraktion noetig
- Pro: Funktioniert ohne Provider-spezifischen Code
- Con: Skills verlieren "Primacy Effect" (aktuell an Position 3)
- Con: DateTime am Ende ist ungewoehnlich

### Option 2: Zwei-Block System Prompt (Stable + Dynamic)

System Prompt in zwei separate Bloecke aufteilen:
Block 1 (cached): Alle stabilen Sections
Block 2 (nicht cached): Alle dynamischen Sections
Bei Anthropic: cache_control Breakpoint zwischen Block 1 und 2.
Bei anderen: Block 1 bleibt identisch → automatisches Prefix-Caching.

- Pro: Explizite Trennung von cached und nicht-cached
- Pro: Anthropic cache_control praezise platziert
- Pro: Andere Provider profitieren automatisch vom stabilen Prefix
- Con: System Prompt ist jetzt ein Array statt String (API-Aenderung)
- Con: Erfordert Anpassung in allen Providern (Typ-Aenderung)

### Option 3: Reordering + Adapter-Pattern fuer Cache-Hints

Section-Reordering (Option 1) kombiniert mit einem leichtgewichtigen
Adapter-Interface das Provider-spezifische Cache-Hints einfuegt.
System Prompt bleibt ein String. Adapter markiert nur wo der stabile
Anteil endet (fuer Provider die explizite Markierung brauchen).

- Pro: Einfachstes Adapter-Interface (`markCacheBreakpoint(systemPrompt, position)`)
- Pro: Section-Reordering funktioniert fuer ALLE Provider (auch ohne Adapter)
- Pro: System Prompt bleibt ein String (minimale API-Aenderung)
- Pro: Neuer Provider = nur Adapter registrieren (<30 Zeilen)
- Con: Weniger praezise als Zwei-Block-System
- Con: Breakpoint-Position muss deterministisch berechnet werden

## Decision

**Vorgeschlagene Option:** Option 3 -- Reordering + Adapter-Pattern

**Begruendung:**

Die Section-Umordnung ist der wichtigste Hebel und funktioniert fuer ALLE Provider
ohne Code-Aenderung (Prefix-Caching bei OpenAI/DeepSeek ist automatisch). Das
Adapter-Pattern ist nur fuer Provider noetig die explizite Markierung brauchen
(Anthropic). Damit ist die Loesung von Anfang an Provider-agnostisch.

Option 2 waere praeziser, erfordert aber eine Typ-Aenderung (String → Array) die
durch alle Provider-Implementierungen propagiert. Das ist unverhaeltnismaessig viel
Aufwand fuer den Mehrwert.

**Section-Reihenfolge (neu):**

```
STABIL (Position 1-8, aendert sich NIE innerhalb einer Task-Session):
  1. Mode Definition (aendert sich nur bei switch_mode, selten)
  2. Capabilities
  3. Obsidian Conventions
  4. Tools Section (~8k Tokens, groesster stabiler Block)
  5. Tool Routing Rules
  6. Objective
  7. Response Format
  8. Security Boundary
  ═══ CACHE BREAKPOINT ═══

DYNAMISCH (Position 9-16, kann sich pro Message/Session aendern):
  9. Plugin Skills (aendert sich wenn Plugins enabled/disabled werden)
  10. Active Skills (LLM-klassifiziert, pro Message anders)
  11. Memory Context (aendert sich ueber Sessions)
  12. Procedural Recipes (pro Message unterschiedlich)
  13. Self-Authored Skills
  14. Custom Instructions + Rules
  15. Vault Context (Dateistruktur kann sich aendern)
  16. DateTime (MUSS am Ende stehen -- Zeitstempel invalidiert Cache!)
```

NOTE: Plugin Skills wurden bewusst in den dynamischen Block verschoben.
Obwohl sie innerhalb einer Task-Session meist stabil sind, koennen sie
sich zwischen Tasks aendern (Plugin enabled/disabled). Da der KV-Cache
bei Anthropic eine TTL von 5 Minuten hat, wuerde ein Plugin-Toggle
zwischen zwei Tasks den gesamten stabilen Block invalidieren.
Die Tools Section (~8k Tokens) bleibt im stabilen Block und ist der
groesste Cache-Gewinn.

**Primacy Effect Mitigation:**
Skills rutschen von Position 3 auf Position 10. Der "Primacy Effect" geht
verloren. Mitigation: Die Todo-Liste als Recency-Anker am Ende des Kontexts
(FEAT-18-00) kompensiert dies. Ausserdem: Skills werden weiterhin mit
`SKILL PRECEDENCE (MANDATORY)` markiert, was bei allen getesteten Modellen
ausreichend stark ist.

## Implementation Sketch

### systemPrompt.ts Aenderung

```typescript
// Neue Section-Reihenfolge (KV-Cache-optimiert, ADR-62)
const sections: string[] = [
    // STABIL (cached) ─────────────────────────
    getModeDefinitionSection(mode),
    getCapabilitiesSection(webEnabled),
    getObsidianConventionsSection(),
    getToolsSection(mode.toolGroups, mcpClient, allowedMcpServers, webEnabled, !isSubtask),
    getToolRoutingSection(configDir),
    getObjectiveSection(),
    isSubtask ? '' : getResponseFormatSection(),
    getSecurityBoundarySection(),
    // ═══ CACHE BREAKPOINT (injiziert via Adapter) ═══
    // DYNAMISCH (nicht cached) ────────────────
    getPluginSkillsSection(pluginSkillsSection),
    isSubtask ? '' : getSkillsSection(skillsSection),
    isSubtask ? '' : getMemorySection(memoryContext),
    (isSubtask || !recipesSection) ? '' : recipesSection,
    (isSubtask || !selfAuthoredSkillsSection) ? '' : selfAuthoredSkillsSection,
    isSubtask ? '' : getCustomInstructionsSection(globalCustomInstructions, mode.customInstructions),
    getRulesSection(rulesContent),
    getExplicitInstructionsSection(),
    getDateTimeSection(includeTime) + getVaultContextSection(),
];
```

### Cache-Hints (Provider-intern, kein separater Adapter noetig)

Der Coding-Review (2026-04-05) ergab: Ein separates PromptCacheAdapter Interface
ist Over-Engineering. Die Provider haben bereits die noetige Logik:

- **Anthropic:** `anthropic.ts:87-90` setzt bereits `cache_control` auf den System Prompt.
  Keine Aenderung noetig -- durch das Section-Reordering ist der stabile Prefix automatisch
  am Anfang und wird korrekt gecached.
- **OpenAI/DeepSeek:** Automatisches Prefix-Caching. Kein Code noetig.
- **GitHub Copilot:** Kein Caching (Gateway-managed). Kein Code noetig.

Die einzige Aenderung ist das Section-Reordering in `systemPrompt.ts`.
Kein neues Interface, kein neues Modul, keine Provider-Aenderungen.

### DateTime + VaultContext trennen

Aktuell in Zeile 140: `getDateTimeSection(includeTime) + getVaultContextSection()`
sind als EIN String konkateniert. Fuer das Reordering muessen sie getrennt werden:

```typescript
// ALT (Zeile 140):
getDateTimeSection(includeTime) + getVaultContextSection(),

// NEU (zwei separate Eintraege):
getVaultContextSection(),   // -> Position 15 (dynamisch, Dateistruktur aendert sich)
getDateTimeSection(includeTime),  // -> Position 16 (LETZTE Section)
```

## Consequences

### Positive
- KV-Cache-Stabilitaet fuer ~80% des System Prompts
- Automatisches Prefix-Caching bei OpenAI, DeepSeek (Zero-Config)
- Explizites Caching bei Anthropic (praeziser Breakpoint)
- Neuer Provider mit Caching = 1 Adapter (<30 Zeilen), kein neues Feature
- ~50-90% Kostenreduktion auf den stabilen Anteil (Provider-abhaengig)

### Negative
- Skills verlieren Primacy Effect (Position 3 → 10)
- Plugin Skills im dynamischen Block (koennen nicht gecached werden, ~500 Tokens)
- DateTime am Ende statt am Anfang (LLM sieht es spaeter)
- Stabiler Block ist kleiner (~20k statt ~25k Tokens), aber zuverlaessiger stabil

### Risks
- **Primacy-Effect-Verlust verschlechtert Skill-Befolgung**: Mitigation durch
  empirischen A/B-Test VOR dem Release. Falls messbare Verschlechterung:
  Skills-Precedence-Reminder als letzten dynamischen Block hinzufuegen.
- **Cache-Invalidierung durch Mode-Wechsel**: Mode Definition steht im stabilen Block.
  Bei switch_mode aendert sich der Prefix. Mitigation: switch_mode ist selten
  (meist 0-1x pro Task) und invalidiert den Cache fuer die restlichen Iterationen.
  Akzeptabler Trade-off.

## Related Decisions

- ADR-08: Modular Prompt Sections (bestehende Section-Architektur)
- ADR-61: Fast Path (profitiert vom Cache, interagiert via History)

## Implementation Notes (2026-04-05)

Implemented as designed. Section order in systemPrompt.ts changed to stable-first.
DateTime moved from position 1 to position 17 (last). Plugin Skills moved to dynamic block.
No separate PromptCacheAdapter needed -- provider-internal logic suffices.

Test results:
- Simple task: 634k -> 60k tokens (90.5% reduction)
- GitHub Copilot (168k limit): was crashing, now works at 60k

Key files:
- `src/core/systemPrompt.ts` (section reordering)

## Update 2026-05-09: Korrektur zwei impliziter Annahmen

Issue #313 und der Code-Audit von 2026-05-09 zeigen, dass zwei Annahmen
dieser ADR ergaenzungsbeduerftig waren:

1. **"Andere Provider profitieren automatisch vom stabilen Prefix":**
   trifft fuer OpenAI und DeepSeek zu, fuer Bedrock NICHT. Bedrock
   benoetigt explizite `cachePoint`-ContentBlocks im Request, sonst
   meldet die Response `cacheReadInputTokens: 0`. Anthropic-Modelle
   ueber Bedrock zahlen ohne diesen Marker die volle Rate.

2. **UI-Visibility provider-spezifisch:** der Toggle in
   `ModelConfigModal` war an Provider-Strings gekoppelt, nicht an
   Provider-Capabilities. Neue cache-faehige Provider (Bedrock,
   Kilo Gateway, OpenRouter) hatten keinen Schalter.

Beide Punkte werden in ADR-111 (Provider Capability-Flag und Bedrock
cachePoint) adressiert. Diese ADR bleibt in ihrer Kern-Entscheidung
gueltig (Section-Reordering, kein separater Adapter), wird nicht
superseded. ADR-111 ergaenzt sie additiv.

## Amendment 2026-05-12 (EPIC-24 / FEAT-24-01): Cache-Praefix-Stabilisierung -- die Section-Reihenfolge allein reicht nicht

**Befund (5-Provider-Messlauf 2026-05-12, Diagnose-Log `[CacheStat:<provider>]`):** Die hier entschiedene Section-Reihenfolge (DateTime und Memory ans Ende) ist umgesetzt, bleibt auf dem Anthropic-Direkt-Pfad aber wirkungslos: der Cache-Marker liegt auf dem **gesamten** System-Prompt-Block, der den volatilen Tail (DateTime, Memory, Active Skills, Recipes, Vault Context) **enthaelt**. Da der Cache-Key der ganze Block ist und der DateTime-Abschnitt pro Call wechselt, gibt es bei jeder Iteration einen Cache-Miss + Re-Write; Anthropic schlaegt +25 % auf Cache-Writes auf, also ist Caching auf diesem Pfad in der Summe teurer als ohne. Der "CACHE BREAKPOINT" zwischen Section 8 und 9 war bisher nur ein Kommentar, kein echter zweiter Marker. Die Auto-Caching-Provider (OpenAI, Copilot, OpenRouter) cachen dagegen schon: 75-99 % Hit ab Call 2. Auf Bedrock fehlt jeder Marker (siehe ADR-111).

**Entscheidung (ergaenzt ADR-62 additiv, kein Supersede):** die urspruenglich verworfene Option 2 (Zwei-Block-System-Prompt) wird fuer Provider mit explizitem Cache-Marker als zusaetzliche Cache-Hint-Schicht *im Provider* eingefuehrt -- nicht als globale Typ-Aenderung der Rueckgabe von `buildSystemPromptForMode`. Konkret:

1. **Provider-seitiger Split am dokumentierten "CACHE BREAKPOINT":** der Provider trennt den System-Prompt am Marker-String in den stabilen Block (Sections 1-8) und den volatilen Tail; nur der stabile Block bekommt `cache_control` (Anthropic) bzw. `cachePoint` (Bedrock, siehe ADR-111), der Tail keinen. Der Split-Punkt wird deterministisch ueber den Marker-String gefunden, der System-Prompt wird nicht neu gebaut.
2. **DateTime auf Tagesgranularitaet** als Default (Datum, kein Time-of-Day); Time-of-Day nur auf explizite Anforderung. Gilt fuer alle Provider und verbessert auch die Auto-Caching-Hit-Rate.
3. **Eigener Cache-Marker auf dem `tools`-API-Feld** (Anthropic erlaubt `cache_control` auf dem letzten Tool) -- ~30k Tokens, relevanter Block, heute ungecacht.
4. **Rollende Cache-Marker in der Message-History** (1-2): einer wandert pro Turn Richtung Ende, einer bleibt weiter hinten -- damit auch der Konversationsteil langer Sessions ueberwiegend Cache-Reads erzeugt.
5. **`cached_tokens` der OpenAI-Familie in `usage`-Chunk und Kostenrechnung verdrahten** (gehoert zu IMP-18-01-02, hier nur referenziert) -- sonst zeigt die Kostenanzeige 2-3x zu hoch, weil Cache-Reads zum Vollpreis gebucht werden.

**Abgrenzung:** Kern-Entscheidung dieser ADR (stabile Sections zuerst, kein separates Adapter-Interface, Cache-Hint-Logik provider-intern) bleibt gueltig. Bedrock-`cachePoint` und das `cached_tokens`-Wiring sind in ADR-111 / IMP-18-01-02 verortet; dieses Amendment ergaenzt sie um den echten Split-Punkt, die DateTime-Granularitaet, den `tools`-Marker und die History-Marker.

**Beleg:** EnBW Cowork (`prompt-cache-utils.ts`) nutzt dieselbe 1-Marker-Mechanik wie Obsilo, erreicht aber echte Hits -- weil dort der System-Prompt sessionweit stabil ist (tagesgranulares Datum, kein per-Turn-Memory-Inject, Session-Reuse ueber einen System-Prompt-Hash). Nicht die Mechanik ist das Problem, sondern die Volatilitaet vor dem Marker.

**Implementation Notes (2026-05-12, kann veralten):** Split-Anker = die `── CACHE BREAKPOINT ──`-Kommentarzeile in `systemPrompt.ts`. `anthropic.ts`: statt `[{type:'text', text:<ganzer String>, cache_control}]` -> `[{type:'text', text:<stabiler Teil>, cache_control}, {type:'text', text:<volatiler Teil>}]`; Marker zusaetzlich auf dem letzten Eintrag des `tools`-Arrays. `getDateTimeSection(includeTime=false)` als Default. Diagnose: `src/api/logCacheStat.ts` (`[CacheStat:<provider>]`, IMP-24-05-01). Verwandt: ADR-111, IMP-18-01-02, FEAT-24-01, FIX-24-01-01.

## References

- FEAT-18-01: Prompt Caching (Provider-agnostisch)
- Manus Context Engineering: "Keep your prompt prefix stable"
- Anthropic Prompt Caching Docs: cache_control Breakpoints
- OpenAI Prompt Caching: Automatisches Prefix-Caching ab 1024 Tokens
- RESEARCH-36: Agent-Loop Kosten-Refactoring (5-Provider-Messlauf, Befund B)
