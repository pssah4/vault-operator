---
id: ADR-127
title: Python-zu-JavaScript Skill-Translation mit Dry-Run-Pass
date: 2026-05-20
deciders: [Sebastian, Architekt-Agent]
asr-refs: [ASR-29-15, ASR-29-16]
feature-refs: [FEAT-29-08]
related-adrs: [ADR-75, ADR-126]
supersedes: null
superseded-by: null
---

# ADR-127: Python-zu-JavaScript Skill-Translation mit Dry-Run-Pass

## Context

Anthropic veroeffentlicht offizielle Skills in einem oeffentlichen Repository. Diese Skills nutzen Python-Skripte fuer deterministische Operationen (PDF-Manipulation, Office-Format-Erzeugung, Datenverarbeitung). Der Vault Operator hat keine Python-Runtime, aber eine JavaScript-Sandbox die ESM-Module ueber ein WASM-basiertes Bundle-System laden kann. Eine einfache Eins-zu-Eins-Uebernahme funktioniert nicht: Python-Importe wie pdfplumber, python-pptx, python-docx, openpyxl haben kein direktes Aequivalent in der Sandbox-Umgebung.

Eine Konversion ist nur teilweise mappbar. Es gibt drei Kategorien:

1. Klar mappbare Bibliotheken mit funktionalem JavaScript-Aequivalent (Standard-Library-Konstrukte, Office-Format-Bibliotheken mit gut etablierten npm-Aequivalenten).
2. Teilweise mappbare Bibliotheken (z.B. eingeschraenkte Feature-Sets im JavaScript-Aequivalent).
3. Nicht mappbare Bibliotheken (native Binaries, spezifische wissenschaftliche Libraries ohne JavaScript-Pendant).

Bei einer Translation darf der User nie von einem unvollstaendigen Ergebnis ueberrascht werden, sonst zerstoert das Vertrauen in das Authoring-Toolkit. Gleichzeitig ist Translation der einzige Weg, Anthropic-Skills produktiv im Vault Operator zu nutzen ohne dass die Community jeden Skill manuell portiert.

**Triggering ASR:**
- ASR-29-15 (Critical): Dry-Run-Pass vor Schreiben
- ASR-29-16 (Critical): Mapping-Tabelle als versionierter Datenbestand
- Quality attribute: Transparency, User-Trust, Maintainability

## Decision drivers

- **Verlust-Transparenz**: Wenn Translation verlustbehaftet ist, muss der User es vor Schreiben wissen und entscheiden koennen.
- **Erwartungs-Management**: skill-creator muss als natuerliche Alternative positioniert werden wenn Translation scheitert.
- **Wartbarkeit der Mapping-Tabelle**: Python-zu-JavaScript-Mappings werden sich mit neuen Bibliotheken und Library-Versionen aendern, daher Datenbestand statt Hardcode.
- **LLM-Grenzen**: Komplexe Konversionen mit semantischer Genauigkeit (z.B. pdfplumber-spezifische API-Calls) brauchen Frontier-Modell, nicht Mid-Tier.
- **Sandbox-Grenzen respektieren**: Manche Operationen (PDF-Binaer-Manipulation, OOXML-Erzeugung) gehen ohnehin nicht in der Sandbox sondern muessen ueber Plugin-built-in-Tools laufen. Das muss der Translator erkennen.

## Considered options

### Option 1: Direkt-Konversion ohne Dry-Run

LLM uebersetzt jede Datei direkt, schreibt das Ergebnis. User testet hinterher.

- Pro: Schnelle Pipeline.
- Con: User wird von partial-translation-Ueberraschungen ueberrumpelt.
- Con: Keine Moeglichkeit fuer kontrollierten Abbruch.

### Option 2: Dry-Run-Pass mit User-Modal vor Schreiben

Translator durchlaeuft den Skill in zwei Phasen. Phase 1 (Dry-Run) analysiert alle Python-Importe und Bash-Aufrufe gegen eine Mapping-Tabelle. Phase 2 wird nur dann ausgefuehrt, wenn entweder alles mappbar ist oder der User explizit das partial-translation-Ergebnis akzeptiert hat. Wenn der User abbricht, wird der skill-creator als Alternative angeboten um einen aehnlichen Skill from-scratch zu bauen.

- Pro: Volle Transparenz, kein Schreiben ohne User-Wissen.
- Pro: Klarer Abbruch-Pfad mit natuerlicher Fallback-Alternative.
- Pro: Mapping-Tabelle wird strukturierter weil sie als Single-Source-of-Truth fuer das Dry-Run-Verdikt dient.
- Con: Mehr Code-Komplexitaet (zwei Phasen, Modal-UI).

### Option 3: Konversion ohne Dry-Run, mit Versions-Snapshot zum Rueckholen

Translator schreibt direkt. Falls Konversion fehlt schlaegt, kann der User ueber Versions-Snapshot (ADR-124) auf Pre-Translation-Stand zurueckholen.

- Pro: Einfachere Pipeline.
- Con: User merkt Fehler erst beim Testen, hat schon Zeit investiert.
- Con: Erzeugt unnoetige Snapshots fuer broken translations.

## Decision

**Proposed option:** Option 2, Dry-Run-Pass mit User-Modal.

**Reasoning:**
Transparenz vor Schreiben ist die dominante User-Trust-Komponente. Der Modal-Aufwand ist einmalig pro Translation, der Erkenntnis-Gewinn ist hoch. Die Verbindung zum skill-creator als Fallback-Pfad macht die Architektur kohaerent: User hat immer einen produktiven naechsten Schritt, auch wenn die Translation scheitert. Die Mapping-Tabelle lebt als versioniertes Daten-Artefakt im Translator-Skill-Folder und kann ueber PR-Workflows erweitert werden.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- User kann Translation-Ergebnisse vor Schreiben bewerten und kontrolliert akzeptieren oder abbrechen.
- skill-creator wird als natuerlicher Fallback positioniert, beide Tools verstaerken sich gegenseitig.
- Mapping-Tabelle ist ein wachsender Datenbestand der die Community-Reichweite erhoeht.

### Negative

- Translator-Code wird in zwei Phasen strukturiert, mehr Implementation-Komplexitaet.
- LLM-Calls fuer Konversion sind Frontier-teuer.

### Risks

- **Mapping-Tabelle veraltet**: mitigation durch klar versionierte Mapping-Datei mit Aenderungs-Log, plus optionale CI-Hook die offizielle Anthropic-Skills regelmaessig retesten.
- **LLM produziert subtile Konversion-Bugs**: mitigation durch Sandbox-Smoke-Test pro konvertiertem Skript vor Schreiben, plus Versions-Snapshot (ADR-124) als Rueckholpunkt.
- **Binaere Format-Operationen ueberzeugend uebersetzt aber funktional broken**: mitigation durch Heuristik die binaere-Format-Calls als Translator-Out-of-Scope erkennt und auf Plugin-built-in-Tools umlenkt.

## Related decisions

- ADR-75: Skill-Package-Architektur. Translator produziert Output im selben Folder-Format.
- ADR-126: Skill-Authoring als Builtin-Skill. Translator nutzt dieselbe Skript-Ausfuehrungs-Mechanik und ist selbst ein Builtin-Skill.

## References

- FEAT-29-08: Skill-Translator-Builtin
- Anthropic Skills: https://github.com/anthropics/skills
- EPIC-29

---

## Implementation Notes (optional, may go stale)

Erste Skizze fuer die /coding-Phase:

- Der Translator-Builtin-Skill liegt im Builtin-Verzeichnis mit Body, der den Workflow steuert.
- Die Mapping-Tabelle liegt als references/mapping.json im Translator-Folder, versioniert mit Datums-Stempel und Schema-Version.
- Das User-Modal nutzt die existierende Modal-Komponente aus dem Plugin und zeigt eine strukturierte Diff-Ansicht (mappable vs partial vs unmappable).
- Smoke-Test laeuft in der Sandbox direkt nach Konversion und vor Schreiben.
- TRANSLATION.json-Audit-File mit Source-Repo, Original-Version, Konvertierungs-Datum, partial-Markers wird im konvertierten Skill-Folder abgelegt.
