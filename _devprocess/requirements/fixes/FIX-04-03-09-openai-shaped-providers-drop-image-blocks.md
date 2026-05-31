---
id: FIX-04-03-09
feature: FEAT-04-03
epic: EPIC-04
adr-refs: []
plan-refs: []
depends-on: []
created: 2026-05-31
---

# FIX-04-03-09: OpenAI/Copilot/Kilo droppen image-Bloecke auf User-Messages

## Symptom

Code-Review 2026-05-31 (xhigh focused): User zieht PNG/JPEG/GIF/WEBP in den Chat. AttachmentHandler legt einen `{type:'image', source:{type:'base64', media_type, data}}` Block in das User-Message-Content-Array. Anthropic + Bedrock mappen das korrekt auf Vision-Input. Bei OpenAI/Copilot/Kilo-Gateway wird der Block stumm verworfen, der Request geht text-only raus. gpt-4o/Gemini-via-OpenAI/OpenRouter-Vision-Modelle antworten "Ich sehe kein Bild" oder fabuliert basierend auf dem Dateinamen.

## Cause

Drei OpenAI-shape Provider haben in der User-Branch der `convertMessages`-Schleife nur Branches fuer `text` und `tool_result`. Image-Bloecke fallen durchs Raster:

- [src/api/providers/openai.ts:546-567](src/api/providers/openai.ts#L546-L567)
- [src/api/providers/github-copilot.ts:387-404](src/api/providers/github-copilot.ts#L387-L404)
- [src/api/providers/kilo-gateway.ts:277-294](src/api/providers/kilo-gateway.ts#L277-L294)

Image-Bloecke sind valide ContentBlock-Typen: [src/api/types.ts:64-66](src/api/types.ts#L64-L66) `{ type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } }`. Erzeugt von [AttachmentHandler.processFile](src/ui/sidebar/AttachmentHandler.ts#L122-L127), an Provider durchgereicht via [AgentSidebarView:1517-1518](src/ui/AgentSidebarView.ts#L1517-L1518).

Korrekt-Implementierungen als Referenz:
- [anthropic.ts:331-340](src/api/providers/anthropic.ts#L331-L340)
- [bedrock.ts:442](src/api/providers/bedrock.ts#L442)

OpenAI ChatCompletion-API erwartet das Format `{type:'image_url', image_url:{url:'data:${media_type};base64,${data}'}}` als Element eines Content-Arrays auf der User-Message.

## Fix

1. In den drei Providern in `convertMessages` einen `else if (block.type === 'image')`-Branch ergaenzen, der das OpenAI-Format emittiert.
2. Wenn die User-Message gemischt text+image hat: Content muss als Array gesendet werden (`{role:'user', content:[{type:'text',text:...},{type:'image_url',image_url:{url:...}}]}`). Bestehende text-only-Branch wandelt bisher in `content: string` -- der Helper muss zusammenklappen koennen.
3. Helper extrahieren: `toOpenAiUserContent(blocks)` -> entweder string (pure text) oder content-array (mixed). Drei Provider rufen ihn auf.

## Regression test

In `src/api/providers/__tests__/openai.convertMessages.test.ts` (neu), analog `github-copilot.convertMessages.test.ts` und `kilo-gateway.convertMessages.test.ts`:

- **image-only user message:** Block `[{type:'image', source:{type:'base64', media_type:'image/png', data:'iVBOR...'}}]` -> Output `{role:'user', content:[{type:'image_url', image_url:{url:'data:image/png;base64,iVBOR...'}}]}`.
- **mixed text+image:** `[{type:'text', text:'Beschreibe das Bild'}, {type:'image', ...}]` -> Output mit content-array, beide Elemente in Reihenfolge.
- **text-only unchanged:** pure text bleibt `content: string` (backwards-compat).
- **media_type roundtrip:** `image/jpeg`, `image/gif`, `image/webp` werden korrekt in den data-URL eingesetzt.
- **regression: tool_result mit image:** falls je relevant -- aktuell out of scope.

## How tested

1. Vitest gruen.
2. Live-Smoke: PNG in Chat ziehen, gpt-4o anfragen "Was ist auf dem Bild?". Vorher: "Ich sehe kein Bild". Nachher: korrekte Bildbeschreibung.
