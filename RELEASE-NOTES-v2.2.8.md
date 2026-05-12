# Vault Operator v2.2.8 -- Release Notes

## Highlights

This release adds the **MCP Connector** for Claude Desktop and remote AI assistants, a **Unified Knowledge Layer** with SQLite-backed vector search, **local reranking**, and a comprehensive **security hardening** pass (AUDIT-006). Major internal refactoring reduces the codebase by over 7,500 lines while adding significant new capabilities.

---

## New Features

### MCP Server -- Connect Claude Desktop & Remote AI (EPIC-014)
Vault Operator now acts as an MCP (Model Context Protocol) server, letting external AI assistants like Claude Desktop interact with your vault.

- **Local connector:** HTTP server on localhost for Claude Desktop integration via stdio proxy
- **Remote relay:** Cloudflare Workers-based relay for claude.ai, ChatGPT, and other remote clients
- **6 MCP tools:** `get_context`, `search_vault`, `read_notes`, `write_vault`, `sync_session`, `update_memory`
- **Auto session tracking:** MCP conversations appear in Vault Operator's chat history automatically
- **Relay setup wizard:** One-click deployment of your personal relay worker
- **Bearer token authentication:** Auto-generated token for local server security
- **Cloudflare tunnel support:** Optional public endpoint via `cloudflared`

### Unified Knowledge Layer (EPIC-015)
The semantic search system has been rebuilt on a SQLite foundation for better performance and richer retrieval.

- **KnowledgeDB:** SQLite-backed storage (via sql.js) replacing the previous JSON file approach
- **VectorStore:** Unified vector index with cosine similarity search
- **Graph expansion:** Follow wikilinks and map-of-content properties to discover related notes (1-3 hops configurable)
- **Implicit connections:** Automatically discover semantically similar notes that have no direct link
- **Local reranking:** On-device cross-encoder model (ms-marco-MiniLM via @huggingface/transformers WASM) re-scores search results for better quality
- **Contextual retrieval:** Optional LLM-generated context enrichment for chunks (improves search quality by 49-67%)

### Storage Consolidation (FEATURE-1508)
All plugin data is now stored in a single, well-organized location.

- **Unified storage:** Global data in `~/.obsidian-agent/`, vault-specific data in `.obsidian/plugins/vault-operator/`
- **Automatic migration:** Legacy storage locations (`.obsilo-sync`, `.obsilo`, scattered JSON files) are migrated on first load
- **MemoryDB:** Episodes, recipes, and patterns migrated from individual JSON files to SQLite

---

## Security (AUDIT-006)

Comprehensive security audit with 6 high-severity findings identified and resolved:

- **MCP server authentication:** Bearer token + restricted CORS (blocks browser-based CSRF attacks) + 1 MB body size limit
- **MCP governance layer:** Path traversal prevention, IgnoreService enforcement, configDir protection, and audit logging for all MCP operations
- **Permission self-escalation blocked:** The agent can no longer silently change auto-approval settings -- an approval card is now shown
- **Backup export sanitized:** API keys and tokens are stripped before export (no more plaintext credentials in backup files)
- **Tool input schema validation:** All tool parameters are now validated against their declared schema before execution
- **SCA fix:** path-to-regexp ReDoS vulnerability resolved via npm override
- **Review-Bot compliance:** `vault.trash()` replaced with `fileManager.trashFile()` in MCP tools

---

## Refactoring & Performance

- **7,564 LOC reduction:** Major cleanup pass removing dead code, unused imports, and rendering overhead
- **UI component extraction:** `SuggestionBanner` and `OnboardingFlow` extracted from the monolithic `AgentSidebarView`
- **ModeService optimization:** Faster initialization, reduced memory footprint
- **Episodic memory defaults:** Learned recipes from episodic memory enabled by default

---

## Documentation

- Comprehensive documentation website added (VitePress)
- German language documentation for all features
- Architecture documentation updated (arc42, ADRs)

---

## Breaking Changes

- **MCP clients must authenticate:** Existing MCP integrations (Claude Desktop) will auto-reconnect via the stdio proxy worker, which reads the token from `~/.obsidian-agent/mcp-token`. Manual HTTP clients need to include `Authorization: Bearer <token>` header.
- **Backup format:** Exported backups no longer contain API keys. Importing a v2.2.8 backup into an older version will result in empty API key fields.
- **Storage migration:** On first launch, legacy storage locations are migrated. This is automatic but one-way -- downgrading to v2.2.7 requires manual data restoration.
