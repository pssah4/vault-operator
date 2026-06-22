# Vault Operator

**Agentic AI operating layer for your vault.**

<p align="center">
  <img src="docs/public/vault-operator-demo.gif" alt="Vault Operator builds a Base and a Canvas from a vault query, inside Obsidian" width="820">
</p>

You describe a task, it plans, searches, reads, writes, and reports back. Every action is visible. Every write needs your approval. Every change is undoable in one click.

Free. Open source. Local-first. Works with cloud models, with your existing ChatGPT or Copilot subscription, or fully offline with Ollama or LM Studio.

[Documentation](https://pssah4.github.io/vault-operator) | [Install from Obsidian](obsidian://show-plugin?id=vault-operator) | [Community page](https://community.obsidian.md/plugins/vault-operator)

---

## What people are saying

> "Vault Operator might be the best Obsidian agentic AI plugin out there."
> *Nick, Buy Me a Coffee*

> "I've just discovered your wonderful plugin, which to me is way more than a simple plugin. It is a real harness inside Obsidian. That's awesome!"
> *arkham000, GitHub*

> "Vault Operator is one of the most interesting and powerful Obsidian plugins I've tried so far. The combination of agent functionality, vault access and document processing is particularly impressive."
> *Stapledon-de, GitHub*

> "Love your work with Vault Operator."
> *mikaljrue, Buy Me a Coffee*

> "Vault Operator plugin is exactly what I was looking for. The ability to plug in MCP, the support for various models and providers, the skills, and workflows. I am really looking forward to get my hands dirty. I am hoping I won't need to use VS Code + GitHub Copilot to help me manage my vault anymore."
> *Buy Me a Coffee supporter*

> "I have only just started, but this is real motivation to get back into Obsidian again."
> *hkocam, Buy Me a Coffee (translated from German)*

---

## What you get

A chatbot reads your prompt and answers. Vault Operator runs a loop: it picks an action, executes it against your vault, feeds the result back to the model, and continues until the task is done.

- **Capture sources with block-level provenance.** Drop a PDF into the chat, get a source note where every key claim links back to the exact paragraph in the original.
- **Three-layer memory across sessions.** Short-term session summaries, durable facts that survive resets, and a soul profile of how you write and how you want the agent to behave.
- **Find notes by meaning, not by filename.** Local vector index, full-text keyword search, graph expansion through wikilinks, and a local cross-encoder reranker, combined with weighted RRF.
- **Build Word and Excel files, draft PowerPoint decks (PPTX in beta).** Turn project notes into a DOCX, structured data into an XLSX, or meeting notes into a draft PPTX.
- **Run a vault health check.** Surfaces orphans, broken links, missing backlinks, weak clusters, and over-connected hubs. Every fix creates a checkpoint you can undo.
- **Use the vault from ChatGPT, Claude Desktop, or Perplexity.** Vault Operator runs as an MCP server, so your other AI clients can read the same memory and history as the in-Obsidian agent.
- **Hold the keys with auto-approve.** Fail-closed by default. Per-category toggles for read, write, plugin-API, command, MCP, and web. Sensitive folders are gated by a `.obsidian-agentignore` file.
- **Reuse what Obsidian already exposes.** Plugin-API discovery lets the agent invoke installed plugins (Excalidraw, Dataview, Tasks) instead of duplicating their work.

---

## What it does for knowledge work

### Capture sources with provenance

Drop a PDF or a Markdown source into the chat and ask for an ingest. The agent produces a clean source note with block IDs on every key claim, so each fact links back to the exact paragraph in the original.

Two paths:

- **`/ingest`** for quick capture. Single-pass. One source, one note, about three minutes.
- **`/ingest-deep`** for sense-making. A five-step guided dialog: triage and decision, output mode selection, deep ingest of the source, write the sense-making notes, set backlinks. Five to fifteen minutes for a real research paper.

[Sense-making tutorial](https://pssah4.github.io/vault-operator/tutorials/deep-ingest) | [Block-level provenance concept](https://pssah4.github.io/vault-operator/concepts/provenance)

### Search by meaning, not by filename

A local vector index over your vault, plus full-text keyword search, graph expansion through wikilinks, and a local cross-encoder reranker. Ask "what do I know about X?" and the agent finds notes whose meaning is related, even when none of them contain the words you used.

The background analysis also surfaces note pairs that discuss similar topics without any wikilink between them, so you can spot connections you never wrote down.

[Knowledge discovery guide](https://pssah4.github.io/vault-operator/guides/knowledge-discovery)

### Build Word and Excel, draft PowerPoint (PPTX beta)

Turn project notes into a Word document, structured data into Excel, or meeting notes into a draft PowerPoint deck. DOCX and XLSX output is clean and reliable. PPTX is in beta: corporate template cloning is not supported in this version, so treat client-facing decks as a starting point and finish them by hand.

[Office documents guide](https://pssah4.github.io/vault-operator/guides/office-documents)

### Keep the vault navigable

The vault health check audits your knowledge graph for orphans, broken links, missing backlinks, weak clusters, inconsistent tags, and over-connected hubs. Findings come with actions: apply a mechanical fix, open a discussion with the agent, or dismiss. Every repair creates a checkpoint you can undo.

[Vault health check guide](https://pssah4.github.io/vault-operator/guides/vault-health)

### Stay in control

Vault Operator is fail-closed. Write operations need your approval unless you opted into auto-approve for that category. Every task creates checkpoints in a shadow git repository (separate from your own git history). Click "Undo all changes" in the chat and the files go back. Sensitive folders are gated by a `.obsidian-agentignore` file at the vault root.

[Safety and control guide](https://pssah4.github.io/vault-operator/guides/safety-control) | [Checkpoints concept](https://pssah4.github.io/vault-operator/concepts/checkpoints)

---

## Try it

Vault Operator requires Obsidian 1.13 or newer.

1. **Install.** Obsidian Settings > Community Plugins > Browse > "Vault Operator" > Install + Enable.
2. **Add a provider.** Settings > Vault Operator > Providers > Providers > "+ Add provider". A free [Google AI Studio](https://aistudio.google.com/app/apikey) key is enough to try everything.
3. **Open the sidebar and ask a question.** "What are my most-linked notes?" works on any vault. The first-run wizard walks you through the rest.

For semantic search and the ingest workflows, also configure an embedding model in Settings > Vault Operator > Providers > Embeddings. The [Quick start tutorial](https://pssah4.github.io/vault-operator/tutorials/getting-started) covers every step.

---

## Documentation

Full documentation lives at [pssah4.github.io/vault-operator](https://pssah4.github.io/vault-operator).

For end users:

- [Tutorials](https://pssah4.github.io/vault-operator/tutorials/getting-started). Step-by-step walkthroughs from first install to sense-making with `/ingest-deep`.
- [Guides](https://pssah4.github.io/vault-operator/guides/capabilities). Reference for daily work.
- [Reference](https://pssah4.github.io/vault-operator/reference/tools). Tools, providers, settings, troubleshooting.

For developers:

- [Codebase tour](https://pssah4.github.io/vault-operator/concepts/codebase-tour). Directory layout, reading order, Kilo Code heritage.
- [Concepts](https://pssah4.github.io/vault-operator/concepts/). Agent loop, governance, knowledge layer, memory system, MCP architecture.

---

## Building from source

```bash
git clone https://github.com/pssah4/vault-operator.git
cd vault-operator
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` from the repo root into `<vault>/.obsidian/plugins/vault-operator/`. For watch mode and auto-deploy during development, point `PLUGIN_DIR` in `.env` at your test vault and run `npm run dev`.

Requirements: Obsidian 1.13 or newer, desktop only, Node.js 18+ for building.

---

## Network usage and local capabilities

Vault Operator is local-first. No telemetry, no analytics, no accounts.

The plugin makes network requests in three situations, all under your control:

- **LLM API calls** to the provider you configured (Anthropic, OpenAI, Google, AWS Bedrock, OpenRouter, Azure, GitHub Copilot OAuth, ChatGPT OAuth, Kilo Gateway, Ollama, LM Studio, or any OpenAI-compatible endpoint).
- **Web search** (optional, disabled by default) when you use the `web_search` tool, going to Brave or Tavily.
- **MCP servers** you connected explicitly, plus the optional remote-MCP relay if you want cross-surface workflows with ChatGPT or Claude Desktop.

The plugin also uses a few Node.js capabilities that go beyond the standard Obsidian API: filesystem access for the local knowledge database and the office document pipeline, shadow git for checkpoints, sandbox process spawning for `evaluate_expression`, and optional LibreOffice spawning for presentation rendering. All writes stay under the vault path or the plugin data directory. Commands are fixed binaries with structured arguments; the agent does not construct shell commands from chat text.

API keys are encrypted via Electron's `safeStorage` (OS keychain on macOS, Credential Manager on Windows, libsecret on Linux). Where `safeStorage` is not available, keys fall back to plain plugin settings.

---

## License

Apache 2.0.

## Acknowledgements

- [Kilo Code](https://kilocode.ai) for architectural inspiration.
- [Obsidian](https://obsidian.md) as the platform.
- [sql.js](https://github.com/sql-js/sql.js) for SQLite in WebAssembly powering the knowledge layer.
- [Hugging Face Transformers.js](https://github.com/huggingface/transformers.js) for local ONNX reranking.
- [isomorphic-git](https://isomorphic-git.org) for pure-JS git checkpoints.
- [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk) for the Model Context Protocol.
