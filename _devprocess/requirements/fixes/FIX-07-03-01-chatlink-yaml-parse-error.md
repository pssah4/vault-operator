# FIX-11: ChatLink stampt ungueltiges Frontmatter (YAMLParseError)

**Prioritaet:** P1 (Kurzfristig)
**Datei:** `src/ui/AgentSidebarView.ts` (flushPendingChatLinks / finalizeConversation)
**Feature:** Chat-Linking (ADR-22)
**Entdeckt:** 2026-04-03, Test B des Memory/Self-Learning-Systemtests

---

## Problem

Beim Beenden einer Conversation versucht ChatLink, einen Verweis in das
Frontmatter der erstellten Notiz zu schreiben. Wenn die Notiz Frontmatter
mit bestimmten Werten hat (z.B. mehrzeilige Zusammenfassungen), schlaegt
der YAML-Parser fehl.

## Fehlermeldung

```
[ChatLink] Failed to stamp Notes/Habermas Kernthesen.md: YAMLParseError:
Nested mappings are not allowed in compact mappings at line 2, column 18:

Zusammenfassung: Jürgen Habermas (1929-2024) gilt als letzter grosser Aufklaerer...
                 ^
```

## Root Cause

Die Notiz "Habermas Kernthesen" wurde vom Agent mit einem Frontmatter-Feld
`Zusammenfassung:` erstellt, dessen Wert nicht YAML-konform ist:

```yaml
---
Zusammenfassung: Jürgen Habermas (1929-2024) gilt als letzter grosser...
---
```

Der Wert enthaelt Sonderzeichen (Klammern, Bindestriche, Umlaute) und
wird vom YAML-Parser als "compact mapping" interpretiert. ChatLink versucht
dann dieses Frontmatter zu parsen und zu erweitern, was fehlschlaegt.

**Zwei Probleme:**
1. Der Agent erstellt Notizen mit nicht-YAML-konformem Frontmatter
   (write_file sollte Werte in Anfuehrungszeichen setzen)
2. ChatLink faengt den Parse-Error nicht graceful ab und ueberspringt
   die betroffene Notiz nicht sauber

## Auswirkung

- Chat-Link wird nicht in die betroffene Notiz geschrieben
- Warn-Meldung in Console (nicht User-sichtbar)
- Keine Datenverluste

## Betroffene Dateien

- `src/ui/AgentSidebarView.ts` (stampChatLinkToActiveFile, flushPendingChatLinks)
- `src/core/tools/vault/WriteFileTool.ts` (Agent-generiertes Frontmatter)
