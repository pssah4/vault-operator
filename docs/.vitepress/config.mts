import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const tutorialsSidebar = [
  {
    text: 'Tutorials',
    items: [
      { text: 'Installation & Quick Start', link: '/tutorials/getting-started' },
      { text: 'Your First Conversation', link: '/tutorials/first-conversation' },
      { text: 'Your First Knowledge Workflow', link: '/tutorials/knowledge-workflow' },
    ],
  },
]

const guidesSidebar = [
  {
    text: 'Overview',
    items: [
      { text: 'What Obsilo Can Do', link: '/guides/capabilities' },
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
      { text: 'How Obsilo works', link: '/concepts/' },
      { text: 'The agent loop', link: '/concepts/agent-loop' },
    ],
  },
  {
    text: 'Tools and decisions',
    items: [
      { text: 'Tool system', link: '/concepts/tool-system' },
      { text: 'System prompt', link: '/concepts/system-prompt' },
      { text: 'Modes', link: '/concepts/mode-system' },
    ],
  },
  {
    text: 'Safety',
    items: [
      { text: 'Governance', link: '/concepts/governance' },
    ],
  },
  {
    text: 'Intelligence',
    items: [
      { text: 'Knowledge layer', link: '/concepts/knowledge-layer' },
      { text: 'Memory', link: '/concepts/memory-system' },
      { text: 'Token optimization', link: '/concepts/token-optimization' },
    ],
  },
  {
    text: 'Extensibility',
    items: [
      { text: 'Plugin discovery', link: '/concepts/vault-dna' },
      { text: 'Self-development', link: '/concepts/self-development' },
      { text: 'MCP', link: '/concepts/mcp-architecture' },
    ],
  },
  {
    text: 'Specialized systems',
    items: [
      { text: 'Office pipeline', link: '/concepts/office-pipeline' },
      { text: 'Provider auth', link: '/concepts/provider-auth' },
      { text: 'UI architecture', link: '/concepts/ui-architecture' },
    ],
  },
]

export default withMermaid(
  defineConfig({
    title: 'Obsilo',
    description: 'Agentic AI for Obsidian',
    head: [
      ['meta', { property: 'og:title', content: 'Obsilo - Agentic AI for Obsidian' }],
      ['meta', { property: 'og:description', content: 'An autonomous AI agent for Obsidian with 49 tools, semantic search, multi-agent workflows, and full safety controls.' }],
    ],

    appearance: 'dark',
    lastUpdated: true,
    cleanUrls: true,

    lang: 'en',

    themeConfig: {
      siteTitle: 'Obsilo',
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
        pattern: 'https://github.com/pssah4/obsilo/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },
      footer: {
        message: '<a href="https://github.com/pssah4/obsilo/blob/main/LICENSE">Apache 2.0</a> | <a href="/imprint">Imprint</a>',
        copyright: 'Provided as-is, without any warranty or liability.',
      },
    },

    mermaid: {},
  }),
)
