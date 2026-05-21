---
id: ADR-126
title: Skill-Authoring als Builtin-Skill statt CRUD-Tool
date: 2026-05-20
deciders: [Sebastian, Architekt-Agent]
asr-refs: [ASR-29-10, ASR-29-11, ASR-29-12, ASR-29-13, ASR-29-14]
feature-refs: [FEAT-29-05, FEAT-29-06]
related-adrs: [ADR-75, ADR-115, ADR-116]
supersedes: null
superseded-by: null
---

# ADR-126: Skill-Authoring als Builtin-Skill statt CRUD-Tool

## Context

Heute existiert ein Tool das Skills via CRUD-Aktionen verwaltet, einschliesslich create, update, delete, list, validate, read und einer Compile-Aktion fuer TypeScript-Module die als custom-praefixierte Tools in die Tool-Registry registriert werden. Das hat drei Probleme. Erstens ist Skill-Erstellung ein Multi-Turn-Dialog mit dem User, kein deterministischer Code-Pfad: das passt strukturell nicht in ein Tool, das einen einzelnen Aufruf erwartet und ein Result liefert. Anthropic selbst hat den Skill-Creator als Skill, nicht als Tool gebaut. Zweitens bringt das Compile-Pattern fuer TypeScript-Module einen wachsenden Tool-Registry-Sprawl mit sich: jeder kompilierte Skript-Block wird als eigener Tool-Eintrag registriert, was den Tool-Section im Prompt aufblaeht. Drittens ist die Validierung im Tool ein punktueller Check, aber Skills koennen auch manuell oder ueber Imports ankommen, in dem Fall greift der Tool-Validator gar nicht.

ADR-75 hat das Folder-Format etabliert. ADR-116 hat das Active-Skills-on-Demand-Pattern eingefuehrt, in dem Skill-Bodies vom Modell on-demand geladen werden. Beide ADRs setzen die Konvention dass Skills filesystem-basiert leben und vom Modell als Markdown interpretiert werden. Ein CRUD-Tool widerspricht dieser Konvention.

**Triggering ASR:**
- ASR-29-10 (Critical): Skill statt Tool fuer Erstellung
- ASR-29-11 (Critical): Validator als Discovery-Layer
- ASR-29-12 (Moderate): TaskRouter-Eskalation auf Flagship
- ASR-29-13 (Critical): Generisches Skript-Tool statt code_modules-Tool-Registrierung
- ASR-29-14 (Moderate): Bundle-Caching fuer wiederholte Skript-Aufrufe
- Quality attribute: Portabilitaet, Modell-Freiheit, Token-Effizienz

## Decision drivers

- **Anthropic-Kompatibilitaet**: Vault-Operator-Skills sollen ohne Konvertierung in Claude Code und claude.ai laufen, und umgekehrt sollen Anthropic-Skills (z.B. der canonical skill-creator) im Vault Operator laufen.
- **Multi-Turn-Workflow ist Modell-Domaene**: Skill-Erstellung erfordert iterativen Dialog mit dem User (Use-Case verstehen, Komplexitaet bewerten, Draft erzeugen, validieren, iterieren). Das ist Skill-Material, nicht Tool-Material.
- **Tool-Registry-Sprawl vermeiden**: ein generisches Skript-Ausfuehrungs-Tool ist gegenueber N custom-Tool-Registrierungen klar im Vorteil fuer Token-Effizienz.
- **Validator-Ubiquitaet**: Validierung muss fuer alle Skill-Quellen greifen, nicht nur fuer Skill-Creator-Output.
- **Flagship-Routing**: Skill-Erstellung ist Code-Generation plus Modell-Urteil, profitiert stark von Frontier-Modell-Quality.

## Considered options

### Option A: Status quo erweitern

Das CRUD-Tool wird um den Skill-Creator-Workflow erweitert (z.B. eine Action interactive), die einen Multi-Turn-Dialog simuliert.

- Pro: Minimaler Eingriff.
- Con: Multi-Turn-Dialog ueber Tool-Calls ist erzwungene Architektur und blockiert Anthropic-Portabilitaet. Skill-Body kann nicht auf Claude Code uebertragen werden.

### Option B: Skill-Authoring als Builtin-Skill plus generisches Skript-Ausfuehrungs-Tool

Ein neuer Skill-Creator-Builtin-Skill liegt im Builtin-Verzeichnis und enthaelt den 6-Schritt-Workflow analog zu Anthropics canonical skill-creator. Helper-Scripts (Skeleton-Init, Validator) leben im scripts-Unterordner des Skill-Folders und werden ueber ein neues generisches Skript-Ausfuehrungs-Tool aufgerufen. Das CRUD-Tool wird komplett entfernt. Validierung wird in den Skill-Discovery-Layer verschoben: SkillRegistry prueft jedes Skill beim Laden, und wirft non-konforme mit klarer Fehlermeldung raus. Das Compile-Pattern wird durch on-demand-Sandbox-Ausfuehrung ersetzt, kein Tool-Registry-Eintrag pro Skript.

- Pro: Anthropic-konformes Pattern.
- Pro: Validierung fuer alle Quellen.
- Pro: Tool-Registry bleibt schlank.
- Pro: Multi-Turn-Skill-Erstellung als natuerlicher Modell-Workflow.
- Con: Erfordert Migration der bestehenden custom-praefixierten Tools auf das neue Skript-Tool.
- Con: Modell muss Skill-Creator-Skill zuverlaessig triggern, sonst entsteht keine Skill-Erstellung.

### Option C: Beide Pattern parallel

CRUD-Tool und Skill-Creator-Builtin-Skill leben nebeneinander. User entscheidet welcher Weg.

- Pro: Sanfter Uebergang.
- Con: Doppelter Maintenance-Aufwand. Konflikte zwischen den zwei Wegen (z.B. unterschiedliche Validierung).
- Con: Confused User, weil zwei Wege fuer denselben Zweck existieren.

## Decision

**Proposed option:** Option B, vollstaendige Migration auf Skill-Authoring-Builtin plus generisches Skript-Tool.

**Reasoning:**
Anthropic-Portabilitaet und Token-Effizienz sind beide gewichtige Treiber, und beide werden nur durch Option B sauber adressiert. Der Migrations-Aufwand fuer bestehende custom-Tools ist endlich und einmalig, danach ist die Architektur konsistent. TaskRouter wird um eine Skill-Trigger-Eskalation auf Flagship erweitert, ohne dass das Skill-Frontmatter um nicht-Anthropic-konforme Felder ergaenzt werden muss (Routing-Regel im TaskRouter, nicht im Skill).

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Alle Skill-Quellen (Builtin, User-Custom, importiert via Translator) folgen demselben Format und derselben Validierung.
- Tool-Registry bleibt schlank, kein Sprawl durch dynamisch registrierte Tools.
- Skill-Erstellung ist als Markdown-Workflow ohne Code-Deploy editierbar.
- Anthropic-Skills aus dem offiziellen Repo (z.B. der canonical skill-creator selbst) koennen direkt importiert werden und funktionieren ohne Konvertierung.

### Negative

- Bestehende custom-praefixierte Tools muessen auf das neue Skript-Ausfuehrungs-Pattern migriert werden.
- Modell-Disziplin beim Skill-Trigger ist kritisch. Wenn der Skill-Creator nicht zuverlaessig getriggert wird, faellt der Workflow tot.

### Risks

- **Modell triggert Skill-Creator nicht zuverlaessig**: mitigation durch klare Description-Trigger im Frontmatter plus TaskRouter-Regex-Match auf "create skill"-aehnliche Prompts plus Flagship-Eskalation in dem Fall.
- **Migration der bestehenden custom-Tools ist verlustbehaftet**: mitigation durch eine einmalige Migrations-Phase die jedes custom-Tool zu einem Skript-Unterordner im jeweiligen User-Skill umwandelt, mit Audit-Manifest.
- **Bundle-Cache fuer wiederholte Aufrufe wird komplex**: mitigation durch In-Memory-Cache pro Plugin-Session mit Invalidierung bei Skill-Datei-Aenderung.

## Related decisions

- ADR-75: Skill-Package-Architektur. ADR-122 baut auf der dort etablierten Folder-Konvention auf.
- ADR-115: Helper-Model-Routing. ADR-122 ergaenzt die Routing-Tabelle um den Skill-Authoring-Trigger.
- ADR-116: Active Skills on-demand. ADR-122 etabliert den Skill-Creator als selbst on-demand geladenen Skill.

## References

- FEAT-29-05: Skill-Creator-Builtin
- FEAT-29-06: Sandbox-JS als First-Class-Skill-Pattern
- Anthropic skill-creator: https://github.com/anthropics/skills/tree/main/skills/skill-creator
- EPIC-29

---

## Implementation Notes (optional, may go stale)

Erste Skizze fuer die /coding-Phase:

- Der Skill-Creator-Builtin-Skill liegt im Builtin-Verzeichnis als Folder mit SKILL.md plus scripts-Unterordner (init_skill.js, validate_skill.js).
- Das neue Skript-Ausfuehrungs-Tool nimmt Parameter (skill_name, script_name, args) und laedt das JavaScript via Sandbox-Bundle-Loader.
- Der Frontmatter-Validator lebt in der SkillRegistry und wird bei jedem Discovery-Pass aufgerufen.
- TaskRouter bekommt eine zusaetzliche Regex-Regel fuer Skill-Authoring-Trigger und schaltet bei Match auf Flagship.
- Migration der existing custom-Tools wird in einem einmaligen Pass durchgefuehrt der pro Tool ein Stub-Skript im passenden User-Skill anlegt.
