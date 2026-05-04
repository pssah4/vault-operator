# BUG-014: TMP-Files nicht lesbar auf Windows (Pfad-Trennzeichen)

**Prioritaet:** P1 (Kurzfristig, blockiert Windows-User mit MCP-Connector + grossen Tool-Results)
issue suggested: ResultExternalizer wrote to GlobalFileService while read_file
resolves vault-relative paths, so every externalised result was unreachable on
all platforms (most visible on Windows where MCP traffic exposes the mismatch
directly).
**Datei:** `src/core/tool-execution/ResultExternalizer.ts`, `src/core/storage/VaultFileService.ts` (oder vergleichbarer Adapter)
**Feature-Bezug:** FEAT-18-03 (Cross-Platform TMP-Pfade) in EPIC-18, ADR-63 (Context Externalization)
**Entdeckt:** 2026-04-15 (Community Issue #29, Reporter unbekannt)
**Issue:** https://github.com/pssah4/obsilo/issues/29

---

## Problem

Bei Windows-Setup mit aktivem MCP-Connector schreibt der `ResultExternalizer` grosse Tool-Results nach `tmp/task-<id>/<tool>-<n>.md`. Der Schreibvorgang gelingt. Anschliessend bekommt der Agent eine Empfehlung wie:

```
Full result saved to: tmp/task-1776202886104/use_mcp_tool-1.md
Use read_file("tmp/task-1776202886104/use_mcp_tool-1.md") to see full content.
```

Wenn der Agent dann `read_file` aufruft, schlaegt es fehl. Der Reporter vermutet zurecht: "I think this is likely because it's not using the OS-invariant path modules."

## Root Cause Analyse

`src/core/tool-execution/ResultExternalizer.ts` baut Pfade per String-Konkatenation mit Forward-Slash:

```typescript
this.tmpDir = `tmp/${taskId}`;
const filePath = `${this.tmpDir}/${fileName}`;
await this.fs.write(filePath, content);
```

Auf macOS und Linux funktioniert das, weil das vault.adapter-API Forward-Slashes intern erwartet. Auf Windows liegt der Vault zwar auf einem NTFS-Pfad, aber die Obsidian-API normalisiert intern auf Forward-Slashes. Das Problem entsteht vermutlich an einer von zwei Stellen:

1. **mkdir verschachtelt:** Der `mkdir`-Aufruf erstellt auf Windows nicht rekursiv. `tmp` muss schon existieren, sonst wirft `mkdir("tmp/task-X")` einen Fehler. Das ist still, weil der Code den Fehler abfaengt und null zurueckgibt. Anschliessend schlaegt der Write fehl, der Result wird nicht externalisiert, der Agent bekommt aber trotzdem die Empfehlungstring fuer einen nicht-existenten Pfad.

2. **read_file Tool und Vault-Wurzel:** Wenn der Write-Pfad doch funktioniert, das `read_file`-Tool aber relative Pfade anders interpretiert (z.B. relativ zum aktuellen Note-Folder statt zur Vault-Wurzel), schlaegt das Re-Lesen fehl.

Wir haben weder `normalizePath` aus dem Obsidian-API noch konsistent das Node-`path`-Modul im Einsatz. Der Pfad-Handling-Layer fehlt komplett, jedes Tool macht es selbst.

## Kausale Kette

1. Tool produziert grossen Result (>2000 chars).
2. ResultExternalizer ruft `fs.mkdir("tmp/task-X")` (single-level mkdir) auf.
3. Auf Windows wirft mkdir, weil `tmp` noch nicht existiert (oder die rekursive mkdir-Variante nicht greift).
4. Try-Catch faengt den Fehler ab, returns null.
5. ABER: Bei Folge-Calls greift `_dirCreated = true` schon vom ersten missglueckten Versuch, also wird mkdir nicht erneut versucht.
6. Alternativ: mkdir gelingt, write gelingt, aber `read_file` interpretiert den Pfad nicht relativ zur Vault-Wurzel.
7. Agent bekommt "file not found" und fragt User.

(Hypothese 1 ist wahrscheinlicher, weil der Reporter sagt "agent then tries to read the file and it errors when accessing", also der Pfad ist konsistent, aber das File existiert nicht.)

## Auswirkung

- **Funktional:** Mittel-Hoch fuer Windows-User mit MCP. Bei jedem grossen Tool-Result (>2000 Chars) bricht der Agent den Lesefluss ab.
- **Plattform-Spezifisch:** Nur Windows (Linux/macOS funktionieren).
- **Vertrauen:** Hoch. Windows-User bekommen den Eindruck, das Plugin sei nicht produktionsreif.

## Fix-Richtung

1. **Rekursive mkdir:** Im FileAdapter explizit rekursives mkdir verwenden (oder die Existenz von `tmp` als Parent vor `mkdir("tmp/task-X")` checken und ggf. zuerst `tmp` anlegen).
2. **normalizePath:** Alle in den Agent gegebenen Pfade durch `normalizePath()` aus dem Obsidian-API jagen, sodass Forward/Backward-Slashes konsistent sind.
3. **Pfad-Adapter im FileAdapter:** Die `FileAdapter`-Schnittstelle bekommt eine `join(...parts)` Methode, die plattform-konsistent baut.
4. **Vault-relative Paths erzwingen:** ResultExternalizer dokumentiert klar, dass die geschriebenen Pfade Vault-relativ sind, und das `read_file`-Tool muss sie genau so interpretieren.

## Verifikation

- Manueller Test in einer Windows-VM (wir haben keinen Windows-Host). Alternativ: GitHub Actions Windows-Runner mit Smoke-Test.
- Unit-Test fuer `normalizePath`-Aufruf in ResultExternalizer (Mock-FileAdapter, der pruefen kann, dass mkdir rekursiv aufgerufen wird).
- Integrationstest: grosse search_files-Result auf Windows, Folge-`read_file` muss ohne Fehler durchlaufen.
