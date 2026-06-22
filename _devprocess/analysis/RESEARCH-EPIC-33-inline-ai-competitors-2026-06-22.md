---
type: research
related-to: EPIC-33
date: 2026-06-22
scope: Wettbewerbsrecherche Inline-AI-Operationen
method: Multi-Agent Fan-Out + adversarial Verify + Synthese (17 Agenten, 943k Tokens)
---

# Research: Inline-AI-Operationen bei Main-Competitors (Stand Juni 2026)

> Wettbewerbsanalyse fuer EPIC-33 (Inline-Editor-AI-Actions). 8 Tools recherchiert, adversarial verifiziert, gegen die 4 EPIC-33-Actions gemappt. Diese Recherche schaerft die BA, identifiziert Threats und liefert Empfehlungen fuer zusaetzliche FEATs.

## Untersuchte Tools

| Tool | Verdict (Verify) | In-Scope | Inline-Ops |
|---|---|---|---|
| Notion AI (Stand Juni 2026, inkl. Custom Skills seit Maerz 2026) | partially-reliable (14/17 corroborated) | ja | 17 |
| Cursor (cursor.com, Stand Juni 2026) | reliable (5/5) | ja | 5 |
| GitHub Copilot Inline Chat (VS Code v1.107+) | partially-reliable (5/9, 3 Visual-Studio-Imports widerlegt) | ja | 9 (5 bestaetigt) |
| Continue.dev (VS Code + JetBrains, Juni 2026) | reliable (6/7) | ja | 7 |
| Smart Connections (obsidian-smart-connections) | reliable | nein (passive Sidebar + Inline-Decorator, keine AI-Action auf Selection) | 0 |
| Obsidian Copilot (logancyang) | high | ja | 7 |
| Obsidian-Community-Plugins (Text Generator, InlineAI, AI Revisionist, Smart Composer) | high | ja | 6 |
| Claude.ai Artifacts + ChatGPT Canvas | medium | ja | 10 |

## Pattern-Konvergenz: was die Wettbewerber tatsaechlich machen

### Trigger-UX (uebereinstimmend)

Vier Modi haben sich etabliert:

1. **Floating-Menu auf Selection** (Notion AI, Obsidian Copilot Quick-Ask, InlineAI Ctrl+K, GitHub Copilot Selection-Hint **EXPERIMENTAL**, Claude Artifacts, ChatGPT Canvas)
2. **Hotkey** (Cursor Cmd+K, Continue Cmd+I, GitHub Copilot Cmd+I als Standard-Trigger, Obsidian Copilot Quick Command, InlineAI Ctrl+K)
3. **Slash-Command** im Inline-Chat (GitHub Copilot /fix //tests /doc, Continue /edit /comment /test, Notion AI /AI, /summarize)
4. **Right-Click Context-Menu** (Obsidian Copilot built-ins, AI Revisionist, Notion AI Block-Handle Six-Dot-Grip)

**Hotkey-Konsens, der sich herausgebildet hat:**

- `Cmd+K` (Mac) / `Ctrl+K` (Win/Linux): Inline-Edit auf Selection -> Cursor, Obsidian Copilot Quick Command, InlineAI
- `Cmd+L` (Mac) / `Ctrl+L` (Win/Linux): Send-Selection-to-Chat -> Cursor, Continue, Obsidian Copilot Add-to-Context
- `Cmd+I` / `Ctrl+I`: Inline-Chat / Composer -> GitHub Copilot, Continue, Cursor (Composer)

EPIC-33 hat keine harten Hotkey-Defaults definiert. Empfehlung: Cmd+K und Cmd+L als RECOMMENDED-Defaults dokumentieren, dem etablierten Konsens folgen.

### Output-Modus (klare SOTA bei Rewrite)

| Output-Modus | Verbreitung bei Rewrite | Tools |
|---|---|---|
| **Inline-Diff mit Accept/Reject** | **MEHRHEIT (6/8)** | Cursor, GitHub Copilot, Continue, InlineAI, Smart Composer (Apply-Edit), GitHub Copilot |
| Modaler Preview-Block unter Selection | mittel | Notion AI (alle Rewrite-Presets), Obsidian Copilot Modal (Insert/Replace/Copy), AI Revisionist |
| Direct-Replace ohne Diff | **MINDERHEIT (2/8)** | ChatGPT Canvas Built-in-Shortcuts (mit Show-Changes-Toggle), Claude Artifacts (mit Version-History) |
| Streaming-Inline (live-Text) | wenig | Notion AI Continue-Writing, GitHub Copilot Inline-Chat |
| Conversation-Block in der Note | **fast keiner** | (am naechsten: ChatGPT Canvas Comment-Bubbles) |

**Wichtigster Befund:** **Direct-Replace + Undo ist im Markt MINDERHEIT.** Selbst die zwei Tools die direct-replace machen, haben Versionsverlauf oder Show-Changes als Sicherheitsnetz. Cursor (Sebastian's mentale Referenz!) macht **Inline-Diff mit Accept/Reject**, nicht direct-replace.

### Settings-Modell (gespalten)

Drei klare Lager:

1. **Global-Setting, geteilt zwischen Inline und Chat** (Notion AI mit Model-Switcher Auto/GPT-5.2/Claude Opus 4.5/Gemini 3, ChatGPT Canvas, Claude Artifacts, GitHub Copilot mit `inlineChat.defaultModel` als Inline-Override)
2. **Per-Operation/Per-Command-Modell** (Obsidian Copilot mit Custom Command Modellzuweisung, Continue.dev mit role-basierten Modellrollen chat/edit/autocomplete/apply, Smart Composer mit 3 globalen Slots, InlineAI custom commands)
3. **Inherits-from-Chat mit kleinem Override** (Cursor mit Cmd+K-Picker als reduzierter Subset des Chat-Pickers - keine Thinking-Modelle in Inline-Edit)

Vault Operator's Position "strikt inherits-from-Chat ohne per-Inline-Override" ist defensibel, aber im Markt nicht universell. Continue-style role-based ist Power-User-Pattern.

## Mapping gegen die 4 EPIC-33-Actions

### Lookup (markierter Begriff erklaert)

**SOTA-Pattern:** Modal/Preview-Block UNTER Selection mit Insert-below-Option (Notion "Explain this"), oder Selection-zu-Chat-Push (Claude "Explain", Cursor Cmd+L, GitHub /explain). **Echter Tooltip-Lookup ist im Markt SELTEN** - nur Smart Connections Pro macht Hover-Popover, aber das ist read-only Vault-Lookup, nicht AI-Erklaerung.

**Implikation fuer EPIC-33:** Die BA-Skizze sagt "Tooltip oder Side-Panel". Tooltip ist Differenzierungs-Innovation, nicht Tool-Parity. Preview-Block-unter-Selection (Notion-Pattern) ist die belegbarste Wahl. Architektur-Phase entscheidet.

### Rewrite (Absatz umformulieren)

**SOTA-Pattern:** Inline-Diff mit Accept/Reject. 6/8 Tools (Cursor, GitHub Copilot, Continue, InlineAI, Smart Composer, plus Streaming bei GitHub Copilot). Obsidian Copilot macht Modal-Preview (Insert/Replace/Copy) bewusst gegen Inline-Diff (PR #1039 Begruendung: "Inline-Rewrites gehoeren nicht zur Konversation"). Notion macht modalen Preview-Block, kein echter Inline-Diff.

**Implikation:** Sebastian's Wahl "Direct-Replace + Undo (Cursor-Pattern)" beruht auf falscher Markt-Referenz - Cursor macht Inline-Diff. Direct-Replace ist Markt-MINDERHEIT. H-02 ist eine Business-Hypothese gegen den Marktstandard, nicht Problem-Solution Fit.

### Inline-Chat (Conversation-Block in Note)

**SOTA-Pattern:** Floating-Single-Turn-Eingabe ist Standard (Notion Ask AI, Cursor Cmd+K, Obsidian Copilot Quick-Ask). Echte "persistente Conversation-Block in der Note" macht **so gut wie kein Tool** - am naechsten kommt ChatGPT Canvas mit "Suggest edits" Comment-Bubbles (Word-Track-Changes-aehnlich).

**Implikation:** FEAT-33-05 ist echte Innovation, nicht Tool-Parity. Risiko: User koennten es schwierig finden weil das Pattern nicht etabliert ist. Vorteil: Vault Operator kann den Conversation-Block durch Memory + History-Indexing crawlable machen - Differenzierungs-Tiefe.

### Send-to-Main-Chat

**SOTA-Pattern:** Hotkey-driven Selection-Push ins Side-Panel. Cmd+L ist de-facto Standard (Cursor, Continue, Obsidian Copilot). Cursor differenziert Cmd+L (neuer Chat) vs Cmd+Shift+L (zu laufendem Chat).

**Implikation:** FEAT-33-04 sollte Cmd+L als Default-Hotkey dokumentieren. Niedrigste Innovations-Tiefe, hoechste Tool-Parity-Pflicht.

## Zusaetzliche Inline-Actions in Wettbewerbern (NICHT in EPIC-33)

Sortiert nach Verbreitung + Relevanz fuer EPIC-33:

| Action | Tools mit dieser Aktion | Relevanz fuer EPIC-33 | Empfehlung |
|---|---|---|---|
| **Translate** | Notion AI, ChatGPT Canvas (Code-Mode), Obsidian Copilot (frueher), Continue (via custom) | **high** | FEAT-33-06 P1 in Scope ziehen |
| **Summarize Selection** | Notion AI, Obsidian Copilot (built-in), Smart Composer, ChatGPT Canvas | **high** | FEAT-33-07 P1 in Scope ziehen |
| **Find Action Items / Extract Tasks** | Notion AI (sehr stark gemerkt in Reviews) | **high** | FEAT-33-11 P2, ueber Skills-System realisierbar |
| Continue Writing (auf leerer Zeile) | Notion AI Space-Key, Cursor Tab, GitHub Copilot Tab, Continue autocomplete, Inscribe | medium | Separates EPIC oder Out-of-Scope. Selection-driven nicht zutreffend. |
| Fix Grammar / Spelling | Notion AI (Preset), Obsidian Copilot (built-in), Cursor (via Freitext), GitHub Copilot /fix, InlineAI | medium | Subsumiert in FEAT-33-03 Rewrite, aber Preset-Button im Floating-Menu erwarten User |
| Make Shorter / Make Longer | Notion AI, ChatGPT Canvas (Slider!), Obsidian Copilot | medium | Subsumiert in FEAT-33-03 Rewrite, aber dedizierte Preset-Buttons im Floating-Menu |
| Change Tone | Notion AI (Sub-Menu Picker), Obsidian Copilot (frueher) | low | ueber Skills-System nachruestbar |
| Suggest Edits / Code Review | ChatGPT Canvas (Comment-Bubbles), GitHub Copilot Code-Review-Action | low | Wissensarbeiter-Persona nicht Hauptanwendungsfall |
| Brainstorm Ideas | Notion AI | low | ueber Skills nachruestbar |
| Reading Level Slider | ChatGPT Canvas | low | Innovations-Singularitaet, nicht uebernehmen |

## Differenzierungs-Korridor fuer Vault Operator

Sechs Angles aus der Synthese:

1. **Vault-Knowledge-Lookup als first-class Action**

   Smart Connections macht Vault-Lookup ohne AI. Notion "Explain this" ist LLM-only. Vault Operator KANN beides: Semantic-Search in Vault (10.783 Vektoren) + LLM-Erklaerung augmented + Tooltip mit verlinkten Vault-Quellen. **Kein Wettbewerber leistet das.**

2. **Skills-System-Integration im Floating-Menu**

   Notion AI hat seit Maerz 2026 Custom Skills im Selection-Menu. Obsidian Copilot hat Custom Commands mit per-Command-Prompt + Modell. Vault Operator hat ein voll ausgepraegtes Skills-System (User Skills, Plugin Skills, Skill-Mastery, Phase B/D komplett). Skills mit Selection-Capability bekommen einen Eintrag im Floating-Menu - **Architektur-Hebel ohne Greenfield-Build**.

3. **Settings-Reuse aus Main-Chat als Architektur-Prinzip plus Pin-Override**

   Settings-Reuse-Default OK, aber optional "Pin-this-Action-to-Different-Model" gibt Power-User die Continue-style Flexibilitaet. Das beste aus beiden Welten.

4. **Memory-Layer + History-Integration im Inline-Chat-Conversation-Block**

   Inline-Chat-Block kann persistent in der Note bleiben (statt ephemer), wird durch Phase D-Recall + Phase F-Chat-Linking indexiert. Cross-Vault-discoverable. **Kein Wettbewerber kann das.**

5. **Cost-aware Tier-Routing per Action**

   TaskRouter mit Tier-Classifier (Phase D) routet pro Action: Lookup -> Haiku/Cheap, Rewrite -> Mid, Inline-Chat -> Default. Cursor's "Auto" ist konzeptuell aehnlich, aber nicht pro Action granular.

6. **Conversation-Block als referenzierbare Note-Section**

   Wenn FEAT-33-05 Conversation-Block als Markdown-Section bleibt, wird er crawlable durch Semantic-Index und History-Search. Andere Vault-Operator-Tools (search_history, search_vault, recall_memory) koennen ihn finden. **Inline-Chat wird Teil des Vault-Knowledge-Graphs.**

## Threats zu aktuellen BA-Annahmen

| BA-Annahme | Threat | Severity |
|---|---|---|
| H-02: Direct-Replace + Undo ist akzeptable UX (Cursor-Pattern) | Direct-Replace ohne Diff ist im Markt MINDERHEIT (2/8). Cursor selbst macht Inline-Diff, nicht direct-replace. Sebastian's mentale Referenz ist faktisch falsch. | **high** |
| H-04: 4 Actions sind genug | Wettbewerb bietet 8-17 Actions. Issue-Tracking-Schwelle "<3 Issues mit fehlt Action X" wird leicht erreicht. Translate + Summarize sollten proaktiv in Scope. | **high** |
| H-01: Floating-Menu Default + Hotkey-Toggle | Pattern bestaetigt durch Notion + Obsidian Copilot. ABER: Cursor + Continue gehen bewusst nur ueber Hotkey. GitHub Copilot Selection-Hint ist EXPERIMENTAL. | medium |
| H-03: Settings-Reuse aus Main-Chat ohne Override | Markt gespalten. 5/8 Tools haben per-Operation-Override. Power-User-Erwartung. Optional Pin-Override aufnehmen. | medium |
| FEAT-33-05 Inline-Chat-Conversation-Block ist etabliertes Pattern | Pattern ist im Markt SCHWAECHSTEN besetzt. Innovation, nicht Tool-Parity. Risiko: User-Discovery. | medium |
| Section 2.1 "Cursor/Continue haben Inline-Edit-Muster etabliert" suggeriert Inline-Chat-Block sei etabliert | Inline-Chat-Conversation-Block ist explizit NICHT etabliert. BA-Aussage zu praezisieren. | medium |
| Lookup: Tooltip ODER Side-Panel | Tooltip ist im Markt selten. Preview-Block-unter-Selection (Notion) ist belegbarere Wahl. | medium |
| KPI: 40% Inline-Adoption | Unbegruendet, kein Markt-Benchmark. Als Lernziel ohne harten Schwellenwert. | low |
| Cmd+L ist Hotkey-Konsens | Cursor + Continue + Obsidian Copilot konsistent, aber Obsidian liefert keine Default-Hotkeys. Architektur-Detail. | low |

## Obsidian-Ecosystem-Gap-Check

5 Plugins decken Inline-AI im Obsidian-Ecosystem **teilweise** ab:

1. **Obsidian Copilot** (logancyang): Quick-Ask-Floating-Panel + Modal-Inline-Edit + Custom Commands mit per-Command-Modell. **Konkurrenz fuer Vault Operator's Rewrite und Inline-Chat-aehnliches Verhalten.** ABER: Modal statt Inline-Diff, per-Command-Modell als Designphilosophie (Gegenposition zur Settings-Reuse-These).

2. **InlineAI** (FBarrca): Einziges Obsidian-Plugin mit echter Cursor-Style-Inline-Diff-UX (Floating-Tooltip + added/removed-Marker im Markdown-Buffer + Accept/Discard). Sehr nah am Cursor-Pattern, aber **ohne Vault-Knowledge-Integration und ohne Skills-System.**

3. **Smart Composer**: Apply-Edit aus Chat mit Diff-Preview. Eigene Modell-Slots fuer chat/apply/embed (against Settings-Reuse). Chat-driven, nicht Selection-driven.

4. **AI Revisionist**: Modal-Review mit Temperature-Slider IM Modal pro Aufruf. Sehr fokussiert auf Rewrite, nicht Multi-Action.

5. **Text Generator**: Template-Engine ohne Replace-Selection (Issue #186 seit 2023 offen). Architektur-Distanz zu EPIC-33.

**Smart Connections** ist explizit OUT-OF-SCOPE fuer Inline-Selection-AI (passive Sidebar + Vault-Decorator-Badges, kein AI-Action auf Selection).

**Inscribe** deckt Ghost-Text-Autocomplete waehrend Tippen ab (Continue-Writing, NICHT Selection).

**Die echte Markt-Luecke fuer Vault Operator:**

- Vault-Knowledge-Lookup als integraler Bestandteil der Lookup-Action (kein Plugin)
- Skills-System-Integration als Eingangspunkt fuer User-Inline-Operations (Obsidian Copilot hat Custom Commands, aber kein voll ausgepraegtes Skills-Konzept mit Capabilities und Mastery)
- Cost-aware Routing per Action (kein Plugin)
- Persistent Inline-Chat-Conversation-Block der durch Memory + History indexiert wird (kein Plugin)

Markt-Position fuer Vault Operator: **"Inline-AI das den Vault als Knowledge-Layer und Skills als Verbs nutzt"**, nicht "noch eine Inline-Edit-UX".

## Empfohlene BA-Updates

1. **Section 2.1 "Cursor-Pattern" praezisieren**: Cursor macht Inline-Diff mit Accept/Reject, nicht direct-replace. FEAT-33-03 Skizze soll diese Designentscheidung bewusst gegen Mainstream verteidigen oder uebernehmen.

2. **H-02 schaerfen**: Direct-Replace+Undo ist MINDERHEITSPOSITION (2/8). Hypothese als BUSINESS-Hypothese einstufen (bewusste Marktabweichung), nicht Problem-Solution Fit. Telemetrie-Schwellen verschaerfen - 30% Undo-Rate ist zu nachsichtig.

3. **Section 8.2 Out-of-Scope**: Translate und Summarize aus "spaeter"-Bucket nach IN-SCOPE FEAT-33-06 + FEAT-33-07 ziehen. Begruendung: 6-8/8 Tools haben diese Operations.

4. **H-03 schaerfen**: Settings-Reuse-Default OK, aber "Optional Pin-this-Action-to-Different-Model" als Foldback-Option aufnehmen. Continue's role-basiertes Setup als Inspiration fuer TaskRouter-Integration.

5. **Section 7.4 Object Model**: Lookup-Output praezisieren. Preview-Block-unter-Selection (Notion-Pattern) statt Tooltip-ODER-Side-Panel. Vault-Quellen-Verlinkung als Vault-Operator-Native-Differenzierung.

6. **Section 11.5 Unfair Advantage**: Vault-Knowledge-Layer-Integration in Lookup als FIRST-PARTY-Differenzierung explizit. Smart Connections + Notion "Explain this" verbinden nie beides.

7. **Section 6.3 KPIs**: 40% Inline-Adoption als Lernziel ohne harten Schwellenwert (kein Markt-Benchmark).

8. **H-04 erweitern**: Statt "<3 Issues mit fehlt Action X" explizite TOP-5-Liste aus Marktanalyse fuehren und nach Issue-Density priorisieren.

9. **Appendix C Interview Notes**: Sebastian's "Cursor-Pattern"-Referenz praezisieren mit dem Hinweis dass Cursor selbst Inline-Diff macht.

10. **Section 10.3 Key Features**: Mindest-Konkurrenz-Position als Spalte aufnehmen.

## Empfohlene FEAT-Erweiterungen

| FEAT-ID | Name | Priority | Rationale |
|---|---|---|---|
| FEAT-33-06 | Translate-Action | P1 | 8/8 Tools haben es. Mehrsprachige Vault-User. Aus Out-of-Scope hochziehen. |
| FEAT-33-07 | Summarize-Action | P1 | 6/8 Tools. Standard-Use-Case bei langen Selektionen. |
| FEAT-33-08 | Skills-im-Floating-Menu | **P0** | Vault Operator's Skills-System ist Architektur-Hebel. Notion AI hat Custom Skills seit Maerz 2026. **First-class Differenzierung.** Bestehende Skills bekommen Floating-Menu-Eintrag. |
| FEAT-33-09 | Vault-Knowledge-Integration in Lookup | **P0** | Vault-Operator-Native-Differenzierung. Smart Connections + Notion verbinden nie beides. Sollte separat von FEAT-33-02 (Lookup-UX), weil eigene Akzeptanzkriterien (RAG-Pipeline, Quellen-Anzeige, Vault-Search-Aufruf vor LLM-Call). |
| FEAT-33-10 | Optional per-Action Model-Pin | P2 | Settings-Reuse-Default OK, aber per-Action-Override ist Markt-Konsens. Power-User-Erwartung. |
| FEAT-33-11 | Find-Action-Items-Action | P2 | Notion-spezifisch, stark gemerkt. Realisierbar ueber FEAT-33-08 (Skills). Eigenes FEAT nur wenn Skills-Pfad nicht greift. |

## Quellen (gesammelt)

### Notion AI

- https://www.notion.com/help/guides/notion-ai-for-docs
- https://www.notion.com/help/notion-ai-faqs
- https://www.notion.com/help/guides/get-answers-about-content-faster-with-q-and-a
- https://www.notion.com/releases/2026-01-20 (Model-Switcher Auto/GPT-5.2/Claude Opus 4.5/Gemini 3)
- https://www.notion.com/releases/2026-03-20 (Custom Skills im Selection-Menu)
- https://www.notion.com/help/keyboard-shortcuts

### Cursor

- https://cursor.com/docs/inline-edit/overview
- https://cursor.com/docs/agent/overview
- https://cursor.com/docs/tab/overview
- https://cursor.com/docs/reference/keyboard-shortcuts
- https://forum.cursor.com/t/cannot-use-all-models-in-ctrl-k-inline-edits/101185 (Subset Model-Picker bestaetigt)

### GitHub Copilot

- https://code.visualstudio.com/docs/copilot/chat/inline-chat
- https://code.visualstudio.com/docs/agents/reference/copilot-vscode-features
- https://code.visualstudio.com/docs/agents/reference/ai-features-cheat-sheet
- https://github.com/microsoft/vscode/issues/283199 (/explain inline-chat bug v1.107)

### Continue.dev

- https://docs.continue.dev/edit/how-it-works
- https://docs.continue.dev/edit/how-to-use-it
- https://docs.continue.dev/customize/model-roles
- https://docs.continue.dev/customize/model-roles/edit
- https://docs.continue.dev/customize/model-roles/apply

### Obsidian-Ecosystem

- https://github.com/logancyang/obsidian-copilot (PR #1039 Inline-Edit-Dialog, PR #1316 v3 Settings-Vereinheitlichung, PR #1446 Custom Commands)
- https://www.obsidiancopilot.com/en/docs/settings
- https://github.com/FBarrca/obsidian-inlineAI
- https://github.com/glowingjade/obsidian-smart-composer
- https://github.com/nhaouari/obsidian-textgenerator-plugin (Issue #186)
- https://smartconnections.app/

### Claude.ai + ChatGPT Canvas

- https://support.claude.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them
- https://openai.com/index/introducing-canvas/
- https://help.openai.com/en/articles/9930697-what-is-the-canvas-feature-in-chatgpt-and-how-do-i-use-it

## Methodik-Hinweis

Recherche durchgefuehrt mit Multi-Agent Workflow (17 Agenten, 943k Tokens, 10 Min Wall-Clock). 8 parallele Finder + 8 adversarial Verifier + 1 Synthese mit max-effort. Verdict-Verteilung: 4x reliable, 4x partially-reliable. Korrekturen aus dem Verify-Pass wurden in die Synthese eingepflegt (z.B. Notion Cmd+K vs Cmd+Shift+K, GitHub Copilot /optimize + /generate sind Visual-Studio nicht VS Code, Selection-Hint experimental, ChatGPT Canvas hat Show-Changes-Toggle, Claude Improve funktioniert auch in Markdown nicht nur Code-View).

Findings + Verdicts vollstaendig in Workflow-Output:
`/private/tmp/claude-501/-Users-sebastianhanke-projects-obsidian-agent/167547c2-9be1-497e-9c40-c64545f1d84c/tasks/w24btgfq7.output`
