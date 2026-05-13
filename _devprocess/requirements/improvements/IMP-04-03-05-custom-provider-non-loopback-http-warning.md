---
id: IMP-04-03-05
feature: FEAT-04-03
epic: EPIC-04
adr-refs: []
plan-refs: []
audit-refs: [AUDIT-023]
depends-on: [FIX-04-03-03]
created: 2026-05-13
---

# IMP-04-03-05: Custom-Provider warning when base URL is a non-loopback HTTP target

## Motivation

AUDIT-023 finding L-3 documented the surface widened by FIX-04-03-03:
when a user selects provider type `custom`, `ollama`, or `lmstudio`,
the OpenAI SDK now routes through `createNodeFetch()`, which uses
Node.js `http(s).request` and bypasses Electron's CORS gate. The
destination is the user-controlled `baseUrl` field.

The finding is rated Low because the user is the sole initiator (no
remote attacker injects the URL), TLS validation still applies on
`https://` URLs, and the chat history that gets sent is the user's
own. The improvement here is a UX nudge that surfaces the trust
decision instead of leaving it implicit.

## Scope

Add a friendly warning in the Models tab (and a one-time confirm
modal on save) when a Custom provider's base URL is:

- HTTP only (`http://...`), AND
- not a loopback host (`localhost`, `127.0.0.1`, `::1`).

Suggested wording:

> "This provider sends your chat history in plain text to a remote
> host. If that is intentional, switch to https or click confirm to
> save anyway."

`ollama` and `lmstudio` keep their default `http://localhost:11434`
and `http://localhost:1234` and stay silent.

## Implementation sketch

- New helper `isPlainTextRemoteUrl(baseUrl: string): boolean` in
  `src/api/providers/openai.ts` next to `createNodeFetch`.
- `ModelConfigModal` validates the URL on save; if the helper
  returns true, show a confirm modal before persisting.
- Add a small inline hint in the Models tab row whenever the helper
  returns true after load.

## Success Criteria

- SC-1: helper detects `http://1.2.3.4/v1` as remote, returns true.
- SC-2: helper returns false for `http://localhost:8000`,
  `http://127.0.0.1`, `http://[::1]`, and any `https://...`.
- SC-3: ModelConfigModal save flow shows the confirm modal once,
  remembers the choice for that provider via a small flag on the
  LLMProvider config (e.g. `confirmedPlainHttp: true`).

## Out of scope

- Refusing to save (would lock users out of valid intranet setups).
- TLS pinning or cert allowlists (the OpenAI SDK already uses Node's
  default agent which verifies certs against the system store).
- Egress filtering or warning users about hostnames that resolve to
  RFC-1918 private ranges (the user just typed that hostname, they
  know).

## Status

Backlog. Polish item, low priority. AUDIT-023 verdict stays Green
without it.
