---
id: ADR-129
title: Skill-Composability mit Skill-zu-Skill und Skill-zu-MCP-Aufrufen
date: 2026-05-20
deciders: [Sebastian, Architekt-Agent]
asr-refs: [ASR-29-19, ASR-29-20, ASR-29-21]
feature-refs: [FEAT-29-10]
related-adrs: [ADR-75, ADR-113, ADR-116]
supersedes: null
superseded-by: null
---

# ADR-129: Skill-Composability mit Skill-zu-Skill und Skill-zu-MCP-Aufrufen

## Context

EPIC-22 hat ein Coordinator-Pattern eingefuehrt, in dem ein Skill andere Skills delegieren kann. In der Praxis wird das Pattern unter-genutzt, weil keine klare Aufruf-Syntax dokumentiert ist und weil MCP-Server-Aufrufe ein separater Tool-Pfad sind, der aus Skill-Bodies heraus nicht orchestrierbar ist. Power-User wollen aber Workflows komponieren: ein Wochenreport-Skill der den meeting-summary-Skill, den ingest-deep-Skill und das management-briefing-Skill als Bausteine nutzt, sowie einen MCP-Server fuer externe Daten (z.B. Linear, Notion) ansteuert.

Das Risiko bei Skill-Komposition ist unendliche Rekursion und Aufruf-Zyklen. Eine sichere Composability-Schicht muss diese Pfade abdichten. Das Risiko bei Skill-zu-MCP ist Permission-Bypass: User darf nicht von einem Skill-Aufruf eines MCP-Servers ueberrumpelt werden, sondern muss die bestehende MCP-Approval-Kette durchlaufen.

**Triggering ASR:**
- ASR-29-19 (Critical): Cycle-Detection und Max-Depth-Limit
- ASR-29-20 (Critical): MCP-Approval-Kette nicht umgehbar bei Skill-zu-MCP
- ASR-29-21 (Moderate): Kontext-Isolation pro Sub-Skill
- Quality attribute: Reliability, Security, Composability

## Decision drivers

- **Loop-Schutz**: Skill-zu-Skill-Aufrufe muessen gegen unendliche Rekursion und Aufruf-Zyklen abgesichert sein.
- **Permission-Klarheit bei MCP**: bestehende MCP-Approval-Kette darf nicht umgangen werden.
- **Kontext-Isolation**: Sub-Skill darf nicht aus Parent-Kontext volle Information bekommen, nur explizit uebergebene Inputs.
- **Modell-Verstaendnis**: die Aufruf-Syntax muss vom Modell zuverlaessig erkannt und umgesetzt werden.

## Considered options

### Option 1: Sub-Skill-Aufruf als prosaischer Skill-Body-Hint

Skill-Body sagt prosaisch "Nutze den meeting-summary-Skill fuer dieses Meeting". Modell loest die Aufforderung selbst auf via Skill-Loading.

- Pro: Keine neue Syntax, alle Skills bleiben in natuerlicher Sprache.
- Con: Cycle-Detection schwer zu erzwingen, weil kein klares Aufruf-Boundary existiert.
- Con: Inkonsistente Trigger-Rate (Modell kann mal ja, mal nein machen).

### Option 2: Strukturierte Aufruf-Konvention via dediziertes Tool

Sub-Skill-Aufruf und MCP-Aufruf laufen ueber dezidierte Tools (z.B. invoke_skill und invoke_mcp_server), die jeweils einen Aufruf-Stack tracken. Skill-Body referenziert die Tools mit klar parsbarer Syntax. Max-Depth-Limit wird im Tool durchgesetzt, Cycle-Detection ueber Stack-Lookup.

- Pro: Klare Boundary, einfaches Limit-Enforcement.
- Pro: MCP-Aufruf-Pfad ist konsistent mit direktem MCP-Aufruf, Approval-Kette gilt unveraendert.
- Pro: Audit-Log pro Aufruf moeglich.
- Con: Neue Tools im Tool-Schema.
- Con: Skill-Body wird etwas weniger natuerlichsprachig.

### Option 3: Sub-Skill-Ausfuehrung in Subtask analog ADR-113

Sub-Skill laeuft als komplettes Subtask im Sub-Agent-Loop, mit eigenem Kontext-Frame, eigener Tool-Allowlist.

- Pro: Maximale Isolation, klarer Lifecycle.
- Pro: Existing ADR-113-Mechanik kann wiederverwendet werden.
- Con: Komplexer Lifecycle pro Sub-Skill, mehr Latenz und Token-Overhead.
- Con: Vollstaendige Subtask-Eskalation fuer einen einfachen Sub-Skill-Aufruf ist Overkill.

## Decision

**Proposed option:** Option 2 fuer Skill-zu-Skill und Skill-zu-MCP, mit optionaler Subtask-Eskalation aus Option 3 bei explizitem Sub-Skill-Flag.

**Reasoning:**
Strukturierte Tools mit klar parsbarer Syntax sind die einfachste Loesung fuer Limit-Enforcement und Audit-Logging. MCP-Approval-Kette laeuft automatisch durch, weil der Aufruf-Pfad derselbe ist wie bei einem direkten MCP-Aufruf. Cycle-Detection wird ueber den Aufruf-Stack-Lookup im Tool umgesetzt. Fuer Faelle in denen voll-isolierter Kontext gebraucht wird (z.B. Sub-Skill mit eigenem Tool-Set), kann der Sub-Skill mit einem Flag als Subtask gestartet werden und nutzt dann ADR-113-Mechanik.

**Note:** This is a PROPOSAL. The /coding skill makes the final call based on the real codebase state.

## Consequences

### Positive

- Skill-Composition wird strukturell sicher (kein Loop, keine MCP-Bypass).
- MCP-Server werden aus Skills heraus nutzbar ohne Permission-Aufweichung.
- Audit-Log pro Sub-Aufruf ermoeglicht Debugging komplexer Workflows.
- Konsistenz mit ADR-113 bei Bedarf, ohne dass jeder Sub-Skill Subtask-Overhead bekommt.

### Negative

- Neue Tools im Tool-Schema.
- Skill-Body muss eine klare Aufruf-Konvention nutzen, was etwas formaler ist als reine Prosa.

### Risks

- **Modell missversteht Aufruf-Konvention**: mitigation durch klare Beispiele im Skill-Creator-Builtin (ADR-122), und durch Aufruf-Beispiele in den Description-Texten der invoke_skill und invoke_mcp_server Tools.
- **Cycle-Detection-False-Positive**: mitigation durch klare Fehlermeldung mit Aufruf-Stack-Anzeige im Result, User kann den Konflikt manuell aufloesen.
- **MCP-Approval-Modal bricht Skill-Flow**: mitigation durch klare User-Aufklaerung im Skill-Creator-Body, dass MCP-Aufrufe Modal-Approval brauchen.

## Related decisions

- ADR-75: Skill-Package-Architektur. ADR-125 baut auf der dort etablierten Coordinator-Idee auf und macht sie explizit.
- ADR-113: Subagent-Delegation. ADR-125 nutzt die Subtask-Mechanik als optionalen Pfad fuer voll-isolierte Sub-Skills.
- ADR-116: Active Skills on-demand. ADR-125 nutzt das gleiche Skill-Loading-Pattern auch fuer Sub-Skills.

## References

- FEAT-29-10: Composability
- EPIC-22 Coordinator-Skill (FEAT-22-04)
- EPIC-29

---

## Implementation Notes (optional, may go stale)

Erste Skizze fuer die /coding-Phase:

- Neue Tools invoke_skill und invoke_mcp_server werden im Tool-Registry registriert.
- Aufruf-Stack wird pro Agent-Loop in einem Context-Feld gefuehrt, das jedes Tool inspecten kann.
- Max-Depth-Limit (Default fuenf) ist im Tool-Handler durchgesetzt, konfigurierbar via Setting.
- Subtask-Eskalation nutzt die existing ADR-113-Mechanik (spawnSubtask) mit explizitem Flag im invoke_skill-Aufruf.
- Audit-Log pro Sub-Aufruf landet im Standard-Tool-Call-Log.
