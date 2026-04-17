# ADR-074: Dependency-Override-Strategie fuer transitive Vulnerabilities

**Status:** Accepted (implemented in v2.5.0)
**Date:** 2026-04-17
**Deciders:** Sebastian Hanke
**Bezug:** Querschnittliche Security-Maintenance (kein eigenes Feature). Begleitet IMPL-007 Phase 1. Aktuelle Anlaesse: Dependabot #31 (hono), #32 (dompurify), #33 (protobufjs).

## Context

Drei aktuelle Dependabot-Alerts betreffen transitive Dependencies, die wir nicht direkt importieren:

| Alert | Paket | Pfad |
|-------|-------|------|
| #33 (Critical) | protobufjs | `@huggingface/transformers > onnxruntime-web > protobufjs` |
| #31 (Medium) | hono | `@modelcontextprotocol/sdk > @hono/node-server > hono` |
| #32 (Medium) | dompurify | `mermaid > dompurify` |

Wir koennen die direkten Pakete nicht aktualisieren, weil:
- `@huggingface/transformers` 4.0.1 ist die aktuellste Version, sie zieht selbst noch die alte protobufjs-Version.
- `@modelcontextprotocol/sdk` 1.29.0 zieht hono 4.12.12. Ein Bump des SDK auf eine Version mit hono 4.12.14+ ist nicht verfuegbar.
- `mermaid` 11.14.0 ist die aktuellste, sie zieht dompurify 3.3.3.

Die Konsequenz: Dependabot bleibt rot, der Public-Approval-Prozess (PR #11394) wird nicht weiterlaufen, weil GitHub Security die Critical-Severity blockiert.

Die naheliegende Loesung sind `npm overrides` (npm 8.3+, wir nutzen npm 10). Damit zwingen wir npm, fuer transitive Dependencies eine bestimmte Version zu verwenden, unabhaengig vom semver-range des Parents.

## Decision Drivers

- **Security-First:** Critical-Vulnerabilities mussen schnell weg, auch wenn das praktische Risiko bei uns gering ist.
- **Compatibility:** Override darf den Konsumenten nicht brechen. protobufjs 7.x ist der gleiche Major wie 7.5.4, also semver-kompatibel. hono 4.12.14 ist Patch-Release. dompurify 3.4.0 ist Minor-Release.
- **Maintainability:** Overrides muessen entfernt werden, sobald die Upstream-Versionen die Patches uebernehmen.
- **Visibility:** Overrides sind ein Hidden-State Risiko. Sie muessen dokumentiert sein.

## Considered Options

### Option A: `npm overrides` mit Patch-Compat-Versionen

```json
{
  "overrides": {
    "protobufjs": "^7.5.5",
    "hono": "^4.12.14",
    "dompurify": "^3.4.0"
  }
}
```

**Pro:** Schnell, npm-nativ, kein Build-Tool-Wechsel, semver-kompatibel.
**Contra:** Versteckt fuer User die `package.json` ueberfliegen. Risiko von Drift wenn Upstream-Versionen sich aendern.

### Option B: Eigene Forks der Upstream-Pakete

**Pro:** Volle Kontrolle.
**Contra:** Wartungs-Albtraum. Wir muessten drei Pakete selbst maintainen.

### Option C: Dependency entfernen

`dompurify` ist nur via mermaid drin. mermaid wird im Chat-UI fuer Diagramme genutzt. Entfernen ist eine Funktionseinbusse.

`hono` ist Teil des MCP-SDK. Entfernen wuerde das Connector-Feature brechen.

`protobufjs` ist Teil der ONNX-Runtime. Entfernen wuerde den Reranker brechen.

Keine Variante davon ist akzeptabel.

### Option D: Warten auf Upstream-Update

**Pro:** Saubere Loesung.
**Contra:** Unbekannter Zeitrahmen, Public-Approval blockiert, Critical-Severity offen.

## Decision

**Option A.** `npm overrides` fuer alle drei Pakete, dokumentiert in einem `OVERRIDES.md` (oder Block-Kommentar in package.json), mit periodischem Review-Reminder.

### Implementation

```json
{
  "overrides": {
    "protobufjs": "^7.5.5",
    "hono": "^4.12.14",
    "dompurify": "^3.4.0"
  }
}
```

Wir ergaenzen einen Block-Kommentar (oder eine separate `OVERRIDES.md`), die fuer jedes Override dokumentiert:
- Warum es existiert (CVE-Link, Dependabot-Alert).
- Welcher Konsument das Paket zieht.
- Wann der Override entfernt werden kann (sobald Upstream patcht).
- Welche Smoke-Tests pruefen muessen, dass der Override nicht bricht.

### Smoke-Tests pro Override

| Override | Smoke-Test |
|----------|-----------|
| protobufjs ^7.5.5 | semantic_search mit Reranker laeuft, Embedding-Modell laedt |
| hono ^4.12.14 | MCP-Server ueber Claude Desktop antwortet auf list_tools und call_tool |
| dompurify ^3.4.0 | Mermaid-Block im Sidebar-Chat rendert ohne Sanitization-Fehler |

### Review-Cadence

Bei jedem Release (4-wochig oder oefter): `npm outdated` und `npm audit --production` laufen. Sobald die direkten Dependencies die Patches enthalten, Override entfernen.

## Consequences

### Pro

- Dependabot ist gruen.
- Public-Approval ist nicht durch Vulnerabilities blockiert.
- Wenig Code-Aenderung.

### Contra

- Hidden-State (Override-Versionen) muss bei jedem Release geprueft werden.
- Riskante kuenftige Major-Bumps der direkten Pakete koennten zu Konflikten fuehren.

### Folgeentscheidungen

- Migration weg von `@huggingface/transformers` (z.B. native node-onnxruntime) bleibt offen, aber unabhaengig vom Override.
- Wir koennten ueberlegen, mermaid nur on-demand zu laden, um die Angriffsflaeche zu reduzieren.

## Verification

- `npm install` und `npm audit --production` zeigt 0 Critical/Medium nach Apply.
- Drei Smoke-Tests laufen lokal und in CI durch.
- Dependabot Re-Scan zeigt 0 Critical/Medium auf dem main-Branch.
