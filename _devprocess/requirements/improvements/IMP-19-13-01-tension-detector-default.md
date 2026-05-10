# IMP-19-13-01: TensionDetector default-instanziiert im Produktpfad

**Prioritaet:** P2
**Feature-Bezug:** FEAT-19-13 (Tension-Detection beim Deep-Ingest), EPIC-19

## Problem

[IngestDeepTool.ts:153](src/core/tools/vault/IngestDeepTool.ts#L153)
uebergibt `tensionDetector: undefined` an `DeepIngestPipeline`.
Code-Kommentar: "TensionDetector mit Cosine-Pre-Filter via Vault-Search
wuerde echten SemanticIndex-Hook erfordern. Vereinfacht: optional
spaeter."

Folge: FEAT-19-13 hat Implementierung + Tests, ist aber im Produktpfad
nicht aktiv. Tension-Marker werden nie als Inline-Callouts in
Sense-Making-Notes eingefuegt, obwohl der Detector dazu in der Lage
waere.

## Scope

1. SemanticIndex-Hook im IngestDeepTool: bei `plugin.knowledgeDB`
   verfuegbar, instanziiere `new TensionDetector(...)` mit den
   Cosine-Pre-Filter-Parametern aus BA-25 Section 12.4.
2. Settings-Toggle `vaultIngest.tensionDetectionEnabled` (Default
   true wenn KnowledgeDB open).
3. Bei fehlender DB: Detector bleibt undefined, kein Crash.

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | Bei aktiver KnowledgeDB werden Tension-Marker im Sense-Making-Body sichtbar |
| AC-02 | Toggle in Settings deaktiviert die Detection (kein Performance-Cost) |
| AC-03 | Ohne DB: Skill bricht nicht, Notes ohne Tension-Marker geschrieben |

## Files

- `src/core/tools/vault/IngestDeepTool.ts`: TensionDetector-
  Instantiation.
- `src/main.ts` (oder Settings): Toggle fuer
  `tensionDetectionEnabled`.
- Test: end-to-end mit fake-SemanticIndex und konstruiertem Tension.
