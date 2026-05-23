---
id: FIX-01-04-01
feature: FEAT-01-04
epic: EPIC-01
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-23
---

# FIX-01-04-01: Agent benutzt read_file statt edit_file und erzeugt Duplikate

## Symptom

Bei der Madrid-Reise-Note hat der Agent beim Versuch eine Aenderung zu machen `read_file` gefolgt von `write_file` (oder einer aehnlichen Reproduktion des Inhalts) genutzt, statt einen targeted `edit_file`-Aufruf zu machen. Folge: der gleiche Inhalt wurde dupliziert in der Note, weil der "neue" Inhalt einfach den Original-Stand wiederholte plus die gewuenschte Aenderung.

Aus dem Chat: "Einmal read_File, anstatt Edit_File genutzt und bestehende Notes zu verändern, und erzeugt dadurch Duplikate."

Im Chat-Verlauf zur Buchungsnummer:
- User: "füge die buchungsnummer hinzu beim iberia flug"
- Agent: ruft `read_file` auf, sieht dass die Nummer "schon da ist", korrigiert eine andere Stelle. Aber die ECHTE Aenderung wurde nicht durch ein gezieltes Edit ausgefuehrt, sondern durch einen Re-Read + erneute Reasoning-Iteration.

Zusatz-Symptom aus dem gleichen Chat-Block: nach dem Edit behauptet der Agent zwar Erfolg, aber im Editor sieht Sebastian die Aenderung nicht (zweiter Bug, siehe FIX-01-07-03 -- gleicher Root Cause: Editor-Cache-Overwrite).

## Root cause

Tool-Choice-Bug auf der LLM-Seite, nicht Plugin-Code. Hypothesen, in Reihenfolge der Plausibilitaet:

1. **Schwache Tool-Description-Steerung.** Die `edit_file`-Tool-Description (in `toolMetadata.ts`) oder der System-Prompt machen `read_file` nicht klar zu einem Anti-Pattern fuer Edits. Das LLM faellt in einen "lese erst, dann reasoning, dann re-write"-Modus statt direkt zu edit_file zu greifen. FIX-01-05-01 hat einen aehnlichen Steuerungsbug fuer large rewrites adressiert ("use write_file instead of edit_file for >=1000 chars").
2. **TaskRouter / Helper-Model-Routing.** Aus den Logs: `[TaskRouter] classification=simple model=helper(eu.anthropic.claude-haiku-4-5...)`. Haiku 4.5 ist deutlich kleiner als Sonnet 4.6 und faellt eher in suboptimale Tool-Wahl. Bei "edit existing note" sollte der Task vielleicht eher ans Main-Model.
3. **Stale Read-Context.** Wenn `edit_file` durch FIX-01-07-03 Editor-Cache-Overwrite einmal silent reverted wurde, hat der Agent einen Stale-Stand im Conversation-Context und versucht "robuster" via re-read + write_file. Die Wurzel ist dann FIX-01-07-03 -- diesen Fix abwarten und neu beobachten.

## Fix

{Offen -- erst FIX-01-07-03-Effekt abwarten. Wenn Bug B nach Edit-Cache-Fix verschwindet, war Hypothese 3 die Ursache und kein eigener Fix noetig. Wenn er bestehen bleibt, ist Hypothese 1 oder 2 in Spiel.}

Mogliche Fix-Pfade:
- Tool-Description `edit_file` schaerfen: "Use this FIRST for any in-place change; do NOT read_file + write_file as a workaround."
- TaskRouter: "edit existing note" Pattern -> Main-Model erzwingen
- Falls Hypothese 3: nichts machen, FIX-01-07-03 deckt es ab.

Implementation pointer: TBD nach FIX-01-07-03-Verifikation.

## Regression test

Offen. Reproduktion: realer Vault, offene Note, User-Prompt "fuege X hinzu" wo X bereits aehnlich existiert oder eine Edit-Operation typischerweise read_file + write_file aussehen koennte.

## Status

See the backlog row for FIX-01-04-01 in `_devprocess/context/BACKLOG.md`.
