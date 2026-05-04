# Fachliche Regeln Obsilo

> Max 100 Zeilen. Nur laden wenn Fachlogik betroffen.

## Glossar

| Begriff             | Bedeutung                                                                            |
|---------------------|--------------------------------------------------------------------------------------|
| Vault               | Obsidian-Wurzelverzeichnis mit Markdown-Notizen und `.obsidian/` Konfiguration       |
| Plugin              | Obsidian-Erweiterung. Obsilo ist eines davon, andere koennen nebenan laufen          |
| Tool                | Ausfuehrbare Funktion, die der Agent aufruft. Built-in, Custom, Plugin, oder MCP     |
| Tool Group          | Logische Gruppe von Tools (read, vault, edit, agent, skill). Per Mode aktivierbar    |
| Mode                | Konfigurations-Set (Tools plus System-Prompt). Bsp: ask, code, architect, debug      |
| Skill               | Markdown-Anleitung fuer Aufgabentypen. User-Skills oder Plugin-Skills                |
| Sandbox             | Isolierte Laufzeit fuer Custom-Tool-Code. OS-Level Isolation via Process-Separation  |
| Memory v2           | Vereinheitlichter Memory-Stack: FactStore, EdgeStore, FactIntegrator, ueber MemoryDB |
| Knowledge DB        | sql.js-WASM-Datenbank fuer Vektoren, Edges, Tags, Sessions                           |
| MemoryDB            | Tabellen-Familie fuer Memory v2 (facts, edges, episodes, history_chunks)             |
| Recipe              | Erlernter Tool-Aufruf-Pfad fuer wiederkehrende Intents                               |
| Source Pipeline     | Reihenfolge fuer Memory-Retrieval (vault notes, history, facts)                      |
| Atomic Fact         | Granularer, von Episoden losgeloester Fakt mit Subjekt, Praedikat, Objekt            |
| Episode             | Zeitlich begrenzter Kontext (Session, Thread). Quelle fuer Atomization               |
| Soul                | Persistente Persona-Praeferenzen des Users (Tonality, Schreibstil)                   |
| Specialist Overlay  | Mode-spezifischer Prompt-Overlay-Patch                                               |

## Geschaeftsregeln

- Ein User pro Vault. Kein Mehrbenutzer-Modell auf Plugin-Ebene.
- Custom Tools laufen ausschliesslich in der Sandbox, nie im Plugin-Prozess.
- Binaere Datei-Outputs (DOCX, PPTX, XLSX, PDF) immer ueber Built-in Tools,
  nie aus der Sandbox (Buffer/JSZip-Anforderung).
- Knowledge DB schreibt atomic. WriterLock vor jedem Multi-File-Commit.
- Vault-Daten verlassen den lokalen Rechner nur ueber explizit konfigurierte
  AI-Provider, niemals automatisch.

## Domaenenmodell (kompakt)

```
Vault --1:n--> Note
Note  --n:m--> Tag
Note  --n:m--> Note (implicit edges, computed)

Session --1:n--> Episode
Episode --1:n--> Atomic Fact
Atomic Fact --n:m--> Atomic Fact (edges)

Mode --n:m--> Tool Group
Tool Group --n:m--> Tool

Skill --1:1--> SKILL.md
Recipe --1:n--> Tool Call
```

## Invarianten

- Jede Tool-Ausfuehrung laeuft durch die ToolExecutionPipeline (ADR-01).
- Approval-Check failt closed (ADR-05).
- KnowledgeDB-Schema-Migrationen brauchen WriterLock (Lehre aus BUG-012).
- ADR-13 (Memory v1) ist superseded durch die Memory-v2-ADR-Familie
  (ADR-77, 078, 079, 085, 086, 087).
