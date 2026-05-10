# IMP-19-25-01: Settings-UI fuer Sources- und Knowledge-Folder

**Prioritaet:** P2
**Feature-Bezug:** FEAT-19-25 (Source-Folder vs Wissens-Folder Konfiguration), EPIC-19

## Problem

FEAT-19-25 ist als Done markiert, aber die Folder-Konfiguration ist
heute nur als Generator-Support (`OutputFolderConfig` wird vom Caller
uebergeben) implementiert. Es gibt kein User-sichtbares Settings-UI,
das die Pfade `sourceFolder`, `knowledgeFolder`, `bibliographyFolder`
konfigurierbar macht. Der Caller (IngestDeepTool) hardcoded
`'Sources'` und `Knowledge/<cluster>`.

## Scope

1. Settings-Tab "Vault Ingest": drei Folder-Picker:
   - Sources-Folder (Default `Sources`)
   - Knowledge-Folder (Default `Knowledge/<cluster>` mit
     `<cluster>`-Placeholder)
   - Bibliographie-Folder (Default = sourceFolder)
2. Validation: existierende Folder oder Auto-Create-on-First-Use.
3. IngestDeepTool und IngestDocumentTool lesen die Settings statt
   hardcoded Strings.
4. Open Question aus BA-25: dedizierter Sub-Folder pro Source-Typ
   (Sources/PDFs, Sources/Articles) vs einziger Folder. Default:
   einziger Folder (kompakter), Sub-Folder als opt-in via Pattern-
   Property im Pfad-Template.

## Akzeptanzkriterien

| ID | Criterion |
|---|---|
| AC-01 | Settings-Tab zeigt 3 Folder-Picker mit Default-Werten |
| AC-02 | IngestDeepTool nutzt die Settings-Werte, nicht hardcoded |
| AC-03 | Auto-Create funktioniert wenn Folder noch nicht existiert |
| AC-04 | Cluster-Placeholder in Knowledge-Folder-Pfad funktioniert |

## Files

- `src/ui/settings/VaultTab.ts`: 3 Folder-Picker erweitern.
- `src/core/tools/vault/IngestDeepTool.ts`: Settings-Read statt
  hardcoded.
- `src/main.ts` Settings-Schema.
