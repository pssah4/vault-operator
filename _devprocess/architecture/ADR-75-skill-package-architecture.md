# ADR-75: Skill-Package-Architektur (Anthropic-kompatibel + Coordinator-Erweiterung)

**Date:** 2026-04-17
**Deciders:** Sebastian Hanke
**Bezug:** EPIC-22, BA-21, FEAT-22-01 / 2202 / 2203 / 2204

## Context

Obsilo laedt Skills heute als einzelne `SKILL.md` Files in Unterordnern
(`bundled-skills/<slug>/SKILL.md` oder `<agent-folder>/skills/<slug>/SKILL.md`).
Der `SelfAuthoredSkillLoader` scannt diese Ordner bereits
([src/core/skills/SelfAuthoredSkillLoader.ts:115](../../src/core/skills/SelfAuthoredSkillLoader.ts#L115))
und liest den YAML-Frontmatter (`name`, `description`, `trigger`, `source`,
`requiredTools`). Subfolders innerhalb eines Skill-Ordners werden heute
ignoriert.

Anthropic hat im Spaetsommer 2025 einen offenen Skill-Standard publiziert
([agentskills.io/specification](https://agentskills.io/specification)):

- Ein Skill ist ein Ordner mit `SKILL.md` plus optional `scripts/`,
  `references/`, `assets/`.
- Frontmatter ist `name` + `description` (Pflicht), plus optional
  `license`, `compatibility`, `metadata`.
- `name` muss mit dem Ordner-Namen uebereinstimmen.
- Distribution als `.skill` Zip -- informell, aber von Claude Code,
  Claude Desktop und dem `skill-creator` Tool produziert.

Drei Luecken entstehen:

1. **Kein Package-Import.** User muss Skill-Dateien manuell anlegen;
   ein Skill aus [anthropics/skills](https://github.com/anthropics/skills)
   kann nicht als Zip importiert werden (Issue / User-Anforderung).
2. **Keine Sub-Dir-Unterstuetzung.** `references/GUIDE.md` wird heute
   als eigenstaendiger Skill geladen oder ganz ignoriert; der
   `read_file`-on-demand-Flow fehlt.
3. **Kein Coordinator-Pattern.** User wuenscht einen Skill der andere
   Skills im selben Ordner orchestriert. Das geht ueber die Anthropic-Spec
   hinaus, passt aber zu Obsilos Agent-Loop (`new_task`, Mode-Switching).

## Decision Drivers

- **Rueckwaerts-Kompatibilitaet:** Alle 9 bundled-skills und bestehenden
  User-Skills muessen unveraendert laden. Kein Migrations-Schritt fuer
  User.
- **Anthropic-Kompatibilitaet:** Ein Zip aus [anthropics/skills](https://github.com/anthropics/skills)
  laedt und nutzt das Format direkt.
- **Security:** Scripts duerfen nur ueber die Sandbox
  (`evaluate_expression`, ADR-21) laufen. Zip-Importe nur aus
  Whitelist-Pfaden, mit Size-Limit, Path-Traversal-Schutz.
- **Token-Effizienz:** `references/` und `assets/` bleiben on-demand,
  duerfen den System-Prompt nicht aufblaehen.
- **Review-Bot-Compliance:** Kein `require()`, kein `fetch()`, kein
  `innerHTML`, Pfade ueber `getAgentFolderPath()` (ADR-72).
- **Minimaler Eingriff:** Der `SelfAuthoredSkillLoader` wird erweitert,
  kein paralleler Code-Pfad.

## Considered Options

### Option A: Volle Anthropic-Kompatibilitaet + Obsilo-Coordinator-Erweiterung

Ordner-Layout nach Anthropic-Spec (`SKILL.md` plus `scripts/`, `references/`,
`assets/`). `.skill` Zip-Import ueber JSZip. Zusaetzlich: Obsilo-spezifisches
`type: coordinator` Frontmatter-Flag + `*.skill.md` Sub-Rollen-Pattern.

**Pro:** Sofort kompatibel mit Anthropic-Ecosystem, Skill-Sharing geht
einfach, Coordinator-Pattern ist Obsilo-Unterschied mit klarem Wert.
**Contra:** Vier Features gleichzeitig (Loader-Umbau, Zip-Import, Scripts,
Coordinator) -- Scope wird groesser, aber pro Feature unabhaengig releasebar.

### Option B: Nur Anthropic-Kompatibilitaet (ohne Coordinator)

Gleich wie A, aber Coordinator wird verschoben auf Folge-Epic.

**Pro:** Kleiner, fokussierter Scope.
**Contra:** User-Anforderung Coordinator wird nicht erfuellt; Sub-Rollen-
Pattern muss in einem Folge-Epic ohnehin kommen, deshalb lieber gleich
zusammen designen (dann konsistente Frontmatter-Schema-Erweiterung).

### Option C: Eigenes Obsilo-Skill-Format (ohne Anthropic-Kompatibilitaet)

Eigenes Ordner-Schema + eigenes Zip-Format.

**Pro:** Maximale Gestaltungsfreiheit.
**Contra:** User kann keine Anthropic-Skills wiederverwenden. Grosses
Ecosystem wird ignoriert. Zusaetzlicher Wartungsaufwand ohne Nutzen.

## Decision

**Option A.** Volles Anthropic-kompatibles Ordner-Format plus Coordinator-
Erweiterung mit explizitem `type: coordinator` Flag.

### Architektur-Detail

#### 1. Ordner-Layout (FEAT-22-01)

```
<agent-folder>/skills/<slug>/
  SKILL.md              # Pflicht -- Haupt-Instruktion + Frontmatter
  scripts/              # optional -- .ts/.js (ausfuehrbar via Sandbox),
    helpers.ts          #                 .py/.sh/.md (nur Referenz-Text)
    extract.py
  references/           # optional -- Lange Dokumente, on-demand per read_file
    GUIDE.md
    SCHEMA.md
  assets/               # optional -- Templates (JSON, Mermaid, CSV, Bilder)
    example.csv
    prompt-template.md
  writer.skill.md       # optional -- Sub-Rolle (nur wenn type: coordinator)
  reviewer.skill.md     # optional -- Sub-Rolle (nur wenn type: coordinator)
```

Bundled-Skills folgen der gleichen Struktur (heute bereits so, plus die
neuen Unterordner werden beim Umbau mit einbezogen).

#### 2. Frontmatter-Schema (erweitert, additiv)

```yaml
---
# Obsilo (bestehend)
name: research-synthesis          # Pflicht, muss mit Ordnername matchen
description: "..."                # Pflicht
trigger: "(research|synth)"       # optional, Regex
source: user                      # optional, "bundled"|"user"|"plugin"
requiredTools: [read_file, ...]   # optional

# Anthropic (neu, additiv, werden geparst aber nicht validiert)
license: MIT
compatibility:
  claude-api: ">=1.0"
metadata:
  author: "..."
  version: "1.0.0"

# Obsilo-Extension (neu)
type: coordinator                 # optional, nur wenn Skill-Ordner Sub-Rollen hat
role: writer                      # optional, nur in *.skill.md Sub-Rollen
---
```

Parsing-Regel: Unbekannte Frontmatter-Felder werden akzeptiert und in
einem `metadata`-Objekt gehalten, werfen keinen Fehler. Validiert werden
nur die Obsilo-Pflichtfelder (`name`, `description`).

Name-Validierung: Wenn `name` gesetzt ist und NICHT mit Ordner-Name
uebereinstimmt, wird der Skill abgelehnt mit `Notice` + `console.warn`.
Wenn `name` fehlt, wird Ordner-Name als Fallback genutzt (Backward-Compat
fuer bestehende User-Skills die keinen Frontmatter-Name haben).

#### 3. Loader-Umbau (FEAT-22-01)

Erweiterung von [SelfAuthoredSkillLoader.ts:115](../../src/core/skills/SelfAuthoredSkillLoader.ts#L115):

```typescript
interface SkillInventory {
  scripts: string[];       // filenames in scripts/
  references: string[];    // filenames in references/
  assets: string[];        // filenames in assets/
  subRoles: SubRoleMeta[]; // *.skill.md im selben Ordner
}

interface SubRoleMeta {
  role: string;           // aus Frontmatter oder Filename-Stem
  name: string;
  description: string;
  filePath: string;
}
```

Scan-Pass fuer jeden Skill-Ordner:

1. `SKILL.md` laden und parsen (wie heute).
2. Wenn Sub-Dir `scripts/` existiert: `listFiles()` -> Filenames in
   `scripts[]`.
3. Dito fuer `references/` und `assets/`.
4. Im Haupt-Ordner `*.skill.md` suchen. Wenn `SKILL.md`-Frontmatter
   `type: coordinator` hat: Sub-Rollen parsen (nur Frontmatter, nicht
   Body, fuer kompakten Prompt).
5. Metadata-Objekt um `inventory: SkillInventory` erweitern.

Single-File-Skills (alte Form) werden durch den gleichen Pfad gelesen --
die Unterordner sind leer, das Metadata-Objekt hat leere Inventories.

#### 4. Prompt-Integration

**Normaler Skill** (heute + SkillInventory-Referenzen):

```
Skill: research-synthesis
Description: Multi-source knowledge synthesis.
Trigger: (research|synth)
Scripts available (use evaluate_expression to run .ts/.js):
  - helpers.ts (utility functions)
References (read on demand via read_file):
  - references/GUIDE.md
  - references/SCHEMA.md
```

**Coordinator-Skill** (neu):

```
Skill: research-synthesis (coordinator)
Description: Multi-phase research workflow.
Available sub-roles (read on demand via read_file):
  - writer.skill.md -- "Creates initial draft from sources"
  - reviewer.skill.md -- "Fact-checks and clarifies the draft"
  - editor.skill.md -- "Consolidates final version"
```

Der Coordinator ist dafuer verantwortlich, den Agent textuell anzuweisen,
welche Sub-Rolle via `read_file` geladen werden soll. Kein automatisches
Dispatchen -- der LLM entscheidet.

#### 5. Zip-Import (FEAT-22-02)

Neuer UI-Button in [SkillsTab](../../src/ui/settings/SkillsTab.ts):
"Import skill package...". Ablauf:

```typescript
// src/core/skills/SkillPackageImporter.ts (neu)
export class SkillPackageImporter {
  static readonly WHITELIST = [
    /^SKILL\.md$/,
    /^scripts\/[^/]+$/,
    /^references\/[^/]+\.md$/,
    /^assets\/[^/]+$/,
    /^[^/]+\.skill\.md$/,   // Sub-Rollen
  ];
  static readonly MAX_UNZIPPED_SIZE = 100 * 1024 * 1024; // 100 MB

  async import(zipBuffer: ArrayBuffer): Promise<SkillImportResult> {
    const zip = await JSZip.loadAsync(zipBuffer);
    // 1. Validate: gesamte entpackte Groesse pruefen (Zip-Bomb)
    // 2. Validate: alle Pfade gegen WHITELIST
    // 3. Validate: kein "../", absolute Pfade, Null-Bytes
    // 4. Skill-Slug aus SKILL.md/Frontmatter oder Ordner-Struktur ableiten
    // 5. Bei Duplikat: Modal "Replace / Keep both (renamed) / Cancel"
    // 6. Entpacken nach ${getAgentFolderPath(plugin)}/skills/<slug>/
    // 7. Loader.refresh()
  }
}
```

Security-Checks (alle vor Extraktion):

| Check | Aktion bei Fehler |
|-------|-------------------|
| Pfad enthaelt `..` oder startet mit `/` | Reject ganzer Import |
| Pfad matcht nicht WHITELIST | Entry silently skippen + warn |
| Entpackte Gesamtgroesse > 100MB | Reject ganzer Import |
| `SKILL.md` fehlt im Zip | Reject ganzer Import |
| `name`-Frontmatter != Ordner-Slug | Reject, Notice |

Kein Support fuer verschluesselte Zips, kein Support fuer andere Archive-
Formate (tar, 7z). Ausschliesslich `.zip` / `.skill`.

#### 6. Scripts (FEAT-22-03)

Der Loader listet Scripts nur im Metadata. Ausfuehrung erfolgt nicht
automatisch:

```typescript
// Im System-Prompt:
// "To run scripts/helpers.ts, use evaluate_expression with the file content."
```

Fuer das MVP wird ausschliesslich TypeScript und JavaScript ausgefuehrt
(ueber die bestehende Sandbox, ADR-21). Python/Bash/Shell-Scripts bleiben
als Referenz-Text im Skill gelistet, werden aber nicht ausgefuehrt --
der User muss sie manuell oder in externen Tools nutzen oder in TS
portieren.

Script-Inventar-Format im Prompt:

```
Scripts:
  - scripts/helpers.ts (TypeScript -- Sandbox-ausfuehrbar)
  - scripts/extract.py (Python -- Referenz-Text, nicht ausfuehrbar)
```

Size-Limit pro Script: 500KB. Groesser -> `Notice` + console.warn,
Script wird aber nicht aus dem Inventar entfernt (damit der User
weiss dass es existiert).

#### 7. Coordinator-Pattern (FEAT-22-04)

Aktiviert durch `type: coordinator` im Haupt-`SKILL.md` Frontmatter.
Sub-Rollen sind `*.skill.md` Files im selben Ordner (nicht in `references/`
-- das waere ein Widerspruch im Format).

Sub-Rollen-Frontmatter:

```yaml
---
role: writer               # optional, default = Filename-Stem
name: Writer Role
description: "Creates initial draft from sources"
---
```

Loader liest nur Frontmatter der Sub-Rollen, nicht den Body. Body wird
per `read_file` bei Bedarf geladen.

Backward-Compat: Ein `*.skill.md` File ausserhalb eines Coordinator-Ordners
wird als eigenstaendiger Skill geladen (weil das heute schon der Fall
fuer Plugin-Skills ist: `<agent-folder>/plugin-skills/<id>.skill.md`).
Dort gibt es keinen `SKILL.md` neben, daher kein Coordinator-Match.

### Konsequenzen

#### Pro

- Anthropic-Ecosystem-Kompatibilitaet (17+ Skills sofort nutzbar).
- Token-Budget bleibt kontrolliert (References on-demand).
- Skills werden portabel via Zip-Import.
- Coordinator-Pattern macht komplexe Workflows deklarativ.
- Single-File-Skills laufen weiter (keine User-Migration).

#### Contra

- Loader-Scan wird etwas teurer (Sub-Dir-Checks pro Skill). Gemessen:
  ~50ms zusaetzlich fuer 20 Skills (akzeptabel gegen heute ~100ms).
- Zip-Import fuehrt neue Fehlerklasse ein (Path-Traversal, Zip-Bomb) --
  muss gewissenhaft validiert und getestet werden.
- Coordinator-Pattern ist Obsilo-only, fuehrt zu leichter Divergenz von
  Anthropic-Spec. Mitigation: explizites Flag + Doku-Hinweis.
- Sub-Dir-Konvention muss in 9 bundled-skills optional nachgezogen
  werden (falls sinnvoll), damit das Format im Vault-Beispiel sichtbar
  ist.

#### Folgeentscheidungen

- Skill-Signatur / Hash-Allowlist (separater Stream, nicht jetzt).
- Python/Bash-Runtime via Docker-Sidecar (Security-heavy, eigenes Epic).
- Online-Skill-Registry / "Skill Store" (UX-Epic, benoetigt Gateway).

### Implementation Notes (Coding-Review 2026-04-18)

Die Review gegen die Codebase hat drei Annahmen des Entwurfs praezisiert:

1. **Skill-Pfad-Migration (User-Entscheidung).** User-Skills liegen heute
   unter hartem `.obsilo-sync/skills/` ([SelfAuthoredSkillLoader.ts:69-70](../../src/core/skills/SelfAuthoredSkillLoader.ts#L69-L70)).
   FEAT-22-01 migriert einmalig nach `getAgentFolderPath()/skills/`
   (ADR-72), damit Skills das konfigurierbare Agent-Folder respektieren.
   Defensive Kopie mit `.migrated`-Marker fuer Idempotenz, Original bleibt
   erhalten.
2. **Universal-Import-Router (User-Entscheidung).** Statt separater
   Import-Knopf ersetzt FEAT-22-02 den bestehenden Markdown-Import durch
   einen universellen Router, der Single-MD, Folder und `.skill`/`.zip`
   automatisch erkennt. Abstrahiert die Format-Komplexitaet fuer den User.
3. **Prompt-Integration auf Section-Ebene, nicht Registry.** Der
   Inventory-Block wird in [src/core/prompts/sections/skills.ts](../../src/core/prompts/sections/skills.ts)
   und dem Aufrufer in `systemPrompt.ts` ergaenzt, nicht im `SkillRegistry`
   (der nur fuer VaultDNA-Plugin-Skills zustaendig ist).
4. **`refresh()` Methode.** `SelfAuthoredSkillLoader` bekommt eine
   `refresh()`-Methode, die `loadAll()` auf Demand triggert (zusaetzlich
   zum existierenden Watcher). Genutzt von `SkillImportRouter` nach
   erfolgreichem Import und vom Migrations-Schritt.

## Verification

### Unit-Tests

| Test | Ziel |
|------|------|
| `SelfAuthoredSkillLoader` Folder-Scan mit Fixtures | Single-File, mit references, mit scripts, mit assets, mit Coordinator+Sub-Rollen |
| Frontmatter-Parser akzeptiert Anthropic-Felder | Kein Error fuer `license`, `compatibility`, `metadata` |
| Frontmatter-Name-Mismatch wird abgelehnt | `name` != Ordner-Name -> reject |
| `SkillPackageImporter` Whitelist | Pfade ausserhalb Whitelist werden verworfen |
| `SkillPackageImporter` Path-Traversal | `../../etc/passwd` im Zip wird abgelehnt |
| `SkillPackageImporter` Zip-Bomb | 200MB entpackter Inhalt wird abgelehnt |
| `SkillPackageImporter` Duplikat-Modal | 3 Optionen (replace/rename/cancel) geliefert |

### Regression

- Alle 9 bundled-skills laden ohne Frontmatter-Aenderung.
- Alle bestehenden User-Skills (bei Obsilo-Beta-Testern) laufen weiter.
- `manage_skill` Tool funktioniert unveraendert fuer Single-File-Skills.

### Integration / Live

- Manueller Test: `pdf.skill` aus [anthropics/skills](https://github.com/anthropics/skills) als Zip importieren, Agent triggert Skill, PDF wird geparst.
- Manueller Test: Coordinator-Skill mit `writer.skill.md` + `reviewer.skill.md`, Agent delegiert per `read_file`.
- Token-Messung: Skill mit 5KB `references/GUIDE.md` -> `references`-Inhalt nicht im System-Prompt.

### Security-Audit (am Ende der Coding-Phase)

- Fuzz-Test mit malformed Zip-Archiven.
- Path-Traversal-Suite (verschiedene Encoding-Variationen).
- Script-Sandbox-Audit: bestaetigen dass Scripts nur ueber
  `evaluate_expression` aufrufbar sind und immer Approval triggern.
