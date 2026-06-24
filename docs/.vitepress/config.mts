import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const tutorialsSidebar = [
  {
    text: 'Start here',
    items: [
      { text: 'Install Vault Operator', link: '/tutorials/getting-started' },
      { text: 'Your first conversation', link: '/tutorials/first-conversation' },
      { text: 'Search by meaning', link: '/tutorials/search-by-meaning' },
      { text: 'Capture with /ingest', link: '/tutorials/quick-ingest' },
      { text: 'Sense-making with /ingest-deep', link: '/tutorials/deep-ingest' },
    ],
  },
]

const guidesSidebar = [
  {
    text: 'What it does',
    items: [
      { text: 'What Vault Operator can do', link: '/guides/capabilities' },
    ],
  },
  {
    text: 'Everyday use',
    items: [
      { text: 'Chat interface', link: '/guides/chat-interface' },
      { text: 'Inline AI chat', link: '/guides/inline-chat' },
      { text: 'Choosing a model', link: '/guides/choosing-a-model' },
      { text: 'Vault operations', link: '/guides/vault-operations' },
      { text: 'Knowledge discovery', link: '/guides/knowledge-discovery' },
      { text: 'Knowledge workflow', link: '/tutorials/knowledge-workflow' },
      { text: 'Memory and personalization', link: '/guides/memory-personalization' },
      { text: 'Safety and control', link: '/guides/safety-control' },
    ],
  },
  {
    text: 'Power use',
    items: [
      { text: 'Skills, rules and workflows', link: '/guides/skills-rules-workflows' },
      { text: 'Office documents (beta)', link: '/guides/office-documents' },
      { text: 'Connectors', link: '/guides/connectors' },
      { text: 'Multi-agent and tasks', link: '/guides/multi-agent' },
      { text: 'Power features', link: '/guides/power-features' },
    ],
  },
  {
    text: 'Knowledge maintenance',
    items: [
      { text: 'Knowledge ingest', link: '/guides/knowledge-ingest' },
      { text: 'Vault health', link: '/guides/vault-health' },
    ],
  },
]

const referenceSidebar = [
  {
    text: 'Reference',
    items: [
      { text: 'Tools', link: '/reference/tools' },
      { text: 'Providers and models', link: '/reference/providers' },
      { text: 'Settings', link: '/reference/settings' },
      { text: 'Troubleshooting', link: '/reference/troubleshooting' },
    ],
  },
]

const conceptsSidebar = [
  {
    text: 'Fundamentals',
    items: [
      { text: 'How Vault Operator works', link: '/concepts/' },
      { text: 'The agent loop', link: '/concepts/agent-loop' },
      { text: 'Block-level provenance', link: '/concepts/provenance' },
      { text: 'Checkpoints and undo', link: '/concepts/checkpoints' },
    ],
  },
  {
    text: 'Tools and decisions',
    items: [
      { text: 'Tool system', link: '/concepts/tool-system' },
      { text: 'System prompt', link: '/concepts/system-prompt' },
      { text: 'Advisor pattern', link: '/concepts/advisor-pattern' },
      { text: 'Modes', link: '/concepts/mode-system' },
    ],
  },
  {
    text: 'Safety and quality',
    items: [
      { text: 'Governance', link: '/concepts/governance' },
      { text: 'Quality and cost', link: '/concepts/quality-and-cost' },
    ],
  },
  {
    text: 'Intelligence',
    items: [
      { text: 'Knowledge layer', link: '/concepts/knowledge-layer' },
      { text: 'Semantic indexing', link: '/concepts/semantic-indexing' },
      { text: 'Vault health', link: '/concepts/vault-health' },
      { text: 'Memory', link: '/concepts/memory-system' },
      { text: 'Unified chat memory', link: '/concepts/unified-chat-memory' },
      { text: 'Mastery and recipes', link: '/concepts/mastery' },
      { text: 'Token optimization', link: '/concepts/token-optimization' },
    ],
  },
  {
    text: 'Architecture',
    items: [
      { text: 'Plugin discovery', link: '/concepts/vault-dna' },
      { text: 'Self-development', link: '/concepts/self-development' },
      { text: 'Rules', link: '/concepts/rules-system' },
      { text: 'MCP', link: '/concepts/mcp-architecture' },
      { text: 'Office pipeline (beta)', link: '/concepts/office-pipeline' },
      { text: 'Task extraction', link: '/concepts/task-extraction' },
      { text: 'Provider auth', link: '/concepts/provider-auth' },
      { text: 'UI architecture', link: '/concepts/ui-architecture' },
      { text: 'Codebase tour', link: '/concepts/codebase-tour' },
    ],
  },
]

export default withMermaid(
  defineConfig({
    title: 'Vault Operator',
    description: 'Agentic AI operating layer for your vault.',
    // Served as a GitHub Pages project site at https://pssah4.github.io/vault-operator/.
    // If a custom domain is ever added back, set base to '/'.
    base: '/vault-operator/',

    // esbuild 0.28 refuses to transform destructuring under the legacy
    // browser-defaults target set vite uses (chrome87, firefox78, safari14,
    // es2020). Bump the target to es2022 so the mermaid bundle compiles in
    // the pages build. End users are on modern Chromium via Obsidian or
    // current evergreen browsers via the public site, so es2022 is fine.
    vite: {
      build: { target: 'es2022' },
      esbuild: { target: 'es2022' },
      optimizeDeps: { esbuildOptions: { target: 'es2022' } },
    },
    head: [
      ['meta', { property: 'og:title', content: 'Vault Operator, agentic AI operating layer for your vault' }],
      ['meta', { property: 'og:description', content: 'Agentic AI operating layer for your vault. Block-level provenance, cross-surface MCP, semantic search, persistent memory, and full safety controls.' }],
    ],

    appearance: { initialValue: 'dark' },
    lastUpdated: true,
    cleanUrls: true,

    lang: 'en',

    themeConfig: {
      siteTitle: '/ Vault Operator',
      nav: [
        { text: 'Start here', link: '/tutorials/getting-started', activeMatch: '/tutorials/' },
        { text: 'Guides', link: '/guides/capabilities', activeMatch: '/guides/' },
        { text: 'Concepts', link: '/concepts/', activeMatch: '/concepts/' },
        { text: 'Reference', link: '/reference/tools', activeMatch: '/reference/' },
        { text: 'About', link: '/about' },
      ],
      sidebar: {
        '/tutorials/': tutorialsSidebar,
        '/guides/': guidesSidebar,
        '/reference/': referenceSidebar,
        '/concepts/': conceptsSidebar,
      },
      search: {
        provider: 'local',
      },
      editLink: {
        pattern: 'https://github.com/pssah4/vault-operator/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },
      footer: {
        message: '<a href="https://github.com/pssah4/vault-operator/blob/main/LICENSE">Apache 2.0</a> | <a href="/vault-operator/imprint">Imprint</a>',
        copyright: 'Provided as-is, without any warranty or liability.',
      },
    },

    mermaid: {},
  }),
)
