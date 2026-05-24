import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const tutorialsSidebar = [
  {
    text: 'Get started',
    items: [
      { text: 'Installation & quick start', link: '/tutorials/getting-started' },
      { text: 'Your first conversation', link: '/tutorials/first-conversation' },
    ],
  },
  {
    text: 'Knowledge workflows',
    items: [
      { text: 'Search your vault by meaning', link: '/tutorials/search-by-meaning' },
      { text: 'Capture a PDF with /ingest', link: '/tutorials/quick-ingest' },
      { text: 'Sense-making with /ingest-deep', link: '/tutorials/deep-ingest' },
    ],
  },
  {
    text: 'Overview',
    items: [
      { text: 'Knowledge workflow overview', link: '/tutorials/knowledge-workflow' },
    ],
  },
]

const guidesSidebar = [
  {
    text: 'Overview',
    items: [
      { text: 'What Vault Operator Can Do', link: '/guides/capabilities' },
    ],
  },
  {
    text: 'Setup',
    items: [
      { text: 'Choosing a Model', link: '/guides/choosing-a-model' },
    ],
  },
  {
    text: 'Daily Use',
    items: [
      { text: 'Chat Interface', link: '/guides/chat-interface' },
      { text: 'Vault Operations', link: '/guides/vault-operations' },
      { text: 'Knowledge Discovery', link: '/guides/knowledge-discovery' },
      { text: 'Memory & Personalization', link: '/guides/memory-personalization' },
      { text: 'Safety & Control', link: '/guides/safety-control' },
    ],
  },
  {
    text: 'Advanced',
    items: [
      { text: 'Skills, Rules & Workflows', link: '/guides/skills-rules-workflows' },
      { text: 'Office Documents', link: '/guides/office-documents' },
      { text: 'Connectors', link: '/guides/connectors' },
      { text: 'Multi-Agent & Tasks', link: '/guides/multi-agent' },
      { text: 'Power Features', link: '/guides/power-features' },
    ],
  },
  {
    text: 'Knowledge Maintenance',
    items: [
      { text: 'Knowledge Ingest', link: '/guides/knowledge-ingest' },
      { text: 'Vault Health Check', link: '/guides/vault-health' },
    ],
  },
]

const referenceSidebar = [
  {
    text: 'Reference',
    items: [
      { text: 'Tools', link: '/reference/tools' },
      { text: 'Providers & Models', link: '/reference/providers' },
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
      { text: 'Unified Chat Memory', link: '/concepts/unified-chat-memory' },
      { text: 'Mastery and recipes', link: '/concepts/mastery' },
      { text: 'Token optimization', link: '/concepts/token-optimization' },
    ],
  },
  {
    text: 'Extensibility',
    items: [
      { text: 'Plugin discovery', link: '/concepts/vault-dna' },
      { text: 'Self-development', link: '/concepts/self-development' },
      { text: 'Rules', link: '/concepts/rules-system' },
      { text: 'MCP', link: '/concepts/mcp-architecture' },
    ],
  },
  {
    text: 'Specialized systems',
    items: [
      { text: 'Office pipeline', link: '/concepts/office-pipeline' },
      { text: 'Task extraction', link: '/concepts/task-extraction' },
      { text: 'Provider auth', link: '/concepts/provider-auth' },
      { text: 'UI architecture', link: '/concepts/ui-architecture' },
    ],
  },
  {
    text: 'For developers',
    items: [
      { text: 'Codebase tour', link: '/concepts/codebase-tour' },
    ],
  },
]

export default withMermaid(
  defineConfig({
    title: 'Vault Operator',
    description: 'An AI agent for your Obsidian vault',
    // Served as a GitHub Pages project site at https://pssah4.github.io/vault-operator/.
    // If a custom domain is ever added back, set base to '/'.
    base: '/vault-operator/',
    head: [
      ['meta', { property: 'og:title', content: 'Vault Operator, an AI agent for your Obsidian vault' }],
      ['meta', { property: 'og:description', content: 'An autonomous AI agent for Obsidian with 60+ tools, block-level provenance, cross-surface MCP, semantic search, persistent memory, and full safety controls.' }],
    ],

    appearance: { initialValue: 'dark' },
    lastUpdated: true,
    cleanUrls: true,

    lang: 'en',

    themeConfig: {
      siteTitle: '/ Vault Operator',
      nav: [
        { text: 'Tutorials', link: '/tutorials/getting-started', activeMatch: '/tutorials/' },
        { text: 'Guides', link: '/guides/capabilities', activeMatch: '/guides/' },
        { text: 'Reference', link: '/reference/tools', activeMatch: '/reference/' },
        { text: 'Concepts', link: '/concepts/', activeMatch: '/concepts/' },
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
