/**
 * ToolRegistry - Manages all available tools
 *
 * Central registry for:
 * - Internal vault operation tools
 * - MCP tools (added in Phase 6)
 * - Tool lookup and discovery
 */

import type ObsidianAgentPlugin from '../../main';
import type { BaseTool } from './BaseTool';
import type { ToolName, ToolDefinition } from './types';
import { isDeferredTool } from './toolMetadata';

// Import tools — vault: read
import { ReadFileTool } from './vault/ReadFileTool';
import { ReadDocumentTool } from './vault/ReadDocumentTool';
import { ListFilesTool } from './vault/ListFilesTool';
import { SearchFilesTool } from './vault/SearchFilesTool';
// Import tools — vault: write
import { WriteFileTool } from './vault/WriteFileTool';
import { EditFileTool } from './vault/EditFileTool';
import { AppendToFileTool } from './vault/AppendToFileTool';
import { CreateFolderTool } from './vault/CreateFolderTool';
import { DeleteFileTool } from './vault/DeleteFileTool';
import { MoveFileTool } from './vault/MoveFileTool';
// Import tools — vault: checkpoints (IMP-01-07-01)
import { ListCheckpointsTool } from './vault/ListCheckpointsTool';
import { ReadCheckpointTool } from './vault/ReadCheckpointTool';
import { DiffCheckpointTool } from './vault/DiffCheckpointTool';
import { RestoreCheckpointTool } from './vault/RestoreCheckpointTool';
import { IngestDocumentTool } from './vault/IngestDocumentTool';
import { IngestTriageTool } from './vault/IngestTriageTool';
import { IngestDeepTool } from './vault/IngestDeepTool';
import { AntiEchoSearchTool } from './vault/AntiEchoSearchTool';
import { MarkNoteAsMemorySourceTool } from './vault/MarkNoteAsMemorySourceTool';
import { UnmarkNoteAsMemorySourceTool } from './vault/UnmarkNoteAsMemorySourceTool';
import { ListMemorySourceNotesTool } from './vault/ListMemorySourceNotesTool';
import { ListPinnedConversationsTool } from './vault/ListPinnedConversationsTool';
// Import tools — vault: intelligence (Phase 1.2)
import { GetFrontmatterTool } from './vault/GetFrontmatterTool';
import { UpdateFrontmatterTool } from './vault/UpdateFrontmatterTool';
import { SearchByTagTool } from './vault/SearchByTagTool';
import { GetVaultStatsTool } from './vault/GetVaultStatsTool';
import { VaultHealthCheckTool } from './vault/VaultHealthCheckTool';
import { GetLinkedNotesTool } from './vault/GetLinkedNotesTool';
import { OpenNoteTool } from './vault/OpenNoteTool';
import { GetDailyNoteTool } from './vault/GetDailyNoteTool';
// Import tools — vault: semantic search (Phase C2)
import { SemanticSearchTool } from './vault/SemanticSearchTool';
import { RecallMemoryTool } from './memory/RecallMemoryTool';
import { MarkForMemoryTool } from './memory/MarkForMemoryTool';
import { UpdateSoulTool } from './memory/UpdateSoulTool';
import { InspectSelfTool } from './agent/InspectSelfTool';
import { SearchHistoryTool } from './memory/SearchHistoryTool';
// Import tools — vault: canvas (Phase C3)
import { GenerateCanvasTool } from './vault/GenerateCanvasTool';
// Import tools — vault: excalidraw
import { CreateExcalidrawTool } from './vault/CreateExcalidrawTool';
import { CreateDrawioTool } from './vault/CreateDrawioTool';
// Import tools — vault: office document creation
import { CreatePptxTool } from './vault/CreatePptxTool';
import { CreateDocxTool } from './vault/CreateDocxTool';
import { CreateXlsxTool } from './vault/CreateXlsxTool';
import { PlanPresentationTool } from './vault/PlanPresentationTool';
// Import tools — vault: bases (Phase C4)
import { CreateBaseTool } from './vault/CreateBaseTool';
import { UpdateBaseTool } from './vault/UpdateBaseTool';
import { QueryBaseTool } from './vault/QueryBaseTool';
// Import tools — web
import { WebFetchTool } from './web/WebFetchTool';
import { WebSearchTool } from './web/WebSearchTool';
// Import tools — agent control
import { AskFollowupQuestionTool } from './agent/AskFollowupQuestionTool';
import { AttemptCompletionTool } from './agent/AttemptCompletionTool';
import { UpdateTodoListTool } from './agent/UpdateTodoListTool';
import { SwitchModeTool } from './agent/SwitchModeTool';
import { NewTaskTool } from './agent/NewTaskTool';
import { ConsultFlagshipTool } from './agent/ConsultFlagshipTool';
import { FindToolTool } from './agent/FindToolTool';
import { ReadSkillTool } from './agent/ReadSkillTool';
// Plugin Skills (PAS-1)
import { ExecuteCommandTool } from './agent/ExecuteCommandTool';
import { ResolveCapabilityGapTool } from './agent/ResolveCapabilityGapTool';
import { EnablePluginTool } from './agent/EnablePluginTool';
import { ProbePluginTool } from './agent/ProbePluginTool';
import { RunSkillScriptTool } from './agent/RunSkillScriptTool';
// Plugin API + Recipe Shell (PAS-1.5)
import { CallPluginApiTool } from './agent/CallPluginApiTool';
import { ExecuteRecipeTool } from './agent/ExecuteRecipeTool';
// Settings & Model configuration (Onboarding)
import { UpdateSettingsTool } from './agent/UpdateSettingsTool';
import { ConfigureModelTool } from './agent/ConfigureModelTool';
// MCP tool
import { UseMcpToolTool } from './mcp/UseMcpToolTool';
import { ReadMcpToolTool } from './mcp/ReadMcpToolTool';
import type { McpClient } from '../mcp/McpClient';
// Self-Development (Phase 1)
import { ReadAgentLogsTool } from './agent/ReadAgentLogsTool';
import { ManageMcpServerTool } from './agent/ManageMcpServerTool';
import type { ConsoleRingBuffer } from '../observability/ConsoleRingBuffer';
// Self-Development (Phase 2)
import { ManageSkillTool } from './agent/ManageSkillTool';
import type { SelfAuthoredSkillLoader } from '../skills/SelfAuthoredSkillLoader';
// Self-Development (Phase 3)
import { EvaluateExpressionTool } from './agent/EvaluateExpressionTool';
import type { ISandboxExecutor } from '../sandbox/ISandboxExecutor';
import type { EsbuildWasmManager } from '../sandbox/EsbuildWasmManager';
import type { DynamicToolLoader } from './dynamic/DynamicToolLoader';
// Self-Development (Phase 4)
import { ManageSourceTool } from './agent/ManageSourceTool';
import type { EmbeddedSourceManager } from '../self-development/EmbeddedSourceManager';
import type { PluginBuilder } from '../self-development/PluginBuilder';
import type { PluginReloader } from '../self-development/PluginReloader';

export class ToolRegistry {
    private tools: Map<ToolName, BaseTool>;
    readonly plugin: ObsidianAgentPlugin;

    constructor(
        plugin: ObsidianAgentPlugin,
        mcpClient?: McpClient,
        ringBuffer?: ConsoleRingBuffer,
        skillLoader?: SelfAuthoredSkillLoader,
        sandboxExecutor?: ISandboxExecutor,
        esbuildManager?: EsbuildWasmManager,
        dynamicToolLoader?: DynamicToolLoader,
        sourceManager?: EmbeddedSourceManager,
        pluginBuilder?: PluginBuilder,
        pluginReloader?: PluginReloader,
    ) {
        this.plugin = plugin;
        this.tools = new Map();
        this.registerInternalTools(
            mcpClient, ringBuffer, skillLoader, sandboxExecutor, esbuildManager,
            dynamicToolLoader, sourceManager, pluginBuilder, pluginReloader,
        );
        if (mcpClient) {
            this.register(new UseMcpToolTool(this.plugin, mcpClient));
            // FEAT-24-06 / ADR-118: on-demand companion to the truncated MCP
            // listing in the system prompt. NOT in DEFERRED_TOOL_NAMES.
            this.register(new ReadMcpToolTool(this.plugin, mcpClient));
        }
    }

    /**
     * Register all internal (built-in) tools
     */
    private registerInternalTools(
        mcpClient?: McpClient,
        ringBuffer?: ConsoleRingBuffer,
        skillLoader?: SelfAuthoredSkillLoader,
        sandboxExecutor?: ISandboxExecutor,
        esbuildManager?: EsbuildWasmManager,
        dynamicToolLoader?: DynamicToolLoader,
        sourceManager?: EmbeddedSourceManager,
        pluginBuilder?: PluginBuilder,
        pluginReloader?: PluginReloader,
    ): void {
        // Vault: read
        this.register(new ReadFileTool(this.plugin));
        this.register(new ReadDocumentTool(this.plugin));
        this.register(new ListFilesTool(this.plugin));
        this.register(new SearchFilesTool(this.plugin));
        // Vault: write (Sprint 1.1)
        this.register(new WriteFileTool(this.plugin));
        this.register(new EditFileTool(this.plugin));
        this.register(new AppendToFileTool(this.plugin));
        this.register(new IngestDocumentTool(this.plugin));
        this.register(new IngestTriageTool(this.plugin));
        this.register(new IngestDeepTool(this.plugin));
        this.register(new AntiEchoSearchTool(this.plugin));
        this.register(new MarkNoteAsMemorySourceTool(this.plugin));
        this.register(new UnmarkNoteAsMemorySourceTool(this.plugin));
        this.register(new ListMemorySourceNotesTool(this.plugin));
        this.register(new ListPinnedConversationsTool(this.plugin));
        this.register(new CreateFolderTool(this.plugin));
        this.register(new DeleteFileTool(this.plugin));
        this.register(new MoveFileTool(this.plugin));
        // Vault: checkpoints (IMP-01-07-01) -- agent-facing browse + restore
        this.register(new ListCheckpointsTool(this.plugin));
        this.register(new ReadCheckpointTool(this.plugin));
        this.register(new DiffCheckpointTool(this.plugin));
        this.register(new RestoreCheckpointTool(this.plugin));
        // Vault: intelligence (Phase 1.2)
        this.register(new GetFrontmatterTool(this.plugin));
        this.register(new UpdateFrontmatterTool(this.plugin));
        this.register(new SearchByTagTool(this.plugin));
        this.register(new GetVaultStatsTool(this.plugin));
        this.register(new VaultHealthCheckTool(this.plugin));
        this.register(new GetLinkedNotesTool(this.plugin));
        this.register(new OpenNoteTool(this.plugin));
        this.register(new GetDailyNoteTool(this.plugin));
        // Vault: semantic search (Phase C2 — only active when index is built)
        this.register(new SemanticSearchTool(this.plugin));
        // Memory v2: recall_memory (FEATURE-0317 / PLAN-006 task 9)
        this.register(new RecallMemoryTool(this.plugin));
        // Memory v2: mark_for_memory (FEATURE-0318 / PLAN-007 manual trigger)
        this.register(new MarkForMemoryTool(this.plugin));
        // Memory v2: agent-self layer (FEATURE-0319b / PLAN-008)
        this.register(new UpdateSoulTool(this.plugin));
        this.register(new InspectSelfTool(this.plugin));
        // Memory v2: history search (FEATURE-0320 / Phase 6)
        this.register(new SearchHistoryTool(this.plugin));
        // Vault: canvas (Phase C3)
        this.register(new GenerateCanvasTool(this.plugin));
        // Vault: excalidraw
        this.register(new CreateExcalidrawTool(this.plugin));
        // Vault: drawio / diagrams.net (BUG-018)
        this.register(new CreateDrawioTool(this.plugin));
        // Vault: office document creation
        this.register(new CreatePptxTool(this.plugin));
        this.register(new CreateDocxTool(this.plugin));
        this.register(new CreateXlsxTool(this.plugin));
        this.register(new PlanPresentationTool(this.plugin));
        // Vault: bases (Phase C4)
        this.register(new CreateBaseTool(this.plugin));
        this.register(new UpdateBaseTool(this.plugin));
        this.register(new QueryBaseTool(this.plugin));
        // Web (Phase 1.1)
        this.register(new WebFetchTool(this.plugin));
        this.register(new WebSearchTool(this.plugin));
        // Agent control (Sprint 1.2 / Phase 1.3 / Phase 3.1)
        this.register(new AskFollowupQuestionTool(this.plugin));
        this.register(new AttemptCompletionTool(this.plugin));
        this.register(new UpdateTodoListTool(this.plugin));
        this.register(new SwitchModeTool(this.plugin));
        this.register(new NewTaskTool(this.plugin));
        // EPIC-26 / FEAT-26-01 / ADR-120: advisor-pattern escalation tool.
        // Filtered out of the prompt schema by AgentTask when no flagship
        // slot is configured on the active provider.
        this.register(new ConsultFlagshipTool(this.plugin));
        // FEATURE-1600: meta-tool for activating deferred tools on demand
        this.register(new FindToolTool(this.plugin));
        // FEAT-24-09 / ADR-116: load a SKILL.md body on demand (always
        // available; skillLoader is optional and may be wired in later).
        this.register(new ReadSkillTool(this.plugin, skillLoader ?? null));
        // Plugin Skills (PAS-1)
        this.register(new ExecuteCommandTool(this.plugin));
        this.register(new ResolveCapabilityGapTool(this.plugin));
        this.register(new EnablePluginTool(this.plugin));
        // FEAT-29-03: probe_plugin live state (commands + api methods).
        this.register(new ProbePluginTool(this.plugin));
        // Plugin API + Recipe Shell (PAS-1.5)
        this.register(new CallPluginApiTool(this.plugin));
        this.register(new ExecuteRecipeTool(this.plugin));
        // Settings & Model configuration (Onboarding)
        this.register(new UpdateSettingsTool(this.plugin));
        this.register(new ConfigureModelTool(this.plugin));
        // Self-Development (Phase 1)
        if (ringBuffer) {
            this.register(new ReadAgentLogsTool(this.plugin, ringBuffer));
        }
        if (mcpClient) {
            this.register(new ManageMcpServerTool(this.plugin, mcpClient));
        }
        // Self-Development (Phase 2+3: unified skills with optional code modules)
        if (skillLoader) {
            this.register(new ManageSkillTool(
                this.plugin, skillLoader, esbuildManager, sandboxExecutor, this,
            ));
        }
        // FEAT-29-06: generic skill-script executor (replaces code_modules
        // / custom_*-tool registration pattern). Gated on sandbox + esbuild
        // availability so headless or mobile builds without those
        // components still load.
        if (sandboxExecutor && esbuildManager) {
            this.register(new RunSkillScriptTool(this.plugin));
        }
        // Self-Development (Phase 3: expression evaluation)
        if (sandboxExecutor && esbuildManager) {
            this.register(new EvaluateExpressionTool(this.plugin, sandboxExecutor, esbuildManager));
        }
        // Self-Development (Phase 4)
        if (sourceManager && pluginBuilder && pluginReloader) {
            this.register(new ManageSourceTool(this.plugin, sourceManager, pluginBuilder, pluginReloader));
        }

        console.debug(`ToolRegistry: Registered ${this.getToolCount()} tools`);
    }

    /**
     * Register a tool
     */
    register(tool: BaseTool): void {
        if (this.tools.has(tool.name)) {
            console.warn(`ToolRegistry: Tool '${tool.name}' already registered, overwriting`);
        }
        this.tools.set(tool.name, tool);
    }

    /**
     * Get a tool by name
     */
    getTool(name: ToolName): BaseTool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tools
     */
    getAllTools(): BaseTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Get tool definitions (schemas) for LLM.
     *
     * FEATURE-1600 (Deferred Tool Loading): pass `{ includeDeferred: false }`
     * (or rely on the default) to exclude specialised tools from the
     * system-prompt schema. They can be activated later via the meta-tool
     * `find_tool`. The full set is still available via `includeDeferred: true`
     * (used by the Settings UI, tests, and subtask spawners).
     */
    getToolDefinitions(options?: { includeDeferred?: boolean }): ToolDefinition[] {
        const includeDeferred = options?.includeDeferred ?? true;
        const all = this.getAllTools().map((tool) => tool.getDefinition());
        if (includeDeferred) return all;
        return all.filter((def) => !isDeferredTool(def.name));
    }

    /**
     * Get tool definitions filtered by allowed tools
     * (used by Mode system to restrict tool access)
     */
    getFilteredToolDefinitions(allowedTools: ToolName[]): ToolDefinition[] {
        return allowedTools
            .map((name) => this.getTool(name))
            .filter((tool): tool is BaseTool => tool !== undefined)
            .map((tool) => tool.getDefinition());
    }

    /**
     * Check if a tool exists
     */
    hasTool(name: ToolName): boolean {
        return this.tools.has(name);
    }

    /**
     * Get number of registered tools
     */
    getToolCount(): number {
        return this.tools.size;
    }

    /**
     * Register an MCP tool (Phase 6)
     */
    registerMcpTool(serverName: string, toolName: string, tool: BaseTool): void {
        // TODO: Phase 6 - MCP integration
        // For now, just register it like a normal tool
        this.register(tool);
    }

    /**
     * Unregister a tool
     */
    unregister(name: ToolName): boolean {
        return this.tools.delete(name);
    }

    /**
     * Clear all tools (useful for testing)
     */
    clear(): void {
        this.tools.clear();
    }
}
