/**
 * WebSearchTool - Search the web via Brave or Tavily API
 *
 * Uses Obsidian's requestUrl() — no browser required.
 * Providers: Brave Search API, Tavily Search API.
 * Adapted from Kilo Code's web search integration pattern.
 */

import { BaseTool } from '../BaseTool';
import type { ToolDefinition, ToolExecutionContext } from '../types';
import type ObsidianAgentPlugin from '../../../main';
import { searchBrave, searchTavily, type WebSearchResult } from './WebSearchProvider';

interface WebSearchInput {
    query: string;
    numResults?: number;
}

type SearchResult = WebSearchResult;

export class WebSearchTool extends BaseTool<'web_search'> {
    readonly name = 'web_search' as const;
    readonly isWriteOperation = false;

    constructor(plugin: ObsidianAgentPlugin) {
        super(plugin);
    }

    getDefinition(): ToolDefinition {
        return {
            name: 'web_search',
            description:
                'Search the web for current information. Returns titles, URLs, and snippets. Use web_fetch to read the full content of a result.',
            input_schema: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query.',
                    },
                    numResults: {
                        type: 'number',
                        description: 'Number of results to return (default: 5, max: 10).',
                    },
                },
                required: ['query'],
            },
        };
    }

    async execute(input: Record<string, unknown>, context: ToolExecutionContext): Promise<void> {
        const { query, numResults = 5 } = input as unknown as WebSearchInput;
        const { callbacks } = context;

        if (!query) {
            callbacks.pushToolResult(this.formatError(new Error('query parameter is required')));
            return;
        }

        const webSettings = this.plugin.settings.webTools;
        const count = Math.min(Math.max(1, numResults), 10);

        if (!webSettings?.enabled) {
            callbacks.pushToolResult(
                this.formatError(
                    new Error(
                        'Web tools are disabled. Call update_settings(action:"set", path:"webTools.enabled", value:true) to enable, then retry.'
                    )
                )
            );
            return;
        }

        const provider = webSettings.provider ?? 'none';

        if (provider === 'none') {
            callbacks.pushToolResult(
                this.formatError(
                    new Error(
                        'No search provider configured. The user needs to select a provider (Brave or Tavily) and add an API key. Setup guide: https://obsilo.app/settings-reference#web-search-settings'
                    )
                )
            );
            return;
        }

        try {
            callbacks.log(`Searching (${provider}): ${query}`);

            let results: SearchResult[];

            if (provider === 'brave') {
                results = await this.searchBrave(query, count, webSettings.braveApiKey ?? '');
            } else if (provider === 'tavily') {
                results = await this.searchTavily(query, count, webSettings.tavilyApiKey ?? '');
            } else {
                callbacks.pushToolResult(
                    this.formatError(new Error(`Unknown provider: ${String(provider)}`))
                );
                return;
            }

            if (results.length === 0) {
                callbacks.pushToolResult('<web_search>No results found.</web_search>');
                return;
            }

            const lines: string[] = [
                `<web_search query="${query}" provider="${provider}" results="${results.length}">`,
            ];
            results.forEach((r, i) => {
                lines.push(`\n${i + 1}. **${r.title}**`);
                lines.push(`   URL: ${r.url}`);
                if (r.snippet) lines.push(`   ${r.snippet}`);
            });
            lines.push('\n</web_search>');

            callbacks.pushToolResult(lines.join('\n'));
            callbacks.log(`Search complete — ${results.length} results`);
        } catch (error) {
            callbacks.pushToolResult(this.formatError(error));
        }
    }

    private async searchBrave(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
        return searchBrave(query, count, apiKey);
    }

    private async searchTavily(query: string, count: number, apiKey: string): Promise<SearchResult[]> {
        return searchTavily(query, count, apiKey);
    }
}
